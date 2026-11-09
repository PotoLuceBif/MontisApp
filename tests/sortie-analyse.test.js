import { describe, expect, it } from 'vitest';
import {
  analyserSortie, bornes, couleurDegrade, descentesSki, distancesCumulees, indiceProche, modesPossibles, morceaux, pentesLissees, variosLisses, vitessesLissees,
} from '../src/sortie-analyse.js';

const DEG_PAR_METRE = 1 / 111195; // latitude

// Sortie en ligne droite vers le nord : `pas` = [secondes, mètres, altitude gagnée] pour chaque point après le premier
function sortieDroite(pas, { type = 'rando', alt0 = 1000, extra = {} } = {}) {
  const t = [0];
  const lat = [45];
  const alt = [alt0];
  for (const [s, m, h = 0] of pas) {
    t.push(t.at(-1) + s * 1000);
    lat.push(lat.at(-1) + m * DEG_PAR_METRE);
    alt.push(alt.at(-1) + h);
  }
  return { type, coupures: [], points: { t, lng: lat.map(() => 6), lat, alt, ...extra } };
}
const repeter = (n, element) => Array.from({ length: n }, () => element);

describe('mesures de base', () => {
  it('cumule les distances sans compter les sauts entre segments', () => {
    const d = distancesCumulees({ lng: [6, 6, 6], lat: [45, 45 + 100 * DEG_PAR_METRE, 45 + 200 * DEG_PAR_METRE] }, [2]);
    expect(d[1]).toBeCloseTo(100, 0);
    expect(d[2]).toBeCloseTo(100, 0);
  });

  it('lisse la vitesse sur une fenêtre de temps', () => {
    const t = [0, 1000, 2000, 3000, 4000];
    const d = [0, 2, 4, 6, 8];
    expect([...vitessesLissees(t, d, 10)]).toEqual([2, 2, 2, 2, 2]);
  });

  it('garde une vitesse quand les points sont plus espacés que la fenêtre', () => {
    const t = [0, 20000, 40000];
    const d = [0, 30, 60];
    expect([...vitessesLissees(t, d, 10)]).toEqual([1.5, 1.5, 1.5]);
  });

  it('mesure la pente sur une fenêtre de distance', () => {
    const d = Array.from({ length: 11 }, (_, i) => i * 10);
    const alts = d.map((x) => x * 0.2);
    expect(pentesLissees(alts, d, 25)[5]).toBeCloseTo(20, 6);
  });
});

describe('lecture du temps', () => {
  it('donne la vitesse verticale', () => {
    expect([...variosLisses([0, 10000, 20000], [1000, 1020, 1040], 10)]).toEqual([2, 2, 2]);
  });

  it('trouve le point le plus proche dans une série croissante', () => {
    const serie = [0, 10, 20, 30];
    expect(indiceProche(serie, -5)).toBe(0);
    expect(indiceProche(serie, 14)).toBe(1);
    expect(indiceProche(serie, 16)).toBe(2);
    expect(indiceProche(serie, 99)).toBe(3);
  });
});

describe('mouvement et pauses', () => {
  // 10 min à 1 m/s, 5 min d'arrêt, 10 min à 1 m/s
  const sortie = sortieDroite([...repeter(60, [10, 10]), ...repeter(30, [10, 0]), ...repeter(60, [10, 10])]);
  const { stats, pauses, marquants } = analyserSortie(sortie);

  it('sépare temps en mouvement et pause', () => {
    expect(stats.duree).toBe(1500);
    expect(stats.tempsMouvement).toBeGreaterThan(1150);
    expect(stats.tempsMouvement).toBeLessThan(1250);
    expect(stats.distance).toBeCloseTo(1200, -1);
    expect(stats.vitesseMoyenne).toBeCloseTo(1, 1);
  });

  it('repère la pause et la marque sur la carte', () => {
    expect(pauses).toHaveLength(1);
    expect(pauses[0].duree).toBeGreaterThanOrEqual(250);
    expect(marquants.some((m) => m.type === 'pause')).toBe(true);
  });
});

