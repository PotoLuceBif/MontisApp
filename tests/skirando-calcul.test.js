import { describe, expect, it } from 'vitest';
import { cheminSurReseau, creerReseau, dansMassif, dureeSkiRando, lireItinerairesSkitour, massifAuPoint, nomMassif, raccorder, requeteSkitour, risqueDuMassif } from '../src/skirando-calcul.js';

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
  it('demande voies et relations dans la vue, dans l’ordre sud, ouest, nord, est', () => {
    const requete = requeteSkitour([6.8, 45.9, 7, 46]);
    expect(requete).toContain('way["piste:type"="skitour"](45.9000,6.8000,46.0000,7.0000)');
    expect(requete).toContain('out geom');
  });

  it('raccorde les bouts qui se suivent, même retournés', () => {
    const lignes = raccorder([[[0, 0], [0.01, 0]], [[0.02, 0], [0.01, 0]], [[1, 1], [1.01, 1]]]);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toEqual([[0, 0], [0.01, 0], [0.02, 0]]);
  });

  it('fait un itinéraire par relation, par nom, et garde seules les voies sans nom', () => {
    const geom = (x) => [{ lon: x, lat: 45 }, { lon: x + 0.01, lat: 45 }];
    const json = {
      elements: [
        { type: 'relation', id: 1, tags: { name: 'Tour du Buet', 'piste:difficulty': 'advanced' }, members: [{ type: 'way', ref: 10, geometry: geom(0) }, { type: 'way', ref: 11, geometry: geom(0.01) }, { type: 'way', ref: 12, geometry: geom(0.02) }] },
        { type: 'way', id: 10, tags: { 'piste:type': 'skitour' }, geometry: geom(0) },
        { type: 'way', id: 20, tags: { name: 'Col du Passon' }, geometry: geom(1) },
        { type: 'way', id: 21, tags: { name: 'col du passon' }, geometry: geom(1.01) },
        { type: 'way', id: 30, tags: { 'piste:difficulty': 'nimporte' }, geometry: geom(2) },
        { type: 'way', id: 31, tags: {}, geometry: [{ lon: 3, lat: 45 }] },
      ],
    };
    const itineraires = lireItinerairesSkitour(json);
    expect(itineraires.map(({ id }) => id)).toEqual(['relation/1', 'way/20', 'way/30']);
    expect(itineraires[0]).toMatchObject({ nom: 'Tour du Buet', difficulte: 'advanced' });
    expect(itineraires[0].lignes).toHaveLength(1);
    expect(itineraires[0].longueur).toBeGreaterThan(1500);
    expect(itineraires[1].lignes).toHaveLength(1);
    expect(itineraires[2]).toMatchObject({ nom: '', difficulte: null });
  });

  it('supporte une réponse vide ou cassée', () => {
    expect(lireItinerairesSkitour(null)).toEqual([]);
    expect(lireItinerairesSkitour({ elements: 'x' })).toEqual([]);
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
