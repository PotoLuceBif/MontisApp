import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import mlcontour from 'maplibre-contour';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { initMenu } from './menu.js';
import { etat, majCourbes, majOmbrage, peintureCotes, peintureCourbes } from './options-carte.js';
import { lire, ecrire, marquerPrete } from './reglages.js';
import { doitCentrerSurPosition } from './ouverture-calcul.js';
import { ouvrirLienRecu, vueDemandee } from './partage.js';
import { retablirFond } from './fond-de-carte.js';
import { initPaletteFond } from './fond-palette.js';
import { initRecherche } from './recherche.js';
import { initFiches } from './fiche.js';
import { initBasculeMode } from './bascule-mode.js';
import { appliquerApparence } from './apparence.js';
import { STYLE_MONTIS, exagerationReliefMontis, ajouterMotifsMontis } from './style-montis.js';
import { suivreDescriptionFond } from './source-vecteur.js';
import { initEchelleCarte } from './echelle-carte.js';
import { initHorsLigne } from './hors-ligne.js';
import { initGlobeNuit } from './globe-nuit.js';
import { initAtmosphere } from './globe-atmosphere.js';
import { initCiel } from './ciel.js';
import { surPreferences } from './preferences.js';
import { surLangue, t } from './i18n.js';
import { imperial, expressionAltitude, PIEDS } from './unites.js';


maplibregl.setWorkerUrl(maplibreWorkerUrl);
appliquerApparence();

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

function localeCarte() {
  return {
    'NavigationControl.ZoomIn': t('carte.zoom-plus'),
    'NavigationControl.ZoomOut': t('carte.zoom-moins'),
    'NavigationControl.ResetBearing': t('carte.nord'),
    'GeolocateControl.FindMyLocation': t('carte.position'),
    'GeolocateControl.LocationNotAvailable': t('carte.position-indisponible'),
    'AttributionControl.ToggleAttribution': t('carte.attribution'),
  };
}

// Source des courbes de niveau, calculées à partir des altitudes
const demSource = new mlcontour.DemSource({
  url: DEM_URL,
  encoding: 'terrarium',
  maxzoom: 13,
  worker: false,
});
demSource.setupMaplibre(maplibregl);

const map = new maplibregl.Map({
  container: 'map',
  attributionControl: { compact: true },
  style: {
    ...STYLE_MONTIS,
    sources: {
      ...STYLE_MONTIS.sources,
      relief: {
        type: 'raster-dem',
        tiles: [DEM_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
        attribution: t('carte.relief-attribution'),
      },
      ombrage: {
        type: 'raster-dem',
        tiles: [DEM_URL],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      },
    },
    layers: [
      ...STYLE_MONTIS.layers,
      {
        id: 'ombrage',
        type: 'hillshade',
        source: 'ombrage',
        layout: { visibility: 'none' },
        paint: {
          'hillshade-exaggeration': 0.5,
          // Les ombres restent, mais plus d'éclaircie blanche sur la carte
          'hillshade-highlight-color': 'rgba(255, 255, 255, 0)',
        },
      },
    ],
  },
  center: [6.87, 45.88], // massif du Mont-Blanc (longitude, latitude)
  zoom: 11.5,
  maxPitch: 85,
  locale: localeCarte(),
});

// Boutons de MapLibre (zoom, boussole, position) : leurs libellés se posent à la création,
// on les réécrit donc nous-mêmes au changement de langue
surLangue(() => {
  const libelles = {
    '.maplibregl-ctrl-zoom-in': 'carte.zoom-plus',
    '.maplibregl-ctrl-zoom-out': 'carte.zoom-moins',
    '.maplibregl-ctrl-compass': 'carte.nord',
    '.maplibregl-ctrl-geolocate': 'carte.position',
    '.maplibregl-ctrl-attrib-button': 'carte.attribution',
  };
  for (const [selecteur, cle] of Object.entries(libelles)) {
    map.getContainer().querySelectorAll(selecteur).forEach((bouton) => {
      bouton.title = t(cle);
      bouton.setAttribute('aria-label', t(cle));
    });
  }
});

map.once('load', () => {
  const attribution = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (attribution instanceof HTMLDetailsElement) attribution.open = false;
});

if (import.meta.env.DEV) window.map = map;
suivreDescriptionFond(map);

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
initBasculeMode();
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: true,
    fitBoundsOptions: { maxZoom: 15 },
  }),
  'top-right'
);
const echelle = new maplibregl.ScaleControl({ maxWidth: 120, unit: imperial() ? 'imperial' : 'metric' });
map.addControl(echelle, 'bottom-left');
initEchelleCarte(map);

