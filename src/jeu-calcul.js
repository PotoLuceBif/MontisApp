// Calculs purs du quiz de géographie (lot P.4a) : noms des pays, saisie tolérante, tirages, scores.
// Les noms viennent d'Intl.DisplayNames ; quelques-uns sont fixés ici pour ne pas dépendre du navigateur.

export const ZONES = ['europe', 'monde', 'afrique', 'asie', 'ameriques', 'oceanie'];
export const LONGUEUR_COURTE = 10;

// Durée du mode Liste, en secondes, selon le nombre de pays à nommer
export const DUREES_LISTE = { europe: 480, monde: 1200, afrique: 540, asie: 540, ameriques: 420, oceanie: 180 };

const NOMS = {
  fr: { CG: 'Congo', CD: 'République démocratique du Congo', MM: 'Birmanie', PS: 'Palestine', VA: 'Vatican' },
  en: {
    AG: 'Antigua and Barbuda', BA: 'Bosnia and Herzegovina', CG: 'Republic of the Congo', CD: 'DR Congo',
    MM: 'Myanmar', KN: 'Saint Kitts and Nevis', LC: 'Saint Lucia', VC: 'Saint Vincent and the Grenadines',
    ST: 'São Tomé and Príncipe', TT: 'Trinidad and Tobago', PS: 'Palestine', VA: 'Vatican City', TR: 'Turkey',
  },
};

// Autres noms acceptés à la saisie (déjà normalisés)
const ALIAS = {
  fr: {
    CZ: ['republique tcheque'], BY: ['belarus', 'bielorussie'], CD: ['rdc', 'congo kinshasa', 'rd congo'],
    CG: ['congo brazzaville', 'republique du congo'], MM: ['myanmar'], GB: ['grande bretagne', 'uk'],
    US: ['usa', 'etats unis d amerique'], TL: ['timor leste'], SZ: ['swaziland'], MK: ['macedoine'],
    VA: ['saint siege', 'etat de la cite du vatican', 'cite du vatican'], NL: ['hollande'], VN: ['vietnam'],
    SV: ['el salvador'], CV: ['cabo verde'], AE: ['emirats', 'eau'], KG: ['kirghizie', 'kirghizistan'],
    FM: ['etats federes de micronesie'], BA: ['bosnie'], PS: ['territoires palestiniens', 'etat de palestine'],
    KN: ['saint kitts et nevis'], DO: ['dominicaine'], CF: ['centrafrique'], MD: ['moldova'],
  },
  en: {
    CZ: ['czech republic'], BY: ['byelorussia'], CD: ['drc', 'democratic republic of the congo', 'congo kinshasa'],
    CG: ['congo', 'congo brazzaville'], MM: ['burma'], GB: ['uk', 'great britain', 'britain'],
    US: ['usa', 'america', 'united states of america'], CI: ['ivory coast'], TL: ['east timor'], SZ: ['swaziland'],
    MK: ['macedonia'], VA: ['vatican', 'holy see'], NL: ['holland'], TR: ['turkiye'], CV: ['cabo verde'],
    PS: ['palestinian territories', 'state of palestine'], BA: ['bosnia'], KN: ['st kitts and nevis'],
    LC: ['st lucia'], VC: ['st vincent and the grenadines'], AE: ['uae', 'emirates'], FM: ['federated states of micronesia'],
  },
};

const ARTICLES = /^(?:le |la |les |l |the )/;

// Minuscules, sans accents ni ponctuation, « & » lu « et » ou « and », sans article de tête
export function normaliser(texte, langue = 'fr') {
  return String(texte || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, langue === 'en' ? ' and ' : ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ARTICLES, '')
    .replace(/^st /, 'saint ');
}

// `noms` : fonction code → nom affiché (Intl.DisplayNames dans l'appli)
export function nomPays(code, langue, noms) {
  return NOMS[langue]?.[code] || noms(code) || code;
}

