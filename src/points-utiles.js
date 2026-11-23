// Points utiles du fond Montis, lus dans les tuiles (couche poi) : parkings, abris, points d'eau.
// Éléments de la carte, éteints par défaut (décision du propriétaire du 16 novembre 2026).
// Pictos dans la DA de Montis, comme les icônes d'activités : carré arrondi bleu nuit, liseré cyan → magenta,
// signe clair dégradé. Lisibles de jour comme de nuit.
import { SOURCE_VECTEUR } from './source-vecteur.js';

const TAILLE = 40; // px de l'image, affichée en 20 px (pixelRatio 2)

const SIGNES = {
  parking(g) {
    g.font = 'bold 25px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', 20, 21.5);
  },
  shelter(g) {
    // Toit et murs d'un abri, porte ouverte
    g.beginPath();
    g.moveTo(9, 20);
    g.lineTo(20, 10);
    g.lineTo(31, 20);
    g.closePath();
    g.fill();
    g.beginPath();
    g.rect(12.5, 20, 15, 10);
    g.rect(17.5, 23, 5, 7);
    g.fill('evenodd');
  },
  drinking_water(g) {
    // Goutte
    g.beginPath();
    g.moveTo(20, 8.5);
    g.bezierCurveTo(24, 15, 28.5, 19.5, 28.5, 24);
    g.arc(20, 24, 8.5, 0, Math.PI);
    g.bezierCurveTo(11.5, 19.5, 16, 15, 20, 8.5);
    g.fill();
  },
};

// Canevas du picto d'une classe (aussi en tête de la fiche d'un parking)
export function dessinerPicto(classe) {
  const canvas = document.createElement('canvas');
  canvas.width = TAILLE;
  canvas.height = TAILLE;
  const g = canvas.getContext('2d');
  const fond = g.createRadialGradient(20, 16, 2, 20, 20, 26);
  fond.addColorStop(0, '#17234f');
  fond.addColorStop(1, '#0a1020');
  const bord = g.createLinearGradient(0, 0, TAILLE, TAILLE);
  bord.addColorStop(0, '#22d3ee');
  bord.addColorStop(1, '#c026d3');
  g.beginPath();
  g.roundRect(2.5, 2.5, 35, 35, 10);
  g.fillStyle = fond;
  g.fill();
  g.lineWidth = 2.6;
  g.strokeStyle = bord;
  g.stroke();
  const signe = g.createLinearGradient(8, 8, 32, 32);
  signe.addColorStop(0, '#9defff');
  signe.addColorStop(1, '#f0abfc');
  g.fillStyle = signe;
  SIGNES[classe](g);
  return canvas;
}

const imageDe = (classe) => `montis-picto-${classe}`;

export function ajouterPictos(map) {
  for (const classe of Object.keys(SIGNES)) {
    if (map.hasImage(imageDe(classe))) continue;
    const canvas = dessinerPicto(classe);
    map.addImage(imageDe(classe), canvas.getContext('2d').getImageData(0, 0, TAILLE, TAILLE), { pixelRatio: 2 });
  }
}

// Clé de l'élément de la carte → couche du style et classe de la couche poi
export const POINTS_UTILES = {
  parkings: { couche: 'montis-parkings', classe: 'parking', defaut: false, rang: 2 },
  abris: { couche: 'montis-abris', classe: 'shelter', defaut: false, rang: 1 },
  'points-eau': { couche: 'montis-points-eau', classe: 'drinking_water', defaut: false, rang: 0 },
};
export const COUCHES_POINTS_UTILES = Object.values(POINTS_UTILES).map((p) => p.couche);

export function couchesPointsUtiles() {
  return Object.values(POINTS_UTILES).map(({ couche, classe, defaut, rang }) => ({
    id: couche,
    type: 'symbol',
    source: SOURCE_VECTEUR,
    'source-layer': 'poi',
    minzoom: 14, // les tuiles n'ont les points utiles qu'à partir du zoom 14
    filter: ['==', ['get', 'class'], classe],
    layout: {
      visibility: defaut ? 'visible' : 'none',
      'icon-image': imageDe(classe),
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.75, 17, 1],
      'icon-padding': 2,
      // L'eau et les abris passent avant les parkings quand la place manque
      'symbol-sort-key': rang,
    },
  }));
}

export function afficherPointUtile(map, cle, visible) {
  const { couche } = POINTS_UTILES[cle];
  if (map.getLayer(couche)) map.setLayoutProperty(couche, 'visibility', visible ? 'visible' : 'none');
}
