import { describe, expect, it } from 'vitest';
import { COTE_MASQUE, adresseInfoBrgm, blancTransparent, couleurPixel, empriseTuile, geologieDuPoint, lireInfoBrgm, nomFeuille, pointCouvert, tuileDuPoint } from '../src/geologie-calcul.js';
import { FAMILLES, familleDuCode } from '../src/geologie-familles.js';

// Tuile 256 × 256 : moitié gauche colorée, moitié droite blanche (hors de France)
function tuileMoitie() {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  for (let p = 0; p < 256 * 256; p += 1) {
    const blanc = p % 256 >= 128;
    pixels.set(blanc ? [255, 255, 255, 255] : [120, 160, 200, 255], p * 4);
  }
  return pixels;
}

describe('blancTransparent', () => {
  it('rend le blanc transparent et garde les couleurs', () => {
    const pixels = tuileMoitie();
    blancTransparent(pixels);
    expect(pixels[3]).toBe(255); // premier pixel, coloré
    expect(pixels[200 * 4 + 3]).toBe(0); // colonne 200, blanche
  });

  it('garde un blanc cassé de papier ancien', () => {
    const pixels = new Uint8ClampedArray([235, 238, 236, 255]);
    blancTransparent(pixels, 1);
    expect(pixels[3]).toBe(255);
  });

  it('donne le masque de couverture', () => {
    const masque = blancTransparent(tuileMoitie());
    expect(masque.length).toBe(COTE_MASQUE * COTE_MASQUE);
    expect(masque[0]).toBe(1);
    expect(masque[COTE_MASQUE - 1]).toBe(0);
    expect(masque.reduce((a, b) => a + b, 0)).toBe((COTE_MASQUE * COTE_MASQUE) / 2);
  });
});

describe('tuileDuPoint', () => {
  it('trouve la tuile de Chamonix au zoom 13', () => {
    const { x, y } = tuileDuPoint(6.87, 45.92, 13);
    expect(x).toBe(4252);
    expect(y).toBe(2917);
  });

  it('donne la position dans la tuile', () => {
    const { x, y, u, v } = tuileDuPoint(0, 0, 1);
    expect([x, y]).toEqual([1, 1]);
    expect(u).toBeCloseTo(0);
    expect(v).toBeCloseTo(0);
  });
});

describe('pointCouvert', () => {
  const masque = blancTransparent(tuileMoitie());
  const { z, x, y } = tuileDuPoint(6.87, 45.92, 13);
  const masques = new Map([[`${z}/${x}/${y}`, masque]]);
  const n = 2 ** z;
  const lng = (u) => ((x + u) / n) * 360 - 180;
  const lat = 45.92;

  it('inconnu tant que la tuile n’est pas chargée', () => {
    expect(pointCouvert(new Map(), 6.87, lat, z)).toBeNull();
  });

  it('couvert à gauche, hors carte à droite', () => {
    expect(pointCouvert(masques, lng(0.1), lat, z)).toBe(true);
    expect(pointCouvert(masques, lng(0.9), lat, z)).toBe(false);
  });

  it('une case blanche au bord de la carte compte comme couverte', () => {
    expect(pointCouvert(masques, lng(0.51), lat, z)).toBe(true);
  });
});

describe('lireInfoBrgm', () => {
  const reponse = `GetFeatureInfo results:

Layer 'LITHO_1M_SIMPLIFIEE'
  Feature 369:
    OBJECTID = '1049'
    DESCR = 'Calcaires, marnes et gypse'
    TYPE = 'Roches Sédimentaires'

Layer 'SCAN_F_GEOL50_CATALOG'
  Feature 704:
    numero = '680'
    nom = 'CHAMONIX'
`;

  it('lit chaque couche et ses attributs', () => {
    const info = lireInfoBrgm(reponse);
    expect(info.LITHO_1M_SIMPLIFIEE[0].DESCR).toBe('Calcaires, marnes et gypse');
    expect(info.LITHO_1M_SIMPLIFIEE[0].TYPE).toBe('Roches Sédimentaires');
    expect(info.SCAN_F_GEOL50_CATALOG[0]).toEqual({ numero: '680', nom: 'CHAMONIX' });
  });

  it('rien trouvé : aucune couche', () => {
    expect(lireInfoBrgm('GetFeatureInfo results:\n\n  Search returned no results.\n')).toEqual({});
  });
});

describe('adresseInfoBrgm', () => {
  it('met la latitude en premier dans l’emprise (WMS 1.3.0)', () => {
    const adresse = new URL(adresseInfoBrgm('https://exemple.fr/wms', ['A', 'B'], 6.87, 45.92, 0.02));
    expect(adresse.searchParams.get('BBOX')).toBe('45.900000,6.850000,45.940000,6.890000');
    expect(adresse.searchParams.get('QUERY_LAYERS')).toBe('A,B');
    expect(adresse.searchParams.get('I')).toBe('50');
  });
});

