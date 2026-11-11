// Carte des plafonds (Vol libre), sur le modèle de Meteo-Parapente : le relais /api/plafonds sert,
// pour une heure, la carte de toute la Terre déjà calculée (GFS de la NOAA, mailles de 0,25°) ;
// l'appli n'a qu'à la dessiner. Calculs purs communs au relais et à l'appli, testés.
//
// Plafond = hauteur de la couche limite (HPBL, celle où l'air se brasse) + altitude du sol du modèle.
// Codage d'une maille sur un octet : 0 sans donnée, 1 sans thermique exploitable, puis 25 m par pas.

export const PALIERS_PLAFOND = [1000, 1500, 2000, 2500, 3000, 3500];
export const COULEURS_PLAFOND = [
  [62, 96, 190], // sous 1 000 m
  [38, 150, 200],
  [46, 184, 140],
  [120, 200, 70],
  [235, 210, 60],
  [245, 140, 50],
  [225, 60, 90], // 3 500 m et plus
];
export const COULEUR_SANS = [140, 148, 158];
export const SANS_THERMIQUE = 0; // valeur décodée d'une maille sans thermique exploitable
export const EPAISSEUR_UTILE = 300; // m au-dessus du sol : en dessous, pas exploitable
const PAS_CODE = 25;
const LAT_MERCATOR = 85.0511;

// Relais : une maille par octet, à partir de la couche limite et du relief
export function encoderPlafonds(couche, relief) {
  const codes = new Uint8Array(couche.length);
  for (let k = 0; k < couche.length; k += 1) {
    const hauteur = couche[k];
    if (!Number.isFinite(hauteur)) continue;
    if (hauteur < EPAISSEUR_UTILE) {
      codes[k] = 1;
      continue;
    }
    const plafond = hauteur + Math.max(0, relief[k] || 0);
    codes[k] = 2 + Math.min(253, Math.round(plafond / PAS_CODE));
  }
  return codes;
}

export function decoderPlafond(code) {
  if (!code) return null;
  if (code === 1) return SANS_THERMIQUE;
  return (code - 2) * PAS_CODE;
}

// Indice de la maille la plus proche d'un point, dans une grille régulière (nord en haut pour GFS)
export function indiceMaille({ ni, nj, lat1, lon1, lat2, lon2 }, lng, lat) {
  const pasLat = (lat2 - lat1) / (nj - 1);
  const etendue = ((lon2 - lon1 + 360) % 360) || 360;
  const pasLng = etendue / (ni - 1);
  const j = Math.round((lat - lat1) / pasLat);
  if (j < 0 || j >= nj) return -1;
  let i = Math.round(((((lng - lon1) % 360) + 360) % 360) / pasLng);
  if (i >= ni) i = etendue + pasLng >= 359.999 ? 0 : -1; // grille qui fait le tour de la Terre
  if (i < 0) return -1;
  return j * ni + i;
}

export function plafondAu(grille, codes, lng, lat) {
  const k = indiceMaille(grille, lng, lat);
  return k < 0 ? null : decoderPlafond(codes[k]);
}

export function couleurPlafond(valeur) {
  if (valeur === SANS_THERMIQUE) return COULEUR_SANS;
  if (!Number.isFinite(valeur)) return null;
  const tranche = PALIERS_PLAFOND.findIndex((palier) => valeur < palier);
  return COULEURS_PLAFOND[tranche < 0 ? PALIERS_PLAFOND.length : tranche];
}

const latDeY = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
export const EMPRISE_MONDE = [[-180, LAT_MERCATOR], [180, LAT_MERCATOR], [180, -LAT_MERCATOR], [-180, -LAT_MERCATOR]];

// Image du monde (longitudes de −180 à 180, lignes réparties comme sur la carte, en Mercator)
export function rasteriserMonde(grille, codes, largeur, hauteur, { opacite = 255, opaciteSans = 110 } = {}) {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4);
  const yMax = Math.log(Math.tan(Math.PI / 4 + (LAT_MERCATOR * Math.PI) / 360));
  const couleurs = new Map();
  for (let py = 0; py < hauteur; py += 1) {
    const lat = latDeY(yMax - ((py + 0.5) / hauteur) * 2 * yMax);
    for (let px = 0; px < largeur; px += 1) {
      const lng = -180 + ((px + 0.5) / largeur) * 360;
      const k = indiceMaille(grille, lng, lat);
      if (k < 0) continue;
      const code = codes[k];
      if (!code) continue;
      let couleur = couleurs.get(code);
      if (!couleur) {
        couleur = couleurPlafond(decoderPlafond(code));
        couleurs.set(code, couleur);
      }
      const o = (py * largeur + px) * 4;
      pixels[o] = couleur[0];
      pixels[o + 1] = couleur[1];
      pixels[o + 2] = couleur[2];
      pixels[o + 3] = code === 1 ? opaciteSans : opacite;
    }
  }
  return pixels;
}
