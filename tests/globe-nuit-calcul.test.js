import { describe, expect, it } from 'vitest';
import { hauteurSoleil, melangerTuile, partJour, pointSubsolaire } from '../src/globe-nuit-calcul.js';

describe('point subsolaire', () => {
  it('suit la déclinaison au fil des saisons', () => {
    expect(pointSubsolaire(new Date(Date.UTC(2026, 2, 20, 12))).lat).toBeCloseTo(0, 0);
    expect(pointSubsolaire(new Date(Date.UTC(2026, 5, 21, 12))).lat).toBeCloseTo(23.4, 0);
    expect(pointSubsolaire(new Date(Date.UTC(2026, 11, 21, 12))).lat).toBeCloseTo(-23.4, 0);
  });

  it('passe à l’ouest de Greenwich à midi UTC en novembre (équation du temps)', () => {
    // Mi-novembre, le soleil passe au méridien vers 11 h 44 UTC : à midi, il est environ 4° à l’ouest
    const { lng } = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 12)));
    expect(lng).toBeGreaterThan(-5);
    expect(lng).toBeLessThan(-3);
  });

  it('fait le tour de la Terre en un jour', () => {
    const a = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 0)));
    const b = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 6)));
    expect(((a.lng - b.lng + 360) % 360)).toBeCloseTo(90, 0);
  });
});

describe('jour, nuit et crépuscule', () => {
  it('donne 90° sous le soleil et −90° aux antipodes', () => {
    const soleil = { lat: 10, lng: 20 };
    expect(hauteurSoleil(10, 20, soleil)).toBeCloseTo(90, 4);
    expect(hauteurSoleil(-10, -160, soleil)).toBeCloseTo(-90, 4);
  });

  it('mélange en douceur dans le crépuscule', () => {
    expect(partJour(30)).toBe(1);
    expect(partJour(-20)).toBe(0);
    const milieu = partJour(-3.5);
    expect(milieu).toBeGreaterThan(0.3);
    expect(milieu).toBeLessThan(0.7);
  });

  it('prend l’image du jour sous le soleil et celle de la nuit à l’opposé', () => {
    const jour = new Uint8ClampedArray(256 * 256 * 4).fill(200);
    const nuit = new Uint8ClampedArray(256 * 256 * 4).fill(10);
    // Tuile 0/0/0 : le monde entier ; soleil au-dessus de l’Afrique
    const pixels = melangerTuile(jour, nuit, 0, 0, 0, { lat: 0, lng: 15 });
    const valeur = (lng, lat) => {
      const px = Math.round(((lng + 180) / 360) * 255);
      const py = Math.round(((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * 255);
      return pixels[(py * 256 + px) * 4];
    };
    expect(valeur(15, 0)).toBe(200);
    expect(valeur(-165, 0)).toBe(10);
    expect(pixels[3]).toBe(255);
  });
});
