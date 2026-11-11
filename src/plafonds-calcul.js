// Carte des plafonds (Vol libre), sur le modèle de Meteo-Parapente : le relais /api/plafonds sert,
// pour une heure, l'épaisseur de la couche limite (HPBL, celle où l'air se brasse) sur toute la Terre
// (GFS de la NOAA, mailles de 0,25°). L'appli la lisse entre les mailles et l'ajoute au relief fin
// (tuiles de relief, comme les pentes) : de près, le plafond suit les crêtes et les vallées au lieu de
// pavés de 25 km. Calculs purs communs au relais et à l'appli, testés.
//
// Codage d'une maille sur un octet : 0 sans donnée, puis 1 + épaisseur / 25 m.

// Deux échelles (décision du propriétaire du 11 novembre 2026) : au-dessus du sol par défaut, l'épaisseur
// de la couche ; au-dessus de la mer, l'altitude du plafond, par tranches de 500 m jusqu'à 5 000 m.
// `paliers` : bornes entre les couleurs ; `etiquettes` : bornes écrites dans la légende.
export const ECHELLES_PLAFOND = {
  sol: {
    paliers: [600, 1000, 1500, 2000, 2500],
    etiquettes: [300, 600, 1000, 1500, 2000, 2500],
    couleurs: [
      [62, 96, 190], // 300 à 600 m
      [38, 150, 200],
      [46, 184, 140],
      [150, 205, 70],
      [240, 190, 50],
      [230, 80, 80], // 2 500 m et plus
    ],
  },
  mer: {
    paliers: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000],
    etiquettes: [2000, 3000, 4000, 5000], // « < 1 000 » occupe déjà la première case
    couleurs: [
      [62, 96, 190], // sous 1 000 m
      [40, 135, 205],
      [38, 170, 185],
      [46, 184, 140],
      [110, 198, 80],
      [190, 210, 60],
      [240, 190, 50],
      [245, 140, 50],
      [230, 80, 80],
      [190, 70, 170], // 5 000 m et plus
    ],
  },
};
export const REFERENCES_PLAFOND = ['sol', 'mer'];
export const COULEUR_SANS = [120, 128, 140];
export const SANS_THERMIQUE = 0; // plafond d'un endroit sans thermique exploitable
export const EPAISSEUR_UTILE = 300; // m au-dessus du sol : en dessous, pas exploitable
const PAS_CODE = 25;
const OPACITE_SANS = 190;

// Relais : l'épaisseur de chaque maille sur un octet
export function encoderEpaisseurs(couche) {
  const codes = new Uint8Array(couche.length);
  for (let k = 0; k < couche.length; k += 1) {
    const hauteur = couche[k];
    if (Number.isFinite(hauteur)) codes[k] = 1 + Math.max(0, Math.min(254, Math.round(hauteur / PAS_CODE)));
  }
  return codes;
}

export const decoderEpaisseur = (code) => (code ? (code - 1) * PAS_CODE : null);

// Épaisseur en un point, lissée entre les quatre mailles qui l'entourent (grille régulière, GFS : nord en haut)
export function epaisseurAu({ ni, nj, lat1, lon1, lat2, lon2 }, codes, lng, lat) {
  const pasLat = (lat2 - lat1) / (nj - 1);
  const etendue = ((lon2 - lon1 + 360) % 360) || 360;
  const pasLng = etendue / (ni - 1);
  const tourComplet = etendue + pasLng >= 359.999;
  const fy = (lat - lat1) / pasLat;
  if (fy < 0 || fy > nj - 1) return null;
  const fx = ((((lng - lon1) % 360) + 360) % 360) / pasLng;
  if (!tourComplet && fx > ni - 1) return null;
  const j0 = Math.min(nj - 2, Math.floor(fy));
  const i0 = Math.floor(fx);
  const dy = fy - j0;
  const dx = fx - i0;
  const colonne = (i) => (tourComplet ? i % ni : Math.min(ni - 1, i));
  let somme = 0;
  let poids = 0;
  for (const [j, i, p] of [[j0, i0, (1 - dx) * (1 - dy)], [j0, i0 + 1, dx * (1 - dy)], [j0 + 1, i0, (1 - dx) * dy], [j0 + 1, i0 + 1, dx * dy]]) {
    const valeur = decoderEpaisseur(codes[j * ni + colonne(i)]);
    if (valeur === null || p === 0) continue;
    somme += valeur * p;
    poids += p;
  }
  return poids > 0 ? somme / poids : null;
}