describe('nomFeuille', () => {
  it('remet la casse habituelle', () => {
    expect(nomFeuille('CHAMONIX')).toBe('Chamonix');
    expect(nomFeuille('SAINT-GERVAIS-LES-BAINS')).toBe('Saint-Gervais-les-Bains');
    expect(nomFeuille("BOURG-D'OISANS")).toBe("Bourg-d'Oisans");
    expect(nomFeuille('LE MONETIER-LES-BAINS')).toBe('Le Monetier-les-Bains');
  });
});

describe('geologieDuPoint', () => {
  it('réunit la roche et la feuille, avec la notice', () => {
    const g = geologieDuPoint({
      LITHO_1M_SIMPLIFIEE: [{ CODE_GEOL: '2', DESCR: 'Calcaires, marnes et gypse', TYPE: 'Roches Sédimentaires' }],
      SCAN_F_GEOL50_CATALOG: [{ numero: '680', nom: 'CHAMONIX' }],
    });
    expect(g.roche).toEqual({ code: 2, description: 'Calcaires, marnes et gypse', type: 'Roches sédimentaires' });
    expect(g.feuille).toEqual({ numero: '680', nom: 'Chamonix', notice: 'http://ficheinfoterre.brgm.fr/Notices/0680N.pdf' });
  });

  it('hors de France : rien', () => {
    expect(geologieDuPoint({})).toBeNull();
  });

  it('une feuille sans roche reste utile', () => {
    expect(geologieDuPoint({ SCAN_F_GEOL50_CATALOG: [{ numero: '1', nom: 'DUNKERQUE' }] }).roche).toBeNull();
  });
});

describe('blancTransparent sans blanc', () => {
  it('garde le blanc et lit la couverture dans la transparence', () => {
    const pixels = new Uint8ClampedArray(512 * 512 * 4);
    for (let p = 0; p < 512 * 256; p += 1) pixels.set([255, 255, 255, 255], p * 4); // moitié haute : blanc opaque
    const masque = blancTransparent(pixels, 512, { blanc: false });
    expect(pixels[3]).toBe(255);
    expect(masque[0]).toBe(1);
    expect(masque[COTE_MASQUE * COTE_MASQUE - 1]).toBe(0);
  });
});

describe('empriseTuile', () => {
  it('couvre le monde au zoom 0', () => {
    const [o, s, e, n] = empriseTuile(0, 0, 0);
    expect(o).toBeCloseTo(-20037508.34, 1);
    expect(n).toBeCloseTo(20037508.34, 1);
    expect(e - o).toBeCloseTo(n - s, 6);
  });

  it('quart nord-est au zoom 1', () => {
    expect(empriseTuile(1, 1, 0).map((v) => Math.round(v))).toEqual([0, 0, 20037508, 20037508]);
  });
});

describe('pointCouvert par vue', () => {
  it('cherche la tuile de la vue demandée', () => {
    const masque = new Uint8Array(COTE_MASQUE * COTE_MASQUE).fill(1);
    const { z, x, y } = tuileDuPoint(6.87, 45.92, 10);
    const masques = new Map([[`simple/${z}/${x}/${y}`, masque]]);
    expect(pointCouvert(masques, 6.87, 45.92, z, 'simple/')).toBe(true);
    expect(pointCouvert(masques, 6.87, 45.92, z, 'detaillee/')).toBeNull();
  });
});

describe('FAMILLES', () => {
  it('une famille par code du BRGM, sans doublon', () => {
    const codes = FAMILLES.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('retrouve la famille d’un code, texte compris', () => {
    expect(familleDuCode('8').cle).toBe('granites');
    expect(familleDuCode(4)).toBeNull();
  });
});

describe('couleurPixel', () => {
  const zone = (couleurs) => new Uint8ClampedArray(couleurs.flatMap((c) => [...c, 255]));

  it('ignore un trait noir au milieu d’un aplat', () => {
    const aplat = Array(20).fill([120, 160, 200]);
    expect(couleurPixel(zone([...aplat, [0, 0, 0], [0, 0, 0], [10, 10, 10]]))).toBe('rgb(120, 160, 200)');
  });

  it('du blanc : hors de la carte', () => {
    expect(couleurPixel(zone(Array(9).fill([255, 255, 255])))).toBeNull();
  });

  it('pixels transparents ignorés', () => {
    expect(couleurPixel(new Uint8ClampedArray([10, 20, 30, 0]))).toBeNull();
  });
});
