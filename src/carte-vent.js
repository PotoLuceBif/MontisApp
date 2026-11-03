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
  ventAHauteur,
} from './vent-calcul.js';
import { creerCoucheVent, longueurFleche } from './vent-couche-carte.js';
import { creerVolume3D } from './vent-volume-3d.js';
import { creerPanneauCarte } from './panneau-carte.js';
import { MINI_VENT, creerPastilleCouche, montrerCarte } from './couches-actives.js';
import { dateHorsLigne, estHorsLigne, texteDonneesDu } from './hors-ligne.js';
import { PALETTE_CARTE, cadranVent, couleurInterface, heureCourte, libellesPaliersVent, palierVent, paletteInterface, texteProvenance } from './vent-cadran.js';
import { formatAltitude, formatDistance, formatVent, imperial, libelleVent, nombre, valeurVent } from './unites.js';
import { surPreferences } from './preferences.js';
import { nomJour, t, ta, ti, tt, poser } from './i18n.js';

const API_VENT = 'https://api.open-meteo.com/v1/forecast';
const SOURCE_VENT = 'vent-previsions';
const COUCHE_VENT = 'vent-previsions-fleches';
const DELAI_CHARGEMENT = 15000;
const MAX_POINTS = 48;
const MARGE_ZONE = 0.25; // part de l'écran chargée en plus de chaque côté
const PAS_MIN_GRILLE = 1 / 64; // environ 1,7 km, de l'ordre de la maille du modèle
const DUREE_CACHE = 15 * 60 * 1000;
const DUREE_VALIDITE = 60 * 60 * 1000; // au-delà, on propose de recharger les prévisions
const DELAI_CURSEUR = 120; // ms entre deux mises à jour pendant que le curseur glisse
const ECHEANCE_MAX = 48;
const MESSAGE_LIMITE = 'vent.limite';
const PLAFONDS_VOLUME = [500, 1000, 2000];
const ETENDUES_VOLUME = [5000, 10000, 20000, 40000]; // demi-côté du bloc, en mètres
const NOEUDS_VOLUME = 6; // par côté : le vent est interpolé entre ces points
const MAILLE_RELIEF = 36;
const FLECHES_PAR_COTE = 5;
const FLECHES_PAR_COTE_COUCHE_SEULE = 10;
const METRES_PAR_DEGRE = 111320;
const LIBELLE_HAUTEUR = (hauteur) => formatAltitude(hauteur);
const LIBELLE_PLAFOND = (plafond) => formatAltitude(plafond, { pas: imperial() ? 100 : 1 });

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

// Pour la pastille : l'heure seule aujourd'hui, précédée du jour court sinon (« sam. 18h00 »)
function heurePourPastille(date) {
  const heure = heureCourte(date);
  return date.toDateString() === new Date().toDateString() ? heure : `${nomJour(date, 'short')} ${heure}`;
}

