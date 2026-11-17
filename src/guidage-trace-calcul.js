// Trace enregistrée pendant le guidage : points gardés, segments séparés par les trous
// (écran éteint, appli quittée), résumé et fichier GPX. Purs, testés.
// Un point : [instant (ms), lng, lat, altitude ou null].

const R = 6371000;
const RAD = Math.PI / 180;
export const PRECISION_TRACE = 50; // m : un point plus flou n'est pas gardé
export const TROU = 90000; // ms sans point : la suite part dans un nouveau segment
const PAS_DISTANCE = 5; // m entre deux points gardés…
const PAS_TEMPS = 30000; // …ou un point toutes les 30 s, même immobile

export function distancePoints(a, b) {
  const dLat = (b[2] - a[2]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[2] * RAD) * Math.cos(b[2] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nouvelleTrace({ nom, parcours = null, debut }) {
  return { nom, parcours, debut, segments: [] };
}

// Ajoute une position à la trace (modifiée sur place). coupure : on revient après une absence,
// la suite part dans un nouveau segment. Renvoie vrai si le point est gardé.
export function ajouterPoint(trace, { t, lng, lat, altitude = null, precision = 0 }, { coupure = false } = {}) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !Number.isFinite(t)) return false;
  if (precision > PRECISION_TRACE) return false;
  const point = [t, Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6, Number.isFinite(altitude) ? Math.round(altitude * 10) / 10 : null];
  const segment = trace.segments.at(-1);
  const dernier = segment?.at(-1);
  if (!dernier || coupure || t - dernier[0] > TROU) {
    if (segment && !segment.length) segment.push(point);
    else trace.segments.push([point]);
    return true;
  }
  if (t <= dernier[0]) return false;
  if (distancePoints(dernier, point) < PAS_DISTANCE && t - dernier[0] < PAS_TEMPS) return false;
  segment.push(point);
  return true;
}

// Dénivelé positif avec un seuil : l'altitude du GPS est bruitée
function denivelePlus(alts, seuil) {
  let ref = null;
  let plus = 0;
  for (const alt of alts) {
    if (alt === null) continue;
    if (ref === null) ref = alt;
    else if (alt - ref >= seuil) {
      plus += alt - ref;
      ref = alt;
    } else if (ref - alt >= seuil) ref = alt;
  }
  return plus;
}

// Distance, durée (du premier au dernier point), D+ (null sans altitude) et nombre de trous
export function resumeTrace(trace, { seuil = 5 } = {}) {
  const segments = trace.segments.filter((segment) => segment.length);
  let distance = 0;
  let plus = 0;
  let avecAltitude = false;
  let points = 0;
  for (const segment of segments) {
    points += segment.length;
    for (let i = 1; i < segment.length; i += 1) distance += distancePoints(segment[i - 1], segment[i]);
    const alts = segment.map((point) => point[3]);
    if (alts.some((alt) => alt !== null)) avecAltitude = true;
    plus += denivelePlus(alts, seuil);
  }
  const premier = segments[0]?.[0];
  const dernier = segments.at(-1)?.at(-1);
  return {
    distance,
    duree: premier ? (dernier[0] - premier[0]) / 1000 : 0,
    plus: avecAltitude ? plus : null,
    points,
    trous: Math.max(0, segments.length - 1),
  };
}

// Toute la trace en [lng, lat], segments mis bout à bout (pour Mes parcours)
export const chaineTrace = (trace) => trace.segments.flatMap((segment) => segment.map(([, lng, lat]) => [lng, lat]));

const echapper = (texte) => String(texte).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// GPX avec un <trkseg> par segment : les trous restent visibles dans les autres applis
export function gpxTrace(trace) {
  const segments = trace.segments
    .filter((segment) => segment.length)
    .map((segment) => {
      const points = segment
        .map(([t, lng, lat, alt]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${alt === null ? '' : `<ele>${Math.round(alt)}</ele>`}<time>${new Date(t).toISOString()}</time></trkpt>`)
        .join('\n');
      return `    <trkseg>\n${points}\n    </trkseg>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Montis" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${echapper(trace.nom)}</name>
    <time>${new Date(trace.debut).toISOString()}</time>
  </metadata>
  <trk>
    <name>${echapper(trace.nom)}</name>
${segments}
  </trk>
</gpx>
`;
}

// Lecture prudente d'une trace sauvegardée (localStorage) : null si elle est abîmée
export function lireTraceSauvee(valeur) {
  if (!valeur || typeof valeur !== 'object' || !Array.isArray(valeur.segments)) return null;
  const segments = valeur.segments
    .filter(Array.isArray)
    .map((segment) => segment.filter((point) => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(Number.isFinite)).map(([t, lng, lat, alt = null]) => [t, lng, lat, Number.isFinite(alt) ? alt : null]))
    .filter((segment) => segment.length);
  return { nom: typeof valeur.nom === 'string' ? valeur.nom : '', parcours: valeur.parcours ?? null, debut: Number.isFinite(valeur.debut) ? valeur.debut : segments[0]?.[0][0] ?? 0, segments };
}
