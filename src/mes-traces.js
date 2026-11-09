// Mes traces : les sorties importées des montres et des varios, et les parcours enregistrés
// dans Randonnée et Vélo. Deux lignes du menu, chargées à leur première ouverture.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerStockageParcours } from './parcours-stockage.js';
import { lire } from './reglages.js';
import { deposer } from './demandes.js';
import { erreurSortie, formatDuNom, lireSortie } from './sortie-lecture.js';
import {
  ajouterSortie, listerSorties, lireSortieComplete, modifierSortie, supprimerSortie,
} from './sorties-stockage.js';
import { formatAltitude, formatDenivele, formatDistance } from './unites.js';
import { surPreferences } from './preferences.js';
import { formatDate, poser, t, ta, ti, tt } from './i18n.js';

const TAILLE_MAX = 60 * 1024 * 1024;
export const TYPES = [
  { id: 'rando', cle: 'rando.titre', fichier: 'randonnee' },
  { id: 'velo', cle: 'velo.titre', fichier: 'velo' },
  { id: 'ski', cle: 'ski.titre', fichier: 'ski' },
  { id: 'parapente', cle: 'para.titre', fichier: 'parapente' },
];
const ACTIVITES_PARCOURS = ['rando', 'velo'];
const SOURCE = 'sortie-trace';
const SOURCE_BOUTS = 'sortie-bouts';
const COULEUR_CERNE = '#0b111b';
const CANAUX_LIBELLES = {
  alt: 'traces.canal-alt', altGps: 'traces.canal-alt-gps', fc: 'traces.canal-fc', cadence: 'traces.canal-cadence',
  puissance: 'traces.canal-puissance', temperature: 'traces.canal-temperature', vitesse: 'traces.canal-vitesse',
};
const DESSINS = {
  importer: '<path d="M12 15V3m0 0L7.500 7.500M12 3l4.500 4.500"/><path d="M5 13v6h14v-6"/>',
  renommer: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>',
  supprimer: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  autre: '<circle cx="12" cy="12" r="8"/><path d="M8 14c2-4 6-4 8 0"/>',
};
const svg = (dessin) => `<svg viewBox="0 0 24 24" aria-hidden="true">${dessin}</svg>`;

const typeDe = (id) => TYPES.find((type) => type.id === id) ?? null;
const iconeType = (id) => {
  const type = typeDe(id);
  return type
    ? `<img class="traces-icone" src="/icons/activites/${type.fichier}.svg" alt="" width="36" height="36">`
    : `<span class="traces-icone traces-icone-autre">${svg(DESSINS.autre)}</span>`;
};
const libelleType = (id) => t(typeDe(id)?.cle ?? 'traces.type-autre');

export function nomSortie(sortie) {
  if (sortie.nom) return sortie.nom;
  if (sortie.debut) return t('traces.nom-defaut', { type: libelleType(sortie.type), date: formatDate(sortie.debut, { day: 'numeric', month: 'long' }) });
  return sortie.fichier || libelleType(sortie.type);
}

