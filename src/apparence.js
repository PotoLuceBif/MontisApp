import { lire, ecrire } from './reglages.js';

export const THEMES = [
  { id: 'cyberpunk', nom: 'Cyberpunk' },
  { id: 'clair', nom: 'Clair' },
  { id: 'sombre', nom: 'Sombre' },
  { id: 'auto', nom: 'Auto' },
];

// Les couleurs réelles sont définies dans style.css ; ici, seulement de quoi dessiner les pastilles
export const ACCENTS = [
  { id: 'sapin', nom: 'Vert sapin', clair: '#2f6b57', sombre: '#5fb59a' },
  { id: 'ocre', nom: 'Ocre', clair: '#b65f26', sombre: '#f0ad64' },
  { id: 'acier', nom: 'Bleu acier', clair: '#3a5f86', sombre: '#7fabd9' },
  { id: 'brique', nom: 'Brique', clair: '#a2402c', sombre: '#e8806a' },
  { id: 'prune', nom: 'Prune', clair: '#6c4879', sombre: '#bb98c9' },
];

const systemeSombre = window.matchMedia('(prefers-color-scheme: dark)');

export const themeChoisi = () => {
  const t = lire('theme', 'cyberpunk');
  return THEMES.some((x) => x.id === t) ? t : 'cyberpunk';
};

export const accentChoisi = () => {
  const accentParDefaut = themeChoisi() === 'cyberpunk' ? 'sapin' : 'ocre';
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