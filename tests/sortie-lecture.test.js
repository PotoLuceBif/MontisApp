import { describe, expect, it } from 'vitest';
import {
  formatDuNom,
  lireSortie,
  resumerSortie,
  typeDepuisSportFit,
  typeDepuisTexte,
} from '../src/sortie-lecture.js';
import { decoderFit } from '../src/sortie-fit.js';

const EPOQUE_FIT = Date.UTC(1989, 11, 31);

// Fabrique un fichier FIT minimal : messages { global, locale, champs: [[numéro, type, taille, valeur]], compresse }
function fichierFit(messages) {
  const octets = [];
  const ecrire = (valeur, taille, type) => {
    const vue = new DataView(new ArrayBuffer(taille));
    if (type === 0x07) {
      const texte = new TextEncoder().encode(valeur);
      for (let i = 0; i < taille; i++) octets.push(texte[i] ?? 0);
      return;
    }
    if (taille === 1) vue.setUint8(0, valeur);
    else if (taille === 2) vue.setUint16(0, valeur, true);
    else if (type === 0x85) vue.setInt32(0, valeur, true);
    else vue.setUint32(0, valeur, true);
    octets.push(...new Uint8Array(vue.buffer));
  };
  const definies = new Set();
  for (const { global, locale = 0, champs, compresse } of messages) {
    const cle = `${locale}:${global}:${champs.map((c) => c[0]).join(',')}`;
    if (!definies.has(cle)) {
      for (const autre of [...definies]) if (autre.startsWith(`${locale}:`)) definies.delete(autre);
      definies.add(cle);
      octets.push(0x40 | locale, 0, 0);
      ecrire(global, 2);
      octets.push(champs.length);
      for (const [numero, type, taille] of champs) octets.push(numero, taille, type);
    }
    octets.push(compresse != null ? 0x80 | (locale << 5) | compresse : locale);
    for (const [, type, taille, valeur] of champs) ecrire(valeur, taille, type);
  }
  const entete = new DataView(new ArrayBuffer(14));
  entete.setUint8(0, 14);
  entete.setUint8(1, 0x20);
  entete.setUint16(2, 2100, true);
  entete.setUint32(4, octets.length, true);
  [...'.FIT'].forEach((c, i) => entete.setUint8(8 + i, c.charCodeAt(0)));
  return new Uint8Array([...new Uint8Array(entete.buffer), ...octets, 0, 0]).buffer;
}

const semicercles = (degres) => Math.round((degres * 2 ** 31) / 180);
const pointFit = (secondes, lat, lng, altitude, fc) => ({
  global: 20,
  champs: [
    [253, 0x86, 4, secondes],
    [0, 0x85, 4, semicercles(lat)],
    [1, 0x85, 4, semicercles(lng)],
    [78, 0x86, 4, (altitude + 500) * 5],
    [3, 0x02, 1, fc],
  ],
});

describe('formats', () => {
  it('reconnaît le format par l\'extension, même compressé', () => {
    expect(formatDuNom('Sortie.FIT')).toBe('fit');
    expect(formatDuNom('vol.igc')).toBe('igc');
    expect(formatDuNom('activite.gpx.gz')).toBe('gpx');
    expect(formatDuNom('trace.kml')).toBe(null);
  });

  it('devine le type de sortie', () => {
    expect(typeDepuisTexte('hiking')).toBe('rando');
    expect(typeDepuisTexte('mountain_biking')).toBe('velo');
    expect(typeDepuisTexte('resort_skiing')).toBe('ski');
    expect(typeDepuisTexte('backcountry_skiing')).toBe('ski');
    expect(typeDepuisTexte('Paragliding')).toBe('parapente');
    expect(typeDepuisTexte('trail_running')).toBe('rando');
    expect(typeDepuisTexte('1')).toBe('velo'); // Strava
    expect(typeDepuisTexte('yoga')).toBe(null);
    expect(typeDepuisSportFit(13)).toBe('ski');
    expect(typeDepuisSportFit(17)).toBe('rando');
    expect(typeDepuisSportFit(2)).toBe('velo');
  });
});