// Pour chaque pays, ses écritures acceptées
export function index(codes, langue, noms) {
  return codes.map((code) => {
    const nom = nomPays(code, langue, noms);
    const ecritures = new Set([normaliser(nom, langue), normaliser(noms(code), langue)]);
    for (const alias of ALIAS[langue]?.[code] || []) ecritures.add(normaliser(alias, langue));
    ecritures.delete('');
    return { code, nom, ecritures: [...ecritures] };
  });
}

// Pour chaque capitale, son nom dans la langue de l'appli ; son nom dans l'autre langue et ses autres noms sont acceptés
export function indexCapitales(pays, langue) {
  return pays.map(({ code, capitale }) => {
    const nom = capitale[langue] || capitale.fr;
    const ecritures = new Set([nom, capitale.fr, capitale.en, ...(capitale.autres || [])].map((n) => normaliser(n, langue)));
    ecritures.delete('');
    return { code, nom, ecritures: [...ecritures] };
  });
}

// Écart de saisie (Levenshtein, deux lettres inversées comptent pour une faute), arrêté au-delà de `max`
export function ecart(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let avant = null;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const ligne = [i];
    let mini = i;
    for (let j = 1; j <= b.length; j += 1) {
      ligne[j] = Math.min(precedente[j] + 1, ligne[j - 1] + 1, precedente[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (avant && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) ligne[j] = Math.min(ligne[j], avant[j - 2] + 1);
      mini = Math.min(mini, ligne[j]);
    }
    if (mini > max) return max + 1;
    avant = precedente;
    precedente = ligne;
  }
  return precedente[b.length];
}

// Le pays saisi : écriture exacte, ou une faute de frappe sur un nom assez long si un seul pays s'en approche
export function reconnaitre(saisie, entrees, { tolerant = false, langue = 'fr' } = {}) {
  const texte = normaliser(saisie, langue);
  if (!texte) return null;
  const exact = entrees.find((e) => e.ecritures.includes(texte));
  if (exact || !tolerant || texte.length < 6) return exact?.code || null;
  const proches = entrees.filter((e) => e.ecritures.some((ecriture) => ecriture.length >= 6 && ecart(texte, ecriture, 1) <= 1));
  return proches.length === 1 ? proches[0].code : null;
}

// Suggestions pendant la saisie : les noms qui commencent par le texte, puis ceux qui le contiennent
export function suggerer(saisie, entrees, { max = 5, langue = 'fr' } = {}) {
  const texte = normaliser(saisie, langue);
  if (!texte) return [];
  const debut = [];
  const dedans = [];
  for (const e of entrees) {
    if (e.ecritures.some((ecriture) => ecriture.startsWith(texte))) debut.push(e);
    else if (e.ecritures.some((ecriture) => ecriture.includes(texte))) dedans.push(e);
  }
  const ordre = (a, b) => a.nom.localeCompare(b.nom, langue);
  return [...debut.sort(ordre), ...dedans.sort(ordre)].slice(0, max).map((e) => e.code);
}

// Tirage de Fisher-Yates ; `aleatoire` remplaçable pour les tests
export function melanger(liste, aleatoire = Math.random) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatoire() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

export function paysDeZone(pays, zone) {
  return pays.filter((p) => zone === 'monde' || p.zones.includes(zone)).map((p) => p.code);
}

// Drapeaux identiques ou presque : jamais proposés ensemble, la réponse serait une loterie
const JUMEAUX = [['MC', 'ID'], ['TD', 'RO']];
export const jumeau = (code) => JUMEAUX.find((paire) => paire.includes(code))?.find((c) => c !== code) || null;

// Quatre choix : la bonne réponse et trois autres de la zone (du monde si la zone est trop petite), dans le désordre
export function proposerChoix(bonne, zone, tous, { nombre = 4, aleatoire = Math.random } = {}) {
  const exclu = jumeau(bonne);
  const autres = (liste) => melanger(liste.filter((c) => c !== bonne && c !== exclu), aleatoire);
  let leurres = autres(zone).slice(0, nombre - 1);
  if (leurres.length < nombre - 1) {
    leurres = [...leurres, ...autres(tous).filter((c) => !leurres.includes(c))].slice(0, nombre - 1);
  }
  return melanger([bonne, ...leurres], aleatoire);
}

export function cleRecord({ mode, zone, longueur, niveau, sens }) {
  return mode === 'liste' ? `liste-${zone}` : `${mode}-${sens}-${niveau}-${longueur}-${zone}`;
}

// Le meilleur de deux résultats : plus de bonnes réponses, puis moins de temps
export function meilleur(ancien, nouveau) {
  if (!ancien) return nouveau;
  if (nouveau.bonnes !== ancien.bonnes) return nouveau.bonnes > ancien.bonnes ? nouveau : ancien;
  return nouveau.duree < ancien.duree ? nouveau : ancien;
}

export function formatChrono(secondes) {
  const s = Math.max(0, Math.round(secondes));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Où est-ce ? (lot P.4b) ----------

const RAYON_TERRE = 6371; // km

// Distance à vol d'oiseau, en km
export function distanceKm([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Point dans un anneau (lancer de rayon)
function dansAnneau([x, y], anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

// Point dans un MultiPolygon GeoJSON (trous compris)
export function dansPays(point, multipolygone) {
  return multipolygone.some(([exterieur, ...trous]) => dansAnneau(point, exterieur) && !trous.some((trou) => dansAnneau(point, trou)));
}

// Distance d'un point à un segment, en km, sur une projection plate autour du point (assez juste à l'échelle d'un pays)
function distanceSegment(p, a, b) {
  const kx = Math.cos((p[1] * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const long2 = dx * dx + dy * dy;
  const u = long2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / long2)) : 0;
  return Math.hypot(ax + u * dx, ay + u * dy);
}

// Distance au pays, en km : 0 dedans, sinon jusqu'au bord le plus proche
export function distancePays(point, multipolygone) {
  if (dansPays(point, multipolygone)) return 0;
  let mini = Infinity;
  for (const polygone of multipolygone) {
    for (const anneau of polygone) {
      for (let i = 1; i < anneau.length; i += 1) {
        // Les bords à l'autre bout du monde ne comptent pas : la projection plate n'y vaut rien
        if (Math.abs(anneau[i][0] - point[0]) > 60 && Math.abs(anneau[i - 1][0] - point[0]) > 60) continue;
        mini = Math.min(mini, distanceSegment(point, anneau[i - 1], anneau[i]));
      }
    }
  }
  return mini === Infinity ? distanceKm(point, multipolygone[0][0][0]) : mini;
}

// Taille d'un pays, en km : la diagonale de son emprise
export const taillePays = ([ouest, sud, est, nord]) => distanceKm([ouest, sud], [est, nord]);

// Écart accepté pour une ville : 150 km dans le monde ; dans un pays, selon sa taille (de 15 à 120 km)
export function seuilVille(emprisePays = null) {
  if (!emprisePays) return 150;
  return Math.round(Math.min(120, Math.max(15, taillePays(emprisePays) * 0.05)));
}

// Un petit pays se touche mal : un appui à moins de 40 km de lui compte
export const SEUIL_PETIT_PAYS = 40;

// Archipels et pays éclatés (retour du propriétaire du 23 novembre 2026) : un appui au milieu de leurs îles compte,
// dans l'enveloppe convexe de chaque groupe d'îles, marge comprise (l'appli écarte d'abord un appui sur un autre pays).
export const ARCHIPELS = new Set([
  'ID', 'PH', 'JP', 'MV', 'FJ', 'BS', 'KI', 'TV', 'FM', 'MH', 'SC', 'CV', 'TO', 'VU', 'SB', 'GR', 'DK',
  'PW', 'WS', 'KM', 'ST', 'AG', 'KN', 'VC', 'MT',
]);
export const MARGE_ARCHIPEL = 60; // km
// Des îles trop petites pour les contours du jeu, mais qui font l'étendue de l'archipel (coins approchés)
const ILES_ABSENTES = {
  MV: [[72.9, 7.1], [73.6, 7.1], [73.5, -0.7], [73.0, -0.7]],
  SC: [[53.0, -3.7], [56.3, -3.7], [56.3, -5.4], [53.0, -5.4]],
  TV: [[176.1, -5.7], [176.3, -6.3], [179.9, -10.8], [179.0, -10.6]],
  MH: [[162.3, 11.5], [165.4, 11.6], [170.0, 12.2], [168.7, 4.6]],
  FJ: [[-178.4, -16.5], [-178.9, -19.2]],
};
// Deux îles plus éloignées que ça forment deux groupes (Kiribati : îles Gilbert, Phoenix et de la Ligne)
const ECART_GROUPES = 700; // km

// Longitudes d'un seul tenant : un pays à cheval sur l'antiméridien (Fidji, Kiribati) passe de 0 à 360
const recoller = (points, decale) => (decale ? points.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : points);

// Enveloppe convexe (chaîne monotone), sur les longitudes et latitudes : assez juste à l'échelle d'un archipel
export function enveloppe(points) {
  const tries = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (tries.length < 3) return tries;
  const tour = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [];
  const haut = [];
  for (const p of tries) {
    while (bas.length >= 2 && tour(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) bas.pop();
    bas.push(p);
  }
  for (const p of [...tries].reverse()) {
    while (haut.length >= 2 && tour(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) haut.pop();
    haut.push(p);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

// Zones d'un archipel : une enveloppe fermée par groupe d'îles proches ; aucune pour un autre pays
export function zonesArchipel(code, multipolygone) {
  if (!ARCHIPELS.has(code)) return [];
  const iles = [...multipolygone.map(([exterieur]) => exterieur), ...(ILES_ABSENTES[code] || []).map((p) => [p])];
  const xs = iles.flat().map(([x]) => x);
  const decale = Math.max(...xs) - Math.min(...xs) > 180;
  const groupes = iles.map((ile) => [recoller(ile, decale)]);
  // Regroupement de proche en proche : deux groupes dont deux points sont à moins d'ECART_GROUPES fusionnent
  const proches = (a, b) => a.flat().some((p) => b.flat().some((q) => distanceKm(p, q) < ECART_GROUPES));
  for (let fusion = true; fusion;) {
    fusion = false;
    for (let i = 0; i < groupes.length && !fusion; i += 1) {
      for (let j = i + 1; j < groupes.length && !fusion; j += 1) {
        if (!proches(groupes[i], groupes[j])) continue;
        groupes[i] = [...groupes[i], ...groupes[j]];
        groupes.splice(j, 1);
        fusion = true;
      }
    }
  }
  return groupes.map((groupe) => {
    const contour = enveloppe(groupe.flat());
    return { decale, anneau: [...contour, contour[0]] };
  });
}

// Un appui dans l'une des zones, ou à moins de `marge` km de son bord
export function dansArchipel(point, zones, marge = MARGE_ARCHIPEL) {
  return zones.some(({ decale, anneau }) => {
    const p = decale && point[0] < 0 ? [point[0] + 360, point[1]] : point;
    return distancePays(p, [[anneau]]) <= marge;
  });
}

// ---------- Révise tes erreurs ----------
// Une erreur : « drapeau:FR », « capitale:FR », « pays:FR » (où est ce pays), « ville:123 »
export function noterErreur(erreurs, cle, juste) {
  const sans = erreurs.filter((e) => e !== cle);
  return juste ? sans : [cle, ...sans].slice(0, 300);
}

export function lireErreur(cle) {
  const [type, id] = String(cle).split(':');
  return { type, id: type === 'ville' ? Number(id) : id };
}

// ---------- Fiches des pays ----------

// Régions de chaque continent, dans l'ordre de la carte (du nord au sud, d'ouest en est)
export const ORDRE_REGIONS = [
  'northern-europe', 'western-europe', 'southern-europe', 'eastern-europe',
  'northern-africa', 'western-africa', 'middle-africa', 'eastern-africa', 'southern-africa',
  'western-asia', 'central-asia', 'southern-asia', 'eastern-asia', 'south-eastern-asia',
  'northern-america', 'central-america', 'caribbean', 'south-america',
  'australia-and-new-zealand', 'melanesia', 'micronesia', 'polynesia',
];

// Les pays d'une zone groupés par région, triés par endroit : régions dans l'ordre de la carte, pays d'ouest en est
export function trierFiches(pays, zone) {
  const groupes = new Map();
  for (const p of pays.filter((x) => zone === 'monde' || x.zones.includes(zone))) {
    if (!groupes.has(p.region)) groupes.set(p.region, []);
    groupes.get(p.region).push(p);
  }
  const rang = (region) => (ORDRE_REGIONS.includes(region) ? ORDRE_REGIONS.indexOf(region) : ORDRE_REGIONS.length);
  return [...groupes.entries()]
    .sort(([a], [b]) => rang(a) - rang(b))
    .map(([region, liste]) => ({ region, codes: liste.sort((a, b) => a.centre[0] - b.centre[0]).map((p) => p.code) }));
}

// Liste chrono : un nom tapé est pris tout seul seulement s'il n'est le début d'aucun autre pays restant à trouver
// (« UK » attend : « Ukraine » commence pareil ; de même Niger et Nigeria, Guinée et Guinée-Bissau, Soudan, Congo).
// Un pays déjà trouvé ne coupe pas la saisie : on peut être en train d'écrire un autre nom.
export function priseAuVol(saisie, entrees, trouves = [], langue = 'fr') {
  const texte = normaliser(saisie, langue);
  if (!texte) return null;
  const exact = entrees.find((e) => e.ecritures.includes(texte));
  if (!exact || trouves.includes(exact.code)) return null;
  const ambigu = entrees.some((e) => e.code !== exact.code && !trouves.includes(e.code)
    && e.ecritures.some((ecriture) => ecriture.length > texte.length && ecriture.startsWith(texte)));
  return ambigu ? null : exact.code;
}

// ---------- Fiches des pays (retour du propriétaire du 17 novembre 2026) ----------

// Décalage horaire en minutes → « UTC+1 », « UTC+5:30 », « UTC−3 » (vrai signe moins), « UTC » pour zéro
export function texteFuseau(minutes) {
  if (!minutes) return 'UTC';
  const absolu = Math.abs(minutes);
  const heures = Math.floor(absolu / 60);
  const reste = absolu % 60;
  return `UTC${minutes < 0 ? '−' : '+'}${heures}${reste ? `:${String(reste).padStart(2, '0')}` : ''}`;
}

// Fuseaux d'un pays : jusqu'à trois, tous ; au-delà, l'étendue (« UTC−10 → UTC+12 ») et leur nombre
export function resumeFuseaux(fuseaux) {
  const tries = [...new Set(fuseaux)].sort((a, b) => a - b);
  if (!tries.length) return { texte: '', nombre: 0 };
  if (tries.length <= 3) return { texte: tries.map(texteFuseau).join(' · '), nombre: tries.length };
  return { texte: `${texteFuseau(tries[0])} → ${texteFuseau(tries[tries.length - 1])}`, nombre: tries.length };
}

// Habitants par km², arrondis (au dixième sous 10)
export function densite(population, superficie) {
  if (!population || !superficie) return null;
  const valeur = population / superficie;
  return valeur < 10 ? Math.round(valeur * 10) / 10 : Math.round(valeur);
}

// « Rejouer mes erreurs » en liste : 10 s par pays oublié, entre 1 min et la durée de la zone
export const dureeListeErreurs = (nombre, zone) => Math.min(DUREES_LISTE[zone] ?? 600, Math.max(60, nombre * 10));

// Question rejouée telle quelle : sans la réponse donnée la première fois
export const questionSeule = ({ reponse, point, distance, ...question }) => question;
