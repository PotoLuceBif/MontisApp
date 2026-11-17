// Villes du jeu « Où est-ce ? » (lot P.4b) : public/data/jeux/villes.json.
// Source : lieux habités de Natural Earth 1/10 000 000 (domaine public).
// Monde : les capitales et les très grandes villes (rang 0 à 2 de Natural Earth, plus d'un million d'habitants).
// Par pays : ses villes principales (plus de 50 000 habitants, 30 au plus), pour les pays qui en ont au moins 8.
// Usage : node scripts/extraire-villes-jeu.mjs (après extraire-pays-jeu.mjs)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const ADRESSE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson';
const CACHE = 'scripts/cache-pays-villes10m-complet.geojson';
const MAX_PAR_PAYS = 30;
const MIN_PAR_PAYS = 8;
const POP_PAYS = 50000;
const DISTANCE_MIN = 45; // km entre deux villes d'un même pays
const distanceKm = ([a, b], [c, d]) => {
  const r = Math.PI / 180;
  const h = Math.sin(((d - b) * r) / 2) ** 2 + Math.cos(b * r) * Math.cos(d * r) * Math.sin(((c - a) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// Territoires rattachés à leur pays pour le jeu
const RATTACHES = { HK: 'CN', MO: 'CN' };
const A3 = { KOS: 'XK', TWN: 'TW', PSX: 'PS', FRA: 'FR', NOR: 'NO' };

if (!existsSync(CACHE)) await writeFile(CACHE, await (await fetch(ADRESSE)).text());
const lieux = JSON.parse(await readFile(CACHE, 'utf8')).features.map((f) => f.properties);
const pays = JSON.parse(await readFile('public/data/jeux/pays.json', 'utf8')).features.map((f) => f.properties);
const codes = new Set(pays.map((p) => p.code));

const codeDe = (v) => {
  const code = A3[v.ADM0_A3] || RATTACHES[v.ISO_A2] || v.ISO_A2;
  return codes.has(code) ? code : null;
};
const arrondi = (x) => Math.round(x * 100) / 100;

const villes = [];
const cle = new Map();
function ajouter({ fr, en, code, position, pop, capitale }) {
  const id = `${code}-${fr}`;
  if (cle.has(id)) return cle.get(id);
  const ville = { id: villes.length, fr, en, pays: code, position: position.map(arrondi), pop, ...(capitale ? { capitale: true } : {}) };
  villes.push(ville);
  cle.set(id, ville);
  return ville;
}

// Les capitales d'abord, avec les noms du quiz des capitales
for (const p of pays) {
  const lieu = lieux.find((v) => codeDe(v) === p.code && v.FEATURECLA === 'Admin-0 capital'
    && Math.abs(v.LONGITUDE - p.capitale.position[0]) < 0.3 && Math.abs(v.LATITUDE - p.capitale.position[1]) < 0.3);
  ajouter({ fr: p.capitale.fr, en: p.capitale.en, code: p.code, position: p.capitale.position, pop: lieu?.POP_MAX || 0, capitale: true });
}

const monde = new Set(villes.map((v) => v.id));
for (const v of lieux) {
  const code = codeDe(v);
  if (!code || v.SCALERANK > 2 || v.POP_MAX < 1e6) continue;
  const ville = ajouter({ fr: v.NAME_FR || v.NAME, en: v.NAME_EN || v.NAME, code, position: [v.LONGITUDE, v.LATITUDE], pop: v.POP_MAX });
  monde.add(ville.id);
}

const parPays = {};
for (const code of codes) {
  // Une ville de banlieue (Melun près de Paris) porte la population de l'agglomération : écartée si trop près d'une plus grande
  const retenues = [];
  for (const v of lieux.filter((l) => codeDe(l) === code && l.POP_MAX >= POP_PAYS).sort((a, b) => b.POP_MAX - a.POP_MAX)) {
    if (retenues.length >= MAX_PAR_PAYS) break;
    if (retenues.some((r) => distanceKm([r.LONGITUDE, r.LATITUDE], [v.LONGITUDE, v.LATITUDE]) < DISTANCE_MIN)) continue;
    retenues.push(v);
  }
  const candidates = retenues
    .map((v) => ajouter({ fr: v.NAME_FR || v.NAME, en: v.NAME_EN || v.NAME, code, position: [v.LONGITUDE, v.LATITUDE], pop: v.POP_MAX }).id);
  const capitale = villes.find((v) => v.pays === code && v.capitale).id;
  const liste = [...new Set([capitale, ...candidates])];
  if (liste.length >= MIN_PAR_PAYS) parPays[code] = liste;
}

await writeFile('public/data/jeux/villes.json', JSON.stringify({ villes, monde: [...monde], parPays }));
console.log(`${villes.length} villes, ${monde.size} pour le monde, ${Object.keys(parPays).length} pays jouables`);
