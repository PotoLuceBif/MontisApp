import { describe, expect, it } from 'vitest';
import { GALAXIES, GALAXIES_INFOS, galaxieSous, imageGalaxie, poseGalaxie } from '../src/galaxies-calcul.js';

const alpha = (pixels, n, x, y) => pixels[(Math.round(y) * n + Math.round(x)) * 4 + 3];
const galaxie = (id) => GALAXIES.find((g) => g.id === id);

describe('images des galaxies', () => {
  it('donne à Andromède un cœur brillant et des bords éteints', () => {
    const m31 = galaxie('m31');
    const pixels = imageGalaxie(m31);
    const n = m31.taille;
    expect(alpha(pixels, n, n / 2, n / 2)).toBeGreaterThan(200);
    expect(alpha(pixels, n, 1, 1)).toBe(0);
  });

  it('allonge Andromède selon son grand axe (vertical dans l’image)', () => {
    const m31 = galaxie('m31');
    const pixels = imageGalaxie(m31);
    const n = m31.taille;
    // À 40 % du demi-côté : encore la galaxie le long du grand axe, déjà le vide le long du petit
    expect(alpha(pixels, n, n / 2, n * 0.3)).toBeGreaterThan(alpha(pixels, n, n * 0.7, n / 2) + 40);
  });

  it('dessine les Nuages de Magellan sans spirale mais lumineux en leur centre', () => {
    const lmc = galaxie('lmc');
    const pixels = imageGalaxie(lmc);
    const n = lmc.taille;
    expect(alpha(pixels, n, n / 2 - n * 0.03, n / 2)).toBeGreaterThan(100);
    expect(alpha(pixels, n, 2, n / 2)).toBeLessThan(5);
  });

  it('est la même d’un appareil à l’autre', () => {
    expect(imageGalaxie(galaxie('m33'))).toEqual(imageGalaxie(galaxie('m33')));
  });
});

describe('pose à l’écran', () => {
  // Nord vers le haut, est vers la gauche (ciel vu de dessous), 10 px par degré
  const centre = { x: 400, y: 300 };
  const nord = { x: 400, y: 295 };
  const est = { x: 395, y: 300 };

  it('centre l’image sur la galaxie', () => {
    const g = { grand: 4, angle: 0, taille: 100 };
    const [a, b, c, d, e, f] = poseGalaxie(g, centre, nord, est, 0.5);
    expect(e + a * 50 + c * 50).toBeCloseTo(400, 6);
    expect(f + b * 50 + d * 50).toBeCloseTo(300, 6);
  });

  it('aligne le grand axe sur le nord pour un angle de 0°, sur l’est pour 90°', () => {
    const haut = (angle) => {
      const [a, b, c, d, e, f] = poseGalaxie({ grand: 4, angle, taille: 100 }, centre, nord, est, 0.5);
      return { x: e + a * 50, y: f + b * 50 }; // haut de l'image : bout du grand axe
    };
    expect(haut(0).x).toBeCloseTo(400, 6);
    expect(haut(0).y).toBeLessThan(300);
    expect(haut(90).y).toBeCloseTo(300, 6);
    expect(haut(90).x).toBeLessThan(400);
  });

  it('met à l’échelle le grand axe sur le ciel', () => {
    const [, , c, d] = poseGalaxie({ grand: 4, angle: 0, taille: 100 }, centre, nord, est, 0.5);
    // Toute la hauteur de l'image couvre le grand axe et sa marge (1,35) : 4° × 1,35 × 10 px
    expect(Math.hypot(c, d) * 100).toBeCloseTo(4 * 1.35 * 10, 6);
  });
});

describe('galaxie touchée', () => {
  const points = [
    { id: 'm31', x: 100, y: 100, rayon: 40 },
    { id: 'm32', x: 110, y: 105, rayon: 4 },
    { id: 'lmc', x: 300, y: 300, rayon: 80 },
    { id: 'smc', x: 360, y: 300, rayon: 20 },
  ];
  it('chaque galaxie touchable a ses textes de bulle', () => {
    for (const id of GALAXIES_INFOS) expect(GALAXIES.some((g) => g.id === id)).toBe(true);
  });
  it('trouve la galaxie sous le doigt, compagnes rattachées à Andromède', () => {
    expect(galaxieSous(points, 110, 105)).toBe('m31');
    expect(galaxieSous(points, 300, 310)).toBe('lmc');
  });
  it('préfère la galaxie dont on touche le cœur quand deux se chevauchent', () => {
    expect(galaxieSous(points, 358, 300)).toBe('smc');
  });
  it('rien hors des disques, sauf dans la marge', () => {
    expect(galaxieSous(points, 150, 100)).toBe(null);
    expect(galaxieSous(points, 150, 100, 14)).toBe('m31');
    expect(galaxieSous([], 0, 0)).toBe(null);
  });
});