function formaterHeure(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const heure = heureCourte(date);
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const auj = new Date();
  const ecart = Math.round((jour - new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 86400000);
  if (ecart === 0) return t('vent.aujourdhui-heure', { heure });
  if (ecart === 1) return t('vent.demain-heure', { heure });
  return t('vent.jour-heure', { jour: nomJour(date), heure });
}

// Longueur fixe : dans la légende, seule la couleur distingue les paliers
function iconeLegende(palier) {
  const longueur = 22;
  const fleche = `<path d="M2 7 H${longueur - 8}"/><path class="pointe" d="M${longueur - 2} 7 L${longueur - 10} 2.5 V11.5 Z"/>`;
  return `<svg data-palier="${palier}" width="${longueur}" height="14" viewBox="0 0 ${longueur} 14" aria-hidden="true"><g class="cerne">${fleche}</g><g class="teinte">${fleche}</g></svg>`;
}

export function creerCarteVent(map) {
  const panneauCarte = creerPanneauCarte({
    cle: 'vent-panneau-reduit',
    libelle: 'panneau.vent',
    classe: 'bf-outil bf-meteo', // la météo se superpose à une visite sans la fermer
    onFermer: () => fermeture?.(),
  });
  poser(panneauCarte.titre, 'vent.titre');
  // Dans le menu, seulement de quoi comprendre où sont passés les réglages
  const panneauMenu = document.createElement('p');
  panneauMenu.className = 'note';
  panneauMenu.dataset.i18n = 'vent.menu-note';
  poser(panneauMenu, 'vent.menu-note');
  const panneau = document.createElement('div');
  panneau.className = 'vent-carte';
  panneauCarte.corps.append(panneau);
  panneau.innerHTML = `
    <div class="vent-vues" role="tablist" ${ta('aria-label', 'vent.vues')}>
      <button type="button" role="tab" id="vent-vue-carte-onglet" aria-selected="true" aria-controls="vent-vue-carte" ${ti('vent.carte')}>${t('vent.carte')}</button>
      <button type="button" role="tab" id="vent-vue-volume-onglet" aria-selected="false" aria-controls="vent-vue-volume" tabindex="-1" ${ti('vent.volume')}>${t('vent.volume')}</button>
    </div>
    <div class="vent-temps">
      <div class="vent-temps-heure"><strong data-temps-heure>—</strong><span data-temps-ecart></span></div>
      <input class="vent-temps-curseur" type="range" min="0" max="${ECHEANCE_MAX}" step="1" value="0" ${ta('aria-label', 'vent.echeance')}>
      <div class="vent-temps-reperes" aria-hidden="true">${tt('vent.maintenant')}<span>+12 h</span><span>+24 h</span><span>+36 h</span><span>+48 h</span></div>
    </div>
    <div class="vent-zone-alerte" role="status" hidden>
      <p data-zone-message></p>
      <button type="button" class="vent-zone-actualiser" ${ti('vent.actualiser')}>${t('vent.actualiser')}</button>
    </div>
    <section class="vent-vue-contenu" id="vent-vue-carte" role="tabpanel" aria-labelledby="vent-vue-carte-onglet">
      <div class="vent-resume" ${ta('aria-label', 'vent.resume')}>
        <div class="vent-resume-direction">
          ${cadranVent(null, 0, 'vent-cadran-grand')}
          <small data-vent-provenance>—</small>
        </div>
        <div class="vent-resume-valeur">${tt('vent.moyen')}<strong data-vent-moyen>—</strong></div>
        <div class="vent-resume-valeur">${tt('vent.rafales-max')}<strong data-vent-rafales>—</strong></div>
      </div>
      <label class="vent-carte-niveau-ligne">${tt('vent.hauteur-sol')}<select class="vent-carte-niveau">
        ${HAUTEURS_VENT.map((hauteur) => `<option value="${hauteur}">${LIBELLE_HAUTEUR(hauteur)}</option>`).join('')}
      </select></label>
      <div class="vent-carte-legende" ${ta('aria-label', 'vent.intensite')}>
        ${libellesPaliersVent().map((libelle, index) => `<span>${iconeLegende(index)} <b data-palier-libelle>${libelle}</b></span>`).join('')}<span data-unite-vent>${libelleVent()}</span>
      </div>
      <p class="vent-carte-statut" role="status" aria-live="polite"></p>
    </section>
    <section class="vent-vue-contenu" id="vent-vue-volume" role="tabpanel" aria-labelledby="vent-vue-volume-onglet" hidden>
      <section class="vent-volume" aria-labelledby="vent-volume-titre">
        <div class="vent-volume-entete">
          <button type="button" class="vent-volume-retour" ${ta('aria-label', 'vent.quitter-plein')} hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
          <h4 id="vent-volume-titre" ${ti('vent.au-dessus-relief')}>${t('vent.au-dessus-relief')}</h4>
          <span class="vent-volume-badge" data-volume-zone>3D</span>
        </div>
        <div class="vent-volume-reglages">
          <fieldset class="vent-volume-plafonds">
            <legend ${ti('vent.jusqua')}>${t('vent.jusqua')}</legend>
            ${PLAFONDS_VOLUME.map((plafond) => `<label><input type="radio" name="vent-volume-plafond" value="${plafond}"${plafond === 2000 ? ' checked' : ''}><span data-plafond-libelle>${LIBELLE_PLAFOND(plafond)}</span></label>`).join('')}
          </fieldset>
          <label class="vent-volume-couche">${tt('vent.couches')}<select ${ta('aria-label', 'vent.couche-aria')}>
            <option value="toutes" ${ti('vent.toutes')}>${t('vent.toutes')}</option>
            ${HAUTEURS_VENT.map((hauteur) => `<option value="${hauteur}">${LIBELLE_HAUTEUR(hauteur)}</option>`).join('')}
          </select></label>
        </div>
        <div class="vent-volume-scene">
          <canvas class="vent-volume-canvas" role="img" tabindex="0" ${ta('aria-label', 'vent.volume-aria')}></canvas>
          <div class="vent-volume-boutons">
            <button type="button" class="vent-volume-recentrer" ${ta('aria-label', 'vent.recentrer-vue')} ${ta('title', 'vent.recentrer-vue')}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>
            <button type="button" class="vent-volume-agrandir" ${ta('aria-label', 'vent.plein-ecran-aria')} ${ta('title', 'vent.plein-ecran')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
          </div>
        </div>
        <p class="vent-volume-detail" data-volume-detail>${t('vent.aide-volume')}</p>
        <div class="vent-volume-legende" ${ta('aria-label', 'vent.intensite')}>
          ${libellesPaliersVent().map((libelle, index) => `<span><i data-volume-vitesse="${index}"></i> <b data-palier-libelle>${libelle}</b></span>`).join('')}<span data-unite-vent>${libelleVent()}</span>
        </div>
        <p class="vent-volume-statut" role="status" aria-live="polite"></p>
      </section>
    </section>
    <p class="vent-source" data-i18n-html="vent.source">${t('vent.source')}</p>
    <details class="rando-outils vent-apropos">
      <summary ${ti('vent.lire')}>${t('vent.lire')}</summary>
      <div class="rando-outils-contenu">
        <p class="note" ${ti('vent.lire-1')}>${t('vent.lire-1')}</p>
        <p class="note" ${ti('vent.lire-2')}>${t('vent.lire-2')}</p>
      </div>
    </details>
  `;

  const selecteurNiveau = panneau.querySelector('.vent-carte-niveau');
  const curseurTemps = panneau.querySelector('.vent-temps-curseur');
  const blocTemps = panneau.querySelector('.vent-temps');
  const heureTemps = panneau.querySelector('[data-temps-heure]');
  const ecartTemps = panneau.querySelector('[data-temps-ecart]');
  const statut = panneau.querySelector('.vent-carte-statut');
  const resumeMoyen = panneau.querySelector('[data-vent-moyen]');
  const resumeRafales = panneau.querySelector('[data-vent-rafales]');
  const resumeProvenance = panneau.querySelector('[data-vent-provenance]');
  const cadranResume = panneau.querySelector('.vent-resume .vent-cadran');
  const ongletsVue = [...panneau.querySelectorAll('.vent-vues [role="tab"]')];
  const contenusVue = [...panneau.querySelectorAll('.vent-vue-contenu')];
  const blocVolume = panneau.querySelector('.vent-volume');
  const canvasVolume = panneau.querySelector('.vent-volume-canvas');
  const statutVolume = panneau.querySelector('.vent-volume-statut');
  const zoneVolume = panneau.querySelector('[data-volume-zone]');
  const detailVolume = panneau.querySelector('[data-volume-detail]');
  const plafondsVolume = [...panneau.querySelectorAll('input[name="vent-volume-plafond"]')];
  const selecteurCouche = panneau.querySelector('.vent-volume-couche select');
  const boutonAgrandir = panneau.querySelector('.vent-volume-agrandir');
  const boutonRetour = panneau.querySelector('.vent-volume-retour');
  const alerteZone = panneau.querySelector('.vent-zone-alerte');
  const messageZone = panneau.querySelector('[data-zone-message]');
  const actualiserZone = panneau.querySelector('.vent-zone-actualiser');
  const reglagesVolume = panneau.querySelector('.vent-volume-reglages');
  const aideVolume = () => t('vent.aide-volume');
  const cache = new Map();
  let actif = false;
  let controleur = null;
  let controleurProfil = null;
  let heureCourante = '';
  let erreurCarte = false;
  let erreurVolume = false;
  let minuteurCurseur = null;
  let curseurEnAttente = false;
  let minuteurValidite = null;
  let evenementsCoucheAjoutes = false;
  let fermeture = null;
  let heurePastille = '';

  // Pastille sur la carte : sur téléphone, le panneau du vent est caché quand Météo ou Carte est ouvert
  const pastille = creerPastilleCouche({
    ordre: 4,
    nom: () => {
      if (vueActive !== 'volume' && statut.classList.contains('erreur')) return t('vent.court-erreur');
      return heurePastille ? t('vent.court-heure', { heure: heurePastille }) : t('vent.court');
    },
    legende: () => MINI_VENT,
    onOuvrir: () => {
      montrerCarte();
      panneauCarte.agrandir();
    },
    onRetirer: () => fermeture?.(),
  });
  let dateEnregistree = null; // date des données si elles viennent de la dernière consultation
  let donneesVentCourantes = null;
  let resumeVentCourant = [];
  let moyenneCourante = null;
  let flecheChoisie = null;
  let zoneVolumeCapturee = null;
  let zoneCarteCapturee = null;
  let vueActive = lire('vent-vue', 'carte') === 'volume' ? 'volume' : 'carte';
  let emplacementVolume = null;
  let emplacementTemps = null;
  let emplacementAlerte = null;
  let plafondVolume = Number(lire('vent-volume-plafond', 2000));
  if (!PLAFONDS_VOLUME.includes(plafondVolume)) plafondVolume = 2000;
  plafondsVolume.forEach((radio) => {
    radio.checked = Number(radio.value) === plafondVolume;
  });
  let rotationInitiale = Number(lire('vent-volume-rotation', 28));
  if (!Number.isFinite(rotationInitiale)) rotationInitiale = 28;

  selecteurNiveau.value = String(lire('vent-niveau', 10));
  if (!HAUTEURS_VENT.includes(Number(selecteurNiveau.value))) selecteurNiveau.value = '10';
  const echeanceLue = Math.round(Number(lire('vent-echeance', 0)));
  curseurTemps.value = String(Number.isFinite(echeanceLue) ? Math.max(0, Math.min(ECHEANCE_MAX, echeanceLue)) : 0);
  const coucheLue = String(lire('vent-volume-couche', 'toutes'));
  selecteurCouche.value = coucheLue === 'toutes' || HAUTEURS_VENT.includes(Number(coucheLue)) ? coucheLue : 'toutes';
  panneau.querySelectorAll('.vent-carte-legende [data-palier]').forEach((pastille, index) => {
    pastille.style.setProperty('--vent-couleur', PALETTE_CARTE[index]);
  });

  const couleurVitesse = couleurInterface;
  const couleurCarte = (vitesse) => PALETTE_CARTE[palierVent(vitesse)];

  const coucheVent = creerCoucheVent(map, {
    couleur: couleurCarte,
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
      flecheChoisie = fleche;
      if (!fleche) {
        detailVolume.textContent = aideVolume();
        return;
      }
      detailVolume.innerHTML = `${cadranVent(fleche.flux, volume.rotation, 'vent-cadran-petit')}<span>${t('vent.fleche-detail', { vitesse: `<strong>${formatVent(fleche.vitesse)}</strong>`, hauteur: LIBELLE_HAUTEUR(fleche.hauteur), provenance: texteProvenance(fleche.provenance) })}</span>`;
    },
  });

  // ---------- Échéance, commune à la carte et au volume ----------
  const echeance = () => Number(curseurTemps.value);

  const reponsesVue = () => (vueActive === 'volume' ? zoneVolumeCapturee?.reponses : donneesVentCourantes?.reponses);

  function heureEcheance(reponses) {
    const heures = reponses[0].hourly.time;
    const maintenantLocal = new Date(Date.now() + (reponses[0].utc_offset_seconds ?? 0) * 1000).toISOString().slice(0, 16);
    const depart = [reponses[0].current?.time || heures[0], maintenantLocal].sort().at(-1);
    const base = heures.findIndex((heure) => heure >= depart);
    if (base < 0) return null;
    curseurTemps.max = String(Math.max(0, Math.min(ECHEANCE_MAX, heures.length - 1 - base)));
    return heures[base + echeance()] ?? null;
  }

  function majBandeau() {
    const moyen = resumeMoyen.textContent;
    panneauCarte.definirResume({
      nom: t('vent.bandeau', { hauteur: LIBELLE_HAUTEUR(Number(selecteurNiveau.value)) }),
      detail: heureTemps.textContent,
      valeur: Number.isFinite(moyenneCourante) ? valeurVent(moyenneCourante) : moyen,
      unite: Number.isFinite(moyenneCourante) ? libelleVent() : '',
      rose: cadranVent(resumeVentCourant.length ? Number(cadranResume.dataset.flux) : null, 0, 'vent-cadran-petit'),
    });
  }

  function afficherEcheance() {
    const reponses = reponsesVue();
    const heure = reponses ? heureEcheance(reponses) : null;
    let date = heure;
    if (!date) {
      // Pas encore de données : l'heure entière à venir, comme le fera le modèle
      date = new Date();
      date.setMinutes(0, 0, 0);
      date.setHours(date.getHours() + 1 + echeance());
    }
    const libelle = formaterHeure(date);
    const ecart = echeance() === 0 ? t('vent.prochaine-heure') : t('vent.dans-h', { n: echeance() });
    heureTemps.textContent = libelle;
    ecartTemps.textContent = ecart;
    heurePastille = Number.isNaN(new Date(date).getTime()) ? '' : heurePourPastille(new Date(date));
    if (pastille.visible) pastille.maj();
    curseurTemps.setAttribute('aria-valuetext', `${libelle}, ${ecart}`);
    majBandeau();
  }

  function appliquerEcheance() {
    ecrire('vent-echeance', echeance());
    afficherEcheance();
    if (vueActive === 'volume') {
      construireCouches();
    } else if (donneesVentCourantes) {
      const { reponses, positions, grille } = donneesVentCourantes;
      const heure = heureEcheance(reponses);
      if (!heure) {
        poser(statut, 'vent.echeance-absente');
        return;
      }
      heureCourante = heure;
      afficherDonnees(reponses, positions, heureCourante, grille, true);
    }
  }

  // La carte suit le curseur pendant le glissé, au plus une fois par délai
  function planifierEcheance() {
    if (minuteurCurseur !== null) {
      curseurEnAttente = true;
      return;
    }
    appliquerEcheance();
    minuteurCurseur = setTimeout(() => {
      minuteurCurseur = null;
      if (curseurEnAttente) {
        curseurEnAttente = false;
        planifierEcheance();
      }
    }, DELAI_CURSEUR);
  }

  function afficherResume(points) {
    resumeVentCourant = points;
    moyenneCourante = null;
    if (!points.length) {
      resumeMoyen.textContent = '—';
      resumeRafales.textContent = '—';
      resumeProvenance.textContent = '—';
      delete cadranResume.dataset.flux;
      cadranResume.querySelector('.vent-cadran-fleche').setAttribute('hidden', '');
      resumeMoyen.style.removeProperty('color');
      majBandeau();
      return;
    }
    const moyenne = points.reduce((total, point) => total + Math.hypot(point.u, point.v), 0) / points.length;
    const rafales = points.map((point) => point.rafales).filter(Number.isFinite);
    const u = points.reduce((total, point) => total + point.u, 0);
    const v = points.reduce((total, point) => total + point.v, 0);
    const { flux, provenance } = depuisComposantes(u, v);
    const rafaleMax = rafales.length ? Math.max(...rafales) : null;
    moyenneCourante = moyenne;
    resumeMoyen.textContent = formatVent(moyenne);
    resumeRafales.textContent = rafaleMax === null ? '—' : formatVent(rafaleMax);
    resumeProvenance.textContent = texteProvenance(provenance);
    cadranResume.dataset.flux = String(flux);
    const flecheResume = cadranResume.querySelector('.vent-cadran-fleche');
    flecheResume.removeAttribute('hidden');
    flecheResume.setAttribute('transform', `rotate(${flux} 32 32)`);
    cadranResume.style.setProperty('--vent-couleur', couleurVitesse(moyenne));
    resumeMoyen.style.color = couleurVitesse(moyenne);
    panneauCarte.element.style.setProperty('--vent-couleur', couleurVitesse(moyenne));
    majBandeau();
  }

  // ---------- Volume 3D ----------
  function construireCouches() {
    if (!zoneVolumeCapturee) return;
    const { reponses, grille, demi, centre } = zoneVolumeCapturee;
    const heureCible = heureEcheance(reponses);
    if (!heureCible) {
      statutVolume.classList.remove('erreur');
      poser(statutVolume, 'vent.echeance-absente');
      return;
    }

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
      poser(statutVolume, 'vent.aucun-hauteur');
      return;
    }
    const exageration = volume.exageration;
    poser(statutVolume, 'vent.n-fleches', { n: nombreFleches, plafond: LIBELLE_PLAFOND(plafondVolume) })
      + (exageration > 1.05 ? t('vent.exageration', { facteur: nombre(exageration, 1) }) : '');
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

  // Rien ne se recharge quand la carte bouge : le champ chargé est rééchantillonné.
  // Le bouton n'apparaît que si le rechargement apporte quelque chose : l'échéance,
  // elle, s'applique sans réseau car les prévisions de la zone sont déjà là.
  function raisonActualiser() {
    if (vueActive === 'volume') {
      if (erreurVolume) return t('vent.echec-volume');
      if (!zoneVolumeCapturee) return '';
      const { centre, demi, recue } = zoneVolumeCapturee;
      const courant = map.getCenter();
      const ecart = Math.hypot((courant.lng - centre.lng) * metresParDegreLng(centre.lat), (courant.lat - centre.lat) * METRES_PAR_DEGRE);
      if (ecart > demi * 0.5 || demiCoteVisible() !== demi) return t('vent.zone-changee');
      return Date.now() - recue > DUREE_VALIDITE ? t('vent.plus-heure') : '';
    }
    if (map.getZoom() < 7) return '';
    if (erreurCarte) return t('vent.echec-carte');
    if (!zoneCarteCapturee) return t('vent.aucun-charge');
    const { grille, zoom, recue } = zoneCarteCapturee;
    const limites = map.getBounds();
    const depasse = limites.getWest() < grille.ouest
      || limites.getSouth() < grille.sud
      || limites.getEast() > grille.ouest + (grille.nx - 1) * grille.pasLng
      || limites.getNorth() > grille.sud + (grille.ny - 1) * grille.pasLat;
    if (depasse) return t('vent.depasse');
    if (map.getZoom() - zoom >= 1.5 && grille.pasLat > PAS_MIN_GRILLE) return t('vent.plus-pres');
    return Date.now() - recue > DUREE_VALIDITE ? t('vent.plus-heure') : '';
  }

  function mettreAJourAlerte() {
    const enCours = vueActive === 'volume' ? controleurProfil : controleur;
    const message = actif && !enCours ? raisonActualiser() : '';
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
    if (reponse.status === 429) throw new Error(t(MESSAGE_LIMITE));
    if (!reponse.ok) throw new Error(t('meteo.statut-http', { statut: reponse.status }));
    const resultat = await reponse.json();
    dateEnregistree = dateHorsLigne(reponse);
    const donnees = Array.isArray(resultat) ? resultat : [resultat];
    if (donnees.length !== manquantes.length) {
      throw new Error(t('vent.points-inattendus'));
    }
    donnees.forEach((entree, index) => {
      if (!Array.isArray(entree?.hourly?.time)) {
        throw new Error(t('vent.horaires-incompletes'));
      }
      cache.set(cleePosition(manquantes[index]), {
        donnees: entree,
        recue: dateEnregistree ?? Date.now(),
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
    erreurVolume = false;
    mettreAJourAlerte();
    statutVolume.classList.remove('erreur');
    poser(statutVolume, 'vent.volume-chargement');
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);
    try {
      await chargerPointsManquants(grille.positions, requete.signal);
      const reponses = grille.positions.map((position) => cache.get(cleePosition(position)).donnees);
      const relief = await chargerRelief(centre, demi, grille, reponses);
      if (requete.signal.aborted || controleurProfil !== requete || !actif || vueActive !== 'volume') return;
      zoneVolumeCapturee = { centre, demi, grille, reponses, recue: dateEnregistree ?? Date.now() };
      zoneVolume.textContent = `±${formatDistance(demi)}`;
      volume.definirRelief(relief);
      afficherEcheance();
      construireCouches();
    } catch (erreur) {
      if (requete.signal.aborted && controleurProfil === requete && actif && vueActive === 'volume') {
        erreurVolume = true;
        statutVolume.classList.add('erreur');
        poser(statutVolume, 'vent.volume-trop-long');
      } else if (controleurProfil === requete && actif && vueActive === 'volume') {
        erreurVolume = true;
        statutVolume.classList.add('erreur');
        statutVolume.textContent = estHorsLigne()
          ? t('vent.hors-ligne-volume')
          : t('vent.volume-erreur', { message: erreur instanceof Error ? erreur.message : t('meteo.erreur-inconnue') });
        console.error('Chargement du volume de vent impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (pastille.visible) pastille.maj();
      if (controleurProfil === requete) {
        controleurProfil = null;
        mettreAJourAlerte();
      }
    }
  }

  function basculerPleinEcran(plein) {
    if (plein === blocVolume.classList.contains('vent-volume-plein')) return;
    if (plein) {
      // Sorti du panneau : un parent transformé ou défilant le limiterait
      emplacementVolume = document.createComment('vent-volume');
      blocVolume.before(emplacementVolume);
      emplacementTemps = document.createComment('vent-temps');
      blocTemps.before(emplacementTemps);
      emplacementAlerte = document.createComment('vent-alerte');
      alerteZone.before(emplacementAlerte);
      reglagesVolume.after(blocTemps);
      blocTemps.after(alerteZone);
      document.body.append(blocVolume);
    } else {
      emplacementVolume?.replaceWith(blocVolume);
      emplacementVolume = null;
      emplacementTemps?.replaceWith(blocTemps);
      emplacementTemps = null;
      emplacementAlerte?.replaceWith(alerteZone);
      emplacementAlerte = null;
    }
    blocVolume.classList.toggle('vent-volume-plein', plein);
    boutonRetour.hidden = !plein;
    boutonAgrandir.hidden = plein;
    (plein ? boutonRetour : boutonAgrandir).focus({ preventScroll: true });
  }

  function selectionnerVue(nom, focus = false) {
    vueActive = nom;
    ecrire('vent-vue', nom);
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
      }
      if (actif && !zoneVolumeCapturee) void chargerProfilVolume();
    } else {
      if (controleurProfil) {
        controleurProfil.abort();
        controleurProfil = null;
      }
      if (actif && !donneesVentCourantes) void chargerVent();
    }
    // L'autre vue a pu garder l'échéance d'avant
    if (reponsesVue()) appliquerEcheance();
    else afficherEcheance();
    mettreAJourAlerte();
  }

  function appliquerPalette() {
    const couleurs = paletteInterface();
    panneau.querySelectorAll('[data-volume-vitesse]').forEach((pastille, index) => {
      pastille.style.setProperty('--vent-couleur', couleurs[index]);
    });
    afficherResume(resumeVentCourant);
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
    poser(titre, 'vent.modele-hauteur', { hauteur: LIBELLE_HAUTEUR(Number(selecteurNiveau.value)) });
    const heure = document.createElement('p');
    poser(heure, 'vent.prevision', { heure: formaterHeure(heureCible) });
    const direction = document.createElement('div');
    direction.className = 'vent-carte-popup-direction';
    direction.style.setProperty('--vent-couleur', couleurVitesse(proprietes.vitesse));
    direction.innerHTML = `${cadranVent(proprietes.flux, 0, 'vent-cadran-moyen')}<div><strong>${formatVent(proprietes.vitesse)}</strong><small>${texteProvenance(proprietes.provenance)}</small></div>`;
    const rafales = document.createElement('p');
    poser(rafales, 'vent.rafales-sol', { valeur: Number.isFinite(rafalesProches) ? formatVent(rafalesProches) : t('vent.indisponibles') });
    const altitude = document.createElement('p');
    poser(altitude, 'vent.altitude-terrain', { valeur: Number.isFinite(proche?.elevation) ? formatAltitude(proche.elevation) : t('meteo.indisponible') });
    contenu.append(titre, heure, direction, rafales, altitude);
    new Popup({ closeButton: true, offset: 14 })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(contenu)
      .addTo(map);
  }

  function afficherDonnees(reponses, positions, heureCible, grille, continu = false) {
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
    coucheVent.definirChamp(creerChamp(grille, valeurs), continu);
    const maille = grille.pasLat * METRES_PAR_DEGRE / 1000;
    statut.classList.remove('erreur');
    statut.textContent = points.length
      ? `${dateEnregistree ? `${texteDonneesDu(dateEnregistree)} · ` : ''}${t('vent.points-calcul', { n: points.length, maille: formatDistance(maille * 1000) })}`
      : t('vent.aucune-donnee');
  }

  async function chargerVent() {
    if (!actif) return;
    if (map.getZoom() < 7) {
      statut.classList.remove('erreur');
      poser(statut, 'vent.zoomer');
      return;
    }

    controleur?.abort();
    const requete = new AbortController();
    controleur = requete;
    erreurCarte = false;
    mettreAJourAlerte();
    statut.classList.remove('erreur');
    poser(statut, 'vent.chargement');
    const grille = creerGrille(map);
    const { positions } = grille;
    const minuteurDelai = setTimeout(() => requete.abort(), DELAI_CHARGEMENT);

    try {
      await chargerPointsManquants(positions, requete.signal);
      if (requete.signal.aborted || controleur !== requete || !actif) return;
      const reponses = positions.map((position) => cache.get(cleePosition(position)).donnees);
      heureCourante = heureEcheance(reponses);
      if (!heureCourante) throw new Error(t('vent.aucune-prevision'));
      zoneCarteCapturee = { zoom: map.getZoom(), grille, recue: dateEnregistree ?? Date.now() };
      afficherDonnees(reponses, positions, heureCourante, grille);
      afficherEcheance();
    } catch (erreur) {
      if (requete.signal.aborted && controleur === requete && actif) {
        erreurCarte = true;
        statut.classList.add('erreur');
        poser(statut, 'vent.trop-long');
      } else if (controleur === requete && actif) {
        erreurCarte = true;
        statut.classList.add('erreur');
        statut.textContent = estHorsLigne()
          ? t('vent.hors-ligne-carte')
          : erreur.message === t(MESSAGE_LIMITE)
          ? t(MESSAGE_LIMITE)
          : t('vent.carte-erreur', { message: erreur instanceof Error ? erreur.message : t('meteo.erreur-inconnue') });
        console.error('Chargement de la carte de vent impossible :', erreur);
      }
    } finally {
      clearTimeout(minuteurDelai);
      if (pastille.visible) pastille.maj();
      if (controleur === requete) {
        controleur = null;
        mettreAJourAlerte();
      }
    }
  }

  // Hauteur et échéance réutilisent les données déjà reçues pour la zone chargée
  selecteurNiveau.addEventListener('change', () => {
    ecrire('vent-niveau', Number(selecteurNiveau.value));
    if (!donneesVentCourantes) return;
    const { reponses, positions, grille } = donneesVentCourantes;
    afficherDonnees(reponses, positions, heureCourante, grille);
    majBandeau();
  });
  curseurTemps.addEventListener('input', () => {
    afficherEcheance();
    planifierEcheance();
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
  selecteurCouche.addEventListener('change', () => {
    ecrire('vent-volume-couche', selecteurCouche.value);
    construireCouches();
  });
  plafondsVolume.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      plafondVolume = Number(radio.value);
      ecrire('vent-volume-plafond', plafondVolume);
      if (Number(selecteurCouche.value) > plafondVolume) {
        selecteurCouche.value = 'toutes';
        ecrire('vent-volume-couche', 'toutes');
      }
      construireCouches();
    });
  });
  panneau.querySelector('.vent-volume-recentrer').addEventListener('click', () => volume.recentrer());
  boutonAgrandir.addEventListener('click', () => basculerPleinEcran(true));
  boutonRetour.addEventListener('click', () => basculerPleinEcran(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') basculerPleinEcran(false);
  });
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
  afficherEcheance();
  selectionnerVue(vueActive);

  // Unités ou langue : les libellés fixes et les valeurs affichées se réécrivent sur place
  function reafficherUnites() {
    panneau.querySelectorAll('.vent-carte-niveau option, .vent-volume-couche option[value]:not([value="toutes"])').forEach((option) => {
      option.textContent = LIBELLE_HAUTEUR(Number(option.value));
    });
    panneau.querySelectorAll('[data-plafond-libelle]').forEach((libelle, index) => {
      libelle.textContent = LIBELLE_PLAFOND(PLAFONDS_VOLUME[index]);
    });
    const paliers = libellesPaliersVent();
    panneau.querySelectorAll('.vent-carte-legende, .vent-volume-legende').forEach((legende) => {
      legende.querySelectorAll('[data-palier-libelle]').forEach((libelle, index) => {
        libelle.textContent = paliers[index];
      });
    });
    panneau.querySelectorAll('[data-unite-vent]').forEach((unite) => {
      unite.textContent = libelleVent();
    });
    poser(panneauCarte.titre, 'vent.titre');
    if (!flecheChoisie) detailVolume.textContent = aideVolume();
    mettreAJourAlerte();
    afficherResume(resumeVentCourant);
    afficherEcheance();
    if (vueActive === 'volume' && zoneVolumeCapturee) {
      zoneVolume.textContent = `±${formatDistance(zoneVolumeCapturee.demi)}`;
      construireCouches();
    } else if (donneesVentCourantes && actif) {
      const { reponses, positions, heureCible, grille } = donneesVentCourantes;
      afficherDonnees(reponses, positions, heureCible, grille, true);
    }
  }
  surPreferences(reafficherUnites);

  return {
    id: 'vent',
    labelCle: 'vent.titre',
    icone: 'vent',
    panneau: panneauMenu,
    surCarte: true,
    activer({ onFermer, onRetour } = {}) {
      fermeture = onFermer;
      panneauCarte.definirRetour(onRetour ?? null);
      panneauCarte.afficher();
      actif = true;
      pastille.montrer(true);
      assurerCouche();
      coucheVent.definirVisible(true);
      coucheVent.definirAnimation(vueActive !== 'volume');
      if (vueActive === 'volume') {
        if (!zoneVolumeCapturee) void chargerProfilVolume();
      } else if (!donneesVentCourantes) {
        void chargerVent();
      }
      afficherEcheance();
      mettreAJourAlerte();
      clearInterval(minuteurValidite);
      minuteurValidite = setInterval(mettreAJourAlerte, 60000);
    },
    desactiver() {
      actif = false;
      pastille.montrer(false);
      clearInterval(minuteurValidite);
      alerteZone.hidden = true;
      basculerPleinEcran(false);
      panneauCarte.masquer();
      controleur?.abort();
      controleurProfil?.abort();
      controleurProfil = null;
      coucheVent.definirVisible(false);
      if (map.getLayer(COUCHE_VENT)) map.setLayoutProperty(COUCHE_VENT, 'visibility', 'none');
    },
  };
}
