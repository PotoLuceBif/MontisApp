// Calculs purs de la fiche d'un point : pente et orientation du terrain, distances et caps,
// refuge et point d'eau les plus proches.

const RAYON_TERRE = 6371008.8;
const CIRCONFERENCE = 2 * Math.PI * 6378137;
const rad = (degres) => (degres * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

// Taille d'un pixel de tuile 256 px au zoom donné, en mètres sur le terrain
export function taillePixel(latitude, zoom) {
  return (CIRCONFERENCE * Math.cos(rad(latitude))) / (256 * 2 ** zoom);
}

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
export const CLASSES_PENTE = [
  { min: 45, cle: '45' },
  { min: 40, cle: '40' },
  { min: 35, cle: '35' },
  { min: 30, cle: '30' },
];

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
