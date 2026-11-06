// Section « Soleil » des conditions locales : tout est calculé sur l'appareil, donc disponible hors ligne
import { codeCardinal } from './vent-calcul.js';
import { formatDate, t, ta, ti, poser } from './i18n.js';
import {
  courseSoleil,
  formatDuree,
  heureDuLieu,
  jourLocal,
  journeeSoleil,
  nomDecalage,
  positionSoleil,
} from './soleil.js';

const SVG = 'http://www.w3.org/2000/svg';
const LARGEUR = 300;
const HORIZON = 60;
const ECHELLE = 0.68; // pixels par degré ; réduite quand le soleil monte au-delà de 78°
const BAS = 86;

const xMinutes = (minutes) => (minutes / (24 * 60)) * LARGEUR;
const yHauteur = (hauteur, echelle = ECHELLE) => Math.min(BAS, Math.max(4, HORIZON - hauteur * echelle));
const degres = (valeur) => `${Math.round(valeur)}°`;
const direction = (azimut) => `${Math.round(azimut)}° ${t(`cardinal.${codeCardinal(azimut)}`)}`;

function element(nom, attributs = {}) {
  const noeud = document.createElementNS(SVG, nom);
  for (const [cle, valeur] of Object.entries(attributs)) noeud.setAttribute(cle, valeur);
  return noeud;
}

const ICONES = {
  lever: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 9V3M9.2 5.8 12 3l2.8 2.8M4.5 12.5l1.3 1M19.5 12.5l-1.3 1"/>',
  coucher: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M12 3v6M9.2 6.2 12 9l2.8-2.8M4.5 12.5l1.3 1M19.5 12.5l-1.3 1"/>',
  duree: '<path d="M6.5 3h11M6.5 21h11M8 3v3.2a4 4 0 0 0 1.5 3.1L12 12l2.5-2.7A4 4 0 0 0 16 6.2V3M8 21v-3.2a4 4 0 0 1 1.5-3.1L12 12l2.5 2.7a4 4 0 0 1 1.5 3.1V21"/>',
  midi: '<circle cx="12" cy="8.5" r="3.5"/><path d="M12 2v1.2M5.5 8.5H4.3M19.7 8.5h-1.2M7.4 3.9l.9.9M16.6 3.9l-.9.9M3 20h18"/><path d="M12 14v3.5" stroke-dasharray="1.5 2"/>',
  doree: '<path d="M3 17h18M7 21h10M6.5 17a5.5 5.5 0 0 1 11 0"/><path d="M12 6v2M5.3 8.8l1.4 1.4M18.7 8.8l-1.4 1.4M2.5 13.5H4M20 13.5h1.5"/>',
  aube: '<path d="M3 18h18M7 21h10"/><path d="M14.5 4.5a5.5 5.5 0 1 0 5 8.6 4.5 4.5 0 0 1-5-8.6Z"/>',
};

