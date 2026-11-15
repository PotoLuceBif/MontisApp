// Fond Montis de jour ou de nuit. Le jour est le style lui-même (style-montis.js) ; la nuit le repeint couche
// par couche, dans l'esprit du thème cyberpunk : fond bleu nuit, routes « laser », eau cyan.
// Mode Auto (par défaut) : nuit dès que le soleil est couché au centre de la carte.
// La nuit ne s'applique qu'au fond Montis seul : une carte nationale ou un autre fond reste de jour.
import { lire, ecrire } from './reglages.js';
import { SOMMET_NUIT, texteSommetMontis } from './style-montis.js';
import { etat } from './options-carte.js';
import { hauteurSoleil, pointSubsolaire } from './globe-nuit-calcul.js';

export const MODES_FOND = ['auto', 'jour', 'nuit'];
const COUCHER = -0.833; // ° : hauteur du soleil au coucher (réfraction et rayon du disque)
const VERIFICATION = 60000; // ms : en Auto, la nuit tombe sans qu'on touche la carte

const classeRoute = (couleurs) => ['match', ['get', 'class'], ...Object.entries(couleurs).flat(), couleurs.minor];
const ROUTES_NUIT = {
  motorway: '#ff4fd8', trunk: '#e65cff', primary: '#c77bff', secondary: '#9a86ff', tertiary: '#7a74c4', minor: '#59607a', service: '#474d63',
};
const TEXTE_NUIT = { 'text-color': '#dfe9f7', 'text-halo-color': '#0b111b', 'text-halo-width': 1.5 };

const EAU_NUIT = { ...TEXTE_NUIT, 'text-color': '#7fdcf5' };

// Couche → propriétés de nuit. Les couches absentes (éléments jamais allumés) sont ignorées.
const NUIT = {
  'montis-background': { 'background-color': '#0c1320' },
  'montis-landuse': { 'fill-color': '#12271f', 'fill-opacity': 0.7 },
  'montis-landcover': {
    'fill-color': [
      'match', ['get', 'class'],
      ['wood', 'forest'], '#103526',
      ['grass', 'scrub'], ['match', ['get', 'subclass'], ['meadow', 'grassland'], '#18291f', ['scrub', 'heath'], '#16261c', '#14241f'],
      ['ice', 'snow'], '#1b2a3b',
      'rock', '#1b1f2a',
      'sand', '#28251f',
      'wetland', '#122a30',
      '#14241f',
    ],
  },
  'montis-rochers': {
    'fill-pattern': ['match', ['get', 'subclass'], ['scree', 'shingle'], 'montis-motif-eboulis-nuit', 'montis-motif-rocher-nuit'],
  },
  'montis-zones-humides': { 'fill-pattern': 'montis-motif-humide-nuit' },
  'montis-relief': {
    'hillshade-shadow-color': ['rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.25)'],
    'hillshade-highlight-color': ['rgba(140, 170, 255, 0.16)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'],
  },
  'montis-glaciers-voile': { 'fill-color': '#1b2a3b', 'fill-opacity': 0.45 },
  'montis-glaciers-bord': { 'line-color': '#3fc6ef', 'line-opacity': 0.9 },
  'montis-water': { 'fill-color': '#0d3550' },
  'montis-waterway': { 'line-color': '#22b8e6' },
  'montis-boundary': { 'line-color': '#8b74b8' },
  'montis-building': { 'fill-color': '#2a303c', 'fill-opacity': 0.9 },
  // Routes : un halo flou de la couleur de la route, puis le trait
  'montis-road-casing': {
    'line-color': classeRoute(ROUTES_NUIT),
    'line-opacity': ['case', ['==', ['get', 'brunnel'], 'tunnel'], 0.12, 0.35],
    'line-blur': ['interpolate', ['linear'], ['zoom'], 8, 1, 15, 4],
  },
  'montis-road': { 'line-color': classeRoute(ROUTES_NUIT) },
  'montis-tunnels': { 'line-color': classeRoute(ROUTES_NUIT), 'line-opacity': 0.45 },
  'montis-chemins': { 'line-color': '#8f86a8' },
  'montis-sentiers-lisere': { 'line-color': '#ff6b5a', 'line-opacity': 0.18, 'line-blur': 2 },
  'montis-path': { 'line-color': ['match', ['get', 'subclass'], ['footway', 'pedestrian', 'sidewalk'], '#5d6378', '#ff6b5a'] },
  'montis-marches': { 'line-color': '#ff9d8f' },
  'montis-rail': { 'line-color': '#6d7390' },
  'montis-rail-tirets': { 'line-color': '#0c1320' },
  'montis-remontees': { 'line-color': '#e8ecff', 'line-opacity': 0.75 },
  'montis-remontees-pylones': { 'line-color': '#e8ecff', 'line-opacity': 0.75 },
  // Élément Eaux (allumé par défaut) : cyan du logo, comme l'eau du fond
  'nature-lacs': { 'fill-color': '#0f4a6e' },
  'nature-lacs-bord': { 'line-color': '#3fc6ef' },
  'nature-rivieres': { 'line-color': '#22b8e6' },
  'nature-rivieres-temporaires': { 'line-color': '#22b8e6' },
  'montis-place': TEXTE_NUIT,
  'montis-summit': { ...TEXTE_NUIT, 'text-color': SOMMET_NUIT.nom, 'icon-color': SOMMET_NUIT.accent, 'icon-halo-color': '#0b111b' },
  'montis-eau-noms-ligne': EAU_NUIT,
  'montis-eau-noms-point': EAU_NUIT,
  'montis-rivieres-noms': EAU_NUIT,
  courbes: { 'line-color': ['case', ['>=', ['get', 'level'], 1], '#6f6194', '#4c4568'], 'line-opacity': ['case', ['>=', ['get', 'level'], 1], 0.85, 0.6] },
  'courbes-altitude': { 'text-color': '#a898d0', 'text-halo-color': '#0b111b' },
  'batiments-3d': {
    'fill-extrusion-color': ['interpolate', ['linear'], ['to-number', ['get', 'render_height'], 6], 0, '#3a404c', 30, '#4a5160', 100, '#5d6575'],
  },
};
// Noms des éléments de la carte (lacs, rivières, parcs, villes, refuges, sommets) : texte clair, halo sombre
const NOMS_ELEMENTS = /^(nature-.*noms|lieux|villes|refuges|sommets)/;
const LASER = ['montis-batiments-lueur', 'montis-batiments-contour'];

