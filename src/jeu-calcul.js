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

// Quatre choix : la bonne réponse et trois autres de la zone (du monde si la zone est trop petite), dans le désordre
export function proposerChoix(bonne, zone, tous, { nombre = 4, aleatoire = Math.random } = {}) {
  const autres = (liste) => melanger(liste.filter((c) => c !== bonne), aleatoire);
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
