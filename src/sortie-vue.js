// Vue d'une sortie sur la carte : trace colorée (vitesse, altitude, pente, cardio), légende,
// stats selon l'activité, points marquants. Panneau posé sur la carte, réductible.
import * as maplibregl from 'maplibre-gl';
import { creerPanneauCarte } from './panneau-carte.js';
import { modifierSortie } from './sorties-stockage.js';
import {
  analyserSortie, bornes, couleurDegrade, DEGRADE, modesPossibles, morceaux, valeursMode,
} from './sortie-analyse.js';
import { PALIERS_PENTE, palierPente } from './parcours-analyse.js';
import { paletteInterface } from './vent-cadran.js';
import { lire, ecrire } from './reglages.js';
import { formatAltitude, formatDenivele, formatDistance, formatTemp, imperial, nombre } from './unites.js';
import { surPreferences } from './preferences.js';
import { formatDate, heureCourte, t, ta, ti, tt } from './i18n.js';
import { TYPES, formatDureeReelle, iconeType, libelleType, nomSortie } from './traces-commun.js';

const SOURCE = 'sortie-trace';
const SOURCE_BOUTS = 'sortie-bouts';
const COULEUR_CERNE = '#0b111b';
const CANAUX_LIBELLES = {
  alt: 'traces.canal-alt', altGps: 'traces.canal-alt-gps', fc: 'traces.canal-fc', cadence: 'traces.canal-cadence',
  puissance: 'traces.canal-puissance', temperature: 'traces.canal-temperature', vitesse: 'traces.canal-vitesse',
};
const MODES = { vitesse: 'traces.mode-vitesse', altitude: 'traces.mode-altitude', pente: 'traces.mode-pente', cardio: 'traces.mode-cardio' };
const ICONES_REPERES = {
  haut: '<path d="m4 19 8-14 8 14Z"/>',
  vitesse: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  deco: '<path d="M4 15c4-6 12-6 16 0"/><path d="M12 15v5"/>',
};

const vitesseTexte = (ms) => (imperial() ? `${nombre(ms * 2.236936, 1)} mph` : `${nombre(ms * 3.6, 1)} km/h`);
const varioTexte = (ms) => `${ms > 0 ? '+' : ''}${nombre(ms, 1)} m/s`;
const pourcentTexte = (p) => `${Math.round(p)} %`;

// Les chiffres de la sortie, selon l'activité : [clé du libellé, valeur affichée], seulement ceux qui existent
export function lignesStats(type, s, { cadenceEnPas = false } = {}) {
  const ok = (v) => v != null && Number.isFinite(v);
  const l = [];
  const ajouter = (cle, valeur, texte) => ok(valeur) && l.push([cle, texte(valeur)]);
  ajouter('traces.stat-duree-totale', s.duree, formatDureeReelle);
  if (s.tempsPause > 60) ajouter('traces.stat-pauses', s.tempsPause, (v) => t('traces.pauses-detail', { n: s.pauses, duree: formatDureeReelle(v) }));
  ajouter('D+', s.plus, formatDenivele);
  ajouter('D−', s.moins, formatDenivele);
  ajouter('editeur.alt-max', s.altMax, formatAltitude);
  ajouter('editeur.alt-min', s.altMin, formatAltitude);
  if (type === 'parapente') {
    ajouter('traces.stat-duree-vol', s.dureeVol, formatDureeReelle);
    ajouter('traces.stat-alt-deco', s.altDeco, formatAltitude);
    ajouter('traces.stat-gain', s.gainMax, formatDenivele);
    ajouter('traces.stat-vario-max', s.varioMax, varioTexte);
    ajouter('traces.stat-vario-min', s.varioMin, varioTexte);
    ajouter('traces.stat-distance-deco', s.distanceMaxDeco, formatDistance);
    ajouter('traces.stat-vitesse-max', s.vitesseMax, vitesseTexte);
  } else if (type === 'ski') {
    ajouter('traces.stat-descentes', s.descentes, (v) => String(v));
    ajouter('traces.stat-descendu', s.deniveleDescendu, formatDenivele);
    ajouter('traces.stat-plus-longue', s.plusLongueDescente, formatDenivele);
    ajouter('traces.stat-vitesse-max', s.vitesseMaxDescente ?? s.vitesseMax, vitesseTexte);
  } else {
    ajouter('traces.stat-vitesse-moyenne', s.vitesseMoyenne, vitesseTexte);
    if (type === 'velo') ajouter('traces.stat-vitesse-max', s.vitesseMax, vitesseTexte);
    ajouter('traces.stat-vitesse-montee', s.vitesseMontee, (v) => `${nombre(Math.round(imperial() ? v * 3.28084 : v))} ${imperial() ? 'ft/h' : 'm/h'}`);
  }
  ajouter('traces.stat-fc-moyenne', s.fcMoyenne, (v) => `${Math.round(v)} bpm`);
  ajouter('traces.stat-fc-max', s.fcMax, (v) => `${Math.round(v)} bpm`);
  ajouter('traces.stat-puissance', s.puissanceMoyenne, (v) => `${Math.round(v)} W`);
  ajouter('traces.stat-cadence', s.cadenceMoyenne, (v) => (cadenceEnPas ? t('traces.pas-min', { n: Math.round(v * 2) }) : t('traces.tr-min', { n: Math.round(v) })));
  ajouter('traces.stat-temperature', s.temperature, (v) => formatTemp(v));
  return l;
}

