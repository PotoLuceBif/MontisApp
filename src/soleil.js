// Calculs du soleil pour un lieu et un jour : lever, coucher, heures dorées, position.
// Les heures sont des instants (Date) ; l'affichage les décale au fuseau du lieu.
import { getPosition, getTimes } from 'suncalc';
import { langue } from './preferences.js';
import { t } from './i18n.js';

const MINUTE = 60000;
// Hauteur du centre du soleil au lever et au coucher (réfraction et rayon du disque compris)
export const HAUTEUR_LEVER = -0.833;

const valide = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date : null);

// Décalage du fuseau de l'appareil à cette date, en minutes à l'est de UTC

export const decalageAppareil = (date = new Date()) => -new Date(date).getTimezoneOffset();

// « 2026-06-21 » vu dans le fuseau du lieu
export function jourLocal(date, decalageMinutes) {
  return new Date(new Date(date).getTime() + decalageMinutes * MINUTE).toISOString().slice(0, 10);
}

// Midi du jour civil du lieu : suncalc calcule alors la bonne journée, quel que soit le fuseau de l'appareil
export function midiLocal(jour, decalageMinutes) {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  return new Date(Date.UTC(annee, mois - 1, quantieme, 12) - decalageMinutes * MINUTE);
}

// Azimut en degrés depuis le nord (90 = est), hauteur en degrés au-dessus de l'horizon
export function positionSoleil(date, latitude, longitude) {
  const { azimuth, altitude } = getPosition(new Date(date), latitude, longitude);
  return { azimut: ((azimuth % 360) + 360) % 360, hauteur: altitude };
}

// Hauteur du soleil toutes les `pas` minutes du jour civil du lieu, de 0 h à 24 h
export function courseSoleil(jour, latitude, longitude, decalageMinutes, pas = 10) {
  const minuit = midiLocal(jour, decalageMinutes).getTime() - 12 * 60 * MINUTE;
  const points = [];
  for (let minutes = 0; minutes <= 24 * 60; minutes += pas) {
    points.push({ minutes, hauteur: positionSoleil(minuit + minutes * MINUTE, latitude, longitude).hauteur });
  }
  return points;
}

// Les jours de transition (le soleil se lève sans se coucher ce jour-là, près du cercle polaire),
// on compte les minutes où il est au-dessus de l'horizon
function minutesAuDessus(jour, latitude, longitude, decalageMinutes) {
  const pas = 2;
  return courseSoleil(jour, latitude, longitude, decalageMinutes, pas)
    .slice(1)
    .filter((point) => point.hauteur > HAUTEUR_LEVER).length * pas;
}

export function journeeSoleil(jour, latitude, longitude, decalageMinutes) {
  const heures = getTimes(midiLocal(jour, decalageMinutes), latitude, longitude, 0, decalageMinutes);
  const lever = valide(heures.sunrise);
  const coucher = valide(heures.sunset);
  const midiSolaire = valide(heures.solarNoon);
  const finDoreeMatin = valide(heures.goldenHourEnd);
  const debutDoreeSoir = valide(heures.goldenHour);
  const regime = heures.alwaysUp ? 'jour-polaire' : heures.alwaysDown ? 'nuit-polaire' : 'normal';

  let dureeMinutes;
  if (regime === 'jour-polaire') dureeMinutes = 24 * 60;
  else if (regime === 'nuit-polaire') dureeMinutes = 0;
  else if (lever && coucher && coucher > lever) dureeMinutes = Math.round((coucher - lever) / MINUTE);
  else dureeMinutes = minutesAuDessus(jour, latitude, longitude, decalageMinutes);

  // Heure dorée : soleil entre l'horizon et 6°. S'il ne monte jamais à 6°, toute la journée l'est.
  const doreeMatin = finDoreeMatin || debutDoreeSoir
    ? (finDoreeMatin ? { debut: lever, fin: finDoreeMatin } : null)
    : lever || coucher ? { debut: lever, fin: coucher } : null;
  const doreeSoir = debutDoreeSoir ? { debut: debutDoreeSoir, fin: coucher } : null;

  return {
    jour,
    regime,
    lever,
    coucher,
    midiSolaire,
    aube: valide(heures.dawn),
    crepuscule: valide(heures.dusk),
    doreeMatin,
    doreeSoir,
    dureeMinutes,
    hauteurMax: midiSolaire ? positionSoleil(midiSolaire, latitude, longitude).hauteur : null,
    azimutLever: lever ? positionSoleil(lever, latitude, longitude).azimut : null,
    azimutCoucher: coucher ? positionSoleil(coucher, latitude, longitude).azimut : null,
  };
}

// ---------- Affichage ----------

// Heure au fuseau du lieu : « 7h42 » en français, « 07:42 » en anglais
export function heureDuLieu(date, decalageMinutes) {
  if (!date) return '—';
  const decalee = new Date(new Date(date).getTime() + decalageMinutes * MINUTE);
  const heures = decalee.getUTCHours();
  const minutes = String(decalee.getUTCMinutes()).padStart(2, '0');
  return langue() === 'en' ? `${String(heures).padStart(2, '0')}:${minutes}` : `${heures}h${minutes}`;
}

// « 15 h 32 » / « 15h 32m »
export function formatDuree(minutes) {
  const total = Math.max(0, Math.round(minutes));
  return t('soleil.duree-valeur', { h: Math.floor(total / 60), m: String(total % 60).padStart(2, '0') });
}

// « UTC+2 », « UTC−3:30 »
export function nomDecalage(decalageMinutes) {
  const signe = decalageMinutes < 0 ? '−' : '+';
  const absolu = Math.abs(decalageMinutes);
  const minutes = absolu % 60;
  return `UTC${signe}${Math.floor(absolu / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}
