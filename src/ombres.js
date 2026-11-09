// Ombre du soleil : ombrage du relief éclairé depuis la position réelle du soleil, et ombre portée par les
// montagnes voisines (calculée dans le travailleur des pentes). Réglages du jour et de l'heure, pastille.
// Chargé à la première activation (ombres-panneau.js).
import { REPERE_CALQUES } from './style-montis.js';
import { addProtocol } from 'maplibre-gl';
import { calculer } from './pentes-couche.js';
import { ZOOM_MAX_OMBRES } from './ombre-tuile.js';
import { ZOOM_MIN_PORTEES } from './ombre-calcul.js';
import { decalageAppareil, heureDuLieu, jourLocal, journeeSoleil, midiLocal, nomDecalage, positionSoleil } from './soleil.js';
import { codeCardinal } from './vent-calcul.js';
import { etat } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { estHorsLigne } from './hors-ligne.js';
import { formatDate, poser, surLangue, t, ta } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';
import { nombre, pourcent } from './unites.js';

const PROTOCOLE = 'montis-ombre';
const SOURCE_PORTEE = 'ombre-portee';
const COUCHE_OMBRAGE = 'ombre-soleil';
const AVANT = ['pentes-pentes', REPERE_CALQUES, 'montis-road-casing', 'courbes']; // pentes, routes et sentiers restent lisibles
const MINUTE = 60000;
const PAS_CURSEUR = 5;

// Arrondis : l'ombre portée est recalculée à chaque changement, l'œil ne voit pas moins
const arrondiAzimut = (a) => (Math.round(a) + 360) % 360;
const arrondiHauteur = (h) => Math.round(h * 2) / 2;

