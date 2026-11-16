// Visiter la Lune (lot 4.10, idée du propriétaire du 16 novembre 2026) : une seconde carte MapLibre, posée
// par-dessus celle de la Terre, qui reste telle quelle derrière : « Quitter » ramène exactement où l'on était.
// Globe lunaire avec la mosaïque de la NASA et l'ombrage LOLA (lune-tuiles.js), relief 3D en tuiles locales
// (public/data/lune/relief, scripts/extraire-relief-lune.mjs), noms de l'IAU traduits avec leur latin, sites
// d'alunissage, étoiles et Terre dans le ciel. Éclairage au choix : toujours éclairée, ou temps réel (croissant
// du moment, jour par jour). Chargé à la première visite.
import * as maplibregl from 'maplibre-gl';
import { ADRESSE_POLICES, POLICE, POLICE_GRAS, POLICE_ITALIQUE } from './polices.js';
import { ajouterProtocoleLune, PROTOCOLE_LUNE } from './lune-tuiles.js';
import {
  ECHELLE_LUNE, POINT_SOUS_TERRE, calottesLune, decoderTerrarium, pixelTuile, pointVersTerre, directionDepuis, lieuxEnGeojson,
  pointSubsolaireLune, sitesEnGeojson, texteCoordonnees,
} from './lune-visite-calcul.js';
import { chercherLieux, sitesParDate, zoomPourLieu } from './lune-recherche-calcul.js';
import { eclairementLune, positionLune } from './lune-calcul.js';
import { peindreTerre, pointSousLune, soleilSurTerre } from './terre-vue-calcul.js';
import { requete } from './requete.js';
import { svgLune } from './lune-dessin.js';
import { placerSoleil, projeterSoleil } from './soleil-ciel-calcul.js';
import { dessinerSoleilEspace, initCiel } from './ciel.js';
import { opaciteCiel } from './ciel-calcul.js';
import { codeCardinal } from './vent-calcul.js';
import { lire, ecrire } from './reglages.js';
import { formatDate, heureCourte, poser, surLangue, t, ta } from './i18n.js';
import { langue } from './preferences.js';
import { formatAltitude, formatDistance, nombre, pourcent } from './unites.js';

const JOUR = 24 * 3600 * 1000;
const NOMS = '/data/lune/noms.json';
const RELIEF = `${location.origin}/data/lune/relief/{z}/{x}/{y}.png`;
const APPUI_LONG = 550; // ms
const ICONE_TERRE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M5.5 8.5c2.5.5 3 2 4.5 2.3 1.6.3 1.4 2.2 3 2.6 1.4.3 2.8-.9 4.6-.4M9 19.6c.4-1.6 1.6-2.3 1.4-3.6-.2-1.2-1.8-1.5-2-2.9M15.5 4.6c-.6 1.3.3 2.4 1.6 2.6 1 .2 1.8 1 2.1 2"/></svg>';
const ICONE_FUSEE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8c2.6 2 4 5 4 8.4v4.3H8v-4.3c0-3.4 1.4-6.4 4-8.4Z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M8 12.6 5.2 15.4v2.4H8M16 12.6l2.8 2.8v2.4H16M10.2 18.4c.3 1.2 1 2.1 1.8 2.8.8-.7 1.5-1.6 1.8-2.8"/></svg>';
const ICONE_VUE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="16.5" cy="7.5" r="4.5"/><path d="M14.6 4.4a4.5 4.5 0 0 0 0 6.2"/><circle cx="6.5" cy="17" r="3"/><path d="m8.9 15.2 4.6-4.4"/></svg>';
const CHEVRON = '<svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const CHEVRON_HAUT = '<svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';

let visite = null; // une seule visite à la fois
const VUE_TERRE_AU_NORD = [180, 12];
const telephone = () => window.matchMedia('(max-width: 640px)').matches;

const etiquette = (police) => ['format',
  ['get', 'nom'], { 'text-font': ['literal', police] },
  ['case', ['==', ['get', 'latin'], ''], '', '\n'], {},
  ['get', 'latin'], { 'text-font': ['literal', POLICE_ITALIQUE], 'font-scale': 0.82 },
];

