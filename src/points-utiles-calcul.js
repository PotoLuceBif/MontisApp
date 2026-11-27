// Calculs purs des points utiles vus de plus loin (points-utiles-loin.js)

const RAD = Math.PI / 180;
const LAT_MAX = 85.0511;

export const xTuile = (lng, z) => ((lng + 180) / 360) * 2 ** z;
export function yTuile(lat, z) {
  const r = Math.max(-LAT_MAX, Math.min(LAT_MAX, lat)) * RAD;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

// Tuiles du zoom z qui couvrent la vue, les plus proches du centre d'abord, `max` au plus
export function tuilesVue({ ouest, sud, est, nord }, z, centre, max = Infinity) {
  const n = 2 ** z;
  const x0 = Math.floor(xTuile(ouest, z));
  const x1 = Math.floor(xTuile(est, z));
  const y0 = Math.max(0, Math.floor(yTuile(nord, z)));
  const y1 = Math.min(n - 1, Math.floor(yTuile(sud, z)));
  const cx = xTuile(centre.lng, z);
  const cy = yTuile(centre.lat, z);
  const tuiles = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      tuiles.push({ z, x: ((x % n) + n) % n, y, d: (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 });
    }
  }
  return tuiles
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ z: tz, x, y }) => ({ z: tz, x, y }));
}
