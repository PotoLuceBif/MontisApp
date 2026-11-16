// Dessin de la Terre vue de la Lune (lot 4.10), pendant du dessin de la Lune (lune-dessin.js) : océans,
// continents stylisés (Afrique, Europe, Amériques), calottes et nuages, côté nuit sombre selon la phase.
// Dessiné sur l'appareil, sans image à charger.
import { dessinPhase } from './lune-calcul.js';

const CONTINENTS = [
  // Europe et Afrique
  'M12.6 4.6c1.2-.3 2.4.1 3.3.7.6.5.3 1.2-.3 1.5-.7.3-.6 1 .1 1.3.9.4 1.3 1.2 1.1 2.1-.3 1.2.4 2.3.2 3.5-.2 1.4-1.2 2.4-1.9 3.6-.5.9-1.4 1.4-2.1.9-.6-.5-.4-1.5-.7-2.2-.4-1-1.4-1.4-1.6-2.4-.2-.9.4-1.6.1-2.4-.3-.7-1.3-.6-1.6-1.3-.3-.8.4-1.5.9-2 .6-.6 1.4-1 2.5-1.3Z',
  // Amérique du Sud, au bord ouest
  'M5.1 11.6c.9-.2 1.8.3 2.2 1.1.4.9 0 1.8-.3 2.7-.4 1.1-.3 2.3-.9 3.2-.3.4-.8.2-.9-.3-.3-1.2-.5-2.4-.9-3.6-.2-.8-.4-1.7.1-2.4.2-.3.4-.6.7-.7Z',
  // Asie, au bord est
  'M17.6 5.6c1 .2 1.9.9 2.5 1.8.4.6.3 1.4-.4 1.6-.8.2-1.6-.3-2.2-.8-.5-.5-.7-1.2-.4-1.8.1-.3.2-.6.5-.8Z',
].map((d) => `<path d="${d}"/>`).join('');

let numero = 0;

// `fraction` : part éclairée vue de la Lune ; le côté éclairé se tourne ensuite vers le soleil
// (chemin `terre-phase-chemin`, comme `lune-phase-chemin`)
export function svgTerre({ fraction = 1, croissante = true, classe = '' } = {}) {
  numero += 1;
  const id = numero;
  return `<svg class="${classe}" viewBox="0 0 24 24" aria-hidden="true"><defs>
    <radialGradient id="terre-ocean-${id}" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#5fb4f2"/><stop offset=".6" stop-color="#2a74c4"/><stop offset="1" stop-color="#173f78"/></radialGradient>
    <radialGradient id="terre-air-${id}" cx="50%" cy="50%" r="50%"><stop offset=".82" stop-color="#9fd4ff" stop-opacity="0"/><stop offset="1" stop-color="#bfe3ff" stop-opacity=".55"/></radialGradient>
    <clipPath id="terre-disque-${id}"><circle cx="12" cy="12" r="9"/></clipPath>
    <clipPath id="terre-phase-${id}"><path class="terre-phase-chemin" d="${dessinPhase(fraction, croissante)}"/></clipPath>
    <g id="terre-visage-${id}" clip-path="url(#terre-disque-${id})">
      <circle cx="12" cy="12" r="9" fill="url(#terre-ocean-${id})"/>
      <g fill="#6f9e4f" stroke="#c9b27a" stroke-width=".35">${CONTINENTS}</g>
      <path d="M6 4.4c1.8-1 4-1.5 6-1.4s4 .6 5.6 1.6c-1.6.3-3.4.2-5.2.1-2.2-.1-4.3 0-6.4-.3Z" fill="#f4f8ff"/>
      <path d="M6.4 19.8c1.8.8 3.7 1.2 5.6 1.2s3.9-.4 5.5-1.2c-1.7-.4-3.6-.3-5.4-.3-2-.1-3.9.1-5.7.3Z" fill="#f4f8ff"/>
      <g fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width=".7" stroke-linecap="round">
        <path d="M4.2 9.2c1.4-.6 2.6-.3 3.6.3"/><path d="M14.4 9.8c1.2-.8 2.8-.9 4.2-.2"/><path d="M8.6 17.6c1.5.4 3 .2 4.2-.5"/><path d="M15.8 14.8c.9.3 1.8.2 2.6-.3"/>
      </g>
      <circle cx="12" cy="12" r="9" fill="url(#terre-air-${id})"/>
    </g>
  </defs>
  <use href="#terre-visage-${id}" class="terre-nuit"/>
  <use href="#terre-visage-${id}" clip-path="url(#terre-phase-${id})"/>
  <circle cx="12" cy="12" r="9.3" class="terre-contour"/></svg>`;
}
