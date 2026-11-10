import { describe, expect, it } from 'vitest';
import {
  altitudesTerrarium,
  couleurOrientation,
  couleurPente,
  COULEURS_ORIENTATION,
  COULEURS_PENTE,
  grillePentes,
  latitudePixel,
  pixelsTuile,
  exposee,
  zonesDepuisTexte,
  zonesVersTexte,
  pourcentagePente,
  secteur,
} from '../src/pente-calcul.js';
import { pixelMonde } from '../src/point-calcul.js';
import { formatPente } from '../src/unites.js';

const rad = (d) => (d * Math.PI) / 180;

describe('pourcentage de pente', () => {
  it('45° vaut 100 %, et les seuils des classes', () => {
    expect(pourcentagePente(45)).toBeCloseTo(100, 6);
    expect(pourcentagePente(30)).toBeCloseTo(57.7, 1);
    expect(pourcentagePente(35)).toBeCloseTo(70.0, 1);
    expect(pourcentagePente(40)).toBeCloseTo(83.9, 1);
    expect(pourcentagePente(0)).toBe(0);
  });

  it('affiche les deux valeurs', () => {
    expect(formatPente(35)).toBe('35° · 70 %');
    expect(formatPente(45)).toBe('45° · 100 %');
    expect(formatPente(12.4)).toBe('12° · 22 %');
  });
});

describe('latitude d’une ligne de pixels', () => {
  it('inverse la projection de pixelMonde', () => {
    for (const lat of [-60, 0, 45.88, 69.6]) {
      expect(latitudePixel(pixelMonde(6.87, lat, 13).y, 13)).toBeCloseTo(lat, 9);
    }
  });
});

describe('altitudes terrarium', () => {
  it('décode R × 256 + G + B / 256 − 32768', () => {
    // 1000 m : 33768 = 131 × 256 + 232
    const rgba = new Uint8ClampedArray([131, 232, 128, 255, 128, 0, 0, 255]);
    const [a, b] = altitudesTerrarium(rgba);
    expect(a).toBeCloseTo(1000.5, 3);
    expect(b).toBe(0);
  });
});

// Plan incliné : l'altitude monte de tan(angle) mètres par mètre, dans la direction `montee`
function planIncline(angle, montee, cellule = 10) {
  const pente = Math.tan(rad(angle));
  const [ex, ny] = [Math.sin(rad(montee)), Math.cos(rad(montee))];
  // c vers l'est, l vers le sud
  return (c, l) => 2000 + pente * cellule * (c * ex - l * ny);
}

describe('grille de pentes', () => {
  it('mesure un plan incliné partout, bordure comprise', () => {
    const { pentes, orientations } = grillePentes({
      largeur: 4,
      hauteur: 3,
      altitude: planIncline(35, 90), // monte vers l'est : versant ouest
      cellule: () => 10,
    });
    expect(pentes).toHaveLength(12);
    pentes.forEach((p) => expect(p).toBeCloseTo(35, 3));
    orientations.forEach((o) => expect(o).toBeCloseTo(270, 3));
  });

  it('trouve un versant nord-est', () => {
    const { pentes, orientations } = grillePentes({
      largeur: 2,
      hauteur: 2,
      altitude: planIncline(42, 225, 25),
      cellule: () => 25,
    });
    expect(pentes[0]).toBeCloseTo(42, 3);
    expect(orientations[3]).toBeCloseTo(45, 3);
  });

  it('tient compte de la taille des cellules de chaque ligne', () => {
    // Même dénivelé, cellules deux fois plus grandes sur la deuxième ligne : pente plus douce
    const { pentes } = grillePentes({
      largeur: 1,
      hauteur: 2,
      altitude: (c) => c * 10,
      cellule: (l) => (l === 0 ? 10 : 20),
    });
    expect(pentes[0]).toBeCloseTo(45, 3);
    expect(pentes[1]).toBeCloseTo(26.57, 2);
  });
});

