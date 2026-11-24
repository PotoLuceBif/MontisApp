import { describe, expect, it } from 'vitest';
import {
  angleApparent, dedoublonner, directionCamera, directionVers, ecartCap, estVisible, horizonA, ligneHorizon,
  placerEtiquettes, pointA, pointCardinal, projeter, champHorizontal,
} from '../src/panorama-calcul.js';

const chamonix = { lng: 6.8694, lat: 45.9237, altitude: 1035 };
const montBlanc = { lng: 6.8652, lat: 45.8326, altitude: 4807 };

describe('direction et distance', () => {
  it('donne le cap et la distance du Mont Blanc depuis Chamonix', () => {
    const { cap, distance } = directionVers(chamonix, montBlanc);
    expect(distance).toBeGreaterThan(10000);
    expect(distance).toBeLessThan(10300);
    expect(cap).toBeGreaterThan(180);
    expect(cap).toBeLessThan(185);
  });

  it('retrouve le point de départ par le chemin inverse', () => {
    const p = pointA(chamonix, 37, 25000);
    const retour = directionVers(chamonix, p);
    expect(retour.distance).toBeCloseTo(25000, 0);
    expect(retour.cap).toBeCloseTo(37, 4);
  });

  it('mesure les écarts de cap par le plus court chemin', () => {
    expect(ecartCap(5, 355)).toBe(10);
    expect(ecartCap(355, 5)).toBe(-10);
    expect(ecartCap(180, 0)).toBe(-180);
  });

  it('nomme les points cardinaux', () => {
    expect(pointCardinal(2)).toBe('N');
    expect(pointCardinal(359)).toBe('N');
    expect(pointCardinal(225)).toBe('SO');
  });
});

describe('angle apparent', () => {
  it('abaisse un point lointain par la courbure, un peu rendue par la réfraction', () => {
    // À 100 km, la Terre « cache » environ 680 m (785 m sans réfraction)
    const plat = angleApparent(0, 100000, { courbure: false });
    const courbe = angleApparent(0, 100000);
    expect(plat).toBe(0);
    const chute = Math.tan((-courbe * Math.PI) / 180) * 100000;
    expect(chute).toBeGreaterThan(660);
    expect(chute).toBeLessThan(700);
  });

  it('regarde le Mont Blanc à une vingtaine de degrés depuis Chamonix', () => {
    const { distance } = directionVers(chamonix, montBlanc);
    const angle = angleApparent(montBlanc.altitude - chamonix.altitude, distance);
    expect(angle).toBeGreaterThan(19);
    expect(angle).toBeLessThan(21);
  });
});

describe('visibilité derrière le relief', () => {
  const depuis = { lng: 7, lat: 46, altitude: 1000 };
  const sommet = { ...pointA(depuis, 90, 20000), altitude: 2000 };

  it('voit un sommet sur une plaine', () => {
    const plaine = () => 1000;
    expect(estVisible(depuis, sommet, plaine).visible).toBe(true);
  });

  it('cache un sommet derrière une crête plus haute à mi-chemin', () => {
    const crete = { ...pointA(depuis, 90, 10000) };
    const relief = (lng) => (Math.abs(lng - crete.lng) < 0.01 ? 2000 : 1000);
    expect(estVisible(depuis, sommet, relief).visible).toBe(false);
  });

  it('ne se cache pas lui-même par le relief lu près de son sommet', () => {
    const relief = (lng) => (lng > sommet.lng - 0.002 ? 2010 : 1000);
    expect(estVisible(depuis, sommet, relief).visible).toBe(true);
  });

  it('cache un sommet lointain derrière la courbure de la Terre', () => {
    // Depuis 100 m, l'horizon de la mer est à 38 km : à 150 km, la Terre cache environ 850 m
    const bas = { ...depuis, altitude: 100 };
    const loin = { ...pointA(bas, 90, 150000), altitude: 300 };
    expect(estVisible(bas, loin, () => 0).visible).toBe(false);
    expect(estVisible(bas, loin, () => 0, { courbure: false }).visible).toBe(true);
    expect(estVisible(bas, { ...loin, altitude: 1500 }, () => 0).visible).toBe(true);
  });
});

