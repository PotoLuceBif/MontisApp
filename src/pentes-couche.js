// Couches de pente et d'orientation, calculées dans le navigateur depuis les tuiles de relief
// (voir pentes-tuile.js), à la manière de maplibre-contour.
import { REPERE_CALQUES } from './style-montis.js';
import { addProtocol } from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { etat } from './options-carte.js';

const PROTOCOLE = 'montis-pente';
export const ZOOM_MIN_PENTES = 12; // plus loin, le relief est trop lissé : les pentes seraient sous-estimées
export const GENRES = ['pentes', 'orientation'];
const AVANT = [REPERE_CALQUES, 'montis-road-casing', 'courbes']; // routes et sentiers restent lisibles au-dessus

// Le calcul passe par un travailleur ; sans OffscreenCanvas (vieux navigateurs), sur la page
let travailleur = null;
let repli = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined';
let suivant = 0;
const enAttente = new Map(); // id → { resolve, reject, demande }

function calculerSurLaPage({ z, x, y, genre, soleil }, signal) {
  if (genre === 'ombre') return import('./ombre-tuile.js').then((m) => m.tuileOmbre(z, x, y, soleil, () => signal.aborted));
  return import('./pentes-tuile.js').then((m) => m.tuile(z, x, y, genre, () => signal.aborted));
}

function passerEnRepli(erreur) {
  console.warn('Pentes : calcul sur la page, le travailleur a échoué', erreur);
  repli = true;
  travailleur?.terminate();
  travailleur = null;
  for (const { resolve, reject, demande, signal } of enAttente.values()) {
    calculerSurLaPage(demande, signal).then(resolve, reject);
  }
  enAttente.clear();
}

// Pixels RGBA 256 × 256 d'une tuile : { z, x, y, genre } ; pour l'ombre, genre 'ombre' et soleil { azimut, hauteurSoleil }
export function calculer(demande, signal) {
  if (repli) return calculerSurLaPage(demande, signal);
  if (!travailleur) {
    try {
      travailleur = new Worker(new URL('./pentes-travail.js', import.meta.url), { type: 'module' });
    } catch (e) {
      passerEnRepli(e);
      return calculerSurLaPage(demande, signal);
    }
    travailleur.onerror = (e) => passerEnRepli(e.message || e);
    travailleur.onmessage = ({ data }) => {
      const attente = enAttente.get(data.id);
      if (!attente) return;
      enAttente.delete(data.id);
      if (data.pixels) attente.resolve(data.pixels);
      else attente.reject(new Error(data.erreur));
    };
  }
  const id = (suivant += 1);
  signal.addEventListener('abort', () => travailleur?.postMessage({ annuler: id }), { once: true });
  return new Promise((resolve, reject) => {
    enAttente.set(id, { resolve, reject, demande, signal });
    travailleur.postMessage({ id, ...demande });
  });
}

let protocoleAjoute = false;
function ajouterProtocole() {
  if (protocoleAjoute) return;
  protocoleAjoute = true;
  addProtocol(PROTOCOLE, async ({ url }, controleur) => {
    const [, genre, z, x, y] = url.match(/^[\w-]+:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/);
    const pixels = await calculer({ z: Number(z), x: Number(x), y: Number(y), genre }, controleur.signal);
    return { data: await createImageBitmap(new ImageData(pixels, 256, 256)) };
  });
}

const idCouche = (genre) => `pentes-${genre}`;

// Couches ajoutées une fois, masquées ; `afficher` choisit laquelle est visible
export function initCouchePentes(map) {
  ajouterProtocole();
  const avant = AVANT.find((id) => map.getLayer(id));
  for (const genre of GENRES) {
    map.addSource(idCouche(genre), {
      type: 'raster',
      tiles: [`${PROTOCOLE}://${genre}/{z}/{x}/{y}`],
      tileSize: 256,
      minzoom: ZOOM_MIN_PENTES,
      maxzoom: 13,
    });
    map.addLayer(
      {
        id: idCouche(genre),
        type: 'raster',
        source: idCouche(genre),
        minzoom: ZOOM_MIN_PENTES,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': lire('pentes-opacite', 0.6), 'raster-fade-duration': 0 },
      },
      avant
    );
  }

  let choix = lire('pentes-couche', 'aucune');
  if (!GENRES.includes(choix)) choix = 'aucune';

  function appliquer() {
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    for (const genre of GENRES) {
      map.setLayoutProperty(idCouche(genre), 'visibility', genre === choix ? 'visible' : 'none');
    }
  }
  appliquer();

  return {
    get choix() { return choix; },
    afficher(genre) {
      choix = GENRES.includes(genre) ? genre : 'aucune';
      ecrire('pentes-couche', choix);
      appliquer();
    },
    opacite(valeur) {
      ecrire('pentes-opacite', valeur);
      for (const genre of GENRES) map.setPaintProperty(idCouche(genre), 'raster-opacity', valeur);
    },
    appliquer,
    // Une tuile en échec appartient-elle à ces couches ?
    estSource: (id) => GENRES.some((genre) => idCouche(genre) === id),
  };
}
