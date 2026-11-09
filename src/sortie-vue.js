// Vue d'une sortie sur la carte : trace colorée (vitesse, altitude, pente, cardio), légende,
// stats selon l'activité, points marquants. Panneau posé sur la carte, réductible.
import * as maplibregl from 'maplibre-gl';
import { creerPanneauCarte } from './panneau-carte.js';
import { creerFriseSortie } from './sortie-frise.js';
import { modifierSortie } from './sorties-stockage.js';
import {
  analyserSortie, bornes, couleurDegrade, DEGRADE, indiceProche, modesPossibles, morceaux, valeursMode, variosLisses,
} from './sortie-analyse.js';
import { PALIERS_PENTE, palierPente } from './parcours-analyse.js';
import { paletteInterface } from './vent-cadran.js';
import { lire, ecrire } from './reglages.js';
import { formatAltitude, formatDenivele, formatDistance, formatPluie, formatTemp, formatVent, imperial, nombre, pourcent } from './unites.js';
import { surPreferences } from './preferences.js';
import { t, ta, ti, tt } from './i18n.js';
import { TYPES, dateSortie, decalageDe, formatDureeReelle, heureSortie, iconeType, libelleType, nomSortie, noteFuseau } from './traces-commun.js';
import { creerOmbreSortie } from './sortie-ombre.js';
import { adresseMeteoSortie, interpolerHoraire, lireMeteo, resumerMeteo } from './sortie-meteo-calcul.js';
import { descriptionMeteo } from './meteo-icone.js';
import { pointCardinal } from './vent-calcul.js';
import { requete, erreurHttp, messageErreur } from './requete.js';

const ICONE_SOLEIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';

const SOURCE = 'sortie-trace';
const SOURCE_BOUTS = 'sortie-bouts';
const SOURCE_CURSEUR = 'sortie-curseur';
// Durée d'une lecture complète (s) : lente, normale, rapide
const DUREES_LECTURE = [90, 40, 15];
const ESTOMPE = 0.28;
const COULEUR_CERNE = '#0b111b';
const CANAUX_LIBELLES = {
  alt: 'traces.canal-alt', altGps: 'traces.canal-alt-gps', fc: 'traces.canal-fc', cadence: 'traces.canal-cadence',
  puissance: 'traces.canal-puissance', temperature: 'traces.canal-temperature', vitesse: 'traces.canal-vitesse',
};
const MODES = { vitesse: 'traces.mode-vitesse', altitude: 'traces.mode-altitude', pente: 'traces.mode-pente', cardio: 'traces.mode-cardio' };
const ICONES_REPERES = {
  haut: '<path d="m4 19 8-14 8 14Z"/>',
  vitesse: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  deco: '<path d="M4 15c4-6 12-6 16 0"/><path d="M12 15v5"/>',
};

// Deux chiffres significatifs : ×465 se lit ×470, ×1 239 se lit ×1 200
const arrondiRond = (x) => {
  if (x < 10) return Math.max(1, Math.round(x));
  const echelle = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / echelle) * echelle;
};
const vitesseTexte = (ms) => (imperial() ? `${nombre(ms * 2.236936, 1)} mph` : `${nombre(ms * 3.6, 1)} km/h`);
const varioTexte = (ms) => `${ms > 0 ? '+' : ''}${nombre(ms, 1)} m/s`;
const pourcentTexte = (p) => `${Math.round(p)} %`;

