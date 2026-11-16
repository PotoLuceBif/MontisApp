// Jeux (lot P.4a) : quiz de géographie joué sur le globe. Modes Drapeaux et Liste.
// Chargé à la première ouverture de la ligne du menu ; contours et drapeaux à la première partie (public/data/jeux).
import { creerPanneauCarte } from './panneau-carte.js';
import { bloquerFiches } from './fiche.js';
import { POLICE, POLICE_GRAS } from './polices.js';
import { lire, ecrire } from './reglages.js';
import { langue } from './preferences.js';
import { surLangue, t, ta, ti, tt } from './i18n.js';
import {
  DUREES_LISTE, LONGUEUR_COURTE, ZONES, cleRecord, formatChrono, index, indexCapitales, jumeau, meilleur, melanger, nomPays, paysDeZone,
  proposerChoix, reconnaitre, suggerer,
} from './jeu-calcul.js';

const SOURCE = 'jeu-pays';
const SOURCE_POINTS = 'jeu-pays-points';
const COUCHES = ['jeu-pays-fond', 'jeu-pays-contour', 'jeu-pays-points', 'jeu-pays-halo'];
const SOURCE_CAPITALE = 'jeu-capitale';
const COUCHES_CAPITALE = ['jeu-capitale-point', 'jeu-capitale-noms', 'jeu-capitale-nom'];
const ZOOM_PAYS = 4; // cadrage d'un pays après une réponse
// Carte de montagne cachée pendant la partie, avec tous les textes : le globe seul, et le rose du pays à trouver
// ne se perd plus parmi les routes roses de la nuit
const CARTE_CACHEE = /^(montis-(road|tunnels|chemins|sentiers|path|marches|rail|remontees|batiments)|courbes)/;
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

