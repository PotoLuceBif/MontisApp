// Ombre du soleil : ombrage du relief éclairé depuis la position réelle du soleil, et ombre portée par les
// montagnes voisines (calculée dans le travailleur des pentes). Pastille ; le soleil et la Lune dans le ciel
// sont dessinés par la rubrique (soleil-lune.js). Le jour et l'heure sont ceux de la rubrique Soleil et Lune
// (soleil-lune.js). Chargé à la première activation (ombres-panneau.js).
import { REPERE_CALQUES } from './style-montis.js';
import { ZOOM_MAX_OMBRES } from './ombre-tuile.js';
import { ZOOM_MIN_PORTEES } from './ombre-calcul.js';
import { adresseTuilesOmbre, ajouterProtocoleOmbre, eclairer, PEINTURE_OMBRAGE } from './ombre-couches.js';
import { cadran, tournerCadrans } from './soleil-reglage.js';
import { heureDuLieu } from './soleil.js';
import { etat, majOmbrage } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { estHorsLigne } from './hors-ligne.js';
import { poser, surLangue, t, ta } from './i18n.js';
import { creerPastilleCouche } from './couches-actives.js';
import { pourcent } from './unites.js';

const SOURCE_PORTEE = 'ombre-portee';
const COUCHE_OMBRAGE = 'ombre-soleil';
const AVANT = ['pentes-pentes', REPERE_CALQUES, 'montis-road-casing', 'courbes']; // pentes, routes et sentiers restent lisibles

