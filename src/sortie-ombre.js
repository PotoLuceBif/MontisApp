// Ombre du soleil d'une sortie : ombrage et ombre portée pour le soleil de l'instant et du lieu du
// curseur, soleil dans le ciel en 3D. Même mécanique que Carte › Relief (ombres.js), qui laisse
// la place tant que celle-ci est allumée (`etat.ombreSortie`).
import { REPERE_CALQUES } from './style-montis.js';
import { ZOOM_MAX_OMBRES } from './ombre-tuile.js';
import { ZOOM_MIN_PORTEES } from './ombre-calcul.js';
import { adresseTuilesOmbre, ajouterProtocoleOmbre, eclairer, PEINTURE_OMBRAGE } from './ombre-couches.js';
import { creerSoleilCiel } from './soleil-ciel.js';
import { positionSoleil } from './soleil.js';
import { etat, majOmbrage } from './options-carte.js';
import { lire } from './reglages.js';

const COUCHE_OMBRAGE = 'sortie-ombre-soleil';
const SOURCE_PORTEE = 'sortie-ombre-portee';
const AVANT = ['pentes-pentes', REPERE_CALQUES, 'montis-road-casing', 'courbes'];
const RELIEF = ['ombre-soleil', 'ombre-portee']; // les couches de Carte › Relief

export function creerOmbreSortie(map) {
  let actif = false;
  let soleil = null;
  let adresse = null;
  let minuteur = null;
  let ciel = null;

  function assurerCouches() {
    if (map.getLayer(COUCHE_OMBRAGE) || !map.getSource('ombrage')) return;
    ajouterProtocoleOmbre();
    const avant = AVANT.find((id) => map.getLayer(id));
    map.addLayer({ id: COUCHE_OMBRAGE, type: 'hillshade', source: 'ombrage', layout: { visibility: 'none' }, paint: PEINTURE_OMBRAGE }, avant);
    map.addSource(SOURCE_PORTEE, {
      type: 'raster',
      tiles: [adresseTuilesOmbre({ azimut: 180, hauteur: 30 })],
      tileSize: 256,
      minzoom: ZOOM_MIN_PORTEES,
      maxzoom: ZOOM_MAX_OMBRES,
    });
    map.addLayer({
      id: SOURCE_PORTEE, type: 'raster', source: SOURCE_PORTEE, minzoom: ZOOM_MIN_PORTEES, layout: { visibility: 'none' },
      paint: { 'raster-opacity': 0.5, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
    }, avant);
  }

  const intensite = () => lire('ombres-intensite', 0.45);

  function appliquer() {
    const voir = actif && soleil && soleil.hauteur > 0;
    if (map.getLayer(COUCHE_OMBRAGE)) {
      map.setLayoutProperty(COUCHE_OMBRAGE, 'visibility', voir ? 'visible' : 'none');
      map.setLayoutProperty(SOURCE_PORTEE, 'visibility', voir ? 'visible' : 'none');
      if (voir) eclairer(map, COUCHE_OMBRAGE, SOURCE_PORTEE, soleil, intensite());
    }
    // L'ombrage fixe de la 3D et celui de Carte › Relief s'effacent devant celui de la sortie
    majOmbrage(map);
    if (actif) RELIEF.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'none'));
    ciel?.montrer(actif && etat.mode3D ? soleil : null);
  }

  // L'ombre portée se recalcule tuile par tuile : pendant un glissement ou une lecture, on attend une pause
  function majPortee({ attendre }) {
    clearTimeout(minuteur);
    if (!soleil || soleil.hauteur <= 0) return;
    const nouvelle = adresseTuilesOmbre(soleil);
    if (nouvelle === adresse) return;
    const faire = () => {
      adresse = nouvelle;
      map.getSource(SOURCE_PORTEE)?.setTiles([nouvelle]);
    };
    if (attendre) minuteur = setTimeout(faire, 350);
    else faire();
  }

  window.addEventListener('mode3d', () => actif && appliquer());

  return {
    get actif() {
      return actif;
    },
    allumer(oui) {
      actif = oui;
      etat.ombreSortie = oui;
      if (oui) {
        assurerCouches();
        ciel ??= creerSoleilCiel(map);
      } else {
        clearTimeout(minuteur);
      }
      appliquer();
      if (!oui) etat.majOmbres?.(); // Carte › Relief reprend sa place
    },
    // Instant (ms) et lieu du curseur ; renvoie le soleil, ou null sans heure
    placer(instant, lng, lat, { attendre = false } = {}) {
      soleil = Number.isFinite(instant) ? positionSoleil(instant, lat, lng) : null;
      if (!actif) return soleil;
      appliquer();
      majPortee({ attendre });
      return soleil;
    },
  };
}
