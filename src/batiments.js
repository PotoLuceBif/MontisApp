import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';

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
          0, '#e6dfd3', 30, '#d3c7b5', 100, '#b9a88f',
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0, 15.5, ['get', 'render_height'],
        ],
        'fill-extrusion-base': ['get', 'render_min_height'],
        'fill-extrusion-opacity': 0.9,
      },
    });
  }

  map.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
}