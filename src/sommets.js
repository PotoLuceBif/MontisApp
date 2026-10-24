import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';

const COUCHE = 'sommets';
const ICONE = 'sommet-triangle';

// Petit triangle sombre à bordure blanche, dessiné à la volée
function creerIcone() {
  const t = 20;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.moveTo(t / 2, 2);
  g.lineTo(t - 2, t - 3);
  g.lineTo(2, t - 3);
  g.closePath();
  g.fillStyle = '#3b2a1a';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  return g.getImageData(0, 0, t, t);
}

export function afficherSommets(map, visible) {
  assurerSourceVecteur(map);

  if (!map.hasImage(ICONE)) {
    map.addImage(ICONE, creerIcone(), { pixelRatio: 2 });
  }

  if (!map.getLayer(COUCHE)) {
    map.addLayer({
      id: COUCHE,
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'mountain_peak',
      minzoom: 9,
      filter: [
        'all',
        ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]],
        ['has', 'name'],
      ],
      layout: {
        visibility: 'none',
        'icon-image': ICONE,
        // Les sommets les plus hauts sont placés en premier (prioritaires)
        'symbol-sort-key': ['-', 0, ['to-number', ['get', 'ele'], 0]],
        'text-field': [
          'format',
          ['get', 'name'], {},
          '\n', {},
          ['case', ['has', 'ele'], ['concat', ['to-string', ['get', 'ele']], ' m'], ''],
          { 'font-scale': 0.85 },
        ],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 14, 13],
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'text-max-width': 8,
        'text-optional': true, // si le texte gêne, on garde au moins le triangle
      },
      paint: {
        'text-color': '#3b2a1a',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }

  map.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
}