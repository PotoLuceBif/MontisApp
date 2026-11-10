import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nettoyerPreferences, optionsValhalla, parametresBrouter, profilMontis } from '../src/parcours-preferences.js';

const profil = (nom) => readFileSync(resolve('src/profils-brouter', `${nom}.brf`), 'utf8');

describe('préférences de routage', () => {
  it('ne garde que les préférences proposées, sans doublon, dans l’ordre', () => {
    expect(nettoyerPreferences(['routes', 'sentiers', 'sentiers', 'inconnue'], ['sentiers', 'chemins', 'routes'])).toEqual(['sentiers', 'routes']);
    expect(nettoyerPreferences('sentiers')).toEqual([]);
    expect(nettoyerPreferences(null)).toEqual([]);
  });

  it('règle le profil Montis par l’adresse', () => {
    expect(parametresBrouter(['sentiers', 'balises'])).toEqual({ 'profile:montis_sentiers': '1', 'profile:montis_balises': '1' });
    expect(parametresBrouter([])).toEqual({});
  });

  it('oriente Valhalla sans perdre les options de la pratique', () => {
    const velo = { costing: 'bicycle', costing_options: { bicycle: { bicycle_type: 'Mountain' } } };
    expect(optionsValhalla(velo, ['cyclables', 'routes']).costing_options.bicycle).toEqual({ bicycle_type: 'Mountain', use_roads: 0.1 });
    expect(optionsValhalla({ costing: 'pedestrian' }, ['chemins'])).toEqual({ costing: 'pedestrian', costing_options: { pedestrian: { use_tracks: 1 } } });
    expect(optionsValhalla({ costing: 'pedestrian' }, ['cyclables'])).toEqual({ costing: 'pedestrian' });
  });
});

describe('profil BRouter de Montis', () => {
  it.each(['hiking-mountain', 'mtb', 'gravel', 'fastbike'])('complète %s', (nom) => {
    const texte = profilMontis(profil(nom));
    expect(texte).not.toMatch(/#/);
    const global = texte.slice(texte.indexOf('---context:global'), texte.indexOf('---context:way'));
    expect(global).toMatch(/assign montis_sentiers 0/);
    const way = texte.slice(texte.indexOf('---context:way'), texte.indexOf('---context:node'));
    // Un seul costfactor final, multiplié par le facteur des préférences
    expect(way.match(/assign\s+costfactor\b/g)).toHaveLength(1);
    expect(way).toMatch(/assign costfactor if greater montis_cf 9997 then montis_cf else multiply montis_cf montis_facteur/);
    expect(way.indexOf('assign montis_facteur')).toBeLessThan(way.indexOf('assign costfactor'));
  });

  it('refuse un profil sans contextes', () => {
    expect(() => profilMontis('assign costfactor 1')).toThrow();
  });
});
