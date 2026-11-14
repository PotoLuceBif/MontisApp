import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { peindreCoucheFond } from './fond-palette.js';

const COUCHE = 'batiments-3d';

export function afficherBatiments(map, visible) {
  assurerSourceVecteur(map);

  if (!map.getLayer(COUCHE)) {
    map.addLayer({
      id: COUCHE,
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 14,
      layout: { visibility: 'none' },
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'render_height'],
          0, '#e3e0e6', 30, '#d0cbd6', 100, '#b6aec0',
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0, 15.5, ['get', 'render_height'],
        ],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.9,
      },
    });
    peindreCoucheFond(map, COUCHE);
  }

  map.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
}