// Captures d'écran de l'appli au format téléphone et ordinateur, pour vérifier une modification
// d'interface sans déploiement. Lance son propre serveur de développement.
//
//   npm run captures                  tous les écrans, téléphone et ordinateur
//   npm run captures -- meteo ski     seulement les écrans dont le nom contient ces mots
//
// Résultat dans captures/ (ignoré par git) : une image par écran et par format, et rapport.txt
// avec les erreurs JavaScript et les textes restés en français après le passage en anglais.
// Exige Playwright et Chromium, déjà installés dans les sessions cloud.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { archiveSimulee, previsionsSimulees } from './meteo-simulee.mjs';
import { gpxRando, gpxSki, igcVol, tcxVelo } from './sorties-demo.mjs';
import { fragmentParcours } from '../src/partage-calcul.js';
import { getMoonPosition, getPosition } from 'suncalc';
import { directionEtoile, tempsSideral } from '../src/ciel-calcul.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// CAPTURES_ETROIT=1 : seulement un petit téléphone (360 px de large), dans captures-360/
const ETROIT = Boolean(process.env.CAPTURES_ETROIT);
const DOSSIER = ETROIT ? 'captures-360' : 'captures';
const FORMATS = ETROIT ? {
  telephone: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} : {
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
// Sans rien renvoyer : Playwright tenterait de copier toute la carte
const vue = (options) => (page) => page.evaluate((o) => { window.map.jumpTo(o); }, options);
const AIGUILLES = { center: [6.93, 45.9], zoom: 13.4, bearing: 0, pitch: 0 };
const BULLETIN_SIMULE = readFileSync(new URL('./bulletin-simule.json', import.meta.url), 'utf8');
const ARGENTIERE ={ center: [7.0, 45.97], zoom: 12.6, bearing: 0, pitch: 0 };
const PASSON = { center: [6.98, 45.962], zoom: 13.6, bearing: 0, pitch: 0 };
// Clic sur la carte à une position donnée (l'éditeur de parcours écoute les clics de MapLibre)
const clicCarte = (lngLat) => async (page) => {
  const { x, y } = await page.evaluate((p) => window.map.project(p), lngLat);
  const boite = await page.locator('#map').boundingBox();
  await page.mouse.click(boite.x + x, boite.y + y);
};
const allumerElements = (motif) => [...elementsCarte, (p) => p.evaluate((m) => { for (const l of document.querySelectorAll('.option-case')) if (new RegExp(m).test(l.textContent)) { const c = l.querySelector('input'); if (!c.checked) c.click(); } }, motif), clic('#outil-rapide-panneau-carte .outil-rapide-fermer')];
// Touche le premier élément affiché d'une couche (un parking du fond…), le plus près du centre
const clicCouche = (couche) => async (page) => {
  const point = await page.evaluate((id) => {
    const c = window.map.getCanvas();
    const centre = { x: c.clientWidth / 2, y: c.clientHeight / 2 };
    const trouves = window.map.queryRenderedFeatures({ layers: [id] }).map((f) => window.map.project(f.geometry.coordinates));
    trouves.sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y));
    return trouves[0] ?? null;
  }, couche);
  if (!point) return;
  const boite = await page.locator('#map').boundingBox();
  await page.mouse.click(boite.x + point.x, boite.y + point.y);
};
const MATIN = { center: [6.9, 45.88], zoom: 12.3, bearing: 0, pitch: 0 }; // vallée de Chamonix
// Jour fixé au calendrier de Soleil et Lune : la Lune y est au même endroit à chaque série
const JOUR_LUNE = (page) => page.evaluate(() => {
  const champ = document.querySelector('.ombres-calendrier');
  champ.value = '2026-11-16';
  champ.dispatchEvent(new Event('change', { bubbles: true }));
});
// Place le curseur d'heure de l'ombre du soleil (minutes depuis minuit)
const heureOmbres = (minutes) => async (page) => {
  await page.waitForSelector('.ombres-curseur', { state: 'attached', timeout: 8000 });
  await page.evaluate((m) => {
    const curseur = document.querySelector('.ombres-curseur');
    curseur.value = m;
    curseur.dispatchEvent(new Event('input', { bubbles: true }));
  }, minutes);
};
// Touche sur la carte le premier objet affiché d'une couche dont une propriété commence par `debut`
// Playwright `waitForFunction` interroge la page sans cesse et bloque le rendu de la carte : on attend à la main
async function attendreSur(page, fonction, argument, delai = 30000) {
  for (const fin = Date.now() + delai; Date.now() < fin;) {
    if (await page.evaluate(fonction, argument)) return;
    await page.waitForTimeout(500);
  }
  throw new Error(`Attente dépassée (${delai / 1000} s)`);
}
const toucherObjet = (couche, propriete, debut) => async (page) => {
  await attendreSur(
    page,
    ([c, pr, d]) => window.map.getLayer?.(c) && window.map.queryRenderedFeatures({ layers: [c] }).some((f) => String(f.properties[pr]).startsWith(d)),
    [couche, propriete, debut],
  );
  const point = await page.evaluate(([c, pr, d]) => {
    const { clientWidth: l, clientHeight: h } = window.map.getContainer();
    const centre = (f) => window.map.project(f.geometry.coordinates);
    const objets = window.map.queryRenderedFeatures({ layers: [c] })
      .filter((f) => String(f.properties[pr]).startsWith(d))
      .map((f) => ({ f, p: centre(f) }))
      .filter(({ p }) => p.x > 40 && p.x < l - 40 && p.y > 120 && p.y < h * 0.45);
    const choisi = objets[0] ?? { p: centre(window.map.queryRenderedFeatures({ layers: [c] }).find((f) => String(f.properties[pr]).startsWith(d))) };
    const cadre = window.map.getContainer().getBoundingClientRect();
    return { x: cadre.left + choisi.p.x, y: cadre.top + choisi.p.y };
  }, [couche, propriete, debut]);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1500);
};
// Attend qu'une couche de la carte montre au moins un objet
const attendreCouche = (couche) => (page) => attendreSur(
  page,
  (c) => window.map.getLayer?.(c) && window.map.queryRenderedFeatures({ layers: [c] }).length > 0,
  couche,
);
const ANNECY = { center: [6.25, 45.83], zoom: 10.5, bearing: 0, pitch: 0 };
const ZERMATT = { center: [7.75, 46.0], zoom: 12.5, bearing: 0, pitch: 0 };
// Panneau Fond de carte : un onglet, un fond, un calque officiel (la liste se redessine : on cherche à chaque fois)
// « Avancé » du fond de carte : éléments de la carte et tous les fonds
const ouvrirAvance = (section) => (page) => page.evaluate((section) => {
  const entete = document.querySelector('.fond-avance-entete');
  if (entete?.getAttribute('aria-expanded') !== 'true') entete?.click();
  document.querySelector(`.fond-avance [data-section="${section}"]`)?.scrollIntoView({ block: 'start' });
}, section);
const elementsCarte = [module('fond'), ouvrirAvance('elements')];
const ongletFond = (o) => async (page) => {
  await ouvrirAvance('fonds')(page);
  await clic(`.fond-onglets [data-onglet="${o}"]`)(page);
};
const choisirFond = (id) => async (page) => {
  await page.evaluate((i) => {
    let radio = document.querySelector(`.fond-panneau input[name="fond"][value="${i}"]`);
    if (!radio) {
      const entete = document.querySelector('.fond-avance-entete');
      if (entete?.getAttribute('aria-expanded') !== 'true') entete?.click();
      document.querySelector('.fond-onglets [data-onglet="pays"]')?.click();
      for (let ferme; (ferme = document.querySelector('.fond-pays-entete[aria-expanded="false"]'));) ferme.click();
      radio = document.querySelector(`.fond-contenu input[name="fond"][value="${i}"]`);
    }
    radio?.click();
  }, id);
  await page.waitForTimeout(500);
};
const cocherCalque = (id) => clic(`.fond-calque[data-calque="${id}"] input[type="checkbox"]:not(:checked)`);
const fermerCarte = clic('#outil-rapide-panneau-carte .outil-rapide-fermer');
// Le module se charge à sa première ouverture : son onglet n'existe pas tout de suite
const ongletSites = async (page) => {
  await page.waitForSelector('[data-para-vue="sites"]', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => {
    const onglet = document.querySelector('[data-para-vue="sites"]');
    if (onglet.getAttribute('aria-pressed') !== 'true') onglet.click();
  });
};
// Le premier élément visible : plusieurs panneaux ont les mêmes boutons
// Point posé par l'événement de MapLibre : au téléphone, un vrai clic peut tomber sur le panneau
const poserPoint = (lngLat) => (page) => page.evaluate((p) => {
  window.map.fire('click', { lngLat: { lng: p[0], lat: p[1] }, point: window.map.project(p), originalEvent: { target: document.body } });
}, lngLat);
// Appui long au doigt (souris tenue) sur le premier élément visible
const appuiLongSur = (selecteur) => async (page) => {
  const boite = await page.evaluate((sel) => {
    const element = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }, selecteur);
  if (!boite) return;
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
};
const clicVisible = (selecteur) => (page) => page.evaluate((s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null)?.click(), selecteur);
// Les relevés et les terrains arrivent en quelques secondes
const SITES = [vue(ANNECY), module('parapente'), ongletSites, (p) => p.waitForTimeout(6000)];
// Fiche d'un décollage près d'Annecy
const TERRAIN = [...SITES, clic('#menu-bouton'), vue({ ...ANNECY, zoom: 11.5 }), toucherObjet('terrains-ffvl-points', 'classe', 'decollage')];
// Fait défiler le panneau jusqu'à un bloc
const choisirVisible = (selecteur, valeur) => (page) => page.evaluate(([s, v]) => {
  const choix = [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null);
  if (!choix) return;
  choix.value = v;
  choix.dispatchEvent(new Event('change'));
}, [selecteur, valeur]);
const defiler = (selecteur) => (page) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), selecteur);
// Touche la frise météo à une fraction de sa largeur
const lireFrise = (fraction) => async (page) => {
  const frise = page.locator('.frise:not([hidden]) .frise-graphique').first();
  await frise.waitFor({ timeout: 8000 });
  const boite = await frise.boundingBox();
  await frise.click({ position: { x: boite.width * fraction, y: boite.height / 2 } });
};

// Liste chrono : la carte au milieu de la transition (le cliché final, lui, montre le retour), et le zoom au fil du temps
const milieuTransition = (nom) => async (page) => {
  const zooms = [];
  for (let i = 0; i < 8; i += 1) {
    zooms.push((await page.evaluate(() => window.map.getZoom())).toFixed(2));
    if (i === 3) await page.screenshot({ path: `captures/${page.viewportSize().width < 700 ? 'telephone' : 'ordinateur'}-${nom}-milieu.png` });
    await page.waitForTimeout(200);
  }
  console.log('ZOOMS', nom, zooms.join(' '));
};
const attendre = (selecteur) => (page) => page.waitForSelector(selecteur, { state: 'attached', timeout: 15000 });

