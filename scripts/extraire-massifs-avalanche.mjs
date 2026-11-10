// Usage : node scripts/extraire-massifs-avalanche.mjs
// Télécharge les micro-régions des bulletins d'avalanche (EAWS, https://regions.avalanches.org,
// licence CC BY 4.0) et range leurs contours simplifiés dans public/data/avalanches/massifs.json :
// assez pour trouver le massif d'un point, pas pour les dessiner finement.
import { writeFile, mkdir } from 'node:fs/promises';

const SOURCE = 'https://regions.avalanches.org';
const LISTE = 'https://gitlab.com/api/v4/projects/eaws%2Feaws-regions/repository/tree?path=public/micro-regions&per_page=100';
const SORTIE = 'public/data/avalanches/massifs.json';
const TOLERANCE = 0.008; // degrés, environ 600 m
const DECIMALES = 3;

// Douglas-Peucker sur un anneau, en degrés : la précision voulue est grossière
function simplifier(points, tolerance) {
  if (points.length < 5) return points;
  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [debut, fin] = pile.pop();
    const [ax, ay] = points[debut];
    const [bx, by] = points[fin];
    const dx = bx - ax;
    const dy = by - ay;
    const longueur = Math.hypot(dx, dy);
    let max = 0;
    let indice = -1;
    for (let i = debut + 1; i < fin; i += 1) {
      const [px, py] = points[i];
      // Anneau fermé : premier et dernier points confondus, on mesure l'écart au point
      const ecart = longueur ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / longueur : Math.hypot(px - ax, py - ay);
      if (ecart > max) {
        max = ecart;
        indice = i;
      }
    }
    if (max > tolerance && indice > 0) {
      garder[indice] = 1;
      pile.push([debut, indice], [indice, fin]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

const arrondir = (v) => Number(v.toFixed(DECIMALES));

function polygones(geometrie) {
  const liste = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.type === 'MultiPolygon' ? geometrie.coordinates : [];
  return liste
    .map((anneaux) => anneaux
      .map((anneau) => simplifier(anneau, TOLERANCE).map(([x, y]) => [arrondir(x), arrondir(y)]))
      .filter((anneau) => anneau.length >= 4))
    .filter((anneaux) => anneaux.length);
}

const fichiers = (await (await fetch(LISTE)).json())
  .map(({ name }) => name)
  .filter((nom) => nom.endsWith('_micro-regions.geojson.json'));
console.log(`${fichiers.length} fichiers de micro-régions`);

const noms = {};
for (const langue of ['fr', 'en']) {
  noms[langue] = await (await fetch(`${SOURCE}/micro-regions_names/${langue}.json`)).json();
}

const massifs = [];
const vus = new Set();
for (const fichier of fichiers) {
  const reponse = await fetch(`${SOURCE}/micro-regions/${fichier}`);
  if (!reponse.ok) {
    console.log(`   ✗ ${fichier} : HTTP ${reponse.status}`);
    continue;
  }
  const { features } = await reponse.json();
  let gardes = 0;
  for (const { properties: p, geometry } of features) {
    // Une micro-région peut avoir plusieurs versions : seule l'actuelle compte
    if (!p?.id || p.end_date || vus.has(p.id) || !geometry) continue;
    const contours = polygones(geometry);
    if (!contours.length) continue;
    const xs = contours.flatMap((anneaux) => anneaux[0].map(([x]) => x));
    const ys = contours.flatMap((anneaux) => anneaux[0].map(([, y]) => y));
    vus.add(p.id);
    massifs.push({
      id: p.id,
      fr: noms.fr[p.id] ?? undefined,
      en: noms.en[p.id] && noms.en[p.id] !== noms.fr[p.id] ? noms.en[p.id] : undefined,
      boite: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      contours,
    });
    gardes += 1;
  }
  console.log(`   ${fichier} : ${gardes}`);
}

await mkdir('public/data/avalanches', { recursive: true });
const texte = JSON.stringify({ source: 'EAWS micro-regions, CC BY 4.0', massifs });
await writeFile(SORTIE, texte);
console.log(`${massifs.length} massifs, ${(texte.length / 1024).toFixed(0)} Ko → ${SORTIE}`);
