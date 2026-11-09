import { describe, expect, it } from 'vitest';
import { anneauEnPixels, empriseMetres, geometrieZone, limitesTuile, pointDansAnneau, rangerParPays, relationTuile, zoneCouvre } from '../src/fonds-calcul.js';
import { ZONES_PAYS } from '../src/fonds-zones.js';
import { EMPRISES_PAYS } from '../src/fonds-emprises.js';
import { CALQUES, FONDS, PAYS, REGIONS, empriseDe, zoneDe } from '../src/fonds-catalogue.js';

const CARRE = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('pointDansAnneau', () => {
  it('distingue dedans et dehors', () => {
    expect(pointDansAnneau(CARRE, 5, 5)).toBe(true);
    expect(pointDansAnneau(CARRE, 15, 5)).toBe(false);
    expect(pointDansAnneau(CARRE, 5, -1)).toBe(false);
  });
});

describe('zoneCouvre', () => {
  it('couvre tout sans zone', () => {
    expect(zoneCouvre(null, 120, -40)).toBe(true);
  });

  it('lit un rectangle', () => {
    expect(zoneCouvre([0, 40, 4, 43], 2, 41.5)).toBe(true);
    expect(zoneCouvre([0, 40, 4, 43], 5, 41.5)).toBe(false);
  });

  it('suit le contour du pays, pas son rectangle', () => {
    const options = { zones: ZONES_PAYS };
    expect(zoneCouvre('CH', 7.75, 46.02, options)).toBe(true); // Zermatt
    expect(zoneCouvre('CH', 6.87, 45.92, options)).toBe(false); // Chamonix, dans le rectangle suisse
    expect(zoneCouvre('FR', 6.87, 45.92, options)).toBe(true);
    expect(zoneCouvre('FR', 9.1, 42.2, options)).toBe(true); // Corse
    expect(zoneCouvre('AT', 11.4, 47.26, options)).toBe(true); // Innsbruck
    expect(zoneCouvre('AT', 11.58, 48.14, options)).toBe(false); // Munich
    expect(zoneCouvre('US', -121.76, 46.85, options)).toBe(true); // Mont Rainier
    expect(zoneCouvre('US', -151, 63.07, options)).toBe(true); // Denali, Alaska
    expect(zoneCouvre('CA', -115.57, 51.18, options)).toBe(true); // Banff
    expect(zoneCouvre('JP', 138.73, 35.36, options)).toBe(true); // Fuji
    expect(zoneCouvre('NO', 8.3, 61.6, options)).toBe(true); // Jotunheimen
    expect(zoneCouvre('ES', 0.0, 42.6, options)).toBe(true); // Pyrénées aragonaises
  });

  it('se replie sur le rectangle tant que les contours manquent', () => {
    expect(zoneCouvre('CH', 6.87, 45.92, { emprise: EMPRISES_PAYS.CH })).toBe(true);
    expect(zoneCouvre('CH', 2, 48)).toBe(false);
  });
});

describe('geometrieZone', () => {
  it('change un rectangle en polygone fermé', () => {
    expect(geometrieZone([0, 1, 2, 3])).toEqual([[[[0, 1], [2, 1], [2, 3], [0, 3], [0, 1]]]]);
  });

  it('renvoie le contour du pays, ou rien', () => {
    expect(geometrieZone('FR', ZONES_PAYS)).toBe(ZONES_PAYS.FR);
    expect(geometrieZone('XX', ZONES_PAYS)).toBeNull();
    expect(geometrieZone(null)).toBeNull();
  });
});

describe('tuiles découpées à la frontière', () => {
  it('donne l\'emprise d\'une tuile', () => {
    expect(limitesTuile(0, 0, 0).map((v) => Math.round(v * 100) / 100)).toEqual([-180, -85.05, 180, 85.05]);
    expect(empriseMetres(1, 1, 0)).toBe('0.00,0.00,20037508.34,20037508.34');
  });

  it('classe une tuile dedans, dehors ou au bord', () => {
    const suisse = ZONES_PAYS.CH;
    const tuile = (lat, lng, z) => {
      const n = 2 ** z;
      const r = (lat * Math.PI) / 180;
      return [z, Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)];
    };
    expect(relationTuile(suisse, ...tuile(46.8, 8.2, 13))).toBe('dedans'); // Obwald
    expect(relationTuile(suisse, ...tuile(45.92, 6.87, 13))).toBe('dehors'); // Chamonix
    expect(relationTuile(suisse, ...tuile(46.2, 6.1, 9))).toBe('bord'); // Genève
    expect(relationTuile(suisse, 0, 0, 0)).toBe('bord');
  });

  it('place un anneau en pixels de tuile', () => {
    expect(anneauEnPixels([[-180, 0], [0, 0]], 0, 0, 0, 256).map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([[0, 128], [128, 128]]);
  });
});

describe('rangerParPays', () => {
  it('range par région puis par pays, sans les vides', () => {
    const rangement = rangerParPays([{ id: 'a', pays: 'CH' }, { id: 'b', pays: 'FR' }, { id: 'c', pays: 'JP' }, { id: 'd', pays: null }], PAYS, REGIONS);
    expect(rangement.map((r) => r.region)).toEqual(['europe', 'asie']);
    expect(rangement[0].pays.map((p) => p.code)).toEqual(['FR', 'CH']);
    expect(rangement[1].pays[0].elements.map((e) => e.id)).toEqual(['c']);
  });
});

describe('catalogue', () => {
  const tous = [...FONDS, ...CALQUES];
  it('a des identifiants uniques', () => {
    expect(new Set(tous.map((f) => f.id)).size).toBe(tous.length);
  });

  it('donne une zone connue à chaque fond national', () => {
    for (const f of tous.filter((x) => x.pays)) {
      expect(PAYS.some((p) => p.code === f.pays)).toBe(true);
      const zone = zoneDe(f);
      if (!Array.isArray(zone)) expect(ZONES_PAYS[zone], f.id).toBeTruthy();
      expect(empriseDe(f), f.id).toHaveLength(4);
    }
  });

  it('crédite chaque source', () => {
    for (const f of tous.filter((x) => x.source)) {
      expect(f.source.attribution, f.id).toBeTruthy();
      expect(f.source.tiles[0], f.id).toMatch(/^https:\/\//);
    }
  });
});