// Panorama des sommets (lot 4.1) : près du sommet du Brévent, la carte tournée vers le Mont Blanc
const BREVENT = [6.8381, 45.9375];
const VUE_BREVENT = '#vue=13/45.9375/6.8381/150/0';
// Sommets chargés et calculés : le message de chargement est parti (attendreSur : waitForSelector bloquait le rendu)
function attendreHorizon() {
  return [
    (p) => attendreSur(p, () => document.querySelector('.pano-sommet:not([hidden])') && !/Chargement|Recherche/.test(document.querySelector('.pano-etat')?.hidden ? '' : document.querySelector('.pano-etat').textContent), null, 60000),
    (p) => p.waitForTimeout(8000),
  ];
}
const ouvrirPanorama = [
  // Après plusieurs panoramas, les serveurs de tuiles ralentissent : le menu peut tarder
  (p) => p.waitForSelector('#outil-rapide-bouton-panorama', { state: 'attached', timeout: 60000 }),
  clic('#outil-rapide-bouton-panorama'),
  ...attendreHorizon(),
];
// Vue au sol de Soleil et Lune, à une heure de la frise (minutes depuis minuit)
const VUE_EMBRUN = '#vue=12/44.5644/6.4954/0/0';
const ouvrirCielSol = (minutes) => [
  (p) => p.waitForSelector('#outil-rapide-bouton-ciel', { state: 'attached', timeout: 60000 }),
  clic('#outil-rapide-bouton-ciel'),
  attendre('.ciel-course'),
  heureOmbres(minutes),
  (p) => p.waitForTimeout(600),
  clic('.ciel-bouton-sol'),
  // Relief (25 tuiles) et crêtes : long avec le rendu logiciel des captures et un réseau lent
  (p) => attendreSur(p, () => document.querySelector('.ciel-relief') && !document.querySelector('.ciel-relief').hidden, null, 150000),
  (p) => p.waitForTimeout(6000),
];
// Téléphone debout (bêta 90°), arrière tourné vers `cap`, relevé de `inclinaison` degrés
// (une mesure toutes les 50 ms, comme un vrai capteur)
const boussoleSimulee = (cap, inclinaison = 0) => (p) => p.evaluate(([c, i]) => {
  setInterval(() => {
    window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'), { alpha: (360 - c) % 360, beta: 90 + i, gamma: 0, absolute: true }));
  }, 50);
}, [cap, inclinaison]);
// Glissé au doigt au milieu de l'écran (recalage, ou regard libre)
const glisserPanorama = (dx, dy) => async (p) => {
  const { width, height } = p.viewportSize();
  await p.mouse.move(width / 2, height / 2);
  await p.mouse.down();
  await p.mouse.move(width / 2 + dx, height / 2 + dy, { steps: 8 });
  await p.mouse.up();
};
// Caméra remplacée par une image de synthèse : ciel, horizon flou, sol
const cameraSimulee = (p) => p.evaluate(() => {
  const toile = document.createElement('canvas');
  toile.width = 720;
  toile.height = 960;
  const g = toile.getContext('2d');
  const peindre = () => {
    const d = g.createLinearGradient(0, 0, 0, 960);
    d.addColorStop(0, '#5d86b0');
    d.addColorStop(0.45, '#c9d6e0');
    d.addColorStop(0.5, '#8b9098');
    d.addColorStop(1, '#3a4033');
    g.fillStyle = d;
    g.fillRect(0, 0, 720, 960);
  };
  peindre();
  setInterval(peindre, 200);
  const flux = toile.captureStream(10);
  navigator.mediaDevices.getUserMedia = async () => flux;
});
const FICHIERS_DEMO = {
  'rando.gpx': { mimeType: 'application/gpx+xml', contenu: gpxRando },
  'velo.tcx': { mimeType: 'application/xml', contenu: tcxVelo },
  'vol.igc': { mimeType: 'text/plain', contenu: igcVol },
  'ski.gpx': { mimeType: 'application/gpx+xml', contenu: gpxSki },
};
const importerSorties = (noms) => async (page) => {
  await page.waitForSelector('.traces input[type="file"]', { state: 'attached', timeout: 15000 });
  await page.setInputFiles('.traces input[type="file"]', noms.map((nom) => ({
    name: nom,
    mimeType: FICHIERS_DEMO[nom].mimeType,
    buffer: Buffer.from(FICHIERS_DEMO[nom].contenu()),
  })));
  await page.waitForTimeout(2500);
};
// Une vraie sortie du propriétaire, si exemples/ en contient (dossier ignoré par git) : sinon, rien
const importerExemple = async (page) => {
  const fichier = existsSync('exemples') && readdirSync('exemples').find((nom) => /\.(fit|gpx|tcx|igc)$/i.test(nom));
  if (!fichier) return;
  await page.waitForSelector('.traces input[type="file"]', { state: 'attached', timeout: 15000 });
  await page.setInputFiles('.traces input[type="file"]', `exemples/${fichier}`);
  await page.waitForTimeout(3000);
};
// Un parcours Rando enregistré, pour la liste Mes traces › Parcours
const parcoursEnregistre = (page) => page.evaluate(() => {
  const etapes = [{ lng: 6.1, lat: 45.77, mode: 'route', troncon: null }, { lng: 6.12, lat: 45.79, mode: 'route', troncon: { geom: [[6.1, 45.77], [6.12, 45.79]] } }];
  localStorage.setItem('montis.rando-parcours', JSON.stringify([{ id: 'p1', nom: 'Lac de la Thuile', etapes, total: 8200, plus: 540, date: Date.UTC(2026, 9, 3), pratique: 'rando' }]));
});

// Touche la frise d'une sortie à une fraction de sa largeur
const toucherFriseSortie = (fraction) => async (page) => {
  const frise = page.locator('.bf-sortie .sortie-frise-toile');
  await frise.waitFor({ timeout: 8000 });
  const boite = await frise.boundingBox();
  await frise.click({ position: { x: boite.width * fraction, y: boite.height / 2 } });
};

// Lien d'un parcours partagé (lot 4.5) : une boucle au-dessus de Chamonix
const tracePartage = Array.from({ length: 60 }, (_, i) => [6.84 + Math.sin(i / 9.5) * 0.008, 45.93 + (1 - Math.cos(i / 9.5)) * 0.005]);
const { fragment: LIEN_PARCOURS } = await fragmentParcours({
  activite: 'rando',
  pratique: 'rando',
  nom: 'Tour du Brévent',
  etapes: [
    { lng: tracePartage[0][0], lat: tracePartage[0][1], mode: 'route', troncon: null },
    { lng: tracePartage[59][0], lat: tracePartage[59][1], mode: 'fixe', troncon: { geom: tracePartage, troncons: [{ longueur: 3600, voie: 'chemin', difficulte: 2, marches: false }], source: 'trace' } },
  ],
});

// Répond la même chose aux dix questions d'une partie « à taper », puis voit le résultat
const repondreTout = (texte, n = 10) => async (page) => {
  for (let i = 0; i < n; i += 1) {
    await page.fill('.bf-jeu .jeux-saisie input', texte);
    await page.press('.bf-jeu .jeux-saisie input', 'Enter');
    await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('.bf-jeu .jeux-suivant')?.click());
    await page.waitForTimeout(350);
  }
};

// Visite de la Lune, ouverte depuis Soleil et Lune ; sa carte est accessible par window.mapLune
const ALLER_LUNE = [vue(MATIN), module('lune'), attendre('.lune-visiter'), clic('.lune-visiter'), attendre('.lune-visite.prete')];
const vueLune = (options) => (page) => page.evaluate((o) => { window.mapLune.jumpTo(o); }, options);
const clicLune = (lngLat) => async (page) => {
  const { x, y } = await page.evaluate((ll) => { const p = window.mapLune.project(ll); return { x: p.x, y: p.y }; }, lngLat);
  await page.mouse.click(x, y);
};

const toucherTerre = async (page) => {
  const p = await page.evaluate(() => window.terreLune?.());
  if (p) await page.mouse.click(p.x, p.y);
};

// Clavier du téléphone simulé : la page perd 300 px de haut, comme Chrome quand le clavier se lève
const clavierSimule = async (p) => {
  const { width, height } = p.viewportSize();
  if (width <= 640) await p.setViewportSize({ width, height: height - 300 });
  await p.waitForTimeout(400);
};

