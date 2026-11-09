// Calculs purs des fonds de carte : couverture d'un point, tuiles découpées à la frontière, rangement par pays.

// Rectangle [ouest, sud, est, nord] en polygone GeoJSON
const rectangle = ([o, s, e, n]) => [[[o, s], [e, s], [e, n], [o, n], [o, s]]];

// Contour d'une zone en MultiPolygon GeoJSON (coordonnées seules). `zones` : contours des pays (fonds-zones.js)
export function geometrieZone(zone, zones = {}) {
  if (!zone) return null;
  if (Array.isArray(zone)) return [rectangle(zone)];
  return zones[zone] ?? null;
}

// Point dans un anneau (lancer de rayon)
export function pointDansAnneau(anneau, lng, lat) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// Le point est-il couvert ? Zone nulle : monde entier. Sans le contour d'un pays (pas encore chargé),
// le rectangle `emprise` sert de repli.
export function zoneCouvre(zone, lng, lat, { zones = {}, emprise = null } = {}) {
  if (!zone) return true;
  const multi = geometrieZone(zone, zones) ?? (emprise ? [rectangle(emprise)] : null);
  if (!multi) return false;
  return multi.some(([exterieur]) => pointDansAnneau(exterieur, lng, lat));
}

// ---------- Tuiles d'une carte nationale, découpées à la frontière ----------

const latDeY = (y, n) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

// Emprise d'une tuile en degrés [ouest, sud, est, nord]
export function limitesTuile(z, x, y) {
  const n = 2 ** z;
  return [(x / n) * 360 - 180, latDeY(y + 1, n), ((x + 1) / n) * 360 - 180, latDeY(y, n)];
}

// Emprise d'une tuile en mètres Web Mercator, pour un service WMS : « ouest,sud,est,nord »
export function empriseMetres(z, x, y) {
  const cote = (2 * 20037508.342789244) / 2 ** z;
  const o = -20037508.342789244;
  return [o + x * cote, -o - (y + 1) * cote, o + (x + 1) * cote, -o - y * cote].map((v) => v.toFixed(2)).join(',');
}

const dansRectangle = ([px, py], [o, s, e, n]) => px >= o && px <= e && py >= s && py <= n;

function segmentsSeCoupent([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// Une tuile est-elle 'dedans', 'dehors' ou au 'bord' de la zone ? Dedans : telle quelle ; dehors : rien à demander.
export function relationTuile(multi, z, x, y) {
  const r = limitesTuile(z, x, y);
  const [o, s, e, n] = r;
  const coins = [[o, s], [e, s], [e, n], [o, n]];
  const cotes = coins.map((c, i) => [c, coins[(i + 1) % 4]]);
  for (const [anneau] of multi) {
    for (let i = 1; i < anneau.length; i += 1) {
      const a = anneau[i - 1];
      const b = anneau[i];
      if (dansRectangle(a, r) || cotes.some(([c, d]) => segmentsSeCoupent(a, b, c, d))) return 'bord';
    }
  }
  const centre = [(o + e) / 2, (s + n) / 2];
  return multi.some(([anneau]) => pointDansAnneau(anneau, ...centre)) ? 'dedans' : 'dehors';
}

// Anneau en pixels d'une tuile de `cote` pixels, pour y découper l'image
export function anneauEnPixels(anneau, z, x, y, cote) {
  const n = 2 ** z;
  return anneau.map(([lng, lat]) => {
    const r = (lat * Math.PI) / 180;
    const ty = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    return [(((lng + 180) / 360) * n - x) * cote, (ty - y) * cote];
  });
}

// Range des fonds (ou calques) par région puis par pays, dans l'ordre de `pays` ; les régions et pays vides disparaissent
export function rangerParPays(elements, pays, regions) {
  return regions
    .map((region) => ({
      region,
      pays: pays
        .filter((p) => p.region === region)
        .map((p) => ({ code: p.code, elements: elements.filter((e) => e.pays === p.code) }))
        .filter((p) => p.elements.length),
    }))
    .filter((r) => r.pays.length);
}
