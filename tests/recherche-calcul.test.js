import { describe, expect, it } from 'vitest';
import {
  NB_RECENTS,
  ajouterRecent,
  categorie,
  correspondance,
  fusionnerAvecRecents,
  lireCoordonnees,
  normaliser,
  recentsCorrespondants,
  retirerRecent,
  simplifier,
  trierResultats,
} from '../src/recherche-calcul.js';

// Résultat de Photon réduit à l'utile
const photon = (name, osm_key, osm_value, type, [lng, lat], extra = {}) => ({
  geometry: { coordinates: [lng, lat] },
  properties: { name, osm_key, osm_value, type, osm_type: 'N', osm_id: `${name}${lng}`, ...extra },
});

const ANNECY = { lng: 6.13, lat: 45.9 };

describe('categorie', () => {
  it('distingue ville, village et hameau même quand Photon les dit tous « city »', () => {
    expect(categorie({ osm_key: 'place', osm_value: 'city', type: 'city' }).type).toBe('ville');
    expect(categorie({ osm_key: 'place', osm_value: 'village', type: 'city' }).type).toBe('village');
    const ville = categorie({ osm_key: 'place', osm_value: 'city', type: 'city' });
    const village = categorie({ osm_key: 'place', osm_value: 'village', type: 'city' });
    const hameau = categorie({ osm_key: 'place', osm_value: 'hamlet', type: 'district' });
    expect(ville.poids).toBeGreaterThan(village.poids);
    expect(village.poids).toBeGreaterThan(hameau.poids);
  });

  it('reconnaît sommets, cols, refuges et lacs', () => {
    expect(categorie({ osm_key: 'natural', osm_value: 'peak' }).type).toBe('sommet');
    expect(categorie({ osm_key: 'mountain_pass', osm_value: 'yes' }).type).toBe('col');
    expect(categorie({ osm_key: 'tourism', osm_value: 'alpine_hut' }).type).toBe('refuge');
    expect(categorie({ osm_key: 'natural', osm_value: 'water' }).type).toBe('lac');
    expect(categorie({ osm_key: 'highway', osm_value: 'residential', type: 'street' }).type).toBe('rue');
  });
});

describe('normaliser', () => {
  it('garde deux précisions locales et le pays', () => {
    const r = normaliser(
      photon('Montréal', 'place', 'village', 'city', [5.58, 46.18], {
        county: 'Ain', state: 'Auvergne-Rhône-Alpes', country: 'France',
      })
    );
    expect(r.lieux).toBe('Ain, Auvergne-Rhône-Alpes, France');
    expect(r.type).toBe('village');
  });

  it('ne répète ni le nom ni le pays', () => {
    const r = normaliser(photon('Québec', 'place', 'state', 'state', [-71, 52], { state: 'Québec', country: 'Canada' }));
    expect(r.lieux).toBe('Canada');
  });

  it('donne un nom aux adresses sans nom', () => {
    const r = normaliser(photon(undefined, 'place', 'house', 'house', [6, 45], { housenumber: '12', street: 'rue Royale' }), 'Sans nom');
    expect(r.nom).toBe('12 rue Royale');
  });
});

describe('correspondance', () => {
  it('ignore accents, casse et tirets', () => {
    expect(simplifier('Montréal-la-Cluse')).toBe('montreal la cluse');
    expect(correspondance('Montréal', 'montreal')).toBe(3);
    expect(correspondance('Montréal-la-Cluse', 'montreal')).toBe(2);
    expect(correspondance('Crac de Montréal', 'montreal')).toBe(1);
    expect(correspondance('Annecy', 'montreal')).toBe(0);
  });
});

