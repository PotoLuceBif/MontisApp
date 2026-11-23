// Calculs purs de la barre de recherche : lecture d'un résultat de Photon, tri par pertinence,
// dernières recherches, coordonnées tapées à la main (testés)

export const NB_RECENTS = 8;

// ---------- Types de lieux (catégorie, icône, zoom d'arrivée, poids dans le tri) ----------
// Le poids fait passer les lieux connus devant : ville > sommet > village > rue
const CATEGORIES = [
  { test: (k, v) => k === 'natural' && (v === 'peak' || v === 'volcano'), type: 'sommet', icone: '⛰️', zoom: 13, poids: 34 },
  { test: (k, v) => (k === 'leisure' && v === 'ski_resort') || (k === 'landuse' && v === 'winter_sports') || (k === 'site' && v === 'piste'), type: 'station', icone: '🎿', zoom: 12, poids: 34 },
  { test: (k, v) => k === 'place' && v === 'locality', type: 'lieu-dit', icone: '📍', zoom: 14, poids: 12 },
  { test: (k, v) => k === 'mountain_pass' || (k === 'natural' && v === 'saddle'), type: 'col', icone: '⛰️', zoom: 13, poids: 30 },
  { test: (k, v) => k === 'natural' && v === 'glacier', type: 'glacier', icone: '🧊', zoom: 12, poids: 30 },
  { test: (k, v) => k === 'natural' && (v === 'water' || v === 'lake'), type: 'lac', icone: '💧', zoom: 13, poids: 24 },
  { test: (k) => k === 'waterway', type: 'cours-eau', icone: '🌊', zoom: 12, poids: 16 },
  { test: (k, v) => k === 'natural' && v === 'valley', type: 'vallee', icone: '🏞️', zoom: 12, poids: 24 },
  { test: (k, v) => k === 'tourism' && (v === 'alpine_hut' || v === 'wilderness_hut'), type: 'refuge', icone: '🛖', zoom: 15, poids: 26 },
  { test: (k, v) => k === 'place' && v === 'city', type: 'ville', icone: '🏙️', zoom: 12, poids: 50 },
  { test: (k, v) => k === 'place' && v === 'town', type: 'ville', icone: '🏙️', zoom: 12, poids: 40 },
  { test: (k, v) => k === 'place' && v === 'village', type: 'village', icone: '🏘️', zoom: 14, poids: 24 },
  { test: (k, v) => k === 'place' && (v === 'hamlet' || v === 'isolated_dwelling'), type: 'village', icone: '🏘️', zoom: 14, poids: 10 },
  // Contour administratif : Photon le dit « city » même pour un petit village
  { test: (k, v, t) => k === 'boundary' && t === 'city', type: 'commune', icone: '🏘️', zoom: 13, poids: 28 },
];

// Repli selon le type renvoyé par le service
const TYPES = {
  country: { type: 'pays', icone: '🌍', zoom: 5, poids: 60 },
  state: { type: 'region', icone: '🗺️', zoom: 8, poids: 45 },
  city: { type: 'ville', icone: '🏙️', zoom: 12, poids: 40 },
  county: { type: 'departement', icone: '🗺️', zoom: 9, poids: 30 },
  district: { type: 'quartier', icone: '🏘️', zoom: 14, poids: 12 },
  locality: { type: 'lieu-dit', icone: '📍', zoom: 14, poids: 12 },
  street: { type: 'rue', icone: '🛣️', zoom: 16, poids: 6 },
  house: { type: 'adresse', icone: '🏠', zoom: 17, poids: 0 },
  other: { type: 'lieu', icone: '📍', zoom: 13, poids: 8 },
};

export function categorie(p) {
  // Photon donne type « city » à tout village qui a sa commune : osm_value d'abord
  return CATEGORIES.find((c) => c.test(p.osm_key, p.osm_value, p.type)) || TYPES[p.type] || TYPES.other;
}

