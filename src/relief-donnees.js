// Altitudes lues dans les tuiles de relief (Terrain Tiles, même source que la 3D et les zones hors ligne).
import { penteOrientation, pixelMonde, taillePixel } from './point-calcul.js';
import { t } from './i18n.js';

const MODELE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const tuiles = new Map(); // « z/x/y » → promesse des pixels

function chargerTuile(z, x, y) {
  const cle = `${z}/${x}/${y}`;
  if (tuiles.has(cle)) return tuiles.get(cle);
  const promesse = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      resolve(g.getImageData(0, 0, 256, 256).data);
    };
    img.onerror = () => reject(new Error(t('fiche.tuile')));
    img.src = MODELE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  });
  // Un échec (réseau coupé) ne reste pas en mémoire : on réessaiera
  promesse.catch(() => tuiles.delete(cle));
  tuiles.set(cle, promesse);
  return promesse;
}

// Charge les tuiles qui couvrent les pixels du monde [x0, x1] × [y0, y1], puis lit l'altitude d'un pixel entier
export async function lecteur(z, x0, y0, x1, y1) {
  const n = 2 ** z;
  const cles = [];
  for (let ty = Math.floor(y0 / 256); ty <= Math.floor(y1 / 256); ty += 1) {
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor(x1 / 256); tx += 1) {
      cles.push([((tx % n) + n) % n, Math.min(n - 1, Math.max(0, ty))]);
    }
  }
  const donnees = new Map();
  await Promise.all(cles.map(async ([tx, ty]) => donnees.set(`${tx}/${ty}`, await chargerTuile(z, tx, ty))));
  return (px, py) => {
    const tx = Math.floor(px / 256);
    const ty = Math.floor(py / 256);
    const pixels = donnees.get(`${((tx % n) + n) % n}/${Math.min(n - 1, Math.max(0, ty))}`);
    const i = ((py - ty * 256) * 256 + (px - tx * 256)) * 4;
    // Encodage « terrarium » : altitude = R × 256 + G + B / 256 − 32768
    return pixels[i] * 256 + pixels[i + 1] + pixels[i + 2] / 256 - 32768;
  };
}

// Altitude interpolée entre les quatre pixels voisins
export function interpoler(lire, x, y) {
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const fx = x - 0.5 - x0;
  const fy = y - 0.5 - y0;
  const haut = lire(x0, y0) * (1 - fx) + lire(x0 + 1, y0) * fx;
  const bas = lire(x0, y0 + 1) * (1 - fx) + lire(x0 + 1, y0 + 1) * fx;
  return haut * (1 - fy) + bas * fy;
}

export async function altitudeRelief(lng, lat, zoom = 12) {
  const { x, y } = pixelMonde(lng, lat, zoom);
  const lire = await lecteur(zoom, x - 1, y - 1, x + 1, y + 1);
  return interpoler(lire, x, y);
}

// Altitude, pente et orientation autour d'un point. `fenetre` : largeur du terrain mesuré, en mètres.
export async function terrainAuPoint(lng, lat, zoom = 13) {
  const { x, y } = pixelMonde(lng, lat, zoom);
  const lire = await lecteur(zoom, x - 2, y - 2, x + 2, y + 2);
  const grille = [-1, 0, 1].map((dy) => [-1, 0, 1].map((dx) => interpoler(lire, x + dx, y + dy)));
  const cellule = taillePixel(lat, zoom);
  return { altitude: grille[1][1], ...penteOrientation(grille, cellule), fenetre: 2 * cellule };
}
