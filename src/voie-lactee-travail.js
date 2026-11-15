// Travailleur : génère la carte de la Voie lactée et ses petites étoiles sans bloquer la carte
// (quelques secondes, plus sur téléphone). La carte est gardée en image dans le cache du navigateur :
// les fois suivantes, elle ne fait que se relire.
import { genererVoieLactee, semerEtoiles } from './voie-lactee-calcul.js';

const CACHE = 'ciel'; // hors du préfixe montis- : le service worker ne l'efface pas à chaque version
const CLE = '/ciel/voie-lactee-2'; // changer le numéro quand le calcul change

async function relire(largeur, hauteur) {
  if (typeof caches === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  const reponse = await (await caches.open(CACHE)).match(CLE);
  if (!reponse) return null;
  const image = await createImageBitmap(await reponse.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (image.width !== largeur || image.height !== hauteur) return null;
  const toile = new OffscreenCanvas(largeur, hauteur);
  const contexte = toile.getContext('2d');
  contexte.drawImage(image, 0, 0);
  return contexte.getImageData(0, 0, largeur, hauteur).data;
}

async function garder(texture, largeur, hauteur) {
  if (typeof caches === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
  const toile = new OffscreenCanvas(largeur, hauteur);
  toile.getContext('2d').putImageData(new ImageData(texture, largeur, hauteur), 0, 0);
  const image = await toile.convertToBlob({ type: 'image/webp', quality: 0.92 });
  await (await caches.open(CACHE)).put(CLE, new Response(image, { headers: { 'Content-Type': image.type } }));
}

self.onmessage = async ({ data: { largeur, hauteur, nombre } }) => {
  let texture = await relire(largeur, hauteur).catch(() => null);
  if (!texture) {
    texture = genererVoieLactee(largeur, hauteur);
    await garder(texture, largeur, hauteur).catch(() => {});
  }
  const etoiles = semerEtoiles(texture, largeur, hauteur, nombre);
  self.postMessage({ texture, largeur, hauteur, etoiles }, [texture.buffer, etoiles.buffer]);
};
