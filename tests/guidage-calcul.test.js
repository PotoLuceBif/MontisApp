import { describe, expect, it } from 'vitest';
import { deniveles, prochainsReperes, reperesSurTrace, restant, situerSurTrace, tempsRestants } from '../src/guidage-calcul.js';

// Trace plein est le long du 46e parallèle : 0,001° de longitude ≈ 77 m
const points = Array.from({ length: 101 }, (_, i) => ({ lng: 7 + i * 0.001, lat: 46, d: i * 77.24 }));
const dureeDin = (distance, plus, moins) => {
  const h = distance / 1000 / 4;
  const v = plus / 300 + moins / 500;
  return Math.max(h, v) + Math.min(h, v) / 2;
};

describe('situerSurTrace', () => {
  it('projette la position sur la trace et mesure l’écart', () => {
    const place = situerSurTrace(points, { lng: 7.0505, lat: 46.0003 });
    expect(place.d).toBeCloseTo(50.5 * 77.24, -1);
    expect(place.ecart).toBeGreaterThan(30);
    expect(place.ecart).toBeLessThan(36);
  });
  it('sur un aller-retour, reste du côté de la position précédente', () => {
    const allerRetour = [...points, ...points.slice(0, -1).reverse().map((p, i) => ({ ...p, d: 100 * 77.24 + (i + 1) * 77.24 }))];
    const retour = situerSurTrace(allerRetour, { lng: 7.03, lat: 46 }, 165);
    expect(retour.d).toBeGreaterThan(100 * 77.24);
    const aller = situerSurTrace(allerRetour, { lng: 7.03, lat: 46 }, 25);
    expect(aller.d).toBeLessThan(100 * 77.24);
  });
  it('loin de la fenêtre, cherche sur toute la trace', () => {
    const place = situerSurTrace(points, { lng: 7.09, lat: 46 }, 5);
    expect(place.indice).toBe(90);
  });
});

describe('restant', () => {
  const alts = points.map((_, i) => (i <= 50 ? 1000 + i * 10 : 1500 - (i - 50) * 4));
  const analyse = { points, alts, total: points.at(-1).d };
  it('distance et dénivelés devant et derrière', () => {
    const reste = restant(analyse, 25);
    expect(reste.plus).toBeCloseTo(250, 0);
    expect(reste.moins).toBeCloseTo(200, 0);
    expect(reste.fait.plus).toBeCloseTo(250, 0);
    expect(reste.distance).toBeCloseTo(75 * 77.24, 0);
  });
  it('les petites variations ne comptent pas', () => {
    expect(deniveles([1000, 1001, 1000, 1002, 1000])).toEqual({ plus: 0, moins: 0 });
  });
});

describe('repères', () => {
  const candidats = [
    { nom: 'Refuge loin', lng: 7.05, lat: 46.01 },
    { nom: 'Col', lng: 7.08, lat: 46.001 },
    { nom: 'Sommet', lng: 7.02, lat: 45.9995 },
  ];
  it('garde ceux à moins de 200 m, dans l’ordre du parcours', () => {
    const reperes = reperesSurTrace(points, candidats);
    expect(reperes.map(({ nom }) => nom)).toEqual(['Sommet', 'Col']);
  });
  it('ne montre que ceux qui sont devant', () => {
    const reperes = reperesSurTrace(points, candidats);
    expect(prochainsReperes(reperes, 30 * 77.24).map(({ nom }) => nom)).toEqual(['Col']);
  });
});

describe('tempsRestants', () => {
  const reste = { distance: 8000, plus: 600, moins: 0, fait: { distance: 4000, plus: 0, moins: 0 } };
  it('standard : DIN 33466 sur ce qui reste', () => {
    expect(tempsRestants({ duree: dureeDin, reste }).standard).toBeCloseTo(3, 5);
  });
  it('avant d’avoir assez marché : l’allure du champ, lue comme une allure à plat', () => {
    const debut = { ...reste, fait: { distance: 200, plus: 0, moins: 0 } };
    // 12 min/km au lieu des 15 du modèle : 20 % plus rapide, dénivelé compris
    const temps = tempsRestants({ duree: dureeDin, reste: debut, allure: 0.2, ecoule: 0.05 });
    expect(temps.mesure).toBe(false);
    expect(temps.personnel).toBeCloseTo(3 * 0.8, 5);
    expect(temps.ecart).toBeNull();
  });
  it('ensuite : le rythme mesuré, avec l’avance sur l’allure prévue', () => {
    // 4 km faits en 48 min au lieu d'1 h au standard : 20 % plus rapide
    // allure du champ égale au modèle (15 min/km) : 1 h prévue pour ce qui est fait
    const temps = tempsRestants({ duree: dureeDin, reste, allure: 0.25, ecoule: 0.8 });
    expect(temps.mesure).toBe(true);
    expect(temps.personnel).toBeCloseTo(3 * 0.8, 5);
    expect(temps.ecart).toBeCloseTo(-0.2, 5);
  });
});
