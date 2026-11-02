import { lire, ecrire } from './reglages.js';
import { Marker } from 'maplibre-gl';
import { dateHorsLigne, estHorsLigne, texteDonneesDu } from './hors-ligne.js';
import { DECALAGE_PIN, creerPinSeul } from './pins.js';
import { formatAltitude, formatNeige, formatPluie, formatTemp, formatVent } from './unites.js';
import { surPreferences } from './preferences.js';
import { formatDate, heureCourte, nomJour, surLangue, t, ta, ti, tt } from './i18n.js';
import { pointCardinal } from './vent-calcul.js';

const API_RADAR = 'https://api.rainviewer.com/public/weather-maps.json';
const PAGE_METEOSUISSE =
  'https://www.meteosuisse.admin.ch/services-et-publications/applications/precipitations.html';
const SOURCE_RADAR = 'meteo-radar';
const COUCHE_RADAR = 'meteo-radar';
const INTERVALLE_ANIMATION = 800;
const MAX_ZOOM_RADAR = 7;
const SOURCES = ['rainviewer', 'meteosuisse'];
const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const API_GEOCODAGE = 'https://photon.komoot.io/reverse';
const API_RECHERCHE_GEOCODAGE = 'https://photon.komoot.io/api/';
const METEO_LOCATION = 'meteo-position';
const DELAI_PREVISIONS = 15000;
const TYPES_LIEU = ['city', 'town', 'village', 'hamlet', 'locality', 'municipality'];
const ECART_CENTRE_KM = 0.5; // au-delà, les prévisions ne correspondent plus au centre de la carte

const formaterHeure = (timestamp) => heureCourte(timestamp * 1000);

function lireImagesRadar(donnees) {
  if (
    !donnees ||
    typeof donnees !== 'object' ||
    typeof donnees.host !== 'string' ||
    !Array.isArray(donnees.radar?.past)
  ) {
    throw new Error(t('radar.inattendu'));
  }

  const host = new URL(donnees.host);
  if (
    host.protocol !== 'https:' ||
    (host.hostname !== 'rainviewer.com' && !host.hostname.endsWith('.rainviewer.com'))
  ) {
    throw new Error(t('radar.domaine'));
  }

  const images = donnees.radar.past
    .filter((image) =>
      Number.isInteger(image?.time) &&
      typeof image.path === 'string' &&
      /^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(image.path)
    )
    .sort((a, b) => a.time - b.time);

  if (images.length === 0) {
    throw new Error(t('radar.aucune'));
  }

  return { host: host.origin, images };
}

