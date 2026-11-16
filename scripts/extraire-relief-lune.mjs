// Relief de la Lune en tuiles Terrain RGB (encodage Terrarium, par pas de PAS mètres), projection Mercator, 512 px, zoom 0 à 4 (1,3 km par pixel),
// pour la visite de la Lune (lot 4.10). Source : grille LOLA de la NASA à 64 pixels par degré (environ 470 m),
// `ldem_64.img` du PDS (domaine public), téléchargée une fois dans scripts/cache-lune-ldem64.img (530 Mo).
// Usage : node scripts/extraire-relief-lune.mjs
// Sortie : public/data/lune/relief/{z}/{x}/{y}.png, hors du préchargement du service worker.
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SOURCE = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_64.img';
const CACHE = new URL('./cache-lune-ldem64.img', import.meta.url);
const SORTIE = new URL('../public/data/lune/relief/', import.meta.url);
const PPD = 64;
const LARGEUR = 360 * PPD;
const HAUTEUR = 180 * PPD;
const ECHELLE = 0.5; // m par unité (étiquette du PDS)
const TUILE = 512;
const ZOOM_MAX = Number(process.env.ZOOM_MAX ?? 4);
// Altitude arrondie : à 470 m par pixel, un pas de quelques mètres ne se voit pas, et les tuiles pèsent bien moins
const PAS = Number(process.env.PAS ?? 8);

if (!existsSync(CACHE)) {
  console.log('Téléchargement de la grille LOLA (530 Mo)…');
  const reponse = await fetch(SOURCE);
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  await pipeline(Readable.fromWeb(reponse.body), createWriteStream(CACHE));
}
const brut = readFileSync(CACHE);
if (brut.length !== LARGEUR * HAUTEUR * 2) throw new Error(`Taille inattendue : ${brut.length}`);
const grille = new Float32Array(LARGEUR * HAUTEUR);
for (let i = 0; i < grille.length; i++) grille[i] = brut.readInt16LE(i * 2) * ECHELLE;

// Niveaux réduits (moyenne 2 × 2), pour ne pas créneler le relief aux petits zooms
const niveaux = [{ ppd: PPD, l: LARGEUR, h: HAUTEUR, d: grille }];
while (niveaux.at(-1).ppd > 1) {
  const p = niveaux.at(-1);
  const l = p.l / 2;
  const h = p.h / 2;
  const d = new Float32Array(l * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = 2 * y * p.l + 2 * x;
      d[y * l + x] = (p.d[i] + p.d[i + 1] + p.d[i + p.l] + p.d[i + p.l + 1]) / 4;
    }
  }
  niveaux.push({ ppd: p.ppd / 2, l, h, d });
}

// Altitude au point (bilinéaire) ; colonne 0 = 0° E, ligne 0 = 90° N
function altitude(niveau, lng, lat) {
  const { ppd, l, h, d } = niveau;
  const x = (((lng % 360) + 360) % 360) * ppd - 0.5;
  const y = Math.min(h - 1, Math.max(0, (90 - lat) * ppd - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const col = (c) => ((c % l) + l) % l;
  const y1 = Math.min(h - 1, y0 + 1);
  const a = d[y0 * l + col(x0)];
  const b = d[y0 * l + col(x0 + 1)];
  const c = d[y1 * l + col(x0)];
  const e = d[y1 * l + col(x0 + 1)];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}

// PNG RGB 8 bits, filtre choisi ligne par ligne
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const o of buf) c = CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function bloc(type, donnees) {
  const tete = Buffer.alloc(8);
  tete.writeUInt32BE(donnees.length, 0);
  tete.write(type, 4, 'ascii');
  const fin = Buffer.alloc(4);
  fin.writeUInt32BE(crc32(Buffer.concat([tete.subarray(4), donnees])), 0);
  return Buffer.concat([tete, donnees, fin]);
}
function png(rgb, cote) {
  const ligne = cote * 3;
  const sortie = Buffer.alloc((ligne + 1) * cote);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const essai = new Uint8Array(ligne);
  for (let y = 0; y < cote; y++) {
    let meilleur = null;
    let score = Infinity;
    for (const filtre of [1, 2, 4]) {
      let s = 0;
      for (let i = 0; i < ligne; i++) {
        const v = rgb[y * ligne + i];
        const a = i >= 3 ? rgb[y * ligne + i - 3] : 0;
        const b = y ? rgb[(y - 1) * ligne + i] : 0;
        const c = y && i >= 3 ? rgb[(y - 1) * ligne + i - 3] : 0;
        const r = (v - (filtre === 1 ? a : filtre === 2 ? b : paeth(a, b, c))) & 0xff;
        essai[i] = r;
        s += r < 128 ? r : 256 - r;
      }
      if (s < score) {
        score = s;
        meilleur = [filtre, Uint8Array.from(essai)];
      }
    }
    sortie[y * (ligne + 1)] = meilleur[0];
    sortie.set(meilleur[1], y * (ligne + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cote, 0);
  ihdr.writeUInt32BE(cote, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(sortie, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

if (existsSync(SORTIE)) rmSync(SORTIE, { recursive: true });
let total = 0;
let nombre = 0;
for (let z = 0; z <= ZOOM_MAX; z++) {
  const n = 2 ** z;
  // Niveau de la grille : au moins autant de pixels par degré que la tuile
  const besoin = (TUILE * n) / 360;
  const niveau = [...niveaux].reverse().find((v) => v.ppd >= besoin) ?? niveaux[0];
  for (let tx = 0; tx < n; tx++) {
    for (let ty = 0; ty < n; ty++) {
      const rgb = new Uint8Array(TUILE * TUILE * 3);
      for (let py = 0; py < TUILE; py++) {
        const my = (ty + (py + 0.5) / TUILE) / n;
        const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
        for (let px = 0; px < TUILE; px++) {
          const lng = ((tx + (px + 0.5) / TUILE) / n) * 360 - 180;
          const v = Math.round(altitude(niveau, lng, lat) / PAS) * PAS + 32768;
          const i = (py * TUILE + px) * 3;
          rgb[i] = (v >> 8) & 0xff;
          rgb[i + 1] = v & 0xff;
        }
      }
      const dossier = new URL(`${z}/${tx}/`, SORTIE);
      mkdirSync(dossier, { recursive: true });
      const fichier = new URL(`${ty}.png`, dossier);
      writeFileSync(fichier, png(rgb, TUILE));
      total += statSync(fichier).size;
      nombre++;
    }
  }
  console.log(`Zoom ${z} : grille à ${niveau.ppd} px/°, ${nombre} tuiles, ${(total / 1e6).toFixed(1)} Mo`);
}
