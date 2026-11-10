// Partage par lien : tout tient dans l'adresse, après « # » (jamais envoyé au serveur, aucun compte).
// Calculs purs, testés (tests/partage-calcul.test.js).
//   #vue=zoom/lat/lng/cap/inclinaison&3d=1&fond=ign-plan
//   #point=lat/lng&z=14
//   #parcours=<tracé compressé>
export const LONGUEUR_MAX_LIEN = 8000; // au-delà, certaines messageries coupent le lien
export const ZOOM_POINT = 14;

const arrondi = (valeur, chiffres) => {
  const facteur = 10 ** chiffres;
  return Math.round(valeur * facteur) / facteur;
};
const nombre = (texte) => (texte === undefined || texte === '' ? NaN : Number(texte));
const dans = (valeur, min, max) => Number.isFinite(valeur) && valeur >= min && valeur <= max;

// ===== Vue et point =====
export function fragmentVue({ lng, lat, zoom, bearing = 0, pitch = 0, mode3D = false, fond = null }) {
  const morceaux = [arrondi(zoom, 2), arrondi(lat, 5), arrondi(lng, 5)];
  const cap = Math.round(((bearing % 360) + 360) % 360);
  const inclinaison = mode3D ? Math.round(pitch) : 0;
  if (cap || inclinaison) morceaux.push(cap, inclinaison);
  let fragment = `vue=${morceaux.join('/')}`;
  if (mode3D) fragment += '&3d=1';
  if (fond && fond !== 'montis') fragment += `&fond=${encodeURIComponent(fond)}`;
  return fragment;
}

export function fragmentPoint({ lng, lat, zoom = ZOOM_POINT }) {
  return `point=${arrondi(lat, 5)}/${arrondi(lng, 5)}&z=${arrondi(zoom, 1)}`;
}

function lireVue(texte, parametres) {
  const [zoom, lat, lng, cap = 0, inclinaison = 0] = texte.split('/').map(nombre);
  if (!dans(zoom, 0, 22) || !dans(lat, -90, 90) || !dans(lng, -180, 180)) return null;
  const mode3D = parametres.get('3d') === '1';
  return {
    type: 'vue',
    lng,
    lat,
    zoom,
    bearing: Number.isFinite(cap) ? cap : 0,
    pitch: mode3D && dans(inclinaison, 0, 85) ? inclinaison : 0,
    mode3D,
    fond: parametres.get('fond') || null,
  };
}

function lirePoint(texte, parametres) {
  const [lat, lng] = texte.split('/').map(nombre);
  if (!dans(lat, -90, 90) || !dans(lng, -180, 180)) return null;
  const zoom = nombre(parametres.get('z') ?? undefined);
  return { type: 'point', lng, lat, zoom: dans(zoom, 0, 22) ? zoom : ZOOM_POINT };
}

