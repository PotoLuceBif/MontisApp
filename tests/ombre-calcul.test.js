import { describe, expect, it } from 'vitest';
import { directionSoleil, grilleOmbres, pixelsOmbre, porteeOmbre, PORTEE_MAX } from '../src/ombre-calcul.js';

const CELLULE = 10;

// Mur nord-sud de `haut` mètres sur la colonne `colonne`, terrain plat à 1000 m ailleurs
const mur = (colonne, haut) => (x) => (Math.round(x) === colonne ? 1000 + haut : 1000);

function ombres({ altitude, azimut, hauteurSoleil, largeur = 60, hauteur = 3, altitudeMax = 1300 }) {
  return grilleOmbres({ largeur, hauteur, altitude, cellule: CELLULE, azimut, hauteurSoleil, altitudeMax });
}

describe('direction du soleil sur la grille', () => {
  it('l’est vers x croissant, le sud vers y croissant', () => {
    const est = directionSoleil(90);
    expect(est.dx).toBeCloseTo(1, 9);
    expect(est.dy).toBeCloseTo(0, 9);
    const sud = directionSoleil(180);
    expect(sud.dx).toBeCloseTo(0, 9);
    expect(sud.dy).toBeCloseTo(1, 9);
  });
});

describe('portée de la recherche', () => {
  it('nulle soleil couché, bornée soleil rasant', () => {
    expect(porteeOmbre(0)).toBe(0);
    expect(porteeOmbre(-5)).toBe(0);
    expect(porteeOmbre(0.5)).toBe(PORTEE_MAX);
    expect(porteeOmbre(45)).toBeCloseTo(4000, 6);
  });
});

describe('ombre portée', () => {
  it('terrain plat : aucune ombre', () => {
    const o = ombres({ altitude: () => 1000, azimut: 135, hauteurSoleil: 10 });
    expect(Math.max(...o)).toBe(0);
  });

  it('soleil couché : tout à l’ombre', () => {
    const o = ombres({ altitude: () => 1000, azimut: 270, hauteurSoleil: -2 });
    expect(Math.min(...o)).toBe(1);
  });

  it('un mur de 100 m, soleil à l’est à 45° : ombre sur 100 m à l’ouest', () => {
    const o = ombres({ altitude: mur(40, 100), azimut: 90, hauteurSoleil: 45 });
    const ligne = Array.from(o.slice(60, 120)); // ligne du milieu
    // 100 m = 10 cellules : de la colonne 31 à 39, à l'ombre ; au-delà, au soleil
    for (let c = 31; c < 40; c += 1) expect(ligne[c]).toBe(1);
    for (let c = 0; c <= 30; c += 1) expect(ligne[c]).toBe(0);
    // Côté soleil du mur : pas d'ombre
    for (let c = 41; c < 60; c += 1) expect(ligne[c]).toBe(0);
  });

  it('plus le soleil est bas, plus l’ombre est longue', () => {
    const longueur = (hauteurSoleil) => {
      const o = ombres({ altitude: mur(55, 100), azimut: 90, hauteurSoleil });
      return Array.from(o.slice(60, 115)).filter((a) => a === 1).length;
    };
    expect(longueur(45)).toBe(9);
    // tan(20°) : 100 m / 0,364 = 275 m, soit 27 cellules
    expect(longueur(20)).toBe(27);
    expect(longueur(60)).toBeLessThan(longueur(45));
  });

  it('le soleil de l’autre côté ne donne pas d’ombre derrière le mur', () => {
    const o = ombres({ altitude: mur(40, 100), azimut: 270, hauteurSoleil: 45 });
    const ligne = Array.from(o.slice(60, 120));
    for (let c = 0; c < 40; c += 1) expect(ligne[c]).toBe(0);
    for (let c = 41; c < 50; c += 1) expect(ligne[c]).toBe(1);
    expect(ligne[51]).toBe(0);
  });

  it('un versant tourné à l’opposé du soleil, plus raide que lui, est à l’ombre', () => {
    // Versant qui monte vers l'est à 30° (il regarde l'ouest), soleil à l'est à 20°
    const versant = (x) => 1000 + x * CELLULE * Math.tan(Math.PI / 6);
    const o = ombres({ altitude: versant, azimut: 90, hauteurSoleil: 20, altitudeMax: 2000 });
    expect(o[60 + 20]).toBe(1);
    // Soleil plus haut que la pente : éclairé
    const o2 = ombres({ altitude: versant, azimut: 90, hauteurSoleil: 40, altitudeMax: 2000 });
    expect(o2[60 + 20]).toBe(0);
  });

  it('le relief manquant ne fait pas d’ombre', () => {
    const o = ombres({ altitude: (x) => (x > 45 ? Number.NaN : 1000), azimut: 90, hauteurSoleil: 10 });
    expect(Math.max(...o)).toBe(0);
  });
});

describe('pixels de la tuile', () => {
  it('transparents au soleil, couleur d’ombre opaque sinon', () => {
    const o = new Uint8Array(4);
    o[1] = 1;
    const p = pixelsOmbre(o, 2);
    expect(p[3]).toBe(0);
    expect(p[7]).toBe(255);
    expect(Array.from(p.slice(4, 7))).toEqual([14, 20, 42]);
  });
});
