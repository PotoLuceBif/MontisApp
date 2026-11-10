import { describe, expect, it } from 'vitest';
import {
  fragmentVue, fragmentPoint, lireFragment, encoderPolyligne, decoderPolyligne, simplifier,
  compacterParcours, deplierParcours, encoderDonnees, decoderDonnees, fragmentParcours, lireParcours,
} from '../src/partage-calcul.js';

describe('vue et point', () => {
  it('écrit et relit une vue 3D avec son fond', () => {
    const fragment = fragmentVue({ lng: 6.865123456, lat: 45.832, zoom: 13.456, bearing: -30, pitch: 60.4, mode3D: true, fond: 'ign-plan' });
    expect(fragment).toBe('vue=13.46/45.832/6.86512/330/60&3d=1&fond=ign-plan');
    expect(lireFragment(`#${fragment}`)).toEqual({ type: 'vue', lng: 6.86512, lat: 45.832, zoom: 13.46, bearing: 330, pitch: 60, mode3D: true, fond: 'ign-plan' });
  });

  it('une vue 2D au nord reste courte, sans inclinaison', () => {
    const fragment = fragmentVue({ lng: 6.8, lat: 45.9, zoom: 11, pitch: 40, mode3D: false, fond: 'montis' });
    expect(fragment).toBe('vue=11/45.9/6.8');
    expect(lireFragment(fragment).pitch).toBe(0);
  });

  it('écrit et relit un point', () => {
    expect(lireFragment(`#${fragmentPoint({ lng: 6.86512, lat: 45.83215 })}`)).toEqual({ type: 'point', lng: 6.86512, lat: 45.83215, zoom: 14 });
  });

  it('refuse les adresses incohérentes', () => {
    expect(lireFragment('')).toBeNull();
    expect(lireFragment('#autre=1')).toBeNull();
    expect(lireFragment('#vue=30/45/6')).toBeNull();
    expect(lireFragment('#vue=12/95/6')).toBeNull();
    expect(lireFragment('#point=45')).toBeNull();
    expect(lireFragment('#point=abc/6')).toBeNull();
    expect(lireFragment('#parcours=')).toBeNull();
  });
});

describe('polyligne', () => {
  it('fait l’aller-retour au cent-millième de degré', () => {
    const points = [[6.86512, 45.83215], [6.87, 45.8], [-120.2, 38.5], [-120.95, 40.7]];
    expect(decoderPolyligne(encoderPolyligne(points))).toEqual(points);
  });

  it('donne l’exemple de référence de Google', () => {
    expect(encoderPolyligne([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]])).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('signale une polyligne tronquée', () => {
    expect(() => decoderPolyligne('_p~iF~ps|')).toThrow();
  });
});

describe('simplification', () => {
  it('retire les points alignés et garde les coins', () => {
    const points = [[0, 45], [0.001, 45], [0.002, 45], [0.002, 45.001]];
    expect(simplifier(points, 0.00001)).toEqual([[0, 45], [0.002, 45], [0.002, 45.001]]);
    expect(simplifier(points, 0)).toBe(points);
  });
});

const parcours = {
  activite: 'randonnee',
  pratique: 'randonnee',
  nom: 'Lac Blanc',
  etapes: [
    { lng: 6.88, lat: 45.97, mode: 'route', troncon: null },
    { lng: 6.89, lat: 45.98, mode: 'route', troncon: { geom: [[6.88, 45.97], [6.885, 45.975], [6.89, 45.98]], troncons: [{ longueur: 1350.4, voie: 'chemin', difficulte: 2, marches: false }], source: 'brouter', pratique: 'randonnee' } },
    { lng: 6.9, lat: 45.99, mode: 'libre', troncon: { geom: [[6.89, 45.98], [6.9, 45.99]], troncons: [{ longueur: 1300, voie: 'inconnu', difficulte: null, marches: true }], source: 'libre' } },
  ],
};

describe('parcours', () => {
  it('compacte et déplie sans rien perdre', () => {
    const relu = deplierParcours(compacterParcours(parcours));
    expect(relu.nom).toBe('Lac Blanc');
    expect(relu.activite).toBe('randonnee');
    expect(relu.etapes[0]).toEqual({ lng: 6.88, lat: 45.97, mode: 'route', troncon: null });
    expect(relu.etapes[1].troncon).toEqual({ ...parcours.etapes[1].troncon, troncons: [{ longueur: 1350, voie: 'chemin', difficulte: 2, marches: false }] });
    expect(relu.etapes[2].mode).toBe('libre');
    expect(relu.etapes[2].troncon.troncons[0].marches).toBe(true);
  });

  it('nettoie un tronçon venu d’un lien bricolé', () => {
    const relu = deplierParcours({ v: 1, a: 'velo', e: [['r', 6, 45], ['x', 6.1, 45.1, { g: encoderPolyligne([[6, 45], [6.1, 45.1]]), t: [[-5, 'lave', 'dur', 1], 'n’importe'], s: 'ailleurs' }]] });
    expect(relu.etapes[1].mode).toBe('route');
    expect(relu.etapes[1].troncon.source).toBe('trace');
    expect(relu.etapes[1].troncon.troncons).toEqual([
      { longueur: 0, voie: 'inconnu', difficulte: null, marches: true },
      { longueur: 0, voie: 'inconnu', difficulte: null, marches: false },
    ]);
  });

  it('refuse un parcours incomplet', () => {
    expect(deplierParcours({ v: 1, a: 'velo', e: [['r', 6, 45]] })).toBeNull();
    expect(deplierParcours({ v: 2, a: 'velo', e: [] })).toBeNull();
    expect(() => deplierParcours({ v: 1, a: 'velo', e: [['r', 600, 45], ['r', 6, 45]] })).toThrow();
  });

  it('passe par la compression et l’adresse', async () => {
    const code = await encoderDonnees({ a: 'é', b: [1, 2] });
    expect(code).toMatch(/^[01][A-Za-z0-9_-]+$/);
    expect(await decoderDonnees(code)).toEqual({ a: 'é', b: [1, 2] });
    const { fragment, simplifie } = await fragmentParcours(parcours);
    expect(simplifie).toBe(false);
    const demande = lireFragment(`#${fragment}`);
    expect(demande.type).toBe('parcours');
    expect((await lireParcours(demande.code)).etapes).toHaveLength(3);
    expect(await lireParcours('1zzzz')).toBeNull();
  });

  it('simplifie un long tracé pour tenir dans le lien', async () => {
    let graine = 7;
    const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
    const geom = Array.from({ length: 4000 }, (_, i) => [6.8 + i * 0.00005 + hasard() * 0.00003, 45.9 + Math.sin(i / 60) * 0.004 + hasard() * 0.00003]);
    const long = { ...parcours, etapes: [parcours.etapes[0], { ...parcours.etapes[1], troncon: { ...parcours.etapes[1].troncon, geom } }] };
    const resultat = await fragmentParcours(long, 4000);
    expect(resultat.simplifie).toBe(true);
    expect(resultat.fragment.length).toBeLessThanOrEqual(4000);
    expect(await fragmentParcours(long, 50)).toBeNull();
  });
});
