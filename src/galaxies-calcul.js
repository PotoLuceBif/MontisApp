// Galaxies voisines du ciel du globe (demande du propriétaire du 15 novembre 2026) : Andromède et ses deux
// compagnes, la galaxie du Triangle, les deux Nuages de Magellan. Chacune est une petite image générée
// (spirale, elliptique ou irrégulière), posée à sa vraie place, dans son vrai angle sur le ciel,
// agrandie pour être lisible comme la Lune. Calculs purs, testés.
import { fbm } from './voie-lactee-calcul.js';

// ra, dec : centre (°) ; grand : grand axe sur le ciel (°, déjà agrandi) ; rapport : petit axe / grand axe ;
// angle : angle de position du grand axe, du nord vers l'est (°) ; taille : côté de l'image (px)
// Andromède est doublée : ses compagnes s'écartent d'autant de son centre.
export const GALAXIES = [
  { id: 'lmc', type: 'irreguliere', ra: 80.89, dec: -69.76, grand: 11, rapport: 0.82, angle: 115, taille: 256, eclat: 1, graine: 3 },
  { id: 'smc', type: 'irreguliere', ra: 13.19, dec: -72.83, grand: 6, rapport: 0.6, angle: 45, taille: 192, eclat: 0.8, graine: 7 },
  { id: 'm31', type: 'spirale', ra: 10.68, dec: 41.27, grand: 6.4, rapport: 0.3, angle: 35, taille: 320, eclat: 1, graine: 11, bras: 2, ouverture: 8 },
  { id: 'm32', type: 'elliptique', ra: 10.66, dec: 40.46, grand: 0.5, rapport: 0.75, angle: 170, taille: 48, eclat: 0.9, graine: 13 },
  { id: 'm110', type: 'elliptique', ra: 9.5, dec: 42.1, grand: 0.9, rapport: 0.5, angle: 170, taille: 64, eclat: 0.6, graine: 17 },
  { id: 'm33', type: 'spirale', ra: 23.46, dec: 30.66, grand: 2.6, rapport: 0.65, angle: 23, taille: 192, eclat: 0.75, graine: 19, bras: 2, ouverture: 18 },
];

// Le grand axe occupe cette part de l'image ; le reste laisse s'éteindre le halo
const MARGE = 1.35;

const COEUR = [250, 210, 160];
const BRAS = [178, 194, 236];
const VIEILLES = [238, 206, 168];

// Image RGBA (alpha non prémultiplié) de la galaxie, vue sur le ciel : grand axe vertical, nord en haut
export function imageGalaxie(galaxie) {
  const { taille: n, rapport: q, graine } = galaxie;
  const pixels = new Uint8ClampedArray(n * n * 4);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      // x : petit axe, y : grand axe, en demi-grands axes (1 = bord de la galaxie)
      const x = ((i + 0.5) / n - 0.5) * 2 * MARGE;
      const y = (0.5 - (j + 0.5) / n) * 2 * MARGE;
      const p = pixelGalaxie(galaxie, x, y, q, graine);
      const k = (j * n + i) * 4;
      pixels[k] = p.r;
      pixels[k + 1] = p.v;
      pixels[k + 2] = p.b;
      pixels[k + 3] = p.a * 255;
    }
  }
  return pixels;
}

const melanger = (a, b, t) => a.map((c, k) => c + (b[k] - c) * t);
const fondu = (r) => Math.max(0, Math.min(1, (1.12 - r) / 0.3)); // bord adouci, pas de disque net

function pixelGalaxie(galaxie, x, y, q, graine) {
  if (galaxie.type === 'spirale') return spirale(galaxie, x, y, q, graine);
  if (galaxie.type === 'elliptique') return elliptique(x, y, q);
  return irreguliere(x, y, q, graine);
}

