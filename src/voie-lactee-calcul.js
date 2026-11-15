// Voie lactée autour du globe : une carte du ciel en coordonnées galactiques (longitude l, latitude b),
// générée sur l'appareil (bande, bulbe vers le Sagittaire, nuages d'étoiles, Grand Rift et poussières, nébuleuses),
// puis peinte à sa vraie place vue depuis la caméra. Les galaxies voisines sont à part (galaxies-calcul.js).
// Volontairement un peu plus marquée que dans un ciel réel, puisqu'on la voit « depuis l'espace ».
// Calculs purs, testés.
const RAD = Math.PI / 180;

// Équatorial J2000 → galactique (IAU)
const G = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];

export function equatorialVersGalactique(ra, dec) {
  const x = Math.cos(dec * RAD) * Math.cos(ra * RAD);
  const y = Math.cos(dec * RAD) * Math.sin(ra * RAD);
  const z = Math.sin(dec * RAD);
  const gx = G[0] * x + G[1] * y + G[2] * z;
  const gy = G[3] * x + G[4] * y + G[5] * z;
  const gz = G[6] * x + G[7] * y + G[8] * z;
  return { l: ((Math.atan2(gy, gx) / RAD) + 360) % 360, b: Math.asin(Math.max(-1, Math.min(1, gz))) / RAD };
}

export function galactiqueVersEquatorial(l, b) {
  const x = Math.cos(b * RAD) * Math.cos(l * RAD);
  const y = Math.cos(b * RAD) * Math.sin(l * RAD);
  const z = Math.sin(b * RAD);
  // Matrice orthogonale : l'inverse est la transposée
  const ex = G[0] * x + G[3] * y + G[6] * z;
  const ey = G[1] * x + G[4] * y + G[7] * z;
  const ez = G[2] * x + G[5] * y + G[8] * z;
  return { ra: ((Math.atan2(ey, ex) / RAD) + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, ez))) / RAD };
}

// Passage d'un rayon de la caméra (x à droite, y en haut de l'écran, z devant) aux coordonnées galactiques,
// pour la caméra de `projeterSoleil` (soleil-ciel-calcul.js), vue depuis (lat, lng) au temps sidéral `ts`.
// Renvoie la matrice (9 nombres) et le centre et la focale de la perspective, en pixels CSS.
export function matriceCiel({ bearing, pitch, fov, largeur, hauteurEcran, padding = {} }, lat, lng, ts) {
  const p = pitch * RAD;
  const c = bearing * RAD;
  const phi = lat * RAD;
  const theta = (ts + lng) * RAD;
  const versGalactique = ([x, y, z]) => {
    // Caméra → est, nord, haut
    const nord1 = y * Math.cos(p) + z * Math.sin(p);
    const haut = y * Math.sin(p) - z * Math.cos(p);
    const est = x * Math.cos(c) + nord1 * Math.sin(c);
    const nord = nord1 * Math.cos(c) - x * Math.sin(c);
    // → angle horaire, puis équatorial
    const X = haut * Math.cos(phi) - nord * Math.sin(phi);
    const Y = -est;
    const Z = nord * Math.cos(phi) + haut * Math.sin(phi);
    const ex = X * Math.cos(theta) + Y * Math.sin(theta);
    const ey = X * Math.sin(theta) - Y * Math.cos(theta);
    return [G[0] * ex + G[1] * ey + G[2] * Z, G[3] * ex + G[4] * ey + G[5] * Z, G[6] * ex + G[7] * ey + G[8] * Z];
  };
  const [a, b, d] = [versGalactique([1, 0, 0]), versGalactique([0, 1, 0]), versGalactique([0, 0, 1])];
  const { top = 0, bottom = 0, left = 0, right = 0 } = padding;
  return {
    m: [a[0], b[0], d[0], a[1], b[1], d[1], a[2], b[2], d[2]],
    cx: left + (largeur - left - right) / 2,
    cy: top + (hauteurEcran - top - bottom) / 2,
    focale: hauteurEcran / 2 / Math.tan((fov * RAD) / 2),
  };
}

// Coordonnées galactiques (°) du point d'écran (sx, sy), en pixels CSS
export function ecranVersGalactique(sx, sy, { m, cx, cy, focale }) {
  const x = (sx - cx) / focale;
  const y = -(sy - cy) / focale;
  const n = Math.hypot(x, y, 1);
  const gx = m[0] * x + m[1] * y + m[2];
  const gy = m[3] * x + m[4] * y + m[5];
  const gz = m[6] * x + m[7] * y + m[8];
  return { l: ((Math.atan2(gy, gx) / RAD) + 360) % 360, b: Math.asin(Math.max(-1, Math.min(1, gz / n))) / RAD };
}

