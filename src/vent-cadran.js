// Couleurs du vent et cadran de direction, communs à l'analyse du vent et aux balises.
import { codeCardinal, pointCardinal } from './vent-calcul.js';
import { heureCourte, t } from './i18n.js';

export { heureCourte };
import { valeurVent } from './unites.js';

// Force du vent, de calme à très fort, en km/h : une seule échelle pour le vent prévu et les balises.
// Au-delà de 70 km/h (courant-jet en altitude), la flèche a une double pointe (demande du propriétaire)
export const PALIERS_VENT = [10, 20, 30, 40, 70];
export const VENT_TRES_FORT = PALIERS_VENT.at(-1);

// Sur la carte : vives et cernées de sombre pour rester lisibles sur tous les fonds,
// quel que soit le thème de l'application
export const PALETTE_CARTE = ['#2ef2b4', '#ffe94d', '#ff9a2e', '#ff5580', '#b98bff', '#f6f2ff'];

const PALETTES_INTERFACE = {
  clair: ['#248a4b', '#c68b00', '#df6718', '#c93636', '#7c3aed', '#2e1065'],
  sombre: ['#43c98b', '#edc653', '#f28a50', '#ff647c', '#b98bff', '#f1eaff'],
  cyberpunk: ['#4debd4', '#ffe45c', '#ff9b45', '#ff5da2', '#c77dff', '#ffffff'],
};

export const palierVent = (vitesse) => {
  const palier = PALIERS_VENT.findIndex((limite) => vitesse < limite);
  return palier < 0 ? PALIERS_VENT.length : palier;
};

export const paletteInterface = () =>
  PALETTES_INTERFACE[document.documentElement.dataset.theme] || PALETTES_INTERFACE.clair;

export const couleurInterface = (vitesse) => paletteInterface()[palierVent(vitesse)];

// Flèche de légende d'un palier (couleur par --vent-couleur, cerne sombre) ; double pointe pour le dernier
export function iconeVent(palier) {
  const double = palier >= PALIERS_VENT.length;
  const longueur = double ? 26 : 22;
  const pointes = double
    ? `<path class="pointe" d="M${longueur - 2} 7 L${longueur - 10} 2.5 V11.5 Z"/><path class="pointe" d="M${longueur - 9} 7 L${longueur - 17} 2.5 V11.5 Z"/>`
    : `<path class="pointe" d="M${longueur - 2} 7 L${longueur - 10} 2.5 V11.5 Z"/>`;
  const fleche = `<path d="M2 7 H${longueur - (double ? 15 : 8)}"/>${pointes}`;
  return `<svg data-palier="${palier}" width="${longueur}" height="14" viewBox="0 0 ${longueur} 14" aria-hidden="true"><g class="cerne">${fleche}</g><g class="teinte">${fleche}</g></svg>`;
}

// La flèche montre où va le vent. `angle` : rotation de la vue en degrés, à donner
// seulement si le cadran doit suivre une vue tournée (0 : le nord reste en haut).
// `cardinaux` : les quatre points, seulement si le cadran est assez grand pour les lire.
export function cadranVent(flux, angle = 0, classe = '', cardinaux = false) {
  const attributFlux = Number.isFinite(flux) ? ` data-flux="${flux}"` : '';
  const graduations = (cardinaux ? [45, 135, 225, 315] : [45, 90, 135, 180, 225, 270, 315])
    .map((degres) => `<path d="M32 4.5V8" transform="rotate(${degres} 32 32)"/>`).join('');
  const points = cardinaux
    ? `<text x="32" y="10.5">N</text><text x="53.5" y="32">E</text><text x="32" y="53.5">S</text><text x="10.5" y="32">${t('cardinal.O')}</text>`
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


export const texteProvenance = (provenance) => {
  const code = codeCardinal(provenance);
  const cle = code === 'E' || code === 'O' ? 'vent.provenance-voyelle' : 'vent.provenance';
  return t(cle, { point: pointCardinal(provenance), degres: Math.round(provenance) });
};

// Bornes des paliers dans l'unité choisie : « < 10 », « 10–20 »… « 40+ » en km/h
export const libellesPaliersVent = () => {
  const bornes = PALIERS_VENT.map((limite) => valeurVent(limite));
  return [`< ${bornes[0]}`, ...bornes.slice(1).map((borne, i) => `${bornes[i]}–${borne}`), `${bornes.at(-1)}+`];
};
