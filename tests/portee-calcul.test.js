import { describe, expect, it } from 'vitest';
import { cheminsPlanes } from '../src/portee-calcul.js';

const N = 81;
const centre = 40 * N + 40;
const plat = () => new Float32Array(N * N);
const indice = (i, j) => j * N + i;

describe('portée de vol', () => {
  it('sur terrain plat, atteint la distance finesse × hauteur', () => {
    // 1 000 m au-dessus du sol, finesse 2 : 2 000 m, soit 20 cellules de 100 m
    const { fige } = cheminsPlanes({ sol: plat(), N, tailleCell: 100, depart: centre, h0: 1000, finesse: 2, rayonM: 10000 });
    expect(fige[indice(40 + 19, 40)]).toBe(1);
    expect(fige[indice(40 + 21, 40)]).toBe(0);
  });

  it('reste à moins de 3 % de la ligne droite en diagonale', () => {
    const { dist } = cheminsPlanes({ sol: plat(), N, tailleCell: 100, depart: centre, h0: 100000, finesse: 10, rayonM: 100000 });
    for (const [di, dj] of [[30, 30], [30, 10], [20, 35]]) {
      const ligneDroite = Math.hypot(di, dj) * 100;
      const chemin = dist[indice(40 + di, 40 + dj)];
      expect(chemin).toBeGreaterThanOrEqual(ligneDroite - 1e-6);
      expect(chemin / ligneDroite).toBeLessThan(1.03);
    }
  });

  it('ne traverse pas une crête plus haute que la voile', () => {
    const sol = plat();
    for (let j = 0; j < N; j++) sol[indice(50, j)] = 5000; // mur nord-sud complet
    const { fige } = cheminsPlanes({ sol, N, tailleCell: 100, depart: centre, h0: 2000, finesse: 10, rayonM: 20000 });
    expect(fige[indice(45, 40)]).toBe(1);
    expect(fige[indice(55, 40)]).toBe(0);
  });

  it('ne se glisse pas entre deux cellules d’une crête en diagonale', () => {
    const sol = plat();
    for (let k = 0; k < N; k++) sol[indice(k, N - 1 - k)] = 5000; // crête en diagonale, sans trou
    const { fige } = cheminsPlanes({ sol, N, tailleCell: 100, depart: indice(30, 30), h0: 2000, finesse: 10, rayonM: 20000 });
    expect(fige[indice(35, 35)]).toBe(1); // même côté de la crête
    expect(fige[indice(45, 45)]).toBe(0);
    expect(fige[indice(60, 60)]).toBe(0);
  });

  it('contourne un relief par une brèche', () => {
    const sol = plat();
    for (let j = 0; j < N; j++) if (j !== 10) sol[indice(50, j)] = 5000; // brèche au nord
    const { fige, dist } = cheminsPlanes({ sol, N, tailleCell: 100, depart: centre, h0: 2000, finesse: 10, rayonM: 20000 });
    const derriere = indice(55, 40);
    expect(fige[derriere]).toBe(1);
    // Le détour par la brèche est plus long que la ligne droite
    expect(dist[derriere]).toBeGreaterThan(1500 * 1.5);
  });

  it('ne dépasse jamais le rayon demandé', () => {
    const { dist, fige } = cheminsPlanes({ sol: plat(), N, tailleCell: 100, depart: centre, h0: 100000, finesse: 10, rayonM: 1500 });
    for (let k = 0; k < N * N; k++) if (fige[k]) expect(dist[k]).toBeLessThanOrEqual(1500);
  });
});
