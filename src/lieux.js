import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';


const POLICE = ['Open Sans Regular', 'Arial Unicode MS Regular'];

// Du moins important au plus important : les derniers calques ajoutés
// sont placés en premier, donc gagnent en cas de manque de place.
// tailles = [zoom A, taille A, zoom B, taille B]
const NIVEAUX = [
  { id: 'lieux-hameaux', classes: ['hamlet'], minzoom: 11, tailles: [11, 10, 15, 13] },
  { id: 'lieux-villages', classes: ['village'], minzoom: 9, tailles: [9, 10, 14, 15] },
  { id: 'lieux-bourgs', classes: ['town'], minzoom: 7, tailles: [7, 11, 13, 17] },
  { id: 'lieux-villes', classes: ['city'], minzoom: 4, tailles: [4, 12, 12, 20] },
];

function definition(n) {
  return {
    id: n.id,
    type: 'symbol',
    source: SOURCE_VECTEUR,
    'source-layer': 'place',
    minzoom: n.minzoom,
    filter: ['in', ['get', 'class'], ['literal', n.classes]],
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': POLICE,
      'text-size': ['interpolate', ['linear'], ['zoom'], n.tailles[0], n.tailles[1], n.tailles[2], n.tailles[3]],
      'text-max-width': 8,
      'text-padding': 2,
      'symbol-sort-key': ['to-number', ['get', 'rank'], 99], // les plus peuplés d'abord
    },
    paint: {
      'text-color': '#222222',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.6,
    },
  };
}

export function afficherVilles(map, visible) {
  assurerSourceVecteur(map);
  for (const n of NIVEAUX) {
    if (!map.getLayer(n.id)) map.addLayer(definition(n));
    map.setLayoutProperty(n.id, 'visibility', visible ? 'visible' : 'none');
  }
}

// ---------- Refuges et cabanes (fichier préparé à l'avance : public/data/refuges.json) ----------
const SOURCE_REFUGES = 'refuges-osm';
const COUCHE_REFUGES = 'lieux-refuges';
const ICONE_GARDE = 'refuge-icone';
const ICONE_LIBRE = 'refuge-libre-icone';
const ZOOM_MIN_REFUGES = 7;

// Pastille ronde avec une petite maison blanche
function creerIconeRefuge(couleur) {
  const t = 26;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.arc(t / 2, t / 2, t / 2 - 1.5, 0, Math.PI * 2);
  g.fillStyle = couleur;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(13, 6.5);
  g.lineTo(19.5, 12.5);
  g.lineTo(17.5, 12.5);
  g.lineTo(17.5, 19);
  g.lineTo(8.5, 19);
  g.lineTo(8.5, 12.5);
  g.lineTo(6.5, 12.5);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, t, t);
}

export function afficherRefuges(map, visible) {
  if (!map.getSource(SOURCE_REFUGES)) {
    const url = new URL('/data/refuges.json', window.location.origin).href;
    map.addSource(SOURCE_REFUGES, {
      type: 'geojson',
      data: url,
      attribution: 'Refuges : © contributeurs OpenStreetMap',
    });
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok) console.warn('Refuges : fichier introuvable. Lance : node scripts/extraire-refuges.mjs');
      })
      .catch(() => {});
  }

  if (!map.hasImage(ICONE_GARDE)) map.addImage(ICONE_GARDE, creerIconeRefuge('#b8442f'), { pixelRatio: 2 });
  if (!map.hasImage(ICONE_LIBRE)) map.addImage(ICONE_LIBRE, creerIconeRefuge('#8a6d3b'), { pixelRatio: 2 });

  if (!map.getLayer(COUCHE_REFUGES)) {
    map.addLayer({
      id: COUCHE_REFUGES,
      type: 'symbol',
      source: SOURCE_REFUGES,
      minzoom: ZOOM_MIN_REFUGES,
      layout: {
        visibility: 'none',
        'icon-image': ['match', ['get', 'genre'], 'garde', ICONE_GARDE, ICONE_LIBRE],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 1],
        // De loin, les icônes ne se chevauchent pas ; de près, on les montre toutes
        'icon-allow-overlap': ['step', ['zoom'], false, 11, true],
        'text-field': ['step', ['zoom'], '', 10, ['get', 'name']],
        'text-font': POLICE,
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 12],
        'text-anchor': 'top',
        'text-offset': [0, 0.9],
        'text-max-width': 8,
        'text-optional': true,
        // Les refuges gardés passent en premier
        'symbol-sort-key': ['match', ['get', 'genre'], 'garde', 0, 1],
      },
      paint: {
        'text-color': '#7a2e1d',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.6,
      },
    });
  }

  map.setLayoutProperty(COUCHE_REFUGES, 'visibility', visible ? 'visible' : 'none');
}