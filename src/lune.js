// Ligne Lune de la rubrique Soleil et Lune (lot 4.7) : phase et éclairement, position dans le ciel à l'heure
// choisie (cadran et texte), lever, passage au plus haut et coucher, progression du cycle en jours avec ses
// quatre phases à toucher, et la prochaine pleine lune : un appui place la frise ce jour-là, à l'heure où la
// Lune est au plus haut. Au centre de la carte, à l'heure de la rubrique (soleil-lune.js).
import {
  ageLune, culminationProche, cycleLunaire, dessinPhase, DUREE_LUNAISON, eclairementLune, journeeLune, positionLune, prochainePhase,
} from './lune-calcul.js';
import { heureDuLieu, jourLocal } from './soleil.js';
import { codeCardinal } from './vent-calcul.js';
import { formatDate, poser, surLangue, t } from './i18n.js';
import { nombre, pourcent } from './unites.js';

const MINUTE = 60000;
const JOUR = 24 * 60 * MINUTE;
// Dessin de chaque phase principale dans la frise du cycle
const ECLAIRAGE_PHASE = {
  nouvelle: [0, true],
  'premier-quartier': [0.5, true],
  pleine: [1, true],
  'dernier-quartier': [0.5, false],
};
const iconePhase = (code, sud, classe = 'lune-icone') => {
  const [fraction, croissante] = ECLAIRAGE_PHASE[code];
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" class="lune-icone-fond"/><path class="lune-icone-eclairee" d="${dessinPhase(fraction, croissante, { sud })}"/></svg>`;
};

const CADRAN = `<svg class="ombres-cadran lune-cadran" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="9.5" class="ombres-cadran-cercle"/>
  <path d="M12 2.5v3" class="ombres-cadran-nord"/>
  <g class="lune-cadran-aiguille"><path d="M12 12V8" class="ombres-cadran-ombre"/><circle cx="12" cy="5.5" r="2.6" class="lune-cadran-astre"/></g>
</svg>`;

