import { lire, ecrire } from './reglages.js';
import { Marker } from 'maplibre-gl';

const API_RADAR = 'https://api.rainviewer.com/public/weather-maps.json';
const PAGE_METEOSUISSE =
  'https://www.meteosuisse.admin.ch/services-et-publications/applications/precipitations.html';
const SOURCE_RADAR = 'meteo-radar';
const COUCHE_RADAR = 'meteo-radar';
const INTERVALLE_ANIMATION = 800;
const MAX_ZOOM_RADAR = 7;
const SOURCES = ['rainviewer', 'meteosuisse'];
const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const METEO_LOCATION = 'meteo-position';
const DELAI_PREVISIONS = 15000;

function formaterHeure(timestamp) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(timestamp * 1000));
}

function lireImagesRadar(donnees) {
  if (
    !donnees ||
    typeof donnees !== 'object' ||
    typeof donnees.host !== 'string' ||
    !Array.isArray(donnees.radar?.past)
  ) {
    throw new Error('Le service radar a renvoyé des données inattendues.');
  }

  const host = new URL(donnees.host);
  if (
    host.protocol !== 'https:' ||
    (host.hostname !== 'rainviewer.com' && !host.hostname.endsWith('.rainviewer.com'))
  ) {
    throw new Error('Le domaine du service radar est invalide.');
  }

  const images = donnees.radar.past
    .filter((image) =>
      Number.isInteger(image?.time) &&
      typeof image.path === 'string' &&
      /^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(image.path)
    )
    .sort((a, b) => a.time - b.time);

  if (images.length === 0) {
    throw new Error('Aucune image radar récente n’est disponible.');
  }

  return { host: host.origin, images };
}

