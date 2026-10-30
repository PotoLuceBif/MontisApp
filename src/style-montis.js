import { SOURCE_VECTEUR } from './source-vecteur.js';

const classes = (valeurs) => ['in', ['get', 'class'], ['literal', valeurs]];

export const CALQUES_MONTIS = [
  'montis-background',
  'montis-landuse',
  'montis-landcover',
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

export const STYLE_MONTIS = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    [SOURCE_VECTEUR]: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution:
        '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> · Données © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: 'montis-background', type: 'background', paint: { 'background-color': '#f2efe6' } },
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
      filter: classes(['wood', 'forest', 'grass', 'scrub', 'ice', 'snow']),
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          ['wood', 'forest'],
          '#d9e7ce',
          ['grass', 'scrub'],
          '#e6ecd9',
          ['ice', 'snow'],
          '#e8f0ed',
          '#e6ecd9',
        ],
        'fill-opacity': 0.75,
      },
    },
    {
      id: 'montis-water',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'water',
      paint: { 'fill-color': '#b9dbe0', 'fill-opacity': 0.94 },
    },
    {
      id: 'montis-waterway',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'waterway',
      paint: {
        'line-color': '#a5ced6',
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
          ['get', 'ele'],
          ' m',
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
