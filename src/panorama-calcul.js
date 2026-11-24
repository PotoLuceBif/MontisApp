// Calculs purs du panorama des sommets : direction et distance d'un sommet, angle sous lequel on le voit
// (courbure de la Terre et réfraction comprises), visibilité derrière le relief, ligne d'horizon,
// position à l'écran, orientation du téléphone et placement des étiquettes sans chevauchement.

const R = 6371000; // rayon moyen de la Terre, en mètres
const RAD = Math.PI / 180;
export const REFRACTION = 0.13; // coefficient habituel de la réfraction atmosphérique

const normaliser = (angle) => ((angle % 360) + 360) % 360;
// Écart signé entre deux caps, de −180 à 180
export const ecartCap = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

// Cap (degrés, 0 = nord, sens horaire) et distance (m) d'un point vu depuis l'observateur
export function directionVers(depuis, vers) {
  const p1 = depuis.lat * RAD;
  const p2 = vers.lat * RAD;
  const dl = (vers.lng - depuis.lng) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return { cap: normaliser(Math.atan2(y, x) / RAD), distance: 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) };
}

// Point atteint en partant de l'observateur dans un cap donné, sur une distance (m)
export function pointA(depuis, cap, distance) {
  const d = distance / R;
  const c = cap * RAD;
  const p1 = depuis.lat * RAD;
  const l1 = depuis.lng * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(c));
  const l2 = l1 + Math.atan2(Math.sin(c) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lng: ((l2 / RAD + 540) % 360) - 180, lat: p2 / RAD };
}

// Angle (degrés au-dessus de l'horizontale) sous lequel on voit un point plus haut de `denivele` mètres, à `distance` m.
// Avec la courbure, le point « descend » de d² / 2R, moins ce que la réfraction rend (k ≈ 0,13).
// Sans courbure : la Terre plate du rendu 3D de MapLibre.
export function angleApparent(denivele, distance, { courbure = true, refraction = REFRACTION } = {}) {
  if (distance <= 0) return denivele >= 0 ? 90 : -90;
  const chute = courbure ? ((distance * distance) / (2 * R)) * (1 - refraction) : 0;
  return Math.atan2(denivele - chute, distance) / RAD;
}

// Pas d'échantillonnage du relief le long d'un rayon : fin près de soi, plus large au loin
export const pasRayon = (distance) => Math.max(25, distance / 120);

// Le plus grand angle du relief entre l'observateur et `distance` (exclue), dans un cap donné.
// `altitudeA(lng, lat, distance)` lit le relief ; `depuis.altitude` : hauteur des yeux.
export function angleMaxRelief(depuis, cap, distance, altitudeA, options) {
  let max = -90;
  for (let d = pasRayon(0); d < distance; d += pasRayon(d)) {
    const p = pointA(depuis, cap, d);
    const a = angleApparent(altitudeA(p.lng, p.lat, d) - depuis.altitude, d, options);
    if (a > max) max = a;
  }
  return max;
}

// Un sommet est visible si aucun relief entre lui et nous ne monte plus haut que lui.
// Les derniers 3 % du chemin sont ignorés (le relief lu près du sommet, plus grossier, le cacherait lui-même),
// et une marge absorbe l'imprécision des tuiles de relief.
export const MARGE_VISIBILITE = 0.15; // degrés
export function estVisible(depuis, sommet, altitudeA, options) {
  const { cap, distance } = directionVers(depuis, sommet);
  const angle = angleApparent(sommet.altitude - depuis.altitude, distance, options);
  const relief = angleMaxRelief(depuis, cap, distance * 0.97, altitudeA, options);
  return { visible: relief <= angle + MARGE_VISIBILITE, cap, distance, angle };
}

// Ligne d'horizon : le plus grand angle du relief dans chaque direction, tous les `pas` degrés
export function ligneHorizon(depuis, altitudeA, { pas = 1, distanceMax = 100000, ...options } = {}) {
  const angles = [];
  for (let cap = 0; cap < 360; cap += pas) angles.push(angleMaxRelief(depuis, cap, distanceMax, altitudeA, options));
  return { pas, angles };
}

// Angle de l'horizon dans un cap quelconque, interpolé entre deux directions calculées
export function horizonA({ pas, angles }, cap) {
  const i = normaliser(cap) / pas;
  const i0 = Math.floor(i) % angles.length;
  const i1 = (i0 + 1) % angles.length;
  const f = i - Math.floor(i);
  return angles[i0] * (1 - f) + angles[i1] * f;
}

