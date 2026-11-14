// Voie lactée pour le ciel du globe, d'après les contours de d3-celestial (Olaf Frohn, licence BSD-3) :
// cinq niveaux d'éclat, du halo diffus au cœur. Les contours font le tour du ciel et passent souvent derrière la
// caméra : plutôt que des polygones, une grille de points (un tous les 1,5°) avec le niveau le plus dense qui
// la couvre, que l'appli dessine en taches floues.
// Écrit public/data/ciel/voie-lactee.json : [ra, dec, niveau] à plat, ra et dec en dixièmes de degré.
// Usage : node scripts/extraire-voie-lactee.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/mw.json';
const SORTIE = 'public/data/ciel/voie-lactee.json';
const PAS = 1.5; // °

const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`HTTP ${reponse.status} pour ${SOURCE}`);
const { features } = await reponse.json();

// Anneaux « dépliés » : les longitudes ne sautent jamais de 360°
const deplier = (anneau) => {
  const sortie = [];
  let decalage = 0;
  anneau.forEach(([ra, dec], i) => {
    if (i) {
      const ecart = ra + decalage - sortie[i - 1][0];
      if (ecart > 180) decalage -= 360;
      else if (ecart < -180) decalage += 360;
    }
    sortie.push([ra + decalage, dec]);
  });
  return sortie;
};
const dedans = (anneau, ra, dec) => {
  let oui = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i, i += 1) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if ((yi > dec) !== (yj > dec) && ra < ((xj - xi) * (dec - yi)) / (yj - yi) + xi) oui = !oui;
  }
  return oui;
};
// Chaque niveau range tous ses anneaux (contours et trous des bandes sombres) dans un seul polygone :
// règle pair-impair, un point est couvert s'il est dans un nombre impair d'anneaux
const dansAnneau = (anneau, ra, dec) => [-720, -360, 0, 360, 720].some((k) => dedans(anneau, ra + k, dec));
const couvre = (anneaux, ra, dec) => anneaux.filter((anneau) => dansAnneau(anneau, ra, dec)).length % 2 === 1;

const niveaux = features
  .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  .map((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]).flat().map(deplier));

const points = [];
for (let dec = -90 + PAS / 2; dec < 90; dec += PAS) {
  const pasRa = PAS / Math.max(0.05, Math.cos((dec * Math.PI) / 180));
  for (let ra = -180 + pasRa / 2; ra < 180; ra += pasRa) {
    let niveau = 0;
    niveaux.forEach((anneaux, i) => { if (couvre(anneaux, ra, dec)) niveau = i + 1; });
    if (niveau) points.push(Math.round((((ra % 360) + 360) % 360) * 10), Math.round(dec * 10), niveau);
  }
}

mkdirSync('public/data/ciel', { recursive: true });
writeFileSync(SORTIE, JSON.stringify({ source: 'd3-celestial 0.7.35 (Olaf Frohn, BSD-3)', colonnes: ['ra', 'dec', 'niveau'], points }));
console.log(`${points.length / 3} points écrits dans ${SORTIE}`);
