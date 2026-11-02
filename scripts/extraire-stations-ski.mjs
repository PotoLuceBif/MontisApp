// Usage : node scripts/extraire-stations-ski.mjs
// Télécharge les données d'OpenSkiData (licence ODbL, https://openskidata.org) et range :
// - les stations en service dans public/data/stations-ski.json
// - les pistes et remontées de chaque station des pays choisis dans public/data/pistes/<id>.json
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const SOURCE = 'https://tiles.openskimap.org/geojson/ski_areas.geojson';
const SOURCE_PISTES = 'https://tiles.openskimap.org/geojson/runs.geojson';
const SOURCE_REMONTEES = 'https://tiles.openskimap.org/geojson/lifts.geojson';
const SOURCE_MASSIFS = 'https://regions.avalanches.org';
const PAYS_AVEC_MASSIFS = ['FR', 'CH', 'ES', 'AD', 'SI', 'SK', 'PL', 'CZ', 'RO', 'NO', 'SE', 'FI', 'GB'];
const ECART_MAX_MASSIF_DEGRES = 0.1; // environ 10 km
const SORTIE = 'public/data/stations-ski.json';
const DOSSIER_PISTES = 'public/data/pistes';

// Le poids des fichiers de pistes dépend de cette liste (environ 15 Mo pour la France, 136 Mo pour le monde)
const PAYS_AVEC_PISTES = ['FR'];
const USAGES_PISTES = { downhill: 'alpin', connection: 'alpin', snow_park: 'alpin', nordic: 'fond' };

// Sans nom, on ne garde que les vrais domaines : les petites boucles de fond encombreraient la carte
const REMONTEES_MIN_SANS_NOM = 2;
const KM_MIN_SANS_NOM = 10;
const ECART_DOUBLON_DEGRES = 0.01; // environ 1 km

// Couleur des pistes selon la convention du pays (champ « runConvention »)
const COULEURS = {
  europe: { novice: 'verte', easy: 'bleue', intermediate: 'rouge', advanced: 'noire', expert: 'noire', extreme: 'noire' },
  north_america: { novice: 'verte', easy: 'verte', intermediate: 'bleue', advanced: 'noire', expert: 'noire', extreme: 'noire' },
  japan: { novice: 'verte', easy: 'verte', intermediate: 'rouge', advanced: 'noire', expert: 'noire', extreme: 'noire' },
};

const arrondi = (valeur) => Math.round(valeur * 10) / 10;

function position(feature) {
  const { geometry, properties } = feature;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (properties.viewportHint?.center) return properties.viewportHint.center;
  const anneau = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
  return anneau.reduce((centre, p) => [centre[0] + p[0] / anneau.length, centre[1] + p[1] / anneau.length], [0, 0]);
}

function longueur(activite) {
  return Object.values(activite?.byDifficulty || {}).reduce((total, niveau) => total + niveau.lengthInKm, 0);
}

function niveauxAlpins(p) {
  const couleurs = COULEURS[p.runConvention] || COULEURS.europe;
  const niveaux = {};
  for (const [difficulte, niveau] of Object.entries(p.statistics?.runs?.byActivity?.downhill?.byDifficulty || {})) {
    const couleur = couleurs[difficulte];
    if (couleur) niveaux[couleur] = (niveaux[couleur] || 0) + niveau.lengthInKm;
  }
  for (const couleur of Object.keys(niveaux)) niveaux[couleur] = arrondi(niveaux[couleur]);
  return niveaux;
}

function convertir(feature) {
  const p = feature.properties;
  if (p.status !== 'operating' && p.status !== null) return null;

  const stats = p.statistics || {};
  const kmAlpin = longueur(stats.runs?.byActivity?.downhill);
  const kmNordique = longueur(stats.runs?.byActivity?.nordic);
  const remontees = Object.values(stats.lifts?.byType || {}).reduce((total, type) => total + type.count, 0);
  const activites = p.activities || [];
  const lieu = p.places?.[0]?.localized?.en;

  let nom = String(p.name || '').trim();
  if (!nom) {
    const assezGrand = remontees >= REMONTEES_MIN_SANS_NOM || kmAlpin + kmNordique >= KM_MIN_SANS_NOM;
    if (!assezGrand || !lieu?.locality) return null;
    nom = `${activites.includes('downhill') ? 'Domaine alpin' : 'Domaine nordique'} – ${lieu.locality}`;
  }

  const [lng, lat] = position(feature);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const proprietes = { id: p.id, nom };
  const champs = {
    alpin: activites.includes('downhill') ? 1 : 0,
    nordique: activites.includes('nordic') ? 1 : 0,
    lieu: lieu?.locality,
    region: lieu?.region,
    pays: p.places?.[0]?.iso3166_1Alpha2,
    kmAlpin: arrondi(kmAlpin),
    kmNordique: arrondi(kmNordique),
    remontees,
    altMin: stats.minElevation != null ? Math.round(stats.minElevation) : null,
    altMax: stats.maxElevation != null ? Math.round(stats.maxElevation) : null,
    site: p.websites?.[0],
    osm: p.sources?.find((source) => source.type === 'openstreetmap')?.id,
  };
  for (const [cle, valeur] of Object.entries(champs)) if (valeur) proprietes[cle] = valeur;
  const niveaux = niveauxAlpins(p);
  if (Object.keys(niveaux).length) proprietes.niveaux = niveaux;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
    properties: proprietes,
  };
}

