// Ligne Lune de la rubrique Soleil et Lune (lot 4.7) : phase et éclairement, position dans le ciel à l'heure
// choisie (cadran et texte), lever, passage au plus haut et coucher, prochaines pleine et nouvelle lune.
// Au centre de la carte, à l'heure de la rubrique (soleil-lune.js). Chargé à la première ouverture.
import { dessinPhase, eclairementLune, journeeLune, positionLune, prochainePhase } from './lune-calcul.js';
import { heureDuLieu, jourLocal } from './soleil.js';
import { codeCardinal } from './vent-calcul.js';
import { formatDate, poser, surLangue, t } from './i18n.js';
import { nombre, pourcent } from './unites.js';

const MINUTE = 60000;

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
    <p class="lune-prochaines"></p>
  `;
  panneau.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const $ = (selecteur) => panneau.querySelector(selecteur);

  let actif = false;
  let desabonner = null;
  let lune = null;

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

    const pleine = prochainePhase(instant, 0.5);
    const nouvelle = prochainePhase(instant, 0);
    $('.lune-prochaines').textContent = [
      pleine && t('lune.prochaine-pleine', { date: dateCourte(pleine, decalage) }),
      nouvelle && t('lune.prochaine-nouvelle', { date: dateCourte(nouvelle, decalage) }),
    ].filter(Boolean).join(' · ');
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
