// Traduction de l'interface. Les textes vivent dans i18n/fr.json et i18n/en.json ; seuls ceux de la
// langue choisie se chargent au démarrage (index.html les précharge, voir langueChoisie de
// vite.config.js), l'autre fichier à un changement de langue. Une clé absente reste affichée telle quelle.
//
// - t('cle', { n, nom }) : texte traduit ; « {nom} » est remplacé, et une entrée
//   { "un": …, "autre": … } choisit sa forme selon n.
// - Texte posé une fois (gabarit, bouton) : marquer l'élément avec data-i18n="cle"
//   (ou data-i18n-aria-label, -title, -placeholder) ; il se retraduit tout seul au
//   changement de langue. tt(), ta() et poser() écrivent ces marques.
// - Texte recalculé (prévisions, listes) : la fonction de rendu écoute surLangue().
import { langue, locale, surPreferences, surPreparationLangue } from './preferences.js';

const FICHIERS = { fr: () => import('./i18n/fr.json'), en: () => import('./i18n/en.json') };
const TEXTES = {};
let chargee = null;

async function chargerTextes(code) {
  if (!TEXTES[code]) TEXTES[code] = (await FICHIERS[code]()).default;
  chargee ??= code;
}
surPreparationLangue(chargerTextes);
// Tout module qui traduit attend ces textes : l'interface ne se pose jamais sans eux
await chargerTextes(langue());
const ATTRIBUTS = ['aria-label', 'title', 'placeholder', 'alt'];
const racines = new Set();
// Texte écrit par poser() : s'il a changé depuis, c'est qu'un autre texte a pris sa place
const TEXTE_POSE = Symbol('texte-pose');

const echapper = (texte) =>
  String(texte).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function t(cle, variables = {}) {
  // Langue changée sans passer par definirLangue (sauvegarde restaurée) : la langue chargée en attendant
  let texte = (TEXTES[langue()] ?? TEXTES[chargee])?.[cle];
  if (texte === undefined) {
    if (import.meta.env.DEV) console.warn('Traduction absente :', cle);
    return cle;
  }
  if (typeof texte === 'object') {
    const n = Number(variables.n);
    texte = (langue() === 'fr' ? n < 2 : n === 1) ? texte.un : texte.autre;
  }
  return texte.replace(/\{(\w+)\}/g, (tout, nom) => (nom in variables ? String(variables[nom]) : tout));
}

const attributVariables = (variables) =>
  variables && Object.keys(variables).length ? ` data-i18n-vars="${echapper(JSON.stringify(variables))}"` : '';

// Dans un gabarit HTML : un texte qui suivra la langue
export const tt = (cle, variables) =>
  `<span data-i18n="${cle}"${attributVariables(variables)}>${echapper(t(cle, variables))}</span>`;

// Dans un gabarit HTML : la marque à poser sur l'élément lui-même, puis son texte
export const ti = (cle, variables) => `data-i18n="${cle}"${attributVariables(variables)}`;

// Dans un gabarit HTML : un attribut traduit, ex. ta('aria-label', 'menu.fermer')
export const ta = (attribut, cle, variables) =>
  `${attribut}="${echapper(t(cle, variables))}" data-i18n-${attribut}="${cle}"${attributVariables(variables)}`;

export function poser(element, cle, variables) {
  element.dataset.i18n = cle;
  if (variables) element.dataset.i18nVars = JSON.stringify(variables);
  else delete element.dataset.i18nVars;
  element.textContent = t(cle, variables);
  element[TEXTE_POSE] = element.textContent;
  return element;
}

export function poserAttribut(element, attribut, cle, variables) {
  element.setAttribute(`data-i18n-${attribut}`, cle);
  if (variables) element.dataset.i18nVars = JSON.stringify(variables);
  element.setAttribute(attribut, t(cle, variables));
  return element;
}

function variablesDe(element) {
  try {
    return element.dataset.i18nVars ? JSON.parse(element.dataset.i18nVars) : {};
  } catch {
    return {};
  }
}

// Retraduit les marques d'un morceau d'interface (et le morceau lui-même)
export function traduire(racine = document.body) {
  const elements = racine.querySelectorAll ? [racine, ...racine.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-aria-label], [data-i18n-title], [data-i18n-placeholder], [data-i18n-alt]')] : [];
  for (const element of elements) {
    if (!element.dataset) continue;
    const variables = variablesDe(element);
    if (element.dataset.i18n) {
      if (element[TEXTE_POSE] !== undefined && element.textContent !== element[TEXTE_POSE]) {
        delete element.dataset.i18n;
      } else {
        element.textContent = t(element.dataset.i18n, variables);
        if (element[TEXTE_POSE] !== undefined) element[TEXTE_POSE] = element.textContent;
      }
    }
    if (element.dataset.i18nHtml) element.innerHTML = t(element.dataset.i18nHtml, variables);
    for (const attribut of ATTRIBUTS) {
      const cle = element.getAttribute(`data-i18n-${attribut}`);
      if (cle) element.setAttribute(attribut, t(cle, variables));
    }
  }
}

// Un morceau d'interface gardé hors du document (popup, panneau détaché) : à retraduire aussi
export function suivre(racine) {
  racines.add(racine);
  return racine;
}

export const surLangue = (action) => surPreferences(action, ['langue', '*']);

surLangue(() => {
  traduire(document.body);
  racines.forEach((racine) => {
    if (!racine.isConnected) traduire(racine);
  });
});

// ---------- Dates et heures ----------
// Français : « 14h05 », comme sur les panneaux de montagne. Anglais : « 14:05 ».
export function heureCourte(date) {
  const valeur = new Date(date);
  const minutes = String(valeur.getMinutes()).padStart(2, '0');
  return langue() === 'en' ? `${String(valeur.getHours()).padStart(2, '0')}:${minutes}` : `${valeur.getHours()}h${minutes}`;
}

export const formatDate = (date, options) => new Intl.DateTimeFormat(locale(), options).format(new Date(date));

// « 2 nov. à 14h05 » / « 2 Nov at 14:05 »
export const dateEtHeure = (date) =>
  t('commun.date-heure', { date: formatDate(date, { day: 'numeric', month: 'short' }), heure: heureCourte(date) });

export const nomJour = (date, format = 'long') => formatDate(date, { weekday: format }).replace('.', '');