export function creerJeux(map, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  // ---------- Réglage de la partie, dans le menu ----------
  const choix = {
    mode: 'drapeaux',
    sens: 'drapeau',
    sensCapitales: 'pays',
    niveau: 'choix',
    longueur: 'courte',
    zone: 'europe',
    ...lire('jeux-choix', {}),
  };
  const records = () => lire('jeux-records', {});

  const panneau = document.createElement('div');
  panneau.className = 'jeux';
  panneau.innerHTML = `
    <p class="note" ${ti('jeux.intro')}>${t('jeux.intro')}</p>
    <div class="jeux-reglage">
      <span class="jeux-legende" ${ti('jeux.mode')}>${t('jeux.mode')}</span>
      <div class="segments" data-choix="mode" role="group" ${ta('aria-label', 'jeux.mode')}>
        <button type="button" data-valeur="drapeaux" ${ti('jeux.mode-drapeaux')}>${t('jeux.mode-drapeaux')}</button>
        <button type="button" data-valeur="capitales" ${ti('jeux.mode-capitales')}>${t('jeux.mode-capitales')}</button>
        <button type="button" data-valeur="liste" ${ti('jeux.mode-liste')}>${t('jeux.mode-liste')}</button>
      </div>
      <p class="note jeux-aide-mode"></p>
    </div>
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
    <div class="jeux-reglage" data-pour="niveau">
      <span class="jeux-legende" ${ti('jeux.niveau')}>${t('jeux.niveau')}</span>
      <div class="segments" data-choix="niveau" role="group" ${ta('aria-label', 'jeux.niveau')}>
        <button type="button" data-valeur="choix" ${ti('jeux.niveau-choix')}>${t('jeux.niveau-choix')}</button>
        <button type="button" data-valeur="expert" ${ti('jeux.niveau-expert')}>${t('jeux.niveau-expert')}</button>
      </div>
    </div>
    <div class="jeux-reglage">
      <span class="jeux-legende" ${ti('jeux.zone')}>${t('jeux.zone')}</span>
      <div class="jeux-zones" data-choix="zone" role="group" ${ta('aria-label', 'jeux.zone')}>
        ${ZONES.map((zone) => `<button type="button" data-valeur="${zone}"><span ${ti(`jeux.zone-${zone}`)}>${t(`jeux.zone-${zone}`)}</span><small></small></button>`).join('')}
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
    <p class="note jeux-credits" ${ti('jeux.credits')}>${t('jeux.credits')}</p>
  `;
  const $ = (selecteur, racine = panneau) => racine.querySelector(selecteur);
  // Le niveau expert fait taper un nom : « Trouve le drapeau » se joue toujours en quatre choix
  const niveauImpose = (c) => c.mode === 'drapeaux' && c.sens === 'pays';
  // Ce que joue la partie : un seul sens, celui du mode choisi
  const reglageEffectif = () => ({
    mode: choix.mode,
    zone: choix.zone,
    longueur: choix.longueur,
    sens: choix.mode === 'capitales' ? choix.sensCapitales : choix.sens,
    niveau: niveauImpose(choix) ? 'choix' : choix.niveau,
  });
  let nombres = null; // pays par zone, connus après le premier chargement

  function rendreReglage() {
    panneau.querySelectorAll('[data-choix]').forEach((groupe) => {
      groupe.querySelectorAll('button').forEach((bouton) => {
        const actif = bouton.dataset.valeur === choix[groupe.dataset.choix];
        bouton.classList.toggle('actif', actif);
        bouton.setAttribute('aria-pressed', String(actif));
      });
    });
    const { mode } = choix;
    $('[data-pour="drapeaux"]').hidden = mode !== 'drapeaux';
    $('[data-pour="capitales"]').hidden = mode !== 'capitales';
    $('[data-pour="questions"]').hidden = mode === 'liste';
    $('[data-pour="niveau"]').hidden = mode === 'liste' || niveauImpose(choix);
    $('.jeux-aide-mode').textContent = t(`jeux.aide-${mode}`, {
      duree: formatChrono(DUREES_LISTE[choix.zone]),
    });
    panneau.querySelectorAll('.jeux-zones small').forEach((petit) => {
      petit.textContent = nombres ? String(nombres[petit.parentElement.dataset.valeur]) : '';
    });
    const total = nombres?.[choix.zone];
    $('[data-valeur="courte"]').textContent = t('jeux.longueur-courte', { n: LONGUEUR_COURTE });
    $('[data-valeur="complete"]').textContent = total ? t('jeux.longueur-complete', { n: total }) : t('jeux.longueur-tous');
    const record = records()[cleRecord(reglageEffectif())];
    $('.jeux-record').textContent = record
      ? t('jeux.record', { bonnes: record.bonnes, total: record.total, duree: formatChrono(record.duree) })
      : t('jeux.record-aucun');
  }

  panneau.addEventListener('click', (event) => {
    const bouton = event.target.closest('[data-choix] button');
    if (!bouton) return;
    choix[bouton.closest('[data-choix]').dataset.choix] = bouton.dataset.valeur;
    ecrire('jeux-choix', choix);
    rendreReglage();
  });

  function message(texte) {
    $('.jeux-message').textContent = texte;
    $('.jeux-message').hidden = !texte;
  }

  let donnees = null;
  async function preparer() {
    if (donnees) return donnees;
    const brut = await chargerPays();
    const pays = brut.features.map((f) => f.properties);
    nombres = Object.fromEntries(ZONES.map((zone) => [zone, paysDeZone(pays, zone).length]));
    const points = {
      type: 'FeatureCollection',
      features: pays.filter((p) => p.petit).map((p) => ({ type: 'Feature', properties: { code: p.code }, geometry: { type: 'Point', coordinates: p.centre } })),
    };
    donnees = { brut, pays, parCode: new Map(pays.map((p) => [p.code, p])), points };
    rendreReglage();
    return donnees;
  }

  $('.jeux-jouer').addEventListener('click', async () => {
    message('');
    $('.jeux-jouer').disabled = true;
    try {
      await preparer();
      fermerMenu();
      partie.demarrer(reglageEffectif());
    } catch (erreur) {
      console.warn('Jeux :', erreur);
      message(t(navigator.onLine ? 'jeux.erreur-chargement' : 'jeux.erreur-hors-ligne'));
    } finally {
      $('.jeux-jouer').disabled = false;
    }
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
    poser(codesZone) {
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
      map.setMaxZoom(ZOOM_MAX_JEU);
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
      return { top: 60, bottom: Math.min(hauteur, window.innerHeight * 0.6) + 20, left: Math.max(20, gauche + 10), right: 20 };
    },
    zone(zone) {
      const vue = VUES[zone];
      map.flyTo({ ...vue, zoom: vue.zoom - (estTelephone() ? 0.5 : 0), bearing: 0, pitch: 0, padding: this.marge(), duration: 1600 });
    },
    // Assez loin pour voir où est le pays, même petit (la Belgique remplissait l'écran)
    allerA(code) {
      const p = donnees.parCode.get(code);
      const [ouest, sud, est, nord] = p.emprise;
      const camera = map.cameraForBounds([[ouest, sud], [est, nord]], { padding: this.marge(), maxZoom: ZOOM_PAYS });
      if (!camera) return;
      map.flyTo({ ...camera, zoom: Math.max(1.6, Math.min(camera.zoom, ZOOM_PAYS)), bearing: 0, pitch: 0, duration: 1400 });
    },
    // Capitales sur le globe : celles trouvées restent toute la partie (on voit où on en est, on les retient),
    // celle de la dernière réponse en grand, même ratée ; `courant` null n'en montre aucune en grand
    capitales(trouvees, courant = null, nom = (c) => c) {
      const point = (code, actuelle) => ({
        type: 'Feature',
        properties: { nom: nom(code), actuelle },
        geometry: { type: 'Point', coordinates: donnees.parCode.get(code).capitale.position },
      });
      const donneesPoints = {
        type: 'FeatureCollection',
        features: [...trouvees.filter((c) => c !== courant).map((c) => point(c, false)), ...(courant ? [point(courant, true)] : [])],
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
    retirer() {
      this.toutEffacer();
      [...COUCHES, ...COUCHES_CAPITALE].forEach((id) => map.getLayer(id) && map.removeLayer(id));
      [SOURCE, SOURCE_POINTS, SOURCE_CAPITALE].forEach((id) => map.getSource(id) && map.removeSource(id));
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

  const partie = {
    en: null, // la partie en cours
    minuterie: null,

    demarrer(reglage) {
      if (this.en) this.arreterSansRetour();
      const codesZone = paysDeZone(donnees.pays, reglage.zone);
      const tous = donnees.pays.map((p) => p.code);
      const ordre = melanger(codesZone);
      this.en = {
        reglage,
        codesZone,
        tous,
        questions: reglage.mode === 'liste' || reglage.longueur === 'complete' ? ordre : ordre.slice(0, LONGUEUR_COURTE),
        indice: 0,
        bonnes: 0,
        serie: 0,
        meilleureSerie: 0,
        ratees: [],
        trouves: [],
        capitalesTrouvees: [],
        debut: Date.now(),
        fin: null,
        repondu: false,
      };
      bloquerFiches(true);
      jeu.titre.textContent = `${t(`jeux.mode-${reglage.mode}`)} · ${t(`jeux.zone-${reglage.zone}`)}`;
      jeu.afficher();
      globe.poser(codesZone);
      if (reglage.mode === 'liste') this.liste();
      else this.question();
      // « Trouve le drapeau » vole tout de suite au pays allumé
      if (reglage.sens !== 'pays') requestAnimationFrame(() => globe.zone(reglage.zone));
    },

    // Fermer sans retour à la vue d'avant (pour enchaîner une autre partie)
    arreterSansRetour() {
      window.clearInterval(this.minuterie);
      this.minuterie = null;
      globe.toutEffacer();
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
    },

    resume() {
      const p = this.en;
      if (!p) return;
      const { mode } = p.reglage;
      const fait = mode === 'liste' ? p.trouves.length : Math.min(p.indice + (p.repondu ? 1 : 0), p.questions.length);
      const total = mode === 'liste' ? p.codesZone.length : p.questions.length;
      jeu.definirResume({ nom: t(`jeux.mode-${mode}`), detail: t(`jeux.zone-${p.reglage.zone}`), valeur: `${fait}/${total}`, unite: '' });
    },

    // ----- Drapeaux et Capitales : une question, quatre choix ou le nom à taper -----
    question() {
      const p = this.en;
      const code = p.questions[p.indice];
      const { mode, sens, niveau } = p.reglage;
      p.repondu = false;
      const { nom, capitale } = lesNoms();
      jeu.meta.textContent = t('jeux.meta-question', { n: p.indice + 1, total: p.questions.length, bonnes: p.bonnes, serie: p.serie });
      this.resume();
      globe.capitales(p.capitalesTrouvees, null, capitale);

      // Le pays de la question s'allume sur le globe quand c'est lui qu'on montre
      const paysMontre = sens === 'pays';
      // On cherche une capitale (« Trouve la capitale ») ou un pays (tout le reste)
      const chercheCapitale = mode === 'capitales' && sens === 'pays';
      const libelle = (c) => (chercheCapitale ? capitale(c) : nom(c));
      const choix = proposerChoix(code, p.codesZone, p.tous);
      let tete;
      let consigne;
      if (mode === 'drapeaux' && sens === 'pays') {
        tete = '';
        consigne = t('jeux.consigne-pays');
      } else if (mode === 'drapeaux') {
        tete = `<img class="jeux-drapeau" src="${drapeau(code)}" alt="${t('jeux.drapeau-mystere')}" draggable="false">`;
        consigne = t('jeux.consigne-drapeau');
      } else if (chercheCapitale) {
        tete = `<p class="jeux-capitale"><img src="${drapeau(code)}" alt="" draggable="false">${nom(code)}</p>`;
        consigne = t('jeux.consigne-capitale');
      } else {
        tete = `<p class="jeux-capitale">${capitale(code)}</p>`;
        consigne = t('jeux.consigne-capitale-pays');
      }
      const reponses = mode === 'drapeaux' && sens === 'pays'
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
      if (paysMontre) {
        globe.marquer(code, 'question');
        // Après le dessin du panneau : sa hauteur décide de la marge du cadrage
        requestAnimationFrame(() => globe.allerA(code));
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

    repondre(reponse) {
      const p = this.en;
      if (!p || p.repondu) return;
      p.repondu = true;
      const code = p.questions[p.indice];
      // Devant un drapeau, son jumeau est une bonne réponse (Monaco et Indonésie, Tchad et Roumanie)
      const juste = reponse === code || (p.reglage.mode === 'drapeaux' && p.reglage.sens === 'drapeau' && reponse && reponse === jumeau(code));
      const { nom } = lesNoms();
      if (juste) {
        p.bonnes += 1;
        p.serie += 1;
        p.meilleureSerie = Math.max(p.meilleureSerie, p.serie);
      } else {
        p.serie = 0;
        p.ratees.push(code);
      }
      globe.marquer(code, juste ? 'trouve' : 'rate');
      const capitales = p.reglage.mode === 'capitales';
      if (capitales) {
        if (juste) p.capitalesTrouvees.push(code);
        globe.capitales(p.capitalesTrouvees, code, lesNoms().capitale);
      }
      if (p.reglage.sens !== 'pays') globe.allerA(code);
      jeu.corps.querySelectorAll('.jeux-choix button, .jeux-suggestions button').forEach((bouton) => {
        bouton.disabled = true;
        if (bouton.dataset.code === code) bouton.classList.add('juste');
        else if (bouton.dataset.code === reponse) bouton.classList.add('faux');
      });
      jeu.corps.querySelectorAll('.jeux-saisie input, .jeux-saisie button, .jeux-passer').forEach((el) => { el.disabled = true; });
      const derniere = p.indice === p.questions.length - 1;
      const retour = $('.jeux-retour', jeu.corps);
      retour.innerHTML = `
        <p class="${juste ? 'jeux-bravo' : 'jeux-rate'}">${capitales
          ? t(juste ? 'jeux.bravo-capitale' : 'jeux.rate-capitale', { nom: nom(code), capitale: lesNoms().capitale(code) })
          : t(juste ? 'jeux.bravo' : 'jeux.rate', { nom: nom(code) })}</p>
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
        if (globe.etats.get(code) === 'question') globe.marquer(code, null);
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
      const liste = p.reglage.mode === 'liste';
      const total = liste ? p.codesZone.length : p.questions.length;
      const bonnes = liste ? p.trouves.length : p.bonnes;
      const duree = (p.fin - p.debut) / 1000;
      const manques = liste ? p.codesZone.filter((c) => !p.trouves.includes(c)) : p.ratees;
      // Les oubliés de la liste s'affichent en rouge sur le globe
      if (liste) manques.forEach((c) => globe.marquer(c, 'rate'));
      for (const [code, etat] of globe.etats) if (etat === 'question') globe.marquer(code, null);

      const cle = cleRecord(p.reglage);
      const tousRecords = records();
      const ancien = tousRecords[cle];
      const resultat = { bonnes, total, duree: Math.round(duree) };
      const garde = meilleur(ancien, resultat);
      const nouveau = garde === resultat && bonnes > 0;
      if (garde === resultat) ecrire('jeux-records', { ...tousRecords, [cle]: resultat });

      const { nom } = lesNoms();
      jeu.meta.textContent = t('jeux.meta-fin');
      jeu.corps.innerHTML = `
        <div class="jeux-score">
          <strong>${bonnes}<small> / ${total}</small></strong>
          <span>${t('jeux.en-temps', { duree: formatChrono(duree) })}${!liste && p.meilleureSerie > 1 ? ` · ${t('jeux.meilleure-serie', { n: p.meilleureSerie })}` : ''}</span>
          <p class="${nouveau ? 'jeux-bravo' : 'note'}">${nouveau
            ? t('jeux.nouveau-record')
            : ancien ? t('jeux.record', { bonnes: ancien.bonnes, total: ancien.total, duree: formatChrono(ancien.duree) }) : ''}</p>
        </div>
        ${manques.length ? `
          <p class="jeux-legende">${t(liste ? 'jeux.oublies' : 'jeux.erreurs', { n: manques.length })}</p>
          <div class="jeux-manques">
            ${manques.map((c) => `<button type="button" data-code="${c}"><img src="${drapeau(c)}" alt="">${nom(c)}${p.reglage.mode === 'capitales' ? ` · ${lesNoms().capitale(c)}` : ''}</button>`).join('')}
          </div>` : `<p class="jeux-bravo">${t('jeux.parfait')}</p>`}
        <div class="jeux-fin-actions">
          <button type="button" class="jeux-rejouer">${t('jeux.rejouer')}</button>
          <button type="button" class="jeux-autre">${t('jeux.autre-partie')}</button>
        </div>
      `;
      this.resume();
      jeu.agrandir();
      jeu.corps.querySelectorAll('.jeux-manques button').forEach((bouton) => {
        bouton.addEventListener('click', () => {
          globe.allerA(bouton.dataset.code);
          if (p.reglage.mode === 'capitales') globe.capitales(p.capitalesTrouvees, bouton.dataset.code, lesNoms().capitale);
        });
      });
      $('.jeux-rejouer', jeu.corps).addEventListener('click', () => this.demarrer({ ...p.reglage }));
      $('.jeux-autre', jeu.corps).addEventListener('click', () => {
        this.quitter();
        ouvrirMenu();
      });
      if (!liste || manques.length < p.codesZone.length) globe.zone(p.reglage.zone);
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
      rendreReglage();
      // Les nombres de pays par zone apparaissent dès que les contours sont là ; sinon ils viendront avec la partie
      preparer().catch(() => {});
    },
    desactiver() {
      partie.quitter();
    },
  };
}
