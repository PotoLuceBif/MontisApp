import { SOURCE_VECTEUR, assurerSourceVecteur } from './source-vecteur.js';
import { peindreCoucheFond } from './fond-palette.js';
import { etat } from './options-carte.js';
import { COUCHES_BATIMENTS, nomsAuDessusDesBatiments } from './style-montis.js';

const [MURS, ARETE, TOIT] = COUCHES_BATIMENTS;
// Dès le zoom 13 (demande du propriétaire du 25 novembre 2026) : ces tuiles n'ont pas encore la hauteur, les
// bâtiments y sont bas (6 m) et prennent leur vraie taille avec les tuiles du zoom 14
const ZOOM_MIN = 13;
const HAUTEUR = ['to-number', ['get', 'render_height'], 6];
// Toujours à leur vraie hauteur ; `d` : mètres au-dessus des murs. Ils montaient avec le zoom (de 0 au zoom 13,5 à
// leur taille au zoom 15,5) et grandissaient ou s'écrasaient à chaque cran (retour du propriétaire du 25 novembre
// 2026) : ils apparaissent maintenant en fondu (OPACITE)
const monte = (d) => ['+', HAUTEUR, d];
const OPACITE = ['interpolate', ['linear'], ['zoom'], ZOOM_MIN, 0, ZOOM_MIN + 0.6, 0.95];
// Nuance d'un bâtiment à l'autre, d'après son identifiant (stable d'une tuile à l'autre)
const nuance = (...couleurs) => ['match', ['%', ['to-number', ['id'], 0], couleurs.length], ...couleurs.slice(0, -1).flatMap((c, i) => [i, c]), couleurs.at(-1)];

// Comme sur les cartes 3D des grandes applis : murs gris lavande nuancés, plus sombres en hauteur, toits clairs,
// et une arête plus foncée au bord du toit. MapLibre ne trace pas d'arêtes : une fine dalle (ARETE) coiffe
// les murs, et le toit (TOIT) la recouvre, de sorte que seul son flanc se voit, comme un trait.
// La nuit (fond-palette.js), murs sombres et arête néon. Sous le zoom 14, les tuiles n'ont pas la hauteur :
// d'où la valeur de repli de HAUTEUR (sans elle, la couleur échouait et virait au noir).
// Les couleurs d'OpenStreetMap (building:colour) ne sont plus suivies : jaunes et rouges vifs, elles juraient
// avec la DA (17 novembre 2026). Pas de motif de façade : MapLibre le pose aussi sur les toits.
const MURS_JOUR = [
  'interpolate', ['linear'], HAUTEUR,
  0, nuance('#b9b3c4', '#c1bcc8', '#b4afbd'),
  40, nuance('#a49db2', '#ada8b8', '#9f99ab'),
  120, '#8f879f',
];
const TOITS_JOUR = nuance('#ebe8f0', '#e3e0e9', '#eeeae6', '#e7e5ec');
const ARETE_JOUR = '#6f6880';
const EPAISSEUR_ARETE = 0.7; // m
const EPAISSEUR_TOIT = 0.1;

function couche(id, couleur, base, haut, degrade) {
  return {
    id,
    source: SOURCE_VECTEUR,
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: ZOOM_MIN,
    layout: { visibility: 'none' },
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': couleur,
      'fill-extrusion-base': base,
      'fill-extrusion-height': haut,
      'fill-extrusion-opacity': OPACITE,
      'fill-extrusion-vertical-gradient': degrade,
    },
  };
}

export function afficherBatiments(map, visible) {
  assurerSourceVecteur(map);

  if (!map.getLayer(MURS)) {
    map.addLayer(couche(MURS, MURS_JOUR, ['to-number', ['get', 'render_min_height'], 0], monte(0), true));
    map.addLayer(couche(ARETE, ARETE_JOUR, monte(0), monte(EPAISSEUR_ARETE), false));
    map.addLayer(couche(TOIT, TOITS_JOUR, monte(EPAISSEUR_ARETE), monte(EPAISSEUR_ARETE + EPAISSEUR_TOIT), false));
    // Lumière un peu plus forte que celle de MapLibre (0,5) : les faces des murs se distinguent mieux
    map.setLight({ ...map.getLight(), intensity: 0.6 });
    for (const id of COUCHES_BATIMENTS) peindreCoucheFond(map, id);
    if (etat.fond !== 'national') nomsAuDessusDesBatiments(map);
  }

  for (const id of COUCHES_BATIMENTS) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}
