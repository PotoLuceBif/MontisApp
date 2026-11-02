import * as maplibregl from 'maplibre-gl';
import { etat, majCourbes } from './options-carte.js';
import { bloquerFiches } from './fiche.js';
import { SOURCE_SATELLITE, SOURCE_TOPO, retablirFond } from './fond-de-carte.js';
import { lire, ecrire } from './reglages.js';
import { SOURCE_VECTEUR } from './source-vecteur.js';
import { expressionAltitude, formatDenivele, formatLongueur, imperial } from './unites.js';

const SOURCE_PISTES = 'visite-pistes';
const SOURCE_MASQUE = 'visite-masque';
// Le décor autour des pistes : la neige des stations, ou l'été des bike parks
const DECORS = {
  hiver: {
    brume: '#eef3f7', sol: '#f5f8fb', forets: '#8fa39a', eau: '#d3e3ee', ombre: '#a9bbd0', accent: '#c6d3e1', courbes: '#56708f', routes: '#aab3bd',
  },
  ete: {
    brume: '#e4ebe6', sol: '#eef0e2', forets: '#9dbb8a', eau: '#b4d6e8', ombre: '#8f9a84', accent: '#b4bca6', courbes: '#8a7a5c', routes: '#b5ae9e',
  },
};
const MARGE_ZONE_M = 2000; // autour des pistes, la zone de la station
// Depuis cette zone : tout reste lisible jusqu'à NET, puis s'estompe et disparaît à LOIN
const DISTANCE_NETTE_M = 3000;
const DISTANCE_LOIN_M = 10000;
// La carte s'arrête là, avec un bord fondu ; la caméra, elle, reste libre
const RAYON_CARTE_M = 100_000;
const MARGE_TUILES_M = 8000; // les tuiles vont un peu au-delà, pour que le bord fondu les recouvre
// Ce qui ne sert qu'à se repérer de près. Le sol (forêts, eau, relief) reste jusqu'à l'horizon
const COUCHES_PROCHES = new Set([
  'visite-courbes', 'visite-courbes-altitude', 'visite-batiments', 'visite-routes',
  'visite-hameaux', 'visite-sommets', 'visite-lieux', 'visite-communes',
]);
const OPACITES = { line: 'line-opacity', fill: 'fill-opacity' };
// Le brouillard ne commence que loin vers l'horizon et se fond dans le ciel
const brouillard = (couleur) => ({
  'sky-color': '#b9d0e4',
  'horizon-color': couleur,
  'fog-color': couleur,
  'sky-horizon-blend': 0.7,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.45,
  'atmosphere-blend': 0,
});
const SATELLITE = { id: 'satellite', libelle: 'Satellite', source: SOURCE_SATELLITE };
// Le premier de chaque liste est le fond par défaut
const FONDS_SKI = [{ id: 'defaut', libelle: 'Blanc' }, SATELLITE];
const FONDS_BIKEPARK = [SATELLITE, { id: 'relief', libelle: 'Relief', source: SOURCE_TOPO }, { id: 'defaut', libelle: 'Clair' }];
const CLASSES_PENTES = [
  ['30-35°', '#f7e600'],
  ['35-40°', '#f5801f'],
  ['40-45°', '#e8005f'],
  ['45° et +', '#c98abf'],
];
const ICONE_COURBES = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 18c3-1 4-5 9-5s6 4 9 5"/><path d="M6 13c2-.8 3-4 6-4s4 3.2 6 4"/><path d="M9.5 8c.9-.6 1.4-2 2.5-2s1.600 1.400 2.500 2"/></svg>';
const ICONE_PENTES = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 20h18L6.500 6 3 20Z"/><path d="M11.500 20a7 7 0 0 0-1.400-4.200"/></svg>';
// Sous un fond en image, le décor dessiné ferait double emploi
const COUCHES_DECOR = {
  relief: ['visite-forets', 'visite-eau', 'visite-ombrage', 'visite-batiments', 'visite-routes'],
  satellite: ['visite-forets', 'visite-eau', 'visite-ombrage', 'visite-batiments', 'visite-routes'],
};
const METRES_PAR_DEGRE = 111_320;
const POINTS_PAR_ARRONDI = 8;
// Chaque source globale a sa copie, retirée avec les calques de la visite
const SOURCES_LIMITEES = {
  [SOURCE_VECTEUR]: 'visite-osm',
  ombrage: 'visite-ombrage',
  courbes: 'visite-courbes-source',
};
const POLICE = ['Open Sans Regular', 'Arial Unicode MS Regular'];
const INCLINAISON = 62;
const ZOOM_MIN = 11;
const ZOOM_MAX = 14.5;
const ZOOM_RAPPROCHE = 0.8; // l'inclinaison écrase le domaine : on peut cadrer plus près que le calcul
const ZOOM_RAPPROCHE_ETROIT = 0.1; // sur un écran étroit, ce serait couper le domaine sur les côtés
const ICONE_SOMMET = 'visite-sommet-icone';
const SOURCE_PENTES = 'visite-pentes';
const OPACITE_PENTES = 0.62;
const URL_PENTES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const TOLERANCE_CLIC_PX = 8;