// Les chiffres de la sortie, selon l'activité : [clé du libellé, valeur affichée], seulement ceux qui existent
export function lignesStats(type, s, { cadenceEnPas = false } = {}) {
  const ok = (v) => v != null && Number.isFinite(v);
  const l = [];
  const ajouter = (cle, valeur, texte) => ok(valeur) && l.push([cle, texte(valeur)]);
  ajouter('traces.stat-duree-totale', s.duree, formatDureeReelle);
  if (s.tempsPause > 60) ajouter('traces.stat-pauses', s.tempsPause, (v) => t('traces.pauses-detail', { n: s.pauses, duree: formatDureeReelle(v) }));
  ajouter('D+', s.plus, formatDenivele);
  ajouter('D−', s.moins, formatDenivele);
  ajouter('editeur.alt-max', s.altMax, formatAltitude);
  ajouter('editeur.alt-min', s.altMin, formatAltitude);
  if (type === 'parapente') {
    ajouter('traces.stat-duree-vol', s.dureeVol, formatDureeReelle);
    ajouter('traces.stat-alt-deco', s.altDeco, formatAltitude);
    ajouter('traces.stat-gain', s.gainMax, formatDenivele);
    ajouter('traces.stat-vario-max', s.varioMax, varioTexte);
    ajouter('traces.stat-vario-min', s.varioMin, varioTexte);
    ajouter('traces.stat-distance-deco', s.distanceMaxDeco, formatDistance);
    ajouter('traces.stat-vitesse-max', s.vitesseMax, vitesseTexte);
  } else if (type === 'ski') {
    ajouter('traces.stat-descentes', s.descentes, (v) => String(v));
    ajouter('traces.stat-descendu', s.deniveleDescendu, formatDenivele);
    ajouter('traces.stat-plus-longue', s.plusLongueDescente, formatDenivele);
    ajouter('traces.stat-vitesse-max', s.vitesseMaxDescente ?? s.vitesseMax, vitesseTexte);
  } else {
    ajouter('traces.stat-vitesse-moyenne', s.vitesseMoyenne, vitesseTexte);
    if (type === 'velo') ajouter('traces.stat-vitesse-max', s.vitesseMax, vitesseTexte);
    ajouter('traces.stat-vitesse-montee', s.vitesseMontee, (v) => `${nombre(Math.round(imperial() ? v * 3.28084 : v))} ${imperial() ? 'ft/h' : 'm/h'}`);
  }
  ajouter('traces.stat-fc-moyenne', s.fcMoyenne, (v) => `${Math.round(v)} bpm`);
  ajouter('traces.stat-fc-max', s.fcMax, (v) => `${Math.round(v)} bpm`);
  ajouter('traces.stat-puissance', s.puissanceMoyenne, (v) => `${Math.round(v)} W`);
  ajouter('traces.stat-cadence', s.cadenceMoyenne, (v) => (cadenceEnPas ? t('traces.pas-min', { n: Math.round(v * 2) }) : t('traces.tr-min', { n: Math.round(v) })));
  ajouter('traces.stat-temperature', s.temperature, (v) => formatTemp(v));
  return l;
}

