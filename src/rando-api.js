// Accès à l'API de Waymarked Trails (itinéraires balisés d'OpenStreetMap)
import { t } from './i18n.js';
const RAYON = 6378137; // rayon de la projection Web Mercator utilisée par l'API

// Niveaux d'itinéraires (champ « group » de l'API)
export const NIVEAUX = {
  INT: { couleur: '#7a4bb7', grand: true },
  NAT: { couleur: '#c0392b', grand: true },
  REG: { couleur: '#d9822b', grand: true },
  LOC: { couleur: '#5d7a68', grand: false },
};
export const niveau = (groupe) =>
  NIVEAUX[groupe]
    ? { ...NIVEAUX[groupe], court: t(`niveau.${groupe}`) }
    : { court: t('niveau.autre'), couleur: '#6b706c', grand: false };

// Échelle de difficulté SAC (marquage des chemins)
export const ORDRE_SAC = [
  'hiking',
  'mountain_hiking',
  'demanding_mountain_hiking',
  'alpine_hiking',
  'demanding_alpine_hiking',
  'difficult_alpine_hiking',
];
export const nomSac = (rang) => t(`sac.${rang}`);

export const titreDe = (r) => {
  const ref = r.ref || '';
  const nom = r.name || '';
  if (ref && nom && !nom.includes(ref)) return `${ref} · ${nom}`;
  return nom || ref || t('parcours.sans-nom');
};

// ---------- Conversions et distances ----------
export const mercatorVersLngLat = ([x, y]) => [
  (x / RAYON) * (180 / Math.PI),
  (2 * Math.atan(Math.exp(y / RAYON)) - Math.PI / 2) * (180 / Math.PI),
];

