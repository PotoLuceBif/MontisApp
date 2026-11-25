// Fond de carte : en tête, le fond Montis (Auto, Jour, Nuit), puis quelques fonds de base ; « Avancé » range
// les éléments de la carte (elements-carte.js) et tous les fonds du catalogue (fonds-catalogue.js) en quatre
// onglets (Ici, Monde, Pays, Anciennes), avec les calques officiels à superposer (calques-officiels.js).
// Une carte nationale ne couvre que son pays : au-delà, le fond Montis complète la carte.
import { lire, ecrire } from './reglages.js';
import { etat, majOmbrage, peintureCotes, peintureCourbes } from './options-carte.js';
import { MODES_FOND, choisirModeFond, fondDeNuit, modeFond } from './fond-palette.js';
import { COUCHES_RAILS, afficherRails } from './transports.js';
import { POINTS_UTILES, COUCHES_POINTS_UTILES, afficherPointUtile } from './points-utiles.js';
import { CALQUES_MONTIS, REPERE_CALQUES, VOILE_GLACIERS, nomsAuDessusDesBatiments } from './style-montis.js';
import { surLangue, t, ta, ti } from './i18n.js';
import { CALQUES, FONDS, FONDS_DE_BASE, PAYS, REGIONS, empriseDe, nomDe, zoneDe } from './fonds-catalogue.js';
import { rangerParPays, zoneCouvre } from './fonds-calcul.js';
import { initCalquesOfficiels } from './calques-officiels.js';
import { PROTOCOLE_FOND, ajouterProtocoleFonds, chargerZones, zonesChargees } from './fonds-protocole.js';
import { pourcent } from './unites.js';

// Sources déjà sur la carte, que la visite réutilise sans toucher au fond choisi
export const SOURCE_TOPO = 'topo';
export const SOURCE_SATELLITE = 'esri-sat';

// Ordre des couches, de bas en haut :
// - fond Montis : Montis du dessous (terrain, eaux…), fonds masqués, calques (pentes, géologie…), repère,
//   routes et noms de Montis, puis ombrage et courbes ;
// - carte nationale : tout le fond Montis, puis la carte nationale découpée à sa frontière, puis les calques.
//   Au-delà de la frontière, la carte nationale est transparente : Montis complète, routes et noms compris.
const MONTIS_DESSUS = CALQUES_MONTIS.slice(CALQUES_MONTIS.indexOf('montis-road-casing'));
const APRES_MONTIS = 'ombrage'; // première couche au-dessus du fond Montis (main.js)
const ONGLETS = ['ici', 'monde', 'pays', 'anciennes'];

let fondImpose = false; // sans réseau, le fond Montis prime sur le choix enregistré

const coucheDe = (f) => (f.integre ? 'montis-background' : `fond-${f.id}`);
const fondDe = (id) => FONDS.find((f) => f.id === id);
const estNational = (f) => !f.integre && !!zoneDe(f);
const couvre = (element, lng, lat) => zoneCouvre(zoneDe(element), lng, lat, { zones: zonesChargees() ?? {}, emprise: empriseDe(element) });

