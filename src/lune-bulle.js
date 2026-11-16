// La Lune se touche (lot 4.10) : dans le ciel du globe au dézoom (ciel.js) et dans le ciel en 3D
// (soleil-ciel.js, événement `montis:lune-touchee`). Une petite bulle propose « Informations » (Soleil et
// Lune › Lune) et « Visiter la Lune ».
import { ouvrirSoleilLune } from './soleil-lune.js';
import { poser } from './i18n.js';

const MARGE = 14; // px autour du disque : la Lune est petite, le doigt ne l'est pas

export const visiterLaLune = (map, options) => import('./lune-visite.js').then((m) => m.visiterLune(map, options));

export function initBulleLune(map, ciel) {
  if (import.meta.env.DEV) window.cielMontis = ciel; // captures : position de la Lune à toucher
  const bulle = document.createElement('div');
  bulle.className = 'lune-bulle';
  bulle.hidden = true;
  bulle.innerHTML = `
    <button type="button" data-action="infos"><span data-i18n="lune-visite.informations"></span></button>
    <button type="button" data-action="visiter" class="principal"><span data-i18n="lune-visite.visiter"></span></button>
  `;
  bulle.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  document.body.append(bulle);

  const fermer = () => { bulle.hidden = true; };
  function ouvrir(x, y) {
    const cadre = map.getContainer().getBoundingClientRect();
    bulle.hidden = false;
    const largeur = bulle.offsetWidth;
    const gauche = Math.min(window.innerWidth - largeur - 8, Math.max(8, cadre.left + x - largeur / 2));
    // Sous la Lune, sauf si elle est trop bas
    const sous = cadre.top + y + 22;
    const haut = sous + bulle.offsetHeight > window.innerHeight - 8 ? cadre.top + y - 22 - bulle.offsetHeight : sous;
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${Math.max(8, haut)}px`;
  }

  bulle.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermer();
    if (action === 'infos') ouvrirSoleilLune('lune');
    else visiterLaLune(map);
  });

  // Au dézoom : un appui sur la Lune du ciel, si le globe ne la cache pas à cet endroit
  map.on('click', (event) => {
    const lune = ciel?.pointLune();
    const { x, y } = event.point;
    if (!lune || Math.hypot(x - lune.x, y - lune.y) > lune.rayon + MARGE) {
      fermer();
      return;
    }
    // Hors du globe, MapLibre ramène le point sur son bord : le chemin aller-retour ne retombe pas au même pixel
    const retour = map.project(map.unproject(event.point));
    if (Math.hypot(retour.x - x, retour.y - y) < 3) {
      fermer();
      return;
    }
    // Après le clic : le menu ferme ses panneaux au même clic (menu.js)
    setTimeout(() => ouvrir(lune.x, lune.y));
  });
  window.addEventListener('montis:lune-touchee', ({ detail }) => setTimeout(() => ouvrir(detail.x, detail.y)));
  map.on('movestart', (event) => { if (event.originalEvent) fermer(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') fermer(); });
}
