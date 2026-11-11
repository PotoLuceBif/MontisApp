import { describe, expect, it } from 'vitest';
import {
  COULEURS_PLAFOND, couleurPlafond, grilleCouvre, grillePlafonds, plafondAu, plafondPoint, rasteriser, valeurGrille,
} from '../src/plafonds-calcul.js';

describe('grille des plafonds', () => {
  it('couvre la vue avec une marge et reste sous 80° de latitude', () => {
    const vue = { ouest: 6, sud: 45, est: 7, nord: 46 };
    const g = grillePlafonds(vue);
    expect(g.positions).toHaveLength(49);
    expect(g.ouest).toBeLessThan(6);
    expect(g.nord).toBeGreaterThan(46);
    expect(grilleCouvre(g, vue)).toBe(true);
    expect(grilleCouvre(g, { ouest: 5, sud: 45, est: 7, nord: 46 })).toBe(false);
    expect(grillePlafonds({ ouest: -180, sud: -89, est: 180, nord: 89 }).nord).toBe(80);
  });
});

describe('couleurs et interpolation', () => {
  it('borne et mélange les couleurs entre les paliers', () => {
    expect(couleurPlafond(500)).toEqual(COULEURS_PLAFOND[0]);
    expect(couleurPlafond(5000)).toEqual(COULEURS_PLAFOND.at(-1));
    const milieu = couleurPlafond(1250);
    expect(milieu[0]).toBe(Math.round((COULEURS_PLAFOND[0][0] + COULEURS_PLAFOND[1][0]) / 2));
    expect(couleurPlafond(null)).toBeNull();
  });

  it('interpole entre quatre points et éteint une zone surtout sans thermique', () => {
    const g = { nx: 2, ny: 2 };
    expect(valeurGrille(g, [1000, 2000, 1000, 2000], 0.5, 0.5)).toBe(1500);
    expect(valeurGrille(g, [1000, null, 1000, 1000], 0.2, 0.2)).toBeCloseTo(1000, 6);
    expect(valeurGrille(g, [null, null, null, 1000], 0.5, 0.5)).toBeNull();
  });

  it('dessine une image transparente là où il n’y a rien', () => {
    const g = { nx: 2, ny: 2 };
    const pixels = rasteriser(g, [null, null, 2000, 2000], 4, 4);
    // Nord en haut : les points du nord (indices 2 et 3) sont colorés, ceux du sud non
    expect(pixels[3]).toBe(255);
    expect(pixels[(3 * 4) * 4 + 3]).toBe(0);
  });

  it('lit la valeur en un point de la grille', () => {
    const g = { ouest: 0, sud: 0, pasLng: 1, pasLat: 1, nx: 2, ny: 2 };
    expect(plafondAu(g, [1000, 2000, 1000, 2000], 0.5, 0.5)).toBe(1500);
    expect(plafondAu(g, [1000, 2000, 1000, 2000], 3, 0.5)).toBeNull();
  });
});

describe('plafond d’un point', () => {
  it('rend null sans données exploitables', () => {
    expect(plafondPoint({ hourly: { time: ['x'] } }, 0)).toBeNull();
    expect(plafondPoint(null, 0)).toBeNull();
  });
});