// ===== Mémoire de la position de la carte =====
const vueSauvee = lire('vue', null);

const vueSauveeValide =
  vueSauvee &&
  Number.isFinite(vueSauvee.lng) &&
  Number.isFinite(vueSauvee.lat) &&
  Math.abs(vueSauvee.lng) <= 180 &&
  Number.isFinite(vueSauvee.zoom) &&
  vueSauvee.zoom >= 0 &&
  vueSauvee.zoom <= 22 &&
  Math.abs(vueSauvee.lat) <= 90 &&
  Number.isFinite(vueSauvee.bearing ?? 0) &&
  Number.isFinite(vueSauvee.pitch ?? 0) &&
  (vueSauvee.pitch ?? 0) >= 0 &&
  (vueSauvee.pitch ?? 0) <= 85;

// Lien partagé (vue ou point) : il passe avant la dernière vue et la position
const lien = vueDemandee();
if (lien) {
  map.jumpTo({ center: [lien.lng, lien.lat], zoom: lien.zoom, bearing: lien.bearing ?? 0, pitch: lien.pitch ?? 0 });
  if (lien.type === 'vue') {
    ecrire('mode3D', lien.mode3D);
    if (lien.fond) ecrire('fond', lien.fond);
  }
} else if (vueSauveeValide) {
  map.jumpTo({
    center: [vueSauvee.lng, vueSauvee.lat],
    zoom: vueSauvee.zoom,
    bearing: vueSauvee.bearing ?? 0,
    pitch: vueSauvee.pitch ?? 0,
  });
} else if (vueSauvee) {
  console.warn('Vue de carte sauvegardée invalide : la position par défaut sera utilisée.');
}

// ===== Ouverture sur sa position (premier lancement, ou après une absence) =====
const ZOOM_POSITION = 12;
let carteTouchee = false;
map.on('movestart', (event) => {
  if (event.originalEvent) carteTouchee = true;
});

function centrerSurPosition() {
  if (!('geolocation' in navigator)) return;
  carteTouchee = false;
  navigator.geolocation.getCurrentPosition(
    // Si l'on a déjà bougé la carte en attendant, on ne la reprend pas
    ({ coords }) => {
      if (carteTouchee) return;
      map.jumpTo({ center: [coords.longitude, coords.latitude], zoom: ZOOM_POSITION });
    },
    // Refus ou échec : la dernière vue reste, sinon la position par défaut
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
  );
}

const noterVisite = () => ecrire('derniere-visite', Date.now());
if (!lien && doitCentrerSurPosition({ vueSauvee: vueSauveeValide ? vueSauvee : null, derniereVisite: lire('derniere-visite', null), maintenant: Date.now() })) {
  centrerSurPosition();
}
noterVisite();
// Une appli installée reste souvent en mémoire : la retrouver après une absence vaut une ouverture
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    noterVisite();
    return;
  }
  if (doitCentrerSurPosition({ vueSauvee: true, derniereVisite: lire('derniere-visite', null), maintenant: Date.now() })) {
    centrerSurPosition();
  }
  noterVisite();
});
window.addEventListener('pagehide', noterVisite);

map.on('moveend', () => {
  const c = map.getCenter();
  ecrire('vue', {
    lng: Math.round(c.lng * 1e5) / 1e5,
    lat: Math.round(c.lat * 1e5) / 1e5,
    zoom: Math.round(map.getZoom() * 100) / 100,
    bearing: Math.round(map.getBearing()),
    pitch: Math.round(map.getPitch()),
  });
});

