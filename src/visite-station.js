import * as maplibregl from 'maplibre-gl';
import { etat, majCourbes } from './options-carte.js';
import { bloquerFiches } from './fiche.js';
import { retablirFond } from './fond-de-carte.js';
import { lire, ecrire } from './reglages.js';
import { SOURCE_VECTEUR } from './source-vecteur.js';

const SOURCE_PISTES = 'visite-pistes';
const SOURCE_MASQUE = 'visite-masque';
const COULEUR_NEIGE = '#f5f8fb';
const MARGE_ZONE_M = 3000; // autour des pistes, ce qu'on affiche et télécharge pendant la visite
const METRES_PAR_DEGRE = 111_320;
const POINTS_PAR_ARRONDI = 8;
// Chaque source globale a sa copie limitée à la zone de la station
const SOURCES_LIMITEES = {
  [SOURCE_VECTEUR]: 'visite-osm',
  ombrage: 'visite-ombrage',
  courbes: 'visite-courbes-source',
};
const POLICE = ['Open Sans Regular', 'Arial Unicode MS Regular'];
const INCLINAISON = 62;
const ZOOM_MIN = 11;
const ZOOM_MAX = 14.5;
const ZOOM_RAPPROCHE = 0.8; // l'inclinaison écrase le domaine : on peut cadrer plus près que le calcul
const ZOOM_RAPPROCHE_ETROIT = 0.1; // sur un écran étroit, ce serait couper le domaine sur les côtés
const ICONE_SOMMET = 'visite-sommet-icone';
const COUCHES_COURBES = ['visite-courbes', 'visite-courbes-altitude'];
const SOURCE_PENTES = 'visite-pentes';
const OPACITE_PENTES = 0.62;
const URL_PENTES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const TOLERANCE_CLIC_PX = 8;

const COULEURS_NIVEAUX = [
  'match',
  ['get', 'niveau'],
  'verte', '#1f9d55',
  'bleue', '#1f6fd6',
  'rouge', '#d92b2f',
  'noire', '#15181d',
  'freeride', '#e07b1a',
  '#6f7884',
];
const LIBELLES_NIVEAUX = {
  verte: 'Piste verte',
  bleue: 'Piste bleue',
  rouge: 'Piste rouge',
  noire: 'Piste noire',
  freeride: 'Itinéraire freeride',
};
const LIBELLES_REMONTEES = {
  chair_lift: 'Télésiège',
  gondola: 'Télécabine',
  mixed_lift: 'Remontée mixte',
  cable_car: 'Téléphérique',
  funicular: 'Funiculaire',
  railway: 'Train',
  't-bar': 'Téléski',
  'j-bar': 'Téléski',
  platter: 'Téléski',
  drag_lift: 'Téléski',
  rope_tow: 'Fil neige',
  magic_carpet: 'Tapis roulant',
};

const estLigne = ['==', ['geometry-type'], 'LineString'];
const estPiste = ['==', ['get', 'genre'], 'piste'];
const estRemontee = ['==', ['get', 'genre'], 'remontee'];
const estAlpin = ['==', ['get', 'usage'], 'alpin'];
const estFond = ['==', ['get', 'usage'], 'fond'];
const largeur = (bas, haut) => ['interpolate', ['linear'], ['zoom'], 10, bas, 16, haut];

// Petit triangle sombre posé sur chaque sommet
function creerIconeSommet() {
  const t = 18;
  const canvas = document.createElement('canvas');
  canvas.width = t;
  canvas.height = t;
  const g = canvas.getContext('2d');
  g.beginPath();
  g.moveTo(t / 2, 2);
  g.lineTo(t - 2, t - 3);
  g.lineTo(2, t - 3);
  g.closePath();
  g.fillStyle = '#3d4f66';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#ffffff';
  g.stroke();
  return g.getImageData(0, 0, t, t);
}

const filtreCommunes = (communes) => ['in', ['get', 'name'], ['literal', communes]];

