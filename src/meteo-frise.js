// Frise météo heure par heure : des lignes empilées sur un même axe du temps, et une lecture
// de l'heure touchée. Commune à Météo › Conditions locales et à la fiche du point.
import { PALIERS_VENT, paletteInterface, palierVent } from './vent-cadran.js';
import { pointCardinal } from './vent-calcul.js';
import {
  bornesEchelle,
  changementsDeJour,
  directionMoyenne,
  estNeige,
  niveauOrage,
  plafondPluie,
  plafondVent,
} from './frise-calcul.js';
import {
  formatAltitude,
  formatNeige,
  formatPluie,
  formatTemp,
  formatVent,
  imperial,
  pourcent,
  versAltitude,
  versTemp,
} from './unites.js';
import { lire, ecrire } from './reglages.js';
import { nomJour, t, ta, ti, poser } from './i18n.js';

// Champs horaires d'Open-Meteo que la frise sait lire
export const CHAMPS_FRISE = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'snowfall',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'cape',
  'cloud_cover_low',
  'freezing_level_height',
];

// Hauteur du tracé de chaque ligne, sans sa légende
const LIGNES = {
  temperature: 40,
  precipitations: 30,
  vent: 44,
  orage: 12,
  nuages: 12,
  isotherme: 36,
};
const ORDRE = Object.keys(LIGNES);
const LEGENDE = 15; // titre et résumé au-dessus de chaque tracé
const ECART = 7;
const AXE = 18;
const MARGE = 2;
const FLECHES = 13; // flèches de direction sous le vent
const CLE_REGLAGE = 'meteo-frise-lignes';

const NIVEAUX_ORAGE = ['frise.orage-0', 'frise.orage-1', 'frise.orage-2', 'frise.orage-3'];