// Transforme un résultat du service en objet simple, réutilisable (et mémorisable)
export function normaliser(f, sansNom = '') {
  const p = f.properties || {};
  const [lng, lat] = f.geometry.coordinates;
  const cat = categorie(p);
  const nom = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || sansNom;
  // Deux précisions locales au plus, puis le pays, pour distinguer les homonymes
  const locaux = [p.district, p.city, p.county, p.state].filter(
    (x, i, t) => x && x !== nom && x !== p.country && t.indexOf(x) === i
  );
  const lieux = [...locaux.slice(-2), p.country !== nom ? p.country : null].filter(Boolean);
  const e = p.extent; // [ouest, nord, est, sud]
  const grandeZone = e && ['city', 'state', 'county', 'country', 'district'].includes(p.type) && cat.poids >= 30;
  return {
    nom,
    // Le type se traduit à l'affichage ; les noms de lieux restent ceux du service
    type: cat.type,
    lieux: lieux.join(', '),
    icone: cat.icone,
    lng,
    lat,
    zoom: cat.zoom,
    bounds: grandeZone ? [[e[0], e[3]], [e[2], e[1]]] : null,
    cle: `${p.osm_type || ''}${p.osm_id || ''}`,
    poids: cat.poids,
  };
}

// ---------- Tri par pertinence ----------
// Sans accents, sans casse, tirets et apostrophes comme des espaces
export function simplifier(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’_.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Le nom correspond-il à la saisie : 3 en entier, 2 au début, 1 au début d'un mot, 0 sinon
export function correspondance(nom, q) {
  const n = simplifier(nom);
  const s = simplifier(q);
  if (!s) return 0;
  if (n === s) return 3;
  if (n.startsWith(s)) return 2;
  if (n.includes(` ${s}`)) return 1;
  return 0;
}

const POINTS_NOM = [0, 8, 14, 26];

function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Note d'un résultat : rang donné par Photon, nom, importance du type ; la proximité
// ne fait que départager des lieux comparables (12 points au plus, la moitié à 35 km)
export function note(r, rang, total, { q, centre } = {}) {
  let n = total > 1 ? 24 * (1 - rang / (total - 1)) : 24;
  n += POINTS_NOM[correspondance(r.nom, q)];
  n += r.poids ?? 8;
  if (centre) n += 12 * Math.exp(-distanceKm(centre, r) / 50);
  return n;
}

// Même lieu : même objet d'OSM, ou même nom au même endroit (Photon renvoie souvent
// le point du village et le contour de sa commune)
const memeLieu = (a, b) =>
  (a.cle === b.cle && a.nom === b.nom) || (a.nom === b.nom && !!a.lieux && a.lieux === b.lieux);

// Trie les résultats (dans l'ordre de Photon) par note ; un doublon prend la place
// du mieux noté, avec la catégorie la plus précise (le village plutôt que sa commune)
export function trierResultats(items, options = {}) {
  const notes = items
    .map((r, i) => ({ r, n: note(r, i, items.length, options) }))
    .sort((a, b) => b.n - a.n);
  const gardes = [];
  for (const { r } of notes) {
    const i = gardes.findIndex((g) => memeLieu(g, r));
    if (i < 0) gardes.push(r);
    else if ((r.poids ?? 0) > (gardes[i].poids ?? 0)) gardes[i] = r;
  }
  return gardes;
}

// ---------- Dernières recherches ----------

// Ajoute un lieu en tête, sans doublon, 8 au plus
export function ajouterRecent(recents, r) {
  const { poids, recent, ...lieu } = r;
  return [lieu, ...recents.filter((x) => !memeLieu(x, r))].slice(0, NB_RECENTS);
}

export function retirerRecent(recents, r) {
  return recents.filter((x) => !memeLieu(x, r));
}

// Dernières recherches dont le nom correspond à la saisie
export function recentsCorrespondants(recents, q) {
  return recents.filter((r) => correspondance(r.nom, q) > 0);
}

// Les dernières recherches qui correspondent passent devant les résultats, marquées
export function fusionnerAvecRecents(resultats, recents, q) {
  const devant = recentsCorrespondants(recents, q).map((r) => ({ ...r, recent: true }));
  return [...devant, ...resultats.filter((r) => !devant.some((d) => memeLieu(d, r)))];
}

// ---------- Coordonnées tapées à la main : « 45.88, 6.87 » ----------
export function lireCoordonnees(texte) {
  const m = texte.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
