// Noms des lieux de la Lune pour sa visite (lot 4.10) : gazetteer de l'IAU, tenu par l'USGS (domaine public).
// Usage : node scripts/extraire-noms-lune.mjs
// Sortie : public/data/lune/noms.json, tableau de [nom, code, diamètre en km, longitude, latitude, origine].
// Les « cratères satellites » (Copernicus A…), plus de 7 000, sont écartés : ils encombreraient la carte.
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SOURCE = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip';
const CACHE = new URL('./cache-lune-noms.zip', import.meta.url);
const SORTIE = new URL('../public/data/lune/noms.json', import.meta.url);

if (!existsSync(CACHE)) {
  console.log('Téléchargement du gazetteer (24 Mo)…');
  const reponse = await fetch(SOURCE);
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  await pipeline(Readable.fromWeb(reponse.body), createWriteStream(CACHE));
}

// Fichier .dbf de l'archive, lu par son répertoire central
function extraire(zip, suffixe) {
  let fin = zip.length - 22;
  while (zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  let p = zip.readUInt32LE(fin + 16);
  for (let i = 0; i < zip.readUInt16LE(fin + 10); i++) {
    const methode = zip.readUInt16LE(p + 10);
    const taille = zip.readUInt32LE(p + 20);
    const lNom = zip.readUInt16LE(p + 28);
    const lExtra = zip.readUInt16LE(p + 30);
    const lComm = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nom = zip.toString('utf8', p + 46, p + 46 + lNom);
    if (nom.toLowerCase().endsWith(suffixe)) {
      const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const donnees = zip.subarray(debut, debut + taille);
      return methode === 0 ? donnees : inflateRawSync(donnees);
    }
    p += 46 + lNom + lExtra + lComm;
  }
  throw new Error(`${suffixe} absent de l'archive`);
}

const dbf = extraire(readFileSync(CACHE), '.dbf');
const nombre = dbf.readUInt32LE(4);
const entete = dbf.readUInt16LE(8);
const longueur = dbf.readUInt16LE(10);
const champs = [];
for (let o = 32; dbf[o] !== 0x0d; o += 32) champs.push([dbf.toString('latin1', o, o + 11).replace(/\0.*/, ''), dbf[o + 16]]);

const lieux = [];
for (let r = 0; r < nombre; r++) {
  let p = entete + 1 + r * longueur;
  const f = {};
  for (const [nom, l] of champs) {
    f[nom] = dbf.toString('utf8', p, p + l).trim();
    p += l;
  }
  if (f.type === 'Satellite Feature') continue;
  const lng = ((Number(f.center_lon) + 180) % 360 + 360) % 360 - 180;
  lieux.push([
    f.name || f.clean_name,
    f.code,
    Math.round(Number(f.diameter) * 10) / 10,
    Math.round(lng * 1000) / 1000,
    Math.round(Number(f.center_lat) * 1000) / 1000,
    f.origin.replace(/\s+/g, ' '),
  ]);
}
lieux.sort((a, b) => b[2] - a[2]);
mkdirSync(new URL('.', SORTIE), { recursive: true });
writeFileSync(SORTIE, JSON.stringify(lieux));
console.log(`${lieux.length} lieux, ${(readFileSync(SORTIE).length / 1024).toFixed(0)} Ko`);
