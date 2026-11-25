// Fiches des pays de Géographie (retour du propriétaire du 17 novembre 2026) : public/data/jeux/fiches.json.
// - langues officielles, monnaies, voisins, accès à la mer : mledoze/countries (ODbL), la base de REST Countries,
//   dont l'API publique est fermée depuis 2026 ;
// - population et point culminant (nom, altitude, position) : Wikidata (CC0) ;
// - fuseaux horaires : zone.tab de la base IANA (domaine public), décalage d'hiver calculé par Intl.
// Anecdotes à part, écrites à la main : public/data/jeux/anecdotes.json.
// Usage : node scripts/extraire-fiches-pays.mjs (réseau requis ; caches dans scripts/cache-fiches-*.json)
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PAYS = 'public/data/jeux/pays.json';
const SORTIE = 'public/data/jeux/fiches.json';
const AGENT = 'Montis-extraction/1.0 (script de données)';
const SOURCES = {
  mledoze: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
  zones: 'https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab',
  wikidata: 'https://query.wikidata.org/sparql',
};

async function enCache(nom, charger) {
  const chemin = `scripts/cache-fiches-${nom}.json`;
  if (existsSync(chemin)) return JSON.parse(await readFile(chemin, 'utf8'));
  const donnees = await charger();
  await writeFile(chemin, JSON.stringify(donnees));
  return donnees;
}
async function texte(adresse) {
  const reponse = await fetch(adresse, { headers: { 'User-Agent': AGENT } });
  if (!reponse.ok) throw new Error(`${adresse} : HTTP ${reponse.status}`);
  return reponse.text();
}
async function sparql(requete) {
  const adresse = `${SOURCES.wikidata}?query=${encodeURIComponent(requete)}`;
  const reponse = await fetch(adresse, { headers: { 'User-Agent': AGENT, Accept: 'application/sparql-results+json' } });
  if (!reponse.ok) throw new Error(`Wikidata : HTTP ${reponse.status}`);
  return (await reponse.json()).results.bindings.map((ligne) => Object.fromEntries(Object.entries(ligne).map(([k, v]) => [k, v.value])));
}

const codes = JSON.parse(await readFile(PAYS, 'utf8')).features.map((f) => f.properties.code);
const voulus = new Set(codes);

const mledoze = await enCache('mledoze', async () => JSON.parse(await texte(SOURCES.mledoze)));
const parCca3 = new Map(mledoze.map((p) => [p.cca3, p.cca2]));
// Kosovo : « XKX » dans mledoze, sans code ISO officiel
const fiche = (code) => mledoze.find((p) => p.cca2 === code);

// « Point(6.8652 45.8326) » de Wikidata → { lng, lat }, arrondis à 0,001° (100 m)
const position = (wkt) => {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt ?? '');
  return m ? { lng: Math.round(Number(m[1]) * 1000) / 1000, lat: Math.round(Number(m[2]) * 1000) / 1000 } : {};
};

// Population : la valeur la plus récente ; point culminant : le plus haut si plusieurs
const population = await enCache('population', () => sparql(`
  SELECT ?iso ?pop ?date WHERE {
    ?pays wdt:P297 ?iso; wdt:P31/wdt:P279* wd:Q6256; p:P1082 ?declaration.
    ?declaration ps:P1082 ?pop; wikibase:rank ?rang.
    FILTER(?rang != wikibase:DeprecatedRank)
    OPTIONAL { ?declaration pq:P585 ?date }
  }`));
const populationKosovo = await enCache('population-kosovo', () => sparql(`
  SELECT ?pop ?date WHERE { wd:Q1246 p:P1082 ?d. ?d ps:P1082 ?pop. OPTIONAL { ?d pq:P585 ?date } }`));
