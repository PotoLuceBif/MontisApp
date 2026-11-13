import { SOURCE_VECTEUR, definitionSourceVecteur } from './source-vecteur.js';
import { expressionAltitude } from './unites.js';

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
  'montis-path',
  'montis-place',
  'montis-summit',
];

// Couche vide posée par fond-de-carte.js : les calques (pentes, ombres, géologie…) s'insèrent juste en dessous,
// au-dessus des fonds, et restent au-dessus d'une carte nationale (sous les routes du fond Montis sinon)
export const REPERE_CALQUES = 'repere-calques';

// Ombrage du fond Montis, en 2D comme en 3D, plus léger de près où il brouillerait le détail
// (`facteur` : main.js l'efface près des pôles)
export const exagerationReliefMontis = (facteur = 1) => ['interpolate', ['linear'], ['zoom'], 9, 0.6 * facteur, 13, 0.5 * facteur, 16, 0.3 * facteur];

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

export function ajouterMotifsMontis(map) {
  for (const [nom, tracer] of Object.entries(MOTIFS)) {
    if (map.hasImage(nom)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const g = canvas.getContext('2d');
    tracer(g);
    map.addImage(nom, g.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
  }
}

const sousClasses = (valeurs) => ['in', ['get', 'subclass'], ['literal', valeurs]];

export const STYLE_MONTIS = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    [SOURCE_VECTEUR]: definitionSourceVecteur(),
  },
  layers: [
    { id: 'montis-background', type: 'background', paint: { 'background-color': '#f4f1ea' } },
    {
      id: 'montis-landuse',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landuse',
      filter: classes(['park', 'nature_reserve', 'wood', 'forest', 'cemetery', 'allotments']),
      paint: { 'fill-color': '#dce8d1', 'fill-opacity': 0.72 },
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
          '#c9dfb8',
          ['grass', 'scrub'],
          '#e6ecd5',
          ['ice', 'snow'],
          '#f4f8fb',
          'rock',
          '#e4e1da',
          'sand',
          '#efe4c6',
          'wetland',
          '#e1ece6',
          '#e6ecd5',
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
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 14, 0.9],
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
        'hillshade-shadow-color': ['rgba(46, 58, 92, 0.55)', 'rgba(60, 64, 88, 0.22)', 'rgba(60, 64, 88, 0.22)', 'rgba(60, 64, 88, 0.15)'],
        'hillshade-highlight-color': ['rgba(255, 246, 222, 0.32)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0)'],
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
      paint: { 'fill-color': '#a8d2ea', 'fill-opacity': 0.95 },
    },
    {
      id: 'montis-waterway',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'waterway',
      paint: {
        'line-color': '#7db8dc',
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
        'line-color': '#bd9988',
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
      paint: { 'fill-color': '#d8d1c3', 'fill-opacity': 0.74 },
    },
    {
      id: 'montis-road-casing',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: classes(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']),
      paint: {
        'line-color': '#fffdf8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 4.5, 16, 9],
      },
    },
    {
      id: 'montis-road',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: classes(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service']),
      paint: {
        'line-color': [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk'],
          '#d98e68',
          ['primary', 'secondary'],
          '#e6bd78',
          '#f7f3e9',
        ],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 2.2, 16, 5],
      },
    },
    {
      id: 'montis-path',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: classes(['path', 'track', 'footway', 'bridleway', 'steps']),
      paint: {
        'line-color': '#a7875d',
        'line-opacity': 0.78,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 15, 1.15],
        'line-dasharray': [1.4, 1.4],
      },
    },
    {
      id: 'montis-place',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: classes(['city', 'town', 'village', 'hamlet', 'suburb']),
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 12, 13],
        'text-max-width': 8,
        'text-padding': 4,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: {
        'text-color': '#394b43',
        'text-halo-color': '#f8f6ef',
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'montis-summit',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'mountain_peak',
      minzoom: 9,
      layout: {
        'text-field': [
          'concat',
          ['coalesce', ['get', 'name:fr'], ['get', 'name']],
          '\n',
          expressionAltitude(['get', 'ele']),
        ],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
        'text-allow-overlap': false,
        'text-padding': 5,
      },
      paint: {
        'text-color': '#725844',
        'text-halo-color': '#f7f4eb',
        'text-halo-width': 1.5,
      },
    },
  ],
};