// ===== Bouton 2D / 3D =====
const ZOOM_RELIEF_MIN = 9; // en dessous, projection globe : on coupe le relief 3D
let terrainActif = false;

function majTerrain() {
  const veut = etat.mode3D && map.getZoom() >= ZOOM_RELIEF_MIN;
  if (veut) {
    map.setTerrain({ source: 'relief', exaggeration: etat.exageration ?? 1.2 });
  } else if (terrainActif) {
    map.setTerrain(null);
  }
  terrainActif = veut;
}
etat.majTerrain = majTerrain;

map.on('zoomend', () => {
  const veut = etat.mode3D && map.getZoom() >= ZOOM_RELIEF_MIN;
  if (veut !== terrainActif) majTerrain();
});

// Près des pôles, les tuiles de relief sont très étirées : l'ombrage fixe de la 3D y fait des taches et des
// traînées, que MapLibre étire encore jusqu'au pôle. Il s'efface de 70° à 78° de latitude (centre de la vue).
const OMBRAGE_EXAGERATION = 0.5;
let ombragePolaire = null;
function majOmbragePolaire() {
  const lat = Math.abs(map.getCenter().lat);
  const facteur = Math.round(Math.min(1, Math.max(0, (78 - lat) / 8)) * 100) / 100;
  if (facteur === ombragePolaire || !map.getLayer('ombrage')) return;
  ombragePolaire = facteur;
  map.setPaintProperty('ombrage', 'hillshade-exaggeration', OMBRAGE_EXAGERATION * facteur);
  if (map.getLayer('montis-relief')) map.setPaintProperty('montis-relief', 'hillshade-exaggeration', exagerationReliefMontis(facteur));
}
map.on('moveend', majOmbragePolaire);
map.on('style.load', () => {
  ombragePolaire = null;
  majOmbragePolaire();
});

function appliquerMode(mode3D) {
  etat.mode3D = mode3D;

  if (mode3D) {
    // 3D : relief + ombrage, inclinaison autorisée
    map.setMaxPitch(85);
    majTerrain();
    // L'ombre du soleil (ombres.js), quand elle est allumée, remplace cet ombrage fixe
    majOmbrage(map);
    map.touchPitch.enable();
  } else {
    // 2D : on remet à plat, puis on bloque l'inclinaison
    majTerrain();
    majOmbrage(map);
    map.touchPitch.disable();
    // Bloquer tout de suite couperait l'animation : la carte se remet à plat, puis se bloque
    if (map.getPitch() === 0) map.setMaxPitch(0);
    else {
      map.once('moveend', () => { if (!etat.mode3D) map.setMaxPitch(0); });
      map.easeTo({ pitch: 0, duration: 400 });
    }
  }

  ecrire('mode3D', mode3D);
  majCourbes(map);

  window.dispatchEvent(new CustomEvent('mode3d', { detail: mode3D }));
}

etat.basculerMode = () => appliquerMode(!etat.mode3D);

// Les courbes sont calculées dans l'unité affichée : des pieds ronds en impérial.
// [intermédiaire, maîtresse] : en montagne, une courbe tous les 20 m n'est lisible qu'à partir du zoom 13
const SEUILS_METRES = { 9: [500, 1000], 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [20, 100], 14: [20, 100], 15: [10, 50] };
const SEUILS_PIEDS = { 9: [2000, 4000], 10: [1000, 5000], 11: [500, 2000], 12: [200, 1000], 13: [100, 500], 14: [50, 250], 15: [40, 200] };
const urlCourbes = () =>
  demSource.contourProtocolUrl({
    multiplier: imperial() ? PIEDS : 1,
    thresholds: imperial() ? SEUILS_PIEDS : SEUILS_METRES,
    contourLayer: 'contours',
    elevationKey: 'ele',
    levelKey: 'level',
    extent: 4096,
    buffer: 1,
  });
const texteCourbe = () => [
  'concat',
  ['number-format', ['get', 'ele'], { 'max-fraction-digits': 0 }],
  imperial() ? ' ft' : ' m',
];

