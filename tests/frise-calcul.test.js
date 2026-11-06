import { describe, expect, it } from 'vitest';
import {
  bornesEchelle,
  changementsDeJour,
  directionMoyenne,
  estNeige,
  indicesHeures,
  niveauOrage,
  plafondPluie,
  plafondVent,
} from '../src/frise-calcul.js';

const heures = Array.from({ length: 48 }, (_, i) => {
  const jour = i < 24 ? '2026-11-06' : '2026-11-07';
  return `${jour}T${String(i % 24).padStart(2, '0')}:00`;
});

describe('niveauOrage', () => {
  it('suit les seuils de CAPE', () => {
    expect(niveauOrage(0, 1)).toBe(0);
    expect(niveauOrage(299, 3)).toBe(0);
    expect(niveauOrage(300, 3)).toBe(1);
    expect(niveauOrage(999, 3)).toBe(1);
    expect(niveauOrage(1000, 3)).toBe(2);
    expect(niveauOrage(3500, 3)).toBe(2);
  });
  it("donne la priorité à l'orage annoncé par le modèle", () => {
    expect(niveauOrage(0, 95)).toBe(3);
    expect(niveauOrage(null, 96)).toBe(3);
    expect(niveauOrage(1200, 99)).toBe(3);
  });
  it('ne signale rien sans donnée', () => {
    expect(niveauOrage(undefined, 2)).toBe(0);
    expect(niveauOrage(NaN, undefined)).toBe(0);
  });
});

describe('indicesHeures', () => {
  it('prend les 24 heures qui suivent', () => {
    const indices = indicesHeures(heures, '2026-11-06T14:00');
    expect(indices).toHaveLength(24);
    expect(indices[0]).toBe(14);
    expect(indices.at(-1)).toBe(37);
  });
  it("s'arrête à la fin des prévisions", () => {
    expect(indicesHeures(heures, '2026-11-07T20:00')).toEqual([44, 45, 46, 47]);
    expect(indicesHeures(heures, '2026-11-08T00:00')).toEqual([]);
  });
  it('garde un jour choisi à partir du début donné', () => {
    expect(indicesHeures(heures, '2026-11-07T00:00', '2026-11-07')).toHaveLength(24);
    expect(indicesHeures(heures, '2026-11-06T22:00', '2026-11-06')).toEqual([22, 23]);
  });
  it('accepte des données absentes', () => {
    expect(indicesHeures(undefined, '2026-11-06T00:00')).toEqual([]);
  });
});

describe('bornesEchelle', () => {
  it('arrondit au pas', () => {
    expect(bornesEchelle([3.2, 17.8], { pas: 5 })).toEqual({ bas: 0, haut: 20 });
  });
  it("élargit une petite variation à l'écart minimal", () => {
    const { bas, haut } = bornesEchelle([10, 11], { pas: 1, ecartMin: 6 });
    expect(haut - bas).toBeGreaterThanOrEqual(6);
    expect(bas).toBeLessThanOrEqual(10);
    expect(haut).toBeGreaterThanOrEqual(11);
  });
  it('inclut une valeur imposée (altitude du lieu)', () => {
    const { bas, haut } = bornesEchelle([2800, 3100], { pas: 500, inclure: [1035] });
    expect(bas).toBe(1000);
    expect(haut).toBe(3500);
  });
  it('ignore les trous et renvoie null sans valeur', () => {
    expect(bornesEchelle([null, NaN])).toBeNull();
    expect(bornesEchelle([5, null], { pas: 5 })).toEqual({ bas: 5, haut: 10 });
  });
});

describe('plafonds', () => {
  it('garde un minimum lisible', () => {
    expect(plafondPluie([0, 0.2])).toBe(2);
    expect(plafondPluie([0, 4.3])).toBe(5);
    expect(plafondVent([5, 12])).toBe(30);
    expect(plafondVent([22, 57])).toBe(60);
  });
});

describe('estNeige', () => {
  it("distingue la neige de la pluie par l'eau tombée", () => {
    expect(estNeige(1.4, 2)).toBe(true);
    expect(estNeige(2, 0.2)).toBe(false);
    expect(estNeige(0, 0)).toBe(false);
  });
});

describe('changementsDeJour', () => {
  it('repère minuit', () => {
    expect(changementsDeJour(heures, indicesHeures(heures, '2026-11-06T14:00'))).toEqual([24]);
    expect(changementsDeJour(heures, [1, 2, 3])).toEqual([]);
  });
});

describe('directionMoyenne', () => {
  it('moyenne autour du nord', () => {
    expect(directionMoyenne([350, 10])).toBeCloseTo(0, 6);
    expect(directionMoyenne([80, 100])).toBeCloseTo(90, 6);
  });
  it('renvoie null sans direction', () => {
    expect(directionMoyenne([null])).toBeNull();
    expect(directionMoyenne([0, 180])).toBeNull();
  });
});