// Durée réelle, à la minute (formaterDuree arrondit aux 5 minutes, fait pour une estimation)
export function formatDureeReelle(secondes) {
  const minutes = Math.round(secondes / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t('duree.heures', { h, m: String(m).padStart(2, '0') }) : t('duree.minutes', { m });
}

// L'année seulement si ce n'est pas l'année en cours : la ligne reste courte sur téléphone
const dateCourte = (date) => formatDate(date, { day: 'numeric', month: 'short', ...(new Date(date).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });

function detailSortie(sortie) {
  const { distance, duree, plus } = sortie.resume ?? {};
  return [
    sortie.debut ? dateCourte(sortie.debut) : null,
    Number.isFinite(distance) ? formatDistance(distance) : null,
    Number.isFinite(duree) && duree > 0 ? formatDureeReelle(duree) : null,
    Number.isFinite(plus) ? `D+ ${formatDenivele(plus)}` : null,
  ].filter(Boolean).join(' · ');
}

const accent = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fb59a';

// Une ligne de liste : ouvrir, renommer, supprimer (même allure que Mes parcours)
function ligneListe({ icone, nom, detail, onOuvrir, onRenommer, onSupprimer }) {
  const ligne = document.createElement('div');
  ligne.className = 'parcours-parcours traces-ligne';
  const ouvrir = document.createElement('button');
  ouvrir.type = 'button';
  ouvrir.className = 'parcours-parcours-texte traces-ligne-texte';
  ouvrir.innerHTML = `${icone}<span><strong></strong><small></small></span>`;
  ouvrir.querySelector('strong').textContent = nom;
  ouvrir.querySelector('small').textContent = detail;
  ouvrir.addEventListener('click', onOuvrir);
  const renommer = document.createElement('button');
  renommer.type = 'button';
  renommer.className = 'zh-zone-bouton';
  renommer.setAttribute('aria-label', t('parcours.renommer', { nom }));
  renommer.innerHTML = svg(DESSINS.renommer);
  renommer.addEventListener('click', () => {
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.maxLength = 60;
    champ.value = nom;
    champ.className = 'parcours-parcours-champ';
    champ.setAttribute('aria-label', t('parcours.nouveau-nom'));
    let fait = false;
    const valider = () => {
      if (fait) return;
      fait = true;
      const valeur = champ.value.trim();
      onRenommer(valeur && valeur !== nom ? valeur : null);
    };
    champ.addEventListener('blur', valider);
    champ.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') champ.blur();
    });
    ouvrir.replaceWith(champ);
    champ.focus();
    champ.select();
  });
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'zh-zone-bouton zh-zone-supprimer';
  supprimer.setAttribute('aria-label', t('parcours.supprimer', { nom }));
  supprimer.innerHTML = svg(DESSINS.supprimer);
  supprimer.addEventListener('click', onSupprimer);
  ligne.append(ouvrir, renommer, supprimer);
  return ligne;
}

