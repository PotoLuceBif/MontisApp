import { describe, expect, it } from 'vitest';
import { distanceMetres, fusionnerReseaux, lireBalisesFFVL, meilleure } from '../src/balises-calcul.js';

const balises = [
  {
    idBalise: 10, nom: 'Mont Jovet', latitude: 45.4852981, longitude: 6.63917016, altitude: 2283,
    remarques: 'Au décollage.\r\n', station_type: 'ADISON', en_maintenance: 0,
    contact_name: 'Responsable', contact_phone: '06 00 00 00 00', contact_email_adr: 'x@exemple.fr',
  },
  { idBalise: 11, nom: 'Pioupiou', latitude: 45.1, longitude: 6.1, station_type: 'OPENWINDMAP' },
  { idBalise: 12, nom: '', latitude: 44.9, longitude: 6.6, altitude: 0, station_type: 'HOLFUY', en_maintenance: 1 },
  { idBalise: 13, nom: 'Sans position', latitude: null, longitude: null, station_type: 'AUTRE' },
];
const releves = [
  { idbalise: 10, date: '2026-11-06T16:19:05+01:00', vitesseVentMoy: 18, vitesseVentMax: 28, vitesseVentMin: 8, directVentMoy: 292, temperature: 0 },
  { idbalise: 11, date: '2026-11-06T16:19:05+01:00', vitesseVentMoy: 5, directVentMoy: 10 },
];

describe('lireBalisesFFVL', () => {
  const stations = lireBalisesFFVL(balises, releves);

  it('écarte les balises OpenWindMap et celles sans position', () => {
    expect(stations.map(({ id }) => id)).toEqual(['ffvl-10', 'ffvl-12']);
  });

  it('lit le relevé, la température et l’altitude', () => {
    const [jovet] = stations;
    expect(jovet).toMatchObject({
      reseau: 'ffvl', nom: 'Mont Jovet', description: 'Au décollage.', altitude: 2283,
      moyenne: 18, rafale: 28, minimum: 8, direction: 292, temperature: 0,
    });
    expect(jovet.date).toBe(Date.parse('2026-11-06T15:19:05Z'));
    expect(jovet.lien).toContain('idBalise=10');
  });

  it('ne reprend jamais les coordonnées des responsables', () => {
    expect(JSON.stringify(stations)).not.toMatch(/06 00|exemple\.fr|Responsable/);
  });

  it('garde une balise sans relevé, sans mesure, avec un nom par défaut', () => {
    const muette = stations[1];
    expect(muette.nom).toBe('FFVL 12');
    expect(muette.altitude).toBeNull();
    expect(muette.maintenance).toBe(true);
    expect(Number.isNaN(muette.moyenne)).toBe(true);
    expect(Number.isNaN(muette.date)).toBe(true);
  });

  it('refuse un format inattendu', () => {
    expect(() => lireBalisesFFVL({ erreur: 'x' }, [])).toThrow();
  });
});

describe('fusionnerReseaux', () => {
  const owm = (id, lat, lon, date, moyenne = 10) => ({ id, reseau: 'openwindmap', nom: `OWM ${id}`, lat, lon, date, moyenne, direction: 180 });
  const ffvl = (id, lat, lon, date, moyenne = 12) => ({ id, reseau: 'ffvl', nom: `FFVL ${id}`, lat, lon, date, moyenne, direction: 200 });

  it('mesure les distances en mètres', () => {
    expect(distanceMetres({ lat: 45, lon: 6 }, { lat: 45.001, lon: 6 })).toBeCloseTo(111.2, 0);
  });

  it('additionne deux balises éloignées', () => {
    const resultat = fusionnerReseaux([owm('1', 45, 6, 1000)], [ffvl('ffvl-1', 45.01, 6, 1000)]);
    expect(resultat.map(({ id }) => id).sort()).toEqual(['1', 'ffvl-1']);
  });

  it('garde la plus récente de deux balises à moins de 200 m et signale l’autre', () => {
    const resultat = fusionnerReseaux([owm('1', 45, 6, 1000)], [ffvl('ffvl-1', 45.001, 6, 2000)]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({ id: 'ffvl-1', voisine: { nom: 'OWM 1', reseau: 'openwindmap' } });
  });

  it('préfère une balise qui mesure à une plus récente sans mesure', () => {
    const resultat = fusionnerReseaux([owm('1', 45, 6, 1000)], [ffvl('ffvl-1', 45.001, 6, 5000, Number.NaN)]);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({ id: '1', voisine: { nom: 'FFVL ffvl-1' } });
  });

  it('reconnaît une voisine de l’autre côté d’une case de la grille', () => {
    // 150 m d'écart en longitude, à cheval sur une limite de case
    const resultat = fusionnerReseaux([owm('1', 45, 5.99999, 1000)], [ffvl('ffvl-1', 45, 6.0019, 2000)]);
    expect(resultat).toHaveLength(1);
  });

  it('égalité : garde OpenWindMap', () => {
    expect(meilleure(owm('1', 45, 6, 1000), ffvl('f', 45, 6, 1000)).reseau).toBe('openwindmap');
  });
});
