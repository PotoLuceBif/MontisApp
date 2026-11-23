// Globe jour et nuit au dézoom, à la manière de Plans d'Apple : image du jour (Blue Marble) et lumières
// de la nuit (Black Marble) de la NASA, mélangées selon la hauteur du soleil à l'instant. Calculs purs, testés.

const RAD = Math.PI / 180;
const NUIT = -8; // ° : soleil sous l'horizon, nuit complète (fin du crépuscule nautique, à peu près)
const JOUR = 1; // ° : au-dessus, plein jour ; entre les deux, la bande du crépuscule

// Au-delà de 85°, MapLibre comble le pôle en étirant la dernière rangée de pixels : une image détaillée y fait
// des rayons. Le bord se fond donc vers une couleur unie (glace le jour, nuit noire), à partir de 80°.
const LAT_FONDU = 80;
const LAT_BORD = 85.0511;
const GLACE = [236, 241, 246];
const NUIT_POLAIRE = [7, 9, 20];
// Au pôle Nord, c'est l'océan Arctique : fondre vers la glace y dessinait un disque clair sur la mer
const ARCTIQUE = [14, 36, 78]; // moyenne de l'image du jour au-delà de 80° nord
const ARCTIQUE_NUIT = [4, 5, 15];

const normaliser = (degres) => ((((degres + 180) % 360) + 360) % 360) - 180;

// Point de la Terre où le soleil est au zénith à l'instant `date` (formules de l'Almanach, à 0,1° près)
export function pointSubsolaire(date) {
  const n = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const declinaison = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / RAD;
  const ascension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const tempsSideral = 280.46061837 + 360.98564736629 * n;
  return { lat: declinaison, lng: normaliser(ascension - tempsSideral) };
}

// Hauteur du soleil (°) vue d'un point, le soleil étant au zénith de `soleil`
export function hauteurSoleil(lat, lng, soleil) {
  const phi = lat * RAD;
  const delta = soleil.lat * RAD;
  const h = (lng - soleil.lng) * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h)) / RAD;
}

// Part du jour dans le mélange : 0 la nuit, 1 en plein jour, adoucie dans le crépuscule
export function partJour(hauteur) {
  const x = Math.min(1, Math.max(0, (hauteur - NUIT) / (JOUR - NUIT)));
  return x * x * (3 - 2 * x);
}

const lisse = (a, b, v) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Côté jour : la lumière baisse quand le soleil descend vers l'horizon, comme vu de l'espace
export function eclairageJour(hauteur) {
  return 0.62 + 0.38 * lisse(-2, 30, hauteur);
}

// Côté jour : l'océan de l'image, très sombre, est éclairci vers un bleu franc (demande du propriétaire du
// 15 novembre 2026) ; les fonds marins restent lisibles. La mer se reconnaît à son bleu dominant : terres,
// glaces et nuages ne changent pas, et la côte passe en douceur.
// Part de mer d'un pixel de l'image du jour : le bleu en trop, rapporté au bleu, pour que les abysses presque
// noirs comptent autant que les hauts-fonds
export const partMer = (r, v, b) => lisse(0.08, 0.3, (b - Math.max(r, v) * 1.12) / (b + 1));
// Côté nuit, la mer est plus sombre que les terres : sans lumières, elle paraissait trop claire
const MER_NUIT = 0.68;

export function oceanClair(r, v, b) {
  const mer = partMer(r, v, b);
  if (!mer) return [r, v, b];
  return [r + (r * 0.5 + 30 - r) * mer, v + (v * 0.45 + 96 - v) * mer, b + (b * 0.35 + 150 - b) * mer];
}