// ---------- Vue d'une sortie sur la carte ----------
function creerVueSortie(map, { ouvrirMenu, onModifiee }) {
  let sortie = null;
  const panneau = creerPanneauCarte({
    cle: 'sortie-panneau-reduit',
    libelle: 'traces.sortie',
    classe: 'bf-outil bf-sortie',
    onFermer: () => fermer(),
    onRetour: () => {
      fermer();
      ouvrirMenu();
    },
  });
  panneau.corps.innerHTML = `
    <div class="parcours-pratiques parcours-pratiques-panneau traces-types" role="group" ${ta('aria-label', 'traces.type')}>
      ${TYPES.map(({ id, cle }) => `<button type="button" data-type="${id}" aria-pressed="false" ${ti(cle)}>${t(cle)}</button>`).join('')}
    </div>
    <div class="parcours-stats">
      <div class="parcours-stat parcours-stat-principale">${tt('editeur.distance')}<strong data-v="distance">—</strong></div>
      <div class="parcours-stat parcours-stat-principale">${tt('traces.duree')}<strong data-v="duree">—</strong></div>
      <div class="parcours-stat"><span>D+</span><strong data-v="plus">—</strong></div>
      <div class="parcours-stat"><span>D−</span><strong data-v="moins">—</strong></div>
      <div class="parcours-stat">${tt('editeur.alt-max')}<strong data-v="max">—</strong></div>
      <div class="parcours-stat">${tt('editeur.alt-min')}<strong data-v="min">—</strong></div>
    </div>
    <p class="traces-canaux"></p>
    <p class="note traces-a-venir" ${ti('traces.a-venir')}>${t('traces.a-venir')}</p>
  `;
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const boutonsType = [...panneau.corps.querySelectorAll('[data-type]')];

  function assurerCouches() {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', tolerance: 0, data: { type: 'FeatureCollection', features: [] } });
    map.addSource(SOURCE_BOUTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'sortie-trace-contour', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': COULEUR_CERNE, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 9] },
    });
    map.addLayer({
      id: 'sortie-trace', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': accent(), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 14, 5] },
    });
    map.addLayer({
      id: 'sortie-bouts', type: 'circle', source: SOURCE_BOUTS,
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'bout'], 'depart', '#3ecf8e', '#f2f4f7'],
        'circle-stroke-color': COULEUR_CERNE,
        'circle-stroke-width': 3,
      },
    });
  }

  function dessiner() {
    const { lng, lat } = sortie.points;
    const limites = [0, ...sortie.coupures, lng.length];
    const lignes = [];
    for (let i = 0; i < limites.length - 1; i++) {
      const ligne = [];
      for (let j = limites[i]; j < limites[i + 1]; j++) ligne.push([lng[j], lat[j]]);
      if (ligne.length > 1) lignes.push(ligne);
    }
    assurerCouches();
    map.setPaintProperty('sortie-trace', 'line-color', accent());
    map.getSource(SOURCE).setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lignes } });
    const dernier = lng.length - 1;
    map.getSource(SOURCE_BOUTS).setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { bout: 'arrivee' }, geometry: { type: 'Point', coordinates: [lng[dernier], lat[dernier]] } },
        { type: 'Feature', properties: { bout: 'depart' }, geometry: { type: 'Point', coordinates: [lng[0], lat[0]] } },
      ],
    });
    let [ouest, sud, est, nord] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < lng.length; i++) {
      ouest = Math.min(ouest, lng[i]);
      est = Math.max(est, lng[i]);
      sud = Math.min(sud, lat[i]);
      nord = Math.max(nord, lat[i]);
    }
    const telephone = window.matchMedia('(max-width: 640px)').matches;
    map.fitBounds([[ouest, sud], [est, nord]], {
      padding: telephone
        ? { top: 90, bottom: Math.round(window.innerHeight * 0.45), left: 40, right: 40 }
        : { top: 80, bottom: 80, left: 440, right: 80 },
      maxZoom: 15,
      duration: 900,
    });
  }

  function remplir() {
    panneau.titre.textContent = nomSortie(sortie);
    panneau.meta.textContent = [
      libelleType(sortie.type),
      sortie.debut ? formatDate(sortie.debut, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    ].filter(Boolean).join(' · ');
    panneau.definirResume({ rose: iconeType(sortie.type), nom: nomSortie(sortie), detail: detailSortie(sortie), valeur: '', unite: '' });
    boutonsType.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.type === sortie.type)));
    const r = sortie.resume ?? {};
    const ecrireValeur = (id, texte) => {
      $(`[data-v="${id}"]`).textContent = texte ?? '—';
    };
    ecrireValeur('distance', Number.isFinite(r.distance) ? formatDistance(r.distance) : null);
    ecrireValeur('duree', Number.isFinite(r.duree) && r.duree > 0 ? formatDureeReelle(r.duree) : null);
    ecrireValeur('plus', Number.isFinite(r.plus) ? formatDenivele(r.plus) : null);
    ecrireValeur('moins', Number.isFinite(r.moins) ? formatDenivele(r.moins) : null);
    ecrireValeur('max', Number.isFinite(r.altMax) ? formatAltitude(r.altMax) : null);
    ecrireValeur('min', Number.isFinite(r.altMin) ? formatAltitude(r.altMin) : null);
    const canaux = (sortie.canaux ?? []).filter((canal) => CANAUX_LIBELLES[canal]).map((canal) => t(CANAUX_LIBELLES[canal]));
    $('.traces-canaux').textContent = t('traces.donnees', {
      format: sortie.format.toUpperCase(),
      liste: [sortie.points.t ? t('traces.canal-heure') : null, ...canaux].filter(Boolean).join(', ') || t('traces.canal-position'),
    });
  }

  boutonsType.forEach((bouton) => bouton.addEventListener('click', async () => {
    if (!sortie || bouton.dataset.type === sortie.type) return;
    sortie.type = bouton.dataset.type;
    remplir();
    try {
      await modifierSortie(sortie.id, { type: sortie.type });
    } catch (erreur) {
      console.warn('Type de sortie non enregistré :', erreur);
    }
    onModifiee();
  }));

  function fermer() {
    sortie = null;
    panneau.masquer();
    map.getSource(SOURCE)?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource(SOURCE_BOUTS)?.setData({ type: 'FeatureCollection', features: [] });
  }

  surPreferences(() => sortie && remplir());

  return {
    ouvrir(complete) {
      sortie = complete;
      remplir();
      panneau.afficher();
      panneau.agrandir();
      dessiner();
    },
    get id() {
      return sortie?.id ?? null;
    },
    fermer,
  };
}

