// Points utiles un peu avant le zoom 14 (demande du propriétaire du 27 novembre 2026) : les tuiles du fond ne les
// donnent qu'au zoom 14, alors on lit nous-mêmes les tuiles du zoom 14 de la vue, dès le zoom ZOOM_LOIN. Ce sont les
// adresses que la carte demandera en zoomant : elles sont déjà dans le cache. Chargé à la demande (points-utiles.js).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { SOURCE_VECTEUR } from './source-vecteur.js';
import { POINTS_UTILES, SOURCE_LOIN, ZOOM_LOIN, ZOOM_TUILES } from './points-utiles.js';
import { tuilesVue } from './points-utiles-calcul.js';

const MAX_TUILES = 64; // un grand écran d'ordinateur au zoom 13
const GARDEES = 256;
const CLASSES = new Set(Object.values(POINTS_UTILES).map((p) => p.classe));

export function suivrePointsLoin(map, allumes) {
  const cache = new Map(); // « z/x/y » → promesse des points de la tuile
  let tour = 0; // réponses d'un déplacement dépassé ignorées
  let affichees = '';

  function lireTuile({ z, x, y }) {
    const cle = `${z}/${x}/${y}`;
    if (!cache.has(cle)) {
      const modele = map.getSource(SOURCE_VECTEUR)?.tiles?.[0];
      if (!modele) return Promise.resolve([]);
      const adresse = modele.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      const promesse = fetch(adresse)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((donnees) => {
          if (!donnees) return [];
          const couche = new VectorTile(new PbfReader(new Uint8Array(donnees))).layers.poi;
          const points = [];
          for (let i = 0; couche && i < couche.length; i++) {
            const f = couche.feature(i);
            if (f.type !== 1 || !CLASSES.has(f.properties.class)) continue;
            // Objet simple : celui de toGeoJSON n'était pas dessiné par la source GeoJSON
            const [lng, lat] = f.toGeoJSON(x, y, z).geometry.coordinates;
            const { class: classe, name } = f.properties;
            points.push({ type: 'Feature', id: f.id, properties: { class: classe, name }, geometry: { type: 'Point', coordinates: [lng, lat] } });
          }
          return points;
        })
        .catch(() => {
          cache.delete(cle); // une tuile manquée se redemande au prochain déplacement
          return [];
        });
      cache.set(cle, promesse);
      if (cache.size > GARDEES) cache.delete(cache.keys().next().value);
    }
    return cache.get(cle);
  }

  async function majPoints() {
    const source = map.getSource(SOURCE_LOIN);
    if (!source) return;
    const zoom = map.getZoom();
    if (!allumes() || zoom < ZOOM_LOIN - 0.25 || zoom >= ZOOM_TUILES) return;
    const b = map.getBounds();
    const tuiles = tuilesVue(
      { ouest: b.getWest(), sud: b.getSouth(), est: b.getEast(), nord: b.getNorth() },
      ZOOM_TUILES,
      map.getCenter(),
      MAX_TUILES,
    );
    const cle = tuiles.map((t) => `${t.x}/${t.y}`).join(',');
    if (cle === affichees) return;
    const ceTour = ++tour;
    const listes = await Promise.all(tuiles.map(lireTuile));
    if (ceTour !== tour) return;
    affichees = cle;
    source.setData({ type: 'FeatureCollection', features: listes.flat() });
  }

  map.on('moveend', majPoints);
  // Le fond change de style : la source revient vide
  map.on('style.load', () => {
    affichees = '';
    majPoints();
  });
  return { maj: majPoints };
}
