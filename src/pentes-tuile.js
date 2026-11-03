// Tuile de pente ou d'orientation calculée depuis les tuiles de relief (Terrain Tiles, celles de la 3D
// et des zones hors ligne). Utilisé par le travailleur de pentes-travail.js, ou directement en repli.
import { altitudesTerrarium, celluleMercator, grillePentes, pixelsTuile } from './pente-calcul.js';

const MODELE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Relief au zoom 13 (environ 13 m par pixel dans les Alpes), le plus fin des zones hors ligne ;
// le zoom 12, toujours téléchargé avec une zone, sert de repli.
const ZOOMS_RELIEF = [13, 12];
const TAILLE_CACHE = 48; // tuiles de relief gardées en mémoire (256 Ko chacune)

const cache = new Map(); // « z/x/y » → promesse des altitudes

function decoderImage(bitmap) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(256, 256)
    : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return altitudesTerrarium(g.getImageData(0, 0, 256, 256).data);
}

function altitudesTuile(z, x, y) {
  const cle = `${z}/${x}/${y}`;
  if (cache.has(cle)) {
    const promesse = cache.get(cle);
    cache.delete(cle); // remise en tête de la liste
    cache.set(cle, promesse);
    return promesse;
  }
  const url = MODELE.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const promesse = fetch(url)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.blob();
    })
    // Sans conversion de couleurs : les valeurs RGB codent l'altitude
    .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(decoderImage);
  promesse.catch(() => cache.delete(cle)); // un échec (réseau coupé) sera retenté
  cache.set(cle, promesse);
  while (cache.size > TAILLE_CACHE) cache.delete(cache.keys().next().value);
  return promesse;
}

// Pixels de la tuile z/x/y calculés depuis le relief au zoom zr
async function calculerTuile(zr, z, x, y, genre, annulee) {
  const cote = 256 * 2 ** (zr - z); // cellules de relief sur un côté de la tuile (128 à 512)
  const x0 = x * cote;
  const y0 = y * cote;
  const n = 2 ** zr;
  const tuileDe = (p) => Math.floor(p / 256);
  const coeur = new Set();
  for (let ty = tuileDe(y0); ty <= tuileDe(y0 + cote - 1); ty += 1) {
    for (let tx = tuileDe(x0); tx <= tuileDe(x0 + cote - 1); tx += 1) coeur.add(`${tx}/${ty}`);
  }
  // Le cœur et une bordure d'un pixel : les tuiles voisines évitent un raccord visible
  const demandes = [];
  for (let ty = Math.max(0, tuileDe(y0 - 1)); ty <= Math.min(n - 1, tuileDe(y0 + cote)); ty += 1) {
    for (let tx = tuileDe(x0 - 1); tx <= tuileDe(x0 + cote); tx += 1) {
      const cle = `${tx}/${ty}`;
      const lu = altitudesTuile(zr, ((tx % n) + n) % n, ty);
      // Seul le cœur est indispensable ; une voisine manquante (bord d'une zone hors ligne) est remplacée
      demandes.push(coeur.has(cle) ? lu.then((a) => [cle, a]) : lu.then((a) => [cle, a], () => [cle, null]));
    }
  }
  const tuiles = new Map(await Promise.all(demandes));
  if (annulee?.()) throw new Error('annulée');
  const lirePixel = (px, py) => {
    const a = tuiles.get(`${tuileDe(px)}/${tuileDe(py)}`);
    return a ? a[(py - tuileDe(py) * 256) * 256 + (px - tuileDe(px) * 256)] : null;
  };
  const borner = (v, min, max) => Math.min(max, Math.max(min, v));
  const altitude = (c, l) => {
    const py = borner(y0 + l, 0, n * 256 - 1);
    return lirePixel(x0 + c, py) ?? lirePixel(borner(x0 + c, x0, x0 + cote - 1), borner(py, y0, y0 + cote - 1));
  };
  const { pentes, orientations } = grillePentes({
    largeur: cote,
    hauteur: cote,
    altitude,
    cellule: celluleMercator(y0, zr),
  });
  return pixelsTuile({ pentes, orientations, cote, genre });
}

export async function tuile(z, x, y, genre, annulee) {
  let erreur;
  for (const zr of ZOOMS_RELIEF) {
    try {
      return await calculerTuile(zr, z, x, y, genre, annulee);
    } catch (e) {
      if (annulee?.()) throw e;
      erreur = e;
    }
  }
  throw erreur;
}
