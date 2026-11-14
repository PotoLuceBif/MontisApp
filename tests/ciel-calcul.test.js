import { describe, expect, it } from 'vitest';
import { couleurEtoile, directionEtoile, eclatEtoile, lireCatalogue, lireVoieLactee, opaciteCiel, opaciteVoieLactee, projeterDirection, tempsSideral } from '../src/ciel-calcul.js';

describe('position des étoiles', () => {
  it('donne le temps sidéral de référence au 1er janvier 2000 à midi UTC', () => {
    expect(tempsSideral(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.46, 2);
  });

  it('met l’étoile Polaire au nord, à la hauteur de la latitude', () => {
    const polaire = directionEtoile(37.95, 89.26, 45, 6, 100);
    expect(polaire.hauteur).toBeCloseTo(45, 0);
    expect(Math.min(polaire.azimut, 360 - polaire.azimut)).toBeLessThan(1.5);
  });

  it('met au zénith une étoile qui passe au méridien à la déclinaison de la latitude', () => {
    // Temps sidéral local = ascension droite : l'étoile est au méridien
    const d = directionEtoile(120, 45, 45, 10, 110);
    expect(d.hauteur).toBeCloseTo(90, 4);
  });

  it('fait lever une étoile de l’équateur à l’est', () => {
    // Angle horaire de −90° : six heures avant son passage au méridien
    const d = directionEtoile(90, 0, 0, 0, 0);
    expect(d.hauteur).toBeCloseTo(0, 4);
    expect(d.azimut).toBeCloseTo(90, 4);
  });
});

describe('projection à l’écran', () => {
  const camera = { bearing: 0, pitch: 0, fov: 40, largeur: 400, hauteurEcran: 800 };
  it('ne dessine pas ce qui est derrière la caméra', () => {
    // Pitch 0 : la caméra regarde le sol, le zénith est derrière elle
    expect(projeterDirection({ azimut: 0, hauteur: 89 }, camera)).toBeNull();
    expect(projeterDirection({ azimut: 0, hauteur: -89 }, camera)).not.toBeNull();
  });
});

describe('éclat, couleur et catalogue', () => {
  it('rend Sirius plus gros et plus vif qu’une étoile à peine visible', () => {
    const sirius = eclatEtoile(-1.44);
    const faible = eclatEtoile(6);
    expect(sirius.rayon).toBeGreaterThan(faible.rayon * 3);
    expect(sirius.opacite).toBe(1);
    expect(faible.opacite).toBeLessThan(0.4);
  });

  it('teinte les étoiles chaudes en bleu, les froides en orangé', () => {
    const [rb, , bb] = couleurEtoile(-0.3);
    const [ro, , bo] = couleurEtoile(1.6);
    expect(bb).toBeGreaterThan(rb);
    expect(ro).toBeGreaterThan(bo);
  });

  it('lit le catalogue compact', () => {
    expect(lireCatalogue({ etoiles: [10129, -1672, -144, 1] })).toEqual([{ ra: 101.29, dec: -16.72, mag: -1.44, bv: 0.01 }]);
  });

  it('suit le zoom du globe', () => {
    expect(opaciteCiel(2)).toBe(1);
    expect(opaciteCiel(5)).toBe(0.5);
    expect(opaciteCiel(7)).toBe(0);
  });
});

describe('Voie lactée', () => {
  it('lit la grille de points', () => {
    expect(lireVoieLactee({ points: [2665, -290, 5, 100, 15, 1] })).toEqual([
      { ra: 266.5, dec: -29, niveau: 5 },
      { ra: 10, dec: 1.5, niveau: 1 },
    ]);
    expect(lireVoieLactee(null)).toEqual([]);
  });
  it('éclaire plus le cœur que le halo', () => {
    expect(opaciteVoieLactee(5)).toBeGreaterThan(opaciteVoieLactee(1));
    expect(opaciteVoieLactee(0)).toBe(0);
  });
});
