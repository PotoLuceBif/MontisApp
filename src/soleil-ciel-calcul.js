// Où dessiner le soleil à l'écran, d'après la caméra de la carte (calcul pur, testé).
// Caméra MapLibre : `pitch` 0 = regard vers le sol, `bearing` = cap du haut de l'écran, `fov` = champ vertical.
const RAD = Math.PI / 180;

// Position du soleil à l'écran, et `devant` s'il est devant la caméra
export function projeterSoleil({ azimut, hauteur }, { bearing, pitch, fov, largeur, hauteurEcran, padding = {} }) {
  const a = (azimut - bearing) * RAD;
  const h = hauteur * RAD;
  const p = pitch * RAD;
  const x = Math.sin(a) * Math.cos(h);
  const y = Math.cos(a) * Math.cos(h) * Math.cos(p) + Math.sin(h) * Math.sin(p);
  const z = Math.cos(a) * Math.cos(h) * Math.sin(p) - Math.sin(h) * Math.cos(p);
  const { top = 0, bottom = 0, left = 0, right = 0 } = padding;
  // Le centre de la perspective suit les marges de la carte
  const cx = left + (largeur - left - right) / 2;
  const cy = top + (hauteurEcran - top - bottom) / 2;
  // Direction du soleil à l'écran vue de la caméra : celle où il apparaîtrait en tournant la tête
  // (pour un soleil devant, c'est exactement la direction de son point projeté)
  const direction = { dx: x, dy: -y };
  if (z <= 1e-6) return { cx, cy, ...direction, devant: false };
  const focale = hauteurEcran / 2 / Math.tan((fov * RAD) / 2);
  return { cx, cy, ...direction, devant: true, x: cx + (focale * x) / z, y: cy - (focale * y) / z };
}

// Position de la caméra MapLibre : derrière le centre de la carte, à la distance qui donne ce zoom.
// `altitudeCentre` : altitude du sol au centre (relief exagéré compris), en mètres
const CIRCONFERENCE = 40075016.686;
export function positionCamera({ lng, lat, zoom, pitch, bearing, fov, hauteurEcran, altitudeCentre = 0 }) {
  const pixelsParMetre = (512 * 2 ** zoom) / (CIRCONFERENCE * Math.cos(lat * RAD));
  const distance = hauteurEcran / 2 / Math.tan((fov * RAD) / 2) / pixelsParMetre;
  const recul = distance * Math.sin(pitch * RAD);
  const b = bearing * RAD;
  return {
    lng: lng - (recul * Math.sin(b)) / ((CIRCONFERENCE / 360) * Math.cos(lat * RAD)),
    lat: lat - (recul * Math.cos(b)) / (CIRCONFERENCE / 360),
    altitude: altitudeCentre + distance * Math.cos(pitch * RAD),
  };
}

// À sa place s'il est à l'écran ; sinon au bord, dans sa direction vue de la caméra, perspective comprise
// (le prolongement exact de sa position quand il est devant, hors du cadre)
// `marge` (bord) : un nombre, ou { haut, bas, gauche, droite } pour éviter les boutons posés sur la carte.
// `margeVisible` : un soleil à moins de cette distance du bord de l'écran reste à sa vraie place
export function placerSoleil({ devant, x, y, cx, cy, dx: vx, dy: vy }, { largeur, hauteurEcran, marge = 0, margeVisible }) {
  const { haut = 0, bas = 0, gauche = 0, droite = 0 } = typeof marge === 'number'
    ? { haut: marge, bas: marge, gauche: marge, droite: marge }
    : marge;
  const v = margeVisible ?? (typeof marge === 'number' ? marge : 0);
  if (devant && x >= v && x <= largeur - v && y >= v && y <= hauteurEcran - v) {
    return { x, y, dedans: true };
  }
  // Droit derrière la caméra, sans direction : en bas
  const norme = Math.hypot(vx, vy);
  const dx = norme < 1e-9 ? 0 : vx / norme;
  const dy = norme < 1e-9 ? 1 : vy / norme;
  // Le bord se cherche depuis le centre de la perspective, ramené dans le cadre
  cx = Math.min(largeur - droite, Math.max(gauche, cx));
  cy = Math.min(hauteurEcran - bas, Math.max(haut, cy));
  const limites = [];
  if (dx > 1e-9) limites.push((largeur - droite - cx) / dx);
  if (dx < -1e-9) limites.push((gauche - cx) / dx);
  if (dy > 1e-9) limites.push((hauteurEcran - bas - cy) / dy);
  if (dy < -1e-9) limites.push((haut - cy) / dy);
  const s = Math.max(0, Math.min(...limites));
  const angle = (Math.atan2(dx, -dy) / RAD + 360) % 360; // 0 = vers le haut de l'écran
  return { x: cx + dx * s, y: cy + dy * s, dedans: false, angle };
}