// Paysage enneigé : ces calques recouvrent le fond choisi, qui reste intact en dessous
function calquesNeige(courbesVisibles, pentesVisibles) {
  const visibilite = courbesVisibles ? 'visible' : 'none';
  return [
    { id: 'visite-neige', type: 'background', paint: { 'background-color': COULEUR_NEIGE } },
    {
      id: 'visite-forets',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]],
      paint: { 'fill-color': '#8fa39a', 'fill-opacity': 0.5 },
    },
    {
      id: 'visite-eau',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'water',
      paint: { 'fill-color': '#d3e3ee' },
    },
    {
      id: 'visite-ombrage',
      type: 'hillshade',
      source: 'ombrage',
      paint: {
        'hillshade-exaggeration': 0.6,
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': '#a9bbd0',
        'hillshade-accent-color': '#c6d3e1',
        'hillshade-highlight-color': '#ffffff',
      },
    },
    {
      id: 'visite-pentes',
      type: 'raster',
      source: SOURCE_PENTES,
      layout: { visibility: pentesVisibles ? 'visible' : 'none' },
      paint: { 'raster-opacity': OPACITE_PENTES },
    },
    {
      id: 'visite-courbes',
      type: 'line',
      source: 'courbes',
      'source-layer': 'contours',
      layout: { visibility: visibilite },
      paint: {
        'line-color': '#56708f',
        'line-opacity': ['match', ['get', 'level'], 1, 0.7, 0.32],
        'line-width': ['match', ['get', 'level'], 1, 1, 0.5],
      },
    },
    {
      id: 'visite-batiments',
      type: 'fill',
      source: SOURCE_VECTEUR,
      'source-layer': 'building',
      minzoom: 13,
      paint: { 'fill-color': '#8d97a3', 'fill-opacity': 0.8 },
    },
    {
      id: 'visite-routes',
      type: 'line',
      source: SOURCE_VECTEUR,
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: { 'line-color': '#aab3bd', 'line-width': largeur(0.5, 2.5) },
    },
  ];
}