// Affiche le fond choisi, cache les autres, adapte les courbes de niveau
function appliquerFond(map, id) {
  const choix = fondDe(id) ?? FONDS[0];
  const national = estNational(choix);

  FONDS.forEach((f) => {
    if (map.getLayer(coucheDe(f))) {
      map.setLayoutProperty(coucheDe(f), 'visibility', f.id === choix.id ? 'visible' : 'none');
    }
  });

  // Fond Montis : seul, ou sous une carte nationale pour compléter au-delà de sa frontière
  for (const calque of CALQUES_MONTIS) {
    if (COUCHES_RAILS.includes(calque) || COUCHES_POINTS_UTILES.includes(calque)) continue;
    if (map.getLayer(calque)) map.setLayoutProperty(calque, 'visibility', choix.integre || national ? 'visible' : 'none');
  }
  // Les voies ferrées sont un élément de la carte : elles suivent leur réglage, sur tous les fonds
  afficherRails(map, lire('rails', true));
  // Parkings, abris et points d'eau aussi
  for (const [cle, { defaut }] of Object.entries(POINTS_UTILES)) afficherPointUtile(map, cle, lire(cle, defaut));
  // Routes et noms de Montis : sous la carte nationale, sinon au-dessus des calques
  const dessous = national ? coucheDe(choix) : map.getLayer(APRES_MONTIS) ? APRES_MONTIS : undefined;
  if (map.getLayer(coucheDe(choix)) || !national) {
    for (const calque of MONTIS_DESSUS) if (map.getLayer(calque)) map.moveLayer(calque, dessous);
  }
  if (!national) nomsAuDessusDesBatiments(map);
  // Le voile des glaciers ne vaut que pour le fond Montis seul : il délaverait une carte nationale
  if (map.getLayer(VOILE_GLACIERS.id)) map.setLayoutProperty(VOILE_GLACIERS.id, 'visibility', choix.integre ? 'visible' : 'none');

  const avant = etat.fond;
  etat.fond = choix.integre ? 'montis' : national ? 'national' : 'autre';
  // Éléments de la carte : bâtiments, eaux et voies ferrées remis en revenant au fond Montis, pastilles selon le fond
  if (etat.fond !== avant) window.dispatchEvent(new CustomEvent('montis:fond-change', { detail: { fond: etat.fond, avant } }));
  majOmbrage(map);
  etat.majPaletteFond?.(); // avant les courbes : en quittant la nuit, elle leur rend leurs couleurs de jour

  // Sur une photo, les courbes de niveau passent en blanc pour rester lisibles (la nuit a les siennes)
  if (fondDeNuit()) return;
  if (map.getLayer('courbes')) {
    for (const [nom, valeur] of Object.entries(peintureCourbes(choix.photo))) map.setPaintProperty('courbes', nom, valeur);
  }
  if (map.getLayer('courbes-altitude')) {
    for (const [nom, valeur] of Object.entries(peintureCotes(choix.photo))) map.setPaintProperty('courbes-altitude', nom, valeur);
  }
}

const idEnregistre = () => {
  const id = lire('fond', 'montis');
  return fondDe(id) ? id : 'montis';
};

// Rétablit le dernier fond utilisé (appelée depuis main.js au démarrage)
export function retablirFond(map) {
  const id = fondImpose ? 'montis' : idEnregistre();
  try {
    appliquerFond(map, id);
    console.info('Fond de carte rétabli :', id);
  } catch (e) {
    console.error('Fond de carte non rétabli :', e);
  }
}

// Sans réseau, seul le fond Montis peut s'afficher entièrement. Le choix enregistré ne change pas.
export function basculerFondHorsLigne(map, horsLigne) {
  fondImpose = horsLigne;
  retablirFond(map);
}

