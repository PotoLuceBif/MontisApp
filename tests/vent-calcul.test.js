import { describe, expect, it } from 'vitest';
import { HAUTEURS_VENT, VARIABLES_VENT, VARIABLES_VENT_HAUTS, codeCardinal, colonneVent, composantes, couchesVolume, depuisComposantes, ventAHauteur } from '../src/vent-calcul.js';

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

describe('volume 3D jusqu’à 10 000 m', () => {
  it('garde les couches d’origine jusqu’à 2 000 m', () => {
    expect(couchesVolume(2000)).toEqual(HAUTEURS_VENT.filter((h) => h !== 100));
    expect(couchesVolume(500)).toEqual([10, 100, 200, 500]);
  });

  it('espace les couches au-delà, sans dépasser la hauteur choisie', () => {
    for (const plafond of [3000, 4000, 5000, 8000, 10000]) {
      const couches = couchesVolume(plafond);
      expect(couches.at(-1)).toBe(plafond);
      expect(couches.length).toBeLessThanOrEqual(9);
      expect(couches.every((h, i) => i === 0 || h > couches[i - 1])).toBe(true);
    }
  });

  it('lit le vent des niveaux hauts quand ils sont là, et seulement à part', () => {
    expect(VARIABLES_VENT.some((v) => v.includes('250hPa'))).toBe(false);
    expect(VARIABLES_VENT_HAUTS).toHaveLength(9);
    const hourly = { wind_speed_10m: [5], wind_direction_10m: [180] };
    for (const [p, h] of [[500, 5600], [300, 9200], [250, 10400]]) {
      hourly[`wind_speed_${p}hPa`] = [p === 500 ? 40 : 120];
      hourly[`wind_direction_${p}hPa`] = [270];
      hourly[`geopotential_height_${p}hPa`] = [h];
    }
    const colonne = colonneVent(hourly, 0, 1000);
    expect(colonne.at(-1).hauteur).toBe(9400);
    expect(Math.hypot(...Object.values(ventAHauteur(colonne, 9000)))).toBeCloseTo(120, 6);
  });
});
