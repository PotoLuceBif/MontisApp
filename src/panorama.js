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
  angleApparent, champHorizontal, choisirDepart, choisirEtiquettes, cretesCap, leverCoucherReels, profilHorizon, trajetAstre, directionCamera, ecartCap, estVisible,
  importanceSommet, pointA, pointCardinal, projeter, relierCretes,
} from './panorama-calcul.js';

const HAUTEUR_YEUX = 2; // m au-dessus du relief
const VISEE = 3000; // m : point visé par la caméra 3D, dans la direction du regard
// En 3D, l'œil passe 20 m au-dessus des yeux : sur une pente, le versant tout proche, dessiné en tuiles grossières,
// remplissait le bas de l'écran. La visibilité des sommets reste calculée à hauteur d'homme ; la caméra, elle, à 2 m
const SURELEVATION_3D = 20;
const INCLINAISON_MIN = -40;
const INCLINAISON_MAX = 35;
const INCLINAISON_MAX_CIEL = 88; // vue au sol de Soleil et Lune : on lève les yeux jusqu'au zénith
const CHAMP_3D_HORIZONTAL = 60; // degrés : champ visé en 3D, borné en hauteur
const CHAMP_3D_MAX = 75;
const CHAMP_CAMERA_DEFAUT = 67; // degrés sur le grand côté de l'image (objectif principal d'un téléphone)
const ECART_NOMS = 13; // px entre deux noms inclinés voisins : ils peuvent se frôler
const HAUTEUR_NOMS = 150; // px gardés au-dessus de la ligne des noms, sous l'en-tête
const PAS_CRETES = 0.5; // degrés entre deux rayons des lignes de crête
const ABSENCE_BOUSSOLE = 1500; // ms sans mesure : pas de boussole
const SVG = 'http://www.w3.org/2000/svg';

let ouvert = null;

export const fermerPanorama = () => ouvert?.fermer();

// Choix d'un endroit sur la carte : un bandeau le demande, le premier appui le donne, Annuler ou Échap renonce
// Choix d'un endroit, comme dans les applis de cartes (demande du propriétaire du 25 novembre 2026) : un repère fixe
// au centre, on déplace la carte dessous (ou on touche un endroit pour y aller), puis « Regarder d'ici »
function choisirEndroit(map, relancer) {
  // Bandes et panneaux s'effacent : la carte est toute à soi le temps du choix
  window.dispatchEvent(new CustomEvent('montis:plein-ecran', { detail: { actif: true } }));
  document.body.classList.add('choix-endroit-actif');
  const viseur = document.createElement('div');
  viseur.className = 'choix-endroit-viseur';
  viseur.setAttribute('aria-hidden', 'true');
  viseur.innerHTML = '<img src="/pins/recherche.svg" alt="" width="48" height="48" /><i></i>';
  const carte = document.createElement('div');
  carte.className = 'choix-endroit';
  carte.setAttribute('role', 'dialog');
  carte.innerHTML = `
    <div class="choix-endroit-textes"><strong></strong><small></small></div>
    <div class="choix-endroit-actions">
      <button type="button" class="choix-endroit-annuler"></button>
      <button type="button" class="choix-endroit-valider"></button>
    </div>
  `;
  poser(carte.querySelector('strong'), 'lieu.placer-repere');
  poser(carte.querySelector('small'), 'lieu.placer-aide');
  poser(carte.querySelector('.choix-endroit-annuler'), 'panorama.annuler');
  poser(carte.querySelector('.choix-endroit-valider'), 'lieu.regarder-ici');
  document.body.append(viseur, carte);
  bloquerFiches(true);
  const bouge = () => viseur.classList.add('bouge');
  const pose = () => viseur.classList.remove('bouge');
  const finir = () => {
    viseur.remove();
    carte.remove();
    document.body.classList.remove('choix-endroit-actif');
    bloquerFiches(false);
    map.off('click', surClic);
    map.off('movestart', bouge);
    map.off('moveend', pose);
    window.removeEventListener('keydown', surTouche);
  };
  const surClic = (event) => map.easeTo({ center: event.lngLat, duration: 450 });
  const surTouche = (event) => {
    if (event.key === 'Escape') finir();
    if (event.key === 'Enter') valider();
  };
  const valider = () => {
    const { lng, lat } = map.getCenter();
    finir();
    relancer({ lng, lat });
  };
  carte.querySelector('.choix-endroit-annuler').addEventListener('click', finir);
  carte.querySelector('.choix-endroit-valider').addEventListener('click', valider);
  map.on('click', surClic);
  map.on('movestart', bouge);
  map.on('moveend', pose);
  window.addEventListener('keydown', surTouche);
}

