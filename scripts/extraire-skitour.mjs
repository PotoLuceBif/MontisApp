// Usage : node scripts/extraire-skitour.mjs
// Itinéraires de ski de rando (usage « skitour ») d'OpenSkiData (licence ODbL, https://openskidata.org),
// rangés par carré de 1° dans public/data/skitour/<lng>_<lat>.json, avec la liste des carrés
// (index.json) : l'appli ne charge que ceux de la vue, sans dépendre d'Overpass, souvent saturé.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const SOURCE = 'https://tiles.openskimap.org/geojson/runs.geojson';
const DOSSIER = 'public/data/skitour';
const TOLERANCE = 0.00005; // degrés, environ 5 m
const DIFFICULTES = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride'];

async function* lireObjets(url) {
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${url}`);
  const lignes = createInterface({ input: Readable.fromWeb(rep.body), crlfDelay: Infinity });
  for await (const brute of lignes) {
    const ligne = brute.trim().replace(/,$/, '');
    if (ligne.startsWith('{"type":"Feature"')) yield JSON.parse(ligne);
  }
}

function simplifier(points) {
  if (points.length < 3) return points;
  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [debut, fin] = pile.pop();
    const [ax, ay] = points[debut];
    const [bx, by] = points[fin];
    const longueur = Math.hypot(bx - ax, by - ay);
    let max = 0;
    let indice = -1;
    for (let i = debut + 1; i < fin; i += 1) {
      const [px, py] = points[i];
      const ecart = longueur ? Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / longueur : Math.hypot(px - ax, py - ay);
      if (ecart > max) {
        max = ecart;
        indice = i;
      }
    }
    if (max > TOLERANCE && indice > 0) {
      garder[indice] = 1;
      pile.push([debut, indice], [indice, fin]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

const arrondir = ([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))];

function lignesDe(geometrie) {
  if (geometrie?.type === 'LineString') return [geometrie.coordinates];
  if (geometrie?.type === 'MultiLineString') return geometrie.coordinates;
  return [];
}

const carres = new Map();
let total = 0;
console.log('Lecture des pistes d’OpenSkiData…');
for await (const f of lireObjets(SOURCE)) {
  const p = f.properties;
  if (!(p.uses || []).includes('skitour') || p.status === 'abandoned' || p.status === 'disused') continue;
  const lignes = lignesDe(f.geometry).map((ligne) => simplifier(ligne.map(arrondir))).filter((ligne) => ligne.length >= 2);
  if (!lignes.length) continue;
  const osm = (p.sources || []).filter(({ type }) => type === 'openstreetmap').map(({ id }) => id);
  // Les relations d'abord : leur lien OSM montre tout l'itinéraire
  osm.sort((a, b) => Number(b.startsWith('relation/')) - Number(a.startsWith('relation/')));
  const itineraire = { i: p.id.slice(0, 12), l: lignes };
  // OpenSkiData réunit parfois plusieurs noms, préfixés « skitour: » : chacun une fois
  const nom = [...new Set(String(p.name || '').split(/\s*,\s*/).map((part) => part.replace(/^skitour\s*:\s*/i, '').trim()).filter(Boolean))].join(', ');
  if (nom) itineraire.n = nom;
  if (DIFFICULTES.includes(p.difficulty)) itineraire.d = p.difficulty;
  if (osm[0]) itineraire.o = osm[0];
  // Rangé dans chaque carré de 1° que l'itinéraire touche
  const cles = new Set(lignes.flat().map(([lng, lat]) => `${Math.floor(lng)}_${Math.floor(lat)}`));
  for (const cle of cles) {
    if (!carres.has(cle)) carres.set(cle, []);
    carres.get(cle).push(itineraire);
  }
  total += 1;
}

if (!total) {
  console.log('Aucun itinéraire récupéré : le format du fichier source a peut-être changé.');
  process.exit(1);
}

await rm(DOSSIER, { recursive: true, force: true });
await mkdir(DOSSIER, { recursive: true });
let octets = 0;
for (const [cle, itineraires] of carres) {
  const texte = JSON.stringify(itineraires);
  octets += texte.length;
  await writeFile(`${DOSSIER}/${cle}.json`, texte);
}
await writeFile(`${DOSSIER}/index.json`, JSON.stringify({ source: 'OpenSkiData (ODbL), © contributeurs OpenStreetMap', date: new Date().toISOString().slice(0, 10), carres: [...carres.keys()].sort() }));
console.log(`${total} itinéraires dans ${carres.size} carrés, ${(octets / 1024 / 1024).toFixed(1)} Mo → ${DOSSIER}`);
