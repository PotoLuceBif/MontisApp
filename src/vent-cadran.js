// Couleurs du vent et cadran de direction, communs à l'analyse du vent et aux balises.
import { pointCardinal } from './vent-calcul.js';

// Sur la carte : vives et cernées de sombre pour rester lisibles sur tous les fonds,
// quel que soit le thème de l'application
export const PALETTE_CARTE = ['#2ef2b4', '#ffe94d', '#ff9a2e', '#ff5580'];

const PALETTES_INTERFACE = {
  clair: ['#248a4b', '#c68b00', '#df6718', '#c93636'],
  sombre: ['#43c98b', '#edc653', '#f28a50', '#ff647c'],
  cyberpunk: ['#4debd4', '#ffe45c', '#ff9b45', '#ff5da2'],
};

export const palierVent = (vitesse) => (vitesse < 10 ? 0 : vitesse < 20 ? 1 : vitesse < 30 ? 2 : 3);

export const paletteInterface = () =>
  PALETTES_INTERFACE[document.documentElement.dataset.theme] || PALETTES_INTERFACE.clair;

export const couleurInterface = (vitesse) => paletteInterface()[palierVent(vitesse)];

// La flèche montre où va le vent. `angle` : rotation de la vue en degrés, à donner
// seulement si le cadran doit suivre une vue tournée (0 : le nord reste en haut).
export function cadranVent(flux, angle = 0, classe = '') {
  const attributFlux = Number.isFinite(flux) ? ` data-flux="${flux}"` : '';
  const graduations = [45, 90, 135, 180, 225, 270, 315]
    .map((degres) => `<path d="M32 4.5V8" transform="rotate(${degres} 32 32)"/>`).join('');
  return `<svg class="vent-cadran ${classe}" viewBox="0 0 64 64" aria-hidden="true"${attributFlux}>
    <g class="vent-cadran-rose" transform="rotate(${-angle} 32 32)">
      <circle cx="32" cy="32" r="29"/>${graduations}
      <text x="32" y="13.5" text-anchor="middle">N</text>
    </g>
    <path class="vent-cadran-fleche" d="M32 13 45 33 36 30V52H28V30L19 33Z" transform="rotate(${(flux ?? 0) - angle} 32 32)"${Number.isFinite(flux) ? '' : ' hidden'}/>
  </svg>`;
}

export const texteProvenance = (provenance) => {
  const point = pointCardinal(provenance);
  return `${point === 'E' || point === 'O' ? 'de l’' : 'du '}${point} · ${Math.round(provenance)}°`;
};
