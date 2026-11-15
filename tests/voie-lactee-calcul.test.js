import { describe, expect, it } from 'vitest';
import { directionEtoile, projeterDirection } from '../src/ciel-calcul.js';
import {
  ecranVersGalactique, equatorialVersGalactique, galactiqueVersEquatorial, genererVoieLactee, matriceCiel,
  peindreVoieLactee, pixelVoieLactee, projeterGalactique, semerEtoiles,
} from '../src/voie-lactee-calcul.js';

const CAMERA = { bearing: 30, pitch: 50, fov: 36.87, largeur: 800, hauteurEcran: 600, padding: {} };

describe('coordonnées galactiques', () => {
  it('place le centre galactique (Sagittaire A*) à l = 0, b = 0', () => {
    const { l, b } = equatorialVersGalactique(266.405, -28.936);
    expect(Math.min(l, 360 - l)).toBeLessThan(0.1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('place le pôle nord galactique à b = 90°', () => {
    expect(equatorialVersGalactique(192.859, 27.128).b).toBeCloseTo(90, 2);
  });

  it('revient au point de départ par l’aller-retour', () => {
    const { ra, dec } = galactiqueVersEquatorial(...Object.values(equatorialVersGalactique(83.6, 22.0)));
    expect(ra).toBeCloseTo(83.6, 6);
    expect(dec).toBeCloseTo(22.0, 6);
  });
});

describe('ciel vu de la caméra', () => {
  it('retrouve à l’écran les coordonnées galactiques d’une étoile projetée', () => {
    // Deneb (ra 310,36°, dec 45,28°) vue de Chamonix
    const lat = 45.9;
    const lng = 6.9;
    const ts = 200;
    const direction = directionEtoile(310.36, 45.28, lat, lng, ts);
    const point = projeterDirection(direction, CAMERA);
    const ciel = matriceCiel(CAMERA, lat, lng, ts);
    const attendu = equatorialVersGalactique(310.36, 45.28);
    const lu = ecranVersGalactique(point.x, point.y, ciel);
    expect(lu.b).toBeCloseTo(attendu.b, 4);
    expect(lu.l).toBeCloseTo(attendu.l, 4);
  });

  it('projette une direction galactique là où l’écran la lit', () => {
    const ciel = matriceCiel(CAMERA, 10, -40, 75);
    const { l, b } = ecranVersGalactique(250, 140, ciel);
    const r = Math.PI / 180;
    const point = projeterGalactique(Math.cos(b * r) * Math.cos(l * r), Math.cos(b * r) * Math.sin(l * r), Math.sin(b * r), ciel);
    expect(point.x).toBeCloseTo(250, 6);
    expect(point.y).toBeCloseTo(140, 6);
  });

  it('ne projette pas une direction derrière la caméra', () => {
    const ciel = matriceCiel(CAMERA, 10, -40, 75);
    const { l, b } = ecranVersGalactique(400, 300, ciel);
    const r = Math.PI / 180;
    expect(projeterGalactique(-Math.cos(b * r) * Math.cos(l * r), -Math.cos(b * r) * Math.sin(l * r), -Math.sin(b * r), ciel)).toBeNull();
  });
});

describe('carte de la Voie lactée', () => {
  it('brille vers le centre galactique et presque pas aux pôles', () => {
    expect(pixelVoieLactee(2, -5).a).toBeGreaterThan(0.4); // nuage d'étoiles du Sagittaire
    expect(pixelVoieLactee(120, 85).a).toBeLessThan(0.05);
    expect(pixelVoieLactee(0, -6).a).toBeGreaterThan(pixelVoieLactee(180, -6).a);
  });

  it('assombrit le Sac à Charbon par rapport à la bande voisine', () => {
    expect(pixelVoieLactee(301, -1).a).toBeLessThan(pixelVoieLactee(301, -8).a + 0.2);
  });

  it('montre le Grand Nuage de Magellan hors de la bande', () => {
    expect(pixelVoieLactee(280.5, -32.9).a).toBeGreaterThan(pixelVoieLactee(250, -32.9).a + 0.2);
  });

  it('est la même d’un appareil à l’autre', () => {
    expect(pixelVoieLactee(33.3, 2.2)).toEqual(pixelVoieLactee(33.3, 2.2));
  });

  it('sème ses petites étoiles surtout dans la bande', () => {
    const texture = genererVoieLactee(64, 32);
    let graine = 1;
    const alea = () => {
      graine = (graine * 16807) % 2147483647;
      return graine / 2147483647;
    };
    const semis = semerEtoiles(texture, 64, 32, 400, alea);
    expect(semis.length).toBe(1600);
    let bande = 0;
    for (let k = 2; k < semis.length; k += 4) if (Math.abs(semis[k]) < Math.sin((20 * Math.PI) / 180)) bande += 1;
    // La bande de ±20° couvre un tiers du ciel : bien plus d'un tiers des étoiles y tombent
    expect(bande / 400).toBeGreaterThan(0.55);
    for (let k = 7; k < semis.length; k += 4) expect(semis[k]).toBeGreaterThanOrEqual(semis[k - 4]);
  });

  it('peint l’écran avec la couleur de la carte sous chaque pixel', () => {
    const texture = new Uint8ClampedArray(8 * 4 * 4).fill(200);
    const sortie = new Uint8ClampedArray(10 * 5 * 4);
    peindreVoieLactee(sortie, 10, 5, 2, matriceCiel(CAMERA, 45, 6, 100), texture, 8, 4);
    expect([...sortie].every((v) => v === 200)).toBe(true);
  });
});
