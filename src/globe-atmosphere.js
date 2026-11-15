// Atmosphère du globe au dézoom (demande du propriétaire du 14 novembre 2026, d'après Plans d'Apple) :
// liseré blanc-bleu sur le bord éclairé par le soleil, halo qui déborde dans l'espace, bord assombri côté nuit.
// Deux toiles : le halo derrière la carte (il ne se voit qu'autour du globe), le liseré par-dessus le bord du globe.
import { hauteurSoleil, pointADistance, pointSubsolaire } from './globe-nuit-calcul.js';
import { opaciteCiel } from './ciel-calcul.js';

const SECTEURS = 48; // directions autour du bord
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

  // Bord apparent du globe. La carte inclinée, il n'est plus centré sur le centre de la carte : on projette
  // des points de toute la sphère, la face cachée tombant à l'intérieur du disque, et on prend leur enveloppe.
  function bordGlobe() {
    const c = map.getCenter();
    const points = [];
    for (let az = 0; az < 360; az += 10) {
      for (let angle = 14; angle <= 174; angle += 4) {
        const p = pointADistance(c.lat, c.lng, az, angle);
        const ecran = map.project([p.lng, p.lat]);
        if (Number.isFinite(ecran.x) && Number.isFinite(ecran.y)) points.push({ ...p, x: ecran.x, y: ecran.y });
      }
    }
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const { x, y } of points) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const bord = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rayon: (x1 - x0 + y1 - y0) / 4 };
    // Par direction à l'écran, le point le plus proche du bord : c'est lui qui dit s'il y fait jour
    const secteurs = new Array(SECTEURS).fill(null);
    for (const p of points) {
      const d = Math.hypot(p.x - bord.cx, p.y - bord.cy);
      if (d < bord.rayon * 0.9) continue;
      const angleEcran = Math.atan2(p.y - bord.cy, p.x - bord.cx);
      const i = Math.min(SECTEURS - 1, Math.floor(((angleEcran + Math.PI) / (2 * Math.PI)) * SECTEURS));
      if (!secteurs[i] || d > secteurs[i].d) secteurs[i] = { ...p, d, angleEcran };
    }
    bord.limbe = secteurs.filter(Boolean);
    return bord;
  }

  // Lumière du bord, direction par direction : le soleil vu depuis ce point du bord
  function lumieresDuBord(bord) {
    const soleil = pointSubsolaire(new Date());
    return bord.limbe
      .map((p) => ({ angleEcran: p.angleEcran, jour: lisse(-12, 25, hauteurSoleil(p.lat, p.lng, soleil)) }))
      .sort((u, v) => u.angleEcran - v.angleEcran);
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
    if (lumieres.length < 3) return;
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
