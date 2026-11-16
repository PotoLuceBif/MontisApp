// Mode guidage d'un tracé (« Démarrer la sortie ») : position suivie sur la carte, sur la trace
// et sur le profil, ce qui reste, les prochains repères et les deux temps restants.
// Rien n'est enregistré : la montre le fait. Pas d'alerte de sortie de trace : quand on revient
// sur l'appli loin de la trace, on propose le chemin pour la rejoindre.
import { SOURCE_VECTEUR } from './source-vecteur.js';
import { calculerTroncon, longueurLigne } from './parcours-routage.js';
import { formaterDuree } from './rando-profil.js';
import { estHorsLigne } from './hors-ligne.js';
import { formatAltitude, formatDistance } from './unites.js';
import { poser, t, ti } from './i18n.js';
import { ECART_HORS_TRACE, deniveles, prochainsReperes, reperesSurTrace, restant, situerSurTrace, tempsRestants } from './guidage-calcul.js';

const ECART_RETOUR = 30; // m : de nouveau sur la trace, la proposition de la rejoindre disparaît
const PRECISION_MAX = 100; // m : une position plus floue ne place pas sur la trace

let refuges = null;
function chargerRefuges() {
  refuges ??= fetch('/data/refuges.json')
    .then((reponse) => (reponse.ok ? reponse.json() : { features: [] }))
    .then(({ features }) => features.map(({ geometry, properties }) => ({ lng: geometry.coordinates[0], lat: geometry.coordinates[1], nom: properties.name, genre: 'refuge' })))
    .catch(() => {
      refuges = null;
      return [];
    });
  return refuges;
}