// Position du sommet (P625) : la petite montagne sur la fiche du pays (demande du propriétaire du 25 novembre 2026)
const sommets = await enCache('sommets-2', () => sparql(`
  SELECT ?iso ?pays ?sommet ?fr ?en ?alt ?coord WHERE {
    VALUES ?pays { ${codes.map((c) => `"${c}"`).join(' ')} }
    ?entite wdt:P297 ?pays; wdt:P610 ?sommet.
    BIND(?pays AS ?iso)
    ?sommet wdt:P2044 ?alt.
    OPTIONAL { ?sommet wdt:P625 ?coord }
    OPTIONAL { ?sommet rdfs:label ?fr FILTER(LANG(?fr) = "fr") }
    OPTIONAL { ?sommet rdfs:label ?en FILTER(LANG(?en) = "en") }
  }`));
const sommetKosovo = await enCache('sommet-kosovo-2', () => sparql(`
  SELECT ?fr ?en ?alt ?coord WHERE { wd:Q1246 wdt:P610 ?s. ?s wdt:P2044 ?alt. OPTIONAL { ?s wdt:P625 ?coord }
    OPTIONAL { ?s rdfs:label ?fr FILTER(LANG(?fr) = "fr") } OPTIONAL { ?s rdfs:label ?en FILTER(LANG(?en) = "en") } }`));

