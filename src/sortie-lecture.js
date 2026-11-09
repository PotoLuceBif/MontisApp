// Lecture des fichiers de sortie des montres et des varios : GPX, FIT, TCX, IGC.
// Calculs purs (testés) : le module ne touche ni à la carte ni au DOM de la page.
import { decoderFit } from './sortie-fit.js';
import { denivele, lisser } from './rando-profil.js';

export const FORMATS = ['gpx', 'fit', 'tcx', 'igc'];
// Canaux facultatifs, gardés seulement si le fichier en contient
export const CANAUX = ['alt', 'altGps', 'fc', 'cadence', 'puissance', 'temperature', 'vitesse'];

const LATITUDE_MAX = 85.05112878;

export function erreurSortie(code) {
  const erreur = new Error(`sortie-${code}`);
  erreur.code = code;
  return erreur;
}

export function formatDuNom(nomFichier) {
  const extension = nomFichier.toLowerCase().replace(/\.gz$/, '').split('.').pop();
  return FORMATS.includes(extension) ? extension : null;
}

// --- Type de sortie (identifiants des activités de Montis) ---

const MOTS_TYPES = [
  ['parapente', /para|glid|vol|flying|fly|delta|hang|speed.?(fly|rid)/],
  ['ski', /ski|snowboard|splitboard/],
  ['velo', /bik|cycl|ride|velo|vélo|vtt|gravel|mtb|bicycle/],
  ['rando', /hik|walk|run|trail|trek|mountaineer|alpin|snowshoe|randon|marche|course/],
];

export function typeDepuisTexte(texte) {
  if (!texte) return null;
  const minuscule = String(texte).toLowerCase();
  // Strava écrit parfois le type en chiffres dans les GPX
  const STRAVA = { 1: 'velo', 4: 'rando', 9: 'rando', 10: 'rando', 11: 'rando' };
  if (/^\d+$/.test(minuscule.trim())) return STRAVA[Number(minuscule)] ?? null;
  return MOTS_TYPES.find(([, motif]) => motif.test(minuscule))?.[0] ?? null;
}

// Sports du profil FIT
const SPORTS_FIT = {
  1: 'rando', // course à pied (trail)
  2: 'velo',
  11: 'rando',
  12: 'ski', // ski de fond
  13: 'ski',
  14: 'ski',
  16: 'rando', // alpinisme
  17: 'rando',
  20: 'parapente', // vol
  21: 'velo', // vélo électrique
  26: 'parapente', // deltaplane, parapente
  35: 'rando', // raquettes
};

export const typeDepuisSportFit = (sport) => SPORTS_FIT[sport] ?? null;

// --- Construction commune ---