function calquesPistes(communes, courbesVisibles) {
  return [
    {
      id: 'visite-zones',
      type: 'fill',
      source: SOURCE_PISTES,
      filter: ['all', ['==', ['geometry-type'], 'Polygon'], estPiste],
      paint: { 'fill-color': COULEURS_NIVEAUX, 'fill-opacity': 0.28 },
    },
    {
      id: 'visite-fond',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estFond],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#0b8f9c', 'line-width': largeur(1, 3), 'line-dasharray': [1.5, 1.5] },
    },
    {
      id: 'visite-alpin-halo',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estAlpin],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': largeur(3.5, 8) },
    },
    {
      id: 'visite-alpin',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estPiste, estAlpin],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COULEURS_NIVEAUX, 'line-width': largeur(2, 5) },
    },
    {
      id: 'visite-remontees-halo',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estRemontee],
      paint: { 'line-color': '#ffffff', 'line-width': largeur(2.5, 5) },
    },
    {
      id: 'visite-remontees',
      type: 'line',
      source: SOURCE_PISTES,
      filter: ['all', estLigne, estRemontee],
      paint: { 'line-color': '#2b2f36', 'line-width': largeur(1, 2.2) },
    },
    {
      id: 'visite-courbes-altitude',
      type: 'symbol',
      source: 'courbes',
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['>=', ['get', 'level'], 1],
      layout: {
        visibility: courbesVisibles ? 'visible' : 'none',
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['concat', ['number-format', ['get', 'ele'], { 'max-fraction-digits': 0 }], ' m'],
        'text-font': POLICE,
        'text-size': 10,
      },
      paint: { 'text-color': '#4c6583', 'text-halo-color': '#ffffff', 'text-halo-width': 1.3 },
    },
    {
      id: 'visite-hameaux',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      minzoom: 13,
      filter: ['==', ['get', 'class'], 'hamlet'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 11,
        'text-max-width': 8,
        'text-padding': 8,
      },
      paint: { 'text-color': '#3e5068', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
    },
    {
      id: 'visite-sommets',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'mountain_peak',
      minzoom: 10.5,
      filter: ['all', ['has', 'name'], ['!=', ['get', 'class'], 'saddle']],
      layout: {
        'icon-image': ICONE_SOMMET,
        'icon-anchor': 'bottom',
        'text-field': [
          'case',
          ['has', 'ele'],
          ['concat', ['coalesce', ['get', 'name:fr'], ['get', 'name']], '\n', ['get', 'ele'], ' m'],
          ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        ],
        'text-font': POLICE,
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.15],
        'text-padding': 8,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99], // les plus remarquables d'abord
      },
      paint: { 'text-color': '#3d4f66', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
    {
      id: 'visite-lieux',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb']]],
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 12,
        'text-max-width': 8,
        'text-padding': 10,
        'symbol-sort-key': ['to-number', ['get', 'rank'], 99],
      },
      paint: { 'text-color': '#27384d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    {
      // Les communes de la station passent avant les autres noms, et en plus grand
      id: 'visite-communes',
      type: 'symbol',
      source: SOURCE_VECTEUR,
      'source-layer': 'place',
      filter: filtreCommunes(communes),
      layout: {
        'text-field': ['coalesce', ['get', 'name:fr'], ['get', 'name']],
        'text-font': POLICE,
        'text-size': 15,
        'text-max-width': 9,
        'text-allow-overlap': false,
      },
      paint: { 'text-color': '#0f1b2c', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
    },
    {
      id: 'visite-noms',
      type: 'symbol',
      source: SOURCE_PISTES,
      minzoom: 12.5,
      filter: ['all', estLigne, ['has', 'nom']],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['get', 'nom'],
        'text-font': POLICE,
        'text-size': 11,
      },
      paint: { 'text-color': '#1c2530', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
  ];
}

const COUCHES_CLIQUABLES = ['visite-remontees', 'visite-alpin', 'visite-fond', 'visite-zones'];

function contenuInfos(p) {
  const contenu = document.createElement('div');
  contenu.className = 'rando-resume-repere';
  const type =
    p.genre === 'remontee'
      ? LIBELLES_REMONTEES[p.type] || 'Remontée'
      : p.usage === 'fond'
        ? 'Piste de ski de fond'
        : LIBELLES_NIVEAUX[p.niveau] || 'Piste';
  const titre = document.createElement('strong');
  titre.className = 'rando-resume-titre';
  titre.textContent = p.nom || type;
  contenu.append(titre);
  const stats = document.createElement('div');
  stats.className = 'rando-resume-stats';
  const ajouter = (libelle, valeur) => {
    const ligne = document.createElement('div');
    ligne.className = 'rando-resume-ligne';
    const texte = document.createElement('span');
    texte.textContent = libelle;
    const fort = document.createElement('strong');
    fort.textContent = valeur;
    ligne.append(texte, fort);
    stats.append(ligne);
  };
  if (p.nom) ajouter('Type', type);
  if (p.longueur) ajouter('Longueur', `${Math.round(p.longueur).toLocaleString('fr-FR')} m`);
  if (p.denivele) ajouter('Dénivelé', `${Math.round(p.denivele).toLocaleString('fr-FR')} m`);
  if (stats.children.length) contenu.append(stats);
  return contenu;
}

function limitesDe(features) {
  const limites = new maplibregl.LngLatBounds();
  for (const { geometry } of features) {
    const lignes = geometry.type === 'Polygon' ? geometry.coordinates : [geometry.coordinates];
    for (const ligne of lignes) for (const point of ligne) limites.extend(point);
  }
  return limites;
}

// Zone de la visite : le cadre des pistes, agrandi de la marge et aux coins arrondis
function zoneDe(limites) {
  const margeLat = MARGE_ZONE_M / METRES_PAR_DEGRE;
  const margeLng = margeLat / Math.cos((limites.getCenter().lat * Math.PI) / 180);
  const [ouest, sud, est, nord] = limites.toArray().flat();
  const coins = [
    [est, nord, 0],
    [ouest, nord, 90],
    [ouest, sud, 180],
    [est, sud, 270],
  ];
  const contour = coins.flatMap(([lng, lat, depart]) =>
    Array.from({ length: POINTS_PAR_ARRONDI + 1 }, (_, i) => {
      const angle = ((depart + (90 * i) / POINTS_PAR_ARRONDI) * Math.PI) / 180;
      return [lng + Math.cos(angle) * margeLng, lat + Math.sin(angle) * margeLat];
    }));
  contour.push(contour[0]);
  return {
    contour,
    cadre: [ouest - margeLng, sud - margeLat, est + margeLng, nord + margeLat],
  };
}

// Le blanc recouvre le monde sauf la zone ; le trait flouté adoucit la frontière
function donneesMasque(contour) {
  const monde = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [monde, contour] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: contour } },
    ],
  };
}

function calquesMasque() {
  return [
    {
      id: 'visite-masque',
      type: 'fill',
      source: SOURCE_MASQUE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': COULEUR_NEIGE },
    },
    {
      id: 'visite-masque-bord',
      type: 'line',
      source: SOURCE_MASQUE,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': COULEUR_NEIGE, 'line-width': 46, 'line-blur': 34 },
    },
  ];
}

