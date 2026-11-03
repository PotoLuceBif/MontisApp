import { describe, expect, it } from 'vitest';
import {
  cap,
  classePente,
  dansPolygone,
  distance,
  distanceGeometrie,
  genreEau,
  penteOrientation,
  pixelMonde,
  plusProche,
  pointsEau,
  taillePixel,
} from '../src/point-calcul.js';

// Grille d'un plan incliné : l'altitude baisse de `parMetreEst` par mètre vers l'est
// et de `parMetreNord` par mètre vers le nord
function plan(parMetreEst, parMetreNord, cellule) {
  const grille = [];
  for (let ligne = -1; ligne <= 1; ligne += 1) {
    const rangee = [];
    for (let colonne = -1; colonne <= 1; colonne += 1) {
      // ligne -1 = nord
      rangee.push(1000 - parMetreEst * colonne * cellule + parMetreNord * ligne * cellule);
    }
    grille.push(rangee);
  }
  return grille;
}

describe('pente et orientation', () => {
  it('un terrain plat n’a pas d’orientation', () => {
    const r = penteOrientation([[500, 500, 500], [500, 500, 500], [500, 500, 500]], 20);
    expect(r.pente).toBe(0);
    expect(r.orientation).toBeNull();
  });

  it('45° vers l’est : versant est', () => {
    const r = penteOrientation(plan(1, 0, 20), 20);
    expect(r.pente).toBeCloseTo(45, 5);
    expect(r.orientation).toBeCloseTo(90, 5);
  });

  it('30° vers le nord : versant nord', () => {
    const r = penteOrientation(plan(0, Math.tan(Math.PI / 6), 15), 15);
    expect(r.pente).toBeCloseTo(30, 5);
    expect(r.orientation === 0 || r.orientation === 360 || Math.abs(r.orientation) < 1e-9).toBe(true);
  });

  it('descente vers le sud-ouest', () => {
    // Descend vers l'ouest et vers le sud : l'altitude monte vers l'est et le nord
    const r = penteOrientation(plan(-0.5, -0.5, 10), 10);
    expect(r.orientation).toBeCloseTo(225, 5);
    expect(r.pente).toBeCloseTo((Math.atan(Math.SQRT1_2) * 180) / Math.PI, 5);
  });

  it('la taille de cellule compte : même grille, cellule double, pente plus faible', () => {
    const grille = plan(1, 0, 20);
    expect(penteOrientation(grille, 40).pente).toBeCloseTo((Math.atan(0.5) * 180) / Math.PI, 5);
  });
});

describe('classes de pente', () => {
  it('suit les seuils 30, 35, 40, 45', () => {
    expect(classePente(12)).toBeNull();
    expect(classePente(29.9)).toBeNull();
    expect(classePente(30)).toBe('30');
    expect(classePente(37)).toBe('35');
    expect(classePente(44.9)).toBe('40');
    expect(classePente(60)).toBe('45');
    expect(classePente(NaN)).toBeNull();
  });
});

describe('tuiles', () => {
  it('pixel de 0,6 m environ au zoom 18 à l’équateur, deux fois moins à 60°', () => {
    expect(taillePixel(0, 18)).toBeCloseTo(0.597, 2);
    expect(taillePixel(60, 18)).toBeCloseTo(0.2986, 3);
  });

  it('l’origine du monde est en haut à gauche', () => {
    const p = pixelMonde(-180, 85.0511287798, 0);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 3);
    const centre = pixelMonde(0, 0, 1);
    expect(centre.x).toBeCloseTo(256, 6);
    expect(centre.y).toBeCloseTo(256, 6);
  });
});

