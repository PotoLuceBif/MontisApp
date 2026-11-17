// Pays du quiz de géographie (lot P.4a) : public/data/jeux/pays.json (contours et capitales) et public/data/jeux/drapeaux/.
// Capitales : lieux habités de Natural Earth 1/50 000 000 (domaine public).
// Contours : Natural Earth 1/50 000 000 (domaine public). Drapeaux : flag-icons (licence MIT), format 4:3.
// Usage : node scripts/extraire-pays-jeu.mjs [dossier/de/flag-icons]
//   (sans dossier : `npm pack flag-icons` dans un dossier temporaire, puis le chemin de son `package`)
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ADRESSE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const CACHE = 'scripts/cache-pays-ne50m.geojson';
const SORTIE = 'public/data/jeux';

// Les 193 membres de l'ONU, plus Kosovo, Taïwan, Palestine et Vatican (décision du propriétaire du 16 novembre 2026)
const ONU = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN
CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN
ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA
MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB
SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW`.split(/\s+/);
const EN_PLUS = ['XK', 'TW', 'PS', 'VA'];

// Entités Natural Earth réunies à un pays (ADM0_A3) ; les autres se trouvent par leur code à deux lettres
const ENTITES = {
  SO: ['SOM', 'SOL'], // Somaliland
  CY: ['CYP', 'CYN'], // Chypre du Nord
  FR: ['FRA'],
  NO: ['NOR'],
  AU: ['AUS'],
  XK: ['KOS'],
  TW: ['TWN'],
  PS: ['PSX'],
};

// Zones : continent de Natural Earth, Amériques réunies, avec quelques choix (pays à cheval)
const CONTINENTS = { Europe: 'europe', Asia: 'asie', Africa: 'afrique', Oceania: 'oceanie', 'North America': 'ameriques', 'South America': 'ameriques' };
const ZONES_FORCEES = {
  RU: ['europe', 'asie'],
  TR: ['europe', 'asie'],
  CY: ['europe', 'asie'],
  SC: ['afrique'],
  MU: ['afrique'],
  MV: ['asie'],
};

// Capitales : la ville « Admin-0 capital » des lieux habités de Natural Earth, sauf ces choix
// (nom anglais de Natural Earth, ou ville donnée en entier) ; `autres` : noms aussi acceptés à la saisie
const ADRESSE_VILLES = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places.geojson';
const CACHE_VILLES = 'scripts/cache-pays-villes50m.geojson';
const ADRESSE_10M = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const CACHE_10M = 'scripts/cache-pays-ne10m.geojson';
const CAPITALES = {
  BJ: { ville: 'Porto-Novo', autres: ['Cotonou'] },
  BO: { ville: 'Sucre', autres: ['La Paz'] },
  CL: { ville: 'Santiago' },
  CI: { ville: 'Yamoussoukro', autres: ['Abidjan'] },
  SZ: { ville: 'Mbabane', autres: ['Lobamba'] },
  IL: { ville: 'Jerusalem' },
  JP: { ville: 'Tokyo' },
  KZ: { ville: 'Nur-Sultan', fr: 'Astana', en: 'Astana', autres: ['Noursoultan', 'Nur-Sultan'] },
  MY: { ville: 'Kuala Lumpur', autres: ['Putrajaya'] },
  MA: { ville: 'Rabat' },
  MM: { ville: 'Naypyidaw', autres: ['Nay Pyi Taw'] },
  NL: { ville: 'Amsterdam' },
  NG: { ville: 'Abuja' },
  PH: { ville: 'Manila' },
  ZA: { ville: 'Pretoria', autres: ['Le Cap', 'Cape Town', 'Bloemfontein'] },
  LK: { ville: 'Sri Jayawardenepura Kotte', fr: 'Sri Jayawardenepura Kotte', autres: ['Kotte', 'Colombo'] },
  TZ: { ville: 'Dodoma' },
  UA: { ville: 'Kyiv', fr: 'Kyiv', autres: ['Kiev'] },
  BD: { ville: 'Dhaka', autres: ['Dhaka'] },
  NR: { fr: 'Yaren', en: 'Yaren', position: [166.92, -0.55] },
  // Siège du gouvernement ; Jérusalem-Est, capitale proclamée, est aussi acceptée
  PS: { fr: 'Ramallah', en: 'Ramallah', position: [35.2, 31.9], autres: ['Jérusalem-Est', 'East Jerusalem'] },
};

function capitaleDe(code, villes) {
  const choix = CAPITALES[code] || {};
  let ville = null;
  if (choix.ville) ville = villes.find((v) => v.NAME_EN === choix.ville && /^Admin-0 capital/.test(v.FEATURECLA));
  else if (!choix.position) {
    const a3 = ENTITES[code]?.[0];
    ville = villes.find((v) => v.FEATURECLA === 'Admin-0 capital' && (a3 ? v.ADM0_A3 === a3 : v.ISO_A2 === code));
  }
  if (!ville && !choix.position) throw new Error(`Capitale introuvable : ${code}`);
  const position = choix.position || [ville.LONGITUDE, ville.LATITUDE].map((v) => Math.round(v * 100) / 100);
  const fr = choix.fr || ville.NAME_FR;
  const en = choix.en || ville.NAME_EN;
  const autres = (choix.autres || []).filter((n) => n !== fr && n !== en);
  return { fr, en, position, ...(autres.length ? { autres } : {}) };
}

// Aire d'un anneau sur la sphère, en km²
function aireSphere(anneau) {
  const rad = Math.PI / 180;
  let s = 0;
  for (let i = 0; i < anneau.length - 1; i += 1) {
    const [l1, p1] = anneau[i];
    const [l2, p2] = anneau[i + 1];
    s += (l2 - l1) * rad * (2 + Math.sin(p1 * rad) + Math.sin(p2 * rad));
  }
  return Math.abs((s * 6371.0088 ** 2) / 2);
}

// Pays de moins de 1 000 km² : trop mal dessinés pour un calcul (Monaco à 18 km²), superficie du CIA World Factbook
// (domaine public), en km²
const SUPERFICIES_OFFICIELLES = {
  VA: 0.44, MC: 2, NR: 21, TV: 26, SM: 61, LI: 160, MH: 181, KN: 261, MV: 298, MT: 316, GD: 344, VC: 389, BB: 430,
  AG: 443, SC: 455, PW: 459, AD: 468, LC: 616, FM: 702, SG: 728, TO: 747, DM: 751, BH: 760, KI: 811, ST: 964,
};

// Sous-régions de Natural Earth corrigées : celles des « mers » rattachées à leur continent
const REGIONS_FORCEES = { SC: 'eastern-africa', MU: 'eastern-africa', MV: 'southern-asia' };

const aire = (anneau) => {
  let s = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) s += (anneau[j][0] + anneau[i][0]) * (anneau[j][1] - anneau[i][1]);
  return Math.abs(s / 2);
};

function centroide(anneau) {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const f = anneau[j][0] * anneau[i][1] - anneau[i][0] * anneau[j][1];
    x += (anneau[j][0] + anneau[i][0]) * f;
    y += (anneau[j][1] + anneau[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) return anneau[0];
  return [x / (3 * a), y / (3 * a)];
}

// Douglas-Peucker
function simplifier(points, tolerance) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let max = 0;
  let indice = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const long = Math.hypot(dx, dy) || 1e-12;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / long;
    if (d > max) { max = d; indice = i; }
  }
  if (max <= tolerance) return [a, b];
  return [...simplifier(points.slice(0, indice + 1), tolerance).slice(0, -1), ...simplifier(points.slice(indice), tolerance)];
}

if (!existsSync(CACHE)) await writeFile(CACHE, await (await fetch(ADRESSE)).text());
const entites = JSON.parse(await readFile(CACHE, 'utf8')).features;
if (!existsSync(CACHE_VILLES)) await writeFile(CACHE_VILLES, await (await fetch(ADRESSE_VILLES)).text());
const villes = JSON.parse(await readFile(CACHE_VILLES, 'utf8')).features.map((f) => f.properties);
if (!existsSync(CACHE_10M)) await writeFile(CACHE_10M, await (await fetch(ADRESSE_10M)).text());
const entites10 = JSON.parse(await readFile(CACHE_10M, 'utf8')).features;
const codes = [...ONU, ...EN_PLUS];
if (ONU.length !== 193 || new Set(codes).size !== 197) throw new Error(`Liste des pays : ${ONU.length} membres de l'ONU`);

