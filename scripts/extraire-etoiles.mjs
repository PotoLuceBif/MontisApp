// Catalogue des étoiles visibles à l'œil nu (magnitude 6 et moins) pour le ciel du globe : 5 044 étoiles de
// d3-celestial (Olaf Frohn, licence BSD-3, données Hipparcos), réduites à quatre nombres chacune.
// Écrit public/data/ciel/etoiles.json. Les tracés des constellations viendront du même jeu de données.
// Usage : node scripts/extraire-etoiles.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/stars.6.json';
const SORTIE = 'public/data/ciel/etoiles.json';

const reponse = await fetch(SOURCE);
if (!reponse.ok) throw new Error(`HTTP ${reponse.status} pour ${SOURCE}`);
const { features } = await reponse.json();

// Ascension droite et déclinaison en centièmes de degré, magnitude et indice de couleur B−V en centièmes ;
// les plus brillantes d'abord, pour qu'un ciel allégé n'ait qu'à couper la liste
const etoiles = features
  .map((f) => {
    const [ra, dec] = f.geometry.coordinates;
    const bv = Number(f.properties.bv);
    return [
      Math.round((((ra % 360) + 360) % 360) * 100),
      Math.round(dec * 100),
      Math.round(f.properties.mag * 100),
      Number.isFinite(bv) ? Math.round(bv * 100) : 60,
    ];
  })
  .sort((a, b) => a[2] - b[2]);

mkdirSync('public/data/ciel', { recursive: true });
writeFileSync(SORTIE, JSON.stringify({
  source: 'd3-celestial 0.7.35 (Olaf Frohn, BSD-3), Hipparcos',
  colonnes: ['ra', 'dec', 'mag', 'bv'],
  etoiles: etoiles.flat(),
}));
console.log(`${etoiles.length} étoiles écrites dans ${SORTIE}`);
