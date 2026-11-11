// Carte des plafonds (Vol libre) : quadrillage fixe sur la Terre (pas selon le zoom), plafond des
// thermiques en chaque point (profil-calcul.js), puis image en paliers nets. Calculs purs, testés.
// Dix variables seulement, pour qu'Open-Meteo compte un appel par point : l'altitude des niveaux
// de pression se calcule depuis la pression au sol (formule hypsométrique), à 10 m près du modèle.
import { colonneAir, thermique } from './profil-calcul.js';

export const NIVEAUX_PLAFONDS = [950, 900, 850, 800, 700, 600];
export const VARIABLES_PLAFONDS = [
  'temperature_2m', 'dew_point_2m', 'shortwave_radiation', 'surface_pressure',
  ...NIVEAUX_PLAFONDS.map((p) => `temperature_${p}hPa`),
];

// Tranches de 500 m (au-dessus de la mer) : une couleur franche chacune, du plafond bas au haut
export const PALIERS_PLAFOND = [1000, 1500, 2000, 2500, 3000, 3500];
export const COULEURS_PLAFOND = [
  [62, 96, 190], // sous 1 000 m
  [38, 150, 200],
  [46, 184, 140],
  [120, 200, 70],
  [235, 210, 60],
  [245, 140, 50],
  [225, 60, 90], // 3 500 m et plus
];
export const COULEUR_SANS = [140, 148, 158];
export const SANS_THERMIQUE = 0; // valeur d'un point calculé sans thermique exploitable
const EPAISSEUR_UTILE = 300; // m au-dessus du sol : en dessous, pas exploitable
const LAT_MAX = 80;
const PAS = [0.25, 0.5, 1, 2, 4, 8, 15, 30];
const R_SUR_G = 287.05 / 9.80665; // m par kelvin

// Pas du quadrillage pour une vue : le plus fin qui garde au plus `maxPoints` points
export function pasPourVue({ ouest, sud, est, nord }, maxPoints = 200) {
  const largeur = Math.min(360, est - ouest);
  const hauteur = Math.min(2 * LAT_MAX, Math.min(nord, LAT_MAX) - Math.max(sud, -LAT_MAX));
  // Comme `quadrillage` : une maille de marge de chaque côté, plus les bords arrondis
  return PAS.find((pas) => (Math.ceil(largeur / pas) + 4) * (Math.ceil(hauteur / pas) + 4) <= maxPoints) ?? PAS.at(-1);
}

// Nœuds du quadrillage qui couvrent la vue avec une maille de marge ; longitudes non repliées
export function quadrillage(vue, pas = pasPourVue(vue)) {
  const ouest = Math.floor(vue.ouest / pas) * pas - pas;
  const est = Math.ceil(Math.min(vue.est, vue.ouest + 360) / pas) * pas + pas;
  const sud = Math.max(-LAT_MAX, Math.floor(vue.sud / pas) * pas - pas);
  const nord = Math.min(LAT_MAX, Math.ceil(vue.nord / pas) * pas + pas);
  const nx = Math.round((est - ouest) / pas) + 1;
  const ny = Math.round((nord - sud) / pas) + 1;
  const noeuds = [];
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const lng = ouest + ix * pas;
      const lat = sud + iy * pas;
      noeuds.push({ cle: cleNoeud(pas, lng, lat), longitude: ((lng + 540) % 360) - 180, latitude: lat });
    }
  }
  return { ouest, sud, est, nord, pas, nx, ny, noeuds };
}

// Un nœud garde sa clé quel que soit le décalage de la vue : ses prévisions resservent
export const cleNoeud = (pas, lng, lat) => `${pas}/${Math.round((((lng + 540) % 360) - 180) / pas)}/${Math.round(lat / pas)}`;

// Altitude des niveaux de pression depuis le sol, couche par couche, avec leur température moyenne
export function altitudesNiveaux({ elevation, pressionSol, temperatureSol, temperatures }) {
  const altitudes = {};
  let z = elevation;
  let p = pressionSol;
  let t = temperatureSol;
  for (const niveau of NIVEAUX_PLAFONDS) {
    const tn = temperatures[niveau];
    if (!Number.isFinite(tn) || !Number.isFinite(p) || !Number.isFinite(t) || niveau >= p) continue;
    z += R_SUR_G * ((t + tn) / 2 + 273.15) * Math.log(p / niveau);
    altitudes[niveau] = z;
    p = niveau;
    t = tn;
  }
  return altitudes;
}

