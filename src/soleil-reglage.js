// Réglage du jour et de l'heure du soleil, avec sa position (cadran et texte) : commun à Soleil et Lune
// (soleil-lune.js) et aux visites de stations (visite-station.js). Le soleil se calcule au centre de la carte.
// Option `course` (Soleil et Lune) : au-dessus du curseur, la course du soleil et, plus discrète, celle de la
// Lune ; les deux astres suivent le curseur, se lèvent et se couchent sur la ligne d'horizon.
import { courseSoleil, decalageAppareil, hauteurMaxAnnee, heureDuLieu, jourLocal, journeeSoleil, midiLocal, positionSoleil } from './soleil.js';
import { courseLune, dessinPhase, eclairementLune, positionLune } from './lune-calcul.js';
import { svgLune } from './lune-dessin.js';
import { codeCardinal } from './vent-calcul.js';
import { lire, ecrire } from './reglages.js';
import { formatDate, poser, surLangue, t, ta } from './i18n.js';
import { nombre } from './unites.js';

const MINUTE = 60000;
const PAS_CURSEUR = 5;
// Dessin de la course : largeur arbitraire (étirée), horizon au milieu, même échelle au-dessus et en dessous : de
// vraies sinusoïdes, sans plat la nuit (demande du propriétaire du 16 novembre 2026). L'échelle est fixe pour un lieu,
// calée sur le soleil le plus haut de l'année (un peu plus pour la Lune, qui monte jusqu'à 5° plus haut) : l'été
// monte plus haut que l'hiver, et rien ne bouge d'un jour à l'autre. Avant, elle suivait chaque jour le plus haut
// du soleil et de la Lune, et le soleil semblait monter et descendre au rythme de la Lune.
const LARGEUR_COURSE = 288;
const HAUTEUR_COURSE = 72;
const HORIZON = HAUTEUR_COURSE / 2;
const AMPLITUDE = HORIZON - 3;
let echelleCourse = 1;
const yCourse = (hauteur) => Math.max(2, Math.min(HAUTEUR_COURSE - 2, HORIZON - hauteur * echelleCourse));
const xCourse = (minutes) => (minutes / (24 * 60)) * LARGEUR_COURSE;
const traceCourse = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${xCourse(p.minutes).toFixed(1)} ${yCourse(p.hauteur).toFixed(1)}`).join('');

// Petit cadran : le soleil sur le cercle, dans sa direction à l'écran (carte tournée comprise)
export const cadran = (classe) => `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="9.5" class="ombres-cadran-cercle"/>
  <path d="M12 2.5v3" class="ombres-cadran-nord"/>
  <g class="ombres-cadran-aiguille"><path d="M12 12v6.5" class="ombres-cadran-ombre"/><circle cx="12" cy="5.5" r="3" class="ombres-cadran-soleil"/></g>
