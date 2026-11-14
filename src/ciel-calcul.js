// Ciel autour du globe : étoiles à leur vraie place (catalogue public/data/ciel/etoiles.json) et Lune,
// vus depuis la caméra de la carte. Les étoiles sont à l'infini : seule l'orientation de la caméra compte,
// et elles se projettent comme le soleil (`projeterSoleil`). Calculs purs, testés ; les constellations
// viendront s'appuyer sur `directionEtoile` et `projeterDirection`.
import { projeterSoleil } from './soleil-ciel-calcul.js';

const RAD = Math.PI / 180;

// Temps sidéral de Greenwich (°) à l'instant `date`
export function tempsSideral(date) {
  const jours = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  return (((280.46061837 + 360.98564736629 * jours) % 360) + 360) % 360;
}

// Azimut (° depuis le nord, 90 = est) et hauteur (°) d'une étoile vue depuis (lat, lng), au temps sidéral `ts`
export function directionEtoile(ra, dec, lat, lng, ts) {
  const H = (ts + lng - ra) * RAD;
  const d = dec * RAD;
  const phi = lat * RAD;
  const est = -Math.cos(d) * Math.sin(H);
  const nord = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.cos(H) * Math.sin(phi);
  const haut = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(H) * Math.cos(phi);
  return { azimut: ((Math.atan2(est, nord) / RAD) + 360) % 360, hauteur: Math.asin(Math.max(-1, Math.min(1, haut))) / RAD };
}

// Point à l'écran d'une direction (azimut, hauteur) vue de la caméra ; null derrière elle
export function projeterDirection(direction, camera) {
  const p = projeterSoleil(direction, camera);
  return p.devant ? { x: p.x, y: p.y } : null;
}

// Éclat d'une étoile selon sa magnitude : rayon (px) et opacité ; les plus faibles sont de simples points
export function eclatEtoile(magnitude) {
  const m = Math.min(6.5, Math.max(-1.5, magnitude));
  return {
    rayon: Math.max(0.45, 2.6 - 0.36 * (m + 1.5)),
    opacite: Math.max(0.18, Math.min(1, 1.05 - 0.13 * m)),
  };
}

// Couleur d'une étoile selon son indice B−V : bleutée (chaude) à orangée (froide), adoucie
const TEINTES = [[-0.4, [170, 195, 255]], [0, [215, 225, 255]], [0.4, [255, 248, 240]], [0.8, [255, 232, 200]], [1.2, [255, 214, 165]], [2, [255, 190, 130]]];
export function couleurEtoile(bv) {
  const x = Math.min(2, Math.max(-0.4, bv));
  for (let i = 1; i < TEINTES.length; i += 1) {
    const [b1, c1] = TEINTES[i];
    if (x <= b1) {
      const [b0, c0] = TEINTES[i - 1];
      const t = (x - b0) / (b1 - b0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return TEINTES.at(-1)[1];
}

// Le catalogue : un tableau plat [ra, dec, mag, bv] en centièmes
export function lireCatalogue(json) {
  const plat = json?.etoiles ?? [];
  const etoiles = [];
  for (let i = 0; i + 3 < plat.length; i += 4) {
    etoiles.push({ ra: plat[i] / 100, dec: plat[i + 1] / 100, mag: plat[i + 2] / 100, bv: plat[i + 3] / 100 });
  }
  return etoiles;
}

// Opacité du ciel selon le zoom : celle du globe jour et nuit (plein jusqu'au zoom 4, rien au-delà du zoom 6)
export const opaciteCiel = (zoom) => Math.min(1, Math.max(0, (6 - zoom) / 2));
