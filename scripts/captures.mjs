// Captures d'écran de l'appli au format téléphone et ordinateur, pour vérifier une modification
// d'interface sans déploiement. Lance son propre serveur de développement.
//
//   npm run captures                  tous les écrans, téléphone et ordinateur
//   npm run captures -- meteo ski     seulement les écrans dont le nom contient ces mots
//
// Résultat dans captures/ (ignoré par git) : une image par écran et par format, et rapport.txt
// avec les erreurs JavaScript et les textes restés en français après le passage en anglais.
// Exige Playwright et Chromium, déjà installés dans les sessions cloud.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { archiveSimulee, previsionsSimulees } from './meteo-simulee.mjs';
import { gpxRando, gpxSki, igcVol, tcxVelo } from './sorties-demo.mjs';
import { fragmentParcours } from '../src/partage-calcul.js';

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
// Sans rien renvoyer : Playwright tenterait de copier toute la carte
const vue = (options) => (page) => page.evaluate((o) => { window.map.jumpTo(o); }, options);
const AIGUILLES = { center: [6.93, 45.9], zoom: 13.4, bearing: 0, pitch: 0 };
const ARGENTIERE = { center: [7.0, 45.97], zoom: 12.6, bearing: 0, pitch: 0 };
const PASSON = { center: [6.98, 45.962], zoom: 13.6, bearing: 0, pitch: 0 };
// Clic sur la carte à une position donnée (l'éditeur de parcours écoute les clics de MapLibre)
const clicCarte = (lngLat) => async (page) => {
  const { x, y } = await page.evaluate((p) => window.map.project(p), lngLat);
  const boite = await page.locator('#map').boundingBox();
  await page.mouse.click(boite.x + x, boite.y + y);
};
const MATIN = { center: [6.9, 45.88], zoom: 12.3, bearing: 0, pitch: 0 }; // vallée de Chamonix
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
const ongletFond = (o) => clic(`.fond-onglets [data-onglet="${o}"]`);
const choisirFond = (id) => async (page) => {
  await page.evaluate((i) => {
    let radio = document.querySelector(`.fond-contenu input[name="fond"][value="${i}"]`);
    if (!radio) {
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
const clicVisible = (selecteur) => (page) => page.evaluate((s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent !== null)?.click(), selecteur);
// Les relevés et les terrains arrivent en quelques secondes
const SITES = [vue(ANNECY), module('parapente'), ongletSites, (p) => p.waitForTimeout(6000)];
// Fiche d'un décollage près d'Annecy
const TERRAIN = [...SITES, clic('#menu-bouton'), vue({ ...ANNECY, zoom: 11.5 }), toucherObjet('terrains-ffvl-points', 'classe', 'decollage')];
// Fait défiler le panneau jusqu'à un bloc
const defiler = (selecteur) => (page) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), selecteur);
// Touche la frise météo à une fraction de sa largeur
const lireFrise = (fraction) => async (page) => {
  const frise = page.locator('.frise:not([hidden]) .frise-graphique').first();
  await frise.waitFor({ timeout: 8000 });
  const boite = await frise.boundingBox();
  await frise.click({ position: { x: boite.width * fraction, y: boite.height / 2 } });
};

const attendre = (selecteur) => (page) => page.waitForSelector(selecteur, { state: 'attached', timeout: 15000 });
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

const ECRANS = [
  { nom: 'accueil', actions: [] },
  { nom: 'menu', actions: [clic('#menu-bouton')] },
  { nom: 'parametres', actions: [clic('#menu-bouton'), clic('#menu-parametres-bouton')] },
  { nom: 'parapente', actions: [module('parapente')] },
  // Balises OpenWindMap et FFVL réunies, terrains FFVL (réseau requis : api.pioupiou.fr, data.gouv.fr)
  { nom: 'parapente-sites', actions: [...SITES] },
  { nom: 'parapente-sites-carte', actions: [...SITES, clic('#menu-bouton')] },
  // Pins des terrains et leur anneau d'orientations, carte tournée : l'anneau suit la carte
  { nom: 'parapente-terrains-pins', actions: [...SITES, clic('#menu-bouton'), vue({ center: [6.25, 45.815], zoom: 13.2, bearing: 30, pitch: 0 }), attendreCouche('terrains-ffvl-anneaux')] },
  { nom: 'parapente-terrain', actions: TERRAIN },
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
  { nom: 'randonnee', actions: [module('rando')] },
  { nom: 'velo', actions: [module('velo')] },
  { nom: 'ski', actions: [module('ski')] },
  // Ski de rando (lot 3.3) : choix de la pratique, pentes allumées d'office, bulletin du massif au centre
  { nom: 'ski-rando', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(4000)] },
  // Itinéraires d'OSM (piste:type=skitour), lus dans /data/skitour
  { nom: 'ski-rando-itineraires', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), (p) => p.waitForTimeout(2500)] },
  { nom: 'ski-rando-itineraires-carte', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), (p) => p.waitForTimeout(2500), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  // Un itinéraire touché dans la liste s'ouvre dans l'éditeur, comme une trace importée
  { nom: 'ski-rando-trace', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-zone'), attendre('.ski-activite .parcours-liste .parcours-item'), clic('.ski-activite .parcours-liste .parcours-item'), (p) => p.waitForTimeout(5000)] },
  // Routage de montée : deux points posés sur la trace du col du Passon, le tracé la suit
  { nom: 'ski-rando-routage', actions: [vue(PASSON), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-zone'), clic('.ski-activite .parcours-creer'), (p) => p.waitForTimeout(2500), clicCarte([6.98215, 45.95351]), (p) => p.waitForTimeout(1500), clicCarte([6.97771, 45.96735]), (p) => p.waitForTimeout(6000)] },
  { nom: 'ski-rando-ferme', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(1500), clic('#menu-fermer'), (p) => p.waitForTimeout(3000)] },
  { nom: 'ski-rando-creer', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), attendre('.parcours-creer'), clic('.ski-activite .parcours-creer'), (p) => p.waitForTimeout(2500)] },
  // Retour à la piste : les pentes allumées par le ski de rando s'éteignent
  { nom: 'ski-rando-piste', actions: [vue(ARGENTIERE), module('ski'), attendre('.ski-pratiques'), clic('.ski-pratiques [data-pratique="skirando"]'), (p) => p.waitForTimeout(1000), clic('.ski-pratiques [data-pratique="piste"]'), clic('#menu-fermer'), (p) => p.waitForTimeout(2000)] },
  // `simuler` : prévisions Open-Meteo simulées (scripts/meteo-simulee.mjs), injoignable en session cloud
  { nom: 'meteo', simuler: true, actions: [module('meteo-locale')] },
  // Frise heure par heure : lecture d'une heure, choix des lignes, jour choisi
  { nom: 'meteo-frise', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-lecture', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), defiler('.meteo-horaire'), lireFrise(0.3), (p) => p.waitForTimeout(800), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-lignes', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), clic('.frise-bouton-lignes'), clic('.frise-puce-nuages'), clic('.frise-puce-isotherme'), defiler('.meteo-horaire')] },
  { nom: 'meteo-frise-jour', simuler: true, actions: [module('meteo-locale'), (p) => p.waitForTimeout(1500), clic('.meteo-jour:nth-child(3)'), defiler('.meteo-horaire')] },
  { nom: 'meteo-radar', actions: [module('radar')] },
  { nom: 'meteo-vent', actions: [module('vent')] },
  // Pastilles météo : le radar reste panneau Météo fermé ; le vent, panneau Carte ouvert par-dessus (téléphone)
  { nom: 'meteo-radar-pastille', actions: [module('radar'), (p) => p.waitForTimeout(1500), clic('#outil-rapide-panneau-meteo .outil-rapide-fermer')] },
  { nom: 'meteo-vent-pastille', actions: [module('vent'), (p) => p.waitForTimeout(1500), module('relief')] },
  // Appui sur la pastille du vent : le panneau Carte se ferme, celui du vent revient
  {
    nom: 'meteo-vent-pastille-ouvre',
    actions: [module('vent'), (p) => p.waitForTimeout(1500), module('relief'), clic('.couche-pastille:not([hidden]) .couche-pastille-corps')],
  },
  { nom: 'carte-fond', actions: [module('fond')] },
  // Fonds topo (lot 3.10) : onglets Pays et Anciennes, cartes nationales, calques officiels
  { nom: 'carte-fond-pays', actions: [vue(ZERMATT), module('fond'), ongletFond('pays')] },
  { nom: 'carte-fond-anciennes', actions: [module('fond'), ongletFond('anciennes')] },
  { nom: 'carte-fond-ici-suisse', actions: [vue(ZERMATT), module('fond'), ongletFond('ici')] },
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
  // Pastilles des couches allumées depuis Carte, panneau fermé
  {
    nom: 'carte-pastilles',
    actions: [
      vue(AIGUILLES), module('relief'), clic('.pentes-choix [data-genre="orientation"]'), module('elements'),
      (p) => p.evaluate(() => document.querySelectorAll('#outil-rapide-panneau-carte .option-case input').forEach((c, i) => { if (i < 3 && !c.checked) c.click(); })),
      clic('#outil-rapide-panneau-carte .outil-rapide-fermer'),
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
    actions: [vue({ center: [6.1, 46.2], zoom: 9.5, bearing: 0, pitch: 0 }), module('nature'), clic('.geologie-choix button'), module('elements'),
      (p) => p.evaluate(() => {
        const case_ = [...document.querySelectorAll('.option-case')].find((l) => /Frontières|borders/i.test(l.textContent))?.querySelector('input');
        if (case_ && !case_.checked) case_.click();
      }), (p) => p.waitForTimeout(4000)],
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
  { nom: 'pastille-activite', actions: [vue(ANNECY), module('parapente'), (p) => p.waitForTimeout(3000), clic('#menu-fermer'), module('elements'), (p) => p.evaluate(() => { const c = [...document.querySelectorAll('.option-case')].find((l) => /Sommets|Peaks/i.test(l.textContent))?.querySelector('input'); if (c && !c.checked) c.click(); }), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), (p) => p.waitForTimeout(2000)] },
  // Ombre du soleil à une heure choisie (curseur), ombre portée comprise
  { nom: 'carte-ombres', actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(9 * 60), (p) => p.waitForTimeout(5000), defiler('.relief-ombres')] },
  {
    nom: 'carte-ombres-3d',
    actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(16 * 60), clic('.relief-bascule [data-mode="3d"]'),
      (p) => p.waitForTimeout(1200), vue({ ...MATIN, pitch: 60, bearing: 200 }), (p) => p.waitForTimeout(5000)],
  },
  // Le soleil dans le ciel en 3D, en fin d'après-midi, face à lui
  {
    nom: 'carte-ombres-3d-soleil',
    actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(16 * 60 + 30), clic('.relief-bascule [data-mode="3d"]'),
      clic('#outil-rapide-panneau-carte .outil-rapide-fermer'),
      (p) => p.waitForTimeout(1200), vue({ center: [6.86, 45.9], zoom: 12.6, pitch: 82, bearing: 238 }), (p) => p.waitForTimeout(5000)],
  },
  { nom: 'carte-ombres-ferme', actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(9 * 60), clic('#outil-rapide-panneau-carte .outil-rapide-fermer'), (p) => p.waitForTimeout(5000)] },
  // Un jour choisi au calendrier (appui sur le nom du jour)
  {
    nom: 'carte-ombres-jour',
    actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(12 * 60),
      (p) => p.evaluate(() => {
        const champ = document.querySelector('.ombres-calendrier');
        champ.value = '2027-02-15';
        champ.dispatchEvent(new Event('change', { bubbles: true }));
      }), (p) => p.waitForTimeout(5000), defiler('.relief-ombres')],
  },
  { nom: 'carte-ombres-nuit', actions: [vue(MATIN), module('relief'), clic('.ombres-choix button'), heureOmbres(23 * 60), (p) => p.waitForTimeout(1500), defiler('.relief-ombres')] },
  { nom: 'meteo-reduit', actions: [module('radar'), clic('#outil-rapide-panneau-meteo .outil-rapide-reduire')] },
  { nom: 'carte-elements', actions: [module('elements')] },
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
  { nom: 'partage-lien-parcours', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])')] },
  { nom: 'partage-parcours-bouton', lien: `#${LIEN_PARCOURS}`, actions: [attendre('.parcours-partager:not([disabled])'), defiler('.parcours-pied'), clic('.parcours-partager')] },
  { nom: 'partage-lien-illisible', lien: '#parcours=1abcd', actions: [] },
  // Météo et Carte s'ouvrent par-dessus une activité sans l'arrêter
  { nom: 'combine-portee-meteo', actions: [module('parapente'), clic('[data-para-vue="portee"]'), clic('#outil-rapide-bouton-meteo')] },
  // Préférences de routage (lot 3.0) : bouton filtre de l'éditeur, choix multiples
  { nom: 'parcours-preferences-rando', actions: [module('rando'), clic('.parcours-creer'), attendre('.parcours-bouton-preferences'), clicVisible('.parcours-bouton-preferences')] },
  { nom: 'parcours-preferences-velo', actions: [module('velo'), clic('.parcours-creer'), attendre('.parcours-bouton-preferences'), clicVisible('.parcours-bouton-preferences'), clicVisible('[data-preference="cyclables"]'), clicVisible('[data-preference="routes"]')] },
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
  const fichiersDataGouv = new Map();
  try {
    for (const [format, options] of Object.entries(FORMATS)) {
      for (const ecran of ecrans) {
        const contexte = await navigateur.newContext({ ...options, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
        // Pas de feuille de partage du système : le lien est copié, ce qui se voit sur la capture
        await contexte.addInitScript(() => { delete Navigator.prototype.share; });
        await contexte.addInitScript(() => localStorage.setItem('montis.reglages', JSON.stringify({ langue: 'fr' })));
        const page = await contexte.newPage();
        const erreurs = [];
        page.on('pageerror', (e) => erreurs.push(e.message));
        page.on('requestfailed', (r) => reseauEnEchec.add(new URL(r.url()).host));
        // Le réseau des sessions cloud coupe souvent data.gouv.fr : quelques essais, et une seule lecture par fichier
        await page.route(/www\.data\.gouv\.fr\/api\/1\/datasets\/r\//, async (route) => {
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
