// Bloc 3D du vent, en projection orthogonale : les distances se lisent à l'échelle.
// Repère en mètres : x vers l'est, y vers le nord, z altitude.
// Chaque flèche est un objet posé à plat dans l'espace : son cap à l'écran
// découle de la projection, il reste donc juste quels que soient l'angle et le zoom.
import { depuisAltitude, formatAltitude, imperial, valeurAltitude } from './unites.js';

const ELEVATION_DEFAUT = 32;
const ELEVATION_REFERENCE = (35 * Math.PI) / 180; // pour une échelle stable quand on incline
const MARGE_GAUCHE = 46;
const MARGE_DROITE = 52;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 4;
const ELEVATION_MIN = 0; // pile à l'horizontale
const ELEVATION_MAX = 90; // vue de dessus
const LUMIERE = (() => {
  const [x, y, z] = [-0.55, 0.6, 0.58];
  const norme = Math.hypot(x, y, z);
  return [x / norme, y / norme, z / norme];
})();

export function creerVolume3D(canvas, { couleur, rotationInitiale = 28, onRotation = () => {}, onSelection = () => {} }) {
  const ctx = canvas.getContext('2d');
  let rotation = rotationInitiale;
  let elevation = ELEVATION_DEFAUT;
  let zoom = 1;
  let largeur = 0;
  let hauteur = 0;
  let relief = null; // { demi, n, altitudes, min, max }
  let couches = [];
  let plafond = 2000;
  let exageration = 1;
  let sommets = null;
  let quads = [];
  let elements = [];
  let selection = null;
  let frame = null;
  let couleurs = {};

  const normaliserRotation = (degres) => ((degres + 180) % 360 + 360) % 360 - 180;

  function lireCouleurs() {
    const style = getComputedStyle(document.documentElement);
    const clair = !['sombre', 'cyberpunk'].includes(document.documentElement.dataset.theme);
    couleurs = {
      clair,
      texte: style.getPropertyValue('--texte').trim() || '#1b2a33',
      texte2: style.getPropertyValue('--texte-2').trim() || '#5c6b75',
      fond: style.getPropertyValue('--surface-2').trim() || '#eef3f6',
      accent: style.getPropertyValue('--accent').trim() || '#1f6fd1',
      arete: clair ? 'rgba(25, 48, 60, .42)' : 'rgba(225, 238, 245, .4)',
      halo: clair ? 'rgba(255, 255, 255, .6)' : 'rgba(10, 14, 18, .6)',
    };
  }

  function altitudeTerrain(x, y) {
    const { demi, n, altitudes } = relief;
    const fx = Math.max(0, Math.min(n - 1e-6, ((x + demi) / (2 * demi)) * n));
    const fy = Math.max(0, Math.min(n - 1e-6, ((y + demi) / (2 * demi)) * n));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = altitudes[iy * (n + 1) + ix];
    const b = altitudes[iy * (n + 1) + ix + 1];
    const c = altitudes[(iy + 1) * (n + 1) + ix];
    const d = altitudes[(iy + 1) * (n + 1) + ix + 1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  function hauteurTotale() {
    return relief.max - relief.min + plafond;
  }

  // La même exagération s'applique au relief et aux flèches : leurs rapports restent vrais
  function calculerExageration() {
    return Math.max(1, Math.min(8, (2 * relief.demi) / hauteurTotale()));
  }

  function preparerQuads() {
    const { n, altitudes, demi, min, max } = relief;
    const cote = (2 * demi) / n;
    const etendue = Math.max(1, max - min);
    const base = couleurs.clair ? [150, 168, 168] : [92, 112, 112];
    const haut = couleurs.clair ? [186, 198, 190] : [132, 150, 142];
    quads = [];
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const a = altitudes[iy * (n + 1) + ix];
        const b = altitudes[iy * (n + 1) + ix + 1];
        const c = altitudes[(iy + 1) * (n + 1) + ix];
        const d = altitudes[(iy + 1) * (n + 1) + ix + 1];
        const exagerationOmbre = Math.min(2, exageration); // au-delà, les versants tourneraient au noir
        const pentX = ((b + d - a - c) / 2) * exagerationOmbre / cote;
        const pentY = ((c + d - a - b) / 2) * exagerationOmbre / cote;
        const norme = Math.hypot(pentX, pentY, 1);
        const eclairage = (-pentX * LUMIERE[0] - pentY * LUMIERE[1] + LUMIERE[2]) / norme;
        const lumiere = Math.max(0.68, Math.min(1.2, 0.5 + eclairage * 0.72));
        const t = ((a + b + c + d) / 4 - min) / etendue;
        const rgb = base.map((composante, i) => Math.round((composante + (haut[i] - composante) * t) * lumiere));
        const m = couleurs.clair ? 0.86 : 1.16;
        quads.push({
          type: 0, d: 0, ix, iy,
          couleur: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
          maille: `rgb(${Math.round(rgb[0] * m)},${Math.round(rgb[1] * m)},${Math.round(rgb[2] * m)})`,
        });
      }
    }
    sommets = new Float32Array((n + 1) ** 2 * 3);
  }

  function reconstruireElements() {
    elements = quads.slice();
    if (!relief) return;
    couches.forEach((couche) => {
      couche.fleches.forEach((fleche) => {
        fleche.type = 1;
        elements.push(fleche);
      });
    });
    elements.push({ type: 2, d: 0 });
  }

  function creerProjection() {
    const theta = (rotation * Math.PI) / 180;
    const a = (elevation * Math.PI) / 180;
    const [c, s, ca, sa] = [Math.cos(theta), Math.sin(theta), Math.cos(a), Math.sin(a)];
    const diagonale = 2 * Math.SQRT2 * relief.demi;
    const utile = Math.max(40, largeur - MARGE_GAUCHE - MARGE_DROITE);
    const hauteurModele = hauteurTotale() * exageration;
    const e = zoom * Math.min(
      utile / diagonale,
      (hauteur - 30) / (diagonale * Math.sin(ELEVATION_REFERENCE) + hauteurModele * Math.cos(ELEVATION_REFERENCE))
    );
    const cx = MARGE_GAUCHE + utile / 2;
    const cy = hauteur / 2;
    const zMilieu = relief.min + hauteurTotale() / 2;
    return (x, y, z) => {
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      const rz = (z - zMilieu) * exageration;
      return [cx + e * rx, cy - e * (ry * sa + rz * ca), ry * ca - rz * sa];
    };
  }

  function dessinerSegment(a, b) {
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }

  function coinsBoite(projeter) {
    const { demi } = relief;
    const zHaut = relief.min + hauteurTotale();
    const coins = [[-demi, -demi], [demi, -demi], [demi, demi], [-demi, demi]];
    return coins.map(([x, y]) => ({
      x, y,
      bas: projeter(x, y, relief.min),
      haut: projeter(x, y, zHaut),
    }));
  }

  // Les arêtes derrière le bloc passent sous le relief, les autres par-dessus
  function dessinerAretes(coins, devant) {
    ctx.beginPath();
    coins.forEach((coin, index) => {
      const suivant = coins[(index + 1) % 4];
      for (const [a, b] of [[coin.bas, coin.haut], [coin.bas, suivant.bas], [coin.haut, suivant.haut]]) {
        if ((a[2] + b[2]) / 2 < 0 === devant) dessinerSegment(a, b);
      }
    });
    ctx.strokeStyle = couleurs.arete;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function dessinerRelief(element) {
    const n1 = relief.n + 1;
    const i = element.iy * n1 + element.ix;
    const indices = [i, i + 1, i + n1 + 1, i + n1];
    ctx.beginPath();
    indices.forEach((indice, rang) => {
      const x = sommets[indice * 3];
      const y = sommets[indice * 3 + 1];
      if (rang === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = element.couleur;
    ctx.strokeStyle = element.maille; // opaque : ferme aussi les jours entre deux facettes
    ctx.lineWidth = 0.7;
    ctx.fill();
    ctx.stroke();
  }

  function dessinerFleche(fleche) {
    const couleurFleche = couleur(fleche.vitesse);
    const [queue, pointe, gauche, droite, baseTete] = fleche.ecran;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    dessinerSegment(queue, baseTete);
    ctx.moveTo(pointe[0], pointe[1]);
    ctx.lineTo(gauche[0], gauche[1]);
    ctx.lineTo(droite[0], droite[1]);
    ctx.closePath();
    ctx.strokeStyle = couleurs.halo;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.beginPath();
    dessinerSegment(queue, baseTete);
    ctx.strokeStyle = couleurFleche;
    ctx.lineWidth = (fleche === selection ? 2.8 : 1.6) * Math.min(1.8, Math.sqrt(zoom));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pointe[0], pointe[1]);
    ctx.lineTo(gauche[0], gauche[1]);
    ctx.lineTo(droite[0], droite[1]);
    ctx.closePath();
    if (fleche.empennage) {
      const [haut, bas] = fleche.empennage;
      ctx.moveTo(pointe[0], pointe[1]);
      ctx.lineTo(haut[0], haut[1]);
      ctx.lineTo(bas[0], bas[1]);
      ctx.closePath();
    }
    ctx.fillStyle = couleurFleche;
    ctx.fill();
  }

  function dessinerCentre(point) {
    ctx.beginPath();
    ctx.arc(point[0], point[1], 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point[0], point[1], 3.6, 0, Math.PI * 2);
    ctx.fillStyle = '#d6402f';
    ctx.fill();
  }

  function texte(contenu, x, y, { alignement = 'left', couleurTexte = couleurs.texte2, gras = false } = {}) {
    ctx.font = `${gras ? 700 : 600} 10px system-ui, sans-serif`;
    ctx.textAlign = alignement;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = couleurs.fond;
    ctx.lineWidth = 3;
    ctx.strokeText(contenu, x, y);
    ctx.fillStyle = couleurTexte;
    ctx.fillText(contenu, x, y);
  }

  // Graduations : altitude réelle à gauche, hauteurs des couches à droite, distances au sol
  function dessinerAxes(projeter, coins) {
    const gauche = coins.reduce((meilleur, coin) => (coin.bas[0] < meilleur.bas[0] ? coin : meilleur));
    const droite = coins.reduce((meilleur, coin) => (coin.bas[0] > meilleur.bas[0] ? coin : meilleur));
    const zHaut = relief.min + hauteurTotale();
    // Graduations rondes dans l'unité affichée (m ou ft)
    const pasAffiche = imperial() ? (hauteurTotale() > 3200 ? 5000 : 2000) : (hauteurTotale() > 3200 ? 1000 : 500);
    const pas = depuisAltitude(pasAffiche);
    ctx.beginPath();
    const graduations = [];
    for (let z = Math.ceil(relief.min / pas) * pas; z <= zHaut; z += pas) {
      const point = projeter(gauche.x, gauche.y, z);
      ctx.moveTo(point[0] - 4, point[1]);
      ctx.lineTo(point[0], point[1]);
      graduations.push([z, point]);
    }
    ctx.strokeStyle = couleurs.arete;
    ctx.lineWidth = 1;
    ctx.stroke();
    let dernierY = Infinity;
    graduations.forEach(([z, point]) => {
      if (Math.abs(dernierY - point[1]) < 12) return;
      texte(formatAltitude(z, { pas: 10 }), point[0] - 6, point[1], { alignement: 'right' });
      dernierY = point[1];
    });

    dernierY = Infinity;
    couches.forEach((couche) => {
      const point = projeter(droite.x, droite.y, altitudeTerrain(droite.x, droite.y) + couche.hauteur);
      if (Math.abs(dernierY - point[1]) < 12) return;
      texte(`+${valeurAltitude(couche.hauteur, { pas: imperial() ? 10 : 1 })}`, point[0] + 5, point[1], { alignement: 'left' });
      dernierY = point[1];
    });

    const { demi } = relief;
    [['N', 0, demi], ['S', 0, -demi], ['E', demi, 0], ['O', -demi, 0]].forEach(([nom, x, y]) => {
      const point = projeter(x * 1.09, y * 1.09, relief.min);
      texte(nom, point[0], point[1], {
        alignement: 'center',
        gras: true,
        couleurTexte: nom === 'N' ? '#d6402f' : couleurs.texte2,
      });
    });
  }

  function rendreMaintenant() {
    frame = null;
    if (!largeur || !hauteur) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, largeur, hauteur);
    if (!relief) return;

    const projeter = creerProjection();
    const { n, demi, altitudes } = relief;
    const n1 = n + 1;
    for (let iy = 0; iy < n1; iy += 1) {
      for (let ix = 0; ix < n1; ix += 1) {
        const point = projeter(-demi + (2 * demi * ix) / n, -demi + (2 * demi * iy) / n, altitudes[iy * n1 + ix]);
        const i = (iy * n1 + ix) * 3;
        sommets[i] = point[0];
        sommets[i + 1] = point[1];
        sommets[i + 2] = point[2];
      }
    }

    const coteMaille = (2 * demi) / n;
    for (const element of elements) {
      if (element.type === 0) {
        const i = element.iy * n1 + element.ix;
        element.d = (sommets[i * 3 + 2] + sommets[(i + 1) * 3 + 2] + sommets[(i + n1) * 3 + 2] + sommets[(i + n1 + 1) * 3 + 2]) / 4;
      } else if (element.type === 1) {
        const { x, y, z, dx, dy, longueur } = element;
        const moitie = longueur / 2;
        const tete = Math.min(longueur * 0.4, Math.max(longueur * 0.2, coteMaille * 0.8));
        const queue = projeter(x - dx * moitie, y - dy * moitie, z);
        const pointe = projeter(x + dx * moitie, y + dy * moitie, z);
        const baseX = x + dx * (moitie - tete);
        const baseY = y + dy * (moitie - tete);
        const demiTete = tete * 0.4;
        const gauche = projeter(baseX - dy * demiTete, baseY + dx * demiTete, z);
        const droite = projeter(baseX + dy * demiTete, baseY - dx * demiTete, z);
        const baseTete = projeter(baseX, baseY, z);
        // Vue rasante : une tête à plat se réduit à un trait, on l'épaissit à la verticale
        // pour que le sens reste lisible, et rien ne change au-delà de 20° d'inclinaison
        const rasant = Math.max(0, 1 - elevation / 20);
        const hautTete = (demiTete * rasant) / exageration;
        element.ecran = [queue, pointe, gauche, droite, baseTete];
        element.empennage = rasant > 0 ? [projeter(baseX, baseY, z + hautTete), projeter(baseX, baseY, z - hautTete)] : null;
        // Une flèche longue survole plusieurs facettes : on la classe d'après son bout
        // le plus proche, sinon le sol situé juste devant la couperait en deux
        element.d = Math.min(queue[2], pointe[2]) - coteMaille;
      } else {
        const centre = projeter(0, 0, altitudeTerrain(0, 0));
        element.ecran = centre;
        element.d = centre[2] - coteMaille;
      }
    }
    elements.sort((a, b) => b.d - a.d);

    const coins = coinsBoite(projeter);
    dessinerAretes(coins, false);
    for (const element of elements) {
      if (element.type === 0) dessinerRelief(element);
      else if (element.type === 1) dessinerFleche(element);
      else dessinerCentre(element.ecran);
    }
    dessinerAretes(coins, true);
    dessinerAxes(projeter, coins);
  }

  function rendre() {
    if (frame === null) frame = requestAnimationFrame(rendreMaintenant);
  }

  function redimensionner() {
    const boite = canvas.getBoundingClientRect();
    largeur = boite.width;
    hauteur = boite.height;
    if (!largeur || !hauteur) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(largeur * ratio);
    canvas.height = Math.round(hauteur * ratio);
    rendreMaintenant();
  }

  function recentrer() {
    rotation = rotationInitiale;
    elevation = ELEVATION_DEFAUT;
    zoom = 1;
    onRotation(rotation);
    rendre();
  }

  // ---------- Gestes : 1 doigt tourne et incline, 2 doigts zooment ----------
  const pointeurs = new Map();
  let geste = null;
  let dernierTap = 0;

  function ecartPointeurs() {
    const [a, b] = [...pointeurs.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointeurs.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.classList.add('rotation-active');
    geste = pointeurs.size >= 2
      ? { type: 'zoom', ecart: ecartPointeurs(), zoom }
      : { type: 'rotation', x: event.clientX, y: event.clientY, rotation, elevation, deplace: false };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointeurs.has(event.pointerId)) return;
    event.stopPropagation();
    pointeurs.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (geste?.type === 'zoom' && pointeurs.size >= 2) {
      zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, geste.zoom * (ecartPointeurs() / Math.max(1, geste.ecart))));
      rendre();
    } else if (geste?.type === 'rotation') {
      const dx = event.clientX - geste.x;
      const dy = event.clientY - geste.y;
      if (Math.hypot(dx, dy) > 6) geste.deplace = true;
      if (!geste.deplace) return;
      rotation = normaliserRotation(geste.rotation + dx * 0.6);
      elevation = Math.max(ELEVATION_MIN, Math.min(ELEVATION_MAX, geste.elevation + dy * 0.35));
      rendre();
    }
  });

  function selectionnerProche(event) {
    const boite = canvas.getBoundingClientRect();
    const x = event.clientX - boite.left;
    const y = event.clientY - boite.top;
    let meilleure = null;
    let distanceMin = 26;
    couches.forEach((couche) => couche.fleches.forEach((fleche) => {
      if (!fleche.ecran) return;
      const [queue, pointe] = fleche.ecran;
      const distance = Math.hypot((queue[0] + pointe[0]) / 2 - x, (queue[1] + pointe[1]) / 2 - y);
      if (distance < distanceMin) {
        distanceMin = distance;
        meilleure = fleche;
      }
    }));
    selection = meilleure;
    onSelection(meilleure);
    rendre();
  }

  function finGeste(event) {
    if (!pointeurs.has(event.pointerId)) return;
    pointeurs.delete(event.pointerId);
    if (geste?.type === 'rotation' && !geste.deplace && event.type === 'pointerup') {
      const maintenant = performance.now();
      if (maintenant - dernierTap < 320) {
        recentrer();
        dernierTap = 0;
      } else {
        dernierTap = maintenant;
        selectionnerProche(event);
      }
    }
    if (geste?.type === 'rotation') onRotation(rotation);
    if (pointeurs.size === 0) {
      geste = null;
      canvas.classList.remove('rotation-active');
    } else {
      // Un doigt reste posé : la rotation repart de là, sans saut
      const [reste] = [...pointeurs.values()];
      geste = { type: 'rotation', x: reste.x, y: reste.y, rotation, elevation, deplace: true };
    }
  }
  canvas.addEventListener('pointerup', finGeste);
  canvas.addEventListener('pointercancel', finGeste);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * Math.exp(-event.deltaY * 0.0015)));
    rendre();
  }, { passive: false });

  canvas.addEventListener('keydown', (event) => {
    const pas = event.shiftKey ? 30 : 10;
    if (event.key === 'ArrowLeft') rotation = normaliserRotation(rotation - pas);
    else if (event.key === 'ArrowRight') rotation = normaliserRotation(rotation + pas);
    else if (event.key === 'ArrowUp') elevation = Math.min(ELEVATION_MAX, elevation + 5);
    else if (event.key === 'ArrowDown') elevation = Math.max(ELEVATION_MIN, elevation - 5);
    else if (event.key === '+' || event.key === '=') zoom = Math.min(ZOOM_MAX, zoom * 1.15);
    else if (event.key === '-') zoom = Math.max(ZOOM_MIN, zoom / 1.15);
    else return;
    event.preventDefault();
    onRotation(rotation);
    rendre();
  });

  new ResizeObserver(redimensionner).observe(canvas);
  lireCouleurs();

  return {
    altitudeTerrain,
    definirRelief(nouveauRelief) {
      relief = nouveauRelief;
      couches = [];
      selection = null;
      exageration = calculerExageration();
      preparerQuads();
      reconstruireElements();
      rendre();
    },
    // couches : [{ hauteur, fleches: [{ x, y, z, dx, dy, longueur, vitesse, flux, provenance }] }]
    definirCouches(nouvellesCouches, nouveauPlafond) {
      if (!relief) return;
      couches = nouvellesCouches;
      selection = null;
      onSelection(null);
      if (nouveauPlafond !== plafond) {
        plafond = nouveauPlafond;
        exageration = calculerExageration();
        preparerQuads();
      }
      reconstruireElements();
      rendre();
    },
    get exageration() {
      return exageration;
    },
    get rotation() {
      return rotation;
    },
    actualiserTheme() {
      lireCouleurs();
      if (relief) {
        preparerQuads();
        reconstruireElements();
      }
      rendre();
    },
    recentrer,
    rendre,
  };
}