// Côté nuit : un bleu nuit profond plutôt que le gris violacé de l'image ; les lumières des villes restent, réchauffées
export function teinteNuit(r, v, b) {
  const lum = (r + v + b) / 3;
  const ville = lisse(70, 170, lum);
  const fond = [r * 0.24 + 2, v * 0.3 + 5, b * 0.42 + 12];
  const lumiere = [Math.min(255, lum * 1.15 + 25), Math.min(255, lum * 0.95 + 8), lum * 0.62];
  return fond.map((c, i) => c * (1 - ville) + lumiere[i] * ville);
}

// Point à `angle` degrés de (lat, lng), dans la direction `azimut` (degrés depuis le nord) : sur le grand cercle
export function pointADistance(lat, lng, azimut, angle) {
  const phi = lat * RAD;
  const d = angle * RAD;
  const az = azimut * RAD;
  const phi2 = Math.asin(Math.sin(phi) * Math.cos(d) + Math.cos(phi) * Math.sin(d) * Math.cos(az));
  const lambda = Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(phi), Math.cos(d) - Math.sin(phi) * Math.sin(phi2));
  return { lat: phi2 / RAD, lng: normaliser(lng + lambda / RAD) };
}

// Bord apparent du globe (son limbe) vu par la caméra de MapLibre : le point de la Terre sous la caméra, et
// l'angle, vu du centre de la Terre, entre ce point et le bord. La caméra regarde le centre de la carte, à la
// distance qui donne ce zoom, reculée selon l'inclinaison et le cap. Tout se compte en pixels.
export function limbeGlobe({ lat, lng, zoom, pitch = 0, bearing = 0, fov, hauteurEcran }) {
  const phi = lat * RAD;
  const lambda = lng * RAD;
  // Comme MapLibre (planetScaleAtLatitude) : l'échelle s'arrête à 85,05°, sinon le globe, face à un pôle,
  // paraissait immense et son bord se resserrait autour du pôle
  const rayon = (512 * 2 ** zoom) / (2 * Math.PI * Math.cos(Math.min(Math.abs(lat), LAT_BORD) * RAD));
  const distance = hauteurEcran / 2 / Math.tan((fov * RAD) / 2);
  const haut = [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
  const est = [-Math.sin(lambda), Math.cos(lambda), 0];
  const nord = [-Math.sin(phi) * Math.cos(lambda), -Math.sin(phi) * Math.sin(lambda), Math.cos(phi)];
  const [p, b] = [pitch * RAD, bearing * RAD];
  const camera = haut.map((h, i) => (rayon + distance * Math.cos(p)) * h - distance * Math.sin(p) * (Math.sin(b) * est[i] + Math.cos(b) * nord[i]));
  const norme = Math.hypot(...camera);
  return {
    lat: Math.asin(camera[2] / norme) / RAD,
    lng: Math.atan2(camera[1], camera[0]) / RAD,
    angle: Math.acos(Math.min(1, rayon / norme)) / RAD,
  };
}

// Couleur unie vers laquelle l'image se fond au bord du monde : la mer au nord, la glace au sud
const couleursPole = (nord) => (nord ? [oceanClair(...ARCTIQUE), teinteNuit(...ARCTIQUE_NUIT).map((c) => c * MER_NUIT)] : [GLACE, NUIT_POLAIRE]);
const unieAuPole = (nord, [jour, nuit], w, l, c) => jour[c] * l * w + nuit[c] * (1 - w);

// L'image s'arrête à 85° : au-delà, c'est la carte du dessous qui se voyait (disque d'eau au nord, de glace
// au sud). Couleur de la calotte qui la prolonge, à cette longitude : celle du bord de l'image.
export function couleurCalotte(nord, lng, soleil) {
  const h = hauteurSoleil(nord ? LAT_BORD : -LAT_BORD, lng, soleil);
  const couleurs = couleursPole(nord);
  return [0, 1, 2].map((c) => Math.round(unieAuPole(nord, couleurs, partJour(h), eclairageJour(h), c)));
}

// Pixels RGBA d'une tuile z/x/y de 256 px : `jour` et `nuit` sont les pixels des deux images de la même tuile
export function melangerTuile(jour, nuit, z, x, y, soleil) {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  const monde = 256 * 2 ** z;
  // La part du jour varie lentement : calculée tous les 8 px, puis interpolée
  const PAS = 8;
  const cotes = 256 / PAS + 1;
  const parts = new Float32Array(cotes * cotes);
  const lumieres = new Float32Array(cotes * cotes);
  for (let gy = 0; gy < cotes; gy += 1) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * 256 + gy * PAS)) / monde))) / RAD;
    for (let gx = 0; gx < cotes; gx += 1) {
      const lng = ((x * 256 + gx * PAS) / monde) * 360 - 180;
      const h = hauteurSoleil(lat, lng, soleil);
      parts[gy * cotes + gx] = partJour(h);
      lumieres[gy * cotes + gx] = eclairageJour(h);
    }
  }
  // Au zoom 0, la seule tuile touche les deux pôles : la couleur du pôle se choisit ligne par ligne
  const poles = [couleursPole(true), couleursPole(false)];
  const bordMonde = y === 0 || y === 2 ** z - 1; // seules les tuiles du haut et du bas touchent un pôle
  for (let py = 0; py < 256; py += 1) {
    const gy = Math.min(cotes - 2, Math.floor(py / PAS));
    const ty = (py - gy * PAS) / PAS;
    const nord = y * 256 + py < monde / 2;
    const pole = poles[nord ? 0 : 1];
    let polaire = 0;
    if (bordMonde) {
      const lat = Math.abs(Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * 256 + py + 0.5)) / monde))) / RAD);
      const r = Math.min(1, Math.max(0, (lat - LAT_FONDU) / (LAT_BORD - 0.3 - LAT_FONDU)));
      polaire = r * r * (3 - 2 * r);
    }
    for (let px = 0; px < 256; px += 1) {
      const gx = Math.min(cotes - 2, Math.floor(px / PAS));
      const tx = (px - gx * PAS) / PAS;
      const w = (parts[gy * cotes + gx] * (1 - tx) + parts[gy * cotes + gx + 1] * tx) * (1 - ty)
        + (parts[(gy + 1) * cotes + gx] * (1 - tx) + parts[(gy + 1) * cotes + gx + 1] * tx) * ty;
      const l = (lumieres[gy * cotes + gx] * (1 - tx) + lumieres[gy * cotes + gx + 1] * tx) * (1 - ty)
        + (lumieres[(gy + 1) * cotes + gx] * (1 - tx) + lumieres[(gy + 1) * cotes + gx + 1] * tx) * ty;
      const o = (py * 256 + px) * 4;
      const teinte = teinteNuit(nuit[o], nuit[o + 1], nuit[o + 2]);
      const clair = oceanClair(jour[o], jour[o + 1], jour[o + 2]);
      const sombre = 1 - (1 - MER_NUIT) * partMer(jour[o], jour[o + 1], jour[o + 2]);
      for (let c = 0; c < 3; c += 1) {
        const image = clair[c] * l * w + teinte[c] * sombre * (1 - w);
        const unie = unieAuPole(nord, pole, w, l, c);
        pixels[o + c] = image * (1 - polaire) + unie * polaire;
      }
      pixels[o + 3] = 255;
    }
  }
  return pixels;
}

// Mode frise de la vue d'espace (demande du propriétaire du 23 novembre 2026) : la caméra suit le soleil, la Terre
// tourne dessous. Centre de la vue à `instant`, parti de `centre` à `instantDepart` : sa longitude suit le point
// subsolaire, pour que le soleil garde la même direction vue du centre (sa déclinaison, elle, change lentement)
export function centreFrise(centre, instantDepart, instant) {
  const decalage = pointSubsolaire(new Date(instant)).lng - pointSubsolaire(new Date(instantDepart)).lng;
  return { lng: ((((centre.lng + decalage + 180) % 360) + 360) % 360) - 180, lat: centre.lat };
}
