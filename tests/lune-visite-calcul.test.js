import { describe, expect, it } from 'vitest';
import { getMoonIllumination } from 'suncalc';
import {
  ECHELLE_LUNE, altitudeReelle, boiteTuile, directionDepuis, fractionTerre, hauteurSoleilLune, latitudeLigne,
  lieuxEnGeojson, niveauPlateCarree, nomsLieu, normaliserLng, opaciteNuit, NUIT_MAX, pixelPlateCarree,
  pointSubsolaireLune, sitesEnGeojson, texteCoordonnees, tuilesCouvrantes, zoomNom,
} from '../src/lune-visite-calcul.js';

describe('échelle de la Lune', () => {
  it('ramène le globe de MapLibre à la taille de la Lune', () => {
    expect(ECHELLE_LUNE).toBeCloseTo(3.667, 3);
    expect(altitudeReelle(ECHELLE_LUNE * 1000)).toBeCloseTo(1000);
  });
});

describe('point subsolaire', () => {
  it('suit la phase : face cachée à la nouvelle lune, face visible à la pleine lune', () => {
    // Pleine lune du 15 novembre 2024, nouvelle lune du 1er novembre 2024
    const pleine = pointSubsolaireLune('2024-11-15T21:29:00Z');
    expect(Math.abs(pleine.lng)).toBeLessThan(5);
    const nouvelle = pointSubsolaireLune('2024-11-01T12:47:00Z');
    expect(Math.abs(nouvelle.lng)).toBeGreaterThan(175);
  });
  it('éclaire le bord est au premier quartier', () => {
    const date = '2024-11-09T05:55:00Z'; // premier quartier
    expect(getMoonIllumination(new Date(date)).phase).toBeCloseTo(0.25, 1);
    expect(pointSubsolaireLune(date).lng).toBeCloseTo(90, -1);
  });
  it('normalise les longitudes', () => {
    expect(normaliserLng(190)).toBe(-170);
    expect(normaliserLng(-190)).toBe(170);
    expect(normaliserLng(0)).toBe(0);
  });
});

describe('jour et nuit', () => {
  const sub = { lng: 0, lat: 0 };
  it('donne la hauteur du soleil', () => {
    expect(hauteurSoleilLune(0, 0, sub)).toBeCloseTo(90);
    expect(hauteurSoleilLune(90, 0, sub)).toBeCloseTo(0);
    expect(hauteurSoleilLune(180, 0, sub)).toBeCloseTo(-90);
    expect(hauteurSoleilLune(0, 60, sub)).toBeCloseTo(30);
  });
  it('assombrit la nuit avec un terminateur net', () => {
    expect(opaciteNuit(10)).toBe(0);
    expect(opaciteNuit(-10)).toBe(NUIT_MAX);
    expect(opaciteNuit(0)).toBeCloseTo(NUIT_MAX / 2);
  });
});

describe('tuiles', () => {
  it('donne l’emprise d’une tuile Mercator', () => {
    const b = boiteTuile(1, 1, 0);
    expect(b.ouest).toBe(0);
    expect(b.est).toBe(180);
    expect(b.nord).toBeCloseTo(85.0511, 3);
    expect(b.sud).toBeCloseTo(0);
    expect(latitudeLigne(0, 0, 127.5, 256)).toBeCloseTo(0);
  });
  it('choisit un niveau plate carrée de même finesse', () => {
    expect(niveauPlateCarree(0, 8)).toBe(0);
    expect(niveauPlateCarree(5, 8)).toBe(4);
    expect(niveauPlateCarree(12, 8)).toBe(8);
  });
  it('place un point en pixels plate carrée', () => {
    expect(pixelPlateCarree(0, -180, 90)).toEqual({ x: 0, y: 0 });
    expect(pixelPlateCarree(0, 0, 0)).toEqual({ x: 256, y: 128 });
    expect(pixelPlateCarree(1, 180, -90)).toEqual({ x: 1024, y: 512 });
  });
  it('trouve les tuiles plate carrée qui couvrent une tuile Mercator', () => {
    // Au zoom 0, tout le monde : deux colonnes, une ligne
    expect(tuilesCouvrantes(0, 0, 0, 0)).toEqual({ col0: 0, col1: 1, lig0: 0, lig1: 0 });
    // Quart nord-est au zoom 1, niveau 1 (4 × 2 tuiles) : colonnes 2 et 3, ligne 0
    expect(tuilesCouvrantes(1, 1, 0, 1)).toEqual({ col0: 2, col1: 3, lig0: 0, lig1: 0 });
  });
});

describe('noms', () => {
  it('traduit les mers et garde le latin', () => {
    expect(nomsLieu('Mare Tranquillitatis', 'fr')).toEqual({ nom: 'Mer de la Tranquillité', latin: 'Mare Tranquillitatis' });
    expect(nomsLieu('Mare Tranquillitatis', 'en')).toEqual({ nom: 'Sea of Tranquility', latin: 'Mare Tranquillitatis' });
  });
  it('traduit les monts nommés', () => {
    expect(nomsLieu('Mons Hadley', 'fr').nom).toBe('Mont Hadley');
    expect(nomsLieu('Mons Hadley', 'en').nom).toBe('Mount Hadley');
  });
  it('laisse les cratères tels quels, sans latin', () => {
    expect(nomsLieu('Copernicus', 'fr')).toEqual({ nom: 'Copernicus', latin: null });
  });
  it('montre les mers avant les petits cratères', () => {
    expect(zoomNom('ME', 600)).toBe(0);
    expect(zoomNom('AA', 93)).toBeLessThan(zoomNom('AA', 20));
    expect(zoomNom('AA', 5)).toBeGreaterThan(6);
  });
  it('fait du GeoJSON des lieux', () => {
    const g = lieuxEnGeojson([['Mare Imbrium', 'ME', 1146, -15.6, 34.7, 'Sea of Showers.']], 'fr');
    expect(g.features[0].properties).toMatchObject({ nom: 'Mer des Pluies', latin: 'Mare Imbrium', genre: 'mer', grand: 1 });
    expect(g.features[0].geometry.coordinates).toEqual([-15.6, 34.7]);
    expect(sitesEnGeojson().features.find((f) => f.properties.id === 'apollo-11').properties.equipage).toBe(1);
  });
});

describe('ciel lunaire', () => {
  it('voit la Terre au zénith au centre de la face visible, à l’horizon au bord', () => {
    expect(directionDepuis(0, 0, { lng: 0, lat: 0 }).hauteur).toBeCloseTo(90);
    const bord = directionDepuis(90, 0, { lng: 0, lat: 0 });
    expect(bord.hauteur).toBeCloseTo(0);
    expect(bord.azimut).toBeCloseTo(270); // vers l'ouest
    expect(directionDepuis(0, 45, { lng: 0, lat: 0 }).azimut).toBeCloseTo(180); // vers le sud
  });
  it('voit une Terre pleine à la nouvelle lune', () => {
    expect(fractionTerre(0)).toBe(1);
    expect(fractionTerre(1)).toBe(0);
  });
  it('écrit des coordonnées sélénographiques', () => {
    expect(texteCoordonnees(23.473, 0.674)).toBe('0.674° N · 23.473° E');
    expect(texteCoordonnees(-23.4, -3.01, { langue: 'en', nombre: (v) => v.toFixed(1) })).toBe('3.0° S · 23.4° W');
  });
});
