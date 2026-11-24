// Panorama des sommets (lot 4.1) : vue 3D à hauteur d'yeux depuis sa position, orientée comme le téléphone,
// avec le nom des sommets visibles ; ou les mêmes noms posés sur l'image de la caméra.
// Chargé au premier appui sur le bouton Panorama (menu.js). Tout ce qui est changé sur la carte
// (mode, relief, caméra, textes, gestes) est rétabli en quittant.
import { etat } from './options-carte.js';
import { bloquerFiches } from './fiche.js';
import { poser, poserAttribut, t } from './i18n.js';
import { surPreferences } from './preferences.js';
import { lire, ecrire } from './reglages.js';
import { formatAltitude, formatDistance } from './unites.js';
import { messageErreur } from './requete.js';
import { capBoussole, lisserAngle } from './guidage-calcul.js';
import { altitudeRelief } from './relief-donnees.js';
import { chargerSommets, chargerRelief, DISTANCE_MAX } from './panorama-donnees.js';
import {
  angleMaxRelief, champHorizontal, directionCamera, ecartCap, estVisible, horizonA, importanceSommet,
  placerEtiquettes, pointA, pointCardinal, projeter,
} from './panorama-calcul.js';

const HAUTEUR_YEUX = 2; // m au-dessus du relief
const VISEE = 3000; // m : point visé par la caméra 3D, dans la direction du regard
const INCLINAISON_MIN = -40;
const INCLINAISON_MAX = 35;
const CHAMP_3D_HORIZONTAL = 60; // degrés : champ visé en 3D, borné en hauteur
const CHAMP_3D_MAX = 75;
const CHAMP_CAMERA_DEFAUT = 67; // degrés sur le grand côté de l'image (objectif principal d'un téléphone)
const HAUTEUR_RANGEE = 40;
const RANGEES = 5;
const ABSENCE_BOUSSOLE = 1500; // ms sans mesure : pas de boussole
const SVG = 'http://www.w3.org/2000/svg';

let ouvert = null;

export async function ouvrirPanorama(map, options = {}) {
  if (ouvert) return;
  ouvert = creerPanorama(map, options);
  await ouvert.demarrer();
}

