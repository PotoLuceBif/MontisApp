// Calcul du vent, commun à la carte et au volume 3D.
// Convention : `u` vers l'est, `v` vers le nord (km/h), donc le sens où VA l'air.
// Les API météo donnent au contraire la direction d'où VIENT le vent.
import { t } from './i18n.js';

export const HAUTEURS_VENT = [10, 100, 200, 500, 1000, 1500, 2000];

const HAUTEURS_SOL = [10, 100, 200];
const NIVEAUX_PRESSION = [900, 850, 800, 700, 600, 500];
// Niveaux hauts (environ 7 000, 9 000 et 10 500 m), demandés seulement pour un volume au-delà de 3 000 m :
// au-delà de 10 variables, Open-Meteo compte une requête pour plusieurs appels
const NIVEAUX_HAUTS = [400, 300, 250];
export const PLAFOND_SANS_NIVEAUX_HAUTS = 3000;

export const VARIABLES_VENT = [
  ...HAUTEURS_SOL.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
  ...NIVEAUX_PRESSION.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]),
];

export const VARIABLES_VENT_HAUTS = NIVEAUX_HAUTS.flatMap((p) => [
  `wind_speed_${p}hPa`,
  `wind_direction_${p}hPa`,
  `geopotential_height_${p}hPa`,
]);

// Hauteurs (au-dessus du sol) des couches du volume 3D selon sa hauteur : au plus neuf couches,
// plus espacées en altitude, pour que les flèches ne se cachent pas les unes les autres
const COUCHES_VOLUME = {
  3000: [10, 200, 500, 1000, 1500, 2000, 3000],
  4000: [10, 500, 1000, 1500, 2000, 3000, 4000],
  5000: [10, 500, 1000, 2000, 3000, 4000, 5000],
  8000: [10, 1000, 2000, 3000, 4000, 5000, 6500, 8000],
  10000: [10, 1000, 2000, 3000, 4000, 5000, 6500, 8000, 10000],
};
export function couchesVolume(plafond) {
  if (COUCHES_VOLUME[plafond]) return COUCHES_VOLUME[plafond];
  const hauteurs = HAUTEURS_VENT.filter((hauteur) => hauteur <= plafond);
  return hauteurs.length > 6 ? hauteurs.filter((hauteur) => hauteur !== 100) : hauteurs; // 100 m : trop serrée
}

export function composantes(vitesse, provenance) {
  const radians = (provenance * Math.PI) / 180;
  return { u: -Math.sin(radians) * vitesse, v: -Math.cos(radians) * vitesse };
}

// `flux` : cap vers lequel va le vent, `provenance` : cap d'où il vient
export function depuisComposantes(u, v) {
  const flux = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  return { vitesse: Math.hypot(u, v), flux, provenance: (flux + 180) % 360 };
}

// Colonne d'air au-dessus d'un point : hauteurs au-dessus du sol, de bas en haut.
// Les niveaux de pression sous les 200 m du sol sont écartés : ils seraient
// sous terre ou moins fiables que le vent de surface.
export function colonneVent(hourly, index, elevation) {
  const colonne = [];
  HAUTEURS_SOL.forEach((hauteur) => {
    const vitesse = hourly[`wind_speed_${hauteur}m`]?.[index];
    const direction = hourly[`wind_direction_${hauteur}m`]?.[index];
    if (Number.isFinite(vitesse) && Number.isFinite(direction)) {
      colonne.push({ hauteur, ...composantes(vitesse, direction) });
    }
  });
  [...NIVEAUX_PRESSION, ...NIVEAUX_HAUTS].forEach((pression) => {
    const hauteur = hourly[`geopotential_height_${pression}hPa`]?.[index] - elevation;
    const vitesse = hourly[`wind_speed_${pression}hPa`]?.[index];
    const direction = hourly[`wind_direction_${pression}hPa`]?.[index];
    if (hauteur > 200 && Number.isFinite(vitesse) && Number.isFinite(direction)) {
      colonne.push({ hauteur, ...composantes(vitesse, direction) });
    }
  });
  return colonne.sort((a, b) => a.hauteur - b.hauteur);
}

// Interpolation linéaire sur les composantes : moyenner des angles donnerait
// un cap faux dès que le vent tourne autour du nord
export function ventAHauteur(colonne, hauteur) {
  const superieur = colonne.findIndex((niveau) => niveau.hauteur >= hauteur);
  if (superieur < 0) return null;
  const haut = colonne[superieur];
  if (haut.hauteur === hauteur) return { u: haut.u, v: haut.v };
  if (superieur === 0) return null;
  const bas = colonne[superieur - 1];
  const ratio = (hauteur - bas.hauteur) / (haut.hauteur - bas.hauteur);
  return { u: bas.u + (haut.u - bas.u) * ratio, v: bas.v + (haut.v - bas.v) * ratio };
}

// Champ régulier en longitude / latitude ; `valeurs[iy * nx + ix]` vaut {u, v} ou null
export function creerChamp({ ouest, sud, pasLng, pasLat, nx, ny }, valeurs) {
  return { ouest, sud, pasLng, pasLat, nx, ny, valeurs };
}

export function lireChamp(champ, lng, lat) {
  const fx = (lng - champ.ouest) / champ.pasLng;
  const fy = (lat - champ.sud) / champ.pasLat;
  if (fx < -1e-6 || fy < -1e-6 || fx > champ.nx - 1 + 1e-6 || fy > champ.ny - 1 + 1e-6) return null;
  const x0 = Math.min(champ.nx - 1, Math.max(0, Math.floor(fx)));
  const y0 = Math.min(champ.ny - 1, Math.max(0, Math.floor(fy)));
  const x1 = Math.min(champ.nx - 1, x0 + 1);
  const y1 = Math.min(champ.ny - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  let u = 0;
  let v = 0;
  let poids = 0;
  for (const [ix, iy, p] of [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ]) {
    const valeur = champ.valeurs[iy * champ.nx + ix];
    if (!valeur || p <= 0) continue;
    u += valeur.u * p;
    v += valeur.v * p;
    poids += p;
  }
  if (poids < 0.25) return null; // trop de points manquants autour
  return { u: u / poids, v: v / poids };
}

// Code du point (N, SO…) ; pointCardinal() le donne dans la langue choisie (SO → SW)
export function codeCardinal(degres) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return directions[Math.round((((degres % 360) + 360) % 360) / 45) % 8];
}

export const pointCardinal = (degres) => t(`cardinal.${codeCardinal(degres)}`);
