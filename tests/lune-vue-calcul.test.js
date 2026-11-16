import { describe, expect, it } from 'vitest';
import { coordonneesLune, peindreLune, pixelPlateCarre } from '../src/lune-vue-calcul.js';

describe('la vraie Lune vue de la Terre', () => {
  it('donne la déclinaison de la Lune dans ses bornes', () => {
    const { ra, dec } = coordonneesLune('2026-11-16T20:00:00Z');
    expect(ra).toBeGreaterThanOrEqual(0);
    expect(ra).toBeLessThan(360);
    expect(Math.abs(dec)).toBeLessThan(29);
  });
  it('lit une image plate carrée', () => {
    expect(pixelPlateCarre(0, 0, 512, 256)).toEqual([256, 128]);
    expect(pixelPlateCarre(90, -180, 512, 256)).toEqual([0, 0]);
    expect(pixelPlateCarre(-90, 180, 512, 256)).toEqual([511, 255]);
  });
  it('éclaire la face visible à la pleine lune, presque pas à la nouvelle lune', () => {
    const image = new Uint8ClampedArray(8 * 4 * 4).fill(200);
    const lum = (date) => {
      const p = peindreLune({ image, largeur: 8, hauteur: 4, date, taille: 21 });
      return p[(10 * 21 + 10) * 4];
    };
    expect(lum('2024-11-15T21:29:00Z')).toBeGreaterThan(150); // pleine lune
    expect(lum('2024-11-01T12:47:00Z')).toBeLessThan(40); // nouvelle lune
    const toujours = peindreLune({ image, largeur: 8, hauteur: 4, date: '2024-11-01T12:47:00Z', taille: 21, eclairee: true });
    expect(toujours[(10 * 21 + 10) * 4]).toBeGreaterThan(150);
  });
});