// ---------- Ligne « Sorties » ----------
export function creerSorties(map, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'traces';
  panneau.innerHTML = `
    <div class="rando-actions-principales">
      <label class="rando-importer rando-action-principale traces-importer">${svg(DESSINS.importer)}${tt('traces.importer')}
        <input type="file" class="rando-fichier" multiple accept=".gpx,.fit,.tcx,.igc,.gz,application/gpx+xml,application/vnd.ant.fit,application/octet-stream">
      </label>
    </div>
    <p class="note traces-aide" ${ti('traces.importer-aide')}>${t('traces.importer-aide')}</p>
    <p class="note traces-message" role="status" aria-live="polite" hidden></p>
    <div class="traces-liste"></div>
    <p class="note traces-vide" hidden ${ti('traces.aucune-sortie')}>${t('traces.aucune-sortie')}</p>
  `;
  const $ = (selecteur) => panneau.querySelector(selecteur);
  const champ = $('input[type="file"]');
  const message = $('.traces-message');
  const liste = $('.traces-liste');
  const vide = $('.traces-vide');

  const vue = creerVueSortie(map, { ouvrirMenu, onModifiee: () => void rendre() });

  // 	exte : une fonction, pour que le message suive un changement de langue
  let messageCourant = () => '';
  function afficherMessage(texte, erreur = false) {
    messageCourant = typeof texte === 'function' ? texte : () => texte;
    texte = messageCourant();
    message.textContent = texte;
    message.hidden = !texte;
    message.classList.toggle('traces-erreur', erreur);
  }

  async function ouvrirSortie(id) {
    try {
      const complete = await lireSortieComplete(id);
      if (!complete) throw new Error('sortie-absente');
      fermerMenu();
      vue.ouvrir(complete);
    } catch (erreur) {
      console.warn('Ouverture de la sortie :', erreur);
      afficherMessage(() => t('traces.erreur-lecture'), true);
    }
  }

  async function rendre() {
    let sorties;
    try {
      sorties = await listerSorties();
    } catch (erreur) {
      console.warn('Mes traces :', erreur);
      liste.replaceChildren();
      vide.hidden = true;
      afficherMessage(() => t('traces.stockage-indisponible'), true);
      champ.disabled = true;
      return;
    }
    vide.hidden = sorties.length > 0;
    liste.replaceChildren(...sorties.map((sortie) => ligneListe({
      icone: iconeType(sortie.type),
      nom: nomSortie(sortie),
      detail: detailSortie(sortie),
      onOuvrir: () => void ouvrirSortie(sortie.id),
      async onRenommer(nom) {
        if (nom) await modifierSortie(sortie.id, { nom }).catch((erreur) => console.warn(erreur));
        void rendre();
      },
      async onSupprimer() {
        if (!confirm(t('traces.supprimer-confirmer', { nom: nomSortie(sortie) }))) return;
        await supprimerSortie(sortie.id).catch((erreur) => console.warn(erreur));
        if (vue.id === sortie.id) vue.fermer();
        void rendre();
      },
    })));
  }

  async function contenuFichier(fichier, format) {
    let source = fichier;
    if (/\.gz$/i.test(fichier.name)) {
      if (!('DecompressionStream' in window)) throw erreurSortie('gz');
      source = new Response(fichier.stream().pipeThrough(new DecompressionStream('gzip')));
    }
    return format === 'fit' ? source.arrayBuffer() : source.text();
  }

  async function importer(fichiers) {
    if (!fichiers.length) return;
    afficherMessage(() => t('traces.lecture'));
    const typeParDefaut = typeDe(lire('menu-activite', null))?.id ?? null;
    const echecs = [];
    let ajoutees = 0;
    let doublons = 0;
    let derniere = null;
    for (const fichier of fichiers) {
      try {
        const format = formatDuNom(fichier.name);
        if (!format) throw erreurSortie('format');
        if (fichier.size > TAILLE_MAX) throw erreurSortie('lourd');
        const lue = lireSortie(format, await contenuFichier(fichier, format));
        lue.type ??= typeParDefaut;
        lue.fichier = fichier.name.replace(/(\.[a-z]+)+$/i, '');
        if (!lue.nom && !lue.debut) lue.nom = lue.fichier;
        const resultat = await ajouterSortie(lue);
        if (resultat.doublon) {
          doublons++;
          derniere = resultat.doublon.id;
        } else {
          ajoutees++;
          derniere = resultat.id;
        }
      } catch (erreur) {
        console.warn(`Import de ${fichier.name} :`, erreur);
        const code = erreur.code ?? (erreur.name === 'QuotaExceededError' ? 'plein' : 'invalide');
        echecs.push(() => t(`traces.erreur-${code}`, { nom: fichier.name }));
      }
    }
    await rendre();
    const bilan = [
      ajoutees && fichiers.length > 1 ? () => t('traces.ajoutees', { n: ajoutees }) : null,
      doublons ? () => t('traces.doublons', { n: doublons }) : null,
      ...echecs,
    ].filter(Boolean);
    afficherMessage(() => bilan.map((morceau) => morceau()).join(' '), echecs.length > 0);
    // Un seul fichier : on le montre tout de suite
    if (fichiers.length === 1 && derniere) void ouvrirSortie(derniere);
  }

  champ.addEventListener('change', () => {
    const fichiers = [...champ.files];
    champ.value = '';
    void importer(fichiers);
  });

  surPreferences(() => {
    void rendre();
    if (!message.hidden) afficherMessage(messageCourant, message.classList.contains('traces-erreur'));
  });

  return {
    id: 'sorties',
    labelCle: 'traces.sorties',
    icone: 'sorties',
    panneau,
    activer() {
      afficherMessage('');
      void rendre();
    },
    desactiver() {},
  };
}

