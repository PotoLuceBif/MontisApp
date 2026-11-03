// Calculs purs de la fiche d'un point : pente et orientation du terrain, distances et caps,
// refuge et point d'eau les plus proches.

const RAYON_TERRE = 6371008.8;
const rad = (degres) => (degres * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

import { SEUILS_PENTE, taillePixel } from './pente-calcul.js';

export { taillePixel };

// Position en pixels dans le monde (Web Mercator) au zoom donné
export function pixelMonde(lng, lat, zoom) {
  const taille = 256 * 2 ** zoom;
  const latRad = rad(lat);
  return {
    x: ((lng + 180) / 360) * taille,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * taille,
  };
}

// Pente et orientation (méthode de Horn) d'une grille 3 × 3 d'altitudes, rangée du nord au sud
// puis d'ouest en est, avec `cellule` mètres entre deux points.
// L'orientation est la direction vers laquelle la pente descend (90 = versant est), null sur le plat.
export function penteOrientation(grille, cellule) {
  const [[a, b, c], [d, , f], [g, h, i]] = grille;
  const versEst = (c + 2 * f + i - (a + 2 * d + g)) / (8 * cellule);
  const versNord = (a + 2 * b + c - (g + 2 * h + i)) / (8 * cellule);
  const pente = deg(Math.atan(Math.hypot(versEst, versNord)));
  if (pente < 1) return { pente, orientation: null };
  // La pente descend à l'opposé du gradient
  const orientation = (deg(Math.atan2(-versEst, -versNord)) + 360) % 360;
  return { pente, orientation };
}

// Classes de pente utilisées par les couches de pente (lot 1.3) : seuils de déclenchement d'avalanche
export const CLASSES_PENTE = [...SEUILS_PENTE].reverse().map((min) => ({ min, cle: String(min) }));

export function classePente(pente) {
  if (!Number.isFinite(pente)) return null;
  return CLASSES_PENTE.find((classe) => pente >= classe.min)?.cle || null;
}

// Distance à vol d'oiseau en mètres
export function distance([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Cap initial de a vers b, en degrés depuis le nord (90 = est)
export function cap([lng1, lat1], [lng2, lat2]) {
  const dLng = rad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

// Le plus proche parmi des objets { coordonnees: [lng, lat] }, dans la limite de `max` mètres
export function plusProche(objets, point, max = Infinity) {
  let meilleur = null;
  for (const objet of objets) {
    const d = distance(point, objet.coordonnees);
    if (d <= max && (!meilleur || d < meilleur.distance)) meilleur = { ...objet, distance: d };
  }
  if (meilleur) meilleur.cap = cap(point, meilleur.coordonnees);
  return meilleur;
}

// Nature d'un point d'eau d'OpenStreetMap. La potabilité n'est sûre que si elle est déclarée.
export function genreEau(tags = {}) {
  const potable = tags.drinking_water;
  if (potable === 'no') return 'non-potable';
  if (tags.amenity === 'drinking_water' || potable === 'yes' || potable === 'treated') return 'potable';
  if (tags.natural === 'spring') return 'source';
  return 'inconnue';
}

// Éléments d'Overpass (nœuds, ou chemins avec `center`) vers des points d'eau
export function pointsEau(elements = []) {
  return elements
    .map((e) => {
      const lng = e.lon ?? e.center?.lon;
      const lat = e.lat ?? e.center?.lat;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return { coordonnees: [lng, lat], genre: genreEau(e.tags), nom: e.tags?.name || '' };
    })
    .filter(Boolean);
}

// ---------- Distance à une géométrie GeoJSON (eau des tuiles du fond) ----------

// Projection locale en mètres autour d'un point : assez juste sur quelques kilomètres
function projecteur([lng0, lat0]) {
  const kx = (Math.PI / 180) * RAYON_TERRE * Math.cos(rad(lat0));
  const ky = (Math.PI / 180) * RAYON_TERRE;
  return {
    vers: ([lng, lat]) => [(lng - lng0) * kx, (lat - lat0) * ky],
    depuis: ([x, y]) => [lng0 + x / kx, lat0 + y / ky],
  };
}

// Point d'un segment [a, b] le plus proche de l'origine, en coordonnées projetées
function plusProcheSurSegment(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const longueur2 = dx * dx + dy * dy;
  const k = longueur2 ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / longueur2)) : 0;
  return [a[0] + k * dx, a[1] + k * dy];
}

// L'origine est-elle dans l'anneau (projeté) ? Lancer de rayon
function origineDansAnneau(anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i, i += 1) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// Distance en mètres d'un point à une géométrie, et point de la géométrie le plus proche.
// Dans un polygone, la distance est nulle.
export function distanceGeometrie(point, geometrie) {
  if (!geometrie) return null;
  const { vers, depuis } = projecteur(point);
  let meilleur = null;
  const retenir = (p) => {
    const d = Math.hypot(p[0], p[1]);
    if (!meilleur || d < meilleur.d) meilleur = { d, p };
  };
  const lignes = (ligne) => {
    const pts = ligne.map(vers);
    if (pts.length === 1) retenir(pts[0]);
    for (let i = 1; i < pts.length; i += 1) retenir(plusProcheSurSegment(pts[i - 1], pts[i]));
  };
  const polygone = (anneaux) => {
    const projetes = anneaux.map((anneau) => anneau.map(vers));
    if (projetes.length && origineDansAnneau(projetes[0]) && !projetes.slice(1).some(origineDansAnneau)) {
      meilleur = { d: 0, p: [0, 0] };
      return true;
    }
    anneaux.forEach(lignes);
    return false;
  };
  const { type, coordinates: c } = geometrie;
  if (type === 'Point') retenir(vers(c));
  else if (type === 'MultiPoint') c.forEach((p) => retenir(vers(p)));
  else if (type === 'LineString') lignes(c);
  else if (type === 'MultiLineString') c.forEach(lignes);
  else if (type === 'Polygon') polygone(c);
  else if (type === 'MultiPolygon') c.some(polygone);
  else return null;
  if (!meilleur) return null;
  return { distance: meilleur.d, coordonnees: meilleur.d === 0 ? [...point] : depuis(meilleur.p) };
}

// Un point est-il dans un polygone ou un multipolygone GeoJSON ?
export function dansPolygone(point, geometrie) {
  if (!geometrie || !/Polygon$/.test(geometrie.type)) return false;
  return distanceGeometrie(point, geometrie)?.distance === 0;
}
