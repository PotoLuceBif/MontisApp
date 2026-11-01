import { lire, ecrire } from './reglages.js';
import { Popup } from 'maplibre-gl';

const API_VENT = 'https://api.open-meteo.com/v1/forecast';
const SOURCE_VENT = 'vent-previsions';
const SOURCE_PARTICULES = 'vent-previsions-particules';
const SOURCE_THERMIQUES = 'vent-estimation-thermique';
const COUCHE_VENT = 'vent-previsions-fleches';
const COUCHE_OMBRE_VENT = 'vent-previsions-fleches-ombre';
const COUCHE_PARTICULES = 'vent-previsions-particules';
const COUCHE_THERMIQUES = 'vent-estimation-thermique';
const DELAI_CHARGEMENT = 15000;
const MAX_POINTS = 100;
const MAX_POINTS_VOLUME = 48;
const DUREE_CACHE = 15 * 60 * 1000;
const NIVEAUX_PRESSION = [850, 700, 600, 500];
const NIVEAUX_VOLUME = [10, 100, 200, 500, 1000, 1500, 2000];
const PLAFONDS_VOLUME = [500, 1000, 2000];
const PALETTES = {
  clair: ['#248a4b', '#c68b00', '#df6718', '#c93636'],
  sombre: ['#43c98b', '#edc653', '#f28a50', '#ff647c'],
  cyberpunk: ['#4debd4', '#ffe45c', '#ff9b45', '#ff5da2'],
};
const NIVEAUX = {
  10: { libelle: 'Au sol · 10 m', vitesse: 'wind_speed_10m', direction: 'wind_direction_10m' },
  100: { libelle: 'Altitude · 100 m', vitesse: 'wind_speed_100m', direction: 'wind_direction_100m' },
  200: { libelle: 'Altitude · 200 m', vitesse: 'wind_speed_200m', direction: 'wind_direction_200m' },
};
const ECHEANCES = [
  { valeur: '0', libelle: 'Prochaine heure disponible' },
  { valeur: '3', libelle: 'Dans 3 heures' },
  { valeur: '6', libelle: 'Dans 6 heures' },
  { valeur: '12', libelle: 'Dans 12 heures' },
  { valeur: '24', libelle: 'Dans 24 heures' },
];

function creerGrille(map) {
  const { clientWidth: largeur, clientHeight: hauteur } = map.getCanvas();
  const ratio = largeur / Math.max(1, hauteur);
  const colonnes = Math.max(1, Math.floor(Math.sqrt(MAX_POINTS * ratio)));
  const rangees = Math.max(1, Math.floor(MAX_POINTS / colonnes));
  const positions = new Map();

  for (let y = 0; y < rangees; y += 1) {
    const pixelY = hauteur * ((y + 0.5) / rangees);
    for (let x = 0; x < colonnes; x += 1) {
      const pixelX = largeur * ((x + 0.5) / colonnes);
      const coordonnees = map.unproject([pixelX, pixelY]);
      const latitude = Math.max(-85, Math.min(85, coordonnees.lat));
      const longitude = ((coordonnees.lng + 180) % 360 + 360) % 360 - 180;
      const lat = Math.round(latitude * 1000) / 1000;
      const lon = Math.round(longitude * 1000) / 1000;
      positions.set(`${lat.toFixed(3)},${lon.toFixed(3)}`, { latitude: lat, longitude: lon });
    }
  }

  return [...positions.values()].slice(0, MAX_POINTS);
}

function echantillonnerVolume(grille) {
  const nombre = Math.min(grille.length, MAX_POINTS_VOLUME);
  return Array.from({ length: nombre }, (_, index) =>
    grille[Math.floor(index * grille.length / nombre)]
  );
}

function creerImageFleche() {
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 48;
  const contexte = canvas.getContext('2d');
  if (!contexte) throw new Error('Impossible de préparer les flèches de vent.');
  contexte.fillStyle = '#fff';
  contexte.beginPath();
  contexte.moveTo(10, 1);
  contexte.lineTo(19, 13);
  contexte.lineTo(12, 10);
  contexte.lineTo(12, 45);
  contexte.lineTo(8, 45);
  contexte.lineTo(8, 10);
  contexte.lineTo(1, 13);
  contexte.closePath();
  contexte.fill();
  return contexte.getImageData(0, 0, canvas.width, canvas.height);
}

function directionVent(degres) {
  if (!Number.isFinite(degres)) return 'indisponible';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return `${directions[Math.round(degres / 45) % 8]} (${Math.round(degres)}°)`;
}