console.log('Téléchargement des domaines skiables OpenSkiMap…');
const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
const { features: domaines } = await reponse.json();

const communesParDomaine = new Map(domaines.map(({ properties: p }) => [p.id, p.places]));
const taille = ({ properties: p }) => (p.kmAlpin || 0) + (p.kmNordique || 0) + (p.remontees || 0);
const simplifier = (nom) => nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// La source décrit parfois deux fois la même station (« Chamrousse », « Domaine Skiable Chamrousse »)
function trouverDoublon(station, gardees) {
  const nom = simplifier(station.properties.nom);
  const [lng, lat] = station.geometry.coordinates;
  return gardees.find((autre) => {
    const [autreLng, autreLat] = autre.geometry.coordinates;
    if (Math.abs(lat - autreLat) > ECART_DOUBLON_DEGRES || Math.abs(lng - autreLng) > ECART_DOUBLON_DEGRES) return false;
    // Dans ce sens seulement : « Val Thorens » n'est pas un doublon de « Val Thorens - Orelle »
    return nom.includes(simplifier(autre.properties.nom));
  });
}

const features = [];
const idGardes = new Map(); // id d'un domaine de la source → id de la station qui le représente
for (const station of domaines.map(convertir).filter(Boolean).sort((a, b) => taille(b) - taille(a))) {
  const doublon = trouverDoublon(station, features);
  if (doublon) {
    idGardes.set(station.properties.id, doublon.properties.id);
  } else {
    idGardes.set(station.properties.id, station.properties.id);
    features.push(station);
  }
}
if (features.length === 0) {
  console.log('Rien récupéré : le format du fichier source a peut-être changé.');
  process.exit(1);
}

// ---------- Massifs (pour relier chaque station au bulletin d'avalanche) ----------
function dansAnneau([lng, lat], anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const polygonesDe = (geometrie) => (geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.coordinates);

function dansMassif(point, massif) {
  return massif.polygones.some(([exterieur, ...trous]) =>
    dansAnneau(point, exterieur) && !trous.some((trou) => dansAnneau(point, trou)));
}

function ecartAuMassif([lng, lat], massif) {
  let ecart = Infinity;
  for (const [exterieur] of massif.polygones) {
    for (const [x, y] of exterieur) {
      ecart = Math.min(ecart, Math.hypot((x - lng) * Math.cos((lat * Math.PI) / 180), y - lat));
    }
  }
  return ecart;
}

console.log('Lecture des massifs…');
const nomsMassifs = await (await fetch(`${SOURCE_MASSIFS}/micro-regions_names/fr.json`)).json();
const massifsParPays = new Map();
for (const pays of PAYS_AVEC_MASSIFS) {
  const rep = await fetch(`${SOURCE_MASSIFS}/micro-regions/${pays}_micro-regions.geojson.json`);
  if (!rep.ok) {
    console.log(`   ✗ massifs ${pays} : HTTP ${rep.status}`);
    continue;
  }
  const { features: regions } = await rep.json();
  massifsParPays.set(pays, regions.map((f) => ({ id: f.properties.id, polygones: polygonesDe(f.geometry) })));
}

let stationsRattachees = 0;
for (const f of features) {
  const massifs = massifsParPays.get(f.properties.pays);
  if (!massifs) continue;
  const point = f.geometry.coordinates;
  let massif = massifs.find((m) => dansMassif(point, m));
  if (!massif) {
    // Le point d'une station peut tomber juste en dehors : on accepte le massif tout proche
    const proche = massifs
      .map((m) => ({ m, ecart: ecartAuMassif(point, m) }))
      .sort((a, b) => a.ecart - b.ecart)[0];
    if (proche && proche.ecart <= ECART_MAX_MASSIF_DEGRES) massif = proche.m;
  }
  if (massif) {
    f.properties.massif = massif.id;
    if (nomsMassifs[massif.id]) f.properties.massifNom = nomsMassifs[massif.id];
    stationsRattachees++;
  }
}
console.log(`${stationsRattachees} stations rattachées à un massif`);

// ---------- Pistes et remontées ----------
// Les fichiers sources pèsent près d'un Go : on les lit au fil de l'eau, ligne par ligne
async function* lireObjets(url) {
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`HTTP ${rep.status} sur ${url}`);
  const lignes = createInterface({ input: Readable.fromWeb(rep.body), crlfDelay: Infinity });
  for await (const brute of lignes) {
    const ligne = brute.trim().replace(/,$/, '');
    if (ligne.startsWith('{"type":"Feature"')) yield JSON.parse(ligne);
  }
}