describe('trierResultats', () => {
  // Réponse de Photon pour « Montréal » avec un biais près d'Annecy (23 novembre 2026)
  const montreal = [
    photon('Montréal', 'place', 'city', 'city', [-73.57, 45.5], { state: 'Québec', country: 'Canada' }),
    photon('Montréal', 'place', 'village', 'city', [5.58, 46.18], { state: 'Auvergne-Rhône-Alpes', country: 'France' }),
    photon('Montréal', 'place', 'village', 'city', [2.14, 43.2], { state: 'Occitanie', country: 'France' }),
    photon('Montréal-la-Cluse', 'place', 'village', 'city', [5.58, 46.18], { state: 'Auvergne-Rhône-Alpes', country: 'France' }),
    photon('Montréal', 'place', 'hamlet', 'district', [5.9, 45.6], { state: 'Auvergne-Rhône-Alpes', country: 'France' }),
    photon('Crac de Montréal', 'building', 'yes', 'house', [35.6, 30.3], { country: 'Jordanie' }),
  ].map((f) => normaliser(f));

  it('met la grande ville devant le village voisin homonyme', () => {
    const tries = trierResultats(montreal, { q: 'Montréal', centre: ANNECY });
    expect(tries[0].lieux).toContain('Canada');
  });

  it('même si Photon a mis le village en premier', () => {
    const inverse = [montreal[1], montreal[0], ...montreal.slice(2)];
    const tries = trierResultats(inverse, { q: 'Montréal', centre: ANNECY });
    expect(tries[0].lieux).toContain('Canada');
  });

  it('départage deux villages homonymes par la proximité', () => {
    const tries = trierResultats(montreal, { q: 'Montréal', centre: ANNECY });
    const villages = tries.filter((r) => r.nom === 'Montréal' && r.type === 'village');
    expect(villages[0].lieux).toContain('Auvergne-Rhône-Alpes');
  });

  it('fait passer un sommet proche devant une rue lointaine', () => {
    const items = [
      photon('Rue de la Tournette', 'highway', 'residential', 'street', [2.3, 48.8], { country: 'France' }),
      photon('La Tournette', 'natural', 'peak', 'other', [6.27, 45.83], { country: 'France' }),
    ].map((f) => normaliser(f));
    expect(trierResultats(items, { q: 'Tournette', centre: ANNECY })[0].type).toBe('sommet');
  });

  it('retire les doublons', () => {
    expect(trierResultats([montreal[0], montreal[0], montreal[1]], { q: 'Montréal' })).toHaveLength(2);
  });
});

describe('dernières recherches', () => {
  const lieu = (nom, cle = nom) => ({ nom, cle, type: 'ville', lieux: '', lng: 0, lat: 0 });

  it('ajoute en tête, sans doublon, 8 au plus', () => {
    let recents = [];
    for (let i = 0; i < 12; i++) recents = ajouterRecent(recents, lieu(`L${i}`));
    expect(recents).toHaveLength(NB_RECENTS);
    expect(recents[0].nom).toBe('L11');
    recents = ajouterRecent(recents, lieu('L8'));
    expect(recents[0].nom).toBe('L8');
    expect(recents.filter((r) => r.nom === 'L8')).toHaveLength(1);
  });

  it('ne garde pas les champs du tri', () => {
    const [r] = ajouterRecent([], { ...lieu('A'), poids: 50, recent: true });
    expect(r).not.toHaveProperty('poids');
    expect(r).not.toHaveProperty('recent');
  });

  it('en retire une', () => {
    expect(retirerRecent([lieu('A'), lieu('B')], lieu('A')).map((r) => r.nom)).toEqual(['B']);
  });

  it('fait remonter celles qui correspondent à la saisie', () => {
    const recents = [lieu('Chamonix-Mont-Blanc', 'c'), lieu('Annecy', 'a')];
    expect(recentsCorrespondants(recents, 'cham').map((r) => r.nom)).toEqual(['Chamonix-Mont-Blanc']);
    const resultats = [lieu('Chambéry', 'b'), lieu('Chamonix-Mont-Blanc', 'c')];
    const fusion = fusionnerAvecRecents(resultats, recents, 'cham');
    expect(fusion.map((r) => r.nom)).toEqual(['Chamonix-Mont-Blanc', 'Chambéry']);
    expect(fusion[0].recent).toBe(true);
  });
});

describe('lireCoordonnees', () => {
  it('lit « lat, lng »', () => {
    expect(lireCoordonnees('45.88, 6.87')).toEqual({ lat: 45.88, lng: 6.87 });
    expect(lireCoordonnees('-33.9 18.4')).toEqual({ lat: -33.9, lng: 18.4 });
  });

  it('refuse le texte et les valeurs hors limites', () => {
    expect(lireCoordonnees('Chamonix')).toBeNull();
    expect(lireCoordonnees('95, 6')).toBeNull();
  });
});
