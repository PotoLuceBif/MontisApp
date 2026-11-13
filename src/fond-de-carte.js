// Fond de carte : choix parmi les fonds du catalogue (fonds-catalogue.js), rangés en quatre onglets
// (Ici, Monde, Pays, Anciennes), et calques officiels à superposer (calques-officiels.js).
// Une carte nationale ne couvre que son pays : au-delà, le fond Montis complète la carte.
import { lire, ecrire } from './reglages.js';
import { etat, majOmbrage, peintureCotes, peintureCourbes } from './options-carte.js';
import { CALQUES_MONTIS, REPERE_CALQUES } from './style-montis.js';
import { surLangue, t, ti } from './i18n.js';
import { CALQUES, FONDS, PAYS, REGIONS, empriseDe, nomDe, zoneDe } from './fonds-catalogue.js';
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
    if (map.getLayer(calque)) map.setLayoutProperty(calque, 'visibility', choix.integre || national ? 'visible' : 'none');
  }
  // Routes et noms de Montis : sous la carte nationale, sinon au-dessus des calques
  const dessous = national ? coucheDe(choix) : map.getLayer(APRES_MONTIS) ? APRES_MONTIS : undefined;
  if (map.getLayer(coucheDe(choix)) || !national) {
    for (const calque of MONTIS_DESSUS) if (map.getLayer(calque)) map.moveLayer(calque, dessous);
  }

  etat.fond = choix.integre ? 'montis' : national ? 'national' : 'autre';
  majOmbrage(map);

  // Sur une photo, les courbes de niveau passent en blanc pour rester lisibles
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

export function creerFondDeCarte(map) {
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

  const panneau = document.createElement('div');
  panneau.className = 'fond-panneau';
  panneau.innerHTML = `
    <div class="fond-onglets" role="tablist">
      ${ONGLETS.map((o) => `<button type="button" role="tab" data-onglet="${o}" ${ti(`fond.onglet-${o}`)}>${t(`fond.onglet-${o}`)}</button>`).join('')}
    </div>
    <div class="fond-contenu"></div>
    <p class="note fond-actuel"></p>
    <p class="note fond-alerte" role="status" hidden></p>
  `;
  const boutonsOnglets = panneau.querySelectorAll('.fond-onglets button');
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
    majAlerte();
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

  contenu.addEventListener('change', (e) => {
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
  };
}
