// Ce que partagent la liste de Mes traces et la vue d'une sortie : types, icônes, noms, durées, heure du lieu.
import { formatDenivele, formatDistance } from './unites.js';
import { heureDuLieu, nomDecalage } from './soleil.js';
import { formatDate, heureCourte, t } from './i18n.js';

export const TYPES = [
  { id: 'rando', cle: 'rando.titre', fichier: 'randonnee' },
  { id: 'velo', cle: 'velo.titre', fichier: 'velo' },
  { id: 'ski', cle: 'ski.titre', fichier: 'ski' },
  { id: 'parapente', cle: 'para.titre', fichier: 'parapente' },
];
const DESSIN_AUTRE = '<circle cx="12" cy="12" r="8"/><path d="M8 14c2-4 6-4 8 0"/>';
export const svg = (dessin) => `<svg viewBox="0 0 24 24" aria-hidden="true">${dessin}</svg>`;

export const typeDe = (id) => TYPES.find((type) => type.id === id) ?? null;
export const iconeType = (id) => {
  const type = typeDe(id);
  return type
    ? `<img class="traces-icone" src="/icons/activites/${type.fichier}.svg" alt="" width="36" height="36">`
    : `<span class="traces-icone traces-icone-autre">${svg(DESSIN_AUTRE)}</span>`;
};
export const libelleType = (id) => t(typeDe(id)?.cle ?? 'traces.type-autre');

// ---------- Heure du lieu ----------
// Une sortie se lit à l'heure de l'endroit où elle a eu lieu, pas à celle du téléphone qui la regarde.
// Fuseau (minutes) : celui de la montre (FIT), sinon celui que la météo du jour a donné, sinon inconnu.
export const decalageDe = (sortie) => sortie?.decalage ?? sortie?.meteo?.decalage ?? null;

export function heureSortie(instant, sortie) {
  const decalage = decalageDe(sortie);
  return decalage == null ? heureCourte(new Date(instant)) : heureDuLieu(instant, decalage);
}

export function dateSortie(instant, sortie, options) {
  const decalage = decalageDe(sortie);
  return decalage == null ? formatDate(instant, options) : formatDate(instant + decalage * 60000, { ...options, timeZone: 'UTC' });
}

// « Heures du lieu (UTC−3) », ou l'aveu que ce sont celles de l'appareil
export function noteFuseau(sortie) {
  const decalage = decalageDe(sortie);
  if (decalage == null) return t('traces.fuseau-appareil');
  return t(sortie.decalage != null ? 'traces.fuseau-montre' : 'traces.fuseau-lieu', { fuseau: nomDecalage(decalage) });
}

export function nomSortie(sortie) {
  if (sortie.nom) return sortie.nom;
  if (sortie.debut) return t('traces.nom-defaut', { type: libelleType(sortie.type), date: dateSortie(sortie.debut, sortie, { day: 'numeric', month: 'long' }) });
  return sortie.fichier || libelleType(sortie.type);
}

// Durée réelle, à la minute (formaterDuree arrondit aux 5 minutes, fait pour une estimation)
export function formatDureeReelle(secondes) {
  const minutes = Math.round(secondes / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t('duree.heures', { h, m: String(m).padStart(2, '0') }) : t('duree.minutes', { m });
}

// L'année seulement si ce n'est pas l'année en cours : la ligne reste courte sur téléphone.
// `sortie` : pour une date de sortie, à lire à l'heure du lieu
export const dateCourte = (date, sortie = null) => dateSortie(date, sortie, {
  day: 'numeric',
  month: 'short',
  ...(new Date(date).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
});

export function detailSortie(sortie) {
  const { distance, duree, plus } = sortie.resume ?? {};
  return [
    sortie.debut ? dateCourte(sortie.debut, sortie) : null,
    Number.isFinite(distance) ? formatDistance(distance) : null,
    Number.isFinite(duree) && duree > 0 ? formatDureeReelle(duree) : null,
    Number.isFinite(plus) ? `D+ ${formatDenivele(plus)}` : null,
  ].filter(Boolean).join(' · ');
}
