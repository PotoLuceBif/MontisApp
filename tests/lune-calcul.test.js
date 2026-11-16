import { describe, expect, it } from 'vitest';
import { codePhase, dessinPhase, eclairementLune, journeeLune, positionLune, prochainePhase } from '../src/lune-calcul.js';

const CHAMONIX = { lat: 45.92, lng: 6.87 };

describe('phase de la Lune', () => {
  it('nomme les huit phases', () => {
    expect(codePhase(0)).toBe('nouvelle');
    expect(codePhase(0.99)).toBe('nouvelle');
    expect(codePhase(0.1)).toBe('premier-croissant');
    expect(codePhase(0.25)).toBe('premier-quartier');
    expect(codePhase(0.4)).toBe('gibbeuse-croissante');
    expect(codePhase(0.5)).toBe('pleine');
    expect(codePhase(0.6)).toBe('gibbeuse-decroissante');
    expect(codePhase(0.75)).toBe('dernier-quartier');
    expect(codePhase(0.9)).toBe('dernier-croissant');
  });

  it('trouve la pleine lune du 24 novembre 2026', () => {
    const pleine = prochainePhase(new Date('2026-11-16T12:00:00Z'), 0.5);
    expect(Math.abs(pleine - new Date('2026-11-24T14:54:00Z'))).toBeLessThan(30 * 60000);
    const e = eclairementLune(pleine);
    expect(e.code).toBe('pleine');
    expect(e.fraction).toBeGreaterThan(0.99);
  });

  it('trouve la nouvelle lune suivante, après la pleine', () => {
    const nouvelle = prochainePhase(new Date('2026-11-16T12:00:00Z'), 0);
    expect(nouvelle > new Date('2026-11-24T00:00:00Z')).toBe(true);
    expect(eclairementLune(nouvelle).fraction).toBeLessThan(0.01);
  });

  it('dit croissante avant la pleine lune', () => {
    expect(eclairementLune(new Date('2026-11-20T12:00:00Z')).croissante).toBe(true);
    expect(eclairementLune(new Date('2026-11-28T12:00:00Z')).croissante).toBe(false);
  });
});

describe('position, lever et coucher', () => {
  it('donne un azimut entre 0 et 360 et une distance plausible', () => {
    const p = positionLune(new Date('2026-11-16T20:00:00Z'), CHAMONIX.lat, CHAMONIX.lng);
    expect(p.azimut).toBeGreaterThanOrEqual(0);
    expect(p.azimut).toBeLessThan(360);
    expect(p.distance).toBeGreaterThan(356000);
    expect(p.distance).toBeLessThan(407000);
  });

  it('donne le lever et le coucher du jour civil du lieu', () => {
    const j = journeeLune('2026-11-16', CHAMONIX.lat, CHAMONIX.lng, 60);
    expect(j.regime).toBe('normal');
    // Le jour civil de Chamonix (UTC+1) va de 23 h UTC la veille à 23 h UTC
    for (const instant of [j.lever, j.coucher]) {
      expect(instant >= new Date('2026-11-15T23:00:00Z')).toBe(true);
      expect(instant < new Date('2026-11-16T23:00:00Z')).toBe(true);
    }
    // Au lever, la Lune est à l'horizon
    expect(Math.abs(positionLune(j.lever, CHAMONIX.lat, CHAMONIX.lng).hauteur)).toBeLessThan(1);
  });
});

describe('dessin de la phase', () => {
  it('ne dessine rien à la nouvelle lune et un disque plein à la pleine', () => {
    expect(dessinPhase(0, true)).toBe('');
    expect(dessinPhase(1, false)).toContain('A9 9 0 1 1');
  });

  it('éclaire à droite une Lune croissante, à gauche au sud', () => {
    expect(dessinPhase(0.3, true)).toMatch(/^M12 3\.00A9 9 0 0 1 12 21\.00/);
    expect(dessinPhase(0.3, true, { sud: true })).toMatch(/^M12 3\.00A9 9 0 0 0 12 21\.00/);
  });

  it('fait bomber le terminateur selon la phase', () => {
    expect(dessinPhase(0.25, true)).toMatch(/A4\.50 9 0 0 0 12 3\.00Z$/); // croissant
    expect(dessinPhase(0.75, true)).toMatch(/A4\.50 9 0 0 1 12 3\.00Z$/); // gibbeuse
  });
});
