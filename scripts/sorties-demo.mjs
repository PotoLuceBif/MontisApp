// Fichiers de sortie fabriqués pour les captures de Mes traces : une rando en GPX, une sortie
// vélo en TCX et un vol en IGC, autour d'Annecy. Inventés : aucune vraie trace dans le dépôt.

function boucle({ centre, rayon, n, alt, ampl }) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 2;
    const ondulation = 1 + 0.18 * Math.sin(a * 5);
    return {
      lng: centre[0] + rayon * 1.4 * Math.cos(a) * ondulation,
      lat: centre[1] + rayon * Math.sin(a) * ondulation,
      alt: alt + ampl * Math.sin(a / 2) ** 2 + 6 * Math.sin(a * 23),
    };
  });
}

export function gpxRando() {
  const debut = Date.UTC(2026, 7, 14, 6, 30);
  const points = boucle({ centre: [6.105, 45.775], rayon: 0.03, n: 900, alt: 1100, ampl: 590 });
  const lignes = points.map((p, i) => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><ele>${p.alt.toFixed(1)}</ele><time>${new Date(debut + i * 20000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(105 + 40 * Math.sin((i / 900) * Math.PI))}</gpxtpx:hr><gpxtpx:atemp>14</gpxtpx:atemp></gpxtpx:TrackPointExtension></extensions></trkpt>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Montis captures" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
<trk><name>Tour du Semnoz</name><type>hiking</type><trkseg>
${lignes.join('\n')}
</trkseg></trk></gpx>`;
}

export function tcxVelo() {
  const debut = Date.UTC(2026, 6, 2, 15);
  const points = boucle({ centre: [6.2, 45.86], rayon: 0.08, n: 600, alt: 450, ampl: 520 });
  const lignes = points.map((p, i) => `<Trackpoint><Time>${new Date(debut + i * 15000).toISOString()}</Time><Position><LatitudeDegrees>${p.lat.toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${p.lng.toFixed(6)}</LongitudeDegrees></Position><AltitudeMeters>${p.alt.toFixed(1)}</AltitudeMeters><HeartRateBpm><Value>${130 + (i % 20)}</Value></HeartRateBpm><Cadence>${80 + (i % 10)}</Cadence></Trackpoint>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Biking"><Id>${new Date(debut).toISOString()}</Id><Lap><Track>
${lignes.join('\n')}
</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

const igcCoord = (valeur, chiffres, positif, negatif) => {
  const absolu = Math.abs(valeur);
  const degres = Math.floor(absolu);
  const milliemes = Math.round((absolu - degres) * 60000);
  return `${String(degres).padStart(chiffres, '0')}${String(milliemes).padStart(5, '0')}${valeur >= 0 ? positif : negatif}`;
};

export function igcVol() {
  const points = boucle({ centre: [6.22, 45.82], rayon: 0.035, n: 400, alt: 1700, ampl: 900 });
  const lignes = points.map((p, i) => {
    const s = 11 * 3600 + i * 5;
    const heure = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join('');
    const alt = String(Math.round(p.alt)).padStart(5, '0');
    return `B${heure}${igcCoord(p.lat, 2, 'N', 'S')}${igcCoord(p.lng, 3, 'E', 'W')}A${alt}${alt}`;
  });
  return ['AXXXMONTIS', 'HFDTEDATE:200626,01', 'HFPLTPILOTINCHARGE:Montis', 'HFGTYGLIDERTYPE:Voile de démo', ...lignes].join('\r\n');
}
