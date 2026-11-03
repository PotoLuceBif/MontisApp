import { afterEach, describe, expect, it } from 'vitest';
import { definirSysteme, definirUniteVent } from '../src/preferences.js';
import * as u from '../src/unites.js';

// Les nombres français utilisent des espaces insécables : on les normalise pour comparer
const texte = (s) => s.replace(/[  ]/g, ' ');

afterEach(() => {
  definirSysteme('metrique');
  definirUniteVent('auto');
});

describe('métrique', () => {
  it('affiche altitudes, distances et températures sans conversion', () => {
    expect(texte(u.formatAltitude(2450))).toBe('2 450 m');
    expect(u.formatDistance(12345)).toBe('12,3 km');
    expect(u.formatLongueur(850)).toBe('850 m');
    expect(u.formatTemp(-3.4)).toBe('-3 °C');
  });

  it('arrondit les altitudes au pas demandé', () => {
    expect(texte(u.formatAltitude(2449, { pas: 100 }))).toBe('2 400 m');
  });
});

describe('impérial', () => {
  it('convertit en pieds, milles et degrés Fahrenheit', () => {
    definirSysteme('imperial');
    expect(u.versAltitude(1000)).toBeCloseTo(3280.84, 2);
    expect(u.versDistance(1609.344)).toBeCloseTo(1, 6);
    expect(u.formatTemp(0)).toBe('32 °F');
    expect(u.formatTemp(100)).toBe('212 °F');
  });

  it('fait l’aller-retour des altitudes sans perte', () => {
    definirSysteme('imperial');
    expect(u.depuisAltitude(u.versAltitude(1234))).toBeCloseTo(1234, 9);
  });
});

describe('vent', () => {
  it('suit le système en mode auto', () => {
    expect(u.libelleVent()).toBe('km/h');
    definirSysteme('imperial');
    expect(u.libelleVent()).toBe('mph');
  });

  it('convertit vers chaque unité', () => {
    definirUniteVent('ms');
    expect(u.versVent(36)).toBeCloseTo(10, 9);
    definirUniteVent('kt');
    expect(u.versVent(1.852)).toBeCloseTo(1, 9);
    definirUniteVent('mph');
    expect(u.versVent(1.609344)).toBeCloseTo(1, 9);
  });

  it('garde une décimale en m/s sous 10', () => {
    definirUniteVent('ms');
    expect(u.formatVent(18)).toBe('5 m/s');
    expect(u.formatVent(20)).toBe('5,6 m/s');
  });
});