function nombre(valeur) {
  if (valeur == null || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function dateIso(texte) {
  if (!texte) return null;
  const ms = Date.parse(texte.trim());
  return Number.isFinite(ms) ? ms : null;
}

// Points [{ t, lng, lat, alt… }] -> sortie en colonnes, sans les canaux vides
export function construireSortie({ points, nom = null, type = null, format, coupures = [], decalage = null }) {
  const valides = [];
  const indicesCoupures = new Set();
  let coupureEnAttente = false;
  const coupuresTriees = new Set(coupures);
  points.forEach((point, i) => {
    if (coupuresTriees.has(i)) coupureEnAttente = true;
    const { lng, lat } = point;
    if (
      !Number.isFinite(lng) || lng < -180 || lng > 180 ||
      !Number.isFinite(lat) || lat < -LATITUDE_MAX || lat > LATITUDE_MAX
    ) return;
    if (coupureEnAttente && valides.length) indicesCoupures.add(valides.length);
    coupureEnAttente = false;
    valides.push(point);
  });
  if (valides.length < 2) throw erreurSortie('sans-trace');

  // Le temps n'est gardé que si tous les points sont datés
  const dates = valides.every((p) => Number.isFinite(p.t));
  const arrondi = (x) => Math.round(x * 1e6) / 1e6;
  const colonnes = {
    t: dates ? valides.map((p) => p.t) : null,
    lng: valides.map((p) => arrondi(p.lng)),
    lat: valides.map((p) => arrondi(p.lat)),
  };
  for (const canal of CANAUX) {
    const valeurs = valides.map((p) => (Number.isFinite(p[canal]) ? p[canal] : null));
    if (valeurs.some((v) => v != null)) colonnes[canal] = valeurs;
  }
  return {
    format,
    nom: nom || null,
    type,
    debut: dates ? colonnes.t[0] : null,
    points: colonnes,
    coupures: [...indicesCoupures].sort((a, b) => a - b),
    // Fuseau du lieu en minutes (heure locale moins heure universelle), quand le fichier le donne
    decalage,
  };
}

// --- GPX ---

function enfant(element, nom) {
  return element.getElementsByTagNameNS('*', nom)[0] ?? null;
}

function texteEnfant(element, nom) {
  return enfant(element, nom)?.textContent?.trim() || null;
}

function lireXml(contenu, racine) {
  const documentXml = new DOMParser().parseFromString(contenu, 'application/xml');
  if (documentXml.getElementsByTagName('parsererror').length || documentXml.documentElement.localName !== racine) {
    throw erreurSortie('invalide');
  }
  return documentXml;
}

export function lireGpxSortie(contenu) {
  const documentXml = lireXml(contenu, 'gpx');
  const points = [];
  const coupures = [];
  const lirePoint = (point) => ({
    lng: nombre(point.getAttribute('lon')),
    lat: nombre(point.getAttribute('lat')),
    t: dateIso(texteEnfant(point, 'time')),
    alt: nombre(texteEnfant(point, 'ele')),
    fc: nombre(texteEnfant(point, 'hr')),
    cadence: nombre(texteEnfant(point, 'cad')),
    puissance: nombre(texteEnfant(point, 'power') ?? texteEnfant(point, 'PowerInWatts')),
    temperature: nombre(texteEnfant(point, 'atemp')),
    vitesse: nombre(texteEnfant(point, 'speed')),
  });
  for (const segment of documentXml.getElementsByTagNameNS('*', 'trkseg')) {
    if (points.length) coupures.push(points.length);
    for (const point of segment.getElementsByTagNameNS('*', 'trkpt')) points.push(lirePoint(point));
  }
  if (!points.length) {
    for (const point of documentXml.getElementsByTagNameNS('*', 'rtept')) points.push(lirePoint(point));
  }
  const trace = enfant(documentXml, 'trk') ?? enfant(documentXml, 'rte');
  const metadata = enfant(documentXml, 'metadata');
  const nom = (trace && texteEnfant(trace, 'name')) || (metadata && texteEnfant(metadata, 'name'));
  const type = typeDepuisTexte(trace && texteEnfant(trace, 'type'));
  return construireSortie({ points, nom, type, format: 'gpx', coupures });
}

// --- TCX ---

export function lireTcxSortie(contenu) {
  const documentXml = lireXml(contenu, 'TrainingCenterDatabase');
  const points = [];
  const coupures = [];
  for (const trace of documentXml.getElementsByTagNameNS('*', 'Track')) {
    if (points.length) coupures.push(points.length);
    for (const point of trace.getElementsByTagNameNS('*', 'Trackpoint')) {
      const position = enfant(point, 'Position');
      if (!position) continue;
      const frequence = enfant(point, 'HeartRateBpm');
      points.push({
        t: dateIso(texteEnfant(point, 'Time')),
        lat: nombre(texteEnfant(position, 'LatitudeDegrees')),
        lng: nombre(texteEnfant(position, 'LongitudeDegrees')),
        alt: nombre(texteEnfant(point, 'AltitudeMeters')),
        fc: frequence ? nombre(texteEnfant(frequence, 'Value')) : null,
        cadence: nombre(texteEnfant(point, 'Cadence') ?? texteEnfant(point, 'RunCadence')),
        puissance: nombre(texteEnfant(point, 'Watts')),
        vitesse: nombre(texteEnfant(point, 'Speed')),
      });
    }
  }
  const activite = enfant(documentXml, 'Activity');
  const nom = activite && (texteEnfant(activite, 'Notes') || null);
  const type = typeDepuisTexte(activite?.getAttribute('Sport'));
  return construireSortie({ points, nom, type, format: 'tcx', coupures });
}

// --- IGC (varios de vol libre) ---

function degresIgc(texte, chiffresDegres) {
  const degres = Number(texte.slice(0, chiffresDegres));
  const minutes = Number(texte.slice(chiffresDegres, chiffresDegres + 5)) / 1000;
  const signe = /[SW]/.test(texte.at(-1)) ? -1 : 1;
  return signe * (degres + minutes / 60);
}

export function lireIgcSortie(contenu) {
  const lignes = contenu.split(/\r?\n/);
  if (!lignes.some((ligne) => /^B\d{6}/.test(ligne))) throw erreurSortie(lignes[0]?.startsWith('A') ? 'sans-trace' : 'invalide');

  let jour = null;
  let pilote = null;
  let voile = null;
  for (const ligne of lignes) {
    const date = ligne.match(/^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})/);
    if (date) {
      const [, jj, mm, aa] = date.map(Number);
      jour = Date.UTC(2000 + aa - (aa > 79 ? 100 : 0), mm - 1, jj);
    }
    pilote ??= ligne.match(/^HFPLT[^:]*:(.+)/)?.[1]?.trim() || null;
    voile ??= ligne.match(/^HFGTY[^:]*:(.+)/)?.[1]?.trim() || null;
  }

  const points = [];
  let jourCourant = jour;
  let secondesPrecedentes = -1;
  for (const ligne of lignes) {
    if (!/^B\d{6}\d{7}[NS]\d{8}[EW]/.test(ligne)) continue;
    const secondes = Number(ligne.slice(1, 3)) * 3600 + Number(ligne.slice(3, 5)) * 60 + Number(ligne.slice(5, 7));
    // Passage de minuit UTC pendant le vol
    if (jourCourant != null && secondes < secondesPrecedentes) jourCourant += 86400000;
    secondesPrecedentes = secondes;
    const pression = nombre(ligne.slice(25, 30));
    const gps = nombre(ligne.slice(30, 35));
    points.push({
      t: jourCourant != null ? jourCourant + secondes * 1000 : null,
      lat: degresIgc(ligne.slice(7, 15), 2),
      lng: degresIgc(ligne.slice(15, 24), 3),
      // L'altitude du baromètre (calée sur 1013 hPa) prime ; celle du GPS est gardée à côté
      alt: pression || gps || null,
      altGps: gps || null,
    });
  }
  const nom = [voile, pilote].filter(Boolean).join(' · ') || null;
  return construireSortie({ points, nom, type: 'parapente', format: 'igc' });
}