export function creerGuidage(map, { id, panneau, bloc, profil, pratique, analyse, allure, cadrer }) {
  const SOURCE_POSITION = `${id}-position`;
  const SOURCE_REJOINDRE = `${id}-rejoindre`;
  let actif = false;
  let surveillance = null;
  let verrou = null;
  let suivre = true;
  let precedent = null;
  let position = null;
  let place = null;
  let depart = null; // { indice, instant } : début de la sortie suivie
  let reperes = [];
  let proposerRejoindre = true;
  let controleur = null;

  bloc.innerHTML = `
    <div class="guidage-etat" role="status" aria-live="polite"></div>
    <div class="guidage-rejoindre" hidden>
      <p></p>
      <button type="button" class="para-bouton guidage-rejoindre-bouton" ${ti('guidage.rejoindre')}>${t('guidage.rejoindre')}</button>
    </div>
    <div class="guidage-stats">
      <div class="guidage-stat guidage-stat-principale"><span ${ti('guidage.reste')}>${t('guidage.reste')}</span><strong data-g="distance">—</strong></div>
      <div class="guidage-stat"><span>D+</span><strong data-g="plus">—</strong></div>
      <div class="guidage-stat"><span>D−</span><strong data-g="moins">—</strong></div>
    </div>
    <div class="guidage-temps">
      <div><span ${ti('guidage.temps-standard')}>${t('guidage.temps-standard')}</span><strong data-g="standard">—</strong></div>
      <div><span ${ti('guidage.temps-toi')}>${t('guidage.temps-toi')}</span><strong data-g="personnel">—</strong><small data-g="ecart"></small></div>
    </div>
    <div class="guidage-reperes" hidden><h4 ${ti('guidage.reperes')}>${t('guidage.reperes')}</h4><ul></ul></div>
    <div class="guidage-actions">
      <button type="button" class="para-bouton guidage-recentrer" hidden ${ti('guidage.recentrer')}>${t('guidage.recentrer')}</button>
      <button type="button" class="para-bouton guidage-arreter" ${ti('guidage.arreter')}>${t('guidage.arreter')}</button>
    </div>
  `;
  const $ = (selecteur) => bloc.querySelector(selecteur);
  const g = (cle) => $(`[data-g="${cle}"]`);
  const etat = $('.guidage-etat');
  const blocRejoindre = $('.guidage-rejoindre');
  const boutonRecentrer = $('.guidage-recentrer');

  function assurerCouches() {
    if (map.getSource(SOURCE_POSITION)) return;
    map.addSource(SOURCE_REJOINDRE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: `${SOURCE_REJOINDRE}-ligne`, type: 'line', source: SOURCE_REJOINDRE, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffb020', 'line-width': 4, 'line-dasharray': [1, 1.6] } });
    map.addSource(SOURCE_POSITION, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: `${SOURCE_POSITION}-halo`, type: 'circle', source: SOURCE_POSITION, paint: { 'circle-radius': 16, 'circle-color': '#4aa8ff', 'circle-opacity': 0.22 } });
    map.addLayer({ id: `${SOURCE_POSITION}-point`, type: 'circle', source: SOURCE_POSITION, paint: { 'circle-radius': 7, 'circle-color': '#4aa8ff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
  }
  const vider = (source) => map.getSource(source)?.setData({ type: 'FeatureCollection', features: [] });

  // Refuges du fichier de Montis, sommets et cols des tuiles chargées autour de la trace
  async function chercherReperes() {
    const sommets = map.querySourceFeatures(SOURCE_VECTEUR, { sourceLayer: 'mountain_peak' })
      .filter(({ properties }) => properties.name)
      .map(({ geometry, properties }) => ({
        lng: geometry.coordinates[0],
        lat: geometry.coordinates[1],
        nom: properties.name,
        genre: properties.class === 'saddle' ? 'col' : 'sommet',
        altitude: Number.isFinite(properties.ele) ? properties.ele : null,
      }));
    const vus = new Set();
    const candidats = [...(await chargerRefuges()), ...sommets].filter(({ nom, genre }) => {
      const cle = `${genre}:${nom}`;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
    reperes = reperesSurTrace(analyse().points, candidats);
    rendre();
  }

  function rendre() {
    const donnees = analyse();
    if (!place || !donnees) return;
    const reste = restant(donnees, place.indice, place.d);
    g('distance').textContent = formatDistance(reste.distance);
    g('plus').textContent = formatAltitude(reste.plus);
    g('moins').textContent = formatAltitude(reste.moins);
    // Ce qui est fait depuis le départ de la sortie suivie (on peut démarrer en route)
    const debut = depart?.indice ?? place.indice;
    const fait = deniveles(donnees.alts.slice(debut, place.indice + 1));
    const temps = tempsRestants({
      duree: pratique().duree,
      reste: { ...reste, fait: { distance: Math.max(0, place.d - donnees.points[debut].d), ...fait } },
      allure: allure(),
      ecoule: depart ? (Date.now() - depart.instant) / 3600000 : 0,
    });
    const fini = reste.distance < 30;
    g('standard').textContent = fini ? '—' : formaterDuree(temps.standard);
    g('personnel').textContent = fini ? '—' : formaterDuree(temps.personnel);
    const minutes = temps.ecart === null ? 0 : Math.round((temps.ecart * 60) / 5) * 5;
    const ecart = g('ecart');
    ecart.className = minutes < 0 ? 'guidage-avance' : minutes > 0 ? 'guidage-retard' : '';
    if (!minutes || fini) ecart.textContent = '';
    else poser(ecart, minutes < 0 ? 'guidage.avance' : 'guidage.retard', { n: Math.abs(minutes) });
    const prochains = prochainsReperes(reperes, place.d);
    $('.guidage-reperes').hidden = !prochains.length;
    $('.guidage-reperes ul').replaceChildren(...prochains.map((repere) => {
      const ligne = document.createElement('li');
      const nom = document.createElement('strong');
      nom.textContent = repere.nom;
      const detail = document.createElement('small');
      const altitude = repere.altitude ? ` · ${formatAltitude(repere.altitude)}` : '';
      detail.textContent = `${t(`guidage.genre-${repere.genre}`)} · ${formatDistance(repere.d - place.d)}${altitude}`;
      ligne.append(nom, detail);
      return ligne;
    }));
    if (fini) poser(etat, 'guidage.arrive');
  }

  // Loin de la trace en revenant sur l'appli : on propose d'y aller, sans insister
  function majRejoindre() {
    if (!place) return;
    if (place.ecart <= ECART_RETOUR) {
      blocRejoindre.hidden = true;
      vider(SOURCE_REJOINDRE);
      return;
    }
    if (!proposerRejoindre || place.ecart <= ECART_HORS_TRACE) return;
    proposerRejoindre = false;
    blocRejoindre.hidden = false;
    poser(blocRejoindre.querySelector('p'), 'guidage.loin', { distance: formatDistance(place.ecart) });
  }

  async function rejoindre() {
    if (!position || !place) return;
    const donnees = analyse();
    const cible = donnees.points[place.indice];
    controleur?.abort();
    controleur = new AbortController();
    const texte = blocRejoindre.querySelector('p');
    poser(texte, 'guidage.calcul');
    let ligne;
    try {
      if (estHorsLigne()) throw new Error('hors ligne');
      const troncon = await calculerTroncon([position.lng, position.lat], [cible.lng, cible.lat], pratique(), controleur.signal);
      // Le routage part du chemin le plus proche : les bouts jusqu'à la position et jusqu'à la trace comptent aussi
      ligne = [[position.lng, position.lat], ...troncon.geom.map(([lng, lat]) => [lng, lat]), [cible.lng, cible.lat]];
      poser(texte, 'guidage.chemin', { distance: formatDistance(longueurLigne(ligne)) });
    } catch (erreur) {
      if (controleur.signal.aborted) return;
      ligne = [[position.lng, position.lat], [cible.lng, cible.lat]];
      poser(texte, 'guidage.chemin-droit', { distance: formatDistance(place.ecart) });
    }
    assurerCouches();
    map.getSource(SOURCE_REJOINDRE).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: ligne }, properties: {} });
    suivre = false;
    boutonRecentrer.hidden = false;
    cadrer([...ligne, [position.lng, position.lat]]);
  }

  // Sur téléphone, le panneau couvre le bas : la position se place au milieu de ce qui reste visible
  function centrer(options = {}) {
    if (!position) return;
    const cadre = panneau.element.getBoundingClientRect();
    const toutLaLargeur = cadre.width >= window.innerWidth - 4 && !panneau.element.classList.contains('bf-reduite');
    const bas = toutLaLargeur ? Math.max(0, window.innerHeight - cadre.top) : 0;
    map.easeTo({ center: [position.lng, position.lat], offset: [0, -bas / 2], duration: 600, ...options });
  }

  function surPosition({ coords }) {
    if (!actif) return;
    position = { lng: coords.longitude, lat: coords.latitude, precision: coords.accuracy };
    assurerCouches();
    map.getSource(SOURCE_POSITION).setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [position.lng, position.lat] }, properties: {} });
    if (suivre) centrer();
    if (position.precision > PRECISION_MAX) {
      poser(etat, 'guidage.imprecis', { precision: Math.round(position.precision) });
      return;
    }
    const donnees = analyse();
    if (!donnees) return;
    place = situerSurTrace(donnees.points, position, precedent);
    precedent = place.indice;
    if (!depart && place.ecart <= ECART_HORS_TRACE) depart = { indice: place.indice, instant: Date.now() };
    etat.textContent = '';
    profil.placerDepuisCarte(place.indice);
    majRejoindre();
    rendre();
  }

  function surErreur(erreur) {
    poser(etat, erreur.code === 1 ? 'guidage.refuse' : 'guidage.sans-position');
  }

  async function garderEcranAllume() {
    try {
      verrou = await navigator.wakeLock?.request('screen');
    } catch {
      verrou = null; // économie d'énergie, ou navigateur qui ne le permet pas
    }
  }

  function auRetour() {
    if (!actif || document.visibilityState !== 'visible') return;
    garderEcranAllume();
    proposerRejoindre = true;
  }

  function quandOnBouge(event) {
    if (!actif || !event.originalEvent) return;
    suivre = false;
    boutonRecentrer.hidden = false;
  }

  $('.guidage-rejoindre-bouton').addEventListener('click', rejoindre);
  boutonRecentrer.addEventListener('click', () => {
    suivre = true;
    boutonRecentrer.hidden = true;
    centrer({ zoom: Math.max(map.getZoom(), 15) });
  });
  document.addEventListener('visibilitychange', auRetour);
  map.on('dragstart', quandOnBouge);

  const interface_ = {
    get actif() {
      return actif;
    },
    demarrer() {
      if (actif || !analyse()) return;
      actif = true;
      suivre = true;
      precedent = null;
      place = null;
      depart = null;
      proposerRejoindre = true;
      boutonRecentrer.hidden = true;
      blocRejoindre.hidden = true;
      bloc.hidden = false;
      panneau.element.classList.add('bf-parcours-guidage');
      poser(etat, 'guidage.attente');
      ['distance', 'plus', 'moins', 'standard', 'personnel'].forEach((cle) => (g(cle).textContent = '—'));
      g('ecart').textContent = '';
      if (!navigator.geolocation) {
        poser(etat, 'guidage.sans-position');
        return;
      }
      surveillance = navigator.geolocation.watchPosition(surPosition, surErreur, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
      garderEcranAllume();
      chercherReperes();
    },
    arreter() {
      if (!actif) return;
      actif = false;
      if (surveillance !== null) navigator.geolocation.clearWatch(surveillance);
      surveillance = null;
      verrou?.release?.().catch?.(() => {});
      verrou = null;
      controleur?.abort();
      bloc.hidden = true;
      panneau.element.classList.remove('bf-parcours-guidage');
      vider(SOURCE_POSITION);
      vider(SOURCE_REJOINDRE);
      profil.placerDepuisCarte(null);
    },
    reafficher: rendre,
  };
  $('.guidage-arreter').addEventListener('click', () => interface_.arreter());
  return interface_;
}
