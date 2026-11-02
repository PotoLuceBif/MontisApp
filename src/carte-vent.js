import { lire, ecrire } from './reglages.js';
import { Popup } from 'maplibre-gl';
import { altitude as altitudeDem, preparerTuiles } from './portee.js';
import {
  HAUTEURS_VENT,
  VARIABLES_VENT,
  colonneVent,
  creerChamp,
  depuisComposantes,
  lireChamp,
  pointCardinal,
  ventAHauteur,
} from './vent-calcul.js';
import { creerCoucheVent, longueurFleche } from './vent-couche-carte.js';
import { creerVolume3D } from './vent-volume-3d.js';

const API_VENT = 'https://api.open-meteo.com/v1/forecast';
const SOURCE_VENT = 'vent-previsions';
const COUCHE_VENT = 'vent-previsions-fleches';
const DELAI_CHARGEMENT = 15000;
const MAX_POINTS = 48;
const MARGE_ZONE = 0.25; // part de l'écran chargée en plus de chaque côté
const PAS_MIN_GRILLE = 1 / 64; // environ 1,7 km, de l'ordre de la maille du modèle
const DUREE_CACHE = 15 * 60 * 1000;
const MESSAGE_LIMITE = 'Limite de requêtes Open-Meteo atteinte. Réessayez plus tard.';
const PLAFONDS_VOLUME = [500, 1000, 2000];
const ETENDUES_VOLUME = [5000, 10000, 20000, 40000]; // demi-côté du bloc, en mètres
const NOEUDS_VOLUME = 6; // par côté : le vent est interpolé entre ces points
const MAILLE_RELIEF = 36;
const FLECHES_PAR_COTE = 5;
const FLECHES_PAR_COTE_COUCHE_SEULE = 10;
const METRES_PAR_DEGRE = 111320;
const PALETTES = {
  clair: ['#248a4b', '#c68b00', '#df6718', '#c93636'],
  sombre: ['#43c98b', '#edc653', '#f28a50', '#ff647c'],
  cyberpunk: ['#4debd4', '#ffe45c', '#ff9b45', '#ff5da2'],
};
const LIBELLE_HAUTEUR = (hauteur) => `${hauteur.toLocaleString('fr-FR')} m`;
const ECHEANCES = [
  { valeur: '0', libelle: 'Prochaine heure' },
  { valeur: '3', libelle: 'Dans 3 heures' },
  { valeur: '6', libelle: 'Dans 6 heures' },
  { valeur: '12', libelle: 'Dans 12 heures' },
  { valeur: '24', libelle: 'Dans 24 heures' },
];
const PALIERS_LEGENDE = [
  { vitesse: 5, libelle: '0–9 km/h' },
  { vitesse: 15, libelle: '10–19 km/h' },
  { vitesse: 25, libelle: '20–29 km/h' },
  { vitesse: 40, libelle: '30+ km/h' },
];