export function creerVueSortie(map, { ouvrirMenu, onModifiee }) {
  let sortie = null;
  let analyse = null;
  let mode = lire('sortie-couleur', 'vitesse');
  let reperes = [];
  let frise = null;
  let indice = null;
  let lecture = null;
  let dureeLecture = DUREES_LECTURE[lire('sortie-lecture-vitesse', 1)] ?? DUREES_LECTURE[1];
  let suivre = lire('sortie-suivre', true) !== false;

  const panneau = creerPanneauCarte({
    cle: 'sortie-panneau-reduit',
    libelle: 'traces.sortie',
    classe: 'bf-outil bf-sortie',
    onFermer: () => fermer(),
    onRetour: () => {
      fermer();
      ouvrirMenu();
    },
  });
  panneau.corps.innerHTML = `
    <div class="parcours-stats traces-principales">
      <div class="parcours-stat parcours-stat-principale">${tt('editeur.distance')}<strong data-v="distance">—</strong></div>
      <div class="parcours-stat parcours-stat-principale"><span data-v="libelle-temps"></span><strong data-v="temps">—</strong></div>
    </div>
    <div class="traces-lecture" hidden>
      <div class="traces-frise"></div>
      <div class="traces-commandes">
        <button type="button" class="traces-lire" ${ta('aria-label', 'traces.lire')}></button>
        <div class="parcours-pratiques traces-vitesses" role="group" ${ta('aria-label', 'traces.vitesse-lecture')}></div>
        <button type="button" class="traces-suivre" aria-pressed="false" ${ti('traces.suivre')}>${t('traces.suivre')}</button>
      </div>
      <div class="traces-soleil">
        <button type="button" class="traces-ombre" aria-pressed="false">${ICONE_SOLEIL}<span ${ti('traces.ombre')}>${t('traces.ombre')}</span></button>
        <span class="traces-soleil-etat" aria-live="polite"></span>
      </div>
    </div>
    <div class="traces-meteo" hidden>
      <h4 ${ti('traces.meteo-titre')}>${t('traces.meteo-titre')}</h4>
      <p class="note traces-meteo-message" role="status" hidden></p>
      <dl class="traces-stats traces-meteo-stats"></dl>
      <p class="note traces-meteo-source" ${ti('traces.meteo-source')}>${t('traces.meteo-source')}</p>
    </div>
    <div class="traces-couleur">
      <span class="traces-couleur-titre" ${ti('traces.colorer')}>${t('traces.colorer')}</span>
      <div class="parcours-pratiques traces-modes" role="group" ${ta('aria-label', 'traces.colorer')}></div>
      <div class="traces-legende" aria-hidden="true"></div>
    </div>
    <dl class="traces-stats traces-stats-sortie"></dl>
    <div class="traces-reperes" hidden>
      <h4 ${ti('traces.reperes')}>${t('traces.reperes')}</h4>
      <div class="traces-reperes-liste"></div>
    </div>
    <h4 class="traces-types-titre" ${ti('traces.type')}>${t('traces.type')}</h4>
    <div class="parcours-pratiques parcours-pratiques-panneau traces-types" role="group" ${ta('aria-label', 'traces.type')}>
      ${TYPES.map(({ id, cle }) => `<button type="button" data-type="${id}" aria-pressed="false" ${ti(cle)}>${t(cle)}</button>`).join('')}
    </div>
    <p class="traces-canaux"></p>
  `;
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const boutonsType = [...panneau.corps.querySelectorAll('[data-type]')];

  // ---------- Carte ----------
  function assurerCouches() {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', tolerance: 0, data: { type: 'FeatureCollection', features: [] } });
    map.addSource(SOURCE_BOUTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'sortie-trace-contour', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': COULEUR_CERNE, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 14, 10] },
    });
    map.addLayer({
      id: 'sortie-trace', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': ['get', 'couleur'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6] },
    });
    map.addLayer({
      id: 'sortie-bouts', type: 'circle', source: SOURCE_BOUTS,
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'bout'], 'depart', '#3ecf8e', '#f2f4f7'],
        'circle-stroke-color': COULEUR_CERNE,
        'circle-stroke-width': 3,
      },
    });
    map.addSource(SOURCE_CURSEUR, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'sortie-curseur-halo', type: 'circle', source: SOURCE_CURSEUR,
      paint: { 'circle-radius': 16, 'circle-color': '#ffffff', 'circle-opacity': 0.25, 'circle-blur': 0.4, 'circle-pitch-alignment': 'map' },
    });
    map.addLayer({
      id: 'sortie-curseur', type: 'circle', source: SOURCE_CURSEUR,
      paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': COULEUR_CERNE, 'circle-stroke-width': 3 },
    });
  }

  // ---------- Curseur du temps et lecture ----------
  // La trace déjà parcourue reste vive, le reste s'estompe
  function estomper() {
    if (!map.getLayer('sortie-trace')) return;
    const opacite = indice == null || indice >= analyse.n - 1 ? 1 : ['case', ['<', ['get', 'debut'], indice], 1, ESTOMPE];
    map.setPaintProperty('sortie-trace', 'line-opacity', opacite);
    map.setPaintProperty('sortie-trace-contour', 'line-opacity', Array.isArray(opacite) ? ['case', ['<', ['get', 'debut'], indice], 0.9, ESTOMPE] : 0.9);
  }

  // Le point au centre de la partie visible de la carte (au-dessus du panneau sur téléphone)
  function centrerSur(position) {
    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    const telephone = window.matchMedia('(max-width: 640px)').matches;
    const cadre = panneau.element.getBoundingClientRect();
    const bas = telephone && panneau.ouvert ? Math.min(hauteur * 0.7, hauteur - cadre.top) : 0;
    const gauche = !telephone && panneau.ouvert ? cadre.right : 0;
    const p = map.project(position);
    const cible = [gauche + (largeur - gauche) / 2, (hauteur - bas) / 2];
    map.jumpTo({ center: map.unproject([p.x - cible[0] + largeur / 2, p.y - cible[1] + hauteur / 2]) });
  }

  // Le point est-il dans la partie de la carte que le panneau ne cache pas ?
  function estVisible(i) {
    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    const p = map.project([sortie.points.lng[i], sortie.points.lat[i]]);
    const cadre = panneau.element.getBoundingClientRect();
    const telephone = window.matchMedia('(max-width: 640px)').matches;
    const bas = telephone && panneau.ouvert ? cadre.top : hauteur;
    const gauche = !telephone && panneau.ouvert ? cadre.right : 0;
    return p.x > gauche + 30 && p.x < largeur - 30 && p.y > 80 && p.y < bas - 20;
  }

  function placerCurseur(i, { centrer = false } = {}) {
    indice = i;
    const position = [sortie.points.lng[i], sortie.points.lat[i]];
    map.getSource(SOURCE_CURSEUR)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: position } });
    estomper();
    if (centrer) centrerSur(position);
    panneau.definirResume({ detail: lectureCourte(i) });
    majSoleil();
  }

  // ---------- Soleil et ombres à l'heure de la sortie ----------
  let ombre = null;
  let ombreVoulue = lire('sortie-ombre', false) === true;

  // Pendant un glissé ou une lecture, l'ombre portée attend une pause pour se recalculer
  function majSoleil({ attendre = true } = {}) {
    const etatSoleil = $('.traces-soleil-etat');
    if (!analyse?.temps) return;
    const i = indice ?? 0;
    if (!ombre?.actif) {
      etatSoleil.textContent = '';
      return;
    }
    const soleil = ombre.placer(analyse.temps[i], sortie.points.lng[i], sortie.points.lat[i], { attendre });
    etatSoleil.textContent = !soleil
      ? ''
      : soleil.hauteur <= 0
        ? t('traces.soleil-nuit')
        : t('traces.soleil-position', { hauteur: Math.round(soleil.hauteur), direction: pointCardinal(soleil.azimut) });
  }

  function majBoutonOmbre() {
    const bouton = $('.traces-ombre');
    bouton.setAttribute('aria-pressed', String(!!ombre?.actif));
    bouton.classList.toggle('actif', !!ombre?.actif);
  }

  function allumerOmbre(oui) {
    if (oui) ombre ??= creerOmbreSortie(map);
    ombre?.allumer(oui);
    majBoutonOmbre();
    majSoleil({ attendre: false });
  }

  $('.traces-ombre').addEventListener('click', () => {
    ombreVoulue = !ombre?.actif;
    ecrire('sortie-ombre', ombreVoulue);
    allumerOmbre(ombreVoulue);
  });

  // ---------- Météo du jour de la sortie ----------
  let demandeMeteo = 0;

  function afficherMeteo() {
    const bloc = $('.traces-meteo');
    const meteo = sortie?.meteo;
    const message = $('.traces-meteo-message');
    if (!meteo) {
      $('.traces-meteo-stats').replaceChildren();
      return;
    }
    const t0 = analyse.temps[0];
    const t1 = analyse.temps[analyse.n - 1];
    const r = resumerMeteo(meteo, t0, t1);
    bloc.hidden = !r;
    message.hidden = true;
    if (!r) return;
    const lignes = [];
    if (r.code != null) lignes.push([t('traces.meteo-temps'), descriptionMeteo(r.code)]);
    if (r.tMin != null) lignes.push([t('traces.meteo-temperature'), Math.round(r.tMin) === Math.round(r.tMax) ? formatTemp(r.tMin) : t('traces.meteo-de-a', { min: formatTemp(r.tMin), max: formatTemp(r.tMax) })]);
    if (r.vent != null) lignes.push([t('traces.meteo-vent'), `${formatVent(r.vent)}${r.direction != null ? ` ${pointCardinal(r.direction)}` : ''}`]);
    if (r.rafales != null) lignes.push([t('traces.meteo-rafales'), formatVent(r.rafales)]);
    if (r.pluie != null) lignes.push([t('traces.meteo-pluie'), formatPluie(r.pluie)]);
    if (r.nuages != null) lignes.push([t('traces.meteo-nuages'), pourcent(r.nuages)]);
    $('.traces-meteo-stats').innerHTML = lignes.map(([nom, valeur]) => `<div><dt>${nom}</dt><dd>${valeur}</dd></div>`).join('');
  }

  // Une seule fois par sortie : la réponse est gardée avec elle, et sert ensuite hors ligne
  async function chargerMeteo() {
    const bloc = $('.traces-meteo');
    const message = $('.traces-meteo-message');
    if (!analyse.temps) {
      bloc.hidden = true;
      return;
    }
    // Une météo gardée avant la prise en compte du fuseau (sans `decalage`) se redemande si le fuseau manque
    if (sortie.meteo && (sortie.decalage != null || sortie.meteo.decalage !== undefined)) {
      afficherMeteo();
      return;
    }
    const milieu = Math.floor(analyse.n / 2);
    const adresse = adresseMeteoSortie({
      lat: sortie.points.lat[milieu],
      lng: sortie.points.lng[milieu],
      debut: analyse.temps[0],
      fin: analyse.temps[analyse.n - 1],
    });
    if (!adresse) {
      bloc.hidden = true;
      return;
    }
    const demande = ++demandeMeteo;
    const id = sortie.id;
    bloc.hidden = false;
    message.hidden = false;
    message.textContent = t('traces.meteo-chargement');
    $('.traces-meteo-stats').replaceChildren();
    try {
      const reponse = await requete(adresse);
      if (!reponse.ok) throw erreurHttp(reponse);
      const meteo = lireMeteo(await reponse.json());
      if (!meteo) throw new Error('réponse sans heures');
      if (demande !== demandeMeteo || sortie?.id !== id) return;
      const fuseauAppris = decalageDe(sortie) == null && meteo.decalage != null;
      sortie.meteo = meteo;
      afficherMeteo();
      if (fuseauAppris) {
        // Les heures passent de celles de l'appareil à celles du lieu
        remplir();
        poserReperes();
        if (indice != null) panneau.definirResume({ detail: lectureCourte(indice) });
        onModifiee();
      }
      construireFrise();
      modifierSortie(id, { meteo }).catch((erreur) => console.warn('Météo non gardée :', erreur));
    } catch (erreur) {
      console.warn('Météo de la sortie :', erreur);
      if (demande !== demandeMeteo || sortie?.id !== id) return;
      message.textContent = t('traces.meteo-indisponible', { raison: messageErreur(erreur) });
    }
  }

  function lectureCourte(i) {
    const morceauxTexte = [];
    if (analyse.temps) morceauxTexte.push(heureSortie(analyse.temps[i], sortie));
    morceauxTexte.push(formatDistance(analyse.distance[i]));
    if (analyse.alts) morceauxTexte.push(formatAltitude(analyse.alts[i]));
    return morceauxTexte.join(' · ');
  }

  function majBoutonLecture() {
    const bouton = $('.traces-lire');
    const enCours = !!lecture;
    bouton.innerHTML = enCours
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5Z"/></svg>';
    bouton.setAttribute('aria-label', t(enCours ? 'traces.pause' : 'traces.lire'));
    bouton.classList.toggle('actif', enCours);
  }

  function arreterLecture() {
    if (!lecture) return;
    cancelAnimationFrame(lecture.image);
    lecture = null;
    majBoutonLecture();
  }

  function lancerLecture() {
    const axe = analyse.temps ?? analyse.distance;
    const debut = axe[0];
    const etendue = Math.max(1, axe[analyse.n - 1] - debut);
    // Arrivé au bout : on repart du début
    let position = indice == null || indice >= analyse.n - 1 ? debut : axe[indice];
    let precedent = null;
    lecture = { image: 0 };
    majBoutonLecture();
    const pas = (instant) => {
      if (!lecture) return;
      if (precedent != null) position += ((instant - precedent) / 1000) * (etendue / dureeLecture);
      precedent = instant;
      const fini = position >= debut + etendue;
      const i = fini ? analyse.n - 1 : indiceProche(axe, position);
      frise.placer(i);
      placerCurseur(i, { centrer: suivre });
      if (fini) {
        arreterLecture();
        return;
      }
      lecture.image = requestAnimationFrame(pas);
    };
    lecture.image = requestAnimationFrame(pas);
  }

  function rendreVitesses() {
    const conteneur = $('.traces-vitesses');
    conteneur.style.gridTemplateColumns = `repeat(${DUREES_LECTURE.length}, minmax(0, 1fr))`;
    const reelle = analyse.temps ? (analyse.temps[analyse.n - 1] - analyse.temps[0]) / 1000 : null;
    conteneur.innerHTML = DUREES_LECTURE.map((duree, k) => {
      // En temps réel, la vitesse de lecture se lit en « fois plus vite » ; sans heure, lent, normal, rapide
      const libelle = reelle ? `×${nombre(arrondiRond(reelle / duree))}` : t(['traces.lent', 'traces.normal', 'traces.rapide'][k]);
      return `<button type="button" data-duree="${k}" aria-pressed="${duree === dureeLecture}">${libelle}</button>`;
    }).join('');
    conteneur.querySelectorAll('[data-duree]').forEach((bouton) => bouton.addEventListener('click', () => {
      dureeLecture = DUREES_LECTURE[Number(bouton.dataset.duree)];
      ecrire('sortie-lecture-vitesse', Number(bouton.dataset.duree));
      rendreVitesses();
    }));
  }

  function majSuivre() {
    $('.traces-suivre').setAttribute('aria-pressed', String(suivre));
  }

  function lignesFrise() {
    const lignes = [];
    if (analyse.alts) lignes.push({ id: 'altitude', cle: 'traces.mode-altitude', valeurs: analyse.alts, texte: formatAltitude });
    if (analyse.vitesse) lignes.push({ id: 'vitesse', cle: 'traces.mode-vitesse', valeurs: analyse.vitesse, texte: vitesseTexte });
    if (analyse.type === 'parapente' && analyse.temps && analyse.alts) {
      lignes.push({ id: 'vario', cle: 'traces.vario', valeurs: variosLisses(analyse.temps, analyse.alts), texte: varioTexte });
    }
    const cardio = valeursMode('cardio', analyse, sortie.points);
    if (cardio) lignes.push({ id: 'cardio', cle: 'traces.mode-cardio', valeurs: cardio, texte: (v) => `${Math.round(v)} bpm` });
    if (sortie.points.puissance) lignes.push({ id: 'puissance', cle: 'traces.canal-puissance', valeurs: sortie.points.puissance, texte: (v) => `${Math.round(v)} W` });
    // La météo du jour, interpolée heure par heure à chaque point
    if (sortie.meteo && analyse.temps) {
      const temperature = interpolerHoraire(sortie.meteo.heures, sortie.meteo.temperature_2m, analyse.temps);
      const vent = interpolerHoraire(sortie.meteo.heures, sortie.meteo.wind_speed_10m, analyse.temps);
      if (temperature) lignes.push({ id: 'temperature', cle: 'traces.meteo-temperature', valeurs: temperature, texte: (v) => formatTemp(v) });
      if (vent) lignes.push({ id: 'vent', cle: 'traces.meteo-vent', valeurs: vent, texte: (v) => formatVent(v) });
    }
    return lignes;
  }

  function construireFrise() {
    frise?.detruire();
    frise = null;
    const bloc = $('.traces-lecture');
    const lignes = lignesFrise();
    bloc.hidden = !lignes.length;
    if (!lignes.length) return;
    const axe = analyse.temps ?? analyse.distance;
    frise = creerFriseSortie({
      lignes,
      axe,
      texteAxe: (valeur, i) => (analyse.temps ? heureSortie(valeur, sortie) : formatDistance(analyse.distance[i])),
      onDebut: arreterLecture,
      onIndice: (i) => placerCurseur(i, { centrer: !estVisible(i) }),
    });
    $('.traces-frise').replaceChildren(frise.element);
    rendreVitesses();
    majSuivre();
    majBoutonLecture();
    if (indice != null) frise.placer(Math.min(indice, analyse.n - 1));
  }

  $('.traces-lire').addEventListener('click', () => {
    if (lecture) arreterLecture();
    else lancerLecture();
  });
  $('.traces-suivre').addEventListener('click', () => {
    suivre = !suivre;
    ecrire('sortie-suivre', suivre);
    majSuivre();
  });

  function couleurs() {
    // Ni heure ni altitude : une seule couleur, celle de l'accent
    if (!mode) {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fb59a';
      return { couleurDe: () => accent };
    }
    const valeurs = valeursMode(mode, analyse, sortie.points);
    if (mode === 'pente') {
      const palette = paletteInterface();
      return { couleurDe: (i) => palette[palierPente(valeurs[i])] };
    }
    const b = bornes(valeurs);
    const etendue = b.max - b.min;
    // 24 nuances : assez pour un dégradé, assez peu pour regrouper les segments
    return { bornes: b, couleurDe: (i) => couleurDegrade(Math.round(((valeurs[i] - b.min) / etendue) * 24) / 24) };
  }

  function dessinerTrace() {
    assurerCouches();
    const { couleurDe, bornes: b } = couleurs();
    // Morceaux de 20 points au plus : la partie pas encore parcourue s'estompe sans à-coups
    map.getSource(SOURCE).setData({ type: 'FeatureCollection', features: morceaux(sortie.points, sortie.coupures, couleurDe, 20) });
    estomper();
    rendreLegende(b);
  }

  function poserReperes() {
    reperes.forEach((repere) => repere.remove());
    const { lng, lat } = sortie.points;
    reperes = analyse.marquants.map((marquant) => {
      const ici = [lng[marquant.index], lat[marquant.index]];
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'sortie-repere';
      element.innerHTML = `<span class="sortie-repere-pastille sortie-repere-${marquant.type}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES_REPERES[marquant.type]}</svg><b></b></span>`;
      element.querySelector('b').textContent = texteRepere(marquant, true);
      element.setAttribute('aria-label', texteRepere(marquant));
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        allerA(marquant);
      });
      return new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -6] })
        .setLngLat(ici)
        .addTo(map);
    });
    empiler();
  }

  // Deux repères qui se chevauchent à l'écran (une pause au sommet) : le second monte d'un cran.
  // Recalculé à chaque zoom, puisque le chevauchement en dépend.
  function empiler() {
    const poses = [];
    for (const repere of reperes) {
      const point = map.project(repere.getLngLat());
      const largeur = repere.getElement().offsetWidth || 120;
      let cran = 0;
      while (poses.some((autre) => autre.cran === cran && Math.abs(autre.x - point.x) < (autre.largeur + largeur) / 2 && Math.abs(autre.y - point.y) < 30)) cran++;
      poses.push({ x: point.x, y: point.y, largeur, cran });
      repere.setOffset([0, -6 - cran * 32]);
    }
  }
  map.on('zoomend', () => reperes.length && empiler());

  function allerA(marquant) {
    arreterLecture();
    frise?.placer(marquant.index);
    placerCurseur(marquant.index);
    map.flyTo({ center: [sortie.points.lng[marquant.index], sortie.points.lat[marquant.index]], zoom: Math.max(map.getZoom(), 14), duration: 900 });
  }

  function cadrer() {
    const { lng, lat } = sortie.points;
    let [ouest, sud, est, nord] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < lng.length; i++) {
      ouest = Math.min(ouest, lng[i]);
      est = Math.max(est, lng[i]);
      sud = Math.min(sud, lat[i]);
      nord = Math.max(nord, lat[i]);
    }
    const telephone = window.matchMedia('(max-width: 640px)').matches;
    map.fitBounds([[ouest, sud], [est, nord]], {
      padding: telephone
        ? { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 40, right: 40 }
        : { top: 80, bottom: 80, left: 440, right: 80 },
      maxZoom: 15,
      duration: 900,
    });
  }

  function dessinerBouts() {
    const { lng, lat } = sortie.points;
    const dernier = lng.length - 1;
    map.getSource(SOURCE_BOUTS).setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { bout: 'arrivee' }, geometry: { type: 'Point', coordinates: [lng[dernier], lat[dernier]] } },
        { type: 'Feature', properties: { bout: 'depart' }, geometry: { type: 'Point', coordinates: [lng[0], lat[0]] } },
      ],
    });
  }

  // ---------- Panneau ----------
  function texteRepere(marquant, court = false) {
    const heure = sortie.points.t ? heureSortie(sortie.points.t[marquant.index], sortie) : null;
    if (marquant.type === 'haut') return court ? formatAltitude(marquant.valeur) : t('traces.repere-haut', { valeur: formatAltitude(marquant.valeur) });
    if (marquant.type === 'vitesse') return court ? vitesseTexte(marquant.valeur) : t('traces.repere-vitesse', { valeur: vitesseTexte(marquant.valeur) });
    if (marquant.type === 'pause') {
      const duree = formatDureeReelle(marquant.valeur);
      return court ? duree : t('traces.repere-pause', { duree, heure: heure ?? '' });
    }
    if (marquant.type === 'deco') return court ? t('traces.deco-court') : t('traces.repere-deco', { heure: heure ?? '' });
    return '';
  }

  function rendreLegende(b) {
    const legende = $('.traces-legende');
    if (!mode) {
      legende.replaceChildren();
      return;
    }
    if (mode === 'pente') {
      const palette = paletteInterface();
      const limites = [0, ...PALIERS_PENTE];
      legende.innerHTML = `<div class="traces-legende-classes">${palette.map((couleur, i) => `<span><i style="background:${couleur}"></i>${i < PALIERS_PENTE.length ? `${limites[i]}–${limites[i + 1]}` : `> ${limites[i]}`} %</span>`).join('')}</div>`;
      return;
    }
    const texte = {
      vitesse: vitesseTexte,
      altitude: formatAltitude,
      cardio: (v) => `${Math.round(v)} bpm`,
    }[mode];
    legende.innerHTML = `
      <div class="traces-legende-barre" style="background: linear-gradient(90deg, ${DEGRADE.join(', ')})"></div>
      <div class="traces-legende-bornes"><span>${texte(b.min)}</span><span>${texte(b.max)}</span></div>`;
  }

  function rendreModes() {
    const possibles = modesPossibles(analyse, sortie.points);
    if (!possibles.includes(mode)) mode = possibles[0] ?? null;
    const bloc = $('.traces-couleur');
    bloc.hidden = !possibles.length;
    const conteneur = $('.traces-modes');
    conteneur.style.gridTemplateColumns = `repeat(${Math.max(1, possibles.length)}, minmax(0, 1fr))`;
    conteneur.innerHTML = possibles.map((id) => `<button type="button" data-mode="${id}" aria-pressed="${id === mode}">${t(MODES[id])}</button>`).join('');
    conteneur.querySelectorAll('[data-mode]').forEach((bouton) => bouton.addEventListener('click', () => {
      if (bouton.dataset.mode === mode) return;
      mode = bouton.dataset.mode;
      ecrire('sortie-couleur', mode);
      rendreModes();
      dessinerTrace();
    }));
  }

  function remplir() {
    const s = analyse.stats;
    panneau.titre.textContent = nomSortie(sortie);
    panneau.meta.textContent = [
      libelleType(sortie.type),
      sortie.debut ? dateSortie(sortie.debut, sortie, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    ].filter(Boolean).join(' · ');
    boutonsType.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.type === sortie.type)));

    $('[data-v="distance"]').textContent = formatDistance(s.distance);
    // Le temps en mouvement est le chiffre qui parle ; sans pause, c'est la durée
    const avecPauses = s.tempsMouvement != null && s.tempsPause > 60;
    $('[data-v="libelle-temps"]').textContent = t(avecPauses ? 'traces.stat-en-mouvement' : 'traces.duree');
    $('[data-v="temps"]').textContent = s.duree != null ? formatDureeReelle(avecPauses ? s.tempsMouvement : s.duree) : '—';
    panneau.definirResume({
      rose: iconeType(sortie.type),
      nom: nomSortie(sortie),
      detail: [formatDistance(s.distance), s.duree != null ? formatDureeReelle(s.duree) : null, s.plus != null ? `D+ ${formatDenivele(s.plus)}` : null].filter(Boolean).join(' · '),
      valeur: '',
      unite: '',
    });

    const lignes = lignesStats(analyse.type, s, { cadenceEnPas: analyse.type === 'rando' })
      .filter(([cle]) => !(cle === 'traces.stat-duree-totale' && !avecPauses));
    $('.traces-stats-sortie').innerHTML = lignes.map(([cle, valeur]) => `<div><dt>${cle.includes('.') ? t(cle) : cle}</dt><dd>${valeur}</dd></div>`).join('');

    const blocReperes = $('.traces-reperes');
    blocReperes.hidden = !analyse.marquants.length;
    $('.traces-reperes-liste').replaceChildren(...analyse.marquants.map((marquant) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'traces-repere';
      bouton.innerHTML = `<span class="sortie-repere-pastille sortie-repere-${marquant.type}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES_REPERES[marquant.type]}</svg></span><span></span>`;
      bouton.lastChild.textContent = texteRepere(marquant);
      bouton.addEventListener('click', () => {
        allerA(marquant);
        if (window.matchMedia('(max-width: 640px)').matches) panneau.element.querySelector('.bf-reduire')?.click();
      });
      return bouton;
    }));

    const canaux = (sortie.canaux ?? []).filter((canal) => CANAUX_LIBELLES[canal]).map((canal) => t(CANAUX_LIBELLES[canal]));
    $('.traces-canaux').textContent = t('traces.donnees', {
      format: sortie.format.toUpperCase(),
      liste: [sortie.points.t ? t('traces.canal-heure') : null, ...canaux].filter(Boolean).join(', ') || t('traces.canal-position'),
    }) + (sortie.points.t ? ` ${noteFuseau(sortie)}` : '');
    rendreModes();
  }

  boutonsType.forEach((bouton) => bouton.addEventListener('click', async () => {
    if (!sortie || bouton.dataset.type === sortie.type) return;
    sortie.type = bouton.dataset.type;
    analyse = analyserSortie(sortie);
    remplir();
    poserReperes();
    construireFrise();
    try {
      await modifierSortie(sortie.id, { type: sortie.type });
    } catch (erreur) {
      console.warn('Type de sortie non enregistré :', erreur);
    }
    onModifiee();
  }));

  function fermer() {
    arreterLecture();
    demandeMeteo++;
    if (ombre?.actif) allumerOmbre(false);
    frise?.detruire();
    frise = null;
    indice = null;
    map.getSource(SOURCE_CURSEUR)?.setData({ type: 'FeatureCollection', features: [] });
    if (map.getLayer('sortie-trace')) {
      map.setPaintProperty('sortie-trace', 'line-opacity', 1);
      map.setPaintProperty('sortie-trace-contour', 'line-opacity', 0.9);
    }
    sortie = null;
    analyse = null;
    panneau.masquer();
    reperes.forEach((repere) => repere.remove());
    reperes = [];
    map.getSource(SOURCE)?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource(SOURCE_BOUTS)?.setData({ type: 'FeatureCollection', features: [] });
  }

  surPreferences(() => {
    if (!sortie) return;
    remplir();
    poserReperes();
    dessinerTrace();
    construireFrise();
    afficherMeteo();
    majSoleil({ attendre: false });
  });

  return {
    ouvrir(complete) {
      arreterLecture();
      indice = null;
      sortie = complete;
      analyse = analyserSortie(sortie);
      remplir();
      construireFrise();
      panneau.afficher();
      panneau.agrandir();
      dessinerTrace();
      dessinerBouts();
      poserReperes();
      cadrer();
      // Soleil et ombres : seulement avec l'heure, et si on les avait allumés la dernière fois
      $('.traces-soleil').hidden = !analyse.temps;
      allumerOmbre(ombreVoulue && !!analyse.temps);
      void chargerMeteo();
    },
    get id() {
      return sortie?.id ?? null;
    },
    fermer,
  };
}
