// Graphique de l'évolution d'une balise : vent moyen, rafales, minimum et cap sous l'axe du temps.
import { PALIERS_VENT, paletteInterface, palierVent } from './vent-cadran.js';
import { pointCardinal } from './vent-calcul.js';
import { depuisVent, nombre as formatNombre, versVent } from './unites.js';

const MARGE_GAUCHE = 30;
const MARGE_DROITE = 8;
const MARGE_HAUT = 8;
const HAUTEUR_AXE = 18;
const HAUTEUR_CAP = 38; // flèche et lettre sous l'axe
const ESPACE_FLECHES = 34;
const PAS_HEURES = { 3: 1, 6: 1, 12: 2, 24: 4 };
const HEURE = 60 * 60 * 1000;

// Moyenne d'angles par composantes : 350° et 10° donnent 0°, pas 180°
function capMoyen(points) {
  let x = 0;
  let y = 0;
  points.forEach(({ direction }) => {
    if (!Number.isFinite(direction)) return;
    x += Math.sin((direction * Math.PI) / 180);
    y += Math.cos((direction * Math.PI) / 180);
  });
  if (!x && !y) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

export function creerGraphiqueBalise(canvas, { onCurseur = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let points = [];
  let debut = 0;
  let fin = 1;
  let heures = 6;
  let curseur = null;
  let largeur = 0;
  let hauteur = 0;

  const basTrace = () => hauteur - HAUTEUR_AXE - HAUTEUR_CAP;
  const largeurTrace = () => Math.max(1, largeur - MARGE_GAUCHE - MARGE_DROITE);
  const xDe = (date) => MARGE_GAUCHE + ((date - debut) / (fin - debut)) * largeurTrace();
  const plafond = () => {
    const maximum = Math.max(0, ...points.map(({ rafale, moyenne }) => (Number.isFinite(rafale) ? rafale : moyenne)));
    return Math.max(20, Math.ceil(maximum / 10) * 10);
  };

  // Un trou dans les relevés coupe les courbes : on ne dessine pas ce qu'on ne sait pas
  function tronçons() {
    const ecarts = points.slice(1).map((point, index) => point.date - points[index].date).sort((a, b) => a - b);
    const seuil = Math.max(20 * 60 * 1000, (ecarts[ecarts.length >> 1] || 0) * 3);
    const resultat = [];
    points.forEach((point, index) => {
      if (!index || point.date - points[index - 1].date > seuil) resultat.push([]);
      resultat.at(-1).push(point);
    });
    return resultat;
  }

  function degrade(yDe, maximum, couleurs) {
    const gradient = ctx.createLinearGradient(0, yDe(0), 0, yDe(maximum));
    PALIERS_VENT.forEach((limite, index) => {
      const bas = index ? PALIERS_VENT[index - 1] : 0;
      if (bas >= maximum) return;
      gradient.addColorStop(bas / maximum, couleurs[index]);
      gradient.addColorStop(Math.min(1, limite / maximum), couleurs[index]);
    });
    if (PALIERS_VENT.at(-1) < maximum) {
      gradient.addColorStop(PALIERS_VENT.at(-1) / maximum, couleurs.at(-1));
      gradient.addColorStop(1, couleurs.at(-1));
    }
    return gradient;
  }

  function tracer(serie, valeur, yDe) {
    ctx.beginPath();
    serie.forEach((point, index) => {
      const x = xDe(point.date);
      const y = yDe(valeur(point));
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
  }

  function dessiner() {
    if (!largeur) return;
    ctx.clearRect(0, 0, largeur, hauteur);
    const style = getComputedStyle(canvas);
    const texte2 = style.getPropertyValue('--texte-2').trim();
    const texte = style.getPropertyValue('--texte').trim();
    const bord = style.getPropertyValue('--bord').trim();
    const surface = style.getPropertyValue('--surface').trim();
    const couleurRafale = style.getPropertyValue('--vent-rafale').trim();
    const couleurMinimum = style.getPropertyValue('--vent-min').trim();
    const police = style.fontFamily;
    const couleurs = paletteInterface();
    const maximum = plafond();
    const bas = basTrace();
    const yDe = (valeur) => bas - (valeur / maximum) * (bas - MARGE_HAUT);
    const droite = largeur - MARGE_DROITE;

    // Graduations de vitesse
    ctx.font = `10.5px ${police}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;
    // Graduations rondes dans l'unité choisie pour le vent
    const maximumAffiche = versVent(maximum);
    const pas = [1, 2, 5, 10, 20, 50].find((valeur) => maximumAffiche / valeur <= 6) ?? 100;
    for (let affichee = 0; affichee <= maximumAffiche + 1e-6; affichee += pas) {
      const valeur = depuisVent(affichee);
      const y = Math.round(yDe(valeur)) + 0.5;
      ctx.strokeStyle = bord;
      ctx.globalAlpha = valeur ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(MARGE_GAUCHE, y);
      ctx.lineTo(droite, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = texte2;
      ctx.fillText(formatNombre(affichee), MARGE_GAUCHE - 6, y);
    }

    // Heures rondes
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const pasHeures = PAS_HEURES[heures] || 1;
    const repere = new Date(debut);
    repere.setMinutes(0, 0, 0);
    while (repere.getTime() <= fin) {
      const temps = repere.getTime();
      if (temps >= debut && repere.getHours() % pasHeures === 0) {
        const x = xDe(temps);
        ctx.strokeStyle = bord;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, bas);
        ctx.lineTo(Math.round(x) + 0.5, bas + 4);
        ctx.stroke();
        if (x > MARGE_GAUCHE + 8 && x < droite - 8) {
          ctx.fillStyle = texte2;
          ctx.fillText(`${repere.getHours()}h`, x, bas + 15);
        }
      }
      repere.setTime(temps + HEURE);
    }

    if (!points.length) return;
    const series = tronçons();

    // Zone entre le minimum et les rafales, colorée selon la force du vent
    const gradient = degrade(yDe, maximum, couleurs);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.3;
    series.forEach((serie) => {
      if (serie.length < 2) return;
      ctx.beginPath();
      serie.forEach((point, index) => {
        const x = xDe(point.date);
        const y = yDe(Number.isFinite(point.rafale) ? point.rafale : point.moyenne);
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      [...serie].reverse().forEach((point) => {
        ctx.lineTo(xDe(point.date), yDe(Number.isFinite(point.minimum) ? point.minimum : point.moyenne));
      });
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    series.forEach((serie) => {
      // Minimum
      const avecMin = serie.filter(({ minimum }) => Number.isFinite(minimum));
      tracer(avecMin, ({ minimum }) => minimum, yDe);
      ctx.strokeStyle = couleurMinimum;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Rafales
      const avecRafale = serie.filter(({ rafale }) => Number.isFinite(rafale));
      tracer(avecRafale, ({ rafale }) => rafale, yDe);
      ctx.strokeStyle = couleurRafale;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      // Moyen
      tracer(serie, ({ moyenne }) => moyenne, yDe);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.6;
      ctx.stroke();
    });

    // Cap le long de l'axe du temps, moyenné par intervalle pour rester lisible
    const nombre = Math.max(2, Math.floor(largeurTrace() / ESPACE_FLECHES));
    const duree = (fin - debut) / nombre;
    const yFleche = hauteur - HAUTEUR_CAP + 11;
    const yLettre = hauteur - 2;
    ctx.font = `10px ${police}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = texte2;
    ctx.fillText('de', MARGE_GAUCHE - 6, yLettre); // la lettre dit d'où vient le vent, la flèche où il va
    ctx.textAlign = 'center';
    for (let index = 0; index < nombre; index += 1) {
      const a = debut + index * duree;
      const groupe = points.filter(({ date }) => date >= a && date < a + duree);
      const cap = capMoyen(groupe);
      if (cap === null) continue;
      const moyenne = groupe.reduce((total, { moyenne: valeur }) => total + valeur, 0) / groupe.length;
      ctx.save();
      ctx.translate(xDe(a + duree / 2), yFleche);
      ctx.rotate((((cap + 180) % 360) * Math.PI) / 180); // la flèche pointe où va le vent
      ctx.fillStyle = couleurs[palierVent(moyenne)];
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5.5, 4);
      ctx.lineTo(1.5, 2.4);
      ctx.lineTo(1.5, 8);
      ctx.lineTo(-1.5, 8);
      ctx.lineTo(-1.5, 2.4);
      ctx.lineTo(-5.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = texte2;
      ctx.fillText(pointCardinal(cap), xDe(a + duree / 2), yLettre);
    }

    if (curseur !== null && points[curseur]) {
      const point = points[curseur];
      const x = Math.round(xDe(point.date)) + 0.5;
      ctx.strokeStyle = texte;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, MARGE_HAUT);
      ctx.lineTo(x, bas);
      ctx.stroke();
      ctx.globalAlpha = 1;
      [point.rafale, point.minimum, point.moyenne].forEach((valeur, index) => {
        if (!Number.isFinite(valeur)) return;
        ctx.beginPath();
        ctx.arc(x, yDe(valeur), index === 2 ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = [couleurRafale, couleurMinimum, couleurs[palierVent(valeur)]][index];
        ctx.strokeStyle = surface;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
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

  function placerCurseur(index) {
    curseur = index;
    onCurseur(index === null ? null : points[index]);
    dessiner();
  }

  function indexProche(clientX) {
    const { left } = canvas.getBoundingClientRect();
    const date = debut + ((clientX - left - MARGE_GAUCHE) / largeurTrace()) * (fin - debut);
    let meilleur = null;
    let ecart = Infinity;
    points.forEach((point, index) => {
      const distance = Math.abs(point.date - date);
      if (distance < ecart) {
        ecart = distance;
        meilleur = index;
      }
    });
    return meilleur;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (points.length) placerCurseur(indexProche(event.clientX));
  });
  canvas.addEventListener('pointermove', (event) => {
    // Au doigt, seul un appui déplace le curseur ; la souris le déplace au survol
    if (!points.length || (event.pointerType === 'touch' && !event.buttons)) return;
    placerCurseur(indexProche(event.clientX));
  });
  canvas.addEventListener('pointerleave', (event) => {
    // Au doigt, la lecture reste affichée une fois le doigt levé
    if (event.pointerType === 'mouse' && curseur !== null) placerCurseur(null);
  });
  canvas.addEventListener('keydown', (event) => {
    if (!points.length || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    if (event.key === 'Escape') {
      if (curseur === null) return;
      event.stopPropagation();
      placerCurseur(null);
      return;
    }
    event.preventDefault();
    const pas = event.key === 'ArrowRight' ? 1 : -1;
    const depart = curseur === null ? points.length - 1 : curseur + pas;
    placerCurseur(Math.max(0, Math.min(points.length - 1, depart)));
  });

  new ResizeObserver(redimensionner).observe(canvas);
  new MutationObserver(dessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });

  return {
    // `heuresVoulues` : l'axe couvre toute la période, même si les relevés commencent plus tard
    definir(tous, heuresVoulues, maintenant = Date.now()) {
      heures = heuresVoulues;
      fin = maintenant;
      debut = fin - heures * HEURE;
      points = tous.filter(({ date }) => date >= debut && date <= fin);
      curseur = null;
      onCurseur(null);
      redimensionner();
      return points;
    },
  };
}
