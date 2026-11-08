// Géologie superposée au fond, en deux vues :
// - simple : carte lithologique du BRGM (grandes familles de roches, 1/1 000 000), par son service WMS ;
// - détaillée : carte géologique du BRGM au 1/50 000, servie par la Géoplateforme de l'IGN, blanc rendu transparent.
// Chargé à la première activation (nature-sous-sol.js).
import { addProtocol } from 'maplibre-gl';
import { blancTransparent, empriseTuile, pointCouvert } from './geologie-calcul.js';
import { etat } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { estHorsLigne } from './hors-ligne.js';
import { t } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';

const PROTOCOLE = 'montis-geol';
export const VUES = ['simple', 'detaillee'];
// Sous les ombres et les pentes, sous les routes et les courbes : ils restent lisibles par-dessus
const AVANT = ['ombre-soleil', 'pentes-pentes', 'montis-road-casing', 'courbes'];
const MAX_MASQUES = 400;
const EMPRISE_FRANCE = [-12.21, 40.68, 11.9, 52.17]; // publiée par la Géoplateforme : aucune requête au-delà

const VUE = {
  simple: {
    cote: 512,
    // Le BRGM ne dessine la carte lithologique qu'entre ces échelles
    minzoom: 5,
    maxzoom: 13,
    blanc: false, // déjà transparente hors de France
    attribution: '© BRGM',
    adresse: (z, x, y) =>
      'https://geoservices.brgm.fr/geologie?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=LITHO_1M_SIMPLIFIEE' +
      `&STYLES=&CRS=EPSG:3857&BBOX=${empriseTuile(z, x, y).map((v) => v.toFixed(2)).join(',')}` +
      '&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true',
  },
  detaillee: {
    cote: 256,
    minzoom: 0,
    maxzoom: 15, // dernier niveau publié ; au-delà, les tuiles sont agrandies
    blanc: true,
    attribution: '© BRGM, Géoplateforme IGN',
    adresse: (z, x, y) =>
      'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=BRGM_SCAN_D_GEOL50' +
      `&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_15&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
  },
};

const idCouche = (vue) => `geologie-${vue}`;

// Couverture de chaque tuile reçue, pour dire « hors de France » sous le centre de la carte
const masques = new Map();
let recues = 0; // tuiles reçues depuis le dernier déplacement

function toile(cote) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(cote, cote);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cote;
  return canvas;
}

let protocoleAjoute = false;
function ajouterProtocole() {
  if (protocoleAjoute) return;
  protocoleAjoute = true;
  addProtocol(PROTOCOLE, async ({ url }, controleur) => {
    const [, vue, z, x, y] = url.match(/^[\w-]+:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/);
    const { cote, blanc, adresse } = VUE[vue];
    const reponse = await fetch(adresse(Number(z), Number(x), Number(y)), { signal: controleur.signal });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const image = await createImageBitmap(await reponse.blob());
    const contexte = toile(cote).getContext('2d', { willReadFrequently: true });
    contexte.drawImage(image, 0, 0, cote, cote);
    image.close?.();
    const donnees = contexte.getImageData(0, 0, cote, cote);
    const cle = `${vue}/${z}/${x}/${y}`;
    masques.delete(cle);
    masques.set(cle, blancTransparent(donnees.data, cote, { blanc }));
    recues += 1;
    if (masques.size > MAX_MASQUES) masques.delete(masques.keys().next().value);
    return { data: await createImageBitmap(donnees) };
  });
}

// La carte est-elle présente sous le centre ? null tant qu'aucune tuile n'y est arrivée.
// La couverture ne dépend pas du zoom : la tuile la plus précise déjà reçue suffit.
function centreCouvert(map, vue) {
  const { lng, lat } = map.getCenter();
  for (let z = VUE[vue].maxzoom; z >= 0; z -= 1) {
    const couvert = pointCouvert(masques, lng, lat, z, `${vue}/`);
    if (couvert !== null) return couvert;
  }
  return null;
}

// Icône de la pastille : quelques couches de terrain aux couleurs de la carte des roches
export const MINI_GEOLOGIE = `<svg class="mini-icone mini-geologie" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M2 6c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#73b3ff" stroke="none"/>
  <path d="M2 10c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#f5c97a" stroke="none"/>
  <path d="M2 14c4-2 7 2 10 0s6-2 10 0v4c-4-2-7 2-10 0s-6-2-10 0Z" fill="#ff6b6b" stroke="none"/>
</svg>`;

// `surEtat(état)` : le panneau dit pourquoi la carte manque ; `eteindre` : coupe l'interrupteur du panneau
export function initGeologie(map, { surEtat, eteindre }) {
  ajouterProtocole();
  const avant = AVANT.find((id) => map.getLayer(id));
  for (const vue of VUES) {
    const { cote, minzoom, maxzoom, attribution } = VUE[vue];
    map.addSource(idCouche(vue), {
      type: 'raster',
      tiles: [`${PROTOCOLE}://${vue}/{z}/{x}/{y}`],
      tileSize: cote,
      minzoom,
      maxzoom,
      bounds: EMPRISE_FRANCE,
      attribution,
    });
    map.addLayer(
      {
        id: idCouche(vue),
        type: 'raster',
        source: idCouche(vue),
        minzoom,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': lire('geologie-opacite', 0.7), 'raster-fade-duration': 150 },
      },
      avant
    );
  }

  let actif = false;
  let vueActive = 'simple';
  let erreurs = 0;
  let etatCouche = 'ok'; // 'ok', 'trop-loin', 'hors-zone', 'incomplete', 'erreur', 'hors-ligne'

  const pastille = creerPastilleCouche({
    ordre: 5,
    nom: () => (['ok', 'incomplete'].includes(etatCouche) ? t('geologie.court') : t(`geologie.court-${etatCouche}`)),
    legende: () => MINI_GEOLOGIE,
    onOuvrir: () => ouvrirReglage('nature'),
    onRetirer: () => eteindre(),
  });

  function majEtat() {
    let suivant = 'ok';
    const couvert = actif ? centreCouvert(map, vueActive) : null;
    if (map.getZoom() < VUE[vueActive].minzoom) suivant = 'trop-loin';
    // Quelques tuiles en échec au milieu des autres : la carte est là, mais incomplète
    else if (erreurs) suivant = estHorsLigne() ? 'hors-ligne' : recues ? 'incomplete' : 'erreur';
    else if (couvert === false) suivant = 'hors-zone';
    if (suivant !== etatCouche) {
      etatCouche = suivant;
      if (pastille.visible) pastille.maj();
    }
    surEtat(actif ? etatCouche : 'ok');
  }

  function appliquer() {
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    for (const vue of VUES) {
      map.setLayoutProperty(idCouche(vue), 'visibility', actif && vue === vueActive ? 'visible' : 'none');
    }
  }
  etat.majGeologie = appliquer;

  map.on('error', (e) => {
    // Une tuile abandonnée pendant un déplacement n'est pas un échec
    if (e.sourceId !== idCouche(vueActive) || e.error?.name === 'AbortError') return;
    erreurs += 1;
    majEtat();
  });
  map.on('movestart', () => { erreurs = 0; recues = 0; });
  map.on('moveend', majEtat);
  map.on('sourcedata', (e) => { if (e.sourceId === idCouche(vueActive) && e.tile) majEtat(); });
  window.addEventListener('reseau-change', majEtat);

  return {
    afficher(oui, vue = vueActive) {
      actif = oui;
      vueActive = VUES.includes(vue) ? vue : 'simple';
      erreurs = 0;
      recues = 0;
      appliquer();
      pastille.montrer(oui);
      majEtat();
    },
    opacite(valeur) {
      ecrire('geologie-opacite', valeur);
      for (const vue of VUES) map.setPaintProperty(idCouche(vue), 'raster-opacity', valeur);
    },
    rafraichir: () => pastille.visible && pastille.maj(),
  };
}
