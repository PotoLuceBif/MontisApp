import { describe, expect, it } from 'vitest';
import {
  COULEUR_SANS, ECHELLES_PLAFOND, SANS_THERMIQUE, couleurPlafond, plafondSelon, decoderEpaisseur, encoderEpaisseurs, epaisseurAu, pixelsPlafond, plafondFin,
} from '../src/plafonds-calcul.js';

const GFS = { ni: 1440, nj: 721, lat1: 90, lon1: 0, lat2: -90, lon2: 359.75 };
const maille = (lng, lat) => Math.round((90 - lat) / 0.25) * 1440 + Math.round((((lng % 360) + 360) % 360) / 0.25);

describe('codage de l’épaisseur', () => {
  it('garde l’épaisseur à 25 m près, et rien sans donnée', () => {
    const codes = encoderEpaisseurs(Float32Array.from([1210, 0, NaN, 99999]));
    expect(decoderEpaisseur(codes[0])).toBe(1200);
    expect(decoderEpaisseur(codes[1])).toBe(0);
    expect(decoderEpaisseur(codes[2])).toBeNull();
    expect(decoderEpaisseur(codes[3])).toBe(254 * 25);
  });
});

describe('épaisseur en un point', () => {
  it('lisse entre les mailles, longitudes ouest comprises', () => {
    const codes = new Uint8Array(GFS.ni * GFS.nj);
    codes[maille(6, 46)] = 1 + 40; // 1 000 m
    codes[maille(6.25, 46)] = 1 + 80; // 2 000 m
    codes[maille(6, 45.75)] = 1 + 40;
    codes[maille(6.25, 45.75)] = 1 + 80;
    expect(epaisseurAu(GFS, codes, 6, 46)).toBeCloseTo(1000, 6);
    expect(epaisseurAu(GFS, codes, 6.125, 45.9)).toBeCloseTo(1500, 6);
    codes[maille(-3.5, 37)] = 1 + 20;
    expect(epaisseurAu(GFS, codes, -3.5, 37)).toBeCloseTo(500, 6);
    expect(epaisseurAu(GFS, codes, 100, 10)).toBeNull();
  });

  it('ajoute le relief fin, et marque les couches trop minces', () => {
    expect(plafondFin(800, 1700)).toBe(2500);
    expect(plafondFin(800, -40)).toBe(800); // la mer, pas le fond
    expect(plafondFin(150, 2000)).toBe(SANS_THERMIQUE);
    expect(plafondFin(null, 2000)).toBeNull();
  });
});

describe('couleurs et tuiles', () => {
  it('range un plafond au-dessus de la mer dans sa tranche de 500 m, jusqu’à 5 000 m', () => {
    const { couleurs } = ECHELLES_PLAFOND.mer;
    expect(couleurPlafond(800, 'mer')).toEqual(couleurs[0]);
    expect(couleurPlafond(1200, 'mer')).toEqual(couleurs[1]);
    expect(couleurPlafond(4200, 'mer')).toEqual(couleurs[7]);
    expect(couleurPlafond(5600, 'mer')).toEqual(couleurs.at(-1));
    expect(couleurPlafond(SANS_THERMIQUE, 'mer')).toEqual(COULEUR_SANS);
    expect(couleurPlafond(null, 'mer')).toBeNull();
  });

  it('range une épaisseur au-dessus du sol : 300–600, 600–1 000… 2 500 et plus', () => {
    const { couleurs } = ECHELLES_PLAFOND.sol;
    expect(couleurPlafond(450, 'sol')).toEqual(couleurs[0]);
    expect(couleurPlafond(800, 'sol')).toEqual(couleurs[1]);
    expect(couleurPlafond(3000, 'sol')).toEqual(couleurs.at(-1));
    expect(plafondSelon('sol', 800, 2000)).toBe(800);
    expect(plafondSelon('mer', 800, 2000)).toBe(2800);
    expect(plafondSelon('sol', 150, 2000)).toBe(SANS_THERMIQUE);
  });

  it('a autant de couleurs que de tranches dans chaque échelle', () => {
    for (const { paliers, couleurs } of Object.values(ECHELLES_PLAFOND)) expect(couleurs).toHaveLength(paliers.length + 1);
  });

  it('colore une tuile selon le relief : la crête plus haut que la vallée', () => {
    const codes = new Uint8Array(GFS.ni * GFS.nj).fill(1 + 32); // 800 m partout
    const altitudes = new Float32Array(256 * 256);
    for (let k = 0; k < altitudes.length; k += 1) altitudes[k] = k % 256 < 128 ? 500 : 2000; // vallée à l'ouest, crête à l'est
    const pixels = pixelsPlafond(GFS, codes, altitudes, 8, 133, 90, { reference: 'mer' });
    const couleur = (px) => [...pixels.slice((128 * 256 + px) * 4, (128 * 256 + px) * 4 + 4)];
    const { couleurs } = ECHELLES_PLAFOND.mer;
    expect(couleur(10)).toEqual([...couleurs[1], 255]); // 1 300 m : 1 000–1 500
    expect(couleur(200)).toEqual([...couleurs[4], 255]); // 2 800 m : 2 500–3 000
    // Au-dessus du sol, le relief ne compte plus : 800 m partout
    const sol = pixelsPlafond(GFS, codes, altitudes, 8, 133, 90, { reference: 'sol' });
    expect([...sol.slice((128 * 256 + 10) * 4, (128 * 256 + 10) * 4 + 3)]).toEqual(ECHELLES_PLAFOND.sol.couleurs[1]);
    expect([...sol.slice((128 * 256 + 200) * 4, (128 * 256 + 200) * 4 + 3)]).toEqual(ECHELLES_PLAFOND.sol.couleurs[1]);
  });

  it('dessine en gris, plus léger, une couche trop mince', () => {
    const codes = new Uint8Array(GFS.ni * GFS.nj).fill(1 + 4); // 100 m
    const pixels = pixelsPlafond(GFS, codes, null, 3, 4, 2);
    expect([...pixels.slice(0, 4)]).toEqual([...COULEUR_SANS, 190]);
  });
});