const COULEURS_NIVEAUX = [
  'match',
  ['get', 'niveau'],
  'verte', '#1f9d55',
  'bleue', '#1f6fd6',
  'rouge', '#d92b2f',
  'noire', '#15181d',
  'freeride', '#e07b1a',
  '#6f7884',
];
const LIBELLES_NIVEAUX = {
  verte: 'Piste verte',
  bleue: 'Piste bleue',
  rouge: 'Piste rouge',
  noire: 'Piste noire',
  freeride: 'Itinéraire freeride',
};
const LIBELLES_REMONTEES = {
  chair_lift: 'Télésiège',
  gondola: 'Télécabine',
  mixed_lift: 'Remontée mixte',
  cable_car: 'Téléphérique',
  funicular: 'Funiculaire',
  railway: 'Train',
  't-bar': 'Téléski',
  'j-bar': 'Téléski',
  platter: 'Téléski',
  drag_lift: 'Téléski',
  rope_tow: 'Fil neige',
  magic_carpet: 'Tapis roulant',
};

const estLigne = ['==', ['geometry-type'], 'LineString'];
const estPiste = ['==', ['get', 'genre'], 'piste'];
const estRemontee = ['==', ['get', 'genre'], 'remontee'];
const estAlpin = ['==', ['get', 'usage'], 'alpin'];
const estFond = ['==', ['get', 'usage'], 'fond'];
const largeur = (bas, haut) => ['interpolate', ['linear'], ['zoom'], 10, bas, 16, haut];

// Petit triangle sombre posé sur chaque sommet
function creerIconeSommet() {
  const t = 18;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.moveTo(t / 2, 2);
  g.lineTo(t - 2, t - 3);
  g.lineTo(2, t - 3);
  g.closePath();
  g.fillStyle = '#3d4f66';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  return g.getImageData(0, 0, t, t);
}

const filtreCommunes = (communes) => ['in', ['get', 'name'], ['literal', communes]];

// Ces calques recouvrent le fond choisi, qui reste intact en dessous
function calquesDecor(decor, courbesVisibles, pentesVisibles) {
  const visibilite = courbesVisibles ? 'visible' : 'none';
  return [
    { id: 'visite-neige', type: 'background', paint: { 'background-color': decor.sol } },
    {
      id: 'visite-forets',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]],
      paint: { 'fill-color': decor.forets, 'fill-opacity': 0.5 },
    },
    {
      id: 'visite-eau',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'water',
      paint: { 'fill-color': decor.eau },
    },
    {
      id: 'visite-ombrage',
      type: 'hillshade',
      source: 'ombrage',
      paint: {
        'hillshade-exaggeration': 0.6,
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': decor.ombre,
        'hillshade-accent-color': decor.accent,
        'hillshade-highlight-color': '#ffffff',
      },
    },
    {
      id: 'visite-pentes',
      type: 'raster',
      source: SOURCE_PENTES,
      layout: { visibility: pentesVisibles ? 'visible' : 'none' },
      paint: { 'raster-opacity': OPACITE_PENTES },
    },
    {
      id: 'visite-courbes',
      type: 'line',
      source: 'courbes',
      'source-layer': 'contours',
      layout: { visibility: visibilite },
      paint: {
        'line-color': decor.courbes,
        'line-opacity': ['match', ['get', 'level'], 1, 0.7, 0.32],
        'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
      },
    },
    {
      id: 'visite-batiments',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#8d97a3', 'fill-opacity': 0.8 },
    },
    {
      id: 'visite-routes',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: { 'line-color': decor.routes, 'line-width': largeur(0.5, 2.5) },
    },
  ];
}

