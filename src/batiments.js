import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { peindreCoucheFond } from './fond-palette.js';

const COUCHE = 'batiments-3d';
const ZOOM_MIN = 13.5;

// Couleur d'OpenStreetMap quand elle est connue (building:colour), sinon un gris lavande selon la hauteur.
// Pas de motif de façade : MapLibre le pose aussi sur les toits (essayé le 14 novembre 2026, damiers de jour,
// toits entiers allumés de nuit).
const COULEUR_JOUR = [
  'case',
  ['has', 'colour'],
  ['to-color', ['get', 'colour'], '#d0cbd6'],
  ['interpolate', ['linear'], ['get', 'render_height'], 0, '#e3e0e6', 30, '#d0cbd6', 100, '#b6aec0'],
];

export function afficherBatiments(map, visible) {
  assurerSourceVecteur(map);

  if (!map.getLayer(COUCHE)) {
    map.addLayer({
      id: COUCHE,
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: ZOOM_MIN,
      layout: { visibility: 'none' },
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': COULEUR_JOUR,
        // Les bâtiments montent doucement en zoomant, plutôt que de surgir
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], ZOOM_MIN, 0, 15.5, ['get', 'render_height']],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    });
    peindreCoucheFond(map, COUCHE);
  }

  map.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
}
