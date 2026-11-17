import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { densite, dureeListeErreurs, questionSeule, resumeFuseaux, texteFuseau } from '../src/jeu-calcul.js';

describe('fuseaux horaires', () => {
  it('écrit un décalage', () => {
    expect(texteFuseau(0)).toBe('UTC');
    expect(texteFuseau(60)).toBe('UTC+1');
    expect(texteFuseau(330)).toBe('UTC+5:30');
    expect(texteFuseau(-210)).toBe('UTC−3:30');
    expect(texteFuseau(-600)).toBe('UTC−10');
  });
  it('résume les fuseaux d’un pays', () => {
    expect(resumeFuseaux([60])).toEqual({ texte: 'UTC+1', nombre: 1 });
    expect(resumeFuseaux([480, 360, 480])).toEqual({ texte: 'UTC+6 · UTC+8', nombre: 2 });
    expect(resumeFuseaux([-600, -540, -480, -420, -360, -300])).toEqual({ texte: 'UTC−10 → UTC−5', nombre: 6 });
    expect(resumeFuseaux([])).toEqual({ texte: '', nombre: 0 });
  });
});

describe('chiffres', () => {
  it('calcule la densité', () => {
    expect(densite(68_000_000, 640_000)).toBe(106);
    expect(densite(3_400_000, 1_564_000)).toBe(2.2);
    expect(densite(null, 100)).toBeNull();
  });
  it('donne la durée d’une liste d’erreurs', () => {
    expect(dureeListeErreurs(3, 'europe')).toBe(60);
    expect(dureeListeErreurs(20, 'europe')).toBe(200);
    expect(dureeListeErreurs(100, 'oceanie')).toBe(180);
  });
  it('rejoue une question sans sa réponse', () => {
    expect(questionSeule({ type: 'ou-pays', code: 'FR', cle: 'pays:FR', point: [1, 2], distance: 30, reponse: null })).toEqual({ type: 'ou-pays', code: 'FR', cle: 'pays:FR' });
  });
});

describe('données des fiches', () => {
  const pays = JSON.parse(readFileSync('public/data/jeux/pays.json', 'utf8')).features.map((f) => f.properties.code);
  const fiches = JSON.parse(readFileSync('public/data/jeux/fiches.json', 'utf8'));
  const anecdotes = JSON.parse(readFileSync('public/data/jeux/anecdotes.json', 'utf8'));
  it('couvre chaque pays', () => {
    for (const code of pays) {
      expect(fiches[code], code).toBeTruthy();
      expect(fiches[code].population, code).toBeGreaterThan(0);
      expect(fiches[code].sommet?.altitude, code).toBeGreaterThan(0);
      expect(fiches[code].fuseaux.length, code).toBeGreaterThan(0);
      expect(anecdotes[code]?.fr?.length, code).toBeGreaterThan(0);
      expect(anecdotes[code].en.length, code).toBe(anecdotes[code].fr.length);
    }
  });
  it('a des voisins réciproques et connus', () => {
    for (const [code, fiche] of Object.entries(fiches)) {
      for (const voisin of fiche.voisins) {
        expect(pays, `${code} → ${voisin}`).toContain(voisin);
        expect(fiches[voisin].voisins, `${voisin} ← ${code}`).toContain(code);
      }
    }
  });
});