function creerCase(classe, icone) {
  const bloc = document.createElement('div');
  bloc.className = `soleil-case ${classe}`;
  bloc.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[icone]}</svg><strong></strong><span></span>`;
  return bloc;
}

// Valeur en grand, un mot dessous ; la phrase complète pour les lecteurs d'écran et le survol
function remplirCase(bloc, valeur, mot, phrase) {
  bloc.querySelector('strong').textContent = valeur;
  bloc.querySelector('span').textContent = mot;
  bloc.setAttribute('role', 'group');
  bloc.setAttribute('aria-label', phrase);
  bloc.title = phrase;
}

export function creerSectionSoleil() {
  const section = document.createElement('section');
  section.className = 'meteo-soleil';
  section.hidden = true;
  section.innerHTML = `
    <h3 ${ti('soleil.titre')}>${t('soleil.titre')}</h3>
    <svg class="soleil-course" viewBox="0 0 ${LARGEUR} 100" role="img" ${ta('aria-label', 'soleil.course-aria')}></svg>
    <p class="soleil-regime" hidden></p>
    <div class="soleil-grille"></div>
    <div class="soleil-plages"></div>
    <p class="soleil-note"></p>
  `;
  const titre = section.querySelector('h3');
  const dessin = section.querySelector('.soleil-course');
  const regime = section.querySelector('.soleil-regime');
  const grille = section.querySelector('.soleil-grille');
  const plages = section.querySelector('.soleil-plages');
  const note = section.querySelector('.soleil-note');
  const cases = {
    lever: creerCase('soleil-lever', 'lever'),
    coucher: creerCase('soleil-coucher', 'coucher'),
    duree: creerCase('soleil-duree', 'duree'),
    midi: creerCase('soleil-midi', 'midi'),
    doree: creerCase('soleil-doree', 'doree'),
    aube: creerCase('soleil-aube', 'aube'),
  };
  grille.append(cases.lever, cases.coucher, cases.duree, cases.midi);
  plages.append(cases.doree, cases.aube);

  let dernier = null;

  function dessiner(journee, position, decalage, maintenant) {
    const course = courseSoleil(journee.jour, position.latitude, position.longitude, decalage);
    const plusHaut = Math.max(...course.map((point) => point.hauteur));
    const echelle = Math.min(ECHELLE, (HORIZON - 7) / Math.max(plusHaut, 1));
    const trace = course
      .map((point, index) => `${index ? 'L' : 'M'}${xMinutes(point.minutes).toFixed(1)} ${yHauteur(point.hauteur, echelle).toFixed(1)}`)
      .join(' ');
    const idCoupe = 'soleil-jour';
    const enfants = [
      element('clipPath', { id: idCoupe }),
      element('rect', { class: 'soleil-ciel', x: 0, y: 0, width: LARGEUR, height: HORIZON }),
      element('line', { class: 'soleil-horizon', x1: 0, x2: LARGEUR, y1: HORIZON, y2: HORIZON }),
      element('path', { class: 'soleil-trace-nuit', d: trace }),
      element('path', { class: 'soleil-trace-jour', d: trace, 'clip-path': `url(#${idCoupe})` }),
    ];
    enfants[0].appendChild(element('rect', { x: 0, y: 0, width: LARGEUR, height: HORIZON }));
    for (const heure of [6, 12, 18]) {
      const x = xMinutes(heure * 60);
      enfants.push(element('line', { class: 'soleil-repere', x1: x, x2: x, y1: HORIZON - 3, y2: HORIZON + 3 }));
      const texte = element('text', { class: 'soleil-heure', x, y: 97, 'text-anchor': 'middle' });
      texte.textContent = heureDuLieu(Date.UTC(2000, 0, 1, heure), 0);
      enfants.push(texte);
    }
    if (maintenant) {
      const minutes = (maintenant.getTime() + decalage * 60000) % (24 * 3600000) / 60000;
      const { hauteur } = positionSoleil(maintenant, position.latitude, position.longitude);
      const visible = hauteur > -0.833;
      const point = element('circle', {
        class: visible ? 'soleil-point' : 'soleil-point sous-horizon',
        cx: xMinutes(minutes).toFixed(1),
        cy: yHauteur(hauteur, echelle).toFixed(1),
        r: 5,
      });
      const bulle = element('title');
      const { azimut } = positionSoleil(maintenant, position.latitude, position.longitude);
      bulle.textContent = visible
        ? `${t('soleil.maintenant')} : ${t('soleil.position', { hauteur: degres(hauteur), direction: direction(azimut) })}`
        : `${t('soleil.maintenant')} : ${t('soleil.sous-horizon', { hauteur: degres(hauteur) })}`;
      point.appendChild(bulle);
      enfants.push(point);
    }
    dessin.replaceChildren(...enfants);
  }

  // jour : « AAAA-MM-JJ » du lieu, ou null pour aujourd'hui ; decalage : minutes à l'est de UTC
  function afficher({ position, jour = null, decalage, fuseauDuLieu }) {
    dernier = { position, jour, decalage, fuseauDuLieu };
    if (!position) {
      section.hidden = true;
      return;
    }
    const maintenant = new Date();
    const aujourdhui = jourLocal(maintenant, decalage);
    const jourAffiche = jour ?? aujourdhui;
    const estAujourdhui = jourAffiche === aujourdhui;
    const journee = journeeSoleil(jourAffiche, position.latitude, position.longitude, decalage);
    const heure = (date) => heureDuLieu(date, decalage);

    if (estAujourdhui) poser(titre, 'soleil.titre');
    else {
      const nomJour = formatDate(`${jourAffiche}T12:00:00Z`, {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
      });
      poser(titre, 'soleil.titre-jour', { jour: nomJour });
    }

    dessiner(journee, position, decalage, estAujourdhui ? maintenant : null);

    regime.hidden = journee.regime === 'normal';
    if (!regime.hidden) poser(regime, `soleil.${journee.regime}`);

    const sansValeur = (valeur) => valeur ?? '—';
    remplirCase(cases.lever, heure(journee.lever), t('soleil.mot-lever'), t('soleil.lever-aria', {
      heure: heure(journee.lever), direction: journee.azimutLever === null ? '—' : direction(journee.azimutLever),
    }));
    remplirCase(cases.coucher, heure(journee.coucher), t('soleil.mot-coucher'), t('soleil.coucher-aria', {
      heure: heure(journee.coucher), direction: journee.azimutCoucher === null ? '—' : direction(journee.azimutCoucher),
    }));
    const duree = formatDuree(journee.dureeMinutes);
    remplirCase(cases.duree, duree, t('soleil.mot-duree'), t('soleil.duree-aria', { duree }));
    remplirCase(cases.midi, heure(journee.midiSolaire), t('soleil.mot-midi'), t('soleil.midi-aria', {
      heure: heure(journee.midiSolaire), hauteur: journee.hauteurMax === null ? '—' : degres(journee.hauteurMax),
    }));

    const plage = (doree) => {
      if (!doree) return null;
      if (doree.debut && doree.fin) return `${heure(doree.debut)}–${heure(doree.fin)}`;
      if (doree.fin) return t('soleil.doree-jusqua', { heure: heure(doree.fin) });
      return t('soleil.doree-des', { heure: heure(doree.debut) });
    };
    // Matin et soir sur deux lignes : sur une seule, la case déborde au format téléphone
    const dorees = [plage(journee.doreeMatin), plage(journee.doreeSoir)].filter(Boolean);
    cases.doree.hidden = !dorees.length;
    if (dorees.length) {
      remplirCase(cases.doree, dorees.join('\n'), t('soleil.mot-doree'), t('soleil.doree-aria', { plages: dorees.join(' · ') }));
    }
    cases.aube.hidden = !journee.aube && !journee.crepuscule;
    if (!cases.aube.hidden) {
      const debut = sansValeur(journee.aube && heure(journee.aube));
      const fin = sansValeur(journee.crepuscule && heure(journee.crepuscule));
      remplirCase(cases.aube, `${debut}\n${fin}`, t('soleil.mot-aube'), t('soleil.aube-aria', { plages: `${debut} · ${fin}` }));
    }

    note.textContent = fuseauDuLieu
      ? t('soleil.relief')
      : `${t('soleil.fuseau-appareil', { fuseau: nomDecalage(decalage) })} ${t('soleil.relief')}`;
    section.hidden = false;
  }

  return {
    section,
    afficher,
    // Langue changée ou minute écoulée : même lieu, même jour
    rafraichir() {
      if (dernier) afficher(dernier);
    },
  };
}
