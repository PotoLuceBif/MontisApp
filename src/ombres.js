// Ombre du soleil : ombrage du relief éclairé depuis la position réelle du soleil, et ombre portée par les
// montagnes voisines (calculée dans le travailleur des pentes). Réglages du jour et de l'heure, pastille,
// soleil dans le ciel en 3D. Chargé à la première activation (ombres-panneau.js).
import { REPERE_CALQUES } from './style-montis.js';
import { ZOOM_MAX_OMBRES } from './ombre-tuile.js';
import { ZOOM_MIN_PORTEES } from './ombre-calcul.js';
import { adresseTuilesOmbre, ajouterProtocoleOmbre, eclairer, PEINTURE_OMBRAGE } from './ombre-couches.js';
import { cadran, creerReglageSoleil, tournerCadrans } from './soleil-reglage.js';
import { creerSoleilCiel } from './soleil-ciel.js';
import { heureDuLieu, nomDecalage } from './soleil.js';
import { etat } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { estHorsLigne } from './hors-ligne.js';
import { poser, surLangue, t, ta } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';
import { pourcent } from './unites.js';

const SOURCE_PORTEE = 'ombre-portee';
const COUCHE_OMBRAGE = 'ombre-soleil';
const AVANT = ['pentes-pentes', REPERE_CALQUES, 'montis-road-casing', 'courbes']; // pentes, routes et sentiers restent lisibles

export function initOmbres(map, { details, eteindre }) {
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
  let portees = lire('ombres-portees', true);
  let intensite = lire('ombres-intensite', 0.45);
  let erreurs = 0;

  // ---------- Panneau ----------
  const reglage = creerReglageSoleil(map, { surChangement: (options) => tout(options), actif: () => actif });
  details.innerHTML = `
    <label class="ligne-coche ombres-portees-ligne"><input type="checkbox" class="ombres-portees"> <span data-i18n="ombres.portees"></span></label>
    <p class="note ombres-etat" role="status" hidden></p>
    <div class="relief-reglage">
      <div class="relief-entete">
        <span data-i18n="ombres.intensite"></span>
        <strong class="ombres-intensite-valeur"></strong>
      </div>
      <input type="range" class="ombres-intensite" min="0.2" max="1" step="0.05" ${ta('aria-label', 'ombres.intensite')}>
    </div>
    <p class="note ombres-fuseau"></p>
    <p class="note pentes-prudence" data-i18n="ombres.prudence"></p>
  `;
  details.prepend(reglage.element); // en `display: contents` : la grille du panneau reste la même
  details.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const casePortees = details.querySelector('.ombres-portees');
  const note = details.querySelector('.ombres-etat');
  const curseurIntensite = details.querySelector('.ombres-intensite');
  const valeurIntensite = details.querySelector('.ombres-intensite-valeur');
  const fuseau = details.querySelector('.ombres-fuseau');

  const soleil = () => reglage.soleil();
  const nuit = () => reglage.nuit();

  // ---------- Pastille sur la carte ----------
  const pastille = creerPastilleCouche({
    ordre: 1,
    nom: () => t(nuit() ? 'ombres.pastille-nuit' : 'ombres.pastille', { heure: heureDuLieu(reglage.instant(), reglage.decalage()) }),
    legende: () => cadran('mini-cadran'),
    onOuvrir: () => ouvrirReglage('relief'),
    onRetirer: () => eteindre(),
  });

  // Le cadran de la pastille tourne avec la carte ; celui du panneau, avec son réglage
  function majCadrans() {
    document.querySelectorAll('.mini-cadran').forEach((svg) => tournerCadrans(svg.parentElement, soleil(), map.getBearing()));
    tournerCadrans(details, soleil(), map.getBearing());
  }

  // ---------- Soleil dans le ciel, en 3D ----------
  const ciel = creerSoleilCiel(map);
  const majCiel = () => ciel.montrer(actif && etat.mode3D && !etat.enVisite ? soleil() : null);

  // ---------- Couches selon le soleil ----------
  let adresse = null;
  let lumiereAvant = null;
  function appliquer() {
    majCiel();
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    const voir = actif && soleil() && !nuit();
    etat.ombresSoleil = actif;
    if (map.getLayer('ombrage')) {
      map.setLayoutProperty('ombrage', 'visibility', etat.mode3D && !actif ? 'visible' : 'none');
    }
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
    reglage.majTextes();
    fuseau.textContent = t('soleil.fuseau-appareil', { fuseau: nomDecalage(reglage.decalage()) });
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
  casePortees.checked = portees;
  casePortees.addEventListener('change', () => {
    portees = casePortees.checked;
    ecrire('ombres-portees', portees);
    tout();
  });
  curseurIntensite.value = intensite;
  curseurIntensite.addEventListener('input', () => {
    intensite = Number(curseurIntensite.value);
    ecrire('ombres-intensite', intensite);
    tout();
  });

  // ---------- Carte ----------
  // Le soleil se calcule au centre de la carte : un grand déplacement le change un peu
  map.on('moveend', () => tout());
  map.on('rotate', majCadrans);
  map.on('zoom', () => { if (actif) majEtat(); });
  map.on('error', (e) => {
    if (e.sourceId !== SOURCE_PORTEE || e.error?.message === 'annulée') return;
    erreurs += 1;
    majEtat();
  });
  window.addEventListener('mode3d', () => { if (actif) appliquer(); });
  surLangue(() => { if (actif) majTextes(); });
  etat.majOmbres = () => { if (actif) appliquer(); else majCiel(); };

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
