// Calculs purs des couches de pente et d'orientation : grille d'altitudes → couleurs d'une tuile.
// Chargé au démarrage avec le panneau Relief : il ne doit dépendre d'aucun module chargé à la demande.

const CIRCONFERENCE = 2 * Math.PI * 6378137;
const deg = (radians) => (radians * 180) / Math.PI;

// Taille d'un pixel de tuile 256 px au zoom donné, en mètres sur le terrain
export function taillePixel(latitude, zoom) {
  return (CIRCONFERENCE * Math.cos((latitude * Math.PI) / 180)) / (256 * 2 ** zoom);
}

// 45° = 100 % : tangente de l'angle × 100
export const pourcentagePente = (degres) => Math.tan((degres * Math.PI) / 180) * 100;

// Latitude du bord nord d'une ligne de pixels du monde (Web Mercator) au zoom donné
export function latitudePixel(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / (256 * 2 ** zoom);
  return deg(Math.atan(Math.sinh(n)));
}

// Altitudes « terrarium » d'une image RGBA : R × 256 + G + B / 256 − 32768
export function altitudesTerrarium(rgba) {
  const altitudes = new Float32Array(rgba.length / 4);
  for (let i = 0; i < altitudes.length; i += 1) {
    altitudes[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  }
  return altitudes;
}

// Pente (degrés) et orientation (degrés depuis le nord, direction de la descente) de chaque cellule
// d'une grille de `largeur` × `hauteur` cellules. `altitude(c, l)` est lue de -1 à largeur (bordure
// comprise), pour que la méthode de Horn n'ait pas de raccord visible entre deux tuiles.
// `cellule(l)` : taille d'une cellule de la ligne l, en mètres.
export function grillePentes({ largeur, hauteur, altitude, cellule }) {
  const L = largeur + 2;
  const z = new Float32Array(L * (hauteur + 2));
  for (let l = -1; l <= hauteur; l += 1) {
    for (let c = -1; c <= largeur; c += 1) z[(l + 1) * L + c + 1] = altitude(c, l);
  }
  const pentes = new Float32Array(largeur * hauteur);
  const orientations = new Float32Array(largeur * hauteur);
  for (let l = 0; l < hauteur; l += 1) {
    const huit = 8 * cellule(l);
    const haut = l * L;
    const milieu = haut + L;
    const bas = milieu + L;
    for (let c = 0; c < largeur; c += 1) {
      const a = z[haut + c], b = z[haut + c + 1], cc = z[haut + c + 2];
      const d = z[milieu + c], f = z[milieu + c + 2];
      const g = z[bas + c], h = z[bas + c + 1], i = z[bas + c + 2];
      const versEst = (cc + 2 * f + i - (a + 2 * d + g)) / huit;
      const versNord = (a + 2 * b + cc - (g + 2 * h + i)) / huit;
      const k = l * largeur + c;
      pentes[k] = deg(Math.atan(Math.hypot(versEst, versNord)));
      orientations[k] = (deg(Math.atan2(-versEst, -versNord)) + 360) % 360;
    }
  }
  return { pentes, orientations };
}

// Taille des cellules d'une grille dont la ligne 0 est la ligne `y0` des pixels du monde au zoom `zoom`
export const celluleMercator = (y0, zoom) => (l) => taillePixel(latitudePixel(y0 + l + 0.5, zoom), zoom);

// ---------- Couleurs ----------

// Mêmes couleurs que la pastille de la fiche du point (style.css, .point-pente-*)
export const COULEURS_PENTE = { 30: [242, 210, 60], 35: [240, 140, 40], 40: [224, 54, 44], 45: [155, 79, 208] };
// Seuils de déclenchement d'avalanche, aussi utilisés par la fiche du point
export const SEUILS_PENTE = [30, 35, 40, 45];

export function couleurPente(pente) {
  for (let i = SEUILS_PENTE.length - 1; i >= 0; i -= 1) {
    if (pente >= SEUILS_PENTE[i]) return COULEURS_PENTE[SEUILS_PENTE[i]];
  }
  return null;
}

// Huit secteurs, du nord dans le sens des aiguilles d'une montre (comme codeCardinal). Le nord froid, le sud chaud.
export const CODES_SECTEURS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']; // clés `cardinal.*`
export const COULEURS_ORIENTATION = [
  [58, 111, 216], [54, 162, 201], [60, 184, 120], [166, 196, 58],
  [232, 197, 58], [232, 138, 46], [216, 71, 58], [154, 79, 201],
];
export const PENTE_MIN_ORIENTATION = 5; // en dessous, le terrain est presque plat : pas d'orientation

export const secteur = (orientation) => Math.round((((orientation % 360) + 360) % 360) / 45) % 8;

export function couleurOrientation(orientation, pente) {
  if (!(pente >= PENTE_MIN_ORIENTATION)) return null;
  return COULEURS_ORIENTATION[secteur(orientation)];
}

// Pixels RGBA d'une tuile de `taille` px, depuis une grille de `cote` cellules de côté couvrant la tuile.
// Une grille plus fine que la tuile (zoom inférieur) : chaque pixel prend la pente la plus forte
// de ses cellules, pour ne jamais adoucir une pente raide. Une grille plus grossière : la cellule sous le pixel.
// `garder(k)` : seules les cellules retenues sont peintes (pentes exposées du bulletin)
export function pixelsTuile({ pentes, orientations, cote, genre, taille = 256, garder = null }) {
  const pixels = new Uint8ClampedArray(taille * taille * 4);
  const pas = cote / taille;
  for (let py = 0; py < taille; py += 1) {
    const l0 = Math.floor(py * pas);
    const l1 = Math.max(l0 + 1, Math.floor((py + 1) * pas));
    for (let px = 0; px < taille; px += 1) {
      const c0 = Math.floor(px * pas);
      const c1 = Math.max(c0 + 1, Math.floor((px + 1) * pas));
      let k = l0 * cote + c0;
      for (let l = l0; l < l1; l += 1) {
        for (let c = c0; c < c1; c += 1) if (pentes[l * cote + c] > pentes[k]) k = l * cote + c;
      }
      if (garder && !garder(k)) continue;
      const couleur = genre === 'orientation' ? couleurOrientation(orientations[k], pentes[k]) : couleurPente(pentes[k]);
      if (!couleur) continue;
      const i = (py * taille + px) * 4;
      pixels[i] = couleur[0];
      pixels[i + 1] = couleur[1];
      pixels[i + 2] = couleur[2];
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// ---------- Pentes exposées selon le bulletin d'avalanche ----------
// Zone du bulletin : { masque (un bit par secteur, du nord dans le sens horaire), min, max } en mètres,
// min ou max à null quand le bulletin ne borne pas l'altitude
export function exposee(zones, orientation, pente, altitude) {
  if (!(pente >= SEUILS_PENTE[0]) || !Number.isFinite(orientation)) return false;
  const bit = 1 << secteur(orientation);
  return zones.some(({ masque, min, max }) => (masque & bit) !== 0
    && (min == null || altitude >= min) && (max == null || altitude <= max));
}

// Zones écrites dans l'adresse des tuiles : « 7-1700-x_224-x-2400 » (x : pas de borne)
export const zonesVersTexte = (zones) => zones.map(({ masque, min, max }) => [masque, min ?? 'x', max ?? 'x'].join('-')).join('_');

export function zonesDepuisTexte(texte) {
  const borne = (v) => (v === 'x' ? null : Number(v));
  return String(texte ?? '').split('_').map((zone) => zone.split('-'))
    .filter((parts) => parts.length === 3 && /^\d+$/.test(parts[0]) && parts.slice(1).every((v) => v === 'x' || /^\d+$/.test(v)))
    .map(([masque, min, max]) => ({ masque: Number(masque) & 255, min: borne(min), max: borne(max) }));
}
