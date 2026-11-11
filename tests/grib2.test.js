import { describe, expect, it } from 'vitest';
import { lireGrib2 } from '../api/_lib/grib2.js';

// Fabrique un message GRIB2 minimal : grille 3.0 de ni × nj, données du gabarit 5.0 ou 5.3
function ecrivainBits() {
  const bits = [];
  return {
    ecrire(valeur, n) {
      for (let i = n - 1; i >= 0; i -= 1) bits.push(Math.floor(valeur / 2 ** i) % 2);
    },
    aligner() {
      while (bits.length % 8) bits.push(0);
    },
    octets() {
      this.aligner();
      return Uint8Array.from({ length: bits.length / 8 }, (_, k) => bits.slice(k * 8, k * 8 + 8).reduce((a, b) => a * 2 + b, 0));
    },
  };
}
const entier = (valeur, n) => Array.from({ length: n }, (_, k) => Math.floor(valeur / 256 ** (n - 1 - k)) % 256);
const signe = (valeur, n) => {
  const octets = entier(Math.abs(valeur), n);
  if (valeur < 0) octets[0] |= 0x80;
  return octets;
};
const flottant = (valeur) => {
  const vue = new DataView(new ArrayBuffer(4));
  vue.setFloat32(0, valeur);
  return [...new Uint8Array(vue.buffer)];
};
const section = (numero, contenu) => [...entier(contenu.length + 5, 4), numero, ...contenu];

function message({ ni, nj, section5, donnees }) {
  const s1 = section(1, [0, 7, 0, 0, 2, 1, 1, ...entier(2026, 2), 11, 12, 6, 0, 0, 0, 1]);
  const s3 = new Array(72 - 5).fill(0);
  s3[30 - 5 + 0] = 0;
  const grille = section(3, s3);
  grille.splice(30, 4, ...entier(ni, 4));
  grille.splice(34, 4, ...entier(nj, 4));
  grille.splice(46, 4, ...signe(90e6, 4));
  grille.splice(50, 4, ...signe(0, 4));
  grille.splice(55, 4, ...signe(-90e6, 4));
  grille.splice(59, 4, ...signe(359e6, 4));
  const s4 = section(4, [0, 0, 0, 0, 3, 196, ...new Array(28).fill(0)]);
  const s5 = section(5, section5);
  const s6 = section(6, [255]);
  const s7 = section(7, [...donnees]);
  const corps = [...s1, ...grille, ...s4, ...s5, ...s6, ...s7];
  const total = 16 + corps.length + 4;
  return Uint8Array.from([0x47, 0x52, 0x49, 0x42, 0, 0, 0, 2, ...entier(total, 8), ...corps, 0x37, 0x37, 0x37, 0x37]);
}

describe('lecture GRIB2', () => {
  it('lit la grille et des valeurs simples (gabarit 5.0)', () => {
    const w = ecrivainBits();
    [0, 3, 7, 12].forEach((x) => w.ecrire(x, 4));
    const section5 = [...entier(4, 4), ...entier(0, 2), ...flottant(100), ...signe(1, 2), ...signe(1, 2), 4, 0];
    const [m] = lireGrib2(message({ ni: 2, nj: 2, section5, donnees: w.octets() }));
    expect(m).toMatchObject({ ni: 2, nj: 2, lat1: 90, lon1: 0, lat2: -90, lon2: 359, categorie: 3, numero: 196 });
    // (R + X × 2^E) / 10^D = (100 + 2X) / 10
    [10, 10.6, 11.4, 12.4].forEach((v, k) => expect(m.valeurs[k]).toBeCloseTo(v, 5));
    expect(m.date).toBe(Date.UTC(2026, 10, 12, 6));
  });

  it('défait les groupes et les différences d’ordre 2 (gabarit 5.3, celui de GFS)', () => {
    const attendues = [5, 8, 12, 17, 21, 26, 30, 31];
    // Différences secondes à partir du rang 2 : 1, 1, −1, 1, −1, −3 ; minimum −3, donc valeurs codées 4, 4, 2, 4, 2, 0
    const codees = [0, 0, 4, 4, 2, 4, 2, 0];
    const w = ecrivainBits();
    [5, 8].forEach((v) => w.ecrire(v, 16));
    signe(-3, 2).forEach((o) => w.ecrire(o, 8));
    // Deux groupes : 4 valeurs de référence 0 sur 3 bits, puis 4 valeurs de référence 0 sur 3 bits
    [0, 0].forEach((ref) => w.ecrire(ref, 4));
    w.aligner();
    [3, 3].forEach((largeur) => w.ecrire(largeur, 2));
    w.aligner();
    [3, 0].forEach((longueur) => w.ecrire(longueur, 2)); // longueur = 1 + valeur ; le dernier groupe la donne en clair
    w.aligner();
    codees.forEach((x) => w.ecrire(x, 3));
    const section5 = [
      ...entier(8, 4), ...entier(3, 2), ...flottant(0), ...signe(0, 2), ...signe(0, 2), 4, 0,
      1, 0, ...entier(0, 4), ...entier(0, 4), ...entier(2, 4), 0, 2, ...entier(1, 4), 1, ...entier(4, 4), 2, 2, 2,
    ];
    const [m] = lireGrib2(message({ ni: 4, nj: 2, section5, donnees: w.octets() }));
    expect([...m.valeurs]).toEqual(attendues);
  });

  it('refuse ce qui n’est pas un fichier GRIB', () => {
    expect(() => lireGrib2(new TextEncoder().encode('<html>pas encore publié</html>'))).toThrow();
  });
});