// Spirale inclinée : bulbe doré, disque, bras bleutés en spirale logarithmique, bandes de poussière
// le long du bord intérieur des bras, plus marquées du côté proche (comme sur Andromède)
function spirale({ bras, ouverture }, x, y, q, graine) {
  const xd = x / q; // redressée : vue de face
  const r = Math.hypot(xd, y);
  const theta = Math.atan2(xd, y);
  const bulbe = (1.6 * Math.exp(-r / 0.06) + 0.45 * Math.exp(-r / 0.18)) * fondu(r);
  const disque = Math.exp(-r / 0.42) * fondu(r);
  const grain = fbm(xd * 6 + graine, y * 6, graine, 4, graine);
  // Bras un peu irréguliers : une spirale parfaite ferait dessin
  const phase = bras * theta - Math.log(r + 0.03) / Math.tan((ouverture * Math.PI) / 180) + 1.6 * (grain - 0.5);
  const bras1 = (0.5 + 0.5 * Math.cos(phase)) ** 2;
  const amas = Math.max(0, fbm(xd * 18, y * 18 + graine, graine * 2, 3, graine + 5) - 0.55) * 2.2;
  let lumiere = bulbe + disque * (0.7 + 0.6 * bras1) * (0.75 + 0.5 * grain) + 0.5 * disque * amas * bras1;
  // Poussières : juste en dedans des bras, hors du bulbe, renforcées par le bruit et côté proche
  const poussiere = (0.5 + 0.5 * Math.cos(phase - 1.1)) ** 6;
  const proche = 0.55 + 0.45 * Math.tanh(x * 6);
  const tau = 2.2 * poussiere * proche * (0.4 + 0.9 * grain) * Math.min(1, r / 0.12) * fondu(r);
  lumiere *= Math.exp(-tau);
  const teinte = melanger(COEUR, BRAS, Math.min(1, Math.max(0, (r - 0.05) / 0.45) * (0.4 + 0.6 * bras1)));
  const rougi = 1 - Math.exp(-tau);
  return {
    r: teinte[0] * (1 - 0.05 * rougi),
    v: teinte[1] * (1 - 0.15 * rougi),
    b: teinte[2] * (1 - 0.3 * rougi),
    a: 0.92 * (1 - Math.exp(-1.9 * lumiere)),
  };
}

// Elliptique : simple dégradé de vieilles étoiles dorées
function elliptique(x, y, q) {
  const r = Math.hypot(x / q, y);
  const lumiere = (1.6 * Math.exp(-r / 0.12) + 0.4 * Math.exp(-r / 0.35)) * fondu(r);
  return { r: VIEILLES[0], v: VIEILLES[1], b: VIEILLES[2], a: 0.9 * (1 - Math.exp(-1.5 * lumiere)) };
}

// Irrégulière (Nuages de Magellan) : barre d'étoiles décentrée, disque déchiqueté, amas et régions brillantes
function irreguliere(x, y, q, graine) {
  const xd = x / q;
  const r = Math.hypot(xd, y);
  const bruit = fbm(xd * 2.5 + graine, y * 2.5, graine, 5, graine);
  const contour = r * (0.75 + 0.6 * bruit); // bord irrégulier
  const disque = Math.exp(-contour / 0.42) * fondu(contour);
  const barre = Math.exp(-0.5 * ((x + 0.12) / 0.14) ** 2 - 0.5 * ((y - 0.08) / 0.45) ** 2) * fondu(r);
  const amas = Math.max(0, fbm(xd * 6, y * 6 + graine, graine, 4, graine + 3) - 0.5) * 2.2;
  const lumiere = 0.6 * disque * (0.6 + 0.8 * bruit) + 0.75 * barre + amas * disque;
  const teinte = melanger(BRAS, VIEILLES, Math.min(1, barre * 0.8));
  return { r: teinte[0], v: teinte[1], b: teinte[2], a: 0.85 * (1 - Math.exp(-1.6 * lumiere)) };
}

// Transformation (a, b, c, d, e, f d'un contexte 2D) qui pose l'image de la galaxie à l'écran.
// `centre`, `nord`, `est` : points d'écran du centre et des points décalés de `delta` degrés vers le nord
// et vers l'est sur le ciel (la perspective et le sens du ciel en découlent).
export function poseGalaxie({ grand, angle, taille }, centre, nord, est, delta) {
  const nx = (nord.x - centre.x) / delta;
  const ny = (nord.y - centre.y) / delta;
  const ex = (est.x - centre.x) / delta;
  const ey = (est.y - centre.y) / delta;
  const pa = (angle * Math.PI) / 180;
  // Pixels d'écran par degré, le long du grand axe (D) et du petit axe (M)
  const dx = Math.cos(pa) * nx + Math.sin(pa) * ex;
  const dy = Math.cos(pa) * ny + Math.sin(pa) * ey;
  const mx = -Math.sin(pa) * nx + Math.cos(pa) * ex;
  const my = -Math.sin(pa) * ny + Math.cos(pa) * ey;
  const s = (grand * MARGE) / taille; // degrés par pixel de l'image
  const a = s * mx;
  const b = s * my;
  const c = -s * dx;
  const d = -s * dy;
  return [a, b, c, d, centre.x - ((a + c) * taille) / 2, centre.y - ((b + d) * taille) / 2];
}
