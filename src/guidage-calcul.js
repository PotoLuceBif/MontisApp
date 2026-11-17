// Calculs du mode guidage (« Démarrer la sortie ») : où l'on est sur la trace, ce qui reste,
// les repères à venir et les deux temps restants. Purs, testés.

const R = 6371000;
const RAD = Math.PI / 180;
const FENETRE_ARRIERE = 40; // points : on cherche d'abord autour de la dernière position (aller-retour, boucles qui se croisent)
const FENETRE_AVANT = 400;
const ECART_SUIVI = 60; // m : au-delà, la fenêtre ne suffit plus, on cherche sur toute la trace
export const ECART_HORS_TRACE = 50; // m : au-delà, on propose de rejoindre la trace
export const DISTANCE_REPERE = 200; // m de la trace au plus pour un repère
const COUVERT_MIN = 500; // m parcourus avant de se fier à l'allure mesurée
const TEMPS_MIN = 5 / 60; // h

// Point projeté sur un segment, en mètres dans un plan local (assez juste à quelques kilomètres près)
function projeter(p, a, b) {
  const cos = Math.cos(p.lat * RAD);
  const ax = (a.lng - p.lng) * RAD * R * cos;
  const ay = (a.lat - p.lat) * RAD * R;
  const bx = (b.lng - p.lng) * RAD * R * cos;
  const by = (b.lat - p.lat) * RAD * R;
  const dx = bx - ax;
  const dy = by - ay;
  const longueur2 = dx * dx + dy * dy;
  const f = longueur2 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / longueur2)) : 0;
  const x = ax + f * dx;
  const y = ay + f * dy;
  return { f, ecart: Math.hypot(x, y) };
}

function meilleurSegment(points, position, de, a) {
  let meilleur = null;
  for (let i = Math.max(0, de); i < Math.min(points.length - 1, a); i += 1) {
    const { f, ecart } = projeter(position, points[i], points[i + 1]);
    if (!meilleur || ecart < meilleur.ecart) meilleur = { indice: i, f, ecart };
  }
  return meilleur;
}

// points : [{ lng, lat, d }] (d : distance depuis le départ). precedent : indice de la position d'avant.
// Renvoie l'indice du point le plus proche, la distance parcourue sur la trace et l'écart à la trace.
export function situerSurTrace(points, position, precedent = null) {
  if (!points?.length) return null;
  if (points.length === 1) return { indice: 0, d: 0, ecart: projeter(position, points[0], points[0]).ecart };
  let segment = null;
  if (precedent !== null) {
    segment = meilleurSegment(points, position, precedent - FENETRE_ARRIERE, precedent + FENETRE_AVANT);
    if (segment && segment.ecart > ECART_SUIVI) segment = null;
  }
  segment = segment ?? meilleurSegment(points, position, 0, points.length);
  const { indice, f, ecart } = segment;
  const a = points[indice];
  const b = points[indice + 1];
  return { indice: f > 0.5 ? indice + 1 : indice, d: a.d + f * (b.d - a.d), ecart };
}

// Dénivelés cumulés avec un seuil, comme le profil (le bruit du relief ne compte pas)
export function deniveles(alts, seuil = 3) {
  if (!alts.length) return { plus: 0, moins: 0 };
  let ref = alts[0];
  let plus = 0;
  let moins = 0;
  for (let i = 1; i < alts.length; i += 1) {
    const ecart = alts[i] - ref;
    if (ecart >= seuil) {
      plus += ecart;
      ref = alts[i];
    } else if (ecart <= -seuil) {
      moins -= ecart;
      ref = alts[i];
    }
  }
  return { plus, moins };
}

// Ce qui reste depuis l'indice donné, et ce qui est fait jusque-là
export function restant({ points, alts, total }, indice, d = points[indice].d) {
  const devant = deniveles(alts.slice(indice));
  const derriere = deniveles(alts.slice(0, indice + 1));
  return { distance: Math.max(0, total - d), plus: devant.plus, moins: devant.moins, fait: { distance: d, plus: derriere.plus, moins: derriere.moins } };
}