export function creerRadarPluie(map) {
  const panneau = document.createElement('div');
  panneau.className = 'radar-panneau';
  panneau.innerHTML = `
    <div class="radar-sources" role="tablist" aria-label="Source du radar">
      <button type="button" id="radar-source-rainviewer" role="tab" aria-controls="radar-vue-rainviewer">
        Monde · RainViewer
      </button>
      <button type="button" id="radar-source-meteosuisse" role="tab" aria-controls="radar-vue-meteosuisse">
        Alpes · MétéoSuisse
      </button>
    </div>
    <section id="radar-vue-rainviewer" class="radar-source-vue" role="tabpanel" aria-labelledby="radar-source-rainviewer" hidden>
      <p class="radar-statut" role="status" aria-live="polite">Activez le radar pour charger les précipitations.</p>
      <div class="radar-controles" hidden>
        <div class="radar-actions">
          <button type="button" class="radar-lecture">Lire l’animation</button>
          <button type="button" class="radar-actuel">Actualiser</button>
        </div>
        <label class="radar-temps">
          <span class="radar-heure"></span>
          <input class="radar-curseur" type="range" min="0" max="0" value="0" step="1" aria-label="Image radar">
        </label>
        <p class="radar-aide">Couverture mondiale · images récentes espacées d’environ 10 minutes. Tuiles HD, zoom de données limité à 7.</p>
        <p class="radar-credit">Radar : <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a></p>
      </div>
    </section>
    <section id="radar-vue-meteosuisse" class="radar-source-vue" role="tabpanel" aria-labelledby="radar-source-meteosuisse" hidden>
      <p class="radar-description">Radar officiel de MétéoSuisse, avec une couverture centrée sur la Suisse et les régions voisines des Alpes.</p>
      <a class="radar-lien-externe" href="${PAGE_METEOSUISSE}" target="_blank" rel="noopener noreferrer">
        Ouvrir le radar MétéoSuisse <span aria-hidden="true">↗</span>
      </a>
      <p class="radar-aide">Le radar s’ouvre sur le site officiel et n’est pas superposé à la carte Montis.</p>
    </section>
  `;

  const boutonsSources = {
    rainviewer: panneau.querySelector('#radar-source-rainviewer'),
    meteosuisse: panneau.querySelector('#radar-source-meteosuisse'),
  };
  const vuesSources = {
    rainviewer: panneau.querySelector('#radar-vue-rainviewer'),
    meteosuisse: panneau.querySelector('#radar-vue-meteosuisse'),
  };
  const statut = panneau.querySelector('.radar-statut');
  const controles = panneau.querySelector('.radar-controles');
  const curseur = panneau.querySelector('.radar-curseur');
  const heure = panneau.querySelector('.radar-heure');
  const lecture = panneau.querySelector('.radar-lecture');
  const actuel = panneau.querySelector('.radar-actuel');

  let actif = false;
  let sourceCourante = lire('meteo-source', 'rainviewer');
  if (!SOURCES.includes(sourceCourante)) sourceCourante = 'rainviewer';
  let images = [];
  let host = '';
  let indexCourant = -1;
  let controleur = null;
  let minuteurLecture = null;

  function arreterLecture() {
    if (minuteurLecture !== null) clearInterval(minuteurLecture);
    minuteurLecture = null;
    lecture.textContent = 'Lire l’animation';
  }

  function urlTuiles(image) {
    return `${host}${image.path}/512/{z}/{x}/{y}/2/1_1.png`;
  }

  function afficherImage(index) {
    if (images.length === 0) return;
    indexCourant = Math.max(0, Math.min(index, images.length - 1));
    const image = images[indexCourant];
    curseur.value = String(indexCourant);
    heure.textContent = `Image radar · ${formaterHeure(image.time)}`;

    if (map.getSource(SOURCE_RADAR)) {
      map.getSource(SOURCE_RADAR).setTiles([urlTuiles(image)]);
    } else {
      map.addSource(SOURCE_RADAR, {
        type: 'raster',
        tiles: [urlTuiles(image)],
        tileSize: 512,
        maxzoom: MAX_ZOOM_RADAR,
        attribution:
          'Radar météo : <a href="https://www.rainviewer.com/" target="_blank" rel="noopener noreferrer">RainViewer</a>',
      });

      const premiereEtiquette = map.getStyle().layers.find((layer) => layer.type === 'symbol');
      map.addLayer(
        {
          id: COUCHE_RADAR,
          type: 'raster',
          source: SOURCE_RADAR,
          paint: { 'raster-opacity': 0.68, 'raster-fade-duration': 0 },
        },
        premiereEtiquette?.id
      );
    }

    map.setLayoutProperty(COUCHE_RADAR, 'visibility', actif ? 'visible' : 'none');
  }

  async function chargerImages() {
    controleur?.abort();
    controleur = new AbortController();
    statut.classList.remove('erreur');
    statut.textContent = 'Chargement des images radar…';
    actuel.disabled = true;

    try {
      const reponse = await fetch(API_RADAR, { signal: controleur.signal });
      if (!reponse.ok) {
        throw new Error(`Le service radar répond avec le statut ${reponse.status}.`);
      }

      const resultat = lireImagesRadar(await reponse.json());
      if (!actif) return;

      host = resultat.host;
      images = resultat.images;
      curseur.max = String(images.length - 1);
      controles.hidden = false;
      arreterLecture();
      afficherImage(images.length - 1);
      statut.textContent = `Radar chargé · ${images.length} images disponibles.`;
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
      statut.classList.add('erreur');
      statut.textContent = `Radar indisponible : ${erreur.message}`;
      actuel.disabled = false;
      console.error('Chargement du radar météo impossible :', erreur);
    } finally {
      if (controleur?.signal.aborted === false) actuel.disabled = false;
    }
  }

  function choisirSource(source) {
    sourceCourante = source;
    ecrire('meteo-source', source);
    for (const id of SOURCES) {
      const selectionnee = id === source;
      boutonsSources[id].classList.toggle('actif', selectionnee);
      boutonsSources[id].setAttribute('aria-selected', String(selectionnee));
      boutonsSources[id].tabIndex = selectionnee ? 0 : -1;
      vuesSources[id].hidden = !selectionnee;
    }

    if (source === 'meteosuisse') {
      controleur?.abort();
      arreterLecture();
      if (map.getLayer(COUCHE_RADAR)) map.setLayoutProperty(COUCHE_RADAR, 'visibility', 'none');
    } else if (actif) {
      if (images.length > 0) afficherImage(indexCourant < 0 ? images.length - 1 : indexCourant);
      void chargerImages();
    }
  }

  for (const [index, source] of SOURCES.entries()) {
    boutonsSources[source].addEventListener('click', () => choisirSource(source));
    boutonsSources[source].addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
        return;
      }
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? SOURCES.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + SOURCES.length) % SOURCES.length;
      const nextSource = SOURCES[nextIndex];
      choisirSource(nextSource);
      boutonsSources[nextSource].focus();
    });
  }

  curseur.addEventListener('input', () => afficherImage(Number(curseur.value)));
  lecture.addEventListener('click', () => {
    if (minuteurLecture !== null) {
      arreterLecture();
      return;
    }

    if (indexCourant >= images.length - 1) afficherImage(0);
    lecture.textContent = 'Pause';
    minuteurLecture = setInterval(() => {
      if (indexCourant >= images.length - 1) {
        arreterLecture();
        return;
      }
      afficherImage(indexCourant + 1);
    }, INTERVALLE_ANIMATION);
  });
  actuel.addEventListener('click', chargerImages);
  choisirSource(sourceCourante);

  return {
    id: 'radar',
    label: 'Radar de pluie',
    icone: 'radar',
    panneau,
    activer() {
      actif = true;
      if (sourceCourante === 'rainviewer') {
        if (map.getLayer(COUCHE_RADAR)) map.setLayoutProperty(COUCHE_RADAR, 'visibility', 'visible');
        void chargerImages();
      }
    },
    desactiver() {
      actif = false;
      controleur?.abort();
      arreterLecture();
      if (map.getLayer(COUCHE_RADAR)) map.setLayoutProperty(COUCHE_RADAR, 'visibility', 'none');
    },
  };
}

