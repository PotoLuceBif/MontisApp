// Accès à l'API de Waymarked Trails (itinéraires de randonnée d'OpenStreetMap)
const BASE = 'https://hiking.waymarkedtrails.org/api/v1';
const RAYON = 6378137; // rayon de la projection Web Mercator utilisée par l'API

// Niveaux d'itinéraires (champ « group » de l'API)
export const NIVEAUX = {
  INT: { court: 'Europe', couleur: '#7a4bb7', grand: true },
  NAT: { court: 'National', couleur: '#c0392b', grand: true },
  REG: { court: 'Régional', couleur: '#d9822b', grand: true },
  LOC: { court: 'Local', couleur: '#5d7a68', grand: false },
};
export const niveau = (groupe) =>
  NIVEAUX[groupe] || { court: 'Autre', couleur: '#6b706c', grand: false };

// Échelle de difficulté SAC (marquage des chemins)
const ORDRE_SAC = [
  'hiking',
  'mountain_hiking',
  'demanding_mountain_hiking',
  'alpine_hiking',
  'demanding_alpine_hiking',
  'difficult_alpine_hiking',
];
export const NOMS_SAC = [
  'T1 · Randonnée',
  'T2 · Randonnée de montagne',
  'T3 · Randonnée de montagne exigeante',
  'T4 · Randonnée alpine',
  'T5 · Randonnée alpine exigeante',
  'T6 · Randonnée alpine difficile',
];

// ---------- Conversions et distances ----------
export const mercatorVersLngLat = ([x, y]) => [
  (x / RAYON) * (180 / Math.PI),
  (2 * Math.atan(Math.exp(y / RAYON)) - Math.PI / 2) * (180 / Math.PI),
];

export const lngLatVersMercator = (lng, lat) => [
  RAYON * ((lng * Math.PI) / 180),
  RAYON * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

// Distance en mètres entre deux points [lng, lat]
export function distance(a, b) {
  const R = 6371008.8;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Appels à l'API (avec un peu de mémoire) ----------
function memoire(max) {
  const m = new Map();
  return {
    has: (k) => m.has(k),
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
      while (m.size > max) m.delete(m.keys().next().value);
    },
  };
}
const cacheListes = memoire(40);
const cacheDetails = memoire(4);

async function appeler(chemin, signal, cache) {
  if (cache.has(chemin)) return cache.get(chemin);
  const rep = await fetch(BASE + chemin, { signal });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const json = await rep.json();
  cache.set(chemin, json);
  return json;
}

function dedoublonner(liste) {
  const vus = new Set();
  return liste.filter((r) => r && r.id != null && !vus.has(r.id) && vus.add(r.id));
}

export async function chercher(texte, signal) {
  const json = await appeler(`/list/search?query=${encodeURIComponent(texte)}&limit=25`, signal, cacheListes);
  return dedoublonner(json.results || []);
}

export async function dansLaZone(limites, signal) {
  const [x0, y0] = lngLatVersMercator(limites.getWest(), limites.getSouth());
  const [x1, y1] = lngLatVersMercator(limites.getEast(), limites.getNorth());
  const bbox = [x0, y0, x1, y1].map(Math.round).join(',');
  let derniere = null;
  for (const limite of [40, 20]) {
    try {
      const json = await appeler(`/list/by_area?bbox=${bbox}&limit=${limite}`, signal, cacheListes);
      return dedoublonner(json.results || []);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      derniere = e;
    }
  }
  throw derniere;
}

export const detailsItineraire = (id, signal) => appeler(`/details/relation/${id}`, signal, cacheDetails);

// ---------- Extraction du tracé ----------
// Parcourt la structure de l'itinéraire et récolte tous les tronçons (objets ayant une géométrie)
function recolter(noeud, sortie, profondeur = 0) {
  if (!noeud || typeof noeud !== 'object' || profondeur > 8) return;
  if (Array.isArray(noeud)) {
    noeud.forEach((n) => recolter(n, sortie, profondeur + 1));
    return;
  }
  if (noeud.geometry && noeud.geometry.coordinates) {
    sortie.push(noeud);
    return;
  }
  for (const cle of Object.keys(noeud)) {
    if (cle !== 'tags' && cle !== 'geometry') recolter(noeud[cle], sortie, profondeur + 1);
  }
}

function lignesDe(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'LineString') return [geometrie.coordinates];
  if (geometrie.type === 'MultiLineString') return geometrie.coordinates;
  return [];
}

// Met les tronçons bout à bout pour obtenir une seule ligne (utile au profil d'altitude)
function assembler(troncons) {
  const chaine = [];
  for (const t of troncons) {
    for (const brut of lignesDe(t.geometry)) {
      let ligne = brut.map(mercatorVersLngLat);
      if (ligne.length < 2) continue;
      if (chaine.length) {
        const fin = chaine[chaine.length - 1];
        if (distance(fin, ligne[ligne.length - 1]) < distance(fin, ligne[0])) ligne = ligne.reverse();
        if (distance(fin, ligne[0]) < 1) ligne = ligne.slice(1);
      }
      for (const p of ligne) chaine.push(p);
    }
  }
  return chaine;
}

export function extraireTrace(details) {
  const route = details.route || {};
  const principaux = [];
  const annexes = [];
  recolter(route.main, principaux);
  recolter(route.appendices, annexes);
  if (!principaux.length && !annexes.length) recolter(route, principaux); // structure inhabituelle

  const lignes = [];
  for (const t of [...principaux, ...annexes]) {
    for (const l of lignesDe(t.geometry)) {
      if (l.length > 1) lignes.push(l.map(mercatorVersLngLat));
    }
  }

  let sac = -1;
  for (const t of [...principaux, ...annexes]) {
    const i = ORDRE_SAC.indexOf((t.tags || {}).sac_scale);
    if (i > sac) sac = i;
  }

  return { lignes, chaine: assembler(principaux), sac: sac >= 0 ? sac : null };
}

// Rééchantillonne la ligne à intervalles réguliers (500 points au maximum)
export function echantillonner(chaine) {
  const cum = [0];
  for (let i = 1; i < chaine.length; i++) cum.push(cum[i - 1] + distance(chaine[i - 1], chaine[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return { points: [], total: 0 };

  const n = Math.min(500, Math.max(20, Math.round(total / 40)));
  const points = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const cible = (total * i) / (n - 1);
    while (k < cum.length - 1 && cum[k] < cible) k++;
    const d0 = cum[k - 1];
    const d1 = cum[k];
    const t = d1 > d0 ? (cible - d0) / (d1 - d0) : 0;
    const a = chaine[k - 1];
    const b = chaine[k];
    points.push({ lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, d: cible });
  }
  return { points, total };
}
