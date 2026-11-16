// Voies ferrées et gares (Éléments de la carte › Construit), lues dans le fond vectoriel :
// aussi sur les autres fonds et hors ligne dans les zones téléchargées.
import { POLICE } from './polices.js';
import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { peindreCoucheFond } from './fond-palette.js';

export const COUCHES_RAILS = ['montis-rail', 'montis-rail-tirets'];
const COUCHE_GARES = 'gares';
const ICONE_GARE = 'icone-gare';
const ZOOM_MIN_GARES = 10;

// Les voies sont dessinées par le style du fond Montis : on ne fait que les montrer ou les cacher
export function afficherRails(map, visible) {
  COUCHES_RAILS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
}

// Pastille violette, rails blancs : se distingue des refuges (rouge, maison)
function creerIconeGare() {
  const t = 26;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.roundRect(1.5, 1.5, t - 3, t - 3, 6);
  g.fillStyle = '#5b3fa8';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  // Train vu de face : caisse, vitre, phares, puis les deux rails
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(8, 5.5, 10, 11, 2.5);
  g.fill();
  g.fillStyle = '#5b3fa8';
  g.fillRect(9.5, 7.5, 7, 4);
  g.beginPath();
  g.arc(10.5, 14, 1, 0, Math.PI * 2);
  g.arc(15.5, 14, 1, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(9.5, 17.5);
  g.lineTo(7, 21);
  g.moveTo(16.5, 17.5);
  g.lineTo(19, 21);
  g.stroke();
  return g.getImageData(0, 0, t, t);
}

export function afficherGares(map, visible) {
  assurerSourceVecteur(map);
  if (!map.hasImage(ICONE_GARE)) map.addImage(ICONE_GARE, creerIconeGare(), { pixelRatio: 2 });
  if (!map.getLayer(COUCHE_GARES)) {
    map.addLayer({
      id: COUCHE_GARES,
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'poi',
      minzoom: ZOOM_MIN_GARES,
      // Gares et haltes ferroviaires (pas les arrêts de bus ni de tram)
      filter: ['all', ['==', ['get', 'class'], 'railway'], ['in', ['get', 'subclass'], ['literal', ['station', 'halt']]]],
      layout: {
        visibility: 'none',
        'icon-image': ICONE_GARE,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 14, 1],
        'text-field': ['step', ['zoom'], '', 12, ['get', 'name']],
        'text-font': POLICE,
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 15, 12],
        'text-anchor': 'top',
        'text-offset': [0, 0.9],
        'text-max-width': 8,
        'text-optional': true,
        // Une gare passe avant une halte quand la place manque
        'symbol-sort-key': ['match', ['get', 'subclass'], 'station', 0, 1],
      },
      paint: {
        'text-color': '#3d2a78',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.6,
      },
    });
    peindreCoucheFond(map, COUCHE_GARES);
  }
  map.setLayoutProperty(COUCHE_GARES, 'visibility', visible ? 'visible' : 'none');
}
