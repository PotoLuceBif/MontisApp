// Atmosphère du globe au dézoom (demande du propriétaire du 14 novembre 2026, d'après Plans d'Apple) :
// liseré blanc-bleu sur le bord éclairé par le soleil, halo qui déborde dans l'espace, bord assombri côté nuit.
// Deux toiles : le halo derrière la carte (il ne se voit qu'autour du globe), le liseré par-dessus le bord du globe.
import { hauteurSoleil, pointADistance, pointSubsolaire } from './globe-nuit-calcul.js';
import { opaciteCiel } from './ciel-calcul.js';

const DIRECTIONS = 72; // échantillons autour du bord
const HALO = 0.09; // épaisseur du halo dans l'espace, en part du rayon
const LISERE = 0.07; // épaisseur du liseré sur le globe

const lisse = (a, b, v) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

function creerToile(map, avant) {
  const toile = document.createElement('canvas');
  toile.className = 'globe-atmosphere';
  toile.setAttribute('aria-hidden', 'true');
  map.getContainer().insertBefore(toile, avant);
  return toile;
}

export function initAtmosphere(map) {
  const conteneur = map.getContainer();
  const derriere = creerToile(map, map.getCanvasContainer());
  const dessus = creerToile(map, map.getCanvasContainer().nextSibling);
  let prevu = false;

  // Bord apparent du globe : le point le plus éloigné du centre à l'écran, le long de quatre directions
  function bordGlobe() {
    const c = map.getCenter();
    const distance = (az, angle) => {
      const p = pointADistance(c.lat, c.lng, az, angle);
      return map.project([p.lng, p.lat]);
    };
    const centre = map.project([c.lng, c.lat]);
    const limbe = (az) => {
      let meilleur = null;
      for (let angle = 40; angle <= 90; angle += 1) {
        const point = distance(az, angle);
        const d = Math.hypot(point.x - centre.x, point.y - centre.y);
        if (!meilleur || d > meilleur.d) meilleur = { d, angle, point };
      }
      return meilleur;
    };
    const est = limbe(90);
    const ouest = limbe(270);
    const nord = limbe(0);
    const sud = limbe(180);
    return {
      cx: (est.point.x + ouest.point.x) / 2,
      cy: (nord.point.y + sud.point.y) / 2,
      rayon: (Math.hypot(est.point.x - ouest.point.x, est.point.y - ouest.point.y) + Math.hypot(nord.point.x - sud.point.x, nord.point.y - sud.point.y)) / 4,
      angle: (est.angle + ouest.angle + nord.angle + sud.angle) / 4,
    };
  }

  // Lumière du bord, direction par direction : le soleil vu depuis ce point du bord
  function lumieresDuBord(bord) {
    const c = map.getCenter();
    const soleil = pointSubsolaire(new Date());
    const lumieres = [];
    for (let i = 0; i < DIRECTIONS; i += 1) {
      const az = (i * 360) / DIRECTIONS;
      const p = pointADistance(c.lat, c.lng, az, bord.angle);
      const ecran = map.project([p.lng, p.lat]);
      const h = hauteurSoleil(p.lat, p.lng, soleil);
      lumieres.push({ angleEcran: Math.atan2(ecran.y - bord.cy, ecran.x - bord.cx), jour: lisse(-12, 25, h) });
    }
    return lumieres.sort((a, b) => a.angleEcran - b.angleEcran);
  }

  function degradeAutour(contexte, bord, lumieres, couleur) {
    const conique = contexte.createConicGradient(-Math.PI, bord.cx, bord.cy);
    const arret = (angle) => (angle + Math.PI) / (2 * Math.PI);
    // Raccord à -180° / 180° : la moyenne des deux bouts, pour éviter une couture
    const raccord = couleur((lumieres[0].jour + lumieres.at(-1).jour) / 2);
    conique.addColorStop(0, raccord);
    for (const { angleEcran, jour } of lumieres) conique.addColorStop(Math.min(1, Math.max(0, arret(angleEcran))), couleur(jour));
    conique.addColorStop(1, raccord);
    return conique;
  }

  function preparer(toile) {
    const { clientWidth: l, clientHeight: h } = conteneur;
    const ratio = window.devicePixelRatio || 1;
    if (toile.width !== Math.round(l * ratio) || toile.height !== Math.round(h * ratio)) {
      toile.width = Math.round(l * ratio);
      toile.height = Math.round(h * ratio);
    }
    const contexte = toile.getContext('2d');
    contexte.setTransform(ratio, 0, 0, ratio, 0, 0);
    contexte.clearRect(0, 0, l, h);
    return contexte;
  }

  // Anneau entre deux rayons : couleur selon la direction, fondu du bord intérieur au bord extérieur
  function anneau(contexte, bord, interieur, exterieur, conique, fondu) {
    contexte.save();
    contexte.beginPath();
    contexte.arc(bord.cx, bord.cy, exterieur, 0, Math.PI * 2);
    contexte.arc(bord.cx, bord.cy, interieur, 0, Math.PI * 2, true);
    contexte.fillStyle = conique;
    contexte.fill();
    contexte.globalCompositeOperation = 'destination-in';
    const radial = contexte.createRadialGradient(bord.cx, bord.cy, interieur, bord.cx, bord.cy, exterieur);
    fondu.forEach(([position, alpha]) => radial.addColorStop(position, `rgba(0, 0, 0, ${alpha})`));
    contexte.fillStyle = radial;
    contexte.fillRect(0, 0, conteneur.clientWidth, conteneur.clientHeight);
    contexte.restore();
  }

  function dessiner() {
    prevu = false;
    const opacite = opaciteCiel(map.getZoom());
    derriere.hidden = opacite <= 0;
    dessus.hidden = opacite <= 0;
    if (opacite <= 0) return;
    const bord = bordGlobe();
    const lumieres = lumieresDuBord(bord);
    const r = bord.rayon;

    // Halo dans l'espace : vif contre le globe côté jour, il s'efface vers l'extérieur
    const fond = preparer(derriere);
    fond.globalAlpha = opacite;
    anneau(fond, bord, r * 0.98, r * (1 + HALO),
      degradeAutour(fond, bord, lumieres, (jour) => `rgba(${Math.round(150 + 105 * jour)}, ${Math.round(190 + 60 * jour)}, 255, ${0.08 + 0.85 * jour})`),
      [[0, 1], [0.12, 0.85], [0.45, 0.3], [1, 0]]);

    // Liseré sur le globe : brume claire au bord côté jour, bord assombri côté nuit
    const haut = preparer(dessus);
    haut.globalAlpha = opacite;
    anneau(haut, bord, r * (1 - LISERE), r * 1.002,
      degradeAutour(haut, bord, lumieres, (jour) => (jour > 0.15
        ? `rgba(225, 238, 255, ${0.75 * jour})`
        : `rgba(2, 4, 12, ${0.55 * (1 - jour / 0.15)})`)),
      [[0, 0], [0.55, 0.35], [1, 1]]);
  }

  function planifier() {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(dessiner);
  }

  map.on('move', () => {
    if (opaciteCiel(map.getZoom()) > 0 || !derriere.hidden) planifier();
  });
  map.on('resize', planifier);
  setInterval(() => {
    if (opaciteCiel(map.getZoom()) > 0) planifier(); // le soleil avance
  }, 60000);
  planifier();
}
