import { describe, expect, it } from 'vitest';
import { centreFrise, couleurCalotte, eclairageJour, hauteurSoleil, limbeGlobe, melangerTuile, oceanClair, partJour, pointADistance, pointSubsolaire, teinteNuit } from '../src/globe-nuit-calcul.js';

describe('point subsolaire', () => {
  it('suit la déclinaison au fil des saisons', () => {
    expect(pointSubsolaire(new Date(Date.UTC(2026, 2, 20, 12))).lat).toBeCloseTo(0, 0);
    expect(pointSubsolaire(new Date(Date.UTC(2026, 5, 21, 12))).lat).toBeCloseTo(23.4, 0);
    expect(pointSubsolaire(new Date(Date.UTC(2026, 11, 21, 12))).lat).toBeCloseTo(-23.4, 0);
  });

  it('passe à l’ouest de Greenwich à midi UTC en novembre (équation du temps)', () => {
    // Mi-novembre, le soleil passe au méridien vers 11 h 44 UTC : à midi, il est environ 4° à l’ouest
    const { lng } = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 12)));
    expect(lng).toBeGreaterThan(-5);
    expect(lng).toBeLessThan(-3);
  });

  it('fait le tour de la Terre en un jour', () => {
    const a = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 0)));
    const b = pointSubsolaire(new Date(Date.UTC(2026, 10, 12, 6)));
    expect(((a.lng - b.lng + 360) % 360)).toBeCloseTo(90, 0);
  });
});