// --- FIT ---

export function lireFitSortie(tampon) {
  let fit;
  try {
    fit = decoderFit(tampon);
  } catch (erreur) {
    throw erreur.code ? erreur : erreurSortie('invalide');
  }
  return construireSortie({ points: fit.points, nom: fit.nom, type: typeDepuisSportFit(fit.sport), format: 'fit', decalage: fit.decalage });
}

// Lit un fichier dont on connaît le format ; contenu texte, ou ArrayBuffer pour le FIT
export function lireSortie(format, contenu) {
  if (format === 'fit') return lireFitSortie(contenu);
  const texte = typeof contenu === 'string' ? contenu : new TextDecoder().decode(contenu);
  if (format === 'gpx') return lireGpxSortie(texte);
  if (format === 'tcx') return lireTcxSortie(texte);
  if (format === 'igc') return lireIgcSortie(texte);
  throw erreurSortie('format');
}

// --- Résumé ---

export function distanceMetres(a, b) {
  const R = 6371008.8;
  const p1 = (a[1] * Math.PI) / 180;
  const p2 = (b[1] * Math.PI) / 180;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Chiffres de base pour la liste : distance, durée, dénivelés, altitudes
export function resumerSortie(sortie) {
  const { lng, lat, t, alt } = sortie.points;
  const coupures = new Set(sortie.coupures ?? []);
  let distance = 0;
  for (let i = 1; i < lng.length; i++) {
    if (!coupures.has(i)) distance += distanceMetres([lng[i - 1], lat[i - 1]], [lng[i], lat[i]]);
  }
  const altitudes = alt?.filter((a) => a != null) ?? [];
  const { plus, moins } = altitudes.length > 1 ? denivele(lisser(altitudes)) : { plus: null, moins: null };
  return {
    distance,
    duree: t ? (t.at(-1) - t[0]) / 1000 : null,
    plus,
    moins,
    // Pas de Math.max(...) : une longue sortie dépasse la limite d'arguments
    altMax: altitudes.length ? altitudes.reduce((a, b) => Math.max(a, b)) : null,
    altMin: altitudes.length ? altitudes.reduce((a, b) => Math.min(a, b)) : null,
  };
}
