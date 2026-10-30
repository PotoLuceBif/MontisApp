// Usage : node scripts/extraire-refuges.mjs
// Interroge Overpass case par case (avec reprise) et range les refuges et cabanes
// dans public/data/refuges.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const EMAIL = 'lucebif@gmail.com'; // ← METS TON ADRESSE E-MAIL ICI

const EN_TETES = {
  'User-Agent': `Montis/0.1 (projet personnel de carte de montagne; ${EMAIL})`,
  Referer: 'http://localhost:5173/',
  Accept: '*/*',
  'Content-Type': 'application/x-www-form-urlencoded',
};

const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// [sud, ouest, nord, est]
const ZONES = [
  { nom: 'Alpes', bbox: [43.0, 5.5, 48.6, 17.0] },
  { nom: 'Pyrénées', bbox: [41.2, -2.4, 43.9, 3.5] },
  { nom: 'Jura, Vosges et Forêt-Noire', bbox: [46.0, 5.0, 49.0, 9.0] },
  { nom: 'Massif central', bbox: [44.3, 1.8, 46.7, 4.6] },
  { nom: 'Corse', bbox: [41.3, 8.5, 43.1, 9.7] },
  { nom: 'Apennins', bbox: [41.0, 10.0, 44.6, 16.0] },
];

const PAS_LAT = 2;
const PAS_LNG = 3;
const PAUSE_ENTRE_REQUETES = 20000;
const PAUSE_APRES_REFUS = 45000;
const NB_TOURS = 5;
const CACHE = 'scripts/cache-refuges.json';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Découpe une zone en cases d'environ 2° × 3°
function decouper([s, o, n, e]) {
  const cases = [];
  for (let lat = s; lat < n; lat += PAS_LAT) {
    for (let lng = o; lng < e; lng += PAS_LNG) {
      cases.push(
        [lat, lng, Math.min(lat + PAS_LAT, n), Math.min(lng + PAS_LNG, e)].map((v) => Number(v.toFixed(4)))
      );
    }
  }
  return cases;
}

const refus406 = new Map(); // serveurs qui refusent même avec les bons en-têtes

async function interroger(requete) {
  let derniere = null;

  for (let tour = 1; tour <= NB_TOURS; tour++) {
    for (const url of SERVEURS) {
      if ((refus406.get(url) || 0) >= 2) continue;
      try {
        const rep = await fetch(url, {
          method: 'POST',
          headers: EN_TETES,
          body: 'data=' + encodeURIComponent(requete),
          signal: AbortSignal.timeout(200000),
        });
        if (!rep.ok) {
          const err = new Error(`HTTP ${rep.status}`);
          err.statut = rep.status;
          throw err;
        }
        const json = await rep.json();
        if (json.remark && /error|timeout/i.test(json.remark)) throw new Error(json.remark);
        return json;
      } catch (e) {
        derniere = e;
        if (e.statut === 406) refus406.set(url, (refus406.get(url) || 0) + 1);
        console.log(`   ✗ ${new URL(url).host} : ${e.message}`);
      }
    }
    if (tour < NB_TOURS) {
      console.log(`   … pause de ${PAUSE_APRES_REFUS / 1000} s avant un nouvel essai (${tour}/${NB_TOURS})`);
      await attendre(PAUSE_APRES_REFUS);
    }
  }
  throw derniere || new Error('Aucun serveur disponible');
}

async function lireCache() {
  let contenu;
  try {
    contenu = await readFile(CACHE, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }

  let cache;
  try {
    cache = JSON.parse(contenu);
  } catch (e) {
    throw new Error(`Cache invalide (${CACHE}) : ${e.message}`);
  }
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) {
    throw new Error(`Cache invalide (${CACHE}) : un objet JSON était attendu.`);
  }
  for (const [cle, elements] of Object.entries(cache)) {
    if (!Array.isArray(elements)) {
      throw new Error(`Cache invalide (${CACHE}) : la case ${cle} ne contient pas une liste.`);
    }
  }
  return cache;
}

console.log('Extraction des refuges et cabanes (reprise automatique si tu relances)…');
if (EMAIL.includes('exemple.fr')) {
  console.log('⚠  Pense à remplacer l’adresse e-mail en haut du script (constante EMAIL).');
}

const cache = await lireCache();
const cases = ZONES.flatMap((z) => decouper(z.bbox).map((c) => ({ zone: z.nom, bbox: c })));
const echecs = [];
let numero = 0;

for (const c of cases) {
  numero++;
  const cle = c.bbox.join(',');
  const etiquette = `[${numero}/${cases.length}] ${c.zone} (${cle})`;

  if (cache[cle]) {
    console.log(`${etiquette} : déjà fait (${cache[cle].length} éléments)`);
    continue;
  }

  console.log(`→ ${etiquette}`);
  const requete =
    `[out:json][timeout:120];(` +
    `nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${cle});` +
    `nwr["amenity"="shelter"]["shelter_type"="basic_hut"](${cle});` +
    `);out center tags;`;

  try {
    const json = await interroger(requete);
    cache[cle] = json.elements || [];
    await writeFile(CACHE, JSON.stringify(cache));
    console.log(`   ✓ ${cache[cle].length} éléments`);
  } catch (e) {
    echecs.push(etiquette);
    console.log(`   ✗ case abandonnée : ${e.message}`);
  }
  await attendre(PAUSE_ENTRE_REQUETES);
}

// Assemblage du fichier final à partir de tout ce qui est en cache
const vus = new Map();
for (const elements of Object.values(cache)) {
  for (const el of elements) vus.set(`${el.type}/${el.id}`, el);
}

const features = [];
for (const el of vus.values()) {
  const t = el.tags || {};
  if (t.access === 'private') continue;
  const lat = el.lat ?? (el.center && el.center.lat);
  const lng = el.lon ?? (el.center && el.center.lon);
  if (lat == null || lng == null) continue;

  const p = { name: t.name || '', genre: t.tourism === 'alpine_hut' ? 'garde' : 'libre' };
  const champs = {
    ele: t.ele,
    capacity: t.capacity || t.beds,
    phone: t.phone || t['contact:phone'],
    website: t.website || t['contact:website'],
    opening_hours: t.opening_hours,
    reservation: t.reservation,
    operator: t.operator,
    wikipedia: t.wikipedia,
  };
  for (const [k, v] of Object.entries(champs)) if (v) p[k] = String(v);

  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
    properties: p,
  });
}

if (features.length === 0) {
  console.log('\nRien récupéré. Vérifie l’adresse e-mail, attends 10 minutes (limite par IP), puis relance.');
  process.exit(1);
}

await mkdir('public/data', { recursive: true });
await writeFile('public/data/refuges.json', JSON.stringify({ type: 'FeatureCollection', features }));

console.log(`\n${features.length} refuges et cabanes enregistrés dans public/data/refuges.json`);
if (echecs.length) {
  console.log(`\nCases manquantes (relance le script plus tard, il reprendra là où il s'est arrêté) :`);
  echecs.forEach((e) => console.log(`  - ${e}`));
  process.exitCode = 1;
}