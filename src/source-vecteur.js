export const SOURCE_VECTEUR = 'osm-vecteur';

export function assurerSourceVecteur(map) {
  if (!map.getSource(SOURCE_VECTEUR)) {
    map.addSource(SOURCE_VECTEUR, {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution:
        '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Données © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    });
  }
}