function calquesPistes(communes, courbesVisibles) {
  return [
    {
      id: 'visite-zones',
      type: 'fill',
      source: SOURCE_PISTES,
      filter: ['all', ['==', ['geometry-type'], 'Polygon'], estPiste],
      paint: { 'fill-color': COULEURS_NIVEAUX, 'fill-opacity': 0.28 },
    },
    {
      id: 'visite-fond',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estFond],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0b8f9c', 'line-width': largeur(1, 3), 'line-dasharray': [1.5, 1.5] },
    },
    {
      id: 'visite-alpin-halo',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estAlpin],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': largeur(3.5, 8) },
    },
    {
      id: 'visite-alpin',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estAlpin],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COULEURS_NIVEAUX, 'line-width': largeur(2, 5) },
    },
    {
      id: 'visite-remontees-halo',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estRemontee],
      paint: { 'line-color': '#ffffff', 'line-width': largeur(2.5, 5) },
    },
    {
      id: 'visite-remontees',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estRemontee],
      paint: { 'line-color': '#2b2f36', 'line-width': largeur(1, 2.2) },
    },
    {
      id: 'visite-courbes-altitude',
      type: 'symbol',
      source: 'courbes',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['>=', ['get', 'level'], 1],
      layout: {
        visibility: courbesVisibles ? 'visible' : 'none',
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        // Les courbes sont déjà calculées dans l'unité affichée (voir main.js)
        'text-field': ['concat', ['number-format', ['get', 'ele'], { 'max-fraction-digits': 0 }], imperial() ? ' ft' : ' m'],
        'text-font': POLICE,
        'text-size': 10,
      },
      paint: { 'text-color': '#4c6583', 'text-halo-color': '#ffffff', 'text-halo-width': 1.3 },
    },
    {
      id: 'visite-hameaux',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      minzoom: 13,
      filter: ['==', ['get', 'class'], 'hamlet'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 11,
        'text-max-width': 8,
        'text-padding': 8,
      },
      paint: { 'text-color': '#3e5068', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
    {
      id: 'visite-sommets',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'mountain_peak',
      minzoom: 10.5,
      filter: ['all', ['has', 'name'], ['!=', ['get', 'class'], 'saddle']],
      layout: {
        'icon-image': ICONE_SOMMET,
        'icon-anchor': 'bottom',
        'text-field': [
          'case',
          ['has', 'ele'],
          ['concat', ['coalesce', ['get', 'name:fr'], ['get', 'name']], '\n', expressionAltitude(['get', 'ele'])],
          ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        ],
        'text-font': POLICE,
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.15],
        'text-padding': 8,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99], // les plus remarquables d'abord
      },
      paint: { 'text-color': '#3d4f66', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
    {
      id: 'visite-lieux',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 12,
        'text-max-width': 8,
        'text-padding': 10,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: { 'text-color': '#27384d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    {
      // Les communes de la station passent avant les autres noms, et en plus grand
      id: 'visite-communes',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: filtreCommunes(communes),
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 15,
        'text-max-width': 9,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#0f1b2c', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    },
    {
      id: 'visite-noms',
      type: 'symbol',
      source: SOURCE_PISTES,
      minzoom: 12.5,
      filter: ['all', estLigne, ['has', 'nom']],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['get', 'nom'],
        'text-font': POLICE,
        'text-size': 11,
      },
      paint: { 'text-color': '#1c2530', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
  ];
}

const COUCHES_CLIQUABLES = ['visite-remontees', 'visite-alpin', 'visite-fond', 'visite-zones'];

function contenuInfos(p) {
  const contenu = document.createElement('div');
  contenu.className = 'rando-resume-repere';
  const type =
    p.genre === 'remontee'
      ? LIBELLES_REMONTEES[p.type] || 'Remontée'
      : p.usage === 'fond'
        ? 'Piste de ski de fond'
        : LIBELLES_NIVEAUX[p.niveau] || 'Piste';
  const titre = document.createElement('strong');
  titre.className = 'rando-resume-titre';
  titre.textContent = p.nom || type;
  contenu.append(titre);
  const stats = document.createElement('div');
  stats.className = 'rando-resume-stats';
  const ajouter = (libelle, valeur) => {
    const ligne = document.createElement('div');
    ligne.className = 'rando-resume-ligne';
    const texte = document.createElement('span');
    texte.textContent = libelle;
    const fort = document.createElement('strong');
    fort.textContent = valeur;
    ligne.append(texte, fort);
    stats.append(ligne);
  };
  if (p.nom) ajouter('Type', type);
  if (p.longueur) ajouter('Longueur', formatLongueur(p.longueur));
  if (p.denivele) ajouter('Dénivelé', formatDenivele(p.denivele));
  if (stats.children.length) contenu.append(stats);
  return contenu;
}

function limitesDe(features) {
  const limites = new maplibregl.LngLatBounds();
  for (const { geometry } of features) {
    const lignes = geometry.type === 'Polygon' ? geometry.coordinates : [geometry.coordinates];
    for (const ligne of lignes) for (const point of ligne) limites.extend(point);
  }
  return limites;
}

// Le cadre des pistes, agrandi de la marge et aux coins arrondis
function contourAutour(limites, marge) {
  const margeLat = marge / METRES_PAR_DEGRE;
  const margeLng = margeLat / Math.cos((limites.getCenter().lat * Math.PI) / 180);
  const [ouest, sud, est, nord] = limites.toArray().flat();
  const coins = [
    [est, nord, 0],
    [ouest, nord, 90],
    [ouest, sud, 180],
    [est, sud, 270],
  ];
  const contour = coins.flatMap(([lng, lat, depart]) =>
    Array.from({ length: POINTS_PAR_ARRONDI + 1 }, (_, i) => {
      const angle = ((depart + (90 * i) / POINTS_PAR_ARRONDI) * Math.PI) / 180;
      return [lng + Math.cos(angle) * margeLng, lat + Math.sin(angle) * margeLat];
    }));
  contour.push(contour[0]);
  return contour;
}

function cadreAutour(limites, marge) {
  const margeLat = marge / METRES_PAR_DEGRE;
  const margeLng = margeLat / Math.cos((limites.getCenter().lat * Math.PI) / 180);
  const [ouest, sud, est, nord] = limites.toArray().flat();
  return [ouest - margeLng, sud - margeLat, est + margeLng, nord + margeLat];
}

// Hors de la carte, la brume ; le trait flouté adoucit la frontière
function donneesMasque(contour) {
  const monde = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [monde, contour] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: contour } },
    ],
  };
}