const echapper = (texte) => String(texte).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function creerFondDeCarte(map, { elements } = {}) {
  // Un fond = une source + une couche masquée au départ ; une carte nationale passe par le découpage à sa frontière
  ajouterProtocoleFonds();
  for (const f of FONDS) {
    if (!f.source) continue;
    const emprise = empriseDe(f);
    const decoupe = estNational(f) ? { tiles: [`${PROTOCOLE_FOND}://${f.id}/{z}/{x}/{y}`], bounds: emprise } : {};
    map.addSource(f.id, { type: 'raster', tileSize: 256, ...f.source, ...decoupe });
    map.addLayer({ id: coucheDe(f), type: 'raster', source: f.id, layout: { visibility: 'none' } }, 'montis-road-casing');
  }
  // Repère des calques : pentes, ombres, géologie et calques officiels se posent juste en dessous
  map.addLayer({ id: REPERE_CALQUES, type: 'background', layout: { visibility: 'none' } }, 'montis-road-casing');

  let idActif = idEnregistre();

  // Ancien réglage : onglets « France » et « Monde »
  let onglet = lire('fond-onglet', 'ici');
  if (onglet === 'Monde') onglet = 'monde';
  if (!ONGLETS.includes(onglet)) onglet = 'ici';
  const paysOuverts = new Set(); // pays dépliés dans l'onglet Pays (le temps de la session)
  let signatureIci = '';

  // Sous la Carte Montis, deux onglets (demande du propriétaire du 25 novembre 2026) : Autres fonds (les plus
  // utilisés, puis tous les fonds par endroit) et Éléments de la carte ; l'onglet choisi est gardé
  let partie = lire('fond-partie', 'fonds');
  let avanceOuvert = lire('fond-avance', false);
  const chevron = '<svg class="fond-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  const panneau = document.createElement('div');
  panneau.className = 'fond-panneau';
  panneau.innerHTML = `
    <section class="fond-montis-bloc">
      <label class="fond-item fond-montis-choix">
        <input type="radio" name="fond" value="montis">
        <span class="fond-textes">
          <span class="fond-nom" ${ti('fond.montis-titre')}>${t('fond.montis-titre')}</span>
          <small class="fond-desc" ${ti('fond.desc-montis')}>${t('fond.desc-montis')}</small>
        </span>
      </label>
      <div class="segments fond-montis-modes" role="group" ${ta('aria-label', 'fond.montis-titre')}>
        ${MODES_FOND.map((m) => `<button type="button" data-mode="${m}" ${ti(`fond.mode-${m}`)}>${t(`fond.mode-${m}`)}</button>`).join('')}
      </div>
      <small class="fond-montis-etat" aria-live="polite"></small>
    </section>
    <section class="fond-avance">
      <button type="button" class="fond-avance-entete" aria-expanded="false">
        <span class="fond-avance-titre" ${ti('fond.avance')}>${t('fond.avance')}</span>
        <small class="fond-avance-resume"></small>
        ${chevron}
      </button>
      <div class="fond-avance-corps" hidden>
    <div class="segments fond-parties" role="tablist">
      <button type="button" role="tab" data-partie="fonds"><span ${ti('fond.groupe-base')}>${t('fond.groupe-base')}</span></button>
      <button type="button" role="tab" data-partie="elements"><span ${ti('elements.titre')}>${t('elements.titre')}</span></button>
    </div>
    <section class="fond-partie" data-section="fonds" role="tabpanel">
      <h4 class="fond-groupe" ${ti('fond.plus-utilises')}>${t('fond.plus-utilises')}</h4>
      <div class="fond-base"></div>
      <h4 class="fond-groupe" ${ti('fond.par-endroit')}>${t('fond.par-endroit')}</h4>
      <div class="fond-onglets" role="tablist">
        ${ONGLETS.map((o) => `<button type="button" role="tab" data-onglet="${o}" ${ti(`fond.onglet-${o}`)}>${t(`fond.onglet-${o}`)}</button>`).join('')}
      </div>
      <div class="fond-contenu"></div>
    </section>
    <section class="fond-partie" data-section="elements" role="tabpanel" hidden>
      <div class="fond-elements"></div>
    </section>
      </div>
    </section>
    <p class="note fond-actuel"></p>
    <p class="note fond-alerte" role="status" hidden></p>
  `;
  if (elements) panneau.querySelector('.fond-elements').append(elements.panneau);
  const base = panneau.querySelector('.fond-base');
  const choixMontis = panneau.querySelector('.fond-montis-choix input');
  const resumeAvance = panneau.querySelector('.fond-avance-resume');
  const parties = new Map([...panneau.querySelectorAll('.fond-partie')].map((p) => [p.dataset.section, p]));
  const boutonsParties = panneau.querySelectorAll('.fond-parties [data-partie]');
  function montrerPartie(nom) {
    if (!parties.has(nom)) return;
    partie = nom;
    ecrire('fond-partie', nom);
    for (const [cle, element] of parties) element.hidden = cle !== nom;
    boutonsParties.forEach((b) => {
      b.classList.toggle('actif', b.dataset.partie === nom);
      b.setAttribute('aria-selected', String(b.dataset.partie === nom));
    });
  }
  boutonsParties.forEach((b) => b.addEventListener('click', () => montrerPartie(b.dataset.partie)));
  montrerPartie(partie);
  const avance = panneau.querySelector('.fond-avance');
  const enteteAvance = avance.querySelector('.fond-avance-entete');
  function ouvrirAvance(oui) {
    avanceOuvert = oui;
    ecrire('fond-avance', oui);
    avance.classList.toggle('ouvert', oui);
    avance.querySelector('.fond-avance-corps').hidden = !oui;
    enteteAvance.setAttribute('aria-expanded', String(oui));
  }
  enteteAvance.addEventListener('click', () => ouvrirAvance(!avanceOuvert));
  ouvrirAvance(avanceOuvert);

  const boutonsOnglets = panneau.querySelectorAll('.fond-onglets button[data-onglet]');
  const boutonsModes = panneau.querySelectorAll('.fond-montis-modes button');
  const etatMontis = panneau.querySelector('.fond-montis-etat');

  // Jour, nuit ou auto : un mode choisi ramène au fond Montis
  function majModes() {
    const mode = modeFond();
    const montis = idActif === 'montis';
    choixMontis.checked = montis;
    boutonsModes.forEach((b) => {
      b.classList.toggle('actif', montis && b.dataset.mode === mode);
      b.setAttribute('aria-pressed', String(montis && b.dataset.mode === mode));
    });
    const cle = !montis ? 'fond.mode-etat-autre' : mode !== 'auto' ? `fond.mode-etat-${mode}` : fondDeNuit() ? 'fond.mode-etat-auto-nuit' : 'fond.mode-etat-auto-jour';
    etatMontis.textContent = t(cle);
  }
  boutonsModes.forEach((b) => b.addEventListener('click', () => {
    choisirModeFond(b.dataset.mode);
    if (idActif !== 'montis') {
      idActif = 'montis';
      ecrire('fond', idActif);
      if (!fondImpose) appliquerFond(map, idActif);
      afficher();
    }
    majModes();
  }));
  window.addEventListener('montis:fond-nuit', () => majModes());
  const contenu = panneau.querySelector('.fond-contenu');
  const actuel = panneau.querySelector('.fond-actuel');
  const alerte = panneau.querySelector('.fond-alerte');

  const calques = initCalquesOfficiels(map, { zones: () => zonesChargees() ?? {}, surChangement: () => afficher() });

  const centre = () => map.getCenter();
  const couvreIci = (element) => couvre(element, centre().lng, centre().lat);
  const nomPays = (code) => t(`pays.${code}`);

  // ---------- Lignes ----------
  function ligneFond(f, { avecPays = false } = {}) {
    const desc = [avecPays && f.pays ? nomPays(f.pays) : '', f.epoque ? t(f.epoque) : '', t(f.desc)].filter(Boolean).join(' · ');
    return `
      <label class="fond-item"${f.integre || f.id === idActif ? '' : ' data-reseau-requis'}>
        <input type="radio" name="fond" value="${f.id}" ${f.id === idActif ? 'checked' : ''}>
        <span class="fond-textes">
          <span class="fond-nom">${echapper(nomDe(f))}</span>
          <small class="fond-desc">${echapper(desc)}</small>
        </span>
      </label>`;
  }

  function ligneCalque(c, { avecPays = false } = {}) {
    const actif = calques.actif(c.id);
    const opacite = calques.lireOpacite(c.id);
    const desc = [avecPays ? nomPays(c.pays) : '', t(c.desc)].filter(Boolean).join(' · ');
    return `
      <div class="fond-calque${actif ? ' actif' : ''}" data-calque="${c.id}">
        <label class="option-case"${actif ? '' : ' data-reseau-requis'}>
          <input type="checkbox" ${actif ? 'checked' : ''}>
          <span>${echapper(t(c.cle))}</span>
          <small>${echapper(desc)}</small>
        </label>
        ${actif ? `
        <div class="relief-reglage fond-calque-opacite">
          <div class="relief-entete">
            <span>${echapper(t('fond.opacite'))}</span>
            <strong>${pourcent(opacite * 100)}</strong>
          </div>
          <input type="range" min="0.2" max="1" step="0.05" value="${opacite}" aria-label="${echapper(t('fond.opacite-de', { nom: t(c.court) }))}">
        </div>` : ''}
      </div>`;
  }

  const liste = (lignes) => `<div class="liste-fonds">${lignes.join('')}</div>`;
  const titre = (cle, variables) => `<h4 class="fond-groupe">${echapper(t(cle, variables))}</h4>`;
  const blocCalques = (liste) => (liste.length ? `${titre('fond.superposer')}<div class="fond-calques">${liste.join('')}</div>` : '');

  // ---------- Onglets ----------
  function rendreIci() {
    const nationaux = FONDS.filter((f) => estNational(f) && !f.ancienne && couvreIci(f));
    const anciens = FONDS.filter((f) => f.ancienne && couvreIci(f));
    const monde = FONDS.filter((f) => !f.pays);
    const calquesIci = CALQUES.filter(couvreIci);
    return `
      <p class="note fond-aide">${echapper(t('fond.aide-ici'))}</p>
      ${nationaux.length
        ? `${titre('fond.groupe-national')}${liste(nationaux.map((f) => ligneFond(f, { avecPays: true })))}`
        : `<p class="note fond-vide">${echapper(t('fond.aucun-national'))}</p>`}
      ${blocCalques(calquesIci.map((c) => ligneCalque(c, { avecPays: true })))}
      ${titre('fond.groupe-monde')}${liste(monde.map((f) => ligneFond(f)))}
      ${anciens.length ? `${titre('fond.groupe-anciennes')}${liste(anciens.map((f) => ligneFond(f, { avecPays: true })))}` : ''}`;
  }

  function rendreMonde() {
    return `<p class="note fond-aide">${echapper(t('fond.aide-monde'))}</p>${liste(FONDS.filter((f) => !f.pays).map((f) => ligneFond(f)))}`;
  }

  function rendrePays() {
    const fonds = FONDS.filter((f) => f.pays && !f.ancienne);
    const regions = rangerParPays([...fonds, ...CALQUES], PAYS, REGIONS);
    return `<p class="note fond-aide">${echapper(t('fond.aide-pays'))}</p>` + regions.map(({ region, pays }) => `
      ${titre(`fond.region-${region}`)}
      <div class="fond-pays-liste">
        ${pays.map(({ code, elements }) => {
          const ouvert = paysOuverts.has(code);
          const sesFonds = elements.filter((e) => fonds.includes(e));
          const sesCalques = elements.filter((e) => CALQUES.includes(e));
          const ici = sesFonds.some(couvreIci);
          const choisi = sesFonds.some((f) => f.id === idActif);
          const nb = [
            t('fond.nb-cartes', { n: sesFonds.length }),
            sesCalques.length ? t('fond.nb-calques', { n: sesCalques.length }) : '',
          ].filter(Boolean).join(' · ');
          return `
            <div class="fond-pays${ouvert ? ' ouvert' : ''}" data-pays="${code}">
              <button type="button" class="fond-pays-entete" aria-expanded="${ouvert}">
                <span class="fond-pays-nom">${echapper(nomPays(code))}</span>
                ${choisi ? `<span class="fond-badge fond-badge-choisi">${echapper(t('fond.badge-choisi'))}</span>` : ''}
                ${ici ? `<span class="fond-badge">${echapper(t('fond.badge-ici'))}</span>` : ''}
                <small class="fond-pays-nb">${echapper(nb)}</small>
                <svg class="fond-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              ${ouvert ? `<div class="fond-pays-corps">${liste(sesFonds.map((f) => ligneFond(f)))}${blocCalques(sesCalques.map((c) => ligneCalque(c)))}</div>` : ''}
            </div>`;
        }).join('')}
      </div>`).join('');
  }

  function rendreAnciennes() {
    const anciennes = FONDS.filter((f) => f.ancienne);
    const regions = rangerParPays(anciennes, PAYS, REGIONS);
    return `<p class="note fond-aide">${echapper(t('fond.aide-anciennes'))}</p>` +
      regions.flatMap(({ pays }) => pays).map(({ code, elements }) => `${titre(`pays.${code}`)}${liste(elements.map((f) => ligneFond(f)))}`).join('');
  }

  const RENDUS = { ici: rendreIci, monde: rendreMonde, pays: rendrePays, anciennes: rendreAnciennes };

  // ---------- État du fond choisi : hors de sa zone, trop loin ----------
  function majAlerte() {
    const f = fondDe(idActif);
    const nom = nomDe(f);
    actuel.textContent = t('fond.actuel', { nom });
    let cle = null;
    if (fondImpose && idActif !== 'montis') cle = 'fond.alerte-hors-ligne';
    else if (estNational(f) && !couvreIci(f)) cle = 'fond.alerte-hors-zone';
    else if (map.getZoom() < (f.source?.minzoom ?? 0)) cle = 'fond.alerte-loin';
    alerte.hidden = !cle;
    if (cle) alerte.textContent = t(cle, { nom });
  }

  function afficher() {
    boutonsOnglets.forEach((b) => {
      b.classList.toggle('actif', b.dataset.onglet === onglet);
      b.setAttribute('aria-selected', String(b.dataset.onglet === onglet));
    });
    contenu.innerHTML = RENDUS[onglet]();
    base.innerHTML = liste(FONDS_DE_BASE.map(fondDe).filter(Boolean).map((f) => ligneFond(f)));
    // Fond choisi dans « Avancé » : son nom reste visible, panneau replié
    const ailleurs = idActif !== 'montis' && !FONDS_DE_BASE.includes(idActif);
    resumeAvance.textContent = ailleurs ? nomDe(fondDe(idActif)) : '';
    majAlerte();
    majModes();
    signatureIci = signature();
  }

  // Ce qui couvre le centre : on ne redessine que si cela change (le défilement et les dépliages restent)
  const signature = () => [...FONDS, ...CALQUES].filter((e) => zoneDe(e) && couvreIci(e)).map((e) => e.id).join(',');

  // ---------- Événements ----------
  boutonsOnglets.forEach((b) => b.addEventListener('click', () => {
    onglet = b.dataset.onglet;
    ecrire('fond-onglet', onglet);
    if (onglet === 'pays') deplierUtiles();
    afficher();
  }));

  panneau.addEventListener('change', (e) => {
    const cible = e.target;
    if (cible.name === 'fond') {
      idActif = cible.value;
      ecrire('fond', idActif);
      if (!fondImpose) appliquerFond(map, idActif);
      afficher();
      return;
    }
    const ligne = cible.closest('.fond-calque');
    if (ligne && cible.type === 'checkbox') calques.basculer(ligne.dataset.calque, cible.checked);
  });

  contenu.addEventListener('input', (e) => {
    const ligne = e.target.closest('.fond-calque');
    if (!ligne || e.target.type !== 'range') return;
    const valeur = Number(e.target.value);
    calques.opacite(ligne.dataset.calque, valeur);
    ligne.querySelector('.relief-entete strong').textContent = pourcent(valeur * 100);
  });

  contenu.addEventListener('click', (e) => {
    const entete = e.target.closest('.fond-pays-entete');
    if (!entete) return;
    const code = entete.parentElement.dataset.pays;
    if (paysOuverts.has(code)) paysOuverts.delete(code);
    else paysOuverts.add(code);
    afficher();
  });

  map.on('moveend', () => {
    if (signature() !== signatureIci) afficher();
    else majAlerte();
  });
  const quandZones = () => chargerZones().then(() => { afficher(); calques.rafraichir(); });
  window.addEventListener('reseau-change', majAlerte);

  // À l'ouverture de l'onglet Pays, le pays affiché et celui du fond choisi sont dépliés
  function deplierUtiles() {
    const f = fondDe(idActif);
    if (f?.pays && !f.ancienne) paysOuverts.add(f.pays);
    const ici = PAYS.find(({ code }) => FONDS.some((x) => x.pays === code && !x.ancienne && couvreIci(x)));
    if (ici) paysOuverts.add(ici.code);
  }

  afficher();
  surLangue(() => { afficher(); calques.rafraichir(); });
  // Une carte nationale ou un calque déjà allumé : les contours servent tout de suite (pastilles, alerte)
  if (estNational(fondDe(idActif)) || CALQUES.some((c) => calques.actif(c.id))) quandZones();

  return {
    id: 'fond',
    labelCle: 'fond.titre',
    icone: 'fond',
    panneau,
    activer() {
      if (onglet === 'pays') deplierUtiles();
      afficher();
      if (!zonesChargees()) quandZones();
    },
    desactiver() {},
    // Appui sur une pastille d'élément de la carte : « Avancé » s'ouvre sur sa partie
    ouvrirSection(section) {
      if (!parties.has(section)) return null;
      ouvrirAvance(true);
      montrerPartie(section);
      return panneau.querySelector('.fond-parties');
    },
  };
}
