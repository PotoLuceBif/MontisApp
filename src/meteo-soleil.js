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

function creerCase(classe) {
  const bloc = document.createElement('div');
  bloc.className = `soleil-case ${classe}`;
  bloc.innerHTML = '<span></span><strong></strong><small></small>';
  return bloc;
}

function remplirCase(bloc, cle, valeur, detail = '') {
  poser(bloc.querySelector('span'), cle);
  bloc.querySelector('strong').textContent = valeur;
  const petit = bloc.querySelector('small');
  petit.textContent = detail;
  petit.hidden = !detail;
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
    <div class="soleil-lignes"></div>
    <p class="soleil-note"></p>
  `;
  const titre = section.querySelector('h3');
  const dessin = section.querySelector('.soleil-course');
  const regime = section.querySelector('.soleil-regime');
  const grille = section.querySelector('.soleil-grille');
  const lignes = section.querySelector('.soleil-lignes');
  const note = section.querySelector('.soleil-note');
  const cases = {
    lever: creerCase('soleil-lever'),
    coucher: creerCase('soleil-coucher'),
    duree: creerCase('soleil-duree'),
    midi: creerCase('soleil-midi'),
  };
  grille.append(cases.lever, cases.coucher, cases.duree, cases.midi);

  let dernier = null;

  function ligne(cle, valeur) {
    const bloc = document.createElement('div');
    bloc.className = 'meteo-detail';
    const nom = document.createElement('span');
    poser(nom, cle);
    const contenu = document.createElement('strong');
    contenu.textContent = valeur;
    bloc.append(nom, contenu);
    lignes.appendChild(bloc);
  }

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
      enfants.push(element('circle', {
        class: visible ? 'soleil-point' : 'soleil-point sous-horizon',
        cx: xMinutes(minutes).toFixed(1),
        cy: yHauteur(hauteur, echelle).toFixed(1),
        r: 5,
      }));
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

    remplirCase(cases.lever, 'soleil.lever', heure(journee.lever),
      journee.azimutLever === null ? '' : direction(journee.azimutLever));
    remplirCase(cases.coucher, 'soleil.coucher', heure(journee.coucher),
      journee.azimutCoucher === null ? '' : direction(journee.azimutCoucher));
    remplirCase(cases.duree, 'soleil.duree', formatDuree(journee.dureeMinutes));
    remplirCase(cases.midi, 'soleil.midi', heure(journee.midiSolaire),
      journee.hauteurMax === null ? '' : t('soleil.hauteur', { hauteur: degres(journee.hauteurMax) }));

    lignes.replaceChildren();
    const plage = (doree) => {
      if (!doree) return null;
      if (doree.debut && doree.fin) return `${heure(doree.debut)} – ${heure(doree.fin)}`;
      if (doree.fin) return t('soleil.doree-jusqua', { heure: heure(doree.fin) });
      return t('soleil.doree-des', { heure: heure(doree.debut) });
    };
    const dorees = [plage(journee.doreeMatin), plage(journee.doreeSoir)].filter(Boolean);
    if (dorees.length) ligne('soleil.doree', dorees.join(' · '));
    if (journee.aube || journee.crepuscule) {
      ligne('soleil.aube-crepuscule', `${heure(journee.aube)} · ${heure(journee.crepuscule)}`);
    }
    if (estAujourdhui) {
      const { azimut, hauteur } = positionSoleil(maintenant, position.latitude, position.longitude);
      ligne('soleil.maintenant', hauteur > -0.833
        ? t('soleil.position', { hauteur: degres(hauteur), direction: direction(azimut) })
        : t('soleil.sous-horizon', { hauteur: degres(hauteur) }));
    }

    note.textContent = `${t(fuseauDuLieu ? 'soleil.fuseau-lieu' : 'soleil.fuseau-appareil', {
      fuseau: nomDecalage(decalage),
    })} ${t('soleil.relief')}`;
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