export function creerLune(map, partage, reglage) {
  const panneau = document.createElement('div');
  panneau.className = 'lune-panneau';
  panneau.innerHTML = `
    <div class="lune-phase">
      <svg class="lune-icone" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" class="lune-icone-fond"/><path class="lune-icone-eclairee"/>
      </svg>
      <div class="lune-phase-textes"><strong class="lune-nom"></strong><span class="lune-fraction"></span></div>
    </div>
    <div class="ombres-soleil lune-position" role="status">${CADRAN}<span class="lune-position-texte"></span></div>
    <div class="lune-heures">
      <div><span data-i18n="lune.lever"></span><strong class="lune-lever"></strong></div>
      <div><span data-i18n="lune.culmination"></span><strong class="lune-culmination"></strong></div>
      <div><span data-i18n="lune.coucher"></span><strong class="lune-coucher"></strong></div>
    </div>
    <p class="note lune-regime" hidden></p>
    <div class="lunaison">
      <div class="lunaison-entete"><strong class="lunaison-jour"></strong><span class="lunaison-reste"></span></div>
      <div class="lunaison-frise">
        <div class="lunaison-piste"><i class="lunaison-fait"></i></div>
        <i class="lunaison-curseur"></i>
        <div class="lunaison-phases"></div>
      </div>
    </div>
    <button type="button" class="point-lien lune-aller">
      <span class="lune-aller-icone"></span><span class="lune-aller-texte"></span>
      <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </button>
  `;
  panneau.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const $ = (selecteur) => panneau.querySelector(selecteur);

  let actif = false;
  let desabonner = null;
  let lune = null;
  let cycle = null; // phases du cycle affiché
  let pleine = null; // prochaine pleine lune

  // Va à une phase : son jour, quand la Lune y est au plus haut (on la voit dans le ciel)
  function allerA(instant) {
    const { lng, lat } = map.getCenter();
    reglage.placer(culminationProche(instant, lat, lng));
  }
  $('.lune-aller').addEventListener('click', () => { if (pleine) allerA(pleine); });

  const dateCourte = (instant, decalage) => formatDate(new Date(instant.getTime() + decalage * MINUTE), {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });

  function majCadran() {
    if (!lune) return;
    const angle = lune.azimut - map.getBearing();
    $('.lune-cadran-aiguille').setAttribute('transform', `rotate(${angle.toFixed(1)} 12 12)`);
    $('.lune-cadran').classList.toggle('nuit', lune.hauteur <= 0);
  }

  function maj() {
    if (!actif) return;
    const { lng, lat } = map.getCenter();
    const instant = reglage.instant();
    const decalage = reglage.decalage();
    lune = positionLune(instant, lat, lng);
    const eclairage = eclairementLune(instant);

    // Phase : vue de l'hémisphère du lieu (éclairée à droite au nord quand elle croît, à gauche au sud)
    $('.lune-icone-eclairee').setAttribute('d', dessinPhase(eclairage.fraction, eclairage.croissante, { sud: lat < 0 }));
    $('.lune-nom').textContent = t(`lune.phase-${eclairage.code}`);
    $('.lune-fraction').textContent = t('lune.eclairee', { pourcent: pourcent(eclairage.fraction * 100) });

    const hauteur = `${nombre(Math.round(lune.hauteur))}°`;
    const direction = `${nombre(Math.round(lune.azimut))}° ${t(`cardinal.${codeCardinal(lune.azimut)}`)}`;
    $('.lune-position-texte').textContent = lune.hauteur > 0
      ? t('lune.position', { hauteur, direction })
      : t('lune.sous-horizon', { hauteur, direction });
    majCadran();

    const jour = jourLocal(instant, decalage);
    const journee = journeeLune(jour, lat, lng, decalage);
    const heure = (date) => (date ? heureDuLieu(date, decalage) : '–');
    $('.lune-lever').textContent = heure(journee.lever);
    $('.lune-culmination').textContent = heure(journee.culmination);
    $('.lune-coucher').textContent = heure(journee.coucher);
    const regime = journee.regime === 'normal' ? '' : t(`lune.${journee.regime}`);
    $('.lune-regime').textContent = regime;
    $('.lune-regime').hidden = !regime;

    majLunaison(instant, decalage, lat < 0);
  }

  // Progression du cycle : du jour 0 (nouvelle lune) à 29,5 ; les phases principales s'y touchent
  function majLunaison(instant, decalage, sud) {
    const age = ageLune(instant);
    const t0 = new Date(instant).getTime();
    if (!cycle || t0 < cycle[0].instant || t0 >= cycle[4].instant || cycle.sud !== sud || cycle.decalage !== decalage) {
      cycle = cycleLunaire(instant);
      cycle.sud = sud;
      cycle.decalage = decalage;
      $('.lunaison-phases').replaceChildren(...cycle.map((phase) => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'lunaison-phase';
        bouton.style.left = `${phase.part * 100}%`;
        const date = phase.instant ? dateCourte(phase.instant, decalage) : '';
        bouton.innerHTML = `${iconePhase(phase.code, sud)}<small>${date.replace(/^\S+\s/, '')}</small>`;
        const nom = t(`lune.phase-${phase.code}`);
        bouton.setAttribute('aria-label', t('lune.aller-phase', { phase: nom, date }));
        bouton.title = bouton.getAttribute('aria-label');
        bouton.addEventListener('click', () => { if (phase.instant) allerA(phase.instant); });
        return bouton;
      }));
    }
    const part = Math.min(1, age / DUREE_LUNAISON);
    $('.lunaison-fait').style.width = `${part * 100}%`;
    $('.lunaison-curseur').style.left = `${part * 100}%`;
    $('.lunaison-jour').textContent = t('lune.jour-cycle', { jour: nombre(Math.floor(age) + 1), total: nombre(29.5, 1) });
    // Prochaine phase principale, en jours
    const suivante = cycle.find((p) => p.instant && p.instant.getTime() > t0);
    if (suivante) {
      const jours = Math.round((suivante.instant.getTime() - t0) / JOUR);
      const nom = t(`lune.phase-${suivante.code}`);
      $('.lunaison-reste').textContent = jours < 1 ? t('lune.phase-aujourdhui', { phase: nom }) : t('lune.phase-dans', { phase: nom, jours: nombre(jours) });
    }
    // Pleine lune à venir (celle du jour, si elle n'est pas encore passée)
    pleine = prochainePhase(t0, 0.5);
    $('.lune-aller-icone').innerHTML = iconePhase('pleine', sud, 'lune-icone point-lien-icone');
    if (pleine) {
      const jours = Math.max(0, Math.round((pleine.getTime() - t0) / JOUR));
      $('.lune-aller-texte').textContent = t('lune.aller-pleine', { date: dateCourte(pleine, decalage), jours: nombre(jours) });
    }
  }

  map.on('rotate', () => { if (actif) majCadran(); });
  surLangue(maj);

  return {
    id: 'lune',
    labelCle: 'lune.titre',
    icone: 'lune',
    panneau,
    activer() {
      actif = true;
      desabonner ??= partage.abonner(maj);
      maj();
    },
    desactiver() {
      actif = false;
      desabonner?.();
      desabonner = null;
    },
  };
}
