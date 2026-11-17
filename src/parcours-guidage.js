// Mode guidage d'un tracé (« Démarrer la sortie ») : position suivie sur la carte, sur la trace
// et sur le profil, ce qui reste, les prochains repères et les deux temps restants ; cône de la
// boussole et flèche du déplacement ; mode poche ; trace enregistrée si on le demande.
// Pas d'alerte de sortie de trace : quand on revient sur l'appli loin de la trace,
// on propose le chemin pour la rejoindre.
import * as maplibregl from 'maplibre-gl';
import { SOURCE_VECTEUR } from './source-vecteur.js';
import { calculerTroncon, longueurLigne } from './parcours-routage.js';
import { formaterDuree } from './rando-profil.js';
import { estHorsLigne } from './hors-ligne.js';
import { formatAltitude, formatDistance } from './unites.js';
import { formatDate, heureCourte, poser, t, ti } from './i18n.js';
import { demanderChoix } from './dialogue.js';
import { formatDureeReelle } from './traces-commun.js';
import { ECART_HORS_TRACE, capBoussole, capDeplacement, deniveles, heureArrivee, lisserAngle, prochainsReperes, reperesSurTrace, restant, situerSurTrace, tempsRestants } from './guidage-calcul.js';
import { chaineTrace, resumeTrace } from './guidage-trace-calcul.js';
import { creerEnregistrement, effacerTraceInterrompue, telechargerTrace, traceInterrompue } from './guidage-enregistrement.js';

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

// Cône (boussole) et flèche (déplacement), dessinés pour une boîte de 120 px centrée sur la position
const DESSIN_CONE = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="guidage-cone-degrade" cx="60" cy="60" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4aa8ff" stop-opacity=".85"/><stop offset="1" stop-color="#4aa8ff" stop-opacity="0"/></radialGradient></defs><path d="M60 60 L31 9.8 A58 58 0 0 1 89 9.8 Z" fill="url(#guidage-cone-degrade)"/></svg>';
const DESSIN_FLECHE = '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 26 L70 44 L60 39.5 L50 44 Z" fill="#ffffff" stroke="#1d6fd0" stroke-width="2" stroke-linejoin="round"/></svg>';

