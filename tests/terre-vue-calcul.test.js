import { describe, expect, it } from 'vitest';
import { getMoonPosition } from 'suncalc';
import { jourEn, peindreTerre, pixelMercator, pointDuDisque, pointSousLune } from '../src/terre-vue-calcul.js';

describe('la Terre vue de la Lune', () => {
  it('trouve le point de la Terre qui a la Lune au zénith', () => {
    const date = new Date('2026-11-16T20:00:00Z');
    const p = pointSousLune(date);
    expect(Math.abs(p.lat)).toBeLessThan(30);
    // Vue de ce point, la Lune est presque au zénith (parallaxe de la Lune : environ 1°)
    expect(getMoonPosition(date, p.lat, p.lng).altitude).toBeGreaterThan(85);
  });
  it('projette le disque en orthographique', () => {
    expect(pointDuDisque(0, 0, { lat: 10, lng: 20 })).toMatchObject({ lat: 10, lng: 20, z: 1 });
    expect(pointDuDisque(0, 1, { lat: 0, lng: 0 }).lat).toBeCloseTo(90);
    expect(pointDuDisque(1, 0, { lat: 0, lng: 0 }).lng).toBeCloseTo(90);
    expect(pointDuDisque(0.9, 0.9, { lat: 0, lng: 0 })).toBeNull();
  });
  it('éclaire le côté du soleil', () => {
    const soleil = { lat: 0, lng: 0 };
    expect(jourEn(0, 0, soleil)).toBe(1);
    expect(jourEn(0, 180, soleil)).toBe(0);
    expect(jourEn(0, 90, soleil)).toBeCloseTo(0.6);
  });
  it('lit une image Mercator du monde', () => {
    expect(pixelMercator(0, 0, 512)).toEqual([256, 256]);
    expect(pixelMercator(89, -180, 512)).toEqual([0, 0]);
  });
  it('peint un disque éclairé d’un côté seulement', () => {
    const largeur = 4;
    const jour = new Uint8ClampedArray(largeur * largeur * 4).fill(200);
    const pixels = peindreTerre({ jour, largeur, centre: { lat: 0, lng: 0 }, soleil: { lat: 0, lng: 90 }, taille: 20 });
    const lum = (x, y) => pixels[(y * 20 + x) * 4];
    expect(pixels[3]).toBe(0); // coin hors du disque
    expect(lum(16, 10)).toBeGreaterThan(lum(3, 10) + 50); // côté est éclairé, ouest dans la nuit
  });
  it('éclaircit l’océan sombre côté jour, pour que la nuit s’en détache', () => {
    const largeur = 4;
    const jour = new Uint8ClampedArray(largeur * largeur * 4);
    for (let k = 0; k < jour.length; k += 4) jour.set([4, 10, 40, 255], k); // abysses de Blue Marble
    const pixels = peindreTerre({ jour, largeur, centre: { lat: 0, lng: 0 }, soleil: { lat: 0, lng: 90 }, taille: 20 });
    const bleu = (x, y) => pixels[(y * 20 + x) * 4 + 2];
    expect(bleu(16, 10)).toBeGreaterThan(90);
    expect(bleu(16, 10)).toBeGreaterThan(bleu(3, 10) * 3);
  });
});

describe('vue où la Lune dépasse au nord du globe', () => {
  it('place la Lune 15° au-dessus du nadir, plein nord', async () => {
    const { vueLuneAuNord } = await import('../src/terre-vue-calcul.js');
    const date = new Date('2026-11-16T20:00:00Z');
    const v = vueLuneAuNord(pointSousLune(date));
    const lune = getMoonPosition(date, v.lat, v.lng);
    expect(lune.altitude).toBeCloseTo(-75, -1);
    expect(Math.min(lune.azimuth % 360, 360 - (lune.azimuth % 360))).toBeLessThan(8); // vers le nord
  });
});
