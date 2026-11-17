// Jeux (lots P.4a et P.4b) : quiz de géographie joué sur le globe. Drapeaux, Capitales, Où est-ce ?, Liste chrono, Révise tes erreurs.
// Chargé à la première ouverture de la ligne du menu ; contours et drapeaux à la première partie (public/data/jeux).
import { creerPanneauCarte } from './panneau-carte.js';
import { bloquerFiches } from './fiche.js';
import { POLICE_GRAS } from './polices.js';
import { lire, ecrire } from './reglages.js';
import { langue } from './preferences.js';
import { surLangue, t, ta, ti, tt } from './i18n.js';
import {
  DUREES_LISTE, LONGUEUR_COURTE, ZONES, cleRecord, formatChrono, index, indexCapitales, jumeau, meilleur, melanger, nomPays, paysDeZone,
  proposerChoix, reconnaitre, suggerer, distanceKm, distancePays, dansPays, seuilVille, SEUIL_PETIT_PAYS, noterErreur, lireErreur, trierFiches, priseAuVol, normaliser,
  densite, dureeListeErreurs, questionSeule, resumeFuseaux,
} from './jeu-calcul.js';
import { formatAltitude, formatDistance, formatSurface, imperial, nombre } from './unites.js';

const SOURCE = 'jeu-pays';
const SOURCE_POINTS = 'jeu-pays-points';
const COUCHES = ['jeu-pays-fond', 'jeu-pays-contour', 'jeu-pays-points', 'jeu-pays-halo'];
const SOURCE_CAPITALE = 'jeu-capitale';
const COUCHES_CAPITALE = ['jeu-lieux-anneau', 'jeu-lieux-noms', 'jeu-lieux-nom', 'jeu-lieux-coeur', 'jeu-noms-pays'];
const ZOOM_PAYS = 4; // cadrage d'un pays après une réponse
// Pictogrammes des cartes de jeu (traits, comme les icônes du menu)
const ICONES_MODES = {
  drapeaux: '<path d="M5 21V4"/><path d="M5 4.5c2.5-1.3 4.5-1.3 7 0s4.5 1.3 7 0v9c-2.5 1.3-4.5 1.3-7 0s-4.5-1.3-7 0"/>',
  capitales: '<path d="m3 9 9-5 9 5"/><path d="M4 9h16"/><path d="M6 9v8m4-8v8m4-8v8m4-8v8"/><path d="M3.5 20h17M4.5 17h15"/>',
  liste: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M12 13.5l2.8 2"/><path d="M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  fiches: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5Z"/><path d="M12 6.5v13"/>',
  ou: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  revision: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 3.5v5h-5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20.5v-5h5"/>',
};
const ICONE_RECOMMENCER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
const ICONE_LIVRE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5Z"/><path d="M12 6.5v13"/></svg>';
const CHEVRON_HAUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
const CHEVRON_BAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const ICONE_VALIDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
// « Je ne sais pas » : un bonhomme qui lève les épaules et les mains, paumes en l'air (comme 🤷)
const ICONE_PASSER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="2.6"/><path d="M9.2 11.2h5.6M9.6 11.2l.4 9.3M14.4 11.2l-.4 9.3"/><path d="M9.2 11.2 6.2 14 3.6 10.2M14.8 11.2l3 2.8 2.6-3.8"/><path d="M2.2 10.2h2.8M19 10.2h2.8"/></svg>';
const SOURCE_OU = 'jeu-ou';
const COUCHES_OU = ['jeu-ou-trait', 'jeu-ou-points', 'jeu-ou-distance'];
const ZOOM_MAX_VILLES_PAYS = 7; // « Villes d'un pays » : assez près pour placer une ville
const MAX_REVISION = 15;
// Carte de montagne cachée pendant la partie, avec tous les textes : le globe seul, et le rose du pays à trouver
// ne se perd plus parmi les routes roses de la nuit
const CARTE_CACHEE = /^(montis-(road|tunnels|chemins|sentiers|path|marches|rail|remontees|batiments|waterway)|nature-rivieres|courbes)/;
// Pays de la question : le rose « laser » de la DA (autoroutes de nuit), avec un halo pour bien le voir
const COULEURS = { question: '#ff4fd8', trouve: '#3ddc97', rate: '#ff5c7a' };
// Assez près pour aller voir une petite île (retour du propriétaire du 17 novembre 2026 : à 5, ses pays et leur nom
// restaient introuvables) ; au-delà, le globe laisse place à la carte de montagne
const ZOOM_MAX_JEU = 7;
const VUES = {
  europe: { center: [15, 53], zoom: 3 },
  monde: { center: [12, 22], zoom: 1.3 },
  afrique: { center: [19, 2], zoom: 2.3 },
  asie: { center: [88, 30], zoom: 2 },
  ameriques: { center: [-78, 8], zoom: 1.7 },
  oceanie: { center: [155, -12], zoom: 2.4 },
};
// Superficie : arrondie au-delà de 1 000 km² (calculée sur les contours), exacte en dessous (chiffre officiel)
const formatSuperficie = (km2) => (km2 >= 1000 ? `≈ ${formatSurface(km2)}` : `${nombre(km2, km2 < 10 ? 2 : 0)} km²`);
const drapeau = (code) => `/data/jeux/drapeaux/${code}.svg`;
// Petit drapeau (vraie image SVG : les émojis de drapeaux ne s'affichent pas sous Windows) devant un nom de pays
const mini = (code, texte) => `<span class="jeux-pays"><img class="jeux-mini-drapeau" src="${drapeau(code)}" alt="" draggable="false">${texte}</span>`;
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

