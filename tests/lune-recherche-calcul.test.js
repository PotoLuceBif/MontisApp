import { describe, expect, it } from 'vitest';
import { chercherLieux, normaliser, sitesParDate, zoomPourLieu } from '../src/lune-recherche-calcul.js';

const LIEUX = [
  ['Mare Tranquillitatis', 'ME', 877, 30.8, 8.35, 'Sea of Tranquility.'],
  ['Copernicus', 'AA', 96, -20.08, 9.62, 'Nicolaus; Polish astronomer.'],
  ['Copernicus A', 'AA', 3, -22, 8, ''],
  ['Tycho', 'AA', 85, -11.36, -43.31, 'Tycho Brahe.'],
  ['Mons Hadley', 'MO', 25, 4.12, 26.69, ''],
];

describe('recherche sur la Lune', () => {
  it('ignore accents, majuscules et apostrophes', () => {
    expect(normaliser('Mer de l’Écume')).toBe('mer de l ecume');
  });
  it('trouve par le nom traduit ou le latin', () => {
    expect(chercherLieux(LIEUX, 'tranquill', { langue: 'fr' })[0].lieu.nom).toBe('Mer de la Tranquillité');
    expect(chercherLieux(LIEUX, 'Mare Tranq', { langue: 'en' })[0].lieu.nom).toBe('Sea of Tranquility');
    expect(chercherLieux(LIEUX, 'mont hadley')[0].lieu.latin).toBe('Mons Hadley');
  });
  it('met en tête les noms qui commencent par le texte, puis les plus grands', () => {
    const r = chercherLieux(LIEUX, 'coper');
    expect(r.map((x) => x.lieu.nom)).toEqual(['Copernicus', 'Copernicus A']);
  });
  it('trouve les sites d’alunissage', () => {
    const r = chercherLieux(LIEUX, 'apollo 1');
    expect(r[0].type).toBe('site');
    expect(r.some((x) => x.site?.id === 'apollo-11')).toBe(true);
  });
  it('attend au moins deux lettres', () => {
    expect(chercherLieux(LIEUX, 'c')).toEqual([]);
  });
  it('règle le zoom selon la taille', () => {
    expect(zoomPourLieu(877)).toBeLessThan(zoomPourLieu(96));
    expect(zoomPourLieu(1)).toBe(8);
    expect(zoomPourLieu(3000)).toBe(1.6);
    expect(zoomPourLieu(0)).toBe(6.5);
  });
  it('range les sites par date', () => {
    const sites = sitesParDate();
    expect(sites[0].id).toBe('luna-9');
    expect(sites.at(-1).date >= sites[0].date).toBe(true);
  });
});