function longueurMetres(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const milieu = ((points[i][1] + points[i - 1][1]) / 2) * (Math.PI / 180);
    const x = (points[i][0] - points[i - 1][0]) * Math.cos(milieu);
    const y = points[i][1] - points[i - 1][1];
    total += Math.hypot(x, y) * 111_320;
  }
  return Math.round(total);
}

const allegerPoint = ([lng, lat]) => [Number(lng.toFixed(5)), Number(lat.toFixed(5))];

function allegerGeometrie(geometrie) {
  if (geometrie.type === 'LineString') {
    return { type: 'LineString', coordinates: geometrie.coordinates.map(allegerPoint) };
  }
  return { type: 'Polygon', coordinates: geometrie.coordinates.map((anneau) => anneau.map(allegerPoint)) };
}

const stationsAvecPistes = new Set(
  features.filter((f) => PAYS_AVEC_PISTES.includes(f.properties.pays)).map((f) => f.properties.id)
);
const contenus = new Map(); // id de station → { objets, pente : [x, y] }

function ranger(objet, feature) {
  const ids = new Set((feature.properties.skiAreas || []).map((d) => idGardes.get(d.properties.id)));
  for (const id of ids) {
    if (!stationsAvecPistes.has(id)) continue;
    if (!contenus.has(id)) contenus.set(id, { objets: [], pente: [0, 0] });
    const contenu = contenus.get(id);
    contenu.objets.push(objet);
    // Somme des descentes (du haut vers le bas) : elle donne l'orientation générale du domaine
    const points = feature.geometry.coordinates;
    if (objet.properties.genre === 'piste' && feature.geometry.type === 'LineString' && points[0][2] != null) {
      const [debut, fin] = [points[0], points[points.length - 1]];
      const [haut, bas] = debut[2] >= fin[2] ? [debut, fin] : [fin, debut];
      contenu.pente[0] += (bas[0] - haut[0]) * Math.cos((haut[1] * Math.PI) / 180);
      contenu.pente[1] += bas[1] - haut[1];
    }
  }
}

const denivele = (points) => {
  const altitudes = points.map((p) => p[2]).filter((a) => a != null);
  return altitudes.length ? Math.round(Math.max(...altitudes) - Math.min(...altitudes)) : 0;
};

console.log('Lecture des pistes…');
for await (const f of lireObjets(SOURCE_PISTES)) {
  const p = f.properties;
  const usage = (p.uses || []).map((u) => USAGES_PISTES[u]).find(Boolean);
  if (!usage || p.status !== 'operating') continue;
  const couleurs = COULEURS[p.difficultyConvention] || COULEURS.europe;
  const proprietes = { genre: 'piste', usage };
  if (p.name) proprietes.nom = p.name;
  const niveau = couleurs[p.difficulty] || (p.difficulty === 'freeride' ? 'freeride' : null);
  if (niveau) proprietes.niveau = niveau;
  if (f.geometry.type === 'LineString') {
    proprietes.longueur = longueurMetres(f.geometry.coordinates);
    proprietes.denivele = denivele(f.geometry.coordinates);
  }
  ranger({ type: 'Feature', geometry: allegerGeometrie(f.geometry), properties: proprietes }, f);
}

console.log('Lecture des remontées…');
for await (const f of lireObjets(SOURCE_REMONTEES)) {
  const p = f.properties;
  if (p.status !== 'operating' || f.geometry.type !== 'LineString') continue;
  const proprietes = {
    genre: 'remontee',
    type: p.liftType,
    longueur: longueurMetres(f.geometry.coordinates),
    denivele: denivele(f.geometry.coordinates),
  };
  if (p.name) proprietes.nom = p.name;
  ranger({ type: 'Feature', geometry: allegerGeometrie(f.geometry), properties: proprietes }, f);
}

if (contenus.size === 0) {
  console.log('Aucune piste récupérée : le format des fichiers sources a peut-être changé.');
  process.exit(1);
}

await rm(DOSSIER_PISTES, { recursive: true, force: true });
await mkdir(DOSSIER_PISTES, { recursive: true });
let poidsPistes = 0;
for (const [id, { objets, pente }] of contenus) {
  // Cap de la caméra : on regarde vers le haut du domaine, donc à l'opposé de la descente
  const cap = Math.round((Math.atan2(-pente[0], -pente[1]) * 180) / Math.PI);
  const communes = [
    ...new Set((communesParDomaine.get(id) || []).map((lieu) => lieu.localized?.en?.locality).filter(Boolean)),
  ];
  const texte = JSON.stringify({ type: 'FeatureCollection', cap, communes, features: objets });
  poidsPistes += texte.length;
  await writeFile(`${DOSSIER_PISTES}/${id}.json`, texte);
}
for (const f of features) {
  if (contenus.has(f.properties.id)) f.properties.pistes = 1;
}

await mkdir('public/data', { recursive: true });
await writeFile(SORTIE, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`${features.length} stations enregistrées dans ${SORTIE} (sur ${domaines.length} domaines)`);
console.log(`${contenus.size} stations avec pistes dans ${DOSSIER_PISTES} (${(poidsPistes / 1e6).toFixed(1)} Mo)`);