describe('GPX', () => {
  const gpx = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Tour du lac</name><type>hiking</type>
    <trkseg>
      <trkpt lat="45.90000" lon="6.10000"><ele>1000</ele><time>2026-07-14T08:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>110</gpxtpx:hr><gpxtpx:atemp>18</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="45.90100" lon="6.10000"><ele>1050</ele><time>2026-07-14T08:10:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>130</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="45.90200" lon="6.10000"><ele>1100</ele><time>2026-07-14T08:30:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  it('lit les points, l\'heure, le cardio et la température', () => {
    const sortie = lireSortie('gpx', gpx);
    expect(sortie.nom).toBe('Tour du lac');
    expect(sortie.type).toBe('rando');
    expect(sortie.debut).toBe(Date.UTC(2026, 6, 14, 8));
    expect(sortie.points.lat).toEqual([45.9, 45.901, 45.902]);
    expect(sortie.points.fc).toEqual([110, 130, null]);
    expect(sortie.points.temperature).toEqual([18, null, null]);
    expect(sortie.points.cadence).toBeUndefined();
    expect(sortie.coupures).toEqual([2]);
  });

  it('ne compte pas la distance entre deux segments', () => {
    const resume = resumerSortie(lireSortie('gpx', gpx));
    expect(resume.distance).toBeCloseTo(111.2, 0);
    expect(resume.duree).toBe(1800);
    expect(resume.altMax).toBe(1100);
  });

  it('refuse un fichier sans trace ou illisible', () => {
    expect(() => lireSortie('gpx', '<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow(
      expect.objectContaining({ code: 'sans-trace' })
    );
    expect(() => lireSortie('gpx', 'pas du xml')).toThrow(expect.objectContaining({ code: 'invalide' }));
  });
});

describe('TCX', () => {
  it('lit les points, le cardio, la cadence et le sport', () => {
    const tcx = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="Biking"><Id>2026-07-14T08:00:00Z</Id><Lap><Track>
    <Trackpoint><Time>2026-07-14T08:00:00Z</Time><Position><LatitudeDegrees>45.9</LatitudeDegrees><LongitudeDegrees>6.1</LongitudeDegrees></Position><AltitudeMeters>500</AltitudeMeters><HeartRateBpm><Value>120</Value></HeartRateBpm><Cadence>80</Cadence></Trackpoint>
    <Trackpoint><Time>2026-07-14T08:00:05Z</Time></Trackpoint>
    <Trackpoint><Time>2026-07-14T08:00:10Z</Time><Position><LatitudeDegrees>45.901</LatitudeDegrees><LongitudeDegrees>6.1</LongitudeDegrees></Position><AltitudeMeters>505</AltitudeMeters><HeartRateBpm><Value>125</Value></HeartRateBpm><Cadence>82</Cadence></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>`;
    const sortie = lireSortie('tcx', tcx);
    expect(sortie.type).toBe('velo');
    expect(sortie.points.t).toEqual([Date.UTC(2026, 6, 14, 8), Date.UTC(2026, 6, 14, 8, 0, 10)]);
    expect(sortie.points.fc).toEqual([120, 125]);
    expect(sortie.points.cadence).toEqual([80, 82]);
  });
});

describe('IGC', () => {
  const igc = [
    'AXCT0123456',
    'HFDTEDATE:140726,01',
    'HFPLTPILOTINCHARGE: Luce',
    'HFGTYGLIDERTYPE: Ozone Rush 6',
    'B2359594553123N00612345EA0150001520',
    'B0000054553500N00612400EA0160001610',
    'G1234',
  ].join('\r\n');

  it('lit les positions, les deux altitudes et passe minuit', () => {
    const sortie = lireSortie('igc', igc);
    expect(sortie.type).toBe('parapente');
    expect(sortie.nom).toBe('Ozone Rush 6 · Luce');
    expect(sortie.points.lat[0]).toBeCloseTo(45 + 53.123 / 60, 6);
    expect(sortie.points.lng[0]).toBeCloseTo(6 + 12.345 / 60, 6);
    expect(sortie.points.alt).toEqual([1500, 1600]);
    expect(sortie.points.altGps).toEqual([1520, 1610]);
    expect(sortie.points.t[0]).toBe(Date.UTC(2026, 6, 14, 23, 59, 59));
    expect(sortie.points.t[1]).toBe(Date.UTC(2026, 6, 15, 0, 0, 5));
  });

  it('lit l\'ancien format de date et l\'hémisphère sud-ouest', () => {
    const sortie = lireSortie('igc', 'AXXX\nHFDTE010126\nB1200003330000S07030000WA0100001000\nB1200103330100S07030000WA0100501005');
    expect(sortie.points.lat[0]).toBeCloseTo(-33.5, 6);
    expect(sortie.points.lng[0]).toBeCloseTo(-70.5, 6);
    expect(sortie.debut).toBe(Date.UTC(2026, 0, 1, 12));
  });

  it('refuse un fichier sans enregistrement de position', () => {
    expect(() => lireSortie('igc', 'AXXX\nHFDTE010126')).toThrow(expect.objectContaining({ code: 'sans-trace' }));
    expect(() => lireSortie('igc', 'bonjour')).toThrow(expect.objectContaining({ code: 'invalide' }));
  });
});

describe('FIT', () => {
  const debut = 1100000000; // secondes FIT
  const fit = fichierFit([
    { global: 0, champs: [[4, 0x86, 4, debut]] },
    { global: 12, locale: 1, champs: [[0, 0x00, 1, 17], [1, 0x00, 1, 0], [3, 0x07, 8, 'Rando']] },
    // Point sans position (GPS pas encore accroché) : ignoré
    { global: 20, locale: 2, champs: [[253, 0x86, 4, debut]] },
    { ...pointFit(debut + 1, 45.9, 6.1, 1000, 100), locale: 3 },
    { ...pointFit(debut + 2, 45.901, 6.1, 1010, 105), locale: 3 },
  ]);

  it('lit les points, l\'altitude, le cardio et le sport', () => {
    const sortie = lireSortie('fit', fit);
    expect(sortie.format).toBe('fit');
    expect(sortie.type).toBe('rando');
    expect(sortie.nom).toBe('Rando');
    expect(sortie.debut).toBe(EPOQUE_FIT + (debut + 1) * 1000);
    expect(sortie.points.lat[0]).toBeCloseTo(45.9, 6);
    expect(sortie.points.lng[1]).toBeCloseTo(6.1, 6);
    expect(sortie.points.alt).toEqual([1000, 1010]);
    expect(sortie.points.fc).toEqual([100, 105]);
  });

  it('lit le fuseau du lieu dans le message activité', () => {
    const avecActivite = fichierFit([
      // Activité : heure universelle (253) et heure locale de la montre (5), en Guyane (UTC−3)
      { global: 34, locale: 4, champs: [[253, 0x86, 4, debut + 10], [5, 0x86, 4, debut + 10 - 3 * 3600]] },
      { ...pointFit(debut + 1, 4.9, -52.3, 20, 100), locale: 3 },
      { ...pointFit(debut + 2, 4.91, -52.3, 20, 100), locale: 3 },
    ]);
    expect(lireSortie('fit', avecActivite).decalage).toBe(-180);
    expect(lireSortie('fit', fit).decalage).toBe(null);
  });

  it('reconstitue l\'horodatage compressé', () => {
    const base = 0x41ab0000 + 30; // 5 bits bas : 30
    const decode = decoderFit(
      fichierFit([
        { ...pointFit(base, 45.9, 6.1, 1000, 100), locale: 0 },
        // Décalage 2 < 30 : on passe au bloc de 32 s suivant
        {
          global: 20,
          locale: 1,
          compresse: 2,
          champs: [[0, 0x85, 4, semicercles(45.91)], [1, 0x85, 4, semicercles(6.1)]],
        },
      ])
    );
    expect(decode.points[1].t - decode.points[0].t).toBe(4000);
  });

  it('ignore les valeurs invalides et refuse un fichier qui n\'est pas du FIT', () => {
    const sortie = lireSortie('fit', fichierFit([{ ...pointFit(debut, 45.9, 6.1, 1000, 0xff) }, pointFit(debut + 1, 45.91, 6.1, 1000, 0xff)]));
    expect(sortie.points.fc).toBeUndefined();
    expect(() => lireSortie('fit', new TextEncoder().encode('pas un fit du tout').buffer)).toThrow(
      expect.objectContaining({ code: 'invalide' })
    );
  });
});