describe('couleurs', () => {
  it('classe les pentes aux seuils 30°, 35°, 40°, 45°', () => {
    expect(couleurPente(29.9)).toBeNull();
    expect(couleurPente(30)).toBe(COULEURS_PENTE[30]);
    expect(couleurPente(37)).toBe(COULEURS_PENTE[35]);
    expect(couleurPente(44.9)).toBe(COULEURS_PENTE[40]);
    expect(couleurPente(60)).toBe(COULEURS_PENTE[45]);
    expect(couleurPente(NaN)).toBeNull();
  });

  it('range les orientations en huit secteurs', () => {
    expect(secteur(0)).toBe(0);
    expect(secteur(22.4)).toBe(0);
    expect(secteur(22.6)).toBe(1);
    expect(secteur(180)).toBe(4);
    expect(secteur(350)).toBe(0);
    expect(secteur(-90)).toBe(6);
    expect(couleurOrientation(180, 20)).toBe(COULEURS_ORIENTATION[4]);
    expect(couleurOrientation(180, 2)).toBeNull(); // terrain presque plat
  });
});

describe('pixels d’une tuile', () => {
  it('colore seulement les pentes de 30° et plus', () => {
    const pentes = new Float32Array([10, 32, 41, 50]);
    const pixels = pixelsTuile({ pentes, orientations: new Float32Array(4), cote: 2, genre: 'pentes', taille: 2 });
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...pixels.slice(4, 8)]).toEqual([...COULEURS_PENTE[30], 255]);
    expect([...pixels.slice(8, 12)]).toEqual([...COULEURS_PENTE[40], 255]);
    expect([...pixels.slice(12, 16)]).toEqual([...COULEURS_PENTE[45], 255]);
  });

  it('garde la pente la plus forte quand la grille est plus fine que la tuile', () => {
    // 4 × 4 cellules pour 2 × 2 pixels : une seule cellule raide suffit à colorer son pixel
    const pentes = new Float32Array(16).fill(10);
    pentes[5] = 46; // ligne 1, colonne 1 : pixel (0, 0)
    const orientations = new Float32Array(16).fill(90);
    orientations[5] = 180;
    const pixels = pixelsTuile({ pentes, orientations, cote: 4, genre: 'pentes', taille: 2 });
    expect([...pixels.slice(0, 4)]).toEqual([...COULEURS_PENTE[45], 255]);
    expect(pixels[7]).toBe(0);
    const rose = pixelsTuile({ pentes, orientations, cote: 4, genre: 'orientation', taille: 2 });
    expect([...rose.slice(0, 3)]).toEqual(COULEURS_ORIENTATION[4]); // orientation de la cellule la plus raide
    expect([...rose.slice(4, 7)]).toEqual(COULEURS_ORIENTATION[2]);
  });

  it('agrandit une grille plus grossière que la tuile', () => {
    const pixels = pixelsTuile({
      pentes: new Float32Array([36]),
      orientations: new Float32Array([0]),
      cote: 1,
      genre: 'pentes',
      taille: 2,
    });
    for (let i = 0; i < 4; i += 1) expect(pixels[i * 4 + 3]).toBe(255);
  });
});

describe('pentes exposées selon le bulletin', () => {
  const zones = [{ masque: 0b10000011, min: 1700, max: null }]; // N, NE, NO au-dessus de 1 700 m

  it('retient une pente raide, bien orientée, à la bonne altitude', () => {
    expect(exposee(zones, 10, 35, 2200)).toBe(true); // nord
    expect(exposee(zones, 315, 32, 1800)).toBe(true); // nord-ouest
    expect(exposee(zones, 180, 35, 2200)).toBe(false); // sud
    expect(exposee(zones, 10, 25, 2200)).toBe(false); // moins de 30°
    expect(exposee(zones, 10, 35, 1500)).toBe(false); // trop bas
    expect(exposee(zones, Number.NaN, 35, 2200)).toBe(false);
    expect(exposee([{ masque: 255, min: null, max: 1800 }], 90, 40, 1200)).toBe(true);
  });

  it('écrit et relit les zones dans l’adresse des tuiles', () => {
    const texte = zonesVersTexte([...zones, { masque: 16, min: null, max: 2400 }]);
    expect(texte).toBe('131-1700-x_16-x-2400');
    expect(zonesDepuisTexte(texte)).toEqual([{ masque: 131, min: 1700, max: null }, { masque: 16, min: null, max: 2400 }]);
    expect(zonesDepuisTexte('pas-une-zone_1-2')).toEqual([]);
    expect(zonesDepuisTexte(undefined)).toEqual([]);
  });

  it('ne peint que les cellules retenues', () => {
    const pentes = new Float32Array([40, 40, 40, 40]);
    const pixels = pixelsTuile({ pentes, orientations: new Float32Array(4), cote: 2, genre: 'pentes', taille: 2, garder: (k) => k === 3 });
    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([0, 0, 0, 255]);
  });
});
