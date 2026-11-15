import { ADRESSE_POLICES, POLICE, POLICE_GRAS, POLICE_ITALIQUE } from './polices.js';
import { SOURCE_VECTEUR, definitionSourceVecteur } from './source-vecteur.js';
import { expressionSommet } from './unites.js';

const classes = (valeurs) => ['in', ['get', 'class'], ['literal', valeurs]];

export const CALQUES_MONTIS = [
  'montis-background',
  'montis-landuse',
  'montis-landcover',
  'montis-rochers',
  'montis-zones-humides',
  'montis-relief',
  'montis-glaciers-bord',
  'montis-water',
  'montis-waterway',
  'montis-boundary',
  'montis-building',
  'montis-road-casing',
  'montis-road',
  'montis-chemins',
  'montis-sentiers-lisere',
  'montis-path',
  'montis-marches',
  'montis-eau-noms-ligne',
  'montis-eau-noms-point',
  'montis-rivieres-noms',
  'montis-place',
  'montis-summit',
];

// Couche vide posée par fond-de-carte.js : les calques (pentes, ombres, géologie…) s'insèrent juste en dessous,
// au-dessus des fonds, et restent au-dessus d'une carte nationale (sous les routes du fond Montis sinon)
export const REPERE_CALQUES = 'repere-calques';

// Ombrage du fond Montis, en 2D comme en 3D, plus léger de près où il brouillerait le détail
// (`facteur` : main.js l'efface près des pôles)
export const exagerationReliefMontis = (facteur = 1) => ['interpolate', ['linear'], ['zoom'], 9, 0.85 * facteur, 13, 0.72 * facteur, 16, 0.45 * facteur];

