// Tuiles d'ombre portée (`montis-ombre://az/h/z/x/y`), calculées dans le travailleur des pentes.
// Communes à Carte › Relief (ombres.js) et aux visites de stations (visite-station.js).
import { addProtocol } from 'maplibre-gl';
import { calculer } from './pentes-couche.js';

const PROTOCOLE = 'montis-ombre';

// Arrondis : l'ombre portée est recalculée à chaque changement, l'œil ne voit pas moins
export const arrondiAzimut = (a) => (Math.round(a) + 360) % 360;
const arrondiHauteur = (h) => Math.round(h * 2) / 2;

let protocoleAjoute = false;
export function ajouterProtocoleOmbre() {
  if (protocoleAjoute) return;
  protocoleAjoute = true;
  addProtocol(PROTOCOLE, async ({ url }, controleur) => {
    const [, azimut, hauteurSoleil, z, x, y] = url.match(/^[\w-]+:\/\/([\d.]+)\/(-?[\d.]+)\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    const pixels = await calculer(
      { z, x, y, genre: 'ombre', soleil: { azimut, hauteurSoleil } },
      controleur.signal
    );
    return { data: await createImageBitmap(new ImageData(pixels, 256, 256)) };
  });
}

export const adresseTuilesOmbre = ({ azimut, hauteur }) =>
  `${PROTOCOLE}://${arrondiAzimut(azimut)}/${arrondiHauteur(hauteur)}/{z}/{x}/{y}`;

// Ombrage éclairé par le soleil, et ombre portée : réglages communs
export const PEINTURE_OMBRAGE = {
  'hillshade-method': 'basic',
  'hillshade-illumination-anchor': 'map',
  'hillshade-shadow-color': '#0e142a',
  'hillshade-highlight-color': 'rgba(255, 214, 150, 0.12)',
  'hillshade-exaggeration': 0.6,
};

export function eclairer(map, coucheOmbrage, couchePortee, soleil, intensite) {
  map.setPaintProperty(coucheOmbrage, 'hillshade-illumination-direction', arrondiAzimut(soleil.azimut) % 360);
  map.setPaintProperty(coucheOmbrage, 'hillshade-illumination-altitude', Math.min(90, Math.max(0, soleil.hauteur)));
  map.setPaintProperty(coucheOmbrage, 'hillshade-exaggeration', intensite);
  map.setPaintProperty(couchePortee, 'raster-opacity', intensite * 0.75);
}
