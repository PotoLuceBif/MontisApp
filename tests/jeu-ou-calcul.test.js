import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  dansArchipel, dansPays, distanceKm, distancePays, enveloppe, lireErreur, MARGE_ARCHIPEL, noterErreur, seuilVille, taillePays, zonesArchipel,
} from '../src/jeu-calcul.js';

const pays = JSON.parse(readFileSync('public/data/jeux/pays.json', 'utf8')).features;
const geo = (code) => pays.find((f) => f.properties.code === code).geometry.coordinates;
const emprise = (code) => pays.find((f) => f.properties.code === code).properties.emprise;
const villes = JSON.parse(readFileSync('public/data/jeux/villes.json', 'utf8'));

describe('où est-ce : distances', () => {
  it('distance à vol d’oiseau', () => {
    expect(distanceKm([2.35, 48.86], [4.84, 45.76])).toBeGreaterThan(385);
    expect(distanceKm([2.35, 48.86], [4.84, 45.76])).toBeLessThan(400);
    expect(distanceKm([0, 0], [0, 0])).toBe(0);
  });

  it('un point dans le pays, ou pas', () => {
    expect(dansPays([2.35, 48.86], geo('FR'))).toBe(true);
    expect(dansPays([8.5, 47.4], geo('FR'))).toBe(false);
    expect(dansPays([8.5, 47.4], geo('CH'))).toBe(true);
    // Saint-Marin est un trou de l'Italie
    expect(dansPays([12.45, 43.94], geo('SM'))).toBe(true);
  });

  it('distance au bord d’un pays', () => {
    expect(distancePays([2.35, 48.86], geo('FR'))).toBe(0);
    // Turin est à quelques dizaines de km de la France
    const turin = distancePays([7.69, 45.07], geo('FR'));
    expect(turin).toBeGreaterThan(20);
    expect(turin).toBeLessThan(90);
    // Madrid est loin de la Suisse
    expect(distancePays([-3.7, 40.42], geo('CH'))).toBeGreaterThan(900);
  });

  it('écart accepté selon la taille du pays', () => {
    expect(seuilVille()).toBe(150);
    expect(seuilVille(emprise('CH'))).toBeGreaterThanOrEqual(15);
    expect(seuilVille(emprise('CH'))).toBeLessThan(seuilVille(emprise('FR')));
    expect(seuilVille(emprise('RU'))).toBe(120);
    expect(taillePays(emprise('FR'))).toBeGreaterThan(1000);
  });
});

describe('où est-ce : villes', () => {
  it('le monde : capitales et très grandes villes, sans petites villes', () => {
    const monde = villes.monde.map((i) => villes.villes[i]);
    expect(monde.length).toBeGreaterThan(250);
    expect(monde.filter((v) => v.capitale)).toHaveLength(197);
    expect(monde.map((v) => v.fr)).toContain('New York');
    expect(monde.every((v) => v.capitale || v.pop >= 1e6)).toBe(true);
  });

  it('les villes d’un pays, capitale comprise', () => {
    const france = villes.parPays.FR.map((i) => villes.villes[i]);
    expect(france.length).toBeGreaterThanOrEqual(8);
    expect(france.map((v) => v.fr)).toEqual(expect.arrayContaining(['Paris', 'Lyon', 'Marseille', 'Grenoble']));
    expect(france.every((v) => v.pays === 'FR')).toBe(true);
  });
});

describe('révise tes erreurs', () => {
  it('une erreur s’ajoute en tête, une bonne réponse l’efface', () => {
    let erreurs = noterErreur([], 'drapeau:FR', false);
    erreurs = noterErreur(erreurs, 'ville:12', false);
    expect(erreurs).toEqual(['ville:12', 'drapeau:FR']);
    erreurs = noterErreur(erreurs, 'drapeau:FR', false);
    expect(erreurs).toEqual(['drapeau:FR', 'ville:12']);
    expect(noterErreur(erreurs, 'drapeau:FR', true)).toEqual(['ville:12']);
  });

  it('lecture d’une erreur', () => {
    expect(lireErreur('ville:12')).toEqual({ type: 'ville', id: 12 });
    expect(lireErreur('capitale:CH')).toEqual({ type: 'capitale', id: 'CH' });
  });
});

