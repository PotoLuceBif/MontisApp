// Recherche sur la Lune (lot 4.10) : lieux du gazetteer et sites d'alunissage, par leur nom traduit ou latin,
// sans accents ni majuscules ; zoom de la carte selon la taille du lieu (calcul pur, testé).
import { SITES_ALUNISSAGE, genreLieu, nomsLieu } from './lune-visite-calcul.js';

export const normaliser = (texte) => String(texte)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();

// `lieux` : [nom latin, code, diamètre, lng, lat, origine] ; renvoie au plus `max` résultats, les noms qui
// commencent par le texte d'abord, puis les plus grands lieux
export function chercherLieux(lieux, texte, { langue = 'fr', max = 8 } = {}) {
  const cherche = normaliser(texte);
  if (cherche.length < 2) return [];
  const trouves = [];
  for (const site of SITES_ALUNISSAGE) {
    const nom = normaliser(site.nom);
    if (nom.includes(cherche)) trouves.push({ type: 'site', site, rang: nom.startsWith(cherche) ? 0 : 1, taille: 1e6 });
  }
  for (const [latin, code, diametre, lng, lat, origine] of lieux) {
    const noms = nomsLieu(latin, langue);
    const textes = [noms.nom, latin].map(normaliser);
    if (!textes.some((t) => t.includes(cherche))) continue;
    const debut = textes.some((t) => t.startsWith(cherche) || t.includes(` ${cherche}`));
    trouves.push({
      type: 'lieu',
      lieu: { nom: noms.nom, latin: noms.latin ?? '', code, genre: genreLieu(code), diametre, lng, lat, origine },
      rang: debut ? 0 : 1,
      taille: diametre,
    });
  }
  trouves.sort((a, b) => a.rang - b.rang || b.taille - a.taille);
  return trouves.slice(0, max);
}

// Zoom qui montre un lieu en entier, avec un peu d'air autour
export function zoomPourLieu(diametreKm) {
  if (!(diametreKm > 0)) return 6.5;
  // Au zoom z, l'écran (environ 400 px) couvre à peu près 10 900 km / 2^z de Lune
  const z = Math.log2(10900 / (diametreKm * 2.2));
  return Math.max(1.6, Math.min(8, z));
}

// Sites d'alunissage, du plus ancien au plus récent
export const sitesParDate = () => [...SITES_ALUNISSAGE].sort((a, b) => a.date.localeCompare(b.date));