const pays = [];
for (const code of codes) {
  const choisies = ENTITES[code]
    ? entites.filter((f) => ENTITES[code].includes(f.properties.ADM0_A3))
    : entites.filter((f) => f.properties.ISO_A2_EH === code);
  if (!choisies.length) throw new Error(`Pays introuvable : ${code}`);
  const principale = choisies[0].properties;

  // Anneaux extérieurs ; les trous (enclaves comme Saint-Marin dans l'Italie) restent des trous
  const polygones = choisies.flatMap(({ geometry: { type, coordinates } }) => (type === 'Polygon' ? [coordinates] : coordinates));
  const plusGrand = polygones.reduce((m, p) => (aire(p[0]) > aire(m[0]) ? p : m));
  const surface = aire(plusGrand[0]);
  const petit = surface < 0.3;
  const precision = surface < 0.05 ? 1000 : 100;
  const tolerance = Math.min(0.08, Math.max(0.002, Math.sqrt(surface) / 120));
  const aireMin = Math.min(surface * 0.02, 0.02);
  const arrondir = ([lng, lat]) => [Math.round(lng * precision) / precision, Math.round(lat * precision) / precision];
  const anneauSimple = (anneau) => {
    const ouvert = simplifier(anneau.slice(0, -1), tolerance).map(arrondir);
    return ouvert.length >= 3 ? [...ouvert, ouvert[0]] : null;
  };
  const coordonnees = polygones
    .filter((p) => p === plusGrand || aire(p[0]) >= aireMin)
    .map((p) => p.map(anneauSimple).filter(Boolean))
    .filter((p) => p.length && p[0]);

  // Emprise du plus grand morceau : la France métropolitaine, pas la Guyane
  const xs = plusGrand[0].map((c) => c[0]);
  const ys = plusGrand[0].map((c) => c[1]);
  const emprise = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 100) / 100);
  const centre = arrondir(centroide(plusGrand[0]));
  // Superficie sur les contours au 1/10 000 000 (le 1/50 000 000 donnait 12 km² à Monaco), territoires d'outre-mer
  // compris, comme les chiffres officiels
  const fins = ENTITES[code]
    ? entites10.filter((f) => ENTITES[code].includes(f.properties.ADM0_A3))
    : entites10.filter((f) => f.properties.ISO_A2_EH === code);
  const polygonesFins = (fins.length ? fins : choisies).flatMap(({ geometry: { type, coordinates } }) => (type === 'Polygon' ? [coordinates] : coordinates));
  const km2 = polygonesFins.reduce((s, [exterieur, ...trous]) => s + aireSphere(exterieur) - trous.reduce((t, trou) => t + aireSphere(trou), 0), 0);
  const superficie = SUPERFICIES_OFFICIELLES[code] ?? Number(km2.toPrecision(3));
  const region = REGIONS_FORCEES[code] || principale.SUBREGION.toLowerCase().replace(/[^a-z]+/g, '-');
  const zones = ZONES_FORCEES[code] || [CONTINENTS[principale.CONTINENT]];
  if (!zones[0]) throw new Error(`Continent inconnu pour ${code} : ${principale.CONTINENT}`);

  pays.push({
    type: 'Feature',
    id: pays.length,
    properties: { code, zones, region, superficie, centre, emprise, capitale: capitaleDe(code, villes), ...(petit ? { petit: true } : {}) },
    geometry: { type: 'MultiPolygon', coordinates: coordonnees },
  });
}

await mkdir(SORTIE, { recursive: true });
await writeFile(join(SORTIE, 'pays.json'), JSON.stringify({ type: 'FeatureCollection', features: pays }));

// Drapeaux
let dossierDrapeaux = process.argv[2];
if (dossierDrapeaux) {
  await rm(join(SORTIE, 'drapeaux'), { recursive: true, force: true });
  await mkdir(join(SORTIE, 'drapeaux'), { recursive: true });
  for (const code of codes) {
    const source = join(dossierDrapeaux, 'flags', '4x3', `${code.toLowerCase()}.svg`);
    await copyFile(source, join(SORTIE, 'drapeaux', `${code}.svg`));
  }
}
const parZone = {};
for (const p of pays) for (const z of p.properties.zones) parZone[z] = (parZone[z] || 0) + 1;
console.log(`${pays.length} pays`, parZone);