// Position du téléphone, seulement si la permission est déjà donnée (pas de demande surprise au lancement)
async function positionConnue() {
  try {
    const permission = await navigator.permissions?.query({ name: 'geolocation' });
    if (permission?.state !== 'granted') return null;
  } catch {
    return null;
  }
  return lirePosition();
}
const lirePosition = () => new Promise((resolu) => {
  if (!navigator.geolocation) return resolu(null);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolu(coords.accuracy <= 500 ? { lng: coords.longitude, lat: coords.latitude } : null),
    () => resolu(null),
    { enableHighAccuracy: true, maximumAge: 120000, timeout: 8000 },
  );
});

// Petite fenêtre « Où veux-tu regarder ? » : toucher la carte, ou activer sa position
export function demanderLieu(map, relancer) {
  document.querySelector('.demande-lieu')?.remove();
  const fenetre = document.createElement('div');
  fenetre.className = 'demande-lieu';
  fenetre.setAttribute('role', 'dialog');
  fenetre.innerHTML = `
    <strong></strong>
    <p class="demande-lieu-texte"></p>
    <div class="demande-lieu-actions">
      <button type="button" class="demande-lieu-carte"></button>
      <button type="button" class="demande-lieu-position"></button>
    </div>
    <p class="demande-lieu-message" role="status" hidden></p>
    <button type="button" class="demande-lieu-annuler"></button>
  `;
  poser(fenetre.querySelector('strong'), 'lieu.question');
  poser(fenetre.querySelector('.demande-lieu-texte'), 'lieu.texte');
  poser(fenetre.querySelector('.demande-lieu-carte'), 'lieu.toucher-carte');
  poser(fenetre.querySelector('.demande-lieu-position'), 'lieu.activer-position');
  poser(fenetre.querySelector('.demande-lieu-annuler'), 'panorama.annuler');
  const message = fenetre.querySelector('.demande-lieu-message');
  const fermer = () => fenetre.remove();
  fenetre.querySelector('.demande-lieu-annuler').addEventListener('click', fermer);
  fenetre.querySelector('.demande-lieu-carte').addEventListener('click', () => {
    fermer();
    choisirEndroit(map, relancer);
  });
  fenetre.querySelector('.demande-lieu-position').addEventListener('click', async (event) => {
    const bouton = event.currentTarget;
    bouton.disabled = true;
    poser(message, 'lieu.recherche-position');
    message.hidden = false;
    const lieu = await lirePosition();
    bouton.disabled = false;
    if (!lieu) {
      poser(message, 'lieu.position-indisponible');
      return;
    }
    fermer();
    map.jumpTo({ center: lieu });
    relancer(lieu);
  });
  document.body.appendChild(fenetre);
}

// Ouvre Horizon (ou la vue au sol) là où on est, sinon demande où
export async function ouvrirAuBonEndroit(map, relancer) {
  const lieu = await positionConnue();
  if (lieu) relancer(lieu);
  else demanderLieu(map, relancer);
}

export async function ouvrirPanorama(map, options = {}) {
  if (ouvert) return;
  ouvert = creerPanorama(map, options);
  await ouvert.demarrer();
}