export function creerFrise({ lignes = null, choix = true, onHeure = () => {} } = {}) {
  const section = document.createElement('div');
  section.className = 'frise';
  section.innerHTML = `
    <div class="frise-outils">
      <p class="frise-aide" ${ti('frise.aide')}>${t('frise.aide')}</p>
      ${choix ? `<button type="button" class="frise-bouton-lignes" aria-expanded="false">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>
        <span ${ti('frise.lignes')}>${t('frise.lignes')}</span>
      </button>` : ''}
    </div>
    ${choix ? `<div class="frise-choix" role="group" hidden ${ta('aria-label', 'frise.lignes-aria')}></div>` : ''}
    <canvas class="frise-graphique" tabindex="0" role="img" ${ta('aria-label', 'frise.aria')}></canvas>
    <div class="frise-lecture" aria-live="polite"></div>
    <p class="frise-legende" hidden></p>
    <p class="frise-note" hidden></p>
  `;
  const canvas = section.querySelector('canvas');
  const lecture = section.querySelector('.frise-lecture');
  const note = section.querySelector('.frise-note');
  const legendeOrage = section.querySelector('.frise-legende');
  const boutonLignes = section.querySelector('.frise-bouton-lignes');
  const zoneChoix = section.querySelector('.frise-choix');
  const ctx = canvas.getContext('2d');

  const lignesFixes = Array.isArray(lignes);
  let visibles = lignesFixes ? lignes : lireLignes();
  let donnees = null;
  let indices = [];
  let elevation = null;
  let curseur = 0; // rang dans `indices`
  let largeur = 0;
  let hauteur = 0;
  let pas = 0;

  function lireLignes() {
    const enregistre = lire(CLE_REGLAGE, null);
    const valides = Array.isArray(enregistre) ? ORDRE.filter((id) => enregistre.includes(id)) : [];
    return valides.length ? valides : [...ORDRE];
  }

  // Une ligne n'apparaît que si le modèle fournit sa donnée
  const disponible = (id) => {
    if (!donnees) return false;
    const champ = {
      temperature: 'temperature_2m',
      precipitations: 'precipitation',
      vent: 'wind_speed_10m',
      orage: 'cape',
      nuages: 'cloud_cover_low',
      isotherme: 'freezing_level_height',
    }[id];
    return indices.some((index) => Number.isFinite(donnees[champ]?.[index]) || (id === 'orage' && Number.isFinite(donnees.weather_code?.[index])));
  };
  const affichees = () => ORDRE.filter((id) => visibles.includes(id) && disponible(id));
  const valeur = (champ, rang) => donnees?.[champ]?.[indices[rang]];

  // --- Choix des lignes ---
  function construireChoix() {
    if (!zoneChoix) return;
    zoneChoix.replaceChildren();
    ORDRE.forEach((id) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = `frise-puce frise-puce-${id}`;
      bouton.dataset.ligne = id;
      bouton.setAttribute('aria-pressed', String(visibles.includes(id)));
      poser(bouton, `frise.${id}`);
      zoneChoix.appendChild(bouton);
    });
  }
  boutonLignes?.addEventListener('click', () => {
    const ouvrir = zoneChoix.hidden;
    zoneChoix.hidden = !ouvrir;
    boutonLignes.setAttribute('aria-expanded', String(ouvrir));
  });
  zoneChoix?.addEventListener('click', (event) => {
    const bouton = event.target.closest('.frise-puce');
    if (!bouton) return;
    const id = bouton.dataset.ligne;
    const actif = visibles.includes(id);
    // Toujours au moins une ligne : sinon la frise n'aurait plus de sens
    if (actif && visibles.length === 1) return;
    visibles = actif ? visibles.filter((autre) => autre !== id) : ORDRE.filter((autre) => autre === id || visibles.includes(autre));
    ecrire(CLE_REGLAGE, visibles);
    bouton.setAttribute('aria-pressed', String(!actif));
    rendre();
  });
  construireChoix();

  // --- Géométrie ---
  const hauteurLigne = (id) => LEGENDE + LIGNES[id] + (id === 'vent' ? FLECHES : 0);
  const hauteurTotale = () => affichees().reduce((total, id) => total + hauteurLigne(id) + ECART, MARGE) + AXE;
  const xCentre = (rang) => MARGE + (rang + 0.5) * pas;
  const xBord = (rang) => MARGE + rang * pas;

  function couleurs() {
    const style = getComputedStyle(section);
    const lireVar = (nom) => style.getPropertyValue(nom).trim();
    return {
      texte: lireVar('--texte'),
      texte2: lireVar('--texte-2'),
      bord: lireVar('--bord'),
      surface: lireVar('--surface'),
      accent: lireVar('--accent'),
      chaud: lireVar('--frise-chaud'),
      froid: lireVar('--frise-froid'),
      pluie: lireVar('--frise-pluie'),
      neige: lireVar('--frise-neige'),
      iso: lireVar('--frise-iso'),
      rafale: lireVar('--vent-rafale'),
      orage: [null, lireVar('--orage-1'), lireVar('--orage-2'), lireVar('--orage-3')],
      vent: paletteInterface(),
      police: style.fontFamily,
    };
  }

  function legende(c, y, titre, resume) {
    ctx.font = `600 10.5px ${c.police}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.texte;
    ctx.fillText(titre, MARGE, y + 10);
    if (resume) {
      ctx.font = `500 10px ${c.police}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = c.texte2;
      ctx.fillText(resume, largeur - MARGE, y + 10);
    }
  }

  // Courbe continue, coupée là où la donnée manque
  function courbe(champ, yDe) {
    ctx.beginPath();
    let ouvert = false;
    indices.forEach((_, rang) => {
      const v = valeur(champ, rang);
      if (!Number.isFinite(v)) {
        ouvert = false;
        return;
      }
      if (ouvert) ctx.lineTo(xCentre(rang), yDe(v));
      else ctx.moveTo(xCentre(rang), yDe(v));
      ouvert = true;
    });
  }

  function extremes(champ) {
    const valeurs = indices.map((_, rang) => valeur(champ, rang)).filter(Number.isFinite);
    return valeurs.length ? { min: Math.min(...valeurs), max: Math.max(...valeurs) } : null;
  }

  // --- Lignes ---
  function dessinerTemperature(c, y) {
    const ext = extremes('temperature_2m');
    legende(c, y, t('frise.temperature'), ext && t('frise.min-max', { min: formatTemp(ext.min, { court: true }), max: formatTemp(ext.max, { court: true }) }));
    const haut = y + LEGENDE;
    const h = LIGNES.temperature;
    const degres = indices.map((_, rang) => versTemp(valeur('temperature_2m', rang)));
    const bornes = bornesEchelle(degres, { pas: imperial() ? 5 : 2, ecartMin: imperial() ? 10 : 6 });
    if (!bornes) return null;
    const yDe = (celsius) => haut + h - ((versTemp(celsius) - bornes.bas) / (bornes.haut - bornes.bas)) * h;
    // Le gel en couleur froide, le reste en couleur chaude
    const yZero = Math.max(haut, Math.min(haut + h, yDe(0)));
    const degrade = ctx.createLinearGradient(0, haut, 0, haut + h);
    const coupure = (yZero - haut) / h;
    degrade.addColorStop(0, c.chaud);
    degrade.addColorStop(coupure, c.chaud);
    degrade.addColorStop(coupure, c.froid);
    degrade.addColorStop(1, c.froid);
    if (yZero > haut && yZero < haut + h) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = c.froid;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGE, Math.round(yZero) + 0.5);
      ctx.lineTo(largeur - MARGE, Math.round(yZero) + 0.5);
      ctx.stroke();
      ctx.restore();
    }
    courbe('temperature_2m', yDe);
    ctx.strokeStyle = degrade;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    return { yDe, champ: 'temperature_2m', couleur: (v) => (v < 0 ? c.froid : c.chaud) };
  }

  function dessinerPrecipitations(c, y) {
    const total = indices.reduce((somme, _, rang) => somme + (valeur('precipitation', rang) || 0), 0);
    const neige = indices.reduce((somme, _, rang) => somme + (valeur('snowfall', rang) || 0), 0);
    const resume = total < 0.05
      ? t('frise.sec')
      : neige >= 0.5
        ? t('frise.total-neige', { pluie: formatPluie(total), neige: formatNeige(neige) })
        : t('frise.total', { valeur: formatPluie(total) });
    legende(c, y, t('frise.precipitations'), resume);
    const haut = y + LEGENDE;
    const h = LIGNES.precipitations;
    const plafond = plafondPluie(indices.map((_, rang) => valeur('precipitation', rang)));
    ctx.fillStyle = c.bord;
    ctx.fillRect(MARGE, haut + h - 0.5, largeur - 2 * MARGE, 1);
    indices.forEach((_, rang) => {
      const mm = valeur('precipitation', rang);
      if (!Number.isFinite(mm) || mm <= 0) return;
      const barre = Math.max(2, (Math.min(mm, plafond) / plafond) * h);
      ctx.fillStyle = estNeige(mm, valeur('snowfall', rang)) ? c.neige : c.pluie;
      const l = Math.max(2, pas * 0.68);
      ctx.beginPath();
      ctx.roundRect(xCentre(rang) - l / 2, haut + h - barre, l, barre, [2, 2, 0, 0]);
      ctx.fill();
    });
    // Probabilité en pointillé, de 0 à 100 % sur la hauteur de la ligne
    ctx.save();
    ctx.setLineDash([2, 2.5]);
    ctx.strokeStyle = c.texte2;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.8;
    courbe('precipitation_probability', (p) => haut + h - (p / 100) * h);
    ctx.stroke();
    ctx.restore();
  }

  function dessinerVent(c, y) {
    const rafales = indices.map((_, rang) => valeur('wind_gusts_10m', rang));
    const moyens = indices.map((_, rang) => valeur('wind_speed_10m', rang));
    const maxRafale = Math.max(...rafales.filter(Number.isFinite));
    legende(c, y, t('frise.vent'), Number.isFinite(maxRafale) ? t('frise.rafales-max', { valeur: formatVent(maxRafale) }) : '');
    const haut = y + LEGENDE;
    const h = LIGNES.vent;
    const plafond = plafondVent([...rafales, ...moyens]);
    const yDe = (kmh) => haut + h - (kmh / plafond) * h;
    // Même dégradé par paliers que le graphique des balises
    const degrade = ctx.createLinearGradient(0, yDe(0), 0, yDe(plafond));
    PALIERS_VENT.forEach((limite, index) => {
      const bas = index ? PALIERS_VENT[index - 1] : 0;
      if (bas >= plafond) return;
      degrade.addColorStop(bas / plafond, c.vent[index]);
      degrade.addColorStop(Math.min(1, limite / plafond), c.vent[index]);
    });
    if (PALIERS_VENT.at(-1) < plafond) {
      degrade.addColorStop(PALIERS_VENT.at(-1) / plafond, c.vent.at(-1));
      degrade.addColorStop(1, c.vent.at(-1));
    }
    ctx.fillStyle = c.bord;
    ctx.fillRect(MARGE, haut + h - 0.5, largeur - 2 * MARGE, 1);
    // Zone jusqu'aux rafales
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = degrade;
    ctx.beginPath();
    let ouvert = false;
    let premier = null;
    let dernier = null;
    indices.forEach((_, rang) => {
      const v = Number.isFinite(rafales[rang]) ? rafales[rang] : moyens[rang];
      if (!Number.isFinite(v)) return;
      if (ouvert) ctx.lineTo(xCentre(rang), yDe(v));
      else ctx.moveTo(xCentre(rang), yDe(v));
      ouvert = true;
      premier ??= rang;
      dernier = rang;
    });
    if (ouvert) {
      ctx.lineTo(xCentre(dernier), haut + h);
      ctx.lineTo(xCentre(premier), haut + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Rafales en trait fin, vent moyen en trait épais
    courbe('wind_gusts_10m', yDe);
    ctx.strokeStyle = c.rafale;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    courbe('wind_speed_10m', yDe);
    ctx.strokeStyle = degrade;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Flèches de direction, groupées pour garder de la place entre elles
    const groupe = [1, 2, 3, 4, 6].find((n) => n * pas >= 24) ?? 6;
    const yFleche = haut + h + FLECHES / 2 + 1;
    for (let debut = 0; debut < indices.length; debut += groupe) {
      const rangs = indices.slice(debut, debut + groupe).map((_, i) => debut + i);
      const direction = directionMoyenne(rangs.map((rang) => valeur('wind_direction_10m', rang)));
      if (direction === null) continue;
      const vitesses = rangs.map((rang) => moyens[rang]).filter(Number.isFinite);
      const moyenne = vitesses.length ? vitesses.reduce((a, b) => a + b, 0) / vitesses.length : 0;
      const x = (xBord(debut) + xBord(Math.min(indices.length, debut + groupe))) / 2;
      ctx.save();
      ctx.translate(x, yFleche);
      ctx.rotate((((direction + 180) % 360) * Math.PI) / 180); // la flèche pointe où va le vent
      ctx.fillStyle = c.vent[palierVent(moyenne)];
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(4, 3);
      ctx.lineTo(1.1, 1.8);
      ctx.lineTo(1.1, 5.5);
      ctx.lineTo(-1.1, 5.5);
      ctx.lineTo(-1.1, 1.8);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return { yDe, champ: 'wind_speed_10m', couleur: (v) => c.vent[palierVent(v)] };
  }

  function bande(c, y, valeurCase) {
    const haut = y + LEGENDE;
    const h = LIGNES.orage;
    ctx.fillStyle = c.bord;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.roundRect(MARGE, haut, largeur - 2 * MARGE, h, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
    indices.forEach((_, rang) => {
      const remplissage = valeurCase(rang);
      if (!remplissage) return;
      ctx.globalAlpha = remplissage.opacite ?? 1;
      ctx.fillStyle = remplissage.couleur;
      ctx.beginPath();
      ctx.roundRect(xBord(rang) + 0.5, haut, Math.max(1, pas - 1), h, 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function dessinerOrage(c, y) {
    const niveaux = indices.map((_, rang) => niveauOrage(valeur('cape', rang), valeur('weather_code', rang)));
    const pire = Math.max(0, ...niveaux);
    legende(c, y, t('frise.orage'), t(NIVEAUX_ORAGE[pire]));
    bande(c, y, (rang) => (niveaux[rang] ? { couleur: c.orage[niveaux[rang]] } : null));
  }

  function dessinerNuages(c, y) {
    const ext = extremes('cloud_cover_low');
    legende(c, y, t('frise.nuages'), ext ? t('frise.max', { valeur: pourcent(ext.max) }) : '');
    bande(c, y, (rang) => {
      const p = valeur('cloud_cover_low', rang);
      return Number.isFinite(p) && p >= 5 ? { couleur: c.texte2, opacite: 0.15 + (p / 100) * 0.75 } : null;
    });
  }

  function dessinerIsotherme(c, y) {
    const ext = extremes('freezing_level_height');
    const resume = ext
      ? Math.round(ext.min / 50) === Math.round(ext.max / 50)
        ? formatAltitude(ext.min, { pas: 50 })
        : t('frise.entre', { min: formatAltitude(ext.min, { pas: 50 }), max: formatAltitude(ext.max, { pas: 50 }) })
      : '';
    legende(c, y, t('frise.isotherme'), resume);
    const haut = y + LEGENDE;
    const h = LIGNES.isotherme;
    const valeurs = indices.map((_, rang) => versAltitude(valeur('freezing_level_height', rang)));
    const lieu = Number.isFinite(elevation) ? versAltitude(elevation) : null;
    const bornes = bornesEchelle(valeurs, { pas: imperial() ? 1000 : 250, ecartMin: imperial() ? 2000 : 500, inclure: lieu === null ? [] : [lieu] });
    if (!bornes) return null;
    const yDe = (m) => haut + h - ((versAltitude(m) - bornes.bas) / (bornes.haut - bornes.bas)) * h;
    if (lieu !== null) {
      const yLieu = Math.round(yDe(elevation)) + 0.5;
      // Gel au lieu : l'isotherme passe sous son altitude
      ctx.save();
      ctx.fillStyle = c.iso;
      ctx.globalAlpha = 0.2;
      indices.forEach((_, rang) => {
        const iso = valeur('freezing_level_height', rang);
        if (Number.isFinite(iso) && iso < elevation) ctx.fillRect(xBord(rang), yLieu, pas, yDe(iso) - yLieu);
      });
      ctx.restore();
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = c.texte2;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGE, yLieu);
      ctx.lineTo(largeur - MARGE, yLieu);
      ctx.stroke();
      ctx.restore();
      ctx.font = `500 9.5px ${c.police}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = c.texte2;
      const etiquette = t('frise.lieu', { altitude: formatAltitude(elevation, { pas: 10 }) });
      // Sous la ligne si elle est en haut du tracé, au-dessus sinon
      ctx.textBaseline = yLieu - haut < 12 ? 'top' : 'bottom';
      ctx.fillText(etiquette, MARGE + 2, yLieu + (yLieu - haut < 12 ? 2 : -2));
    }
    courbe('freezing_level_height', yDe);
    ctx.strokeStyle = c.iso;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    return { yDe, champ: 'freezing_level_height', couleur: () => c.iso };
  }

  const DESSINS = {
    temperature: dessinerTemperature,
    precipitations: dessinerPrecipitations,
    vent: dessinerVent,
    orage: dessinerOrage,
    nuages: dessinerNuages,
    isotherme: dessinerIsotherme,
  };

  function etiquetteHeure(heure) {
    return t('bg.heure', { h: Number(heure.slice(11, 13)) });
  }

  function dessinerAxe(c, y) {
    ctx.font = `500 10px ${c.police}`;
    const largeurTexte = ctx.measureText(etiquetteHeure('T22')).width + 8;
    const groupe = [1, 2, 3, 4, 6].find((n) => n * pas >= largeurTexte) ?? 6;
    const heures = donnees.time;
    const jours = new Set(changementsDeJour(heures, indices));
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    indices.forEach((index, rang) => {
      const heure = Number(heures[index].slice(11, 13));
      const nouveauJour = jours.has(index);
      if (!nouveauJour && heure % groupe) return;
      const x = xBord(rang);
      if (x < MARGE + 10 || x > largeur - MARGE - 10) return;
      // L'heure lue s'affiche sur le curseur : pas d'heure de l'axe dessous
      if (Math.abs(x - xCentre(curseur)) < 42) return;
      ctx.fillStyle = nouveauJour ? c.texte : c.texte2;
      ctx.font = `${nouveauJour ? 700 : 500} 10px ${c.police}`;
      const texte = nouveauJour ? nomJour(new Date(`${heures[index].slice(0, 10)}T12:00:00`), 'short') : etiquetteHeure(heures[index]);
      ctx.fillText(texte, Math.min(largeur - MARGE - 12, Math.max(MARGE + 12, x)), y + 13);
      ctx.fillStyle = c.bord;
      ctx.fillRect(Math.round(x), y, 1, 4);
    });
    // Minuit : un trait sur toute la hauteur
    ctx.save();
    ctx.strokeStyle = c.texte2;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([2, 3]);
    jours.forEach((index) => {
      const x = Math.round(xBord(indices.indexOf(index))) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, MARGE);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    ctx.restore();
  }

  function dessiner() {
    if (!largeur || !donnees || !indices.length) return;
    ctx.clearRect(0, 0, largeur, hauteur);
    const c = couleurs();
    pas = (largeur - 2 * MARGE) / indices.length;

    // Colonne de l'heure lue
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(xBord(curseur), MARGE, pas, hauteur - AXE - MARGE);
    ctx.globalAlpha = 1;

    let y = MARGE;
    const points = [];
    const zones = [];
    affichees().forEach((id) => {
      const repere = DESSINS[id](c, y);
      if (repere) points.push(repere);
      zones.push({ id, haut: y + LEGENDE, h: LIGNES[id], repere });
      y += hauteurLigne(id) + ECART;
    });
    dessinerAxe(c, hauteur - AXE);

    // Curseur sur toute la hauteur, avec un point sur chaque courbe
    const x = Math.round(xCentre(curseur)) + 0.5;
    ctx.strokeStyle = c.texte;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, MARGE);
    ctx.lineTo(x, hauteur - AXE);
    ctx.stroke();
    ctx.globalAlpha = 1;
    points.forEach(({ yDe, champ, couleur }) => {
      const v = valeur(champ, curseur);
      if (!Number.isFinite(v)) return;
      ctx.beginPath();
      ctx.arc(x, yDe(v), 4, 0, Math.PI * 2);
      ctx.fillStyle = couleur(v);
      ctx.strokeStyle = c.surface;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });
    dessinerEtiquettes(c, x, zones);
  }

  // Valeurs de l'heure lue, posées sur le curseur : une étiquette par ligne, l'heure sur l'axe
  function etiquette(c, x, yCentre, texte, couleur, { plein = false, haut = 0, bas = hauteur } = {}) {
    ctx.font = `650 11px ${c.police}`;
    const l = ctx.measureText(texte).width + 12;
    const h = 18;
    // À droite du curseur, ou à gauche près du bord droit
    let gauche = plein ? x - l / 2 : x + 7;
    if (!plein && gauche + l > largeur - MARGE) gauche = x - 7 - l;
    gauche = Math.max(MARGE, Math.min(largeur - MARGE - l, gauche));
    const y = Math.max(haut, Math.min(bas - h, yCentre - h / 2));
    ctx.beginPath();
    ctx.roundRect(gauche, y, l, h, 5);
    ctx.fillStyle = plein ? couleur : c.surface;
    ctx.globalAlpha = plein ? 1 : 0.94;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!plein) {
      ctx.strokeStyle = couleur;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.fillStyle = plein ? c.surface : c.texte;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(texte, gauche + 6, y + h / 2 + 0.5);
  }

  function dessinerEtiquettes(c, x, zones) {
    const lues = valeursLues(c);
    zones.forEach(({ id, haut, h, repere }) => {
      const lue = lues[id];
      if (!lue) return;
      const v = repere ? valeur(repere.champ, curseur) : null;
      const yCentre = repere && Number.isFinite(v) ? repere.yDe(v) - 14 : haut + h / 2;
      etiquette(c, x, yCentre, lue.texte, lue.couleur, { haut: haut - 2, bas: haut + h + (id === 'vent' ? FLECHES : 2) });
    });
    const heure = donnees.time[indices[curseur]];
    const jour = nomJour(new Date(`${heure.slice(0, 10)}T12:00:00`), 'short');
    etiquette(c, x, hauteur - AXE / 2, `${jour} ${etiquetteHeure(heure)}`, c.accent, { plein: true });
  }

  // Textes de l'heure lue, par ligne
  function valeursLues(c) {
    const v = (champ) => valeur(champ, curseur);
    const lues = {};
    if (Number.isFinite(v('temperature_2m'))) {
      lues.temperature = { texte: formatTemp(v('temperature_2m')), couleur: v('temperature_2m') < 0 ? c.froid : c.chaud };
    }
    const mm = v('precipitation');
    if (Number.isFinite(mm)) {
      let texte = mm <= 0 ? t('frise.sec') : estNeige(mm, v('snowfall')) ? formatNeige(v('snowfall')) : formatPluie(mm);
      if (Number.isFinite(v('precipitation_probability'))) texte += ` · ${pourcent(v('precipitation_probability'))}`;
      lues.precipitations = { texte, couleur: c.pluie };
    }
    const moyen = v('wind_speed_10m');
    if (Number.isFinite(moyen)) {
      let texte = formatVent(moyen);
      if (Number.isFinite(v('wind_direction_10m'))) texte += ` ${pointCardinal(v('wind_direction_10m'))}`;
      if (Number.isFinite(v('wind_gusts_10m'))) texte += ` · ${t('frise.raf', { valeur: formatVent(v('wind_gusts_10m')) })}`;
      lues.vent = { texte, couleur: c.vent[palierVent(moyen)] };
    }
    const niveau = niveauOrage(v('cape'), v('weather_code'));
    lues.orage = { texte: t(NIVEAUX_ORAGE[niveau]), couleur: niveau ? c.orage[niveau] : c.bord };
    if (Number.isFinite(v('cloud_cover_low'))) lues.nuages = { texte: pourcent(v('cloud_cover_low')), couleur: c.texte2 };
    if (Number.isFinite(v('freezing_level_height'))) {
      lues.isotherme = { texte: formatAltitude(v('freezing_level_height'), { pas: 50 }), couleur: c.iso };
    }
    return lues;
  }

  // Même lecture en texte, pour les lecteurs d'écran
  function afficherLecture() {
    if (!donnees || !indices.length || !largeur) return;
    const heure = donnees.time[indices[curseur]];
    const jour = nomJour(new Date(`${heure.slice(0, 10)}T12:00:00`), 'long');
    const lues = valeursLues(couleurs());
    const textes = affichees().filter((id) => lues[id]).map((id) => `${t(`frise.${id}`)} ${lues[id].texte}`);
    lecture.textContent = `${t('frise.heure-lue', { jour, heure: etiquetteHeure(heure) })} : ${textes.join(', ')}`;
  }

  function majNote() {
    const lignes = affichees();
    legendeOrage.hidden = !lignes.includes('orage');
    legendeOrage.replaceChildren();
    if (!legendeOrage.hidden) {
      const titre = document.createElement('span');
      titre.textContent = t('frise.legende-orage');
      legendeOrage.appendChild(titre);
      [1, 2, 3].forEach((niveau) => {
        const entree = document.createElement('span');
        entree.className = `frise-legende-niveau niveau-${niveau}`;
        entree.textContent = t(NIVEAUX_ORAGE[niveau]);
        legendeOrage.appendChild(entree);
      });
    }
    const textes = [];
    if (lignes.includes('orage')) textes.push(t('frise.note-orage'));
    textes.push(t('frise.note'));
    note.textContent = textes.join(' ');
    note.hidden = false;
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

  function rendre() {
    section.hidden = !donnees || !indices.length;
    if (section.hidden) return;
    canvas.style.height = `${hauteurTotale()}px`;
    curseur = Math.max(0, Math.min(indices.length - 1, curseur));
    redimensionner();
    afficherLecture();
    majNote();
  }

  function placer(rang, depuisUtilisateur = true) {
    if (!indices.length || rang === curseur) return;
    curseur = Math.max(0, Math.min(indices.length - 1, rang));
    dessiner();
    afficherLecture();
    if (depuisUtilisateur) onHeure(indices[curseur]);
  }

  const rangProche = (clientX) => {
    const { left } = canvas.getBoundingClientRect();
    return Math.floor((clientX - left - MARGE) / pas);
  };
  canvas.addEventListener('pointerdown', (event) => placer(rangProche(event.clientX)));
  canvas.addEventListener('pointermove', (event) => {
    // Au doigt, seul un appui déplace le curseur ; la souris le déplace au survol
    if (event.pointerType === 'touch' && !event.buttons) return;
    placer(rangProche(event.clientX));
  });
  canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const cible = { ArrowLeft: curseur - 1, ArrowRight: curseur + 1, Home: 0, End: indices.length - 1 }[event.key];
    placer(cible);
  });

  new ResizeObserver(redimensionner).observe(canvas);
  new MutationObserver(dessiner).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });

  return {
    element: section,
    // `hourly` : prévisions horaires d'Open-Meteo ; `rangs` : leurs indices à montrer
    definir({ hourly, rangs, altitude = null, garderHeure = false }) {
      const heureGardee = garderHeure && donnees ? donnees.time[indices[curseur]] : null;
      donnees = hourly || null;
      indices = Array.isArray(rangs) ? rangs : [];
      elevation = Number.isFinite(altitude) ? altitude : null;
      const retrouve = heureGardee ? indices.findIndex((index) => donnees.time[index] === heureGardee) : -1;
      curseur = retrouve >= 0 ? retrouve : 0;
      if (zoneChoix) construireChoix();
      rendre();
    },
    // Place la lecture sur une heure donnée (indice dans `hourly`), sans prévenir en retour
    placerHeure(index) {
      const rang = indices.indexOf(index);
      if (rang >= 0) placer(rang, false);
    },
    heureLue: () => (indices.length ? indices[curseur] : null),
  };
}
