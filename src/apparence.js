import { lire, ecrire } from './reglages.js';

export const THEMES = [
  { id: 'clair', nom: 'Clair' },
  { id: 'sombre', nom: 'Sombre' },
  { id: 'auto', nom: 'Auto' },
];

// Les couleurs réelles sont définies dans style.css ; ici, seulement de quoi dessiner les pastilles
export const ACCENTS = [
  { id: 'sapin', nom: 'Vert sapin', clair: '#2f6b57', sombre: '#5fb59a' },
  { id: 'ocre', nom: 'Ocre', clair: '#9a6212', sombre: '#e3a64d' },
  { id: 'acier', nom: 'Bleu acier', clair: '#3a5f86', sombre: '#7fabd9' },
  { id: 'brique', nom: 'Brique', clair: '#a2402c', sombre: '#e8806a' },
  { id: 'prune', nom: 'Prune', clair: '#6c4879', sombre: '#bb98c9' },
];

const systemeSombre = window.matchMedia('(prefers-color-scheme: dark)');

export const themeChoisi = () => {
  const t = lire('theme', 'auto');
  return THEMES.some((x) => x.id === t) ? t : 'auto';
};

export const accentChoisi = () => {
  const a = lire('accent', 'sapin');
  return ACCENTS.some((x) => x.id === a) ? a : 'sapin';
};

export function appliquerApparence() {
  const choix = themeChoisi();
  const sombre = choix === 'sombre' || (choix === 'auto' && systemeSombre.matches);
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair';
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