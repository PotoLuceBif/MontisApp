// Réglage du jour et de l'heure du soleil, avec sa position (cadran et texte) : commun à Carte › Relief
// (ombres.js) et aux visites de stations (visite-station.js). Le soleil se calcule au centre de la carte.
import { decalageAppareil, heureDuLieu, jourLocal, journeeSoleil, midiLocal, positionSoleil } from './soleil.js';
import { codeCardinal } from './vent-calcul.js';
import { lire, ecrire } from './reglages.js';
import { formatDate, poser, surLangue, t, ta } from './i18n.js';
import { nombre } from './unites.js';

const MINUTE = 60000;
const PAS_CURSEUR = 5;

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
export function creerReglageSoleil(map, { surChangement, actif }) {
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

  let decalage = decalageAppareil();
  let jour = jourLocal(Date.now(), decalage);
  // « maintenant » suit l'horloge ; sinon, minutes depuis minuit
  let heure = lire('ombres-heure', 'maintenant');
  let soleil = null; // { azimut, hauteur } au centre de la carte
  let journee = null;

  const minutesMaintenant = () => {
    const d = new Date(Date.now() + decalage * MINUTE);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  const minutesChoisies = () => (heure === 'maintenant' ? minutesMaintenant() : heure);
  const instant = () => midiLocal(jour, decalage).getTime() + (minutesChoisies() - 12 * 60) * MINUTE;
  const nuit = () => !!soleil && soleil.hauteur <= 0;

  function calculer() {
    const { lng, lat } = map.getCenter();
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
    element.querySelector('.ombres-lever').textContent = journee?.lever ? `↑ ${heureDuLieu(journee.lever, decalage)}` : '';
    element.querySelector('.ombres-coucher').textContent = journee?.coucher ? `${heureDuLieu(journee.coucher, decalage)} ↓` : '';
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
    decalage = decalageAppareil();
    jour = jourLocal(Date.now(), decalage);
    surChangement({});
  });

  map.on('rotate', () => tournerCadrans(element, soleil, map.getBearing()));
  // L'heure « maintenant » avance toute seule
  setInterval(() => { if (actif() && heure === 'maintenant') surChangement({}); }, MINUTE);
  surLangue(() => { if (actif()) majTextes(); });

  return {
    element,
    calculer,
    majTextes,
    instant,
    nuit,
    decalage: () => decalage,
    soleil: () => soleil,
  };
}