</svg>`;

// Tourne les cadrans de `racine` (ou de la page) vers le soleil
export function tournerCadrans(racine, soleil, bearing) {
  if (!soleil) return;
  const angle = soleil.azimut - bearing;
  racine.querySelectorAll('.ombres-cadran-aiguille').forEach((g) => {
    g.setAttribute('transform', `rotate(${angle.toFixed(1)} 12 12)`);
    g.closest('svg').classList.toggle('nuit', soleil.hauteur <= 0);
  });
}

// `surChangement({ attendre })` : le soleil a changé (`attendre` pendant un glissement du curseur).
// `actif()` : faut-il suivre l'horloge quand l'heure est « maintenant » ?
let numeroFrise = 0;
export function creerReglageSoleil(map, { surChangement, actif, course = false }) {
  const decoupe = `ciel-course-jour-${++numeroFrise}`;
  const element = document.createElement('div');
  element.className = 'soleil-reglage';
  element.innerHTML = `
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
      ${course ? `<div class="ciel-course" aria-hidden="true">
        <div class="ciel-course-decor"><i class="ciel-course-ciel"></i><i class="ciel-course-mer"></i></div>
        <svg viewBox="0 0 ${LARGEUR_COURSE} ${HAUTEUR_COURSE}" preserveAspectRatio="none">
          <defs><clipPath id="${decoupe}"><rect x="0" y="0" width="${LARGEUR_COURSE}" height="${HORIZON}"/></clipPath></defs>
          <path class="ciel-course-aire" clip-path="url(#${decoupe})"/>
          <line class="ciel-course-horizon" x1="0" x2="${LARGEUR_COURSE}" y1="${HORIZON}" y2="${HORIZON}"/>
          <path class="ciel-course-lune-trace"/>
          <path class="ciel-course-lune-jour" clip-path="url(#${decoupe})"/>
          <path class="ciel-course-soleil-nuit"/>
          <path class="ciel-course-soleil-jour" clip-path="url(#${decoupe})"/>
        </svg>
        <i class="ciel-course-repere ciel-course-lever"></i><i class="ciel-course-repere ciel-course-coucher"></i>
        <span class="ciel-course-heure ciel-course-heure-lever"></span><span class="ciel-course-heure ciel-course-heure-coucher"></span>
        <span class="ciel-course-lune">${svgLune({ classe: 'lune-icone' })}</span>
        <i class="ciel-course-soleil"></i>
      </div>` : ''}
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
  `;
  element.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const nomJour = element.querySelector('.ombres-jour-nom strong');
  const calendrier = element.querySelector('.ombres-calendrier');
  const curseur = element.querySelector('.ombres-curseur');
  const valeurHeure = element.querySelector('.ombres-heure-valeur');
  const piste = element.querySelector('.ombres-piste i');
  const texteSoleil = element.querySelector('.ombres-soleil-texte');

  let fuseauLieu = null; // minutes à l'est de UTC du lieu choisi (Soleil et Lune), sinon l'appareil
  let decalage = decalageAppareil();
  let jour = jourLocal(Date.now(), decalage);
  // « maintenant » suit l'horloge ; sinon, minutes depuis minuit
  let heure = lire('ombres-heure', 'maintenant');
  let soleil = null; // { azimut, hauteur } au centre de la carte
  let journee = null;
  let lieu = null; // { lng, lat } du dernier calcul
  let lieuFige = null; // { lng, lat } : calculs à ce lieu, et non au centre de la carte (mode frise de l'espace)
  let courseCle = null; // jour et lieu de la course dessinée

  const minutesMaintenant = () => {
    const d = new Date(Date.now() + decalage * MINUTE);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const minutesChoisies = () => (heure === 'maintenant' ? minutesMaintenant() : heure);
  const instant = () => midiLocal(jour, decalage).getTime() + (minutesChoisies() - 12 * 60) * MINUTE;
  const nuit = () => !!soleil && soleil.hauteur <= 0;

  function calculer() {
    const { lng, lat } = lieuFige ?? map.getCenter();
    lieu = { lng, lat };
    const position = positionSoleil(instant(), lat, lng);
    soleil = { azimut: position.azimut, hauteur: position.hauteur };
    journee = journeeSoleil(jour, lat, lng, decalage);
    return soleil;
  }

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
    element.querySelector('.ombres-maintenant').classList.toggle('actif', heure === 'maintenant' && jour === aujourdhui);
    element.querySelector('.ombres-lever').textContent = !course && journee?.lever ? `↑ ${heureDuLieu(journee.lever, decalage)}` : '';
    element.querySelector('.ombres-coucher').textContent = !course && journee?.coucher ? `${heureDuLieu(journee.coucher, decalage)} ↓` : '';
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
    tournerCadrans(element, soleil, map.getBearing());
    if (course) majCourse();
  }

  // Courbes redessinées quand le jour ou le lieu change ; astres placés à chaque heure
  function majCourse() {
    if (!lieu) return;
    const boite = element.querySelector('.ciel-course');
    const cle = `${jour}/${decalage}/${lieu.lng.toFixed(2)}/${lieu.lat.toFixed(2)}`;
    if (cle !== courseCle) {
      courseCle = cle;
      const pointsSoleil = courseSoleil(jour, lieu.lat, lieu.lng, decalage);
      const pointsLune = courseLune(jour, lieu.lat, lieu.lng, decalage);
      echelleCourse = AMPLITUDE / Math.min(90, hauteurMaxAnnee(lieu.lat) + 5.2);
      const trace = traceCourse(pointsSoleil);
      boite.querySelector('.ciel-course-soleil-jour').setAttribute('d', trace);
      boite.querySelector('.ciel-course-soleil-nuit').setAttribute('d', trace);
      boite.querySelector('.ciel-course-aire').setAttribute('d', `${trace}L${LARGEUR_COURSE} ${HORIZON}L0 ${HORIZON}Z`);
      const traceLune = traceCourse(pointsLune);
      boite.querySelector('.ciel-course-lune-trace').setAttribute('d', traceLune);
      boite.querySelector('.ciel-course-lune-jour').setAttribute('d', traceLune);
      // Lever et coucher marqués sur l'horizon
      const debut = midiLocal(jour, decalage).getTime() - 12 * 60 * MINUTE;
      const repere = (classe, date) => {
        const el = boite.querySelector(classe);
        el.hidden = !date;
        if (date) el.style.left = `${(((date.getTime() - debut) / MINUTE) / (24 * 60)) * 100}%`;
      };
      repere('.ciel-course-lever', journee?.lever);
      repere('.ciel-course-coucher', journee?.coucher);
      repere('.ciel-course-heure-lever', journee?.lever);
      repere('.ciel-course-heure-coucher', journee?.coucher);
      boite.querySelector('.ciel-course-heure-lever').textContent = journee?.lever ? `↑ ${heureDuLieu(journee.lever, decalage)}` : '';
      boite.querySelector('.ciel-course-heure-coucher').textContent = journee?.coucher ? `${heureDuLieu(journee.coucher, decalage)} ↓` : '';
    }
    const minutes = minutesChoisies();
    const placer = (el, hauteur) => {
      el.style.left = `${(minutes / (24 * 60)) * 100}%`;
      el.style.top = `${(yCourse(hauteur) / HAUTEUR_COURSE) * 100}%`;
      el.classList.toggle('couche', hauteur <= 0);
    };
    if (soleil) placer(boite.querySelector('.ciel-course-soleil'), soleil.hauteur);
    const lune = positionLune(instant(), lieu.lat, lieu.lng);
    const eclairage = eclairementLune(instant());
    const icone = boite.querySelector('.ciel-course-lune');
    icone.querySelector('.lune-phase-chemin').setAttribute('d', dessinPhase(eclairage.fraction, eclairage.croissante, { sud: lieu.lat < 0 }));
    placer(icone, lune.hauteur);
  }

  function changerJour(nouveau) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nouveau) || nouveau === jour) return;
    jour = nouveau;
    if (heure === 'maintenant') heure = minutesMaintenant(); // un autre jour : l'heure ne suit plus l'horloge
    surChangement({});
  }
  element.querySelectorAll('.ombres-jour-bouton').forEach((b) => {
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
    surChangement({ attendre: true });
  });
  element.querySelector('.ombres-maintenant').addEventListener('click', () => {
    heure = 'maintenant';
    ecrire('ombres-heure', heure);
    decalage = fuseauLieu ?? decalageAppareil();
    jour = jourLocal(Date.now(), decalage);
    surChangement({});
  });

  // Aller à un instant (phase de la Lune) : son jour, à cinq minutes près
  function placer(date) {
    const d = new Date(date).getTime();
    jour = jourLocal(d, decalage);
    const local = new Date(d + decalage * MINUTE);
    heure = Math.round((local.getUTCHours() * 60 + local.getUTCMinutes()) / PAS_CURSEUR) * PAS_CURSEUR % (24 * 60);
    ecrire('ombres-heure', heure);
    surChangement({});
  }

  // Heures au fuseau du lieu (null : celui de l'appareil). Le jour et l'heure affichés restent les mêmes
  function changerFuseau(minutes) {
    const nouveau = minutes ?? decalageAppareil();
    fuseauLieu = minutes;
    if (nouveau === decalage) return;
    const maintenant = heure === 'maintenant' && jour === jourLocal(Date.now(), decalage);
    decalage = nouveau;
    if (maintenant) jour = jourLocal(Date.now(), decalage);
    courseCle = null;
    surChangement({});
  }

  const tourner = () => tournerCadrans(element, soleil, map.getBearing());
  map.on('rotate', tourner);
  // L'heure « maintenant » avance toute seule
  const minuteur = setInterval(() => { if (actif() && heure === 'maintenant') surChangement({}); }, MINUTE);
  const desabonnerLangue = surLangue(() => { if (actif()) majTextes(); });

  return {
    element,
    calculer,
    majTextes,
    instant,
    nuit,
    decalage: () => decalage,
    fuseauLieu: () => fuseauLieu,
    changerFuseau,
    soleil: () => soleil,
    // Jour de la frise (« 2026-11-24 ») et lieu des calculs ({ lng, lat }) : vue au sol de Soleil et Lune
    jour: () => jour,
    lieu: () => lieu,
    journee: () => journee,
    placer,
    // `point` ({ lng, lat }) : calculs à ce lieu tant que la carte tourne sous la frise ; null : le centre de la carte
    figerLieu: (point) => { lieuFige = point; },
    // 'soleil' ou 'lune' : la frise ne montre que cet astre ; null : les deux
    montrerSeul: (astre) => {
      if (astre) element.dataset.astre = astre;
      else delete element.dataset.astre;
    },
    // Fin d'un réglage créé pour un temps (visite de la Lune) : plus de minuterie ni d'écouteurs
    arreter() {
      clearInterval(minuteur);
      map.off('rotate', tourner);
      desabonnerLangue?.();
    },
    // L'heure suit l'horloge (« Maintenant »)
    maintenant: () => heure === 'maintenant' && jour === jourLocal(Date.now(), decalage),
  };
}
