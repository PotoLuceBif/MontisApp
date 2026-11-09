// Calcul d'un tronçon selon la pratique. BRouter d'abord : lui seul indique surfaces et
// difficulté. Valhalla en secours : BRouter abandonne au-delà de 3 s de calcul (longues distances).
import { ORDRE_SAC, distance } from './rando-api.js';
import { requete as requeteReseau } from './requete.js';

export function decoderPolyligne6(polyligne) {
  if (typeof polyligne !== 'string') throw new Error('Le service a renvoyé un tracé invalide.');
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const lireDelta = () => {
    let resultat = 0;
    let decalage = 0;
    let code;
    do {
      if (index >= polyligne.length || decalage > 30) {
        throw new Error('Le service a renvoyé un tracé invalide.');
      }
      code = polyligne.charCodeAt(index++) - 63;
      if (code < 0 || code > 0x3f) throw new Error('Le service a renvoyé un tracé invalide.');
      resultat |= (code & 0x1f) << decalage;
      decalage += 5;
    } while (code >= 0x20);
    return resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
  };

  while (index < polyligne.length) {
    latitude += lireDelta();
    longitude += lireDelta();
    points.push([longitude / 1e6, latitude / 1e6]);
  }
  if (points.length < 2) throw new Error('Le service n’a pas trouvé de chemin entre ces points.');
  return points;
}

const URL_BROUTER = 'https://brouter.de/brouter';
const URL_VALHALLA = 'https://valhalla1.openstreetmap.de/route';
// BRouter abandonne lui-même après 3 s de calcul : au-delà, le réseau traîne et Valhalla prend le relais
const DELAI_BROUTER = 10000;
const DELAI_VALHALLA = 15000;
const ATTENTE_REPRISE = 1500; // ms : BRouter répond « réessayez plus tard » quand on insiste

const REVETUS = new Set(['asphalt', 'paved', 'concrete', 'paving_stones', 'sett', 'cobblestone', 'chipseal']);
const NON_REVETUS = new Set(['gravel', 'fine_gravel', 'compacted', 'dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'rock', 'pebblestone', 'unpaved', 'wood']);
const ROUTES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'cycleway', 'pedestrian']);
const SENTIERS = new Set(['path', 'footway', 'bridleway', 'steps']);

// Une chaîne « highway=path surface=ground mtb:scale=2 » devient un type de voie et une difficulté
export function classerVoie(wayTags = '', echelle = 'mtb') {
  const tags = Object.fromEntries(String(wayTags).split(' ').map((paire) => paire.split('=')));
  const { highway, surface } = tags;
  let voie = 'inconnu';
  if (REVETUS.has(surface)) voie = 'asphalte';
  else if (SENTIERS.has(highway)) voie = 'single';
  else if (highway === 'track' || NON_REVETUS.has(surface)) voie = 'chemin';
  else if (ROUTES.has(highway)) voie = 'asphalte';
  const brute = echelle === 'sac' ? ORDRE_SAC.indexOf(tags.sac_scale) : Number.parseInt(tags['mtb:scale'], 10);
  return { voie, difficulte: Number.isFinite(brute) && brute >= 0 ? brute : null, marches: highway === 'steps' };
}

export function longueurLigne(ligne) {
  let total = 0;
  for (let i = 1; i < ligne.length; i += 1) total += distance(ligne[i - 1], ligne[i]);
  return total;
}

// Sans service ou pour passer hors réseau : une ligne droite, sans information de surface
export function tronconLibre(de, vers) {
  const geom = [de, vers];
  return { geom, troncons: [{ longueur: longueurLigne(geom), voie: 'inconnu', difficulte: null, marches: false }], source: 'libre' };
}

async function appelerBrouter(de, vers, pratique, signal, reprise = true) {
  const params = new URLSearchParams({
    lonlats: `${de[0].toFixed(6)},${de[1].toFixed(6)}|${vers[0].toFixed(6)},${vers[1].toFixed(6)}`,
    profile: pratique.brouter,
    alternativeidx: '0',
    format: 'geojson',
  });
  const reponse = await requeteReseau(`${URL_BROUTER}?${params}`, { signal }, DELAI_BROUTER);
  if (reponse.status === 403 && reprise) {
    await new Promise((resoudre) => { setTimeout(resoudre, ATTENTE_REPRISE); });
    return appelerBrouter(de, vers, pratique, signal, false);
  }
  if (!reponse.ok) throw new Error(`BRouter : statut ${reponse.status}`);
  const { features } = await reponse.json();
  const trace = features?.[0];
  if (!trace?.geometry?.coordinates?.length) throw new Error('BRouter : tracé absent');
  const geom = trace.geometry.coordinates.map(([lng, lat]) => [lng, lat]);
  const [entetes, ...lignes] = trace.properties.messages ?? [[]];
  const colDistance = entetes.indexOf('Distance');
  const colTags = entetes.indexOf('WayTags');
  const troncons = lignes.map((ligne) => ({ longueur: Number(ligne[colDistance]) || 0, ...classerVoie(ligne[colTags], pratique.echelle) }));
  return { geom, troncons, source: 'brouter' };
}

async function appelerValhalla(de, vers, pratique, signal) {
  const requete = {
    locations: [{ lon: de[0], lat: de[1] }, { lon: vers[0], lat: vers[1] }],
    ...pratique.valhalla,
    units: 'kilometers',
  };
  const reponse = await requeteReseau(`${URL_VALHALLA}?json=${encodeURIComponent(JSON.stringify(requete))}`, { signal }, DELAI_VALHALLA);
  if (!reponse.ok) throw new Error(`Valhalla : statut ${reponse.status}`);
  const { trip } = await reponse.json();
  const geom = (trip?.legs ?? []).flatMap((etape) => decoderPolyligne6(etape.shape));
  if (geom.length < 2) throw new Error('Valhalla : tracé absent');
  return { geom, troncons: [{ longueur: longueurLigne(geom), voie: 'inconnu', difficulte: null, marches: false }], source: 'valhalla' };
}

export async function calculerTroncon(de, vers, pratique, signal) {
  try {
    return await appelerBrouter(de, vers, pratique, signal);
  } catch (erreur) {
    if (erreur.name === 'AbortError') throw erreur;
    console.warn('Routage, passage au secours :', erreur);
    return appelerValhalla(de, vers, pratique, signal);
  }
}
