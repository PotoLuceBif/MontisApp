// Calculs purs du ski de rando : massif d’avalanche d’un point, itinéraires d’OSM
// (`piste:type=skitour`, rangés par carré de 1°), plus court chemin sur leur réseau, durée estimée.

// ---------- Massif d'avalanche ----------
function dansAnneau([lng, lat], anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

export function dansMassif(point, massif) {
  const [x0, y0, x1, y1] = massif.boite;
  if (point[0] < x0 || point[0] > x1 || point[1] < y0 || point[1] > y1) return false;
  return massif.contours.some(([exterieur, ...trous]) => dansAnneau(point, exterieur) && !trous.some((trou) => dansAnneau(point, trou)));
}

// Plusieurs services couvrent parfois le même secteur (l'Italie par exemple) : on garde celui
// qui a publié un niveau aujourd'hui, sinon le premier
export function massifAuPoint(massifs, point, niveaux = {}) {
  const candidats = (massifs ?? []).filter((massif) => dansMassif(point, massif));
  return candidats.find(({ id }) => Number(niveaux[id]) > 0) ?? candidats[0] ?? null;
}

export function nomMassif(massif, langue = 'fr') {
  if (!massif) return '';
  return (langue === 'en' ? massif.en ?? massif.fr : massif.fr ?? massif.en) ?? massif.id;
}

// Niveaux du jour d'un massif dans le fichier `maxDangerRatings` de l'EAWS
export function risqueDuMassif(niveaux, id) {
  const lire = (suffixe) => Number(niveaux?.[`${id}${suffixe}`]) || 0;
  return { max: lire(''), matin: lire(':am'), apresMidi: lire(':pm'), haut: lire(':high'), bas: lire(':low') };
}

// ---------- Itinéraires d'OSM ----------
// Rangés par carré de 1° dans /data/skitour (scripts/extraire-skitour.mjs, d'après OpenSkiData)
export const DIFFICULTES_SKITOUR = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride'];
export const MAX_CARRES = 9;

const RAYON_TERRE = 6371008.8;
function ecart([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function longueurLignes(lignes) {
  let total = 0;
  for (const ligne of lignes) for (let i = 1; i < ligne.length; i += 1) total += ecart(ligne[i - 1], ligne[i]);
  return total;
}

// Carrés de 1° qui couvrent la vue [ouest, sud, est, nord] ; null si la vue en demande trop
export function carresDeLaVue([ouest, sud, est, nord], disponibles = null) {
  const cles = [];
  for (let x = Math.floor(ouest); x <= Math.floor(est); x += 1) {
    for (let y = Math.floor(sud); y <= Math.floor(nord); y += 1) cles.push(`${x}_${y}`);
  }
  if (cles.length > MAX_CARRES) return null;
  return disponibles ? cles.filter((cle) => disponibles.has(cle)) : cles;
}

const dansBoite = ([lng, lat], [ouest, sud, est, nord]) => lng >= ouest && lng <= est && lat >= sud && lat <= nord;

// Carrés chargés → itinéraires de la vue : un itinéraire à cheval sur deux carrés n'apparaît qu'une fois
export function lireCarresSkitour(listes, boite) {
  const vus = new Map();
  for (const liste of listes ?? []) {
    if (!Array.isArray(liste)) continue;
    for (const brut of liste) {
      if (!brut?.i || vus.has(brut.i) || !Array.isArray(brut.l)) continue;
      const lignes = brut.l.filter((ligne) => Array.isArray(ligne) && ligne.length >= 2 && ligne.every((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])));
      if (!lignes.length || !lignes.some((ligne) => ligne.some((p) => dansBoite(p, boite)))) continue;
      vus.set(brut.i, {
        id: brut.i,
        nom: typeof brut.n === 'string' ? brut.n : '',
        difficulte: DIFFICULTES_SKITOUR.includes(brut.d) ? brut.d : null,
        osm: /^(way|relation)\/\d+$/.test(brut.o ?? '') ? brut.o : null,
        lignes,
      });
    }
  }
  return [...vus.values()]
    .map((itineraire) => ({ ...itineraire, longueur: longueurLignes(itineraire.lignes) }))
    // Les itinéraires nommés d'abord, les plus longs en tête
    .sort((a, b) => Number(!a.nom) - Number(!b.nom) || b.longueur - a.longueur);
}

// ---------- Durée ----------
// Estimation indicative : 4 km/h à plat, 400 m/h à la montée, 2 000 m/h à la descente à ski,
// combinés comme pour la randonnée (méthode type DIN 33466)
export function dureeSkiRando(distanceMetres, plus, moins) {
  const horizontal = distanceMetres / 1000 / 4;
  const vertical = plus / 400 + moins / 2000;
  return Math.max(horizontal, vertical) + Math.min(horizontal, vertical) / 2;
}

// ---------- Routage sur les itinéraires de ski de rando ----------
// BRouter ne connaît pas les traces de ski de rando sans chemin dessous (la plupart dans OSM) :
// Montis cherche lui-même le plus court chemin sur le réseau des itinéraires chargés.
const RACCORD_M = 15; // bouts d'itinéraires assez proches pour être reliés
const cleSommet = ([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

export function creerReseau(lignes) {
  const points = [];
  const voisins = [];
  const index = new Map();
  const sommet = (point) => {
    const cle = cleSommet(point);
    if (!index.has(cle)) {
      index.set(cle, points.length);
      points.push(point);
      voisins.push([]);
    }
    return index.get(cle);
  };
  const relier = (a, b) => {
    if (a === b) return;
    const d = ecart(points[a], points[b]);
    voisins[a].push([b, d]);
    voisins[b].push([a, d]);
  };
  const bouts = [];
  for (const ligne of lignes ?? []) {
    if (!Array.isArray(ligne) || ligne.length < 2) continue;
    let precedent = sommet(ligne[0]);
    bouts.push(precedent);
    for (let i = 1; i < ligne.length; i += 1) {
      const courant = sommet(ligne[i]);
      relier(precedent, courant);
      precedent = courant;
    }
    bouts.push(precedent);
  }
  // Un bout d'itinéraire qui s'arrête tout près d'un autre itinéraire y est raccordé
  for (const bout of new Set(bouts)) {
    for (let j = 0; j < points.length; j += 1) {
      if (j !== bout && ecart(points[bout], points[j]) <= RACCORD_M && !voisins[bout].some(([v]) => v === j)) relier(bout, j);
    }
  }
  return { points, voisins };
}

function plusProche(reseau, point) {
  let meilleur = -1;
  let distance = Infinity;
  reseau.points.forEach((p, i) => {
    const d = ecart(p, point);
    if (d < distance) {
      distance = d;
      meilleur = i;
    }
  });
  return { indice: meilleur, distance };
}

// Tas binaire minimal pour Dijkstra
function creerTas() {
  const tas = [];
  return {
    vide: () => !tas.length,
    ajouter(cout, sommet) {
      tas.push([cout, sommet]);
      let i = tas.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (tas[parent][0] <= tas[i][0]) break;
        [tas[parent], tas[i]] = [tas[i], tas[parent]];
        i = parent;
      }
    },
    retirer() {
      const premier = tas[0];
      const dernier = tas.pop();
      if (tas.length) {
        tas[0] = dernier;
        let i = 0;
        for (;;) {
          const g = 2 * i + 1;
          const d = g + 1;
          let m = i;
          if (g < tas.length && tas[g][0] < tas[m][0]) m = g;
          if (d < tas.length && tas[d][0] < tas[m][0]) m = d;
          if (m === i) break;
          [tas[m], tas[i]] = [tas[i], tas[m]];
          i = m;
        }
      }
      return premier;
    },
  };
}

// Chemin de `de` à `vers` sur le réseau, si les deux points en sont à moins de `rayon` mètres
// et qu'un chemin les relie ; sinon null (le routage habituel prend le relais)
export function cheminSurReseau(reseau, de, vers, rayon = 150) {
  if (!reseau?.points.length) return null;
  const depart = plusProche(reseau, de);
  const arrivee = plusProche(reseau, vers);
  if (depart.distance > rayon || arrivee.distance > rayon) return null;
  const distances = new Float64Array(reseau.points.length).fill(Infinity);
  const precedents = new Int32Array(reseau.points.length).fill(-1);
  distances[depart.indice] = 0;
  const tas = creerTas();
  tas.ajouter(0, depart.indice);
  while (!tas.vide()) {
    const [cout, sommet] = tas.retirer();
    if (cout > distances[sommet]) continue;
    if (sommet === arrivee.indice) break;
    for (const [voisin, d] of reseau.voisins[sommet]) {
      if (cout + d < distances[voisin]) {
        distances[voisin] = cout + d;
        precedents[voisin] = sommet;
        tas.ajouter(cout + d, voisin);
      }
    }
  }
  if (!Number.isFinite(distances[arrivee.indice])) return null;
  const chemin = [];
  for (let s = arrivee.indice; s !== -1; s = precedents[s]) chemin.push(reseau.points[s]);
  chemin.reverse();
  // Les points posés par l'utilisateur restent les extrémités du tronçon
  const geom = [de, ...chemin, vers].filter((p, i, tous) => i === 0 || ecart(p, tous[i - 1]) > 0.5);
  return geom.length >= 2 ? geom : null;
}
