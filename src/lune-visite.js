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
  ECHELLE_LUNE, POINT_SOUS_TERRE, altitudeReelle, calottesLune, pointVersTerre, directionDepuis, fractionTerre, lieuxEnGeojson,
  pointSubsolaireLune, sitesEnGeojson, texteCoordonnees,
} from './lune-visite-calcul.js';
import { chercherLieux, sitesParDate, zoomPourLieu } from './lune-recherche-calcul.js';
import { dessinPhase, eclairementLune, positionLune } from './lune-calcul.js';
import { getMoonPosition } from 'suncalc';
import { svgLune } from './lune-dessin.js';
import { svgTerre } from './terre-dessin.js';
import { placerSoleil, projeterSoleil } from './soleil-ciel-calcul.js';
import { initCiel } from './ciel.js';
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
          id: 'sites-point', type: 'circle', source: 'sites', minzoom: 3,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 8, 6],
            'circle-color': ['case', ['==', ['get', 'equipage'], 1], '#ff9f43', '#c9b8ff'],
            'circle-stroke-color': '#101116', 'circle-stroke-width': 1.5,
          },
        },
        {
          id: 'sites-nom', type: 'symbol', source: 'sites', minzoom: 3.8,
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
      terrain: { source: 'relief', exaggeration: ECHELLE_LUNE },
    },
    center: [0, 0], // face visible, comme on la voit depuis la Terre
    zoom: telephone() ? 0.4 : 1.2,
    maxPitch: 85,
    renderWorldCopies: false,
  });
  if (import.meta.env.DEV) window.mapLune = map;
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  // Vue depuis la Terre : dans le panneau, sous le choix de l'éclairage (demande du propriétaire du 16 novembre 2026)
  const boutonVueTerre = $('.lune-visite-vue-terre');

  // ---------- Ciel : étoiles et, en temps réel, le soleil ----------
  const ciel = initCiel(map, { astres: dessinerAstres });
  function dessinerAstres({ contexte, centre, projeter }) {
    if (eclairage() !== 'reel') return;
    const soleil = projeter(directionDepuis(centre.lng, centre.lat, pointSubsolaireLune(moment)));
    if (!soleil) return;
    const halo = contexte.createRadialGradient(soleil.x, soleil.y, 0, soleil.x, soleil.y, 60);
    halo.addColorStop(0, 'rgba(255, 248, 230, 0.95)');
    halo.addColorStop(0.2, 'rgba(255, 230, 170, 0.3)');
    halo.addColorStop(1, 'rgba(255, 220, 150, 0)');
    contexte.fillStyle = halo;
    contexte.beginPath();
    contexte.arc(soleil.x, soleil.y, 60, 0, Math.PI * 2);
    contexte.fill();
  }

  // ---------- La Terre, dessinée dans le ciel lunaire (demande du propriétaire du 16 novembre 2026) ----------
  // À sa place quand on la voit, sinon au bord de l'écran avec une flèche vers elle ; à tout zoom. Un appui
  // dessus recadre la Lune comme on la voit depuis la Terre.
  const elementTerre = document.createElement('button');
  elementTerre.type = 'button';
  elementTerre.className = 'lune-ciel terre-ciel';
  function nommerTerre() {
    const cle = elementTerre.classList.contains('bord') ? 'lune-visite.regarder-terre' : 'lune-visite.retour-terre';
    elementTerre.setAttribute('aria-label', t(cle));
    elementTerre.title = t(cle);
  }
  nommerTerre();
  elementTerre.innerHTML = `${svgTerre()}<i class="lune-ciel-fleche"></i>`;
  map.getCanvasContainer().append(elementTerre);
  const phaseTerre = elementTerre.querySelector('.terre-phase-chemin');
  let fractionAffichee = null;
  const cameraLune = () => {
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    return { bearing: map.getBearing(), pitch: map.getPitch(), fov: map.getVerticalFieldOfView(), largeur, hauteurEcran, padding: map.getPadding() };
  };
  function placerTerre() {
    const cam = cameraLune();
    const { lng, lat } = map.getCenter();
    const direction = directionDepuis(lng, lat, POINT_SOUS_TERRE);
    const projection = projeterSoleil(direction, cam);
    // Sous l'horizon du centre, elle est derrière la Lune : seulement sa direction, au bord
    const haut = racine.querySelector('.lune-visite-haut').getBoundingClientRect().bottom + 16;
    const marge = { haut, bas: margeBas() + 28, gauche: 20, droite: 64 };
    const place = placerSoleil(direction.hauteur > 0 ? projection : { ...projection, devant: false }, {
      largeur: cam.largeur, hauteurEcran: cam.hauteurEcran, marge, margeVisible: 12,
    });
    // Toujours affichée (demande du propriétaire du 16 novembre 2026) : juste derrière la caméra, au départ ou en vue
    // depuis la Terre, elle se pose en bas, flèche vers le bas
    const auBord = !place.dedans;
    if (auBord !== elementTerre.classList.contains('bord')) {
      elementTerre.classList.toggle('bord', auBord);
      nommerTerre();
      fermerRetour();
    }
    if (!place.dedans) elementTerre.querySelector('.lune-ciel-fleche').style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
    elementTerre.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
    // Phase vue de la Lune (pleine à la nouvelle lune), côté éclairé tourné vers le soleil
    const reel = eclairage() === 'reel';
    const fraction = reel ? fractionTerre(eclairementLune(moment).fraction) : 1;
    if (fraction !== fractionAffichee) {
      phaseTerre.setAttribute('d', dessinPhase(fraction, true));
      fractionAffichee = fraction;
    }
    let angle = 0;
    if (reel) {
      const versSoleil = projeterSoleil(directionDepuis(lng, lat, pointSubsolaireLune(moment)), cam);
      angle = Math.atan2(versSoleil.dy - projection.dy, versSoleil.dx - projection.dx) * (180 / Math.PI);
    }
    phaseTerre.setAttribute('transform', `rotate(${angle.toFixed(1)} 12 12)`);
  }
  map.on('move', placerTerre);
  map.on('resize', placerTerre);

  // Vue depuis la Terre : la face visible, tournée comme on la voit depuis le lieu de la carte de la Terre
  // (angle parallactique de la Lune dans son ciel)
  function vueDepuisTerre() {
    const { lng, lat } = mapTerre.getCenter();
    const { parallacticAngle } = getMoonPosition(new Date(moment), lat, lng);
    fermerBulle();
    map.flyTo({
      center: [POINT_SOUS_TERRE.lng, POINT_SOUS_TERRE.lat],
      zoom: telephone() ? 0.9 : 1.7,
      pitch: 0,
      bearing: -parallacticAngle,
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
  bulleRetour.innerHTML = `<button type="button" class="principal">${ICONE_TERRE}<span data-i18n="lune-visite.retour-terre"></span></button>`;
  poser(bulleRetour.querySelector('span'), 'lune-visite.retour-terre');
  racine.append(bulleRetour);
  function fermerRetour() { bulleRetour.hidden = true; }
  elementTerre.addEventListener('click', (event) => {
    event.stopPropagation();
    if (elementTerre.classList.contains('bord')) {
      fermerRetour();
      regarderTerre();
      return;
    }
    if (!bulleRetour.hidden) {
      fermerRetour();
      return;
    }
    const disque = elementTerre.querySelector('svg').getBoundingClientRect();
    bulleRetour.hidden = false;
    const largeur = bulleRetour.offsetWidth;
    bulleRetour.style.left = `${Math.min(window.innerWidth - largeur - 8, Math.max(8, disque.left + disque.width / 2 - largeur / 2))}px`;
    bulleRetour.style.top = `${disque.bottom + 10}px`;
  });
  bulleRetour.querySelector('button').addEventListener('click', () => quitter());
  map.on('movestart', fermerRetour);
  map.on('click', fermerRetour);

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
    ciel.redessiner();
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
  }
  const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const altitudeIci = (lngLat) => {
    const brute = map.queryTerrainElevation(lngLat);
    // MapLibre rend l'altitude exagérée : on la ramène à la vraie Lune
    return brute === null || brute === undefined ? null : altitudeReelle(brute);
  };
  const ligneAltitude = (lngLat) => {
    const a = altitudeIci(lngLat);
    return a === null ? '' : `<p class="lune-fiche-ligne">${echapper(t('lune-visite.altitude', { altitude: formatAltitude(a) }))}</p>`;
  };
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
