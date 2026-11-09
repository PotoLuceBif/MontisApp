import { describe, expect, it } from 'vitest';
import { adresseMeteoSortie, interpolerHoraire, lireMeteo, resumerMeteo } from '../src/sortie-meteo-calcul.js';

const H = 3600000;
const MAINTENANT = Date.UTC(2026, 10, 9, 12);

describe('adresse de la météo du jour', () => {
  const lieu = { lat: 45.9, lng: 6.1 };

  it('prend les archives pour une sortie ancienne', () => {
    const adresse = adresseMeteoSortie({ ...lieu, debut: Date.UTC(2026, 7, 14, 6), fin: Date.UTC(2026, 7, 14, 11) }, MAINTENANT);
    expect(adresse).toMatch(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/);
    expect(adresse).toContain('start_date=2026-08-13');
    expect(adresse).toContain('end_date=2026-08-15');
    expect(adresse).toContain('timezone=auto');
  });

  it('prend les prévisions pour une sortie de ces derniers jours', () => {
    const adresse = adresseMeteoSortie({ ...lieu, debut: Date.UTC(2026, 10, 7, 6), fin: Date.UTC(2026, 10, 7, 11) }, MAINTENANT);
    expect(adresse).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
  });

  it('ne demande rien sans heure ni pour le futur', () => {
    expect(adresseMeteoSortie({ ...lieu, debut: null, fin: null }, MAINTENANT)).toBe(null);
    expect(adresseMeteoSortie({ ...lieu, debut: MAINTENANT + H, fin: MAINTENANT + 2 * H }, MAINTENANT)).toBe(null);
  });
});

describe('lecture et interpolation', () => {
  const reponse = {
    hourly: {
      time: ['2026-08-14T06:00', '2026-08-14T07:00', '2026-08-14T08:00'],
      temperature_2m: [10, 12, 16],
      wind_speed_10m: [5, 10, 20],
      wind_gusts_10m: [10, 25, 30],
      wind_direction_10m: [350, 10, 0],
      precipitation: [0, 0.4, 1.1],
      cloud_cover: [20, 60, 100],
      weather_code: [1, 61, 3],
    },
  };
  const meteo = lireMeteo(reponse);

  it('lit les heures en UTC', () => {
    expect(meteo.heures[0]).toBe(Date.UTC(2026, 7, 14, 6));
    expect(meteo.decalage).toBe(null);
    // Réponse à l'heure de Guyane (UTC−3) : 06:00 locale = 09:00 UTC
    const guyane = lireMeteo({ ...reponse, utc_offset_seconds: -10800 });
    expect(guyane.heures[0]).toBe(Date.UTC(2026, 7, 14, 9));
    expect(guyane.decalage).toBe(-180);
    expect(lireMeteo({})).toBe(null);
  });

  it('interpole entre deux heures', () => {
    const valeurs = interpolerHoraire(meteo.heures, meteo.temperature_2m, [Date.UTC(2026, 7, 14, 6, 30), Date.UTC(2026, 7, 14, 7, 30), Date.UTC(2026, 7, 14, 9)]);
    expect(valeurs).toEqual([11, 14, 16]);
  });

  it('résume la météo de la sortie', () => {
    const r = resumerMeteo(meteo, Date.UTC(2026, 7, 14, 7), Date.UTC(2026, 7, 14, 8));
    expect(r.tMin).toBe(10);
    expect(r.tMax).toBe(16);
    expect(r.rafales).toBe(30);
    expect(r.pluie).toBeCloseTo(1.5, 6);
    expect(r.code).toBe(61); // la pluie l'emporte sur le ciel couvert
    expect(Math.min(r.direction, 360 - r.direction)).toBeLessThan(5); // autour du nord, pas du sud
  });
});
