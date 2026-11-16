// La vraie Lune vue de la Terre, dans le ciel du globe au dézoom (demande du propriétaire du 16 novembre 2026 :
// « en mode espace on perd tous les détails ») : la face visible peinte avec la mosaïque de la NASA (Moon Trek,
// plate carrée), éclairée par le vrai soleil, donc avec sa phase, et tournée comme dans le ciel (nord céleste).
// Pendant de terre-vue-calcul.js. Calculs purs (testés) ; le dessin se fait dans ciel.js.
import { jourEn, pointDuDisque } from './terre-vue-calcul.js';
import { pointSubsolaireLune } from './lune-visite-calcul.js';

const RAD = Math.PI / 180;

// Ascension droite et déclinaison de la Lune, en degrés (formules de suncalc)
export function coordonneesLune(date) {
  const d = (new Date(date).getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M);
  const b = 5.128 * RAD * Math.sin(F);
  const e = 23.4397 * RAD;
  return {
    ra: (((Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD) % 360) + 360) % 360,
    dec: Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD,
  };
}

// Pixel d'une image plate carrée de la Lune (colonne 0 à -180°, ligne 0 à 90° N)
export function pixelPlateCarre(lat, lng, largeur, hauteur) {
  const x = Math.floor(((lng + 180) / 360) * largeur);
  const y = Math.floor(((90 - lat) / 180) * hauteur);
  return [Math.min(largeur - 1, Math.max(0, x)), Math.min(hauteur - 1, Math.max(0, y))];
}

// Pixels RGBA du disque de la Lune (taille × taille), face visible (point sous la Terre en 0°, 0°), nord en haut ;
// sans atmosphère, le terminateur est net, et la face nuit garde un peu de lumière cendrée
export function peindreLune({ image, largeur, hauteur, date, taille, eclairee = false }) {
  const pixels = new Uint8ClampedArray(taille * taille * 4);
  const soleil = eclairee ? null : pointSubsolaireLune(date);
  const demi = taille / 2;
  for (let py = 0; py < taille; py++) {
    for (let px = 0; px < taille; px++) {
      const u = (px + 0.5 - demi) / demi;
      const v = (demi - py - 0.5) / demi;
      const rho = Math.hypot(u, v);
      if (rho > 1) continue;
      const point = pointDuDisque(u, v, { lat: 0, lng: 0 });
      const [x, y] = pixelPlateCarre(point.lat, point.lng, largeur, hauteur);
      const k = (y * largeur + x) * 4;
      // jourEn compte un crépuscule de -6° à +4° (Terre) : resserré ici, la Lune n'a pas d'atmosphère
      const jour = soleil ? Math.min(1, Math.max(0, (jourEn(point.lat, point.lng, soleil) - 0.55) * 4 + 0.5)) : 1;
      const eclat = 0.07 + 0.93 * jour; // lumière cendrée côté nuit
      const bord = 0.8 + 0.2 * Math.pow(point.z, 0.4);
      const i = (py * taille + px) * 4;
      for (let c = 0; c < 3; c++) pixels[i + c] = image[k + c] * eclat * bord * 1.08;
      pixels[i + 3] = Math.round(255 * Math.min(1, (1 - rho) * demi + 0.5));
    }
  }
  return pixels;
}
