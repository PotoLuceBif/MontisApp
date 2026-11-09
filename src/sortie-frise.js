// Frise d'une sortie : des lignes empilées sur l'axe du temps (ou de la distance sans heure),
// comme la frise météo. Un appui ou un glissé choisit un instant ; chaque ligne en donne la valeur.
import { indiceProche } from './sortie-analyse.js';
import { t } from './i18n.js';

const HAUTEURS = { altitude: 58, vitesse: 34, vario: 34, cardio: 34, puissance: 30 };
const LEGENDE = 16;
const ECART = 8;
const AXE = 18;
const COULEURS = {
  altitude: '#7fb2ff',
  vitesse: '#4fc96a',
  vario: '#e7d23c',
  cardio: '#ff6b6b',
  puissance: '#c38bff',
};

// `lignes` : [{ id, cle, valeurs, texte(v), zero? }] ; `axe` : temps (ms) ou distance (m) croissants
// `texteAxe(valeur)` : étiquette de l'axe ; `onIndice(i)` : instant choisi par l'utilisateur
export function creerFriseSortie({ lignes, axe, texteAxe, onIndice = () => {}, onDebut = () => {} }) {
  const racine = document.createElement('div');
  racine.className = 'sortie-frise';
  const toile = document.createElement('canvas');
  toile.className = 'sortie-frise-toile';
  toile.tabIndex = 0;
  toile.setAttribute('role', 'slider');
  toile.setAttribute('aria-label', t('traces.frise-aria'));
  toile.setAttribute('aria-valuemin', '0');
  toile.setAttribute('aria-valuemax', String(axe.length - 1));
  racine.append(toile);

  let indice = 0;
  let largeur = 0;
  const hauteur = lignes.reduce((h, ligne) => h + LEGENDE + HAUTEURS[ligne.id] + ECART, 0) + AXE;
  const debut = axe[0];
  const etendue = Math.max(1, axe.at(-1) - debut);

  // Bornes de chaque ligne, sans les valeurs absentes ; le vario reste centré sur zéro
  const echelles = lignes.map(({ id, valeurs }) => {
    let min = Infinity;
    let max = -Infinity;
    for (const v of valeurs) {
      if (v == null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (id === 'vario') {
      const ampleur = Math.max(Math.abs(min), Math.abs(max), 0.5);
      return { min: -ampleur, max: ampleur };
    }
    if (id === 'vitesse' || id === 'puissance') min = 0;
    return max > min ? { min, max } : { min: min - 1, max: max + 1 };
  });

  const xDe = (i) => ((axe[i] - debut) / etendue) * largeur;

  function dessiner() {
    const ratio = window.devicePixelRatio || 1;
    largeur = toile.clientWidth || 320;
    toile.width = Math.round(largeur * ratio);
    toile.height = Math.round(hauteur * ratio);
    toile.style.height = `${hauteur}px`;
    const c = toile.getContext('2d');
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, largeur, hauteur);
    const style = getComputedStyle(racine);
    const texte = style.getPropertyValue('--texte').trim() || '#e8eef5';
    const texte2 = style.getPropertyValue('--texte-2').trim() || '#93a1b3';
    const bord = style.getPropertyValue('--bord').trim() || '#2a3440';
    c.font = `600 11px ${style.fontFamily}`;
    c.textBaseline = 'alphabetic';

    // Un point par colonne de pixel : une sortie de 20 000 points se dessine aussi vite qu'une petite
    const colonnes = Math.max(2, Math.round(largeur));
    const indices = Array.from({ length: colonnes }, (_, x) => indiceProche(axe, debut + (x / (colonnes - 1)) * etendue));

    let y = 0;
    lignes.forEach((ligne, k) => {
      const h = HAUTEURS[ligne.id];
      const { min, max } = echelles[k];
      const couleur = COULEURS[ligne.id];
      const haut = y + LEGENDE;
      const yDe = (v) => haut + h - ((v - min) / (max - min)) * h;

      // Légende : nom à gauche, valeur à l'instant choisi à droite
      c.fillStyle = texte2;
      c.textAlign = 'left';
      c.fillText(t(ligne.cle), 0, y + 11);
      const valeur = ligne.valeurs[indice];
      c.fillStyle = texte;
      c.textAlign = 'right';
      c.fillText(valeur != null && Number.isFinite(valeur) ? ligne.texte(valeur) : '—', largeur, y + 11);

      c.strokeStyle = bord;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, haut + h + 0.5);
      c.lineTo(largeur, haut + h + 0.5);
      c.stroke();
      if (ligne.id === 'vario') {
        c.setLineDash([2, 3]);
        c.beginPath();
        c.moveTo(0, yDe(0));
        c.lineTo(largeur, yDe(0));
        c.stroke();
        c.setLineDash([]);
      }

      c.beginPath();
      let commence = false;
      indices.forEach((i, x) => {
        const v = ligne.valeurs[i];
        if (v == null || !Number.isFinite(v)) {
          commence = false;
          return;
        }
        if (commence) c.lineTo(x, yDe(v));
        else c.moveTo(x, yDe(v));
        commence = true;
      });
      c.strokeStyle = couleur;
      c.lineWidth = 1.6;
      c.stroke();
      if (ligne.id === 'altitude') {
        c.lineTo(largeur, haut + h);
        c.lineTo(0, haut + h);
        c.closePath();
        const degrade = c.createLinearGradient(0, haut, 0, haut + h);
        degrade.addColorStop(0, `${couleur}66`);
        degrade.addColorStop(1, `${couleur}08`);
        c.fillStyle = degrade;
        c.fill();
      }
      y += LEGENDE + h + ECART;
    });

    // Axe : début et fin, et l'instant choisi en pastille
    c.fillStyle = texte2;
    c.textAlign = 'left';
    c.fillText(texteAxe(axe[0], 0), 0, hauteur - 4);
    c.textAlign = 'right';
    c.fillText(texteAxe(axe.at(-1), axe.length - 1), largeur, hauteur - 4);

    const x = xDe(indice);
    c.strokeStyle = texte;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x, LEGENDE - 2);
    c.lineTo(x, hauteur - AXE);
    c.stroke();
    const etiquette = texteAxe(axe[indice], indice);
    const l = c.measureText(etiquette).width + 12;
    const gauche = Math.min(largeur - l, Math.max(0, x - l / 2));
    c.fillStyle = texte;
    c.beginPath();
    if (c.roundRect) c.roundRect(gauche, hauteur - AXE + 1, l, AXE - 2, 8);
    else c.rect(gauche, hauteur - AXE + 1, l, AXE - 2);
    c.fill();
    c.fillStyle = style.getPropertyValue('--surface').trim() || '#10161f';
    c.textAlign = 'center';
    c.fillText(etiquette, gauche + l / 2, hauteur - 5);
  }

  function choisir(i, depuisUtilisateur = true) {
    indice = Math.max(0, Math.min(axe.length - 1, i));
    toile.setAttribute('aria-valuenow', String(indice));
    toile.setAttribute('aria-valuetext', texteAxe(axe[indice], indice));
    dessiner();
    if (depuisUtilisateur) onIndice(indice);
  }

  const indiceSous = (event) => {
    const cadre = toile.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - cadre.left) / cadre.width));
    return indiceProche(axe, debut + fraction * etendue);
  };
  let glisse = false;
  toile.addEventListener('pointerdown', (event) => {
    glisse = true;
    toile.setPointerCapture(event.pointerId);
    onDebut();
    choisir(indiceSous(event));
  });
  toile.addEventListener('pointermove', (event) => {
    if (glisse) choisir(indiceSous(event));
  });
  const finir = () => {
    glisse = false;
  };
  toile.addEventListener('pointerup', finir);
  toile.addEventListener('pointercancel', finir);
  toile.addEventListener('keydown', (event) => {
    const pas = Math.max(1, Math.round(axe.length / 100));
    const cible = { ArrowRight: indice + pas, ArrowLeft: indice - pas, Home: 0, End: axe.length - 1 }[event.key];
    if (cible == null) return;
    event.preventDefault();
    onDebut();
    choisir(cible);
  });

  const observateur = new ResizeObserver(() => dessiner());
  observateur.observe(toile);

  return {
    element: racine,
    get indice() {
      return indice;
    },
    // Placé par la lecture : pas d'appel à onIndice, la lecture s'en charge
    placer: (i) => choisir(i, false),
    dessiner,
    detruire: () => observateur.disconnect(),
  };
}