function calquesMasque(couleur) {
  const largeurBord = ['interpolate', ['exponential', 2], ['zoom'], 5, 30, 12, 900];
  return [
    {
      id: 'visite-masque',
      type: 'fill',
      source: SOURCE_MASQUE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': couleur },
    },
    {
      id: 'visite-masque-bord',
      type: 'line',
      source: SOURCE_MASQUE,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': couleur, 'line-width': largeurBord, 'line-blur': largeurBord },
    },
  ];
}

// Estompe selon la distance à la zone : évaluée une fois par tuile, sans coût à chaque image
function attenuer(calque, contour) {
  const zone = { type: 'Polygon', coordinates: [contour] };
  const ecart = ['distance', zone];
  const fondu = ['interpolate', ['linear'], ecart, DISTANCE_NETTE_M, 1, DISTANCE_LOIN_M, 0];
  const proche = ['<', ecart, DISTANCE_LOIN_M];
  const paint = { ...calque.paint };
  if (calque.type === 'symbol') {
    paint['text-opacity'] = fondu;
    if (calque.layout?.['icon-image']) paint['icon-opacity'] = fondu;
  } else {
    const propriete = OPACITES[calque.type];
    const avant = paint[propriete];
    paint[propriete] = avant === undefined ? fondu : ['*', avant, fondu];
  }
  return { ...calque, paint, filter: calque.filter ? ['all', calque.filter, proche] : proche };
}