export function creerVueSortie(map, { ouvrirMenu, onModifiee }) {
  let sortie = null;
  let analyse = null;
  let mode = lire('sortie-couleur', 'vitesse');
  let reperes = [];

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
    <div class="parcours-stats traces-principales">
      <div class="parcours-stat parcours-stat-principale">${tt('editeur.distance')}<strong data-v="distance">—</strong></div>
      <div class="parcours-stat parcours-stat-principale"><span data-v="libelle-temps"></span><strong data-v="temps">—</strong></div>
    </div>
    <div class="traces-couleur">
      <span class="traces-couleur-titre" ${ti('traces.colorer')}>${t('traces.colorer')}</span>
      <div class="parcours-pratiques traces-modes" role="group" ${ta('aria-label', 'traces.colorer')}></div>
      <div class="traces-legende" aria-hidden="true"></div>
    </div>
    <dl class="traces-stats"></dl>
    <div class="traces-reperes" hidden>
      <h4 ${ti('traces.reperes')}>${t('traces.reperes')}</h4>
      <div class="traces-reperes-liste"></div>
    </div>
    <p class="traces-canaux"></p>
  `;
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const boutonsType = [...panneau.corps.querySelectorAll('[data-type]')];

  // ---------- Carte ----------
  function assurerCouches() {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', tolerance: 0, data: { type: 'FeatureCollection', features: [] } });
    map.addSource(SOURCE_BOUTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'sortie-trace-contour', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': COULEUR_CERNE, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4.5, 14, 10] },
    });
    map.addLayer({
      id: 'sortie-trace', type: 'line', source: SOURCE, layout: lissage,
      paint: { 'line-color': ['get', 'couleur'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6] },
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

  function couleurs() {
    // Ni heure ni altitude : une seule couleur, celle de l'accent
    if (!mode) {
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#5fb59a';
      return { couleurDe: () => accent };
    }
    const valeurs = valeursMode(mode, analyse, sortie.points);
    if (mode === 'pente') {
      const palette = paletteInterface();
      return { couleurDe: (i) => palette[palierPente(valeurs[i])] };
    }
    const b = bornes(valeurs);
    const etendue = b.max - b.min;
    // 24 nuances : assez pour un dégradé, assez peu pour regrouper les segments
    return { bornes: b, couleurDe: (i) => couleurDegrade(Math.round(((valeurs[i] - b.min) / etendue) * 24) / 24) };
  }

  function dessinerTrace() {
    assurerCouches();
    const { couleurDe, bornes: b } = couleurs();
    map.getSource(SOURCE).setData({ type: 'FeatureCollection', features: morceaux(sortie.points, sortie.coupures, couleurDe) });
    rendreLegende(b);
  }

  function poserReperes() {
    reperes.forEach((repere) => repere.remove());
    const { lng, lat } = sortie.points;
    reperes = analyse.marquants.map((marquant) => {
      const ici = [lng[marquant.index], lat[marquant.index]];
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'sortie-repere';
      element.innerHTML = `<span class="sortie-repere-pastille sortie-repere-${marquant.type}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES_REPERES[marquant.type]}</svg><b></b></span>`;
      element.querySelector('b').textContent = texteRepere(marquant, true);
      element.setAttribute('aria-label', texteRepere(marquant));
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        allerA(marquant);
      });
      return new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -6] })
        .setLngLat(ici)
        .addTo(map);
    });
    empiler();
  }

  // Deux repères qui se chevauchent à l'écran (une pause au sommet) : le second monte d'un cran.
  // Recalculé à chaque zoom, puisque le chevauchement en dépend.
  function empiler() {
    const poses = [];
    for (const repere of reperes) {
      const point = map.project(repere.getLngLat());
      const largeur = repere.getElement().offsetWidth || 120;
      let cran = 0;
      while (poses.some((autre) => autre.cran === cran && Math.abs(autre.x - point.x) < (autre.largeur + largeur) / 2 && Math.abs(autre.y - point.y) < 30)) cran++;
      poses.push({ x: point.x, y: point.y, largeur, cran });
      repere.setOffset([0, -6 - cran * 32]);
    }
  }
  map.on('zoomend', () => reperes.length && empiler());

  function allerA(marquant) {
    map.flyTo({ center: [sortie.points.lng[marquant.index], sortie.points.lat[marquant.index]], zoom: Math.max(map.getZoom(), 14), duration: 900 });
  }

  function cadrer() {
    const { lng, lat } = sortie.points;
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

  function dessinerBouts() {
    const { lng, lat } = sortie.points;
    const dernier = lng.length - 1;
    map.getSource(SOURCE_BOUTS).setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { bout: 'arrivee' }, geometry: { type: 'Point', coordinates: [lng[dernier], lat[dernier]] } },
        { type: 'Feature', properties: { bout: 'depart' }, geometry: { type: 'Point', coordinates: [lng[0], lat[0]] } },
      ],
    });
  }

  // ---------- Panneau ----------
  function texteRepere(marquant, court = false) {
    const heure = sortie.points.t ? heureCourte(new Date(sortie.points.t[marquant.index])) : null;
    if (marquant.type === 'haut') return court ? formatAltitude(marquant.valeur) : t('traces.repere-haut', { valeur: formatAltitude(marquant.valeur) });
    if (marquant.type === 'vitesse') return court ? vitesseTexte(marquant.valeur) : t('traces.repere-vitesse', { valeur: vitesseTexte(marquant.valeur) });
    if (marquant.type === 'pause') {
      const duree = formatDureeReelle(marquant.valeur);
      return court ? duree : t('traces.repere-pause', { duree, heure: heure ?? '' });
    }
    if (marquant.type === 'deco') return court ? t('traces.deco-court') : t('traces.repere-deco', { heure: heure ?? '' });
    return '';
  }

  function rendreLegende(b) {
    const legende = $('.traces-legende');
    if (!mode) {
      legende.replaceChildren();
      return;
    }
    if (mode === 'pente') {
      const palette = paletteInterface();
      const limites = [0, ...PALIERS_PENTE];
      legende.innerHTML = `<div class="traces-legende-classes">${palette.map((couleur, i) => `<span><i style="background:${couleur}"></i>${i < PALIERS_PENTE.length ? `${limites[i]}–${limites[i + 1]}` : `> ${limites[i]}`} %</span>`).join('')}</div>`;
      return;
    }
    const texte = {
      vitesse: vitesseTexte,
      altitude: formatAltitude,
      cardio: (v) => `${Math.round(v)} bpm`,
    }[mode];
    legende.innerHTML = `
      <div class="traces-legende-barre" style="background: linear-gradient(90deg, ${DEGRADE.join(', ')})"></div>
      <div class="traces-legende-bornes"><span>${texte(b.min)}</span><span>${texte(b.max)}</span></div>`;
  }

  function rendreModes() {
    const possibles = modesPossibles(analyse, sortie.points);
    if (!possibles.includes(mode)) mode = possibles[0] ?? null;
    const bloc = $('.traces-couleur');
    bloc.hidden = !possibles.length;
    const conteneur = $('.traces-modes');
    conteneur.style.gridTemplateColumns = `repeat(${Math.max(1, possibles.length)}, minmax(0, 1fr))`;
    conteneur.innerHTML = possibles.map((id) => `<button type="button" data-mode="${id}" aria-pressed="${id === mode}">${t(MODES[id])}</button>`).join('');
    conteneur.querySelectorAll('[data-mode]').forEach((bouton) => bouton.addEventListener('click', () => {
      if (bouton.dataset.mode === mode) return;
      mode = bouton.dataset.mode;
      ecrire('sortie-couleur', mode);
      rendreModes();
      dessinerTrace();
    }));
  }

  function remplir() {
    const s = analyse.stats;
    panneau.titre.textContent = nomSortie(sortie);
    panneau.meta.textContent = [
      libelleType(sortie.type),
      sortie.debut ? formatDate(sortie.debut, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    ].filter(Boolean).join(' · ');
    boutonsType.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.type === sortie.type)));

    $('[data-v="distance"]').textContent = formatDistance(s.distance);
    // Le temps en mouvement est le chiffre qui parle ; sans pause, c'est la durée
    const avecPauses = s.tempsMouvement != null && s.tempsPause > 60;
    $('[data-v="libelle-temps"]').textContent = t(avecPauses ? 'traces.stat-en-mouvement' : 'traces.duree');
    $('[data-v="temps"]').textContent = s.duree != null ? formatDureeReelle(avecPauses ? s.tempsMouvement : s.duree) : '—';
    panneau.definirResume({
      rose: iconeType(sortie.type),
      nom: nomSortie(sortie),
      detail: [formatDistance(s.distance), s.duree != null ? formatDureeReelle(s.duree) : null, s.plus != null ? `D+ ${formatDenivele(s.plus)}` : null].filter(Boolean).join(' · '),
      valeur: '',
      unite: '',
    });

    const lignes = lignesStats(analyse.type, s, { cadenceEnPas: analyse.type === 'rando' })
      .filter(([cle]) => !(cle === 'traces.stat-duree-totale' && !avecPauses));
    $('.traces-stats').innerHTML = lignes.map(([cle, valeur]) => `<div><dt>${cle.includes('.') ? t(cle) : cle}</dt><dd>${valeur}</dd></div>`).join('');

    const blocReperes = $('.traces-reperes');
    blocReperes.hidden = !analyse.marquants.length;
    $('.traces-reperes-liste').replaceChildren(...analyse.marquants.map((marquant) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'traces-repere';
      bouton.innerHTML = `<span class="sortie-repere-pastille sortie-repere-${marquant.type}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES_REPERES[marquant.type]}</svg></span><span></span>`;
      bouton.lastChild.textContent = texteRepere(marquant);
      bouton.addEventListener('click', () => {
        allerA(marquant);
        if (window.matchMedia('(max-width: 640px)').matches) panneau.element.querySelector('.bf-reduire')?.click();
      });
      return bouton;
    }));

    const canaux = (sortie.canaux ?? []).filter((canal) => CANAUX_LIBELLES[canal]).map((canal) => t(CANAUX_LIBELLES[canal]));
    $('.traces-canaux').textContent = t('traces.donnees', {
      format: sortie.format.toUpperCase(),
      liste: [sortie.points.t ? t('traces.canal-heure') : null, ...canaux].filter(Boolean).join(', ') || t('traces.canal-position'),
    });
    rendreModes();
  }

  boutonsType.forEach((bouton) => bouton.addEventListener('click', async () => {
    if (!sortie || bouton.dataset.type === sortie.type) return;
    sortie.type = bouton.dataset.type;
    analyse = analyserSortie(sortie);
    remplir();
    poserReperes();
    try {
      await modifierSortie(sortie.id, { type: sortie.type });
    } catch (erreur) {
      console.warn('Type de sortie non enregistré :', erreur);
    }
    onModifiee();
  }));

  function fermer() {
    sortie = null;
    analyse = null;
    panneau.masquer();
    reperes.forEach((repere) => repere.remove());
    reperes = [];
    map.getSource(SOURCE)?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource(SOURCE_BOUTS)?.setData({ type: 'FeatureCollection', features: [] });
  }

  surPreferences(() => {
    if (!sortie) return;
    remplir();
    poserReperes();
    dessinerTrace();
  });

  return {
    ouvrir(complete) {
      sortie = complete;
      analyse = analyserSortie(sortie);
      remplir();
      panneau.afficher();
      panneau.agrandir();
      dessinerTrace();
      dessinerBouts();
      poserReperes();
      cadrer();
    },
    get id() {
      return sortie?.id ?? null;
    },
    fermer,
  };
}
