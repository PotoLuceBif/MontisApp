import { describe, expect, it } from 'vitest';
import { palierPente, passagesRaides, repartir, ECHELLE_SAC } from '../src/parcours-analyse.js';
import { denivele, dureeEstimee, formaterDuree, lisser } from '../src/rando-profil.js';
import { lireGpx } from '../src/parcours-gpx.js';

describe('profil', () => {
  it('ignore le bruit sous le seuil de dénivelé', () => {
    expect(denivele([1000, 1002, 1000, 1002, 1000])).toEqual({ plus: 0, moins: 0 });
    expect(denivele([1000, 1100, 1050, 1200])).toEqual({ plus: 250, moins: 50 });
  });

  it('lisse sans changer la longueur ni une série constante', () => {
    expect(lisser([5, 5, 5, 5])).toEqual([5, 5, 5, 5]);
    expect(lisser([0, 10, 0]).length).toBe(3);
  });

  it('estime la durée selon la méthode DIN 33466', () => {
    // 8 km à plat : 2 h
    expect(dureeEstimee(8000, 0, 0)).toBeCloseTo(2, 9);
    // 4 km et 600 m de montée : max(1, 2) + min(1, 2) / 2 = 2,5 h
    expect(dureeEstimee(4000, 600, 0)).toBeCloseTo(2.5, 9);
  });

  it('formate une durée arrondie aux 5 minutes', () => {
    expect(formaterDuree(2.5)).toBe('2 h 30');
    expect(formaterDuree(0.01)).toBe('5 min');
  });
});

describe('analyse', () => {
  it('classe les pentes par palier', () => {
    expect([0, 4, -8, 12, 30].map(palierPente)).toEqual([0, 1, 2, 3, 4]);
  });

  it('répartit les longueurs par voie et par difficulté', () => {
    const r = repartir(
      [
        { longueur: 100, voie: 'asphalte', difficulte: 0 },
        { longueur: 50, voie: 'chemin', difficulte: 99, marches: true },
        { longueur: 25, voie: 'inconnu', difficulte: null },
      ],
      ECHELLE_SAC.niveaux
    );
    expect(r.total).toBe(175);
    expect(r.voies).toMatchObject({ asphalte: 100, chemin: 50, inconnu: 25 });
    expect(r.marches).toBe(50);
  });

  it('repère un passage raide assez long et sépare montée et descente', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ d: i * 50 }));
    const pentes = [2, 12, 14, 13, 2, -15, -16, -12, 1, 1];
    const passages = passagesRaides({ points, pentes }, 10, 80);
    expect(passages).toHaveLength(2);
    expect(passages[0].pente).toBe(-16);
    expect(passages[1].pente).toBe(14);
  });
});

describe('GPX', () => {
  const gpx = (corps) => `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">${corps}</gpx>`;

  it('lit une trace et son nom', () => {
    const r = lireGpx(gpx('<trk><name>Tour du lac</name><trkseg><trkpt lat="45.9" lon="6.8"/><trkpt lat="45.91" lon="6.8"/></trkseg></trk>'), 'fichier.gpx');
    expect(r.nom).toBe('Tour du lac');
    expect(r.trace.chaine).toHaveLength(2);
    expect(r.longueur).toBeGreaterThan(1000);
    expect(r.longueur).toBeLessThan(1200);
  });

  it('écarte les points hors limites et refuse un fichier sans trace', () => {
    expect(() => lireGpx(gpx('<trk><trkseg><trkpt lat="95" lon="6.8"/><trkpt lat="45.9" lon="6.8"/></trkseg></trk>'), 'a.gpx')).toThrow();
    expect(() => lireGpx('pas du xml', 'a.gpx')).toThrow();
  });
});
