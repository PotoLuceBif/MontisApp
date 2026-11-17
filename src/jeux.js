// Jeux (lots P.4a et P.4b) : quiz de géographie joué sur le globe. Drapeaux, Capitales, Où est-ce ?, Liste chrono, Révise tes erreurs.
// Chargé à la première ouverture de la ligne du menu ; contours et drapeaux à la première partie (public/data/jeux).
import { creerPanneauCarte } from './panneau-carte.js';
import { bloquerFiches } from './fiche.js';
import { POLICE, POLICE_GRAS } from './polices.js';
import { lire, ecrire } from './reglages.js';
import { langue } from './preferences.js';
import { surLangue, t, ta, ti, tt } from './i18n.js';
import {
  DUREES_LISTE, LONGUEUR_COURTE, ZONES, cleRecord, formatChrono, index, indexCapitales, jumeau, meilleur, melanger, nomPays, paysDeZone,
  proposerChoix, reconnaitre, suggerer, distanceKm, distancePays, dansPays, seuilVille, SEUIL_PETIT_PAYS, noterErreur, lireErreur,
} from './jeu-calcul.js';
import { formatDistance } from './unites.js';

const SOURCE = 'jeu-pays';
const SOURCE_POINTS = 'jeu-pays-points';
const COUCHES = ['jeu-pays-fond', 'jeu-pays-contour', 'jeu-pays-points', 'jeu-pays-halo'];
const SOURCE_CAPITALE = 'jeu-capitale';
const COUCHES_CAPITALE = ['jeu-capitale-point', 'jeu-capitale-noms', 'jeu-capitale-nom'];
const ZOOM_PAYS = 4; // cadrage d'un pays après une réponse
// Pictogrammes des cartes de jeu (traits, comme les icônes du menu)
const ICONES_MODES = {
  drapeaux: '<path d="M5 21V4"/><path d="M5 4.5c2.5-1.3 4.5-1.3 7 0s4.5 1.3 7 0v9c-2.5 1.3-4.5 1.3-7 0s-4.5-1.3-7 0"/>',
  capitales: '<path d="m3 9 9-5 9 5"/><path d="M4 9h16"/><path d="M6 9v8m4-8v8m4-8v8m4-8v8"/><path d="M3.5 20h17M4.5 17h15"/>',
  liste: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M12 13.5l2.8 2"/><path d="M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  ou: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  revision: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 3.5v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20.5v-5h5"/>',
};
const SOURCE_OU = 'jeu-ou';
const COUCHES_OU = ['jeu-ou-trait', 'jeu-ou-points'];
const ZOOM_MAX_VILLES_PAYS = 7; // « Villes d'un pays » : assez près pour placer une ville
const MAX_REVISION = 15;
// Carte de montagne cachée pendant la partie, avec tous les textes : le globe seul, et le rose du pays à trouver
// ne se perd plus parmi les routes roses de la nuit
const CARTE_CACHEE = /^(montis-(road|tunnels|chemins|sentiers|path|marches|rail|remontees|batiments|waterway)|nature-rivieres|courbes)/;
// Pays de la question : le rose « laser » de la DA (autoroutes de nuit), avec un halo pour bien le voir
const COULEURS = { question: '#ff4fd8', trouve: '#3ddc97', rate: '#ff5c7a' };
const ZOOM_MAX_JEU = 5; // au-delà, le globe laisse place à la carte de montagne
const VUES = {
  europe: { center: [15, 53], zoom: 3 },
  monde: { center: [12, 22], zoom: 1.3 },
  afrique: { center: [19, 2], zoom: 2.3 },
  asie: { center: [88, 30], zoom: 2 },
  ameriques: { center: [-78, 8], zoom: 1.7 },
  oceanie: { center: [155, -12], zoom: 2.4 },
};
const drapeau = (code) => `/data/jeux/drapeaux/${code}.svg`;
const estTelephone = () => window.matchMedia('(max-width: 640px)').matches;

let promessePays = null;
function chargerPays() {
  promessePays ??= fetch('/data/jeux/pays.json')
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .catch((erreur) => {
      promessePays = null;
      throw erreur;
    });
  return promessePays;
}

let promesseVilles = null;
function chargerVilles() {
  promesseVilles ??= fetch('/data/jeux/villes.json')
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .catch((erreur) => {
      promesseVilles = null;
      throw erreur;
    });
  return promesseVilles;
}

