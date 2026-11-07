import { describe, expect, it } from 'vitest';
import { ABSENCE_LONGUE, doitCentrerSurPosition } from '../src/ouverture-calcul.js';

const maintenant = Date.UTC(2026, 10, 7, 12);
const vue = { lng: 6, lat: 45, zoom: 10 };

describe('doitCentrerSurPosition', () => {
  it('se centre au premier lancement', () => {
    expect(doitCentrerSurPosition({ vueSauvee: null, derniereVisite: null, maintenant })).toBe(true);
  });

  it('reprend la dernière vue après une courte absence', () => {
    expect(doitCentrerSurPosition({ vueSauvee: vue, derniereVisite: maintenant - 60 * 1000, maintenant })).toBe(false);
    expect(doitCentrerSurPosition({ vueSauvee: vue, derniereVisite: maintenant - ABSENCE_LONGUE + 1, maintenant })).toBe(false);
  });

  it('se centre après une longue absence', () => {
    expect(doitCentrerSurPosition({ vueSauvee: vue, derniereVisite: maintenant - ABSENCE_LONGUE, maintenant })).toBe(true);
  });

  it('se centre si la date de la dernière visite manque (version précédente de l’appli)', () => {
    expect(doitCentrerSurPosition({ vueSauvee: vue, derniereVisite: undefined, maintenant })).toBe(true);
  });
});