describe('fiches des pays', async () => {
  const { trierFiches, ORDRE_REGIONS } = await import('../src/jeu-calcul.js');
  const proprietes = pays.map((f) => f.properties);

  it('chaque pays a une région connue et une superficie', () => {
    for (const p of proprietes) {
      expect(ORDRE_REGIONS, p.code).toContain(p.region);
      expect(p.superficie, p.code).toBeGreaterThan(0);
    }
    const sup = (c) => proprietes.find((p) => p.code === c).superficie;
    expect(sup('MC')).toBe(2);
    expect(sup('CH')).toBeGreaterThan(40000);
    expect(sup('CH')).toBeLessThan(42500);
    expect(sup('RU')).toBeGreaterThan(16e6);
  });

  it('groupées par région dans l’ordre de la carte, d’ouest en est', () => {
    const europe = trierFiches(proprietes, 'europe');
    expect(europe[0].region).toBe('northern-europe');
    const ouest = europe.find((g) => g.region === 'western-europe').codes;
    expect(ouest.indexOf('FR')).toBeLessThan(ouest.indexOf('DE'));
    expect(europe.flatMap((g) => g.codes)).toHaveLength(47);
    expect(trierFiches(proprietes, 'monde').flatMap((g) => g.codes)).toHaveLength(197);
  });
});

describe('où est-ce : archipels', () => {
  const zones = (code) => zonesArchipel(code, geo(code));
  const dedans = (code, point) => dansArchipel(point, zones(code));

  it('un appui en mer au milieu des îles compte', () => {
    expect(dansPays([110, -5], geo('ID'))).toBe(false); // mer de Java
    expect(dedans('ID', [110, -5])).toBe(true);
    expect(dedans('PH', [122.5, 12.5])).toBe(true); // mer de Sibuyan
    expect(dedans('JP', [127, 27])).toBe(true); // entre Kyushu et Okinawa
    expect(dedans('GR', [25, 38])).toBe(true); // mer Égée
    expect(dedans('DK', [11, 55.8])).toBe(true); // Kattegat, entre Jutland et Seeland
    expect(dedans('BS', [-77, 24.5])).toBe(true);
    expect(dedans('VU', [168, -16.5])).toBe(true);
  });

  it('les îles trop petites pour les contours comptent dans l’étendue', () => {
    expect(dedans('MV', [73.3, 2])).toBe(true);
    expect(dedans('TV', [178, -8])).toBe(true);
    expect(dedans('SC', [54.5, -4.5])).toBe(true);
  });

  it('un pays à cheval sur l’antiméridien', () => {
    expect(dedans('FJ', [179.5, -17.5])).toBe(true);
    expect(dedans('FJ', [-179.5, -17.8])).toBe(true);
    expect(dedans('FJ', [170, -17.5])).toBe(false);
  });

  it('des groupes d’îles lointains restent séparés (Kiribati)', () => {
    expect(zones('KI').length).toBeGreaterThanOrEqual(3);
    expect(dedans('KI', [173.4, 0.9])).toBe(true); // îles Gilbert
    expect(dedans('KI', [-165, -1])).toBe(false); // entre Phoenix et la Ligne
  });

  it('loin des îles, ou pour un pays d’un seul tenant, rien de plus', () => {
    expect(dedans('ID', [100, 10])).toBe(false);
    expect(dedans('GR', [15, 38])).toBe(false);
    expect(zones('FR')).toEqual([]);
    expect(dansArchipel([2.35, 48.86], [])).toBe(false);
  });

  it('enveloppe convexe', () => {
    const contour = enveloppe([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 0.5]]);
    expect(contour).toHaveLength(4);
    expect(contour).not.toContainEqual([1, 1]);
  });

  it('marge par défaut', () => {
    expect(MARGE_ARCHIPEL).toBeGreaterThan(0);
  });
});
