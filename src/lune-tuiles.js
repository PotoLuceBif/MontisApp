// Tuiles de la Lune (lot 4.10), protocole montis-lune:// :
// - `images/z/x/y` : mosaïque LRO WAC de la NASA (Moon Trek), en plate carrée, reprojetée en Mercator ligne
//   par ligne, avec l'ombrage LOLA fondu par-dessus (118 m) pour la netteté du relief ;
// - `nuit/<lng>/<lat>/z/x/y` : nuit lunaire, pixel par pixel, selon la hauteur du soleil (éclairage réel).
import { addProtocol } from 'maplibre-gl';
import {
  GRIS_POLAIRE, boiteTuile, fonduPolaire, hauteurSoleilLune, latitudeLigne, niveauPourTuile, opaciteNuit, pixelPlateCarree,
  tuilesCouvrantes,
} from './lune-visite-calcul.js';

export const PROTOCOLE_LUNE = 'montis-lune';
const COTE = 256;
const COUCHES = {
  images: { adresse: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm', ext: 'jpg', max: 8 },
  ombrage: { adresse: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_Shade_Global_256ppd_v06/1.0.0/default/default028mm', ext: 'png', max: 6 },
};

function toile(largeur, hauteur = largeur) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(largeur, hauteur);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  return canvas;
}

async function tuileSource(couche, n, ligne, colonne, signal) {
  const { adresse, ext } = COUCHES[couche];
  const reponse = await fetch(`${adresse}/${n}/${ligne}/${colonne}.${ext}`, { signal });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  return createImageBitmap(await reponse.blob());
}

// Dessine une couche plate carrée sur la tuile Mercator z/x/y
async function dessinerCouche(contexte, couche, z, x, y, signal) {
  const n = niveauPourTuile(z, y, COUCHES[couche].max);
  const { col0, col1, lig0, lig1 } = tuilesCouvrantes(z, x, y, n, COTE);
  // Mosaïque des tuiles sources, puis chaque ligne Mercator y prend sa ligne plate carrée
  const mosaique = toile((col1 - col0 + 1) * COTE, (lig1 - lig0 + 1) * COTE);
  const m = mosaique.getContext('2d');
  const demandes = [];
  for (let ligne = lig0; ligne <= lig1; ligne++) {
    for (let colonne = col0; colonne <= col1; colonne++) {
      demandes.push(tuileSource(couche, n, ligne, colonne, signal).then((image) => {
        m.drawImage(image, (colonne - col0) * COTE, (ligne - lig0) * COTE);
        image.close?.();
      }));
    }
  }
  const resultats = await Promise.allSettled(demandes);
  if (resultats.every((r) => r.status === 'rejected')) throw resultats[0].reason;
  const b = boiteTuile(z, x, y);
  const gauche = pixelPlateCarree(n, b.ouest, 0, COTE).x - col0 * COTE;
  // Bornée à la mosaïque : au bord est du monde (180°), la largeur la dépassait d'un pixel et faisait une couture
  const largeur = Math.min(mosaique.width - gauche, pixelPlateCarree(n, b.est, 0, COTE).x - col0 * COTE - gauche);
  for (let py = 0; py < COTE; py++) {
    const sy = pixelPlateCarree(n, 0, latitudeLigne(z, y, py, COTE), COTE).y - lig0 * COTE;
    contexte.drawImage(mosaique, gauche, Math.max(0, Math.min(mosaique.height - 1, Math.floor(sy))), largeur, 1, 0, py, COTE, 1);
  }
}

async function tuileImages(z, x, y, signal) {
  const surface = toile(COTE);
  const contexte = surface.getContext('2d');
  contexte.fillStyle = '#1b1c20';
  contexte.fillRect(0, 0, COTE, COTE);
  await dessinerCouche(contexte, 'images', z, x, y, signal);
  // Ombrage LOLA : relief net, sans changer les teintes (lumière douce, gris moyen neutre)
  contexte.globalCompositeOperation = 'soft-light';
  contexte.globalAlpha = 0.75;
  await dessinerCouche(contexte, 'ombrage', z, x, y, signal).catch(() => {});
  // Près des pôles, fondu vers la teinte des calottes (lune-visite-calcul.js)
  contexte.globalCompositeOperation = 'source-over';
  contexte.fillStyle = `rgb(${GRIS_POLAIRE.join(', ')})`;
  for (let py = 0; py < COTE; py++) {
    const fondu = fonduPolaire(latitudeLigne(z, y, py, COTE));
    if (!fondu) continue;
    contexte.globalAlpha = fondu;
    contexte.fillRect(0, py, COTE, 1);
  }
  contexte.globalAlpha = 1;
  return surface;
}

function tuileNuit(sub, z, x, y) {
  const surface = toile(COTE);
  const contexte = surface.getContext('2d');
  const image = contexte.createImageData(COTE, COTE);
  const b = boiteTuile(z, x, y);
  for (let py = 0; py < COTE; py++) {
    const lat = latitudeLigne(z, y, py, COTE);
    for (let px = 0; px < COTE; px++) {
      const lng = b.ouest + ((px + 0.5) / COTE) * (b.est - b.ouest);
      const alpha = opaciteNuit(hauteurSoleilLune(lng, lat, sub));
      const i = (py * COTE + px) * 4;
      // Bleu nuit à peine éclairé par la Terre (lumière cendrée)
      image.data[i] = 6;
      image.data[i + 1] = 8;
      image.data[i + 2] = 16;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  contexte.putImageData(image, 0, 0);
  return surface;
}

let ajoute = false;
export function ajouterProtocoleLune() {
  if (ajoute) return;
  ajoute = true;
  addProtocol(PROTOCOLE_LUNE, async ({ url }, controleur) => {
    const parties = url.replace(`${PROTOCOLE_LUNE}://`, '').split('/');
    const [z, x, y] = parties.slice(-3).map(Number);
    const surface = parties[0] === 'nuit'
      ? tuileNuit({ lng: Number(parties[1]), lat: Number(parties[2]) }, z, x, y)
      : await tuileImages(z, x, y, controleur.signal);
    return { data: await createImageBitmap(surface) };
  });
}