describe('montée', () => {
  it('donne la vitesse de montée en m/h', () => {
    // 30 min à 0,5 m/s en gagnant 0,1 m/s : 360 m/h
    const { stats } = analyserSortie(sortieDroite(repeter(180, [10, 5, 1])));
    expect(stats.vitesseMontee).toBeCloseTo(360, -1);
    expect(stats.plus).toBeGreaterThan(170);
    expect(stats.altMax).toBeGreaterThan(1170);
  });
});

describe('ski', () => {
  it('compte les descentes et le dénivelé descendu', () => {
    const alts = [2000, 1800, 1600, 1700, 2000, 2100, 1900, 1910, 1700];
    const descentes = descentesSki(alts);
    expect(descentes).toHaveLength(2);
    expect(descentes[0]).toMatchObject({ debut: 0, fin: 2, chute: 400 });
    expect(descentes[1]).toMatchObject({ debut: 5, fin: 8, chute: 400 });
  });

  it('ignore les petites bosses', () => {
    expect(descentesSki([2000, 1990, 2005, 1995, 2000])).toHaveLength(0);
  });

  it('ajoute les stats de ski', () => {
    const pas = [...repeter(30, [10, 100, -20]), ...repeter(30, [10, 30, 20]), ...repeter(30, [10, 100, -20])];
    const { stats } = analyserSortie(sortieDroite(pas, { type: 'ski', alt0: 2500 }));
    expect(stats.descentes).toBe(2);
    expect(stats.deniveleDescendu).toBeGreaterThan(1000);
  });
});

describe('vol', () => {
  it('trouve le décollage, la durée de vol, le gain et le vario', () => {
    // 1 min au sol, 20 min de vol à 10 m/s avec +2 m/s pendant 5 min, puis posé
    const pas = [...repeter(6, [10, 0]), ...repeter(30, [10, 100, 20]), ...repeter(90, [10, 100, -2]), ...repeter(6, [10, 0])];
    const { stats, marquants } = analyserSortie(sortieDroite(pas, { type: 'parapente', alt0: 1500 }));
    expect(stats.dureeVol).toBeGreaterThan(1150);
    expect(stats.dureeVol).toBeLessThan(1250);
    expect(stats.gainMax).toBeGreaterThan(550);
    expect(stats.varioMax).toBeCloseTo(2, 1);
    expect(marquants.some((m) => m.type === 'deco')).toBe(true);
  });
});

describe('cardio et couleurs', () => {
  it('fait la moyenne et le maximum du cardio', () => {
    const { stats } = analyserSortie(sortieDroite(repeter(3, [10, 10]), { extra: { fc: [100, null, 120, 140] } }));
    expect(stats.fcMoyenne).toBe(120);
    expect(stats.fcMax).toBe(140);
  });

  it('ne propose que les couleurs permises par les données', () => {
    const sortie = sortieDroite(repeter(3, [10, 10]));
    expect(modesPossibles(analyserSortie(sortie), sortie.points)).toEqual(['vitesse', 'altitude', 'pente']);
    const sansHeure = { ...sortie, points: { ...sortie.points, t: undefined, alt: undefined } };
    expect(modesPossibles(analyserSortie(sansHeure), sansHeure.points)).toEqual([]);
  });

  it('interpole le dégradé et prend des bornes robustes', () => {
    expect(couleurDegrade(0)).toBe('#3b6fe0');
    expect(couleurDegrade(1)).toBe('#e2412f');
    expect(couleurDegrade(2)).toBe('#e2412f');
    const valeurs = [...repeter(98, 10), 0, 1000];
    expect(bornes(valeurs)).toEqual({ min: 10, max: 11 });
  });

  it('regroupe les segments de même couleur', () => {
    const features = morceaux({ lng: [0, 1, 2, 3, 4], lat: [0, 0, 0, 0, 0] }, [3], (i) => (i < 2 ? 'a' : 'b'));
    expect(features.map((f) => [f.properties.couleur, f.geometry.coordinates.length])).toEqual([['a', 2], ['b', 2], ['b', 2]]);
  });
});