// Position à l'écran d'une direction (cap, angle au-dessus de l'horizontale), pour une caméra qui regarde
// dans le cap `vue.cap`, relevée de `vue.inclinaison` degrés, de champ vertical `vue.champ` degrés.
// null derrière la caméra.
export function projeter(cap, angle, vue) {
  const a = ecartCap(cap, vue.cap) * RAD;
  const e = angle * RAD;
  const p = (vue.inclinaison || 0) * RAD;
  const avant0 = Math.cos(e) * Math.cos(a);
  const droite = Math.cos(e) * Math.sin(a);
  const haut0 = Math.sin(e);
  const avant = avant0 * Math.cos(p) + haut0 * Math.sin(p);
  const haut = haut0 * Math.cos(p) - avant0 * Math.sin(p);
  if (avant <= 1e-6) return null;
  const f = vue.hauteur / 2 / Math.tan((vue.champ / 2) * RAD);
  return { x: vue.largeur / 2 + (f * droite) / avant, y: vue.hauteur / 2 - (f * haut) / avant };
}

// Champ horizontal (degrés) d'un champ vertical sur un écran de largeur × hauteur
export const champHorizontal = (champ, largeur, hauteur) =>
  (2 * Math.atan(Math.tan((champ / 2) * RAD) * (largeur / hauteur))) / RAD;

// Direction regardée par l'arrière du téléphone (la caméra), d'après alpha, bêta, gamma (DeviceOrientation, W3C) :
// cap compté dans le repère d'alpha, inclinaison au-dessus de l'horizontale. Téléphone presque à plat,
// la caméra regarde le sol : le cap devient celui du haut de l'appareil, et l'inclinaison est bornée.
export function directionCamera({ alpha, beta, gamma }) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  const [cA, sA] = [Math.cos(alpha * RAD), Math.sin(alpha * RAD)];
  const [cB, sB] = [Math.cos(beta * RAD), Math.sin(beta * RAD)];
  const [cG, sG] = [Math.cos(gamma * RAD), Math.sin(gamma * RAD)];
  // Axe arrière (−z de l'appareil) dans le repère est, nord, haut
  const est = -(cA * sG + sA * sB * cG);
  const nord = -(sA * sG - cA * sB * cG);
  const haut = -cB * cG;
  const inclinaison = Math.asin(Math.max(-1, Math.min(1, haut))) / RAD;
  if (Math.hypot(est, nord) < 0.35) {
    // Presque à plat : axe du haut de l'appareil (+y)
    return { cap: normaliser(Math.atan2(-sA * cB, cA * cB) / RAD), inclinaison: Math.max(-60, inclinaison), aPlat: true };
  }
  return { cap: normaliser(Math.atan2(est, nord) / RAD), inclinaison, aPlat: false };
}

// Étiquettes sans chevauchement : les plus importantes d'abord, chacune sur la première rangée libre
// au-dessus de son sommet ; au-delà de `rangees`, l'étiquette n'est pas affichée.
// etiquettes : [{ x, largeur, importance, … }] → les mêmes avec `rangee`, sans celles qui ne tiennent pas
export function placerEtiquettes(etiquettes, { rangees = 4, espace = 6 } = {}) {
  const occupees = Array.from({ length: rangees }, () => []);
  const placees = [];
  for (const e of [...etiquettes].sort((a, b) => b.importance - a.importance)) {
    const g = e.x - e.largeur / 2 - espace / 2;
    const d = e.x + e.largeur / 2 + espace / 2;
    const rangee = occupees.findIndex((segments) => segments.every(([sg, sd]) => d <= sg || g >= sd));
    if (rangee < 0) continue;
    occupees[rangee].push([g, d]);
    placees.push({ ...e, rangee });
  }
  return placees;
}

// Importance d'un sommet : sa hauteur au-dessus de nous compte, sa proximité aussi
export function importanceSommet({ angle, distance, altitude }) {
  return angle * 4 + altitude / 1000 - Math.log10(Math.max(100, distance));
}

// Un même sommet lu dans plusieurs tuiles (et plusieurs zooms) : gardé une fois (même nom à moins de 300 m)
export function dedoublonner(sommets) {
  const garde = [];
  for (const s of sommets) {
    const double = garde.find((g) => g.nom === s.nom && directionVers(g, s).distance < 300);
    if (double) {
      if (!double.altitude && s.altitude) double.altitude = s.altitude;
    } else garde.push({ ...s });
  }
  return garde;
}

// Cap lisible : « N 12° », « NE 47° »
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const pointCardinal = (cap, points = POINTS) => points[Math.round(normaliser(cap) / 45) % 8];