// options : boussole (promesse de la permission iOS), point ({ lng, lat } : « Horizon d'ici » de la fiche du point),
// retour (appelé en quittant : la fiche revient), ciel (vue au sol de Soleil et Lune, soleil-lune.js) :
// { trajets() → { cle, debut, fin, soleil(t), lune(t) } (positions vraies ; points toutes les 5 min depuis minuit du lieu),
//   instant(), heure(t),
//   abonner(f) → désabonnement, surLevers({ soleil, lune }) : vrais levers et couchers derrière le relief }
// Avec ciel : pas de noms de sommets, les crêtes et les trajectoires des astres ; pas de caméra
function creerPanorama(map, { boussole: permissionBoussole, point = null, retour = null, ciel = null }) {
  const avant = {
    camera: { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() },
    mode3D: !!etat.mode3D,
    exageration: etat.exageration,
    champ: map.getVerticalFieldOfView(),
    centreAuSol: map.getCenterClampedToGround(),
    marges: map.getPadding(),
  };
  const textesCaches = new Set();
  const inclinaisonMax = ciel ? INCLINAISON_MAX_CIEL : INCLINAISON_MAX;

  // ---------- Interface ----------
  const racine = document.createElement('div');
  racine.id = 'panorama';
  racine.innerHTML = `
    <video class="pano-video" playsinline muted autoplay hidden></video>
    <svg class="pano-traits" aria-hidden="true"><g class="pano-cretes"></g><g class="pano-astres"></g><g class="pano-reperes"></g></svg>
    <div class="pano-etiquettes"></div>
    <header class="pano-entete">
      <button type="button" class="pano-fermer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <div class="pano-titre">
        <strong></strong>
        <button type="button" class="pano-lieu" disabled><span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></svg></button>
      </div>
      <button type="button" class="pano-choisir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.3 6-10.5a6 6 0 1 0-12 0C6 15.7 12 21 12 21Z"/><path d="M12 7.5v6M9 10.5h6"/></svg><span></span></button>
      <div class="pano-modes" role="group" hidden>
        <button type="button" data-mode="3d" aria-pressed="true">3D</button>
        <button type="button" data-mode="camera" aria-pressed="false"></button>
      </div>
    </header>
    <p class="pano-etat" role="status"></p>
    <footer class="pano-pied">
      <div class="pano-fiche" hidden>
        <div><strong></strong><span></span></div>
        <button type="button" class="pano-fiche-fermer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </div>
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
  const calqueCretes = $('.pano-cretes');
  const calqueReperes = $('.pano-reperes');
  const calqueAstres = $('.pano-astres');
  const calqueEtiquettes = $('.pano-etiquettes');
  const fiche = $('.pano-fiche');
  const modes = $('.pano-modes');
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
  poser($('.pano-titre strong'), ciel ? 'ciel.vue-titre' : 'panorama.titre');
  poserAttribut($('.pano-fermer'), 'aria-label', 'panorama.fermer');
  poser($('.pano-choisir span'), 'panorama.changer-endroit');
  poserAttribut($('.pano-modes'), 'aria-label', 'panorama.vue');
  poser($('[data-mode="camera"]'), 'panorama.camera');
  poser($('.pano-boussole span'), 'panorama.boussole');
  poserAttribut(boutonRecalage, 'aria-label', 'panorama.annuler-recalage');
  poserAttribut(lieuTexte, 'title', 'panorama.changer-lieu');
  poserAttribut($('.pano-fiche-fermer'), 'aria-label', 'panorama.fermer-fiche');

  // ---------- État ----------
  let observateur = null; // { lng, lat, sol, altitude, source: 'point' | 'gps' | 'centre' }
  let depart = null; // choisirDepart, avec les lieux possibles
  let chargement = null; // AbortController du chargement en cours (un changement de lieu l'interrompt)
  let sommets = []; // visibles, avec cap, distance, angle (avec et sans courbure)
  let cretes = []; // lignes de crête visibles : [{ points: [{ cap, d, h }], horizon, trace }]
  let relief = null;
  let choisi = null; // sommet touché : sa fiche en bas
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
  // Le lieu, en tête : un appui passe de ta position au centre de la carte, et inversement
  const CLES_LIEU = { gps: 'panorama.ta-position', centre: 'panorama.centre', point: ciel ? 'ciel.au-sol' : 'panorama.point' };
  const majLieu = () => {
    const texte = lieuTexte.querySelector('span');
    lieuTexte.disabled = !depart?.autre;
    if (!observateur) return poser(texte, 'panorama.position');
    poser(texte, CLES_LIEU[observateur.source], { altitude: formatAltitude(observateur.sol) });
  };
  const arretLangue = surPreferences(() => {
    majLieu();
    majRegle();
    if (message.cle) afficherEtat(message.cle, message.variables);
    elements.forEach((e) => remplirEtiquette(e));
  }, ['langue', 'unites', '*']);

  // Hauteur d'où l'on regarde : les yeux, un peu plus haut en 3D (SURELEVATION_3D)
  const yeuxVue = () => observateur.altitude + (mode === '3d' ? SURELEVATION_3D : 0);

  // ---------- Regard ----------
  function regard() {
    if (suivreBoussole && capteur) {
      return {
        cap: (capteur.cap + recalage.cap + 360) % 360,
        inclinaison: borner(capteur.inclinaison + recalage.inclinaison, INCLINAISON_MIN, inclinaisonMax),
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
    // La caméra n'a de sens qu'avec la boussole : sans elle (ordinateur), seul le regard au doigt reste
    modes.hidden = Boolean(ciel);
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
  let appui = null; // un appui sans glissé : touche un nom (sa fiche) ou ailleurs (la ferme)
  function surPointeur(e) {
    if (e.type === 'pointerdown' && e.target.closest('button, header, footer')) return;
    if (e.type === 'pointerdown') {
      try { racine.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
      pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      appui = pointeurs.size === 1 ? { x: e.clientX, y: e.clientY, cible: e.target.closest('.pano-sommet') } : null;
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
      if (e.type === 'pointerup' && appui) {
        const cle = appui.cible?.dataset.cle;
        const astre = !cle && astreTouche(appui.x, appui.y);
        if (astre) regarderVers(astre);
        else choisir(cle ? sommets.find((s) => s.cle === cle) ?? null : null);
      }
      appui = null;
      return;
    }
    const courant = { x: e.clientX, y: e.clientY };
    pointeurs.set(e.pointerId, courant);
    if (appui && Math.hypot(courant.x - appui.x, courant.y - appui.y) > 8) appui = null;
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
      libre = { cap: (libre.cap + dCap + 360) % 360, inclinaison: borner(libre.inclinaison + dIncl, INCLINAISON_MIN, inclinaisonMax) };
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
      // Tout de suite, dans la même image : sinon la caméra reculait d'un coup (jusque dans la montagne derrière)
      if (observateur) placerCamera(regard());
    }
  }

  // Caméra 3D sur les yeux. MapLibre la place d'après centre, zoom et champ : changer le champ (zoom au doigt)
  // ou la taille de l'écran la déplace (de 60° à 30°, elle reculait de 3,5 km). Le champ et la taille font donc
  // partie de la clé. On vise un point en l'air à VISEE m : viser le sol (regard vers le bas) mettait le centre
  // à quelques mètres, au zoom maximal, et la caméra partait de travers.
  function placerCamera(r) {
    const canvas = map.getCanvas();
    const cle = [
      r.cap.toFixed(2), r.inclinaison.toFixed(2), yeuxVue().toFixed(1),
      map.getVerticalFieldOfView().toFixed(2), canvas.clientWidth, canvas.clientHeight,
    ].join('/');
    if (cle === derniereCamera) return;
    derniereCamera = cle;
    const i = (r.inclinaison * Math.PI) / 180;
    const cible = pointA(observateur, r.cap, VISEE * Math.cos(i));
    map.jumpTo(map.calculateCameraOptionsFromTo(
      [observateur.lng, observateur.lat], yeuxVue(),
      [cible.lng, cible.lat], yeuxVue() + VISEE * Math.sin(i)
    ));
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

  // ---------- Étiquettes : noms inclinés à 45°, au-dessus d'une ligne commune, trait jusqu'au sommet ----------
  function remplirEtiquette(e) {
    e.el.querySelector('.pano-nom').textContent = e.sommet.nom;
    e.el.querySelector('.pano-alt').textContent = formatAltitude(e.sommet.altitude);
  }
  function etiquette(sommet) {
    let e = elements.get(sommet.cle);
    if (e) return e;
    const el = document.createElement('div');
    el.className = 'pano-sommet';
    el.dataset.cle = sommet.cle;
    el.innerHTML = '<span class="pano-nom"></span><span class="pano-alt"></span>';
    calqueEtiquettes.appendChild(el);
    const trait = document.createElementNS(SVG, 'line');
    trait.setAttribute('class', 'pano-trait');
    const point = document.createElementNS(SVG, 'circle');
    point.setAttribute('class', 'pano-point');
    point.setAttribute('r', '2.5');
    calqueReperes.append(trait, point);
    e = { el, trait, point, sommet };
    remplirEtiquette(e);
    elements.set(sommet.cle, e);
    return e;
  }

  function choisir(sommet) {
    choisi = sommet;
    fiche.hidden = !sommet;
    elements.forEach((e) => e.el.classList.toggle('choisi', e.sommet === sommet));
    if (!sommet) return;
    fiche.querySelector('strong').textContent = sommet.nom;
    fiche.querySelector('span').textContent = t('panorama.fiche', {
      altitude: formatAltitude(sommet.altitude),
      distance: formatDistance(sommet.distance),
      cap: `${t(`cardinal.${pointCardinal(sommet.cap)}`)} ${Math.round(sommet.cap) % 360}°`,
    });
  }

  // Les lignes de crête, en chemins SVG coupés hors du champ ; plus pâles au loin
  function dessinerCretes(vue, courbure) {
    const demi = champHorizontal(vue.champ, vue.largeur, vue.hauteur) / 2 + 2;
    for (const ligne of cretes) {
      let d = '';
      let ouvert = false;
      for (const p of ligne.points) {
        const q = Math.abs(ecartCap(p.cap, vue.cap)) <= demi
          ? projeter(p.cap, angleApparent(p.h - yeuxVue(), p.d, { courbure }), vue)
          : null;
        if (!q) {
          ouvert = false;
          continue;
        }
        d += `${ouvert ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
        ouvert = true;
      }
      ligne.trace.setAttribute('d', d);
    }
  }

  function dessiner() {
    image = requestAnimationFrame(dessiner);
    if (suivreBoussole && performance.now() - derniereMesure > ABSENCE_BOUSSOLE * 4) basculerBoussole(false);
    const r = regard();
    const largeur = racine.clientWidth;
    const hauteur = racine.clientHeight;

    if (ciel) majMarges(largeur, hauteur);
    if (mode === '3d' && observateur) {
      // Les yeux restent au-dessus du relief affiché : tant que les tuiles proches arrivent, il peut être plus haut que
      // celui lu au départ, et la caméra, dessous, voyait les bords des tuiles comme des murs gris.
      // Rapprochés en douceur : un saut de hauteur ferait sauter toute la vue
      if (++imagesDessinees % 5 === 0) {
        const sol = map.queryTerrainElevation([observateur.lng, observateur.lat]);
        const yeux = Math.max(observateur.sol, Number.isFinite(sol) ? sol : -Infinity) + HAUTEUR_YEUX;
        const ecart = yeux - observateur.altitude;
        if (Math.abs(ecart) > 0.2) {
          observateur.altitude += Math.abs(ecart) < 1 ? ecart : ecart * 0.3;
          derniereCamera = '';
        }
      }
      placerCamera(r);
    }
    const vue = { cap: r.cap, inclinaison: r.inclinaison, champ: champActuel(), largeur, hauteur, centreY: hauteur / 2 + (marges.haut - marges.bas) / 2 };
    const courbure = mode === 'camera'; // la 3D de MapLibre est plate
    traits.setAttribute('viewBox', `0 0 ${largeur} ${hauteur}`);

    // Règle des caps, en bas : 4 px par degré
    const pas = 4;
    bande.style.transform = `translateX(${-(r.cap * pas) - 360 * pas + largeur / 2}px)`;
    capTexte.textContent = `${t(`cardinal.${pointCardinal(r.cap)}`)} ${Math.round(r.cap) % 360}°`;

    // Vue au sol de Soleil et Lune : crêtes calculées (vrai lever) mais pas dessinées (demande du propriétaire du
    // 24 novembre 2026)
    if (observateur && cretes.length && !ciel) dessinerCretes(vue, courbure);
    if (ciel && observateur) dessinerAstres(vue);

    // Sommets à l'écran : les plus importants gardent leur place, les voisins trop proches s'effacent
    const candidats = [];
    for (const s of sommets) {
      const p = projeter(s.cap, courbure ? s.angle : (Math.atan2(s.altitude - yeuxVue(), s.distance) * 180) / Math.PI, vue);
      if (!p || p.x < 4 || p.x > largeur - 4 || p.y < 0 || p.y > hauteur) continue;
      candidats.push({ s, x: p.x, y: p.y, importance: s === choisi ? Infinity : s.importance });
    }
    const gardes = choisirEtiquettes(candidats, { ecart: ECART_NOMS });
    // Ligne commune des noms : au-dessus du plus haut sommet, avec la place d'écrire en biais au-dessus
    const haut = $('.pano-entete').getBoundingClientRect().bottom;
    const base = Math.min(hauteur * 0.6, Math.max(haut + HAUTEUR_NOMS, Math.min(...gardes.map((c) => c.y)) - 26));
    const montrees = new Set();
    for (const c of gardes) {
      const e = etiquette(c.s);
      const y = Math.min(base, c.y - 14);
      montrees.add(e);
      e.el.style.transform = `translate(${c.x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-45deg)`;
      e.el.hidden = false;
      e.trait.setAttribute('x1', c.x.toFixed(1));
      e.trait.setAttribute('x2', c.x.toFixed(1));
      e.trait.setAttribute('y1', y.toFixed(1));
      e.trait.setAttribute('y2', (c.y - 3).toFixed(1));
      e.point.setAttribute('cx', c.x.toFixed(1));
      e.point.setAttribute('cy', c.y.toFixed(1));
      e.trait.style.display = c.y - 3 > y ? '' : 'none';
      e.point.style.display = '';
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
  // Par tranches de 12 ms, puis la main au navigateur : pas d'image par tranche (requestAnimationFrame), sinon un
  // affichage lent (téléphone modeste, double résolution) ralentissait d'autant le calcul (crêtes en plus d'une minute)
  const TRANCHE = 12;
  let debutTranche = performance.now();
  const pause = async () => {
    if (performance.now() - debutTranche < TRANCHE) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    debutTranche = performance.now();
  };

  async function calculerSommets(liste, signal) {
    const visibles = [];
    for (let i = 0; i < liste.length; i += 1) {
      const s = liste[i];
      if (!Number.isFinite(s.altitude)) continue;
      const v = estVisible(observateur, s, relief);
      if (v.visible && v.distance > 50) {
        const r = { ...s, ...v, cle: `${s.nom}/${s.lng.toFixed(4)}/${s.lat.toFixed(4)}` };
        r.importance = importanceSommet(r);
        visibles.push(r);
      }
      await pause();
      if (signal.aborted) return;
      if (i % 20 === 19) sommets = visibles.slice();
    }
    sommets = visibles;
  }

  // Lignes de crête : un rayon tous les PAS_CRETES degrés, puis les crêtes voisines reliées
  async function calculerCretes(signal) {
    const colonnes = [];
    for (let cap = 0; cap < 360; cap += PAS_CRETES) {
      const trouvees = cretesCap(observateur, cap, relief, { distanceMax: DISTANCE_MAX })
        .filter((c) => c.horizon || c.d >= 300); // l'horizon toujours : il donne le vrai lever des astres
      colonnes.push({ cap, cretes: trouvees });
      await pause();
      if (signal.aborted) return;
    }
    // Le nord fermé : la première colonne revient à la fin
    colonnes.push({ ...colonnes[0], cap: 360 });
    calqueCretes.replaceChildren();
    cretes = relierCretes(colonnes).map((ligne) => {
      const trace = document.createElementNS(SVG, 'path');
      const moyenne = ligne.points.reduce((t, p) => t + p.d, 0) / ligne.points.length;
      trace.setAttribute('class', `pano-crete ${ligne.horizon ? 'horizon' : moyenne < 5000 ? 'proche' : moyenne < 25000 ? 'moyenne' : 'loin'}`);
      calqueCretes.appendChild(trace);
      return { ...ligne, trace };
    });
  }

  // Vue du ciel sur téléphone : le panneau de la frise couvre le bas de l'écran. La perspective se centre sur la bande
  // visible au-dessus (marges de MapLibre), sinon l'horizon et les astres bas passaient dessous
  let marges = { haut: 0, bas: 0 };
  function majMarges(largeur, hauteur) {
    const haut = Math.round($('.pano-entete').getBoundingClientRect().bottom);
    let bas = Math.round(hauteur - $('.pano-pied').getBoundingClientRect().top);
    const p = document.getElementById('outil-rapide-panneau-ciel');
    const boite = p && !p.hidden ? p.getBoundingClientRect() : null;
    // Un panneau sur toute la largeur (téléphone) ; sur ordinateur, il est sur le côté
    if (boite?.height && boite.width > largeur * 0.6) bas = Math.max(bas, Math.round(hauteur - boite.top));
    if (haut === marges.haut && bas === marges.bas) return;
    marges = { haut, bas };
    map.setPadding({ top: haut, bottom: bas, left: 0, right: 0 });
    derniereCamera = '';
  }

  // ---------- Soleil et Lune (vue du ciel) ----------
  // Trajectoires du jour de la frise : déjà parcourue en trait plein, à venir en pointillés, cachées derrière le
  // relief ; une marque à chaque heure ; vrai lever et vrai coucher (passage de la crête) marqués
  let desabonnerCiel = null;
  let trajets = null; // { cle, soleil, lune }
  let horizonDe = null; // cap → angle du relief, d'après la ligne d'horizon
  let levers = { soleil: null, lune: null };
  const ASTRES = ['soleil', 'lune'];
  const traces = {};
  for (const astre of ASTRES) {
    const groupe = document.createElementNS(SVG, 'g');
    groupe.setAttribute('class', `pano-astre pano-astre-${astre}`);
    groupe.innerHTML = '<path class="passe"/><path class="futur"/><g class="heures"></g><g class="reels"></g>';
    calqueAstres.appendChild(groupe);
    traces[astre] = {
      passe: groupe.querySelector('.passe'),
      futur: groupe.querySelector('.futur'),
      heures: groupe.querySelector('.heures'),
      reels: groupe.querySelector('.reels'),
    };
  }

  function majTrajets() {
    const d = ciel.trajets();
    if (trajets && d.cle === trajets.cle) return;
    trajets = { cle: d.cle, soleil: trajetAstre(d.soleil, d.debut, d.fin), lune: trajetAstre(d.lune, d.debut, d.fin) };
    majLevers();
  }

  function majLevers() {
    const ligne = cretes.find((l) => l.horizon);
    if (!ligne || !observateur || !trajets) return;
    horizonDe = profilHorizon(ligne.points, observateur);
    levers = Object.fromEntries(ASTRES.map((a) => [a, leverCoucherReels(trajets[a], horizonDe)]));
    ciel.surLevers(levers);
  }

  // Position d'un astre à l'instant t, d'après sa trajectoire (points toutes les 5 min)
  function astreA(trajet, t) {
    const i = trajet.findIndex((p) => p.t >= t);
    if (i <= 0) return trajet[Math.max(0, i)];
    const a = trajet[i - 1];
    const b = trajet[i];
    const f = (t - a.t) / (b.t - a.t);
    return { t, azimut: a.azimut + ecartCap(b.azimut, a.azimut) * f, hauteur: a.hauteur + (b.hauteur - a.hauteur) * f };
  }

  // En arrivant : tourné vers le soleil, ou vers la Lune la nuit, assez haut pour voir sa course et l'horizon
  function regarderAstre() {
    const t = ciel.instant();
    majTrajets();
    const choix = ASTRES.map((a) => astreA(trajets[a], t)).find((p) => p && p.hauteur > 0) ?? astreA(trajets.soleil, t);
    libre = { cap: choix.azimut, inclinaison: borner(choix.hauteur * 0.6, 0, 30) };
  }

  let vueAstres = null;
  function regarderVers(astre) {
    if (!trajets) return;
    const p = astreA(trajets[astre], ciel.instant());
    if (!p) return;
    if (suivreBoussole) basculerBoussole(false);
    libre = { cap: p.azimut, inclinaison: borner(p.hauteur, INCLINAISON_MIN, inclinaisonMax) };
  }
  // Astre sous le doigt : à moins de 44 px de sa position à l'écran
  function astreTouche(x, y) {
    if (!ciel || !trajets) return null;
    for (const [astre, selecteur] of [['soleil', '.soleil-ciel'], ['lune', '.lune-ciel']]) {
      const element = document.querySelector(`${selecteur}:not([hidden])`);
      if (!element) continue;
      const r = element.getBoundingClientRect();
      if (Math.hypot(r.left - x, r.top - y) < 48) return astre;
    }
    if (!vueAstres) return null;
    const boite = racine.getBoundingClientRect();
    for (const astre of ASTRES) {
      const p = astreA(trajets[astre], ciel.instant());
      const q = p && projeter(p.azimut, p.hauteur, vueAstres);
      if (q && Math.hypot(q.x - (x - boite.left), q.y - (y - boite.top)) < 44) return astre;
    }
    return null;
  }

  function dessinerAstres(vue) {
    if (!trajets) return;
    const t = ciel.instant();
    vueAstres = vue;
    const marge = Math.max(vue.largeur, vue.hauteur);
    const dansEcran = (q) => q && q.x > -marge && q.x < vue.largeur + marge && q.y > -marge && q.y < vue.hauteur + marge;
    const place = (p) => {
      const q = projeter(p.azimut, p.hauteur, vue);
      return dansEcran(q) ? q : null;
    };
    const visible = (p) => p.hauteur > (horizonDe ? horizonDe(p.azimut) : 0) && Boolean(place(p));
    for (const astre of ASTRES) {
      const trajet = trajets[astre];
      const tr = traces[astre];
      let passe = '';
      let futur = '';
      let suite = { passe: false, futur: false };
      let heures = '';
      trajet.forEach((p, i) => {
        const q = visible(p) ? place(p) : null;
        const cote = p.t <= t ? 'passe' : 'futur';
        const autre = cote === 'passe' ? 'futur' : 'passe';
        if (!q) {
          suite = { passe: false, futur: false };
          return;
        }
        const point = `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
        if (cote === 'passe') passe += `${suite.passe ? 'L' : 'M'}${point}`;
        else futur += `${suite.futur ? 'L' : 'M'}${point}`;
        suite[cote] = true;
        suite[autre] = false;
        // Une marque par heure (les points partent de minuit, toutes les 5 min)
        if (i % 12 === 0 && i > 0 && i < trajet.length - 1) {
          heures += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="2.2"/><text x="${(q.x + 6).toFixed(1)}" y="${(q.y - 6).toFixed(1)}">${ciel.heure(p.t).replace(/h00$/, 'h')}</text>`;
        }
      });
      // Le trait plein rejoint les pointillés à l'instant de la frise
      const maintenant = astreA(trajet, t);
      if (maintenant && visible(maintenant)) {
        const q = place(maintenant);
        if (q && passe) passe += `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      }
      tr.passe.setAttribute('d', passe);
      tr.futur.setAttribute('d', futur);
      tr.heures.innerHTML = heures;
      // Vrai lever et vrai coucher, sur la crête
      let reels = '';
      for (const cle of ['lever', 'coucher']) {
        const instantReel = levers[astre]?.[cle];
        if (!instantReel) continue;
        const p = astreA(trajet, instantReel);
        if (!p) continue;
        const q = place(p);
        if (!q) continue;
        reels += `<circle class="reel" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="4.5"/><text class="reel" x="${(q.x + 8).toFixed(1)}" y="${(q.y + 14).toFixed(1)}">${ciel.heure(instantReel)}</text>`;
      }
      tr.reels.innerHTML = reels;
    }
  }

  // ---------- Position ----------
  // Position du navigateur, avec sa précision et son âge (choisirDepart écarte les vieilles et les approximatives)
  function position() {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => resolve({ lng: coords.longitude, lat: coords.latitude, precision: coords.accuracy, instant: timestamp }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });
  }

  // Charge tout depuis un lieu : relief, sommets visibles, crêtes. Un nouveau lieu interrompt le précédent.
  async function charger(source) {
    chargement?.abort();
    const controle = new AbortController();
    chargement = controle;
    const { signal } = controle;
    const lieu = depart.lieux[source];
    sommets = [];
    cretes = [];
    calqueCretes.replaceChildren();
    choisir(null);
    elements.forEach((e) => {
      e.el.remove();
      e.trait.remove();
      e.point.remove();
    });
    elements.clear();
    afficherEtat(ciel ? 'panorama.chargement-relief' : 'panorama.chargement');
    let altitude;
    try {
      altitude = await altitudeRelief(lieu.lng, lieu.lat, 13);
    } catch (err) {
      if (signal.aborted) return;
      console.warn('Relief indisponible :', err);
      afficherEtat(ciel ? 'panorama.erreur-relief' : 'panorama.erreur', { message: messageErreur(err) });
      return;
    }
    if (signal.aborted) return;
    observateur = { lng: lieu.lng, lat: lieu.lat, sol: altitude, altitude: altitude + HAUTEUR_YEUX, source };
    derniereCamera = '';
    majLieu();
    // Voile tant que le relief proche n'est pas chargé : avant, les bords des tuiles se voient comme des murs gris
    racine.classList.add('pano-attente');
    const leverVoile = () => racine.classList.remove('pano-attente');
    requestAnimationFrame(() => requestAnimationFrame(() => map.once('idle', leverVoile)));
    setTimeout(leverVoile, 10000);
    try {
      const modele = map.getSource('osm-vecteur')?.tiles?.[0];
      const [donnees, lecteurRelief] = await Promise.all([
        ciel ? { sommets: [], incomplet: false } : chargerSommets(observateur, modele, signal),
        chargerRelief(observateur),
      ]);
      if (signal.aborted) return;
      relief = lecteurRelief;
      await calculerSommets(donnees.sommets, signal);
      if (signal.aborted) return;
      const finCretes = calculerCretes(signal);
      if (ciel) {
        afficherEtat(capteur ? null : 'panorama.sans-boussole', null, 6000);
        await finCretes;
        if (!signal.aborted) majLevers();
        return;
      }
      if (!sommets.length) afficherEtat('panorama.aucun');
      else if (donnees.incomplet) afficherEtat('panorama.incomplet', null, 6000);
      else if (source === 'centre' && depart.autre === 'gps') afficherEtat('panorama.depuis-centre', null, 7000);
      else if (source === 'centre') afficherEtat('panorama.sans-gps', null, 6000);
      else if (!capteur) afficherEtat('panorama.sans-boussole', null, 6000);
      else afficherEtat(null);
    } catch (err) {
      if (err?.name === 'AbortError' || signal.aborted) return;
      console.warn(ciel ? 'Relief indisponible :' : 'Sommets indisponibles :', err);
      afficherEtat(ciel ? 'panorama.erreur-relief' : 'panorama.erreur', { message: messageErreur(err) });
    }
  }

  // Ta position ⇄ centre de la carte
  function changerLieu() {
    if (!depart?.autre) return;
    const actuelle = observateur?.source ?? depart.source;
    charger(actuelle === depart.autre ? depart.source : depart.autre);
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
    if (ciel) {
      document.body.classList.add('panorama-ciel');
      desabonnerCiel = ciel.abonner(() => majTrajets());
      majTrajets();
    }
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
    $('.pano-choisir').addEventListener('click', () => {
      // Vue au sol de Soleil et Lune : c'est elle qui se relance, au point touché ; sinon Horizon lui-même
      const relancer = ciel
        ? (lieu) => window.dispatchEvent(new CustomEvent('montis:ciel-au-sol', { detail: lieu }))
        : (lieu) => ouvrirPanorama(map, { point: lieu, boussole: permissionBoussole, retour });
      fermer({ sansRetour: !ciel });
      demanderLieu(map, relancer);
    });
    racine.querySelectorAll('.pano-modes button').forEach((b) => b.addEventListener('click', () => changerMode(b.dataset.mode)));
    boutonBoussole.addEventListener('click', () => basculerBoussole(!suivreBoussole));
    $('.pano-fiche-fermer').addEventListener('click', () => choisir(null));
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
    lieuTexte.addEventListener('click', changerLieu);

    // Carte : 3D, relief à sa vraie hauteur, caméra libre au-dessus du sol, textes de la carte cachés
    const centre = map.getCenter();
    if (!etat.mode3D) etat.basculerMode();
    etat.exageration = 1;
    etat.majTerrain?.();
    map.setMaxPitch(90 + inclinaisonMax);
    map.setCenterClampedToGround(false);
    // Perspective centrée sur l'écran (une visite ou un panneau a pu poser une marge) ; la vue du ciel pose la sienne
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    const champ =Math.min(CHAMP_3D_MAX, (2 * Math.atan(Math.tan((CHAMP_3D_HORIZONTAL / 2) * Math.PI / 180) * racine.clientHeight / racine.clientWidth)) * 180 / Math.PI);
    champ3d = Math.max(avant.champ, champ);
    map.setVerticalFieldOfView(champ3d);
    cacherTextes();
    map.on('styledata', surStyle);
    racine.classList.add('pano-attente');
    image = requestAnimationFrame(dessiner);

    // D'où regarder : le point de la fiche, sinon la position si la carte montre ses alentours, sinon le centre
    if (!point) afficherEtat('panorama.recherche-position');
    const gps = point ? null : await position();
    if (!ouvert) return;
    const lieux = { centre: { lng: centre.lng, lat: centre.lat }, gps, point };
    depart = { ...choisirDepart(lieux), lieux };
    if (ciel) regarderAstre();
    charger(depart.source);
  }

  function surTouche(e) {
    if (e.key === 'Escape') fermer();
  }

  function fermer(options) {
    if (ouvert === null) return;
    ouvert = null;
    chargement?.abort();
    cancelAnimationFrame(image);
    cancelAnimationFrame(attenteStyle);
    arretLangue?.();
    desabonnerCiel?.();
    window.removeEventListener(evenementOrientation, surOrientation);
    window.removeEventListener('keydown', surTouche);
    arreterFlux();
    map.off('styledata', surStyle);
    textesCaches.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'visible'));
    textesCaches.clear();

    map.setVerticalFieldOfView(avant.champ);
    map.setCenterClampedToGround(avant.centreAuSol);
    map.setPadding(avant.marges);
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
    document.body.classList.remove('panorama-actif', 'panorama-camera', 'panorama-ciel');
    racine.remove();
    if (!options?.sansRetour) retour?.();
  }

  return { demarrer, fermer };
}
