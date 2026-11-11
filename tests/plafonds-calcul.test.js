import { describe, expect, it } from 'vitest';
import {
  COULEURS_PLAFOND, COULEUR_SANS, SANS_THERMIQUE, couleurPlafond, decoderPlafond, encoderPlafonds, indiceMaille, plafondAu, rasteriserMonde,
} from '../src/plafonds-calcul.js';

const GFS = { ni: 1440, nj: 721, lat1: 90, lon1: 0, lat2: -90, lon2: 359.75 };

describe('codage des plafonds', () => {
  it('ajoute le relief à la couche limite, et marque les couches trop minces', () => {
    const codes = encoderPlafonds(Float32Array.from([1200, 150, NaN, 9000]), Float32Array.from([800, 2000, 0, 0]));
    expect(decoderPlafond(codes[0])).toBe(2000);
    expect(decoderPlafond(codes[1])).toBe(SANS_THERMIQUE);
    expect(decoderPlafond(codes[2])).toBeNull();
    expect(decoderPlafond(codes[3])).toBe(253 * 25); // plafonné
  });

  it('ignore un relief sous la mer', () => {
    const codes = encoderPlafonds(Float32Array.from([500]), Float32Array.from([-40]));
    expect(decoderPlafond(codes[0])).toBe(500);
  });
});

describe('mailles de GFS', () => {
  it('trouve la maille d’un point, longitudes ouest comprises', () => {
    expect(indiceMaille(GFS, 0, 90)).toBe(0);
    expect(indiceMaille(GFS, 6.87, 45.92)).toBe(Math.round((90 - 45.92) / 0.25) * 1440 + Math.round(6.87 / 0.25));
    expect(indiceMaille(GFS, -3.6, 37.18)).toBe(Math.round((90 - 37.18) / 0.25) * 1440 + Math.round(356.4 / 0.25));
    expect(indiceMaille(GFS, 179.99, 0)).toBe(360 * 1440 + 720);
    expect(indiceMaille(GFS, 359.9, 0)).toBe(360 * 1440); // fait le tour
  });

  it('lit un plafond en un point', () => {
    const codes = new Uint8Array(GFS.ni * GFS.nj);
    codes[indiceMaille(GFS, 6.87, 45.92)] = 2 + 80;
    expect(plafondAu(GFS, codes, 6.87, 45.92)).toBe(2000);
    expect(plafondAu(GFS, codes, 10, 10)).toBeNull();
  });
});

describe('couleurs et image', () => {
  it('range un plafond dans sa tranche de 500 m', () => {
    expect(couleurPlafond(800)).toEqual(COULEURS_PLAFOND[0]);
    expect(couleurPlafond(1200)).toEqual(COULEURS_PLAFOND[1]);
    expect(couleurPlafond(4200)).toEqual(COULEURS_PLAFOND.at(-1));
    expect(couleurPlafond(SANS_THERMIQUE)).toEqual(COULEUR_SANS);
    expect(couleurPlafond(null)).toBeNull();
  });

  it('dessine le monde : gris plus léger, rien sans donnée', () => {
    const grille = { ni: 4, nj: 3, lat1: 90, lon1: 0, lat2: -90, lon2: 270 };
    const codes = Uint8Array.from([0, 0, 0, 0, 1, 1, 82, 82, 0, 0, 0, 0]);
    const pixels = rasteriserMonde(grille, codes, 8, 8);
    const alpha = (x, y) => pixels[(y * 8 + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(0); // haut : rangée nord vide
    expect(alpha(5, 4)).toBe(110); // équateur, 67,5° est : maille de 90° est, sans thermique
    expect(alpha(1, 4)).toBe(255); // équateur, 112,5° ouest : maille de 270°, plafond
    expect(Math.max(...Array.from({ length: 8 }, (_, x) => alpha(x, 4)))).toBe(255);
  });
});
