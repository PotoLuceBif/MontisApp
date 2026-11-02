// Profil d'un parcours, coloré selon la pente. Le toucher y lit un point précis du tracé.
import { paletteInterface } from './vent-cadran.js';
import { palierPente } from './parcours-analyse.js';

const MARGE_GAUCHE = 40;
const MARGE_DROITE = 8;
const MARGE_HAUT = 8;
const HAUTEUR_AXE = 18;
const PAS_KM = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];

export function creerProfilParcours(canvas, { onCurseur = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let analyse = null;
  let curseur = null;
  let largeur = 0;
  let hauteur = 0;

  const largeurTrace = () => Math.max(1, largeur - MARGE_GAUCHE - MARGE_DROITE);
  const xDe = (d) => MARGE_GAUCHE + (d / analyse.total) * largeurTrace();

  function dessiner() {
    if (!largeur) return;
    ctx.clearRect(0, 0, largeur, hauteur);
    if (!analyse) return;
    const style = getComputedStyle(canvas);
    const texte = style.getPropertyValue('--texte').trim();
    const texte2 = style.getPropertyValue('--texte-2').trim();
    const bord = style.getPropertyValue('--bord').trim();
    const surface = style.getPropertyValue('--surface').trim();
    const couleurs = paletteInterface();
    const { points, alts, pentes, altitudeMin, altitudeMax, total } = analyse;
    const marge = Math.max(10, (altitudeMax - altitudeMin) * 0.1);
    const bas = Math.floor((altitudeMin - marge) / 10) * 10;
    const haut = Math.ceil((altitudeMax + marge) / 10) * 10;
    const basTrace = hauteur - HAUTEUR_AXE;
    const yDe = (a) => basTrace - ((a - bas) / (haut - bas)) * (basTrace - MARGE_HAUT);

    ctx.font = `10.5px ${style.fontFamily}`;
    ctx.lineWidth = 1;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    [bas, (bas + haut) / 2, haut].forEach((valeur, index) => {
      const y = Math.round(yDe(valeur)) + 0.5;
      ctx.strokeStyle = bord;
      ctx.globalAlpha = index ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(MARGE_GAUCHE, y);
      ctx.lineTo(largeur - MARGE_DROITE, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = texte2;
      ctx.fillText(`${Math.round(valeur)} m`, MARGE_GAUCHE - 5, Math.max(6, y));
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const pasKm = PAS_KM.find((pas) => total / 1000 / pas <= 6) ?? 500;
    for (let km = pasKm; km * 1000 < total; km += pasKm) {
      ctx.fillStyle = texte2;
      ctx.fillText(`${km.toLocaleString('fr-FR')} km`, xDe(km * 1000), hauteur - 4);
    }

    // Colonnes colorées par la pente ; en descente, plus discrètes
    for (let i = 0; i < points.length - 1; i += 1) {
      const x0 = xDe(points[i].d);
      const x1 = xDe(points[i + 1].d);
      ctx.fillStyle = couleurs[palierPente(pentes[i])];
      ctx.globalAlpha = pentes[i] < 0 ? 0.45 : 0.85;
      ctx.beginPath();
      ctx.moveTo(x0, basTrace);
      ctx.lineTo(x0, yDe(alts[i]));
      ctx.lineTo(x1 + 0.5, yDe(alts[i + 1]));
      ctx.lineTo(x1 + 0.5, basTrace);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    points.forEach((point, i) => {
      if (i) ctx.lineTo(xDe(point.d), yDe(alts[i]));
      else ctx.moveTo(xDe(point.d), yDe(alts[i]));
    });
    ctx.strokeStyle = texte;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (curseur !== null && points[curseur]) {
      const x = Math.round(xDe(points[curseur].d)) + 0.5;
      ctx.strokeStyle = texte;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, MARGE_HAUT);
      ctx.lineTo(x, basTrace);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, yDe(alts[curseur]), 5, 0, Math.PI * 2);
      ctx.fillStyle = couleurs[palierPente(pentes[curseur])];
      ctx.strokeStyle = surface;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }

  function redimensionner() {
    largeur = canvas.clientWidth;
    hauteur = canvas.clientHeight;
    if (!largeur) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(largeur * ratio);
    canvas.height = Math.round(hauteur * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    dessiner();
  }

  function placer(index, depuisProfil = true) {
    curseur = index;
    if (depuisProfil) onCurseur(index);
    dessiner();
  }

  function indiceProche(clientX) {
    const { left } = canvas.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - left - MARGE_GAUCHE) / largeurTrace()));
    return Math.round(fraction * (analyse.points.length - 1));
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (analyse) placer(indiceProche(event.clientX));
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!analyse || (event.pointerType === 'touch' && !event.buttons)) return;
    placer(indiceProche(event.clientX));
  });
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && curseur !== null) placer(null);
  });
  canvas.addEventListener('keydown', (event) => {
    if (!analyse || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const dernier = analyse.points.length - 1;
    const depart = curseur ?? 0;
    placer(Math.max(0, Math.min(dernier, depart + (event.key === 'ArrowRight' ? 1 : -1))));
  });

  new ResizeObserver(redimensionner).observe(canvas);
  new MutationObserver(dessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });

  return {
    definir(nouvelle) {
      analyse = nouvelle;
      curseur = null;
      redimensionner();
    },
    // Depuis la carte : on déplace le curseur sans repasser par le rappel
    placerDepuisCarte(index) {
      placer(index, false);
    },
  };
}
