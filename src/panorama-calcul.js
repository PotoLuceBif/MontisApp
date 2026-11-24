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

// ---------- Lignes de crête ----------
// Le long d'un rayon, un point du relief est visible s'il monte au-dessus de tout ce qui le précède. Une crête est le
// dernier point visible avant un creux caché (le versant de derrière) ; la dernière de toutes est l'horizon.
// Une crête n'est gardée que si elle cache assez : `profondeur` degrés, sur au moins 3 % de sa distance (et 150 m).
export const PROFONDEUR_CRETE = 0.3; // degrés
export function cretesCap(depuis, cap, altitudeA, { distanceMax = 100000, ...options } = {}) {
  const cretes = [];
  let max = -90;
  let crete = null;
  let creux = Infinity;
  for (let d = pasRayon(0); d < distanceMax; d += pasRayon(d)) {
    const p = pointA(depuis, cap, d);
    const h = altitudeA(p.lng, p.lat, d);
    const a = angleApparent(h - depuis.altitude, d, options);
    if (a >= max) {
      if (crete && creux < Infinity && crete.a - creux >= PROFONDEUR_CRETE && d - crete.d >= Math.max(150, crete.d * 0.03)) {
        cretes.push({ d: crete.d, h: crete.h });
      }
      max = a;
      crete = { d, h, a };
      creux = Infinity;
    } else if (a < creux) creux = a;
  }
  if (crete) cretes.push({ d: crete.d, h: crete.h, horizon: true });
  return cretes;
}