const zoneTab = await enCache('zones', async () => (await texte(SOURCES.zones)).split('\n'));
// zone1970.tab : « codes pays » séparés par des virgules, puis la zone IANA
const zonesPays = new Map();
for (const ligne of zoneTab) {
  if (!ligne || ligne.startsWith('#')) continue;
  const [liste, , zone] = ligne.split('\t');
  for (const code of liste.split(',')) {
    if (!zonesPays.has(code)) zonesPays.set(code, []);
    zonesPays.get(code).push(zone);
  }
}
// Décalage d'hiver (heure normale) en minutes : le plus petit de janvier et juillet
function decalage(zone) {
  const minutes = (date) => {
    const parties = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(date);
    const valeur = parties.find((p) => p.type === 'timeZoneName').value; // « GMT+05:30 » ou « GMT »
    const m = valeur.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  return Math.min(minutes(new Date(Date.UTC(2026, 0, 15))), minutes(new Date(Date.UTC(2026, 6, 15))));
}
// Pays sans ligne propre dans zone1970.tab (fusionnés avec un voisin) : la zone de leur capitale
const ZONES_MANQUANTES = {
  AD: ['Europe/Andorra'], AG: ['America/Puerto_Rico'], BA: ['Europe/Belgrade'], BJ: ['Africa/Lagos'], BF: ['Africa/Abidjan'],
  BW: ['Africa/Maputo'], BI: ['Africa/Maputo'], CM: ['Africa/Lagos'], CF: ['Africa/Lagos'], KM: ['Africa/Nairobi'],
  CG: ['Africa/Lagos'], CD: ['Africa/Lagos', 'Africa/Maputo'], DJ: ['Africa/Nairobi'], DM: ['America/Puerto_Rico'],
  GQ: ['Africa/Lagos'], ER: ['Africa/Nairobi'], ET: ['Africa/Nairobi'], GA: ['Africa/Lagos'], GM: ['Africa/Abidjan'],
  GD: ['America/Puerto_Rico'], GN: ['Africa/Abidjan'], HR: ['Europe/Belgrade'], KW: ['Asia/Riyadh'], LA: ['Asia/Bangkok'],
  LS: ['Africa/Johannesburg'], LI: ['Europe/Zurich'], LU: ['Europe/Brussels'], MG: ['Africa/Nairobi'], MW: ['Africa/Maputo'],
  ML: ['Africa/Abidjan'], MR: ['Africa/Abidjan'], MC: ['Europe/Paris'], ME: ['Europe/Belgrade'], MK: ['Europe/Belgrade'],
  NE: ['Africa/Lagos'], OM: ['Asia/Dubai'], RW: ['Africa/Maputo'], KN: ['America/Puerto_Rico'], LC: ['America/Puerto_Rico'],
  VC: ['America/Puerto_Rico'], SM: ['Europe/Rome'], SN: ['Africa/Abidjan'], SL: ['Africa/Abidjan'], SI: ['Europe/Belgrade'],
  SK: ['Europe/Prague'], SO: ['Africa/Nairobi'], SZ: ['Africa/Johannesburg'], TZ: ['Africa/Nairobi'], TG: ['Africa/Abidjan'],
  UG: ['Africa/Nairobi'], VA: ['Europe/Rome'], YE: ['Asia/Riyadh'], ZM: ['Africa/Maputo'], ZW: ['Africa/Maputo'],
  XK: ['Europe/Belgrade'], AO: ['Africa/Lagos'], BH: ['Asia/Qatar'], KH: ['Asia/Bangkok'], VN: ['Asia/Ho_Chi_Minh'],
  NO: ['Europe/Berlin'], SE: ['Europe/Berlin'], DK: ['Europe/Berlin'], IS: ['Africa/Abidjan'], ST: ['Africa/Sao_Tome'],
};

const dernier = (lignes) => lignes.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || Number(b.pop) - Number(a.pop))[0];
const sortie = {};
const manques = [];
for (const code of codes) {
  const m = code === 'XK' ? mledoze.find((p) => p.cca3 === 'UNK' || p.cca2 === 'XK') : fiche(code);
  if (!m) manques.push(`${code} : mledoze`);
  const pop = code === 'XK' ? dernier(populationKosovo) : dernier(population.filter((l) => l.iso === code));
  if (!pop) manques.push(`${code} : population`);
  const sommetsPays = code === 'XK' ? sommetKosovo : sommets.filter((l) => l.iso === code);
  const sommet = sommetsPays.sort((a, b) => Number(b.alt) - Number(a.alt))[0];
  if (!sommet) manques.push(`${code} : sommet`);
  const zones = zonesPays.get(code) ?? ZONES_MANQUANTES[code] ?? [];
  if (!zones.length) manques.push(`${code} : fuseau`);
  const fuseaux = [...new Set(zones.map(decalage))].sort((a, b) => a - b);
  sortie[code] = {
    population: pop ? Number(pop.pop) : null,
    annee: pop?.date ? Number(pop.date.slice(0, 4)) : null,
    sommet: sommet ? { fr: sommet.fr ?? sommet.en, en: sommet.en ?? sommet.fr, altitude: Math.round(Number(sommet.alt)), ...position(sommet.coord) } : null,
    langues: m ? Object.entries(m.languages ?? {}).map(([c, nom]) => ({ code: c, en: nom })) : [],
    monnaies: m ? Object.entries(m.currencies ?? {}).map(([c, v]) => ({ code: c, en: v.name, symbole: v.symbol ?? '' })) : [],
    fuseaux,
    voisins: m ? (m.borders ?? []).map((c3) => parCca3.get(c3) ?? (c3 === 'UNK' ? 'XK' : null)).filter((c) => voulus.has(c)) : [],
    mer: m ? !m.landlocked : null,
  };
}
// Corrections relues : populations de Wikidata trop anciennes (estimations de l'ONU, World Population Prospects
// 2024), point culminant sans nom de la Gambie, langues officielles de l'Union indienne
const CORRECTIONS = {
  IN: { population: 1450935791, annee: 2024, langues: [{ code: 'hin', en: 'Hindi' }, { code: 'eng', en: 'English' }] },
  NL: { population: 18228742, annee: 2024 },
  GM: { sommet: { fr: 'point sans nom', en: 'unnamed point', altitude: 53 } },
};
for (const [code, valeurs] of Object.entries(CORRECTIONS)) Object.assign(sortie[code], valeurs);
// Le Kosovo manque des voisins de ses voisins dans mledoze : la relation est rendue symétrique
for (const [code, f] of Object.entries(sortie)) {
  for (const voisin of f.voisins) if (!sortie[voisin].voisins.includes(code)) sortie[voisin].voisins.push(code);
}
await writeFile(SORTIE, `${JSON.stringify(sortie)}\n`);
console.log(`${codes.length} fiches écrites dans ${SORTIE}`);
if (manques.length) console.log(`Manques :\n  ${manques.join('\n  ')}`);
