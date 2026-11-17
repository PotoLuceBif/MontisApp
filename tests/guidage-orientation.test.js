import { describe, expect, it } from 'vitest';
import { capBoussole, capDeplacement, heureArrivee, lisserAngle } from '../src/guidage-calcul.js';

describe('capBoussole', () => {
  it('prend le cap de la boussole d’iOS tel quel', () => {
    expect(capBoussole({ webkitCompassHeading: 45 })).toBe(45);
  });
  it('retourne alpha d’Android (sens inverse)', () => {
    expect(capBoussole({ alpha: 90, absolute: true })).toBe(270);
    expect(capBoussole({ alpha: 0, absolute: true })).toBe(0);
  });
  it('ignore un alpha relatif', () => {
    expect(capBoussole({ alpha: 90, absolute: false })).toBeNull();
  });
  it('ajoute l’angle de l’écran en paysage', () => {
    expect(capBoussole({ webkitCompassHeading: 350 }, 90)).toBe(80);
  });
});

describe('lisserAngle', () => {
  it('passe par le plus court chemin autour du nord', () => {
    expect(lisserAngle(350, 10, 0.5)).toBeCloseTo(0);
    expect(lisserAngle(10, 350, 0.5)).toBeCloseTo(0);
  });
  it('part de la première valeur, garde la précédente sans nouvelle', () => {
    expect(lisserAngle(null, 370)).toBe(10);
    expect(lisserAngle(120, null)).toBe(120);
  });
});

describe('capDeplacement', () => {
  it('masque la flèche à l’arrêt ou sans cap', () => {
    expect(capDeplacement({ heading: 80, speed: 0.2 })).toBeNull();
    expect(capDeplacement({ heading: null, speed: 3 })).toBeNull();
    expect(capDeplacement({ heading: Number.NaN, speed: 3 })).toBeNull();
  });
  it('donne le cap en mouvement', () => {
    expect(capDeplacement({ heading: 80, speed: 1.4 })).toBe(80);
  });
});

describe('heureArrivee', () => {
  it('ajoute le temps restant, arrondi à 5 minutes', () => {
    const maintenant = Date.UTC(2026, 10, 17, 10, 2);
    expect(heureArrivee(maintenant, 1.5).getTime()).toBe(Date.UTC(2026, 10, 17, 11, 30));
  });
  it('rien sans temps valable', () => {
    expect(heureArrivee(0, Number.NaN)).toBeNull();
  });
});
