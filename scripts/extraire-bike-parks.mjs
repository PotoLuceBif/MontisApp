// Usage : node scripts/extraire-bike-parks.mjs
// Cherche dans OpenStreetMap (licence ODbL) les pistes VTT de descente en France, et les regroupe
// autour de la station de ski la plus proche. OSM n'a pas de liste officielle des bike parks :
// un secteur de pistes balisées n'en est pas forcément un, et l'ouverture n'est pas connue.
// À lancer après extraire-stations-ski.mjs : les remontées viennent de ses fichiers.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
// Par massif : une seule requête sur la France dépasse trop souvent ce qu'acceptent ces serveurs
const MASSIFS = {
  'Alpes du Nord': [45.2, 5.4, 46.5, 7.2],
  'Alpes du Sud': [43.7, 5.4, 45.2, 7.8],
  'Jura et Vosges': [46.5, 5.2, 48.7, 7.7],
  'Massif central': [44.0, 1.5, 46.5, 5.4],
  Pyrénées: [42.3, -2.0, 43.6, 3.3],
};
const requete = (cadre) => `[out:json][timeout:120];
(
  relation["route"="mtb"]["mtb:type"~"^(downhill|freeride)$",i](${cadre});
  way["mtb:type"~"^(downhill|freeride)$",i](${cadre});
);
out geom;`;
const CACHE = 'scripts/cache-bike-parks.json'; // massifs déjà reçus : un échec ne fait pas tout recommencer
const DUREE_CACHE = 24 * 60 * 60 * 1000;
const ESSAIS = 6;
const ATTENTE_ESSAI = 45000; // ms : ces serveurs refusent quand ils sont chargés
const STATIONS = 'public/data/stations-ski.json';
const DOSSIER_PISTES = 'public/data/pistes';
const SORTIE = 'public/data/bike-parks.json';
const DOSSIER = 'public/data/bike-parks';
const ECART_MAX_STATION_KM = 10;
const KM_ALPIN_MIN = 5; // un petit domaine de fond voisin ne doit pas capter les pistes de la grande station
const PAYS_FRONTALIERS = ['FR', 'CH', 'IT']; // Avoriaz figure côté suisse dans les données de ski
const NOMS_MIN = 3; // en dessous, ce sont quelques sentiers, pas un secteur de descente
const KM_MIN = 3;
const MARGE_REMONTEES = 0.012; // degrés, environ 1 km autour des pistes
const COULEURS = { green: 'verte', blue: 'bleue', red: 'rouge', black: 'noire' };

const kmEntre = ([a, b], [c, d]) => {
  const x = (c - a) * Math.cos(((b + d) / 2) * (Math.PI / 180));
  return Math.hypot(x, d - b) * 111.32;
};

function longueurKm(ligne) {
  let total = 0;
  for (let i = 1; i < ligne.length; i += 1) total += kmEntre(ligne[i - 1], ligne[i]);
  return total;
}

function niveauDe(tags) {
  const couleur = COULEURS[String(tags.colour ?? '').toLowerCase()];
  if (couleur) return couleur;
  const echelle = Number.parseInt(tags['mtb:scale'] ?? tags['mtb:scale:imba'], 10);
  if (!Number.isFinite(echelle)) return 'inconnu';
  return ['verte', 'bleue', 'rouge'][echelle] ?? 'noire';
}

const nomDe = (tags) => tags['mtb:name'] || tags.name || tags.ref || null;
const ligneDe = (geometrie) => (geometrie ?? []).map(({ lon, lat }) => [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);

async function interroger(cadre) {
  for (let essai = 1; essai <= ESSAIS; essai += 1) {
    for (const serveur of SERVEURS) {
      try {
        const reponse = await fetch(serveur, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Montis/extraction-bike-parks' },
          body: `data=${encodeURIComponent(requete(cadre))}`,
          signal: AbortSignal.timeout(130000),
        });
        if (reponse.ok) return (await reponse.json()).elements;
        console.warn(`${serveur} : statut ${reponse.status}`);
      } catch (erreur) {
        console.warn(`${serveur} : ${erreur.message}`);
      }
    }
    await new Promise((resoudre) => { setTimeout(resoudre, ATTENTE_ESSAI); });
  }
  throw new Error('Aucun serveur Overpass n’a répondu.');
}

// Un massif manquant effacerait ses secteurs : mieux vaut s'arrêter sans rien écrire
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const parIdentifiant = new Map();
for (const [massif, cadre] of Object.entries(MASSIFS)) {
  if (!cache[massif] || Date.now() - cache[massif].date > DUREE_CACHE) {
    cache[massif] = { date: Date.now(), elements: await interroger(cadre.join(',')) };
    await writeFile(CACHE, JSON.stringify(cache));
  }
  const recus = cache[massif].elements;
  recus.forEach((element) => parIdentifiant.set(`${element.type}/${element.id}`, element));
  console.log(`${massif} : ${recus.length} objets`);
}
const elements = [...parIdentifiant.values()];

