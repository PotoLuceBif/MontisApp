// Tuile d'ombre portée, calculée depuis les tuiles de relief (les mêmes que les pentes, cache commun).
// Utilisé par le travailleur de pentes-travail.js, ou directement en repli.
import { altitudesTuile } from './pentes-tuile.js';
import { latitudePixel, taillePixel } from './pente-calcul.js';
import { directionSoleil, grilleOmbres, pixelsOmbre, porteeOmbre } from './ombre-calcul.js';

export const ZOOM_MAX_OMBRES = 12; // au-delà, la couche est agrandie : le relief n'est pas plus fin pour l'ombre
// Relief lu au zoom de la tuile sur deux tuiles vers le soleil ; plus loin, quatre fois plus grossier
const PROCHE = 512;
const DEZOOM_LOIN = 2;

// Altitudes du rectangle [xmin, xmax[ × [ymin, ymax[ en pixels du monde au zoom z, NaN là où le relief manque.
// Les tuiles de `obligatoires` doivent être lues ; les autres peuvent manquer (bord d'une zone hors ligne).
async function region(z, xmin, ymin, xmax, ymax, obligatoires = new Set()) {
  const n = 2 ** z;
  const w = xmax - xmin;
  const h = ymax - ymin;
  const data = new Float32Array(w * h).fill(Number.NaN);
  const tuileDe = (p) => Math.floor(p / 256);
  const lectures = [];
  for (let ty = Math.max(0, tuileDe(ymin)); ty <= Math.min(n - 1, tuileDe(ymax - 1)); ty += 1) {
    for (let tx = tuileDe(xmin); tx <= tuileDe(xmax - 1); tx += 1) {
      const lue = altitudesTuile(z, ((tx % n) + n) % n, ty);
      lectures.push(obligatoires.has(`${tx}/${ty}`)
        ? lue.then((a) => [tx, ty, a])
        : lue.then((a) => [tx, ty, a], () => [tx, ty, null]));
    }
  }
  let max = -Infinity;
  for (const [tx, ty, a] of await Promise.all(lectures)) {
    if (!a) continue;
    const debutX = Math.max(xmin, tx * 256);
    const finX = Math.min(xmax, tx * 256 + 256);
    for (let py = Math.max(ymin, ty * 256); py < Math.min(ymax, ty * 256 + 256); py += 1) {
      const source = (py - ty * 256) * 256 - tx * 256;
      const cible = (py - ymin) * w - xmin;
      for (let px = debutX; px < finX; px += 1) {
        const v = a[source + px];
        data[cible + px] = v;
        if (v > max) max = v;
      }
    }
  }
  return { data, xmin, ymin, w, h, max };
}

// Rectangle d'un carré de `cote` pixels en (x0, y0), étendu de `etendue` pixels vers le soleil
function versLeSoleil(x0, y0, cote, { dx, dy }, etendue) {
  return [
    x0 + Math.min(0, Math.floor(dx * etendue)),
    y0 + Math.min(0, Math.floor(dy * etendue)),
    x0 + cote + Math.max(0, Math.ceil(dx * etendue)),
    y0 + cote + Math.max(0, Math.ceil(dy * etendue)),
  ];
}

const lire = (r, gx, gy) => {
  const i = Math.round(gx) - r.xmin;
  const j = Math.round(gy) - r.ymin;
  return i >= 0 && i < r.w && j >= 0 && j < r.h ? r.data[j * r.w + i] : Number.NaN;
};

export async function tuileOmbre(z, x, y, { azimut, hauteurSoleil }, annulee) {
  if (!(hauteurSoleil > 0)) return pixelsOmbre(new Uint8Array(256 * 256).fill(1));
  const x0 = x * 256;
  const y0 = y * 256;
  const cellule = taillePixel(latitudePixel(y0 + 128, z), z);
  const direction = directionSoleil(azimut);
  const portee = porteeOmbre(hauteurSoleil) / cellule; // en cellules

  const proche = region(z, ...versLeSoleil(x0, y0, 256, direction, Math.min(portee, PROCHE)), new Set([`${x}/${y}`]));
  const zLoin = z - DEZOOM_LOIN;
  const facteur = 2 ** DEZOOM_LOIN;
  const loin = portee > PROCHE && zLoin >= 0
    ? region(zLoin, ...versLeSoleil(Math.floor(x0 / facteur), Math.floor(y0 / facteur), 256 / facteur, direction, Math.ceil(portee / facteur)))
    : null;
  const [p, l] = await Promise.all([proche, loin]);
  if (annulee?.()) throw new Error('annulée');

  const altitude = (cx, cy) => {
    const v = lire(p, x0 + cx, y0 + cy);
    if (!Number.isNaN(v) || !l) return v;
    return lire(l, (x0 + cx) / facteur, (y0 + cy) / facteur);
  };
  const ombres = grilleOmbres({
    largeur: 256,
    hauteur: 256,
    altitude,
    cellule,
    azimut,
    hauteurSoleil,
    altitudeMax: Math.max(p.max, l?.max ?? -Infinity),
  });
  return pixelsOmbre(ombres);
}
