// La vraie Terre vue de la Lune (lot 4.10, demande du propriétaire du 16 novembre 2026 : « une vraie Terre, dans le
// fond des étoiles, comme on voit la Lune depuis la Terre ») : la face tournée vers la Lune à cet instant, peinte
// avec les images de la NASA (Blue Marble le jour, lumières des villes la nuit), éclairée par le vrai soleil, donc
// avec sa phase. Calculs purs (testés) ; le dessin se fait dans lune-visite.js.
import { pointSubsolaire } from './globe-nuit-calcul.js';
import { tempsSideral } from './ciel-calcul.js';

const RAD = Math.PI / 180;
const LAT_MERCATOR = 85.0511;

// Point de la Terre qui a la Lune au zénith (celui qu'on voit au centre du disque depuis la Lune) : déclinaison
// et ascension droite de la Lune (formules de suncalc), moins le temps sidéral de Greenwich
export function pointSousLune(date) {
  const instant = new Date(date);
  const d = (instant.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M);
  const b = 5.128 * RAD * Math.sin(F);
  const e = 23.4397 * RAD;
  const ascension = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD;
  const declinaison = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD;
  const lng = ((((ascension - tempsSideral(instant)) % 360) + 540) % 360) - 180;
  return { lat: declinaison, lng };
}

export const soleilSurTerre = (date) => pointSubsolaire(new Date(date));

// Point géographique sous le pixel (u, v) du disque (de -1 à 1, v vers le haut, nord en haut), projection
// orthographique centrée sur `centre` ; null hors du disque
export function pointDuDisque(u, v, centre) {
  const rho2 = u * u + v * v;
  if (rho2 > 1) return null;
  const z = Math.sqrt(1 - rho2);
  const p0 = centre.lat * RAD;
  const lat = Math.asin(z * Math.sin(p0) + v * Math.cos(p0)) / RAD;
  const lng = centre.lng + Math.atan2(u, z * Math.cos(p0) - v * Math.sin(p0)) / RAD;
  return { lat, lng: ((((lng + 180) % 360) + 360) % 360) - 180, z };
}

// Éclairement d'un point par le soleil : de 0 (nuit) à 1 (jour), crépuscule de -6° à +4°
export function jourEn(lat, lng, soleil) {
  const s = Math.sin(lat * RAD) * Math.sin(soleil.lat * RAD)
    + Math.cos(lat * RAD) * Math.cos(soleil.lat * RAD) * Math.cos((lng - soleil.lng) * RAD);
  const hauteur = Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
  return Math.max(0, Math.min(1, (hauteur + 6) / 10));
}

// Pixel d'une image Mercator du monde entier (largeur × largeur) pour un point
export function pixelMercator(lat, lng, largeur) {
  const l = Math.max(-LAT_MERCATOR, Math.min(LAT_MERCATOR, lat)) * RAD;
  const x = ((lng + 180) / 360) * largeur;
  const y = ((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2) * largeur;
  return [Math.min(largeur - 1, Math.max(0, Math.floor(x))), Math.min(largeur - 1, Math.max(0, Math.floor(y)))];
}

// Pixels RGBA du disque de la Terre (taille × taille) : `jour` et `nuit`, pixels RGBA d'images Mercator du monde
// (largeur × largeur) ; `centre`, point sous l'observateur ; `soleil`, point subsolaire (null : toute éclairée)
export function peindreTerre({ jour, nuit = null, largeur, centre, soleil = null, taille }) {
  const pixels = new Uint8ClampedArray(taille * taille * 4);
  const demi = taille / 2;
  for (let py = 0; py < taille; py++) {
    for (let px = 0; px < taille; px++) {
      const u = (px + 0.5 - demi) / demi;
      const v = (demi - py - 0.5) / demi;
      const rho = Math.hypot(u, v);
      const i = (py * taille + px) * 4;
      if (rho > 1) continue;
      const point = pointDuDisque(u, v, centre);
      // Pôles au-delà de 85° (hors des images Mercator) : glace
      const polaire = Math.abs(point.lat) > 84;
      const [x, y] = pixelMercator(point.lat, point.lng, largeur);
      const k = (y * largeur + x) * 4;
      const jourIci = soleil ? jourEn(point.lat, point.lng, soleil) : 1;
      // Assombrissement vers le bord, et voile bleu de l'atmosphère
      const bord = 0.55 + 0.45 * Math.pow(point.z, 0.35);
      const atmo = Math.pow(1 - point.z, 3) * 0.55;
      for (let c = 0; c < 3; c++) {
        const clair = polaire ? [236, 242, 248][c] : jour[k + c];
        const lumiere = nuit && !polaire ? nuit[k + c] * 0.9 : 0;
        const sombre = [4, 8, 20][c] + lumiere;
        const valeur = (clair * jourIci + sombre * (1 - jourIci)) * bord;
        pixels[i + c] = valeur * (1 - atmo * jourIci) + [120, 180, 255][c] * atmo * jourIci;
      }
      // Bord adouci sur un pixel
      pixels[i + 3] = Math.round(255 * Math.min(1, (1 - rho) * demi + 0.5));
    }
  }
  return pixels;
}