// Repères (refuges, sommets…) à moins de distanceMax de la trace, rangés dans l'ordre du parcours.
// Un repère proche de deux passages (aller-retour) garde le premier.
export function reperesSurTrace(points, candidats, distanceMax = DISTANCE_REPERE) {
  const garde = [];
  for (const repere of candidats) {
    const place = situerSurTrace(points, repere);
    if (place && place.ecart <= distanceMax) garde.push({ ...repere, d: place.d, ecart: place.ecart });
  }
  return garde.sort((a, b) => a.d - b.d);
}

export function prochainsReperes(reperes, d, nombre = 3) {
  return reperes.filter((repere) => repere.d > d + 20).slice(0, nombre);
}

// Les deux temps restants, en heures.
// standard : modèle de la pratique (DIN 33466 pour la rando) appliqué à ce qui reste.
// personnel : d'abord l'allure du champ de l'éditeur, lue comme une allure à plat et rapportée à celle
// du modèle (le dénivelé reste compté) ; une fois assez parcouru, le rythme mesuré
// (temps écoulé / temps standard de ce qui est fait) appliqué au standard restant.
// ecart : avance (négatif) ou retard (positif) sur l'allure prévue, en heures.
export function tempsRestants({ duree, reste, allure = null, ecoule = 0 }) {
  const standard = duree(reste.distance, reste.plus, reste.moins);
  const standardFait = duree(reste.fait.distance, reste.fait.plus, reste.fait.moins);
  const reference = duree(1000, 0, 0); // heures par km à plat selon le modèle
  const coefficient = allure && reference > 0 ? allure / reference : 1;
  const mesure = reste.fait.distance >= COUVERT_MIN && ecoule >= TEMPS_MIN && standardFait > 0;
  const personnel = mesure ? standard * (ecoule / standardFait) : standard * coefficient;
  return { standard, personnel, mesure, ecart: mesure ? ecoule - standardFait * coefficient : null };
}

// ---------- Orientation ----------
const normaliser = (angle) => ((angle % 360) + 360) % 360;

// Cap du haut de l'écran (degrés, 0 = nord, sens horaire) depuis un événement d'orientation.
// iOS donne webkitCompassHeading (cap du haut de l'appareil) ; Android, avec
// deviceorientationabsolute, alpha compté dans le sens inverse. L'angle de l'écran
// (paysage) s'ajoute : le cône suit ce que l'on regarde.
export function capBoussole({ webkitCompassHeading, alpha, absolute }, angleEcran = 0) {
  let cap = null;
  if (Number.isFinite(webkitCompassHeading)) cap = webkitCompassHeading;
  else if (absolute && Number.isFinite(alpha)) cap = 360 - alpha;
  return cap === null ? null : normaliser(cap + (angleEcran || 0));
}

// Lissage d'un angle par le plus court chemin (359° puis 1° ne fait pas un tour)
export function lisserAngle(precedent, nouveau, facteur = 0.2) {
  if (nouveau === null || !Number.isFinite(nouveau)) return precedent;
  if (precedent === null || !Number.isFinite(precedent)) return normaliser(nouveau);
  const ecart = ((nouveau - precedent + 540) % 360) - 180;
  return normaliser(precedent + ecart * facteur);
}

export const VITESSE_ARRET = 0.6; // m/s : en dessous, le cap du GPS n'a plus de sens

// Cap de déplacement du GPS, ou null à l'arrêt ou sans valeur
export function capDeplacement({ heading, speed }) {
  if (heading === null || heading === undefined || !Number.isFinite(heading)) return null;
  if (!Number.isFinite(speed) || speed < VITESSE_ARRET) return null;
  return normaliser(heading);
}

// Heure d'arrivée estimée (Date), d'après le temps restant en heures
export function heureArrivee(maintenant, heures) {
  if (!Number.isFinite(heures) || heures < 0) return null;
  const pas = 5 * 60000; // arrondie à 5 min : c'est une estimation
  return new Date(Math.round((maintenant + heures * 3600000) / pas) * pas);
}
