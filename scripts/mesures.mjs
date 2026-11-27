// Mesures de performance sur un téléphone moyen simulé (lot 0.8) : démarrage en 4G lente,
// fluidité de la carte avec plusieurs couches, mémoire. Sert le build de production (dist/),
// compressé comme sur Vercel, avec Playwright et Chromium.
//
//   npm run build && node scripts/mesures.mjs [étiquette]     (étiquette : « avant », « apres »…)
//
// Résultat dans mesures/<étiquette>.json et affiché à la fin. Le fond de carte et le relief viennent
// du vrai réseau, freiné lui aussi : les chiffres varient d'une fois à l'autre, d'où plusieurs passages
// et la médiane.
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { createGzip } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ETIQUETTE = process.argv[2] ?? 'mesure';
const PASSAGES = Number(process.env.MESURES_PASSAGES ?? 3);
// MESURES_DIST : un autre build (pour remesurer une version gardée de côté) ;
// MESURES_SEULEMENT=demarrage ou fluidite : une seule des deux séries
const DIST = process.env.MESURES_DIST ?? 'dist';
const SEULEMENT = process.env.MESURES_SEULEMENT ?? null;
const PORT = 5299;

// « Slow 4G » des outils de Chrome (valeurs de Lighthouse pour un mobile, appliquées au réseau
// par paquets : 150 ms × 3,75 de latence, 1,6 Mbit/s × 0,9) et processeur divisé par 4
const RESEAU_4G_LENTE = { offline: false, latency: 562.5, downloadThroughput: (1.6e6 * 0.9) / 8, uploadThroughput: (0.75e6 * 0.9) / 8 };
const RALENTI_PROCESSEUR = 4;
const TELEPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Chamonix, là où le relief, les pentes et les ombres travaillent le plus
const VUE = '#vue=13/45.9/6.88/0/0';
const VUE_3D = '#vue=13/45.9/6.88/20/55&3d=1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf',
};
const COMPRESSES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest']);

// Serveur statique du build, gzip comme Vercel, index.html pour toute adresse inconnue
function servir() {
  const serveur = createServer((req, res) => {
    let chemin = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '');
    let fichier = join(DIST, chemin);
    if (!chemin || !existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(DIST, 'index.html');
    const ext = extname(fichier);
    const entetes = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream' };
    if (fichier.includes(`assets`)) entetes['Cache-Control'] = 'public, max-age=31536000, immutable';
    else entetes['Cache-Control'] = 'no-cache';
    if (COMPRESSES.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, { ...entetes, 'Content-Encoding': 'gzip' });
      createReadStream(fichier).pipe(createGzip()).pipe(res);
    } else {
      res.writeHead(200, entetes);
      createReadStream(fichier).pipe(res);
    }
  });
  return new Promise((ok) => serveur.listen(PORT, () => ok(serveur)));
}

const mediane = (valeurs) => {
  const tri = valeurs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!tri.length) return null;
  const m = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[m] : (tri[m - 1] + tri[m]) / 2;
};

