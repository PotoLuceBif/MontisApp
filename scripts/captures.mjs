// Captures d'écran de l'appli au format téléphone et ordinateur, pour vérifier une modification
// d'interface sans déploiement. Lance son propre serveur de développement.
//
//   npm run captures                  tous les écrans, téléphone et ordinateur
//   npm run captures -- meteo ski     seulement les écrans dont le nom contient ces mots
//
// Résultat dans captures/ (ignoré par git) : une image par écran et par format, et rapport.txt
// avec les erreurs JavaScript et les textes restés en français après le passage en anglais.
// Exige Playwright et Chromium, déjà installés dans les sessions cloud.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DOSSIER = 'captures';
const FORMATS = {
  telephone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ordinateur: { viewport: { width: 1280, height: 860 } },
};
const ATTENTE_CHARGEMENT = 4000;

// Un écran = une suite d'actions depuis l'accueil
const clic = (selecteur) => (page) => page.evaluate((s) => document.querySelector(s)?.click(), selecteur);
const module = (id) => async (page) => {
  await page.evaluate(async (id) => {
    const trouver = () => document.querySelector(`.menu-ligne[data-module="${id}"]`);
    // Le menu peut ne se construire qu'à sa première ouverture
    if (!trouver()) {
      document.getElementById('menu-bouton')?.click();
      await new Promise((fin) => setTimeout(fin, 400));
    }
    const ligne = trouver();
    if (!ligne) throw new Error(`Module introuvable : ${id}`);
    const flottant = ligne.closest('.outil-rapide-panneau');
    if (flottant) document.getElementById(flottant.id.replace('panneau', 'bouton'))?.click();
    else if (!document.getElementById('menu-bouton')?.matches('[aria-expanded="true"]')) document.getElementById('menu-bouton')?.click();
    if (ligne.getAttribute('aria-pressed') !== 'true') ligne.click();
  }, id);
};

// Appui long au doigt (téléphone) ou clic droit (ordinateur), au point donné de la fenêtre
const appuiLong = (x, y) => async (page) => {
  const { width, height } = page.viewportSize();
  const px = Math.round(width * x);
  const py = Math.round(height * y);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const cdp = await page.context().newCDPSession(page);
    const points = [{ x: px, y: py }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.click(px, py, { button: 'right' });
  }
  await page.waitForTimeout(2500);
};

// Place la carte (en développement, elle est accessible par window.map)
const vue = (options) => (page) => page.evaluate((o) => window.map.jumpTo(o), options);
const AIGUILLES = { center: [6.93, 45.9], zoom: 13.4, bearing: 0, pitch: 0 };

