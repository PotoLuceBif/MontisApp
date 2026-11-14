import { describe, expect, it } from 'vitest';
import { soleilCoucheIci } from '../src/fond-palette.js';

const carte = (lng, lat) => ({ getCenter: () => ({ lng, lat }) });

describe('soleil couché au centre de la carte', () => {
  it('fait jour à midi et nuit à minuit à Chamonix', () => {
    expect(soleilCoucheIci(carte(6.87, 45.92), new Date(Date.UTC(2026, 10, 14, 11, 30)))).toBe(false);
    expect(soleilCoucheIci(carte(6.87, 45.92), new Date(Date.UTC(2026, 10, 14, 23, 0)))).toBe(true);
  });
  it('suit le lieu : nuit à Tokyo quand il est midi en Europe', () => {
    expect(soleilCoucheIci(carte(139.7, 35.7), new Date(Date.UTC(2026, 10, 14, 11, 30)))).toBe(true);
  });
  it('bascule autour du coucher du soleil (Chamonix, 14 novembre vers 16 h 55 UTC+1)', () => {
    expect(soleilCoucheIci(carte(6.87, 45.92), new Date(Date.UTC(2026, 10, 14, 15, 30)))).toBe(false);
    expect(soleilCoucheIci(carte(6.87, 45.92), new Date(Date.UTC(2026, 10, 14, 16, 30)))).toBe(true);
  });
});