// Bruit de valeur 3D, lissé, sur la sphère (sans couture à l = 0 ni déformation aux pôles)
// Table de permutation fixe : la même Voie lactée sur tous les appareils
const PERM = new Uint8Array(512);
const VALEURS = new Float32Array(256);
{
  let graine = 2463534242;
  const alea = () => {
    graine ^= graine << 13; graine ^= graine >>> 17; graine ^= graine << 5;
    return (graine >>> 0) / 4294967296;
  };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const k = Math.floor(alea() * (i + 1));
    [p[i], p[k]] = [p[k], p[i]];
  }
  for (let i = 0; i < 512; i += 1) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i += 1) VALEURS[i] = alea();
}
const lisser = (t) => t * t * (3 - 2 * t);
function bruit(x, y, z) {
  const fx0 = Math.floor(x);
  const fy0 = Math.floor(y);
  const fz0 = Math.floor(z);
  const ix = fx0 & 255;
  const iy = fy0 & 255;
  const iz = fz0 & 255;
  const fx = lisser(x - fx0);
  const fy = lisser(y - fy0);
  const fz = lisser(z - fz0);
  const a = PERM[ix] + iy;
  const b = PERM[ix + 1] + iy;
  const a0 = PERM[a] + iz;
  const a1 = PERM[a + 1] + iz;
  const b0 = PERM[b] + iz;
  const b1 = PERM[b + 1] + iz;
  const x00 = VALEURS[PERM[a0]] + (VALEURS[PERM[b0]] - VALEURS[PERM[a0]]) * fx;
  const x10 = VALEURS[PERM[a1]] + (VALEURS[PERM[b1]] - VALEURS[PERM[a1]]) * fx;
  const x01 = VALEURS[PERM[a0 + 1]] + (VALEURS[PERM[b0 + 1]] - VALEURS[PERM[a0 + 1]]) * fx;
  const x11 = VALEURS[PERM[a1 + 1]] + (VALEURS[PERM[b1 + 1]] - VALEURS[PERM[a1 + 1]]) * fx;
  const y0 = x00 + (x10 - x00) * fy;
  const y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}
