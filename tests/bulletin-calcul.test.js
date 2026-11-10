import { describe, expect, it } from 'vitest';
import { cumulsNeige, fichierDuMassif, fichiersDuJour, lireBulletin, texteBrut, zonesExposees } from '../src/bulletin-calcul.js';

describe('fichiers des bulletins', () => {
  const page = `<a href="./2026-02-10-FR.json">x</a><a href="./2026-02-10-FR.ratings.json"></a>
    <a href="./2026-02-10-AT-07.json"></a><a href="./2026-02-10-AT-07.fr.json"></a><a href="./2026-02-10-IT-32-BZ.json"></a>
    <a href="./2026-02-10-CH.problems.json"></a><a href="./2026-02-10-FR.raw.xml"></a>`;
  const fichiers = fichiersDuJour(page, '2026-02-10');

  it('lit la liste du jour sans les fichiers de niveaux ni de problèmes', () => {
    expect([...fichiers].sort()).toEqual(['AT-07', 'AT-07.fr', 'FR', 'IT-32-BZ']);
  });

  it('choisit le service au plus long préfixe, dans la langue quand elle existe', () => {
    expect(fichierDuMassif('AT-07-02-01', fichiers, 'fr')).toBe('AT-07.fr');
    expect(fichierDuMassif('AT-07-02-01', fichiers, 'en')).toBe('AT-07');
    expect(fichierDuMassif('IT-32-BZ-04', fichiers)).toBe('IT-32-BZ');
    expect(fichierDuMassif('FR-08', fichiers)).toBe('FR');
    expect(fichierDuMassif('CH-7222', fichiers)).toBeNull();
    expect(fichierDuMassif(undefined, fichiers)).toBeNull();
  });
});

describe('texte d’un bulletin', () => {
  it('garde les paragraphes et retire le HTML', () => {
    expect(texteBrut('<h1>Manteau</h1><p>Couches  fragiles &amp; plaques.</p><p>Prudence&nbsp;!</p>')).toEqual(['Manteau', 'Couches fragiles & plaques.', 'Prudence !']);
    expect(texteBrut('Ligne 1 \n\nLigne 2')).toEqual(['Ligne 1', 'Ligne 2']);
    expect(texteBrut(null)).toEqual([]);
  });
});

describe('bulletin d’un massif', () => {
  // D'après le bulletin de Météo-France du 10 février 2026 (Beaufortain) et celui du Tyrol
  const json = {
    bulletins: [
      {
        regions: [{ regionID: 'FR-08' }],
        publicationTime: '2026-02-09T16:00:00+01:00',
        validTime: { startTime: '2026-02-09T16:00:00+01:00', endTime: '2026-02-10T18:00:00+01:00' },
        source: { provider: { name: 'Meteo France', website: 'https://meteofrance.com/meteo-montagne' } },
        customData: { MeteoFrance: { avalancheProneLocation: { aspects: ['N', 'NE', 'E', 'W', 'NW', 'X'] } } },
        dangerRatings: [
          { mainValue: 'considerable', elevation: { lowerBound: '1700' }, validTimePeriod: 'all_day' },
          { mainValue: 'moderate', elevation: { upperBound: '1700' }, validTimePeriod: 'all_day' },
          { mainValue: 'no_rating' },
        ],
        avalancheActivity: { comment: 'QUELQUES INSTABILITES. \n\nEn journée : 5 à 10 cm dès 1500 m.' },
        snowpackStructure: { comment: 'Limites skiables : vers 1100/1500 m.' },
      },
      {
        regions: [{ regionID: 'AT-07-02-01', name: 'Karwendel' }],
        dangerRatings: [{ mainValue: 'high', validTimePeriod: 'later' }, { mainValue: 'considerable', validTimePeriod: 'earlier' }],
        avalancheProblems: [
          { problemType: 'persistent_weak_layers', aspects: ['NW', 'N', 'NE'], elevation: { lowerBound: '1800' }, avalancheSize: 2, comment: '<p>Couches fragiles.</p>' },
          { problemType: 'inconnu' },
        ],
        tendency: [{ highlights: 'Situation toujours traître.', tendencyType: 'steady' }],
        source: { provider: { name: 'Avalanche.report', website: 'javascript:alert(1)' } },
      },
    ],
  };

  it('lit niveaux par altitude, orientations et paragraphes de Météo-France', () => {
    const b = lireBulletin(json, 'FR-08');
    expect(b.max).toBe(3);
    expect(b.niveaux).toEqual([
      { niveau: 2, periode: 'all_day', min: null, max: 1700, orientations: [] },
      { niveau: 3, periode: 'all_day', min: 1700, max: null, orientations: [] },
    ]);
    expect(b.orientations).toEqual(['N', 'NE', 'E', 'W', 'NW']);
    expect(b.activite).toEqual(['QUELQUES INSTABILITES.', 'En journée : 5 à 10 cm dès 1500 m.']);
    expect(b.manteau).toEqual(['Limites skiables : vers 1100/1500 m.']);
    expect(b.site).toBe('https://meteofrance.com/meteo-montagne');
    expect(b.fin).toBe('2026-02-10T18:00:00+01:00');
  });

  it('lit problèmes, moments de la journée et tendance', () => {
    const b = lireBulletin(json, 'AT-07-02-01');
    expect(b.region).toBe('Karwendel');
    expect(b.niveaux.map(({ niveau, periode }) => [niveau, periode])).toEqual([[3, 'earlier'], [4, 'later']]);
    expect(b.problemes).toEqual([{ type: 'persistent_weak_layers', periode: 'all_day', min: 1800, max: null, orientations: ['N', 'NE', 'NW'], taille: 2, commentaire: ['Couches fragiles.'] }]);
    expect(b.orientations).toEqual(['N', 'NE', 'NW']);
    expect(b.titre).toBe('Situation toujours traître.');
    expect(b.tendance.type).toBe('steady');
    expect(b.site).toBeNull();
  });

  it('renvoie null pour un massif absent ou un fichier cassé', () => {
    expect(lireBulletin(json, 'CH-1111')).toBeNull();
    expect(lireBulletin(null, 'FR-08')).toBeNull();
    expect(lireBulletin({ bulletins: [{ regions: 'x' }] }, 'FR-08')).toBeNull();
  });
});