export const lngLatVersMercator = (lng, lat) => [
  RAYON * ((lng * Math.PI) / 180),
  RAYON * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

// Distance en mètres entre deux points [lng, lat]
export function distance(a, b) {
  const R = 6371008.8;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Appels à l'API (avec un peu de mémoire) ----------
function memoire(max) {
  const m = new Map();
  return {
    has: (k) => m.has(k),
    get: (k) => m.get(k),
    set: (k, v) => {
      m.set(k, v);
      while (m.size > max) m.delete(m.keys().next().value);
    },
  };
}
function dedoublonner(liste) {
  const vus = new Set();
  return liste.filter((r) => r && r.id != null && !vus.has(r.id) && vus.add(r.id));
}

// Une carte d'itinéraires par pratique : hiking, mtb, cycling
export function clientItineraires(carte) {
  const base = `https://${carte}.waymarkedtrails.org/api/v1`;
  const cacheListes = memoire(40);
  const cacheDetails = memoire(4);

  async function appeler(chemin, signal, cache) {
    if (cache.has(chemin)) return cache.get(chemin);
    const rep = await fetch(base + chemin, { signal });
    if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
    const json = await rep.json();
    cache.set(chemin, json);
    return json;
  }

  return {
    async chercher(texte, signal, limite = 25) {
      const json = await appeler(`/list/search?query=${encodeURIComponent(texte)}&limit=${limite}`, signal, cacheListes);
      return dedoublonner(json.results || []);
    },
    async dansLaZone(limites, signal) {
      const [x0, y0] = lngLatVersMercator(limites.getWest(), limites.getSouth());
      const [x1, y1] = lngLatVersMercator(limites.getEast(), limites.getNorth());
      const bbox = [x0, y0, x1, y1].map(Math.round).join(',');
      let derniere = null;
      for (const limite of [40, 20]) {
        try {
          const json = await appeler(`/list/by_area?bbox=${bbox}&limit=${limite}`, signal, cacheListes);
          return dedoublonner(json.results || []);
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          derniere = e;
        }
      }
      throw derniere;
    },
    details: (id, signal) => appeler(`/details/relation/${id}`, signal, cacheDetails),
  };
}


// ---------- Extraction du tracé ----------
// Parcourt la structure de l'itinéraire et récolte tous les tronçons (objets ayant une géométrie)
const PARTIES_MAX = 60;
const SAUT_MIN = 300; // m : en dessous, c'est le raccord normal de deux chemins voisins

function recolter(noeud, sortie, profondeur = 0) {
  if (!noeud || typeof noeud !== 'object' || profondeur > 8) return;
  if (Array.isArray(noeud)) {
    noeud.forEach((n) => recolter(n, sortie, profondeur + 1));
    return;
  }
  if (noeud.geometry && noeud.geometry.coordinates) {
    sortie.push(noeud);
    return;
  }
  for (const cle of Object.keys(noeud)) {
    if (cle !== 'tags' && cle !== 'geometry') recolter(noeud[cle], sortie, profondeur + 1);
  }
}

function lignesDe(geometrie) {
  if (!geometrie) return [];
  if (geometrie.type === 'LineString') return [geometrie.coordinates];
  if (geometrie.type === 'MultiLineString') return geometrie.coordinates;
  return [];
}

// Met les tronçons bout à bout pour obtenir une seule ligne (utile au profil d'altitude)
function assembler(troncons) {
  const chaine = [];
  for (const t of troncons) {
    for (const brut of lignesDe(t.geometry)) {
      let ligne = brut.map(mercatorVersLngLat);
      if (ligne.length < 2) continue;
      if (chaine.length) {
        const fin = chaine[chaine.length - 1];
        if (distance(fin, ligne[ligne.length - 1]) < distance(fin, ligne[0])) ligne = ligne.reverse();
        if (distance(fin, ligne[0]) < 1) ligne = ligne.slice(1);
      }
      for (const p of ligne) chaine.push(p);
    }
  }
  return chaine;
}

// Les parties d'une relation ne sont pas forcément rangées dans l'ordre du chemin : on garde
// l'enchaînement qui saute le moins, en partant de chaque partie tour à tour
function ordonnerParties(parties) {
  if (parties.length < 2 || parties.length > PARTIES_MAX) return parties.flat();
  let meilleur = null;
  let moindre = Infinity;
  for (let depart = 0; depart < parties.length; depart += 1) {
    for (const sens of [false, true]) {
      const premiere = sens ? [...parties[depart]].reverse() : parties[depart];
      const restantes = parties.filter((_, index) => index !== depart);
      const suite = [premiere];
      let fin = premiere[premiere.length - 1];
      let sauts = 0;
      while (restantes.length && sauts < moindre) {
        let choix = 0;
        let ecart = Infinity;
        let inverser = false;
        restantes.forEach((partie, index) => {
          const versDebut = distance(fin, partie[0]);
          const versFin = distance(fin, partie[partie.length - 1]);
          if (Math.min(versDebut, versFin) < ecart) {
            ecart = Math.min(versDebut, versFin);
            choix = index;
            inverser = versFin < versDebut;
          }
        });
        const [partie] = restantes.splice(choix, 1);
        const orientee = inverser ? [...partie].reverse() : partie;
        suite.push(orientee);
        fin = orientee[orientee.length - 1];
        sauts += ecart;
      }
      if (sauts < moindre) {
        moindre = sauts;
        meilleur = suite;
      }
    }
  }
  return meilleur.flat();
}

// Ce que les raccords ajoutent au tracé : au-delà de quelques pour cent, un profil serait faux
export function partDesSauts(chaine) {
  let total = 0;
  let sauts = 0;
  for (let i = 1; i < chaine.length; i += 1) {
    const ecart = distance(chaine[i - 1], chaine[i]);
    total += ecart;
    if (ecart > SAUT_MIN) sauts += ecart;
  }
  return total > 0 ? sauts / total : 0;
}

export function extraireTrace(details) {
  const route = details.route || {};
  const principaux = [];
  const annexes = [];
  recolter(route.main, principaux);
  recolter(route.appendices, annexes);
  if (!principaux.length && !annexes.length) recolter(route, principaux); // structure inhabituelle

  const lignes = [];
  for (const t of [...principaux, ...annexes]) {
    for (const l of lignesDe(t.geometry)) {
      if (l.length > 1) lignes.push(l.map(mercatorVersLngLat));
    }
  }

  let sac = -1;
  for (const t of [...principaux, ...annexes]) {
    const i = ORDRE_SAC.indexOf((t.tags || {}).sac_scale);
    if (i > sac) sac = i;
  }

  const racine = Array.isArray(route.main) ? route.main : [route.main];
  const parties = racine.map((partie) => {
    const troncons = [];
    recolter(partie, troncons);
    return assembler(troncons);
  }).filter((chaine) => chaine.length > 1);
  const chaine = parties.length ? ordonnerParties(parties) : assembler(principaux);
  return { lignes, chaine, sac: sac >= 0 ? sac : null };
}

// Rééchantillonne la ligne à intervalles réguliers (500 points au maximum)
export function echantillonner(chaine) {
  const cum = [0];
  for (let i = 1; i < chaine.length; i++) cum.push(cum[i - 1] + distance(chaine[i - 1], chaine[i]));
  const total = cum[cum.length - 1];
  if (!(total > 0)) return { points: [], total: 0 };

  const n = Math.min(500, Math.max(20, Math.round(total / 40)));
  const points = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const cible = (total * i) / (n - 1);
    while (k < cum.length - 1 && cum[k] < cible) k++;
    const d0 = cum[k - 1];
    const d1 = cum[k];
    const t = d1 > d0 ? (cible - d0) / (d1 - d0) : 0;
    const a = chaine[k - 1];
    const b = chaine[k];
    points.push({ lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, d: cible });
  }
  return { points, total };
}
