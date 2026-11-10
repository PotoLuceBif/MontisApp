import { describe, expect, it } from 'vitest';
import { carresDeLaVue, cheminSurReseau, creerReseau, dansMassif, dureeSkiRando, lireCarresSkitour, massifAuPoint, nomMassif, risqueDuMassif } from '../src/skirando-calcul.js';

const carre = (id, x0, y0, x1, y1, extra = {}) => ({
  id,
  boite: [x0, y0, x1, y1],
  contours: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]],
  ...extra,
});

describe('massif d’un point', () => {
  const troue = {
    ...carre('A', 0, 0, 10, 10),
    contours: [[
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ]],
  };

  it('trouve le point dedans, pas dehors ni dans un trou', () => {
    expect(dansMassif([2, 2], troue)).toBe(true);
    expect(dansMassif([11, 2], troue)).toBe(false);
    expect(dansMassif([5, 5], troue)).toBe(false);
  });

  it('préfère le massif qui a publié un niveau', () => {
    const massifs = [carre('IT-MeteoMont-1', 0, 0, 10, 10), carre('IT-23-01', 0, 0, 10, 10)];
    expect(massifAuPoint(massifs, [5, 5]).id).toBe('IT-MeteoMont-1');
    expect(massifAuPoint(massifs, [5, 5], { 'IT-23-01': 3 }).id).toBe('IT-23-01');
    expect(massifAuPoint(massifs, [20, 20])).toBeNull();
    expect(massifAuPoint(null, [5, 5])).toBeNull();
  });

  it('nomme le massif dans la langue, sinon dans l’autre, sinon par son code', () => {
    expect(nomMassif({ id: 'FR-01', fr: 'Chablais' }, 'en')).toBe('Chablais');
    expect(nomMassif({ id: 'AT-07', fr: 'Tyrol', en: 'Tyrol EN' }, 'en')).toBe('Tyrol EN');
    expect(nomMassif({ id: 'X-1' })).toBe('X-1');
    expect(nomMassif(null)).toBe('');
  });

  it('lit les niveaux du jour, avec matin, après-midi, haut et bas', () => {
    const niveaux = { 'FR-01': 3, 'FR-01:am': 2, 'FR-01:pm': 3, 'FR-01:high': 3, 'FR-01:low': 2 };
    expect(risqueDuMassif(niveaux, 'FR-01')).toEqual({ max: 3, matin: 2, apresMidi: 3, haut: 3, bas: 2 });
    expect(risqueDuMassif({}, 'FR-02').max).toBe(0);
  });
});

describe('itinéraires de ski de rando', () => {
  it('donne les carrés de 1° de la vue, seulement ceux qui existent, et renonce à une vue trop large', () => {
    expect(carresDeLaVue([6.8, 45.9, 7.1, 46.05])).toEqual(['6_45', '6_46', '7_45', '7_46']);
    expect(carresDeLaVue([6.8, 45.9, 7.1, 46.05], new Set(['6_45', '7_46']))).toEqual(['6_45', '7_46']);
    expect(carresDeLaVue([-1.2, 44.5, 0.2, 45.2])).toEqual(['-2_44', '-2_45', '-1_44', '-1_45', '0_44', '0_45']);
    expect(carresDeLaVue([5, 44, 9, 47])).toBeNull();
  });

  it('garde les itinéraires de la vue, une seule fois, nommés et longs d’abord', () => {
    const ligne = (x) => [[x, 45.95], [x + 0.01, 45.95]];
    const carreA = [
      { i: 'a', n: 'Col du Passon', d: 'advanced', o: 'relation/12', l: [ligne(6.9)] },
      { i: 'b', l: [ligne(6.95), ligne(6.97)] },
      { i: 'loin', n: 'Ailleurs', l: [ligne(6.1)] },
      { i: 'mauvais', l: [[[6.9, 'x'], [6.91, 45.95]]] },
    ];
    const carreB = [{ i: 'a', n: 'Col du Passon', l: [ligne(6.9)] }, { i: 'c', n: 'Petit', d: 'pas une difficulté', o: 'javascript:alert(1)', l: [[[6.92, 45.95], [6.921, 45.95]]] }];
    const itineraires = lireCarresSkitour([carreA, carreB, null], [6.8, 45.9, 7.1, 46]);
    expect(itineraires.map(({ id }) => id)).toEqual(['a', 'c', 'b']);
    expect(itineraires[0]).toMatchObject({ nom: 'Col du Passon', difficulte: 'advanced', osm: 'relation/12' });
    expect(itineraires[1]).toMatchObject({ difficulte: null, osm: null });
    expect(itineraires[2].lignes).toHaveLength(2);
    expect(itineraires[0].longueur).toBeGreaterThan(700);
  });

  it('supporte des fichiers vides ou cassés', () => {
    expect(lireCarresSkitour(null, [0, 0, 1, 1])).toEqual([]);
    expect(lireCarresSkitour(['x', [{}], [{ i: 'z', l: 'x' }]], [0, 0, 1, 1])).toEqual([]);
  });
});

describe('durée en ski de rando', () => {
  it('compte surtout la montée', () => {
    // 10 km, 1 200 m de montée et de descente : 3 h de montée, 36 min de descente, plus la moitié du plat
    expect(dureeSkiRando(10000, 1200, 1200)).toBeCloseTo(3.6 + 2.5 / 2, 5);
    expect(dureeSkiRando(8000, 0, 0)).toBeCloseTo(2, 5);
  });
});

describe('routage sur les itinéraires de ski de rando', () => {
  // Un Y : tronc de A vers B, puis deux branches vers C et D ; E est un itinéraire isolé
  const A = [7, 45.9];
  const B = [7, 45.91];
  const C = [7.01, 45.92];
  const D = [6.99, 45.92];
  const reseau = creerReseau([[A, [7, 45.905], B], [B, C], [[6.99, 45.92], [7, 45.91]], [[7.2, 46], [7.21, 46]]]);

  it('suit le réseau d’un point à l’autre', () => {
    const geom = cheminSurReseau(reseau, A, C);
    expect(geom[0]).toEqual(A);
    expect(geom[geom.length - 1]).toEqual(C);
    expect(geom).toContainEqual(B);
    expect(geom).not.toContainEqual(D);
  });

  it('accroche des points posés près du réseau, et les garde en extrémités', () => {
    const presDeA = [7.0005, 45.9];
    const geom = cheminSurReseau(reseau, presDeA, D);
    expect(geom[0]).toEqual(presDeA);
    expect(geom[1]).toEqual(A);
    expect(geom[geom.length - 1]).toEqual(D);
  });

  it('renonce loin du réseau ou entre deux réseaux séparés', () => {
    expect(cheminSurReseau(reseau, [7.05, 45.95], C)).toBeNull();
    expect(cheminSurReseau(reseau, A, [7.21, 46])).toBeNull();
    expect(cheminSurReseau(creerReseau([]), A, C)).toBeNull();
  });

  it('raccorde un bout qui s’arrête à quelques mètres d’un autre itinéraire', () => {
    const presque = creerReseau([[A, B], [[7.00005, 45.91005], C]]);
    expect(cheminSurReseau(presque, A, C)).not.toBeNull();
  });
});