describe('ligne d\'horizon', () => {
  it('monte vers une montagne et reste basse ailleurs', () => {
    const depuis = { lng: 7, lat: 46, altitude: 1000 };
    const montagne = pointA(depuis, 90, 5000);
    const relief = (lng, lat) => (directionVers(montagne, { lng, lat }).distance < 1500 ? 3000 : 1000);
    const horizon = ligneHorizon(depuis, relief, { pas: 10, distanceMax: 20000 });
    expect(horizon.angles).toHaveLength(36);
    expect(horizonA(horizon, 90)).toBeGreaterThan(20);
    expect(horizonA(horizon, 270)).toBeLessThan(0.1);
    expect(horizonA(horizon, 95)).toBeCloseTo((horizon.angles[9] + horizon.angles[10]) / 2, 6);
  });
});

describe('projection à l\'écran', () => {
  const vue = { cap: 180, inclinaison: 0, champ: 40, largeur: 400, hauteur: 800 };

  it('met la direction regardée au centre', () => {
    expect(projeter(180, 0, vue)).toEqual({ x: 200, y: 400 });
  });

  it('pose à droite ce qui est à l\'ouest quand on regarde au sud, et en haut ce qui monte', () => {
    const p = projeter(190, 5, vue);
    expect(p.x).toBeGreaterThan(200);
    expect(p.y).toBeLessThan(400);
  });

  it('met le bord du champ au bord de l\'écran', () => {
    expect(projeter(180, 20, vue).y).toBeCloseTo(0, 6);
  });

  it('descend l\'horizon quand on relève le téléphone', () => {
    expect(projeter(180, 0, { ...vue, inclinaison: 10 }).y).toBeGreaterThan(400);
  });

  it('ne dessine rien derrière soi', () => {
    expect(projeter(0, 0, vue)).toBeNull();
  });

  it('élargit le champ horizontal sur un écran large', () => {
    expect(champHorizontal(40, 800, 400)).toBeGreaterThan(40);
    expect(champHorizontal(40, 400, 400)).toBeCloseTo(40, 6);
  });
});

describe('orientation du téléphone', () => {
  it('regarde au nord, à l\'horizontale, téléphone debout face au nord', () => {
    const d = directionCamera({ alpha: 0, beta: 90, gamma: 0 });
    expect(d.cap).toBeCloseTo(0, 6);
    expect(d.inclinaison).toBeCloseTo(0, 6);
    expect(d.aPlat).toBe(false);
  });

  it('regarde à l\'ouest quand alpha vaut 90 (alpha tourne dans le sens inverse)', () => {
    expect(directionCamera({ alpha: 90, beta: 90, gamma: 0 }).cap).toBeCloseTo(270, 6);
  });

  it('lève les yeux quand on penche le haut du téléphone vers l\'arrière', () => {
    expect(directionCamera({ alpha: 0, beta: 110, gamma: 0 }).inclinaison).toBeCloseTo(20, 6);
  });

  it('prend le haut de l\'appareil quand il est à plat', () => {
    const d = directionCamera({ alpha: 90, beta: 0, gamma: 0 });
    expect(d.aPlat).toBe(true);
    expect(d.cap).toBeCloseTo(270, 6);
    expect(d.inclinaison).toBe(-60);
  });

  it('refuse un événement sans valeurs', () => {
    expect(directionCamera({ alpha: null, beta: 90, gamma: 0 })).toBeNull();
  });
});

describe('étiquettes', () => {
  it('place les plus importantes d\'abord et empile celles qui se chevauchent', () => {
    const placees = placerEtiquettes([
      { id: 'a', x: 100, largeur: 80, importance: 1 },
      { id: 'b', x: 120, largeur: 80, importance: 5 },
      { id: 'c', x: 400, largeur: 80, importance: 2 },
    ], { rangees: 2 });
    const rangee = Object.fromEntries(placees.map((e) => [e.id, e.rangee]));
    expect(rangee).toEqual({ b: 0, c: 0, a: 1 });
  });

  it('écarte ce qui ne tient plus', () => {
    const placees = placerEtiquettes([
      { id: 'a', x: 100, largeur: 80, importance: 3 },
      { id: 'b', x: 100, largeur: 80, importance: 2 },
      { id: 'c', x: 100, largeur: 80, importance: 1 },
    ], { rangees: 2 });
    expect(placees.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('garde une seule fois un sommet lu dans deux tuiles', () => {
    const s = dedoublonner([
      { nom: 'Mont Blanc', lng: 6.8652, lat: 45.8326, altitude: null },
      { nom: 'Mont Blanc', lng: 6.8653, lat: 45.8327, altitude: 4807 },
      { nom: 'Dôme du Goûter', lng: 6.8457, lat: 45.8434, altitude: 4304 },
    ]);
    expect(s).toHaveLength(2);
    expect(s[0].altitude).toBe(4807);
  });
});
