// Carte des plafonds (Vol libre) : grille de points sur la vue, plafond des thermiques en chacun
// (profil-calcul.js), puis image colorée interpolée entre les points. Calculs purs, testés.
import { NIVEAUX_PROFIL, colonneAir, thermique } from './profil-calcul.js';

export const VARIABLES_PLAFONDS = [
  'temperature_2m', 'dew_point_2m', 'shortwave_radiation',
  ...NIVEAUX_PROFIL.flatMap((p) => [`temperature_${p}hPa`, `geopotential_height_${p}hPa`]),
];

// Paliers de la légende, en mètres au-dessus de la mer, et leurs couleurs (du plafond bas au haut)
export const PALIERS_PLAFOND = [1000, 1500, 2000, 2500, 3000, 3500];
export const COULEURS_PLAFOND = [
  [70, 110, 200],
  [40, 170, 190],
  [70, 200, 110],
  [235, 215, 60],
  [245, 140, 50],
  [225, 60, 90],
];

const LAT_MAX = 80;

// Grille de `cote` × `cote` points couvrant la vue et une marge
export function grillePlafonds({ ouest, sud, est, nord }, { cote = 7, marge = 0.12 } = {}) {
  const largeur = est - ouest;
  const hauteur = nord - sud;
  const o = ouest - largeur * marge;
  const e = est + largeur * marge;
  const s = Math.max(-LAT_MAX, sud - hauteur * marge);
  const n = Math.min(LAT_MAX, nord + hauteur * marge);
  const pasLng = (e - o) / (cote - 1);
  const pasLat = (n - s) / (cote - 1);
  const positions = [];
  for (let iy = 0; iy < cote; iy += 1) {
    for (let ix = 0; ix < cote; ix += 1) {
      const longitude = ((o + ix * pasLng + 540) % 360) - 180;
      positions.push({ longitude, latitude: s + iy * pasLat });
    }
  }
  return { ouest: o, sud: s, est: e, nord: n, pasLng, pasLat, nx: cote, ny: cote, positions };
}

// La vue est-elle encore bien couverte par la grille chargée ?
export function grilleCouvre(grille, { ouest, sud, est, nord }) {
  return ouest >= grille.ouest && est <= grille.est && sud >= grille.sud && nord <= grille.nord;
}

// Plafond (m au-dessus de la mer) d'une réponse d'Open-Meteo à l'heure `i`, ou null sans thermique
export function plafondPoint(donnees, i) {
  const hourly = donnees?.hourly;
  if (!hourly || !Number.isFinite(donnees.elevation)) return null;
  const colonne = colonneAir(hourly, i, donnees.elevation);
  const therm = thermique(colonne, hourly.dew_point_2m?.[i], hourly.shortwave_radiation?.[i]);
  return therm ? therm.plafond : null;
}

export function couleurPlafond(altitude) {
  if (!Number.isFinite(altitude)) return null;
  if (altitude <= PALIERS_PLAFOND[0]) return COULEURS_PLAFOND[0];
  if (altitude >= PALIERS_PLAFOND.at(-1)) return COULEURS_PLAFOND.at(-1);
  const i = PALIERS_PLAFOND.findIndex((palier) => palier > altitude) - 1;
  const ratio = (altitude - PALIERS_PLAFOND[i]) / (PALIERS_PLAFOND[i + 1] - PALIERS_PLAFOND[i]);
  return COULEURS_PLAFOND[i].map((c, k) => Math.round(c + (COULEURS_PLAFOND[i + 1][k] - c) * ratio));
}

// Valeur interpolée en (fx, fy), coordonnées fractionnaires dans la grille (0 à nx − 1, 0 à ny − 1, sud en bas).
// Un point sans thermique compte comme « pas de plafond » : il éteint la zone autour de lui de moitié.
export function valeurGrille({ nx, ny }, valeurs, fx, fy) {
  const x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
  const dx = Math.max(0, Math.min(1, fx - x0));
  const dy = Math.max(0, Math.min(1, fy - y0));
  const coins = [
    [valeurs[y0 * nx + x0], (1 - dx) * (1 - dy)],
    [valeurs[y0 * nx + x0 + 1], dx * (1 - dy)],
    [valeurs[(y0 + 1) * nx + x0], (1 - dx) * dy],
    [valeurs[(y0 + 1) * nx + x0 + 1], dx * dy],
  ];
  let somme = 0;
  let poids = 0;
  let poidsVide = 0;
  for (const [valeur, p] of coins) {
    if (Number.isFinite(valeur)) {
      somme += valeur * p;
      poids += p;
    } else poidsVide += p;
  }
  if (poids === 0 || poidsVide > 0.5) return null;
  return somme / poids;
}

// Pixels RGBA de l'image (nord en haut) : `largeur` × `hauteur`, transparents là où il n'y a pas de thermique
export function rasteriser(grille, valeurs, largeur, hauteur, opacite = 255) {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let py = 0; py < hauteur; py += 1) {
    const fy = ((hauteur - 1 - py) / (hauteur - 1)) * (grille.ny - 1);
    for (let px = 0; px < largeur; px += 1) {
      const fx = (px / (largeur - 1)) * (grille.nx - 1);
      const couleur = couleurPlafond(valeurGrille(grille, valeurs, fx, fy));
      if (!couleur) continue;
      const k = (py * largeur + px) * 4;
      pixels[k] = couleur[0];
      pixels[k + 1] = couleur[1];
      pixels[k + 2] = couleur[2];
      pixels[k + 3] = opacite;
    }
  }
  return pixels;
}

// Valeur au point (lng, lat) de la grille, ou null hors de la grille ou sans thermique
export function plafondAu(grille, valeurs, lng, lat) {
  const fx = (lng - grille.ouest) / grille.pasLng;
  const fy = (lat - grille.sud) / grille.pasLat;
  if (fx < 0 || fy < 0 || fx > grille.nx - 1 || fy > grille.ny - 1) return null;
  return valeurGrille(grille, valeurs, fx, fy);
}
