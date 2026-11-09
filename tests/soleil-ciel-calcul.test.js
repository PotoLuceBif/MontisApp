import { describe, expect, it } from 'vitest';
import { placerSoleil, positionCamera, projeterSoleil } from '../src/soleil-ciel-calcul.js';

const ECRAN = { largeur: 400, hauteurEcran: 800 };
const camera = (options) => ({ bearing: 0, pitch: 80, fov: 36.87, ...ECRAN, ...options });

describe('projeterSoleil', () => {
  it('place au centre un soleil dans l\'axe du regard', () => {
    // Regard incliné de 80° : l'axe vise 10° sous l'horizon
    const p = projeterSoleil({ azimut: 0, hauteur: -10 }, camera());
    expect(p.devant).toBe(true);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(400, 6);
  });

  it('monte à l\'écran quand le soleil monte, et suit le cap de la carte', () => {
    const bas = projeterSoleil({ azimut: 90, hauteur: 2 }, camera({ bearing: 90 }));
    const haut = projeterSoleil({ azimut: 90, hauteur: 5 }, camera({ bearing: 90 }));
    expect(bas.x).toBeCloseTo(200, 6);
    expect(haut.y).toBeLessThan(bas.y);
  });

  it('met à droite un soleil à droite du regard', () => {
    expect(projeterSoleil({ azimut: 20, hauteur: 0 }, camera()).x).toBeGreaterThan(200);
  });

  it('dit quand le soleil est derrière la caméra', () => {
    expect(projeterSoleil({ azimut: 180, hauteur: 10 }, camera()).devant).toBe(false);
  });

  it('suit le centre décalé par les marges de la carte', () => {
    const p = projeterSoleil({ azimut: 0, hauteur: -10 }, camera({ padding: { bottom: 200 } }));
    expect(p.y).toBeCloseTo(300, 6);
  });
});

describe('placerSoleil', () => {
  const placer = (soleil, options) => placerSoleil(projeterSoleil(soleil, camera(options)), { ...ECRAN, marge: 20 });

  it('garde un soleil visible à sa place', () => {
    const p = projeterSoleil({ azimut: 0, hauteur: -10 }, camera());
    expect(placerSoleil(p, { ...ECRAN, marge: 20 })).toEqual({ x: p.x, y: p.y, dedans: true });
  });

  it('pose en haut un soleil devant soi, haut dans le ciel', () => {
    const place = placer({ azimut: 0, hauteur: 50 }, { pitch: 60 });
    expect(place).toMatchObject({ dedans: false, angle: 0 });
    expect(place.x).toBeCloseTo(200, 6);
    expect(place.y).toBeCloseTo(20, 6);
  });

  it('pose à droite un soleil à l\'est quand on regarde au nord', () => {
    const place = placer({ azimut: 90, hauteur: 30 }, { pitch: 60 });
    expect(place.x).toBeCloseTo(380, 6);
    expect(place.y).toBeCloseTo(400, 6);
  });

  it('pose en bas un soleil derrière soi, et tient compte du cap', () => {
    const place = placer({ azimut: 270, hauteur: 30 }, { pitch: 60, bearing: 90 });
    expect(place.x).toBeCloseTo(200, 6);
    expect(place.y).toBeCloseTo(780, 6);
    expect(place.angle).toBeCloseTo(180, 6);
  });

  it('garde le petit soleil sous la barre du haut et à gauche des boutons', () => {
    const marge = { haut: 136, bas: 56, gauche: 30, droite: 104 };
    const devant = placerSoleil(projeterSoleil({ azimut: 0, hauteur: 50 }, camera({ pitch: 60 })), { ...ECRAN, marge });
    expect(devant.y).toBeCloseTo(136, 6);
    const est = placerSoleil(projeterSoleil({ azimut: 90, hauteur: 30 }, camera({ pitch: 60 })), { ...ECRAN, marge });
    expect(est.x).toBeCloseTo(296, 6);
  });

  it('laisse à sa vraie place un soleil visible, même sous la barre du haut', () => {
    const marge = { haut: 136, bas: 56, gauche: 30, droite: 104 };
    const p = projeterSoleil({ azimut: 0, hauteur: 6 }, camera({ pitch: 82 }));
    expect(p.y).toBeLessThan(136);
    expect(placerSoleil(p, { ...ECRAN, marge, margeVisible: 8 }).dedans).toBe(true);
  });
});

describe('positionCamera', () => {
  const base = { lng: 6.86, lat: 45.9, zoom: 12, fov: 36.87, hauteurEcran: 800, altitudeCentre: 1000, bearing: 0 };

  it('place la caméra au-dessus du centre quand on regarde le sol', () => {
    const c = positionCamera({ ...base, pitch: 0 });
    expect(c.lng).toBeCloseTo(6.86, 9);
    expect(c.lat).toBeCloseTo(45.9, 9);
    // 400 px / tan(18,43°) = 1 200 px ; au zoom 12 (tuiles de 512 px), à 45,9° : environ 13,3 m par pixel
    expect(c.altitude).toBeGreaterThan(1000 + 15000);
    expect(c.altitude).toBeLessThan(1000 + 17000);
  });

  it('recule la caméra à l\'opposé du cap, et la baisse quand on incline', () => {
    const droite = positionCamera({ ...base, pitch: 0 });
    const nord = positionCamera({ ...base, pitch: 60 });
    const est = positionCamera({ ...base, pitch: 60, bearing: 90 });
    expect(nord.lat).toBeLessThan(45.9);
    expect(nord.lng).toBeCloseTo(6.86, 9);
    expect(est.lng).toBeLessThan(6.86);
    expect(nord.altitude - 1000).toBeCloseTo((droite.altitude - 1000) / 2, 6);
  });
});
