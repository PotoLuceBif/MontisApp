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

// Pixels RGBA d'une tuile z/x/y de 256 px : `jour` et `nuit` sont les pixels des deux images de la même tuile
export function melangerTuile(jour, nuit, z, x, y, soleil) {
  const pixels = new Uint8ClampedArray(256 * 256 * 4);
  const monde = 256 * 2 ** z;
  // La part du jour varie lentement : calculée tous les 8 px, puis interpolée
  const PAS = 8;
  const cotes = 256 / PAS + 1;
  const parts = new Float32Array(cotes * cotes);
  for (let gy = 0; gy < cotes; gy += 1) {
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y * 256 + gy * PAS)) / monde))) / RAD;
    for (let gx = 0; gx < cotes; gx += 1) {
      const lng = ((x * 256 + gx * PAS) / monde) * 360 - 180;
      parts[gy * cotes + gx] = partJour(hauteurSoleil(lat, lng, soleil));
    }
  }
  const bordMonde = y === 0 || y === 2 ** z - 1; // seules les tuiles du haut et du bas touchent un pôle
  for (let py = 0; py < 256; py += 1) {
    const gy = Math.min(cotes - 2, Math.floor(py / PAS));
    const ty = (py - gy * PAS) / PAS;
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
      const o = (py * 256 + px) * 4;
      for (let c = 0; c < 3; c += 1) {
        const image = jour[o + c] * w + nuit[o + c] * (1 - w);
        const unie = GLACE[c] * w + NUIT_POLAIRE[c] * (1 - w);
        pixels[o + c] = image * (1 - polaire) + unie * polaire;
      }
      pixels[o + 3] = 255;
    }
  }
  return pixels;
}