const ECRANS = [
  { nom: 'accueil', actions: [] },
  // Fond Montis seul (lot 0.9) : massif, vallée, sentiers, 3D
  { nom: 'fond-massif', actions: [vue({ center: [6.95, 45.9], zoom: 9.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-vallee', actions: [vue(MATIN), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-sentiers', actions: [vue({ center: [6.885, 45.975], zoom: 14.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-sentiers-proche', actions: [vue({ center: [6.872, 45.93], zoom: 15.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-routes', actions: [vue({ center: [6.66, 45.92], zoom: 11.2, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-routes-ville', actions: [vue({ center: [6.87, 45.923], zoom: 13.8, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-remontees', actions: [vue({ center: [6.875, 45.912], zoom: 14.2, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-alpages', actions: [vue({ center: [6.47, 45.9], zoom: 13.4, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-torrents', actions: [vue({ center: [5.5, 44.93], zoom: 13.4, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-lacs-leman', actions: [vue({ center: [6.55, 46.42], zoom: 9.3, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-lacs-neuchatel', actions: [vue({ center: [6.85, 46.88], zoom: 10.2, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-lacs-joux', actions: [vue({ center: [6.25, 46.63], zoom: 12, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-cols-glaciers', actions: [vue({ center: [6.92, 45.87], zoom: 12.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-villes', actions: [vue({ center: [6.2, 46.05], zoom: 9.4, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-pictos', actions: [vue({ center: [6.869, 45.924], zoom: 16, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-parking-fiche', actions: [vue({ center: [6.869, 45.924], zoom: 16, bearing: 0, pitch: 0 }), ...allumerElements('Parkings'), (p) => p.waitForTimeout(5000), clicCouche('montis-parkings'), (p) => p.waitForTimeout(20000)] },
  { nom: 'fond-points-utiles', actions: [vue({ center: [6.869, 45.924], zoom: 16, bearing: 0, pitch: 0 }), ...allumerElements("Parkings|Abris|Points d'eau"), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-frontieres', actions: [vue({ center: [6.6, 46.1], zoom: 8.8, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-lisieres', actions: [vue({ center: [6.83, 45.9], zoom: 14, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-parcs', actions: [vue({ center: [6.85, 45.37], zoom: 9.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-pictos', fond: 'nuit', actions: [vue({ center: [6.869, 45.924], zoom: 16, bearing: 0, pitch: 0 }), ...allumerElements("Parkings|Abris|Points d'eau"), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-glaciers', fond: 'nuit', actions: [vue({ center: [6.92, 45.87], zoom: 12.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-remontees', fond: 'nuit', actions: [vue({ center: [6.875, 45.912], zoom: 14.2, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-massif', fond: 'nuit', actions: [vue({ center: [6.95, 45.9], zoom: 9.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-ville', fond: 'nuit', actions: [vue({ center: [6.87, 45.923], zoom: 15, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-sentiers', fond: 'nuit', actions: [vue({ center: [6.885, 45.975], zoom: 14.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'fond-nuit-3d', fond: 'nuit', actions: [clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [6.87, 45.92], zoom: 14.8, pitch: 60, bearing: 140 }), (p) => p.waitForTimeout(7000)] },
  { nom: 'fond-modes', actions: [module('fond')] },
  { nom: 'fond-batiments-3d', actions: [clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [6.87, 45.92], zoom: 15, pitch: 60, bearing: 140 }), (p) => p.waitForTimeout(7000)] },
  { nom: 'fond-3d', actions: [clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [6.9, 45.9], zoom: 12.4, pitch: 62, bearing: 160 }), (p) => p.waitForTimeout(7000)] },
  { nom: 'menu', actions: [clic('#menu-bouton')] },
  { nom: 'parametres', actions: [clic('#menu-bouton'), clic('#menu-parametres-bouton')] },
  { nom: 'parapente', actions: [module('parapente')] },
  // Balises OpenWindMap et FFVL réunies, terrains FFVL (réseau requis : api.pioupiou.fr, data.gouv.fr)
  { nom: 'parapente-sites', actions: [...SITES] },
  { nom: 'parapente-sites-carte', actions: [...SITES, clic('#menu-bouton')] },
  // Pins des terrains et leur anneau d'orientations, carte tournée : l'anneau suit la carte
  { nom: 'parapente-terrains-pins', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.25, 45.815], zoom: 13.2, bearing: 30, pitch: 0 }), attendreCouche('terrains-ffvl-anneaux')] },
  { nom: 'parapente-terrains-pins-nord', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.25, 45.815], zoom: 13.2, bearing: 0, pitch: 0 }), attendreCouche('terrains-ffvl-anneaux')] },
  { nom: 'parapente-terrains-pins-3d', actions: [...SITES, clic('#menu-bouton'), clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [6.25, 45.815], zoom: 13.2, bearing: 30, pitch: 60 }), (p) => p.waitForTimeout(5000), attendreCouche('terrains-ffvl-anneaux')] },
  // Manches à air debout en 3D
  { nom: 'parapente-balises-3d', actions: [...SITES, clic('#menu-bouton'), clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [6.83, 45.925], zoom: 13, bearing: 20, pitch: 65 }), (p) => p.waitForTimeout(6000)] },
  { nom: 'parapente-terrain', actions: TERRAIN },
  // « Évaluer l'exposition » (lot 4.7) : Soleil et Lune › Ombre du soleil, cadrée sur le décollage
  { nom: 'parapente-terrain-exposition', actions: [...TERRAIN, attendre('.lien-exposition'), clicVisible('.lien-exposition'), (p) => p.waitForTimeout(4000)] },
  // Lien vers la balise la plus proche (24 h), puis flèche retour vers le terrain
  { nom: 'parapente-terrain-balise', actions: [...TERRAIN, clic('.tf-balise'), (p) => p.waitForTimeout(3000)] },
  { nom: 'parapente-terrain-retour', actions: [...TERRAIN, clic('.tf-balise'), (p) => p.waitForTimeout(3000), clicVisible('.bf-retour'), (p) => p.waitForTimeout(1500)] },
  // Pas de balise sur le terrain : analyse du vent centrée dessus
  { nom: 'parapente-terrain-vent', actions: [...TERRAIN, defiler('.tf .point-lien'), (p) => p.waitForTimeout(500), clicVisible('.tf .point-lien'), (p) => p.waitForTimeout(6000)] },
  { nom: 'parapente-terrain-vent-retour', actions: [...TERRAIN, defiler('.tf .point-lien'), (p) => p.waitForTimeout(500), clicVisible('.tf .point-lien'), (p) => p.waitForTimeout(6000), clicVisible('.bf-retour'), (p) => p.waitForTimeout(2000)] },
  // Terrain sur autorisation : pastille « ! » sur le pin, bandeau dans la fiche
  { nom: 'parapente-terrain-autorisation', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.0605, 45.6437], zoom: 13, bearing: 0, pitch: 0 }), toucherObjet('terrains-ffvl-autorisations', 'autorisation', 'true')] },
  { nom: 'parapente-terrain-interdit', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.08, 45.62], zoom: 12 }), toucherObjet('terrains-ffvl-points', 'classe', 'interdit')] },
  { nom: 'parapente-balise-ffvl', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.6, 45.5], zoom: 9 }), toucherObjet('balises-vent-pastilles', 'id', 'ffvl-')] },
  // Raccourcis de la fiche d'une balise (lot 3.5) : Analyser le vent ici et Prévisions ici, puis le profil au pied de la balise
  { nom: 'parapente-balise-raccourcis', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.6, 45.5], zoom: 9 }), toucherObjet('balises-vent-pastilles', 'id', 'ffvl-'), attendre('.bf-raccourcis .point-lien'), defiler('.bf-raccourcis')] },
  { nom: 'parapente-balise-profil', simuler: true, actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.6, 45.5], zoom: 9 }), toucherObjet('balises-vent-pastilles', 'id', 'ffvl-'), attendre('.bf-raccourcis .point-lien'), clicVisible('.bf-raccourcis .point-lien'), attendre('#vent-vue-profil-onglet'), (p) => p.waitForTimeout(1500), clic('#vent-vue-profil-onglet'), (p) => p.waitForTimeout(3000)] },
  { nom: 'randonnee', actions: [module('rando')] },
  { nom: 'velo', actions: [module('velo')] },
  { nom: 'ski', actions: [module('ski')] },
  // Ski de rando (lot 3.3) : choix de la pratique, pentes allumées d'office, bulletin du massif au centre
  { nom: 'ski-rando', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(4000)] },
  // Itinéraires d'OSM (piste:type=skitour), lus dans /data/skitour
  // Groupes de lieux en pastilles rondes (24 novembre 2026) : stations de la zone, itinéraires de ski de rando, terrains
  { nom: 'ski-groupes', actions: [vue({ center: [6.6, 45.6], zoom: 8.2, bearing: 0, pitch: 0 }), module('ski'), attendre('.ski-zone .rando-zone-bouton'), clic('.ski-zone .rando-zone-bouton'), (p) => p.waitForTimeout(2500), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  { nom: 'ski-rando-groupes', actions: [vue({ ...PASSON, zoom: 11 }), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), (p) => p.waitForTimeout(3000), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  { nom: 'parapente-terrains-groupes', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.25, 45.815], zoom: 9, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(4000)] },
  { nom: 'ski-rando-itineraires', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), (p) => p.waitForTimeout(2500)] },
  { nom: 'ski-rando-itineraires-carte', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), (p) => p.waitForTimeout(2500), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  // Un itinéraire touché dans la liste s'ouvre dans l'éditeur, comme une trace importée
  { nom: 'ski-rando-trace', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), attendre('.ski-activite .parcours-liste .parcours-item'), clic('.ski-activite .parcours-liste .parcours-item'), (p) => p.waitForTimeout(5000)] },
  { nom: 'ski-rando-trace-couleur', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), attendre('.ski-activite .parcours-liste .parcours-item'), clic('.ski-activite .parcours-liste .parcours-item'), (p) => p.waitForTimeout(5000), defiler('.parcours-couleur')] },
  // Routage de montée : deux points posés sur la trace du col du Passon, le tracé la suit
  { nom: 'ski-rando-routage', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-creer'), (p) => p.waitForTimeout(2500), clicCarte([6.98215, 45.95351]), (p) => p.waitForTimeout(1500), clicCarte([6.97771, 45.96735]), (p) => p.waitForTimeout(6000)] },
  { nom: 'ski-rando-ferme', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(1500), clic('#menu-fermer'), (p) => p.waitForTimeout(3000)] },
  { nom: 'ski-rando-creer', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-creer'), clic('.ski-activite .parcours-creer'), (p) => p.waitForTimeout(2500)] },
  // Retour à la piste : les pentes allumées par le ski de rando s'éteignent
  // Bulletin détaillé déplié, avec le bulletin d'hiver de Météo-France (option bulletin)
  { nom: 'ski-rando-bulletin', bulletin: true, actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.skirando-bulletin-bouton:not([hidden])'), clic('.skirando-bulletin-bouton'), (p) => p.waitForTimeout(4000), defiler('.skirando-bulletin-bouton')] },
  { nom: 'ski-rando-bulletin-suite', bulletin: true, actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.skirando-bulletin-bouton:not([hidden])'), clic('.skirando-bulletin-bouton'), (p) => p.waitForTimeout(4000), defiler('.bulletin-texte')] },
  // Pentes du bulletin sur la carte : orientations et altitudes du bulletin d'hiver, panneau fermé
  { nom: 'ski-rando-bulletin-carte', bulletin: true, actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.skirando-bulletin-bouton:not([hidden])'), clic('.skirando-bulletin-bouton'), attendre('.bulletin-carte'), clic('.bulletin-carte'), (p) => p.waitForTimeout(1000), clic('#menu-fermer'), (p) => p.waitForTimeout(6000)] },
  { nom: 'ski-rando-piste', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(1000), clic('.ski-pratiques [data-pratique="piste"]'), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  // `simuler` : prévisions Open-Meteo simulées (scripts/meteo-simulee.mjs), injoignable en session cloud
  { nom: 'meteo', simuler: true, actions: [module('meteo-locale')] },
  // Phase de la Lune sous le Soleil des conditions locales (lot 4.7)
  { nom: 'meteo-lune', simuler: true, actions: [module('meteo-locale'), attendre('.soleil-lune'), (p) => p.waitForTimeout(1500), defiler('.meteo-soleil')] },
  { nom: 'meteo-pin-ferme', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(2000), clicVisible('.outil-rapide-panneau:not([hidden]) .outil-rapide-fermer'), (p) => p.waitForTimeout(1000)] },
  // Recherche du lieu des prévisions par son nom (Photon), puis lieu choisi
  // Recherche : grande ville devant le village homonyme voisin, pays des homonymes
  { nom: 'recherche-montreal', actions: [(p) => p.evaluate(() => document.querySelector('.rech-loupe')?.click()), (p) => p.fill('#rech-saisie', 'Montréal'), attendre('.rech-credit'), (p) => p.waitForTimeout(500)] },
  // Dernières recherches : champ vide, puis celles qui correspondent à la saisie en tête des résultats
  { nom: 'recherche-recentes', actions: [(p) => p.addInitScript(() => { const r = JSON.parse(localStorage.getItem('montis.reglages') || '{}'); r['recherches-recentes'] = [{ nom: 'Chamonix-Mont-Blanc', type: 'ville', lieux: 'Haute-Savoie, Auvergne-Rhône-Alpes, France', icone: '🏙️', lng: 6.87, lat: 45.92, zoom: 12, bounds: null, cle: 'R1' }, { nom: 'Aiguille du Midi', type: 'sommet', lieux: 'Haute-Savoie, Auvergne-Rhône-Alpes, France', icone: '⛰️', lng: 6.887, lat: 45.879, zoom: 13, bounds: null, cle: 'N2' }, { nom: 'Refuge du Couvercle', type: 'refuge', lieux: 'Haute-Savoie, France', icone: '🛖', lng: 6.95, lat: 45.9, zoom: 15, bounds: null, cle: 'N3' }]; localStorage.setItem('montis.reglages', JSON.stringify(r)); }), (p) => p.reload(), attendre('.rech-loupe'), (p) => p.evaluate(() => document.querySelector('.rech-loupe')?.click()), attendre('.rech-recent'), (p) => p.waitForTimeout(500)] },
  { nom: 'recherche-recentes-saisie', actions: [(p) => p.addInitScript(() => { const r = JSON.parse(localStorage.getItem('montis.reglages') || '{}'); r['recherches-recentes'] = [{ nom: 'Chamonix-Mont-Blanc', type: 'ville', lieux: 'Haute-Savoie, Auvergne-Rhône-Alpes, France', icone: '🏙️', lng: 6.87, lat: 45.92, zoom: 12, bounds: null, cle: 'R1' }, { nom: 'Aiguille du Midi', type: 'sommet', lieux: 'Haute-Savoie, Auvergne-Rhône-Alpes, France', icone: '⛰️', lng: 6.887, lat: 45.879, zoom: 13, bounds: null, cle: 'N2' }, { nom: 'Refuge du Couvercle', type: 'refuge', lieux: 'Haute-Savoie, France', icone: '🛖', lng: 6.95, lat: 45.9, zoom: 15, bounds: null, cle: 'N3' }]; localStorage.setItem('montis.reglages', JSON.stringify(r)); }), (p) => p.reload(), attendre('.rech-loupe'), (p) => p.evaluate(() => document.querySelector('.rech-loupe')?.click()), (p) => p.fill('#rech-saisie', 'cham'), attendre('.rech-credit'), (p) => p.waitForTimeout(500)] },
  // Pin de la recherche : bulle avec « Copier » seul ; un appui sur la carte à côté l'enlève ; sur téléphone, la barre repliée garde le nom et la croix
  { nom: 'recherche-pin', actions: [(p) => p.evaluate(() => document.querySelector('.rech-loupe')?.click()), (p) => p.fill('#rech-saisie', 'Chamonix'), attendre('.rech-item'), clic('.rech-item'), (p) => p.waitForTimeout(3000)] },
  { nom: 'recherche-pin-retire', actions: [(p) => p.evaluate(() => document.querySelector('.rech-loupe')?.click()), (p) => p.fill('#rech-saisie', 'Chamonix'), attendre('.rech-item'), clic('.rech-item'), (p) => p.waitForTimeout(3000), (p) => p.evaluate(() => window.map.fire('click', { lngLat: { lng: 0, lat: 0 }, point: { x: 10, y: 10 }, originalEvent: { target: document.body } })), (p) => p.waitForTimeout(800)] },
  { nom: 'meteo-recherche', simuler: true, actions: [module('meteo-locale'), (p) => p.fill('.meteo-recherche-champ', 'Annecy'), (p) => p.waitForTimeout(3000)] },
  { nom: 'meteo-recherche-choisi', simuler: true, actions: [module('meteo-locale'), (p) => p.fill('.meteo-recherche-champ', 'Annecy'), attendre('.meteo-recherche-liste .rando-item'), clic('.meteo-recherche-liste .rando-item'), (p) => p.waitForTimeout(3000)] },
  // Frise heure par heure : lecture d'une heure, choix des lignes, jour choisi
  { nom: 'meteo-frise', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-lecture', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), defiler('.meteo-horaire'), lireFrise(0.3), (p) => p.waitForTimeout(800), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-lignes', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), clic('.frise-bouton-lignes'), clic('.frise-puce-nuages'), clic('.frise-puce-isotherme'), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-jour', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), clic('.meteo-jour:nth-child(3)'), defiler('.meteo-horaire')] },
  { nom: 'meteo-radar', actions: [module('radar')] },
  { nom: 'meteo-vent', actions: [module('vent')] },
  // Profil heure par heure (lot 3.5) : vent par altitude, thermiques, cumulus (prévisions simulées)
  { nom: 'meteo-vent-profil', simuler: true, actions: [module('vent'), attendre('#vent-vue-profil-onglet'), clic('#vent-vue-profil-onglet'), (p) => p.waitForTimeout(3000)] },
  // Volume 3D jusqu'à 10 000 m et profil jusqu'à 10 000 m
  { nom: 'meteo-vent-volume-10000', simuler: true, actions: [module('vent'), attendre('#vent-vue-volume-onglet'), clic('#vent-vue-volume-onglet'), (p) => p.waitForTimeout(2000), clic('input[name="vent-volume-plafond"][value="10000"]'), (p) => p.waitForTimeout(5000)] },
  { nom: 'meteo-vent-profil-haut', simuler: true, actions: [module('vent'), attendre('#vent-vue-profil-onglet'), clic('#vent-vue-profil-onglet'), attendre('.vent-profil-zone'), clic('.vent-profil-haut'), (p) => p.waitForTimeout(1500), defiler('.vent-profil-entete')] },
  { nom: 'meteo-vent-profil-heure', simuler: true, actions: [module('vent'), attendre('#vent-vue-profil-onglet'), clic('#vent-vue-profil-onglet'), attendre('.vent-profil-zone'), (p) => p.evaluate(() => { const zones = document.querySelectorAll('.vent-profil-zone'); zones[Math.min(7, zones.length - 1)].dispatchEvent(new MouseEvent('click', { bubbles: true })); }), (p) => p.waitForTimeout(1500), defiler('.vent-profil-grille')] },
  // Pastilles météo : le radar reste panneau Météo fermé ; le vent, panneau Carte ouvert par-dessus (téléphone)
  { nom: 'meteo-radar-pastille', actions: [module('radar'), (p) => p.waitForTimeout(1500), clic('#outil-rapide-panneau-meteo .outil-rapide-fermer')] },
  { nom: 'meteo-vent-pastille', actions: [module('vent'), (p) => p.waitForTimeout(1500), module('relief')] },
  // Appui sur la pastille du vent : le panneau Carte se ferme, celui du vent revient
  {
    nom: 'meteo-vent-pastille-ouvre',
    actions: [module('vent'), (p) => p.waitForTimeout(1500), module('relief'), clic('.couche-pastille:not([hidden]) .couche-pastille-corps')],
  },
  { nom: 'carte-fond', actions: [module('fond')] },
  { nom: 'carte-fond-avance', actions: [module('fond'), ouvrirAvance('elements')] },
  { nom: 'carte-fond-avance-fonds', actions: [module('fond'), ongletFond('ici')] },
  // Fonds topo (lot 3.10) : onglets Pays et Anciennes, cartes nationales, calques officiels
  { nom: 'carte-fond-pays', actions: [vue(ZERMATT), module('fond'), ongletFond('pays')] },
  { nom: 'carte-fond-anciennes', actions: [module('fond'), ongletFond('anciennes')] },
  { nom: 'carte-fond-ici-suisse', actions: [vue(ZERMATT), module('fond'), ongletFond('ici')] },
  // Bâtiments, eaux et voies ferrées : sans pastille sur le fond Montis, avec sur les autres, rallumés en revenant au fond Montis
  { nom: 'carte-fond-elements-onglet', actions: [...elementsCarte, clic('.elements-onglets button:nth-child(3)')] },
  { nom: 'carte-fond-elements-autre', actions: [module('fond'), choisirFond('osm'), fermerCarte, (p) => p.waitForTimeout(2500)] },
  { nom: 'carte-fond-elements-retour', actions: [...elementsCarte, (p) => p.evaluate(() => { for (const l of document.querySelectorAll('.option-case')) if (/Bâtiments/.test(l.textContent)) { const c = l.querySelector('input'); if (c.checked) c.click(); } }), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), module('fond'), choisirFond('osm'), choisirFond('montis'), fermerCarte, (p) => p.waitForTimeout(2500)] },
  { nom: 'carte-fond-swisstopo', actions: [vue(ZERMATT), module('fond'), choisirFond('swisstopo'), fermerCarte, (p) => p.waitForTimeout(4000)] },
  // Une carte nationale s'arrête à la frontière : le fond Montis complète (France à gauche, Suisse à droite)
  { nom: 'carte-fond-frontiere', actions: [vue({ center: [6.98, 46.03], zoom: 11.3, bearing: 0, pitch: 0 }), module('fond'), choisirFond('swisstopo'), fermerCarte, (p) => p.waitForTimeout(5000)] },
  { nom: 'carte-fond-hors-zone', actions: [vue(AIGUILLES), module('fond'), choisirFond('swisstopo'), ongletFond('pays')] },
  {
    nom: 'carte-fond-calques',
    actions: [vue(ZERMATT), module('fond'), ongletFond('ici'), cocherCalque('ch-ski-rando'), cocherCalque('ch-pentes'), (p) => p.waitForTimeout(800), defiler('.fond-calques')],
  },
  { nom: 'carte-fond-calques-ferme', actions: [vue(ZERMATT), module('fond'), ongletFond('ici'), cocherCalque('ch-ski-rando'), cocherCalque('ch-pentes'), fermerCarte, (p) => p.waitForTimeout(4000)] },
  { nom: 'carte-fond-ign-pentes', actions: [vue(AIGUILLES), module('fond'), choisirFond('ign-plan'), ongletFond('ici'), cocherCalque('ign-pentes'), fermerCarte, (p) => p.waitForTimeout(4000)] },
  { nom: 'carte-fond-cassini', actions: [vue({ center: [5.72, 45.19], zoom: 11, bearing: 0, pitch: 0 }), module('fond'), ongletFond('anciennes'), choisirFond('cassini'), fermerCarte, (p) => p.waitForTimeout(4000)] },
  { nom: 'carte-fond-usgs', actions: [vue({ center: [-121.76, 46.85], zoom: 12, bearing: 0, pitch: 0 }), module('fond'), choisirFond('usgs-topo'), fermerCarte, (p) => p.waitForTimeout(4000)] },
  { nom: 'carte-fond-3d', actions: [vue(ZERMATT), module('fond'), choisirFond('swisstopo'), fermerCarte, clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ ...ZERMATT, zoom: 12.5, pitch: 60, bearing: 220 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'carte-relief', actions: [module('relief')] },
  { nom: 'carte-pentes', actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), (p) => p.waitForTimeout(3000)] },
  { nom: 'carte-orientation', actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="orientation"]'), (p) => p.waitForTimeout(3000)] },
  {
    nom: 'carte-pentes-3d',
    actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('.relief-bascule [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200), vue({ ...AIGUILLES, pitch: 60, bearing: 30 }), (p) => p.waitForTimeout(4000)],
  },
  { nom: 'carte-pentes-loin', actions: [vue({ ...AIGUILLES, zoom: 10 }), module('relief'), clic('.pentes-choix [data-genre="pentes"]')] },
  // Panneau fermé : la pastille de la carte dit pourquoi rien n'apparaît
  {
    nom: 'carte-pentes-loin-ferme',
    actions: [vue({ ...AIGUILLES, zoom: 10 }), module('relief'), clic('.pentes-choix [data-genre="orientation"]'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer')],
  },
  // La pastille ramène au zoom où la couche apparaît
  {
    nom: 'carte-pentes-rapprocher',
    actions: [vue({ ...AIGUILLES, zoom: 10 }), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), clic('.couche-pastille:not([hidden]) .couche-pastille-action'), (p) => p.waitForTimeout(4000)],
  },
  // Globe jour et nuit au dézoom (images de la NASA, soleil de l'instant), puis le fondu vers la carte
  { nom: 'globe-nuit', actions: [vue({ center: [15, 25], zoom: 1.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(6000)] },
  // Centré sur la ligne jour-nuit du soir, quelle que soit l'heure de la capture (soleil : 15° par heure)
  { nom: 'globe-nuit-terminateur', actions: [(p) => vue({ center: [(((180 - (Date.now() / 3600000 % 24) * 15 - 75) % 360) + 540) % 360 - 180, 20], zoom: 1.6, bearing: 0, pitch: 0 })(p), (p) => p.waitForTimeout(6000)] },
  // Pôle Sud, vu d'en haut en 2D, puis incliné en 3D (le globe ne va que jusqu'à 85° de latitude)
  { nom: 'globe-pole-2d', actions: [vue({ center: [60, -78], zoom: 2.6, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(6000)] },
  { nom: 'globe-pole-3d', actions: [clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [60, -80], zoom: 3, bearing: 0, pitch: 55 }), (p) => p.waitForTimeout(6000)] },
  // Tout près du pôle Sud en 3D, rasant (comme la capture du propriétaire) : l'ombrage fixe s'y efface
  { nom: 'globe-pole-proche', actions: [clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1200), vue({ center: [-60, -83.5], zoom: 5.5, bearing: 90, pitch: 75 }), (p) => p.waitForTimeout(7000)] },
  // Ciel : la Terre cadrée pour que la Lune apparaisse près de son bord (vue d'un point d'où la Lune est 14° au-dessus du nadir)
  {
    nom: 'globe-ciel-lune',
    actions: [
      async (page) => {
        const maintenant = new Date();
        let meilleur = null;
        for (let lat = -70; lat <= 70; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            const ecart = Math.abs(getMoonPosition(maintenant, lat, lng).altitude + 76);
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng };
          }
        }
        await vue({ center: [meilleur.lng, meilleur.lat], zoom: 1.6, bearing: 0, pitch: 0 })(page);
      },
      (p) => p.waitForTimeout(6000),
    ],
  },
  // Voie lactée : le centre galactique (Sagittaire A*) au nadir, derrière la Terre, quelle que soit l'heure
  {
    nom: 'globe-voie-lactee',
    actions: [
      (p) => {
        const ts = tempsSideral(new Date());
        return vue({ center: [((((266.4 + 180 - ts) % 360) + 540) % 360) - 180, 28.9], zoom: 1.2, bearing: 0, pitch: 0 })(p);
      },
      (p) => p.waitForTimeout(3000),
      (p) => attendreSur(p, () => document.querySelector('.ciel-etoiles')?.dataset.voieLactee === 'prete', null, 60000).then(() => p.waitForTimeout(2500)),
    ],
  },
  // Galaxies voisines : vues d'un point d'où elles sont près du nadir (latitude du centre limitée à ±50° à ce zoom),
  // carte tournée et inclinée en 3D pour les mettre au-dessus de la Terre (écran étroit sur téléphone)
  // globe-andromede-bulle : la galaxie touchée, avec sa bulle d'informations
  ...[['globe-andromede', 10.68, 41.27], ['globe-magellan', 80.89, -69.76], ['globe-andromede-bulle', 10.68, 41.27, 'm31']].map(([nom, ra, dec, toucher]) => ({
    nom,
    actions: [
      clic('#bascule-mode [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200),
      (p) => {
        const ts = tempsSideral(new Date());
        let meilleur = null;
        for (let lat = -50; lat <= 50; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            const direction = directionEtoile(ra, dec, lat, lng, ts);
            const ecart = Math.abs(direction.hauteur + 72);
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng, ...direction };
          }
        }
        // Caméra inclinée vers la galaxie : elle passe à 11° au-dessus du centre de l'écran, hors de la Terre
        return vue({ center: [meilleur.lng, meilleur.lat], zoom: 1.2, bearing: meilleur.azimut, pitch: Math.max(0, 90 + meilleur.hauteur - 11) })(p);
      },
      (p) => p.waitForTimeout(3000),
      (p) => attendreSur(p, () => document.querySelector('.ciel-etoiles')?.dataset.voieLactee === 'prete', null, 60000).then(() => p.waitForTimeout(2500)),
      async (page) => {
        if (!toucher) return;
        const point = await page.evaluate((id) => {
          const l = window.innerWidth;
          const h = window.innerHeight;
          for (let y = 80; y < h - 40; y += 8) {
            for (let x = 8; x < l - 8; x += 8) if (window.cielMontis?.galaxieEn(x, y, 0) === id) return { x, y };
          }
          return null;
        }, toucher);
        if (point) await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(1000);
      },
    ],
  })),
  { nom: 'globe-nuit-fondu', actions: [vue({ center: [6.5, 45.5], zoom: 7.3, bearing: 0, pitch: 0 }), (p) => p.waitForTimeout(6000)] },
  // Pastilles des couches allumées depuis Carte, panneau fermé
  {
    nom: 'carte-pastilles',
    actions: [
      vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="orientation"]'), ...elementsCarte,
      (p) => p.evaluate(() => [...document.querySelectorAll('#outil-rapide-panneau-carte .option-case input')].filter((c) => c.offsetParent !== null).forEach((c, i) => { if (i < 3 && !c.checked) c.click(); })),
      clic('#outil-rapide-panneau-carte .outil-rapide-fermer'),
    ],
  },
  // Pastille d'une rubrique (deux couches ou plus) : un appui ouvre la rubrique
  {
    nom: 'carte-pastilles-rubrique',
    actions: [
      vue(AIGUILLES), ...elementsCarte,
      (p) => p.evaluate(() => [...document.querySelectorAll('#outil-rapide-panneau-carte .option-case input')].filter((c) => c.offsetParent !== null).forEach((c, i) => { if (i < 3 && !c.checked) c.click(); })),
      clic('#outil-rapide-panneau-carte .outil-rapide-fermer'),
      clic('.couche-pastille-rubrique:not([hidden]) .couche-pastille-corps'),
    ],
  },
  // Appui sur une pastille : le panneau Carte s'ouvre sur son réglage
  {
    nom: 'carte-pastille-ouvre',
    actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), clic('.couche-pastille:not([hidden]) .couche-pastille-corps')],
  },
  // Panneau réduit en barre pour voir la carte, puis rouvert là où on l'avait laissé
  {
    nom: 'carte-reduit',
    actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('#outil-rapide-panneau-carte .outil-rapide-reduire'), (p) => p.waitForTimeout(2500)],
  },
  {
    nom: 'carte-rouvert',
    actions: [vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="pentes"]'), clic('#outil-rapide-panneau-carte .outil-rapide-reduire'), clic('#outil-rapide-panneau-carte .outil-rapide-entete')],
  },
  // Géologie (Carte › Nature et sous-sol) : carte du BRGM superposée, pastille, hors de France
  { nom: 'carte-geologie', actions: [vue(ANNECY), module('nature'), clic('.geologie-choix button'), (p) => p.waitForTimeout(5000)] },
  { nom: 'carte-geologie-legende', actions: [vue(ANNECY), module('nature'), clic('.geologie-choix button'), (p) => p.waitForTimeout(3000), clic('[data-famille="calcaires"] button'), defiler('.geologie-vues')] },
  { nom: 'carte-geologie-detaillee', actions: [vue(ANNECY), module('nature'), clic('.geologie-choix button'), clic('.geologie-vues [data-vue="detaillee"]'), (p) => p.waitForTimeout(5000)] },
  // Frontières des pays (Carte › Éléments de la carte › Lieux), sur la géologie près de Genève
  {
    nom: 'carte-frontieres',
    actions: [vue({ center: [6.1, 46.2], zoom: 9.5, bearing: 0, pitch: 0 }), module('nature'), clic('.geologie-choix button'), ...elementsCarte,
      (p) => p.evaluate(() => {
        const case_ = [...document.querySelectorAll('.option-case')].find((l) => /Frontières|borders/i.test(l.textContent))?.querySelector('input');
        if (case_ && !case_.checked) case_.click();
      }), (p) => p.waitForTimeout(4000)],
  },
  // Voies ferrées et gares (Carte › Éléments de la carte › Construit), en gare de Chamonix ; puis sur le satellite
  {
    nom: 'carte-gares',
    actions: [vue({ center: [6.871, 45.924], zoom: 14, bearing: 0, pitch: 0 }), ...elementsCarte, clicVisible('.elements-onglets button:last-child'),
      (p) => p.evaluate(() => {
        const case_ = [...document.querySelectorAll('.option-case')].find((l) => /Gares|Stations/i.test(l.textContent))?.querySelector('input');
        if (case_ && !case_.checked) case_.click();
      }), (p) => p.waitForTimeout(4000)],
  },
  {
    nom: 'carte-gares-satellite',
    actions: [vue({ center: [6.871, 45.924], zoom: 14, bearing: 0, pitch: 0 }), ...elementsCarte, clicVisible('.elements-onglets button:last-child'),
      (p) => p.evaluate(() => {
        const case_ = [...document.querySelectorAll('.option-case')].find((l) => /Gares|Stations/i.test(l.textContent))?.querySelector('input');
        if (case_ && !case_.checked) case_.click();
      }), module('fond'), choisirFond('esri-sat'), fermerCarte, (p) => p.waitForTimeout(5000)],
  },
  // Vue détaillée : un appui sur la carte ouvre la bulle « sous ton doigt »
  {
    nom: 'carte-geologie-bulle',
    actions: [vue(MATIN), module('nature'), clic('.geologie-choix button'), clic('.geologie-vues [data-vue="detaillee"]'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'),
      (p) => p.waitForTimeout(3000), async (p) => { const { width, height } = p.viewportSize(); await p.mouse.click(Math.round(width * 0.5), Math.round(height * 0.55)); }, (p) => p.waitForTimeout(4000)],
  },
  { nom: 'carte-geologie-ferme', actions: [vue(MATIN), module('nature'), clic('.geologie-choix button'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), (p) => p.waitForTimeout(5000)] },
  {
    nom: 'carte-geologie-3d',
    actions: [vue(MATIN), module('nature'), clic('.geologie-choix button'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), clic('#bascule-mode [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200), vue({ ...AIGUILLES, pitch: 60, bearing: 160 }), (p) => p.waitForTimeout(5000)],
  },
  { nom: 'carte-geologie-suisse', actions: [vue({ center: [7.75, 46.02], zoom: 11, bearing: 0, pitch: 0 }), module('nature'), clic('.geologie-choix button'), (p) => p.waitForTimeout(5000)] },
  // Activité en cours, menu fermé : sa pastille avec les couches
  { nom: 'pastille-activite', actions: [vue(ANNECY), module('parapente'), (p) => p.waitForTimeout(3000), clic('#menu-fermer'), ...elementsCarte, (p) => p.evaluate(() => { const c = [...document.querySelectorAll('.option-case')].find((l) => /Sommets|Peaks/i.test(l.textContent))?.querySelector('input'); if (c && !c.checked) c.click(); }), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), (p) => p.waitForTimeout(2000)] },
  // Ombre du soleil à une heure choisie (curseur), ombre portée comprise
  { nom: 'ciel-ombres', actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(9 * 60), (p) => p.waitForTimeout(5000), defiler('.relief-ombres')] },
  {
    nom: 'ciel-ombres-3d',
    actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(16 * 60), clic('.relief-bascule [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200), vue({ ...MATIN, pitch: 60, bearing: 200 }), (p) => p.waitForTimeout(5000)],
  },
  // Le soleil dans le ciel en 3D, en fin d'après-midi, face à lui
  {
    nom: 'ciel-ombres-3d-soleil',
    actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(16 * 60 + 30), clic('.relief-bascule [data-mode="3d"]'),
      clic('#outil-rapide-panneau-ciel .outil-rapide-fermer'),
      (p) => p.waitForTimeout(1200), vue({ center: [6.86, 45.9], zoom: 12.6, pitch: 82, bearing: 238 }), (p) => p.waitForTimeout(5000)],
  },
  { nom: 'ciel-ombres-ferme', actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(9 * 60), clic('#outil-rapide-panneau-ciel .outil-rapide-fermer'), (p) => p.waitForTimeout(5000)] },
  // Un jour choisi au calendrier (appui sur le nom du jour)
  {
    nom: 'ciel-ombres-jour',
    actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(12 * 60),
      (p) => p.evaluate(() => {
        const champ = document.querySelector('.ombres-calendrier');
        champ.value = '2027-02-15';
        champ.dispatchEvent(new Event('change', { bubbles: true }));
      }), (p) => p.waitForTimeout(5000), defiler('.relief-ombres')],
  },
  { nom: 'ciel-ombres-nuit', actions: [vue(MATIN), module('ombres'), clic('.relief-ombres .astre-option'), heureOmbres(23 * 60), (p) => p.waitForTimeout(1500), defiler('.relief-ombres')] },
  // Rubrique Soleil et Lune (lot 4.7) : frise commune (course du soleil et de la Lune), lignes Soleil et Lune
  { nom: 'ciel', actions: [vue(MATIN), clic('#outil-rapide-bouton-ciel'), attendre('.ciel-course'), heureOmbres(11 * 60), (p) => p.waitForTimeout(1500)] },
  // Lieu choisi par la recherche : la carte y va, les heures passent au fuseau du lieu
  {
    nom: 'ciel-lieu',
    actions: [vue(MATIN), clic('#outil-rapide-bouton-ciel'), attendre('.ciel-lieu-bouton'), (p) => p.waitForTimeout(800), clic('.ciel-lieu-bouton'),
      async (page) => {
        await page.fill('.ciel-lieu-champ', 'Tokyo');
        await page.waitForSelector('.ciel-lieu-liste .rando-item', { timeout: 15000 }).catch(() => {});
      },
      clic('.ciel-lieu-liste .rando-item'), (p) => p.waitForTimeout(5000)],
  },
  { nom: 'ciel-soleil', actions: [vue(MATIN), module('ombres'), heureOmbres(11 * 60), (p) => p.waitForTimeout(1000), defiler('.ciel-position-soleil')] },
  { nom: 'ciel-lune', actions: [vue(MATIN), module('lune'), attendre('.lunaison-phase'), heureOmbres(11 * 60), JOUR_LUNE, (p) => p.waitForTimeout(800), defiler('.lune-carte')] },
  // Appui sur la pleine lune du cycle : la frise passe à ce jour, quand la Lune est au plus haut
  { nom: 'ciel-pleine-lune', actions: [vue(MATIN), module('lune'), attendre('.lunaison-phase'), JOUR_LUNE, (p) => p.waitForTimeout(800), clic('.lunaison-phase:nth-child(3)'), (p) => p.waitForTimeout(1000)] },
  // Flèche › : le jour suivant, entre deux phases
  { nom: 'ciel-lune-jour', actions: [vue(MATIN), module('lune'), attendre('.lunaison-phase'), heureOmbres(11 * 60), JOUR_LUNE, (p) => p.waitForTimeout(800), clic('.lunaison-pas[data-pas="1"]'), (p) => p.waitForTimeout(800), defiler('.lunaison')] },
  // « Au sol » : vue au sol au lieu de Soleil et Lune, trajectoires du jour, vrai lever derrière le relief
  // (demande du propriétaire du 24 novembre 2026). Près d'Embrun : la crête cache le soleil jusqu'à 8h48
  { nom: 'ciel-sol', lien: VUE_EMBRUN, actions: [...ouvrirCielSol(11 * 60)] },
  { nom: 'ciel-sol-nuit', lien: VUE_EMBRUN, actions: [...ouvrirCielSol(18 * 60 + 50)] },
  // Le titre du panneau déplie le reste de Soleil et Lune
  { nom: 'ciel-sol-deplie', lien: VUE_EMBRUN, actions: [...ouvrirCielSol(11 * 60), clic('#outil-rapide-panneau-ciel .outil-rapide-titre'), (p) => p.waitForTimeout(800)] },
  // « Voir dans le ciel » sans l'ombre, vue 3D telle qu'elle est : la Lune basse au sud-ouest et sa trajectoire du
  // jour (16 novembre 2026, 22 h 40 ; trajectoires ajoutées le 24 novembre 2026)
  {
    nom: 'ciel-lune-3d',
    actions: [vue(MATIN), clic('.relief-bascule [data-mode="3d"]'), clic('#outil-rapide-bouton-ciel'), attendre('.ciel-course'), heureOmbres(22 * 60 + 40), JOUR_LUNE,
      clic('.ciel-bouton-ciel'), clic('#outil-rapide-panneau-ciel .outil-rapide-fermer'),
      (p) => p.waitForTimeout(1200), vue({ center: [6.86, 45.9], zoom: 12.6, pitch: 82, bearing: 233 }), (p) => p.waitForTimeout(5000)],
  },
  // Même option au dézoom (zoom 7, globe) : le ciel 3D prend le relais du ciel du globe
  {
    nom: 'ciel-lune-3d-dezoom',
    actions: [vue(MATIN), clic('.relief-bascule [data-mode="3d"]'), clic('#outil-rapide-bouton-ciel'), attendre('.ciel-course'), heureOmbres(22 * 60 + 40), JOUR_LUNE,
      clic('.ciel-bouton-ciel'), clic('#outil-rapide-panneau-ciel .outil-rapide-fermer'),
      (p) => p.waitForTimeout(1200), vue({ center: [6.86, 45.9], zoom: 7, pitch: 80, bearing: 233 }), (p) => p.waitForTimeout(5000)],
  },
  // Visiter la Lune (lot 4.10) : bouton en bas de la ligne Lune, globe lunaire, temps réel, gros plan 3D, fiche
  { nom: 'ciel-lune-visiter', actions: [vue(MATIN), module('lune'), attendre('.lune-visiter'), (p) => p.waitForTimeout(800), defiler('.lune-visiter')] },
  { nom: 'lune-visite', actions: [...ALLER_LUNE, (p) => p.waitForTimeout(8000)] },
  { nom: 'lune-visite-terre-vue', actions: [...ALLER_LUNE, clic('[data-vue="terre"]'), (p) => p.waitForTimeout(8000)] },
  { nom: 'lune-visite-terre-vue-reduit', actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), clic('[data-vue="terre"]'), (p) => p.waitForTimeout(8000)] },
  { nom: 'lune-visite-reel', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), (p) => p.waitForTimeout(8000)] },
  // La Terre vue de la Lune à demi éclairée (frise avancée d'une semaine) : l'océan éclairé se distingue de la nuit
  { nom: 'lune-visite-terre-phase', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), clic('[data-vue="terre"]'), (p) => p.waitForTimeout(5000),
    ...Array.from({ length: 7 }, () => clic('.lune-visite-frise .ombres-jour-bouton[data-pas="1"]')), (p) => p.waitForTimeout(4000),
    async (page) => {
      const point = await page.evaluate(() => window.mapLune?.project?.([0, 0]));
      if (point) console.log('TERRE', JSON.stringify(point));
    }] },
  { nom: 'lune-visite-reduit', actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), (p) => p.waitForTimeout(6000)] },
  // Copernic en 3D, incliné, panneau réduit
  {
    nom: 'lune-visite-copernic',
    actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), vueLune({ center: [-20.08, 8.2], zoom: 6.2, pitch: 62, bearing: 0 }), (p) => p.waitForTimeout(12000)],
  },
  // Mer de la Tranquillité et Apollo 11, puis la fiche du site
  {
    nom: 'lune-visite-fiche',
    actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), vueLune({ center: [23.47, 0.67], zoom: 4.2, pitch: 0, bearing: 0 }), (p) => p.waitForTimeout(8000), clicLune([23.473, 0.674]), (p) => p.waitForTimeout(1500)],
  },
  // Pôle nord, incliné : ni rayons ni pixels (fondu vers les calottes)
  { nom: 'lune-visite-pole', actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), vueLune({ center: [0, 80], zoom: 2.4, pitch: 30, bearing: 0 }), (p) => p.waitForTimeout(9000)] },
  // La Terre dans le ciel lunaire, au-dessus de l'horizon sud, vue depuis la mer du Froid
  { nom: 'lune-visite-terre', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), clic('.lune-visite-panneau .bf-reduire'), vueLune({ center: [0, 62], zoom: 5, pitch: 78, bearing: 180 }), (p) => p.waitForTimeout(9000)] },
  // Appui sur la Terre (ou sa flèche) : près du bord de la face visible, tourné vers elle, elle se lève sur l'horizon
  // Vue depuis la Terre (nord en haut) : la Terre est derrière, sa flèche le dit ; un appui la fait apparaître
  { nom: 'lune-visite-fleche-terre', actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), clic('[data-vue="lune"]'), (p) => p.waitForTimeout(8000)] },
  { nom: 'lune-visite-fleche-terre-appui', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), clic('.lune-visite-panneau .bf-reduire'), clic('[data-vue="lune"]'), (p) => p.waitForTimeout(3000), clic('.terre-ciel-image'), (p) => p.waitForTimeout(9000)] },
  // Terre visible dans le ciel, touchée : bulle « Retourner sur la Terre »
  { nom: 'lune-visite-retour-terre', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), clic('.lune-visite-panneau .bf-reduire'), (p) => p.waitForTimeout(3000), toucherTerre, (p) => p.waitForTimeout(800)] },
  // Terre hors champ : au bord, avec sa flèche
  { nom: 'lune-visite-terre-bord', actions: [...ALLER_LUNE, clic('.lune-visite-panneau .bf-reduire'), vueLune({ center: [0, 40], zoom: 5, pitch: 70, bearing: 0 }), (p) => p.waitForTimeout(8000)] },
  { nom: 'lune-visite-vue-terre', actions: [...ALLER_LUNE, clic('[data-eclairage="reel"]'), vueLune({ center: [120, -30], zoom: 3, pitch: 40, bearing: 70 }), (p) => p.waitForTimeout(1500), clic('[data-vue="lune"]'), (p) => p.waitForTimeout(8000)] },
  {
    nom: 'lune-visite-recherche',
    actions: [...ALLER_LUNE, async (page) => { await page.fill('.lune-recherche-champ', 'tran'); }, (p) => p.waitForTimeout(1500)],
  },
  { nom: 'lune-visite-sites', actions: [...ALLER_LUNE, clic('.lune-recherche-sites'), (p) => p.waitForTimeout(1500)] },
  {
    nom: 'lune-visite-recherche-tycho',
    actions: [...ALLER_LUNE, async (page) => { await page.fill('.lune-recherche-champ', 'tycho'); }, (p) => p.waitForTimeout(800), clic('.lune-recherche-item'), (p) => p.waitForTimeout(9000)],
  },
  // Le soleil du ciel touché au dézoom : bulle Informations seule
  {
    nom: 'globe-soleil-bulle',
    actions: [
      async (page) => {
        const maintenant = new Date();
        let meilleur = null;
        for (let lat = -70; lat <= 70; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            const soleil = getPosition(maintenant, lat, lng);
            const ecart = Math.abs(soleil.altitude + 76) + Math.min(Math.abs(soleil.azimuth % 180), 180 - Math.abs(soleil.azimuth % 180)) / 4;
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng };
          }
        }
        await vue({ center: [meilleur.lng, meilleur.lat], zoom: 0.8, bearing: 0, pitch: 0 })(page);
      },
      (p) => p.waitForTimeout(4000),
      async (page) => {
        const point = await page.evaluate(() => window.cielMontis?.pointSoleil());
        if (point) await page.mouse.click(point.x, point.y);
      },
      (p) => p.waitForTimeout(1000),
    ],
  },
  // Mode frise en vue d'espace : soleil touché, « Informations », puis frise ramenée six heures plus tôt ; la Terre
  // a tourné sous le soleil, resté à sa place
  {
    nom: 'globe-soleil-frise',
    actions: [
      async (page) => {
        const maintenant = new Date();
        let meilleur = null;
        for (let lat = -70; lat <= 70; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            const soleil = getPosition(maintenant, lat, lng);
            const ecart = Math.abs(soleil.altitude + 76) + Math.min(Math.abs(soleil.azimuth % 180), 180 - Math.abs(soleil.azimuth % 180)) / 4;
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng };
          }
        }
        await vue({ center: [meilleur.lng, meilleur.lat], zoom: 0.8, bearing: 0, pitch: 0 })(page);
      },
      (p) => p.waitForTimeout(4000),
      async (page) => {
        const point = await page.evaluate(() => window.cielMontis?.pointSoleil());
        if (point) await page.mouse.click(point.x, point.y);
      },
      (p) => p.waitForTimeout(800),
      clic('.lune-bulle [data-action="infos"]'),
      (p) => p.waitForSelector('.ombres-curseur', { state: 'attached', timeout: 15000 }),
      (p) => p.waitForTimeout(1000),
      (p) => p.evaluate(async () => {
        const curseur = document.querySelector('.ombres-curseur');
        const depart = Number(curseur.value);
        for (let pas = 1; pas <= 24; pas += 1) {
          curseur.value = String((depart - pas * 15 + 1440) % 1440);
          curseur.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((r) => setTimeout(r, 50));
        }
      }),
      (p) => p.waitForTimeout(5000),
    ],
  },
  // La Lune du ciel touchée au dézoom : bulle Informations ou Visiter la Lune
  {
    nom: 'globe-lune-bulle',
    actions: [
      async (page) => {
        const maintenant = new Date();
        let meilleur = null;
        for (let lat = -70; lat <= 70; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            // 14° du nadir, au nord ou au sud : sur l'écran étroit d'un téléphone, la Lune reste visible au-dessus ou au-dessous de la Terre
            const lune = getMoonPosition(maintenant, lat, lng);
            const ecart = Math.abs(lune.altitude + 76) + Math.min(Math.abs(lune.azimuth % 180), 180 - Math.abs(lune.azimuth % 180)) / 4;
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng };
          }
        }
        await vue({ center: [meilleur.lng, meilleur.lat], zoom: 0.8, bearing: 0, pitch: 0 })(page);
      },
      (p) => p.waitForTimeout(4000),
      async (page) => {
        const point = await page.evaluate(() => window.cielMontis?.pointLune());
        if (point) await page.mouse.click(point.x, point.y);
      },
      (p) => p.waitForTimeout(1000),
    ],
  },
  // Lune touchée au dézoom, puis « Informations » : frise de la Lune seule
  {
    nom: 'globe-lune-frise',
    actions: [
      async (page) => {
        const maintenant = new Date();
        let meilleur = null;
        for (let lat = -70; lat <= 70; lat += 2) {
          for (let lng = -180; lng < 180; lng += 3) {
            // 14° du nadir, au nord ou au sud : sur l'écran étroit d'un téléphone, la Lune reste visible au-dessus ou au-dessous de la Terre
            const lune = getMoonPosition(maintenant, lat, lng);
            const ecart = Math.abs(lune.altitude + 76) + Math.min(Math.abs(lune.azimuth % 180), 180 - Math.abs(lune.azimuth % 180)) / 4;
            if (!meilleur || ecart < meilleur.ecart) meilleur = { ecart, lat, lng };
          }
        }
        await vue({ center: [meilleur.lng, meilleur.lat], zoom: 0.8, bearing: 0, pitch: 0 })(page);
      },
      (p) => p.waitForTimeout(4000),
      async (page) => {
        const point = await page.evaluate(() => window.cielMontis?.pointLune());
        if (point) await page.mouse.click(point.x, point.y);
      },
      (p) => p.waitForTimeout(800),
      clic('.lune-bulle [data-action="infos"]'),
      (p) => p.waitForSelector('.ombres-curseur', { state: 'attached', timeout: 15000 }),
      (p) => p.waitForTimeout(2500),
    ],
  },
  { nom: 'meteo-reduit', actions: [module('radar'), clic('#outil-rapide-panneau-meteo .outil-rapide-reduire')] },
  { nom: 'carte-elements', actions: elementsCarte },
  { nom: 'carte-hors-ligne', actions: [module('hors-ligne')] },
  // Fiche d'un point quelconque, ouverte par appui long
  { nom: 'point', simuler: true, actions: [appuiLong(0.5, 0.42)] },
  { nom: 'point-geologie', simuler: true, actions: [vue(MATIN), appuiLong(0.5, 0.42), (p) => p.waitForTimeout(3000), defiler('.point-prudence')] },
  { nom: 'point-frise', simuler: true, actions: [appuiLong(0.5, 0.42), defiler('.point-frise')] },
  // Partage par lien (lot 4.5) : boutons, lien copié, liens reçus
  { nom: 'partage-menu', actions: [clic('#menu-bouton'), defiler('.menu-partage'), clic('.menu-partage .menu-ligne')] },
  { nom: 'partage-point', simuler: true, actions: [appuiLong(0.5, 0.42), attendre('.point-partager'), defiler('.point-partager'), clic('.point-partager')] },
  { nom: 'partage-lien-point', simuler: true, lien: '#point=45.92/6.87&z=14', actions: [attendre('.point-partager')] },
  { nom: 'partage-lien-vue', lien: '#vue=13.5/45.9/6.88/40/60&3d=1', actions: [] },
  // Mode guidage (lot 3.14) sur le parcours partagé : sur la trace, puis loin d'elle et le chemin pour la rejoindre
  { nom: 'guidage', lien: `#${LIEN_PARCOURS}`, position: tracePartage[22], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), (p) => p.waitForTimeout(5000)] },
  { nom: 'guidage-loin', lien: `#${LIEN_PARCOURS}`, position: [tracePartage[22][0], tracePartage[22][1] - 0.004], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), (p) => p.waitForTimeout(5000)] },
  { nom: 'guidage-rejoindre', lien: `#${LIEN_PARCOURS}`, position: [tracePartage[22][0], tracePartage[22][1] - 0.004], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), attendre('.guidage-rejoindre:not([hidden])'), clic('.guidage-rejoindre-bouton'), (p) => p.waitForTimeout(6000)] },
  // Corrections du mode trajet (17 novembre 2026) : cône de la boussole, mode poche, trace enregistrée et résumé
  { nom: 'guidage-cone', lien: `#${LIEN_PARCOURS}`, position: tracePartage[22], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), (p) => p.waitForTimeout(3000), (p) => p.evaluate(() => { for (let i = 0; i < 20; i += 1) window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'), { alpha: 300, absolute: true })); }), (p) => p.waitForTimeout(2000)] },
  { nom: 'guidage-option', lien: `#${LIEN_PARCOURS}`, position: tracePartage[22], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), (p) => p.waitForTimeout(3000), clic('.guidage-option-trace'), (p) => p.waitForTimeout(1500)] },
  { nom: 'guidage-poche', lien: `#${LIEN_PARCOURS}`, position: tracePartage[22], actions: [attendre('.parcours-demarrer:not([hidden])'), clic('.parcours-demarrer'), (p) => p.waitForTimeout(3000), clic('.guidage-option-trace'), (p) => p.waitForTimeout(500), clic('.guidage-poche-bouton'), (p) => p.waitForTimeout(800)] },
  { nom: 'guidage-resume', lien: `#${LIEN_PARCOURS}`, position: tracePartage[22], actions: [attendre('.parcours-demarrer:not([hidden])'), (p) => p.evaluate(([lng, lat]) => { const t0 = Date.now() - 6000000; localStorage.setItem('montis.guidage-trace', JSON.stringify({ nom: 'Tour du lac · 17 nov.', debut: t0, segments: [[[t0, lng - 0.035, lat - 0.012, 1380], [t0 + 1800000, lng - 0.025, lat - 0.007, 1450], [t0 + 3600000, lng - 0.015, lat - 0.004, 1620]], [[t0 + 5400000, lng - 0.005, lat - 0.002, 1700], [t0 + 5900000, lng, lat, 1760]]] })); }, tracePartage[22]), clic('.parcours-demarrer'), attendre('.dialogue'), (p) => p.waitForTimeout(600), clic('.dialogue .para-bouton-principal'), (p) => p.waitForTimeout(2500), clic('.guidage-arreter'), attendre('.dialogue'), (p) => p.waitForTimeout(800)] },
  // Panorama des sommets (lot 4.1) : depuis le Brévent, face au Mont Blanc ; boussole et caméra simulées
  { nom: 'panorama', lien: VUE_BREVENT, position: BREVENT, actions: ouvrirPanorama },
  { nom: 'panorama-boussole', lien: VUE_BREVENT, position: BREVENT, actions: [...ouvrirPanorama, boussoleSimulee(150, 5), (p) => p.waitForTimeout(1500), glisserPanorama(-60, 0), (p) => p.waitForTimeout(2500)] },
  { nom: 'panorama-camera', lien: VUE_BREVENT, position: BREVENT, actions: [cameraSimulee, ...ouvrirPanorama, boussoleSimulee(150, 3), (p) => p.waitForTimeout(1000), clic('.pano-modes [data-mode="camera"]'), (p) => p.waitForTimeout(5000)] },
  // « Voir l'horizon d'ici » depuis la fiche d'un point (sans position : le point choisi)
  { nom: 'panorama-point', lien: VUE_BREVENT, simuler: true, actions: [appuiLong(0.5, 0.42), attendre('.point-horizon'), (p) => p.waitForTimeout(800), clicVisible('.point-horizon'), ...attendreHorizon()] },
  { nom: 'panorama-fiche', lien: VUE_BREVENT, position: BREVENT, actions: [...ouvrirPanorama, (p) => p.evaluate(() => { const nom = [...document.querySelectorAll('.pano-sommet:not([hidden])')].find((e) => e.textContent.includes('Midi')) ?? document.querySelector('.pano-sommet:not([hidden])'); const r = nom.getBoundingClientRect(); const o = { bubbles: true, pointerId: 1, clientX: r.left + 10, clientY: r.bottom - 10 }; nom.dispatchEvent(new PointerEvent('pointerdown', o)); nom.dispatchEvent(new PointerEvent('pointerup', o)); }), (p) => p.waitForTimeout(800)] },
  { nom: 'partage-lien-parcours', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])')] },
  { nom: 'partage-parcours-bouton', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])'), defiler('.parcours-pied'), clic('.parcours-partager')] },
  { nom: 'partage-lien-illisible', lien: '#parcours=1abcd', actions: [] },
  // Météo et Carte s'ouvrent par-dessus une activité sans l'arrêter
  // Plafonds des thermiques (lot 3.5) : grille de la vue, prévisions simulées
  { nom: 'parapente-plafonds', simuler: true, actions: [module('parapente'), attendre('[data-para-vue="plafonds"]'), clic('[data-para-vue="plafonds"]'), (p) => p.waitForTimeout(3000), async (page) => {
    // 14 h, aujourd'hui ou demain : l'heure des thermiques
    await page.evaluate(() => {
      const curseur = document.querySelector('.plafonds .vent-temps-curseur');
      const heure = new Date().getHours();
      curseur.value = String(heure < 13 ? 13 - heure : 37 - heure);
      curseur.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, (p) => p.waitForTimeout(2000)] },
  { nom: 'parapente-plafonds-europe', simuler: true, actions: [module('parapente'), attendre('[data-para-vue="plafonds"]'), clic('[data-para-vue="plafonds"]'), (p) => p.waitForTimeout(1500), vue({ center: [8, 46], zoom: 4.3 }), (p) => p.waitForTimeout(4000)] },
  { nom: 'parapente-plafonds-monde', simuler: true, actions: [module('parapente'), attendre('[data-para-vue="plafonds"]'), clic('[data-para-vue="plafonds"]'), (p) => p.waitForTimeout(1500), vue({ center: [10, 35], zoom: 1.6 }), (p) => p.waitForTimeout(5000)] },
  { nom: 'parapente-plafonds-relief', actions: [module('parapente'), attendre('[data-para-vue="plafonds"]'), clic('[data-para-vue="plafonds"]'), (p) => p.waitForTimeout(1500), vue({ center: [-106.5, 39.3], zoom: 8.5 }), (p) => p.waitForTimeout(8000)] },
  { nom: 'parapente-plafonds-relief-mer', actions: [module('parapente'), attendre('[data-para-vue="plafonds"]'), clic('[data-para-vue="plafonds"]'), (p) => p.waitForTimeout(1500), clic('.plafonds-reference [data-reference="mer"]'), vue({ center: [-106.5, 39.3], zoom: 8.5 }), (p) => p.waitForTimeout(8000)] },
  { nom: 'parapente-plafonds-menu', simuler: true, actions: [module('parapente'), attendre('[data-para-vue="plafonds"]')] },
  { nom: 'combine-portee-meteo', actions: [module('parapente'), clic('[data-para-vue="portee"]'), clic('#outil-rapide-bouton-meteo')] },
  // Préférences de routage (lot 3.0) : bouton filtre de l'éditeur, choix multiples
  { nom: 'parcours-preferences-rando', actions: [module('rando'), clic('.parcours-creer'), attendre('.parcours-bouton-preferences'), clicVisible('.parcours-bouton-preferences')] },
  { nom: 'parcours-preferences-velo', actions: [module('velo'), clic('.parcours-creer'), attendre('.parcours-bouton-preferences'), clicVisible('.parcours-bouton-preferences'), clicVisible('[data-preference="cyclables"]'), clicVisible('[data-preference="routes"]')] },
  // Lot 3.12 : « ? » de la barre, appui long, question en quittant un tracé neuf, « S'y rendre »
  { nom: 'parcours-aide', actions: [module('rando'), clic('.parcours-creer'), attendre('.parcours-bouton-aide'), clicVisible('.parcours-bouton-aide')] },
  { nom: 'parcours-appui-long', actions: [module('rando'), clic('.parcours-creer'), attendre('.parcours-bouton-aide'), (p) => p.waitForTimeout(800), appuiLongSur('[data-commande="libre"]')] },
  { nom: 'parcours-quitter', actions: [vue(PASSON), module('rando'), attendre('.parcours-creer'), (p) => p.waitForTimeout(800), clic('.parcours-creer'), (p) => p.waitForTimeout(2500), poserPoint([6.98215, 45.95351]), (p) => p.waitForTimeout(1500), poserPoint([6.97771, 45.96735]), (p) => p.waitForTimeout(6000), clicVisible('.bf-parcours .bf-fermer'), attendre('.dialogue')] },
  // Nom saisi puis effacé : le champ reste vide (il se remplissait en boucle) ; puis « Enregistrer » devient « Enregistré »
  { nom: 'parcours-nom-efface', actions: [vue(PASSON), module('rando'), attendre('.parcours-creer'), (p) => p.waitForTimeout(800), clic('.parcours-creer'), (p) => p.waitForTimeout(2500), poserPoint([6.98215, 45.95351]), (p) => p.waitForTimeout(1500), poserPoint([6.97771, 45.96735]), (p) => p.waitForTimeout(5000),
    async (p) => {
      const champ = p.locator('.parcours-nom input >> visible=true').first();
      await champ.click();
      await champ.press('Control+a');
      await champ.pressSequentially('Mon tour ');
      for (let i = 0; i < 12; i += 1) await champ.press('Backspace');
      console.log('NOM-VIDE', JSON.stringify(await champ.inputValue()));
      await champ.pressSequentially('Lac Cornu');
      console.log('NOM', JSON.stringify(await champ.inputValue()));
    }, clicVisible('.parcours-enregistrer'), (p) => p.waitForTimeout(800)] },
  { nom: 'parcours-lecture-trajet', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])'), (p) => p.waitForTimeout(2000), defiler('.parcours-trajet')] },
  { nom: 'parcours-lecture-exposition', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])'), (p) => p.waitForTimeout(2000), defiler('.parcours-exposition')] },
  { nom: 'parcours-exposition', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])'), (p) => p.waitForTimeout(2000), clicVisible('.parcours-exposition'), (p) => p.waitForTimeout(4000)] },
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
  // Ombre du soleil pendant une visite de station
  {
    nom: 'visite-ombres',
    actions: [
      module('ski'),
      async (page) => {
        await page.fill('.ski .rando-champ', 'Chamonix');
        await page.waitForTimeout(1500);
        await page.press('.ski .rando-champ', 'Enter');
        await page.waitForTimeout(6000);
      },
      clicVisible('.visite-option-ombres'),
      heureOmbres(10 * 60),
      (page) => page.waitForTimeout(5000),
    ],
  },
  // Visite d'un bike park sur la carte Montis (fonds Montis et Satellite, 24 novembre 2026)
  {
    nom: 'visite-bikepark',
    actions: [
      module('velo'),
      attendre('.parcours-park-recherche'),
      async (page) => {
        await page.fill('.parcours-park-recherche >> visible=true', 'Avoriaz');
        await page.waitForTimeout(1500);
        await page.press('.parcours-park-recherche >> visible=true', 'Enter');
        await page.waitForTimeout(8000);
      },
    ],
  },
  // Bulletin détaillé du massif dans l'onglet Sécurité d'une station en visite, puis ses pentes sur le décor
  ...['visite-bulletin', 'visite-bulletin-pentes'].map((nom) => ({
    nom,
    bulletin: true,
    actions: [
      module('ski'),
      async (page) => {
        await page.fill('.ski .rando-champ', 'Chamonix');
        await page.waitForTimeout(1500);
        await page.press('.ski .rando-champ', 'Enter');
        await page.waitForTimeout(6000);
      },
      // Sur téléphone, la fiche de la visite s'ouvre réduite
      async (page) => {
        await page.waitForTimeout(3000);
        if (await page.$('.fiche-reduite')) await page.click('.fiche-reduite .rando-fiche-reduire:not(.ski-fiche-chercher):not(.ski-fiche-favori)');
        await page.locator('.ski-onglets [role="tab"]').nth(2).click();
      },
      attendre('.ski-securite .skirando-bulletin-bouton'),
      clic('.ski-securite .skirando-bulletin-bouton'),
      (p) => p.waitForTimeout(4000),
      ...(nom === 'visite-bulletin'
        ? [defiler('.ski-securite .skirando-bulletin-bouton')]
        : [
          attendre('.ski-securite .bulletin-carte'),
          clic('.ski-securite .bulletin-carte'),
          clic('.rando-fiche-reduire:not(.ski-fiche-chercher):not(.ski-fiche-favori)'),
          (p) => p.waitForTimeout(6000),
        ]),
    ],
  })),
  // Mes traces : sorties importées (fichiers fabriqués, scripts/sorties-demo.mjs), vue d'une sortie, parcours
  { nom: 'traces-sorties-vide', actions: [module('sorties'), attendre('.traces input[type="file"]')] },
  { nom: 'traces-sorties', actions: [module('sorties'), importerSorties(['rando.gpx', 'velo.tcx', 'vol.igc'])] },
  { nom: 'traces-sortie', actions: [module('sorties'), importerSorties(['rando.gpx']), (p) => p.waitForTimeout(2000)] },
  { nom: 'traces-sortie-reduite', actions: [module('sorties'), importerSorties(['rando.gpx']), clicVisible('.bf-sortie .bf-reduire')] },
  { nom: 'traces-sortie-stats', actions: [module('sorties'), importerSorties(['rando.gpx']), defiler('.bf-sortie .traces-stats-sortie')] },
  { nom: 'traces-sortie-pente', actions: [module('sorties'), importerSorties(['rando.gpx']), clicVisible('.bf-sortie [data-mode="pente"]')] },
  { nom: 'traces-sortie-cardio', actions: [module('sorties'), importerSorties(['rando.gpx']), clicVisible('.bf-sortie [data-mode="cardio"]'), clicVisible('.bf-sortie .bf-reduire')] },
  { nom: 'traces-sortie-velo', actions: [module('sorties'), importerSorties(['velo.tcx']), defiler('.bf-sortie .traces-stats-sortie')] },
  { nom: 'traces-sortie-ski', actions: [module('sorties'), importerSorties(['ski.gpx']), defiler('.bf-sortie .traces-stats-sortie')] },
  { nom: 'traces-sortie-vol', actions: [module('sorties'), importerSorties(['vol.igc']), defiler('.bf-sortie .traces-stats-sortie')] },
  { nom: 'traces-sortie-3d', actions: [module('sorties'), importerSorties(['rando.gpx']), clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(3000)] },
  { nom: 'traces-frise', actions: [module('sorties'), importerSorties(['rando.gpx']), (p) => p.waitForTimeout(1500), toucherFriseSortie(0.42)] },
  { nom: 'traces-frise-reduite', actions: [module('sorties'), importerSorties(['rando.gpx']), (p) => p.waitForTimeout(1500), toucherFriseSortie(0.42), clicVisible('.bf-sortie .bf-reduire')] },
  { nom: 'traces-lecture', actions: [module('sorties'), importerSorties(['velo.tcx']), (p) => p.waitForTimeout(1500), clicVisible('.bf-sortie .traces-lire'), (p) => p.waitForTimeout(6000)] },
  { nom: 'traces-frise-vol', actions: [module('sorties'), importerSorties(['vol.igc']), (p) => p.waitForTimeout(1500), toucherFriseSortie(0.3)] },
  // Soleil et météo du jour de la sortie (archives d'Open-Meteo simulées)
  { nom: 'traces-contexte', simuler: true, actions: [module('sorties'), importerSorties(['rando.gpx']), clicVisible('.bf-sortie .traces-meteo-bouton'), (p) => p.waitForTimeout(2500), toucherFriseSortie(0.42), defiler('.bf-sortie .traces-frise')] },
  { nom: 'traces-ombre', simuler: true, actions: [module('sorties'), importerSorties(['rando.gpx']), (p) => p.waitForTimeout(1500), clicVisible('.bf-sortie .traces-ombre'), toucherFriseSortie(0.75), (p) => p.waitForTimeout(4000)] },
  { nom: 'traces-ombre-3d', simuler: true, actions: [module('sorties'), importerSorties(['rando.gpx']), clic('#bascule-mode [data-mode="3d"]'), (p) => p.waitForTimeout(1500), clicVisible('.bf-sortie .traces-ombre'), toucherFriseSortie(0.2), clicVisible('.bf-sortie .bf-reduire'), (p) => p.waitForTimeout(5000)] },
  { nom: 'traces-meteo', simuler: true, actions: [module('sorties'), importerSorties(['rando.gpx']), clicVisible('.bf-sortie .traces-meteo-bouton'), (p) => p.waitForTimeout(2500), defiler('.bf-sortie .traces-meteo')] },
  { nom: 'traces-exemple', actions: [module('sorties'), importerExemple, (p) => p.waitForTimeout(4000), toucherFriseSortie(0.5), defiler('.bf-sortie .traces-canaux')] },
  { nom: 'traces-parcours', actions: [parcoursEnregistre, module('parcours'), attendre('.traces-liste')] },
  // Jeux (lot P.4a) : les questions sont tirées au hasard, chaque série montre d'autres pays
  { nom: 'jeux', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), defiler('.menu-ligne[data-module="quiz-pays"]')] },
  { nom: 'jeux-options', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="capitales"]'), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-drapeaux', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="drapeau"]'), clic('[data-choix="niveau"] [data-valeur="choix"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-drapeaux-reponse', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="drapeau"]'), clic('[data-choix="niveau"] [data-valeur="choix"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix'), clic('.bf-jeu .jeux-choix button'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-trouve-drapeau', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="pays"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix-drapeaux'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-expert', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="drapeau"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.fill('.bf-jeu .jeux-saisie input', 'su'), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-capitales', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="pays"]'), clic('[data-choix="niveau"] [data-valeur="choix"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-capitales-reponse', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="choix"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix'), clic('.bf-jeu .jeux-choix button'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-ou-options', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="ville-pays"]'), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-ou-ville', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="ville-pays"]'), (p) => p.selectOption('.jeux-pays-villes', 'FR'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-ou-ville-reponse', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="ville-pays"]'), (p) => p.selectOption('.jeux-pays-villes', 'FR'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), (p) => p.waitForTimeout(3000), (p) => p.mouse.click(Math.round(p.viewportSize().width * 0.5), Math.round(p.viewportSize().height * 0.3)), (p) => p.waitForTimeout(2500)] },
  // Trois appuis au même endroit : réponses justes et ratées gardées sur le globe
  { nom: 'jeux-ou-ville-serie', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="ville-pays"]'), (p) => p.selectOption('.jeux-pays-villes', 'FR'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), ...[1, 2, 3].flatMap(() => [(p) => p.waitForTimeout(2500), (p) => p.mouse.click(Math.round(p.viewportSize().width * 0.5), Math.round(p.viewportSize().height * 0.3)), (p) => p.waitForTimeout(1500), (p) => p.waitForTimeout(2000)]), (p) => p.waitForTimeout(2500), (p) => p.mouse.click(Math.round(p.viewportSize().width * 0.45), Math.round(p.viewportSize().height * 0.25)), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-fiches-recherche', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), (p) => p.fill('.jeux-fiches-recherche input', 'gui'), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-ou-pays', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="pays"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), (p) => p.waitForTimeout(3000), (p) => p.mouse.click(Math.round(p.viewportSize().width * 0.5), Math.round(p.viewportSize().height * 0.3)), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-fiches', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), clic('[data-choix="zoneFiches"] [data-valeur="europe"]'), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-fiche', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), clic('[data-choix="zoneFiches"] [data-valeur="europe"]'), clic('.jeux-fiche-ligne[data-code="CH"]'), attendre('.bf-jeu .jeux-fiche'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-fiche-suivante', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), clic('[data-choix="zoneFiches"] [data-valeur="europe"]'), clic('.jeux-fiche-ligne[data-code="MC"]'), attendre('.bf-jeu .jeux-fiche'), clic('.bf-jeu .jeux-fiche-suivante'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-liste', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['France', 'Suisse', 'Italie', 'Norvège'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-resultat', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['France', 'Suisse', 'Italie', 'Espagne'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), clic('.bf-jeu .jeux-abandon'), (p) => p.waitForTimeout(3000)] },
  // Retouches du 17 novembre 2026 : liste compacte, fin de partie, revue des erreurs, clavier, fiches enrichies
  { nom: 'jeux-liste-deplie', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['France', 'Suisse', 'Italie', 'Norvège'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), clic('.bf-jeu .jeux-deplier'), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-liste-iles', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="monde"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['Fidji', 'Tonga', 'Samoa', 'Tuvalu', 'Nauru', 'Vanuatu', 'Kiribati'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), (p) => p.waitForTimeout(2500), (p) => p.evaluate(() => window.map.jumpTo({ center: [178, -12], zoom: 3.6 })), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-revue-liste', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['France', 'Suisse', 'Italie', 'Espagne'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), clic('.bf-jeu .jeux-abandon'), attendre('.bf-jeu .jeux-revoir'), clic('.bf-jeu .jeux-revoir'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-expert-clavier', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="drapeau"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.focus('.bf-jeu .jeux-saisie input'), (p) => p.fill('.bf-jeu .jeux-saisie input', 'ma'), clavierSimule, (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-capitales-expert', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-capitales-inconnue', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.fill('.bf-jeu .jeux-saisie input', 'Zorglub'), (p) => p.press('.bf-jeu .jeux-saisie input', 'Enter'), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-capitales-vide', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.press('.bf-jeu .jeux-saisie input', 'Enter'), (p) => p.waitForTimeout(2500)] },
  // Transition après une réponse (24 novembre 2026) : la carte au pays trouvé, en vert, ou hors de la zone, en rouge
  { nom: 'jeux-liste-transition', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.waitForTimeout(2500), (p) => p.fill('.bf-jeu .jeux-saisie input', 'Portugal'), milieuTransition('jeux-liste-transition')] },
  { nom: 'jeux-liste-hors-zone', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.waitForTimeout(2500), (p) => p.fill('.bf-jeu .jeux-saisie input', 'Japon'), (p) => p.press('.bf-jeu .jeux-saisie input', 'Enter'), milieuTransition('jeux-liste-hors-zone')] },
  { nom: 'jeux-liste-inconnu', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), (p) => p.fill('.bf-jeu .jeux-saisie input', 'Fraaance'), (p) => p.press('.bf-jeu .jeux-saisie input', 'Enter'), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-frontieres-proche', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="pays"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), (p) => p.waitForTimeout(2000), (p) => p.evaluate(() => window.map.jumpTo({ center: [7.6, 46.6], zoom: 6.8 })), (p) => p.waitForTimeout(4000)] },
  { nom: 'jeux-capitales-expert-reponse', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), clic('.bf-jeu .jeux-passer'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-liste-clavier', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), ...['France', 'Suisse'].map((nom) => (p) => p.fill('.bf-jeu .jeux-saisie input', nom)), (p) => p.focus('.bf-jeu .jeux-saisie input'), clavierSimule, (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-capitales-fin', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('[data-choix="longueur"] [data-valeur="courte"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), repondreTout('Vatican'), attendre('.bf-jeu .jeux-score'), (p) => p.waitForTimeout(2500)] },
  { nom: 'jeux-capitales-revue', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="capitales"]'), clic('[data-choix="sensCapitales"] [data-valeur="capitale"]'), clic('[data-choix="niveau"] [data-valeur="expert"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('[data-choix="longueur"] [data-valeur="courte"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-saisie input'), repondreTout('Vatican'), attendre('.bf-jeu .jeux-revoir'), clic('.bf-jeu .jeux-revoir'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-ou-revue', actions: [module('quiz-pays'), attendre('.jeux-pays-villes option'), clic('.jeux-carte[data-mode="ou"]'), clic('[data-choix="cible"] [data-valeur="pays"]'), clic('[data-choix="zone"] [data-valeur="europe"]'), clic('[data-choix="longueur"] [data-valeur="courte"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-ou-aide'), ...Array.from({ length: 10 }, () => [(p) => p.waitForTimeout(1800), (p) => p.mouse.click(Math.round(p.viewportSize().width * 0.5), Math.round(p.viewportSize().height * 0.3)), (p) => p.waitForTimeout(600), (p) => p.waitForTimeout(2000)]).flat(), attendre('.bf-jeu .jeux-score'), clic('.bf-jeu .jeux-revoir'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-revision-categories', actions: [module('quiz-pays'), attendre('.jeux-jouer'), (p) => p.addInitScript(() => { const r = JSON.parse(localStorage.getItem('montis.reglages') || '{}'); r['jeux-erreurs'] = ['drapeau:FR', 'drapeau:IT', 'capitale:DE', 'pays:ES', 'ville:12', 'liste:PT', 'liste:NO']; localStorage.setItem('montis.reglages', JSON.stringify(r)); }), (p) => p.reload(), module('quiz-pays'), attendre('.jeux-carte[data-mode="revision"]'), clic('.jeux-carte[data-mode="revision"]'), (p) => p.evaluate(() => document.querySelector('.jeux-revision-categories').scrollIntoView({ block: 'center' })), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-drapeaux-revue', actions: [module('quiz-pays'), attendre('.jeux-jouer'), clic('.jeux-carte[data-mode="drapeaux"]'), clic('[data-choix="sens"] [data-valeur="drapeau"]'), clic('[data-choix="niveau"] [data-valeur="choix"]'), clic('[data-choix="longueur"] [data-valeur="courte"]'), clic('.jeux-jouer'), attendre('.bf-jeu .jeux-choix'), ...Array.from({ length: 10 }, () => [(p) => p.waitForTimeout(300), clic('.bf-jeu .jeux-choix button:last-child'), (p) => p.waitForTimeout(300), (p) => p.waitForTimeout(2000)]).flat(), attendre('.bf-jeu .jeux-score'), clic('.bf-jeu .jeux-revoir'), (p) => p.waitForTimeout(3500)] },
  { nom: 'jeux-reviser-avant', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="liste"]'), clic('[data-choix="zone"] [data-valeur="asie"]'), clic('.jeux-reviser-avant'), attendre('.jeux-fiche-ligne'), (p) => p.waitForTimeout(800)] },
  { nom: 'jeux-fiche-bas', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), clic('[data-choix="zoneFiches"] [data-valeur="europe"]'), clic('.jeux-fiche-ligne[data-code="CH"]'), attendre('.bf-jeu .jeux-savais-tu'), defiler('.bf-jeu .jeux-voisins'), (p) => p.waitForTimeout(3000)] },
  { nom: 'jeux-fiche-voisin', actions: [module('quiz-pays'), attendre('.jeux-zones small:not(:empty)'), clic('.jeux-carte[data-mode="fiches"]'), attendre('.jeux-fiche-ligne'), clic('[data-choix="zoneFiches"] [data-valeur="europe"]'), clic('.jeux-fiche-ligne[data-code="CH"]'), attendre('.bf-jeu .jeux-voisin'), clic('.bf-jeu .jeux-voisin[data-code="LI"]'), (p) => p.waitForTimeout(3000)] },
  {
    nom: 'combine-parcours-carte-fermee',
    actions: [module('rando'), clic('.parcours-creer'), clic('#outil-rapide-bouton-carte'), clic('#outil-rapide-panneau-carte .outil-rapide-fermer')],
  },
];
// Informations d'un astre du ciel : Soleil et Lune ouvert, la frise ne montre que cet astre
for (const astre of ['soleil', 'lune']) {
  const bulle = ECRANS.find((e) => e.nom === `globe-${astre}-bulle`);
  ECRANS.push({ ...bulle, nom: `globe-${astre}-infos`, actions: [...bulle.actions, clic('.lune-bulle [data-action="infos"]'), (p) => p.waitForTimeout(2500)] });
}

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
  const fichiersDataGouv = new Map();
  try {
    for (const [format, options] of Object.entries(FORMATS)) {
      for (const ecran of ecrans) {
        // Option position d'un écran : position GPS simulée, localisation autorisée (mode guidage)
        const geo = ecran.position ? { geolocation: { longitude: ecran.position[0], latitude: ecran.position[1], accuracy: 10 } } : {};
        const contexte = await navigateur.newContext({ ...options, ...geo, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write', ...(ecran.position ? ['geolocation'] : [])] });
        // Pas de feuille de partage du système : le lien est copié, ce qui se voit sur la capture
        await contexte.addInitScript(() => { delete Navigator.prototype.share; });
        // Fond de jour par défaut : en Auto, une série lancée le soir passerait tout en nuit
        await contexte.addInitScript((mode) => localStorage.setItem('montis.reglages', JSON.stringify({ langue: 'fr', 'fond-montis-mode': mode })), ecran.fond ?? 'jour');
        const page = await contexte.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(e.message));
        page.on('requestfailed', (r) => reseauEnEchec.add(new URL(r.url()).host));
        // Le réseau des sessions cloud coupe souvent data.gouv.fr (et OpenWindMap traîne) : quelques essais, une seule lecture par fichier
        await page.route(/www\.data\.gouv\.fr\/api\/1\/datasets\/r\/|api\.pioupiou\.fr\/v1\/live/, async (route) => {
          const url = route.request().url();
          for (let essai = 0; !fichiersDataGouv.has(url) && essai < 5; essai += 1) {
            try {
              const reponse = await route.fetch({ maxRedirects: 5, timeout: 30000 });
              if (reponse.ok()) fichiersDataGouv.set(url, await reponse.body());
            } catch {
              await new Promise((fin) => setTimeout(fin, 1000));
            }
          }
          if (fichiersDataGouv.has(url)) {
            await route.fulfill({ body: fichiersDataGouv.get(url), contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } });
          } else await route.abort();
        });
        if (ecran.simuler) {
          await page.route(/api\.open-meteo\.com\/v1\/forecast/, (route) => route.fulfill({ json: previsionsSimulees(route.request().url()) }));
          await page.route(/archive-api\.open-meteo\.com\/v1\/archive/, (route) => route.fulfill({ json: archiveSimulee(route.request().url()) }));
        }
        // Bulletin d'hiver de Météo-France (scripts/bulletin-simule.json) : en début de saison, ceux du jour sont presque vides
        if (ecran.bulletin) {
          await page.route(/eaws_bulletins\/(\d{4}-\d\d-\d\d)\/$/, (route) => {
            const [, date] = /(\d{4}-\d\d-\d\d)\/$/.exec(route.request().url());
            route.fulfill({ body: `<a href="./${date}-FR.json">FR</a>`, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' } });
          });
          await page.route(/eaws_bulletins\/\d{4}-\d\d-\d\d\/\d{4}-\d\d-\d\d-FR\.json$/, (route) => route.fulfill({ body: BULLETIN_SIMULE, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }));
        }

        await page.goto(`${adresse}${ecran.lien ?? ''}`, { waitUntil: 'load' });
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
