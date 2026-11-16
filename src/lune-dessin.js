// Dessin de la Lune, commun au ciel en 3D (soleil-ciel.js), à la ligne Lune (lune.js), à la frise de Soleil
// et Lune (soleil-reglage.js) et à Météo (meteo-soleil.js). Visage vu de l'hémisphère nord, nord en haut :
// mers sombres et cratères à leur place (Imbrium, Procellarum, Serenitatis, Tranquillitatis, Crisium,
// Fecunditatis, Nubium, Humorum, Frigoris ; Copernic, Tycho). Côté éclairé en plein, côté sombre à peine
// visible (lumière cendrée). Dessiné sur l'appareil, sans image à charger.
import { dessinPhase } from './lune-calcul.js';

const MERS = [
  [9, 8, 2.6, 2.2], [6.8, 11.6, 2.3, 3.9], [12.7, 8.7, 1.6, 1.5], [14.3, 11.1, 2, 1.6], [17.6, 9.7, 1.1, 0.9],
  [16.4, 13.5, 1.3, 1.6], [10.3, 15, 1.9, 1.4], [7.5, 15.1, 1, 0.9], [11.2, 5.4, 3.4, 0.7],
].map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('');

let numero = 0;

// `contour` : liseré clair autour du disque, pour qu'elle ressorte sur le ciel ou le relief.
// Le chemin éclairé porte la classe `lune-phase-chemin` : on peut le changer ou le tourner ensuite.
export function svgLune({ fraction = 1, croissante = true, sud = false, classe = '', contour = false } = {}) {
  numero += 1;
  const id = numero;
  // Dans l'hémisphère sud, la Lune se voit tête en bas : le visage tourne avec la phase
  const tourner = sud ? ' transform="rotate(180 12 12)"' : '';
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true"><defs>
    <radialGradient id="lune-sol-${id}" cx="42%" cy="40%" r="68%"><stop offset="0" stop-color="#f6f4ec"/><stop offset=".72" stop-color="#dcdad3"/><stop offset="1" stop-color="#aeada8"/></radialGradient>
    <clipPath id="lune-disque-${id}"><circle cx="12" cy="12" r="9"/></clipPath>
    <clipPath id="lune-phase-${id}"><path class="lune-phase-chemin" d="${dessinPhase(fraction, croissante, { sud })}"/></clipPath>
    <g id="lune-visage-${id}" clip-path="url(#lune-disque-${id})"><g${tourner}>
      <circle cx="12" cy="12" r="9" fill="url(#lune-sol-${id})"/>
      <g fill="#7f838c" opacity=".5">${MERS}</g>
      <circle cx="9.3" cy="11.2" r=".55" fill="#fbfaf5"/><circle cx="10.8" cy="18.2" r=".6" fill="#fffef8"/>
      <circle cx="15.2" cy="16.4" r=".45" fill="none" stroke="#9a9ca2" stroke-width=".25"/>
      <circle cx="13.6" cy="5.2" r=".4" fill="none" stroke="#9a9ca2" stroke-width=".25"/>
    </g></g>
  </defs>
  <use href="#lune-visage-${id}" class="lune-cendree"/>
  <use href="#lune-visage-${id}" clip-path="url(#lune-phase-${id})"/>
  ${contour ? '<circle cx="12" cy="12" r="9.3" class="lune-contour"/>' : ''}</svg>`;
}
