import { POLICE } from './polices.js';
import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { peindreCoucheFond } from './fond-palette.js';

// Les remplissages sont insérés sous l'ombrage et les courbes de niveau ;
// les noms (haut: true) passent au-dessus de tout pour rester lisibles.
const AVANT = 'ombrage';

// ---------- Motifs dessinés à la volée ----------
function dessiner(taille, tracer) {
  const canvas = document.createElement('canvas');
  canvas.width = taille;
  canvas.height = taille;
  const g = canvas.getContext('2d');
  tracer(g, taille);
  return g.getImageData(0, 0, taille, taille);
}

// Petits arbres (ronds sombres, deux par motif, décalés)
const motifForet = () =>
  dessiner(24, (g) => {
    g.fillStyle = 'rgba(20, 70, 25, 0.9)';
    for (const [x, y] of [[6, 6], [18, 15]]) {
      g.beginPath();
      g.arc(x, y, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  });

// Hachures diagonales blanches
const motifGlace = () =>
  dessiner(24, (g, t) => {
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 2;
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      g.beginPath();
      g.moveTo(k * t, t);
      g.lineTo(k * t + t, 0);
      g.stroke();
    }
  });

// ---------- Définition des groupes ----------
const FORETS = {
  images: [{ nom: 'motif-foret', creer: motifForet }],
  couches: [
    {
      id: 'nature-forets',
      type: 'fill',
      'source-layer': 'landcover',
      minzoom: 7,
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': '#2e7d32',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.25, 13, 0.35],
      },
    },
    {
      id: 'nature-forets-motif',
      type: 'fill',
      'source-layer': 'landcover',
      minzoom: 11,
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-pattern': 'motif-foret', 'fill-opacity': 0.55 },
    },
    {
      id: 'nature-forets-bord',
      type: 'line',
      'source-layer': 'landcover',
      minzoom: 9,
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'line-color': '#1b5e20',
        'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.2],
      },
    },
  ],
};

const EAUX = {
  couches: [
    {
      id: 'nature-lacs',
      type: 'fill',
      'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      minzoom: 6,
      // Plus loin, l'image du globe montre l'eau (claire le jour, sombre la nuit) : la couche s'efface
      paint: { 'fill-color': '#4a9be8', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8.5, 0.5] },
    },
    {
      id: 'nature-lacs-bord',
      type: 'line',
      'source-layer': 'water',
      minzoom: 6,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'line-color': '#1d5fa6',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8.5, 0.85],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 14, 1.5],
      },
    },
    {
      id: 'nature-rivieres',
      type: 'line',
      'source-layer': 'waterway',
      minzoom: 7,
      filter: ['in', ['get', 'class'], ['literal', ['river', 'stream', 'canal']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#2f7fd1',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8.5, 0.85],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          7, ['match', ['get', 'class'], 'river', 1, 0.4],
          14, ['match', ['get', 'class'], 'river', 3.5, 'canal', 2.5, 1.6],
        ],
      },
    },
    // Les noms des lacs et des rivières sont dans le fond Montis lui-même (style-montis.js)
  ],
};

const GLACIERS = {
  images: [{ nom: 'motif-glace', creer: motifGlace }],
  couches: [
    {
      id: 'nature-glaciers',
      type: 'fill',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'fill-color': '#d6f0ff', 'fill-opacity': 0.6 },
    },
    {
      id: 'nature-glaciers-motif',
      type: 'fill',
      'source-layer': 'landcover',
      minzoom: 9,
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'fill-pattern': 'motif-glace', 'fill-opacity': 0.8 },
    },
    {
      id: 'nature-glaciers-bord',
      type: 'line',
      'source-layer': 'landcover',
      minzoom: 8,
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'line-color': '#4fa8e0', 'line-opacity': 0.9, 'line-width': 1.2 },
    },
  ],
};
const PARCS = {
  couches: [
    {
      id: 'nature-parcs',
      type: 'fill',
      'source-layer': 'park',
      minzoom: 4,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': '#12a05c',
        'fill-opacity': ['match', ['get', 'class'], 'national_park', 0.28, 0.18],
      },
    },
    // Halo lumineux le long des limites
    {
      id: 'nature-parcs-halo',
      type: 'line',
      'source-layer': 'park',
      minzoom: 4,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#2fd17e',
        'line-opacity': 0.45,
        'line-blur': 3,
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 12, 9],
      },
    },
    {
      id: 'nature-parcs-bord',
      type: 'line',
      'source-layer': 'park',
      minzoom: 4,
      filter: ['==', ['geometry-type'], 'Polygon'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#0a6b3d',
        'line-opacity': 1,
        'line-dasharray': [4, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.2, 12, 3],
      },
    },
    // Noms des parcs nationaux : en majuscules espacées
    {
      id: 'nature-parcs-noms-nationaux',
      type: 'symbol',
      'source-layer': 'park',
      minzoom: 6,
      haut: true,
      filter: [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['get', 'class'], 'national_park'],
        ['has', 'name'],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': POLICE,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 18],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
        'text-max-width': 8,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: { 'text-color': '#0a6b3d', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    },
    // Noms des autres zones protégées
    {
      id: 'nature-parcs-noms',
      type: 'symbol',
      'source-layer': 'park',
      minzoom: 9,
      haut: true,
      filter: [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['!=', ['get', 'class'], 'national_park'],
        ['has', 'name'],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': POLICE,
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 14, 14],
        'text-max-width': 8,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: { 'text-color': '#0a6b3d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
  ],
};

// ---------- Création et affichage ----------
function afficher(map, groupe, visible) {
  assurerSourceVecteur(map);

  for (const img of groupe.images || []) {
    if (!map.hasImage(img.nom)) map.addImage(img.nom, img.creer(), { pixelRatio: 2 });
  }

  for (const c of groupe.couches) {
    if (!map.getLayer(c.id)) {
      const { haut, ...definition } = c;
      map.addLayer(
        {
          ...definition,
          source: SOURCE_VECTEUR,
          layout: { ...(definition.layout || {}), visibility: 'none' },
        },
        haut ? undefined : AVANT
      );
      peindreCoucheFond(map, c.id);
    }
    map.setLayoutProperty(c.id, 'visibility', visible ? 'visible' : 'none');
  }
}

export const afficherForets = (map, visible) => afficher(map, FORETS, visible);
export const afficherEaux = (map, visible) => afficher(map, EAUX, visible);
export const afficherGlaciers = (map, visible) => afficher(map, GLACIERS, visible);
export const afficherParcs = (map, visible) => afficher(map, PARCS, visible);