const CODES_METEO = {
  0: 'Ciel dégagé',
  1: 'Plutôt dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine modérée',
  55: 'Bruine dense',
  56: 'Bruine verglaçante',
  57: 'Bruine verglaçante dense',
  61: 'Pluie faible',
  63: 'Pluie modérée',
  65: 'Forte pluie',
  66: 'Pluie verglaçante',
  67: 'Forte pluie verglaçante',
  71: 'Neige faible',
  73: 'Neige modérée',
  75: 'Forte neige',
  77: 'Grains de neige',
  80: 'Averses faibles',
  81: 'Averses modérées',
  82: 'Fortes averses',
  85: 'Averses de neige',
  86: 'Fortes averses de neige',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage avec forte grêle',
};

function descriptionMeteo(code) {
  return CODES_METEO[code] || 'Conditions météo variables';
}

function typeMeteo(code) {
  if (!Number.isFinite(code)) return 'inconnu';
  if (code >= 95) return 'orage';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'neige';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'pluie';
  if (code === 45 || code === 48) return 'brouillard';
  if (code === 0) return 'soleil';
  if (code === 1 || code === 2) return 'eclaircies';
  return 'nuage';
}

function creerIconeMeteo(code) {
  const type = typeMeteo(code);
  const dessins = {
    soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    eclaircies: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.42 1.42m7.06 7.06 1.42 1.42"/><path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/>',
    nuage: '<path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/>',
    brouillard: '<path d="M7 13h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 5.5 4 4 0 0 0 7 13Z"/><path d="M4 17h16m-13 4h10"/>',
    pluie: '<path d="M7 14h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 6.5 4 4 0 0 0 7 14Z"/><path d="m8 17-1 3m6-3-1 3m6-3-1 3"/>',
    neige: '<path d="M7 13h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 5.5 4 4 0 0 0 7 13Z"/><path d="M8 17v4m-2-2h4m5-2v4m-2-2h4"/>',
    orage: '<path d="M7 14h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 6.5 4 4 0 0 0 7 14Z"/><path d="m13 15-3 4h3l-1 4 4-6h-3l1-2"/>',
    inconnu: '<path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/><path d="M12 14v.01m-2-4a2 2 0 1 1 3.4 1.4c-.8.8-1.4 1-1.4 2"/>',
  };
  const icone = document.createElement('span');
  icone.className = `meteo-icone meteo-icone-${type}`;
  icone.setAttribute('role', 'img');
  icone.setAttribute('aria-label', descriptionMeteo(code));
  icone.title = descriptionMeteo(code);
  icone.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessins[type]}</svg>`;
  return icone;
}

function formaterDirection(degres) {
  if (!Number.isFinite(degres)) return '—';
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(degres / 45) % 8];
}

function lirePositionMeteo() {
  const position = lire(METEO_LOCATION, null);
  if (
    position &&
    Number.isFinite(position.longitude) &&
    Number.isFinite(position.latitude) &&
    Math.abs(position.longitude) <= 180 &&
    Math.abs(position.latitude) <= 90
  ) {
    return position;
  }
  return null;
}

export function creerConditionsLocales(map) {
  const panneau = document.createElement('div');
  panneau.className = 'meteo-locale';
  panneau.innerHTML = `
    <section class="meteo-emplacement" aria-label="Lieu des prévisions">
      <div class="meteo-emplacement-entete">
        <div>
          <p class="meteo-emplacement-titre">Lieu des prévisions</p>
          <p class="meteo-locale-lieu">Centre de la carte</p>
        </div>
        <button type="button" class="meteo-choisir" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 7v5h-5M4 17v-5h5"/>
            <path d="M5.6 9a7 7 0 0 1 11.6-2L20 9M4 15l2.8 2a7 7 0 0 0 11.6-2"/>
          </svg>
          <span>Déplacer le point sur la carte</span>
        </button>
      </div>
      <p class="meteo-coordonnees">En attente du chargement des coordonnées…</p>
      <p class="meteo-emplacement-aide">Par défaut, les prévisions concernent le centre de la carte. Pour les déplacer, clique sur le bouton puis à l’endroit voulu sur la carte. Le repère indique le point utilisé.</p>
    </section>
    <p class="meteo-locale-statut" role="status" aria-live="polite">Prévisions calculées au centre de la carte.</p>
    <button type="button" class="meteo-reessayer" hidden>Réessayer le chargement</button>
    <section class="meteo-actuelle" hidden aria-label="Conditions actuelles"></section>
    <section class="meteo-jours" hidden aria-label="Prévisions sur cinq jours">
      <h3>Les 5 prochains jours</h3>
      <div class="meteo-jours-liste" role="group" aria-label="Choisir un jour pour afficher le détail horaire"></div>
    </section>
    <section class="meteo-horaire" hidden aria-label="Prévisions heure par heure">
      <h3>Prochaines 24 heures</h3>
      <div class="meteo-heures"></div>
    </section>
    <p class="meteo-credit">Prévisions : <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · CC BY 4.0 · usage gratuit non commercial</p>
  `;

  const boutonChoisir = panneau.querySelector('.meteo-choisir');
  const lieu = panneau.querySelector('.meteo-locale-lieu');
  const coordonnees = panneau.querySelector('.meteo-coordonnees');
  const statut = panneau.querySelector('.meteo-locale-statut');
  const boutonReessayer = panneau.querySelector('.meteo-reessayer');
  const actuelle = panneau.querySelector('.meteo-actuelle');
  const sectionJours = panneau.querySelector('.meteo-jours');
  const jours = panneau.querySelector('.meteo-jours-liste');
  const horaire = panneau.querySelector('.meteo-horaire');
  const titreHoraire = horaire.querySelector('h3');
  const heures = panneau.querySelector('.meteo-heures');
  const texteBoutonChoisir = boutonChoisir.querySelector('span');

  let actif = false;
  let selectionEnCours = false;
  let tiroirFermePourSelection = false;
  let controleur = null;
  let marqueur = null;
  let position = lirePositionMeteo();
  let positionChoisie = Boolean(position);
  let previsionsHoraires = null;
  let previsionsJournalieres = null;
  let dateSelectionnee = null;
  let heureActuelle = null;

  function annulerSelection() {
    if (!selectionEnCours) return;
    selectionEnCours = false;
    map.getCanvas().removeEventListener('click', capterClicCarte, true);
    map.getCanvas().style.cursor = '';
    boutonChoisir.setAttribute('aria-pressed', 'false');
    texteBoutonChoisir.textContent = 'Déplacer le point sur la carte';
  }

  function capterClicCarte(event) {
    if (!selectionEnCours || event.button !== 0) return;
    const rect = map.getCanvas().getBoundingClientRect();
    const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    event.preventDefault();
    event.stopImmediatePropagation();
    annulerSelection();
    position = { longitude: point.lng, latitude: point.lat };
    positionChoisie = true;
    ecrire(METEO_LOCATION, position);
    if (tiroirFermePourSelection) {
      tiroirFermePourSelection = false;
      document.getElementById('menu-bouton')?.click();
    }
    chargerPrevisions();
  }

  function choisirSurCarte() {
    if (!actif) return;
    if (selectionEnCours) {
      annulerSelection();
      statut.textContent = 'Sélection annulée.';
      return;
    }
    selectionEnCours = true;
    boutonChoisir.setAttribute('aria-pressed', 'true');
    texteBoutonChoisir.textContent = 'Annuler';
    statut.classList.remove('erreur');
    statut.textContent = 'Mode sélection : clique à l’emplacement voulu sur la carte. Le point précédent sera remplacé.';
    map.getCanvas().style.cursor = 'crosshair';
    map.getCanvas().addEventListener('click', capterClicCarte, true);

    const tiroir = document.getElementById('menu-tiroir');
    if (window.matchMedia('(max-width: 700px)').matches && tiroir?.classList.contains('ouvert')) {
      tiroirFermePourSelection = true;
      document.getElementById('menu-bouton')?.click();
    }
  }

  function afficherHeures(donnees, debut, date = null) {
    let indices;
    if (date) {
      indices = donnees.time
        .map((valeur, index) => ({ valeur, index }))
        .filter(({ valeur }) => valeur.startsWith(`${date}T`) && valeur >= debut)
        .map(({ index }) => index);
      titreHoraire.textContent = `Prévisions · ${formaterJour(date)}`;
    } else {
      const debutIndex = donnees.time.findIndex((valeur) => valeur >= debut);
      const premierIndex = debutIndex < 0 ? donnees.time.length : debutIndex;
      indices = Array.from(
        { length: Math.min(24, donnees.time.length - premierIndex) },
        (_, offset) => premierIndex + offset
      );
      titreHoraire.textContent = 'Prochaines 24 heures';
    }

    heures.replaceChildren();

    for (const index of indices) {
      const carte = document.createElement('article');
      carte.className = 'meteo-heure';
      const heureLocale = document.createElement('time');
      heureLocale.textContent = donnees.time[index].slice(11, 16);
      const symbole = creerIconeMeteo(donnees.weather_code[index]);
      const temperature = document.createElement('strong');
      temperature.textContent = Number.isFinite(donnees.temperature_2m[index])
        ? `${Math.round(donnees.temperature_2m[index])}°`
        : '—';
      const pluie = document.createElement('span');
      pluie.textContent = Number.isFinite(donnees.precipitation_probability[index])
        ? `${Math.round(donnees.precipitation_probability[index])} %`
        : '— %';
      pluie.title = `Probabilité de précipitation : ${pluie.textContent}`;
      carte.append(heureLocale, symbole, temperature, pluie);
      heures.appendChild(carte);
    }

    horaire.hidden = heures.childElementCount === 0;
  }

  function formaterJour(date) {
    const valeur = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      .format(valeur);
  }

  function afficherJours(donnees) {
    const champsJournaliers = [
      'time',
      'weather_code',
      'temperature_2m_min',
      'temperature_2m_max',
      'precipitation_probability_max',
      'wind_speed_10m_max',
    ];
    const daily = donnees?.daily;
    if (
      !champsJournaliers.every((champ) =>
        Array.isArray(daily?.[champ]) && daily[champ].length >= 5
      )
    ) {
      throw new Error('Le service météo a renvoyé des prévisions journalières incomplètes.');
    }
    if (!champsJournaliers.every((champ) => daily[champ].length === daily.time.length)) {
      throw new Error('Le service météo a renvoyé des prévisions journalières incohérentes.');
    }

    previsionsJournalieres = daily;
    jours.replaceChildren();
    for (let index = 0; index < 5; index += 1) {
      const date = daily.time[index];
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'meteo-jour';
      bouton.dataset.date = date;
      bouton.setAttribute('aria-pressed', String(date === dateSelectionnee));
      const minimum = Number.isFinite(daily.temperature_2m_min[index])
        ? `${Math.round(daily.temperature_2m_min[index])}°`
        : '—';
      const maximum = Number.isFinite(daily.temperature_2m_max[index])
        ? `${Math.round(daily.temperature_2m_max[index])}°`
        : '—';
      const probabilitePluie = Number.isFinite(daily.precipitation_probability_max[index])
        ? Math.round(daily.precipitation_probability_max[index])
        : null;
      bouton.setAttribute(
        'aria-label',
        `${formaterJour(date)} : ${descriptionMeteo(daily.weather_code[index])}, ` +
          `${minimum} à ${maximum}, ` +
          `pluie ${probabilitePluie === null ? 'indisponible' : `${probabilitePluie} pour cent`}`
      );

      const nom = document.createElement('span');
      nom.className = 'meteo-jour-nom';
      nom.textContent = index === 0
        ? 'Aujourd’hui'
        : new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
          .format(new Date(`${date}T12:00:00`))
          .replace('.', '');
      const icone = creerIconeMeteo(daily.weather_code[index]);
      icone.classList.add('meteo-jour-icone');
      const temperature = document.createElement('strong');
      temperature.className = 'meteo-jour-temperature';
      temperature.textContent = `${minimum} / ${maximum}`;
      const pluie = document.createElement('span');
      pluie.className = 'meteo-jour-pluie';
      pluie.textContent = probabilitePluie === null ? 'Pluie —' : `${probabilitePluie} % pluie`;
      const vent = document.createElement('span');
      vent.className = 'meteo-jour-vent';
      vent.textContent = Number.isFinite(daily.wind_speed_10m_max[index])
        ? `Vent ${Math.round(daily.wind_speed_10m_max[index])} km/h`
        : 'Vent —';
      bouton.append(nom, icone, temperature, pluie, vent);
      jours.appendChild(bouton);
    }

    sectionJours.hidden = false;
  }

  function selectionnerJour(date) {
    if (!previsionsHoraires || !previsionsJournalieres) return;
    dateSelectionnee = dateSelectionnee === date ? null : date;
    for (const bouton of jours.querySelectorAll('.meteo-jour')) {
      bouton.setAttribute('aria-pressed', String(bouton.dataset.date === dateSelectionnee));
    }
    const debut = dateSelectionnee
      ? dateSelectionnee === heureActuelle.slice(0, 10)
        ? heureActuelle
        : `${dateSelectionnee}T00:00`
      : heureActuelle;
    afficherHeures(previsionsHoraires, debut, dateSelectionnee);
  }

  function afficherPrevisions(donnees) {
    const hourly = donnees?.hourly;
    const champsHoraires = [
      'time',
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
    ];
    if (
      !donnees?.current ||
      typeof donnees.current.time !== 'string' ||
      !Number.isFinite(donnees.current.temperature_2m) ||
      !champsHoraires.every((champ) =>
        Array.isArray(hourly?.[champ]) && hourly[champ].length > 0
      )
    ) {
      throw new Error('Le service météo a renvoyé des données incomplètes.');
    }
    const longueurHoraire = hourly.time.length;
    if (!champsHoraires.every((champ) => hourly[champ].length === longueurHoraire)) {
      throw new Error('Le service météo a renvoyé des prévisions incohérentes.');
    }

    const actuel = donnees.current;
    heureActuelle = actuel.time;
    previsionsHoraires = hourly;
    lieu.textContent = positionChoisie ? 'Point choisi sur la carte' : 'Centre de la carte';
    coordonnees.textContent =
      `${position.latitude.toFixed(3)}°, ${position.longitude.toFixed(3)}°`;

    actuelle.replaceChildren();
    const condition = document.createElement('p');
    condition.className = 'meteo-condition';
    condition.textContent = descriptionMeteo(actuel.weather_code);
    const temperature = document.createElement('p');
    temperature.className = 'meteo-temperature';
    temperature.textContent = `${Math.round(actuel.temperature_2m)}°`;
    const details = document.createElement('div');
    details.className = 'meteo-details';

    const indexHeureActuelle = hourly.time.findIndex((heure) => heure >= actuel.time);
    const valeurs = [
      ['Altitude estimée', Number.isFinite(donnees.elevation) ? `${Math.round(donnees.elevation)} m` : '—'],
      ['Ressenti', Number.isFinite(actuel.apparent_temperature) ? `${Math.round(actuel.apparent_temperature)}°` : '—'],
      ['Vent', Number.isFinite(actuel.wind_speed_10m) ? `${Math.round(actuel.wind_speed_10m)} km/h ${formaterDirection(actuel.wind_direction_10m)}` : '—'],
      ['Rafales', Number.isFinite(actuel.wind_gusts_10m) ? `${Math.round(actuel.wind_gusts_10m)} km/h` : '—'],
      ['Précipitations', Number.isFinite(actuel.precipitation) ? `${actuel.precipitation.toFixed(1)} mm` : '—'],
      ['Niveau de congélation', Number.isFinite(hourly.freezing_level_height?.[indexHeureActuelle]) ? `${Math.round(hourly.freezing_level_height[indexHeureActuelle])} m` : '—'],
    ];

    for (const [label, valeur] of valeurs) {
      const ligne = document.createElement('div');
      ligne.className = 'meteo-detail';
      const cle = document.createElement('span');
      cle.textContent = label;
      const contenu = document.createElement('strong');
      contenu.textContent = valeur;
      ligne.append(cle, contenu);
      details.appendChild(ligne);
    }

    actuelle.append(condition, temperature, details);
    actuelle.hidden = false;
    afficherJours(donnees);
    afficherHeures(hourly, actuel.time);
    statut.classList.remove('erreur');
    statut.textContent = `Actualisé à ${actuel.time.slice(11, 16)} · prévision indicative en altitude.`;
  }

  async function chargerPrevisions() {
    if (!position || !actif) return;
    controleur?.abort();
    const requete = new AbortController();
    controleur = requete;
    let delaiDepasse = false;
    const minuteurDelai = setTimeout(() => {
      delaiDepasse = true;
      requete.abort();
    }, DELAI_PREVISIONS);
    statut.classList.remove('erreur');
    statut.textContent = 'Chargement des conditions et prévisions…';
    boutonReessayer.hidden = true;
    panneau.setAttribute('aria-busy', 'true');
    actuelle.hidden = true;
    sectionJours.hidden = true;
    horaire.hidden = true;
    previsionsHoraires = null;
    previsionsJournalieres = null;
    dateSelectionnee = null;
    lieu.textContent = positionChoisie ? 'Point choisi sur la carte' : 'Centre de la carte';
    coordonnees.textContent =
      `${position.latitude.toFixed(3)}°, ${position.longitude.toFixed(3)}°`;
    const marqueurPosition = [position.longitude, position.latitude];
    if (!marqueur) {
      marqueur = new Marker({ color: '#4debd4' });
    }
    marqueur.setLngLat(marqueurPosition).addTo(map);

    const params = new URLSearchParams({
      latitude: String(position.latitude),
      longitude: String(position.longitude),
      current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,freezing_level_height',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      forecast_days: '5',
      timezone: 'auto',
    });

    try {
      const reponse = await fetch(`${API_PREVISIONS}?${params}`, { signal: requete.signal });
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      if (!reponse.ok) {
        throw new Error(`Le service météo répond avec le statut ${reponse.status}.`);
      }
      const donnees = await reponse.json();
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      afficherPrevisions(donnees);
    } catch (erreur) {
      if (controleur !== requete || !actif || (requete.signal.aborted && !delaiDepasse)) return;
      statut.classList.add('erreur');
      const message = delaiDepasse
        ? 'le service met trop de temps à répondre. Vérifie ta connexion puis réessaie.'
        : erreur instanceof Error
          ? erreur.message
          : 'erreur inconnue';
      statut.textContent = `Prévisions indisponibles : ${message}`;
      boutonReessayer.hidden = false;
      console.error('Chargement des prévisions météo impossible :', erreur);
    } finally {
      clearTimeout(minuteurDelai);
      if (controleur === requete) panneau.setAttribute('aria-busy', 'false');
    }
  }

  boutonChoisir.addEventListener('click', choisirSurCarte);
  boutonReessayer.addEventListener('click', () => void chargerPrevisions());
  jours.addEventListener('click', (event) => {
    const bouton = event.target.closest('.meteo-jour');
    if (bouton) selectionnerJour(bouton.dataset.date);
  });

  return {
    id: 'meteo-locale',
    label: 'Météo locale',
    icone: 'meteo',
    panneau,
    activer() {
      actif = true;
      if (!position) {
        const centre = map.getCenter();
        position = { longitude: centre.lng, latitude: centre.lat };
      }
      chargerPrevisions();
    },
    desactiver() {
      actif = false;
      annulerSelection();
      controleur?.abort();
      marqueur?.remove();
      marqueur = null;
    },
  };
}
