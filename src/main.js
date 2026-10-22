import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import mlcontour from 'maplibre-contour';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

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
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© les contributeurs OpenStreetMap',
      },
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
      { id: 'osm', type: 'raster', source: 'osm' },
      {
        id: 'ombrage',
        type: 'hillshade',
        source: 'ombrage',
        layout: { visibility: 'none' },
        paint: { 'hillshade-exaggeration': 0.5 },
      },
    ],
  },
  center: [6.87, 45.88], // massif du Mont-Blanc (longitude, latitude)
  zoom: 11.5,
  maxPitch: 85,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

map.on('load', () => {
  map.addSource('courbes', {
    type: 'vector',
    tiles: [
      demSource.contourProtocolUrl({
        // [courbe fine, courbe maîtresse] en mètres, selon le niveau de zoom
        thresholds: {
          9: [500, 1000],
          10: [200, 1000],
          11: [100, 500],
          12: [50, 250],
          13: [20, 100],
          14: [10, 50],
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
    layout: { visibility: 'visible' },
    paint: {
      'line-color': '#8a5a2b',
      'line-opacity': 0.6,
      'line-width': ['match', ['get', 'level'], 1, 1.4, 0.6],
    },
  });
});

const bouton = document.getElementById('toggle3d');
let mode3D = false;

bouton.addEventListener('click', () => {
  mode3D = !mode3D;
  map.setLayoutProperty('ombrage', 'visibility', mode3D ? 'visible' : 'none');
  if (map.getLayer('courbes')) {
    map.setLayoutProperty('courbes', 'visibility', mode3D ? 'none' : 'visible');
  }
  if (mode3D) {
    map.setTerrain({ source: 'relief', exaggeration: 1.6 });
    map.easeTo({ pitch: 70, bearing: -20, duration: 1000 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
  }
  bouton.textContent = mode3D ? '2D' : '3D';
});