async function preparer(navigateur, reglages, { midi = false } = {}) {
  const contexte = await navigateur.newContext({ ...TELEPHONE, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  // Midi à Chamonix pour la fluidité : de nuit, l'ombre du soleil n'a rien à calculer
  if (midi) {
    await contexte.addInitScript(() => {
      const Vraie = Date;
      const cible = new Vraie();
      cible.setHours(12, 0, 0, 0);
      const decalage = cible.getTime() - Vraie.now();
      class DateDecalee extends Vraie {
        constructor(...valeurs) {
          if (valeurs.length) super(...valeurs);
          else super(Vraie.now() + decalage);
        }
        static now() {
          return Vraie.now() + decalage;
        }
      }
      window.Date = DateDecalee;
    });
  }
  await contexte.addInitScript((r) => {
    if (!localStorage.getItem('montis.mesures')) {
      localStorage.setItem('montis.reglages', JSON.stringify({ langue: 'fr', 'fond-montis-mode': 'jour', 'derniere-visite': Date.now(), 'bienvenue-vue': true, ...r }));
      localStorage.setItem('montis.mesures', '1');
    }
  }, reglages);
  const page = await contexte.newPage();
  const cdp = await contexte.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  return { contexte, page, cdp };
}

// Octets reçus par origine (taille sur le réseau, compression comprise)
function compterOctets(cdp) {
  const adresses = new Map();
  const octets = { montis: 0, montisFichiers: 0, ailleurs: 0 };
  cdp.on('Network.responseReceived', (e) => adresses.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e) => {
    const url = adresses.get(e.requestId) ?? '';
    if (url.startsWith(`http://localhost:${PORT}`)) {
      octets.montis += e.encodedDataLength;
      octets.montisFichiers += 1;
    } else octets.ailleurs += e.encodedDataLength;
  });
  return octets;
}

async function attendre(page, fonction, delai = 120000) {
  for (const fin = Date.now() + delai; Date.now() < fin;) {
    if (await page.evaluate(fonction)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function memoire(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const { metrics } = await cdp.send('Performance.getMetrics');
  const lire = (nom) => metrics.find((m) => m.name === nom)?.value ?? null;
  return { tasMo: Math.round((lire('JSHeapUsedSize') / 1048576) * 10) / 10, noeuds: lire('Nodes') };
}

// Démarrage : visite à froid (rien en cache) puis seconde visite (cache et service worker)
async function demarrage(navigateur) {
  const { contexte, page, cdp } = await preparer(navigateur, {});
  await cdp.send('Network.emulateNetworkConditions', RESEAU_4G_LENTE);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RALENTI_PROCESSEUR });
  const resultats = [];
  for (const visite of ['froid', 'retour']) {
    const octets = compterOctets(cdp);
    const debut = Date.now();
    // Une page vide d'abord : sinon la seconde visite, même adresse, ne recharge pas
    await page.goto('about:blank');
    await page.goto(`http://localhost:${PORT}/${VUE}`, { waitUntil: 'commit' });
    const interfacePrete = await attendre(page, () => performance.getEntriesByName('montis:interface').length > 0);
    const octetsInterface = { ...octets };
    const cartePrete = await attendre(page, () => performance.getEntriesByName('montis:carte').length > 0, 180000);
    const temps = await page.evaluate(() => {
      const repere = (nom) => performance.getEntriesByName(nom)[0]?.startTime ?? null;
      const peinture = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        premierAffichage: peinture?.startTime ?? null,
        domPret: nav?.domContentLoadedEventEnd ?? null,
        interface: repere('montis:interface'),
        carte: repere('montis:carte'),
      };
    });
    // Le service worker s'installe et précharge après le démarrage : on le laisse finir
    if (visite === 'froid') {
      await page.waitForTimeout(3000);
      await attendre(page, async () => (await navigator.serviceWorker?.getRegistration())?.active?.state === 'activated', 240000);
    }
    await page.waitForTimeout(2000);
    resultats.push({
      visite,
      ...temps,
      interfacePrete,
      cartePrete,
      octetsMontisAvantInterface: octetsInterface.montis,
      fichiersMontisAvantInterface: octetsInterface.montisFichiers,
      octetsMontisTotal: octets.montis,
      octetsAilleurs: octets.ailleurs,
      memoire: await memoire(cdp),
      duree: Date.now() - debut,
    });
    cdp.removeAllListeners('Network.responseReceived');
    cdp.removeAllListeners('Network.loadingFinished');
  }
  await contexte.close();
  return resultats;
}

// Six glissés aller-retour dans le haut de la carte
async function glisser(page) {
  const { width, height } = TELEPHONE.viewport;
  const y = Math.round(height * 0.3);
  for (let i = 0; i < 6; i++) {
    const sens = i % 2 ? -1 : 1;
    await page.mouse.move(width / 2 - 100 * sens, y);
    await page.mouse.down();
    await page.mouse.move(width / 2 + 100 * sens, y + 40 * sens, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  }
}

// Fluidité : la carte glissée au doigt pendant que les images par seconde sont comptées. Trois cas :
// 2D sans couche, 2D avec pentes, ombre du soleil et analyse du vent (qui remet la carte à plat), 3D
const CAS_FLUIDITE = [
  { nom: '2D', avecCouches: false, vue: VUE },
  { nom: '2D, pentes, ombre et vent', avecCouches: true, vue: VUE },
  { nom: '3D incliné', avecCouches: false, vue: VUE_3D },
];
async function fluidite(navigateur, { nom, avecCouches, vue }) {
  const reglages = avecCouches ? { 'pentes-couche': 'pentes', ombres: true } : {};
  const { contexte, page, cdp } = await preparer(navigateur, reglages, { midi: true });
  await page.goto(`http://localhost:${PORT}/${vue}`);
  await attendre(page, () => performance.getEntriesByName('montis:carte').length > 0, 120000);
  if (avecCouches) {
    await page.evaluate(async () => {
      // Comme module() de scripts/captures.mjs
      const trouver = () => document.querySelector('.menu-ligne[data-module="vent"]');
      if (!trouver()) {
        document.getElementById('menu-bouton')?.click();
        await new Promise((fin) => setTimeout(fin, 600));
      }
      const ligne = trouver();
      const flottant = ligne?.closest('.outil-rapide-panneau');
      if (flottant) document.getElementById(flottant.id.replace('panneau', 'bouton'))?.click();
      else if (!document.getElementById('menu-bouton')?.matches('[aria-expanded="true"]')) document.getElementById('menu-bouton')?.click();
      if (ligne && ligne.getAttribute('aria-pressed') !== 'true') ligne.click();
    });
    await attendre(page, () => [...document.querySelectorAll('.couche-pastille')].some((p) => /^Vent/.test(p.textContent.trim())), 60000);
    await page.waitForTimeout(6000);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('montis:montrer-carte')));
    await page.evaluate(() => {
      document.getElementById('menu-bouton')?.matches('[aria-expanded="true"]') && document.getElementById('menu-bouton').click();
    });
    // Panneau du vent réduit à sa barre : toute la carte reste à glisser
    await page.evaluate(() => [...document.querySelectorAll('.bf-reduire')].find((b) => b.offsetParent)?.click());
  }
  await page.waitForTimeout(8000); // tuiles, pentes et ombres calculées
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RALENTI_PROCESSEUR });
  const couches = await page.evaluate(() => [...document.querySelectorAll('.couche-pastille')].filter((p) => p.offsetParent && !p.hidden).map((p) => p.textContent.trim()).filter(Boolean));
  mkdirSync('mesures', { recursive: true });
  await page.screenshot({ path: `mesures/${ETIQUETTE}-fluidite-${CAS_FLUIDITE.findIndex((c) => c.nom === nom) + 1}.png` });
  // Un premier glissé, non compté, charge les tuiles alentour
  await glisser(page);
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    window.__images = [];
    let avant = performance.now();
    const compter = (t) => {
      window.__images.push(t - avant);
      avant = t;
      if (window.__compter) requestAnimationFrame(compter);
    };
    window.__compter = true;
    requestAnimationFrame(compter);
  });
  const debut = Date.now();
  await glisser(page);
  const duree = Date.now() - debut;
  if (process.env.MESURES_DEBOGAGE) await page.screenshot({ path: `mesures/${ETIQUETTE}-apres-${CAS_FLUIDITE.findIndex((c) => c.nom === nom) + 1}.png` });
  const images = await page.evaluate(() => {
    window.__compter = false;
    return window.__images.slice(1);
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const mem = await memoire(cdp);
  await contexte.close();
  const tri = [...images].sort((a, b) => a - b);
  return {
    nom,
    couches,
    imagesParSeconde: Math.round((images.length / (duree / 1000)) * 10) / 10,
    imageMedianeMs: Math.round(mediane(images) * 10) / 10,
    image95Ms: Math.round(tri[Math.floor(tri.length * 0.95)] * 10) / 10,
    imagesLentes: images.filter((d) => d > 50).length,
    images: images.length,
    memoire: mem,
  };
}

function resumer(passages) {
  const champ = (liste, cle) => mediane(liste.map((r) => cle.split('.').reduce((o, k) => o?.[k], r)));
  const visites = ['froid', 'retour'].map((visite) => {
    const liste = passages.demarrage.flat().filter((r) => r.visite === visite);
    return {
      visite,
      premierAffichageMs: champ(liste, 'premierAffichage'),
      interfaceMs: champ(liste, 'interface'),
      carteMs: champ(liste, 'carte'),
      octetsMontisAvantInterfaceKo: Math.round(champ(liste, 'octetsMontisAvantInterface') / 1024),
      octetsMontisTotalKo: Math.round(champ(liste, 'octetsMontisTotal') / 1024),
      tasMo: champ(liste, 'memoire.tasMo'),
    };
  });
  const fluid = CAS_FLUIDITE.map(({ nom }) => {
    const liste = passages.fluidite.filter((r) => r.nom === nom);
    return {
      nom,
      couches: liste[0]?.couches,
      imagesParSeconde: champ(liste, 'imagesParSeconde'),
      imageMedianeMs: champ(liste, 'imageMedianeMs'),
      image95Ms: champ(liste, 'image95Ms'),
      imagesLentes: champ(liste, 'imagesLentes'),
      tasMo: champ(liste, 'memoire.tasMo'),
    };
  });
  return { visites, fluidite: fluid };
}

function fichiersDemarrage() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const fichiers = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  return fichiers.map((f) => ({ fichier: f, ko: Math.round(statSync(join(DIST, f)).size / 1024) }));
}

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Pas de build : lance d\'abord « npm run build ».');
  process.exit(1);
}
const serveur = await servir();
// Le vrai processeur graphique : sans lui, Chromium sans fenêtre dessine en logiciel (4 images par seconde)
const navigateur = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const passages = { demarrage: [], fluidite: [] };
try {
  for (let i = 0; i < PASSAGES; i++) {
    if (SEULEMENT !== 'fluidite') {
      console.log(`Passage ${i + 1}/${PASSAGES} : démarrage…`);
      passages.demarrage.push(await demarrage(navigateur));
    }
    if (SEULEMENT !== 'demarrage') {
      console.log(`Passage ${i + 1}/${PASSAGES} : fluidité…`);
      for (const cas of CAS_FLUIDITE) passages.fluidite.push(await fluidite(navigateur, cas));
    }
  }
} finally {
  await navigateur.close();
  serveur.close();
}
const resultat = { etiquette: ETIQUETTE, date: new Date().toISOString(), fichiersDemarrage: fichiersDemarrage(), resume: resumer(passages), passages };
mkdirSync('mesures', { recursive: true });
writeFileSync(`mesures/${ETIQUETTE}.json`, JSON.stringify(resultat, null, 2));
console.log(JSON.stringify({ fichiersDemarrage: resultat.fichiersDemarrage, ...resultat.resume }, null, 2));