export function creerVisiteStation(map) {
  let enCours = null; // { vue, etaitEn3D, communes, calquesMasques, cadre, reliefCoupe }
  let idsCalques = [];
  let popup = null;
  let courbesVisibles = lire('visite-courbes', true);
  let pentesVisibles = lire('visite-pentes', false);

  function fermerPopup() {
    if (popup) popup.remove();
    popup = null;
  }

  function surClic(event) {
    fermerPopup();
    const { x, y } = event.point;
    const boite = [
      [x - TOLERANCE_CLIC_PX, y - TOLERANCE_CLIC_PX],
      [x + TOLERANCE_CLIC_PX, y + TOLERANCE_CLIC_PX],
    ];
    const [objet] = map.queryRenderedFeatures(boite, { layers: COUCHES_CLIQUABLES });
    if (!objet) return;
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 8 })
      .setLngLat(event.lngLat)
      .setDOMContent(contenuInfos(objet.properties))
      .addTo(map);
  }

  function surSurvol(event) {
    const { x, y } = event.point;
    const boite = [
      [x - TOLERANCE_CLIC_PX, y - TOLERANCE_CLIC_PX],
      [x + TOLERANCE_CLIC_PX, y + TOLERANCE_CLIC_PX],
    ];
    const surObjet = map.queryRenderedFeatures(boite, { layers: COUCHES_CLIQUABLES }).length > 0;
    map.getCanvas().style.cursor = surObjet ? 'pointer' : '';
  }

  function copierSourceLimitee(idSource, cadre) {
    const source = map.getSource(idSource);
    const options = {
      type: source.type,
      tiles: source.tiles,
      minzoom: source.minzoom,
      maxzoom: source.maxzoom,
      bounds: cadre,
    };
    if (source.attribution) options.attribution = source.attribution;
    if (source.type === 'raster-dem') Object.assign(options, { tileSize: source.tileSize, encoding: source.encoding });
    map.addSource(SOURCES_LIMITEES[idSource], options);
  }

  // Toutes les sources de la visite s'arrêtent au cadre de la station : hors de la zone,
  // aucune tuile n'est demandée. Elles sont retirées avec leurs calques, ce qui évite aussi
  // de réutiliser d'anciennes tuiles (cause d'un plantage du placement des textes).
  function creerCalques(donnees, communes) {
    if (!map.hasImage(ICONE_SOMMET)) map.addImage(ICONE_SOMMET, creerIconeSommet(), { pixelRatio: 2 });
    const { contour, cadre } = zoneDe(limitesDe(donnees.features));
    Object.keys(SOURCES_LIMITEES).forEach((id) => copierSourceLimitee(id, cadre));
    map.addSource(SOURCE_PENTES, {
      type: 'raster',
      tiles: [URL_PENTES],
      tileSize: 256,
      maxzoom: 17,
      bounds: cadre,
      attribution: 'Pentes : © IGN',
    });
    map.addSource(SOURCE_MASQUE, { type: 'geojson', data: donneesMasque(contour) });
    map.addSource(SOURCE_PISTES, {
      type: 'geojson',
      data: donnees,
      attribution: 'Pistes : <a href="https://openskidata.org" target="_blank">OpenSkiData</a> (ODbL), © contributeurs OpenStreetMap',
    });

    const dansZone = ['within', { type: 'Polygon', coordinates: [contour] }];
    const calques = [
      ...calquesNeige(courbesVisibles, pentesVisibles),
      ...calquesMasque(),
      ...calquesPistes(communes, courbesVisibles),
    ].map((calque) => {
      const source = SOURCES_LIMITEES[calque.source];
      if (!source) return calque;
      const limite = { ...calque, source };
      // Les noms de lieux et de sommets passent au-dessus du masque : on les filtre aussi
      if (calque.type === 'symbol') limite.filter = calque.filter ? ['all', calque.filter, dansZone] : dansZone;
      return limite;
    });
    calques.forEach((calque) => map.addLayer(calque));
    idsCalques = calques.map(({ id }) => id);
    enCours.cadre = cadre;
  }

  function retirerCalques() {
    idsCalques.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    idsCalques = [];
    [...Object.values(SOURCES_LIMITEES), SOURCE_PENTES, SOURCE_MASQUE, SOURCE_PISTES].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });
  }

  // Sous le blanc, la carte normale continuerait à télécharger ses tuiles : on la coupe
  function masquerCarte() {
    enCours.calquesMasques = map.getStyle().layers
      .filter(({ id, layout }) => !id.startsWith('visite-') && layout?.visibility !== 'none')
      .map(({ id }) => id);
    enCours.calquesMasques.forEach((id) => map.setLayoutProperty(id, 'visibility', 'none'));
  }

  function reafficherCarte(calquesMasques) {
    calquesMasques.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible'); });
    retablirFond(map); // le fond a pu changer pendant la visite : seul le choix actuel doit rester visible
    majCourbes(map);
  }

  // Le relief 3D ne sert à rien hors de la zone, tout y est blanc : on arrête ses téléchargements
  function ajusterRelief() {
    if (!enCours?.cadre) return;
    const [ouest, sud, est, nord] = enCours.cadre;
    const vue = map.getBounds();
    const zoneVisible = vue.getWest() < est && vue.getEast() > ouest && vue.getSouth() < nord && vue.getNorth() > sud;
    if (!zoneVisible && !enCours.reliefCoupe) {
      enCours.reliefCoupe = true;
      map.setTerrain(null);
    } else if (zoneVisible && enCours.reliefCoupe) {
      enCours.reliefCoupe = false;
      etat.majTerrain();
    }
  }

  // Charge les pistes avant de toucher à la carte : en cas d'échec, rien n'a changé
  async function charger(idStation) {
    const reponse = await fetch(new URL(`/data/pistes/${idStation}.json`, window.location.origin).href);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    return reponse.json();
  }

  // Une nouvelle station pendant une visite remplace juste sa zone : quitter ramènera
  // toujours à la vue d'avant la première visite
  function demarrer(donnees) {
    const communes = donnees.communes || [];
    if (enCours) {
      fermerPopup();
      enCours.communes = communes;
      retirerCalques();
      creerCalques(donnees, communes);
    } else {
      enCours = {
        vue: { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
        etaitEn3D: !!etat.mode3D,
        communes,
      };
      bloquerFiches(true);
      if (!etat.mode3D) etat.basculerMode();

      masquerCarte();
      creerCalques(donnees, communes);
      map.on('click', surClic);
      map.on('mousemove', surSurvol);
      map.on('moveend', ajusterRelief);
    }

    const etroit = map.getContainer().clientWidth <= 640;
    const limites = limitesDe(donnees.features);
    const camera = map.cameraForBounds(limites, {
      padding: etroit
        ? { top: 90, bottom: 90, left: 24, right: 24 }
        : { top: 110, bottom: 110, left: 50, right: 50 },
      bearing: donnees.cap,
      pitch: INCLINAISON,
    });
    const rapproche = etroit ? ZOOM_RAPPROCHE_ETROIT : ZOOM_RAPPROCHE;
    map.flyTo({
      center: camera?.center ?? limites.getCenter(),
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (camera?.zoom ?? ZOOM_MIN) + rapproche)),
      bearing: donnees.cap,
      pitch: INCLINAISON,
      duration: 2600,
      essential: true,
    });
  }

  function quitter({ restaurer = true } = {}) {
    if (!enCours) return;
    const { vue, etaitEn3D, calquesMasques, reliefCoupe } = enCours;
    enCours = null;
    fermerPopup();
    map.off('click', surClic);
    map.off('mousemove', surSurvol);
    map.off('moveend', ajusterRelief);
    map.getCanvas().style.cursor = '';
    retirerCalques();
    reafficherCarte(calquesMasques);
    bloquerFiches(false);
    if (reliefCoupe) etat.majTerrain();
    if (!etaitEn3D && etat.mode3D) etat.basculerMode();
    if (restaurer) map.flyTo({ ...vue, pitch: etaitEn3D ? vue.pitch : 0, duration: 1200, essential: true });
  }

  function afficherCourbes(visibles) {
    courbesVisibles = visibles;
    ecrire('visite-courbes', visibles);
    if (!enCours) return;
    for (const id of COUCHES_COURBES) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibles ? 'visible' : 'none');
    }
  }

  function afficherPentes(visibles) {
    pentesVisibles = visibles;
    ecrire('visite-pentes', visibles);
    if (enCours && map.getLayer('visite-pentes')) {
      map.setLayoutProperty('visite-pentes', 'visibility', visibles ? 'visible' : 'none');
    }
  }

  return {
    charger,
    demarrer,
    quitter,
    afficherCourbes,
    afficherPentes,
    courbesVisibles: () => courbesVisibles,
    pentesVisibles: () => pentesVisibles,
    communes: () => enCours?.communes ?? [],
  };
}
