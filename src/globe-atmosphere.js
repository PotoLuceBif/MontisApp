// Atmosphère du globe au dézoom (demande du propriétaire du 14 novembre 2026, d'après Plans d'Apple) :
// liseré blanc-bleu sur le bord éclairé par le soleil, halo qui déborde dans l'espace, bord assombri côté nuit.
// Deux toiles : le halo derrière la carte (il ne se voit qu'autour du globe), le liseré par-dessus le bord du globe.
import { hauteurSoleil, limbeGlobe, pointADistance, pointSubsolaire } from './globe-nuit-calcul.js';
import { opaciteCiel } from './ciel-calcul.js';
import { instantEspace, pleinJour } from './heure-espace.js';

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

  // Bord apparent du globe : les points du limbe, calculés depuis la caméra (carte inclinée ou non), puis
  // projetés à l'écran. Un point pris juste en deçà du bord reste visible, donc bien projeté.
  function bordGlobe() {
    const c = map.getCenter();
    const limbe = limbeGlobe({
      lat: c.lat, lng: c.lng, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(),
      fov: map.getVerticalFieldOfView(), hauteurEcran: conteneur.clientHeight,
    });
    const points = [];
    for (let i = 0; i < SECTEURS; i += 1) {
      const p = pointADistance(limbe.lat, limbe.lng, (i * 360) / SECTEURS, Math.max(1, limbe.angle - 0.4));
      const ecran = map.project([p.lng, p.lat]);
      if (Number.isFinite(ecran.x) && Number.isFinite(ecran.y)) points.push({ ...p, x: ecran.x, y: ecran.y });
    }
    // En perspective, le bord d'une sphère hors de l'axe de visée est une ellipse, allongée dans la direction
    // qui part du centre de l'écran : un cercle traversait le globe dès qu'on inclinait près d'un pôle.
    const mx = points.reduce((t, q) => t + q.x, 0) / points.length;
    const my = points.reduce((t, q) => t + q.y, 0) / points.length;
    const theta = Math.atan2(my - conteneur.clientHeight / 2, mx - conteneur.clientWidth / 2);
    const [cos, sin] = [Math.cos(theta), Math.sin(theta)];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const q of points) {
      q.u = (q.x - mx) * cos + (q.y - my) * sin;
      q.v = -(q.x - mx) * sin + (q.y - my) * cos;
      u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v);
    }
    const [uc, vc] = [(u0 + u1) / 2, (v0 + v1) / 2];
    const rayon = (v1 - v0) / 2;
    const etire = (u1 - u0) / 2 / rayon;
    return {
      cx: mx + uc * cos - vc * sin,
      cy: my + uc * sin + vc * cos,
      theta,
      etire,
      rayon,
      // Dans le repère de l'ellipse ramenée à un cercle
      limbe: points.map((q) => ({ ...q, angleEcran: Math.atan2(q.v - vc, (q.u - uc) / etire) })),
    };
  }

  // Lumière du bord, direction par direction : le soleil vu depuis ce point du bord
  function lumieresDuBord(bord) {
    const soleil = pleinJour() ? null : pointSubsolaire(new Date(instantEspace()));
    return bord.limbe
      .map((p) => ({ angleEcran: p.angleEcran, jour: lisse(-12, 25, hauteurSoleil(p.lat, p.lng, soleil)) }))
      .sort((u, v) => u.angleEcran - v.angleEcran);
  }

  function degradeAutour(contexte, bord, lumieres, couleur) {
    const conique = contexte.createConicGradient(-Math.PI, 0, 0);
    const arret = (angle) => (angle + Math.PI) / (2 * Math.PI);
    // Raccord à -180° / 180° : entre le dernier point et le premier, selon leur écart à la couture
    const [premier, dernier] = [lumieres[0], lumieres.at(-1)];
    const [avant, apres] = [Math.PI - dernier.angleEcran, premier.angleEcran + Math.PI];
    const raccord = couleur(avant + apres > 0 ? (premier.jour * avant + dernier.jour * apres) / (avant + apres) : premier.jour);
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
    // Repère de l'ellipse : centre, axe vers le centre de l'écran, étirement
    contexte.translate(bord.cx, bord.cy);
    contexte.rotate(bord.theta);
    contexte.scale(bord.etire, 1);
    contexte.beginPath();
    contexte.arc(0, 0, exterieur, 0, Math.PI * 2);
    contexte.arc(0, 0, interieur, 0, Math.PI * 2, true);
    contexte.fillStyle = conique;
    contexte.fill();
    contexte.globalCompositeOperation = 'destination-in';
    const radial = contexte.createRadialGradient(0, 0, interieur, 0, 0, exterieur);
    fondu.forEach(([position, alpha]) => radial.addColorStop(position, `rgba(0, 0, 0, ${alpha})`));
    contexte.fillStyle = radial;
    contexte.fillRect(-exterieur - 2, -exterieur - 2, 2 * exterieur + 4, 2 * exterieur + 4);
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
  window.addEventListener('montis:heure-espace', planifier);
  setInterval(() => {
    if (opaciteCiel(map.getZoom()) > 0) planifier(); // le soleil avance
  }, 60000);
  planifier();
}
