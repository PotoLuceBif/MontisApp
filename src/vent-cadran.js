// Couleurs du vent et cadran de direction, communs à l'analyse du vent et aux balises.
import { pointCardinal } from './vent-calcul.js';

// Force du vent, de calme à fort, en km/h : une seule échelle pour le vent prévu et les balises
export const PALIERS_VENT = [10, 20, 30, 40];

// Sur la carte : vives et cernées de sombre pour rester lisibles sur tous les fonds,
// quel que soit le thème de l'application
export const PALETTE_CARTE = ['#2ef2b4', '#ffe94d', '#ff9a2e', '#ff5580', '#b98bff'];

const PALETTES_INTERFACE = {
  clair: ['#248a4b', '#c68b00', '#df6718', '#c93636', '#7c3aed'],
  sombre: ['#43c98b', '#edc653', '#f28a50', '#ff647c', '#b98bff'],
  cyberpunk: ['#4debd4', '#ffe45c', '#ff9b45', '#ff5da2', '#c77dff'],
};

export const palierVent = (vitesse) => {
  const palier = PALIERS_VENT.findIndex((limite) => vitesse < limite);
  return palier < 0 ? PALIERS_VENT.length : palier;
};

export const paletteInterface = () =>
  PALETTES_INTERFACE[document.documentElement.dataset.theme] || PALETTES_INTERFACE.clair;

export const couleurInterface = (vitesse) => paletteInterface()[palierVent(vitesse)];

// La flèche montre où va le vent. `angle` : rotation de la vue en degrés, à donner
// seulement si le cadran doit suivre une vue tournée (0 : le nord reste en haut).
// `cardinaux` : les quatre points, seulement si le cadran est assez grand pour les lire.
export function cadranVent(flux, angle = 0, classe = '', cardinaux = false) {
  const attributFlux = Number.isFinite(flux) ? ` data-flux="${flux}"` : '';
  const graduations = (cardinaux ? [45, 135, 225, 315] : [45, 90, 135, 180, 225, 270, 315])
    .map((degres) => `<path d="M32 4.5V8" transform="rotate(${degres} 32 32)"/>`).join('');
  const points = cardinaux
    ? '<text x="32" y="10.5">N</text><text x="53.5" y="32">E</text><text x="32" y="53.5">S</text><text x="10.5" y="32">O</text>'
    : '<text x="32" y="13.5">N</text>';
  const fleche = cardinaux ? 'M32 15 43 33 35.5 30V49H28.5V30L21 33Z' : 'M32 13 45 33 36 30V52H28V30L19 33Z';
  return `<svg class="vent-cadran ${classe}${cardinaux ? ' vent-cadran-cardinaux' : ''}" viewBox="0 0 64 64" aria-hidden="true"${attributFlux}>
    <g class="vent-cadran-rose" transform="rotate(${-angle} 32 32)">
      <circle cx="32" cy="32" r="29"/>${graduations}
      <g text-anchor="middle">${points}</g>
    </g>
    <path class="vent-cadran-fleche" d="${fleche}" transform="rotate(${(flux ?? 0) - angle} 32 32)"${Number.isFinite(flux) ? '' : ' hidden'}/>
  </svg>`;
}

export const heureCourte = (date) => {
  const valeur = new Date(date);
  return `${valeur.getHours()}h${String(valeur.getMinutes()).padStart(2, '0')}`;
};

export const texteProvenance = (provenance) => {
  const point = pointCardinal(provenance);
  return `${point === 'E' || point === 'O' ? 'de l’' : 'du '}${point} · ${Math.round(provenance)}°`;
};
