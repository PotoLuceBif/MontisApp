import { afterEach, describe, expect, it } from 'vitest';
import { definirLangue } from '../src/preferences.js';
import {
  courseSoleil,
  formatDuree,
  heureDuLieu,
  jourLocal,
  journeeSoleil,
  midiLocal,
  nomDecalage,
  positionSoleil,
} from '../src/soleil.js';

const PARIS = [48.8566, 2.3522];
const TROMSO = [69.6496, 18.956];
const CHAMONIX = [45.9237, 6.8694];

// Écart en minutes entre une heure calculée et une heure publiée « hh:mm », au fuseau donné
function ecart(date, attendue, decalage) {
  const [h, m] = attendue.split(':').map(Number);
  const decalee = new Date(date.getTime() + decalage * 60000);
  return Math.abs(decalee.getUTCHours() * 60 + decalee.getUTCMinutes() - (h * 60 + m));
}

afterEach(() => definirLangue('fr'));

describe('lever et coucher (valeurs publiées par la NOAA, à 2 minutes près)', () => {
  it('Paris au solstice d’été', () => {
    const jour = journeeSoleil('2026-06-21', ...PARIS, 120);
    expect(ecart(jour.lever, '05:47', 120)).toBeLessThanOrEqual(2);
    expect(ecart(jour.coucher, '21:58', 120)).toBeLessThanOrEqual(2);
    expect(jour.dureeMinutes).toBeGreaterThan(16 * 60 + 8);
    expect(jour.dureeMinutes).toBeLessThan(16 * 60 + 14);
  });

  it('Paris au solstice d’hiver', () => {
    const jour = journeeSoleil('2026-12-21', ...PARIS, 60);
    expect(ecart(jour.lever, '08:42', 60)).toBeLessThanOrEqual(2);
    expect(ecart(jour.coucher, '16:56', 60)).toBeLessThanOrEqual(2);
    expect(jour.dureeMinutes).toBeGreaterThan(8 * 60 + 12);
    expect(jour.dureeMinutes).toBeLessThan(8 * 60 + 17);
  });

  it('Paris à l’équinoxe : un peu plus de 12 h, lever presque plein est', () => {
    const jour = journeeSoleil('2026-03-20', ...PARIS, 60);
    expect(jour.dureeMinutes).toBeGreaterThan(12 * 60);
    expect(jour.dureeMinutes).toBeLessThan(12 * 60 + 15);
    expect(jour.azimutLever).toBeCloseTo(89, 0);
    expect(jour.azimutCoucher).toBeCloseTo(271, 0);
  });
});

describe('position du soleil', () => {
  it('culmine plein sud à 90° − latitude ± 23,44°', () => {
    const ete = journeeSoleil('2026-06-21', ...PARIS, 120);
    const hiver = journeeSoleil('2026-12-21', ...PARIS, 60);
    expect(ete.hauteurMax).toBeCloseTo(90 - PARIS[0] + 23.44, 0);
    expect(hiver.hauteurMax).toBeCloseTo(90 - PARIS[0] - 23.44, 0);
    expect(positionSoleil(ete.midiSolaire, ...PARIS).azimut).toBeCloseTo(180, 1);
  });

  it('se lève au nord-est en été, au sud-est en hiver', () => {
    expect(journeeSoleil('2026-06-21', ...CHAMONIX, 120).azimutLever).toBeLessThan(60);
    expect(journeeSoleil('2026-12-21', ...CHAMONIX, 60).azimutLever).toBeGreaterThan(120);
  });

  it('donne une course de 0 h à 24 h, la plus haute au midi solaire', () => {
    const course = courseSoleil('2026-06-21', ...CHAMONIX, 120);
    expect(course[0].minutes).toBe(0);
    expect(course.at(-1).minutes).toBe(24 * 60);
    const sommet = course.reduce((a, b) => (b.hauteur > a.hauteur ? b : a));
    expect(Math.abs(sommet.minutes - (13 * 60 + 30))).toBeLessThan(20);
  });
});

describe('heures dorées et crépuscule', () => {
  it('commencent au lever et finissent au coucher', () => {
    const jour = journeeSoleil('2026-12-21', ...PARIS, 60);
    expect(jour.doreeMatin.debut).toEqual(jour.lever);
    expect(jour.doreeMatin.fin > jour.lever).toBe(true);
    expect(jour.doreeSoir.fin).toEqual(jour.coucher);
    expect(jour.aube < jour.lever).toBe(true);
    expect(jour.crepuscule > jour.coucher).toBe(true);
  });
});

describe('cercle polaire', () => {
  it('Tromsø en juin : soleil de minuit, 24 h de jour', () => {
    const jour = journeeSoleil('2026-06-21', ...TROMSO, 120);
    expect(jour.regime).toBe('jour-polaire');
    expect(jour.lever).toBeNull();
    expect(jour.dureeMinutes).toBe(24 * 60);
  });

  it('Tromsø en décembre : nuit polaire, aucun lever', () => {
    const jour = journeeSoleil('2026-12-21', ...TROMSO, 60);
    expect(jour.regime).toBe('nuit-polaire');
    expect(jour.dureeMinutes).toBe(0);
    expect(jour.hauteurMax).toBeLessThan(0);
  });
});

describe('fuseaux et affichage', () => {
  it('calcule la journée civile du lieu, pas celle de l’appareil', () => {
    expect(midiLocal('2026-06-21', 120).toISOString()).toBe('2026-06-21T10:00:00.000Z');
    expect(jourLocal(new Date('2026-06-21T23:30:00Z'), 120)).toBe('2026-06-22');
    // Los Angeles (UTC−7 en été) : le coucher tombe le lendemain en UTC
    const jour = journeeSoleil('2026-06-21', 34.05, -118.24, -420);
    expect(ecart(jour.coucher, '20:08', -420)).toBeLessThanOrEqual(2);
  });

  it('écrit les heures et les durées dans la langue choisie', async () => {
    const date = new Date('2026-06-21T05:07:00Z');
    expect(heureDuLieu(date, 120)).toBe('7h07');
    expect(formatDuree(16 * 60 + 5)).toBe('16 h 05');
    await definirLangue('en');
    expect(heureDuLieu(date, 120)).toBe('07:07');
    expect(formatDuree(16 * 60 + 5)).toBe('16h 05m');
    expect(heureDuLieu(null, 0)).toBe('—');
  });

  it('nomme le décalage horaire', () => {
    expect(nomDecalage(120)).toBe('UTC+2');
    expect(nomDecalage(-210)).toBe('UTC−3:30');
    expect(nomDecalage(0)).toBe('UTC+0');
  });
});

describe('échelle de la course du soleil', () => {
  it('cale la frise sur le soleil le plus haut de l’année', async () => {
    const { hauteurMaxAnnee } = await import('../src/soleil.js');
    expect(hauteurMaxAnnee(45)).toBeCloseTo(68.44);
    expect(hauteurMaxAnnee(-45)).toBeCloseTo(68.44);
    expect(hauteurMaxAnnee(10)).toBe(90);
  });
});