// `ete` : décor d'été et pas de carte des pentes d'avalanche, sans objet hors neige
export function creerVisiteStation(map, {
  ete = false,
  dossier = '/data/pistes',
  attribution = 'Pistes : <a href="https://openskidata.org" target="_blank">OpenSkiData</a> (ODbL), © contributeurs OpenStreetMap',
} = {}) {
  const decor = ete ? DECORS.ete : DECORS.hiver;
  const fonds = ete ? FONDS_BIKEPARK : FONDS_SKI;
  // Réglages séparés pour le ski et les bike parks ; le fond général de l'app n'est jamais touché
  const CLES = ete
    ? { fond: 'bikepark-fond', courbes: 'bikepark-courbes', pentes: 'bikepark-pentes' }
    : { fond: 'visite-fond-ski', courbes: 'visite-courbes', pentes: 'visite-pentes' };
  let enCours = null; // { vue, etaitEn3D, communes, calquesMasques, cadre, reliefCoupe }
  let idsCalques = [];
  let popup = null;
  let courbesVisibles = lire(CLES.courbes, true);
  let pentesVisibles = lire(CLES.pentes, false);
  let idFond = fonds.some(({ id }) => id === lire(CLES.fond, '')) ? lire(CLES.fond, '') : fonds[0].id;
  const choixFond = new Set();

  // Dès que le domaine sort de l'écran, un geste suffit pour y revenir
  const pastilleRetour = document.createElement('button');
  pastilleRetour.type = 'button';
  pastilleRetour.className = 'visite-retour';
  pastilleRetour.hidden = true;
  pastilleRetour.textContent = ete ? 'Revenir au bike park' : 'Revenir à la station';
  pastilleRetour.addEventListener('click', () => recentrer());
  document.body.append(pastilleRetour);

  function majPastilleRetour() {
    if (!enCours?.limites) {
      pastilleRetour.hidden = true;
      return;
    }
    const centre = enCours.limites.getCenter();
    const { x, y } = map.project(centre);
    const { clientWidth, clientHeight } = map.getContainer();
    const aLEcran = map.getBounds().contains(centre) && x >= 0 && x <= clientWidth && y >= 0 && y <= clientHeight;
    pastilleRetour.hidden = aLEcran;
  }

  function recentrer() {
    if (!enCours?.cadrage) return;
    map.flyTo({ ...enCours.cadrage, pitch: etat.mode3D ? enCours.cadrage.pitch : 0, duration: 1500, essential: true });
  }

  function fermerPopup() {
    if (popup) popup.remove();
    popup = null;
  }

  function surClic(event) {
    fermerPopup();
    const { x, y } = event.point;
    const boite = [
      [x - TOLERANCE_CLIC_PX, y - TOLERANCE_CLIC_PX],
      [x + TOLERANCE_CLIC_PX, y + TOLERANCE_CLIC_PX],
    ];
    const [objet] = map.queryRenderedFeatures(boite, { layers: COUCHES_CLIQUABLES });
    if (!objet) return;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 8 })
      .setLngLat(event.lngLat)
      .setDOMContent(contenuInfos(objet.properties))
      .addTo(map);
  }

  function surSurvol(event) {
    const { x, y } = event.point;
    const boite = [
      [x - TOLERANCE_CLIC_PX, y - TOLERANCE_CLIC_PX],
      [x + TOLERANCE_CLIC_PX, y + TOLERANCE_CLIC_PX],
    ];
    const surObjet = map.queryRenderedFeatures(boite, { layers: COUCHES_CLIQUABLES }).length > 0;
    map.getCanvas().style.cursor = surObjet ? 'pointer' : '';
  }

  function copierSource(idSource, cadre, cadreCarte) {
    const source = map.getSource(idSource);
    const options = {
      type: source.type,
      tiles: source.tiles,
      minzoom: source.minzoom,
      maxzoom: source.maxzoom,
      bounds: idSource === 'courbes' ? cadre : cadreCarte, // au-delà, les courbes sont déjà effacées
    };
    if (source.attribution) options.attribution = source.attribution;
    if (source.type === 'raster-dem') Object.assign(options, { tileSize: source.tileSize, encoding: source.encoding });
    map.addSource(SOURCES_LIMITEES[idSource], options);
  }

  // Les sources sont retirées avec leurs calques, ce qui évite de réutiliser d'anciennes
  // tuiles (cause d'un plantage du placement des textes).
  function creerCalques(donnees, communes) {
    if (!map.hasImage(ICONE_SOMMET)) map.addImage(ICONE_SOMMET, creerIconeSommet(), { pixelRatio: 2 });
    const limitesPistes = limitesDe(donnees.features);
    const contour = contourAutour(limitesPistes, MARGE_ZONE_M);
    const cadre = cadreAutour(limitesPistes, MARGE_ZONE_M + DISTANCE_LOIN_M);
    const cadreCarte = cadreAutour(limitesPistes, RAYON_CARTE_M + MARGE_TUILES_M);
    Object.keys(SOURCES_LIMITEES).forEach((id) => copierSource(id, cadre, cadreCarte));
    map.addSource(SOURCE_MASQUE, { type: 'geojson', data: donneesMasque(contourAutour(limitesPistes, RAYON_CARTE_M)) });
    map.addSource(SOURCE_PENTES, {
      type: 'raster',
      tiles: [URL_PENTES],
      tileSize: 256,
      maxzoom: 17,
      bounds: cadre,
      attribution: 'Pentes : © IGN',
    });
    map.addSource(SOURCE_PISTES, {
      type: 'geojson',
      data: donnees,
      attribution,
    });

    const calques = [
      ...calquesDecor(decor, courbesVisibles, pentesVisibles),
      ...calquesMasque(decor.brume),
      ...calquesPistes(communes, courbesVisibles),
    ].map((calque) => {
      const source = SOURCES_LIMITEES[calque.source];
      const copie = source ? { ...calque, source } : calque;
      return COUCHES_PROCHES.has(calque.id) ? attenuer(copie, contour) : copie;
    });
    calques.forEach((calque) => map.addLayer(calque));
    // Les fonds en image, juste au-dessus de la couleur du sol
    fonds.filter(({ source }) => source && map.getSource(source)).forEach(({ id, source }) => {
      const { tiles, tileSize, maxzoom, attribution: credit } = map.getSource(source);
      map.addSource(`visite-image-${id}`, { type: 'raster', tiles, tileSize, maxzoom, bounds: cadreCarte, attribution: credit });
      map.addLayer({ id: `visite-image-${id}`, type: 'raster', source: `visite-image-${id}`, layout: { visibility: 'none' } }, 'visite-forets');
    });
    enCours.limites = limitesPistes;
    idsCalques = map.getStyle().layers.map(({ id }) => id).filter((id) => id.startsWith('visite-'));
    appliquerFondVisite();
  }

  function appliquerFondVisite() {
    if (!enCours) return;
    fonds.forEach(({ id }) => {
      const couche = `visite-image-${id}`;
      if (map.getLayer(couche)) map.setLayoutProperty(couche, 'visibility', id === idFond ? 'visible' : 'none');
    });
    const caches = COUCHES_DECOR[idFond] ?? [];
    Object.values(COUCHES_DECOR).flat().forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', caches.includes(id) ? 'none' : 'visible');
    });
    // OpenTopoMap a déjà ses courbes ; sur une photo, seul le blanc reste lisible
    const photo = idFond === 'satellite';
    if (map.getLayer('visite-courbes')) {
      map.setLayoutProperty('visite-courbes', 'visibility', courbesVisibles && idFond !== 'relief' ? 'visible' : 'none');
      map.setPaintProperty('visite-courbes', 'line-color', photo ? '#ffffff' : decor.courbes);
    }
    if (map.getLayer('visite-courbes-altitude')) {
      map.setLayoutProperty('visite-courbes-altitude', 'visibility', courbesVisibles && idFond !== 'relief' ? 'visible' : 'none');
    }
  }

  function majChoixFond() {
    choixFond.forEach((bloc) => {
      if (!bloc.isConnected) {
        choixFond.delete(bloc);
        return;
      }
      bloc.querySelectorAll('[data-fond]').forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.fond === idFond)));
      // OpenTopoMap dessine déjà ses courbes : l'option n'aurait pas d'effet
      bloc.querySelector('.visite-option-courbes').hidden = idFond === 'relief';
    });
  }

  function definirFond(id) {
    idFond = id;
    ecrire(CLES.fond, id);
    appliquerFondVisite();
    majChoixFond();
  }

  // Le ciel d'avant revient à la sortie : main.js le reprend sur son propre réglage
  function imposerCiel(ciel) {
    etat.cielImpose = ciel;
    etat.majCiel?.(true);
  }

  function retirerCalques() {
    idsCalques.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    idsCalques = [];
    const images = fonds.map(({ id }) => `visite-image-${id}`);
    [...Object.values(SOURCES_LIMITEES), ...images, SOURCE_PENTES, SOURCE_MASQUE, SOURCE_PISTES].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  // Sous le décor, la carte normale continuerait à télécharger ses tuiles : on la coupe
  function masquerCarte() {
    enCours.calquesMasques = map.getStyle().layers
      .filter(({ id, layout }) => !id.startsWith('visite-') && layout?.visibility !== 'none')
      .map(({ id }) => id);
    enCours.calquesMasques.forEach((id) => map.setLayoutProperty(id, 'visibility', 'none'));
  }

  function reafficherCarte(calquesMasques) {
    calquesMasques.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
    retablirFond(map); // le fond a pu changer pendant la visite : seul le choix actuel doit rester visible
    majCourbes(map);
  }

  // Charge les pistes avant de toucher à la carte : en cas d'échec, rien n'a changé
  async function charger(idStation) {
    const reponse = await fetch(new URL(`${dossier}/${idStation}.json`, window.location.origin).href);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    return reponse.json();
  }

  // Une nouvelle station pendant une visite remplace juste sa zone : quitter ramènera
  // toujours à la vue d'avant la première visite
  // `marges` : la place que prend un panneau sur la carte
  function demarrer(donnees, marges = {}) {
    const communes = donnees.communes || [];
    if (enCours) {
      fermerPopup();
      enCours.communes = communes;
      retirerCalques();
      creerCalques(donnees, communes);
    } else {
      enCours = {
        vue: { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
        etaitEn3D: !!etat.mode3D,
        communes,
      };
      bloquerFiches(true);
      if (!etat.mode3D) etat.basculerMode();

      masquerCarte();
      etat.enVisite = true;
      creerCalques(donnees, communes);
      imposerCiel(brouillard(decor.brume));
      map.on('click', surClic);
      map.on('mousemove', surSurvol);
      map.on('moveend', majPastilleRetour);
    }

    const etroit = map.getContainer().clientWidth <= 640;
    // L'été, on cadre les pistes : les remontées du domaine de ski s'étendent souvent bien au-delà
    const pistes = donnees.features.filter(({ properties }) => properties.genre === 'piste');
    const limites = limitesDe(ete && pistes.length ? pistes : donnees.features);
    const camera = map.cameraForBounds(limites, {
      padding: {
        ...(etroit ? { top: 90, bottom: 90, left: 24, right: 24 } : { top: 110, bottom: 110, left: 50, right: 50 }),
        ...marges,
      },
      bearing: donnees.cap,
      pitch: INCLINAISON,
    });
    const rapproche = etroit ? ZOOM_RAPPROCHE_ETROIT : ZOOM_RAPPROCHE;
    enCours.cadrage = {
      center: camera?.center ?? limites.getCenter(),
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (camera?.zoom ?? ZOOM_MIN) + rapproche)),
      bearing: donnees.cap,
      pitch: INCLINAISON,
    };
    map.flyTo({ ...enCours.cadrage, duration: 2600, essential: true });
  }

  function quitter({ restaurer = true } = {}) {
    if (!enCours) return;
    const { vue, etaitEn3D, calquesMasques } = enCours;
    enCours = null;
    fermerPopup();
    map.off('click', surClic);
    map.off('mousemove', surSurvol);
    map.off('moveend', majPastilleRetour);
    pastilleRetour.hidden = true;
    map.getCanvas().style.cursor = '';
    retirerCalques();
    etat.enVisite = false;
    reafficherCarte(calquesMasques);
    imposerCiel(null);
    bloquerFiches(false);
    if (etaitEn3D !== !!etat.mode3D) etat.basculerMode();
    if (restaurer) map.flyTo({ ...vue, pitch: etaitEn3D ? vue.pitch : 0, duration: 1200, essential: true });
  }

  function afficherCourbes(visibles) {
    courbesVisibles = visibles;
    ecrire(CLES.courbes, visibles);
    if (!enCours) return;
    appliquerFondVisite();
  }

  function afficherPentes(visibles) {
    pentesVisibles = visibles;
    ecrire(CLES.pentes, visibles);
    if (enCours && map.getLayer('visite-pentes')) {
      map.setLayoutProperty('visite-pentes', 'visibility', visibles ? 'visible' : 'none');
    }
  }

  function creerBoutonCalque(icone, libelle, description, actif, surChangement) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'ski-visite-calque';
    bouton.innerHTML = icone;
    bouton.append(libelle);
    bouton.title = description;
    bouton.setAttribute('aria-label', description);
    bouton.setAttribute('aria-pressed', String(actif));
    bouton.addEventListener('click', () => {
      const coche = bouton.getAttribute('aria-pressed') !== 'true';
      bouton.setAttribute('aria-pressed', String(coche));
      surChangement(coche);
    });
    return bouton;
  }

  // Le fond et ses calques, tels qu'ils s'affichent dans la fiche de la visite
  function creerOptions({ surChangement = () => {} } = {}) {
    const bloc = document.createElement('div');
    bloc.className = 'ski-visite-calques';

    const choix = document.createElement('div');
    choix.className = 'parcours-pratiques visite-fonds';
    choix.setAttribute('role', 'group');
    choix.setAttribute('aria-label', 'Fond de carte de la visite');
    fonds.forEach(({ id, libelle }) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.dataset.fond = id;
      bouton.textContent = libelle;
      bouton.setAttribute('aria-pressed', String(id === idFond));
      bouton.addEventListener('click', () => {
        definirFond(id);
        surChangement();
      });
      choix.append(bouton);
    });

    const courbes = creerBoutonCalque(ICONE_COURBES, 'Courbes', 'Courbes de niveau et altitudes', courbesVisibles, (coche) => {
      afficherCourbes(coche);
    });
    courbes.classList.add('visite-option-courbes');
    courbes.hidden = idFond === 'relief';

    const legende = document.createElement('div');
    legende.className = 'ski-pentes-legende';
    legende.hidden = !pentesVisibles;
    CLASSES_PENTES.forEach(([libelle, couleur]) => {
      const entree = document.createElement('span');
      entree.className = 'ski-niveaux-entree';
      const pastille = document.createElement('i');
      pastille.style.background = couleur;
      entree.append(pastille, libelle);
      legende.append(entree);
    });
    const pentes = creerBoutonCalque(ICONE_PENTES, 'Pentes 30°+', 'Pentes de plus de 30 degrés', pentesVisibles, (coche) => {
      afficherPentes(coche);
      legende.hidden = !coche;
      surChangement();
    });

    const recentrage = document.createElement('button');
    recentrage.type = 'button';
    recentrage.className = 'ski-visite-calque visite-recentrer';
    recentrage.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>';
    recentrage.title = 'Recentrer';
    recentrage.setAttribute('aria-label', 'Recentrer');
    recentrage.addEventListener('click', () => recentrer());

    bloc.append(courbes, pentes, recentrage, legende, choix);
    choixFond.add(bloc);
    return bloc;
  }

  return {
    charger,
    demarrer,
    creerOptions,
    quitter,
    communes: () => enCours?.communes ?? [],
  };
}