export function creerCarteVent(map) {
  const panneau = document.createElement('div');
  panneau.className = 'vent-carte';
  panneau.innerHTML = `
    <header class="vent-carte-entete">
      <div><span>ANALYSE MÉTÉO</span><h3>Vent prévu</h3></div>
      <span class="vent-carte-modele">Météo-France</span>
    </header>
    <div class="vent-vues" role="tablist" aria-label="Vues de l’analyse vent">
      <button type="button" role="tab" id="vent-vue-carte-onglet" aria-selected="true" aria-controls="vent-vue-carte">Carte</button>
      <button type="button" role="tab" id="vent-vue-volume-onglet" aria-selected="false" aria-controls="vent-vue-volume" tabindex="-1">Volume 3D</button>
      <button type="button" role="tab" id="vent-vue-thermiques-onglet" aria-selected="false" aria-controls="vent-vue-thermiques" tabindex="-1">Thermiques</button>
    </div>
    <section class="vent-vue-contenu" id="vent-vue-carte" role="tabpanel" aria-labelledby="vent-vue-carte-onglet">
      <div class="vent-carte-controles">
        <label><span>Niveau du vent</span><select class="vent-carte-niveau" aria-label="Niveau du vent">
          ${Object.entries(NIVEAUX).map(([hauteur, niveau]) => `<option value="${hauteur}">${niveau.libelle}</option>`).join('')}
        </select></label>
        <label><span>Échéance</span><select class="vent-carte-echeance" aria-label="Échéance des prévisions">
          ${ECHEANCES.map(({ valeur, libelle }) => `<option value="${valeur}">${libelle}</option>`).join('')}
        </select></label>
      </div>
      <div class="vent-carte-resume" aria-label="Résumé du vent">
        <div><span>Vent moyen</span><strong data-vent-moyen>—</strong></div>
        <div><span>Rafales max.</span><strong data-vent-rafales>—</strong></div>
        <div><span>Direction d’où vient le vent</span><strong data-vent-direction>—</strong></div>
      </div>
      <div class="vent-carte-legende" aria-label="Intensité du vent en kilomètres par heure">
        <span><i data-palier="0"></i> 0–9</span><span><i data-palier="1"></i> 10–19</span>
        <span><i data-palier="2"></i> 20–29</span><span><i data-palier="3"></i> 30+</span><span>km/h</span>
      </div>
      <p class="vent-carte-statut" role="status" aria-live="polite">Active le calque pour charger le vent sur la carte.</p>
      <button class="vent-carte-actualiser" type="button">Actualiser la carte</button>
      <p class="vent-carte-note">Les flèches indiquent le sens du flux ; la direction affichée indique d’où vient le vent. Modèle Météo-France (AROME selon couverture, ARPEGE ailleurs). Données indicatives · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.</p>
    </section>
    <section class="vent-vue-contenu" id="vent-vue-volume" role="tabpanel" aria-labelledby="vent-vue-volume-onglet" hidden>
      <section class="vent-volume" aria-labelledby="vent-volume-titre">
        <div class="vent-volume-entete">
          <div><span>VOLUME ISOLÉ · ECMWF</span><h4 id="vent-volume-titre">Vent au-dessus du relief</h4></div>
          <span class="vent-volume-zone" role="status" aria-live="polite" hidden></span>
          <span class="vent-volume-badge">3D</span>
        </div>
        <fieldset class="vent-volume-plafonds">
          <legend>Hauteur affichée</legend>
          ${PLAFONDS_VOLUME.map((plafond) => `<label><input type="radio" name="vent-volume-plafond" value="${plafond}"${plafond === 2000 ? ' checked' : ''}><span>0–${plafond.toLocaleString('fr-FR')} m</span></label>`).join('')}
        </fieldset>
        <div class="vent-volume-heure"><strong data-volume-heure>—</strong><span>Échéance</span></div>
        <input class="vent-volume-temps" type="range" min="0" max="24" value="0" aria-label="Échéance horaire du volume 3D">
        <svg class="vent-volume-svg" viewBox="0 0 320 280" role="img" tabindex="0" aria-label="Volume 3D du vent au-dessus du relief. Cliquer et faire glisser pour tourner le volume."></svg>
        <p class="vent-volume-aide-rotation">Fais glisser la figure horizontalement pour la tourner autour de son centre. La boussole indique le nord ; sa flèche colorée donne le flux moyen au plafond choisi.</p>
        <div class="vent-volume-legende" aria-label="Intensité du vent">
          <span><i data-volume-vitesse="0"></i> 0–9 km/h</span><span><i data-volume-vitesse="1"></i> 10–19 km/h</span>
          <span><i data-volume-vitesse="2"></i> 20–29 km/h</span><span><i data-volume-vitesse="3"></i> 30+ km/h</span>
        </div>
        <p class="vent-volume-statut" role="status" aria-live="polite">Ouvre cette vue pour charger le profil vertical de la zone.</p>
        <button class="vent-volume-actualiser" type="button">Actualiser le volume</button>
        <p class="vent-volume-note">Hauteurs au-dessus du sol. Les niveaux intermédiaires sont estimés entre les vents à 200 m et les niveaux de pression ECMWF. Maille météo d’environ 25 km : les détails locaux du relief ne sont pas résolus.</p>
      </section>
    </section>
    <section class="vent-vue-contenu" id="vent-vue-thermiques" role="tabpanel" aria-labelledby="vent-vue-thermiques-onglet" hidden>
      <section class="vent-thermiques" aria-labelledby="vent-thermiques-titre">
        <div class="vent-thermiques-entete"><div><span>ESTIMATION</span><h4 id="vent-thermiques-titre">Potentiel thermique</h4></div><strong data-thermique-score>—</strong></div>
        <p class="vent-thermiques-detail" data-thermique-detail>Ouvre cette vue pour calculer le potentiel thermique sur la zone.</p>
        <label class="vent-thermiques-toggle"><input type="checkbox" data-thermiques-visible><span>Afficher le potentiel sur la carte</span></label>
        <p class="vent-volume-note">Indice indicatif calculé à partir du rayonnement, de la nébulosité et de l’écart température / point de rosée. Ce n’est ni une mesure ni une prévision de thermique exploitable.</p>
      </section>
    </section>
  `;

  const selecteurNiveau = panneau.querySelector('.vent-carte-niveau');
  const selecteurEcheance = panneau.querySelector('.vent-carte-echeance');
  const statut = panneau.querySelector('.vent-carte-statut');
  const actualiser = panneau.querySelector('.vent-carte-actualiser');
  const pastillesLegende = [...panneau.querySelectorAll('.vent-carte-legende [data-palier]')];
  const resumeMoyen = panneau.querySelector('[data-vent-moyen]');
  const resumeRafales = panneau.querySelector('[data-vent-rafales]');
  const resumeDirection = panneau.querySelector('[data-vent-direction]');
  const couleursResume = [resumeMoyen, resumeRafales];
  const svgVolume = panneau.querySelector('.vent-volume-svg');
  const scoreThermique = panneau.querySelector('[data-thermique-score]');
  const detailThermique = panneau.querySelector('[data-thermique-detail]');
  const toggleThermiques = panneau.querySelector('[data-thermiques-visible]');
  const ongletsVue = [...panneau.querySelectorAll('.vent-vues [role="tab"]')];
  const contenusVue = [...panneau.querySelectorAll('.vent-vue-contenu')];
  const statutVolume = panneau.querySelector('.vent-volume-statut');
  const actualiserVolume = panneau.querySelector('.vent-volume-actualiser');
  const heureVolume = panneau.querySelector('[data-volume-heure]');
  const tempsVolume = panneau.querySelector('.vent-volume-temps');
  const plafondsVolume = [...panneau.querySelectorAll('input[name="vent-volume-plafond"]')];
  const indicateurZoneVolume = panneau.querySelector('.vent-volume-zone');
  const cache = new Map();
  let actif = false;
  let controleur = null;
  let controleurProfil = null;
  let minuteur = null;
  let heureCourante = '';
  let evenementsCoucheAjoutes = false;
  let emplacementParDefaut = null;
  let particules = [];
  let donneesVolume = [];
  let donneesThermiques = [];
  let donneesVentCourantes = null;
  let resumeVentCourant = [];
  let directionFluxVolume = null;
  let profilsPression = null;
  let profilCache = null;
  let positionsProfil = [];
  let zoneVolumeCapturee = null;
  let heureBaseVolume = '';
  let vueActive = 'carte';
  let profilPerime = true;
  let rotationVolumeDegres = Number(lire('vent-volume-rotation', 28));
  if (!Number.isFinite(rotationVolumeDegres)) rotationVolumeDegres = 28;
  let inclinaisonVolume = 0.38;
  let bearingVolume = map.getBearing();
  let glissementVolume = null;
  let plafondVolume = Number(lire('vent-volume-plafond', 2000));
  if (!PLAFONDS_VOLUME.includes(plafondVolume)) plafondVolume = 2000;
  plafondsVolume.forEach((radio) => {
    radio.checked = Number(radio.value) === plafondVolume;
  });
  let animationFrame = null;
  let dernierRenduAnimation = 0;
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');

  selecteurNiveau.value = String(lire('vent-niveau', 10));
  if (!NIVEAUX[selecteurNiveau.value]) selecteurNiveau.value = '10';
  selecteurEcheance.value = String(lire('vent-echeance', 0));
  if (!ECHEANCES.some(({ valeur }) => valeur === selecteurEcheance.value)) {
    selecteurEcheance.value = '0';
  }

  function couleurParVitesse(expression) {
    const couleurs = PALETTES[document.documentElement.dataset.theme] || PALETTES.clair;
    return [
      'step',
      expression,
      couleurs[0],
      10, couleurs[1],
      20, couleurs[2],
      30, couleurs[3],
    ];
  }

  function couleurVitesse(vitesse) {
    const couleurs = PALETTES[document.documentElement.dataset.theme] || PALETTES.clair;
    return vitesse < 10 ? couleurs[0] : vitesse < 20 ? couleurs[1] : vitesse < 30 ? couleurs[2] : couleurs[3];
  }

  function interpolerVentPression(hourly, index, elevation, altitudeCible, ventBas = null) {
    const niveaux = NIVEAUX_PRESSION.map((pression) => ({
      altitude: hourly[`geopotential_height_${pression}hPa`]?.[index] - elevation,
      vitesse: hourly[`wind_speed_${pression}hPa`]?.[index],
      direction: hourly[`wind_direction_${pression}hPa`]?.[index],
    }))
      .filter((niveau) => Number.isFinite(niveau.altitude)
        && niveau.altitude > 0
        && Number.isFinite(niveau.vitesse)
        && Number.isFinite(niveau.direction))
      .sort((a, b) => a.altitude - b.altitude);
    if (ventBas && altitudeCible > ventBas.altitude) {
      niveaux.push(ventBas);
      niveaux.sort((a, b) => a.altitude - b.altitude);
    }
    const superieur = niveaux.find((niveau) => niveau.altitude >= altitudeCible);
    const inferieur = [...niveaux].reverse().find((niveau) => niveau.altitude <= altitudeCible);
    if (!superieur || !inferieur) return null;
    if (superieur === inferieur) {
      return { vitesse: superieur.vitesse, direction: (superieur.direction + 180) % 360 };
    }

    const ratio = (altitudeCible - inferieur.altitude) / (superieur.altitude - inferieur.altitude);
    const composantes = [inferieur, superieur].map((niveau) => {
      const direction = ((niveau.direction + 180) * Math.PI) / 180;
      return { x: Math.sin(direction) * niveau.vitesse, y: -Math.cos(direction) * niveau.vitesse };
    });
    const x = composantes[0].x + (composantes[1].x - composantes[0].x) * ratio;
    const y = composantes[0].y + (composantes[1].y - composantes[0].y) * ratio;
    return {
      vitesse: Math.hypot(x, y),
      direction: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360,
    };
  }

  function estimerPotentielThermique(hourly, index) {
    const rayonnement = hourly.shortwave_radiation?.[index];
    const nuages = hourly.cloud_cover?.[index];
    const temperature = hourly.temperature_2m?.[index];
    const rosee = hourly.dew_point_2m?.[index];
    if (![rayonnement, nuages, temperature, rosee].every(Number.isFinite)) return null;
    const facteurSolaire = Math.max(0, Math.min(1, (rayonnement - 80) / 620));
    const facteurNuages = Math.max(0.12, 1 - nuages / 100);
    const facteurSecheresse = Math.max(0.25, Math.min(1, (temperature - rosee) / 14));
    return Math.round(100 * facteurSolaire * facteurNuages * (0.65 + 0.35 * facteurSecheresse));
  }

  function rendreVolume() {
    if (vueActive !== 'volume') return;
    const angle = (rotationVolumeDegres * Math.PI) / 180;
    const facteurHauteur = 132 / plafondVolume;
    const projeter = (x, y, hauteur = 0, relief = 0) => {
      const dx = (x - 0.5) * 205;
      const dy = (y - 0.5) * 125;
      return [
        160 + dx * Math.cos(angle) - dy * Math.sin(angle),
        222 + (dx * Math.sin(angle) + dy * Math.cos(angle)) * 0.38 - hauteur * facteurHauteur - relief,
      ];
    };
    const altitudes = donneesVolume.flatMap((point) => point.elevation).filter(Number.isFinite);
    const altitudeMin = altitudes.length ? Math.min(...altitudes) : 0;
    const reliefEnPixels = (elevation) => Math.max(0, Math.min(20, (elevation - altitudeMin) * 0.035));
    const positionsNiveaux = NIVEAUX_VOLUME.slice(3).filter((hauteur) => hauteur <= plafondVolume);
    const niveauxVolume = positionsNiveaux.map((hauteur) => {
      const avant = [0, 0, hauteur, 0];
      const droite = [1, 0, hauteur, 0];
      const arriere = [1, 1, hauteur, 0];
      const gauche = [0, 1, hauteur, 0];
      const points = [avant, droite, arriere, gauche].map(([x, y, z, relief]) => projeter(x, y, z, relief));
      return `<polygon class="vent-volume-plan" points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`;
    }).join('');
    const grilleSol = Array.from({ length: 5 }, (_, rangee) =>
      Array.from({ length: 6 }, (_, colonne) => {
        const x0 = colonne / 6;
        const x1 = (colonne + 1) / 6;
        const y0 = rangee / 5;
        const y1 = (rangee + 1) / 5;
        const cellule = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const cellules = [[cellule[0], cellule[1], cellule[2]], [cellule[0], cellule[2], cellule[3]]];
        return cellules.map((triangle) => {
          const centre = triangle.reduce((sum, [x, y]) => [sum[0] + x / 3, sum[1] + y / 3], [0, 0]);
          const pointProche = donneesVolume.reduce((closest, point) => {
            const distance = (point.x - centre[0]) ** 2 + (point.y - centre[1]) ** 2;
            return !closest || distance < closest.distance ? { point, distance } : closest;
          }, null)?.point;
          const elevation = pointProche?.elevation ?? altitudeMin;
          const points = triangle.map(([x, y]) => projeter(x, y, 0, reliefEnPixels(elevation)));
          const niveauRelief = Math.min(4, Math.floor(reliefEnPixels(elevation) / 5));
          return `<polygon class="vent-volume-terrain" data-relief="${niveauRelief}" points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`;
        }).join('');
      }).join('')
    ).join('');
    const planGrille = positionsNiveaux.map((hauteur) => {
      const a = projeter(0, 0, hauteur);
      const b = projeter(1, 0, hauteur);
      const c = projeter(1, 1, hauteur);
      const d = projeter(0, 1, hauteur);
      return `<g class="vent-volume-grille"><path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} Z"/>`
        + `<path d="M${projeter(0.5, 0, hauteur)[0]} ${projeter(0.5, 0, hauteur)[1]} L${projeter(0.5, 1, hauteur)[0]} ${projeter(0.5, 1, hauteur)[1]}"/>`
        + `<path d="M${projeter(0, 0.5, hauteur)[0]} ${projeter(0, 0.5, hauteur)[1]} L${projeter(1, 0.5, hauteur)[0]} ${projeter(1, 0.5, hauteur)[1]}"/>`
        + `<text x="5" y="${(a[1] + 3).toFixed(1)}">${hauteur.toLocaleString('fr-FR')} m</text></g>`;
    }).join('');
    const pointsVolume = donneesVolume;
    const fleches = pointsVolume.flatMap((point) =>
      point.niveaux.filter((niveau) => niveau.altitude <= plafondVolume).map((niveau) => {
        const [x, y] = projeter(point.x, point.y, niveau.altitude, reliefEnPixels(point.elevation));
        const radians = ((niveau.direction - bearingVolume) * Math.PI) / 180;
        const dx = Math.sin(radians) * Math.cos(angle) + Math.cos(radians) * Math.sin(angle);
        const dy = (Math.sin(radians) * Math.sin(angle) - Math.cos(radians) * Math.cos(angle)) * inclinaisonVolume;
        const rotation = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const couleur = couleurVitesse(niveau.vitesse);
        return `<path class="vent-volume-fleche" d="M0 -6 L2.8 -1.2 L1 -1.2 V5 H-1 V-1.2 L-2.8 -1.2 Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation.toFixed(1)})" fill="${couleur}"><title>${Math.round(niveau.vitesse)} km/h à ${niveau.altitude.toLocaleString('fr-FR')} m</title></path>`;
      })
    ).join('');
    const rotationBoussole = rotationVolumeDegres - bearingVolume;
    const flecheDirectionMoyenne = Number.isFinite(directionFluxVolume)
      ? `<g transform="rotate(${directionFluxVolume.toFixed(1)} 280 57)"><path class="vent-volume-boussole-flux" d="M280 57 V42 L275 49 L280 46 L285 49 Z"/></g>`
      : '';
    const bordsVolume = [
      [[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]],
    ].map(([[x1, y1], [x2, y2]]) => {
      const bas1 = projeter(x1, y1);
      const bas2 = projeter(x2, y2);
      const haut1 = projeter(x1, y1, plafondVolume);
      const haut2 = projeter(x2, y2, plafondVolume);
      return `<path class="vent-volume-arete" d="M${bas1[0]} ${bas1[1]} L${haut1[0]} ${haut1[1]} L${haut2[0]} ${haut2[1]} L${bas2[0]} ${bas2[1]}"/>`;
    }).join('');
    const currentPoint = donneesVolume[0];
    heureVolume.textContent = currentPoint?.heure
      ? new Date(currentPoint.heure).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Données indisponibles';
    svgVolume.innerHTML = `
      <defs><linearGradient id="vent-volume-fond" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".04"/></linearGradient></defs>
      <path class="vent-volume-face" d="M25 35 H295 V255 H25 Z"/>
      ${planGrille}
      <g class="vent-volume-sol">${grilleSol}</g>
      <g class="vent-volume-grille">${niveauxVolume}${bordsVolume}</g>
      <g class="vent-volume-fleches">${fleches}</g>
      <g class="vent-volume-boussole" transform="rotate(${rotationBoussole.toFixed(1)} 280 57)" aria-label="Boussole">
        <circle cx="280" cy="57" r="20"/>
        <path class="vent-volume-boussole-axe" d="M280 39 V75 M262 57 H298"/>
        <path class="vent-volume-boussole-nord" d="M280 40 L275.5 58 L280 55 L284.5 58 Z"/>
        <path class="vent-volume-boussole-sud" d="M280 74 L276 57 L284 57 Z"/>
        ${flecheDirectionMoyenne}
        <text x="280" y="36">N</text><text x="301" y="60">E</text>
        <text x="280" y="87">S</text><text x="259" y="60">O</text>
      </g>`;
  }

  function afficherResume(features) {
    resumeVentCourant = features;
    if (!features.length) {
      resumeMoyen.textContent = '—';
      resumeRafales.textContent = '—';
      resumeDirection.textContent = '—';
      couleursResume.forEach((element) => element.style.removeProperty('color'));
      return;
    }
    const moyenne = features.reduce((total, feature) => total + feature.properties.vitesse, 0) / features.length;
    const rafales = features.map((feature) => feature.properties.rafales).filter(Number.isFinite);
    const sin = features.reduce((total, feature) => total + Math.sin((feature.properties.directionFlux * Math.PI) / 180), 0);
    const cos = features.reduce((total, feature) => total + Math.cos((feature.properties.directionFlux * Math.PI) / 180), 0);
    const direction = (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
    const rafaleMax = rafales.length ? Math.max(...rafales) : null;
    resumeMoyen.textContent = `${Math.round(moyenne)} km/h`;
    resumeRafales.textContent = rafaleMax === null ? '—' : `${Math.round(rafaleMax)} km/h`;
    resumeDirection.textContent = directionVent((direction + 180) % 360);
    resumeMoyen.style.color = couleurVitesse(moyenne);
    if (rafaleMax === null) resumeRafales.style.removeProperty('color');
    else resumeRafales.style.color = couleurVitesse(rafaleMax);
  }

  function calculerThermiques() {
    if (!donneesVentCourantes) return;
    const { reponses, positions, heureCible } = donneesVentCourantes;
    const features = [];
    for (let index = 0; index < positions.length; index += 1) {
      const hourly = reponses[index]?.hourly;
      const heure = hourly?.time?.indexOf(heureCible) ?? -1;
      if (heure < 0) continue;
      const potentiel = estimerPotentielThermique(hourly, heure);
      if (potentiel === null) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [positions[index].longitude, positions[index].latitude] },
        properties: { potentiel },
      });
    }
    donneesThermiques = features;
    afficherPotentielThermique(features);
  }

  function afficherPotentielThermique(features) {
    map.getSource(SOURCE_THERMIQUES)?.setData({ type: 'FeatureCollection', features });
    const scores = features.map((feature) => feature.properties.potentiel).filter(Number.isFinite);
    if (!scores.length) {
      scoreThermique.textContent = '—';
      detailThermique.textContent = 'Potentiel non estimable pour cette échéance.';
      return;
    }
    const moyen = Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
    const niveau = moyen < 25 ? 'Faible' : moyen < 55 ? 'Modéré' : 'Soutenu';
    scoreThermique.textContent = `${moyen}/100`;
    scoreThermique.dataset.niveau = niveau.toLowerCase();
    detailThermique.textContent = `Potentiel ${niveau.toLowerCase()} sur la zone · ${features.length} points estimés.`;
  }

  function obtenirIndexProfil() {
    const hourly = profilsPression?.[0]?.hourly;
    if (!Array.isArray(hourly?.time)) return -1;
    const heureBase = heureBaseVolume || profilsPression[0].current?.time || hourly.time[0];
    const base = hourly.time.findIndex((heure) => heure >= heureBase);
    if (base < 0) return -1;
    return base + Number(tempsVolume.value);
  }

  function construireVolumeDepuisProfil() {
    if (!profilsPression || vueActive !== 'volume') return;
    const indexHeure = obtenirIndexProfil();
    const premier = profilsPression[0]?.hourly?.time;
    const heureCible = premier?.[indexHeure];
    if (indexHeure < 0 || !heureCible) {
      donneesVolume = [];
      rendreVolume();
      statutVolume.classList.remove('erreur');
      statutVolume.textContent = 'Cette échéance n’est pas disponible dans le profil ECMWF.';
      return;
    }

    donneesVolume = positionsProfil.flatMap((position, index) => {
      const donnees = profilsPression[index];
      const hourly = donnees?.hourly;
      if (!Array.isArray(hourly?.time)) return [];
      const niveaux = [];
      const ventSol = cache.get(`${position.latitude},${position.longitude}`)?.donnees?.hourly;
      const indexVentSol = ventSol?.time?.indexOf(heureCible) ?? -1;
      let ventBas = null;
      if (indexVentSol >= 0) {
        Object.entries(NIVEAUX).forEach(([altitude, config]) => {
          const vitesse = ventSol[config.vitesse]?.[indexVentSol];
          const direction = ventSol[config.direction]?.[indexVentSol];
          if (Number.isFinite(vitesse) && Number.isFinite(direction)) {
            niveaux.push({
              altitude: Number(altitude),
              vitesse,
              direction: (direction + 180) % 360,
            });
            if (Number(altitude) === 200) ventBas = { altitude: 200, vitesse, direction };
          }
        });
      }
      [500, 1000, 1500, 2000].forEach((altitude) => {
        const vent = interpolerVentPression(hourly, indexHeure, donnees.elevation, altitude, ventBas);
        if (vent) niveaux.push({ altitude, ...vent });
      });
      if (!niveaux.length) return [];
      return [{
        x: position.x,
        y: position.y,
        elevation: donnees.elevation,
        niveaux,
        heure: heureCible,
      }];
    });
    const heureBase = heureBaseVolume
      ? premier.findIndex((heure) => heure >= heureBaseVolume)
      : 0;
    tempsVolume.max = String(Math.max(0, Math.min(48, premier.length - 1 - Math.max(0, heureBase))));
    heureVolume.textContent = new Date(heureCible).toLocaleString('fr-FR', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    const nombreFleches = donneesVolume.reduce(
      (total, point) => total + point.niveaux.filter(({ altitude }) => altitude <= plafondVolume).length,
      0
    );
    const directions = donneesVolume.flatMap((point) => {
      const niveau = point.niveaux.find(({ altitude }) => altitude === plafondVolume)
        || [...point.niveaux].filter(({ altitude }) => altitude <= plafondVolume).sort((a, b) => b.altitude - a.altitude)[0];
      return niveau ? [niveau.direction] : [];
    });
    if (directions.length) {
      const sin = directions.reduce((sum, direction) => sum + Math.sin(direction * Math.PI / 180), 0);
      const cos = directions.reduce((sum, direction) => sum + Math.cos(direction * Math.PI / 180), 0);
      directionFluxVolume = (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
    } else {
      directionFluxVolume = null;
    }
    rendreVolume();
    statutVolume.textContent = donneesVolume.length
      ? `ECMWF · ${nombreFleches} flèches · jusqu’à ${plafondVolume.toLocaleString('fr-FR')} m au-dessus du sol.`
      : 'Aucun niveau de vent disponible au-dessus du relief pour cette zone et cette échéance.';
    statutVolume.classList.remove('erreur');
    profilPerime = false;
    mettreAJourAlerteVolume();
  }

  function mettreAJourAlerteVolume() {
    if (!zoneVolumeCapturee) {
      indicateurZoneVolume.hidden = true;
      return;
    }
    const centreActuel = map.getCenter();
    const distance = map.distance(
      [zoneVolumeCapturee.centre.lng, zoneVolumeCapturee.centre.lat],
      [centreActuel.lng, centreActuel.lat]
    );
    const zoomModifie = Math.abs(map.getZoom() - zoneVolumeCapturee.zoom) > 0.3;
    const zoneModifiee = distance > 250 || zoomModifie;
    indicateurZoneVolume.hidden = !zoneModifiee;
    indicateurZoneVolume.textContent = zoneModifiee ? 'Carte déplacée' : '';
    indicateurZoneVolume.title = zoneModifiee
      ? `Le volume reste sur ${zoneVolumeCapturee.centre.lat.toFixed(3)}, ${zoneVolumeCapturee.centre.lng.toFixed(3)}. Clique sur « Actualiser le volume » pour charger la zone actuelle.`
      : '';
  }

  async function chargerProfilVolume(force = false) {
    if (!actif || vueActive !== 'volume' || controleurProfil) return;
    const centre = map.getCenter();
    const zoom = map.getZoom();
    const positions = echantillonnerVolume(creerGrille(map)).map((position) => {
      const pixel = map.project([position.longitude, position.latitude]);
      const { clientWidth: largeur, clientHeight: hauteur } = map.getCanvas();
      return {
        ...position,
        x: Math.max(0, Math.min(1, pixel.x / Math.max(1, largeur))),
        y: Math.max(0, Math.min(1, pixel.y / Math.max(1, hauteur))),
      };
    });
    const clePositions = positions.map(({ latitude, longitude }) => `${latitude},${longitude}`).join('|');
    const cacheValide = profilsPression
      && !profilPerime
      && profilCache?.cle === clePositions
      && Date.now() - profilCache.recu < DUREE_CACHE;
    if (!force && cacheValide) {
      construireVolumeDepuisProfil();
      return;
    }

    const requete = new AbortController();
    controleurProfil = requete;
    profilPerime = true;
    positionsProfil = positions;
    const zoneDemandee = { centre: { lng: centre.lng, lat: centre.lat }, zoom };
    const bearingDemande = map.getBearing();
    actualiserVolume.disabled = true;
    statutVolume.classList.remove('erreur');
    statutVolume.textContent = 'Chargement du profil vertical ECMWF pour le volume…';
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);
    try {
      const niveaux = NIVEAUX_PRESSION.flatMap((pression) => [
        `wind_speed_${pression}hPa`,
        `wind_direction_${pression}hPa`,
        `geopotential_height_${pression}hPa`,
      ]);
      const params = new URLSearchParams({
        latitude: positions.map(({ latitude }) => latitude).join(','),
        longitude: positions.map(({ longitude }) => longitude).join(','),
        current: 'temperature_2m',
        hourly: niveaux.join(','),
        models: 'ecmwf_ifs025',
        forecast_days: '3',
        timezone: 'auto',
        wind_speed_unit: 'kmh',
      });
      const reponse = await fetch(`${API_VENT}?${params}`, { signal: requete.signal });
      if (!reponse.ok) throw new Error(`Le service ECMWF répond avec le statut ${reponse.status}.`);
      const resultat = await reponse.json();
      if (requete.signal.aborted || controleurProfil !== requete || !actif || vueActive !== 'volume') return;
      const donnees = Array.isArray(resultat) ? resultat : [resultat];
      if (donnees.length !== positions.length || donnees.some((entree) => !Array.isArray(entree?.hourly?.time))) {
        throw new Error('Le service ECMWF a renvoyé un profil incomplet.');
      }
      profilsPression = donnees;
      positionsProfil = positions;
      zoneVolumeCapturee = zoneDemandee;
      heureBaseVolume = heureCourante || donnees[0].current?.time || donnees[0].hourly.time[0];
      bearingVolume = bearingDemande;
      profilCache = { cle: clePositions, recu: Date.now() };
      construireVolumeDepuisProfil();
    } catch (erreur) {
      if (requete.signal.aborted && controleurProfil === requete && actif && vueActive === 'volume') {
        statutVolume.classList.add('erreur');
        statutVolume.textContent = 'Le profil ECMWF prend trop de temps. Vérifie ta connexion puis actualise.';
      } else if (controleurProfil === requete && actif && vueActive === 'volume') {
        statutVolume.classList.add('erreur');
        statutVolume.textContent = `Volume 3D indisponible : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}`;
        console.error('Chargement du profil ECMWF impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (controleurProfil === requete) {
        controleurProfil = null;
        actualiserVolume.disabled = false;
      }
    }
  }

  function selectionnerVue(nom, focus = false) {
    vueActive = nom;
    ongletsVue.forEach((onglet, index) => {
      const actifOnglet = onglet.id === `vent-vue-${nom}-onglet`;
      onglet.setAttribute('aria-selected', String(actifOnglet));
      onglet.tabIndex = actifOnglet ? 0 : -1;
      if (focus && actifOnglet) onglet.focus();
      contenusVue[index].hidden = !actifOnglet;
    });
    if (nom === 'volume') {
      clearTimeout(minuteur);
      if (controleur) {
        controleur.abort();
        controleur = null;
        actualiser.disabled = false;
      }
      if (actif && !zoneVolumeCapturee) void chargerProfilVolume();
      else mettreAJourAlerteVolume();
    } else {
      if (controleurProfil) {
        controleurProfil.abort();
        controleurProfil = null;
        actualiserVolume.disabled = false;
      }
      if (nom === 'thermiques') calculerThermiques();
      else if (nom === 'carte') programmerChargement();
    }
    if (map.getLayer(COUCHE_THERMIQUES)) {
      map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', actif && nom === 'thermiques' && toggleThermiques.checked ? 'visible' : 'none');
    }
  }

  function appliquerPalette() {
    const couleurs = PALETTES[document.documentElement.dataset.theme] || PALETTES.clair;
    pastillesLegende.forEach((pastille, index) => {
      pastille.style.setProperty('--vent-couleur', couleurs[index]);
    });
    panneau.querySelectorAll('[data-volume-vitesse]').forEach((pastille, index) => {
      pastille.style.setProperty('--vent-couleur', couleurs[index]);
    });
    if (map.getLayer(COUCHE_VENT)) {
      map.setPaintProperty(COUCHE_VENT, 'icon-color', couleurParVitesse(['get', 'vitesse']));
    }
    if (map.getLayer(COUCHE_PARTICULES)) {
      map.setPaintProperty(COUCHE_PARTICULES, 'icon-color', couleurParVitesse(['get', 'vitesse']));
      map.setPaintProperty(COUCHE_PARTICULES, 'icon-halo-color', couleurParVitesse(['get', 'vitesse']));
    }
    if (map.getLayer(COUCHE_THERMIQUES)) {
      map.setPaintProperty(COUCHE_THERMIQUES, 'circle-stroke-color', couleurs[2]);
    }
    afficherResume(resumeVentCourant);
    rendreVolume();
  }

  function arreterAnimation() {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    dernierRenduAnimation = 0;
  }

  function animerParticules(temps) {
    animationFrame = null;
    if (!actif || mouvementReduit.matches || document.hidden || !map.getSource(SOURCE_PARTICULES)) return;
    if (temps - dernierRenduAnimation >= 80) {
      dernierRenduAnimation = temps;
      const features = particules.map((particule) => {
        const origine = map.project(particule.coordonnees);
        const duree = Math.max(850, 1850 - Math.min(1000, particule.vitesse * 15));
        const progression = ((temps / duree + particule.phase) % 1) * 30;
        const radians = (particule.direction * Math.PI) / 180;
        const position = map.unproject([
          origine.x + Math.sin(radians) * progression,
          origine.y - Math.cos(radians) * progression,
        ]);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
          properties: { vitesse: particule.vitesse, direction: particule.direction },
        };
      });
      map.getSource(SOURCE_PARTICULES).setData({ type: 'FeatureCollection', features });
    }
    animationFrame = requestAnimationFrame(animerParticules);
  }

  function demarrerAnimation() {
    if (!actif || mouvementReduit.matches || document.hidden || animationFrame !== null || !particules.length) return;
    animationFrame = requestAnimationFrame(animerParticules);
  }

  function gererMouvementReduit() {
    if (mouvementReduit.matches) {
      arreterAnimation();
      map.getSource(SOURCE_PARTICULES)?.setData({ type: 'FeatureCollection', features: [] });
    } else {
      demarrerAnimation();
    }
  }

  function assurerCouche() {
    if (!map.hasImage('vent-fleche')) map.addImage('vent-fleche', creerImageFleche(), { sdf: true });
    if (!map.getSource(SOURCE_VENT)) {
      map.addSource(SOURCE_VENT, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getSource(SOURCE_PARTICULES)) {
      map.addSource(SOURCE_PARTICULES, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getSource(SOURCE_THERMIQUES)) {
      map.addSource(SOURCE_THERMIQUES, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getLayer(COUCHE_THERMIQUES)) {
      const premiereEtiquette = map.getStyle().layers.find((layer) => layer.type === 'symbol');
      map.addLayer({
        id: COUCHE_THERMIQUES,
        type: 'circle',
        source: SOURCE_THERMIQUES,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'potentiel'], 0, 4, 50, 8, 100, 12],
          'circle-color': ['interpolate', ['linear'], ['get', 'potentiel'], 0, '#e1ba54', 50, '#f28a50', 100, '#d94c58'],
          'circle-opacity': 0.62,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.9,
          'circle-blur': 0.12,
        },
      }, premiereEtiquette?.id);
    }
    if (!map.getLayer(COUCHE_OMBRE_VENT)) {
      const premiereEtiquette = map.getStyle().layers.find((layer) => layer.type === 'symbol');
      map.addLayer(
        {
          id: COUCHE_OMBRE_VENT,
          type: 'symbol',
          source: SOURCE_VENT,
          layout: {
            'icon-image': 'vent-fleche',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['get', 'vitesse'],
              0, 0.45,
              10, 0.58,
              20, 0.75,
              40, 1,
              70, 1.25,
            ],
            'icon-rotate': ['get', 'direction'],
            'icon-rotation-alignment': 'map',
            'icon-offset': [1, 1.5],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': '#000000',
            'icon-halo-color': '#000000',
            'icon-halo-width': 1.2,
            'icon-halo-blur': 1.5,
            'icon-opacity': 0.5,
          },
        },
        premiereEtiquette?.id
      );
    }
    if (!map.getLayer(COUCHE_VENT)) {
      const premiereEtiquette = map.getStyle().layers.find((layer) => layer.type === 'symbol');
      map.addLayer(
        {
          id: COUCHE_VENT,
          type: 'symbol',
          source: SOURCE_VENT,
          layout: {
            'icon-image': 'vent-fleche',
            'icon-size': [
              'interpolate',
              ['linear'],
              ['get', 'vitesse'],
              0, 0.45,
              10, 0.58,
              20, 0.75,
              40, 1,
              70, 1.25,
            ],
            'icon-rotate': ['get', 'direction'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': couleurParVitesse(['get', 'vitesse']),
            'icon-halo-color': '#101317',
            'icon-halo-width': 2,
            'icon-halo-blur': 0.25,
            'icon-opacity': 0.95,
          },
        },
        premiereEtiquette?.id
      );
    }
    if (!map.getLayer(COUCHE_PARTICULES)) {
      map.addLayer({
        id: COUCHE_PARTICULES,
        type: 'symbol',
        source: SOURCE_PARTICULES,
        layout: {
          'icon-image': 'vent-fleche',
          'icon-size': [
            'interpolate',
            ['linear'],
            ['get', 'vitesse'],
            0, 0.19,
            10, 0.24,
            20, 0.3,
            40, 0.37,
            70, 0.44,
          ],
          'icon-rotate': ['get', 'direction'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': couleurParVitesse(['get', 'vitesse']),
          'icon-halo-color': couleurParVitesse(['get', 'vitesse']),
          'icon-halo-width': 3,
          'icon-halo-blur': 2.5,
          'icon-opacity': 0.9,
        },
      });
    }
    appliquerPalette();
    map.setLayoutProperty(COUCHE_OMBRE_VENT, 'visibility', actif ? 'visible' : 'none');
    map.setLayoutProperty(COUCHE_PARTICULES, 'visibility', actif ? 'visible' : 'none');
    map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', actif && vueActive === 'thermiques' && toggleThermiques.checked ? 'visible' : 'none');

    if (!evenementsCoucheAjoutes) {
      map.on('click', COUCHE_VENT, afficherPopup);
      map.on('mouseenter', COUCHE_VENT, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', COUCHE_VENT, () => {
        map.getCanvas().style.cursor = '';
      });
      evenementsCoucheAjoutes = true;
    }
  }

  function afficherPopup(event) {
    const feature = event.features?.[0];
    if (!feature) return;
    const proprietes = feature.properties;
    const contenu = document.createElement('div');
    contenu.className = 'vent-carte-popup';
    const titre = document.createElement('strong');
    titre.textContent = `Vent modélisé à ${selecteurNiveau.value} m au-dessus du sol`;
    const heure = document.createElement('p');
    heure.textContent = `Prévision : ${proprietes.heure}`;
    const vitesse = document.createElement('p');
    vitesse.textContent = `Vent : ${Math.round(proprietes.vitesse)} km/h`;
    const direction = document.createElement('p');
    direction.textContent = `Direction du flux : ${directionVent(proprietes.directionFlux)}`;
    const rafales = document.createElement('p');
    rafales.textContent = `Rafales au sol : ${Number.isFinite(proprietes.rafales) ? `${Math.round(proprietes.rafales)} km/h` : 'indisponibles'}`;
    const altitude = document.createElement('p');
    altitude.textContent = `Altitude du terrain : ${Math.round(proprietes.altitude)} m`;
    contenu.append(titre, heure, vitesse, direction, rafales, altitude);
    new Popup({ closeButton: true, offset: 14 })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(contenu)
      .addTo(map);
  }

  function afficherDonnees(reponses, positions, heureCible) {
    const niveau = NIVEAUX[selecteurNiveau.value];
    const features = [];
    for (let index = 0; index < positions.length; index += 1) {
      const donnees = reponses[index];
      const hourly = donnees?.hourly;
      if (!Array.isArray(hourly?.time)) continue;
      const indexHeure = hourly.time.indexOf(heureCible);
      if (indexHeure < 0) continue;
      const vitesse = hourly[niveau.vitesse]?.[indexHeure];
      const direction = hourly[niveau.direction]?.[indexHeure];
      if (!Number.isFinite(vitesse) || !Number.isFinite(direction)) continue;
      const directionFlux = (direction + 180) % 360;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [positions[index].longitude, positions[index].latitude] },
        properties: {
          vitesse,
          direction: directionFlux,
          directionFlux,
          rafales: hourly.wind_gusts_10m?.[indexHeure],
          altitude: donnees.elevation ?? 0,
          heure: heureCible,
        },
      });
    }
    donneesVentCourantes = { reponses, positions, heureCible };
    afficherResume(features);
    map.getSource(SOURCE_VENT).setData({ type: 'FeatureCollection', features });
    if (vueActive === 'thermiques') calculerThermiques();
    if (map.getLayer(COUCHE_THERMIQUES)) {
      map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', actif && vueActive === 'thermiques' && toggleThermiques.checked ? 'visible' : 'none');
    }
    particules = features.flatMap((feature) =>
      [0, 0.5].map((phase) => ({
        coordonnees: feature.geometry.coordinates,
        vitesse: feature.properties.vitesse,
        direction: feature.properties.direction,
        phase,
      }))
    );
    map.getSource(SOURCE_PARTICULES).setData({ type: 'FeatureCollection', features: [] });
    demarrerAnimation();
    statut.classList.remove('erreur');
    statut.textContent = features.length
      ? `${features.length} flèches · ${niveau.libelle} · ${heureCible} · couleurs en km/h`
      : 'Aucune donnée de vent disponible à cette échéance dans cette zone.';
  }

  async function chargerVent() {
    if (!actif) return;
    if (map.getZoom() < 7) {
      controleur?.abort();
      controleur = null;
      actualiser.disabled = false;
      map.getSource(SOURCE_VENT)?.setData({ type: 'FeatureCollection', features: [] });
      particules = [];
      map.getSource(SOURCE_PARTICULES)?.setData({ type: 'FeatureCollection', features: [] });
      map.getSource(SOURCE_THERMIQUES)?.setData({ type: 'FeatureCollection', features: [] });
      donneesVolume = [];
      rendreVolume();
      afficherResume([]);
      afficherPotentielThermique([]);
      arreterAnimation();
      statut.textContent = 'Zoome davantage pour afficher les flèches de vent.';
      return;
    }

    controleur?.abort();
    const requete = new AbortController();
    controleur = requete;
    actualiser.disabled = true;
    statut.classList.remove('erreur');
    statut.textContent = 'Chargement du vent sur la zone visible…';
    const positions = creerGrille(map);
    const maintenant = Date.now();
    const manquantes = positions.filter((position) => {
      const entree = cache.get(`${position.latitude},${position.longitude}`);
      return !entree || maintenant - entree.recue > DUREE_CACHE;
    });
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);

    try {
      if (manquantes.length) {
        const params = new URLSearchParams({
          latitude: manquantes.map(({ latitude }) => latitude).join(','),
          longitude: manquantes.map(({ longitude }) => longitude).join(','),
          current: 'temperature_2m',
          hourly: 'wind_speed_10m,wind_direction_10m,wind_speed_100m,wind_direction_100m,wind_speed_200m,wind_direction_200m,wind_gusts_10m,temperature_2m,dew_point_2m,cloud_cover,shortwave_radiation',
          models: 'meteofrance_seamless',
          forecast_days: '3',
          timezone: 'auto',
          wind_speed_unit: 'kmh',
        });
        const reponse = await fetch(`${API_VENT}?${params}`, { signal: requete.signal });
        if (!reponse.ok) throw new Error(`Le service météo répond avec le statut ${reponse.status}.`);
        const resultat = await reponse.json();
        if (requete.signal.aborted || controleur !== requete || !actif) return;
        const donnees = Array.isArray(resultat) ? resultat : [resultat];
        if (donnees.length !== manquantes.length) {
          throw new Error('Le service météo a renvoyé un nombre de points inattendu.');
        }
        donnees.forEach((entree, index) => {
          if (!Array.isArray(entree?.hourly?.time)) {
            throw new Error('Le service météo a renvoyé des prévisions horaires incomplètes.');
          }
          cache.set(`${manquantes[index].latitude},${manquantes[index].longitude}`, {
            donnees: entree,
            recue: Date.now(),
          });
        });
        while (cache.size > 200) cache.delete(cache.keys().next().value);
      }

      if (requete.signal.aborted || controleur !== requete || !actif) return;
      const reponses = positions.map(
        (position) => cache.get(`${position.latitude},${position.longitude}`).donnees
      );
      const heureBase = reponses[0].hourly.time.find((heure) => heure >= reponses[0].current.time);
      if (!heureBase) throw new Error('Aucune prévision horaire à venir n’est disponible.');
      const decalage = Number(selecteurEcheance.value);
      const indexHeureBase = reponses[0].hourly.time.indexOf(heureBase);
      const indexCible = indexHeureBase + decalage;
      if (indexCible >= reponses[0].hourly.time.length) {
        throw new Error('Cette échéance n’est pas disponible pour la zone affichée.');
      }
      heureCourante = reponses[0].hourly.time[indexCible];
      afficherDonnees(reponses, positions, heureCourante);
    } catch (erreur) {
      if (requete.signal.aborted && controleur === requete && actif) {
        statut.classList.add('erreur');
        statut.textContent = 'Le chargement prend trop de temps. Vérifie ta connexion puis actualise.';
      } else if (controleur === requete && actif) {
        statut.classList.add('erreur');
        statut.textContent = `Carte de vent indisponible : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}`;
        console.error('Chargement de la carte de vent impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (controleur === requete) actualiser.disabled = false;
    }
  }

  function programmerChargement() {
    if (!actif || vueActive === 'volume') return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => void chargerVent(), 450);
  }

  selecteurNiveau.addEventListener('change', () => {
    ecrire('vent-niveau', Number(selecteurNiveau.value));
    if (heureCourante) {
      const positions = creerGrille(map);
      const reponses = positions.map(
        (position) => cache.get(`${position.latitude},${position.longitude}`)?.donnees
      );
      if (reponses.every(Boolean)) afficherDonnees(reponses, positions, heureCourante);
      else void chargerVent();
    }
  });
  selecteurEcheance.addEventListener('change', () => {
    ecrire('vent-echeance', Number(selecteurEcheance.value));
    tempsVolume.value = '0';
    void chargerVent();
  });
  ongletsVue.forEach((onglet, index) => {
    onglet.addEventListener('click', () => {
      selectionnerVue(['carte', 'volume', 'thermiques'][index]);
    });
  });
  panneau.querySelector('.vent-vues').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = ongletsVue.findIndex((onglet) => onglet.getAttribute('aria-selected') === 'true');
    const prochain = event.key === 'Home' ? 0
      : event.key === 'End' ? ongletsVue.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + ongletsVue.length) % ongletsVue.length;
    selectionnerVue(['carte', 'volume', 'thermiques'][prochain], true);
  });
  actualiserVolume.addEventListener('click', () => void chargerProfilVolume(true));
  svgVolume.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    glissementVolume = { pointerId: event.pointerId, x: event.clientX, rotation: rotationVolumeDegres };
    svgVolume.classList.add('rotation-active');
    svgVolume.setPointerCapture(event.pointerId);
  });
  svgVolume.addEventListener('pointermove', (event) => {
    if (!glissementVolume || event.pointerId !== glissementVolume.pointerId) return;
    event.stopPropagation();
    rotationVolumeDegres = glissementVolume.rotation + (event.clientX - glissementVolume.x) * 0.8;
    rotationVolumeDegres = ((rotationVolumeDegres + 180) % 360 + 360) % 360 - 180;
    rendreVolume();
  });
  const terminerRotationVolume = (event) => {
    if (!glissementVolume || event.pointerId !== glissementVolume.pointerId) return;
    glissementVolume = null;
    svgVolume.classList.remove('rotation-active');
    ecrire('vent-volume-rotation', Math.round(rotationVolumeDegres * 10) / 10);
  };
  svgVolume.addEventListener('pointerup', terminerRotationVolume);
  svgVolume.addEventListener('pointercancel', terminerRotationVolume);
  svgVolume.addEventListener('keydown', (event) => {
    const pas = event.shiftKey ? 30 : 10;
    if (event.key === 'ArrowLeft') rotationVolumeDegres -= pas;
    else if (event.key === 'ArrowRight') rotationVolumeDegres += pas;
    else return;
    event.preventDefault();
    rotationVolumeDegres = ((rotationVolumeDegres + 180) % 360 + 360) % 360 - 180;
    ecrire('vent-volume-rotation', rotationVolumeDegres);
    rendreVolume();
  });
  tempsVolume.addEventListener('input', () => {
    construireVolumeDepuisProfil();
  });
  plafondsVolume.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      plafondVolume = Number(radio.value);
      ecrire('vent-volume-plafond', plafondVolume);
      rendreVolume();
      construireVolumeDepuisProfil();
    });
  });
  toggleThermiques.addEventListener('change', () => {
    if (map.getLayer(COUCHE_THERMIQUES)) {
      map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', actif && vueActive === 'thermiques' && toggleThermiques.checked ? 'visible' : 'none');
    }
  });
  actualiser.addEventListener('click', () => {
    cache.clear();
    void chargerVent();
  });
  map.on('moveend', programmerChargement);
  map.on('moveend', () => {
    mettreAJourAlerteVolume();
  });
  map.on('style.load', () => {
    if (!actif) return;
    assurerCouche();
    if (vueActive !== 'volume') void chargerVent();
  });
  const observateurTheme = new MutationObserver(appliquerPalette);
  observateurTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) arreterAnimation();
    else demarrerAnimation();
  });
  mouvementReduit.addEventListener('change', gererMouvementReduit);
  appliquerPalette();

  return {
    id: 'vent',
    label: 'Vent et prévisions',
    icone: 'vent',
    panneau,
    definirEmplacementParDefaut(conteneur) {
      emplacementParDefaut = conteneur;
    },
    monterDans(conteneur) {
      conteneur.appendChild(panneau);
    },
    retournerAuMenu() {
      if (emplacementParDefaut && panneau.parentElement !== emplacementParDefaut) {
        emplacementParDefaut.appendChild(panneau);
      }
    },
    activer() {
      actif = true;
      assurerCouche();
      map.setLayoutProperty(COUCHE_VENT, 'visibility', 'visible');
      map.setLayoutProperty(COUCHE_OMBRE_VENT, 'visibility', 'visible');
      map.setLayoutProperty(COUCHE_PARTICULES, 'visibility', 'visible');
      map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', vueActive === 'thermiques' && toggleThermiques.checked ? 'visible' : 'none');
      if (vueActive !== 'volume') void chargerVent();
      else if (!zoneVolumeCapturee) void chargerProfilVolume();
    },
    desactiver() {
      actif = false;
      clearTimeout(minuteur);
      controleur?.abort();
      controleurProfil?.abort();
      controleurProfil = null;
      actualiserVolume.disabled = false;
      arreterAnimation();
      map.getSource(SOURCE_PARTICULES)?.setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer(COUCHE_VENT)) map.setLayoutProperty(COUCHE_VENT, 'visibility', 'none');
      if (map.getLayer(COUCHE_OMBRE_VENT)) map.setLayoutProperty(COUCHE_OMBRE_VENT, 'visibility', 'none');
      if (map.getLayer(COUCHE_PARTICULES)) map.setLayoutProperty(COUCHE_PARTICULES, 'visibility', 'none');
      if (map.getLayer(COUCHE_THERMIQUES)) map.setLayoutProperty(COUCHE_THERMIQUES, 'visibility', 'none');
    },
  };
}