// Ce que demande l'adresse, ou null. Un parcours reste compressé : `lireParcours` le décode.
export function lireFragment(hash) {
  const texte = String(hash || '').replace(/^#/, '');
  if (!texte) return null;
  const parametres = new URLSearchParams(texte);
  if (parametres.has('parcours')) {
    const code = parametres.get('parcours');
    return code ? { type: 'parcours', code } : null;
  }
  if (parametres.has('point')) return lirePoint(parametres.get('point'), parametres);
  if (parametres.has('vue')) return lireVue(parametres.get('vue'), parametres);
  return null;
}

// ===== Tracés : polyligne encodée (format de Google, précision 5) =====
export function encoderPolyligne(points) {
  let precedent = [0, 0];
  let sortie = '';
  const encoder = (valeur) => {
    let v = valeur < 0 ? ~(valeur << 1) : valeur << 1;
    while (v >= 0x20) {
      sortie += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    sortie += String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of points) {
    const courant = [Math.round(lat * 1e5), Math.round(lng * 1e5)];
    encoder(courant[0] - precedent[0]);
    encoder(courant[1] - precedent[1]);
    precedent = courant;
  }
  return sortie;
}

export function decoderPolyligne(texte) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const lireValeur = () => {
    let resultat = 0;
    let decalage = 0;
    let octet;
    do {
      if (index >= texte.length) throw new Error('polyligne tronquée');
      octet = texte.charCodeAt(index++) - 63;
      resultat |= (octet & 0x1f) << decalage;
      decalage += 5;
    } while (octet >= 0x20);
    return resultat & 1 ? ~(resultat >> 1) : resultat >> 1;
  };
  while (index < texte.length) {
    lat += lireValeur();
    lng += lireValeur();
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

// Douglas-Peucker, en degrés (tolérance petite : la déformation reste invisible à l'écran)
export function simplifier(points, tolerance) {
  if (points.length <= 2 || !(tolerance > 0)) return points;
  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  const echelle = Math.cos((points[0][1] * Math.PI) / 180);
  while (pile.length) {
    const [debut, fin] = pile.pop();
    const [ax, ay] = [points[debut][0] * echelle, points[debut][1]];
    const [bx, by] = [points[fin][0] * echelle, points[fin][1]];
    const dx = bx - ax;
    const dy = by - ay;
    const longueur2 = dx * dx + dy * dy;
    let pire = -1;
    let ecart = 0;
    for (let i = debut + 1; i < fin; i += 1) {
      const px = points[i][0] * echelle - ax;
      const py = points[i][1] - ay;
      const u = longueur2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / longueur2)) : 0;
      const ex = px - u * dx;
      const ey = py - u * dy;
      const d = ex * ex + ey * ey;
      if (d > ecart) {
        ecart = d;
        pire = i;
      }
    }
    if (pire > 0 && ecart > tolerance * tolerance) {
      garder[pire] = 1;
      pile.push([debut, pire], [pire, fin]);
    }
  }
  return points.filter((_, i) => garder[i]);
}

// ===== Parcours =====
const MODES = { route: 'r', libre: 'l', fixe: 'f' };
const MODES_LUS = { r: 'route', l: 'libre', f: 'fixe' };
// Mêmes clés que VOIES de parcours-analyse.js (non importé : ce fichier est chargé au démarrage).
// Un lien vient d'ailleurs : une valeur inconnue ferait échouer le dessin du tracé.
export const VOIES_CONNUES = new Set(['asphalte', 'chemin', 'single', 'inconnu']);

// Forme compacte : `{ v, a, p, n, e: [[mode, lng, lat, tronçon?]] }`
export function compacterParcours({ activite, pratique, nom, etapes }, tolerance = 0) {
  return {
    v: 1,
    a: activite,
    p: pratique,
    n: nom,
    e: etapes.map(({ lng, lat, mode, troncon }, index) => {
      const etape = [MODES[mode] ?? 'r', arrondi(lng, 5), arrondi(lat, 5)];
      if (index && troncon?.geom?.length) {
        etape.push({
          g: encoderPolyligne(simplifier(troncon.geom, tolerance)),
          t: (troncon.troncons ?? []).map(({ longueur, voie, difficulte, marches }) => [Math.round(longueur), voie, difficulte ?? null, marches ? 1 : 0]),
          s: troncon.source,
          ...(troncon.pratique ? { p: troncon.pratique } : {}),
        });
      }
      return etape;
    }),
  };
}

export function deplierParcours(compact) {
  if (!compact || compact.v !== 1 || typeof compact.a !== 'string' || !Array.isArray(compact.e) || compact.e.length < 2) return null;
  const etapes = compact.e.map((etape, index) => {
    if (!Array.isArray(etape)) throw new Error('étape illisible');
    const [mode, lng, lat, troncon] = etape;
    if (!dans(lng, -180, 180) || !dans(lat, -90, 90)) throw new Error('étape hors de la carte');
    const lue = { lng, lat, mode: MODES_LUS[mode] ?? 'route', troncon: null };
    if (index && troncon?.g) {
      const geom = decoderPolyligne(troncon.g);
      lue.troncon = {
        geom,
        troncons: (Array.isArray(troncon.t) ? troncon.t : []).map(([longueur, voie, difficulte, marches] = []) => ({
          longueur: Number.isFinite(longueur) && longueur >= 0 ? longueur : 0,
          voie: VOIES_CONNUES.has(voie) ? voie : 'inconnu',
          difficulte: Number.isFinite(difficulte) ? difficulte : null,
          marches: marches === 1,
        })),
        source: ['brouter', 'valhalla', 'libre', 'trace', 'skitour'].includes(troncon.s) ? troncon.s : 'trace',
        ...(typeof troncon.p === 'string' ? { pratique: troncon.p } : {}),
      };
    }
    return lue;
  });
  return { activite: compact.a, pratique: compact.p, nom: typeof compact.n === 'string' ? compact.n.slice(0, 120) : '', etapes };
}

// ===== Compression et base64 « URL » =====
const versBase64Url = (octets) => {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const depuisBase64Url = (texte) => {
  const binaire = atob(texte.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
};
async function passer(octets, flux) {
  const ecrivain = flux.writable.getWriter();
  ecrivain.write(octets).catch(() => {}); // l'erreur revient par la lecture
  ecrivain.close().catch(() => {});
  const morceaux = [];
  const lecteur = flux.readable.getReader();
  for (let lu = await lecteur.read(); !lu.done; lu = await lecteur.read()) morceaux.push(lu.value);
  const sortie = new Uint8Array(morceaux.reduce((total, morceau) => total + morceau.length, 0));
  let position = 0;
  for (const morceau of morceaux) {
    sortie.set(morceau, position);
    position += morceau.length;
  }
  return sortie;
}

// Préfixe « 1 » : JSON compressé (deflate) ; « 0 » : JSON seul, si le navigateur ne sait pas compresser
export async function encoderDonnees(objet) {
  const octets = new TextEncoder().encode(JSON.stringify(objet));
  if (typeof CompressionStream === 'function') return `1${versBase64Url(await passer(octets, new CompressionStream('deflate-raw')))}`;
  return `0${versBase64Url(octets)}`;
}

export async function decoderDonnees(code) {
  const octets = depuisBase64Url(code.slice(1));
  if (code[0] === '0') return JSON.parse(new TextDecoder().decode(octets));
  if (code[0] !== '1' || typeof DecompressionStream !== 'function') throw new Error('lien illisible');
  return JSON.parse(new TextDecoder().decode(await passer(octets, new DecompressionStream('deflate-raw'))));
}

// Tracé d'abord intact, puis de plus en plus simplifié tant que le lien est trop long
const TOLERANCES = [0, 0.00001, 0.00003, 0.0001, 0.0003, 0.001];
export async function fragmentParcours(parcours, longueurMax = LONGUEUR_MAX_LIEN) {
  let code = '';
  for (const tolerance of TOLERANCES) {
    code = await encoderDonnees(compacterParcours(parcours, tolerance));
    if (code.length + 10 <= longueurMax) return { fragment: `parcours=${code}`, simplifie: tolerance > 0 };
  }
  return null; // trop long même simplifié
}

export async function lireParcours(code) {
  try {
    return deplierParcours(await decoderDonnees(code));
  } catch {
    return null;
  }
}