// ---------- Ligne « Parcours » ----------
export function creerParcoursTraces(map, { fermerMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'traces';
  panneau.innerHTML = `
    <p class="note traces-aide" ${ti('traces.parcours-aide')}>${t('traces.parcours-aide')}</p>
    <div class="traces-liste"></div>
    <p class="note traces-vide" hidden ${ti('traces.aucun-parcours')}>${t('traces.aucun-parcours')}</p>
  `;
  const liste = panneau.querySelector('.traces-liste');
  const vide = panneau.querySelector('.traces-vide');
  const stockages = Object.fromEntries(ACTIVITES_PARCOURS.map((id) => [id, creerStockageParcours(id)]));
  const modifies = () => window.dispatchEvent(new CustomEvent('montis:parcours-modifies'));

  function rendre() {
    const tous = ACTIVITES_PARCOURS
      .flatMap((activite) => stockages[activite].lister().map((parcours) => ({ ...parcours, activite })))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    vide.hidden = tous.length > 0;
    liste.replaceChildren(...tous.map((parcours) => ligneListe({
      icone: iconeType(parcours.activite),
      nom: parcours.nom,
      detail: [
        Number.isFinite(parcours.total) ? formatDistance(parcours.total) : null,
        Number.isFinite(parcours.plus) ? `D+ ${formatDenivele(parcours.plus)}` : null,
        parcours.date ? dateCourte(parcours.date) : null,
      ].filter(Boolean).join(' · '),
      onOuvrir() {
        // Le parcours s'ouvre dans son activité, comme depuis sa liste Mes parcours
        fermerMenu();
        deposer(`ouvrir-parcours-${parcours.activite}`, parcours.id);
        window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'activites', module: parcours.activite } }));
      },
      onRenommer(nom) {
        if (nom) {
          stockages[parcours.activite].renommer(parcours.id, nom);
          modifies();
        }
        rendre();
      },
      onSupprimer() {
        if (!confirm(t('parcours.supprimer-confirmer', { nom: parcours.nom }))) return;
        stockages[parcours.activite].supprimer(parcours.id);
        modifies();
        rendre();
      },
    })));
  }

  window.addEventListener('montis:parcours-modifies', rendre);
  surPreferences(rendre);

  return {
    id: 'parcours',
    labelCle: 'traces.parcours',
    icone: 'parcours',
    panneau,
    activer: rendre,
    desactiver() {},
  };
}
