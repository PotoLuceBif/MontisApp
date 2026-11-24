import { describe, expect, it } from 'vitest';
import { estAdresseTuile } from '../src/connexion-lente.js';

describe('connexion lente', () => {
  it('ne mesure que les tuiles', () => {
    expect(estAdresseTuile('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/4245/2905.png')).toBe(true);
    expect(estAdresseTuile('https://tiles.openfreemap.org/planet/20261120/14/8490/5810.pbf')).toBe(true);
    expect(estAdresseTuile('https://tile.opentopomap.org/12/2120/1450.png?x=1')).toBe(true);
    expect(estAdresseTuile('https://data.geopf.fr/wmts?SERVICE=WMTS&LAYER=X&TILEMATRIX=14&TILEROW=1&TILECOL=2')).toBe(true);
    expect(estAdresseTuile('https://overpass-api.de/api/interpreter?data=x')).toBe(false);
    expect(estAdresseTuile('https://api.open-meteo.com/v1/forecast?latitude=45.9&longitude=6.8')).toBe(false);
    expect(estAdresseTuile('/data/pistes/1164f5.json')).toBe(false);
    expect(estAdresseTuile('montis-pente://pentes/12/2120/1450')).toBe(false);
  });
});
