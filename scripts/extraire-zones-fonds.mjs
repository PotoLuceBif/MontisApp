// Contours simplifiés des pays couverts par un fond national (src/fonds-zones.js).
// Source : Natural Earth 1/50 000 000 (domaine public).
// Usage : node scripts/extraire-zones-fonds.mjs [chemin/vers/ne_50m_admin_0_countries.geojson]
import { readFile, writeFile } from 'node:fs/promises';

const ADRESSE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

// Code Montis → code Natural Earth, tolérance de simplification (degrés), aire minimale d'une île (degrés²), filtre
const PAYS = {
  FR: { ne: 'FRA', tolerance: 0.02, aireMin: 0.05, garder: ([lng, lat]) => lng > -10 && lat > 40 }, // métropole et Corse
  CH: { ne: 'CHE', tolerance: 0.008, aireMin: 0 },
  AT: { ne: 'AUT', tolerance: 0.01, aireMin: 0 },
  ES: { ne: 'ESP', tolerance: 0.03, aireMin: 0.05 },
  NO: { ne: 'NOR', tolerance: 0.05, aireMin: 0.3, garder: ([, lat]) => lat < 72 }, // sans le Svalbard
  BE: { ne: 'BEL', tolerance: 0.01, aireMin: 0 },
  US: { ne: 'USA', tolerance: 0.1, aireMin: 0.5 },
  CA: { ne: 'CAN', tolerance: 0.2, aireMin: 5 },
  JP: { ne: 'JPN', tolerance: 0.03, aireMin: 0.1 },
};

const aire = (anneau) => {
  let s = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) s += (anneau[j][0] + anneau[i][0]) * (anneau[j][1] - anneau[i][1]);
  return Math.abs(s / 2);
};

// Douglas-Peucker
function simplifier(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let max = 0;
  let indice = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const long = Math.hypot(dx, dy) || 1e-12;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / long;
    if (d > max) { max = d; indice = i; }
  }
  if (max <= tolerance) return [a, b];
  return [...simplifier(points.slice(0, indice + 1), tolerance).slice(0, -1), ...simplifier(points.slice(indice), tolerance)];
}

const texte = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await (await fetch(ADRESSE)).text();
const pays = JSON.parse(texte).features;

const sortie = {};
for (const [code, { ne, tolerance, aireMin, garder = () => true }] of Object.entries(PAYS)) {
  const entite = pays.find((f) => f.properties.ADM0_A3 === ne);
  if (!entite) throw new Error(`Pays introuvable : ${ne}`);
  const { type, coordinates } = entite.geometry;
  const polygones = type === 'Polygon' ? [coordinates] : coordinates;
  sortie[code] = polygones
    .map(([exterieur]) => exterieur)
    .filter((anneau) => aire(anneau) >= aireMin && garder(anneau[0]))
    .map((anneau) => {
      // Le premier et le dernier point d'un anneau sont confondus : on simplifie un anneau ouvert puis on le referme
      const ouvert = simplifier(anneau.slice(0, -1), tolerance);
      return [...ouvert, ouvert[0]].map(([lng, lat]) => [Math.round(lng * 100) / 100, Math.round(lat * 100) / 100]);
    })
    .filter((anneau) => anneau.length >= 4)
    .map((anneau) => [anneau]);
  console.log(code, sortie[code].length, 'polygones,', sortie[code].reduce((n, [a]) => n + a.length, 0), 'points');
}

// Rectangle englobant, élargi de 0,2° : les cartes nationales débordent souvent un peu de la frontière
const emprise = (multi) => {
  const points = multi.flat(2);
  const arrondi = (v) => Math.round(v * 10) / 10;
  return [
    arrondi(Math.min(...points.map((p) => p[0])) - 0.2),
    arrondi(Math.min(...points.map((p) => p[1])) - 0.2),
    arrondi(Math.max(...points.map((p) => p[0])) + 0.2),
    arrondi(Math.max(...points.map((p) => p[1])) + 0.2),
  ];
};
const lignesEmprises = Object.entries(sortie).map(([code, multi]) => `  ${code}: ${JSON.stringify(emprise(multi))},`);
await writeFile(
  new URL('../src/fonds-emprises.js', import.meta.url),
  `// Rectangle englobant de chaque pays de src/fonds-zones.js, élargi de 0,2° (ouest, sud, est, nord).
// Généré par scripts/extraire-zones-fonds.mjs : ne pas modifier à la main. Chargé au démarrage, les contours non.
export const EMPRISES_PAYS = {
${lignesEmprises.join('\n')}
};
`
);

const lignes = Object.entries(sortie).map(([code, multi]) => `  ${code}: ${JSON.stringify(multi)},`);
await writeFile(
  new URL('../src/fonds-zones.js', import.meta.url),
  `// Contours simplifiés des pays couverts par un fond national (MultiPolygon GeoJSON, longitude puis latitude).
// Généré par scripts/extraire-zones-fonds.mjs depuis Natural Earth (domaine public) : ne pas modifier à la main.
export const ZONES_PAYS = {
${lignes.join('\n')}
};
`
);