export function creerJeux(map, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  // ---------- Réglage de la partie, dans le menu ----------
  const choix = {
    mode: 'drapeaux',
    sens: 'drapeau',
    sensCapitales: 'pays',
    cible: 'pays',
    paysVilles: 'FR',
    niveau: 'choix',
    longueur: 'courte',
    zone: 'europe',
    ...lire('jeux-choix', {}),
  };
  const records = () => lire('jeux-records', {});

  // Deux écrans : les cartes des jeux, puis les options du jeu choisi (demande du propriétaire du 17 novembre 2026)
  const MODES = ['drapeaux', 'capitales', 'ou', 'liste'];
  const panneau = document.createElement('div');
  panneau.className = 'jeux';
  panneau.innerHTML = `
    <div class="jeux-accueil">
      <p class="note" ${ti('jeux.intro')}>${t('jeux.intro')}</p>
      <div class="jeux-cartes">
        ${MODES.map((mode) => `
          <button type="button" class="jeux-carte" data-mode="${mode}">
            <span class="jeux-carte-icone jeux-carte-${mode}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES_MODES[mode]}</svg></span>
            <span class="jeux-carte-textes">
              <strong ${ti(`jeux.carte-${mode}`)}>${t(`jeux.carte-${mode}`)}</strong>
              <span ${ti(`jeux.carte-${mode}-aide`)}>${t(`jeux.carte-${mode}-aide`)}</span>
              <small class="jeux-carte-record"></small>
            </span>
            <svg class="jeux-carte-fleche" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
          </button>`).join('')}
        <button type="button" class="jeux-carte jeux-carte-revision-ligne" data-mode="revision">
          <span class="jeux-carte-icone jeux-carte-revision" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES_MODES.revision}</svg></span>
          <span class="jeux-carte-textes">
            <strong ${ti('jeux.carte-revision')}>${t('jeux.carte-revision')}</strong>
            <span class="jeux-revision-aide"></span>
          </span>
          <svg class="jeux-carte-fleche" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </div>
      <p class="note jeux-message-accueil" role="status" hidden></p>
      <p class="note jeux-credits" ${ti('jeux.credits')}>${t('jeux.credits')}</p>
    </div>
    <div class="jeux-options" hidden>
      <button type="button" class="jeux-retour-cartes" ${ta('aria-label', 'jeux.retour-cartes')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><strong class="jeux-options-titre"></strong>
      </button>
      <p class="note jeux-aide-mode"></p>
      <div class="jeux-reglage" data-pour="drapeaux">
        <span class="jeux-legende" ${ti('jeux.question')}>${t('jeux.question')}</span>
        <div class="segments" data-choix="sens" role="group" ${ta('aria-label', 'jeux.question')}>
          <button type="button" data-valeur="drapeau" ${ti('jeux.sens-drapeau')}>${t('jeux.sens-drapeau')}</button>
          <button type="button" data-valeur="pays" ${ti('jeux.sens-pays')}>${t('jeux.sens-pays')}</button>
        </div>
      </div>
      <div class="jeux-reglage" data-pour="capitales">
        <span class="jeux-legende" ${ti('jeux.question')}>${t('jeux.question')}</span>
        <div class="segments" data-choix="sensCapitales" role="group" ${ta('aria-label', 'jeux.question')}>
          <button type="button" data-valeur="pays" ${ti('jeux.sens-capitale')}>${t('jeux.sens-capitale')}</button>
          <button type="button" data-valeur="capitale" ${ti('jeux.sens-drapeau')}>${t('jeux.sens-drapeau')}</button>
        </div>
      </div>
      <div class="jeux-reglage" data-pour="ou">
        <span class="jeux-legende" ${ti('jeux.cible')}>${t('jeux.cible')}</span>
        <div class="segments" data-choix="cible" role="group" ${ta('aria-label', 'jeux.cible')}>
          <button type="button" data-valeur="pays" ${ti('jeux.cible-pays')}>${t('jeux.cible-pays')}</button>
          <button type="button" data-valeur="villes" ${ti('jeux.cible-villes')}>${t('jeux.cible-villes')}</button>
          <button type="button" data-valeur="ville-pays" ${ti('jeux.cible-ville-pays')}>${t('jeux.cible-ville-pays')}</button>
        </div>
      </div>
      <label class="jeux-reglage" data-pour="ville-pays">
        <span class="jeux-legende" ${ti('jeux.pays-villes')}>${t('jeux.pays-villes')}</span>
        <select class="jeux-pays-villes"></select>
      </label>
      <div class="jeux-reglage" data-pour="zone">
        <span class="jeux-legende" ${ti('jeux.zone')}>${t('jeux.zone')}</span>
        <div class="jeux-zones" data-choix="zone" role="group" ${ta('aria-label', 'jeux.zone')}>
          ${ZONES.map((zone) => `<button type="button" data-valeur="${zone}"><span ${ti(`jeux.zone-${zone}`)}>${t(`jeux.zone-${zone}`)}</span><small></small></button>`).join('')}
        </div>
      </div>
      <div class="jeux-reglage" data-pour="niveau">
        <span class="jeux-legende" ${ti('jeux.niveau')}>${t('jeux.niveau')}</span>
        <div class="segments" data-choix="niveau" role="group" ${ta('aria-label', 'jeux.niveau')}>
          <button type="button" data-valeur="choix" ${ti('jeux.niveau-choix')}>${t('jeux.niveau-choix')}</button>
          <button type="button" data-valeur="expert" ${ti('jeux.niveau-expert')}>${t('jeux.niveau-expert')}</button>
        </div>
      </div>
      <div class="jeux-reglage" data-pour="questions">
        <span class="jeux-legende" ${ti('jeux.longueur')}>${t('jeux.longueur')}</span>
        <div class="segments" data-choix="longueur" role="group" ${ta('aria-label', 'jeux.longueur')}>
          <button type="button" data-valeur="courte"></button>
          <button type="button" data-valeur="complete"></button>
        </div>
      </div>
      <p class="jeux-record"></p>
      <button type="button" class="jeux-jouer">${tt('jeux.jouer')}</button>
      <p class="note jeux-message" role="status" hidden></p>
    </div>
  `;
  const $ = (selecteur, racine = panneau) => racine.querySelector(selecteur);
  // Le niveau expert fait taper un nom : « Trouve le drapeau » se joue toujours en quatre choix
  const niveauImpose = (c) => c.mode === 'drapeaux' && c.sens === 'pays';
  // Ce que joue la partie : un seul sens, celui du mode choisi
  const reglageEffectif = (mode = choix.mode) => {
    const c = { ...choix, mode };
    if (mode === 'ou') {
      // « Villes d'un pays » : la zone est le pays choisi
      return { mode, sens: c.cible, niveau: 'choix', longueur: c.longueur, zone: c.cible === 'ville-pays' ? c.paysVilles : c.zone };
    }
    return {
      mode,
      zone: c.zone,
      longueur: c.longueur,
      sens: mode === 'capitales' ? c.sensCapitales : c.sens,
      niveau: niveauImpose(c) ? 'choix' : c.niveau,
    };
  };
  const erreurs = () => lire('jeux-erreurs', []);
  const texteRecord = (record) => t('jeux.record', { bonnes: record.bonnes, total: record.total, duree: formatChrono(record.duree) });
  let nombres = null; // pays par zone, connus après le premier chargement
  let ecran = 'accueil';

  // Villes du monde dont le pays est dans la zone
  function villesDeZone(zone) {
    if (!donnees) return [];
    return donnees.villes.monde.filter((id) => zone === 'monde' || donnees.parCode.get(donnees.villes.villes[id].pays).zones.includes(zone));
  }

  // Pays jouables en « Villes d'un pays », par ordre alphabétique dans la langue de l'appli
  let listePaysLangue = null;
  function rendreChoixPays() {
    const select = $('.jeux-pays-villes');
    if (!donnees) return;
    if (listePaysLangue !== langue()) {
      listePaysLangue = langue();
      const { nom } = lesNoms();
      select.innerHTML = Object.keys(donnees.villes.parPays)
        .map((code) => [code, nom(code)])
        .sort((a, b) => a[1].localeCompare(b[1], langue()))
        .map(([code, libelle]) => `<option value="${code}">${libelle}</option>`).join('');
    }
    select.value = choix.paysVilles;
  }

  function montrerEcran(nouveau) {
    ecran = nouveau;
    $('.jeux-accueil').hidden = ecran !== 'accueil';
    $('.jeux-options').hidden = ecran !== 'options';
    rendreReglage();
  }

  function rendreReglage() {
    panneau.querySelectorAll('[data-choix]').forEach((groupe) => {
      groupe.querySelectorAll('button').forEach((bouton) => {
        const actif = bouton.dataset.valeur === choix[groupe.dataset.choix];
        bouton.classList.toggle('actif', actif);
        bouton.setAttribute('aria-pressed', String(actif));
      });
    });
    // Cartes : le record de chaque jeu avec ses derniers réglages
    panneau.querySelectorAll('.jeux-carte:not([data-mode="revision"])').forEach((carte) => {
      const record = records()[cleRecord(reglageEffectif(carte.dataset.mode))];
      const petit = $('.jeux-carte-record', carte);
      petit.textContent = record ? `${t(`jeux.zone-${choix.zone}`)} · ${texteRecord(record)}` : '';
      petit.hidden = !record;
    });
    const n = erreurs().length;
    $('.jeux-revision-aide').textContent = n ? t('jeux.carte-revision-aide', { n }) : t('jeux.carte-revision-vide');
    const { mode } = choix;
    const ou = mode === 'ou';
    const villesPays = ou && choix.cible === 'ville-pays';
    $('.jeux-options-titre').textContent = t(`jeux.carte-${mode}`);
    $('[data-pour="drapeaux"]').hidden = mode !== 'drapeaux';
    $('[data-pour="capitales"]').hidden = mode !== 'capitales';
    $('[data-pour="ou"]').hidden = !ou;
    $('[data-pour="ville-pays"]').hidden = !villesPays;
    $('[data-pour="zone"]').hidden = villesPays;
    $('[data-pour="questions"]').hidden = mode === 'liste';
    $('[data-pour="niveau"]').hidden = mode === 'liste' || ou || niveauImpose(choix);
    $('.jeux-aide-mode').textContent = t(ou ? `jeux.aide-ou-${choix.cible}` : `jeux.aide-${mode}`, {
      duree: formatChrono(DUREES_LISTE[choix.zone]),
    });
    // Nombre de pays par zone, ou de villes pour « Villes »
    const compte = (zone) => {
      if (!nombres) return null;
      if (ou && choix.cible === 'villes') return villesDeZone(zone).length;
      return nombres[zone];
    };
    panneau.querySelectorAll('.jeux-zones small').forEach((petit) => {
      const valeur = compte(petit.parentElement.dataset.valeur);
      petit.textContent = valeur === null ? '' : String(valeur);
    });
    rendreChoixPays();
    const total = villesPays ? donnees?.villes.parPays[choix.paysVilles]?.length : compte(choix.zone);
    $('[data-valeur="courte"]').textContent = t('jeux.longueur-courte', { n: LONGUEUR_COURTE });
    $('[data-valeur="complete"]').textContent = total ? t('jeux.longueur-complete', { n: total }) : t('jeux.longueur-tous');
    const record = records()[cleRecord(reglageEffectif())];
    $('.jeux-record').textContent = record ? texteRecord(record) : t('jeux.record-aucun');
  }

  panneau.addEventListener('click', (event) => {
    const carte = event.target.closest('.jeux-carte');
    if (carte?.dataset.mode === 'revision') {
      lancer({ mode: 'revision', zone: 'monde', sens: '', niveau: 'choix', longueur: 'courte' }, $('.jeux-message-accueil'));
      return;
    }
    if (carte) {
      choix.mode = carte.dataset.mode;
      ecrire('jeux-choix', choix);
      montrerEcran('options');
      panneau.closest('.menu-contenu')?.previousElementSibling?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (event.target.closest('.jeux-retour-cartes')) {
      montrerEcran('accueil');
      return;
    }
    const bouton = event.target.closest('[data-choix] button');
    if (!bouton) return;
    choix[bouton.closest('[data-choix]').dataset.choix] = bouton.dataset.valeur;
    ecrire('jeux-choix', choix);
    rendreReglage();
  });

  $('.jeux-pays-villes').addEventListener('change', (event) => {
    choix.paysVilles = event.target.value;
    ecrire('jeux-choix', choix);
    rendreReglage();
  });

  function message(texte, ou = $('.jeux-message')) {
    ou.textContent = texte;
    ou.hidden = !texte;
  }

  let donnees = null;
  async function preparer() {
    if (donnees) return donnees;
    const [brut, villes] = await Promise.all([chargerPays(), chargerVilles()]);
    const pays = brut.features.map((f) => f.properties);
    nombres = Object.fromEntries(ZONES.map((zone) => [zone, paysDeZone(pays, zone).length]));
    const points = {
      type: 'FeatureCollection',
      features: pays.filter((p) => p.petit).map((p) => ({ type: 'Feature', properties: { code: p.code }, geometry: { type: 'Point', coordinates: p.centre } })),
    };
    const geometries = new Map(brut.features.map((f) => [f.properties.code, f.geometry.coordinates]));
    donnees = { brut, pays, parCode: new Map(pays.map((p) => [p.code, p])), points, villes, geometries };
    rendreReglage();
    return donnees;
  }

  async function lancer(reglage, zoneMessage = $('.jeux-message')) {
    message('', zoneMessage);
    $('.jeux-jouer').disabled = true;
    try {
      await preparer();
      if (reglage.mode === 'revision' && !erreurs().length) {
        message(t('jeux.carte-revision-vide'), zoneMessage);
        return;
      }
      fermerMenu();
      partie.demarrer(reglage);
    } catch (erreur) {
      console.warn('Jeux :', erreur);
      message(t(navigator.onLine ? 'jeux.erreur-chargement' : 'jeux.erreur-hors-ligne'), zoneMessage);
    } finally {
      $('.jeux-jouer').disabled = false;
    }
  }
  $('.jeux-jouer').addEventListener('click', () => lancer(reglageEffectif()));

  // ---------- Noms des pays dans la langue de l'appli ----------
  let noms = null;
  function lesNoms() {
    if (noms?.langue === langue()) return noms;
    const intl = new Intl.DisplayNames(langue(), { type: 'region' });
    const deIntl = (code) => {
      try {
        return intl.of(code);
      } catch {
        return code;
      }
    };
    const codes = donnees.pays.map((p) => p.code);
    const entrees = index(codes, langue(), deIntl);
    const capitales = indexCapitales(donnees.pays, langue());
    const parCapitale = new Map(capitales.map((e) => [e.code, e.nom]));
    noms = {
      langue: langue(), entrees, capitales, nom: (code) => nomPays(code, langue(), deIntl), capitale: (code) => parCapitale.get(code),
    };
    return noms;
  }

  // ---------- Globe ----------
  const globe = {
    vueAvant: null,
    zoomMax: null,
    etats: new Map(),
    poser(codesZone, zoomMax = ZOOM_MAX_JEU) {
      // « Rejouer » repose le globe sans perdre la vue d'avant la première partie
      const premiere = !this.vueAvant;
      if (premiere) {
        this.vueAvant = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
        this.zoomMax = map.getMaxZoom();
      }
      if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: donnees.brut, promoteId: 'code' });
      if (!map.getSource(SOURCE_POINTS)) map.addSource(SOURCE_POINTS, { type: 'geojson', data: donnees.points, promoteId: 'code' });
      const couleur = ['match', ['feature-state', 'etat'], 'question', COULEURS.question, 'trouve', COULEURS.trouve, 'rate', COULEURS.rate, 'rgba(0,0,0,0)'];
      const dansZone = ['in', ['get', 'code'], ['literal', codesZone]];
      if (!map.getLayer(COUCHES[0])) {
        map.addLayer({ id: COUCHES[0], type: 'fill', source: SOURCE, filter: dansZone, paint: { 'fill-color': couleur, 'fill-opacity': 0.62 } });
        map.addLayer({
          id: COUCHES[3], type: 'line', source: SOURCE, filter: dansZone,
          paint: {
            'line-color': COULEURS.question,
            // Pas de halo sur un très petit pays : son point le remplace
            'line-opacity': ['case', ['has', 'petit'], 0, ['match', ['feature-state', 'etat'], 'question', 0.7, 0]],
            'line-width': 9,
            'line-blur': 6,
          },
        });
        map.addLayer({
          id: COUCHES[1], type: 'line', source: SOURCE, filter: dansZone,
          paint: {
            'line-color': ['match', ['feature-state', 'etat'], 'question', COULEURS.question, '#ffffff'],
            'line-opacity': ['match', ['feature-state', 'etat'], 'question', 1, 0.35],
            'line-width': ['match', ['feature-state', 'etat'], 'question', 2.5, 0.6],
          },
        });
        map.addLayer({
          id: COUCHES[2], type: 'circle', source: SOURCE_POINTS, filter: dansZone,
          paint: {
            // Le petit pays à trouver grossit, cerclé de blanc
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              1, ['case', ['==', ['feature-state', 'etat'], 'question'], 8, 3],
              5, ['case', ['==', ['feature-state', 'etat'], 'question'], 10, 6],
            ],
            'circle-color': ['match', ['feature-state', 'etat'], 'question', COULEURS.question, 'trouve', COULEURS.trouve, 'rate', COULEURS.rate, 'rgba(255,255,255,0.15)'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': ['case', ['==', ['feature-state', 'etat'], 'question'], 2.5, 1],
            'circle-stroke-opacity': ['case', ['==', ['feature-state', 'etat'], 'question'], 1, 0.6],
          },
        });
      } else {
        COUCHES.forEach((id) => map.setFilter(id, dansZone));
      }
      map.setMaxZoom(zoomMax);
      if (!premiere) return;
      // Les noms de la carte (pays, villes) donneraient les réponses : masqués le temps de la partie.
      // D'autres modules remettent leurs couches visibles (zoom, jour et nuit) : on recache à chaque changement du style.
      this.cacherTextes();
      map.on('styledata', this.surStyle);
    },
    textesCaches: new Set(),
    attenteStyle: 0,
    cacherTextes() {
      for (const couche of map.getStyle().layers) {
        const aCacher = (couche.type === 'symbol' && !couche.id.startsWith('jeu-')) || CARTE_CACHEE.test(couche.id);
        if (!aCacher || couche.layout?.visibility === 'none') continue;
        this.textesCaches.add(couche.id);
        map.setLayoutProperty(couche.id, 'visibility', 'none');
      }
    },
    surStyle: () => {
      if (globe.attenteStyle) return;
      globe.attenteStyle = requestAnimationFrame(() => {
        globe.attenteStyle = 0;
        if (globe.vueAvant) globe.cacherTextes();
      });
    },
    marquer(code, etat) {
      for (const source of [SOURCE, SOURCE_POINTS]) map.setFeatureState({ source, id: code }, { etat: etat || null });
      if (etat) this.etats.set(code, etat);
      else this.etats.delete(code);
    },
    toutEffacer() {
      for (const code of this.etats.keys()) {
        for (const source of [SOURCE, SOURCE_POINTS]) map.setFeatureState({ source, id: code }, { etat: null });
      }
      this.etats.clear();
    },
    marge() {
      // Sur téléphone, le panneau occupe le bas de l'écran : le globe se centre au-dessus
      const hauteur = estTelephone() ? jeu.element.getBoundingClientRect().height : 0;
      const gauche = estTelephone() ? 0 : jeu.element.getBoundingClientRect().right;
      // À droite, la colonne des boutons de la carte
      return { top: 70, bottom: Math.min(hauteur, window.innerHeight * 0.6) + 20, left: Math.max(30, gauche + 10), right: 80 };
    },
    zone(zone) {
      const vue = VUES[zone];
      map.flyTo({ ...vue, zoom: vue.zoom - (estTelephone() ? 0.5 : 0), bearing: 0, pitch: 0, padding: this.marge(), duration: 1600 });
    },
    // Assez loin pour voir où est le pays, même petit (la Belgique remplissait l'écran)
    allerA(code, zoomMax = ZOOM_PAYS) {
      const p = donnees.parCode.get(code);
      const [ouest, sud, est, nord] = p.emprise;
      const camera = map.cameraForBounds([[ouest, sud], [est, nord]], { padding: this.marge(), maxZoom: zoomMax });
      if (!camera) return;
      map.flyTo({ ...camera, zoom: Math.max(1.6, Math.min(camera.zoom, zoomMax)), bearing: 0, pitch: 0, duration: 1400 });
    },
    // Capitales sur le globe : celles trouvées restent toute la partie (on voit où on en est, on les retient),
    // celle de la dernière réponse en grand, même ratée ; `courant` null n'en montre aucune en grand
    // Lieux trouvés (capitales, villes), puis le courant en grand ; lieu : { position, nom }
    lieux(trouves, courant = null) {
      const point = (lieu, actuelle) => ({ type: 'Feature', properties: { nom: lieu.nom, actuelle }, geometry: { type: 'Point', coordinates: lieu.position } });
      const donneesPoints = {
        type: 'FeatureCollection',
        features: [...trouves.filter((l) => l.nom !== courant?.nom).map((l) => point(l, false)), ...(courant ? [point(courant, true)] : [])],
      };
      const source = map.getSource(SOURCE_CAPITALE);
      if (source) {
        source.setData(donneesPoints);
        return;
      }
      if (!donneesPoints.features.length) return;
      map.addSource(SOURCE_CAPITALE, { type: 'geojson', data: donneesPoints });
      map.addLayer({
        id: COUCHES_CAPITALE[0], type: 'circle', source: SOURCE_CAPITALE,
        paint: {
          'circle-radius': ['case', ['get', 'actuelle'], 5.5, 3.5],
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0b1020',
          'circle-stroke-width': ['case', ['get', 'actuelle'], 2, 1.5],
        },
      });
      // Les capitales trouvées s'effacent entre elles si elles se chevauchent ; la dernière passe toujours
      map.addLayer({
        id: COUCHES_CAPITALE[1], type: 'symbol', source: SOURCE_CAPITALE, filter: ['!', ['get', 'actuelle']],
        layout: {
          'text-field': ['get', 'nom'], 'text-font': POLICE, 'text-size': 11.5, 'text-anchor': 'left', 'text-offset': [0.6, 0],
          'text-optional': true,
        },
        paint: { 'text-color': '#e8ecff', 'text-halo-color': '#0b1020', 'text-halo-width': 1.5 },
      });
      map.addLayer({
        id: COUCHES_CAPITALE[2], type: 'symbol', source: SOURCE_CAPITALE, filter: ['get', 'actuelle'],
        layout: {
          'text-field': ['get', 'nom'], 'text-font': POLICE_GRAS, 'text-size': 15, 'text-anchor': 'left', 'text-offset': [0.8, 0],
          'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#0b1020', 'text-halo-width': 2 },
      });
    },
    // Appui et vrai lieu, reliés en tirets ; sans appui, tout s'efface
    ecart(appui, cible, juste) {
      const donneesOu = {
        type: 'FeatureCollection',
        features: appui ? [
          { type: 'Feature', properties: { genre: 'trait' }, geometry: { type: 'LineString', coordinates: [appui, cible] } },
          { type: 'Feature', properties: { genre: 'appui' }, geometry: { type: 'Point', coordinates: appui } },
          { type: 'Feature', properties: { genre: juste ? 'juste' : 'faux' }, geometry: { type: 'Point', coordinates: cible } },
        ] : [],
      };
      const source = map.getSource(SOURCE_OU);
      if (source) {
        source.setData(donneesOu);
        return;
      }
      if (!appui) return;
      map.addSource(SOURCE_OU, { type: 'geojson', data: donneesOu });
      map.addLayer({
        id: COUCHES_OU[0], type: 'line', source: SOURCE_OU, filter: ['==', ['get', 'genre'], 'trait'],
        paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
      });
      map.addLayer({
        id: COUCHES_OU[1], type: 'circle', source: SOURCE_OU, filter: ['!=', ['get', 'genre'], 'trait'],
        paint: {
          'circle-radius': ['match', ['get', 'genre'], 'appui', 6, 7],
          'circle-color': ['match', ['get', 'genre'], 'appui', COULEURS.question, 'juste', COULEURS.trouve, COULEURS.rate],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    },
    // Cadre l'appui et la réponse ensemble, sans s'approcher plus que zoomMax
    // `autres` : points à inclure aussi (les coins d'un pays)
    cadrerPoints(a, b, zoomMax, autres = []) {
      const tous = [a, b, ...autres];
      const xs = tous.map((c) => c[0]);
      const ys = tous.map((c) => c[1]);
      const bornes = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
      const camera = map.cameraForBounds(bornes, { padding: this.marge(), maxZoom: zoomMax });
      if (camera) map.flyTo({ ...camera, zoom: Math.max(1.3, Math.min(camera.zoom, zoomMax)), bearing: 0, pitch: 0, duration: 1200 });
    },
    retirer() {
      this.toutEffacer();
      [...COUCHES, ...COUCHES_CAPITALE, ...COUCHES_OU].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      [SOURCE, SOURCE_POINTS, SOURCE_CAPITALE, SOURCE_OU].forEach((id) => map.getSource(id) && map.removeSource(id));
      map.off('styledata', this.surStyle);
      cancelAnimationFrame(this.attenteStyle);
      this.attenteStyle = 0;
      this.textesCaches.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', 'visible'));
      this.textesCaches.clear();
      if (this.zoomMax !== null) map.setMaxZoom(this.zoomMax);
      if (this.vueAvant) map.flyTo({ ...this.vueAvant, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1600 });
      this.vueAvant = null;
      this.zoomMax = null;
    },
  };

  // ---------- Partie, dans un panneau posé sur la carte ----------
  const jeu = creerPanneauCarte({
    cle: 'jeux-panneau-reduit',
    libelle: 'jeux.quiz',
    classe: 'bf-outil bf-jeu',
    onFermer: () => partie.quitter(),
    onRetour: () => {
      partie.quitter();
      ouvrirMenu();
    },
  });

  // Une question : { type, code (pays), ville (indice), seuil (km), cle (erreur) }
  // Types : drapeau (drapeau → pays), drapeau-pays (pays allumé → drapeau), capitale (pays → capitale),
  // capitale-pays (capitale → pays), ou-pays et ou-ville (toucher le globe)
  const TYPE_ERREUR = { drapeau: 'drapeau', 'drapeau-pays': 'drapeau', capitale: 'capitale', 'capitale-pays': 'capitale', 'ou-pays': 'pays', 'ou-ville': 'ville' };
  const typeDe = ({ mode, sens }) => ({
    drapeaux: sens === 'pays' ? 'drapeau-pays' : 'drapeau',
    capitales: sens === 'pays' ? 'capitale' : 'capitale-pays',
    ou: sens === 'pays' ? 'ou-pays' : 'ou-ville',
  })[mode];
  const ville = (id) => donnees.villes.villes[id];
  const nomVille = (id) => ville(id)[langue()] || ville(id).fr;
  const seuilDe = (id) => (donnees.villes.monde.includes(id) ? seuilVille() : seuilVille(donnees.parCode.get(ville(id).pays).emprise));
  const avecCle = (q) => ({ ...q, cle: `${TYPE_ERREUR[q.type]}:${q.type === 'ou-ville' ? q.ville : q.code}` });

  function construireQuestions(reglage) {
    const { mode, zone, sens, longueur } = reglage;
    const couper = (liste) => (longueur === 'complete' ? liste : liste.slice(0, LONGUEUR_COURTE));
    if (mode === 'revision') {
      return melanger(erreurs().slice(0, MAX_REVISION).map(lireErreur).map(({ type, id }) => {
        if (type === 'ville') return ville(id) ? { type: 'ou-ville', ville: id, code: ville(id).pays, seuil: seuilDe(id), parPays: !donnees.villes.monde.includes(id) } : null;
        if (!donnees.parCode.has(id)) return null;
        return { type: { drapeau: 'drapeau', capitale: 'capitale', pays: 'ou-pays' }[type], code: id };
      }).filter((q) => q?.type).map(avecCle));
    }
    const type = typeDe(reglage);
    if (type === 'ou-ville') {
      const ids = sens === 'ville-pays' ? donnees.villes.parPays[zone] : villesDeZone(zone);
      const seuil = sens === 'ville-pays' ? seuilVille(donnees.parCode.get(zone).emprise) : seuilVille();
      return couper(melanger(ids)).map((id) => avecCle({ type, ville: id, code: ville(id).pays, seuil, parPays: sens === 'ville-pays' }));
    }
    return couper(melanger(paysDeZone(donnees.pays, zone))).map((code) => avecCle({ type, code }));
  }

  // Titre de la partie : le jeu et sa zone (ou le pays des villes)
  function titrePartie(reglage) {
    if (reglage.mode === 'revision') return t('jeux.carte-revision');
    const jeuNom = t(`jeux.carte-${reglage.mode}`);
    const lieu = reglage.mode === 'ou' && reglage.sens === 'ville-pays' ? lesNoms().nom(reglage.zone) : t(`jeux.zone-${reglage.zone}`);
    return `${jeuNom} · ${lieu}`;
  }

  const partie = {
    en: null, // la partie en cours
    minuterie: null,
    ecouteAppui: null,

    demarrer(reglage) {
      if (this.en) this.arreterSansRetour();
      const villesPays = reglage.mode === 'ou' && reglage.sens === 'ville-pays';
      const revision = reglage.mode === 'revision';
      const tous = donnees.pays.map((p) => p.code);
      const codesZone = villesPays ? [reglage.zone] : revision ? tous : paysDeZone(donnees.pays, reglage.zone);
      this.en = {
        reglage,
        codesZone,
        tous,
        questions: reglage.mode === 'liste' ? codesZone : construireQuestions(reglage),
        indice: 0,
        bonnes: 0,
        serie: 0,
        meilleureSerie: 0,
        ratees: [],
        trouves: [],
        lieuxTrouves: [],
        distances: [],
        debut: Date.now(),
        fin: null,
        repondu: false,
      };
      bloquerFiches(true);
      jeu.titre.textContent = titrePartie(reglage);
      jeu.afficher();
      globe.poser(codesZone, villesPays || revision ? ZOOM_MAX_VILLES_PAYS : ZOOM_MAX_JEU);
      // Toucher le globe répond aux questions « Où est-ce ? »
      this.ecouteAppui = (event) => this.appui([event.lngLat.lng, event.lngLat.lat]);
      map.on('click', this.ecouteAppui);
      if (reglage.mode === 'liste') {
        this.liste();
        requestAnimationFrame(() => globe.zone(reglage.zone));
        return;
      }
      this.question();
      // Les drapeaux et capitales restent sur la zone ; le reste se cadre à chaque question
      const premiere = this.en.questions[0];
      if (!revision && reglage.mode !== 'ou' && !['drapeau-pays', 'capitale'].includes(premiere?.type)) {
        requestAnimationFrame(() => globe.zone(reglage.zone));
      }
    },

    // Fermer sans retour à la vue d'avant (pour enchaîner une autre partie)
    arreterSansRetour() {
      window.clearInterval(this.minuterie);
      this.minuterie = null;
      if (this.ecouteAppui) map.off('click', this.ecouteAppui);
      this.ecouteAppui = null;
      globe.toutEffacer();
      globe.ecart(null);
      globe.lieux([]);
    },

    quitter() {
      if (!this.en) {
        jeu.masquer();
        return;
      }
      this.arreterSansRetour();
      this.en = null;
      bloquerFiches(false);
      jeu.masquer();
      globe.retirer();
      rendreReglage();
    },

    resume() {
      const p = this.en;
      if (!p) return;
      const liste = p.reglage.mode === 'liste';
      const fait = liste ? p.trouves.length : Math.min(p.indice + (p.repondu ? 1 : 0), p.questions.length);
      const total = liste ? p.codesZone.length : p.questions.length;
      jeu.definirResume({ nom: titrePartie(p.reglage), detail: '', valeur: `${fait}/${total}`, unite: '' });
    },

    // Cadrage au début d'une question « Où est-ce ? » : la zone, ou le pays des villes
    cadrerQuestion(q) {
      const p = this.en;
      if (q.parPays) globe.allerA(q.code, ZOOM_MAX_VILLES_PAYS);
      else globe.zone(p.reglage.mode === 'revision' ? donnees.parCode.get(q.code).zones[0] : p.reglage.zone);
    },

    // ----- Une question : quatre choix, le nom à taper, ou toucher le globe -----
    question() {
      const p = this.en;
      const q = p.questions[p.indice];
      const { code, type } = q;
      const niveau = p.reglage.niveau;
      p.repondu = false;
      const { nom, capitale } = lesNoms();
      jeu.meta.textContent = t('jeux.meta-question', { n: p.indice + 1, total: p.questions.length, bonnes: p.bonnes, serie: p.serie });
      this.resume();
      globe.ecart(null);
      globe.lieux(p.lieuxTrouves);

      if (type === 'ou-pays' || type === 'ou-ville') {
        const nomCible = type === 'ou-ville' ? nomVille(q.ville) : nom(code);
        const drapeauVille = type === 'ou-ville' && !q.parPays ? `<img src="${drapeau(code)}" alt="" draggable="false">` : '';
        jeu.corps.innerHTML = `
          <p class="jeux-consigne">${t(type === 'ou-ville' ? 'jeux.consigne-ou-ville' : 'jeux.consigne-ou-pays')}</p>
          <p class="jeux-capitale">${drapeauVille}${nomCible}</p>
          <p class="note jeux-ou-aide">${t('jeux.ou-aide')}</p>
          <button type="button" class="jeux-passer">${t('jeux.passer')}</button>
          <div class="jeux-retour" aria-live="polite"></div>
        `;
        $('.jeux-passer', jeu.corps).addEventListener('click', () => this.appui(null));
        requestAnimationFrame(() => this.cadrerQuestion(q));
        return;
      }

      // Pool des leurres : la zone de la partie, ou celle du pays en révision
      const pool = p.reglage.mode === 'revision' ? paysDeZone(donnees.pays, donnees.parCode.get(code).zones[0]) : p.codesZone;
      const choix = proposerChoix(code, pool, p.tous);
      const chercheCapitale = type === 'capitale';
      const libelle = (c) => (chercheCapitale ? capitale(c) : nom(c));
      let tete = '';
      let consigne;
      if (type === 'drapeau-pays') {
        consigne = t('jeux.consigne-pays');
      } else if (type === 'drapeau') {
        tete = `<img class="jeux-drapeau" src="${drapeau(code)}" alt="${t('jeux.drapeau-mystere')}" draggable="false">`;
        consigne = t('jeux.consigne-drapeau');
      } else if (chercheCapitale) {
        tete = `<p class="jeux-capitale"><img src="${drapeau(code)}" alt="" draggable="false">${nom(code)}</p>`;
        consigne = t('jeux.consigne-capitale');
      } else {
        tete = `<p class="jeux-capitale">${capitale(code)}</p>`;
        consigne = t('jeux.consigne-capitale-pays');
      }
      const reponses = type === 'drapeau-pays'
        ? `<div class="jeux-choix jeux-choix-drapeaux">
            ${choix.map((c) => `<button type="button" data-code="${c}" aria-label="${t('jeux.drapeau-de', { nom: nom(c) })}"><img src="${drapeau(c)}" alt="" draggable="false"></button>`).join('')}
          </div>`
        : niveau === 'expert'
          ? `<form class="jeux-saisie" autocomplete="off">
              <input type="text" enterkeyhint="done" autocapitalize="off" spellcheck="false" placeholder="${t(chercheCapitale ? 'jeux.taper-capitale' : 'jeux.taper-pays')}" aria-label="${t(chercheCapitale ? 'jeux.taper-capitale' : 'jeux.taper-pays')}">
              <button type="submit">${t('jeux.valider')}</button>
            </form>
            <div class="jeux-suggestions"></div>
            <button type="button" class="jeux-passer">${t('jeux.passer')}</button>`
          : `<div class="jeux-choix">${choix.map((c) => `<button type="button" data-code="${c}">${libelle(c)}</button>`).join('')}</div>`;
      jeu.corps.innerHTML = `
        ${tete}
        <p class="jeux-consigne">${consigne}</p>
        ${reponses}
        <div class="jeux-retour" aria-live="polite"></div>
      `;
      if (type === 'drapeau-pays' || type === 'capitale') {
        // Le pays de la question s'allume ; après le dessin du panneau, dont la hauteur décide de la marge
        globe.marquer(code, 'question');
        requestAnimationFrame(() => globe.allerA(code));
      } else if (p.reglage.mode === 'revision') {
        requestAnimationFrame(() => globe.zone(donnees.parCode.get(code).zones[0]));
      }

      jeu.corps.querySelectorAll('.jeux-choix button').forEach((bouton) => {
        bouton.addEventListener('click', () => this.repondre(bouton.dataset.code));
      });
      const champ = $('.jeux-saisie input', jeu.corps);
      if (champ) {
        const index = () => (chercheCapitale ? lesNoms().capitales : lesNoms().entrees);
        const suggestions = $('.jeux-suggestions', jeu.corps);
        champ.addEventListener('input', () => {
          suggestions.innerHTML = suggerer(champ.value, index(), { max: 4, langue: langue() })
            .map((c) => `<button type="button" data-code="${c}">${libelle(c)}</button>`).join('');
        });
        suggestions.addEventListener('click', (event) => {
          const bouton = event.target.closest('button');
          if (bouton) this.repondre(bouton.dataset.code);
        });
        $('.jeux-saisie', jeu.corps).addEventListener('submit', (event) => {
          event.preventDefault();
          const trouve = reconnaitre(champ.value, index(), { tolerant: true, langue: langue() });
          if (!trouve) {
            $('.jeux-retour', jeu.corps).innerHTML = `<p class="jeux-inconnu">${t(chercheCapitale ? 'jeux.inconnue-capitale' : 'jeux.inconnu')}</p>`;
            return;
          }
          this.repondre(trouve);
        });
        $('.jeux-passer', jeu.corps).addEventListener('click', () => this.repondre(null));
        if (!estTelephone()) champ.focus();
      }
    },

    // Réponse à quatre choix ou tapée
    repondre(reponse) {
      const p = this.en;
      if (!p || p.repondu) return;
      const q = p.questions[p.indice];
      const { code, type } = q;
      // Devant un drapeau, son jumeau est une bonne réponse (Monaco et Indonésie, Tchad et Roumanie)
      const juste = reponse === code || (type === 'drapeau' && reponse && reponse === jumeau(code));
      const { nom, capitale } = lesNoms();
      globe.marquer(code, juste ? 'trouve' : 'rate');
      if (type === 'capitale' || type === 'capitale-pays') {
        const lieu = { position: donnees.parCode.get(code).capitale.position, nom: capitale(code) };
        if (juste) p.lieuxTrouves.push(lieu);
        globe.lieux(p.lieuxTrouves, lieu);
      }
      if (type === 'drapeau' || type === 'capitale-pays') globe.allerA(code);
      jeu.corps.querySelectorAll('.jeux-choix button, .jeux-suggestions button').forEach((bouton) => {
        bouton.disabled = true;
        if (bouton.dataset.code === code) bouton.classList.add('juste');
        else if (bouton.dataset.code === reponse) bouton.classList.add('faux');
      });
      jeu.corps.querySelectorAll('.jeux-saisie input, .jeux-saisie button').forEach((el) => { el.disabled = true; });
      const capitales = type === 'capitale' || type === 'capitale-pays';
      this.conclure(juste, capitales
        ? t(juste ? 'jeux.bravo-capitale' : 'jeux.rate-capitale', { nom: nom(code), capitale: capitale(code) })
        : t(juste ? 'jeux.bravo' : 'jeux.rate', { nom: nom(code) }));
    },

    // Appui sur le globe (null : « Je ne sais pas »)
    appui(point) {
      const p = this.en;
      if (!p || p.repondu || p.fin) return;
      const q = p.questions[p.indice];
      if (!q || (q.type !== 'ou-pays' && q.type !== 'ou-ville')) return;
      const { nom } = lesNoms();
      const zoomReponse = q.parPays ? 6 : 4.5;
      if (q.type === 'ou-ville') {
        const v = ville(q.ville);
        const lieu = { position: v.position, nom: nomVille(q.ville) };
        const distance = point ? distanceKm(point, v.position) : null;
        const juste = distance !== null && distance <= q.seuil;
        if (juste) p.lieuxTrouves.push(lieu);
        globe.lieux(p.lieuxTrouves, lieu);
        if (point) {
          p.distances.push(distance);
          globe.ecart(point, v.position, juste);
          globe.cadrerPoints(point, v.position, zoomReponse);
        } else {
          globe.cadrerPoints(v.position, v.position, zoomReponse);
        }
        this.conclure(juste, point
          ? t(juste ? 'jeux.ou-juste' : 'jeux.ou-rate', { nom: lieu.nom, distance: formatDistance(Math.round(distance) * 1000) })
          : t('jeux.ou-passe', { nom: lieu.nom }));
        return;
      }
      // Où est ce pays ? Juste dedans, ou tout près pour un petit pays
      const pays = donnees.parCode.get(q.code);
      const distance = point ? distancePays(point, donnees.geometries.get(q.code)) : null;
      const juste = distance !== null && distance <= (pays.petit ? SEUIL_PETIT_PAYS : 0);
      globe.marquer(q.code, juste ? 'trouve' : 'rate');
      if (point) {
        p.distances.push(distance);
        if (!juste) globe.ecart(point, pays.centre, false);
        const [ouest, sud, est, nord] = pays.emprise;
        globe.cadrerPoints(point, pays.centre, ZOOM_PAYS, [[ouest, sud], [est, nord]]);
      } else {
        globe.allerA(q.code);
      }
      const touche = point && !juste ? donnees.pays.find((autre) => dansPays(point, donnees.geometries.get(autre.code))) : null;
      let texte;
      if (juste) texte = t('jeux.bravo', { nom: nom(q.code) });
      else if (!point) texte = t('jeux.ou-passe', { nom: nom(q.code) });
      else texte = t('jeux.ou-pays-rate', { nom: nom(q.code), distance: formatDistance(Math.round(distance) * 1000), touche: touche ? nom(touche.code) : t('jeux.la-mer') });
      this.conclure(juste, texte);
    },

    // Fin d'une question : score, erreur notée pour la révision, bouton Suivant
    conclure(juste, texte) {
      const p = this.en;
      p.repondu = true;
      const q = p.questions[p.indice];
      if (juste) {
        p.bonnes += 1;
        p.serie += 1;
        p.meilleureSerie = Math.max(p.meilleureSerie, p.serie);
      } else {
        p.serie = 0;
        p.ratees.push(q);
      }
      ecrire('jeux-erreurs', noterErreur(erreurs(), q.cle, juste));
      jeu.corps.querySelectorAll('.jeux-passer').forEach((el) => el.remove());
      jeu.corps.querySelectorAll('.jeux-ou-aide').forEach((el) => el.remove());
      const derniere = p.indice === p.questions.length - 1;
      const retour = $('.jeux-retour', jeu.corps);
      retour.innerHTML = `
        <p class="${juste ? 'jeux-bravo' : 'jeux-rate'}">${texte}</p>
        <button type="button" class="jeux-suivant">${t(derniere ? 'jeux.voir-resultat' : 'jeux.suivant')}</button>
      `;
      jeu.meta.textContent = t('jeux.meta-question', { n: p.indice + 1, total: p.questions.length, bonnes: p.bonnes, serie: p.serie });
      this.resume();
      const suivant = $('.jeux-suivant', retour);
      suivant.addEventListener('click', () => {
        if (derniere) {
          this.terminer();
          return;
        }
        // La question suivante repart d'un globe propre, sauf les pays déjà joués, gardés en couleur
        if (globe.etats.get(q.code) === 'question') globe.marquer(q.code, null);
        p.indice += 1;
        this.question();
      });
      suivant.focus({ preventScroll: true });
    },

    // ----- Liste : nommer tous les pays de la zone contre la montre -----
    liste() {
      const p = this.en;
      const duree = DUREES_LISTE[p.reglage.zone];
      jeu.corps.innerHTML = `
        <div class="jeux-liste-tete">
          <strong class="jeux-chrono" aria-live="off">${formatChrono(duree)}</strong>
          <span class="jeux-compte"></span>
        </div>
        <form class="jeux-saisie" autocomplete="off">
          <input type="text" enterkeyhint="done" autocapitalize="off" spellcheck="false" placeholder="${t('jeux.taper-pays')}" aria-label="${t('jeux.taper-pays')}">
        </form>
        <p class="jeux-retour" aria-live="polite"></p>
        <div class="jeux-trouves"></div>
        <button type="button" class="jeux-abandon">${t('jeux.terminer')}</button>
      `;
      const champ = $('.jeux-saisie input', jeu.corps);
      const retour = $('.jeux-retour', jeu.corps);
      const majCompte = () => {
        $('.jeux-compte', jeu.corps).textContent = t('jeux.compte', { n: p.trouves.length, total: p.codesZone.length });
        jeu.meta.textContent = t('jeux.meta-liste', { n: p.trouves.length, total: p.codesZone.length });
        this.resume();
      };
      const dire = (texte, classe = '') => {
        retour.textContent = texte;
        retour.className = `jeux-retour ${classe}`.trim();
      };
      const essayer = (tolerant) => {
        const { entrees, nom } = lesNoms();
        const code = reconnaitre(champ.value, entrees, { tolerant, langue: langue() });
        if (!code) {
          if (tolerant && champ.value.trim()) dire(t('jeux.inconnu'), 'jeux-inconnu');
          return;
        }
        champ.value = '';
        if (p.trouves.includes(code)) {
          dire(t('jeux.deja', { nom: nom(code) }), 'jeux-inconnu');
          return;
        }
        if (!p.codesZone.includes(code)) {
          dire(t('jeux.hors-zone', { nom: nom(code) }), 'jeux-inconnu');
          return;
        }
        p.trouves.push(code);
        globe.marquer(code, 'trouve');
        dire(t('jeux.trouve', { nom: nom(code) }), 'jeux-bravo');
        const pastille = document.createElement('span');
        pastille.className = 'jeux-trouve';
        pastille.innerHTML = `<img src="${drapeau(code)}" alt="">${nom(code)}`;
        $('.jeux-trouves', jeu.corps).prepend(pastille);
        majCompte();
        if (p.trouves.length === p.codesZone.length) this.terminer();
      };
      // Un nom juste est pris dès qu'il est tapé ; Entrée accepte aussi une faute de frappe
      champ.addEventListener('input', () => essayer(false));
      $('.jeux-saisie', jeu.corps).addEventListener('submit', (event) => {
        event.preventDefault();
        essayer(true);
      });
      $('.jeux-abandon', jeu.corps).addEventListener('click', () => this.terminer());
      majCompte();
      if (!estTelephone()) champ.focus();

      const fin = Date.now() + duree * 1000;
      this.minuterie = window.setInterval(() => {
        const reste = (fin - Date.now()) / 1000;
        const chrono = $('.jeux-chrono', jeu.corps);
        if (chrono) {
          chrono.textContent = formatChrono(reste);
          chrono.classList.toggle('jeux-chrono-fin', reste <= 30);
        }
        if (reste <= 0) this.terminer();
      }, 250);
    },

    // ----- Résultat -----
    terminer() {
      const p = this.en;
      if (!p || p.fin) return;
      window.clearInterval(this.minuterie);
      this.minuterie = null;
      p.fin = Date.now();
      const { mode } = p.reglage;
      const liste = mode === 'liste';
      const total = liste ? p.codesZone.length : p.questions.length;
      const bonnes = liste ? p.trouves.length : p.bonnes;
      const duree = (p.fin - p.debut) / 1000;
      // Les oubliés de la liste s'affichent en rouge sur le globe
      const manques = liste ? p.codesZone.filter((c) => !p.trouves.includes(c)).map((code) => ({ type: 'liste', code })) : p.ratees;
      if (liste) manques.forEach((q) => globe.marquer(q.code, 'rate'));
      for (const [code, etat] of globe.etats) if (etat === 'question') globe.marquer(code, null);
      globe.ecart(null);

      // Pas de record pour la révision : ses questions changent à chaque fois
      const cle = mode === 'revision' ? null : cleRecord(p.reglage);
      const tousRecords = records();
      const ancien = cle ? tousRecords[cle] : null;
      const resultat = { bonnes, total, duree: Math.round(duree) };
      const garde = cle ? meilleur(ancien, resultat) : null;
      const nouveau = garde === resultat && bonnes > 0;
      if (cle && garde === resultat) ecrire('jeux-records', { ...tousRecords, [cle]: resultat });

      const { nom, capitale } = lesNoms();
      const libelleManque = (q) => {
        if (q.type === 'ou-ville') return `${nomVille(q.ville)} · ${nom(q.code)}`;
        if (q.type === 'capitale' || q.type === 'capitale-pays') return `${nom(q.code)} · ${capitale(q.code)}`;
        return nom(q.code);
      };
      const ecartMoyen = p.distances.length ? p.distances.reduce((s, d) => s + d, 0) / p.distances.length : null;
      const restantes = erreurs().length;
      jeu.meta.textContent = t('jeux.meta-fin');
      jeu.corps.innerHTML = `
        <div class="jeux-score">
          <strong>${bonnes}<small> / ${total}</small></strong>
          <span>${t('jeux.en-temps', { duree: formatChrono(duree) })}${!liste && p.meilleureSerie > 1 ? ` · ${t('jeux.meilleure-serie', { n: p.meilleureSerie })}` : ''}</span>
          ${ecartMoyen !== null ? `<span>${t('jeux.ecart-moyen', { distance: formatDistance(Math.round(ecartMoyen) * 1000) })}</span>` : ''}
          <p class="${nouveau ? 'jeux-bravo' : 'note'}">${nouveau
            ? t('jeux.nouveau-record')
            : ancien ? t('jeux.record', { bonnes: ancien.bonnes, total: ancien.total, duree: formatChrono(ancien.duree) }) : ''}</p>
        </div>
        ${manques.length ? `
          <p class="jeux-legende">${t(liste ? 'jeux.oublies' : 'jeux.erreurs', { n: manques.length })}</p>
          <div class="jeux-manques">
            ${manques.map((q, i) => `<button type="button" data-i="${i}"><img src="${drapeau(q.code)}" alt="">${libelleManque(q)}</button>`).join('')}
          </div>` : `<p class="jeux-bravo">${t('jeux.parfait')}</p>`}
        ${!liste && restantes ? `<p class="note">${t('jeux.erreurs-a-reviser', { n: restantes })}</p>` : ''}
        <div class="jeux-fin-actions">
          <button type="button" class="jeux-rejouer">${t(mode === 'revision' && restantes ? 'jeux.reviser-encore' : 'jeux.rejouer')}</button>
          <button type="button" class="jeux-autre">${t('jeux.autre-partie')}</button>
        </div>
      `;
      this.resume();
      jeu.agrandir();
      jeu.corps.querySelectorAll('.jeux-manques button').forEach((bouton) => {
        bouton.addEventListener('click', () => {
          const q = manques[Number(bouton.dataset.i)];
          if (q.type === 'ou-ville') {
            const v = ville(q.ville);
            globe.lieux(p.lieuxTrouves, { position: v.position, nom: nomVille(q.ville) });
            globe.cadrerPoints(v.position, v.position, q.parPays ? ZOOM_MAX_VILLES_PAYS : 4.5);
            return;
          }
          globe.allerA(q.code);
          if (q.type === 'capitale' || q.type === 'capitale-pays') {
            globe.lieux(p.lieuxTrouves, { position: donnees.parCode.get(q.code).capitale.position, nom: capitale(q.code) });
          }
        });
      });
      $('.jeux-rejouer', jeu.corps).addEventListener('click', () => {
        if (mode === 'revision' && !erreurs().length) return;
        this.demarrer({ ...p.reglage });
      });
      $('.jeux-autre', jeu.corps).addEventListener('click', () => {
        this.quitter();
        montrerEcran('accueil');
        ouvrirMenu();
      });
      if (mode === 'revision') return;
      if (p.reglage.sens === 'ville-pays') globe.allerA(p.reglage.zone, ZOOM_MAX_VILLES_PAYS);
      else if (!liste || manques.length < p.codesZone.length) globe.zone(p.reglage.zone);
    },
  };

  surLangue(() => {
    noms = null;
    rendreReglage();
  });
  rendreReglage();

  return {
    id: 'quiz-pays',
    panneau,
    activer() {
      montrerEcran('accueil');
      // Les nombres de pays par zone apparaissent dès que les contours sont là ; sinon ils viendront avec la partie
      preparer().catch(() => {});
    },
    desactiver() {
      partie.quitter();
    },
  };
}