const cleePosition = ({ latitude, longitude }) => `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
const metresParDegreLng = (latitude) => METRES_PAR_DEGRE * Math.cos((latitude * Math.PI) / 180);

// Grille calée sur le globe : après un déplacement, les points déjà reçus restent
// valables. Elle déborde de l'écran pour que l'on puisse déplacer la carte sans
// sortir tout de suite de la zone chargée.
function creerGrille(map) {
  const limites = map.getBounds();
  const margeLat = (limites.getNorth() - limites.getSouth()) * MARGE_ZONE;
  const margeLng = (limites.getEast() - limites.getWest()) * MARGE_ZONE;
  const nord = Math.min(85, limites.getNorth() + margeLat);
  const sud = Math.max(-85, limites.getSouth() - margeLat);
  const est = limites.getEast() + margeLng;
  const ouest = limites.getWest() - margeLng;
  // Même distance au sol dans les deux sens, à la latitude arrondie de la zone
  const latitudeArrondie = Math.round((nord + sud) / 10) * 5;
  const rapportLng = 1 / Math.cos((latitudeArrondie * Math.PI) / 180);
  let pasLat = PAS_MIN_GRILLE;
  let bornes;
  do {
    const pasLng = pasLat * rapportLng;
    bornes = {
      pasLat,
      pasLng,
      iy0: Math.floor(sud / pasLat),
      iy1: Math.ceil(nord / pasLat),
      ix0: Math.floor(ouest / pasLng),
      ix1: Math.ceil(est / pasLng),
    };
    bornes.nx = bornes.ix1 - bornes.ix0 + 1;
    bornes.ny = bornes.iy1 - bornes.iy0 + 1;
    pasLat *= Math.SQRT2; // maille la plus fine possible pour le nombre de points permis
  } while (bornes.nx * bornes.ny > MAX_POINTS);

  const positions = [];
  for (let iy = 0; iy < bornes.ny; iy += 1) {
    for (let ix = 0; ix < bornes.nx; ix += 1) {
      positions.push({
        latitude: (bornes.iy0 + iy) * bornes.pasLat,
        longitude: (((bornes.ix0 + ix) * bornes.pasLng + 180) % 360 + 360) % 360 - 180,
      });
    }
  }
  return {
    ouest: bornes.ix0 * bornes.pasLng,
    sud: bornes.iy0 * bornes.pasLat,
    pasLng: bornes.pasLng,
    pasLat: bornes.pasLat,
    nx: bornes.nx,
    ny: bornes.ny,
    positions,
  };
}

function creerGrilleVolume(centre, demi) {
  const demiLat = demi / METRES_PAR_DEGRE;
  const demiLng = demi / metresParDegreLng(centre.lat);
  const pasLat = (2 * demiLat) / (NOEUDS_VOLUME - 1);
  const pasLng = (2 * demiLng) / (NOEUDS_VOLUME - 1);
  const positions = [];
  for (let iy = 0; iy < NOEUDS_VOLUME; iy += 1) {
    for (let ix = 0; ix < NOEUDS_VOLUME; ix += 1) {
      positions.push({
        latitude: centre.lat - demiLat + iy * pasLat,
        longitude: centre.lng - demiLng + ix * pasLng,
      });
    }
  }
  return {
    ouest: centre.lng - demiLng,
    sud: centre.lat - demiLat,
    pasLng,
    pasLat,
    nx: NOEUDS_VOLUME,
    ny: NOEUDS_VOLUME,
    positions,
  };
}

function directionVent(degres) {
  if (!Number.isFinite(degres)) return 'indisponible';
  return `${pointCardinal(degres)} (${Math.round(degres)}°)`;
}

function formaterHeure(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const heure = `${String(date.getHours()).padStart(2, '0')}h${String(date.getMinutes()).padStart(2, '0')}`;
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const auj = new Date();
  const ecart = Math.round((jour - new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 86400000);
  if (ecart === 0) return `Aujourd’hui · ${heure}`;
  if (ecart === 1) return `Demain · ${heure}`;
  return `${date.toLocaleDateString('fr-FR', { weekday: 'long' })} · ${heure}`;
}

function iconeLegende(palier, vitesse) {
  const longueur = longueurFleche(vitesse);
  return `<svg data-palier="${palier}" width="${longueur}" height="10" viewBox="0 0 ${longueur} 10" aria-hidden="true"><path d="M1 5 H${longueur - 7}" /><path class="plein" d="M${longueur - 1} 5 L${longueur - 8} 1 V9 Z"/></svg>`;
}

export function creerCarteVent(map) {
  const panneau = document.createElement('div');
  panneau.className = 'vent-carte';
  panneau.innerHTML = `
    <header class="vent-carte-entete">
      <h3>Vent prévu</h3>
      <span class="vent-carte-modele">Météo-France</span>
    </header>
    <div class="vent-vues" role="tablist" aria-label="Vues de l’analyse vent">
      <button type="button" role="tab" id="vent-vue-carte-onglet" aria-selected="true" aria-controls="vent-vue-carte">Carte</button>
      <button type="button" role="tab" id="vent-vue-volume-onglet" aria-selected="false" aria-controls="vent-vue-volume" tabindex="-1">Volume 3D</button>
    </div>
    <div class="vent-zone-alerte" role="status" hidden>
      <p data-zone-message></p>
      <button type="button" class="vent-zone-actualiser">Actualiser sur cette zone</button>
    </div>
    <section class="vent-vue-contenu" id="vent-vue-carte" role="tabpanel" aria-labelledby="vent-vue-carte-onglet">
      <div class="vent-carte-controles">
        <label><span>Hauteur au-dessus du sol</span><select class="vent-carte-niveau" aria-label="Hauteur du vent au-dessus du sol">
          ${HAUTEURS_VENT.map((hauteur) => `<option value="${hauteur}">${LIBELLE_HAUTEUR(hauteur)}</option>`).join('')}
        </select></label>
        <label><span>Échéance</span><select class="vent-carte-echeance" aria-label="Échéance des prévisions">
          ${ECHEANCES.map(({ valeur, libelle }) => `<option value="${valeur}">${libelle}</option>`).join('')}
        </select></label>
      </div>
      <div class="vent-carte-resume" aria-label="Résumé du vent">
        <div><span>Vent moyen</span><strong data-vent-moyen>—</strong></div>
        <div><span>Rafales au sol, max.</span><strong data-vent-rafales>—</strong></div>
        <div><span>Vient de → va vers</span><strong data-vent-direction>—</strong></div>
      </div>
      <div class="vent-carte-legende" aria-label="Intensité du vent en kilomètres par heure">
        ${PALIERS_LEGENDE.map(({ vitesse, libelle }, index) => `<span>${iconeLegende(index, vitesse)} ${libelle}</span>`).join('')}
      </div>
      <p class="vent-carte-statut" role="status" aria-live="polite">Active le calque pour charger le vent sur la carte.</p>
      <button class="vent-carte-actualiser" type="button">Actualiser la carte</button>
      <p class="vent-carte-note">Chaque flèche pointe là où va le vent, et sa longueur suit sa vitesse. Les traînées suivent le même sens. Modèle Météo-France (AROME selon couverture, ARPEGE ailleurs), interpolé entre les points de calcul. Données indicatives · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>.</p>
    </section>
    <section class="vent-vue-contenu" id="vent-vue-volume" role="tabpanel" aria-labelledby="vent-vue-volume-onglet" hidden>
      <section class="vent-volume" aria-labelledby="vent-volume-titre">
        <div class="vent-volume-entete">
          <button type="button" class="vent-volume-retour" aria-label="Quitter le plein écran" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
          <h4 id="vent-volume-titre">Vent au-dessus du relief</h4>
          <span class="vent-volume-badge" data-volume-zone>3D</span>
        </div>
        <div class="vent-volume-reglages">
          <fieldset class="vent-volume-plafonds">
            <legend>Jusqu’à</legend>
            ${PLAFONDS_VOLUME.map((plafond) => `<label><input type="radio" name="vent-volume-plafond" value="${plafond}"${plafond === 2000 ? ' checked' : ''}><span>${plafond.toLocaleString('fr-FR')} m</span></label>`).join('')}
          </fieldset>
          <label class="vent-volume-couche"><span>Couches</span><select aria-label="Couche de vent affichée">
            <option value="toutes">Toutes</option>
            ${HAUTEURS_VENT.map((hauteur) => `<option value="${hauteur}">${LIBELLE_HAUTEUR(hauteur)}</option>`).join('')}
          </select></label>
        </div>
        <div class="vent-volume-heure"><strong data-volume-heure>—</strong><span>Échéance</span></div>
        <input class="vent-volume-temps" type="range" min="0" max="24" value="0" aria-label="Échéance horaire du volume 3D">
        <div class="vent-volume-scene">
          <canvas class="vent-volume-canvas" role="img" tabindex="0" aria-label="Volume 3D du vent au-dessus du relief. Glisser pour tourner et incliner, pincer pour zoomer."></canvas>
          <div class="vent-volume-boutons">
            <button type="button" class="vent-volume-recentrer" aria-label="Recentrer la vue" title="Recentrer la vue"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
            <button type="button" class="vent-volume-agrandir" aria-label="Afficher en plein écran" title="Plein écran"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          </div>
        </div>
        <p class="vent-volume-detail" data-volume-detail>1 doigt : tourner, incliner · 2 doigts : zoomer · double toucher : recentrer · toucher une flèche : lire sa valeur.</p>
        <div class="vent-volume-legende" aria-label="Intensité du vent">
          <span><i data-volume-vitesse="0"></i> 0–9 km/h</span><span><i data-volume-vitesse="1"></i> 10–19 km/h</span>
          <span><i data-volume-vitesse="2"></i> 20–29 km/h</span><span><i data-volume-vitesse="3"></i> 30+ km/h</span>
        </div>
        <p class="vent-volume-statut" role="status" aria-live="polite">Ouvre cette vue pour charger le profil vertical de la zone.</p>
        <button class="vent-volume-actualiser" type="button">Actualiser le volume</button>
        <p class="vent-volume-note">Graduations de gauche : altitude réelle. Graduations de droite : hauteur de chaque couche au-dessus du sol. Les flèches pointent là où va le vent et leur longueur suit sa vitesse. Le vent est interpolé entre les vents de surface et les niveaux de pression du modèle ; les effets locaux du relief ne sont pas résolus.</p>
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
  const ongletsVue = [...panneau.querySelectorAll('.vent-vues [role="tab"]')];
  const contenusVue = [...panneau.querySelectorAll('.vent-vue-contenu')];
  const blocVolume = panneau.querySelector('.vent-volume');
  const canvasVolume = panneau.querySelector('.vent-volume-canvas');
  const statutVolume = panneau.querySelector('.vent-volume-statut');
  const actualiserVolume = panneau.querySelector('.vent-volume-actualiser');
  const heureVolume = panneau.querySelector('[data-volume-heure]');
  const zoneVolume = panneau.querySelector('[data-volume-zone]');
  const detailVolume = panneau.querySelector('[data-volume-detail]');
  const tempsVolume = panneau.querySelector('.vent-volume-temps');
  const plafondsVolume = [...panneau.querySelectorAll('input[name="vent-volume-plafond"]')];
  const selecteurCouche = panneau.querySelector('.vent-volume-couche select');
  const boutonAgrandir = panneau.querySelector('.vent-volume-agrandir');
  const boutonRetour = panneau.querySelector('.vent-volume-retour');
  const alerteZone = panneau.querySelector('.vent-zone-alerte');
  const messageZone = panneau.querySelector('[data-zone-message]');
  const actualiserZone = panneau.querySelector('.vent-zone-actualiser');
  const aideVolume = detailVolume.textContent;
  const cache = new Map();
  let actif = false;
  let controleur = null;
  let controleurProfil = null;
  let heureCourante = '';
  let evenementsCoucheAjoutes = false;
  let emplacementParDefaut = null;
  let donneesVentCourantes = null;
  let resumeVentCourant = [];
  let zoneVolumeCapturee = null;
  let zoneCarteCapturee = null;
  let vueActive = 'carte';
  let emplacementVolume = null;
  let plafondVolume = Number(lire('vent-volume-plafond', 2000));
  if (!PLAFONDS_VOLUME.includes(plafondVolume)) plafondVolume = 2000;
  plafondsVolume.forEach((radio) => {
    radio.checked = Number(radio.value) === plafondVolume;
  });
  let rotationInitiale = Number(lire('vent-volume-rotation', 28));
  if (!Number.isFinite(rotationInitiale)) rotationInitiale = 28;

  selecteurNiveau.value = String(lire('vent-niveau', 10));
  if (!HAUTEURS_VENT.includes(Number(selecteurNiveau.value))) selecteurNiveau.value = '10';
  selecteurEcheance.value = String(lire('vent-echeance', 0));
  if (!ECHEANCES.some(({ valeur }) => valeur === selecteurEcheance.value)) {
    selecteurEcheance.value = '0';
  }

  function couleurVitesse(vitesse) {
    const couleurs = PALETTES[document.documentElement.dataset.theme] || PALETTES.clair;
    return vitesse < 10 ? couleurs[0] : vitesse < 20 ? couleurs[1] : vitesse < 30 ? couleurs[2] : couleurs[3];
  }

  const coucheVent = creerCoucheVent(map, {
    couleur: couleurVitesse,
    halo: () => (['sombre', 'cyberpunk'].includes(document.documentElement.dataset.theme)
      ? 'rgba(10, 14, 18, .85)'
      : 'rgba(255, 255, 255, .92)'),
    onFleches(fleches) {
      map.getSource(SOURCE_VENT)?.setData({
        type: 'FeatureCollection',
        features: fleches.map(({ lng, lat, vitesse, flux, provenance }) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { vitesse, flux, provenance },
        })),
      });
    },
  });

  const volume = creerVolume3D(canvasVolume, {
    couleur: couleurVitesse,
    rotationInitiale,
    onRotation(degres) {
      ecrire('vent-volume-rotation', Math.round(degres * 10) / 10);
    },
    onSelection(fleche) {
      detailVolume.textContent = fleche
        ? `${LIBELLE_HAUTEUR(fleche.hauteur)} au-dessus du sol · ${Math.round(fleche.vitesse)} km/h · vient de ${pointCardinal(fleche.provenance)}, va vers ${pointCardinal(fleche.flux)}`
        : aideVolume;
    },
  });

  function afficherResume(points) {
    resumeVentCourant = points;
    if (!points.length) {
      resumeMoyen.textContent = '—';
      resumeRafales.textContent = '—';
      resumeDirection.textContent = '—';
      couleursResume.forEach((element) => element.style.removeProperty('color'));
      return;
    }
    const moyenne = points.reduce((total, point) => total + Math.hypot(point.u, point.v), 0) / points.length;
    const rafales = points.map((point) => point.rafales).filter(Number.isFinite);
    const u = points.reduce((total, point) => total + point.u, 0);
    const v = points.reduce((total, point) => total + point.v, 0);
    const { flux, provenance } = depuisComposantes(u, v);
    const rafaleMax = rafales.length ? Math.max(...rafales) : null;
    resumeMoyen.textContent = `${Math.round(moyenne)} km/h`;
    resumeRafales.textContent = rafaleMax === null ? '—' : `${Math.round(rafaleMax)} km/h`;
    resumeDirection.textContent = `${pointCardinal(provenance)} → ${pointCardinal(flux)}`;
    resumeDirection.title = `Le vent vient de ${directionVent(provenance)} et va vers ${directionVent(flux)}`;
    resumeMoyen.style.color = couleurVitesse(moyenne);
    if (rafaleMax === null) resumeRafales.style.removeProperty('color');
    else resumeRafales.style.color = couleurVitesse(rafaleMax);
  }

  // ---------- Volume 3D ----------
  function indexBaseVolume() {
    const premier = zoneVolumeCapturee?.reponses[0];
    const heures = premier?.hourly?.time;
    if (!heures) return -1;
    return heures.findIndex((heure) => heure >= (premier.current?.time || heures[0]));
  }

  function construireCouches() {
    if (!zoneVolumeCapturee) return;
    const { reponses, grille, demi, centre } = zoneVolumeCapturee;
    const heures = reponses[0].hourly.time;
    const base = Math.max(0, indexBaseVolume());
    tempsVolume.max = String(Math.max(0, Math.min(48, heures.length - 1 - base)));
    const heureCible = heures[base + Number(tempsVolume.value)];
    if (!heureCible) {
      statutVolume.classList.remove('erreur');
      statutVolume.textContent = 'Cette échéance n’est pas disponible pour cette zone.';
      return;
    }
    heureVolume.textContent = formaterHeure(heureCible);

    const colonnes = reponses.map((donnees) => {
      const index = donnees.hourly.time.indexOf(heureCible);
      return index < 0 ? [] : colonneVent(donnees.hourly, index, donnees.elevation);
    });
    const coucheChoisie = selecteurCouche.value === 'toutes' ? null : Number(selecteurCouche.value);
    let hauteurs = HAUTEURS_VENT.filter((hauteur) => hauteur <= plafondVolume);
    if (coucheChoisie !== null) {
      hauteurs = hauteurs.filter((hauteur) => hauteur === coucheChoisie);
    } else if (hauteurs.length > 6) {
      hauteurs = hauteurs.filter((hauteur) => hauteur !== 100); // trop serrée à cette échelle
    }
    const parCote = coucheChoisie !== null ? FLECHES_PAR_COTE_COUCHE_SEULE : FLECHES_PAR_COTE;
    const cellule = (2 * demi) / parCote;
    const kLng = metresParDegreLng(centre.lat);
    let nombreFleches = 0;

    const couches = hauteurs.map((hauteur, rang) => {
      const champ = creerChamp(grille, colonnes.map((colonne) => ventAHauteur(colonne, hauteur)));
      // Une couche sur deux est décalée d'une demi-maille, comme un quinconce,
      // pour que les flèches ne se cachent pas les unes les autres à la verticale
      const decalage = rang % 2 ? 1 : 0.5;
      const dernier = rang % 2 ? parCote - 1 : parCote;
      const fleches = [];
      for (let iy = 0; iy < dernier; iy += 1) {
        for (let ix = 0; ix < dernier; ix += 1) {
          const x = -demi + (ix + decalage) * cellule;
          const y = -demi + (iy + decalage) * cellule;
          const vent = lireChamp(champ, centre.lng + x / kLng, centre.lat + y / METRES_PAR_DEGRE);
          if (!vent) continue;
          const { vitesse, flux, provenance } = depuisComposantes(vent.u, vent.v);
          const norme = vitesse || 1;
          fleches.push({
            x, y,
            z: volume.altitudeTerrain(x, y) + hauteur,
            dx: vent.u / norme,
            dy: vent.v / norme,
            longueur: cellule * Math.min(1.15, 0.2 + vitesse / 55),
            hauteur, vitesse, flux, provenance,
          });
        }
      }
      nombreFleches += fleches.length;
      return { hauteur, fleches };
    });

    volume.definirCouches(couches, plafondVolume);
    statutVolume.classList.remove('erreur');
    if (!nombreFleches) {
      statutVolume.textContent = 'Aucun vent disponible à cette hauteur pour cette zone et cette échéance.';
      return;
    }
    const exageration = volume.exageration;
    statutVolume.textContent = `${nombreFleches} flèches · jusqu’à ${plafondVolume.toLocaleString('fr-FR')} m au-dessus du sol`
      + (exageration > 1.05 ? ` · hauteurs ×${exageration.toFixed(1).replace('.', ',')} à l’écran` : '');
  }

  function demiCoteVisible() {
    const { clientWidth: largeur, clientHeight: hauteur } = map.getCanvas();
    const metresParPixel = (40075016 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    const visible = (Math.min(largeur, hauteur) * metresParPixel) / 2;
    return ETENDUES_VOLUME.find((etendue) => etendue >= visible) ?? ETENDUES_VOLUME.at(-1);
  }

  async function chargerRelief(centre, demi, grille, reponses) {
    const z = demi <= 5000 ? 12 : demi <= 10000 ? 11 : demi <= 20000 ? 10 : 9;
    const n = MAILLE_RELIEF;
    const kLng = metresParDegreLng(centre.lat);
    const altitudes = new Float32Array((n + 1) ** 2);
    let lecture;
    try {
      await preparerTuiles(centre.lng, centre.lat, demi * 1.05, z);
      lecture = (lng, lat) => altitudeDem(lng, lat, z);
    } catch (erreur) {
      // Sans tuiles, on garde l'altitude des points météo : plus grossière, mais cohérente
      console.warn('Relief du volume dégradé :', erreur);
      const champ = creerChamp(grille, reponses.map((donnees) => ({ u: donnees.elevation ?? 0, v: 0 })));
      lecture = (lng, lat) => lireChamp(champ, lng, lat)?.u;
    }
    let min = Infinity;
    let max = -Infinity;
    let precedente = 0;
    for (let iy = 0; iy <= n; iy += 1) {
      for (let ix = 0; ix <= n; ix += 1) {
        const x = -demi + (2 * demi * ix) / n;
        const y = -demi + (2 * demi * iy) / n;
        const lue = lecture(centre.lng + x / kLng, centre.lat + y / METRES_PAR_DEGRE);
        const valeur = Number.isFinite(lue) ? lue : precedente;
        precedente = valeur;
        altitudes[iy * (n + 1) + ix] = valeur;
        if (valeur < min) min = valeur;
        if (valeur > max) max = valeur;
      }
    }
    return { demi, n, altitudes, min, max };
  }

  // Rien ne se recharge quand la carte bouge : le champ chargé est rééchantillonné,
  // et on prévient seulement quand il ne suffit plus
  function mettreAJourAlerte() {
    if (!actif) {
      alerteZone.hidden = true;
      return;
    }
    let message = '';
    if (vueActive === 'volume' && zoneVolumeCapturee) {
      const { centre, demi } = zoneVolumeCapturee;
      const courant = map.getCenter();
      const ecart = Math.hypot((courant.lng - centre.lng) * metresParDegreLng(centre.lat), (courant.lat - centre.lat) * METRES_PAR_DEGRE);
      if (ecart > demi * 0.5 || demiCoteVisible() !== demi) {
        message = 'Vous ne visez plus la même zone : ce volume reste celui de la zone actualisée.';
      }
    } else if (vueActive !== 'volume' && zoneCarteCapturee) {
      const { grille, zoom } = zoneCarteCapturee;
      const limites = map.getBounds();
      const depasse = limites.getWest() < grille.ouest
        || limites.getSouth() < grille.sud
        || limites.getEast() > grille.ouest + (grille.nx - 1) * grille.pasLng
        || limites.getNorth() > grille.sud + (grille.ny - 1) * grille.pasLat;
      if (depasse) {
        message = 'La carte dépasse la zone chargée : les flèches s’arrêtent à son bord.';
      } else if (map.getZoom() - zoom >= 1.5 && grille.pasLat > PAS_MIN_GRILLE) {
        message = 'Vous êtes plus près : actualisez pour un vent plus détaillé.';
      }
    }
    messageZone.textContent = message;
    alerteZone.hidden = !message;
  }

  // Demande à Open-Meteo les points absents du cache. Une seule requête et un seul
  // modèle pour toutes les vues : le sol et l'altitude restent cohérents.
  async function chargerPointsManquants(positions, signal) {
    const maintenant = Date.now();
    const manquantes = positions.filter((position) => {
      const entree = cache.get(cleePosition(position));
      return !entree || maintenant - entree.recue > DUREE_CACHE;
    });
    if (!manquantes.length) return;
    const params = new URLSearchParams({
      latitude: manquantes.map(({ latitude }) => latitude.toFixed(4)).join(','),
      longitude: manquantes.map(({ longitude }) => longitude.toFixed(4)).join(','),
      current: 'temperature_2m',
      hourly: [...VARIABLES_VENT, 'wind_gusts_10m'].join(','),
      models: 'meteofrance_seamless',
      forecast_days: '3',
      timezone: 'auto',
      wind_speed_unit: 'kmh',
    });
    const reponse = await fetch(`${API_VENT}?${params}`, { signal });
    if (reponse.status === 429) throw new Error(MESSAGE_LIMITE);
    if (!reponse.ok) throw new Error(`Le service météo répond avec le statut ${reponse.status}.`);
    const resultat = await reponse.json();
    const donnees = Array.isArray(resultat) ? resultat : [resultat];
    if (donnees.length !== manquantes.length) {
      throw new Error('Le service météo a renvoyé un nombre de points inattendu.');
    }
    donnees.forEach((entree, index) => {
      if (!Array.isArray(entree?.hourly?.time)) {
        throw new Error('Le service météo a renvoyé des prévisions horaires incomplètes.');
      }
      cache.set(cleePosition(manquantes[index]), {
        donnees: entree,
        recue: Date.now(),
      });
    });
    while (cache.size > 400) cache.delete(cache.keys().next().value);
  }

  async function chargerProfilVolume() {
    if (!actif || vueActive !== 'volume' || controleurProfil) return;
    const { lng, lat } = map.getCenter();
    const centre = { lng, lat };
    const demi = demiCoteVisible();
    const grille = creerGrilleVolume(centre, demi);
    const requete = new AbortController();
    controleurProfil = requete;
    actualiserVolume.disabled = true;
    statutVolume.classList.remove('erreur');
    statutVolume.textContent = 'Chargement du vent et du relief pour le volume…';
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);
    try {
      await chargerPointsManquants(grille.positions, requete.signal);
      const reponses = grille.positions.map((position) => cache.get(cleePosition(position)).donnees);
      const relief = await chargerRelief(centre, demi, grille, reponses);
      if (requete.signal.aborted || controleurProfil !== requete || !actif || vueActive !== 'volume') return;
      zoneVolumeCapturee = { centre, demi, grille, reponses };
      zoneVolume.textContent = `±${(demi / 1000).toLocaleString('fr-FR')} km`;
      volume.definirRelief(relief);
      construireCouches();
      mettreAJourAlerte();
    } catch (erreur) {
      if (requete.signal.aborted && controleurProfil === requete && actif && vueActive === 'volume') {
        statutVolume.classList.add('erreur');
        statutVolume.textContent = 'Le chargement du volume prend trop de temps. Vérifie ta connexion puis actualise.';
      } else if (controleurProfil === requete && actif && vueActive === 'volume') {
        statutVolume.classList.add('erreur');
        statutVolume.textContent = `Volume 3D indisponible : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}`;
        console.error('Chargement du volume de vent impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (controleurProfil === requete) {
        controleurProfil = null;
        actualiserVolume.disabled = false;
      }
    }
  }

  function basculerPleinEcran(plein) {
    if (plein === blocVolume.classList.contains('vent-volume-plein')) return;
    if (plein) {
      // Sorti du panneau : un parent transformé ou défilant le limiterait
      emplacementVolume = document.createComment('vent-volume');
      blocVolume.before(emplacementVolume);
      document.body.append(blocVolume);
    } else {
      emplacementVolume?.replaceWith(blocVolume);
      emplacementVolume = null;
    }
    blocVolume.classList.toggle('vent-volume-plein', plein);
    boutonRetour.hidden = !plein;
    boutonAgrandir.hidden = plein;
    (plein ? boutonRetour : boutonAgrandir).focus({ preventScroll: true });
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
    coucheVent.definirAnimation(nom !== 'volume');
    if (nom === 'volume') {
      if (controleur) {
        controleur.abort();
        controleur = null;
        actualiser.disabled = false;
      }
      if (actif && !zoneVolumeCapturee) void chargerProfilVolume();
    } else {
      if (controleurProfil) {
        controleurProfil.abort();
        controleurProfil = null;
        actualiserVolume.disabled = false;
      }
      if (actif && !donneesVentCourantes) void chargerVent();
    }
    mettreAJourAlerte();
  }

  function appliquerPalette() {
    const couleurs = PALETTES[document.documentElement.dataset.theme] || PALETTES.clair;
    pastillesLegende.forEach((pastille, index) => {
      pastille.style.setProperty('--vent-couleur', couleurs[index]);
    });
    panneau.querySelectorAll('[data-volume-vitesse]').forEach((pastille, index) => {
      pastille.style.setProperty('--vent-couleur', couleurs[index]);
    });
    afficherResume(resumeVentCourant);
    coucheVent.redessiner();
    volume.actualiserTheme();
  }

  function assurerCouche() {
    if (!map.getSource(SOURCE_VENT)) {
      map.addSource(SOURCE_VENT, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    // Les flèches sont dessinées sur leur propre canevas ; cette couche invisible
    // sert seulement de zone à toucher pour ouvrir le détail
    if (!map.getLayer(COUCHE_VENT)) {
      map.addLayer({
        id: COUCHE_VENT,
        type: 'circle',
        source: SOURCE_VENT,
        paint: { 'circle-radius': 20, 'circle-opacity': 0, 'circle-stroke-opacity': 0 },
      });
    }
    appliquerPalette();
    map.setLayoutProperty(COUCHE_VENT, 'visibility', actif ? 'visible' : 'none');

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
    if (!feature || !donneesVentCourantes) return;
    const proprietes = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const { grille, reponses, heureCible } = donneesVentCourantes;
    // Rafales et altitude : valeurs du point de calcul le plus proche
    const ix = Math.max(0, Math.min(grille.nx - 1, Math.round((lng - grille.ouest) / grille.pasLng)));
    const iy = Math.max(0, Math.min(grille.ny - 1, Math.round((lat - grille.sud) / grille.pasLat)));
    const proche = reponses[iy * grille.nx + ix];
    const indexHeure = proche?.hourly?.time?.indexOf(heureCible) ?? -1;
    const rafalesProches = indexHeure >= 0 ? proche.hourly.wind_gusts_10m?.[indexHeure] : null;
    const contenu = document.createElement('div');
    contenu.className = 'vent-carte-popup';
    const titre = document.createElement('strong');
    titre.textContent = `Vent modélisé à ${LIBELLE_HAUTEUR(Number(selecteurNiveau.value))} au-dessus du sol`;
    const heure = document.createElement('p');
    heure.textContent = `Prévision : ${formaterHeure(heureCible)}`;
    const vitesse = document.createElement('p');
    vitesse.textContent = `Vent : ${Math.round(proprietes.vitesse)} km/h`;
    const provenance = document.createElement('p');
    provenance.textContent = `Vient de : ${directionVent(proprietes.provenance)}`;
    const direction = document.createElement('p');
    direction.textContent = `Va vers : ${directionVent(proprietes.flux)}`;
    const rafales = document.createElement('p');
    rafales.textContent = `Rafales au sol : ${Number.isFinite(rafalesProches) ? `${Math.round(rafalesProches)} km/h` : 'indisponibles'}`;
    const altitude = document.createElement('p');
    altitude.textContent = `Altitude du terrain : ${Number.isFinite(proche?.elevation) ? `${Math.round(proche.elevation)} m` : 'indisponible'}`;
    contenu.append(titre, heure, vitesse, provenance, direction, rafales, altitude);
    new Popup({ closeButton: true, offset: 14 })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(contenu)
      .addTo(map);
  }

  function afficherDonnees(reponses, positions, heureCible, grille) {
    const hauteur = Number(selecteurNiveau.value);
    const points = [];
    const valeurs = positions.map((_, index) => {
      const donnees = reponses[index];
      const hourly = donnees?.hourly;
      const indexHeure = Array.isArray(hourly?.time) ? hourly.time.indexOf(heureCible) : -1;
      if (indexHeure < 0) return null;
      const vent = ventAHauteur(colonneVent(hourly, indexHeure, donnees.elevation), hauteur);
      if (!vent) return null;
      points.push({ ...vent, rafales: hourly.wind_gusts_10m?.[indexHeure] });
      return vent;
    });
    donneesVentCourantes = { reponses, positions, heureCible, grille };
    afficherResume(points);
    coucheVent.definirChamp(creerChamp(grille, valeurs));
    const maille = grille.pasLat * METRES_PAR_DEGRE / 1000;
    statut.classList.remove('erreur');
    statut.textContent = points.length
      ? `${LIBELLE_HAUTEUR(hauteur)} au-dessus du sol · ${formaterHeure(heureCible)} · ${points.length} points de calcul, tous les ${maille.toLocaleString('fr-FR', { maximumFractionDigits: maille < 10 ? 1 : 0 })} km`
      : 'Aucune donnée de vent disponible à cette échéance dans cette zone.';
  }

  function heurePourEcheance(reponses) {
    const heures = reponses[0].hourly.time;
    const indexHeureBase = heures.findIndex((heure) => heure >= reponses[0].current.time);
    if (indexHeureBase < 0) throw new Error('Aucune prévision horaire à venir n’est disponible.');
    const indexCible = indexHeureBase + Number(selecteurEcheance.value);
    if (indexCible >= heures.length) {
      throw new Error('Cette échéance n’est pas disponible pour la zone affichée.');
    }
    return heures[indexCible];
  }

  async function chargerVent() {
    if (!actif) return;
    if (map.getZoom() < 7) {
      statut.classList.remove('erreur');
      statut.textContent = 'Zoomez davantage pour actualiser les flèches de vent.';
      return;
    }

    controleur?.abort();
    const requete = new AbortController();
    controleur = requete;
    actualiser.disabled = true;
    statut.classList.remove('erreur');
    statut.textContent = 'Chargement du vent sur la zone visible…';
    const grille = creerGrille(map);
    const { positions } = grille;
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);

    try {
      await chargerPointsManquants(positions, requete.signal);
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      const reponses = positions.map((position) => cache.get(cleePosition(position)).donnees);
      heureCourante = heurePourEcheance(reponses);
      zoneCarteCapturee = { zoom: map.getZoom(), grille };
      afficherDonnees(reponses, positions, heureCourante, grille);
      mettreAJourAlerte();
    } catch (erreur) {
      if (requete.signal.aborted && controleur === requete && actif) {
        statut.classList.add('erreur');
        statut.textContent = 'Le chargement prend trop de temps. Vérifie ta connexion puis actualise.';
      } else if (controleur === requete && actif) {
        statut.classList.add('erreur');
        statut.textContent = erreur.message === MESSAGE_LIMITE
          ? MESSAGE_LIMITE
          : `Carte de vent indisponible : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}`;
        console.error('Chargement de la carte de vent impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (controleur === requete) actualiser.disabled = false;
    }
  }

  // Hauteur et échéance réutilisent les données déjà reçues pour la zone actualisée
  selecteurNiveau.addEventListener('change', () => {
    ecrire('vent-niveau', Number(selecteurNiveau.value));
    if (!donneesVentCourantes) return;
    const { reponses, positions, grille } = donneesVentCourantes;
    afficherDonnees(reponses, positions, heureCourante, grille);
  });
  selecteurEcheance.addEventListener('change', () => {
    ecrire('vent-echeance', Number(selecteurEcheance.value));
    if (!donneesVentCourantes) return;
    const { reponses, positions, grille } = donneesVentCourantes;
    try {
      heureCourante = heurePourEcheance(reponses);
      afficherDonnees(reponses, positions, heureCourante, grille);
    } catch (erreur) {
      statut.classList.add('erreur');
      statut.textContent = `Carte de vent indisponible : ${erreur.message}`;
    }
  });
  ongletsVue.forEach((onglet, index) => {
    onglet.addEventListener('click', () => {
      selectionnerVue(['carte', 'volume'][index]);
    });
  });
  panneau.querySelector('.vent-vues').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = ongletsVue.findIndex((onglet) => onglet.getAttribute('aria-selected') === 'true');
    const prochain = event.key === 'Home' ? 0
      : event.key === 'End' ? ongletsVue.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + ongletsVue.length) % ongletsVue.length;
    selectionnerVue(['carte', 'volume'][prochain], true);
  });
  actualiserVolume.addEventListener('click', () => void chargerProfilVolume());
  tempsVolume.addEventListener('input', construireCouches);
  selecteurCouche.addEventListener('change', construireCouches);
  plafondsVolume.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      plafondVolume = Number(radio.value);
      ecrire('vent-volume-plafond', plafondVolume);
      if (Number(selecteurCouche.value) > plafondVolume) selecteurCouche.value = 'toutes';
      construireCouches();
    });
  });
  panneau.querySelector('.vent-volume-recentrer').addEventListener('click', () => volume.recentrer());
  boutonAgrandir.addEventListener('click', () => basculerPleinEcran(true));
  boutonRetour.addEventListener('click', () => basculerPleinEcran(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') basculerPleinEcran(false);
  });
  actualiser.addEventListener('click', () => void chargerVent());
  actualiserZone.addEventListener('click', () => {
    if (vueActive === 'volume') void chargerProfilVolume();
    else void chargerVent();
  });
  map.on('moveend', mettreAJourAlerte);
  map.on('style.load', () => {
    if (!actif) return;
    assurerCouche();
    if (vueActive !== 'volume') void chargerVent();
  });
  const observateurTheme = new MutationObserver(appliquerPalette);
  observateurTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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
      coucheVent.definirVisible(true);
      if (vueActive === 'volume') {
        if (!zoneVolumeCapturee) void chargerProfilVolume();
      } else if (!donneesVentCourantes) {
        void chargerVent();
      }
      mettreAJourAlerte();
    },
    desactiver() {
      actif = false;
      alerteZone.hidden = true;
      basculerPleinEcran(false);
      controleur?.abort();
      controleurProfil?.abort();
      controleurProfil = null;
      actualiserVolume.disabled = false;
      coucheVent.definirVisible(false);
      if (map.getLayer(COUCHE_VENT)) map.setLayoutProperty(COUCHE_VENT, 'visibility', 'none');
    },
  };
}