// Plafond au-dessus de la mer : relief fin + épaisseur, ou SANS_THERMIQUE si la couche est trop mince
export function plafondFin(epaisseur, sol) {
  if (!Number.isFinite(epaisseur)) return null;
  if (epaisseur < EPAISSEUR_UTILE) return SANS_THERMIQUE;
  return Math.max(0, Number.isFinite(sol) ? sol : 0) + epaisseur;
}

// Plafond d'un endroit selon la référence : au-dessus du sol, l'épaisseur ; au-dessus de la mer, sol + épaisseur
export const plafondSelon = (reference, epaisseur, sol) => (reference === 'sol' ? plafondFin(epaisseur, 0) : plafondFin(epaisseur, sol));

export function couleurPlafond(valeur, reference = 'mer') {
  if (valeur === SANS_THERMIQUE) return COULEUR_SANS;
  if (!Number.isFinite(valeur)) return null;
  const { paliers, couleurs } = ECHELLES_PLAFOND[reference];
  const tranche = paliers.findIndex((palier) => valeur < palier);
  return couleurs[tranche < 0 ? paliers.length : tranche];
}

// Pixels RGBA d'une tuile z/x/y de 256 px : `altitudes` est la tuile de relief de même z/x/y
// (inutile au-dessus du sol)
export function pixelsPlafond(grille, codes, altitudes, z, x, y, { reference = 'mer', opacite = 255, opaciteSans = OPACITE_SANS } = {}) {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  const monde = 256 * 2 ** z;
  // L'épaisseur varie lentement : calculée sur un pas de 8 px, puis interpolée
  const PAS = 8;
  const cotes = 256 / PAS + 1;
  const epaisseurs = new Float32Array(cotes * cotes);
  for (let gy = 0; gy < cotes; gy += 1) {
    const yMonde = y * 256 + gy * PAS;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * yMonde) / monde))) * 180) / Math.PI;
    for (let gx = 0; gx < cotes; gx += 1) {
      const lng = ((x * 256 + gx * PAS) / monde) * 360 - 180;
      epaisseurs[gy * cotes + gx] = epaisseurAu(grille, codes, lng, lat) ?? NaN;
    }
  }
  for (let py = 0; py < 256; py += 1) {
    const gy = Math.min(cotes - 2, Math.floor(py / PAS));
    const ty = (py - gy * PAS) / PAS;
    for (let px = 0; px < 256; px += 1) {
      const gx = Math.min(cotes - 2, Math.floor(px / PAS));
      const tx = (px - gx * PAS) / PAS;
      const a = epaisseurs[gy * cotes + gx];
      const b = epaisseurs[gy * cotes + gx + 1];
      const c = epaisseurs[(gy + 1) * cotes + gx];
      const d = epaisseurs[(gy + 1) * cotes + gx + 1];
      const epaisseur = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      const valeur = plafondSelon(reference, epaisseur, altitudes ? altitudes[py * 256 + px] : 0);
      const couleur = couleurPlafond(valeur, reference);
      if (!couleur) continue;
      const o = (py * 256 + px) * 4;
      pixels[o] = couleur[0];
      pixels[o + 1] = couleur[1];
      pixels[o + 2] = couleur[2];
      pixels[o + 3] = valeur === SANS_THERMIQUE ? opaciteSans : opacite;
    }
  }
  return pixels;
}
