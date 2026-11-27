import { describe, expect, it } from 'vitest';
import { tuilesVue, xTuile, yTuile } from '../src/points-utiles-calcul.js';

describe('tuiles de la vue', () => {
  it('trouve la tuile de Chamonix au zoom 14', () => {
    expect(Math.floor(xTuile(6.87, 14))).toBe(8504);
    expect(Math.floor(yTuile(45.92, 14))).toBe(5834);
  });

  it('couvre la vue, la tuile du centre en premier', () => {
    const vue = { ouest: 6.84, sud: 45.9, est: 6.9, nord: 45.94 };
    const tuiles = tuilesVue(vue, 14, { lng: 6.87, lat: 45.92 });
    expect(tuiles[0]).toEqual({ z: 14, x: 8504, y: 5834 });
    const xs = tuiles.map((t) => t.x);
    expect(Math.min(...xs)).toBe(Math.floor(xTuile(6.84, 14)));
    expect(Math.max(...xs)).toBe(Math.floor(xTuile(6.9, 14)));
  });

  it('s’arrête au nombre demandé', () => {
    const vue = { ouest: 6, sud: 45, est: 7, nord: 46 };
    expect(tuilesVue(vue, 14, { lng: 6.5, lat: 45.5 }, 10)).toHaveLength(10);
  });

  it('passe l’antiméridien', () => {
    const tuiles = tuilesVue({ ouest: 179.99, sud: 0, est: 180.01, nord: 0.01 }, 14, { lng: 180, lat: 0 });
    const xs = new Set(tuiles.map((t) => t.x));
    expect(xs.has(0)).toBe(true);
    expect(xs.has(2 ** 14 - 1)).toBe(true);
  });
});
