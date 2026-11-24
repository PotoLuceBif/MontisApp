// Données du panorama : sommets lus dans les tuiles vectorielles du fond Montis (les mêmes que la carte,
// donc gardées par le service worker dans les zones hors ligne), relief lu dans les tuiles Terrain.
// Plusieurs zooms : les tuiles proches donnent les petits sommets, les lointaines seulement les grands
// (OpenMapTiles ne garde qu'environ 80 sommets par tuile).
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { requete, erreurHttp } from './requete.js';
import { pixelMonde } from './point-calcul.js';
import { lecteur, interpoler } from './relief-donnees.js';
import { langue } from './preferences.js';
import { dedoublonner, directionVers } from './panorama-calcul.js';

export const DISTANCE_MAX = 100000; // m : au-delà, la brume cache presque toujours les sommets

const ZONES_SOMMETS = [
  { rayon: 5000, z: 12 },
  { rayon: 25000, z: 10 },
  { rayon: DISTANCE_MAX, z: 8 },
];
const ZONES_RELIEF = [
  { rayon: 6000, z: 12 },
  { rayon: 25000, z: 10 },
  { rayon: DISTANCE_MAX, z: 9 },
];

// Tuiles d'un zoom qui couvrent un carré de `rayon` m autour du point
function tuilesAutour({ lng, lat }, rayon, z) {
  const dLat = rayon / 111320;
  const dLng = rayon / (111320 * Math.cos((lat * Math.PI) / 180));
  const a = pixelMonde(lng - dLng, lat + dLat, z);
  const b = pixelMonde(lng + dLng, lat - dLat, z);
  const n = 2 ** z;
  const tuiles = [];
  for (let y = Math.max(0, Math.floor(a.y / 256)); y <= Math.min(n - 1, Math.floor(b.y / 256)); y += 1) {
    for (let x = Math.floor(a.x / 256); x <= Math.floor(b.x / 256); x += 1) tuiles.push({ z, x: ((x % n) + n) % n, y });
  }
  return { tuiles, a, b };
}

// Nom dans la langue de l'appli, majuscule en tête (OSM écrit « aiguille du Midi » en français)
function nomSommet(p) {
  const nom = p[`name:${langue()}`] || p.name_int || p.name;
  return nom ? nom.charAt(0).toUpperCase() + nom.slice(1) : null;
}

async function sommetsTuile(modele, { z, x, y }, signal) {
  const reponse = await requete(modele.replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal });
  if (!reponse.ok) throw erreurHttp(reponse);
  const tuile = new VectorTile(new PbfReader(new Uint8Array(await reponse.arrayBuffer())));
  const couche = tuile.layers.mountain_peak;
  const sommets = [];
  for (let i = 0; i < (couche?.length ?? 0); i += 1) {
    const objet = couche.feature(i);
    const p = objet.properties;
    if (p.class !== 'peak' && p.class !== 'volcano') continue;
    const nom = nomSommet(p);
    if (!nom) continue;
    const [lng, lat] = objet.toGeoJSON(x, y, z).geometry.coordinates;
    sommets.push({ nom, lng, lat, altitude: Number.isFinite(p.ele) ? p.ele : null, id: objet.id });
  }
  return sommets;
}

// Sommets nommés à moins de DISTANCE_MAX. Une tuile qui échoue est sautée ; toutes : erreur.
export async function chargerSommets(depuis, modele, signal) {
  const demandes = [];
  for (const { rayon, z } of ZONES_SOMMETS) {
    for (const tuile of tuilesAutour(depuis, rayon, z).tuiles) demandes.push(sommetsTuile(modele, tuile, signal));
  }
  const resultats = await Promise.allSettled(demandes);
  if (signal?.aborted) throw new DOMException('annulé', 'AbortError');
  const recus = resultats.filter((r) => r.status === 'fulfilled');
  if (!recus.length) throw resultats[0].reason;
  return {
    sommets: dedoublonner(recus.flatMap((r) => r.value))
      .filter((s) => directionVers(depuis, s).distance <= DISTANCE_MAX),
    incomplet: recus.length < resultats.length,
  };
}

// Lecteur d'altitude (lng, lat, distance à l'observateur) : tuile fine près de soi, plus grossière au loin
export async function chargerRelief(depuis) {
  const zones = await Promise.all(
    ZONES_RELIEF.map(async ({ rayon, z }) => {
      const { a, b } = tuilesAutour(depuis, rayon, z);
      return { rayon, z, lire: await lecteur(z, Math.floor(a.x), Math.floor(a.y), Math.ceil(b.x), Math.ceil(b.y)) };
    })
  );
  return (lng, lat, distance) => {
    const zone = zones.find((zz) => distance <= zz.rayon) ?? zones[zones.length - 1];
    const { x, y } = pixelMonde(lng, lat, zone.z);
    return interpoler(zone.lire, x, y);
  };
}