// `instant` : moment de départ du temps réel (celui de Soleil et Lune quand on vient de là)
export function visiterLune(mapTerre, { instant = Date.now() } = {}) {
  if (visite) return visite;
  ajouterProtocoleLune();
  const eclairage = () => lire('lune-visite-eclairage', 'eclairee');
  let moment = instant;

  const racine = document.createElement('div');
  racine.className = 'lune-visite';
  racine.setAttribute('role', 'dialog');
  racine.innerHTML = `
    <div class="lune-visite-carte"></div>
    <div class="lune-visite-haut">
      <button type="button" class="lune-visite-quitter" ${ta('title', 'lune-visite.quitter')}>${ICONE_TERRE}<span data-i18n="lune-visite.quitter"></span></button>
      <div class="lune-recherche">
        <input type="search" class="lune-recherche-champ" autocomplete="off" ${ta('placeholder', 'lune-visite.rechercher')} ${ta('aria-label', 'lune-visite.rechercher')}>
        <button type="button" class="lune-recherche-sites" ${ta('aria-label', 'lune-visite.sites')} ${ta('title', 'lune-visite.sites')}>${ICONE_FUSEE}</button>
        <div class="lune-recherche-liste" role="listbox" hidden></div>
      </div>
    </div>
    <aside class="bf lune-visite-panneau">
      <button type="button" class="lune-visite-barre">
        <span class="lune-visite-barre-icone"></span>
        <span class="bf-resume-texte"><strong data-i18n="lune-visite.titre"></strong><small class="lune-visite-resume"></small></span>
        ${CHEVRON_HAUT}
      </button>
      <header class="bf-entete">
        <div class="bf-titres"><h3 class="bf-nom" data-i18n="lune-visite.titre"></h3><p class="bf-meta" data-i18n="lune-visite.sous-titre"></p></div>
        <div class="bf-actions"><button type="button" class="bf-reduire" ${ta('aria-label', 'panneau.reduire', { nom: t('lune-visite.titre') })}>${CHEVRON}</button></div>
      </header>
      <div class="relief-bascule segments lune-visite-eclairage" role="group">
        <button type="button" data-eclairage="eclairee" data-i18n="lune-visite.eclairee"></button>
        <button type="button" data-eclairage="reel" data-i18n="lune-visite.temps-reel"></button>
      </div>
      <button type="button" class="lune-visite-vue-terre">${ICONE_VUE}<span data-i18n="lune-visite.vue-terre"></span></button>
      <p class="note lune-visite-note-eclairee" data-i18n="lune-visite.note-eclairee"></p>
      <div class="lune-visite-reel">
        <div class="lunaison-entete">
          <button type="button" class="lunaison-pas" data-pas="-1" ${ta('aria-label', 'ombres.jour-precedent')}>‹</button>
          <div class="lunaison-textes"><strong class="lune-visite-date"></strong><span class="lune-visite-heure"></span></div>
          <button type="button" class="lunaison-pas" data-pas="1" ${ta('aria-label', 'ombres.jour-suivant')}>›</button>
        </div>
        <div class="lune-phase">
          <span class="lune-icone-boite"></span>
          <div class="lune-phase-textes"><strong class="lune-nom"></strong><span class="lune-fraction"></span></div>
        </div>
        <p class="note lune-visite-position"></p>
        <button type="button" class="ombres-maintenant lune-visite-maintenant" data-i18n="soleil.maintenant"></button>
      </div>
    </aside>
  `;
  racine.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  document.body.append(racine);
  document.body.classList.add('sur-la-lune');
  const $ = (s) => racine.querySelector(s);
  const panneau = $('.lune-visite-panneau');

  const map = new maplibregl.Map({
    container: $('.lune-visite-carte'),
    attributionControl: { compact: true },
    style: {
      version: 8,
      projection: { type: 'globe' },
      glyphs: `${ADRESSE_POLICES}/{fontstack}/{range}.pbf`,
      // Pas d'atmosphère sur la Lune : ni brume à l'horizon, ni halo autour du globe
      sky: {
        'sky-color': '#020306', 'horizon-color': '#020306', 'fog-color': '#020306',
        'sky-horizon-blend': 0, 'horizon-fog-blend': 0, 'fog-ground-blend': 1, 'atmosphere-blend': 0,
      },
      sources: {
        images: {
          type: 'raster', tiles: [`${PROTOCOLE_LUNE}://images/{z}/{x}/{y}`], tileSize: 256, maxzoom: 9,
          attribution: t('lune-visite.credits-images'),
        },
        relief: {
          type: 'raster-dem', tiles: [RELIEF], encoding: 'terrarium', tileSize: 512, maxzoom: 4,
          attribution: t('lune-visite.credits-relief'),
        },
        nuit: { type: 'raster', tiles: [adresseNuit()], tileSize: 256, maxzoom: 6 },
        lieux: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: t('lune-visite.credits-noms') },
        sites: { type: 'geojson', data: sitesEnGeojson() },
        calottes: { type: 'geojson', data: calottesLune() },
      },
      layers: [
        { id: 'fond', type: 'background', paint: { 'background-color': '#16171b' } },
        { id: 'images', type: 'raster', source: 'images', paint: { 'raster-fade-duration': 200 } },
        { id: 'nuit', type: 'raster', source: 'nuit', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
        // Pôles : au-delà de 85°, aucune tuile ; deux bandes que MapLibre étire jusqu'au pôle (comme sur la Terre)
        { id: 'calottes', type: 'fill', source: 'calottes', paint: { 'fill-color': ['get', 'couleur'], 'fill-antialias': false } },
        {
          id: 'lieux', type: 'symbol', source: 'lieux',
          filter: ['>=', ['zoom'], ['get', 'z']],
          layout: {
            // Nom dans la langue de l'appli, latin en italique dessous ; mers en gras
            'text-field': ['case', ['==', ['get', 'grand'], 1], etiquette(POLICE_GRAS), etiquette(POLICE)],
            'text-font': ['literal', POLICE],
            'text-size': ['case', ['==', ['get', 'grand'], 1], 14, ['>=', ['get', 'diametre'], 100], 12.5, 11.5],
            'text-letter-spacing': ['case', ['==', ['get', 'grand'], 1], 0.06, 0.02],
            'text-max-width': 9,
            'symbol-sort-key': ['get', 'rang'],
            'text-padding': 4,
          },
          paint: {
            'text-color': ['case', ['==', ['get', 'grand'], 1], '#dfe6f5', '#f2f3f6'],
            'text-halo-color': 'rgba(10, 11, 16, 0.85)',
            'text-halo-width': 1.4,
          },
        },
        {
          id: 'sites-point', type: 'circle', source: 'sites', minzoom: 3.5,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 8, 6],
            'circle-color': ['case', ['==', ['get', 'equipage'], 1], '#ff9f43', '#c9b8ff'],
            'circle-stroke-color': '#101116', 'circle-stroke-width': 1.5,
          },
        },
        {
          id: 'sites-nom', type: 'symbol', source: 'sites', minzoom: 4,
          layout: {
            'text-field': ['get', 'nom'], 'text-font': ['literal', POLICE_GRAS], 'text-size': 11.5,
            'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-optional': true,
          },
          paint: {
            'text-color': ['case', ['==', ['get', 'equipage'], 1], '#ffc58f', '#ddd3ff'],
            'text-halo-color': 'rgba(10, 11, 16, 0.85)', 'text-halo-width': 1.4,
          },
        },
      ],
    },
    // Arrivée de l'autre côté : la Terre se lève au-dessus de la Lune, dans le fond étoilé (de la face visible, elle
    // est derrière la caméra) ; « Vue depuis la Terre » ramène à la face visible
    center: VUE_TERRE_AU_NORD,
    zoom: telephone() ? 0.3 : 1,
    minZoom: 0,
    maxPitch: 85,
    renderWorldCopies: false,
  });
  if (import.meta.env.DEV) window.mapLune = map;

  // Relief 3D de près seulement, comme sur la Terre (main.js) : en vue globe, globe et relief ensemble faisaient
  // sauter la caméra. Il monte en douceur du zoom 3 au zoom 5 (retour du propriétaire du 16 novembre 2026 : allumé
  // d'un coup, il faisait « rezoomer » la vue). MapLibre recrée tout le relief à chaque setTerrain : on l'allume une
  // fois, puis on fait varier son exagération (champ `exaggeration` du relief, lu à chaque image).
  const ZOOM_RELIEF = 3;
  const ZOOM_RELIEF_PLEIN = 5;
  function majTerrain() {
    const z = map.getZoom();
    const part = Math.min(1, Math.max(0, (z - ZOOM_RELIEF) / (ZOOM_RELIEF_PLEIN - ZOOM_RELIEF)));
    if (z < ZOOM_RELIEF - 0.2) {
      if (map.getTerrain()) map.setTerrain(null);
      return;
    }
    if (!map.getTerrain()) map.setTerrain({ source: 'relief', exaggeration: Math.max(0.001, ECHELLE_LUNE * part) });
    else if (map.terrain && Math.abs(map.terrain.exaggeration - ECHELLE_LUNE * part) > 0.01) {
      map.terrain.exaggeration = Math.max(0.001, ECHELLE_LUNE * part);
      map.triggerRepaint();
    }
  }
  map.on('load', majTerrain);
  map.on('zoom', majTerrain);
  // Zoom autour du centre de l'écran : autour du pointeur, hors du globe, MapLibre repartait dans l'autre sens
  // (déjà actifs à la création : enable() ne relit ses options qu'après un disable())
  map.scrollZoom.disable();
  map.scrollZoom.enable({ around: 'center' });
  map.touchZoomRotate.disable();
  map.touchZoomRotate.enable({ around: 'center' });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  // Vue depuis la Terre : dans le panneau, sous le choix de l'éclairage (demande du propriétaire du 16 novembre 2026)
  const boutonVueTerre = $('.lune-visite-vue-terre');

  // ---------- Ciel lunaire, comme le ciel de la Terre (ciel.js et soleil-ciel.js) ----------
  // Demande du propriétaire du 16 novembre 2026 : voir la Terre depuis la Lune comme on voit la Lune depuis la Terre.
  // Au dézoom, la vraie Terre (terre-vue-calcul.js) et le soleil sont dessinés dans le fond étoilé, à leur direction
  // vue du centre de la carte : la Lune les cache quand ils passent derrière elle, comme le globe terrestre cache la
  // Lune. De près, en 3D, ils sont dans le ciel, ou au bord de l'écran avec une flèche quand ils sont hors champ.
  const RAYON_TERRE = 22; // px : la Lune vue de la Terre en fait 10, la Terre paraît 3,7 fois plus grande
  const PIXELS_TERRE = 96;
  const imageTerre = document.createElement('canvas');
  imageTerre.width = PIXELS_TERRE;
  imageTerre.height = PIXELS_TERRE;
  let texturesTerre = null;

  // De près, en 3D : la Terre et le soleil dans le ciel lunaire (mêmes règles que soleil-ciel.js sur la Terre)
  const elementTerre = document.createElement('div');
  elementTerre.className = 'lune-ciel terre-ciel';
  elementTerre.hidden = true;
  elementTerre.innerHTML = '<canvas class="terre-ciel-image"></canvas><i class="lune-ciel-fleche"></i>';
  const imageTerre3D = elementTerre.querySelector('canvas');
  imageTerre3D.width = PIXELS_TERRE;
  imageTerre3D.height = PIXELS_TERRE;
  const elementSoleil = document.createElement('div');
  elementSoleil.className = 'soleil-ciel';
  elementSoleil.hidden = true;
  elementSoleil.setAttribute('aria-hidden', 'true');
  elementSoleil.innerHTML = '<i class="soleil-ciel-halo"></i><i class="soleil-ciel-disque"></i><i class="soleil-ciel-fleche"></i>';
  map.getCanvasContainer().append(elementSoleil, elementTerre);

  let pointTerre = null; // { x, y, rayon } dans le fond étoilé, pour la toucher
  if (import.meta.env.DEV) window.terreLune = () => pointTerre; // captures
  const ciel = initCiel(map, { astres: dessinerAstres, instant: () => moment });
  function dessinerAstres({ contexte, centre, projeter }) {
    if (eclairage() === 'reel') {
      const soleil = projeter(directionDepuis(centre.lng, centre.lat, pointSubsolaireLune(moment)));
      if (soleil) dessinerSoleilEspace(contexte, soleil.x, soleil.y);
    }
    const terre = projeter(directionDepuis(centre.lng, centre.lat, POINT_SOUS_TERRE));
    pointTerre = terre && { x: terre.x, y: terre.y, rayon: RAYON_TERRE };
    if (!terre) {
      requestAnimationFrame(placerTerre);
      return;
    }
    // Halo bleu de l'atmosphère, puis la Terre, nord en haut de la carte
    const halo = contexte.createRadialGradient(terre.x, terre.y, RAYON_TERRE * 0.9, terre.x, terre.y, RAYON_TERRE * 1.6);
    halo.addColorStop(0, 'rgba(120, 180, 255, 0.35)');
    halo.addColorStop(1, 'rgba(120, 180, 255, 0)');
    contexte.fillStyle = halo;
    contexte.beginPath();
    contexte.arc(terre.x, terre.y, RAYON_TERRE * 1.6, 0, Math.PI * 2);
    contexte.fill();
    contexte.save();
    contexte.translate(terre.x, terre.y);
    contexte.rotate((-map.getBearing() * Math.PI) / 180);
    contexte.drawImage(imageTerre, -RAYON_TERRE, -RAYON_TERRE, 2 * RAYON_TERRE, 2 * RAYON_TERRE);
    contexte.restore();
    requestAnimationFrame(placerTerre); // la flèche suit la Terre qu'on vient de dessiner
  }

  function peindreImageTerre() {
    const contexte = imageTerre.getContext('2d');
    contexte.clearRect(0, 0, PIXELS_TERRE, PIXELS_TERRE);
    if (!texturesTerre) {
      // En attendant les images de la NASA (ou hors ligne) : un disque bleu
      const disque = contexte.createRadialGradient(PIXELS_TERRE * 0.4, PIXELS_TERRE * 0.38, 2, PIXELS_TERRE / 2, PIXELS_TERRE / 2, PIXELS_TERRE / 2);
      disque.addColorStop(0, '#7fc3ff');
      disque.addColorStop(0.65, '#2f78c8');
      disque.addColorStop(1, '#173d6e');
      contexte.fillStyle = disque;
      contexte.beginPath();
      contexte.arc(PIXELS_TERRE / 2, PIXELS_TERRE / 2, PIXELS_TERRE / 2, 0, Math.PI * 2);
      contexte.fill();
    } else {
      // Face tournée vers la Lune à cet instant, éclairée par le vrai soleil en temps réel (sa phase)
      const pixels = peindreTerre({
        ...texturesTerre,
        centre: pointSousLune(moment),
        soleil: eclairage() === 'reel' ? soleilSurTerre(moment) : null,
        taille: PIXELS_TERRE,
      });
      contexte.putImageData(new ImageData(pixels, PIXELS_TERRE, PIXELS_TERRE), 0, 0);
    }
    const contexte3D = imageTerre3D.getContext('2d');
    contexte3D.clearRect(0, 0, PIXELS_TERRE, PIXELS_TERRE);
    contexte3D.drawImage(imageTerre, 0, 0);
    ciel.redessiner();
  }
  peindreImageTerre();
  chargerTexturesTerre().then((textures) => {
    texturesTerre = textures;
    peindreImageTerre();
  }).catch((erreur) => console.warn('Lune : images de la Terre indisponibles', erreur));

  function nommerTerre() {
    const cle = elementTerre.classList.contains('bord') ? 'lune-visite.regarder-terre' : 'lune-visite.retour-terre';
    imageTerre3D.setAttribute('aria-label', t(cle));
    imageTerre3D.title = t(cle);
  }
  nommerTerre();
  const ZOOM_CIEL_3D = 6; // le fond étoilé s'efface au zoom 6 (opaciteCiel de ciel-calcul.js)
  const cameraLune = () => {
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    return { bearing: map.getBearing(), pitch: map.getPitch(), fov: map.getVerticalFieldOfView(), largeur, hauteurEcran, padding: map.getPadding() };
  };
  // Un astre au-dessus de l'horizon, de près et vue inclinée : à sa place, ou au bord avec sa flèche
  function placerAstre(element, direction, cam, marge) {
    const voir = direction.hauteur > 0 && map.getZoom() >= ZOOM_CIEL_3D && cam.pitch > 1;
    element.hidden = !voir;
    if (!voir) return;
    const projection = projeterSoleil(direction, cam);
    // À sa place seulement dans la partie libre de l'écran (pas sous la barre de recherche ni le panneau)
    const libre = projection.devant && projection.x >= marge.gauche && projection.x <= cam.largeur - marge.droite
      && projection.y >= marge.haut && projection.y <= cam.hauteurEcran - marge.bas;
    const place = libre ? { x: projection.x, y: projection.y, dedans: true } : placerSoleil(projection, {
      largeur: cam.largeur, hauteurEcran: cam.hauteurEcran, marge, margeVisible: Math.max(cam.largeur, cam.hauteurEcran),
    });
    element.classList.toggle('bord', !place.dedans);
    const fleche = element.querySelector('.lune-ciel-fleche, .soleil-ciel-fleche');
    if (!place.dedans) fleche.style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
    element.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
  }
  // Vue d'ensemble : la Terre se voit dans le fond étoilé quand elle dépasse du bord de la Lune. Sinon (derrière la
  // Lune ou derrière la caméra), une petite flèche au bord de l'écran montre de quel côté elle est (demande du
  // propriétaire du 16 novembre 2026) ; un appui fait tourner la Lune jusqu'à la voir.
  const surLaLune = ({ x, y }) => {
    const retour = map.project(map.unproject([x, y]));
    return Math.hypot(retour.x - x, retour.y - y) < 3;
  };
  function indiquerTerre(cam, marge, centre) {
    const visible = pointTerre && opaciteCiel(map.getZoom()) > 0.5 && !surLaLune(pointTerre)
      && pointTerre.x > 0 && pointTerre.x < cam.largeur && pointTerre.y > 0 && pointTerre.y < cam.hauteurEcran;
    elementTerre.hidden = Boolean(visible);
    if (visible) return;
    const angle = ((directionDepuis(centre.lng, centre.lat, POINT_SOUS_TERRE).azimut - cam.bearing) * Math.PI) / 180;
    const { top = 0, bottom = 0, left = 0, right = 0 } = cam.padding;
    const place = placerSoleil({
      devant: false, dx: Math.sin(angle), dy: -Math.cos(angle),
      cx: left + (cam.largeur - left - right) / 2, cy: top + (cam.hauteurEcran - top - bottom) / 2,
    }, { largeur: cam.largeur, hauteurEcran: cam.hauteurEcran, marge, margeVisible: Math.max(cam.largeur, cam.hauteurEcran) });
    elementTerre.classList.add('bord');
    elementTerre.querySelector('.lune-ciel-fleche').style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
    elementTerre.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
  }
  // Tourner la Lune pour voir la Terre dépasser de son bord, en haut de l'écran
  // Nord en haut (demande du propriétaire du 16 novembre 2026 : tournée vers la Terre, la vue avait l'est en haut) :
  // la face cachée à 12° N, d'où la Terre se voit au-dessus de la Lune, par-delà le pôle Nord (comme à l'arrivée)
  function montrerTerreDansEspace() {
    map.flyTo({
      center: VUE_TERRE_AU_NORD,
      bearing: 0,
      pitch: 0,
      zoom: Math.min(map.getZoom(), telephone() ? 0.9 : 1.7),
      padding: { top: 0, right: 0, left: 0, bottom: margeBas() },
      duration: 2200,
    });
  }

  function placerTerre() {
    nommerTerre();
    const cam = cameraLune();
    const { lng, lat } = map.getCenter();
    const haut = racine.querySelector('.lune-visite-haut').getBoundingClientRect().bottom + 16;
    const marge = { haut, bas: margeBas() + 28, gauche: 20, droite: 64 };
    const bordAvant = elementTerre.classList.contains('bord');
    placerAstre(elementTerre, directionDepuis(lng, lat, POINT_SOUS_TERRE), cam, marge);
    if (bordAvant !== elementTerre.classList.contains('bord')) {
      nommerTerre();
      fermerRetour();
    }
    if (map.getZoom() < ZOOM_CIEL_3D) indiquerTerre(cam, marge, { lng, lat });
    if (eclairage() === 'reel') placerAstre(elementSoleil, directionDepuis(lng, lat, pointSubsolaireLune(moment)), cam, marge);
    else elementSoleil.hidden = true;
  }
  map.on('move', placerTerre);
  map.on('resize', placerTerre);
  map.on('load', placerTerre);

  // Vue depuis la Terre : la face visible, nord en haut (demande du propriétaire du 16 novembre 2026 : tournée
  // comme dans le ciel du lieu, elle avait souvent l'est en haut)
  function vueDepuisTerre() {
    fermerBulle();
    map.flyTo({
      center: [POINT_SOUS_TERRE.lng, POINT_SOUS_TERRE.lat],
      zoom: telephone() ? 0.9 : 1.7,
      pitch: 0,
      bearing: 0,
      padding: { top: 0, right: 0, left: 0, bottom: margeBas() },
      duration: 1800,
    });
  }
  boutonVueTerre.addEventListener('click', vueDepuisTerre);

  // Aller la voir : la caméra ne peut pas regarder au zénith, on va donc près du bord de la face visible, tourné
  // vers elle ; elle s'y lève au-dessus de l'horizon (un appui sur la Terre ou sur sa flèche)
  function regarderTerre() {
    const { lng, lat } = map.getCenter();
    const cible = pointVersTerre(lng, lat);
    fermerBulle();
    map.flyTo({
      center: [cible.lng, cible.lat],
      zoom: 6,
      pitch: 84,
      bearing: cible.cap,
      padding: { top: 0, right: 0, left: 0, bottom: margeBas() },
      duration: 2600,
    });
  }
  // Au bord : aller la voir. Dans le ciel : une bulle pour retourner sur la Terre (quitter la visite)
  const bulleRetour = document.createElement('div');
  bulleRetour.className = 'lune-bulle lune-bulle-retour';
  bulleRetour.hidden = true;
  bulleRetour.innerHTML = `
    <button type="button" data-action="retour" class="principal">${ICONE_TERRE}<span data-i18n="lune-visite.retour-terre"></span></button>
  `;
  bulleRetour.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  racine.append(bulleRetour);
  function fermerRetour() { bulleRetour.hidden = true; }
  // Sous la Terre touchée (x, y : bas de la Terre, en px de la fenêtre)
  function ouvrirRetour(x, y) {
    bulleRetour.hidden = false;
    const largeur = bulleRetour.offsetWidth;
    bulleRetour.style.left = `${Math.min(window.innerWidth - largeur - 8, Math.max(8, x - largeur / 2))}px`;
    const haut = y + 10 + bulleRetour.offsetHeight > window.innerHeight - 8 ? y - 2 * RAYON_TERRE - 20 - bulleRetour.offsetHeight : y + 10;
    bulleRetour.style.top = `${Math.max(8, haut)}px`;
  }
  // De près : au bord, aller la voir ; dans le ciel, la bulle
  imageTerre3D.addEventListener('click', (event) => {
    event.stopPropagation();
    if (elementTerre.classList.contains('bord')) {
      fermerRetour();
      if (map.getZoom() < ZOOM_CIEL_3D) montrerTerreDansEspace();
      else regarderTerre();
      return;
    }
    if (!bulleRetour.hidden) {
      fermerRetour();
      return;
    }
    const disque = imageTerre3D.getBoundingClientRect();
    ouvrirRetour(disque.left + disque.width / 2, disque.bottom);
  });
  // Au dézoom : la Terre du fond étoilé se touche, si la Lune ne la cache pas à cet endroit (comme lune-bulle.js)
  map.on('click', (event) => {
    const { x, y } = event.point;
    const touchee = pointTerre && Math.hypot(x - pointTerre.x, y - pointTerre.y) <= pointTerre.rayon + 12;
    if (!touchee) return;
    // Hors de la Lune, MapLibre ramène le point sur son bord : l'aller-retour ne retombe pas au même pixel
    const retour = map.project(map.unproject(event.point));
    if (Math.hypot(retour.x - x, retour.y - y) < 3) return;
    const cadre = map.getContainer().getBoundingClientRect();
    const point = pointTerre;
    setTimeout(() => ouvrirRetour(cadre.left + point.x, cadre.top + point.y + point.rayon));
  });
  bulleRetour.querySelector('[data-action="retour"]').addEventListener('click', () => quitter());
  map.on('movestart', fermerRetour);
  map.on('mousedown', fermerRetour);
  map.on('touchstart', fermerRetour);

  // ---------- Noms ----------
  let lieux = null;
  fetch(NOMS)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((liste) => {
      lieux = liste;
      poserNoms();
    })
    .catch((erreur) => console.warn('Lune : noms indisponibles', erreur));
  const poserNoms = () => {
    if (lieux && map.getSource('lieux')) map.getSource('lieux').setData(lieuxEnGeojson(lieux, langue()));
  };
  map.on('load', poserNoms);
  const desabonnerLangue = surLangue(() => {
    fermerBulle();
    fermerListe();
    poserNoms();
    majPanneau();
    nommerTerre();
  });

  // ---------- Éclairage ----------
  function adresseNuit() {
    const sub = pointSubsolaireLune(moment);
    return `${PROTOCOLE_LUNE}://nuit/${sub.lng.toFixed(1)}/${sub.lat.toFixed(1)}/{z}/{x}/{y}`;
  }
  function majEclairage() {
    const reel = eclairage() === 'reel';
    if (map.getLayer('nuit')) {
      map.getSource('nuit').setTiles([adresseNuit()]);
      map.setLayoutProperty('nuit', 'visibility', reel ? 'visible' : 'none');
      map.getSource('calottes').setData(calottesLune(reel ? pointSubsolaireLune(moment) : null));
    }
    peindreImageTerre();
    majPanneau();
    placerTerre();
  }
  map.on('load', majEclairage);
  racine.querySelectorAll('[data-eclairage]').forEach((b) => b.addEventListener('click', () => {
    ecrire('lune-visite-eclairage', b.dataset.eclairage);
    majEclairage();
  }));
  racine.querySelectorAll('.lunaison-pas').forEach((b) => b.addEventListener('click', () => {
    moment += Number(b.dataset.pas) * JOUR;
    majEclairage();
  }));
  $('.lune-visite-maintenant').addEventListener('click', () => {
    moment = Date.now();
    majEclairage();
  });

  function majPanneau() {
    const reel = eclairage() === 'reel';
    racine.querySelectorAll('[data-eclairage]').forEach((b) => {
      const actif = b.dataset.eclairage === eclairage();
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', String(actif));
    });
    $('.lune-visite-reel').hidden = !reel;
    $('.lune-visite-note-eclairee').hidden = reel;
    const eclat = eclairementLune(moment);
    const { lng, lat } = mapTerre.getCenter();
    // Un dessin par emplacement : deux copies du même SVG partageraient leurs identifiants internes
    const icone = () => svgLune({ fraction: reel ? eclat.fraction : 1, croissante: eclat.croissante, sud: lat < 0, classe: 'lune-icone' });
    $('.lune-visite-barre-icone').innerHTML = icone();
    $('.lune-visite-resume').textContent = reel ? t(`lune.phase-${eclat.code}`) : t('lune-visite.eclairee');
    if (!reel) return;
    $('.lune-icone-boite').innerHTML = icone();
    $('.lune-visite-date').textContent = formatDate(moment, { weekday: 'long', day: 'numeric', month: 'long' });
    $('.lune-visite-heure').textContent = heureCourte(new Date(moment));
    $('.lune-nom').textContent = t(`lune.phase-${eclat.code}`);
    $('.lune-fraction').textContent = t('lune.eclairee', { pourcent: pourcent(eclat.fraction * 100) });
    // Où la chercher dans son ciel, depuis le lieu affiché sur la carte de la Terre
    const pos = positionLune(moment, lat, lng);
    const hauteur = `${nombre(Math.round(pos.hauteur))}°`;
    const direction = `${nombre(Math.round(pos.azimut))}° ${t(`cardinal.${codeCardinal(pos.azimut)}`)}`;
    $('.lune-visite-position').textContent = pos.hauteur > 0
      ? t('lune-visite.dans-ton-ciel', { hauteur, direction })
      : t('lune-visite.sous-ton-horizon', { hauteur, direction });
  }

  // ---------- Panneau réductible ----------
  // Sur téléphone, le panneau occupe le bas de l'écran : la Lune se centre au-dessus
  const margeBas = () => (telephone() ? panneau.offsetHeight : 0);
  const appliquerReduction = (reduit) => {
    panneau.classList.toggle('bf-reduite', reduit);
    ecrire('lune-visite-reduit', reduit);
    if (map.loaded()) map.easeTo({ padding: { top: 0, right: 0, left: 0, bottom: margeBas() }, duration: 400 });
  };
  appliquerReduction(lire('lune-visite-reduit', false) === true);
  $('.bf-reduire').addEventListener('click', () => appliquerReduction(true));
  $('.lune-visite-barre').addEventListener('click', () => appliquerReduction(false));

  // ---------- Fiches ----------
  let bulle = null;
  const fermerBulle = () => {
    bulle?.remove();
    bulle = null;
  };
  function ouvrirBulle(lngLat, html) {
    fermerBulle();
    bulle = new maplibregl.Popup({ className: 'lune-fiche', maxWidth: '280px', offset: 10 })
      .setLngLat(lngLat).setHTML(html).addTo(map);
    remplirAltitude();
  }
  const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // Altitude lue dans les tuiles de relief, et non sur le relief 3D : celui-ci n'existe que de près et n'est pas
  // encore chargé à l'arrivée d'un vol (la fiche disait « 0 m »)
  const tuilesRelief = new Map();
  function pixelsRelief(x, y) {
    const cle = `${x}/${y}`;
    if (!tuilesRelief.has(cle)) {
      const promesse = fetch(RELIEF.replace('{z}', 4).replace('{x}', x).replace('{y}', y))
        .then((reponse) => (reponse.ok ? reponse.blob() : Promise.reject(new Error(`HTTP ${reponse.status}`))))
        .then((blob) => createImageBitmap(blob))
        .then((image) => {
          const toile = document.createElement('canvas');
          toile.width = image.width;
          toile.height = image.height;
          const contexte = toile.getContext('2d', { willReadFrequently: true });
          contexte.drawImage(image, 0, 0);
          return contexte.getImageData(0, 0, image.width, image.height);
        });
      promesse.catch(() => tuilesRelief.delete(cle));
      tuilesRelief.set(cle, promesse);
    }
    return tuilesRelief.get(cle);
  }
  async function altitudeLune({ lng, lat }) {
    const { x, y, px, py } = pixelTuile(lng, lat, 4, 512);
    const { data, width } = await pixelsRelief(x, y);
    const i = (py * width + px) * 4;
    return decoderTerrarium(data[i], data[i + 1], data[i + 2]);
  }
  // Ligne vide dans la fiche, remplie une fois l'altitude lue (remplirAltitude)
  const ligneAltitude = ({ lng, lat }) => `<p class="lune-fiche-ligne lune-fiche-altitude" data-lng="${lng}" data-lat="${lat}"></p>`;
  function remplirAltitude() {
    const ligne = bulle?.getElement().querySelector('.lune-fiche-altitude');
    if (!ligne) return;
    altitudeLune({ lng: Number(ligne.dataset.lng), lat: Number(ligne.dataset.lat) })
      .then((a) => { ligne.textContent = t('lune-visite.altitude', { altitude: formatAltitude(a) }); })
      .catch(() => ligne.remove());
  }
  const coordonnees = ({ lng, lat }) => texteCoordonnees(lng, lat, { nombre: (v) => nombre(v, 3), langue: langue() });

  const htmlSite = (site, lngLat) => `
      <strong class="lune-fiche-nom">${echapper(site.nom)}</strong>
      <p class="lune-fiche-genre">${echapper(t(site.equipage ? 'lune-visite.site-equipage' : 'lune-visite.site-robot'))} · ${echapper(formatDate(`${site.date}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
      <p class="lune-fiche-ligne">${echapper(coordonnees({ lng: lngLat[0], lat: lngLat[1] }))}</p>
      ${ligneAltitude({ lng: lngLat[0], lat: lngLat[1] })}`;
  const htmlLieu = (lieu, [lng, lat]) => {
    const taille = lieu.diametre > 0 ? ` · ${t('lune-visite.diametre', { diametre: formatDistance(lieu.diametre * 1000) })}` : '';
    return `
      <strong class="lune-fiche-nom">${echapper(lieu.nom)}</strong>
      ${lieu.latin ? `<em class="lune-fiche-latin">${echapper(lieu.latin)}</em>` : ''}
      <p class="lune-fiche-genre">${echapper(t(`lune-visite.type-${lieu.genre}`))}${echapper(taille)}</p>
      ${ligneAltitude({ lng, lat })}
      ${lieu.origine ? `<p class="lune-fiche-origine"><span>${echapper(t('lune-visite.origine'))}</span> ${echapper(lieu.origine)}</p>` : ''}`;
  };
  map.on('click', 'sites-point', (event) => {
    const lngLat = event.features[0].geometry.coordinates;
    ouvrirBulle(lngLat, htmlSite(event.features[0].properties, lngLat));
  });
  map.on('click', 'lieux', (event) => {
    if (map.queryRenderedFeatures(event.point, { layers: ['sites-point'] }).length) return;
    const lngLat = event.features[0].geometry.coordinates;
    ouvrirBulle(lngLat, htmlLieu(event.features[0].properties, lngLat));
  });

  // ---------- Recherche, et sites d'alunissage au bouton fusée ----------
  const champ = $('.lune-recherche-champ');
  const liste = $('.lune-recherche-liste');
  const fermerListe = () => {
    liste.hidden = true;
    $('.lune-recherche-sites').classList.remove('actif');
  };
  // Va au lieu, puis ouvre sa fiche une fois la carte posée (l'altitude a besoin du relief)
  function allerA(resultat) {
    fermerListe();
    champ.blur();
    const lieu = resultat.type === 'site' ? resultat.site : resultat.lieu;
    const lngLat = [lieu.lng, lieu.lat];
    fermerBulle();
    map.flyTo({ center: lngLat, zoom: resultat.type === 'site' ? 6.5 : zoomPourLieu(lieu.diametre), pitch: 0, duration: 2200 });
    map.once('moveend', () => ouvrirBulle(lngLat, resultat.type === 'site' ? htmlSite(lieu, lngLat) : htmlLieu(lieu, lngLat)));
  }
  function montrerResultats(resultats, titre = '') {
    liste.replaceChildren();
    if (titre) {
      const entete = document.createElement('p');
      entete.className = 'lune-recherche-titre';
      entete.textContent = titre;
      liste.append(entete);
    }
    if (!resultats.length) {
      const vide = document.createElement('p');
      vide.className = 'lune-recherche-vide';
      vide.textContent = t('lune-visite.aucun');
      liste.append(vide);
    }
    for (const resultat of resultats) {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'lune-recherche-item';
      bouton.setAttribute('role', 'option');
      if (resultat.type === 'site') {
        const { site } = resultat;
        bouton.innerHTML = `<span class="lune-recherche-pastille site${site.equipage ? ' equipage' : ''}"></span><span><strong></strong><small></small></span>`;
        bouton.querySelector('strong').textContent = site.nom;
        bouton.querySelector('small').textContent = `${t(site.equipage ? 'lune-visite.site-equipage' : 'lune-visite.site-robot')} · ${site.date.slice(0, 4)}`;
      } else {
        const { lieu } = resultat;
        bouton.innerHTML = '<span class="lune-recherche-pastille"></span><span><strong></strong><em></em><small></small></span>';
        bouton.querySelector('strong').textContent = lieu.nom;
        bouton.querySelector('em').textContent = lieu.latin;
        bouton.querySelector('small').textContent = t(`lune-visite.type-${lieu.genre}`);
      }
      bouton.addEventListener('click', () => allerA(resultat));
      liste.append(bouton);
    }
    liste.hidden = false;
  }
  champ.addEventListener('input', () => {
    $('.lune-recherche-sites').classList.remove('actif');
    if (champ.value.trim().length < 2) {
      liste.hidden = true;
      return;
    }
    montrerResultats(chercherLieux(lieux ?? [], champ.value, { langue: langue() }));
  });
  champ.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') liste.querySelector('.lune-recherche-item')?.click();
    if (event.key === 'Escape') {
      event.stopPropagation();
      fermerListe();
    }
  });
  $('.lune-recherche-sites').addEventListener('click', () => {
    if (!liste.hidden && $('.lune-recherche-sites').classList.contains('actif')) {
      fermerListe();
      return;
    }
    champ.value = '';
    montrerResultats(sitesParDate().map((site) => ({ type: 'site', site })), t('lune-visite.sites'));
    $('.lune-recherche-sites').classList.add('actif');
  });
  map.on('click', fermerListe);
  map.on('dragstart', fermerListe);
  for (const couche of ['lieux', 'sites-point']) {
    map.on('mouseenter', couche, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', couche, () => { map.getCanvas().style.cursor = ''; });
  }

  // Appui long ou clic droit : le point touché
  const fichePoint = (lngLat) => ouvrirBulle(lngLat, `
    <strong class="lune-fiche-nom">${echapper(t('lune-visite.point'))}</strong>
    <p class="lune-fiche-ligne">${echapper(coordonnees(lngLat))}</p>
    ${ligneAltitude(lngLat)}`);
  map.on('contextmenu', (event) => fichePoint(event.lngLat));
  let minuteur = null;
  let depart = null;
  map.on('touchstart', (event) => {
    if (event.originalEvent.touches.length !== 1) return;
    depart = event.point;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => fichePoint(event.lngLat), APPUI_LONG);
  });
  map.on('touchmove', (event) => {
    if (depart && Math.hypot(event.point.x - depart.x, event.point.y - depart.y) > 8) clearTimeout(minuteur);
  });
  map.on('touchend', () => clearTimeout(minuteur));
  map.on('movestart', () => clearTimeout(minuteur));

  // ---------- Arrivée et départ ----------
  majPanneau();
  map.once('load', () => {
    // Crédits repliés, comme sur la carte de la Terre
    const credits = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    if (credits instanceof HTMLDetailsElement) credits.open = false;
    racine.classList.add('prete');
    map.easeTo({ zoom: telephone() ? 0.9 : 1.7, padding: { top: 0, right: 0, left: 0, bottom: margeBas() }, duration: 1600 });
  });
  map.on('error', (event) => {
    // Une tuile de la NASA qui manque ne doit pas tout arrêter
    if (!event.tile && !event.sourceId) console.warn('Lune :', event.error);
  });

  function quitter() {
    fermerBulle();
    fermerRetour();
    desabonnerLangue?.();
    document.removeEventListener('keydown', surTouche);
    racine.classList.remove('prete');
    document.body.classList.remove('sur-la-lune');
    setTimeout(() => {
      map.remove();
      racine.remove();
    }, 250);
    visite = null;
    mapTerre.resize();
  }
  const surTouche = (event) => {
    if (event.key === 'Escape' && liste.hidden) quitter();
  };
  document.addEventListener('keydown', surTouche);
  $('.lune-visite-quitter').addEventListener('click', quitter);

  visite = { map, quitter };
  return visite;
}

// Images de la Terre (NASA GIBS, comme le globe jour et nuit de globe-nuit.js) : monde entier en Mercator au zoom 1
// (2 × 2 tuiles de 256 px), le jour et les lumières des villes ; chargées une fois, à la première visite
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const TUILES_TERRE = {
  jour: `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/1/{y}/{x}.jpeg`,
  nuit: `${GIBS}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/1/{y}/{x}.png`,
};
let texturesChargees = null;
function chargerTexturesTerre() {
  texturesChargees ??= Promise.all(Object.entries(TUILES_TERRE).map(async ([nom, modele]) => {
    const toile = document.createElement('canvas');
    toile.width = 512;
    toile.height = 512;
    const contexte = toile.getContext('2d', { willReadFrequently: true });
    await Promise.all([0, 1].flatMap((x) => [0, 1].map(async (y) => {
      const reponse = await requete(modele.replace('{x}', x).replace('{y}', y));
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const image = await createImageBitmap(await reponse.blob());
      contexte.drawImage(image, x * 256, y * 256);
      image.close?.();
    })));
    return [nom, contexte.getImageData(0, 0, 512, 512).data];
  })).then((paires) => {
    const textures = Object.fromEntries(paires);
    return { jour: textures.jour, nuit: textures.nuit, largeur: 512 };
  }).catch((erreur) => {
    texturesChargees = null; // nouvel essai à la prochaine visite
    throw erreur;
  });
  return texturesChargees;
}