let protocoleAjoute = false;
function ajouterProtocole() {
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

const adresseTuiles = ({ azimut, hauteur }) => `${PROTOCOLE}://${arrondiAzimut(azimut)}/${arrondiHauteur(hauteur)}/{z}/{x}/{y}`;

// Petit cadran : le soleil sur le cercle, dans sa direction à l'écran (carte tournée comprise)
const cadran = (classe) => `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="9.5" class="ombres-cadran-cercle"/>
  <path d="M12 2.5v3" class="ombres-cadran-nord"/>
  <g class="ombres-cadran-aiguille"><path d="M12 12v6.5" class="ombres-cadran-ombre"/><circle cx="12" cy="5.5" r="3" class="ombres-cadran-soleil"/></g>
</svg>`;

export function initOmbres(map, { details, eteindre }) {
  ajouterProtocole();

  // ---------- Couches ----------
  const avant = AVANT.find((id) => map.getLayer(id));
  map.addLayer({
    id: COUCHE_OMBRAGE,
    type: 'hillshade',
    source: 'ombrage', // même relief que l'ombrage de la 3D (main.js)
    layout: { visibility: 'none' },
    paint: {
      'hillshade-method': 'basic',
      'hillshade-illumination-anchor': 'map',
      'hillshade-shadow-color': '#0e142a',
      'hillshade-highlight-color': 'rgba(255, 214, 150, 0.12)',
      'hillshade-exaggeration': 0.6,
    },
  }, avant);
  map.addSource(SOURCE_PORTEE, {
    type: 'raster',
    tiles: [adresseTuiles({ azimut: 180, hauteur: 30 })],
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

  // ---------- Panneau ----------
  details.innerHTML = `
    <div class="ombres-jour">
      <button type="button" class="ombres-jour-bouton" data-pas="-1" ${ta('aria-label', 'ombres.jour-precedent')}>‹</button>
      <label class="ombres-jour-nom">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>
        <strong></strong>
        <!-- Champ transparent posé sur le libellé : un appui ouvre le calendrier du téléphone -->
        <input type="date" class="ombres-calendrier" required ${ta('aria-label', 'ombres.choisir-jour')}>
      </label>
      <button type="button" class="ombres-jour-bouton" data-pas="1" ${ta('aria-label', 'ombres.jour-suivant')}>›</button>
    </div>
    <div class="relief-reglage ombres-heure">
      <div class="relief-entete">
        <span data-i18n="ombres.heure"></span>
        <strong class="ombres-heure-valeur"></strong>
      </div>
      <input type="range" class="ombres-curseur" min="0" max="${24 * 60 - PAS_CURSEUR}" step="${PAS_CURSEUR}" ${ta('aria-label', 'ombres.heure')}>
      <div class="ombres-piste" aria-hidden="true"><i></i></div>
      <div class="ombres-reperes">
        <span class="ombres-lever"></span>
        <button type="button" class="ombres-maintenant" data-i18n="soleil.maintenant"></button>
        <span class="ombres-coucher"></span>
      </div>
    </div>
    <div class="ombres-soleil" role="status">
      ${cadran('ombres-cadran')}
      <span class="ombres-soleil-texte"></span>
    </div>
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
  details.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const nomJour = details.querySelector('.ombres-jour-nom strong');
  const calendrier = details.querySelector('.ombres-calendrier');
  const curseur = details.querySelector('.ombres-curseur');
  const valeurHeure = details.querySelector('.ombres-heure-valeur');
  const piste = details.querySelector('.ombres-piste i');
  const texteSoleil = details.querySelector('.ombres-soleil-texte');
  const casePortees = details.querySelector('.ombres-portees');
  const note = details.querySelector('.ombres-etat');
  const curseurIntensite = details.querySelector('.ombres-intensite');
  const valeurIntensite = details.querySelector('.ombres-intensite-valeur');
  const fuseau = details.querySelector('.ombres-fuseau');

  // ---------- État ----------
  let actif = false;
  let decalage = decalageAppareil();
  let jour = jourLocal(Date.now(), decalage);
  // « maintenant » suit l'horloge ; sinon, minutes depuis minuit
  let heure = lire('ombres-heure', 'maintenant');
  let portees = lire('ombres-portees', true);
  let intensite = lire('ombres-intensite', 0.45);
  let soleil = null; // { azimut, hauteur } au centre de la carte
  let journee = null;
  let erreurs = 0;

  const minutesMaintenant = () => {
    const d = new Date(Date.now() + decalage * MINUTE);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const minutesChoisies = () => (heure === 'maintenant' ? minutesMaintenant() : heure);
  const instant = () => midiLocal(jour, decalage).getTime() + (minutesChoisies() - 12 * 60) * MINUTE;
  const nuit = () => soleil && soleil.hauteur <= 0;

  // ---------- Pastille sur la carte ----------
  const pastille = creerPastilleCouche({
    ordre: 1,
    nom: () => t(nuit() ? 'ombres.pastille-nuit' : 'ombres.pastille', { heure: heureDuLieu(instant(), decalage) }),
    legende: () => cadran('mini-cadran'),
    onOuvrir: () => ouvrirReglage('relief'),
    onRetirer: () => eteindre(),
  });

  // Le cadran tourne avec la carte : le soleil est montré dans sa direction à l'écran
  function majCadrans() {
    if (!soleil) return;
    const angle = soleil.azimut - map.getBearing();
    document.querySelectorAll('.ombres-cadran-aiguille').forEach((g) => {
      g.setAttribute('transform', `rotate(${angle.toFixed(1)} 12 12)`);
      g.closest('svg').classList.toggle('nuit', nuit());
    });
  }

  // ---------- Couches selon le soleil ----------
  let adresse = null;
  let lumiereAvant = null;
  function appliquer() {
    if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
    const voir = actif && soleil && !nuit();
    etat.ombresSoleil = actif;
    if (map.getLayer('ombrage')) {
      map.setLayoutProperty('ombrage', 'visibility', etat.mode3D && !actif ? 'visible' : 'none');
    }
    map.setLayoutProperty(COUCHE_OMBRAGE, 'visibility', voir ? 'visible' : 'none');
    map.setLayoutProperty(SOURCE_PORTEE, 'visibility', voir && portees ? 'visible' : 'none');
    if (!voir) return;
    map.setPaintProperty(COUCHE_OMBRAGE, 'hillshade-illumination-direction', arrondiAzimut(soleil.azimut) % 360);
    map.setPaintProperty(COUCHE_OMBRAGE, 'hillshade-illumination-altitude', Math.min(90, Math.max(0, soleil.hauteur)));
    map.setPaintProperty(COUCHE_OMBRAGE, 'hillshade-exaggeration', intensite);
    map.setPaintProperty(SOURCE_PORTEE, 'raster-opacity', intensite * 0.75);
    // Bâtiments 3D éclairés du même côté
    map.setLight({ anchor: 'map', position: [1.15, soleil.azimut, Math.min(89, 90 - soleil.hauteur)] });
  }

  // L'ombre portée se recalcule à chaque changement : pendant un glissement, on attend que le doigt se pose
  let minuteurPortees = null;
  function majPortees({ attendre = false } = {}) {
    clearTimeout(minuteurPortees);
    if (!soleil || nuit()) return;
    const nouvelle = adresseTuiles(soleil);
    if (nouvelle === adresse) return;
    const faire = () => {
      adresse = nouvelle;
      erreurs = 0;
      map.getSource(SOURCE_PORTEE)?.setTiles([nouvelle]);
    };
    if (attendre) minuteurPortees = setTimeout(faire, 350);
    else faire();
  }

  function calculerSoleil() {
    const { lng, lat } = map.getCenter();
    const position = positionSoleil(instant(), lat, lng);
    soleil = { azimut: position.azimut, hauteur: position.hauteur };
    journee = journeeSoleil(jour, lat, lng, decalage);
  }

  // ---------- Textes ----------
  function majTextes() {
    const aujourdhui = jourLocal(Date.now(), decalage);
    const autreAnnee = jour.slice(0, 4) !== aujourdhui.slice(0, 4);
    const date = formatDate(`${jour}T12:00:00Z`, {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC', ...(autreAnnee && { year: 'numeric' }),
    });
    nomJour.textContent = jour === aujourdhui ? t('ombres.aujourdhui', { date }) : date;
    calendrier.value = jour;
    valeurHeure.textContent = heureDuLieu(instant(), decalage);
    curseur.value = minutesChoisies();
    details.querySelector('.ombres-maintenant').classList.toggle('actif', heure === 'maintenant' && jour === aujourdhui);
    details.querySelector('.ombres-lever').textContent = journee?.lever ? `↑ ${heureDuLieu(journee.lever, decalage)}` : '';
    details.querySelector('.ombres-coucher').textContent = journee?.coucher ? `${heureDuLieu(journee.coucher, decalage)} ↓` : '';
    // Bande du jour sous le curseur
    const position = (date) => ((date.getTime() - (midiLocal(jour, decalage).getTime() - 12 * 60 * MINUTE)) / (24 * 60 * MINUTE)) * 100;
    if (journee?.regime === 'jour-polaire') piste.style.cssText = 'left: 0; right: 0;';
    else if (journee?.lever && journee?.coucher) {
      const debut = Math.max(0, position(journee.lever));
      const fin = Math.min(100, position(journee.coucher));
      piste.style.cssText = `left: ${debut}%; right: ${100 - fin}%;`;
    } else piste.style.cssText = 'display: none;';
    if (soleil) {
      const direction = `${nombre(Math.round(soleil.azimut))}° ${t(`cardinal.${codeCardinal(soleil.azimut)}`)}`;
      texteSoleil.textContent = nuit()
        ? t('ombres.soleil-nuit', { hauteur: `${nombre(Math.round(soleil.hauteur))}°` })
        : t('ombres.soleil', { hauteur: `${nombre(Math.round(soleil.hauteur))}°`, direction });
    }
    fuseau.textContent = t('soleil.fuseau-appareil', { fuseau: nomDecalage(decalage) });
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
    calculerSoleil();
    appliquer();
    majPortees({ attendre });
    majTextes();
  }

  // ---------- Réglages ----------
  function changerJour(nouveau) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nouveau) || nouveau === jour) return;
    jour = nouveau;
    if (heure === 'maintenant') heure = minutesMaintenant(); // un autre jour : l'heure ne suit plus l'horloge
    tout();
  }
  details.querySelectorAll('.ombres-jour-bouton').forEach((b) => {
    b.addEventListener('click', () => {
      const d = new Date(`${jour}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Number(b.dataset.pas));
      changerJour(d.toISOString().slice(0, 10));
    });
  });
  // Sur ordinateur, le champ n'ouvre son calendrier que par sa petite icône : on l'ouvre au clic
  calendrier.addEventListener('click', () => {
    try { calendrier.showPicker?.(); } catch { /* déjà ouvert, ou refusé par le navigateur */ }
  });
  calendrier.addEventListener('change', () => changerJour(calendrier.value));
  curseur.addEventListener('input', () => {
    heure = Number(curseur.value);
    ecrire('ombres-heure', heure);
    tout({ attendre: true });
  });
  details.querySelector('.ombres-maintenant').addEventListener('click', () => {
    heure = 'maintenant';
    ecrire('ombres-heure', heure);
    decalage = decalageAppareil();
    jour = jourLocal(Date.now(), decalage);
    tout();
  });
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
  // L'heure « maintenant » avance toute seule
  setInterval(() => { if (actif && heure === 'maintenant') tout(); }, MINUTE);
  surLangue(() => { if (actif) majTextes(); });
  etat.majOmbres = () => { if (actif) appliquer(); };

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
