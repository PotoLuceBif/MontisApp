import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import mlcontour from 'maplibre-contour';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { initMenu } from './menu.js';
import { etat, majCourbes } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { retablirFond } from './fond-de-carte.js';
import { initRecherche } from './recherche.js';
import { initFiches } from './fiche.js';
import { initBasculeMode } from './bascule-mode.js';
import { appliquerApparence } from './apparence.js';
import { STYLE_MONTIS } from './style-montis.js';


maplibregl.setWorkerUrl(maplibreWorkerUrl);
appliquerApparence();

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

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
        attribution: 'Relief : Terrain Tiles (AWS)',
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
});

window.map = map;

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
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

// ===== Mémoire de la position de la carte =====
const vueSauvee = lire('vue', null);

if (
  vueSauvee &&
  Number.isFinite(vueSauvee.lng) && Number.isFinite(vueSauvee.lat) &&
  Number.isFinite(vueSauvee.zoom) &&
  Math.abs(vueSauvee.lat) <= 90
) {
  map.jumpTo({
    center: [vueSauvee.lng, vueSauvee.lat],
    zoom: vueSauvee.zoom,
    bearing: vueSauvee.bearing ?? 0,
    pitch: vueSauvee.pitch ?? 0,
  });
}

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
const boutonToggle3d = document.getElementById('toggle3d');
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

function appliquerMode(mode3D) {
  etat.mode3D = mode3D;

  if (mode3D) {
    // 3D : relief + ombrage, inclinaison autorisée
    map.setMaxPitch(85);
    majTerrain();
    map.setLayoutProperty('ombrage', 'visibility', 'visible');
    map.touchPitch.enable();
    boutonToggle3d.textContent = '2D';
  } else {
    // 2D : on remet à plat, puis on bloque l'inclinaison
    majTerrain();
    map.setLayoutProperty('ombrage', 'visibility', 'none');
    map.easeTo({ pitch: 0, duration: 400 });
    map.once('moveend', () => map.setMaxPitch(0));
    map.setMaxPitch(0);
    map.touchPitch.disable();
    boutonToggle3d.textContent = '3D';
  }

  ecrire('mode3D', mode3D);
  majCourbes(map);

  window.dispatchEvent(new CustomEvent('mode3d', { detail: mode3D }));
}

etat.basculerMode = () => appliquerMode(!etat.mode3D);

boutonToggle3d.addEventListener('click', () => {
  appliquerMode(!etat.mode3D);
});

// ===== Tout ce qui s'ajoute une fois la carte chargée =====
map.on('load', () => {
  // ---------- Courbes de niveau ----------
  map.addSource('courbes', {
    type: 'vector',
    tiles: [
      demSource.contourProtocolUrl({
        thresholds: {
          9: [500, 1000],
          10: [200, 1000],
          11: [100, 500],
          12: [20, 100],
          13: [20, 100],
          14: [10, 100],
        },
        contourLayer: 'contours',
        elevationKey: 'ele',
        levelKey: 'level',
        extent: 4096,
        buffer: 1,
      }),
    ],
    maxzoom: 15,
  });

  map.addLayer({
    id: 'courbes',
    type: 'line',
    source: 'courbes',
    'source-layer': 'contours',
    paint: {
      'line-color': '#8a5a2b',
      'line-opacity': 0.6,
      'line-width': ['match', ['get', 'level'], 1, 1.4, 0.6],
    },
  });

  map.addLayer({
    id: 'courbes-altitude',
    type: 'symbol',
    source: 'courbes',
    'source-layer': 'contours',
    filter: ['>=', ['get', 'level'], 1],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 300,
      'text-field': [
        'concat',
        ['number-format', ['get', 'ele'], { 'max-fraction-digits': 0 }],
        ' m',
      ],
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-size': 11,
    },
    paint: {
      'text-color': '#6b4220',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  });

  // ---------- Menu (activités, météo, carte) ----------
  initMenu(map);
  retablirFond(map);
  initRecherche(map);
  initFiches(map);

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
  function majCiel() {
    const veut = map.getZoom() >= ZOOM_RELIEF_MIN; // au-dessus : projection plate
    if (veut === cielActif) return;
    map.setSky(veut ? CIEL : undefined);
    cielActif = veut;
  }
  map.on('zoom', majCiel);
  majCiel();

  // ---------- Démarrage dans le dernier mode utilisé (2D par défaut) ----------
  appliquerMode(lire('mode3D', false));
});