const ECRANS = [
  { nom: 'accueil', actions: [] },
  { nom: 'menu', actions: [clic('#menu-bouton')] },
  { nom: 'parametres', actions: [clic('#menu-bouton'), clic('#menu-parametres-bouton')] },
  { nom: 'parapente', actions: [module('parapente')] },
  { nom: 'randonnee', actions: [module('rando')] },
  { nom: 'velo', actions: [module('velo')] },
  { nom: 'ski', actions: [module('ski')] },
  { nom: 'meteo', actions: [module('meteo-locale')] },
  { nom: 'meteo-radar', actions: [module('radar')] },
  { nom: 'meteo-vent', actions: [module('vent')] },
  { nom: 'carte-fond', actions: [module('fond')] },
  { nom: 'carte-relief', actions: [module('relief')] },
  { nom: 'carte-pentes', actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), (p) => p.waitForTimeout(3000)] },
  { nom: 'carte-orientation', actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="orientation"]'), (p) => p.waitForTimeout(3000)] },
  {
    nom: 'carte-pentes-3d',
    actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('.relief-bascule [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200), vue({ ...AIGUILLES, pitch: 60, bearing: 30 }), (p) => p.waitForTimeout(4000)],
  },
  { nom: 'carte-pentes-loin', actions: [vue({ ...AIGUILLES, zoom: 10 }), module('relief'), clic('.pentes-choix [data-genre="pentes"]')] },
  { nom: 'carte-elements', actions: [module('elements')] },
  { nom: 'carte-hors-ligne', actions: [module('hors-ligne')] },
  // Fiche d'un point quelconque, ouverte par appui long
  { nom: 'point', actions: [appuiLong(0.5, 0.42)] },
  // Météo et Carte s'ouvrent par-dessus une activité sans l'arrêter
  { nom: 'combine-portee-meteo', actions: [module('parapente'), clic('[data-para-vue="portee"]'), clic('#outil-rapide-bouton-meteo')] },
  { nom: 'combine-parcours-carte', actions: [module('rando'), clic('.parcours-creer'), clic('#outil-rapide-bouton-carte')] },
  // L'analyse du vent par-dessus une visite de station : la visite continue, la station reste visible
  {
    nom: 'visite-vent',
    actions: [
      module('ski'),
      async (page) => {
        await page.fill('.ski .rando-champ', 'Chamonix');
        await page.waitForTimeout(1500);
        await page.press('.ski .rando-champ', 'Enter');
        await page.waitForTimeout(6000);
      },
      module('vent'),
      (page) => page.waitForTimeout(4000),
    ],
  },
  {
    nom: 'combine-parcours-carte-fermee',
    actions: [module('rando'), clic('.parcours-creer'), clic('#outil-rapide-bouton-carte'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer')],
  },
];

// Textes visibles à l'écran
const textesVisibles = (page) =>
  page.evaluate(() => {
    const textes = new Set();
    const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (parcours.nextNode()) {
      const element = parcours.currentNode.parentElement;
      const texte = parcours.currentNode.textContent.trim();
      // Les listes de lieux (stations, bike parks) contiennent des noms propres
      if (texte && element && !element.closest('script, style, svg, .rando-liste') && element.checkVisibility()) textes.add(texte);
    }
    return [...textes];
  });

const changerLangue = (page, code) =>
  page.evaluate(async (code) => (await import('/src/preferences.js')).definirLangue(code), code);

const RESSEMBLE_AU_FRANCAIS = /[éèêàùç]|\b(le|la|les|des|du|une|aucun|pour|sur|dans|avec)\b/i;

async function main() {
  const filtres = process.argv.slice(2);
  const ecrans = filtres.length ? ECRANS.filter((e) => filtres.some((f) => e.nom.includes(f))) : ECRANS;

  rmSync(DOSSIER, { recursive: true, force: true });
  mkdirSync(DOSSIER, { recursive: true });

  const serveur = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'silent' });
  await serveur.listen();
  const adresse = serveur.resolvedUrls.local[0];

  // En session cloud, Internet passe par un proxy ; le serveur local, non
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const navigateur = await chromium.launch({ proxy, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  const rapport = [];
  const reseauEnEchec = new Set();
  try {
    for (const [format, options] of Object.entries(FORMATS)) {
      for (const ecran of ecrans) {
        const contexte = await navigateur.newContext({ ...options, locale: 'fr-FR' });
        await contexte.addInitScript(() => localStorage.setItem('montis.reglages', JSON.stringify({ langue: 'fr' })));
        const page = await contexte.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(e.message));
        page.on('requestfailed', (r) => reseauEnEchec.add(new URL(r.url()).host));

        await page.goto(adresse, { waitUntil: 'load' });
        await page.waitForTimeout(ATTENTE_CHARGEMENT);
        for (const action of ecran.actions) {
          await action(page);
          await page.waitForTimeout(600);
        }
        await page.waitForTimeout(ecran.actions.length ? 2500 : 0);
        await page.screenshot({ path: `${DOSSIER}/${format}-${ecran.nom}.png` });

        // Passage en anglais : ce qui reste en français ne suit pas la langue
        const avant = await textesVisibles(page);
        await changerLangue(page, 'en');
        await page.waitForTimeout(600);
        const apres = new Set(await textesVisibles(page));
        // Les noms de langue s'écrivent dans leur propre langue : « Français » reste « Français »
        const restes = avant.filter((texte) => apres.has(texte) && texte !== 'Français' && RESSEMBLE_AU_FRANCAIS.test(texte));

        rapport.push(`${format}-${ecran.nom}`);
        erreurs.forEach((e) => rapport.push(`  ERREUR ${e}`));
        restes.forEach((texte) => rapport.push(`  RESTE EN FRANÇAIS « ${texte} »`));
        console.log(`${format}-${ecran.nom}${erreurs.length ? ` : ${erreurs.length} erreur(s)` : ''}`);
        await contexte.close();
      }
    }
  } finally {
    await navigateur.close();
    await serveur.close();
  }

  if (reseauEnEchec.size) rapport.push('', `Serveurs injoignables pendant les captures : ${[...reseauEnEchec].join(', ')}`);
  writeFileSync(`${DOSSIER}/rapport.txt`, `${rapport.join('\n')}\n`);
  console.log(`\nCaptures et rapport dans ${DOSSIER}/`);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
