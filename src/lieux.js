import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { interroger } from './overpass.js';

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

// ---------- Refuges et cabanes (OpenStreetMap, via Overpass) ----------
const SOURCE_REFUGES = 'refuges-osm';
const COUCHE_REFUGES = 'lieux-refuges';
const ICONE_GARDE = 'refuge-icone';
const ICONE_LIBRE = 'refuge-libre-icone';
const ZOOM_MIN_REFUGES = 8;
const ZOOM_DALLE = 8; // la carte est découpée en dalles de cette taille
const DELAI_RETENTE = 30000; // après un échec, on attend 30 s avant de réessayer

const cacheDalles = new Map(); // « x/y » -> entités déjà chargées
const enCours = new Set();
const echecs = new Map();
let refugesActifs = false;
let ecouteurRefuges = null;

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

// Calculs de dalles (même découpage que les cartes en ligne)
const tuileX = (lng, n) => Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)));
const tuileY = (lat, n) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
};
const lngDeX = (x, n) => (x / n) * 360 - 180;
const latDeY = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

function collection() {
  return { type: 'FeatureCollection', features: [...cacheDalles.values()].flat() };
}

function majSource(map) {
  const source = map.getSource(SOURCE_REFUGES);
  if (source) source.setData(collection());
}

function versEntites(elements) {
  const entites = [];
  for (const el of elements) {
    const t = el.tags || {};
    const lat = el.lat ?? (el.center && el.center.lat);
    const lng = el.lon ?? (el.center && el.center.lon);
    if (lat == null || lng == null) continue;
    entites.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        name: t.name || '',
        genre: t.tourism === 'alpine_hut' ? 'garde' : 'libre',
        ele: t.ele || '',
      },
    });
  }
  return entites;
}

async function chargerDalle(map, dalle) {
  const n = 2 ** ZOOM_DALLE;
  const ouest = lngDeX(dalle.x, n);
  const est = lngDeX(dalle.x + 1, n);
  const nord = latDeY(dalle.y, n);
  const sud = latDeY(dalle.y + 1, n);
  const zone = `${sud.toFixed(5)},${ouest.toFixed(5)},${nord.toFixed(5)},${est.toFixed(5)}`;
  const requete =
    `[out:json][timeout:25];(` +
    `nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${zone});` +
    `nwr["amenity"="shelter"]["shelter_type"="basic_hut"](${zone});` +
    `);out center tags;`;

  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), 40000);
  try {
    const json = await interroger(requete, controleur.signal);
    cacheDalles.set(dalle.cle, versEntites(json.elements || []));
    echecs.delete(dalle.cle);
    majSource(map);
  } catch (e) {
    echecs.set(dalle.cle, Date.now());
    console.warn('Refuges : dalle non chargée', dalle.cle, e);
  } finally {
    clearTimeout(delai);
    enCours.delete(dalle.cle);
  }
}

// Charge les dalles visibles qui ne le sont pas encore
async function chargerZone(map) {
  if (!refugesActifs || map.getZoom() < ZOOM_MIN_REFUGES) return;

  const b = map.getBounds();
  const n = 2 ** ZOOM_DALLE;
  const x0 = tuileX(b.getWest(), n);
  const x1 = tuileX(b.getEast(), n);
  const y0 = tuileY(b.getNorth(), n);
  const y1 = tuileY(b.getSouth(), n);

  const aCharger = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const cle = `${x}/${y}`;
      if (cacheDalles.has(cle) || enCours.has(cle)) continue;
      if (Date.now() - (echecs.get(cle) || 0) < DELAI_RETENTE) continue;
      aCharger.push({ x, y, cle });
    }
  }
  if (aCharger.length === 0 || aCharger.length > 12) return; // rien à faire, ou zone trop grande

  aCharger.forEach((d) => enCours.add(d.cle));
  for (const dalle of aCharger) await chargerDalle(map, dalle);
}

export function afficherRefuges(map, visible) {
  refugesActifs = visible;

  if (!map.getSource(SOURCE_REFUGES)) {
    map.addSource(SOURCE_REFUGES, {
      type: 'geojson',
      data: collection(),
      attribution: 'Refuges : © contributeurs OpenStreetMap',
    });
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
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.65, 12, 1],
        // Aux petits zooms, les icônes ne se chevauchent pas ; de près, on les montre toutes
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

  if (!ecouteurRefuges) {
    ecouteurRefuges = () => chargerZone(map);
    map.on('moveend', ecouteurRefuges);
  }
  if (visible) chargerZone(map);
}