// Une piste de relation garde le nom et la couleur de la relation ; les chemins déjà utilisés sont écartés
const cheminsUtilises = new Set();
const pistes = [];
for (const relation of elements.filter(({ type }) => type === 'relation')) {
  for (const membre of relation.members ?? []) {
    if (membre.type !== 'way' || !membre.geometry) continue;
    cheminsUtilises.add(membre.ref);
    pistes.push({ tags: relation.tags, ligne: ligneDe(membre.geometry) });
  }
}
for (const chemin of elements.filter(({ type }) => type === 'way')) {
  if (!cheminsUtilises.has(chemin.id)) pistes.push({ tags: chemin.tags, ligne: ligneDe(chemin.geometry) });
}

const toutes = JSON.parse(readFileSync(STATIONS, 'utf8')).features;
const stations = toutes.filter(({ properties }) => PAYS_FRONTALIERS.includes(properties.pays) && properties.kmAlpin >= KM_ALPIN_MIN);
// Villages que les données de ski rangent dans un grand domaine : leurs pistes garderaient un autre nom
const portes = toutes.find(({ properties }) => properties.nom === 'Les Portes du Soleil');
stations.push({
  geometry: { coordinates: [6.84, 46.27] },
  properties: { id: 'chatel', nom: 'Châtel', lieu: 'Haute-Savoie', ski: portes?.properties.id },
});
const secteurs = new Map();
let sansStation = 0;
for (const piste of pistes) {
  if (piste.ligne.length < 2) continue;
  const milieu = piste.ligne[piste.ligne.length >> 1];
  let proche = null;
  let ecart = ECART_MAX_STATION_KM;
  for (const station of stations) {
    const distance = kmEntre(milieu, station.geometry.coordinates);
    if (distance < ecart) {
      ecart = distance;
      proche = station;
    }
  }
  if (!proche) {
    sansStation += 1;
    continue;
  }
  const { id } = proche.properties;
  if (!secteurs.has(id)) secteurs.set(id, { station: proche, pistes: [] });
  secteurs.get(id).pistes.push(piste);
}

await rm(DOSSIER, { recursive: true, force: true });
await mkdir(DOSSIER, { recursive: true });

const liste = [];
for (const [id, { station, pistes: sesPistes }] of secteurs) {
  const noms = new Set(sesPistes.map(({ tags }) => nomDe(tags)).filter(Boolean));
  const km = sesPistes.reduce((total, { ligne }) => total + longueurKm(ligne), 0);
  if (noms.size < NOMS_MIN || km < KM_MIN) continue;

  const objets = sesPistes.map(({ tags, ligne }) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: ligne },
    properties: {
      genre: 'piste',
      usage: 'alpin',
      niveau: niveauDe(tags),
      ...(nomDe(tags) ? { nom: nomDe(tags) } : {}),
      longueur: Math.round(longueurKm(ligne) * 1000),
    },
  }));

  // Remontées du domaine de ski voisin : rien n'indique lesquelles tournent l'été
  const points = sesPistes.flatMap(({ ligne }) => ligne);
  const ouest = Math.min(...points.map(([lng]) => lng)) - MARGE_REMONTEES;
  const est = Math.max(...points.map(([lng]) => lng)) + MARGE_REMONTEES;
  const sud = Math.min(...points.map(([, lat]) => lat)) - MARGE_REMONTEES;
  const nord = Math.max(...points.map(([, lat]) => lat)) + MARGE_REMONTEES;
  const fichierSki = `${DOSSIER_PISTES}/${station.properties.ski ?? id}.json`;
  const ski = existsSync(fichierSki) ? JSON.parse(readFileSync(fichierSki, 'utf8')) : { features: [] };
  const remontees = ski.features.filter(({ properties, geometry }) =>
    properties.genre === 'remontee' && geometry.coordinates.some(([lng, lat]) => lng > ouest && lng < est && lat > sud && lat < nord));

  // Vue dans le sens de la descente, comme pour les stations
  let dx = 0;
  let dy = 0;
  sesPistes.forEach(({ ligne }) => {
    dx += ligne.at(-1)[0] - ligne[0][0];
    dy += ligne.at(-1)[1] - ligne[0][1];
  });
  const cap = ski.cap ?? Math.round((Math.atan2(dx, dy) * 180) / Math.PI);

  const niveaux = {};
  objets.forEach(({ properties: { niveau, longueur } }) => {
    niveaux[niveau] = Math.round(((niveaux[niveau] ?? 0) + longueur / 1000) * 10) / 10;
  });
  await writeFile(`${DOSSIER}/${id}.json`, JSON.stringify({
    type: 'FeatureCollection',
    cap,
    communes: ski.communes ?? [],
    features: [...objets, ...remontees],
  }));
  liste.push({
    id,
    nom: station.properties.nom,
    lieu: station.properties.lieu ?? '',
    lng: station.geometry.coordinates[0],
    lat: station.geometry.coordinates[1],
    pistes: noms.size,
    km: Math.round(km * 10) / 10,
    niveaux,
    remontees: remontees.length,
  });
}

liste.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
await writeFile(SORTIE, JSON.stringify(liste));
console.log(`${liste.length} secteurs gardés, ${sansStation} pistes loin de toute station écartées`);
