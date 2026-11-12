// Globe jour et nuit au dézoom (demande du propriétaire du 12 novembre 2026, à la manière de Plans d'Apple) :
// image du jour avec relief et fonds marins, et lumières des villes la nuit, mélangées selon le soleil réel.
// Images de la NASA (GIBS, domaine public, sans clé), jusqu'au zoom 8. La couche s'efface en zoomant,
// pour laisser la carte. L'heure du mélange avance toutes les dix minutes.
import { addProtocol } from 'maplibre-gl';
import { REPERE_CALQUES } from './style-montis.js';
import { melangerTuile, pointSubsolaire } from './globe-nuit-calcul.js';

const PROTOCOLE = 'montis-globe';
const SOURCE = 'globe-jour-nuit';
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const JOUR = `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`;
const NUIT = `${GIBS}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`;
const ZOOM_PLEIN = 4; // jusqu'ici, le globe seul
const ZOOM_FIN = 6; // au-delà, la carte seule
const PAS_HEURE = 10 * 60 * 1000;
const TUILES_GARDEES = 96;

const images = new Map(); // adresse → promesse des pixels RGBA

function pixelsDe(adresse) {
  if (images.has(adresse)) return images.get(adresse);
  const promesse = fetch(adresse)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.blob();
    })
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const contexte = canvas.getContext('2d', { willReadFrequently: true });
      contexte.drawImage(bitmap, 0, 0, 256, 256);
      bitmap.close?.();
      return contexte.getImageData(0, 0, 256, 256).data;
    });
  promesse.catch(() => images.delete(adresse)); // un échec sera retenté
  images.set(adresse, promesse);
  while (images.size > TUILES_GARDEES) images.delete(images.keys().next().value);
  return promesse;
}

const adresse = (modele, z, x, y) => modele.replace('{z}', z).replace('{x}', x).replace('{y}', y);
const instantArrondi = () => Math.floor(Date.now() / PAS_HEURE) * PAS_HEURE;

export function initGlobeNuit(map) {
  addProtocol(PROTOCOLE, async ({ url }) => {
    const [, instant, z, x, y] = url.match(/^[\w-]+:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/).map(Number);
    const [jour, nuit] = await Promise.all([pixelsDe(adresse(JOUR, z, x, y)), pixelsDe(adresse(NUIT, z, x, y))]);
    const pixels = melangerTuile(jour, nuit, z, x, y, pointSubsolaire(new Date(instant)));
    return { data: await createImageBitmap(new ImageData(pixels, 256, 256)) };
  });

  let instant = instantArrondi();
  const tuiles = () => [`${PROTOCOLE}://${instant}/{z}/{x}/{y}`];

  // Au-dessus de tous les fonds (ils se posent sous le repère), sous les pentes, ombres et calques
  function poser() {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, {
      type: 'raster',
      tiles: tuiles(),
      tileSize: 256,
      maxzoom: 8,
      attribution: 'Globe : <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a>',
    });
    map.addLayer(
      {
        id: SOURCE,
        type: 'raster',
        source: SOURCE,
        maxzoom: ZOOM_FIN,
        paint: {
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_PLEIN, 1, ZOOM_FIN, 0],
          'raster-fade-duration': 0,
        },
      },
      map.getLayer(REPERE_CALQUES) ? REPERE_CALQUES : 'montis-road-casing',
    );
  }
  poser();
  map.on('style.load', poser);

  // Le soleil avance : nouvelles tuiles toutes les dix minutes, seulement si le globe est visible
  setInterval(() => {
    const nouvel = instantArrondi();
    if (nouvel === instant || map.getZoom() >= ZOOM_FIN) return;
    instant = nouvel;
    map.getSource(SOURCE)?.setTiles(tuiles());
  }, 60 * 1000);
  map.on('zoomend', () => {
    const nouvel = instantArrondi();
    if (nouvel !== instant && map.getZoom() < ZOOM_FIN) {
      instant = nouvel;
      map.getSource(SOURCE)?.setTiles(tuiles());
    }
  });
}