function creerPanorama(map, { boussole: permissionBoussole }) {
  const avant = {
    camera: { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    mode3D: !!etat.mode3D,
    exageration: etat.exageration,
    champ: map.getVerticalFieldOfView(),
    centreAuSol: map.getCenterClampedToGround(),
  };
  const textesCaches = new Set();
  const abandon = new AbortController();

  // ---------- Interface ----------
  const racine = document.createElement('div');
  racine.id = 'panorama';
  racine.innerHTML = `
    <video class="pano-video" playsinline muted autoplay hidden></video>
    <svg class="pano-traits" aria-hidden="true"><polyline class="pano-horizon" /></svg>
    <div class="pano-etiquettes"></div>
    <header class="pano-entete">
      <button type="button" class="pano-fermer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <div class="pano-titre">
        <strong></strong>
        <span class="pano-lieu"></span>
      </div>
      <div class="pano-modes" role="group">
        <button type="button" data-mode="3d" aria-pressed="true">3D</button>
        <button type="button" data-mode="camera" aria-pressed="false"></button>
      </div>
    </header>
    <p class="pano-etat" role="status"></p>
    <footer class="pano-pied">
      <div class="pano-reglages">
        <button type="button" class="pano-boussole" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 6 2.5 6h-5L12 6Z" class="plein"/><path d="m12 18-2.5-6h5L12 18Z"/></svg>
          <span></span>
        </button>
        <button type="button" class="pano-recalage" hidden>
          <span></span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>
        </button>
      </div>
      <div class="pano-cap"><span class="pano-cap-valeur"></span></div>
      <div class="pano-regle" aria-hidden="true"><div class="pano-regle-bande"></div></div>
      <p class="pano-credit">© OpenStreetMap</p>
    </footer>
  `;
  const $ = (s) => racine.querySelector(s);
  const video = $('.pano-video');
  const traits = $('.pano-traits');
  const horizonTrace = $('.pano-horizon');
  const calqueEtiquettes = $('.pano-etiquettes');
  const etatTexte = $('.pano-etat');
  const lieuTexte = $('.pano-lieu');
  const boutonBoussole = $('.pano-boussole');
  const boutonRecalage = $('.pano-recalage');
  const bande = $('.pano-regle-bande');
  const capTexte = $('.pano-cap-valeur');
  // Règle des caps : trois tours (−360° à 720°), pour glisser sans à-coup au passage du nord
  for (let a = -360; a <= 720; a += 15) {
    const marque = document.createElement('span');
    const cardinal = ((a % 360) + 360) % 360;
    marque.className = cardinal % 45 === 0 ? 'cardinal' : '';
    marque.style.left = `${(a + 360) * 4}px`;
    marque.dataset.cap = cardinal;
    bande.appendChild(marque);
  }
  const majRegle = () =>
    bande.querySelectorAll('span').forEach((m) => {
      const cap = Number(m.dataset.cap);
      m.textContent = cap % 45 === 0 ? t(`cardinal.${pointCardinal(cap)}`) : String(cap);
    });
  majRegle();
  poser($('.pano-titre strong'), 'panorama.titre');
  poserAttribut($('.pano-fermer'), 'aria-label', 'panorama.fermer');
  poserAttribut($('.pano-modes'), 'aria-label', 'panorama.vue');
  poser($('[data-mode="camera"]'), 'panorama.camera');
  poser($('.pano-boussole span'), 'panorama.boussole');
  poserAttribut(boutonRecalage, 'aria-label', 'panorama.annuler-recalage');

  // ---------- État ----------
  let observateur = null; // { lng, lat, altitude, source: 'gps' | 'centre' }
  let sommets = []; // visibles, avec cap, distance, angle (avec et sans courbure)
  let horizon = null;
  let relief = null;
  let mode = '3d';
  let flux = null;
  let champCamera = lire('panorama-champ', CHAMP_CAMERA_DEFAUT);
  let champ3d = null;
  // Regard : capteur (boussole) + recalage au doigt, ou regard libre au doigt sans boussole
  let suivreBoussole = false;
  let capteur = null; // { cap, inclinaison }
  let decalageIOS = null;
  let derniereMesure = 0;
  let recalage = { cap: 0, inclinaison: 0 };
  let libre = { cap: avant.camera.bearing, inclinaison: 0 };
  let message = { cle: null, variables: null };
  const elements = new Map(); // id → étiquette
  let image = 0;
  let derniereCamera = '';
  let imagesDessinees = 0;

  // Une information (pas une erreur) s'efface d'elle-même après `duree` ms
  let effacement = 0;
  const afficherEtat = (cle, variables = null, duree = 0) => {
    clearTimeout(effacement);
    message = { cle, variables };
    etatTexte.hidden = !cle;
    if (cle) etatTexte.textContent = t(cle, variables);
    if (cle && duree) effacement = setTimeout(() => afficherEtat(null), duree);
  };
  const majLieu = () => {
    if (!observateur) return poser(lieuTexte, 'panorama.position');
    poser(lieuTexte, observateur.source === 'gps' ? 'panorama.ta-position' : 'panorama.centre', {
      altitude: formatAltitude(observateur.sol),
    });
  };
  const arretLangue = surPreferences(() => {
    majLieu();
    majRegle();
    if (message.cle) afficherEtat(message.cle, message.variables);
    elements.forEach((e) => remplirEtiquette(e));
  }, ['langue', 'unites', '*']);

  // ---------- Regard ----------
  function regard() {
    if (suivreBoussole && capteur) {
      return {
        cap: (capteur.cap + recalage.cap + 360) % 360,
        inclinaison: borner(capteur.inclinaison + recalage.inclinaison, INCLINAISON_MIN, INCLINAISON_MAX),
      };
    }
    return libre;
  }
  const borner = (v, min, max) => Math.min(max, Math.max(min, v));

  function surOrientation(e) {
    const d = directionCamera(e);
    if (!d) return;
    let cap;
    if (Number.isFinite(e.webkitCompassHeading)) {
      // iOS : alpha n'est pas compté depuis le nord ; webkitCompassHeading donne l'écart
      const ecart = ecartCap(e.webkitCompassHeading, capBoussole({ alpha: e.alpha, absolute: true }));
      decalageIOS = decalageIOS === null ? ecart : decalageIOS + ecartCap(ecart, decalageIOS) * 0.05;
      cap = d.cap + decalageIOS;
    } else if (e.absolute || e.type === 'deviceorientationabsolute') cap = d.cap;
    else return; // alpha relatif sans cap : inutilisable
    capteur = {
      cap: lisserAngle(capteur?.cap ?? null, cap, 0.25),
      inclinaison: capteur ? capteur.inclinaison + (d.inclinaison - capteur.inclinaison) * 0.25 : d.inclinaison,
    };
    if (!derniereMesure && !suivreBoussole) basculerBoussole(true);
    derniereMesure = performance.now();
  }
  const evenementOrientation = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';

  function basculerBoussole(actif) {
    if (actif && !capteur) {
      afficherEtat('panorama.sans-boussole');
      actif = false;
    }
    if (!actif && suivreBoussole) libre = regard(); // le regard reste où il était
    suivreBoussole = actif;
    boutonBoussole.setAttribute('aria-pressed', String(actif));
    majRecalage();
  }

  function majRecalage() {
    const visible = suivreBoussole && (Math.abs(recalage.cap) >= 0.5 || Math.abs(recalage.inclinaison) >= 0.5);
    boutonRecalage.hidden = !visible;
    if (visible) {
      const d = Math.round(recalage.cap);
      poser(boutonRecalage.querySelector('span'), 'panorama.recale', { degres: `${d > 0 ? '+' : ''}${d}` });
    }
  }

  // ---------- Gestes : glisser pour regarder (ou recaler), pincer pour le champ ----------
  const pointeurs = new Map();
  let pincement = null;
  function surPointeur(e) {
    if (e.target.closest('button, header, footer')) return;
    if (e.type === 'pointerdown') {
      racine.setPointerCapture?.(e.pointerId);
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointeurs.size === 2) {
        const [a, b] = [...pointeurs.values()];
        pincement = { distance: Math.hypot(a.x - b.x, a.y - b.y), champ: champActuel() };
      }
      return;
    }
    const precedent = pointeurs.get(e.pointerId);
    if (!precedent) return;
    if (e.type !== 'pointermove') {
      pointeurs.delete(e.pointerId);
      if (pointeurs.size < 2) pincement = null;
      return;
    }
    const courant = { x: e.clientX, y: e.clientY };
    pointeurs.set(e.pointerId, courant);
    if (pincement && pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      changerChamp(pincement.champ * (pincement.distance / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
      return;
    }
    if (pointeurs.size !== 1) return;
    // Un pixel vaut ce que l'écran couvre : le sommet suit le doigt
    const parPixel = champActuel() / racine.clientHeight;
    const dCap = -(courant.x - precedent.x) * parPixel;
    const dIncl = (courant.y - precedent.y) * parPixel;
    if (suivreBoussole) {
      recalage = { cap: ecartCap(recalage.cap + dCap, 0), inclinaison: borner(recalage.inclinaison + dIncl, -30, 30) };
      majRecalage();
    } else {
      libre = { cap: (libre.cap + dCap + 360) % 360, inclinaison: borner(libre.inclinaison + dIncl, INCLINAISON_MIN, INCLINAISON_MAX) };
    }
  }
  function surMolette(e) {
    e.preventDefault();
    changerChamp(champActuel() * Math.exp(e.deltaY * 0.001));
  }

  function changerChamp(valeur) {
    if (mode === 'camera') {
      champCamera = borner(valeur * (champCamera / champActuel()), 30, 110);
      ecrire('panorama-champ', Math.round(champCamera * 10) / 10);
    } else {
      champ3d = borner(valeur, 15, CHAMP_3D_MAX);
      map.setVerticalFieldOfView(champ3d);
    }
  }

  // Champ vertical de ce qui est affiché
  function champActuel() {
    if (mode !== 'camera' || !video.videoWidth) return map.getVerticalFieldOfView();
    const L = racine.clientWidth;
    const H = racine.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // champCamera vaut pour le grand côté de l'image ; l'image couvre l'écran (object-fit: cover)
    const tanGrand = Math.tan((champCamera / 2) * Math.PI / 180);
    const tanVertical = vh >= vw ? tanGrand : (tanGrand * vh) / vw;
    const echelle = Math.max(L / vw, H / vh);
    return (2 * Math.atan((tanVertical * H) / (echelle * vh)) * 180) / Math.PI;
  }

  // ---------- Étiquettes ----------
  function remplirEtiquette(e) {
    e.el.querySelector('.pano-nom').textContent = e.sommet.nom;
    e.el.querySelector('.pano-info').textContent = t('panorama.info', {
      altitude: formatAltitude(e.sommet.altitude),
      distance: formatDistance(e.sommet.distance),
    });
    e.largeur = 0;
  }
  function etiquette(sommet) {
    let e = elements.get(sommet.cle);
    if (e) return e;
    const el = document.createElement('div');
    el.className = 'pano-sommet';
    el.innerHTML = '<span class="pano-nom"></span><span class="pano-info"></span>';
    calqueEtiquettes.appendChild(el);
    const trait = document.createElementNS(SVG, 'line');
    trait.setAttribute('class', 'pano-trait');
    const point = document.createElementNS(SVG, 'circle');
    point.setAttribute('class', 'pano-point');
    point.setAttribute('r', '3');
    traits.append(trait, point);
    e = { el, trait, point, sommet, largeur: 0 };
    remplirEtiquette(e);
    elements.set(sommet.cle, e);
    return e;
  }

  function dessiner() {
    image = requestAnimationFrame(dessiner);
    if (suivreBoussole && performance.now() - derniereMesure > ABSENCE_BOUSSOLE * 4) basculerBoussole(false);
    const r = regard();
    const largeur = racine.clientWidth;
    const hauteur = racine.clientHeight;

    if (mode === '3d' && observateur) {
      // Les yeux restent au-dessus du relief affiché : tant que les tuiles proches arrivent, il peut être plus haut que
      // celui lu au départ, et la caméra, dessous, voyait les bords des tuiles comme des murs gris
      if (++imagesDessinees % 10 === 0) {
        const sol = map.queryTerrainElevation([observateur.lng, observateur.lat]);
        const yeux = Math.max(observateur.sol, Number.isFinite(sol) ? sol : -Infinity) + HAUTEUR_YEUX;
        if (Math.abs(yeux - observateur.altitude) > 0.5) {
          observateur.altitude = yeux;
          derniereCamera = '';
        }
      }
      const cle = `${r.cap.toFixed(2)}/${r.inclinaison.toFixed(2)}`;
      if (cle !== derniereCamera) {
        derniereCamera = cle;
        // On vise un point en l'air à VISEE m : viser le sol (regard vers le bas) mettait le centre de la carte
        // à quelques mètres, au zoom maximal, et la caméra partait de travers
        const i = (r.inclinaison * Math.PI) / 180;
        const cible = pointA(observateur, r.cap, VISEE * Math.cos(i));
        map.jumpTo(map.calculateCameraOptionsFromTo(
          [observateur.lng, observateur.lat], observateur.altitude,
          [cible.lng, cible.lat], observateur.altitude + VISEE * Math.sin(i)
        ));
      }
    }
    const vue = { cap: r.cap, inclinaison: r.inclinaison, champ: champActuel(), largeur, hauteur };
    const courbure = mode === 'camera'; // la 3D de MapLibre est plate
    traits.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);

    // Règle des caps, en bas : 4 px par degré
    const pas = 4;
    bande.style.transform = `translateX(${-(r.cap * pas) - 360 * pas + largeur / 2}px)`;
    capTexte.textContent = `${t(`cardinal.${pointCardinal(r.cap)}`)} ${Math.round(r.cap) % 360}°`;

    // Ligne d'horizon calculée, sur l'image de la caméra : aide à recaler
    if (mode === 'camera' && horizon) {
      const demi = champHorizontal(vue.champ, largeur, hauteur) / 2 + 2;
      const points = [];
      for (let a = -demi; a <= demi; a += 0.5) {
        const c = (r.cap + a + 360) % 360;
        const p = projeter(c, horizonA(horizon, c), vue);
        if (p) points.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      horizonTrace.setAttribute('points', points.join(' '));
    } else horizonTrace.setAttribute('points', '');

    // Sommets à l'écran, puis rangées sans chevauchement
    const candidats = [];
    for (const s of sommets) {
      const p = projeter(s.cap, courbure ? s.angle : s.anglePlat, vue);
      const e = elements.get(s.cle);
      if (!p || p.x < -40 || p.x > largeur + 40 || p.y < 0 || p.y > hauteur) {
        if (e) e.visible = false;
        continue;
      }
      const el = etiquette(s);
      if (!el.largeur) el.largeur = el.el.offsetWidth || 120;
      // x : centre de l'étiquette, gardée dans l'écran ; xSommet : là où descend son trait
      const x = Math.min(largeur - el.largeur / 2 - 6, Math.max(el.largeur / 2 + 6, p.x));
      candidats.push({ e: el, x, xSommet: p.x, y: p.y, largeur: el.largeur, importance: s.importance });
    }
    const placees = placerEtiquettes(candidats, { rangees: RANGEES });
    const montrees = new Set();
    const haut = $('.pano-entete').getBoundingClientRect().bottom + 12;
    for (const c of placees) {
      const y = haut + c.rangee * HAUTEUR_RANGEE;
      const { el, trait, point } = c.e;
      montrees.add(c.e);
      el.style.transform = `translate(${(c.x - c.largeur / 2).toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.hidden = false;
      trait.setAttribute('x1', c.x.toFixed(1));
      trait.setAttribute('x2', c.xSommet.toFixed(1));
      trait.setAttribute('y1', (y + 34).toFixed(1));
      trait.setAttribute('y2', Math.max(y + 34, c.y - 4).toFixed(1));
      point.setAttribute('cx', c.xSommet.toFixed(1));
      point.setAttribute('cy', c.y.toFixed(1));
      trait.style.display = c.y - 4 > y + 34 ? '' : 'none';
      point.style.display = '';
    }
    elements.forEach((e) => {
      if (montrees.has(e)) return;
      e.el.hidden = true;
      e.trait.style.display = 'none';
      e.point.style.display = 'none';
    });
  }

  // ---------- Caméra ----------
  async function changerMode(nouveau) {
    if (nouveau === mode) return;
    if (nouveau === 'camera') {
      if (!navigator.mediaDevices?.getUserMedia) {
        afficherEtat('panorama.camera-absente');
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (err) {
        console.warn('Caméra indisponible :', err);
        afficherEtat(err?.name === 'NotAllowedError' ? 'panorama.camera-refusee' : 'panorama.camera-absente');
        return;
      }
      if (!ouvert) return arreterFlux();
      video.srcObject = flux;
      video.hidden = false;
      await video.play().catch(() => {});
      document.body.classList.add('panorama-camera');
      if (!horizon && relief && observateur) calculerHorizon();
    } else {
      arreterFlux();
      video.hidden = true;
      document.body.classList.remove('panorama-camera');
      derniereCamera = '';
    }
    mode = nouveau;
    racine.querySelectorAll('.pano-modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }
  function arreterFlux() {
    flux?.getTracks().forEach((piste) => piste.stop());
    flux = null;
    video.srcObject = null;
  }

  // ---------- Calculs, par petits morceaux pour ne pas figer l'écran ----------
  const pause = () => new Promise((resolve) => requestAnimationFrame(resolve));

  async function calculerSommets(liste) {
    const visibles = [];
    for (let i = 0; i < liste.length; i += 1) {
      const s = liste[i];
      if (!Number.isFinite(s.altitude)) continue;
      const v = estVisible(observateur, s, relief);
      if (v.visible && v.distance > 50) {
        const anglePlat = Math.atan2(s.altitude - observateur.altitude, v.distance) * 180 / Math.PI;
        const r = { ...s, ...v, anglePlat, cle: `${s.nom}/${s.lng.toFixed(4)}/${s.lat.toFixed(4)}` };
        r.importance = importanceSommet(r);
        visibles.push(r);
      }
      if (i % 20 === 19) {
        await pause();
        if (abandon.signal.aborted) return;
        sommets = visibles.slice();
      }
    }
    sommets = visibles;
  }

  async function calculerHorizon() {
    const pas = 0.5;
    const angles = [];
    for (let cap = 0; cap < 360; cap += pas) {
      angles.push(angleMaxRelief(observateur, cap, DISTANCE_MAX, relief));
      if (angles.length % 30 === 0) {
        await pause();
        if (abandon.signal.aborted) return;
      }
    }
    horizon = { pas, angles };
  }

  // ---------- Position ----------
  function position() {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lng: coords.longitude, lat: coords.latitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  // ---------- Entrée et sortie ----------
  function cacherTextes() {
    for (const couche of map.getStyle().layers) {
      if (couche.type !== 'symbol' || couche.layout?.visibility === 'none') continue;
      textesCaches.add(couche.id);
      map.setLayoutProperty(couche.id, 'visibility', 'none');
    }
  }
  // D'autres modules remettent leurs couches visibles : on les recache
  let attenteStyle = 0;
  const surStyle = () => {
    cancelAnimationFrame(attenteStyle);
    attenteStyle = requestAnimationFrame(cacherTextes);
  };

  async function demarrer() {
    document.body.appendChild(racine);
    document.body.classList.add('panorama-actif');
    etat.panorama = true;
    majLieu();
    bloquerFiches(true);
    ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'touchPitch', 'doubleClickZoom', 'keyboard', 'boxZoom']
      .forEach((g) => map[g]?.disable());

    racine.addEventListener('pointerdown', surPointeur);
    racine.addEventListener('pointermove', surPointeur);
    racine.addEventListener('pointerup', surPointeur);
    racine.addEventListener('pointercancel', surPointeur);
    racine.addEventListener('wheel', surMolette, { passive: false });
    $('.pano-fermer').addEventListener('click', fermer);
    racine.querySelectorAll('.pano-modes button').forEach((b) => b.addEventListener('click', () => changerMode(b.dataset.mode)));
    boutonBoussole.addEventListener('click', () => basculerBoussole(!suivreBoussole));
    boutonRecalage.addEventListener('click', () => {
      recalage = { cap: 0, inclinaison: 0 };
      majRecalage();
    });
    window.addEventListener('keydown', surTouche);

    // Boussole : demandée à iOS par l'appui (menu.js) ; on écoute quelle que soit la réponse (Chrome répond
    // aussi « refusé » quand il n'a pas de capteur) : sans mesure, regard libre au doigt
    Promise.resolve(permissionBoussole).then(() => {
      if (ouvert) window.addEventListener(evenementOrientation, surOrientation);
    });
    afficherEtat('panorama.recherche-position');
    const gps = await position();
    if (!ouvert) return;
    const centre = map.getCenter();
    const lieu = gps ?? { lng: centre.lng, lat: centre.lat };
    let altitude;
    try {
      altitude = await altitudeRelief(lieu.lng, lieu.lat, 13);
    } catch (err) {
      console.warn('Relief indisponible :', err);
      afficherEtat('panorama.erreur', { message: messageErreur(err) });
      return;
    }
    if (!ouvert) return;
    observateur = { ...lieu, sol: altitude, altitude: altitude + HAUTEUR_YEUX, source: gps ? 'gps' : 'centre' };
    majLieu();

    // Carte : 3D, relief à sa vraie hauteur, caméra libre au-dessus du sol, textes de la carte cachés
    if (!etat.mode3D) etat.basculerMode();
    etat.exageration = 1;
    etat.majTerrain?.();
    map.setMaxPitch(90 + INCLINAISON_MAX);
    map.setCenterClampedToGround(false);
    const champ = Math.min(CHAMP_3D_MAX, (2 * Math.atan(Math.tan((CHAMP_3D_HORIZONTAL / 2) * Math.PI / 180) * racine.clientHeight / racine.clientWidth)) * 180 / Math.PI);
    champ3d = Math.max(avant.champ, champ);
    map.setVerticalFieldOfView(champ3d);
    cacherTextes();
    map.on('styledata', surStyle);
    image = requestAnimationFrame(dessiner);
    // Voile tant que le relief proche n'est pas chargé : avant, les bords des tuiles se voient comme des murs gris
    racine.classList.add('pano-attente');
    const leverVoile = () => racine.classList.remove('pano-attente');
    requestAnimationFrame(() => requestAnimationFrame(() => map.once('idle', leverVoile)));
    setTimeout(leverVoile, 10000);

    afficherEtat(gps ? 'panorama.chargement' : 'panorama.sans-gps');
    try {
      const modele = map.getSource('osm-vecteur')?.tiles?.[0];
      const [donnees, lecteurRelief] = await Promise.all([
        chargerSommets(observateur, modele, abandon.signal),
        chargerRelief(observateur),
      ]);
      if (!ouvert) return;
      relief = lecteurRelief;
      await calculerSommets(donnees.sommets);
      if (!ouvert) return;
      if (!sommets.length) afficherEtat('panorama.aucun');
      else if (donnees.incomplet) afficherEtat('panorama.incomplet', null, 6000);
      else if (!gps) afficherEtat('panorama.sans-gps', null, 6000);
      else if (!capteur) afficherEtat('panorama.sans-boussole', null, 6000);
      else afficherEtat(null);
      if (mode === 'camera' && !horizon) calculerHorizon();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.warn('Sommets indisponibles :', err);
      afficherEtat('panorama.erreur', { message: messageErreur(err) });
    }
  }

  function surTouche(e) {
    if (e.key === 'Escape') fermer();
  }

  function fermer() {
    if (ouvert === null) return;
    ouvert = null;
    abandon.abort();
    cancelAnimationFrame(image);
    cancelAnimationFrame(attenteStyle);
    arretLangue?.();
    window.removeEventListener(evenementOrientation, surOrientation);
    window.removeEventListener('keydown', surTouche);
    arreterFlux();
    map.off('styledata', surStyle);
    textesCaches.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'visible'));
    textesCaches.clear();

    map.setVerticalFieldOfView(avant.champ);
    map.setCenterClampedToGround(avant.centreAuSol);
    etat.exageration = avant.exageration;
    map.setMaxPitch(85);
    etat.panorama = false;
    map.jumpTo(avant.camera);
    if (!avant.mode3D && etat.mode3D) etat.basculerMode();
    else etat.majTerrain?.();
    ['dragPan', 'dragRotate', 'scrollZoom', 'touchZoomRotate', 'doubleClickZoom', 'keyboard', 'boxZoom']
      .forEach((g) => map[g]?.enable());
    if (etat.mode3D) map.touchPitch.enable();
    bloquerFiches(false);
    document.body.classList.remove('panorama-actif', 'panorama-camera');
    racine.remove();
  }

  return { demarrer, fermer };
}