export function fbm(x, y, z, octaves, graine) {
  let somme = 0;
  let amp = 1;
  let total = 0;
  let f = 1;
  for (let o = 0; o < octaves; o += 1) {
    // Chaque champ et chaque octave décalés : des bruits indépendants avec la même table
    const d = graine * 17.31 + o * 41.7;
    somme += amp * bruit(x * f + d, y * f + d * 0.7, z * f - d * 1.3);
    total += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return somme / total;
}

const ecartL = (l, l0) => ((((l - l0) % 360) + 540) % 360) - 180;
// Tache gaussienne autour de (l0, b0), largeurs en degrés
const tache = (l, b, l0, b0, sl, sb = sl) => {
  const dl = ecartL(l, l0) * Math.cos(b * RAD);
  const db = b - b0;
  return Math.exp(-0.5 * ((dl / sl) ** 2 + (db / sb) ** 2));
};
const entre = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const COEUR = [246, 184, 128]; // orangé doux
const BANDE = [176, 186, 214]; // gris bleuté, pas blanc
const NEBULEUSE = [236, 150, 112]; // à peine rosé, fondu dans l'orangé

// Lumière et couleur du ciel en (l, b) : { r, v, b (0-255), a (0-1) }
export function pixelVoieLactee(l, b) {
  const lc = ecartL(l, 0);
  const cl = Math.cos(b * RAD);
  const px = cl * Math.cos(l * RAD);
  const py = cl * Math.sin(l * RAD);
  const pz = Math.sin(b * RAD);
  const centre = Math.exp(-((lc / 60) ** 2));
  const sigma = 3.4 + 4.8 * centre;
  // Bande, halo plus large, bulbe et nuages d'étoiles (Sagittaire, Écu, Cygne, Carène)
  const bande = (0.26 + 0.74 * centre) * Math.exp(-0.5 * (b / sigma) ** 2);
  const halo = 0.12 * (0.35 + 0.65 * centre) * Math.exp(-0.5 * (b / (sigma * 3.2)) ** 2);
  const bulbe = 0.8 * Math.exp(-0.5 * ((lc / 9) ** 2 + (b / 5) ** 2));
  const nuages = 0.55 * tache(l, b, 2, -5, 4, 3.2) + 0.45 * tache(l, b, 27, -2.5, 3, 2.4)
    + 0.32 * tache(l, b, 76, 1, 6, 3.5) + 0.36 * tache(l, b, 287, -1, 7, 3.5);
  const proche = bande + halo + bulbe + nuages;
  let lumiere = 0;
  let r = 0;
  let v = 0;
  let bl = 0;
  if (proche > 0.004) {
    const n1 = fbm(px * 5, py * 5, pz * 5, 5, 11);
    const grain = fbm(px * 40, py * 40, pz * 40, 2, 5);
    lumiere = proche * (0.2 + 1.7 * n1 ** 2) * (0.82 + 0.36 * grain);
    // Poussières : nuages sombres déchiquetés et quelques filaments, Grand Rift, plan médian,
    // Ophiuchus, Sac à Charbon ; seulement près du plan, où elles se voient
    const plan = Math.exp(-0.5 * (b / (sigma * 1.3)) ** 2);
    let tau = 1.3 * (tache(l, b, 353, 16, 2.2, 1.6) + tache(l, b, 357, 11, 1.8, 2) + tache(l, b, 1, 7, 1.6, 1.8))
      + 2.2 * tache(l, b, 301, -1, 2.4, 2);
    if (plan > 0.02) {
      const n2 = fbm(px * 7 + 3, py * 7, pz * 7, 5, 23);
      // Bruit déformé par n2 : contours organiques plutôt que des vers réguliers
      const d = (n2 - 0.5) * 1.2;
      const crete = 1 - Math.abs(2 * fbm(px * 7 + d, py * 7 - d, pz * 7 + d, 4, 41) - 1);
      tau += plan * (2 * entre(0.52, 0.78, n2) + 1.1 * crete ** 3 * entre(0.42, 0.68, n2));
      // Fins filaments, visibles de près
      const fin = 1 - Math.abs(2 * fbm(px * 21 - d, py * 21 + d, pz * 21, 3, 67) - 1);
      tau += 1.5 * plan * fin ** 5 * entre(0.32, 0.6, n2);
      const rift = entre(-12, 2, lc) * (1 - entre(78, 92, lc));
      const milieu = 1.4 + 0.025 * (lc - 35) + 2.6 * (n2 - 0.5);
      tau += 2.8 * rift * Math.exp(-0.5 * ((b - milieu) / (1.1 + 1.2 * centre)) ** 2) * entre(0.3, 0.6, n2 + 0.1);
      tau += 0.9 * (0.3 + centre) * Math.exp(-0.5 * (b / 1.1) ** 2) * n2;
    }
    const transmis = Math.exp(-tau);
    lumiere *= transmis;
    const chaud = Math.min(1, (bulbe + 0.6 * nuages) / (proche + 1e-6) + 0.55 * centre);
    // Le rougissement des poussières tire la lumière restante vers le brun
    const rougi = 1 - transmis;
    r = (BANDE[0] + (COEUR[0] - BANDE[0]) * chaud) * (1 - 0.03 * rougi);
    v = (BANDE[1] + (COEUR[1] - BANDE[1]) * chaud) * (1 - 0.1 * rougi);
    bl = (BANDE[2] + (COEUR[2] - BANDE[2]) * chaud) * (1 - 0.22 * rougi);
    // Nébuleuses rosées : quelques régions connues, et un semis discret dans le plan
    const n3 = Math.abs(b) < 7 ? fbm(px * 22, py * 22, pz * 22, 3, 59) : 0;
    const rose = 0.3 * Math.min(1, 0.9 * tache(l, b, 6, -1.2, 0.9) + 0.8 * tache(l, b, 287.6, -0.6, 1.4)
      + 0.55 * tache(l, b, 85, -1, 1.8) + 0.4 * tache(l, b, 209, -19.4, 1.2)
      + 0.7 * Math.exp(-0.5 * (b / 2) ** 2) * Math.max(0, n3 - 0.6) * transmis);
    r += (NEBULEUSE[0] - r) * rose;
    v += (NEBULEUSE[1] - v) * rose;
    bl += (NEBULEUSE[2] - bl) * rose;
    lumiere += 0.04 * rose;
  }
  // Les galaxies voisines (Andromède, Magellan…) sont dessinées à part : galaxies-calcul.js
  return { r, v, b: bl, a: 0.7 * Math.min(1, 1 - Math.exp(-1.6 * lumiere ** 1.6)) };
}

// Carte du ciel entière (équirectangulaire : l de 0 à 360° en largeur, b de +90 à −90° en hauteur), RGBA.
// `ligneDebut` et `ligneFin` permettent de la calculer par morceaux.
export function genererVoieLactee(largeur, hauteur, pixels = new Uint8ClampedArray(largeur * hauteur * 4), ligneDebut = 0, ligneFin = hauteur) {
  for (let j = ligneDebut; j < ligneFin; j += 1) {
    const b = 90 - ((j + 0.5) * 180) / hauteur;
    for (let i = 0; i < largeur; i += 1) {
      const l = ((i + 0.5) * 360) / largeur;
      const p = pixelVoieLactee(l, b);
      const k = (j * largeur + i) * 4;
      pixels[k] = p.r;
      pixels[k + 1] = p.v;
      pixels[k + 2] = p.b;
      pixels[k + 3] = p.a * 255;
    }
  }
  return pixels;
}

// Petites étoiles faibles, semées selon la lumière de la carte : le grain « résolu » de la Voie lactée.
// Renvoie un tableau plat [x, y, z, éclat (0-1)] : direction galactique unitaire, triée par éclat croissant
// (le dessin change de couleur moins souvent). `alea` : générateur dans [0, 1)
export function semerEtoiles(texture, largeur, hauteur, nombre, alea = Math.random) {
  const liste = [];
  for (let essai = 0; liste.length < nombre && essai < nombre * 60; essai += 1) {
    // Tirage uniforme sur la sphère, gardé selon la lumière (alpha) de la carte
    const z = 2 * alea() - 1;
    const l = alea() * 2 * Math.PI;
    const b = Math.asin(z);
    const i = Math.min(largeur - 1, Math.floor((l / (2 * Math.PI)) * largeur));
    const j = Math.min(hauteur - 1, Math.floor(((Math.PI / 2 - b) / Math.PI) * hauteur));
    const a = texture[(j * largeur + i) * 4 + 3] / 255;
    if (alea() > a ** 0.7 * 0.97 + 0.02) continue;
    const r = Math.sqrt(1 - z * z);
    liste.push([r * Math.cos(l), r * Math.sin(l), z, 0.2 + 0.8 * alea() ** 2.5]);
  }
  liste.sort((p, q) => p[3] - q[3]);
  return Float32Array.from(liste.flat());
}

// Point d'écran (pixels CSS) d'une direction galactique unitaire (x, y, z) ; null derrière la caméra
export function projeterGalactique(x, y, z, { m, cx, cy, focale }) {
  // La matrice est orthogonale : la transposée ramène du galactique à la caméra
  const vx = m[0] * x + m[3] * y + m[6] * z;
  const vy = m[1] * x + m[4] * y + m[7] * z;
  const vz = m[2] * x + m[5] * y + m[8] * z;
  if (vz <= 1e-6) return null;
  return { x: cx + (focale * vx) / vz, y: cy - (focale * vy) / vz };
}

// Peint la carte du ciel dans `sortie` (RGBA, `l` × `h` pixels, chacun couvrant `pas` pixels CSS),
// lue avec un filtrage bilinéaire. `ciel` : résultat de `matriceCiel`.
export function peindreVoieLactee(sortie, l, h, pas, ciel, texture, largeur, hauteur) {
  const { m, cx, cy, focale } = ciel;
  const kl = largeur / (2 * Math.PI);
  const kh = hauteur / Math.PI;
  for (let j = 0; j < h; j += 1) {
    const y = -((j + 0.5) * pas - cy) / focale;
    for (let i = 0; i < l; i += 1) {
      const x = ((i + 0.5) * pas - cx) / focale;
      const gx = m[0] * x + m[1] * y + m[2];
      const gy = m[3] * x + m[4] * y + m[5];
      const gz = m[6] * x + m[7] * y + m[8];
      const n = Math.sqrt(x * x + y * y + 1);
      let u = Math.atan2(gy, gx) * kl - 0.5;
      if (u < 0) u += largeur;
      const w = (Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, gz / n)))) * kh - 0.5;
      const i0 = Math.floor(u);
      const j0 = Math.max(0, Math.min(hauteur - 2, Math.floor(w)));
      const fu = u - i0;
      const fw = Math.max(0, Math.min(1, w - j0));
      const a0 = i0 % largeur;
      const a1 = (i0 + 1) % largeur;
      const k00 = (j0 * largeur + a0) * 4;
      const k10 = (j0 * largeur + a1) * 4;
      const k01 = ((j0 + 1) * largeur + a0) * 4;
      const k11 = ((j0 + 1) * largeur + a1) * 4;
      const o = (j * l + i) * 4;
      for (let c = 0; c < 4; c += 1) {
        const haut = texture[k00 + c] + (texture[k10 + c] - texture[k00 + c]) * fu;
        const bas = texture[k01 + c] + (texture[k11 + c] - texture[k01 + c]) * fu;
        sortie[o + c] = haut + (bas - haut) * fw;
      }
    }
  }
  return sortie;
}