export function creerRadarPluie(map) {
  const panneau = document.createElement('div');
  panneau.className = 'radar-panneau';
  panneau.innerHTML = `
    <div class="radar-sources" role="tablist" ${ta('aria-label', 'radar.source')}>
      <button type="button" id="radar-source-rainviewer" role="tab" aria-controls="radar-vue-rainviewer" ${ti('radar.monde')}>${t('radar.monde')}</button>
      <button type="button" id="radar-source-meteosuisse" role="tab" aria-controls="radar-vue-meteosuisse" ${ti('radar.alpes')}>${t('radar.alpes')}</button>
    </div>
    <section id="radar-vue-rainviewer" class="radar-source-vue" role="tabpanel" aria-labelledby="radar-source-rainviewer" hidden>
      <p class="radar-statut" role="status" aria-live="polite">${t('radar.activer')}</p>
      <div class="radar-controles" hidden>
        <div class="radar-actions">
          <button type="button" class="radar-lecture">${t('radar.lire')}</button>
          <button type="button" class="radar-actuel" ${ti('radar.actualiser')}>${t('radar.actualiser')}</button>
        </div>
        <label class="radar-temps">
          <span class="radar-heure"></span>
          <input class="radar-curseur" type="range" min="0" max="0" value="0" step="1" ${ta('aria-label', 'radar.image')}>
        </label>
        <p class="radar-aide" ${ti('radar.aide')}>${t('radar.aide')}</p>
        <p class="radar-credit" data-i18n-html="radar.credit">${t('radar.credit')}</p>
      </div>
    </section>
    <section id="radar-vue-meteosuisse" class="radar-source-vue" role="tabpanel" aria-labelledby="radar-source-meteosuisse" hidden>
      <p class="radar-description" ${ti('radar.ms-description')}>${t('radar.ms-description')}</p>
      <a class="radar-lien-externe" href="${PAGE_METEOSUISSE}" target="_blank" rel="noopener noreferrer">
        ${tt('radar.ms-ouvrir')} <span aria-hidden="true">↗</span>
      </a>
      <p class="radar-aide" ${ti('radar.ms-aide')}>${t('radar.ms-aide')}</p>
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
    lecture.textContent = t('radar.lire');
  }

  function urlTuiles(image) {
    return `${host}${image.path}/512/{z}/{x}/{y}/2/1_1.png`;
  }

  function afficherImage(index) {
    if (images.length === 0) return;
    indexCourant = Math.max(0, Math.min(index, images.length - 1));
    const image = images[indexCourant];
    curseur.value = String(indexCourant);
    heure.textContent = t('radar.image-heure', { heure: formaterHeure(image.time) });

    if (map.getSource(SOURCE_RADAR)) {
      map.getSource(SOURCE_RADAR).setTiles([urlTuiles(image)]);
    } else {
      map.addSource(SOURCE_RADAR, {
        type: 'raster',
        tiles: [urlTuiles(image)],
        tileSize: 512,
        maxzoom: MAX_ZOOM_RADAR,
        attribution:
          t('radar.attribution'),
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
    statut.textContent = t('radar.chargement');
    actuel.disabled = true;

    try {
      const reponse = await fetch(API_RADAR, { signal: controleur.signal });
      if (!reponse.ok) {
        throw new Error(t('radar.statut-http', { statut: reponse.status }));
      }

      const resultat = lireImagesRadar(await reponse.json());
      if (!actif) return;

      host = resultat.host;
      images = resultat.images;
      curseur.max = String(images.length - 1);
      controles.hidden = false;
      arreterLecture();
      afficherImage(images.length - 1);
      statut.textContent = t('radar.charge', { n: images.length });
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
      statut.classList.add('erreur');
      statut.textContent = t('radar.indisponible', { message: erreur.message });
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
    lecture.textContent = t('radar.pause');
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
  surLangue(() => {
    lecture.textContent = t(minuteurLecture !== null ? 'radar.pause' : 'radar.lire');
    if (indexCourant >= 0 && images[indexCourant]) afficherImage(indexCourant);
    if (images.length && !statut.classList.contains('erreur')) statut.textContent = t('radar.charge', { n: images.length });
    else if (!images.length && !statut.classList.contains('erreur')) statut.textContent = t('radar.activer');
  });

  return {
    id: 'radar',
    reseauRequis: true,
    labelCle: 'radar.titre',
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

const CODES_METEO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

function descriptionMeteo(code) {
  return t(CODES_METEO.includes(code) ? `meteo.code.${code}` : 'meteo.code.variable');
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
  return pointCardinal(degres);
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

function distanceEntrePositions(a, b) {
  const radians = Math.PI / 180;
  const deltaLatitude = (b.latitude - a.latitude) * radians;
  const deltaLongitude = (b.longitude - a.longitude) * radians;
  const sinusLatitude = Math.sin(deltaLatitude / 2);
  const sinusLongitude = Math.sin(deltaLongitude / 2);
  const valeur =
    sinusLatitude ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * sinusLongitude ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, valeur)));
}

function nomVilleDepuisGeocodage(features) {
  for (const feature of features) {
    const proprietes = feature?.properties;
    for (const type of TYPES_LIEU) {
      const nom = proprietes?.[type];
      if (typeof nom === 'string' && nom.trim()) return nom.trim();
    }

    const nom = proprietes?.name;
    if (
      proprietes?.osm_key === 'place' &&
      TYPES_LIEU.includes(proprietes.osm_value) &&
      typeof nom === 'string' &&
      nom.trim()
    ) {
      return nom.trim();
    }
  }
  return '';
}

function codePostalDepuisGeocodage(features, nomVille, codePays) {
  const normaliser = (valeur) => valeur.trim().toLocaleLowerCase('fr');
  const villeNormalisee = normaliser(nomVille);
  const paysNormalise = typeof codePays === 'string' ? codePays.toLowerCase() : '';
  const code = features.find((feature) => {
    const proprietes = feature?.properties;
    const postal = proprietes?.postcode;
    const paysFeature =
      typeof proprietes?.countrycode === 'string'
        ? proprietes.countrycode.toLowerCase()
        : '';
    const memePays =
      !paysNormalise || !paysFeature || paysFeature === paysNormalise;
    const memeVille = [
      proprietes?.name,
      proprietes?.city,
      proprietes?.town,
      proprietes?.village,
      proprietes?.hamlet,
    ].some((nom) => typeof nom === 'string' && normaliser(nom) === villeNormalisee);
    return (
      memePays &&
      memeVille &&
      (typeof postal === 'string' || typeof postal === 'number') &&
      String(postal).trim()
    );
  })?.properties?.postcode;
  return code ? String(code).trim() : '';
}

export function creerConditionsLocales(map) {
  const panneau = document.createElement('div');
  panneau.className = 'meteo-locale';
  panneau.innerHTML = `
    <section class="meteo-actuelle" hidden ${ta('aria-label', 'meteo.actuelles')}></section>
    <section class="meteo-horaire" hidden ${ta('aria-label', 'meteo.horaire')}>
      <h3>${t('meteo.24h')}</h3>
      <div class="meteo-heures"></div>
    </section>
    <section class="meteo-jours" hidden ${ta('aria-label', 'meteo.5-jours-aria')}>
      <h3 ${ti('meteo.5-jours')}>${t('meteo.5-jours')}</h3>
      <div class="meteo-jours-liste" role="group" ${ta('aria-label', 'meteo.choisir-jour')}></div>
    </section>
    <section class="meteo-emplacement" ${ta('aria-label', 'meteo.lieu')}>
      <div class="meteo-emplacement-entete">
        <div>
          <p class="meteo-emplacement-titre" ${ti('meteo.lieu')}>${t('meteo.lieu')}</p>
          <p class="meteo-locale-lieu">${t('meteo.centre')}</p>
        </div>
        <button type="button" class="meteo-choisir" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 7v5h-5M4 17v-5h5"/>
            <path d="M5.6 9a7 7 0 0 1 11.6-2L20 9M4 15l2.8 2a7 7 0 0 0 11.6-2"/>
          </svg>
          <span>${t('meteo.deplacer')}</span>
        </button>
      </div>
      <p class="meteo-coordonnees">
        <span class="meteo-coordonnees-valeurs">${t('meteo.attente-coord')}</span>
        <span class="meteo-lieu-proche" hidden></span>
        <span class="meteo-code-postal" hidden></span>
      </p>
      <p class="meteo-emplacement-aide" ${ti('meteo.aide-lieu')}>${t('meteo.aide-lieu')}</p>
      <button type="button" class="meteo-reessayer meteo-recentrer" hidden ${ti('meteo.utiliser-centre')}>${t('meteo.utiliser-centre')}</button>
    </section>
    <p class="meteo-locale-statut" role="status" aria-live="polite">${t('meteo.calculees-centre')}</p>
    <button type="button" class="meteo-reessayer" hidden ${ti('meteo.reessayer')}>${t('meteo.reessayer')}</button>
    <p class="meteo-credit" data-i18n-html="meteo.credit">${t('meteo.credit')}</p>
  `;

  const boutonChoisir = panneau.querySelector('.meteo-choisir');
  const lieu = panneau.querySelector('.meteo-locale-lieu');
  const valeursCoordonnees = panneau.querySelector('.meteo-coordonnees-valeurs');
  const lieuProche = panneau.querySelector('.meteo-lieu-proche');
  const codePostal = panneau.querySelector('.meteo-code-postal');
  const statut = panneau.querySelector('.meteo-locale-statut');
  const boutonReessayer = panneau.querySelector('.meteo-reessayer:not(.meteo-recentrer)');
  const boutonCentre = panneau.querySelector('.meteo-recentrer');
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
  let pin = null;
  let position = lirePositionMeteo();
  let positionChoisie = Boolean(position);
  let previsionsHoraires = null;
  let previsionsJournalieres = null;
  let dateSelectionnee = null;
  let heureActuelle = null;
  let nomVilleProche = '';

  function centreCarte() {
    const centre = map.getCenter();
    return { longitude: centre.lng, latitude: centre.lat };
  }

  // Le libellé et le bouton disent si les prévisions correspondent encore au centre de la carte
  function majLieu() {
    if (!actif || !position) return;
    const eloigne = distanceEntrePositions(position, centreCarte()) > ECART_CENTRE_KM;
    boutonCentre.hidden = !eloigne;
    lieu.textContent = t(positionChoisie ? 'meteo.point-choisi' : eloigne ? 'meteo.ancien-centre' : 'meteo.centre');
  }

  function afficherCoordonnees(position) {
    valeursCoordonnees.textContent =
      `${position.latitude.toFixed(3)}°, ${position.longitude.toFixed(3)}°`;

    const source = map.getSource('osm-vecteur');
    const classesLieu = new Set(['city', 'town', 'village', 'hamlet']);
    const candidats = source
      ? map.querySourceFeatures('osm-vecteur', { sourceLayer: 'place' })
      : [];
    let nomProche = '';
    let distanceProche = Infinity;

    for (const candidat of candidats) {
      const proprietes = candidat.properties;
      const coordonneesLieu = candidat.geometry?.type === 'Point'
        ? candidat.geometry.coordinates
        : null;
      const nom = proprietes?.['name:fr'] || proprietes?.name;
      if (
        !classesLieu.has(proprietes?.class) ||
        typeof nom !== 'string' ||
        !nom.trim() ||
        !coordonneesLieu ||
        !Number.isFinite(coordonneesLieu[0]) ||
        !Number.isFinite(coordonneesLieu[1])
      ) {
        continue;
      }

      const distance = distanceEntrePositions(position, {
        longitude: coordonneesLieu[0],
        latitude: coordonneesLieu[1],
      });
      if (distance < distanceProche) {
        distanceProche = distance;
        nomProche = nom.trim();
      }
    }

    nomVilleProche = nomProche;
    lieuProche.textContent = nomProche ? `· ${nomProche}` : '';
    lieuProche.hidden = !nomProche;
  }

  async function chargerCodePostal(position, requete) {
    codePostal.textContent = t('meteo.cp-recherche');
    codePostal.hidden = false;
    const params = new URLSearchParams({
      lat: String(position.latitude),
      lon: String(position.longitude),
    });

    try {
      const reponse = await fetch(`${API_GEOCODAGE}?${params}`, { signal: requete.signal });
      if (!reponse.ok) {
        throw new Error(t('meteo.geocodage-http', { statut: reponse.status }));
      }

      const donnees = await reponse.json();
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      const features = Array.isArray(donnees?.features) ? donnees.features : [];
      const nomGeocode = nomVilleDepuisGeocodage(features);
      if (nomGeocode) {
        nomVilleProche = nomGeocode;
        lieuProche.textContent = `· ${nomGeocode}`;
        lieuProche.hidden = false;
      }

      let code = features
        .map((feature) => feature?.properties?.postcode)
        .find(
          (valeur) =>
            (typeof valeur === 'string' || typeof valeur === 'number') &&
            String(valeur).trim()
        );
      if (!code && nomVilleProche) {
        const pays = features.find((feature) => feature?.properties?.countrycode)
          ?.properties?.countrycode;
        const paramsRecherche = new URLSearchParams({
          q: pays ? `${nomVilleProche}, ${pays}` : nomVilleProche,
          limit: '5',
        });
        const reponseRecherche = await fetch(
          `${API_RECHERCHE_GEOCODAGE}?${paramsRecherche}`,
          { signal: requete.signal }
        );
        if (!reponseRecherche.ok) {
          throw new Error(t('meteo.geocodage-http', { statut: reponseRecherche.status }));
        }
        const resultats = await reponseRecherche.json();
        if (requete.signal.aborted || controleur !== requete || !actif) return;
        const resultatsVille = Array.isArray(resultats?.features) ? resultats.features : [];
        code = codePostalDepuisGeocodage(resultatsVille, nomVilleProche, pays);
      }
      if (!code) {
        codePostal.textContent = t('meteo.cp-indisponible');
        return;
      }

      codePostal.textContent = `· ${String(code).trim()}`;
    } catch (erreur) {
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      codePostal.textContent = t('meteo.cp-indisponible');
      console.warn('Recherche du code postal impossible :', erreur);
    }
  }

  // Normal quand la météo suit le centre de la carte, sélectionné quand le point est posé ou en cours de choix
  function majPin() {
    pin?.changerEtat(positionChoisie || selectionEnCours ? 'selected' : '');
  }

  function annulerSelection() {
    if (!selectionEnCours) return;
    selectionEnCours = false;
    majPin();
    map.getCanvas().removeEventListener('click', capterClicCarte, true);
    map.getCanvas().style.cursor = '';
    boutonChoisir.setAttribute('aria-pressed', 'false');
    texteBoutonChoisir.textContent = t('meteo.deplacer');
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
      statut.textContent = t('meteo.selection-annulee');
      return;
    }
    selectionEnCours = true;
    majPin();
    boutonChoisir.setAttribute('aria-pressed', 'true');
    texteBoutonChoisir.textContent = t('meteo.annuler');
    statut.classList.remove('erreur');
    statut.textContent = t('meteo.mode-selection');
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
      titreHoraire.textContent = t('meteo.previsions-jour', { jour: formaterJour(date) });
    } else {
      const debutIndex = donnees.time.findIndex((valeur) => valeur >= debut);
      const premierIndex = debutIndex < 0 ? donnees.time.length : debutIndex;
      indices = Array.from(
        { length: Math.min(24, donnees.time.length - premierIndex) },
        (_, offset) => premierIndex + offset
      );
      titreHoraire.textContent = t('meteo.24h');
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
        ? formatTemp(donnees.temperature_2m[index], { court: true })
        : '—';
      const probabilite = document.createElement('span');
      probabilite.textContent = Number.isFinite(donnees.precipitation_probability[index])
        ? `${Math.round(donnees.precipitation_probability[index])} %`
        : '— %';
      probabilite.title = t('meteo.proba', { valeur: probabilite.textContent });
      const pluie = document.createElement('span');
      pluie.textContent = Number.isFinite(donnees.rain?.[index])
        ? t('meteo.pluie', { valeur: formatPluie(donnees.rain[index]) })
        : t('meteo.pluie-vide');
      const neige = document.createElement('span');
      neige.textContent = Number.isFinite(donnees.snowfall?.[index])
        ? t('meteo.neige', { valeur: formatNeige(donnees.snowfall[index]) })
        : t('meteo.neige-vide');
      const vent = document.createElement('span');
      vent.textContent = Number.isFinite(donnees.wind_gusts_10m?.[index])
        ? t('meteo.rafales-court', { valeur: formatVent(donnees.wind_gusts_10m[index]) })
        : Number.isFinite(donnees.wind_speed_10m?.[index])
          ? t('meteo.vent', { valeur: formatVent(donnees.wind_speed_10m[index]) })
          : t('meteo.vent-vide');
      carte.append(heureLocale, symbole, temperature, probabilite, pluie, neige, vent);
      heures.appendChild(carte);
    }

    horaire.hidden = heures.childElementCount === 0;
  }

  function formaterJour(date) {
    const valeur = new Date(`${date}T12:00:00`);
    return formatDate(valeur, { weekday: 'long', day: 'numeric', month: 'long' });
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
      throw new Error(t('meteo.jours-incomplets'));
    }
    if (!champsJournaliers.every((champ) => daily[champ].length === daily.time.length)) {
      throw new Error(t('meteo.jours-incoherents'));
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
        ? formatTemp(daily.temperature_2m_min[index], { court: true })
        : '—';
      const maximum = Number.isFinite(daily.temperature_2m_max[index])
        ? formatTemp(daily.temperature_2m_max[index], { court: true })
        : '—';
      const probabilitePluie = Number.isFinite(daily.precipitation_probability_max[index])
        ? Math.round(daily.precipitation_probability_max[index])
        : null;
      bouton.setAttribute(
        'aria-label',
        t('meteo.jour-aria', {
          jour: formaterJour(date),
          description: descriptionMeteo(daily.weather_code[index]),
          min: minimum,
          max: maximum,
          pluie: probabilitePluie === null ? t('meteo.indisponible') : t('meteo.pour-cent', { n: probabilitePluie }),
        })
      );

      const nom = document.createElement('span');
      nom.className = 'meteo-jour-nom';
      nom.textContent = index === 0 ? t('meteo.aujourdhui') : nomJour(new Date(`${date}T12:00:00`), 'short');
      const icone = creerIconeMeteo(daily.weather_code[index]);
      icone.classList.add('meteo-jour-icone');
      const temperature = document.createElement('strong');
      temperature.className = 'meteo-jour-temperature';
      temperature.textContent = `${minimum} / ${maximum}`;
      const pluie = document.createElement('span');
      pluie.className = 'meteo-jour-pluie';
      pluie.textContent = probabilitePluie === null ? t('meteo.pluie-vide') : t('meteo.pluie-pourcent', { n: probabilitePluie });
      const vent = document.createElement('span');
      vent.className = 'meteo-jour-vent';
      vent.textContent = Number.isFinite(daily.wind_speed_10m_max[index])
        ? t('meteo.vent', { valeur: formatVent(daily.wind_speed_10m_max[index]) })
        : t('meteo.vent-vide');
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
      'rain',
      'snowfall',
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
      throw new Error(t('meteo.incompletes'));
    }
    const longueurHoraire = hourly.time.length;
    if (!champsHoraires.every((champ) => hourly[champ].length === longueurHoraire)) {
      throw new Error(t('meteo.incoherentes'));
    }

    const actuel = donnees.current;
    heureActuelle = actuel.time;
    previsionsHoraires = hourly;
    majLieu();

    actuelle.replaceChildren();
    const condition = document.createElement('p');
    condition.className = 'meteo-condition';
    condition.textContent = descriptionMeteo(actuel.weather_code);
    const temperature = document.createElement('p');
    temperature.className = 'meteo-temperature';
    temperature.textContent = formatTemp(actuel.temperature_2m, { court: true });
    const details = document.createElement('div');
    details.className = 'meteo-details';

    const indexHeureActuelle = hourly.time.findIndex((heure) => heure >= actuel.time);
    const valeurs = [
      [t('meteo.altitude'), Number.isFinite(donnees.elevation) ? formatAltitude(donnees.elevation) : '—'],
      [t('meteo.ressenti'), Number.isFinite(actuel.apparent_temperature) ? formatTemp(actuel.apparent_temperature) : '—'],
      [t('meteo.vent-label'), Number.isFinite(actuel.wind_speed_10m) ? `${formatVent(actuel.wind_speed_10m)} ${formaterDirection(actuel.wind_direction_10m)}` : '—'],
      [t('meteo.rafales'), Number.isFinite(actuel.wind_gusts_10m) ? formatVent(actuel.wind_gusts_10m) : '—'],
      [t('meteo.precipitations'), Number.isFinite(actuel.precipitation) ? formatPluie(actuel.precipitation) : '—'],
      [t('meteo.congelation'), Number.isFinite(hourly.freezing_level_height?.[indexHeureActuelle]) ? formatAltitude(hourly.freezing_level_height[indexHeureActuelle]) : '—'],
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
    statut.textContent = t('meteo.actualise', { heure: heureCourte(new Date(actuel.time)) });
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
    statut.textContent = t('meteo.chargement');
    boutonReessayer.hidden = true;
    panneau.setAttribute('aria-busy', 'true');
    actuelle.hidden = true;
    sectionJours.hidden = true;
    horaire.hidden = true;
    previsionsHoraires = null;
    previsionsJournalieres = null;
    dateSelectionnee = null;
    majLieu();
    afficherCoordonnees(position);
    void chargerCodePostal(position, requete);
    const marqueurPosition = [position.longitude, position.latitude];
    if (!marqueur) {
      pin = creerPinSeul('meteo');
      marqueur = new Marker({ element: pin.element, anchor: 'bottom', offset: DECALAGE_PIN });
    }
    majPin();
    marqueur.setLngLat(marqueurPosition).addTo(map);

    const params = new URLSearchParams({
      latitude: String(position.latitude),
      longitude: String(position.longitude),
      current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,freezing_level_height',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
      forecast_days: '5',
      timezone: 'auto',
    });

    try {
      const reponse = await fetch(`${API_PREVISIONS}?${params}`, { signal: requete.signal });
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      if (reponse.status === 429) {
        throw new Error(t('meteo.limite'));
      }
      if (!reponse.ok) {
        throw new Error(t('meteo.statut-http', { statut: reponse.status }));
      }
      const donnees = await reponse.json();
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      afficherPrevisions(donnees);
      dernieresDonnees = donnees;
      const dateEnregistree = dateHorsLigne(reponse);
      if (dateEnregistree) statut.textContent = t('meteo.sans-reseau', { date: texteDonneesDu(dateEnregistree) });
    } catch (erreur) {
      if (controleur !== requete || !actif || (requete.signal.aborted && !delaiDepasse)) return;
      statut.classList.add('erreur');
      const message = delaiDepasse
        ? t('meteo.trop-long')
        : erreur instanceof Error
          ? erreur.message
          : t('meteo.erreur-inconnue');
      statut.textContent = estHorsLigne()
        ? t('meteo.hors-ligne')
        : t('meteo.erreur', { message });
      boutonReessayer.hidden = false;
      console.error('Chargement des prévisions météo impossible :', erreur);
    } finally {
      clearTimeout(minuteurDelai);
      if (controleur === requete) panneau.setAttribute('aria-busy', 'false');
    }
  }

  boutonChoisir.addEventListener('click', choisirSurCarte);
  boutonReessayer.addEventListener('click', () => void chargerPrevisions());
  boutonCentre.addEventListener('click', () => {
    annulerSelection();
    positionChoisie = false;
    position = centreCarte();
    ecrire(METEO_LOCATION, null);
    chargerPrevisions();
  });
  map.on('moveend', majLieu);
  jours.addEventListener('click', (event) => {
    const bouton = event.target.closest('.meteo-jour');
    if (bouton) selectionnerJour(bouton.dataset.date);
  });

  // Unités ou langue : on réaffiche les dernières prévisions reçues, sans les redemander
  let dernieresDonnees = null;
  surPreferences((detail) => {
    texteBoutonChoisir.textContent = t(selectionEnCours ? 'meteo.annuler' : 'meteo.deplacer');
    majLieu();
    if (!dernieresDonnees || actuelle.hidden) return;
    const statutGarde = statut.textContent;
    const jourGarde = dateSelectionnee;
    afficherPrevisions(dernieresDonnees);
    if (detail?.cle !== 'langue' && detail?.cle !== '*') statut.textContent = statutGarde;
    if (jourGarde) {
      dateSelectionnee = null;
      selectionnerJour(jourGarde);
    }
  });

  return {
    id: 'meteo-locale',
    labelCle: 'meteo.titre',
    icone: 'meteo',
    panneau,
    activer() {
      actif = true;
      if (!positionChoisie) position = centreCarte();
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