describe('jour, nuit et crépuscule', () => {
  it('donne 90° sous le soleil et −90° aux antipodes', () => {
    const soleil = { lat: 10, lng: 20 };
    expect(hauteurSoleil(10, 20, soleil)).toBeCloseTo(90, 4);
    expect(hauteurSoleil(-10, -160, soleil)).toBeCloseTo(-90, 4);
  });

  it('mélange en douceur dans le crépuscule', () => {
    expect(partJour(30)).toBe(1);
    expect(partJour(-20)).toBe(0);
    const milieu = partJour(-3.5);
    expect(milieu).toBeGreaterThan(0.3);
    expect(milieu).toBeLessThan(0.7);
  });

  it('prend l’image du jour sous le soleil et celle de la nuit à l’opposé', () => {
    const jour = new Uint8ClampedArray(256 * 256 * 4).fill(200);
    const nuit = new Uint8ClampedArray(256 * 256 * 4).fill(10);
    // Tuile 0/0/0 : le monde entier ; soleil au-dessus de l’Afrique
    const pixels = melangerTuile(jour, nuit, 0, 0, 0, { lat: 0, lng: 15 });
    const valeur = (lng, lat) => {
      const px = Math.round(((lng + 180) / 360) * 255);
      const py = Math.round(((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * 255);
      return pixels[(py * 256 + px) * 4];
    };
    expect(valeur(15, 0)).toBe(200); // soleil au zénith : pleine lumière
    expect(valeur(-165, 0)).toBe(Math.floor(teinteNuit(10, 10, 10)[0]));
    expect(pixels[3]).toBe(255);
  });

  it('fond le bord du monde en couleur unie, pour que le pôle n’ait pas de rayons', () => {
    // Image du jour bariolée : une colonne sur deux noire, une sur deux blanche
    const jour = new Uint8ClampedArray(256 * 256 * 4).map((_, k) => ((k >> 2) % 2 ? 255 : 0));
    const nuit = new Uint8ClampedArray(256 * 256 * 4).fill(10);
    const pixels = melangerTuile(jour, nuit, 1, 0, 1, { lat: -23, lng: 0 }); // tuile du bas : Antarctique en été
    const derniere = 255 * 256 * 4;
    expect(Math.abs(pixels[derniere] - pixels[derniere + 4])).toBeLessThan(15); // la rangée du bord est unie
    const milieu = (128 * 256 + 250) * 4; // près du méridien 0, sous le soleil
    expect(Math.abs(pixels[milieu] - pixels[milieu + 4])).toBeGreaterThan(200); // ailleurs, l'image reste
  });

  it('fond le pôle Nord vers la mer, pas vers la glace', () => {
    const jour = new Uint8ClampedArray(256 * 256 * 4).fill(255);
    const nuit = new Uint8ClampedArray(256 * 256 * 4).fill(10);
    const pixels = melangerTuile(jour, nuit, 1, 0, 0, { lat: 23, lng: -90 }); // tuile du haut, en été
    const o = 128 * 4; // première rangée, au milieu de la tuile
    expect(pixels[o + 2]).toBeGreaterThan(pixels[o] * 2); // bleu
  });

  it('au zoom 0, fond le pôle Sud vers la glace et le pôle Nord vers la mer dans la même tuile', () => {
    // La seule tuile du zoom 0 touche les deux pôles : le pôle Sud faisait un anneau bleu (couleur de l'Arctique)
    const jour = new Uint8ClampedArray(256 * 256 * 4).fill(255);
    const nuit = new Uint8ClampedArray(256 * 256 * 4).fill(10);
    const pixels = melangerTuile(jour, nuit, 0, 0, 0, { lat: -23, lng: 0 }); // été austral
    const bas = (255 * 256 + 128) * 4; // dernière rangée, au méridien 0 (sous le soleil, côté sud)
    expect(pixels[bas]).toBeGreaterThan(200); // glace : claire, pas bleue
    expect(pixels[bas + 2] - pixels[bas]).toBeLessThan(30);
  });

  it('teinte la nuit en bleu profond et garde les lumières des villes', () => {
    const [r, v, b] = teinteNuit(60, 60, 70); // campagne la nuit
    expect(b).toBeGreaterThan(r);
    expect(r).toBeLessThan(30);
    const ville = teinteNuit(230, 220, 200);
    expect(ville[0]).toBeGreaterThan(200);
    expect(ville[0]).toBeGreaterThan(ville[2]); // lumière chaude
  });

  it('baisse la lumière du jour près de la ligne jour-nuit', () => {
    expect(eclairageJour(60)).toBe(1);
    expect(eclairageJour(0)).toBeLessThan(0.7);
    expect(eclairageJour(10)).toBeGreaterThan(eclairageJour(0));
  });

  it('trouve un point à distance sur le grand cercle', () => {
    const nord = pointADistance(0, 0, 0, 30);
    expect(nord.lat).toBeCloseTo(30);
    expect(nord.lng).toBeCloseTo(0);
    const est = pointADistance(0, 170, 90, 20);
    expect(est.lat).toBeCloseTo(0);
    expect(est.lng).toBeCloseTo(-170);
  });
});

describe('océan du côté jour', () => {
  it('éclaircit la mer sombre de l’image et garde ses nuances', () => {
    const profond = oceanClair(8, 30, 90);
    const plateau = oceanClair(20, 60, 130);
    expect(profond[2]).toBeGreaterThan(150);
    expect(plateau[2]).toBeGreaterThan(profond[2]); // les fonds marins se lisent encore
    expect(profond[2]).toBeGreaterThan(profond[0] * 3); // toujours bleu
  });

  it('laisse les terres, les glaces et les déserts tels quels', () => {
    expect(oceanClair(60, 90, 40)).toEqual([60, 90, 40]); // forêt
    expect(oceanClair(240, 240, 245)).toEqual([240, 240, 245]); // glace
    expect(oceanClair(200, 170, 120)).toEqual([200, 170, 120]); // désert
  });
});

describe('bord apparent du globe', () => {
  const vue = { lat: 20, lng: 10, zoom: 1.5, fov: 36.87, hauteurEcran: 800 };
  it('est centré sous la caméra quand la carte est à plat', () => {
    const limbe = limbeGlobe(vue);
    expect(limbe.lat).toBeCloseTo(20, 5);
    expect(limbe.lng).toBeCloseTo(10, 5);
    expect(limbe.angle).toBeGreaterThan(60);
    expect(limbe.angle).toBeLessThan(90);
  });
  it('recule avec la caméra quand la carte est inclinée vers le nord', () => {
    const limbe = limbeGlobe({ ...vue, pitch: 50 });
    expect(limbe.lat).toBeLessThan(20); // la caméra est au sud du centre
    expect(limbe.lng).toBeCloseTo(10, 5);
  });
  it('se resserre quand on se rapproche', () => {
    expect(limbeGlobe({ ...vue, zoom: 4 }).angle).toBeLessThan(limbeGlobe(vue).angle);
  });
  it('garde sa taille face à un pôle, comme MapLibre qui arrête l’échelle à 85°', () => {
    // Centre à −89,9° : le bord se resserrait autour du pôle (halo qui rétrécit en anneau)
    const pole = { ...vue, lat: -89.9, zoom: -1.5 };
    const limite = { ...vue, lat: -85.0511, zoom: -1.5 };
    expect(limbeGlobe(pole).angle).toBeCloseTo(limbeGlobe(limite).angle, 4);
  });
});

describe('calottes des pôles', () => {
  const hiver = { lat: -20, lng: 0 }; // novembre : nuit polaire au nord, jour au sud
  it('est sombre au nord pendant la nuit polaire, claire au sud', () => {
    const nord = couleurCalotte(true, 0, hiver);
    const sud = couleurCalotte(false, 0, hiver);
    expect(Math.max(...nord)).toBeLessThan(40);
    expect(Math.min(...sud)).toBeGreaterThan(200); // glace
  });
  it('est une mer bleue au nord en été', () => {
    const [r, , b] = couleurCalotte(true, 0, { lat: 23, lng: 0 });
    expect(b).toBeGreaterThan(r * 2);
  });
});

describe('mode frise de la vue d’espace', () => {
  const depart = Date.UTC(2026, 10, 23, 18, 0);
  const heure = 3600000;
  it('la Terre tourne de 15° par heure sous une vue qui suit le soleil', () => {
    const centre = centreFrise({ lng: 60, lat: 20 }, depart, depart - 6 * heure);
    expect(centre.lng).toBeCloseTo(150, 0);
    expect(centre.lat).toBe(20);
  });
  it('garde le soleil à la même place vue du centre', () => {
    const avant = hauteurSoleil(20, 60, pointSubsolaire(new Date(depart)));
    const instant = depart + 5 * heure;
    const centre = centreFrise({ lng: 60, lat: 20 }, depart, instant);
    expect(hauteurSoleil(centre.lat, centre.lng, pointSubsolaire(new Date(instant)))).toBeCloseTo(avant, 0);
  });
  it('reste entre -180° et 180°', () => {
    const centre = centreFrise({ lng: 170, lat: 0 }, depart, depart - 2 * heure);
    expect(centre.lng).toBeGreaterThanOrEqual(-180);
    expect(centre.lng).toBeLessThan(-150);
    expect(centreFrise({ lng: 10, lat: 0 }, depart, depart + 24 * heure).lng).toBeCloseTo(10, 0);
  });
});