export function creerGuidage(map, { id, panneau, bloc, profil, pratique, analyse, allure, cadrer, nom, idParcours, garderTrace }) {
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
  let marqueur = null;
  let capCompas = null;
  let capGps = null;
  let evenementBoussole = null;
  let image = null; // requestAnimationFrame du cône
  let enregistrement = null;
  let dernier = null; // derniers chiffres affichés, repris par le mode poche
  let minuteurPoche = null;

  bloc.innerHTML = `
    <div class="guidage-etat" role="status" aria-live="polite"></div>
    <div class="guidage-rejoindre" hidden>
      <p></p>
      <button type="button" class="para-bouton guidage-rejoindre-bouton" ${ti('guidage.rejoindre')}>${t('guidage.rejoindre')}</button>
    </div>
    <div class="guidage-stats">
      <div class="guidage-stat guidage-stat-principale"><span ${ti('guidage.distance-restante')}>${t('guidage.distance-restante')}</span><strong data-g="distance">—</strong></div>
      <div class="guidage-stat"><span ${ti('guidage.plus-restant')}>${t('guidage.plus-restant')}</span><strong data-g="plus">—</strong></div>
      <div class="guidage-stat"><span ${ti('guidage.moins-restant')}>${t('guidage.moins-restant')}</span><strong data-g="moins">—</strong></div>
    </div>
    <div class="guidage-temps">
      <div><span ${ti('guidage.temps-restant')}>${t('guidage.temps-restant')}</span><strong data-g="personnel">—</strong><small data-g="ecart"></small><small class="guidage-standard" data-g="standard"></small></div>
      <div><span ${ti('guidage.arrivee')}>${t('guidage.arrivee')}</span><strong data-g="arrivee">—</strong></div>
    </div>
    <p class="guidage-enregistre" hidden><i aria-hidden="true"></i><span ${ti('guidage.enregistrement')}>${t('guidage.enregistrement')}</span></p>
    <div class="guidage-reperes" hidden><h4 ${ti('guidage.reperes')}>${t('guidage.reperes')}</h4><ul></ul></div>
    <div class="guidage-actions">
      <button type="button" class="para-bouton guidage-recentrer" hidden ${ti('guidage.recentrer')}>${t('guidage.recentrer')}</button>
      <button type="button" class="para-bouton guidage-poche-bouton" ${ti('guidage.poche')}>${t('guidage.poche')}</button>
      <button type="button" class="para-bouton guidage-arreter" ${ti('guidage.arreter')}>${t('guidage.arreter')}</button>
    </div>
  `;
  const $ = (selecteur) => bloc.querySelector(selecteur);
  const g = (cle) => $(`[data-g="${cle}"]`);
  const etat = $('.guidage-etat');
  const blocRejoindre = $('.guidage-rejoindre');
  const boutonRecentrer = $('.guidage-recentrer');
  const ligneEnregistre = $('.guidage-enregistre');

  // Mode poche : écran noir (presque éteint sur un écran OLED), temps, distance et heure en petit
  const poche = document.createElement('div');
  poche.className = 'guidage-poche';
  poche.hidden = true;
  poche.setAttribute('role', 'button');
  poche.tabIndex = 0;
  poche.innerHTML = `
    <p class="guidage-poche-heure" data-p="heure"></p>
    <p><span ${ti('guidage.temps-restant')}>${t('guidage.temps-restant')}</span><strong data-p="temps">—</strong></p>
    <p><span ${ti('guidage.distance-restante')}>${t('guidage.distance-restante')}</span><strong data-p="distance">—</strong></p>
    <p class="guidage-poche-rec" hidden><i aria-hidden="true"></i><span ${ti('guidage.enregistrement')}>${t('guidage.enregistrement')}</span></p>
    <small ${ti('guidage.poche-aide')}>${t('guidage.poche-aide')}</small>
  `;
  document.body.append(poche);
  const p = (cle) => poche.querySelector(`[data-p="${cle}"]`);

  function assurerCouches() {
    if (map.getSource(SOURCE_POSITION)) return;
    map.addSource(SOURCE_REJOINDRE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: `${SOURCE_REJOINDRE}-ligne`, type: 'line', source: SOURCE_REJOINDRE, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffb020', 'line-width': 4, 'line-dasharray': [1, 1.6] } });
    map.addSource(SOURCE_POSITION, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: `${SOURCE_POSITION}-halo`, type: 'circle', source: SOURCE_POSITION, paint: { 'circle-radius': 16, 'circle-color': '#4aa8ff', 'circle-opacity': 0.22 } });
  }

  // Marqueur aligné sur la carte : MapLibre compense la rotation (bearing) et l'inclinaison,
  // le cône et la flèche ne tournent que de leur cap
  let marqueurPose = false;
  function assurerMarqueur(lngLat) {
    if (!marqueur) {
      const element = document.createElement('div');
      element.className = 'guidage-position';
      element.innerHTML = `<div class="guidage-position-corps"><div class="guidage-cone" hidden>${DESSIN_CONE}</div><div class="guidage-fleche" hidden>${DESSIN_FLECHE}</div><span class="guidage-point"></span></div>`;
      marqueur = new maplibregl.Marker({ element, rotationAlignment: 'map', pitchAlignment: 'map' });
    }
    marqueur.setLngLat(lngLat);
    if (!marqueurPose) marqueur.addTo(map);
    marqueurPose = true;
    dessinerCaps();
  }
  function retirerMarqueur() {
    marqueur?.remove();
    marqueurPose = false;
  }

  function dessinerCaps() {
    image = null;
    if (!marqueur) return;
    const cone = marqueur.getElement().querySelector('.guidage-cone');
    const fleche = marqueur.getElement().querySelector('.guidage-fleche');
    cone.hidden = capCompas === null;
    if (capCompas !== null) cone.style.transform = `rotate(${capCompas}deg)`;
    fleche.hidden = capGps === null;
    if (capGps !== null) fleche.style.transform = `rotate(${capGps}deg)`;
  }

  function surOrientation(event) {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    const cap = capBoussole(event, angle);
    if (cap === null) return;
    capCompas = lisserAngle(capCompas, cap, 0.2);
    image ??= requestAnimationFrame(dessinerCaps);
  }

  function ecouterBoussole() {
    if (evenementBoussole) return;
    evenementBoussole = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evenementBoussole, surOrientation);
  }

  // iOS demande l'autorisation, et seulement pendant un appui : appelé depuis le bouton « Démarrer »
  function demanderBoussole() {
    // Android : l'événement absolu, sans autorisation (Chrome a aussi requestPermission, réservé ici à iOS)
    if ('ondeviceorientationabsolute' in window) {
      ecouterBoussole();
      return;
    }
    const Orientation = window.DeviceOrientationEvent;
    if (typeof Orientation?.requestPermission === 'function') {
      Orientation.requestPermission()
        .then((reponse) => {
          if (reponse === 'granted' && actif) ecouterBoussole();
        })
        .catch(() => {});
    } else ecouterBoussole();
  }

  function arreterBoussole() {
    if (evenementBoussole) window.removeEventListener(evenementBoussole, surOrientation);
    evenementBoussole = null;
    if (image) cancelAnimationFrame(image);
    image = null;
    capCompas = null;
    capGps = null;
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
    if (fini) g('standard').textContent = '';
    else poser(g('standard'), 'guidage.standard', { duree: formaterDuree(temps.standard) });
    g('personnel').textContent = fini ? '—' : formaterDuree(temps.personnel);
    const arrivee = fini ? null : heureArrivee(Date.now(), temps.personnel);
    g('arrivee').textContent = arrivee ? `≈ ${heureCourte(arrivee)}` : '—';
    dernier = { temps: g('personnel').textContent, distance: g('distance').textContent };
    majPoche();
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
    const cap = capDeplacement(coords);
    capGps = cap === null ? null : lisserAngle(capGps, cap, 0.5);
    assurerMarqueur([position.lng, position.lat]);
    enregistrement?.ajouter({ t: Date.now(), lng: position.lng, lat: position.lat, altitude: coords.altitude, precision: coords.accuracy });
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
    if (!actif) return;
    if (document.visibilityState !== 'visible') {
      enregistrement?.sauver();
      return;
    }
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
  window.addEventListener('pagehide', () => enregistrement?.sauver());

  // ---------- Mode poche ----------
  function majPoche() {
    if (poche.hidden) return;
    p('heure').textContent = heureCourte(Date.now());
    p('temps').textContent = dernier?.temps ?? '—';
    p('distance').textContent = dernier?.distance ?? '—';
    poche.querySelector('.guidage-poche-rec').hidden = !enregistrement;
  }
  function ouvrirPoche(ouvert) {
    poche.hidden = !ouvert;
    clearInterval(minuteurPoche);
    minuteurPoche = ouvert ? setInterval(majPoche, 20000) : null;
    majPoche();
  }
  $('.guidage-poche-bouton').addEventListener('click', () => ouvrirPoche(true));
  poche.addEventListener('click', () => ouvrirPoche(false));
  poche.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') ouvrirPoche(false);
  });

  // ---------- Enregistrement ----------
  const nomTrace = () => `${nom()} · ${formatDate(Date.now(), { day: 'numeric', month: 'short' })}`;

  function commencerEnregistrement(reprise = null) {
    enregistrement = creerEnregistrement({ nom: nomTrace(), parcours: idParcours(), reprise });
    ligneEnregistre.hidden = false;
    if (position) enregistrement.ajouter({ t: Date.now(), lng: position.lng, lat: position.lat, precision: position.precision });
    majPoche();
  }

  // Une trace commencée avant un rechargement : la reprendre, ou la terminer avant d'en commencer une autre
  async function preparerEnregistrement(demande) {
    const interrompue = traceInterrompue();
    if (!interrompue) {
      if (demande) commencerEnregistrement();
      return;
    }
    const resume = resumeTrace(interrompue);
    const { choix } = await demanderChoix({
      titre: t('guidage.interrompue-titre'),
      texte: t('guidage.interrompue-texte', { nom: interrompue.nom, distance: formatDistance(resume.distance) }),
      choix: [
        { id: 'reprendre', libelle: t('guidage.reprendre'), principal: true },
        { id: 'terminer', libelle: t('guidage.terminer-ancienne') },
      ],
    });
    if (!actif) return;
    if (choix === 'terminer') {
      await montrerResume(interrompue);
      if (demande && actif) commencerEnregistrement();
    } else commencerEnregistrement(interrompue);
  }

  // Fin du trajet : distance, durée, D+, puis export GPX ou ajout à Mes parcours.
  // La trace n'est effacée qu'avec « Terminer » : un appui à côté la garde pour plus tard.
  async function montrerResume(trace) {
    const resume = resumeTrace(trace);
    if (resume.points < 2) {
      effacerTraceInterrompue();
      return;
    }
    const morceaux = [formatDistance(resume.distance), formatDureeReelle(resume.duree)];
    if (resume.plus !== null) morceaux.push(`D+ ${formatAltitude(resume.plus)}`);
    let texte = morceaux.join(' · ');
    if (resume.trous) texte += `. ${t(resume.trous > 1 ? 'guidage.trous' : 'guidage.trou', { n: resume.trous })}`;
    const faits = new Set();
    for (;;) {
      const choix = [
        !faits.has('gpx') && { id: 'gpx', libelle: t('guidage.exporter-gpx'), principal: true },
        !faits.has('parcours') && { id: 'parcours', libelle: t('guidage.ajouter-parcours'), principal: faits.has('gpx') },
        { id: 'terminer', libelle: t('guidage.terminer') },
      ].filter(Boolean);
      const reponse = await demanderChoix({ titre: t('guidage.resume-titre'), texte: `${trace.nom} : ${texte}`, choix });
      if (reponse.choix === 'gpx') {
        telechargerTrace(trace);
        faits.add('gpx');
      } else if (reponse.choix === 'parcours') {
        if (garderTrace({ nom: trace.nom, chaine: chaineTrace(trace), total: resume.distance, plus: resume.plus })) faits.add('parcours');
      } else {
        if (reponse.choix === 'terminer') effacerTraceInterrompue();
        return;
      }
      if (faits.size === 2) {
        effacerTraceInterrompue();
        return;
      }
    }
  }
  map.on('dragstart', quandOnBouge);

  const interface_ = {
    get actif() {
      return actif;
    },
    demarrer({ enregistrer = false } = {}) {
      if (actif || !analyse()) return;
      actif = true;
      demanderBoussole();
      dernier = null;
      ligneEnregistre.hidden = true;
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
      ['distance', 'plus', 'moins', 'personnel', 'arrivee'].forEach((cle) => (g(cle).textContent = '—'));
      g('ecart').textContent = '';
      g('standard').textContent = '';
      preparerEnregistrement(enregistrer);
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
      arreterBoussole();
      retirerMarqueur();
      ouvrirPoche(false);
      if (enregistrement) {
        const { trace } = enregistrement;
        enregistrement.sauver();
        enregistrement = null;
        montrerResume(trace);
      }
      vider(SOURCE_POSITION);
      vider(SOURCE_REJOINDRE);
      profil.placerDepuisCarte(null);
    },
    reafficher: rendre,
  };
  $('.guidage-arreter').addEventListener('click', () => interface_.arreter());
  return interface_;
}
