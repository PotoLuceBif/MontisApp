import { describe, expect, it } from 'vitest';
import { accordVent, lireSecteurs, lireTerrains, secteurDe, statutTerrain, terrainsEnGeoJSON } from '../src/terrains-calcul.js';

const brut = [
  {
    suid: 1423, toponym: 'BURDIGNES - GRAND-TONY', city: 'BURDIGNES', possible_usages_text: 'parapente',
    flying_functions_text: 'décollage', latitude: 45.2499, longitude: 4.5371, altitude: 1087, status: 'actif',
    wind_orientations_ok: 'SE;S', wind_orientations_nok: 'N;NE;E;SO;O;NO', terrain_experience_conseillee: 'ippi4',
    warnings: 'Les sapins ont poussé !\r\n', walking_time_from_parking_minutes: 2,
    last_modification_datetime: '2026-10-20T18:01:56+02:00',
  },
  {
    suid: 14076, toponym: 'LES FEES', city: 'AILLONS', possible_usages_text: 'parapente',
    flying_functions_text: 'atterrissage', latitude: 45.62, longitude: 6.08, altitude: 915, status: 'interdit', warnings: 'ras', restrictions: ' . ',
  },
  { suid: 3, toponym: 'PLAGE', possible_usages_text: 'kite eau', flying_functions_text: 'décollage', latitude: 43, longitude: 3 },
  { suid: 4, toponym: 'TREUIL', possible_usages_text: 'parapente;delta', flying_functions_text: 'treuil', latitude: 48, longitude: 2, status: 'actif_autorisation_systematique_requise' },
  { suid: 5, toponym: 'SANS FONCTION', possible_usages_text: 'parapente', latitude: 45, longitude: 6 },
  { suid: 6, toponym: 'SANS POSITION', possible_usages_text: 'parapente', flying_functions_text: 'décollage' },
];

describe('lireTerrains', () => {
  const terrains = lireTerrains(brut);

  it('ne garde que le vol libre, avec une position et une fonction', () => {
    expect(terrains.map(({ id }) => id)).toEqual(['1423', '14076', '4']);
  });

  it('lit orientations, niveau, consignes et marche', () => {
    expect(terrains[0]).toMatchObject({
      genre: 'decollage', statut: 'ok', altitude: 1087, favorables: ['SE', 'S'],
      defavorables: ['N', 'NE', 'E', 'SO', 'O', 'NO'], niveau: '4', consignes: 'Les sapins ont poussé !', marche: 2,
    });
  });

  it('efface les consignes vides (« ras », « . ») et lit le statut', () => {
    expect(terrains[1]).toMatchObject({ genre: 'atterrissage', statut: 'interdit', consignes: '', restrictions: '' });
    expect(terrains[2]).toMatchObject({ genre: 'decollage', statut: 'autorisation' });
  });

  it('marque en rouge les terrains interdits et fermés', () => {
    const classes = terrainsEnGeoJSON(terrains).features.map((feature) => feature.properties.classe);
    expect(classes).toEqual(['decollage', 'interdit', 'decollage']);
    expect(statutTerrain('non_praticable_temporaire')).toBe('ferme');
    expect(statutTerrain('interdit_sauf_autorisation')).toBe('autorisation');
  });
});

describe('orientations', () => {
  it('lit les saisies irrégulières', () => {
    expect(lireSecteurs('SE,S,SO')).toEqual(['SE', 'S', 'SO']);
    expect(lireSecteurs('NO-N')).toEqual(['N', 'NO']);
    expect(lireSecteurs('NE,E,E,NE')).toEqual(['NE', 'E']);
    expect(lireSecteurs(null)).toEqual([]);
  });

  it('range une direction dans son secteur', () => {
    expect(secteurDe(0)).toBe('N');
    expect(secteurDe(350)).toBe('N');
    expect(secteurDe(200)).toBe('S');
    expect(secteurDe(248)).toBe('O');
    expect(secteurDe(-45)).toBe('NO');
    expect(secteurDe(Number.NaN)).toBeNull();
  });

  it('dit si le vent est dans l’axe', () => {
    const terrain = { favorables: ['SE', 'S'], defavorables: ['N', 'O'] };
    expect(accordVent(170, terrain)).toBe('favorable');
    expect(accordVent(10, terrain)).toBe('defavorable');
    expect(accordVent(60, terrain)).toBe('inconnu');
    expect(accordVent(Number.NaN, terrain)).toBe('inconnu');
  });
});