// Relie les crêtes de caps voisins en lignes : même crête si la distance change de moins de 12 % (et 300 m).
// L'horizon, lui, forme une seule ligne continue : sa distance saute d'un cap à l'autre, pas son angle.
// colonnes : [{ cap, cretes: [{ d, h, horizon? }] }] dans l'ordre des caps → [{ points: [{ cap, d, h }], horizon }]
export function relierCretes(colonnes, { longueurMin = 4 } = {}) {
  const finies = [];
  let actives = [];
  const horizon = { points: [], horizon: true };
  for (const { cap, cretes } of colonnes) {
    const suivantes = [];
    const prises = new Set();
    for (const c of cretes) {
      if (c.horizon) {
        horizon.points.push({ cap, d: c.d, h: c.h });
        continue;
      }
      let meilleure = null;
      for (const ligne of actives) {
        if (prises.has(ligne)) continue;
        const der = ligne.points[ligne.points.length - 1];
        const ecart = Math.abs(der.d - c.d);
        if (ecart <= Math.max(300, 0.12 * Math.max(der.d, c.d)) && (!meilleure || ecart < meilleure.ecart)) meilleure = { ligne, ecart };
      }
      const ligne = meilleure ? meilleure.ligne : { points: [], horizon: false };
      prises.add(ligne);
      ligne.points.push({ cap, d: c.d, h: c.h });
      suivantes.push(ligne);
    }
    actives.forEach((l) => !prises.has(l) && finies.push(l));
    actives = suivantes;
  }
  finies.push(...actives);
  return [...(horizon.points.length ? [horizon] : []), ...finies.filter((l) => l.points.length >= longueurMin)];
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
  // `centreY` : centre de la perspective, quand une marge le décale (panneau posé en bas de l'écran)
  return { x: vue.largeur / 2 + (f * droite) / avant, y: (vue.centreY ?? vue.hauteur / 2) - (f * haut) / avant };
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

// Noms inclinés à 45° : deux noms parallèles ne se gênent pas s'ils sont écartés de `ecart` px à l'horizontale.
// Les plus importants d'abord ; un nom trop près d'un nom déjà gardé n'est pas affiché.
// etiquettes : [{ x, importance, … }] → celles gardées, dans l'ordre de l'écran
export function choisirEtiquettes(etiquettes, { ecart = 16 } = {}) {
  const gardees = [];
  for (const e of [...etiquettes].sort((a, b) => b.importance - a.importance)) {
    if (gardees.every((g) => Math.abs(g.x - e.x) >= ecart)) gardees.push(e);
  }
  return gardees.sort((a, b) => a.x - b.x);
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

// ---------- Point de départ ----------
// Une position du navigateur n'est gardée que précise (téléphone, pas l'adresse internet d'un ordinateur)
// et récente : sur ordinateur, le navigateur rendait une position de la veille, à des dizaines de km.
export const PRECISION_MAX = 200; // m
export const AGE_MAX = 2 * 60000; // ms
export const positionUtilisable = (p, maintenant = Date.now()) =>
  !!p && Number.isFinite(p.lng) && Number.isFinite(p.lat) &&
  Number.isFinite(p.precision) && p.precision <= PRECISION_MAX &&
  Number.isFinite(p.instant) && maintenant - p.instant <= AGE_MAX;

// D'où regarder : le point demandé (fiche d'un point) ; sinon la position, si elle est utilisable et que la carte
// montre ses alentours ; sinon le centre de la carte (on regarde ailleurs : Embrun depuis Montfaucon).
// → { source: 'point' | 'gps' | 'centre', lieu, autre } ; `autre` : la seconde source proposée, s'il y en a une
export const ECART_CARTE = 10000; // m entre la position et le centre de la carte, au-delà on regarde ailleurs
export function choisirDepart({ point = null, gps = null, centre }, maintenant = Date.now()) {
  if (point) return { source: 'point', lieu: point, autre: null };
  const gpsOk = positionUtilisable(gps, maintenant);
  if (!gpsOk) return { source: 'centre', lieu: centre, autre: null };
  const ecart = directionVers(gps, centre).distance;
  // Les deux presque au même endroit : pas de choix à proposer
  const autreUtile = ecart > 200;
  if (ecart <= ECART_CARTE) return { source: 'gps', lieu: gps, autre: autreUtile ? 'centre' : null };
  return { source: 'centre', lieu: centre, autre: 'gps' };
}

// ---------- Soleil et Lune au-dessus du relief (« Voir dans le ciel », vue au sol) ----------
// Réfraction de l'atmosphère (Sæmundsson, en degrés) : près de l'horizon, un astre paraît un demi-degré plus haut
export function refraction(hauteur) {
  if (hauteur < -2) return 0;
  return 1.02 / Math.tan(((hauteur + 10.3 / (hauteur + 5.11)) * Math.PI) / 180) / 60;
}
export const hauteurApparente = (hauteur) => hauteur + refraction(hauteur);

// Trajectoire d'un astre de `debut` à `fin` (ms), un point tous les `pas` ms : [{ t, azimut, hauteur }]
// `position(t)` → { azimut, hauteur } (vraie hauteur) ; la hauteur rendue est apparente
export function trajetAstre(position, debut, fin, pas = 5 * 60000) {
  const points = [];
  for (let t = debut; t <= fin; t += pas) {
    const p = position(t);
    points.push({ t, azimut: p.azimut, hauteur: hauteurApparente(p.hauteur) });
  }
  return points;
}

// Angle de l'horizon (relief) dans chaque direction, d'après la ligne d'horizon des crêtes ({ points: [{ cap, d, h }] })
// → fonction cap → angle (degrés), interpolée entre deux directions voisines
export function profilHorizon(points, depuis) {
  const tries = [...points].sort((a, b) => a.cap - b.cap);
  const caps = tries.map((p) => ((p.cap % 360) + 360) % 360);
  const angles = tries.map((p) => angleApparent(p.h - depuis.altitude, p.d));
  return (cap) => {
    if (!caps.length) return 0;
    const c = ((cap % 360) + 360) % 360;
    let i = caps.findIndex((x) => x > c);
    if (i < 0) i = caps.length; // au-delà du dernier : entre lui et le premier (+360)
    const i0 = (i - 1 + caps.length) % caps.length;
    const i1 = i % caps.length;
    const c0 = caps[i0];
    let c1 = caps[i1];
    let x = c;
    if (c1 <= c0) c1 += 360;
    if (x < c0) x += 360;
    const f = c1 === c0 ? 0 : (x - c0) / (c1 - c0);
    return angles[i0] * (1 - f) + angles[i1] * f;
  };
}

// Vrai lever et vrai coucher derrière le relief : le premier instant où l'astre passe au-dessus de la crête, et le
// dernier où il y est encore. Instants interpolés entre deux points. → { lever, coucher } (ms ou null)
export function leverCoucherReels(trajet, horizonDe) {
  const marge = trajet.map((p) => p.hauteur - horizonDe(p.azimut));
  const croisement = (i) => {
    const a = marge[i - 1];
    const b = marge[i];
    const f = a === b ? 0 : a / (a - b);
    return Math.round(trajet[i - 1].t + f * (trajet[i].t - trajet[i - 1].t));
  };
  let lever = null;
  let coucher = null;
  for (let i = 1; i < trajet.length; i += 1) {
    if (lever === null && marge[i - 1] <= 0 && marge[i] > 0) lever = croisement(i);
    if (marge[i - 1] > 0 && marge[i] <= 0) coucher = croisement(i);
  }
  return { lever, coucher };
}