let nuitActive = false;
const jour = new Map(); // `${couche}|${propriété}` → valeur de jour, gardée pour revenir

const proprietesNuit = (map, id) => {
  if (NUIT[id]) return NUIT[id];
  return NOMS_ELEMENTS.test(id) && map.getLayer(id)?.type === 'symbol' ? TEXTE_NUIT : null;
};

function peindre(map, id, nuit) {
  const props = proprietesNuit(map, id);
  if (!props || !map.getLayer(id)) return;
  for (const [nom, valeur] of Object.entries(props)) {
    const cle = `${id}|${nom}`;
    if (nuit) {
      if (!jour.has(cle)) jour.set(cle, map.getPaintProperty(id, nom));
      map.setPaintProperty(id, nom, valeur);
    } else if (jour.has(cle)) {
      map.setPaintProperty(id, nom, jour.get(cle));
      jour.delete(cle);
    }
  }
  // L'altitude des sommets a sa couleur dans le texte lui-même (disposition, pas peinture)
  if (id === 'montis-summit') map.setLayoutProperty(id, 'text-field', texteSommetMontis(nuit));
}

export const modeFond = () => (MODES_FOND.includes(lire('fond-montis-mode', 'auto')) ? lire('fond-montis-mode', 'auto') : 'auto');

export function soleilCoucheIci(map, date = new Date()) {
  const { lat, lng } = map.getCenter();
  return hauteurSoleil(lat, lng, pointSubsolaire(date)) < COUCHER;
}

// Une couche ajoutée plus tard (élément de la carte, bâtiments 3D) prend la palette en cours
export function peindreCoucheFond(map, id) {
  if (nuitActive) peindre(map, id, true);
}

export const fondDeNuit = () => nuitActive;

export function initPaletteFond(map) {
  function majLaser() {
    const visible = nuitActive && lire('batiments', true);
    for (const id of LASER) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }

  function maj() {
    const mode = modeFond();
    const nuit = etat.fond === 'montis' && (mode === 'nuit' || (mode === 'auto' && soleilCoucheIci(map)));
    if (nuit !== nuitActive) {
      nuitActive = nuit;
      const ids = new Set([...Object.keys(NUIT), ...map.getStyle().layers.map(({ id }) => id).filter((id) => NOMS_ELEMENTS.test(id))]);
      for (const id of ids) peindre(map, id, nuit);
      window.dispatchEvent(new CustomEvent('montis:fond-nuit', { detail: { nuit } }));
    }
    majLaser();
  }

  etat.majPaletteFond = maj;
  map.on('moveend', () => { if (modeFond() === 'auto') maj(); });
  setInterval(() => { if (modeFond() === 'auto') maj(); }, VERIFICATION);
  window.addEventListener('calque', (e) => { if (e.detail.cle === 'batiments') majLaser(); });
  maj();
}

export function choisirModeFond(mode) {
  ecrire('fond-montis-mode', mode);
  etat.majPaletteFond?.();
}
