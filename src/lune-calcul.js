// Calculs de la Lune pour un lieu et un instant : position, phase, éclairement, lever et coucher (calcul pur,
// testé). Tout vient de `suncalc`, sur l'appareil : disponible hors ligne. Instants en Date, affichés au
// fuseau du lieu par heureDuLieu (soleil.js).
import { getMoonIllumination, getMoonPosition, getMoonTimes } from 'suncalc';

const MINUTE = 60000;
const JOUR = 24 * 60 * MINUTE;
const LUNAISON = 29.530589; // jours
// Une phase « exacte » (pleine, nouvelle, quartiers) se dit environ un jour de part et d'autre
const TOLERANCE_PHASE = 1 / LUNAISON;

const valide = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date : null);
const azimut = (a) => ((a % 360) + 360) % 360; // suncalc 2 : degrés depuis le nord

// Azimut en degrés depuis le nord, hauteur en degrés au-dessus de l'horizon, distance en km
export function positionLune(date, latitude, longitude) {
  const { azimuth, altitude, distance } = getMoonPosition(new Date(date), latitude, longitude);
  return { azimut: azimut(azimuth), hauteur: altitude, distance };
}

// Code de la phase (clé `lune.phase-<code>`) d'après la phase de suncalc (0 nouvelle, 0,5 pleine)
export function codePhase(phase) {
  const p = ((phase % 1) + 1) % 1;
  const pres = (cible) => Math.abs(p - cible) < TOLERANCE_PHASE || Math.abs(p - cible - 1) < TOLERANCE_PHASE;
  if (pres(0)) return 'nouvelle';
  if (pres(0.25)) return 'premier-quartier';
  if (pres(0.5)) return 'pleine';
  if (pres(0.75)) return 'dernier-quartier';
  if (p < 0.25) return 'premier-croissant';
  if (p < 0.5) return 'gibbeuse-croissante';
  if (p < 0.75) return 'gibbeuse-decroissante';
  return 'dernier-croissant';
}

// Fraction éclairée (0 à 1), phase (0 à 1), croissante ou non, et son code
export function eclairementLune(date) {
  const { fraction, phase } = getMoonIllumination(new Date(date));
  return { fraction, phase, croissante: phase < 0.5, code: codePhase(phase) };
}

// Prochain instant où la phase atteint `cible` (0 nouvelle, 0,5 pleine), après `date`
export function prochainePhase(date, cible) {
  const depart = new Date(date).getTime();
  // 0 juste après la cible, puis croît jusqu'à 1 : il retombe quand la cible est franchie
  const ecart = (t) => (getMoonIllumination(new Date(t)).phase - cible + 2) % 1;
  // La phase avance d'environ 1/29,5 par jour : on avance par pas de 6 h jusqu'à franchir la cible
  let avant = depart;
  let ecartAvant = ecart(avant);
  for (let i = 0; i < 4 * 31; i += 1) {
    const apres = avant + JOUR / 4;
    const ecartApres = ecart(apres);
    if (ecartApres < ecartAvant) {
      // Franchie entre `avant` et `apres` : dichotomie
      let a = avant;
      let b = apres;
      for (let j = 0; j < 20; j += 1) {
        const m = (a + b) / 2;
        if (ecart(m) < ecart(a)) b = m;
        else a = m;
      }
      return new Date(b);
    }
    avant = apres;
    ecartAvant = ecartApres;
  }
  return null;
}

// Lever, coucher et passage au plus haut pendant le jour civil du lieu (`jour` « 2026-11-16 »)
export function journeeLune(jour, latitude, longitude, decalageMinutes) {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  const midi = new Date(Date.UTC(annee, mois - 1, quantieme, 12) - decalageMinutes * MINUTE);
  const heures = getMoonTimes(midi, latitude, longitude, decalageMinutes);
  const regime = heures.alwaysUp ? 'toujours-levee' : heures.alwaysDown ? 'toujours-couchee' : 'normal';
  return {
    lever: valide(heures.rise),
    coucher: valide(heures.set),
    culmination: valide(heures.transit),
    regime,
  };
}

// Dessin de la partie éclairée dans un disque de rayon `r` centré en (c, c), pour une icône SVG.
// Vue de l'hémisphère nord : croissante, la Lune est éclairée à droite (inversé dans l'hémisphère sud).
export function dessinPhase(fraction, croissante, { c = 12, r = 9, sud = false } = {}) {
  const f = Math.min(1, Math.max(0, fraction));
  if (f < 0.005) return '';
  const haut = `${c} ${(c - r).toFixed(2)}`;
  const bas = `${c} ${(c + r).toFixed(2)}`;
  if (f > 0.995) return `M${haut}A${r} ${r} 0 1 1 ${bas}A${r} ${r} 0 1 1 ${haut}Z`;
  const rx = (r * Math.abs(1 - 2 * f)).toFixed(2);
  // Le limbe éclairé (demi-cercle), puis le terminateur : il bombe vers le limbe pour un croissant,
  // vers l'autre côté pour une Lune gibbeuse
  const droite = croissante !== sud;
  const limbe = droite ? 1 : 0;
  const terminateur = (f < 0.5) === droite ? 0 : 1;
  return `M${haut}A${r} ${r} 0 0 ${limbe} ${bas}A${rx} ${r} 0 0 ${terminateur} ${haut}Z`;
}