surPreferences(() => {
  echelle.setUnit(imperial() ? 'imperial' : 'metric');
  if (!map.getSource('courbes')) return;
  map.getSource('courbes').setTiles([urlCourbes()]);
  map.setLayoutProperty('courbes-altitude', 'text-field', texteCourbe());
  if (map.getLayer('montis-summit')) {
    map.setLayoutProperty('montis-summit', 'text-field', texteSommetFond());
  }
}, ['unites', '*']);

const texteSommetFond = () => [
  'concat',
  ['coalesce', ['get', 'name:fr'], ['get', 'name']],
  '\n',
  expressionAltitude(['get', 'ele']),
];

// ===== Tout ce qui s'ajoute une fois le style prêt =====
// Pas « load » : il attend les premières tuiles, et sur un réseau lent l'appli resterait
// sans menu ni recherche. Le style est dans le code, il est prêt presque tout de suite.
map.once('style.load', () => {
  ajouterMotifsMontis(map); // avant les premières tuiles du fond, qui en ont besoin
  marquerPrete(map);
  // ---------- Courbes de niveau ----------
  map.addSource('courbes', {
    type: 'vector',
    tiles: [urlCourbes()],
    maxzoom: 15,
  });

  map.addLayer({
    id: 'courbes',
    type: 'line',
    source: 'courbes',
    'source-layer': 'contours',
    layout: { 'line-join': 'round' },
    paint: peintureCourbes(),
  });

  map.addLayer({
    id: 'courbes-altitude',
    type: 'symbol',
    source: 'courbes',
    'source-layer': 'contours',
    filter: ['>=', ['get', 'level'], 1],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 420,
      'text-field': texteCourbe(),
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9.5, 15, 11],
      'text-padding': 12,
    },
    paint: peintureCotes(),
  });

  // ---------- Menu (activités, météo, carte) ----------
  initMenu(map);
  retablirFond(map);
  initPaletteFond(map); // jour ou nuit, selon le mode et le soleil au centre de la carte
  initGlobeNuit(map); // après les fonds : le globe passe au-dessus d'eux au dézoom
  initCiel(map); // étoiles et Lune autour du globe, derrière la carte
  initAtmosphere(map); // halo et liseré du globe, éclairés du côté du soleil
  initRecherche(map);
  initFiches(map);
  initHorsLigne(map);
  ouvrirLienRecu(map);

  map.once('idle', () => retablirFond(map)); // second passage une fois la carte au repos

  // ---------- Globe quand on dézoome ----------
  try {
    map.setProjection({
      type: ['interpolate', ['linear'], ['zoom'], 6, 'vertical-perspective', 9, 'mercator'],
    });
  } catch (err) {
    console.warn('Transition globe indisponible, globe simple :', err);
    try {
      map.setProjection({ type: 'globe' });
    } catch (err2) {
      console.warn('Globe indisponible :', err2);
    }
  }
  // ---------- Ciel : seulement près du sol (vue plate), sans brouillard ----------
  const CIEL = {
    'sky-color': '#8fb8d8',
    'horizon-color': '#e6eef2',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0,       // à l'horizon : couleur d'horizon seulement
    'fog-color': '#e6eef2',       // même couleur : le brouillard se fond dans le ciel
    'fog-ground-blend': 1,        // le brouillard reste à l'horizon, ne couvre pas le terrain
    'atmosphere-blend': 0,
  };
  let cielActif = false;
  function majCiel(force = false) {
    const veut = map.getZoom() >= ZOOM_RELIEF_MIN; // au-dessus : projection plate
    if (veut === cielActif && force !== true) return;
    map.setSky(veut ? (etat.cielImpose ?? CIEL) : undefined);
    cielActif = veut;
  }
  map.on('zoom', () => majCiel());
  majCiel();
  etat.majCiel = majCiel;

  // ---------- Démarrage dans le dernier mode utilisé (2D par défaut) ----------
  appliquerMode(lire('mode3D', false));
});