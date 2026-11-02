// Affichage des mesures selon le système choisi. Toutes les fonctions reçoivent des valeurs
// métriques (m, km/h, °C, mm) : on ne convertit qu'au moment d'afficher.
import { langue, systemeUnites, uniteVent, locale } from './preferences.js';

const PIEDS_PAR_METRE = 3.28084;
const METRES_PAR_MILLE = 1609.344;
const KMH = { kmh: 1, ms: 1 / 3.6, kt: 1 / 1.852, mph: 1 / 1.609344 };
const LIBELLES_VENT = { kmh: 'km/h', ms: 'm/s', kt: 'kt', mph: 'mph' };

export const imperial = () => systemeUnites() === 'imperial';

export const nombre = (valeur, decimales = 0) =>
  Number(valeur).toLocaleString(locale(), { maximumFractionDigits: decimales });

const arrondirA = (valeur, pas) => (pas > 1 ? Math.round(valeur / pas) * pas : Math.round(valeur));

// ---------- Altitudes, hauteurs et dénivelés ----------
export const uniteAltitude = () => (imperial() ? 'ft' : 'm');
export const versAltitude = (m) => (imperial() ? m * PIEDS_PAR_METRE : m);
export const depuisAltitude = (valeur) => (imperial() ? valeur / PIEDS_PAR_METRE : valeur);

// `pas` : arrondi pour les valeurs rondes (plafonds, graduations), en unité affichée
export function valeurAltitude(m, { pas = 1 } = {}) {
  return nombre(arrondirA(versAltitude(m), pas));
}
export const formatAltitude = (m, options) => `${valeurAltitude(m, options)} ${uniteAltitude()}`;
export const formatDenivele = (m) => formatAltitude(m);

// ---------- Distances ----------
export const uniteDistance = () => (imperial() ? 'mi' : 'km');
export const versDistance = (m) => (imperial() ? m / METRES_PAR_MILLE : m / 1000);

export function valeurDistance(m) {
  const v = versDistance(m);
  return nombre(v, v < 100 ? 1 : 0);
}
export const formatDistance = (m) => `${valeurDistance(m)} ${uniteDistance()}`;

// Pour les courtes longueurs (passage raide, piste) : m ou ft, puis km ou mi
export function formatLongueur(m) {
  if (imperial()) {
    return m < 0.1 * METRES_PAR_MILLE ? `${nombre(m * PIEDS_PAR_METRE)} ft` : formatDistance(m);
  }
  return m < 1000 ? `${nombre(m)} m` : formatDistance(m);
}

export const formatSurface = (km2) =>
  imperial() ? `${nombre(km2 / 2.589988)} mi²` : `${nombre(km2)} km²`;

// ---------- Vent ----------
export const libelleVent = () => LIBELLES_VENT[uniteVent()];
export const versVent = (kmh) => kmh * KMH[uniteVent()];
export const depuisVent = (valeur) => valeur / KMH[uniteVent()];

export function valeurVent(kmh) {
  const v = versVent(kmh);
  return nombre(v, uniteVent() === 'ms' && v < 10 ? 1 : 0);
}
export const formatSpeed = (kmh) => `${valeurVent(kmh)} ${libelleVent()}`;
export const formatVent = formatSpeed;

// ---------- Températures ----------
export const uniteTemp = () => (imperial() ? '°F' : '°C');
export const versTemp = (c) => (imperial() ? (c * 9) / 5 + 32 : c);
export const valeurTemp = (c) => nombre(Math.round(versTemp(c)));
// `court` : « 12° », pour les prévisions où la place manque
export const formatTemp = (c, { court = false } = {}) =>
  court ? `${valeurTemp(c)}°` : `${valeurTemp(c)} ${uniteTemp()}`;

// ---------- Précipitations ----------
export const formatPluie = (mm) => (imperial() ? `${nombre(mm / 25.4, 2)} in` : `${nombre(mm, 1)} mm`);
export const formatNeige = (cm) => (imperial() ? `${nombre(cm / 2.54, 1)} in` : `${nombre(cm, 1)} cm`);
export const uniteNeige = () => (imperial() ? 'in' : 'cm');
export const versNeige = (cm) => (imperial() ? cm / 2.54 : cm);

// ---------- Allure (rando, vélo) : saisie en min/km ou min/mi ----------
export const uniteAllure = () => (imperial() ? 'min/mi' : 'min/km');
export const versAllure = (minParKm) => (imperial() ? minParKm * (METRES_PAR_MILLE / 1000) : minParKm);
export const depuisAllure = (valeur) => (imperial() ? valeur / (METRES_PAR_MILLE / 1000) : valeur);

// ---------- Cartes MapLibre ----------
// Texte d'altitude dans une expression de style ; `champ` vaut une expression en mètres
export const expressionAltitude = (champ) =>
  imperial()
    ? ['concat', ['number-format', ['*', ['to-number', champ, 0], PIEDS_PAR_METRE], { 'max-fraction-digits': 0 }], ' ft']
    : ['concat', ['number-format', ['to-number', champ, 0], { 'max-fraction-digits': 0 }], ' m'];

export const PIEDS = PIEDS_PAR_METRE;

// ---------- Tailles de fichiers : Ko, Mo, Go en français ; KB, MB, GB en anglais ----------
const KO = 1024;
export function formatTaille(octets) {
  const [ko, mo, go] = langue() === 'en' ? ['KB', 'MB', 'GB'] : ['Ko', 'Mo', 'Go'];
  if (!octets) return `0 ${ko}`;
  if (octets < KO * KO) return `${nombre(Math.max(1, Math.round(octets / KO)))} ${ko}`;
  if (octets < KO * KO * KO) return `${nombre(Math.round(octets / (KO * KO)))} ${mo}`;
  return `${nombre(octets / (KO * KO * KO), 1)} ${go}`;
}
