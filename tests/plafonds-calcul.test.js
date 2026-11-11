import { describe, expect, it } from 'vitest';
import {
  COULEURS_PLAFOND, COULEUR_SANS, SANS_THERMIQUE, VARIABLES_PLAFONDS, altitudesNiveaux, cleNoeud, couleurPlafond, pasPourVue,
  plafondAu, plafondsHoraires, quadrillage, rasteriser, valeurGrille,
} from '../src/plafonds-calcul.js';

describe('quadrillage des plafonds', () => {
  it('reste à dix variables : un appel par point pour Open-Meteo', () => {
    expect(VARIABLES_PLAFONDS).toHaveLength(10);
  });

  it('choisit un pas plus large au dézoom, sans dépasser le nombre de points', () => {
    const vallee = { ouest: 6.5, sud: 45.7, est: 7.2, nord: 46.1 };
    const europe = { ouest: -10, sud: 36, est: 30, nord: 60 };
    const monde = { ouest: -180, sud: -85, est: 180, nord: 85 };
    expect(pasPourVue(vallee)).toBe(0.25);
    expect(pasPourVue(europe)).toBeGreaterThan(pasPourVue(vallee));
    expect(pasPourVue(monde)).toBeGreaterThanOrEqual(pasPourVue(europe));
    const g = quadrillage(europe);
    expect(g.noeuds.length).toBeLessThanOrEqual(200);
    expect(g.ouest).toBeLessThanOrEqual(-10);
    expect(g.nord).toBeGreaterThanOrEqual(60);
  });

  it('garde les mêmes nœuds quand la vue se décale', () => {
    const a = quadrillage({ ouest: 6.1, sud: 45.6, est: 6.9, nord: 46.0 }, 0.25);
    const b = quadrillage({ ouest: 6.3, sud: 45.7, est: 7.1, nord: 46.1 }, 0.25);
    const communs = a.noeuds.filter((n) => b.noeuds.some((m) => m.cle === n.cle));
    expect(communs.length).toBeGreaterThan(a.noeuds.length / 2);
    expect(cleNoeud(1, 190, 10)).toBe(cleNoeud(1, -170, 10));
  });
});

describe('altitude des niveaux de pression', () => {
  it('suit la formule hypsométrique depuis le sol', () => {
    // Relevé du 11 novembre 2026 près de Grenade : 938, 1 427, 1 937 m selon le modèle
    const altitudes = altitudesNiveaux({
      elevation: 694, pressionSol: 927, temperatureSol: 20,
      temperatures: { 950: 21, 900: 18.4, 850: 14.6, 800: 10.9, 700: 3.3, 600: -0.8 },
    });
    expect(altitudes[950]).toBeUndefined(); // sous le sol
    expect(altitudes[900]).toBeGreaterThan(900);
    expect(altitudes[900]).toBeLessThan(980);
    expect(altitudes[800]).toBeGreaterThan(1880);
    expect(altitudes[800]).toBeLessThan(1990);
  });
});

describe('plafonds d’une réponse', () => {
  const reponse = (sol, rayonnement) => ({
    elevation: 500,
    hourly: {
      time: ['2026-11-11T12:00'],
      temperature_2m: [sol], dew_point_2m: [0], shortwave_radiation: [rayonnement], surface_pressure: [955],
      temperature_950hPa: [16.5], temperature_900hPa: [13], temperature_850hPa: [9.5],
      temperature_800hPa: [6], temperature_700hPa: [-1], temperature_600hPa: [-8],
    },
  });

  it('donne un plafond l’après-midi, rien la nuit, et null sans données', () => {
    expect(plafondsHoraires(reponse(22, 500))[0]).toBeGreaterThan(1000);
    expect(plafondsHoraires(reponse(22, 0))[0]).toBe(SANS_THERMIQUE);
    expect(plafondsHoraires(reponse(null, 500))[0]).toBeNull();
    expect(plafondsHoraires(null)).toEqual([]);
  });
});

describe('couleurs et image', () => {
  it('range un plafond dans sa tranche de 500 m', () => {
    expect(couleurPlafond(800)).toEqual(COULEURS_PLAFOND[0]);
    expect(couleurPlafond(1200)).toEqual(COULEURS_PLAFOND[1]);
    expect(couleurPlafond(1499)).toEqual(COULEURS_PLAFOND[1]);
    expect(couleurPlafond(4200)).toEqual(COULEURS_PLAFOND.at(-1));
    expect(couleurPlafond(SANS_THERMIQUE)).toEqual(COULEUR_SANS);
    expect(couleurPlafond(null)).toBeNull();
  });

  it('interpole les plafonds, laisse gagner « sans thermique » s’il pèse plus', () => {
    const g = { nx: 2, ny: 2 };
    expect(valeurGrille(g, [1000, 2000, 1000, 2000], 0.5, 0.5)).toBe(1500);
    expect(valeurGrille(g, [SANS_THERMIQUE, SANS_THERMIQUE, SANS_THERMIQUE, 2000], 0.5, 0.5)).toBe(SANS_THERMIQUE);
    expect(valeurGrille(g, [SANS_THERMIQUE, 2000, 2000, 2000], 0.5, 0.5)).toBe(2000);
    expect(valeurGrille(g, [null, null, null, 1000], 0.5, 0.5)).toBeNull();
  });

  it('dessine le gris plus léger que les plafonds, et rien sans données', () => {
    const g = { nx: 2, ny: 2, pas: 1, sud: 0, nord: 1, ouest: 0, est: 1 };
    const pixels = rasteriser(g, [null, null, SANS_THERMIQUE, SANS_THERMIQUE], 4, 4);
    expect(pixels[3]).toBe(110); // en haut : le nord, sans thermique
    expect(pixels[(3 * 4) * 4 + 3]).toBe(0); // en bas : le sud, sans données
  });

  it('lit la valeur en un point du quadrillage', () => {
    const g = { ouest: 0, sud: 0, pas: 1, nx: 2, ny: 2 };
    expect(plafondAu(g, [1000, 2000, 1000, 2000], 0.5, 0.5)).toBe(1500);
    expect(plafondAu(g, [1000, 2000, 1000, 2000], 3, 0.5)).toBeNull();
  });
});