export function initOmbres(map, { details, reglage, partage, eteindre }) {
  ajouterProtocoleOmbre();

  // ---------- Couches ----------
  const avant = AVANT.find((id) => map.getLayer(id));
  map.addLayer({
    id: COUCHE_OMBRAGE,
    type: 'hillshade',
    source: 'ombrage', // même relief que l'ombrage de la 3D (main.js)
    layout: { visibility: 'none' },
    paint: PEINTURE_OMBRAGE,
  }, avant);
  map.addSource(SOURCE_PORTEE, {
    type: 'raster',
    tiles: [adresseTuilesOmbre({ azimut: 180, hauteur: 30 })],
    tileSize: 256,
    minzoom: ZOOM_MIN_PORTEES,
    maxzoom: ZOOM_MAX_OMBRES,
  });
  map.addLayer({
    id: SOURCE_PORTEE,
    type: 'raster',
    source: SOURCE_PORTEE,
    minzoom: ZOOM_MIN_PORTEES,
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': 0.5, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
  }, avant);

  // ---------- État ----------
  let actif = false;
  // L'ombre portée des montagnes fait toujours partie de l'ombre du soleil (décision du propriétaire du 16 novembre 2026)
  const portees = true;
  let intensite = lire('ombres-intensite', 0.45);
  let erreurs = 0;

  // ---------- Panneau ----------
  details.innerHTML = `
    <p class="note ombres-etat" role="status" hidden></p>
    <div class="relief-reglage">
      <div class="relief-entete">
        <span data-i18n="ombres.intensite"></span>
        <strong class="ombres-intensite-valeur"></strong>
      </div>
      <input type="range" class="ombres-intensite" min="0.2" max="1" step="0.05" ${ta('aria-label', 'ombres.intensite')}>
    </div>
    <p class="note pentes-prudence" data-i18n="ombres.prudence"></p>
  `;
  details.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const note = details.querySelector('.ombres-etat');
  const curseurIntensite = details.querySelector('.ombres-intensite');
  const valeurIntensite = details.querySelector('.ombres-intensite-valeur');

  const soleil = () => reglage.soleil();
  const nuit = () => reglage.nuit();

  // ---------- Pastille sur la carte ----------
  const pastille = creerPastilleCouche({
    ordre: 1,
    nom: () => t(nuit() ? 'ombres.pastille-nuit' : 'ombres.pastille', { heure: heureDuLieu(reglage.instant(), reglage.decalage()) }),
    legende: () => cadran('mini-cadran'),
    rubrique: 'ciel',
    onOuvrir: () => window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'ciel', module: 'ombres' } })),
    onRetirer: () => eteindre(),
  });

  // Le cadran de la pastille tourne avec la carte ; celui du panneau, avec son réglage
  function majCadrans() {
    document.querySelectorAll('.mini-cadran').forEach((svg) => tournerCadrans(svg.parentElement, soleil(), map.getBearing()));
    tournerCadrans(details, soleil(), map.getBearing());
  }

  // Soleil et Lune dans le ciel, en 3D : dessinés par la rubrique, avec l'ombre ou l'option « Dans le ciel »
  const majCiel = () => partage.majCiel();

  // ---------- Couches selon le soleil ----------
  let adresse = null;
  let lumiereAvant = null;
  function appliquer() {
    majCiel();
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    if (etat.ombreSortie) return; // l'ombre d'une sortie a la place ; elle rappelle etat.majOmbres en s'éteignant
    const voir = actif && soleil() && !nuit();
    etat.ombresSoleil = actif;
    majOmbrage(map);
    map.setLayoutProperty(COUCHE_OMBRAGE, 'visibility', voir ? 'visible' : 'none');
    map.setLayoutProperty(SOURCE_PORTEE, 'visibility', voir && portees ? 'visible' : 'none');
    if (!voir) return;
    eclairer(map, COUCHE_OMBRAGE, SOURCE_PORTEE, soleil(), intensite);
    // Bâtiments 3D éclairés du même côté
    map.setLight({ anchor: 'map', position: [1.15, soleil().azimut, Math.min(89, 90 - soleil().hauteur)] });
  }

  // L'ombre portée se recalcule à chaque changement : pendant un glissement, on attend que le doigt se pose
  let minuteurPortees = null;
  function majPortees({ attendre = false } = {}) {
    clearTimeout(minuteurPortees);
    if (!soleil() || nuit()) return;
    const nouvelle = adresseTuilesOmbre(soleil());
    if (nouvelle === adresse) return;
    const faire = () => {
      adresse = nouvelle;
      erreurs = 0;
      map.getSource(SOURCE_PORTEE)?.setTiles([nouvelle]);
    };
    if (attendre) minuteurPortees = setTimeout(faire, 350);
    else faire();
  }

  // ---------- Textes ----------
  function majTextes() {
    valeurIntensite.textContent = pourcent(intensite * 100);
    majEtat();
    majCadrans();
    if (pastille.visible) pastille.maj();
  }

  function majEtat() {
    let texte = '';
    if (nuit()) texte = t('ombres.nuit');
    else if (portees && map.getZoom() < ZOOM_MIN_PORTEES) texte = t('ombres.zoom');
    else if (portees && erreurs) texte = t(estHorsLigne() ? 'pentes.hors-ligne' : 'pentes.erreur');
    note.textContent = texte;
    note.hidden = !texte;
  }

  function tout({ attendre = false } = {}) {
    if (!actif) return;
    reglage.calculer();
    appliquer();
    majPortees({ attendre });
    majTextes();
  }

  // ---------- Réglages ----------
  curseurIntensite.value = intensite;
  curseurIntensite.addEventListener('input', () => {
    intensite = Number(curseurIntensite.value);
    ecrire('ombres-intensite', intensite);
    tout();
  });

  // ---------- Carte ----------
  // Jour, heure ou lieu changés dans la rubrique (soleil-lune.js)
  partage.abonner((options) => tout(options));
  map.on('rotate', majCadrans);
  map.on('zoom', () => { if (actif) majEtat(); });
  map.on('error', (e) => {
    if (e.sourceId !== SOURCE_PORTEE || e.error?.message === 'annulée') return;
    erreurs += 1;
    majEtat();
  });
  window.addEventListener('mode3d', () => { if (actif) appliquer(); });
  surLangue(() => { if (actif) majTextes(); });
  etat.majOmbres = () => { if (actif) appliquer(); majCiel(); };

  return {
    afficher(oui) {
      if (oui === actif) return;
      actif = oui;
      if (oui) {
        lumiereAvant ??= map.getLight();
        tout();
      } else {
        clearTimeout(minuteurPortees);
        appliquer();
        if (lumiereAvant) map.setLight(lumiereAvant);
      }
      pastille.montrer(oui);
    },
  };
}
