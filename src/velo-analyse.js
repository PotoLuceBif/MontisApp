// Ce qu'on peut dire d'un tracé : altitudes, pentes, durée selon la pratique, surfaces, difficulté.
import { echantillonner } from './rando-api.js';
import { altitudesDuTrace, denivele, lisser } from './rando-profil.js';

export const PALIERS_PENTE = [3, 6, 10, 15]; // %
const FENETRE_PENTE = 75; // m de part et d'autre du point : en dessous, c'est le bruit du relief qu'on mesure

export const VOIES = {
  asphalte: { libelle: 'Asphalte', couleur: '#8fa3b8' },
  chemin: { libelle: 'Chemin', couleur: '#d8a657' },
  single: { libelle: 'Single', couleur: '#5fd068' },
  inconnu: { libelle: 'Inconnu', couleur: '#5b6472' },
};

export const DIFFICULTES = [
  { libelle: 'S0', couleur: '#43c98b' },
  { libelle: 'S1', couleur: '#4aa8ff' },
  { libelle: 'S2', couleur: '#ff5580' },
  { libelle: 'S3', couleur: '#b98bff' },
  { libelle: 'S4+', couleur: '#ff4fd8' },
];
export const palierDifficulte = (valeur) => Math.min(DIFFICULTES.length - 1, valeur);

export const palierPente = (pente) => {
  const palier = PALIERS_PENTE.findIndex((limite) => Math.abs(pente) < limite);
  return palier < 0 ? PALIERS_PENTE.length : palier;
};

export function repartir(troncons) {
  const voies = { asphalte: 0, chemin: 0, single: 0, inconnu: 0 };
  const difficultes = DIFFICULTES.map(() => 0);
  let total = 0;
  let marches = 0;
  troncons.forEach(({ longueur, voie, difficulte, marches: avecMarches }) => {
    voies[voie] += longueur;
    total += longueur;
    if (difficulte !== null && difficulte !== undefined) difficultes[palierDifficulte(difficulte)] += longueur;
    if (avecMarches) marches += longueur;
  });
  return { voies, difficultes, total, marches };
}

// Portions continues au-delà du seuil de la pratique, les plus raides d'abord
export function passagesRaides({ points, pentes }, seuil, longueurMin = 80) {
  const passages = [];
  let debut = null;
  const clore = (fin) => {
    if (debut === null) return;
    const longueur = points[fin].d - points[debut].d;
    if (longueur >= longueurMin) {
      const portion = pentes.slice(debut, fin + 1);
      const montee = pentes[debut] > 0;
      const extreme = montee ? Math.max(...portion) : Math.min(...portion);
      passages.push({ indice: debut + portion.indexOf(extreme), d: points[debut].d, longueur, pente: extreme });
    }
    debut = null;
  };
  pentes.forEach((pente, i) => {
    if (Math.abs(pente) < seuil || (debut !== null && Math.sign(pentes[debut]) !== Math.sign(pente))) clore(i - 1);
    if (Math.abs(pente) >= seuil && debut === null) debut = i;
  });
  clore(pentes.length - 1);
  return passages.sort((a, b) => Math.abs(b.pente) - Math.abs(a.pente));
}

export function dureeVelo(distance, plus, pratique) {
  return distance / 1000 / pratique.vitesse + plus / pratique.montee;
}

export async function analyserTrace(chaine, pratique) {
  const { points, total } = echantillonner(chaine);
  if (points.length < 2) return null;
  const alts = lisser(await altitudesDuTrace(points, total), 2);
  const pas = total / (points.length - 1);
  const demi = Math.max(1, Math.round(FENETRE_PENTE / pas));
  const pentes = alts.map((_, i) => {
    const a = Math.max(0, i - demi);
    const b = Math.min(alts.length - 1, i + demi);
    const longueur = points[b].d - points[a].d;
    return longueur > 0 ? ((alts[b] - alts[a]) / longueur) * 100 : 0;
  });
  const { plus, moins } = denivele(alts);
  return {
    points,
    alts,
    pentes,
    total,
    plus,
    moins,
    altitudeMax: Math.max(...alts),
    altitudeMin: Math.min(...alts),
    penteMax: Math.max(0, ...pentes),
    duree: dureeVelo(total, plus, pratique),
  };
}
