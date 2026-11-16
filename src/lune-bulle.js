// La Lune et le soleil se touchent (lot 4.10, demandes du propriétaire du 16 novembre 2026) : dans le ciel du
// globe au dézoom (ciel.js) et dans le ciel en 3D (soleil-ciel.js, événement `montis:astre-touche`). Une petite
// bulle propose, pour la Lune, « Informations » (Soleil et Lune › Lune) et « Visiter la Lune » ; pour le
// soleil, « Informations » (Soleil et Lune › Soleil), sans visite.
import { ouvrirSoleilLune } from './soleil-lune.js';
import { poser } from './i18n.js';

const MARGE = 14; // px autour du disque : les astres sont petits, le doigt ne l'est pas

export const visiterLaLune = (map, options) => import('./lune-visite.js').then((m) => m.visiterLune(map, options));

export function initBulleLune(map, ciel) {
  if (import.meta.env.DEV) window.cielMontis = ciel; // captures : position des astres à toucher
  const bulle = document.createElement('div');
  bulle.className = 'lune-bulle';
  bulle.hidden = true;
  bulle.innerHTML = `
    <button type="button" data-action="infos"><span data-i18n="lune-visite.informations"></span></button>
    <button type="button" data-action="visiter" class="principal"><span data-i18n="lune-visite.visiter"></span></button>
  `;
  bulle.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  document.body.append(bulle);
  let astre = 'lune';

  const fermer = () => { bulle.hidden = true; };
  function ouvrir(x, y, quoi) {
    astre = quoi;
    bulle.classList.toggle('soleil', quoi === 'soleil');
    bulle.querySelector('[data-action="visiter"]').hidden = quoi === 'soleil';
    const cadre = map.getContainer().getBoundingClientRect();
    bulle.hidden = false;
    const largeur = bulle.offsetWidth;
    const gauche = Math.min(window.innerWidth - largeur - 8, Math.max(8, cadre.left + x - largeur / 2));
    // Sous l'astre, sauf s'il est trop bas
    const sous = cadre.top + y + 22;
    const haut = sous + bulle.offsetHeight > window.innerHeight - 8 ? cadre.top + y - 22 - bulle.offsetHeight : sous;
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${Math.max(8, haut)}px`;
  }

  bulle.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermer();
    if (action === 'infos') ouvrirSoleilLune(astre === 'soleil' ? 'ombres' : 'lune');
    else visiterLaLune(map);
  });

  // Au dézoom : un appui sur un astre du ciel, si le globe ne le cache pas à cet endroit
  map.on('click', (event) => {
    const { x, y } = event.point;
    const proche = (point) => point && Math.hypot(x - point.x, y - point.y) <= point.rayon + MARGE;
    const lune = ciel?.pointLune();
    const soleil = ciel?.pointSoleil();
    const quoi = proche(lune) ? 'lune' : proche(soleil) ? 'soleil' : null;
    if (!quoi) {
      fermer();
      return;
    }
    // Hors du globe, MapLibre ramène le point sur son bord : le chemin aller-retour ne retombe pas au même pixel
    const retour = map.project(map.unproject(event.point));
    if (Math.hypot(retour.x - x, retour.y - y) < 3) {
      fermer();
      return;
    }
    const point = quoi === 'lune' ? lune : soleil;
    // Après le clic : le menu ferme ses panneaux au même clic (menu.js)
    setTimeout(() => ouvrir(point.x, point.y, quoi));
  });
  window.addEventListener('montis:astre-touche', ({ detail }) => setTimeout(() => ouvrir(detail.x, detail.y, detail.astre)));
  map.on('movestart', (event) => { if (event.originalEvent) fermer(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') fermer(); });
}