// Plafond de chaque heure d'une réponse d'Open-Meteo : altitude (m), SANS_THERMIQUE, ou null sans données
export function plafondsHoraires(donnees) {
  const hourly = donnees?.hourly;
  if (!Array.isArray(hourly?.time) || !Number.isFinite(donnees.elevation)) return [];
  return hourly.time.map((_, i) => {
    const temperatures = Object.fromEntries(NIVEAUX_PLAFONDS.map((p) => [p, hourly[`temperature_${p}hPa`]?.[i]]));
    const temperatureSol = hourly.temperature_2m?.[i];
    if (!Number.isFinite(temperatureSol)) return null;
    const altitudes = altitudesNiveaux({ elevation: donnees.elevation, pressionSol: hourly.surface_pressure?.[i], temperatureSol, temperatures });
    // Colonne au format d'Open-Meteo pour colonneAir (le vent n'y sert pas)
    const ligne = { temperature_2m: [temperatureSol] };
    for (const p of NIVEAUX_PLAFONDS) {
      if (altitudes[p] === undefined) continue;
      ligne[`temperature_${p}hPa`] = [temperatures[p]];
      ligne[`geopotential_height_${p}hPa`] = [altitudes[p]];
    }
    const therm = thermique(colonneAir(ligne, 0, donnees.elevation), hourly.dew_point_2m?.[i], hourly.shortwave_radiation?.[i]);
    if (!therm || therm.plafond - donnees.elevation < EPAISSEUR_UTILE) return SANS_THERMIQUE;
    return therm.plafond;
  });
}

// Couleur d'un plafond : sa tranche de 500 m, ou le gris « sans thermique »
export function couleurPlafond(valeur) {
  if (valeur === SANS_THERMIQUE) return COULEUR_SANS;
  if (!Number.isFinite(valeur)) return null;
  const tranche = PALIERS_PLAFOND.findIndex((palier) => valeur < palier);
  return COULEURS_PLAFOND[tranche < 0 ? PALIERS_PLAFOND.length : tranche];
}

// Valeur en (fx, fy), coordonnées fractionnaires dans le quadrillage (sud en bas).
// Les plafonds s'interpolent entre eux ; « sans thermique » l'emporte s'il pèse plus qu'eux ;
// sans données sur plus de la moitié du poids, rien.
export function valeurGrille({ nx, ny }, valeurs, fx, fy) {
  const x0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
  const dx = Math.max(0, Math.min(1, fx - x0));
  const dy = Math.max(0, Math.min(1, fy - y0));
  const coins = [
    [valeurs[y0 * nx + x0], (1 - dx) * (1 - dy)],
    [valeurs[y0 * nx + x0 + 1], dx * (1 - dy)],
    [valeurs[(y0 + 1) * nx + x0], (1 - dx) * dy],
    [valeurs[(y0 + 1) * nx + x0 + 1], dx * dy],
  ];
  let somme = 0;
  let poids = 0;
  let poidsSans = 0;
  let poidsVide = 0;
  for (const [valeur, p] of coins) {
    if (valeur === SANS_THERMIQUE) poidsSans += p;
    else if (Number.isFinite(valeur)) {
      somme += valeur * p;
      poids += p;
    } else poidsVide += p;
  }
  if (poidsVide > 0.5) return null;
  if (poidsSans >= poids) return SANS_THERMIQUE;
  return somme / poids;
}

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latDeY = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;

// Pixels RGBA de l'image du quadrillage (nord en haut), lignes réparties comme sur la carte (Mercator)
export function rasteriser(grille, valeurs, largeur, hauteur, { opacite = 255, opaciteSans = 110 } = {}) {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4);
  const yNord = mercY(grille.nord);
  const ySud = mercY(grille.sud);
  for (let py = 0; py < hauteur; py += 1) {
    const lat = latDeY(yNord + ((py + 0.5) / hauteur) * (ySud - yNord));
    const fy = (lat - grille.sud) / grille.pas;
    for (let px = 0; px < largeur; px += 1) {
      const fx = ((px + 0.5) / largeur) * (grille.nx - 1);
      const valeur = valeurGrille(grille, valeurs, fx, fy);
      const couleur = couleurPlafond(valeur);
      if (!couleur) continue;
      const k = (py * largeur + px) * 4;
      pixels[k] = couleur[0];
      pixels[k + 1] = couleur[1];
      pixels[k + 2] = couleur[2];
      pixels[k + 3] = valeur === SANS_THERMIQUE ? opaciteSans : opacite;
    }
  }
  return pixels;
}

// Valeur au point (lng, lat), ou null hors du quadrillage ou sans données
export function plafondAu(grille, valeurs, lng, lat) {
  const fx = (lng - grille.ouest) / grille.pas;
  const fy = (lat - grille.sud) / grille.pas;
  if (fx < 0 || fy < 0 || fx > grille.nx - 1 || fy > grille.ny - 1) return null;
  return valeurGrille(grille, valeurs, fx, fy);
}
