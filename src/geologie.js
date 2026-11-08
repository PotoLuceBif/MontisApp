// Carte géologique du BRGM au 1/50 000, servie par la Géoplateforme de l'IGN, superposée au fond.
// Le blanc des tuiles (hors de France) devient transparent. Chargé à la première activation (nature-sous-sol.js).
import { addProtocol } from 'maplibre-gl';
import { blancTransparent, pointCouvert } from './geologie-calcul.js';
import { etat } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { estHorsLigne } from './hors-ligne.js';
import { t } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';

const PROTOCOLE = 'montis-geol';
const SOURCE = 'geologie';
const ZOOM_MAX = 15; // dernier niveau publié ; au-delà, les tuiles sont agrandies
// Sous les ombres et les pentes, sous les routes et les courbes : ils restent lisibles par-dessus
const AVANT = ['ombre-soleil', 'pentes-pentes', 'montis-road-casing', 'courbes'];
const MAX_MASQUES = 400;

const adresseTuile = (z, x, y) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BRGM_SCAN_D_GEOL50' +
  `&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_15&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;

// Couverture de chaque tuile reçue, pour dire « hors de France » sous le centre de la carte
const masques = new Map();

function toile() {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(256, 256);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  return canvas;
}

let protocoleAjoute = false;
function ajouterProtocole() {
  if (protocoleAjoute) return;
  protocoleAjoute = true;
  addProtocol(PROTOCOLE, async ({ url }, controleur) => {
    const [, z, x, y] = url.match(/^[\w-]+:\/\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    const reponse = await fetch(adresseTuile(z, x, y), { signal: controleur.signal });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const image = await createImageBitmap(await reponse.blob());
    const contexte = toile().getContext('2d', { willReadFrequently: true });
    contexte.drawImage(image, 0, 0, 256, 256);
    image.close?.();
    const donnees = contexte.getImageData(0, 0, 256, 256);
    const cle = `${z}/${x}/${y}`;
    masques.delete(cle);
    masques.set(cle, blancTransparent(donnees.data));
    if (masques.size > MAX_MASQUES) masques.delete(masques.keys().next().value);
    return { data: await createImageBitmap(donnees) };
  });
}

// La carte est-elle présente sous le centre ? null tant qu'aucune tuile n'y est arrivée.
// La couverture ne dépend pas du zoom : la tuile la plus précise déjà reçue suffit.
function centreCouvert(map) {
  const { lng, lat } = map.getCenter();
  for (let z = ZOOM_MAX; z >= 0; z -= 1) {
    const couvert = pointCouvert(masques, lng, lat, z);
    if (couvert !== null) return couvert;
  }
  return null;
}

// Icône de la pastille : quelques couches de terrain aux couleurs des cartes géologiques
export const MINI_GEOLOGIE = `<svg class="mini-icone mini-geologie" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M2 6c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#7fa7d6" stroke="none"/>
  <path d="M2 10c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#e4c46a" stroke="none"/>
  <path d="M2 14c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#c9849c" stroke="none"/>
</svg>`;

// `surEtat(état)` : le panneau dit pourquoi la carte manque ; `eteindre` : coupe l'interrupteur du panneau
export function initGeologie(map, { surEtat, eteindre }) {
  ajouterProtocole();
  map.addSource(SOURCE, {
    type: 'raster',
    tiles: [`${PROTOCOLE}://{z}/{x}/{y}`],
    tileSize: 256,
    maxzoom: ZOOM_MAX,
    // Emprise publiée : aucune requête au-delà
    bounds: [-12.21, 40.68, 11.9, 52.17],
    attribution: '© BRGM, Géoplateforme IGN',
  });
  map.addLayer(
    {
      id: SOURCE,
      type: 'raster',
      source: SOURCE,
      layout: { visibility: 'none' },
      paint: { 'raster-opacity': lire('geologie-opacite', 0.7), 'raster-fade-duration': 150 },
    },
    AVANT.find((id) => map.getLayer(id))
  );

  let actif = false;
  let erreurs = 0;
  let etatCouche = 'ok'; // 'ok', 'hors-zone', 'erreur', 'hors-ligne'

  const pastille = creerPastilleCouche({
    ordre: 5,
    nom: () => (etatCouche === 'ok' ? t('geologie.court') : t(`geologie.court-${etatCouche}`)),
    legende: () => MINI_GEOLOGIE,
    onOuvrir: () => ouvrirReglage('nature'),
    onRetirer: () => eteindre(),
  });

  function majEtat() {
    let suivant = 'ok';
    const couvert = actif ? centreCouvert(map) : null;
    if (erreurs) suivant = estHorsLigne() ? 'hors-ligne' : 'erreur';
    else if (couvert === false) suivant = 'hors-zone';
    if (suivant !== etatCouche) {
      etatCouche = suivant;
      if (pastille.visible) pastille.maj();
    }
    surEtat(actif ? etatCouche : 'ok');
  }

  function appliquer() {
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    map.setLayoutProperty(SOURCE, 'visibility', actif ? 'visible' : 'none');
  }
  etat.majGeologie = appliquer;

  map.on('error', (e) => {
    // Une tuile abandonnée pendant un déplacement n'est pas un échec
    if (e.sourceId !== SOURCE || e.error?.name === 'AbortError') return;
    erreurs += 1;
    majEtat();
  });
  map.on('movestart', () => { erreurs = 0; });
  map.on('moveend', majEtat);
  map.on('sourcedata', (e) => { if (e.sourceId === SOURCE && e.tile) majEtat(); });
  window.addEventListener('reseau-change', majEtat);

  return {
    afficher(oui) {
      actif = oui;
      erreurs = 0;
      appliquer();
      pastille.montrer(oui);
      majEtat();
    },
    opacite(valeur) {
      ecrire('geologie-opacite', valeur);
      map.setPaintProperty(SOURCE, 'raster-opacity', valeur);
    },
    rafraichir: () => pastille.visible && pastille.maj(),
  };
}
