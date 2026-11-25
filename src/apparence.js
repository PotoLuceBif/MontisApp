import { lire, ecrire } from './reglages.js';

export const THEMES = [
  { id: 'cyberpunk', cle: 'theme.cyberpunk' },
  { id: 'clair', cle: 'theme.clair' },
  { id: 'sombre', cle: 'theme.sombre' },
  { id: 'auto', cle: 'theme.auto' },
];

// Les couleurs réelles sont définies dans style.css ; ici, seulement de quoi dessiner les pastilles
export const ACCENTS = [
  // Violet du logo : accent par défaut du thème Montis (style « Nuit étoilée raffinée », 25 novembre 2026)
  { id: 'montis', cle: 'accent.montis', clair: '#6a4fd6', sombre: '#a494ff' },
  { id: 'aurore', cle: 'accent.aurore', clair: '#4b4fc7', sombre: '#a0a6ff' },
  { id: 'sapin', cle: 'accent.sapin', clair: '#2f6b57', sombre: '#5fb59a' },
  { id: 'ocre', cle: 'accent.ocre', clair: '#b65f26', sombre: '#f0ad64' },
  { id: 'acier', cle: 'accent.acier', clair: '#3a5f86', sombre: '#7fabd9' },
  { id: 'brique', cle: 'accent.brique', clair: '#a2402c', sombre: '#e8806a' },
  { id: 'prune', cle: 'accent.prune', clair: '#6c4879', sombre: '#bb98c9' },
];

const systemeSombre = window.matchMedia('(prefers-color-scheme: dark)');

export const themeChoisi = () => {
  const t = lire('theme', 'cyberpunk');
  return THEMES.some((x) => x.id === t) ? t : 'cyberpunk';
};

export const accentChoisi = () => {
  const accentParDefaut = themeChoisi() === 'cyberpunk' ? 'montis' : 'aurore';
  const a = lire('accent', accentParDefaut);
  return ACCENTS.some((x) => x.id === a) ? a : accentParDefaut;
};

export function appliquerApparence() {
  const choix = themeChoisi();
  const sombre = choix === 'sombre' || choix === 'cyberpunk' || (choix === 'auto' && systemeSombre.matches);
  document.documentElement.dataset.theme = choix === 'cyberpunk' ? 'cyberpunk' : sombre ? 'sombre' : 'clair';
  document.documentElement.dataset.accent = accentChoisi();
}

export function definirTheme(id) {
  ecrire('theme', id);
  appliquerApparence();
}

export function definirAccent(id) {
  ecrire('accent', id);
  appliquerApparence();
}

// En mode Auto, on suit le changement de réglage de l'appareil
systemeSombre.addEventListener('change', () => {
  if (themeChoisi() === 'auto') appliquerApparence();
});