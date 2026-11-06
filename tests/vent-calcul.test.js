import { describe, expect, it } from 'vitest';
import { codeCardinal, composantes, depuisComposantes } from '../src/vent-calcul.js';

describe('composantes du vent', () => {
  it('un vent du nord souffle vers le sud', () => {
    const { u, v } = composantes(10, 0);
    expect(u).toBeCloseTo(0, 9);
    expect(v).toBeCloseTo(-10, 9);
  });

  it('retrouve vitesse et provenance pour toutes les directions', () => {
    for (let provenance = 0; provenance < 360; provenance += 15) {
      const { u, v } = composantes(25, provenance);
      const retour = depuisComposantes(u, v);
      expect(retour.vitesse).toBeCloseTo(25, 9);
      expect(retour.provenance).toBeCloseTo(provenance, 6);
      expect(retour.flux).toBeCloseTo((provenance + 180) % 360, 6);
    }
  });
});

describe('points cardinaux', () => {
  it('nomme les huit directions et les angles négatifs ou au-delà de 360°', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(codeCardinal)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']);
    expect(codeCardinal(359)).toBe('N');
    expect(codeCardinal(-90)).toBe('O');
    expect(codeCardinal(720 + 180)).toBe('S');
  });
});
