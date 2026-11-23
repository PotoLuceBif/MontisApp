import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adresseGardee, gardee, garder, lireGardee } from '../src/reponses-gardees.js';

// Cache Storage réduit à l'essentiel : jsdom n'en a pas
function fauxCaches() {
  const rangees = new Map();
  const cache = {
    match: async (adresse) => rangees.get(adresse)?.clone(),
    put: async (adresse, reponse) => void rangees.set(adresse, reponse),
    keys: async () => [...rangees.keys()],
    delete: async (adresse) => rangees.delete(adresse),
  };
  return { open: async () => cache, rangees };
}

describe('adresse gardée', () => {
  it('donne une adresse stable, différente pour chaque question', () => {
    const a = adresseGardee('overpass:[out:json];node(1);out;');
    expect(a).toBe(adresseGardee('overpass:[out:json];node(1);out;'));
    expect(a).not.toBe(adresseGardee('overpass:[out:json];node(2);out;'));
    expect(a.startsWith('https://reponses.montis.invalid/overpass-')).toBe(true);
  });

  it('reste courte pour une très longue requête', () => {
    expect(adresseGardee(`overpass:${'x'.repeat(5000)}`).length).toBeLessThan(140);
  });
});

describe('réponses gardées', () => {
  let faux;
  beforeEach(() => {
    faux = fauxCaches();
    vi.stubGlobal('caches', faux);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('ne redemande pas une réponse fraîche', async () => {
    const charger = vi.fn(async () => ({ niveaux: { 'FR-01': 3 } }));
    expect(await gardee('avalanches:2026-11-23', 60000, charger)).toEqual({ niveaux: { 'FR-01': 3 } });
    await Promise.resolve();
    expect(await gardee('avalanches:2026-11-23', 60000, charger)).toEqual({ niveaux: { 'FR-01': 3 } });
    expect(charger).toHaveBeenCalledTimes(1);
  });

  it('redemande une réponse trop ancienne', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    await garder('balises:openwindmap', { data: [1] });
    vi.setSystemTime(new Date('2026-11-23T10:03:00Z'));
    expect(await lireGardee('balises:openwindmap', 2 * 60 * 1000)).toBeNull();
    expect(await lireGardee('balises:openwindmap', 5 * 60 * 1000)).toEqual({ data: [1] });
  });

  it('ne garde pas un échec', async () => {
    await expect(gardee('overpass:a', 60000, async () => { throw new Error('HTTP 504'); })).rejects.toThrow('HTTP 504');
    expect(faux.rangees.size).toBe(0);
  });

  it('se passe du Cache Storage quand il manque', async () => {
    vi.stubGlobal('caches', undefined);
    const charger = vi.fn(async () => 42);
    expect(await gardee('osm:node/1', 60000, charger)).toBe(42);
    expect(await gardee('osm:node/1', 60000, charger)).toBe(42);
    expect(charger).toHaveBeenCalledTimes(2);
  });
});
