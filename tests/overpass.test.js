import { describe, expect, it } from 'vitest';
import { objetOsm } from '../src/overpass.js';

describe('objetOsm', () => {
  it('décode l’identifiant des tuiles OpenFreeMap', () => {
    expect(objetOsm(973202622)).toEqual({ type: 'way', id: 97320262 });
    expect(objetOsm(13996431161)).toEqual({ type: 'node', id: 1399643116 });
    expect(objetOsm('123453')).toEqual({ type: 'relation', id: 12345 });
  });
  it('refuse ce qui n’est pas un identifiant connu', () => {
    expect(objetOsm(undefined)).toBeNull();
    expect(objetOsm(12340)).toBeNull();
    expect(objetOsm(7)).toBeNull();
    expect(objetOsm(-12)).toBeNull();
  });
});