describe('distances et caps', () => {
  const CHAMONIX = [6.8694, 45.9237];
  const MONT_BLANC = [6.8652, 45.8326];

  it('Chamonix – sommet du mont Blanc : environ 10,1 km plein sud', () => {
    expect(distance(CHAMONIX, MONT_BLANC) / 1000).toBeCloseTo(10.14, 1);
    const c = cap(CHAMONIX, MONT_BLANC);
    expect(c).toBeGreaterThan(180);
    expect(c).toBeLessThan(185);
  });

  it('un degré de longitude à l’équateur, vers l’est', () => {
    expect(distance([0, 0], [1, 0])).toBeCloseTo(111195, -1);
    expect(cap([0, 0], [1, 0])).toBeCloseTo(90, 6);
    expect(cap([0, 0], [0, -1])).toBeCloseTo(180, 6);
  });

  it('le plus proche dans la limite donnée', () => {
    const objets = [
      { nom: 'loin', coordonnees: [0.2, 0] },
      { nom: 'près', coordonnees: [0, 0.01] },
    ];
    const r = plusProche(objets, [0, 0]);
    expect(r.nom).toBe('près');
    expect(r.distance).toBeCloseTo(1112, -1);
    expect(r.cap).toBeCloseTo(0, 6);
    expect(plusProche(objets, [0, 0], 500)).toBeNull();
    expect(plusProche([], [0, 0])).toBeNull();
  });
});

describe('points d’eau', () => {
  it('ne déclare potable que ce qui l’est dans OpenStreetMap', () => {
    expect(genreEau({ amenity: 'drinking_water' })).toBe('potable');
    expect(genreEau({ natural: 'spring', drinking_water: 'yes' })).toBe('potable');
    expect(genreEau({ amenity: 'drinking_water', drinking_water: 'no' })).toBe('non-potable');
    expect(genreEau({ natural: 'spring' })).toBe('source');
    expect(genreEau({ man_made: 'water_tap' })).toBe('inconnue');
  });

  it('lit les nœuds et les centres des chemins', () => {
    const r = pointsEau([
      { type: 'node', lon: 6.1, lat: 45.1, tags: { natural: 'spring', name: 'Source du Loup' } },
      { type: 'way', center: { lon: 6.2, lat: 45.2 }, tags: { amenity: 'drinking_water' } },
      { type: 'way', tags: {} },
    ]);
    expect(r).toEqual([
      { coordonnees: [6.1, 45.1], genre: 'source', nom: 'Source du Loup' },
      { coordonnees: [6.2, 45.2], genre: 'potable', nom: '' },
    ]);
  });
});

describe('distance à une géométrie', () => {
  const carre = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] };

  it('nulle dans un polygone, sauf dans un trou', () => {
    expect(distanceGeometrie([0.005, 0.005], carre).distance).toBe(0);
    expect(dansPolygone([0.005, 0.005], carre)).toBe(true);
    const troue = { type: 'Polygon', coordinates: [carre.coordinates[0], [[0.004, 0.004], [0.006, 0.004], [0.006, 0.006], [0.004, 0.006], [0.004, 0.004]]] };
    const r = distanceGeometrie([0.005, 0.005], troue);
    expect(r.distance).toBeGreaterThan(100);
    expect(r.distance).toBeLessThan(115);
  });

  it('jusqu’au bord le plus proche, hors du polygone', () => {
    const r = distanceGeometrie([0.005, -0.001], carre);
    expect(r.distance).toBeCloseTo(111.2, 0);
    expect(r.coordonnees[0]).toBeCloseTo(0.005, 6);
    expect(r.coordonnees[1]).toBeCloseTo(0, 6);
  });

  it('jusqu’à une ligne, au milieu d’un segment', () => {
    const riviere = { type: 'LineString', coordinates: [[-0.01, 0.001], [0.01, 0.001]] };
    const r = distanceGeometrie([0, 0], riviere);
    expect(r.distance).toBeCloseTo(111.2, 0);
    expect(r.coordonnees[0]).toBeCloseTo(0, 6);
  });

  it('multigéométries et types inconnus', () => {
    const multi = { type: 'MultiPoint', coordinates: [[0, 0.02], [0, 0.002]] };
    expect(distanceGeometrie([0, 0], multi).distance).toBeCloseTo(222.4, 0);
    expect(distanceGeometrie([0, 0], { type: 'GeometryCollection', geometries: [] })).toBeNull();
    expect(distanceGeometrie([0, 0], null)).toBeNull();
    expect(dansPolygone([0, 0], multi)).toBe(false);
  });
});