// Motifs du fond, dessinés à deux fois la taille affichée pour rester nets
const MOTIFS = {
  // Éboulis : petits cailloux gris semés
  'montis-motif-eboulis': (g) => {
    g.fillStyle = 'rgba(112, 108, 100, 0.55)';
    for (const [x, y, r] of [[5, 6, 1.3], [17, 4, 1], [27, 11, 1.4], [10, 17, 1], [22, 22, 1.2], [4, 27, 1], [15, 29, 1.3], [29, 28, 0.9]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Rocher : petits traits obliques, comme les hachures de rocher des cartes de randonnée, en plus discret
  'montis-motif-rocher': (g) => {
    g.strokeStyle = 'rgba(96, 92, 86, 0.42)';
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    for (const [x, y] of [[4, 8], [18, 4], [11, 19], [25, 15], [5, 28], [21, 27]]) {
      g.beginPath();
      g.moveTo(x, y + 4);
      g.lineTo(x + 4, y);
      g.stroke();
    }
  },
  // Zone humide : tirets bleus horizontaux en quinconce
  'montis-motif-humide': (g) => {
    g.strokeStyle = 'rgba(70, 140, 190, 0.6)';
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    for (const [x, y] of [[3, 8], [19, 8], [11, 24], [27, 24]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 7, y);
      g.stroke();
    }
  },
};

// Triangle des sommets en champ de distance (SDF), pour que le style le colore : brun-violet le jour, clair la nuit
export const IMAGE_SOMMET = 'montis-sommet';
function triangleSommet() {
  const t = 28;
  const [a, b, c] = [[14, 7], [21, 20], [7, 20]];
  // Distance d'un point à un segment
  const segment = (x, y, [x1, y1], [x2, y2]) => {
    const u = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
    return Math.hypot(x - x1 - u * (x2 - x1), y - y1 - u * (y2 - y1));
  };
  const cote = (x, y, [x1, y1], [x2, y2]) => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
  const image = new ImageData(t, t);
  for (let y = 0; y < t; y++) {
    for (let x = 0; x < t; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const dedans = cote(px, py, a, b) >= 0 && cote(px, py, b, c) >= 0 && cote(px, py, c, a) >= 0;
      const d = Math.min(segment(px, py, a, b), segment(px, py, b, c), segment(px, py, c, a)) * (dedans ? -1 : 1);
      image.data[(y * t + x) * 4 + 3] = Math.max(0, Math.min(255, Math.round(255 * (0.75 - d / 8))));
    }
  }
  return image;
}

// Sommets : nom en gras, altitude dans la couleur d'accent (violet le jour, cyan la nuit)
const SOMMET_JOUR = { accent: '#8b3fd9' };
export const SOMMET_NUIT = { accent: '#5ee6ff' };
export const texteSommetMontis = (nuit = false) =>
  expressionSommet(undefined, { 'font-scale': 0.9, 'text-color': (nuit ? SOMMET_NUIT : SOMMET_JOUR).accent });
const tailleSommet = (base) => ['case', ['>=', ['to-number', ['get', 'ele'], 0], 4000], base + 2.5, ['>=', ['to-number', ['get', 'ele'], 0], 3000], base + 1, base];

export function ajouterMotifsMontis(map) {
  if (!map.hasImage(IMAGE_SOMMET)) map.addImage(IMAGE_SOMMET, triangleSommet(), { pixelRatio: 2, sdf: true });
  for (const [nom, tracer] of Object.entries(MOTIFS)) {
    if (map.hasImage(nom)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const g = canvas.getContext('2d');
    tracer(g);
    const image = g.getImageData(0, 0, 32, 32);
    map.addImage(nom, image, { pixelRatio: 2 });
    // Version de nuit : mêmes traits, éclaircis pour se lire sur le fond sombre
    const nuit = new ImageData(new Uint8ClampedArray(image.data), 32, 32);
    for (let i = 0; i < nuit.data.length; i += 4) {
      if (!nuit.data[i + 3]) continue;
      const bleu = nom.includes('humide');
      nuit.data[i] = bleu ? 60 : 150;
      nuit.data[i + 1] = bleu ? 200 : 160;
      nuit.data[i + 2] = bleu ? 235 : 195;
    }
    map.addImage(`${nom}-nuit`, nuit, { pixelRatio: 2 });
  }
}

// Routes : largeur par classe et par zoom, le cerne déborde du trait
const CLASSES_ROUTES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
const LARGEURS = {
  //          zoom 5  8    10   12   14   17
  motorway: [0.8, 1.4, 2, 3.2, 5.5, 13],
  trunk: [0.6, 1.2, 1.8, 3, 5, 12],
  primary: [0.4, 0.9, 1.5, 2.6, 4.5, 11],
  secondary: [0, 0.5, 1.1, 2.2, 4, 10],
  tertiary: [0, 0, 0.7, 1.7, 3.4, 9],
  minor: [0, 0, 0.3, 1.1, 2.6, 7.5],
  service: [0, 0, 0, 0.5, 1.4, 4],
};
const ZOOMS_ROUTES = [5, 8, 10, 12, 14, 17];
function largeurRoute(cerne) {
  const etapes = ZOOMS_ROUTES.flatMap((zoom, i) => {
    const valeurs = Object.entries(LARGEURS).flatMap(([classe, l]) => [classe, l[i] && cerne ? l[i] + (zoom >= 12 ? 1.6 : 0.8) : l[i]]);
    return [zoom, ['match', ['get', 'class'], ...valeurs, 0]];
  });
  return ['interpolate', ['exponential', 1.4], ['zoom'], ...etapes];
}

// Versions comparées pendant le lot 0.9 : couleurs franches de l'IGN, juste milieu, routes claires d'appli moderne
const VERSIONS_ROUTES = {
  ign: {
    cerne: '#8f8377',
    couleurs: { motorway: '#d9433a', trunk: '#d9433a', primary: '#ea7a3c', secondary: '#f3c24f', tertiary: '#fbe8a6', minor: '#ffffff', service: '#ffffff' },
  },
  // Juste milieu choisi par le propriétaire (14 novembre 2026) : la hiérarchie de l'IGN, en couleurs adoucies
  milieu: {
    cerne: '#a99f92',
    couleurs: { motorway: '#df6656', trunk: '#e37d58', primary: '#eea466', secondary: '#f4cd7c', tertiary: '#faeac2', minor: '#ffffff', service: '#ffffff' },
  },
  // Encore plus doux (demande du 14 novembre 2026)
  doux: {
    cerne: '#b9b0a4',
    couleurs: { motorway: '#e99482', trunk: '#eda485', primary: '#f2c196', secondary: '#f7dfab', tertiary: '#fbf0d6', minor: '#ffffff', service: '#ffffff' },
  },
  // Couleurs de la DA de Montis (violets du logo), en version de jour : le violet n'est pris par rien
  // d'autre sur une carte de montagne (eau et glace bleues, forêts vertes, sentiers rouges)
  montis: {
    // Un peu plus profond que le premier essai, trop effacé (demande du propriétaire du 14 novembre 2026)
    cerne: '#a596b3',
    couleurs: { motorway: '#9259cc', trunk: '#9f6bd3', primary: '#b282dd', secondary: '#d0afea', tertiary: '#e8d7f3', minor: '#ffffff', service: '#ffffff' },
  },
  moderne: {
    cerne: '#cbc2b4',
    couleurs: { motorway: '#f0a565', trunk: '#f3b878', primary: '#f7d398', secondary: '#ffffff', tertiary: '#ffffff', minor: '#ffffff', service: '#fbf9f5' },
  },
};
export const VERSION_ROUTES = 'montis';
const ROUTES = VERSIONS_ROUTES[VERSION_ROUTES];

const sousClasses = (valeurs) => ['in', ['get', 'subclass'], ['literal', valeurs]];

const NOM_EAU = {
  'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
  'text-font': POLICE_ITALIQUE,
  'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10.5, 14, 14],
  'text-letter-spacing': 0.08,
  'text-padding': 4,
};
const PEINTURE_EAU = { 'text-color': '#1c6aa6', 'text-halo-color': '#f6f5f8', 'text-halo-width': 1.4 };

export const STYLE_MONTIS = {
  version: 8,
  glyphs: `${ADRESSE_POLICES}/{fontstack}/{range}.pbf`,
  sources: {
    [SOURCE_VECTEUR]: definitionSourceVecteur(),
  },
  layers: [
    { id: 'montis-background', type: 'background', paint: { 'background-color': '#e8e6ec' } },
    {
      id: 'montis-landuse',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landuse',
      filter: classes(['park', 'nature_reserve', 'wood', 'forest', 'cemetery', 'allotments']),
      paint: { 'fill-color': '#b7d6a3', 'fill-opacity': 0.8 },
    },
    {
      id: 'montis-landcover',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      filter: classes(['wood', 'forest', 'grass', 'scrub', 'ice', 'snow', 'rock', 'sand', 'wetland']),
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          ['wood', 'forest'],
          '#84bd7a',
          ['grass', 'scrub'],
          '#c6dcb0',
          ['ice', 'snow'],
          '#f2f7fc',
          'rock',
          '#cbc7d3',
          'sand',
          '#ede5cf',
          'wetland',
          '#c9e0df',
          '#c6dcb0',
        ],
        'fill-opacity': ['match', ['get', 'class'], ['ice', 'snow'], 0.95, ['wood', 'forest'], 0.9, 0.8],
      },
    },
    // Rochers et éboulis : le minéral des hauts versants, en motif fin au-dessus de la teinte
    {
      id: 'montis-rochers',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'rock'],
      paint: {
        'fill-pattern': ['match', ['get', 'subclass'], ['scree', 'shingle'], 'montis-motif-eboulis', 'montis-motif-rocher'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 14, 1],
      },
    },
    {
      id: 'montis-zones-humides',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'wetland'],
      paint: { 'fill-pattern': 'montis-motif-humide', 'fill-opacity': 0.8 },
    },
    // Ombrage éclairé de plusieurs côtés : les versants se lisent sans noircir la carte.
    // Ombres bleutées, lumière chaude, comme sur les cartes de montagne.
    {
      id: 'montis-relief',
      type: 'hillshade',
      source: 'ombrage', // source de relief déclarée dans main.js
      paint: {
        'hillshade-method': 'multidirectional',
        'hillshade-illumination-direction': [315, 270, 0, 350],
        'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': exagerationReliefMontis(),
        'hillshade-shadow-color': ['rgba(40, 50, 86, 0.78)', 'rgba(54, 58, 86, 0.32)', 'rgba(54, 58, 86, 0.32)', 'rgba(54, 58, 86, 0.2)'],
        'hillshade-highlight-color': ['rgba(255, 250, 240, 0.45)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)'],
        'hillshade-accent-color': 'rgba(0, 0, 0, 0)',
      },
    },
    // Contour des glaciers, au-dessus de l'ombrage pour rester net
    {
      id: 'montis-glaciers-bord',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      minzoom: 9,
      filter: ['==', ['get', 'class'], 'ice'],
      paint: {
        'line-color': '#6fa8d0',
        'line-opacity': 0.8,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.3],
      },
    },
    {
      id: 'montis-water',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'water',
      paint: { 'fill-color': '#5fb1dc', 'fill-opacity': 0.95 },
    },
    {
      id: 'montis-waterway',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'waterway',
      paint: {
        'line-color': '#3492c8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 14, 2.2],
      },
    },
    {
      id: 'montis-boundary',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 4],
      paint: {
        'line-color': '#a996b8',
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 10, 1.2],
        'line-dasharray': [2, 2],
      },
    },
    {
      id: 'montis-building',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#d5d1da', 'fill-opacity': 0.8 },
    },
    // Contour « laser » des bâtiments, seulement de nuit et avec l'élément Bâtiments (fond-palette.js)
    {
      id: 'montis-batiments-lueur',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      minzoom: 14,
      layout: { visibility: 'none' },
      paint: { 'line-color': '#3ee8ff', 'line-opacity': 0.35, 'line-width': 4, 'line-blur': 3 },
    },
    {
      id: 'montis-batiments-contour',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      minzoom: 14,
      layout: { visibility: 'none' },
      paint: { 'line-color': '#7ff3ff', 'line-opacity': 0.9, 'line-width': 0.8 },
    },
    {
      id: 'montis-road-casing',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: classes(CLASSES_ROUTES),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ROUTES.cerne,
        'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.35, 1],
        'line-width': largeurRoute(true),
      },
    },
    {
      id: 'montis-road',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: classes(CLASSES_ROUTES),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], ...Object.entries(ROUTES.couleurs).flat(), ROUTES.couleurs.minor],
        'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.45, 1],
        'line-width': largeurRoute(false),
      },
    },
    // Chemins carrossables : trait continu brun clair, entre la route et le sentier
    {
      id: 'montis-chemins',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'track'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#6e6359', // gris-brun : ne pas confondre avec les courbes
        'line-opacity': 0.8,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 14, 1.3, 17, 2.6],
      },
    },
    // Sentiers : tireté rouge des cartes de randonnée, posé sur un liseré couleur papier qui le détache
    // de l'ombrage et des courbes
    {
      id: 'montis-sentiers-lisere',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: classes(['path', 'footway', 'bridleway', 'steps']),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#f5f4f7',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 15, 0.7],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 4, 17, 6],
      },
    },
    {
      id: 'montis-path',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      minzoom: 10,
      filter: ['all', classes(['path', 'footway', 'bridleway']), ['!=', ['get', 'subclass'], 'steps']],
      paint: {
        // Les trottoirs et allées (footway, surtout en ville) restent discrets : le rouge est pour les sentiers
        'line-color': ['match', ['get', 'subclass'], ['footway', 'pedestrian', 'sidewalk'], '#9a918a', '#c4442f'],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 13, 0.95],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 0.6,
          13, ['match', ['get', 'subclass'], ['footway', 'pedestrian', 'sidewalk'], 0.6, 1.1],
          15, ['match', ['get', 'subclass'], ['footway', 'pedestrian', 'sidewalk'], 0.9, 1.7],
          17, ['match', ['get', 'subclass'], ['footway', 'pedestrian', 'sidewalk'], 1.3, 2.4],
        ],
        'line-dasharray': [2.4, 1.4],
      },
    },
    // Marches et passages équipés : tireté serré, plus foncé
    {
      id: 'montis-marches',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      minzoom: 13,
      filter: ['any', ['==', ['get', 'class'], 'steps'], ['==', ['get', 'subclass'], 'steps']],
      paint: {
        'line-color': '#8f2a1c',
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.4, 17, 3],
        'line-dasharray': [0.6, 0.6],
      },
    },
    // Noms des lacs (certains sont des lignes, l'axe du lac, d'autres des points) et des rivières : toujours là
    {
      id: 'montis-eau-noms-ligne',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'water_name',
      minzoom: 8,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['any', ['has', 'name'], ['has', 'name:fr']]],
      // Placé comme un point : le long de l'axe, le nom d'un grand lac ne tenait pas dans une tuile et disparaissait
      layout: { ...NOM_EAU, 'text-max-width': 7 },
      paint: PEINTURE_EAU,
    },
    {
      id: 'montis-eau-noms-point',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'water_name',
      minzoom: 8,
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['any', ['has', 'name'], ['has', 'name:fr']]],
      layout: { ...NOM_EAU, 'text-max-width': 7 },
      paint: PEINTURE_EAU,
    },
    {
      id: 'montis-rivieres-noms',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'waterway',
      minzoom: 10,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['river', 'canal', 'stream']]], ['!=', ['get', 'brunnel'], 'tunnel'], ['any', ['has', 'name'], ['has', 'name:fr']]],
      layout: { ...NOM_EAU, 'symbol-placement': 'line', 'symbol-spacing': 320, 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 12.5] },
      paint: PEINTURE_EAU,
    },
    {
      id: 'montis-place',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: classes(['city', 'town', 'village', 'hamlet', 'suburb']),
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': ['case', ['in', ['get', 'class'], ['literal', ['city', 'town']]], ['literal', POLICE_GRAS], ['literal', POLICE]],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 13],
        'text-max-width': 8,
        'text-padding': 4,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: {
        'text-color': '#232b45',
        'text-halo-color': '#f6f5f8',
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'montis-summit',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'mountain_peak',
      minzoom: 9,
      filter: ['any', ['has', 'name'], ['has', 'name:fr']],
      layout: {
        // Un col (saddle) garde son nom et son altitude, sans triangle
        'icon-image': ['case', ['==', ['get', 'class'], 'saddle'], '', IMAGE_SOMMET],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 14, 1],
        // Les plus hauts d'abord : ce sont eux qui restent quand la place manque
        'symbol-sort-key': ['-', 0, ['to-number', ['get', 'ele'], 0]],
        'text-field': texteSommetMontis(),
        'text-font': POLICE_GRAS,
        // Plus le sommet est haut, plus son nom est grand
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, tailleSommet(10.5), 14, tailleSommet(13)],
        'text-letter-spacing': 0.02,
        'text-anchor': 'top',
        'text-offset': [0, 0.45],
        'text-max-width': 8,
        'text-line-height': 1.15,
        'text-padding': 5,
      },
      paint: {
        'icon-color': SOMMET_JOUR.accent,
        'icon-halo-color': '#f6f5f8',
        'icon-halo-width': 1.2,
        'text-color': '#2f2350',
        'text-halo-color': '#f6f5f8',
        'text-halo-width': 1.5,
      },
    },
  ],
};