describe('neige récente', () => {
  it('cumule les chutes des 24, 48 et 72 dernières heures', () => {
    const maintenant = Date.parse('2026-02-10T12:00:00Z');
    const heures = { time: [], snowfall: [] };
    for (let h = 96; h >= -5; h -= 1) {
      const instant = new Date(maintenant - h * 3_600_000).toISOString().slice(0, 16);
      heures.time.push(instant);
      // 1 cm par heure la veille, 0,5 cm par heure l'avant-veille, rien avant ni dans le futur pris en compte
      heures.snowfall.push(h >= 1 && h <= 24 ? 1 : h > 24 && h <= 48 ? 0.5 : h < 0 ? 9 : 0);
    }
    expect(cumulsNeige(heures, maintenant)).toEqual({ h24: 23, h48: 36, h72: 36 });
  });

  it('ne dit rien sans données', () => {
    expect(cumulsNeige(null)).toBeNull();
    expect(cumulsNeige({ time: ['x'], snowfall: [1] })).toBeNull();
  });
});

describe('pentes concernées', () => {
  const base = { niveaux: [], problemes: [], orientations: [] };

  it('prend orientations et altitudes de chaque problème, réunies par tranche', () => {
    const zones = zonesExposees({
      ...base,
      problemes: [
        { type: 'wind_slab', orientations: ['N', 'NE'], min: 2000, max: null },
        { type: 'new_snow', orientations: ['E'], min: 2000, max: null },
        { type: 'wet_snow', orientations: ['S'], min: null, max: 1800 },
        { type: 'favourable_situation', orientations: ['W'], min: null, max: null },
        { type: 'gliding_snow', orientations: [], min: null, max: null },
      ],
    });
    expect(zones).toEqual([{ masque: 0b111, min: 2000, max: null }, { masque: 0b10000, min: null, max: 1800 }]);
  });

  it('sans problème, garde les orientations de Météo-France à l’altitude du niveau le plus fort', () => {
    const niveaux = [{ niveau: 2, min: null, max: 1700 }, { niveau: 3, min: 1700, max: null }];
    expect(zonesExposees({ ...base, niveaux, orientations: ['N', 'NW'] })).toEqual([{ masque: 0b10000001, min: 1700, max: null }]);
    expect(zonesExposees({ ...base, niveaux: [{ niveau: 2, min: null, max: null }], orientations: ['S'] })).toEqual([{ masque: 0b10000, min: null, max: null }]);
    expect(zonesExposees({ ...base })).toEqual([]);
    expect(zonesExposees(null)).toEqual([]);
  });
});
