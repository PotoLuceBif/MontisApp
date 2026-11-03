// Calculs purs de l'ombre portée par le relief : une cellule est à l'ombre si, en remontant vers le soleil,
// le terrain passe au-dessus du rayon qui part d'elle. Utilisé par le travailleur des couches (ombre-tuile.js).

const rad = (degres) => (degres * Math.PI) / 180;

// Au-delà, une montagne ne porte plus d'ombre utile à afficher (soleil rasant)
export const PORTEE_MAX = 30000;
// Plus grand dénivelé qui puisse porter une ombre : sert à borner la recherche
export const DENIVELE_MAX = 4000;
// Sous ce zoom, les tuiles couvrent trop de terrain pour un calcul rapide : seul l'ombrage reste
export const ZOOM_MIN_PORTEES = 10;
export const COULEUR_OMBRE = [14, 20, 42];

// Direction du soleil sur une grille dont les lignes descendent vers le sud (x vers l'est, y vers le sud)
export function directionSoleil(azimut) {
  return { dx: Math.sin(rad(azimut)), dy: -Math.cos(rad(azimut)) };
}

// Distance (m) jusqu'à laquelle chercher un relief qui cache le soleil
export function porteeOmbre(hauteurSoleil) {
  if (!(hauteurSoleil > 0)) return 0;
  return Math.min(PORTEE_MAX, DENIVELE_MAX / Math.tan(rad(hauteurSoleil)));
}

// Ombre (1) ou soleil (0) de chaque cellule d'une grille `largeur` × `hauteur`.
// `altitude(x, y)` : altitude en mètres au point (x, y), en cellules depuis le coin de la grille ; elle peut
// être lue hors de la grille, et renvoyer NaN là où le relief manque (rien n'y fait alors d'ombre).
// Le bord de l'ombre est adouci à l'affichage par le rééchantillonnage de la couche.
// `cellule` : taille d'une cellule en mètres. `altitudeMax` : la plus haute altitude lisible.
export function grilleOmbres({ largeur, hauteur, altitude, cellule, azimut, hauteurSoleil, altitudeMax }) {
  const ombres = new Uint8Array(largeur * hauteur);
  if (!(hauteurSoleil > 0)) return ombres.fill(1);
  const { dx, dy } = directionSoleil(azimut);
  const montee = Math.tan(rad(hauteurSoleil)) * cellule; // élévation du rayon par cellule parcourue
  const limite = porteeOmbre(hauteurSoleil) / cellule;
  for (let l = 0; l < hauteur; l += 1) {
    for (let c = 0; c < largeur; c += 1) {
      const depart = altitude(c, l);
      if (Number.isNaN(depart)) continue;
      // Pas d'une cellule près du point, puis croissant : au loin, l'ombre ne dépend plus d'un détail
      for (let d = 1; d <= limite; d += d < 40 ? 1 : d / 40) {
        const rayon = depart + d * montee;
        if (rayon > altitudeMax) break;
        if (altitude(c + dx * d, l + dy * d) > rayon) {
          ombres[l * largeur + c] = 1;
          break;
        }
      }
    }
  }
  return ombres;
}

// Pixels RGBA d'une tuile carrée : couleur d'ombre, transparents au soleil
export function pixelsOmbre(ombres, taille = 256) {
  const pixels = new Uint8ClampedArray(taille * taille * 4);
  for (let k = 0; k < taille * taille; k += 1) {
    if (!ombres[k]) continue;
    const i = k * 4;
    pixels[i] = COULEUR_OMBRE[0];
    pixels[i + 1] = COULEUR_OMBRE[1];
    pixels[i + 2] = COULEUR_OMBRE[2];
    pixels[i + 3] = 255;
  }
  return pixels;
}