// Chiffres, langues, voisins (scripts/extraire-fiches-pays.mjs) et anecdotes : la fiche s'en passe s'ils manquent
let promesseFiches = null;
function chargerFiches() {
  const lireJson = (adresse) => fetch(adresse).then((reponse) => (reponse.ok ? reponse.json() : null)).catch(() => null);
  promesseFiches ??= Promise.all([lireJson('/data/jeux/fiches.json'), lireJson('/data/jeux/anecdotes.json')]).then(([fiches, anecdotes]) => {
    if (!fiches) promesseFiches = null; // nouvel essai à la prochaine ouverture
    return { fiches, anecdotes };
  });
  return promesseFiches;
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
    zoneFiches: 'europe',
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
        <button type="button" class="jeux-carte" data-mode="fiches">
          <span class="jeux-carte-icone jeux-carte-fiches" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES_MODES.fiches}</svg></span>
          <span class="jeux-carte-textes">
            <strong ${ti('jeux.carte-fiches')}>${t('jeux.carte-fiches')}</strong>
            <span ${ti('jeux.carte-fiches-aide')}>${t('jeux.carte-fiches-aide')}</span>
          </span>
          <svg class="jeux-carte-fleche" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
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
    <div class="jeux-fiches" hidden>
      <button type="button" class="jeux-retour-cartes" ${ta('aria-label', 'jeux.retour-cartes')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><strong ${ti('jeux.carte-fiches')}>${t('jeux.carte-fiches')}</strong>
      </button>
      <p class="note" ${ti('jeux.fiches-aide')}>${t('jeux.fiches-aide')}</p>
      <label class="jeux-fiches-recherche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>
        <input type="search" enterkeyhint="search" autocapitalize="off" spellcheck="false" ${ta('placeholder', 'jeux.fiches-chercher')} ${ta('aria-label', 'jeux.fiches-chercher')}>
      </label>
      <div class="jeux-zones" data-choix="zoneFiches" role="group" ${ta('aria-label', 'jeux.zone')}>
        ${ZONES.map((zone) => `<button type="button" data-valeur="${zone}"><span ${ti(`jeux.zone-${zone}`)}>${t(`jeux.zone-${zone}`)}</span><small></small></button>`).join('')}
      </div>
      <div class="jeux-fiches-liste"></div>
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
      <button type="button" class="jeux-reviser-avant">${ICONE_LIVRE}<span ${ti('jeux.reviser-avant')}>${t('jeux.reviser-avant')}</span></button>
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
  let retourFiches = 'accueil';

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
    $('.jeux-fiches').hidden = ecran !== 'fiches';
    rendreReglage();
    if (ecran === 'fiches') rendreFiches();
  }

  // Liste des fiches de la zone, groupées par région et triées par endroit
  let ordreFiches = [];
  function rendreFiches() {
    const liste = $('.jeux-fiches-liste');
    if (!donnees) return;
    const { nom, capitale } = lesNoms();
    // Recherche : sur tous les pays, par nom (noms courants compris) ou par capitale ; la zone ne compte plus
    const recherche = normaliser($('.jeux-fiches-recherche input').value, langue());
    $('.jeux-fiches [data-choix="zoneFiches"]').hidden = Boolean(recherche);
    let pays = donnees.pays;
    if (recherche) {
      const { entrees, capitales } = lesNoms();
      const trouve = (liste, code) => liste.find((e) => e.code === code).ecritures.some((e) => e.includes(recherche));
      pays = pays.filter((p) => trouve(entrees, p.code) || trouve(capitales, p.code));
    }
    const groupes = trierFiches(pays, recherche ? 'monde' : choix.zoneFiches);
    ordreFiches = groupes.flatMap((g) => g.codes);
    if (!ordreFiches.length) {
      liste.innerHTML = `<p class="note">${t('jeux.fiches-aucun')}</p>`;
      return;
    }
    liste.innerHTML = groupes.map((g) => `
      <h4 class="jeux-fiches-region">${t(`jeux.region-${g.region}`)}</h4>
      ${g.codes.map((code) => `
        <button type="button" class="jeux-fiche-ligne" data-code="${code}">
          <img src="${drapeau(code)}" alt="" loading="lazy">
          <span><strong>${nom(code)}</strong><small>${capitale(code)} · ${formatSuperficie(donnees.parCode.get(code).superficie)}</small></span>
        </button>`).join('')}`).join('');
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
    panneau.querySelectorAll('.jeux-carte').forEach((carte) => {
      if (!$('.jeux-carte-record', carte)) return; // Fiches et Révision n'ont pas de record
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
      // Les fiches comptent toujours des pays
      const fiches = petit.closest('[data-choix]').dataset.choix === 'zoneFiches';
      const valeur = fiches ? nombres?.[petit.parentElement.dataset.valeur] ?? null : compte(petit.parentElement.dataset.valeur);
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
    if (carte?.dataset.mode === 'fiches') {
      preparer().then(() => montrerEcran('fiches'), () => message(t(navigator.onLine ? 'jeux.erreur-chargement' : 'jeux.erreur-hors-ligne'), $('.jeux-message-accueil')));
      return;
    }
    const ligneFiche = event.target.closest('.jeux-fiche-ligne');
    if (ligneFiche) {
      fermerMenu();
      partie.fiches(ordreFiches, ordreFiches.indexOf(ligneFiche.dataset.code), choix.zoneFiches);
      return;
    }
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
      montrerEcran(ecran === 'fiches' ? retourFiches : 'accueil');
      retourFiches = 'accueil';
      return;
    }
    const bouton = event.target.closest('[data-choix] button');
    if (!bouton) return;
    choix[bouton.closest('[data-choix]').dataset.choix] = bouton.dataset.valeur;
    ecrire('jeux-choix', choix);
    rendreReglage();
    if (ecran === 'fiches') rendreFiches();
  });

  $('.jeux-fiches-recherche input').addEventListener('input', () => rendreFiches());
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
    const [brut, villes, { fiches, anecdotes }] = await Promise.all([chargerPays(), chargerVilles(), chargerFiches()]);
    const pays = brut.features.map((f) => f.properties);
    nombres = Object.fromEntries(ZONES.map((zone) => [zone, paysDeZone(pays, zone).length]));
    const points = {
      type: 'FeatureCollection',
      features: pays.filter((p) => p.petit).map((p) => ({ type: 'Feature', properties: { code: p.code }, geometry: { type: 'Point', coordinates: p.centre } })),
    };
    const geometries = new Map(brut.features.map((f) => [f.properties.code, f.geometry.coordinates]));
    donnees = { brut, pays, parCode: new Map(pays.map((p) => [p.code, p])), points, villes, geometries, fiches, anecdotes };
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
  $('.jeux-reviser-avant').addEventListener('click', () => {
    preparer().then(() => {
      const villesPays = choix.mode === 'ou' && choix.cible === 'ville-pays';
      choix.zoneFiches = villesPays ? donnees.parCode.get(choix.paysVilles).zones.find((z) => z !== 'monde') ?? 'monde' : choix.zone;
      ecrire('jeux-choix', choix);
      $('.jeux-fiches-recherche input').value = villesPays ? lesNoms().nom(choix.paysVilles) : '';
      retourFiches = 'options';
      montrerEcran('fiches');
    }, () => message(t(navigator.onLine ? 'jeux.erreur-chargement' : 'jeux.erreur-hors-ligne')));
  });

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
      // Éclat d'un pays qui vient d'être trouvé (pulser), de 1 à 0 en une seconde
      const eclat = ['coalesce', ['feature-state', 'eclat'], 0];
      const dansZone = ['in', ['get', 'code'], ['literal', codesZone]];
      if (!map.getLayer(COUCHES[0])) {
        map.addLayer({ id: COUCHES[0], type: 'fill', source: SOURCE, filter: dansZone, paint: { 'fill-color': couleur, 'fill-opacity': ['+', 0.62, ['*', 0.33, eclat]] } });
        map.addLayer({
          id: COUCHES[3], type: 'line', source: SOURCE, filter: dansZone,
          paint: {
            'line-color': ['match', ['feature-state', 'etat'], 'trouve', COULEURS.trouve, COULEURS.question],
            // Pas de halo sur un très petit pays : son point le remplace
            'line-opacity': ['case', ['has', 'petit'], 0, ['match', ['feature-state', 'etat'], 'question', 0.7, ['*', 0.9, eclat]]],
            'line-width': ['+', 9, ['*', 10, eclat]],
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
              1, ['+', ['case', ['==', ['feature-state', 'etat'], 'question'], 8, 3], ['*', 7, eclat]],
              5, ['+', ['case', ['==', ['feature-state', 'etat'], 'question'], 10, 6], ['*', 9, eclat]],
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
    // `eclat` : un pays trouvé s'illumine un instant (retour du propriétaire du 17 novembre 2026)
    marquer(code, etat, { eclat = true } = {}) {
      for (const source of [SOURCE, SOURCE_POINTS]) map.setFeatureState({ source, id: code }, { etat: etat || null, eclat: 0 });
      if (etat) this.etats.set(code, etat);
      else this.etats.delete(code);
      if (etat === 'trouve' && eclat) this.pulser(code);
    },
    pulser(code) {
      const debut = performance.now();
      const etape = (maintenant) => {
        if (!map.getSource(SOURCE) || this.etats.get(code) !== 'trouve') return;
        const avance = Math.min(1, (maintenant - debut) / 1000);
        const valeur = (1 - avance) ** 2;
        for (const source of [SOURCE, SOURCE_POINTS]) map.setFeatureState({ source, id: code }, { eclat: valeur });
        if (avance < 1) requestAnimationFrame(etape);
      };
      requestAnimationFrame(etape);
    },
    toutEffacer() {
      for (const code of this.etats.keys()) {
        for (const source of [SOURCE, SOURCE_POINTS]) map.setFeatureState({ source, id: code }, { etat: null });
      }
      this.etats.clear();
    },
    marge() {
      const cadre = jeu.element.getBoundingClientRect();
      // Sur téléphone, le panneau (et le clavier sous lui) occupe le bas de l'écran : le globe se centre au-dessus
      if (estTelephone()) {
        const bas = jeu.element.hidden ? 0 : Math.min(window.innerHeight - cadre.top, window.innerHeight * 0.7);
        return { top: 70, bottom: Math.max(0, bas) + 16, left: 30, right: 80 };
      }
      // À droite, la colonne des boutons de la carte
      return { top: 70, bottom: 20, left: Math.max(30, jeu.element.hidden ? 0 : cadre.right + 10), right: 80 };
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
    // Repères de la partie, gardés jusqu'à la fin : villes et capitales répondues (juste en vert, ratée en rouge,
    // demande du propriétaire du 17 novembre 2026), la dernière en grand, et le nom des pays répondus.
    // Lieu : { position, nom, juste } (juste null : une fiche, en rose) ; pays : même forme, à leur centre.
    lieux(liste, courant = null, pays = []) {
      const etat = (juste) => (juste === true ? 'juste' : juste === false ? 'faux' : 'neutre');
      const point = (lieu, genre, actuelle = false) => ({
        type: 'Feature',
        properties: { nom: lieu.nom, genre, actuelle, etat: etat(lieu.juste), petit: Boolean(lieu.petit) },
        geometry: { type: 'Point', coordinates: lieu.position },
      });
      const donneesPoints = {
        type: 'FeatureCollection',
        features: [
          ...pays.map((l) => point(l, 'pays')),
          ...liste.filter((l) => l.nom !== courant?.nom).map((l) => point(l, 'lieu')),
          ...(courant ? [point(courant, 'lieu', true)] : []),
        ],
      };
      const source = map.getSource(SOURCE_CAPITALE);
      if (source) {
        source.setData(donneesPoints);
        return;
      }
      if (!donneesPoints.features.length) return;
      map.addSource(SOURCE_CAPITALE, { type: 'geojson', data: donneesPoints });
      const couleur = ['match', ['get', 'etat'], 'juste', COULEURS.trouve, 'faux', COULEURS.rate, COULEURS.question];
      const texte = ['match', ['get', 'etat'], 'juste', '#e9fff6', 'faux', '#ffe9ed', '#ffffff'];
      const halo = ['match', ['get', 'etat'], 'juste', 'rgba(61, 220, 151, 0.5)', 'faux', 'rgba(255, 92, 122, 0.5)', 'rgba(255, 79, 216, 0.5)'];
      const estLieu = ['==', ['get', 'genre'], 'lieu'];
      // Nom des pays : petites capitales espacées, sous les repères
      map.addLayer({
        id: COUCHES_CAPITALE[4], type: 'symbol', source: SOURCE_CAPITALE, filter: ['==', ['get', 'genre'], 'pays'],
        // Un petit pays (île, micro-État) passe en premier et cherche une place à côté de son point : au centre,
        // son nom était caché par celui d'un voisin ou par son propre repère
        layout: {
          'text-field': ['get', 'nom'], 'text-font': POLICE_GRAS, 'text-size': ['case', ['get', 'petit'], 9.5, 10.5], 'text-transform': 'uppercase',
          'text-letter-spacing': 0.14, 'text-max-width': 8, 'text-padding': 1,
          'symbol-sort-key': ['case', ['get', 'petit'], 0, 1],
          'text-variable-anchor-offset': ['case', ['get', 'petit'],
            ['literal', ['left', [0.9, 0], 'right', [-0.9, 0], 'top', [0, 0.9], 'bottom', [0, -0.9]]],
            ['literal', ['center', [0, 0]]]],
        },
        paint: { 'text-color': texte, 'text-opacity': 0.9, 'text-halo-color': halo, 'text-halo-width': 1.4, 'text-halo-blur': 1 },
      });
      // Repère : un anneau à la couleur de la réponse, un point au centre
      map.addLayer({
        id: COUCHES_CAPITALE[0], type: 'circle', source: SOURCE_CAPITALE, filter: estLieu,
        paint: {
          'circle-radius': ['case', ['get', 'actuelle'], 6.5, 4.5],
          'circle-color': '#0b1020',
          'circle-stroke-color': couleur,
          'circle-stroke-width': ['case', ['get', 'actuelle'], 2.5, 2],
        },
      });
      map.addLayer({
        id: COUCHES_CAPITALE[3], type: 'circle', source: SOURCE_CAPITALE, filter: estLieu,
        paint: { 'circle-radius': ['case', ['get', 'actuelle'], 2.4, 1.7], 'circle-color': couleur },
      });
      // Les noms gardés s'effacent entre eux s'ils se chevauchent ; la dernière réponse passe toujours
      map.addLayer({
        id: COUCHES_CAPITALE[1], type: 'symbol', source: SOURCE_CAPITALE, filter: ['all', estLieu, ['!', ['get', 'actuelle']]],
        layout: {
          'text-field': ['get', 'nom'], 'text-font': POLICE_GRAS, 'text-size': 12, 'text-letter-spacing': 0.03,
          'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-optional': true,
        },
        paint: { 'text-color': texte, 'text-halo-color': halo, 'text-halo-width': 1.6, 'text-halo-blur': 1 },
      });
      map.addLayer({
        id: COUCHES_CAPITALE[2], type: 'symbol', source: SOURCE_CAPITALE, filter: ['all', estLieu, ['get', 'actuelle']],
        layout: {
          'text-field': ['get', 'nom'], 'text-font': POLICE_GRAS, 'text-size': 15.5, 'text-letter-spacing': 0.03,
          'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': texte, 'text-halo-color': halo, 'text-halo-width': 2, 'text-halo-blur': 1.2 },
      });
    },
    // Appui et vrai lieu, reliés en tirets ; sans appui, tout s'efface
    // `texte` : la distance écrite sur le trait ; `appuiFaux` : l'appui en rouge (revue des erreurs)
    ecart(appui, cible, juste, { texte = '', appuiFaux = false } = {}) {
      const donneesOu = {
        type: 'FeatureCollection',
        features: appui ? [
          { type: 'Feature', properties: { genre: 'trait', texte }, geometry: { type: 'LineString', coordinates: [appui, cible] } },
          { type: 'Feature', properties: { genre: appuiFaux ? 'appui-faux' : 'appui' }, geometry: { type: 'Point', coordinates: appui } },
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
          'circle-radius': ['match', ['get', 'genre'], 'appui', 6, 'appui-faux', 6, 7],
          'circle-color': ['match', ['get', 'genre'], 'appui', COULEURS.question, 'juste', COULEURS.trouve, COULEURS.rate],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: COUCHES_OU[2], type: 'symbol', source: SOURCE_OU, filter: ['all', ['==', ['get', 'genre'], 'trait'], ['!=', ['get', 'texte'], '']],
        layout: {
          'symbol-placement': 'line-center', 'text-field': ['get', 'texte'], 'text-font': POLICE_GRAS, 'text-size': 13.5,
          'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -0.9],
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(255, 92, 122, 0.75)', 'text-halo-width': 2, 'text-halo-blur': 1 },
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

  // Barre de la partie, au-dessus des questions : chrono, avancement, ↻ (retour du propriétaire du 17 novembre 2026).
  // En liste chrono sur téléphone, elle est tout le panneau avec le champ ; ⌃ ou un glissé vers le haut déplie les trouvés.
  const barre = document.createElement('div');
  barre.className = 'jeux-barre';
  barre.hidden = true;
  // Une seule ligne fine (retour du 17 novembre 2026, deuxième passe) : chrono, avancement, puis la question
  // (ou le champ de la liste chrono), ↻ et, sur téléphone, ⌄ pour réduire le panneau.
  barre.innerHTML = `
    <span class="jeux-barre-chrono" aria-live="off"></span>
    <span class="jeux-barre-compte"></span>
    <span class="jeux-barre-milieu"></span>
    <button type="button" class="jeux-recommencer jeux-icone" ${ta('aria-label', 'jeux.recommencer-aide')} ${ta('title', 'jeux.recommencer-aide')}>${ICONE_RECOMMENCER}</button>
    <button type="button" class="jeux-deplier jeux-icone" ${ta('aria-label', 'jeux.trouves-voir')} hidden>${CHEVRON_HAUT}</button>
    <button type="button" class="jeux-reduire jeux-icone" ${ta('aria-label', 'jeux.reduire')} ${ta('title', 'jeux.reduire')}>${CHEVRON_BAS}</button>
  `;
  jeu.corps.before(barre);
  const barreChrono = $('.jeux-barre-chrono', barre);
  const barreCompte = $('.jeux-barre-compte', barre);
  const barreMilieu = $('.jeux-barre-milieu', barre);
  $('.jeux-recommencer', barre).addEventListener('click', () => partie.recommencer());
  const reduireJeu = () => {
    document.activeElement?.blur?.();
    deplier(false);
    $('.bf-reduire', jeu.element).click();
  };
  $('.jeux-reduire', barre).addEventListener('click', reduireJeu);
  const deplier = (oui) => {
    // Le tiroir des trouvés se montre clavier fermé
    if (oui) document.activeElement?.blur?.();
    jeu.element.classList.toggle('jeux-deplie', oui);
    $('.jeux-deplier', barre).setAttribute('aria-expanded', String(oui));
    recadrerBientot();
  };
  $('.jeux-deplier', barre).addEventListener('click', () => deplier(!jeu.element.classList.contains('jeux-deplie')));
  // Glisser la barre vers le haut déplie les trouvés (liste chrono), vers le bas les replie, puis réduit le panneau ;
  // un appui ailleurs que sur un bouton ou le champ rouvre le clavier
  let departGlisse = null;
  barre.addEventListener('pointerdown', (event) => { departGlisse = event.clientY; });
  barre.addEventListener('pointerup', (event) => {
    if (departGlisse === null) return;
    const ecartY = event.clientY - departGlisse;
    departGlisse = null;
    if (jeu.element.classList.contains('jeux-compact') && Math.abs(ecartY) > 28) {
      const deplie = jeu.element.classList.contains('jeux-deplie');
      if (ecartY < 0 && !$('.jeux-deplier', barre).hidden) deplier(true);
      else if (ecartY > 0 && deplie) deplier(false);
      else if (ecartY > 0) reduireJeu();
      return;
    }
    if (!event.target.closest('button, input')) $('.jeux-saisie input:not([readonly])', jeu.element)?.focus();
  });
  barre.addEventListener('pointercancel', () => { departGlisse = null; });

  // ---------- Clavier sur téléphone ----------
  // La barre de saisie se colle au-dessus du clavier : sa hauteur se lit dans visualViewport (iOS Safari ne
  // redimensionne pas la page, Chrome Android non plus par défaut ; s'il le fait, la hauteur lue vaut zéro et le
  // panneau, en bas de la page, est déjà au-dessus du clavier). La carte se recadre dans ce qui reste.
  // Le clavier se juge à la hauteur visible, pas au focus : le geste retour d'Android ferme le clavier mais laisse le
  // focus au champ (la barre restait alors en forme « clavier », sans « Je ne sais pas », et toucher ce champ ne
  // rouvrait pas toujours le clavier). Clavier refermé avec le focus : le champ le rend, un appui le rouvre.
  // La mise en page ne change qu'une fois le clavier levé : la changer dès le focus déplaçait le champ sous le doigt.
  let clavierOuvert = false;
  const SEUIL_CLAVIER = 150; // px de hauteur perdue : en dessous, c'est la barre d'adresse qui bouge
  const pleine = { largeur: 0, hauteur: 0 }; // hauteur de la page sans clavier, pour cette largeur
  let attenteRecadrage = 0;
  function recadrerBientot() {
    if (attenteRecadrage) return;
    attenteRecadrage = requestAnimationFrame(() => {
      attenteRecadrage = 0;
      if (partie.en && !jeu.element.hidden) map.easeTo({ padding: globe.marge(), duration: 280 });
    });
  }
  function majClavier() {
    const vv = window.visualViewport;
    const actif = document.activeElement;
    const saisie = estTelephone() && !jeu.element.hidden && jeu.element.contains(actif) && actif.matches('input[type="text"]');
    // × scale : un zoom à deux doigts réduit aussi vv.height, sans clavier
    const visible = vv ? vv.height * vv.scale : window.innerHeight;
    if (window.innerWidth !== pleine.largeur) Object.assign(pleine, { largeur: window.innerWidth, hauteur: 0 });
    pleine.hauteur = Math.max(pleine.hauteur, window.innerHeight);
    const leve = saisie && pleine.hauteur - visible > SEUIL_CLAVIER;
    if (clavierOuvert && !leve && saisie) {
      // Clavier fermé par le geste retour, champ toujours au focus
      clavierOuvert = false;
      actif.blur();
      return;
    }
    const hauteur = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    jeu.element.style.setProperty('--clavier', `${leve ? hauteur : 0}px`);
    jeu.element.style.setProperty('--hauteur-visible', `${Math.round(vv ? vv.height : visible)}px`);
    const change = leve !== clavierOuvert;
    clavierOuvert = leve;
    jeu.element.classList.toggle('jeux-clavier', leve);
    if (change || leve) recadrerBientot();
  }
  window.addEventListener('resize', majClavier);
  window.visualViewport?.addEventListener('resize', majClavier);
  window.visualViewport?.addEventListener('scroll', majClavier);
  jeu.element.addEventListener('focusin', majClavier);
  // Après un appui sur une suggestion, le temps que le clic arrive avant que le panneau ne change de forme
  jeu.element.addEventListener('focusout', () => setTimeout(majClavier, 160));
  // Clavier ouvert : un bouton du panneau ne lui prend pas le focus (sinon le clavier se ferme et tout bouge sous le doigt)
  jeu.element.addEventListener('mousedown', (event) => {
    if (clavierOuvert && event.target.closest('button')) event.preventDefault();
  });
  // Un appui sur la carte ferme le clavier, et le geste continue (déplacer, zoomer)
  const fermerClavier = () => {
    if (clavierOuvert) document.activeElement?.blur();
  };

  // ---------- Geste retour sur téléphone ----------
  // Pendant une partie, une entrée d'historique est posée : le retour (glissé du bord, bouton d'Android) réduit le
  // panneau au lieu de quitter l'appli. Panneau déjà réduit, le retour suivant fait son office habituel.
  let entreeRetour = false;
  const armerRetour = () => {
    if (entreeRetour || !estTelephone() || !partie.en || partie.en.fin || jeu.element.hidden || jeu.element.classList.contains('bf-reduite')) return;
    history.pushState({ montisJeu: true }, '');
    entreeRetour = true;
  };
  const desarmerRetour = () => {
    if (!entreeRetour) return;
    entreeRetour = false;
    if (history.state?.montisJeu) history.back();
  };
  window.addEventListener('popstate', () => {
    if (!entreeRetour) return;
    entreeRetour = false;
    if (partie.en && !jeu.element.hidden) reduireJeu();
  });
  window.addEventListener('panneau-carte', () => {
    if (jeu.element.hidden || jeu.element.classList.contains('bf-reduite') || !partie.en || partie.en.fin) desarmerRetour();
    else armerRetour();
  });

  // R relance la partie sur ordinateur (Alt+R depuis un champ de saisie)
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyR' || event.ctrlKey || event.metaKey || !partie.en || partie.en.reglage.mode === 'fiches' || jeu.element.hidden) return;
    const champ = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (champ && !event.altKey) return;
    event.preventDefault();
    partie.recommencer();
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
  // Nom d'un pays avec son petit drapeau, là où le drapeau ne donne pas la réponse
  const paysAvecDrapeau = (code) => mini(code, lesNoms().nom(code));

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

  // Titre de la partie : le jeu et sa zone (ou le pays des villes), « · erreurs » quand on rejoue ses erreurs
  function titrePartie(reglage, erreursSeules = false) {
    const suffixe = erreursSeules ? ` · ${t('jeux.titre-erreurs')}` : '';
    if (reglage.mode === 'revision') return t('jeux.carte-revision') + suffixe;
    const jeuNom = t(`jeux.carte-${reglage.mode}`);
    const lieu = reglage.mode === 'ou' && reglage.sens === 'ville-pays' ? lesNoms().nom(reglage.zone) : t(`jeux.zone-${reglage.zone}`);
    return `${jeuNom} · ${lieu}${suffixe}`;
  }

  // Fiches à réviser, triées par région et d'ouest en est
  const ordonner = (codes) => trierFiches([...new Set(codes)].map((c) => donnees.parCode.get(c)).filter(Boolean), 'monde').flatMap((g) => g.codes);

  // La question dans la barre : `consigne` en entier pour les lecteurs d'écran et au survol, `court` à l'écran
  function poserQuestion(consigne, court, contenu) {
    barreMilieu.innerHTML = `<span class="jeux-question" title="${consigne}" aria-label="${consigne}"><small>${court}</small>${contenu}</span>`;
  }
  const boutonPasser = () => `<button type="button" class="jeux-passer jeux-icone" aria-label="${t('jeux.passer')}" title="${t('jeux.passer')}">${ICONE_PASSER}</button>`;

  const partie = {
    en: null, // la partie en cours
    minuterie: null,
    ecouteAppui: null,

    // `questions` : rejouer ces questions-là (« Rejouer mes erreurs ») ; `codes` : la liste chrono de ces pays-là
    demarrer(reglage, { questions = null, codes = null } = {}) {
      if (this.en) this.arreterSansRetour();
      const villesPays = reglage.mode === 'ou' && reglage.sens === 'ville-pays';
      const revision = reglage.mode === 'revision';
      const liste = reglage.mode === 'liste';
      const tous = donnees.pays.map((p) => p.code);
      const imposees = questions?.length ? questions.map(questionSeule) : null;
      const codesListe = liste && codes?.length ? codes : null;
      const codesZone = codesListe ?? (villesPays ? [reglage.zone] : revision ? tous : paysDeZone(donnees.pays, reglage.zone));
      const zoomMax = villesPays || revision ? ZOOM_MAX_VILLES_PAYS : ZOOM_MAX_JEU;
      this.en = {
        reglage,
        codesZone,
        tous,
        zoomMax,
        imposees,
        codesListe,
        erreursSeules: Boolean(imposees || codesListe),
        questions: liste ? codesZone : imposees ? melanger(imposees) : construireQuestions(reglage),
        duree: liste ? (codesListe ? dureeListeErreurs(codesListe.length, reglage.zone) : DUREES_LISTE[reglage.zone]) : null,
        indice: 0,
        bonnes: 0,
        serie: 0,
        meilleureSerie: 0,
        ratees: [], // questions ratées, avec la réponse donnée (reponse, point, distance)
        trouves: [],
        lieux: [], // villes et capitales répondues
        paysRepondus: new Map(), // code → juste
        courant: null,
        distances: [],
        debut: Date.now(),
        fin: null,
        repondu: false,
      };
      if (!this.en.questions.length) {
        this.en = null;
        return;
      }
      bloquerFiches(true);
      jeu.titre.textContent = titrePartie(reglage, this.en.erreursSeules);
      jeu.afficher();
      jeu.element.classList.remove('jeux-deplie');
      globe.poser(codesZone, zoomMax);
      // Toucher le globe répond aux questions « Où est-ce ? » ; toucher la carte ferme le clavier
      this.ecouteAppui = (event) => this.appui([event.lngLat.lng, event.lngLat.lat]);
      map.on('click', this.ecouteAppui);
      map.on('touchstart', fermerClavier);
      map.on('mousedown', fermerClavier);
      barre.hidden = false;
      barreMilieu.innerHTML = '';
      this.lancerChrono();
      if (liste) {
        this.liste();
        requestAnimationFrame(() => globe.zone(reglage.zone));
        return;
      }
      // Sur téléphone, plus d'en-tête : la barre fine porte tout, ⌄ réduit le panneau
      jeu.element.classList.toggle('jeux-compact', estTelephone());
      jeu.agrandir();
      $('.jeux-deplier', barre).hidden = true;
      this.question();
      // Les drapeaux et capitales restent sur la zone ; le reste se cadre à chaque question
      const premiere = this.en.questions[0];
      if (!revision && reglage.mode !== 'ou' && !['drapeau-pays', 'capitale'].includes(premiere?.type)) {
        requestAnimationFrame(() => globe.zone(reglage.zone));
      }
    },

    // ↻, R ou « Recommencer » : la même partie, chrono et score à zéro
    recommencer() {
      const p = this.en;
      if (!p || p.reglage.mode === 'fiches') return;
      if (p.reglage.mode === 'revision' && !p.imposees && !erreurs().length) return;
      this.demarrer(p.reglage, { questions: p.imposees, codes: p.codesListe });
    },

    // Chrono de la barre : à rebours en liste, depuis le début ailleurs
    lancerChrono() {
      window.clearInterval(this.minuterie);
      const tic = () => {
        const p = this.en;
        if (!p || p.fin) return;
        if (p.reglage.mode === 'liste') {
          const reste = p.duree - (Date.now() - p.debut) / 1000;
          barreChrono.textContent = formatChrono(reste);
          barreChrono.classList.toggle('jeux-chrono-fin', reste <= 30);
          if (reste <= 0) this.terminer();
        } else {
          barreChrono.textContent = formatChrono((Date.now() - p.debut) / 1000);
          barreChrono.classList.remove('jeux-chrono-fin');
        }
      };
      tic();
      this.minuterie = window.setInterval(tic, 250);
    },

    // Fermer sans retour à la vue d'avant (pour enchaîner une autre partie)
    arreterSansRetour() {
      window.clearInterval(this.minuterie);
      this.minuterie = null;
      if (this.ecouteAppui) map.off('click', this.ecouteAppui);
      this.ecouteAppui = null;
      map.off('touchstart', fermerClavier);
      map.off('mousedown', fermerClavier);
      globe.toutEffacer();
      globe.ecart(null);
      globe.lieux([]);
    },

    quitter() {
      barre.hidden = true;
      barreMilieu.innerHTML = '';
      jeu.element.classList.remove('jeux-compact', 'jeux-deplie', 'jeux-clavier');
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
      barreCompte.textContent = `${fait}/${total}`;
      jeu.definirResume({ nom: titrePartie(p.reglage, p.erreursSeules), detail: '', valeur: `${fait}/${total}`, unite: '' });
    },

    // Repères gardés sur le globe, et le nom des pays répondus ; `courant` : la dernière réponse, en grand
    afficherLieux(courant = null) {
      const p = this.en;
      const { nom } = lesNoms();
      const pays = [...p.paysRepondus].map(([code, juste]) => ({ position: donnees.parCode.get(code).centre, nom: nom(code), juste, petit: donnees.parCode.get(code).petit }));
      globe.lieux(p.lieux, courant, pays);
    },

    // Le globe de la partie, tel qu'à la fin (après la revue des erreurs ou une fiche)
    restaurerGlobe() {
      const p = this.en;
      globe.toutEffacer();
      globe.ecart(null);
      for (const [code, juste] of p.paysRepondus) globe.marquer(code, juste ? 'trouve' : 'rate', { eclat: false });
      this.afficherLieux();
    },

    // Cadrage au début d'une question « Où est-ce ? » : la zone, ou le pays des villes
    cadrerQuestion(q) {
      const p = this.en;
      if (q.parPays) globe.allerA(q.code, ZOOM_MAX_VILLES_PAYS);
      else globe.zone(p.reglage.mode === 'revision' || p.erreursSeules ? donnees.parCode.get(q.code).zones[0] : p.reglage.zone);
    },

    // ----- Une question : quatre choix, le nom à taper, ou toucher le globe -----
    // `garderClavier` : la question d'avant se tapait clavier ouvert, il reste ouvert (téléphone)
    question({ garderClavier = false } = {}) {
      const p = this.en;
      const q = p.questions[p.indice];
      const { code, type } = q;
      const niveau = p.reglage.niveau;
      p.repondu = false;
      const { nom, capitale } = lesNoms();
      jeu.meta.textContent = t('jeux.meta-question', { n: p.indice + 1, total: p.questions.length, bonnes: p.bonnes, serie: p.serie });
      this.resume();
      globe.ecart(null);
      p.courant = null;
      this.afficherLieux();

      if (type === 'ou-pays' || type === 'ou-ville') {
        // Le drapeau du pays n'aide pas à le placer ; pour une ville du monde, il dit son pays (indice voulu)
        const cible = type === 'ou-ville' ? `${q.parPays ? '' : `<img src="${drapeau(code)}" alt="" draggable="false">`}${nomVille(q.ville)}` : `<img src="${drapeau(code)}" alt="" draggable="false">${nom(code)}`;
        poserQuestion(t(type === 'ou-ville' ? 'jeux.consigne-ou-ville' : 'jeux.consigne-ou-pays'), t('jeux.court-ou'), `<b>${cible}</b>`);
        jeu.corps.innerHTML = `
          <div class="jeux-ou-ligne">
            <p class="note jeux-ou-aide">${t('jeux.ou-aide')}</p>
            ${boutonPasser()}
          </div>
          <div class="jeux-retour" aria-live="polite"></div>
        `;
        $('.jeux-passer', jeu.corps).addEventListener('click', () => this.appui(null));
        requestAnimationFrame(() => this.cadrerQuestion(q));
        return;
      }

      // Pool des leurres : la zone de la partie, ou celle du pays en révision
      const pool = p.reglage.mode === 'revision' || p.erreursSeules ? paysDeZone(donnees.pays, donnees.parCode.get(code).zones[0]) : p.codesZone;
      const choix = proposerChoix(code, pool, p.tous);
      const chercheCapitale = type === 'capitale';
      // Les pays proposés pour une capitale ont leur drapeau ; devant un drapeau, non (il donnerait la réponse)
      const libelle = (c) => (chercheCapitale ? capitale(c) : type === 'capitale-pays' ? paysAvecDrapeau(c) : nom(c));
      // La question tient dans la barre : une consigne courte, puis le drapeau, le pays ou la capitale
      if (type === 'drapeau-pays') {
        poserQuestion(t('jeux.consigne-pays'), t('jeux.court-drapeau-pays'), '');
      } else if (type === 'drapeau') {
        poserQuestion(t('jeux.consigne-drapeau'), t('jeux.court-pays'), `<img class="jeux-drapeau" src="${drapeau(code)}" alt="${t('jeux.drapeau-mystere')}" draggable="false">`);
      } else if (chercheCapitale) {
        poserQuestion(t('jeux.consigne-capitale'), t('jeux.court-capitale'), `<b><img src="${drapeau(code)}" alt="" draggable="false">${nom(code)}</b>`);
      } else {
        poserQuestion(t('jeux.consigne-capitale-pays'), t('jeux.court-pays'), `<b>${capitale(code)}</b>`);
      }
      const placeholder = t(chercheCapitale ? 'jeux.taper-capitale' : 'jeux.taper-pays');
      const reponses = type === 'drapeau-pays'
        ? `<div class="jeux-choix jeux-choix-drapeaux">
            ${choix.map((c) => `<button type="button" data-code="${c}" aria-label="${t('jeux.drapeau-de', { nom: nom(c) })}"><img src="${drapeau(c)}" alt="" draggable="false"></button>`).join('')}
          </div>`
        : niveau === 'expert'
          ? `<div class="jeux-suggestions"></div>
            <form class="jeux-saisie" autocomplete="off">
              <input type="text" enterkeyhint="go" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${placeholder}" aria-label="${placeholder}">
              <button type="submit" class="jeux-valider jeux-icone" aria-label="${t('jeux.valider')}" title="${t('jeux.valider')}">${ICONE_VALIDER}</button>
              ${boutonPasser()}
            </form>`
          : `<div class="jeux-choix">${choix.map((c) => `<button type="button" data-code="${c}">${libelle(c)}</button>`).join('')}</div>`;
      jeu.corps.innerHTML = `
        ${reponses}
        <div class="jeux-retour" aria-live="polite"></div>
      `;
      if (type === 'drapeau-pays' || type === 'capitale') {
        // Le pays de la question s'allume ; après le dessin du panneau, dont la hauteur décide de la marge
        globe.marquer(code, 'question');
        requestAnimationFrame(() => globe.allerA(code));
      } else if (p.reglage.mode === 'revision' || p.erreursSeules) {
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
          // Réponse donnée : Entrée passe à la suite, sans fermer le clavier
          if (p.repondu) {
            $('.jeux-suivant', jeu.corps)?.click();
            return;
          }
          const trouve = reconnaitre(champ.value, index(), { tolerant: true, langue: langue() });
          if (!trouve) {
            $('.jeux-retour', jeu.corps).innerHTML = `<p class="jeux-inconnu">${t(chercheCapitale ? 'jeux.inconnue-capitale' : 'jeux.inconnu')}</p>`;
            return;
          }
          this.repondre(trouve);
        });
        $('.jeux-passer', jeu.corps).addEventListener('click', () => this.repondre(null));
        // Sur téléphone, le clavier ne s'ouvre pas tout seul, sauf s'il l'était déjà (appui sur Suivant ou Entrée)
        if (!estTelephone() || garderClavier) champ.focus({ preventScroll: true });
      }
    },

    // Réponse à quatre choix ou tapée
    repondre(reponse) {
      const p = this.en;
      if (!p || p.repondu) return;
      const q = p.questions[p.indice];
      const { code, type } = q;
      // Devant un drapeau, son jumeau est une bonne réponse (Monaco et Indonésie, Tchad et Roumanie)
      const parJumeau = type === 'drapeau' && reponse && reponse !== code && reponse === jumeau(code);
      const juste = reponse === code || parJumeau;
      const { capitale } = lesNoms();
      globe.marquer(code, juste ? 'trouve' : 'rate');
      // Drapeau jumeau (Monaco et Indonésie, Tchad et Roumanie) : le pays répondu est juste aussi, la carte y va
      if (parJumeau) globe.marquer(reponse, 'trouve');
      if (type === 'capitale' || type === 'capitale-pays') {
        p.courant = { position: donnees.parCode.get(code).capitale.position, nom: capitale(code), juste };
        p.lieux.push(p.courant);
      }
      if (type === 'drapeau' || type === 'capitale-pays') globe.allerA(parJumeau ? reponse : code);
      jeu.corps.querySelectorAll('.jeux-choix button, .jeux-suggestions button').forEach((bouton) => {
        bouton.disabled = true;
        if (bouton.dataset.code === code) bouton.classList.add('juste');
        else if (bouton.dataset.code === reponse) bouton.classList.add('faux');
      });
      // Le champ reste au focus (clavier ouvert sur téléphone) : Entrée passe à la question suivante
      const champ = $('.jeux-saisie input', jeu.corps);
      if (champ) {
        champ.readOnly = true;
        champ.value = '';
        champ.placeholder = t('jeux.entree-suivant');
        $('.jeux-saisie button', jeu.corps).disabled = true;
        $('.jeux-suggestions', jeu.corps).innerHTML = '';
      }
      const capitales = type === 'capitale' || type === 'capitale-pays';
      p.reponseDonnee = { reponse };
      this.conclure(juste, capitales
        ? t(juste ? 'jeux.bravo-capitale' : 'jeux.rate-capitale', { nom: paysAvecDrapeau(code), capitale: capitale(code) })
        : parJumeau
          ? t('jeux.bravo-jumeau', { nom: paysAvecDrapeau(reponse), autre: paysAvecDrapeau(code) })
          : t(juste ? 'jeux.bravo' : 'jeux.rate', { nom: paysAvecDrapeau(code) }));
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
        const distance = point ? distanceKm(point, v.position) : null;
        const juste = distance !== null && distance <= q.seuil;
        const lieu = { position: v.position, nom: nomVille(q.ville), juste };
        p.lieux.push(lieu);
        p.courant = lieu;
        if (point) {
          p.distances.push(distance);
          globe.ecart(point, v.position, juste);
          globe.cadrerPoints(point, v.position, zoomReponse);
        } else {
          globe.cadrerPoints(v.position, v.position, zoomReponse);
        }
        p.reponseDonnee = { point, distance };
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
      p.reponseDonnee = { point, distance, reponse: touche?.code ?? null };
      let texte;
      if (juste) texte = t('jeux.bravo', { nom: paysAvecDrapeau(q.code) });
      else if (!point) texte = t('jeux.ou-passe', { nom: paysAvecDrapeau(q.code) });
      else texte = t('jeux.ou-pays-rate', { nom: paysAvecDrapeau(q.code), distance: formatDistance(Math.round(distance) * 1000), touche: touche ? paysAvecDrapeau(touche.code) : t('jeux.la-mer') });
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
        p.ratees.push({ ...q, ...p.reponseDonnee });
      }
      ecrire('jeux-erreurs', noterErreur(erreurs(), q.cle, juste));
      if (q.type !== 'ou-ville') p.paysRepondus.set(q.code, juste);
      this.afficherLieux(p.courant);
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
        const garderClavier = clavierOuvert;
        if (derniere) {
          this.terminer();
          return;
        }
        // La question suivante repart d'un globe propre, sauf les pays déjà joués, gardés en couleur
        if (globe.etats.get(q.code) === 'question') globe.marquer(q.code, null);
        p.indice += 1;
        this.question({ garderClavier });
      });
      // Clavier ouvert, le champ garde le focus (Entrée = Suivant)
      if (!clavierOuvert) suivant.focus({ preventScroll: true });
    },

    // ----- Fiches des pays ; ‹ › pour passer au pays suivant -----
    // `retour` : revenir là d'où l'on vient (revue des erreurs, résultat) au lieu de « Toutes les fiches »
    fiches(liste, indice, zone, { retour = null } = {}) {
      if (this.en) this.arreterSansRetour();
      barre.hidden = true;
      jeu.element.classList.remove('jeux-compact', 'jeux-deplie');
      this.en = { reglage: { mode: 'fiches', zone }, fiches: [...liste], indice: Math.max(0, indice), questions: [], fin: null, retour };
      bloquerFiches(true);
      jeu.titre.textContent = zone ? `${t('jeux.carte-fiches')} · ${t(`jeux.zone-${zone}`)}` : t('jeux.carte-fiches');
      jeu.afficher();
      jeu.agrandir();
      globe.poser(liste);
      this.ficheCourante();
    },

    // Fiche ouverte depuis une partie finie : la partie est gardée, et reprise au retour
    ficheDepuisPartie(codes, indice, apres) {
      const sauvegarde = this.en;
      this.fiches(codes, indice, null, {
        retour: () => {
          globe.toutEffacer();
          globe.lieux([]);
          this.en = sauvegarde;
          globe.poser(sauvegarde.codesZone, sauvegarde.zoomMax);
          jeu.titre.textContent = titrePartie(sauvegarde.reglage, sauvegarde.erreursSeules);
          this.restaurerGlobe();
          apres();
        },
      });
    },

    ficheCourante() {
      const p = this.en;
      const code = p.fiches[p.indice];
      const pays = donnees.parCode.get(code);
      const { nom, capitale } = lesNoms();
      globe.toutEffacer();
      globe.marquer(code, 'question');
      globe.lieux([], { position: pays.capitale.position, nom: capitale(code), juste: null });
      const position = `${p.indice + 1} / ${p.fiches.length}`;
      jeu.meta.textContent = position;
      jeu.definirResume({ nom: nom(code), detail: t('jeux.carte-fiches'), valeur: position, unite: '' });
      const unSeul = p.fiches.length === 1;
      jeu.corps.innerHTML = `
        <div class="jeux-fiche">
          <img class="jeux-drapeau" src="${drapeau(code)}" alt="${t('jeux.drapeau-de', { nom: nom(code) })}" draggable="false">
          <p class="jeux-capitale">${nom(code)}</p>
          ${htmlFiche(code)}
          <div class="jeux-fiche-nav" ${unSeul ? 'hidden' : ''}>
            <button type="button" class="jeux-fiche-precedente" aria-label="${t('jeux.fiche-precedente')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
            <span>${position}</span>
            <button type="button" class="jeux-fiche-suivante" aria-label="${t('jeux.fiche-suivante')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
          </div>
          <button type="button" class="jeux-autre">${p.retour ? `‹ ${t('jeux.retour')}` : t('jeux.fiches-toutes')}</button>
        </div>
      `;
      const aller = (pas) => {
        p.indice = (p.indice + pas + p.fiches.length) % p.fiches.length;
        this.ficheCourante();
        jeu.element.scrollTop = 0;
      };
      $('.jeux-fiche-precedente', jeu.corps).addEventListener('click', () => aller(-1));
      $('.jeux-fiche-suivante', jeu.corps).addEventListener('click', () => aller(1));
      // Un voisin touché : sa fiche, juste après celle-ci (‹ ramène au pays d'avant)
      jeu.corps.querySelectorAll('.jeux-voisin').forEach((bouton) => bouton.addEventListener('click', () => {
        const voisin = bouton.dataset.code;
        let i = p.fiches.indexOf(voisin);
        if (i < 0) {
          p.fiches.splice(p.indice + 1, 0, voisin);
          i = p.indice + 1;
          globe.poser(p.fiches);
        }
        aller(i - p.indice);
      }));
      $('.jeux-autre', jeu.corps).addEventListener('click', () => {
        if (p.retour) {
          p.retour();
          return;
        }
        this.quitter();
        montrerEcran('fiches');
        ouvrirMenu();
      });
      requestAnimationFrame(() => globe.allerA(code));
    },

    // ----- Liste : nommer tous les pays de la zone contre la montre -----
    liste() {
      const p = this.en;
      // Sur téléphone, le panneau se réduit à la barre et au champ : la carte reste libre
      jeu.element.classList.toggle('jeux-compact', estTelephone());
      jeu.agrandir();
      $('.jeux-deplier', barre).hidden = false;
      $('.jeux-deplier', barre).setAttribute('aria-expanded', 'false');
      // Le champ prend place dans la barre, entre l'avancement et ↻ : une seule ligne
      barreMilieu.innerHTML = `
        <form class="jeux-saisie" autocomplete="off">
          <input type="text" enterkeyhint="done" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${t('jeux.taper-pays')}" aria-label="${t('jeux.taper-pays')}">
        </form>`;
      jeu.corps.innerHTML = `
        <p class="jeux-retour" aria-live="polite"></p>
        <div class="jeux-liste-tiroir">
          <p class="note jeux-liste-entree">${t('jeux.liste-entree')}</p>
          <p class="jeux-legende jeux-trouves-titre"></p>
          <div class="jeux-trouves"></div>
          <button type="button" class="jeux-abandon">${t('jeux.terminer')}</button>
        </div>
      `;
      const champ = $('.jeux-saisie input', barre);
      const retour = $('.jeux-retour', jeu.corps);
      const majCompte = () => {
        $('.jeux-trouves-titre', jeu.corps).textContent = t('jeux.trouves-titre', { n: p.trouves.length });
        jeu.meta.textContent = t('jeux.meta-liste', { n: p.trouves.length, total: p.codesZone.length });
        this.resume();
      };
      const dire = (html, classe = '') => {
        retour.innerHTML = `<span>${html}</span>`;
        retour.className = `jeux-retour ${classe}`.trim();
      };
      // Pendant la frappe (entree false) : seulement un nom sans ambiguïté, d'un pays de la zone pas encore trouvé
      // (priseAuVol : « UK » attend l'Ukraine). Entrée : le nom tel quel, faute de frappe comprise, avec un message sinon.
      const essayer = (entree) => {
        const { entrees } = lesNoms();
        const code = entree
          ? reconnaitre(champ.value, entrees, { tolerant: true, langue: langue() })
          : priseAuVol(champ.value, entrees, p.trouves, langue());
        if (!entree && (!code || !p.codesZone.includes(code))) return;
        if (!code) {
          if (champ.value.trim()) dire(t('jeux.inconnu'), 'jeux-inconnu');
          return;
        }
        champ.value = '';
        if (p.trouves.includes(code)) {
          dire(t('jeux.deja', { nom: paysAvecDrapeau(code) }), 'jeux-inconnu');
          return;
        }
        if (!p.codesZone.includes(code)) {
          dire(t(p.codesListe ? 'jeux.hors-erreurs' : 'jeux.hors-zone', { nom: paysAvecDrapeau(code) }), 'jeux-inconnu');
          return;
        }
        p.trouves.push(code);
        p.paysRepondus.set(code, true);
        this.afficherLieux();
        globe.marquer(code, 'trouve');
        dire(t('jeux.trouve', { nom: paysAvecDrapeau(code) }), 'jeux-bravo');
        const pastille = document.createElement('span');
        pastille.className = 'jeux-trouve';
        pastille.innerHTML = paysAvecDrapeau(code);
        $('.jeux-trouves', jeu.corps).prepend(pastille);
        majCompte();
        if (p.trouves.length === p.codesZone.length) this.terminer();
      };
      // Un nom juste est pris dès qu'il est tapé ; Entrée accepte aussi une faute de frappe
      champ.addEventListener('input', () => essayer(false));
      $('.jeux-saisie', barre).addEventListener('submit', (event) => {
        event.preventDefault();
        essayer(true);
      });
      $('.jeux-abandon', jeu.corps).addEventListener('click', () => this.terminer());
      majCompte();
      if (!estTelephone()) champ.focus();
      recadrerBientot();
    },

    // ----- Résultat -----
    terminer() {
      const p = this.en;
      if (!p || p.fin) return;
      window.clearInterval(this.minuterie);
      this.minuterie = null;
      p.fin = Date.now();
      document.activeElement?.blur?.();
      desarmerRetour();
      const { mode } = p.reglage;
      const liste = mode === 'liste';
      const total = liste ? p.codesZone.length : p.questions.length;
      const bonnes = liste ? p.trouves.length : p.bonnes;
      const duree = (p.fin - p.debut) / 1000;
      // Les oubliés de la liste s'affichent en rouge sur le globe
      if (liste) {
        p.ratees = p.codesZone.filter((c) => !p.trouves.includes(c)).map((code) => ({ type: 'liste', code }));
        p.ratees.forEach((q) => {
          globe.marquer(q.code, 'rate');
          p.paysRepondus.set(q.code, false);
        });
        this.afficherLieux();
      }
      for (const [code, etat] of globe.etats) if (etat === 'question') globe.marquer(code, null);
      globe.ecart(null);

      // Pas de record pour la révision ni pour ses erreurs rejouées : leurs questions changent à chaque fois
      const cle = mode === 'revision' || p.erreursSeules ? null : cleRecord(p.reglage);
      const tousRecords = records();
      const ancien = cle ? tousRecords[cle] : null;
      const resultat = { bonnes, total, duree: Math.round(duree) };
      const garde = cle ? meilleur(ancien, resultat) : null;
      const nouveau = garde === resultat && bonnes > 0;
      if (cle && garde === resultat) ecrire('jeux-records', { ...tousRecords, [cle]: resultat });
      const ecartMoyen = p.distances.length ? p.distances.reduce((s, d) => s + d, 0) / p.distances.length : null;
      p.resultat = { bonnes, total, duree, nouveau, ancien, ecartMoyen };
      p.ratesSeulement = p.ratees.length > 0;
      this.ecranFin();
      if (mode === 'revision' || p.erreursSeules) return;
      if (p.reglage.sens === 'ville-pays') globe.allerA(p.reglage.zone, ZOOM_MAX_VILLES_PAYS);
      else if (!liste || p.ratees.length < p.codesZone.length) globe.zone(p.reglage.zone);
    },

    // Écran de fin : Recommencer d'abord, puis les erreurs (revoir, rejouer) et la révision
    ecranFin() {
      const p = this.en;
      const { mode } = p.reglage;
      const liste = mode === 'liste';
      const { bonnes, total, duree, nouveau, ancien, ecartMoyen } = p.resultat;
      barre.hidden = true;
      jeu.element.classList.remove('jeux-compact', 'jeux-deplie');
      const manques = p.ratees;
      const { capitale } = lesNoms();
      const libelleManque = (q) => {
        if (q.type === 'ou-ville') return `<img src="${drapeau(q.code)}" alt="">${nomVille(q.ville)}`;
        if (q.type === 'capitale' || q.type === 'capitale-pays') return `${paysAvecDrapeau(q.code)} · ${capitale(q.code)}`;
        return paysAvecDrapeau(q.code);
      };
      const restantes = erreurs().length;
      const peutRecommencer = mode !== 'revision' || p.imposees || restantes;
      const zoneRevision = mode === 'revision' || (mode === 'ou' && p.reglage.sens === 'ville-pays') ? '' : t(`jeux.zone-${p.reglage.zone}`);
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
        ${peutRecommencer ? `<button type="button" class="jeux-rejouer">${ICONE_RECOMMENCER}${t('jeux.recommencer')}</button>` : ''}
        ${manques.length ? `
          <div class="jeux-fin-actions">
            <button type="button" class="jeux-revoir">${t('jeux.revoir-erreurs')}</button>
            <button type="button" class="jeux-rejouer-erreurs">${t('jeux.rejouer-erreurs')}</button>
          </div>` : `<p class="jeux-bravo jeux-parfait">${t('jeux.parfait')}</p>`}
        <div class="jeux-reviser">
          <button type="button" class="jeux-reviser-bouton">${ICONE_LIVRE}${zoneRevision ? t('jeux.reviser-zone', { zone: zoneRevision }) : t('jeux.reviser')}</button>
          ${manques.length ? `<label class="jeux-rates"><input type="checkbox" ${p.ratesSeulement ? 'checked' : ''}><span>${t('jeux.rates-seulement')}</span></label>` : ''}
        </div>
        ${manques.length ? `
          <p class="jeux-legende">${t(liste ? 'jeux.oublies' : 'jeux.erreurs', { n: manques.length })}</p>
          <div class="jeux-manques">
            ${manques.map((q, i) => `<button type="button" data-i="${i}">${libelleManque(q)}</button>`).join('')}
          </div>` : ''}
        ${!liste && restantes ? `<p class="note">${t('jeux.erreurs-a-reviser', { n: restantes })}</p>` : ''}
        <button type="button" class="jeux-autre">${t('jeux.autre-partie')}</button>
      `;
      this.resume();
      jeu.agrandir();
      jeu.element.scrollTop = 0;
      jeu.corps.querySelectorAll('.jeux-manques button').forEach((bouton) => {
        bouton.addEventListener('click', () => this.revue(Number(bouton.dataset.i)));
      });
      $('.jeux-rejouer', jeu.corps)?.addEventListener('click', () => this.recommencer());
      $('.jeux-revoir', jeu.corps)?.addEventListener('click', () => this.revue(0));
      $('.jeux-rejouer-erreurs', jeu.corps)?.addEventListener('click', () => this.rejouerErreurs());
      $('.jeux-rates input', jeu.corps)?.addEventListener('change', (event) => { p.ratesSeulement = event.target.checked; });
      $('.jeux-reviser-bouton', jeu.corps).addEventListener('click', () => {
        const codes = p.ratesSeulement && manques.length ? manques.map((q) => q.code) : p.codesZone;
        this.ficheDepuisPartie(ordonner(codes), 0, () => this.ecranFin());
      });
      $('.jeux-autre', jeu.corps).addEventListener('click', () => {
        this.quitter();
        montrerEcran('accueil');
        ouvrirMenu();
      });
    },

    rejouerErreurs() {
      const p = this.en;
      if (!p?.ratees.length) return;
      if (p.reglage.mode === 'liste') this.demarrer(p.reglage, { codes: p.ratees.map((q) => q.code) });
      else this.demarrer(p.reglage, { questions: p.ratees });
    },

    // ----- Revue des erreurs, une à une, la carte va à chacune -----
    revue(indice) {
      const p = this.en;
      const n = p.ratees.length;
      if (!n) return;
      if (p.reglage.mode === 'liste') {
        this.revueListe(indice);
        return;
      }
      p.indiceRevue = (indice + n) % n;
      const q = p.ratees[p.indiceRevue];
      const { nom, capitale } = lesNoms();
      globe.toutEffacer();
      globe.ecart(null);
      globe.lieux([]);
      const barrer = (html) => `<s class="jeux-faux-barre">${html}</s>`;
      const passee = `<em class="jeux-passee">${t('jeux.passee')}</em>`;
      const ligne = (cle, html, classe) => `<div class="jeux-revue-ligne ${classe}"><dt>${t(cle)}</dt><dd>${html}</dd></div>`;
      const emprise = (code) => {
        const [ouest, sud, est, nord] = donnees.parCode.get(code).emprise;
        return [[ouest, sud], [est, nord]];
      };
      let tete = '';
      let lignes = '';
      const { type, code, reponse } = q;
      if (type === 'ou-pays' || type === 'ou-ville') {
        const cible = type === 'ou-ville' ? ville(q.ville).position : donnees.parCode.get(code).centre;
        const distance = q.point ? formatDistance(Math.round(q.distance) * 1000) : null;
        tete = `<p class="jeux-consigne">${t(type === 'ou-ville' ? 'jeux.consigne-ou-ville' : 'jeux.consigne-ou-pays')}</p>
          <p class="jeux-capitale">${type === 'ou-ville' ? `<img src="${drapeau(code)}" alt="">${nomVille(q.ville)}` : paysAvecDrapeau(code)}</p>`;
        lignes = q.point
          ? ligne('jeux.ton-appui', `${type === 'ou-pays' ? `${reponse ? paysAvecDrapeau(reponse) : t('jeux.la-mer')} · ` : ''}${t('jeux.a-distance', { distance })}`, 'faux')
          : ligne('jeux.ta-reponse', passee, 'faux');
        if (type === 'ou-pays') globe.marquer(code, 'trouve', { eclat: false });
        else globe.lieux([], { position: cible, nom: nomVille(q.ville), juste: true });
        if (q.point) {
          globe.ecart(q.point, cible, false, { texte: t('jeux.a-distance', { distance }), appuiFaux: true });
          globe.cadrerPoints(q.point, cible, type === 'ou-ville' && q.parPays ? 6 : ZOOM_PAYS, type === 'ou-pays' ? emprise(code) : []);
        } else if (type === 'ou-pays') globe.allerA(code);
        else globe.cadrerPoints(cible, cible, 4.5);
      } else {
        // Drapeaux et capitales : la réponse donnée barrée, la bonne ; les deux pays sur la carte
        const capitales = type === 'capitale' || type === 'capitale-pays';
        if (type === 'drapeau') {
          tete = `<img class="jeux-drapeau jeux-drapeau-revue" src="${drapeau(code)}" alt="">`;
          lignes = ligne('jeux.ta-reponse', reponse ? barrer(paysAvecDrapeau(reponse)) : passee, 'faux') + ligne('jeux.bonne-reponse', paysAvecDrapeau(code), 'juste');
        } else if (type === 'drapeau-pays') {
          tete = `<p class="jeux-consigne">${t('jeux.consigne-pays')}</p><p class="jeux-capitale">${nom(code)}</p>`;
          lignes = ligne('jeux.ta-reponse', reponse ? `<img class="jeux-revue-drapeau faux" src="${drapeau(reponse)}" alt="${nom(reponse)}">` : passee, 'faux')
            + ligne('jeux.bonne-reponse', `<img class="jeux-revue-drapeau" src="${drapeau(code)}" alt="${nom(code)}">`, 'juste');
        } else if (type === 'capitale') {
          tete = `<p class="jeux-consigne">${t('jeux.consigne-capitale')}</p><p class="jeux-capitale">${paysAvecDrapeau(code)}</p>`;
          lignes = ligne('jeux.ta-reponse', reponse ? barrer(`${capitale(reponse)} <small>(${paysAvecDrapeau(reponse)})</small>`) : passee, 'faux') + ligne('jeux.bonne-reponse', capitale(code), 'juste');
        } else {
          tete = `<p class="jeux-consigne">${t('jeux.consigne-capitale-pays')}</p><p class="jeux-capitale">${capitale(code)}</p>`;
          lignes = ligne('jeux.ta-reponse', reponse ? barrer(paysAvecDrapeau(reponse)) : passee, 'faux') + ligne('jeux.bonne-reponse', paysAvecDrapeau(code), 'juste');
        }
        globe.marquer(code, 'trouve', { eclat: false });
        if (reponse) globe.marquer(reponse, 'rate', { eclat: false });
        if (capitales) {
          const bonne = { position: donnees.parCode.get(code).capitale.position, nom: capitale(code), juste: true };
          globe.lieux(reponse ? [{ position: donnees.parCode.get(reponse).capitale.position, nom: capitale(reponse), juste: false }] : [], bonne);
        }
        if (reponse) globe.cadrerPoints(donnees.parCode.get(code).centre, donnees.parCode.get(reponse).centre, ZOOM_PAYS, [...emprise(code), ...emprise(reponse)]);
        else globe.allerA(code);
      }
      jeu.meta.textContent = t('jeux.erreur-n', { n: p.indiceRevue + 1, total: n });
      jeu.corps.innerHTML = `
        <div class="jeux-revue">
          ${tete}
          <dl class="jeux-revue-lignes">${lignes}</dl>
          <div class="jeux-fiche-nav" ${n === 1 ? 'hidden' : ''}>
            <button type="button" class="jeux-fiche-precedente" aria-label="${t('jeux.erreur-precedente')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
            <span>${p.indiceRevue + 1} / ${n}</span>
            <button type="button" class="jeux-fiche-suivante" aria-label="${t('jeux.erreur-suivante')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
          </div>
          <div class="jeux-fin-actions">
            <button type="button" class="jeux-voir-fiche">${ICONE_LIVRE}${t('jeux.fiche-pays')}</button>
            <button type="button" class="jeux-rejouer-erreurs">${t('jeux.rejouer-erreurs')}</button>
          </div>
          <button type="button" class="jeux-autre">‹ ${t('jeux.retour-resultat')}</button>
        </div>
      `;
      jeu.agrandir();
      this.brancherRevue(code);
    },

    // Liste chrono : la carte de toute la zone, oubliés en rouge avec leur nom, trouvés en vert
    revueListe(indice = null) {
      const p = this.en;
      this.restaurerGlobe();
      if (indice !== null) globe.allerA(p.ratees[indice].code);
      else if (p.codesListe) {
        const centres = p.ratees.map((q) => donnees.parCode.get(q.code).centre);
        globe.cadrerPoints(centres[0], centres[0], ZOOM_PAYS, centres.slice(1));
      }
      else globe.zone(p.reglage.zone);
      jeu.meta.textContent = t('jeux.oublies', { n: p.ratees.length });
      jeu.corps.innerHTML = `
        <div class="jeux-revue">
          <p class="note">${t('jeux.revue-liste')}</p>
          <div class="jeux-manques jeux-manques-revue">
            ${p.ratees.map((q, i) => `<button type="button" data-i="${i}" class="${i === indice ? 'actif' : ''}">${paysAvecDrapeau(q.code)}</button>`).join('')}
          </div>
          <div class="jeux-fin-actions">
            <button type="button" class="jeux-voir-fiche">${ICONE_LIVRE}${t(indice !== null ? 'jeux.fiche-pays' : 'jeux.reviser')}</button>
            <button type="button" class="jeux-rejouer-erreurs">${t('jeux.rejouer-erreurs')}</button>
          </div>
          <button type="button" class="jeux-autre">‹ ${t('jeux.retour-resultat')}</button>
        </div>
      `;
      jeu.agrandir();
      jeu.corps.querySelectorAll('.jeux-manques button').forEach((bouton) => {
        bouton.addEventListener('click', () => this.revueListe(Number(bouton.dataset.i)));
      });
      this.brancherRevue(indice !== null ? p.ratees[indice].code : null);
    },

    brancherRevue(code) {
      const p = this.en;
      $('.jeux-fiche-precedente', jeu.corps)?.addEventListener('click', () => this.revue(p.indiceRevue - 1));
      $('.jeux-fiche-suivante', jeu.corps)?.addEventListener('click', () => this.revue(p.indiceRevue + 1));
      const ici = p.reglage.mode === 'liste' ? () => this.revueListe(code ? p.ratees.findIndex((q) => q.code === code) : null) : () => this.revue(p.indiceRevue);
      $('.jeux-voir-fiche', jeu.corps).addEventListener('click', () => {
        const codes = code ? [code] : ordonner(p.ratees.map((q) => q.code));
        this.ficheDepuisPartie(codes, 0, ici);
      });
      $('.jeux-rejouer-erreurs', jeu.corps).addEventListener('click', () => this.rejouerErreurs());
      $('.jeux-autre', jeu.corps).addEventListener('click', () => {
        this.restaurerGlobe();
        this.ecranFin();
        if (p.reglage.mode === 'revision' || p.erreursSeules) return;
        if (p.reglage.sens === 'ville-pays') globe.allerA(p.reglage.zone, ZOOM_MAX_VILLES_PAYS);
        else globe.zone(p.reglage.zone);
      });
    },
  };

  // ---------- Contenu d'une fiche (chiffres, pratique, géographie, anecdote) ----------
  const majuscule = (texte) => (texte ? texte.charAt(0).toLocaleUpperCase(langue()) + texte.slice(1) : texte);
  // Langues que les navigateurs ne savent pas toujours nommer en français
  const LANGUES_FR = {
    gsw: 'suisse allemand', bjz: 'créole bélizien', zdj: 'comorien', pov: 'créole de Guinée-Bissau', lao: 'lao', ber: 'berbère',
    hgm: 'khoekhoe', kwn: 'kwangali', nzs: 'langue des signes néo-zélandaise', smi: 'same', bwg: 'chibarwe', kck: 'kalanga',
    khi: 'khoïsan', ndc: 'ndau', toi: 'tonga', zib: 'langue des signes zimbabwéenne',
  };
  function nomLangue({ code, en }) {
    if (langue() === 'fr' && LANGUES_FR[code]) return majuscule(LANGUES_FR[code]);
    try {
      const court = new Intl.Locale(code).language;
      const libelle = new Intl.DisplayNames(langue(), { type: 'language', fallback: 'none' }).of(court);
      if (libelle) return majuscule(libelle);
    } catch {
      // code inconnu d'Intl : le nom anglais de la source
    }
    return en;
  }
  function nomMonnaie({ code, en, symbole }) {
    let libelle = en;
    try {
      libelle = new Intl.DisplayNames(langue(), { type: 'currency', fallback: 'none' }).of(code) || en;
    } catch {
      // code inconnu d'Intl
    }
    return `${majuscule(libelle)}${symbole ? ` (${symbole})` : ''}`;
  }
  function formatHabitants(n) {
    if (n < 1e6) return nombre(n);
    return new Intl.NumberFormat(langue(), { notation: 'compact', compactDisplay: 'long', maximumSignificantDigits: 3 }).format(n);
  }
  function htmlFiche(code) {
    const pays = donnees.parCode.get(code);
    const f = donnees.fiches?.[code];
    const { capitale, nom } = lesNoms();
    const case_ = (cle, valeur, detail = '') => `<div><dt>${t(cle)}</dt><dd>${valeur}${detail ? `<small>${detail}</small>` : ''}</dd></div>`;
    const continent = pays.zones.filter((z) => z !== 'monde').map((z) => t(`jeux.zone-${z}`)).join(' / ');
    let html = `<p class="note jeux-fiche-region">${continent ? `${continent} · ` : ''}${t(`jeux.region-${pays.region}`)}</p>`;
    const chiffres = [case_('jeux.fiche-capitale', capitale(code)), case_('jeux.fiche-superficie', formatSuperficie(pays.superficie))];
    if (f) {
      if (f.population) chiffres.push(case_('jeux.fiche-habitants', formatHabitants(f.population), f.annee ? String(f.annee) : ''));
      const d = densite(f.population, pays.superficie);
      if (d !== null) {
        chiffres.push(case_('jeux.fiche-densite', imperial()
          ? t('jeux.fiche-densite-mi', { n: nombre(Math.round(d / 0.386102)) })
          : t('jeux.fiche-densite-km', { n: nombre(d, d < 10 ? 1 : 0) })));
      }
      if (f.sommet) chiffres.push(`<div class="jeux-fiche-large"><dt>${t('jeux.fiche-sommet')}</dt><dd>${majuscule(f.sommet[langue()] ?? f.sommet.fr)}<small>${formatAltitude(f.sommet.altitude)}</small></dd></div>`);
    }
    html += `<p class="jeux-fiche-titre">${t('jeux.fiche-chiffres')}</p><dl class="jeux-fiche-infos">${chiffres.join('')}</dl>`;
    if (!f) return html;
    const fuseaux = resumeFuseaux(f.fuseaux);
    html += `<p class="jeux-fiche-titre">${t('jeux.fiche-pratique')}</p><dl class="jeux-fiche-infos jeux-fiche-pratique">
      ${case_(f.langues.length > 1 ? 'jeux.fiche-langues' : 'jeux.fiche-langue', f.langues.map(nomLangue).join(', ') || '—')}
      ${case_(f.monnaies.length > 1 ? 'jeux.fiche-monnaies' : 'jeux.fiche-monnaie', f.monnaies.map(nomMonnaie).join(', ') || '—')}
      ${case_(fuseaux.nombre > 1 ? 'jeux.fiche-fuseaux' : 'jeux.fiche-fuseau', fuseaux.texte || '—', fuseaux.nombre > 3 ? t('jeux.fiche-fuseaux-n', { n: fuseaux.nombre }) : '')}
    </dl>`;
    const voisins = [...f.voisins].sort((a, b) => nom(a).localeCompare(nom(b), langue()));
    html += `<p class="jeux-fiche-titre">${t('jeux.fiche-geographie')}</p><dl class="jeux-fiche-infos jeux-fiche-pratique">
      ${case_('jeux.fiche-mer', t(f.mer ? 'jeux.fiche-mer-oui' : 'jeux.fiche-mer-non'))}
      <div class="jeux-fiche-large"><dt>${t('jeux.fiche-voisins')}</dt><dd>${voisins.length
        ? `<span class="jeux-voisins">${voisins.map((v) => `<button type="button" class="jeux-voisin" data-code="${v}">${paysAvecDrapeau(v)}</button>`).join('')}</span>`
        : t('jeux.fiche-aucun-voisin')}</dd></div>
    </dl>`;
    const anecdotes = donnees.anecdotes?.[code]?.[langue()] ?? donnees.anecdotes?.[code]?.fr;
    if (anecdotes?.length) {
      html += `<div class="jeux-savais-tu"><p class="jeux-fiche-titre">${t('jeux.fiche-savais-tu')}</p>${anecdotes.map((a) => `<p>${a}</p>`).join('')}</div>`;
    }
    return html;
  }

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
