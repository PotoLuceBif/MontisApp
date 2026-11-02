import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { afficherRefuges } from './lieux.js';
import { bloquerFiches } from './fiche.js';
import {
  niveau,
  distance,
  chercher,
  dansLaZone,
  detailsItineraire,
  extraireTrace,
  echantillonner,
  titreDe,
  NOMS_SAC,
} from './rando-api.js';
import { lireGpx } from './parcours-gpx.js';
import { decoderPolyligne6 } from './parcours-routage.js';
import {
  altitudesDuTrace,
  lisser,
  denivele,
  dureeEstimee,
  formaterDuree,
  creerProfil,
  telechargerGpx,
} from './rando-profil.js';

const ZOOM_MIN_ZONE = 7;
const PARALLELISME_REPERES = 2;
const DISTANCE_GRAPPE_PX = 56;
const URL_CALCUL_ITINERAIRE = 'https://valhalla1.openstreetmap.de/route';
const MAX_ETAPES_PAR_CALCUL = 10;
const COULEUR_TRACE = '#4debd4';
const TAILLE_MAX_GPX = 10 * 1024 * 1024;

const vide = () => ({ type: 'FeatureCollection', features: [] });

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

function lienWikipedia(tag) {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const langue = i > 0 ? tag.slice(0, i) : 'fr';
  const titre = i > 0 ? tag.slice(i + 1) : tag;
  if (!/^[a-z-]{2,10}$/i.test(langue)) return null;
  return `https://${langue}.wikipedia.org/wiki/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
}

function lienExterne(texte, url) {
  const a = el('a', null, texte);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

const km = (m) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
const metres = (m) => `${Math.round(m).toLocaleString('fr-FR')} m`;

function echantillonnerLignes(lignes) {
  const segments = lignes
    .map((points) => {
      const cumuls = [0];
      for (let i = 1; i < points.length; i++) {
        cumuls.push(cumuls[i - 1] + distance(points[i - 1], points[i]));
      }
      return { points, cumuls, longueur: cumuls[cumuls.length - 1] };
    })
    .filter((segment) => segment.longueur > 0);
  const total = segments.reduce((somme, segment) => somme + segment.longueur, 0);
  if (!(total > 0)) return { points: [], total: 0 };

  const n = Math.min(500, Math.max(20, Math.round(total / 40)));
  const points = [];
  let segmentIndex = 0;
  let pointIndex = 1;
  let distanceSegment = 0;
  for (let i = 0; i < n; i++) {
    const cible = (total * i) / (n - 1);
    while (
      segmentIndex < segments.length - 1 &&
      cible > distanceSegment + segments[segmentIndex].longueur
    ) {
      distanceSegment += segments[segmentIndex].longueur;
      segmentIndex++;
      pointIndex = 1;
    }

    const segment = segments[segmentIndex];
    const locale = cible - distanceSegment;
    while (pointIndex < segment.cumuls.length - 1 && segment.cumuls[pointIndex] < locale) {
      pointIndex++;
    }
    const avant = segment.cumuls[pointIndex - 1];
    const apres = segment.cumuls[pointIndex];
    const t = apres > avant ? (locale - avant) / (apres - avant) : 0;
    const a = segment.points[pointIndex - 1];
    const b = segment.points[pointIndex];
    points.push({
      lng: a[0] + (b[0] - a[0]) * t,
      lat: a[1] + (b[1] - a[1]) * t,
      d: cible,
    });
  }
  return { points, total };
}

export function creerActiviteRandonnee(map) {
  let actif = false;
  let recherche = '';
  let etatRech = 'vide'; // vide | attente | ok | erreur
  let etatZone = 'repos'; // repos | loin | chargement | ok | erreur
  let zonePerimee = false;
  let messageDetailsZone = '';
  let resultatsRecherche = [];
  let minuteurRech = null;
  let ctrlZone = null;
  let ctrlMarqueurs = null;
  let ctrlRech = null;
  let marqueursDecouverte = [];
  let routesChargees = [];
  let popupGrappe = null;
  let minuteurFermetureGrappe = null;
  let popupResume = null;
  let minuteurFermetureResume = null;
  let compteurZone = 0;
  let creationActive = false;
  let etapesCreation = [];
  const historiqueEtapesCreation = [];
  let marqueursEtapes = [];
  let controleurCreation = null;
  let numeroCalculCreation = 0;
  let selection = 0;
  let fiche = null;
  let ficheCreationReduite = false;
  let ficheItineraireReduite = false;
  let allureParKm = '10:00';
  let curseurCarte = null;
  let ecouteurPose = false;

  // ---------- Panneau du menu ----------
  const panneau = el('div', 'rando');
  panneau.innerHTML = `
    <input type="text" class="rando-champ" placeholder="Rechercher une randonnée ou un parcours…"
      autocomplete="off" spellcheck="false" inputmode="search" aria-label="Rechercher un itinéraire">
    <div class="rando-actions-principales" role="group" aria-label="Actions randonnée">
      <button type="button" class="rando-creation-demarrer rando-action-principale" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20V6.5Z"/><path d="M8.5 4v13.5M15.5 6.5V20M12 9.5l2 2-2 2-2-2 2-2Z"/></svg>
        <span>Créer un parcours</span>
      </button>
      <button type="button" class="rando-zone-bouton rando-action-principale">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>
        <span class="rando-zone-libelle">Rechercher ici</span>
      </button>
      <label class="rando-importer rando-action-principale">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 13v6h14v-6"/></svg>
        <span>Importer un GPX</span>
        <input type="file" class="rando-fichier" accept=".gpx,application/gpx+xml,application/xml,text/xml">
      </label>
    </div>
    <p class="note rando-import-message" role="status" aria-live="polite"></p>
    <p class="note rando-aide" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste" hidden></div>
    <details class="rando-outils">
      <summary>Autres options</summary>
      <div class="rando-outils-contenu">
        <div class="rando-options">
          <label class="option-case"><input type="checkbox" id="rando-refuges"> Refuges
            <small>Même réglage que dans Éléments de la carte</small></label>
          <label class="option-case"><input type="checkbox" id="rando-apercu"> Aperçu des sentiers
            <small>Superpose tous les sentiers balisés (Waymarked Trails)</small></label>
        </div>
        <p class="note">Création : Valhalla (profil piéton), chemins OpenStreetMap. Vérifiez le terrain avant de partir.<br>Itinéraires : © contributeurs OpenStreetMap · Waymarked Trails</p>
      </div>
    </details>
  `;
  const champFichier = panneau.querySelector('.rando-fichier');
  const messageImport = panneau.querySelector('.rando-import-message');
  const champ = panneau.querySelector('.rando-champ');
  const boutonZone = panneau.querySelector('.rando-zone-bouton');
  const aide = panneau.querySelector('.rando-aide');
  const liste = panneau.querySelector('.rando-liste');
  const caseRefuges = panneau.querySelector('#rando-refuges');
  const caseApercu = panneau.querySelector('#rando-apercu');
  const boutonCreation = panneau.querySelector('.rando-creation-demarrer');
  const libelleCreation = boutonCreation.querySelector('span');
  const libelleZone = panneau.querySelector('.rando-zone-libelle');
  let nomParcoursCreation = 'Mon parcours';
  caseRefuges.checked = !!lire('refuges', false);
  caseApercu.checked = !!lire('rando-apercu', false);

  const commandesFlottantes = el('aside', 'rando-creation-flottante');
  commandesFlottantes.hidden = true;
  commandesFlottantes.setAttribute('aria-label', 'Commandes de création du parcours');
  commandesFlottantes.innerHTML = `
    <header class="rando-creation-flottante-entete">
      <button type="button" class="rando-creation-deplacer" aria-label="Déplacer les commandes du parcours">
        <span>Parcours</span><strong class="rando-creation-compteur"></strong>
      </button>
      <button type="button" class="rando-creation-reduire" aria-expanded="true" aria-label="Réduire les commandes">−</button>
      <button type="button" class="rando-creation-fermer" aria-label="Fermer et effacer le parcours">×</button>
    </header>
    <p class="note rando-creation-aide" role="status" aria-live="polite">Cliquez sur « Créer un parcours » pour placer le départ.</p>
    <div class="rando-creation-flottante-actions">
      <button type="button" class="rando-creation-mini-annuler" aria-label="Annuler la dernière action" title="Annuler la dernière action">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 0 14h-2"/></svg>
      </button>
      <button type="button" class="rando-creation-mini-recommencer" aria-label="Recommencer le parcours" title="Recommencer le parcours">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5"/><path d="M19 12a7.5 7.5 0 1 0 1 4"/></svg>
      </button>
      <button type="button" class="rando-creation-mini-terminer" aria-label="Terminer la création" title="Terminer la création">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(commandesFlottantes);
  const boutonMiniAnnuler = commandesFlottantes.querySelector('.rando-creation-mini-annuler');
  const boutonMiniRecommencer = commandesFlottantes.querySelector('.rando-creation-mini-recommencer');
  const boutonMiniTerminer = commandesFlottantes.querySelector('.rando-creation-mini-terminer');
  const compteurMiniCreation = commandesFlottantes.querySelector('.rando-creation-compteur');
  const aideCreation = commandesFlottantes.querySelector('.rando-creation-aide');
  const boutonDeplacer = commandesFlottantes.querySelector('.rando-creation-deplacer');
  const boutonReduire = commandesFlottantes.querySelector('.rando-creation-reduire');
  const boutonFermerCreation = commandesFlottantes.querySelector('.rando-creation-fermer');
  let popupEtapeCreation = null;

  // ---------- Fiche d'itinéraire (en bas de la carte) ----------
  const carte = el('aside');
  carte.id = 'rando-fiche';
  carte.hidden = true;
  document.body.appendChild(carte);

  function actualiserPositionCommandesCreation() {
    if (
      !window.matchMedia('(max-width: 700px)').matches
      || carte.hidden
      || !fiche
      || fiche.origine !== 'creation'
    ) {
      commandesFlottantes.style.removeProperty('bottom');
      return;
    }
    const zoneFiche = carte.getBoundingClientRect();
    commandesFlottantes.style.bottom = `${Math.max(150, window.innerHeight - zoneFiche.top + 10)}px`;
  }

  const observateurFiche = new ResizeObserver(actualiserPositionCommandesCreation);
  observateurFiche.observe(carte);
  window.addEventListener('resize', actualiserPositionCommandesCreation);

  // ---------- Tracé sur la carte ----------
  function assurerCouches() {
    if (map.getSource('rando-trace')) return;
    map.addSource('rando-trace', { type: 'geojson', data: vide() });
    map.addSource('rando-points', { type: 'geojson', data: vide() });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'rando-trace-contour',
      type: 'line',
      source: 'rando-trace',
      layout: lissage,
      paint: {
        'line-color': '#0b111b',
        'line-opacity': 0.95,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 9],
      },
    });
    map.addLayer({
      id: 'rando-trace',
      type: 'line',
      source: 'rando-trace',
      layout: lissage,
      paint: {
        'line-color': COULEUR_TRACE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5],
        'line-blur': 1.1,
      },
    });
    map.addLayer({
      id: 'rando-points-halo',
      type: 'circle',
      source: 'rando-points',
      paint: {
        'circle-radius': 14,
        'circle-color': '#ff59d6',
        'circle-blur': 0.8,
      },
    });
    map.addLayer({
      id: 'rando-points',
      type: 'circle',
      source: 'rando-points',
      paint: {
        'circle-radius': 6,
        'circle-color': '#4debd4',
        'circle-stroke-color': '#ff59d6',
        'circle-stroke-width': 2.5,
      },
    });
  }

  function dessinerTrace(trace) {
    assurerCouches();
    map.getSource('rando-trace').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: trace.lignes } }],
    });
    const points = [];
    const c = trace.chaine;
    if (c.length > 1) {
      points.push({ type: 'Feature', properties: { role: 'depart' }, geometry: { type: 'Point', coordinates: c[0] } });
      if (distance(c[0], c[c.length - 1]) > 200) {
        points.push({
          type: 'Feature',
          properties: { role: 'arrivee' },
          geometry: { type: 'Point', coordinates: c[c.length - 1] },
        });
      }
    }
    map.getSource('rando-points').setData({ type: 'FeatureCollection', features: points });
  }

  function effacerTrace() {
    if (!map.getSource('rando-trace')) return;
    map.getSource('rando-trace').setData(vide());
    map.getSource('rando-points').setData(vide());
  }

  function rendreCommandesCreation() {
    libelleCreation.textContent = creationActive
      ? 'Terminer'
      : etapesCreation.length
        ? 'Reprendre'
        : 'Créer un parcours';
    boutonCreation.setAttribute('aria-pressed', String(creationActive));
    commandesFlottantes.hidden = !creationActive;
    compteurMiniCreation.textContent = `${etapesCreation.length} point${etapesCreation.length === 1 ? '' : 's'}`;
    boutonMiniAnnuler.disabled = historiqueEtapesCreation.length === 0;
    boutonMiniRecommencer.disabled = etapesCreation.length === 0;
  }

  function memoriserEtapesCreation() {
    historiqueEtapesCreation.push({
      etapes: etapesCreation.map((point) => [...point]),
      nom: nomParcoursCreation,
    });
    if (historiqueEtapesCreation.length > 50) historiqueEtapesCreation.shift();
  }

  function reduireCommandesCreation(reduit) {
    commandesFlottantes.classList.toggle('reduit', reduit);
    boutonReduire.setAttribute('aria-expanded', String(!reduit));
    boutonReduire.setAttribute('aria-label', reduit ? 'Afficher les commandes du parcours' : 'Réduire en bulle');
    boutonReduire.innerHTML = reduit
      ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m14.5 5.5 4 4M4 20l4.3-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/></svg>'
      : '−';
  }

  function fermerPopupEtapeCreation() {
    if (!popupEtapeCreation) return;
    popupEtapeCreation.remove();
    popupEtapeCreation = null;
  }

  function ouvrirChoixDepart() {
    fermerPopupEtapeCreation();
    const contenu = el('div', 'rando-creation-choix-depart');
    contenu.append(el('strong', null, 'Point de départ'));
    if (creationActive && etapesCreation.length > 1 && !parcoursBoucle()) {
      const boucler = el('button', 'rando-creation-choix-boucler');
      boucler.type = 'button';
      boucler.textContent = 'Boucler le parcours';
      boucler.addEventListener('click', () => {
        if (etapesCreation.length < 2 || parcoursBoucle()) return;
        memoriserEtapesCreation();
        etapesCreation.push([...etapesCreation[0]]);
        fermerPopupEtapeCreation();
        afficherEtapesCreation();
        aideCreation.textContent = 'Parcours bouclé. Ajoutez des étapes pour continuer, bouclez à nouveau ou terminez la création.';
        calculerParcoursCree();
      });
      contenu.append(boucler);
    }
    const retirer = el('button', 'rando-creation-choix-retirer');
    retirer.type = 'button';
    retirer.textContent = 'Retirer le point 1';
    retirer.addEventListener('click', () => {
      fermerPopupEtapeCreation();
      retirerEtapeCreation(0);
    });
    contenu.append(retirer);

    popupEtapeCreation = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '220px',
      offset: 18,
    })
      .setLngLat(etapesCreation[0])
      .setDOMContent(contenu)
      .addTo(map);
    popupEtapeCreation.on('close', () => { popupEtapeCreation = null; });
  }

  function parcoursBoucle() {
    if (etapesCreation.length < 3) return false;
    const depart = etapesCreation[0];
    const arrivee = etapesCreation[etapesCreation.length - 1];
    return depart[0] === arrivee[0] && depart[1] === arrivee[1];
  }

  function afficherEtapesCreation() {
    fermerPopupEtapeCreation();
    marqueursEtapes.forEach((marqueur) => marqueur.remove());
    const boucle = parcoursBoucle();
    marqueursEtapes = etapesCreation.flatMap((coordonnees, index) => {
      if (boucle && index === etapesCreation.length - 1) return [];
      const element = el('button', 'rando-creation-etape', String(index + 1));
      element.type = 'button';
      if (boucle && index === 0) element.classList.add('boucle');
      const libellePoint = boucle && index === 0
        ? 'Point 1, départ et arrivée du parcours bouclé'
        : `Point ${index + 1}`;
      element.setAttribute('aria-label', `${libellePoint} : options`);
      element.title = index === 0
        ? boucle ? 'Retirer le point 1' : 'Boucler le parcours ou retirer le point 1'
        : `Retirer le point ${index + 1}`;
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        if (index === 0) ouvrirChoixDepart();
        else retirerEtapeCreation(index);
      });
      return [new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat(coordonnees)
        .addTo(map)];
    });
    rendreCommandesCreation();
  }

  async function calculerParcoursCree() {
    if (etapesCreation.length < 2) return;
    const boucle = parcoursBoucle();
    if (controleurCreation) controleurCreation.abort();
    const controleur = new AbortController();
    controleurCreation = controleur;
    const calcul = ++numeroCalculCreation;
    const jeton = ++selection;
    const nom = nomParcoursCreation.trim() || 'Mon parcours';
    nomParcoursCreation = nom;
    if (fiche && fiche.origine === 'creation') {
      fiche = null;
      rendreFiche();
    }
    effacerTrace();
    const nombreCalculs = Math.ceil((etapesCreation.length - 1) / (MAX_ETAPES_PAR_CALCUL - 1));

    try {
      const coordonnees = [];
      let longueur = 0;
      for (let debut = 0, numeroCalcul = 1; debut < etapesCreation.length - 1; debut += MAX_ETAPES_PAR_CALCUL - 1, numeroCalcul++) {
        aideCreation.textContent = nombreCalculs > 1
          ? `Calcul du tronçon ${numeroCalcul}/${nombreCalculs}…`
          : 'Calcul du chemin piéton…';
        const locations = etapesCreation
          .slice(debut, debut + MAX_ETAPES_PAR_CALCUL)
          .map(([lon, lat]) => ({ lon, lat }));
        const requete = { locations, costing: 'pedestrian', units: 'kilometers' };
        const url = `${URL_CALCUL_ITINERAIRE}?json=${encodeURIComponent(JSON.stringify(requete))}`;
        const reponse = await fetch(url, { signal: controleur.signal });
        if (!reponse.ok) throw new Error(`Le service de calcul répond HTTP ${reponse.status}.`);
        const resultat = await reponse.json();
        if (controleur.signal.aborted || controleurCreation !== controleur || numeroCalculCreation !== calcul) return;
        const trajet = resultat.trip;
        if (!trajet || trajet.status !== 0 || !Array.isArray(trajet.legs)) {
          throw new Error(trajet?.status_message || 'Aucun chemin praticable trouvé entre ces étapes.');
        }
        for (const troncon of trajet.legs) {
          const ligne = decoderPolyligne6(troncon.shape);
          if (coordonnees.length && ligne.length && distance(coordonnees[coordonnees.length - 1], ligne[0]) < 1) {
            ligne.shift();
          }
          coordonnees.push(...ligne);
        }
        longueur += trajet.legs.reduce(
          (total, troncon) => total + (Number(troncon.summary?.length) || 0) * 1000,
          0
        );
      }
      if (coordonnees.length < 2) {
        throw new Error('Le service n’a pas renvoyé de tracé exploitable.');
      }

      if (!(longueur > 0)) longueur = echantillonnerLignes([coordonnees]).total;
      const trace = { lignes: [coordonnees], chaine: coordonnees };
      fiche = {
        type: 'gpx',
        origine: 'creation',
        nom,
        trace,
        longueur,
        profil: 'calcul',
      };
      dessinerTrace(trace);
      rendreFiche();
      aideCreation.textContent = boucle
        ? `Parcours bouclé : ${km(longueur)}.`
        : `Parcours calculé : ${km(longueur)}. Ajoutez une étape pour modifier le tracé, ou terminez-le.`;
      await calculerProfil(jeton);
      if (controleurCreation === controleur && numeroCalculCreation === calcul) {
        aideCreation.textContent = boucle
          ? `Parcours bouclé : ${km(longueur)}.`
          : `Parcours calculé : ${km(longueur)}.`;
      }
    } catch (e) {
      if (e.name === 'AbortError' || controleurCreation !== controleur || numeroCalculCreation !== calcul) return;
      aideCreation.textContent = e instanceof Error
        ? `${e.message} Vérifiez les étapes et réessayez.`
        : 'Le calcul du parcours a échoué. Vérifiez les étapes et réessayez.';
      console.warn('Création de parcours :', e);
    }
  }

  function ajouterEtapeCreation(event) {
    if (!actif || !creationActive) return;
    memoriserEtapesCreation();
    etapesCreation.push([event.lngLat.lng, event.lngLat.lat]);
    afficherEtapesCreation();
    if (etapesCreation.length < 2) {
      aideCreation.textContent = 'Départ ajouté. Cliquez sur un chemin pour choisir la prochaine étape, ou touchez son numéro pour le retirer.';
      return;
    }
    calculerParcoursCree();
  }

  function basculerCreation() {
    if (!actif) return;
    if (creationActive) {
      creationActive = false;
      bloquerFiches(false);
      map.getCanvas().style.cursor = '';
      aideCreation.textContent = etapesCreation.length
        ? 'Parcours conservé. Vous pouvez le reprendre ou le télécharger depuis sa fiche.'
        : 'Création terminée. Aucun parcours n’a été ajouté.';
      actualiserMarqueursDecouverte();
    } else {
      if (fiche && fiche.origine !== 'creation') fermerFiche();
      if (!etapesCreation.length) ficheCreationReduite = false;
      creationActive = true;
      masquerMarqueursDecouverte();
      bloquerFiches(true);
      map.getCanvas().style.cursor = 'crosshair';
      aideCreation.textContent = etapesCreation.length
        ? 'Cliquez sur la carte pour ajouter une étape au parcours.'
        : 'Cliquez sur la carte pour placer le départ, puis ajoutez des étapes sur le chemin.';
      const mobile = window.matchMedia('(max-width: 640px)').matches;
      reduireCommandesCreation(mobile);
      if (mobile) {
        document.getElementById('menu-fermer')?.click();
      }
    }
    rendreCommandesCreation();
  }

  function annulerDerniereActionCreation() {
    if (!historiqueEtapesCreation.length) return;
    const precedent = historiqueEtapesCreation.pop();
    etapesCreation = precedent.etapes;
    nomParcoursCreation = precedent.nom;
    if (controleurCreation) controleurCreation.abort();
    numeroCalculCreation++;
    if (etapesCreation.length < 2 && fiche && fiche.origine === 'creation') {
      fiche = null;
      rendreFiche();
      effacerTrace();
    }
    afficherEtapesCreation();
    if (etapesCreation.length >= 2) calculerParcoursCree();
    else {
      aideCreation.textContent = etapesCreation.length
        ? 'Il reste le départ. Ajoutez une étape pour recalculer le parcours.'
        : creationActive
          ? 'Cliquez sur la carte pour placer le départ.'
          : 'Ajoutez des étapes sur la carte pour créer le parcours.';
    }
  }

  function retirerEtapeCreation(index) {
    if (!actif || index < 0 || index >= etapesCreation.length) return;
    memoriserEtapesCreation();
    etapesCreation.splice(index, 1);
    if (controleurCreation) controleurCreation.abort();
    numeroCalculCreation++;
    if (etapesCreation.length < 2 && fiche && fiche.origine === 'creation') {
      fiche = null;
      rendreFiche();
      effacerTrace();
    }
    afficherEtapesCreation();
    if (etapesCreation.length >= 2) calculerParcoursCree();
    else {
      aideCreation.textContent = etapesCreation.length
        ? 'Il reste le départ. Ajoutez une étape pour recalculer le parcours.'
        : creationActive
          ? 'Cliquez sur la carte pour placer le départ.'
          : 'Ajoutez des étapes sur la carte pour créer le parcours.';
    }
  }

  function effacerCreation() {
    if (controleurCreation) controleurCreation.abort();
    numeroCalculCreation++;
    etapesCreation = [];
    nomParcoursCreation = 'Mon parcours';
    if (fiche && fiche.origine === 'creation') {
      fiche = null;
      rendreFiche();
    }
    effacerTrace();
    afficherEtapesCreation();
    aideCreation.textContent = creationActive
      ? 'Parcours effacé. Cliquez sur la carte pour placer le départ.'
      : 'Parcours effacé.';
    if (!creationActive) actualiserMarqueursDecouverte();
  }

  function recommencerCreation() {
    if (!etapesCreation.length) return;
    memoriserEtapesCreation();
    effacerCreation();
  }

  function fermerCreation() {
    selection++;
    creationActive = false;
    ficheCreationReduite = false;
    bloquerFiches(false);
    map.getCanvas().style.cursor = '';
    effacerCreation();
    historiqueEtapesCreation.length = 0;
    aideCreation.textContent = 'Création fermée. Les étapes et le tracé ont été effacés.';
    rendreCommandesCreation();
    actualiserMarqueursDecouverte();
  }

  function cadrer(trace) {
    let ouest = 180;
    let sud = 90;
    let est = -180;
    let nord = -90;
    for (const ligne of trace.lignes) {
      for (const [lng, lat] of ligne) {
        if (lng < ouest) ouest = lng;
        if (lng > est) est = lng;
        if (lat < sud) sud = lat;
        if (lat > nord) nord = lat;
      }
    }
    const h = map.getContainer().clientHeight;
    const l = map.getContainer().clientWidth;
    map.fitBounds(
      [[ouest, sud], [est, nord]],
      {
        padding: {
          top: Math.min(90, Math.round(h * 0.15)),
          bottom: Math.min(300, Math.round(h * 0.4)),
          left: Math.min(60, Math.round(l * 0.1)),
          right: Math.min(60, Math.round(l * 0.1)),
        },
        maxZoom: 15,
        duration: 1200,
      }
    );
  }

  // Point qui suit le survol du profil
  function surSurvol(p) {
    if (!p) {
      if (curseurCarte) curseurCarte.remove();
      return;
    }
    if (!curseurCarte) {
      curseurCarte = new maplibregl.Marker({ element: el('div', 'rando-curseur'), anchor: 'center' });
    }
    curseurCarte.setLngLat([p.lng, p.lat]).addTo(map);
  }

  // ---------- Aperçu de tous les sentiers (couche optionnelle) ----------
  function appliquerApercu() {
    const veut = actif && caseApercu.checked;
    if (veut) {
      if (!map.getSource('rando-apercu')) {
        map.addSource('rando-apercu', {
          type: 'raster',
          tiles: ['https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Sentiers : © Waymarked Trails (CC BY-SA), © contributeurs OpenStreetMap',
        });
      }
      if (!map.getLayer('rando-apercu')) {
        map.addLayer(
          { id: 'rando-apercu', type: 'raster', source: 'rando-apercu', paint: { 'raster-opacity': 0.8 } },
          map.getLayer('rando-trace-contour') ? 'rando-trace-contour' : undefined
        );
      }
    }
    if (map.getLayer('rando-apercu')) {
      map.setLayoutProperty('rando-apercu', 'visibility', veut ? 'visible' : 'none');
    }
  }

  // ---------- Fiche : affichage ----------
  const message = (t) => el('div', 'rando-attente', t);
  function attente(t) {
    const d = el('div', 'rando-attente');
    d.append(el('span', 'rech-attente'), t);
    return d;
  }
  function stat(valeur, libelle) {
    const s = el('div', 'rando-stat');
    s.append(el('strong', null, valeur), el('span', null, libelle));
    return s;
  }

  function creerStatAllure(distanceMetres) {
    const allure = el('label', 'rando-stat rando-allure-stat');
    const champAllure = el('input', 'rando-allure-champ');
    const dureeAllure = el('strong', 'rando-allure-duree', '—');
    const libelleAllure = el('span', 'rando-allure-libelle', 'Allure (min/km)');
    champAllure.type = 'text';
    champAllure.inputMode = 'decimal'; // le clavier numérique n'a pas de deux-points : « 10,30 » est aussi accepté
    champAllure.autocomplete = 'off';
    champAllure.placeholder = '10:00';
    champAllure.value = allureParKm;
    champAllure.setAttribute('aria-label', 'Temps par kilomètre au format minutes:secondes');
    champAllure.title = 'Temps par kilomètre au format minutes:secondes';
    dureeAllure.setAttribute('aria-live', 'polite');
    dureeAllure.setAttribute('aria-label', 'Durée calculée selon votre allure');
    allure.append(champAllure, libelleAllure, dureeAllure);

    const actualiserDureeAllure = () => {
      allureParKm = champAllure.value;
      const resultat = /^(\d{1,3})(?:[:.,]([0-5]\d))?$/.exec(allureParKm.trim());
      const minutes = resultat ? Number(resultat[1]) : 0;
      const secondes = resultat ? Number(resultat[2] || 0) : 0;
      const allureHeures = (minutes + secondes / 60) / 60;
      const valide = Number.isFinite(allureHeures) && allureHeures > 0;
      champAllure.setAttribute('aria-invalid', String(!valide));
      dureeAllure.textContent = valide
        ? `≈ ${formaterDuree((distanceMetres / 1000) * allureHeures)}`
        : '—';
    };
    champAllure.addEventListener('input', actualiserDureeAllure);
    actualiserDureeAllure();
    return allure;
  }

  function creerStatDuree(distanceMetres, montee, descente) {
    return [
      stat(
        `≈ ${formaterDuree(dureeEstimee(distanceMetres, montee, descente))}`,
        'Durée estimée'
      ),
      creerStatAllure(distanceMetres),
    ];
  }

  function rendreFiche() {
    carte.replaceChildren();
    requestAnimationFrame(actualiserPositionCommandesCreation);
    if (!fiche) {
      carte.hidden = true;
      carte.classList.remove('rando-fiche-creation');
      carte.classList.remove('fiche-reduite');
      return;
    }
    carte.hidden = false;
    carte.classList.toggle('rando-fiche-creation', fiche.origine === 'creation');
    carte.classList.toggle(
      'rando-fiche-itineraire',
      fiche.type !== 'gpx' && fiche.origine !== 'creation'
    );
    carte.classList.toggle(
      'fiche-reduite',
      (fiche.origine === 'creation' && ficheCreationReduite)
      || (fiche.type !== 'gpx' && fiche.origine !== 'creation' && ficheItineraireReduite)
    );

    if (fiche.type === 'gpx') {
      const entete = el('div', 'rando-entete');
      const badge = el('span', 'rando-badge', fiche.origine === 'creation' ? 'Créé' : 'GPX');
      badge.style.background = COULEUR_TRACE;
      const titres = el('div', 'rando-titres');
      if (fiche.origine === 'creation') {
        const champNomFiche = el('input', 'rando-nom-edition');
        champNomFiche.type = 'text';
        champNomFiche.maxLength = 80;
        champNomFiche.value = fiche.nom;
        champNomFiche.setAttribute('aria-label', 'Nom du parcours');
        champNomFiche.addEventListener('input', () => {
          fiche.nom = champNomFiche.value;
          nomParcoursCreation = champNomFiche.value;
        });
        champNomFiche.addEventListener('blur', () => {
          if (!champNomFiche.value.trim()) {
            champNomFiche.value = 'Mon parcours';
            fiche.nom = champNomFiche.value;
            nomParcoursCreation = champNomFiche.value;
          }
        });
        titres.append(champNomFiche);
      } else {
        titres.append(el('div', 'rando-nom', fiche.nom));
      }
      entete.append(badge, titres);
      if (fiche.origine === 'creation') {
        const reduireFiche = el('button', 'rando-fiche-reduire');
        reduireFiche.type = 'button';
        reduireFiche.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
        reduireFiche.classList.toggle('ouverte', !ficheCreationReduite);
        reduireFiche.setAttribute('aria-expanded', String(!ficheCreationReduite));
        reduireFiche.setAttribute(
          'aria-label',
          ficheCreationReduite ? 'Afficher le détail du parcours' : 'Réduire la fiche du parcours'
        );
        reduireFiche.addEventListener('click', () => {
          ficheCreationReduite = !ficheCreationReduite;
          carte.classList.toggle('fiche-reduite', ficheCreationReduite);
          reduireFiche.classList.toggle('ouverte', !ficheCreationReduite);
          reduireFiche.setAttribute('aria-expanded', String(!ficheCreationReduite));
          reduireFiche.setAttribute(
            'aria-label',
            ficheCreationReduite ? 'Afficher le détail du parcours' : 'Réduire la fiche du parcours'
          );
        });
        entete.append(reduireFiche);
      }
      const fermer = el('button', 'fiche-fermer', '✕');
      fermer.type = 'button';
      fermer.setAttribute(
        'aria-label',
        fiche.origine === 'creation' ? 'Fermer le parcours' : 'Fermer le tracé importé'
      );
      fermer.addEventListener('click', fermerFiche);
      entete.append(fermer);
      const contenuProfil = el('div', 'rando-fiche-profil');
      const stats = el('div', 'rando-stats');
      stats.append(stat(km(fiche.longueur), 'Distance'));
      stats.append(stat(String(fiche.trace.lignes.length), 'Segments'));
      const profil = fiche.profil && typeof fiche.profil === 'object' ? fiche.profil : null;
      if (profil) {
        stats.append(stat(`+${Math.round(profil.plus).toLocaleString('fr-FR')} m`, 'Dénivelé +'));
        stats.append(stat(`−${Math.round(profil.moins).toLocaleString('fr-FR')} m`, 'Dénivelé −'));
        stats.append(stat(metres(profil.max), 'Altitude max'));
        stats.append(stat(metres(profil.min), 'Altitude min'));
        stats.append(...creerStatDuree(fiche.longueur, profil.plus, profil.moins));
      } else {
        stats.append(creerStatAllure(fiche.longueur));
      }
      contenuProfil.append(stats);
      if (profil) contenuProfil.append(creerProfil(profil, surSurvol));
      else if (fiche.profil === 'calcul') contenuProfil.append(attente('Calcul du profil d’altitude…'));
      else if (fiche.profil === 'erreur') contenuProfil.append(message('Profil d’altitude indisponible (données de relief injoignables).'));

      carte.append(entete, contenuProfil);
      const actions = el('div', 'rando-actions');
      const telecharger = el('button', 'fiche-copier', 'Télécharger le GPX');
      telecharger.type = 'button';
      telecharger.disabled = !profil;
      if (profil) {
        telecharger.addEventListener('click', () =>
          telechargerGpx(fiche.nom, profil.points, profil.altsBrutes));
      }
      actions.append(telecharger);
      carte.append(actions);
      return;
    }

    const { r, d, trace, profil, etat } = fiche;
    const tags = (d && d.tags) || {};
    const n = niveau((d && d.group) || r.group);
    const nom = titreDe({ ref: tags.ref || r.ref, name: (d && d.name) || r.name });

    // En-tête
    const entete = el('div', 'rando-entete');
    const badge = el('span', 'rando-badge', n.court);
    badge.style.background = n.couleur;
    const titres = el('div', 'rando-titres');
    titres.append(el('div', 'rando-nom', nom));
    const etapes = (d && d.itinerary) || r.itinerary;
    if (etapes && etapes.length) titres.append(el('div', 'rando-sous', etapes.join(' → ')));
    const reduire = el('button', 'rando-fiche-reduire');
    reduire.type = 'button';
    reduire.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    reduire.classList.toggle('ouverte', !ficheItineraireReduite);
    reduire.setAttribute('aria-expanded', String(!ficheItineraireReduite));
    reduire.setAttribute(
      'aria-label',
      ficheItineraireReduite ? 'Afficher le détail de l’itinéraire' : 'Réduire la fiche de l’itinéraire'
    );
    reduire.addEventListener('click', () => {
      ficheItineraireReduite = !ficheItineraireReduite;
      carte.classList.toggle('fiche-reduite', ficheItineraireReduite);
      reduire.classList.toggle('ouverte', !ficheItineraireReduite);
      reduire.setAttribute('aria-expanded', String(!ficheItineraireReduite));
      reduire.setAttribute(
        'aria-label',
        ficheItineraireReduite ? 'Afficher le détail de l’itinéraire' : 'Réduire la fiche de l’itinéraire'
      );
    });
    const fermer = el('button', 'fiche-fermer', '✕');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.addEventListener('click', fermerFiche);
    entete.append(badge, titres, reduire, fermer);
    carte.append(entete);

    if (etat === 'chargement') {
      carte.append(attente('Chargement de l’itinéraire…'));
      return;
    }
    if (etat === 'erreur') {
      carte.append(message('Itinéraire indisponible pour le moment. Réessayez dans un instant.'));
      return;
    }
    if (etat === 'sans-trace') {
      carte.append(message('Cet itinéraire n’a pas de tracé propre dans les données.'));
      const sous = d && Array.isArray(d.subroutes) ? d.subroutes.filter((s) => s && s.id != null) : [];
      if (sous.length) {
        const bloc = el('div', 'rando-actions');
        bloc.append(el('span', null, 'Composé de :'));
        for (const s of sous.slice(0, 12)) {
          const b = el('button', 'fiche-copier', titreDe(s));
          b.type = 'button';
          b.addEventListener('click', () => ouvrirItineraire(s));
          bloc.append(b);
        }
        carte.append(bloc);
      }
      return;
    }

    // Statistiques
    const p = profil && typeof profil === 'object' ? profil : null;
    const longueur = (d && d.route && d.route.length) || (p && p.total) || null;
    const stats = el('div', 'rando-stats');
    if (longueur) stats.append(stat(km(longueur), 'Distance'));
    if (p) {
      stats.append(stat(`+${Math.round(p.plus).toLocaleString('fr-FR')} m`, 'Dénivelé +'));
      stats.append(stat(`−${Math.round(p.moins).toLocaleString('fr-FR')} m`, 'Dénivelé −'));
      stats.append(stat(metres(p.max), 'Altitude max'));
      stats.append(stat(metres(p.min), 'Altitude min'));
      stats.append(...creerStatDuree(longueur || p.total, p.plus, p.moins));
    } else if (profil === 'calcul') {
      stats.append(stat('…', 'Dénivelé et altitudes'));
    }
    if (!p && longueur) stats.append(creerStatAllure(longueur));
    carte.append(stats);
    if (trace.sac != null) {
      carte.append(el('div', 'rando-diff', `Difficulté maximale (échelle SAC) : ${NOMS_SAC[trace.sac]}`));
    }

    // Profil d'altitude
    if (p) carte.append(creerProfil(p, surSurvol));
    else if (profil === 'calcul') carte.append(attente('Calcul du profil d’altitude…'));
    else if (profil === 'non-lineaire')
      carte.append(message('Itinéraire non linéaire (boucles ou variantes) : profil non calculé.'));
    else if (profil === 'erreur')
      carte.append(message('Profil d’altitude indisponible (données de relief injoignables).'));

    // Actions et liens
    const actions = el('div', 'rando-actions');
    const gpx = el('button', 'fiche-copier', 'Télécharger le GPX');
    gpx.type = 'button';
    gpx.disabled = !p;
    gpx.title = p ? '' : 'Disponible quand le profil est calculé';
    if (p) gpx.addEventListener('click', () => telechargerGpx(nom, p.points, p.altsBrutes));
    actions.append(gpx);

    const liens = el('span', 'fiche-liens');
    const wiki = lienWikipedia(tags.wikipedia);
    if (wiki) liens.append(lienExterne('Wikipédia', wiki));
    const site = tags.website || tags.url;
    if (site && /^https?:\/\//i.test(site)) liens.append(lienExterne('Site web', site));
    liens.append(lienExterne('OpenStreetMap', `https://www.openstreetmap.org/relation/${r.id}`));
    actions.append(liens);
    carte.append(actions);
  }

  function fermerFiche() {
    if (fiche && fiche.origine === 'creation') {
      fermerCreation();
      return;
    }
    selection++;
    fiche = null;
    effacerTrace();
    surSurvol(null);
    rendreFiche();
    actualiserMarqueursDecouverte();
  }

  // ---------- Ouverture d'un itinéraire ----------
  async function ouvrirItineraire(r) {
    const jeton = ++selection;
    masquerMarqueursDecouverte();
    ficheItineraireReduite = false;
    fiche = { r, d: null, trace: null, profil: null, etat: 'chargement' };
    effacerTrace();
    surSurvol(null);
    rendreFiche();

    try {
      const d = await detailsItineraire(r.id);
      if (jeton !== selection) return;
      const trace = extraireTrace(d);
      fiche.d = d;
      fiche.trace = trace;

      if (!trace.lignes.length) {
        fiche.etat = 'sans-trace';
        rendreFiche();
        return;
      }

      fiche.etat = 'pret';
      dessinerTrace(trace);
      cadrer(trace);

      const lineaire = d.linear !== 'no' && trace.chaine.length > 1;
      fiche.profil = lineaire ? 'calcul' : 'non-lineaire';
      rendreFiche();
      if (lineaire) await calculerProfil(jeton);
    } catch (e) {
      if (jeton !== selection) return;
      fiche.etat = 'erreur';
      rendreFiche();
      console.warn('Itinéraire :', e);
    }
  }

  champFichier.addEventListener('change', async () => {
    const fichier = champFichier.files[0];
    messageImport.textContent = '';
    if (!fichier) return;
    champFichier.value = '';

    if (fichier.size > TAILLE_MAX_GPX) {
      messageImport.textContent = 'Le fichier est trop volumineux (maximum 10 Mo).';
      return;
    }

    const jeton = ++selection;
    messageImport.textContent = 'Lecture du fichier GPX…';
    try {
      const resultat = lireGpx(await fichier.text(), fichier.name);
      if (jeton !== selection) return;
      masquerMarqueursDecouverte();
      fiche = { type: 'gpx', ...resultat };
      fiche.profil = 'calcul';
      effacerTrace();
      surSurvol(null);
      dessinerTrace(fiche.trace);
      cadrer(fiche.trace);
      rendreFiche();
      messageImport.textContent = `Parcours importé : ${fiche.nom}`;
      await calculerProfil(jeton);
    } catch (e) {
      if (jeton !== selection) return;
      messageImport.textContent = e instanceof Error ? e.message : 'Impossible de lire ce fichier GPX.';
      console.warn('Import GPX :', e);
    }
  });

  async function calculerProfil(jeton) {
    const f = fiche;
    try {
      const { points, total } = f.type === 'gpx'
        ? echantillonnerLignes(f.trace.lignes)
        : echantillonner(f.trace.chaine);
      if (points.length < 2) throw new Error('Tracé trop court');
      const brutes = await altitudesDuTrace(points, total);
      if (jeton !== selection) return;
      const lisses = lisser(brutes, 2);
      const { plus, moins } = denivele(lisses, 3);
      f.profil = {
        points,
        altsBrutes: brutes,
        alts: lisses,
        total,
        plus,
        moins,
        min: Math.min(...lisses),
        max: Math.max(...lisses),
      };
    } catch (e) {
      if (jeton !== selection) return;
      f.profil = 'erreur';
      console.warn('Profil d’altitude :', e);
    }
    rendreFiche();
  }

  // ---------- Liste des itinéraires ----------
  function creerItem(r) {
    const n = niveau(r.group);
    const item = el('div', 'rando-item');
    const badge = el('span', 'rando-badge', n.court);
    badge.style.background = n.couleur;
    const textes = el('div', 'rando-item-textes');
    textes.append(el('div', 'rando-item-nom', titreDe(r)));
    const sous = r.itinerary && r.itinerary.length ? r.itinerary.join(' → ') : r.local_name || '';
    if (sous) textes.append(el('div', 'rando-item-sous', sous));
    item.append(badge, textes);
    item.addEventListener('click', () => ouvrirItineraire(r));
    return item;
  }

  function retirerElementsDecouverte() {
    clearTimeout(minuteurFermetureGrappe);
    minuteurFermetureGrappe = null;
    if (popupGrappe) popupGrappe.remove();
    popupGrappe = null;
    clearTimeout(minuteurFermetureResume);
    minuteurFermetureResume = null;
    if (popupResume) popupResume.remove();
    popupResume = null;
    marqueursDecouverte.forEach((marqueur) => marqueur.remove());
    marqueursDecouverte = [];
  }

  function masquerMarqueursDecouverte() {
    retirerElementsDecouverte();
  }

  function retirerMarqueursDecouverte() {
    if (ctrlMarqueurs) ctrlMarqueurs.abort();
    ctrlMarqueurs = null;
    retirerElementsDecouverte();
    routesChargees = [];
  }

  function programmerFermetureResume(delai = 180) {
    clearTimeout(minuteurFermetureResume);
    minuteurFermetureResume = window.setTimeout(() => {
      if (popupResume) popupResume.remove();
      popupResume = null;
      minuteurFermetureResume = null;
      if (popupGrappe) programmerFermetureGrappe();
    }, delai);
  }

  function afficherResumeRepere(entree) {
    clearTimeout(minuteurFermetureResume);
    minuteurFermetureResume = null;
    if (popupResume) popupResume.remove();

    const contenu = el('div', 'rando-resume-repere');
    contenu.append(el('strong', 'rando-resume-titre', titreDe(entree.route)));
    const stats = el('div', 'rando-resume-stats');
    const longueur = Number(entree.details?.route?.length);
    const echantillon = echantillonner(entree.trace.chaine);
    const total = longueur > 0 ? longueur : echantillon.total;
    const ajouterStat = (valeur, libelle) => {
      const ligne = el('div', 'rando-resume-ligne');
      ligne.append(el('span', null, libelle), el('strong', null, valeur));
      stats.append(ligne);
    };
    ajouterStat(km(total), 'Distance');
    if (entree.resumeAltitude) {
      ajouterStat(`+${metres(entree.resumeAltitude.plus)}`, 'Dénivelé +');
      ajouterStat(`−${metres(entree.resumeAltitude.moins)}`, 'Dénivelé −');
      ajouterStat(metres(entree.resumeAltitude.max), 'Altitude max');
      ajouterStat(metres(entree.resumeAltitude.min), 'Altitude min');
    } else if (entree.erreurResumeAltitude) {
      ajouterStat('Indisponible', 'Dénivelé et altitudes');
    } else {
      ajouterStat('Calcul…', 'Dénivelé et altitudes');
    }
    contenu.append(stats);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: true,
      maxWidth: '260px',
      offset: [0, 0],
      className: 'rando-resume-popup',
    })
      .setLngLat(entree.coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupResume = popup;
    if (popupGrappe) {
      const boundsCarte = map.getContainer().getBoundingClientRect();
      const boundsGrappe = popupGrappe.getElement().getBoundingClientRect();
      const boundsResume = popup.getElement().getBoundingClientRect();
      const point = map.project(entree.coordonnees);
      const pointX = boundsCarte.left + point.x;
      const pointY = boundsCarte.top + point.y;
      const espaceDroite = boundsCarte.right - boundsGrappe.right;
      const espaceGauche = boundsGrappe.left - boundsCarte.left;
      const aDroite = espaceDroite >= boundsResume.width + 12 || espaceDroite >= espaceGauche;
      const centreX = aDroite
        ? boundsGrappe.right + 12 + boundsResume.width / 2
        : boundsGrappe.left - 12 - boundsResume.width / 2;
      const centreY = (boundsGrappe.top + boundsGrappe.bottom) / 2;
      popup.setOffset([centreX - pointX, centreY - pointY]);
    }
    popup.on('close', () => {
      if (popupResume === popup) popupResume = null;
    });

    if (entree.resumeAltitude || entree.erreurResumeAltitude || entree.calculResumeAltitude) return;
    entree.calculResumeAltitude = (async () => {
      const pas = Math.max(1, Math.ceil(echantillon.points.length / 100));
      const pointsAltitude = echantillon.points.filter((_, index) => index % pas === 0);
      const dernierPoint = echantillon.points[echantillon.points.length - 1];
      if (pointsAltitude[pointsAltitude.length - 1] !== dernierPoint) {
        pointsAltitude.push(dernierPoint);
      }
      if (pointsAltitude.length < 2) throw new Error('Tracé trop court');
      const brutes = await altitudesDuTrace(pointsAltitude, total);
      const lisses = lisser(brutes, 2);
      const { plus, moins } = denivele(lisses, 3);
      return { plus, moins, min: Math.min(...lisses), max: Math.max(...lisses) };
    })();
    entree.calculResumeAltitude
      .then((resume) => {
        entree.resumeAltitude = resume;
        if (popupResume === popup) afficherResumeRepere(entree);
      })
      .catch((erreur) => {
        console.warn(`Résumé d’altitude indisponible pour l’itinéraire ${entree.route.id} :`, erreur);
        entree.erreurResumeAltitude = true;
        if (popupResume === popup) afficherResumeRepere(entree);
      })
      .finally(() => {
        entree.calculResumeAltitude = null;
      });
  }

  function creerRepereDecouverte(entree) {
    const { route, coordonnees } = entree;
    const element = el('button', 'rando-repere');
    element.type = 'button';
    element.setAttribute('aria-label', `Afficher le résumé de ${titreDe(route)}; sélectionner pour ouvrir le parcours`);
    element.title = 'Survoler ou maintenir appuyé pour afficher le résumé';
    const nom = el('span', 'rando-repere-nom', titreDe(route));
    element.innerHTML =
      '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="rando-repere-trace" d="m15 31 5-11 5 11 5-11 4 9"/></svg>';
    element.appendChild(nom);
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherResumeRepere(entree);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureResume();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherResumeRepere(entree);
    });
    element.addEventListener('blur', () => programmerFermetureResume());
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    let appuiLong = false;
    let minuteurAppuiLong = null;
    let ignorerClicAppuiLong = false;
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      appuiLong = false;
      minuteurAppuiLong = window.setTimeout(() => {
        appuiLong = true;
        afficherResumeRepere(entree);
      }, 550);
    });
    const terminerAppuiLong = () => {
      clearTimeout(minuteurAppuiLong);
      minuteurAppuiLong = null;
      if (!appuiLong) return;
      ignorerClicAppuiLong = true;
      window.setTimeout(() => { ignorerClicAppuiLong = false; }, 500);
      programmerFermetureResume(3500);
    };
    element.addEventListener('pointerup', terminerAppuiLong);
    element.addEventListener('pointercancel', terminerAppuiLong);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (ignorerClicAppuiLong) {
        event.preventDefault();
        ignorerClicAppuiLong = false;
        return;
      }
      if (popupResume) popupResume.remove();
      ouvrirItineraire(route);
    });
    return new maplibregl.Marker({ element, anchor: 'bottom' }).setLngLat(coordonnees).addTo(map);
  }

  function programmerFermetureGrappe() {
    if (popupResume) return;
    clearTimeout(minuteurFermetureGrappe);
    minuteurFermetureGrappe = window.setTimeout(() => {
      if (popupGrappe) popupGrappe.remove();
      popupGrappe = null;
      minuteurFermetureGrappe = null;
    }, 350);
  }

  function afficherGroupeDecouverte(routes, coordonnees) {
    clearTimeout(minuteurFermetureGrappe);
    minuteurFermetureGrappe = null;
    if (popupGrappe) popupGrappe.remove();

    const contenu = el('div', 'rando-groupe-liste');
    contenu.appendChild(el('strong', 'rando-groupe-titre', `${routes.length} randonnées à proximité`));
    routes.forEach((entree) => {
      const { route } = entree;
      const choix = el('button', 'rando-groupe-choix', titreDe(route));
      choix.type = 'button';
      choix.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch') afficherResumeRepere(entree);
      });
      choix.addEventListener('pointerleave', (event) => {
        if (event.pointerType !== 'touch') programmerFermetureResume();
      });
      choix.addEventListener('focus', () => {
        if (choix.matches(':focus-visible')) afficherResumeRepere(entree);
      });
      choix.addEventListener('blur', () => programmerFermetureResume());
      choix.addEventListener('click', () => {
        if (popupResume) popupResume.remove();
        if (popupGrappe) popupGrappe.remove();
        popupGrappe = null;
        ouvrirItineraire(route);
      });
      contenu.appendChild(choix);
    });
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      closeOnMove: false,
      maxWidth: '300px',
      offset: 8,
    })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupGrappe = popup;
    const elementPopup = popup.getElement();
    elementPopup.addEventListener('pointerenter', () => {
      clearTimeout(minuteurFermetureGrappe);
      minuteurFermetureGrappe = null;
    });
    elementPopup.addEventListener('pointerleave', programmerFermetureGrappe);
    popup.on('close', () => {
      if (popupGrappe === popup) {
        popupGrappe = null;
        if (popupResume) popupResume.remove();
      }
    });
  }

  function creerGroupeDecouverte(routes, coordonnees) {
    const element = el('button', 'rando-groupe');
    element.type = 'button';
    element.setAttribute('aria-label', `${routes.length} randonnées regroupées. Survolez ou touchez pour afficher la liste.`);
    element.title = `${routes.length} randonnées — afficher la liste`;
    element.innerHTML =
      `<svg viewBox="0 0 56 56" aria-hidden="true"><path class="rando-groupe-halo" d="M28 2 52 16v24L28 54 4 40V16z"/><path class="rando-groupe-forme" d="M28 7 47 18v20L28 49 9 38V18z"/></svg><span>${routes.length}</span>`;
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherGroupeDecouverte(routes, coordonnees);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureGrappe();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherGroupeDecouverte(routes, coordonnees);
    });
    element.addEventListener('blur', () => programmerFermetureGrappe());
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      afficherGroupeDecouverte(routes, coordonnees);
    });
    return new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(coordonnees)
      .addTo(map);
  }

  function actualiserMarqueursDecouverte() {
    retirerElementsDecouverte();
    if (!actif || fiche || !routesChargees.length) return;

    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    const visibles = routesChargees
      .map((entree) => ({ ...entree, pixel: map.project(entree.coordonnees) }))
      .filter(({ pixel }) =>
        pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur);
    const parents = visibles.map((_, index) => index);
    const racine = (index) => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };

    for (let i = 0; i < visibles.length; i++) {
      for (let j = i + 1; j < visibles.length; j++) {
        const dx = visibles[i].pixel.x - visibles[j].pixel.x;
        const dy = visibles[i].pixel.y - visibles[j].pixel.y;
        if (dx * dx + dy * dy <= DISTANCE_GRAPPE_PX * DISTANCE_GRAPPE_PX) {
          parents[racine(j)] = racine(i);
        }
      }
    }

    const groupes = new Map();
    visibles.forEach((entree, index) => {
      const id = racine(index);
      if (!groupes.has(id)) groupes.set(id, []);
      groupes.get(id).push(entree);
    });

    groupes.forEach((groupe) => {
      const coordonnees = groupe.reduce(
        (centre, entree) => [centre[0] + entree.coordonnees[0] / groupe.length, centre[1] + entree.coordonnees[1] / groupe.length],
        [0, 0]
      );
      if (groupe.length === 1) {
        groupe[0].coordonnees = coordonnees;
        marqueursDecouverte.push(creerRepereDecouverte(groupe[0]));
      } else {
        marqueursDecouverte.push(creerGroupeDecouverte(groupe, coordonnees));
      }
    });
  }

  async function afficherResultatsZone(routes, progression) {
    retirerMarqueursDecouverte();
    compteurZone = routes.length;
    if (!routes.length) return { affiches: 0, erreurs: 0, sansTrace: 0 };

    const controleur = new AbortController();
    ctrlMarqueurs = controleur;
    const ancrages = new Array(routes.length);
    const limites = map.getBounds();
    const centre = map.getCenter().toArray();
    const pointDansZone = (a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      let debut = 0;
      let fin = 1;
      const contraintes = [
        [-dx, a[0] - limites.getWest()],
        [dx, limites.getEast() - a[0]],
        [-dy, a[1] - limites.getSouth()],
        [dy, limites.getNorth() - a[1]],
      ];
      for (const [p, q] of contraintes) {
        if (p === 0) {
          if (q < 0) return null;
        } else {
          const ratio = q / p;
          if (p < 0) debut = Math.max(debut, ratio);
          else fin = Math.min(fin, ratio);
          if (debut > fin) return null;
        }
      }
      const pointDebut = [a[0] + debut * dx, a[1] + debut * dy];
      const pointFin = [a[0] + fin * dx, a[1] + fin * dy];
      return [
        [pointDebut[0] + (pointFin[0] - pointDebut[0]) / 2, pointDebut[1] + (pointFin[1] - pointDebut[1]) / 2],
        pointDebut,
        pointFin,
      ];
    };
    let sansTrace = 0;
    let erreurs = 0;
    let prochain = 0;
    let termines = 0;
    const charger = async () => {
      while (prochain < routes.length && !controleur.signal.aborted) {
        const index = prochain++;
        const route = routes[index];
        try {
          const details = await detailsItineraire(route.id, controleur.signal);
          if (controleur.signal.aborted) return;
          const trace = extraireTrace(details);
          let coordonnees = null;
          let meilleureDistance = Infinity;
          for (const ligne of trace.lignes) {
            if (ligne.length && limites.contains(ligne[0])) {
              coordonnees = ligne[0];
              meilleureDistance = 0;
              break;
            }
            for (let i = 1; i < ligne.length; i++) {
              const candidats = pointDansZone(ligne[i - 1], ligne[i]);
              if (!candidats) continue;
              for (const point of candidats) {
                const ecart = distance(point, centre);
                if (ecart < meilleureDistance) {
                  coordonnees = point;
                  meilleureDistance = ecart;
                }
              }
            }
          }
          if (!coordonnees) {
            sansTrace++;
            console.warn(`Aucun départ visible pour positionner l’itinéraire ${route.id}.`);
          } else {
            ancrages[index] = { route, details, trace, coordonnees };
          }
        } catch (e) {
          if (e.name === 'AbortError') return;
          erreurs++;
          console.warn(`Repère cartographique indisponible pour l’itinéraire ${route.id} :`, e);
        } finally {
          termines++;
          if (!controleur.signal.aborted) progression(termines, routes.length);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PARALLELISME_REPERES, routes.length) }, charger)
    );
    if (controleur.signal.aborted || ctrlMarqueurs !== controleur) return null;

    routesChargees = ancrages.filter(Boolean);
    actualiserMarqueursDecouverte();
    return { affiches: routesChargees.length, erreurs, sansTrace };
  }

  function rendreInterface() {
    const enRecherche = recherche.length >= 2;
    liste.replaceChildren();
    liste.hidden = !enRecherche;
    if (enRecherche) {
      if (etatRech === 'attente') liste.appendChild(attente('Recherche d’itinéraires…'));
      else if (etatRech === 'erreur') liste.appendChild(message('Recherche indisponible pour le moment. Réessayez.'));
      else if (!resultatsRecherche.length) liste.appendChild(message(`Aucun itinéraire pour « ${recherche} »`));
      else resultatsRecherche.forEach((route) => liste.appendChild(creerItem(route)));
    }

    let texte = '';
    if (etatZone === 'loin') texte = 'Veuillez zoomer davantage pour rechercher dans cette zone.';
    else if (etatZone === 'chargement') texte = 'Recherche des randonnées dans la zone…';
    else if (etatZone === 'erreur') texte = 'Recherche dans la zone indisponible. Réessayez.';
    else if (zonePerimee && etatZone === 'repos') {
      texte = 'La carte a changé pendant la recherche. Relancez-la dans la nouvelle zone.';
    }
    else if (etatZone === 'ok') {
      const total = compteurZone >= 40
        ? 'Au moins 40 parcours trouvés'
        : compteurZone
          ? `${compteurZone} parcours trouvé${compteurZone > 1 ? 's' : ''}`
          : 'Aucun parcours trouvé';
      texte = zonePerimee
        ? `${total} dans la zone précédente. Relancez la recherche après avoir déplacé la carte.`
        : `${total} dans cette zone.`;
    }
    aide.textContent = texte;
    if (messageDetailsZone && texte) aide.textContent += ` ${messageDetailsZone}`;
    aide.hidden = !texte;
    boutonZone.disabled = etatZone === 'chargement';
    libelleZone.textContent = etatZone === 'chargement' ? 'Recherche…' : 'Rechercher ici';
  }

  // ---------- Itinéraires de la zone visible ----------
  async function majZone() {
    if (!actif) return;
    if (fiche) fermerFiche();
    if (ctrlZone) ctrlZone.abort();
    retirerMarqueursDecouverte();
    messageDetailsZone = '';
    zonePerimee = false;
    if (map.getZoom() < ZOOM_MIN_ZONE) {
      etatZone = 'loin';
      compteurZone = 0;
      rendreInterface();
      return;
    }

    const controleur = new AbortController();
    ctrlZone = controleur;
    const limites = map.getBounds();
    const vue = { centre: map.getCenter(), zoom: map.getZoom() };
    etatZone = 'chargement';
    rendreInterface();
    try {
      const routes = await dansLaZone(limites, controleur.signal);
      if (controleur.signal.aborted || ctrlZone !== controleur) return;
      const centreActuel = map.getCenter();
      if (
        map.getZoom() !== vue.zoom ||
        Math.abs(centreActuel.lng - vue.centre.lng) > 0.0001 ||
        Math.abs(centreActuel.lat - vue.centre.lat) > 0.0001
      ) {
        etatZone = 'repos';
        zonePerimee = true;
        rendreInterface();
        return;
      }
      etatZone = 'ok';
      compteurZone = routes.length;
      rendreInterface();
      aide.textContent = routes.length
        ? `Positionnement des départs… 0/${routes.length}`
        : 'Aucun parcours trouvé dans cette zone.';
      const resultatMarqueurs = await afficherResultatsZone(routes, (termine, total) => {
        aide.textContent = `Positionnement des départs… ${termine}/${total}`;
      });
      if (resultatMarqueurs === null || controleur.signal.aborted || ctrlZone !== controleur) return;
      if (resultatMarqueurs.erreurs || resultatMarqueurs.sansTrace) {
        messageDetailsZone = `${resultatMarqueurs.affiches} départ${resultatMarqueurs.affiches > 1 ? 's' : ''} affiché${resultatMarqueurs.affiches > 1 ? 's' : ''} ; ${resultatMarqueurs.erreurs + resultatMarqueurs.sansTrace} itinéraire${resultatMarqueurs.erreurs + resultatMarqueurs.sansTrace > 1 ? 's' : ''} sans repère.`;
      }
      rendreInterface();
    } catch (e) {
      if (e.name === 'AbortError' || controleur.signal.aborted || ctrlZone !== controleur) return;
      etatZone = 'erreur';
      compteurZone = 0;
      console.warn('Itinéraires de la zone :', e);
      rendreInterface();
    }
  }

  function signalerDeplacement() {
    if (!actif) return;
    actualiserMarqueursDecouverte();
    if (etatZone === 'ok') {
      zonePerimee = true;
      rendreInterface();
    }
  }

  // ---------- Recherche ----------
  async function lancerRecherche(q) {
    if (ctrlRech) ctrlRech.abort();
    ctrlRech = new AbortController();
    etatRech = 'attente';
    rendreInterface();
    try {
      resultatsRecherche = await chercher(q, ctrlRech.signal);
      if (q !== recherche) return;
      etatRech = 'ok';
    } catch (e) {
      if (e.name === 'AbortError' || q !== recherche) return;
      etatRech = 'erreur';
      console.warn('Recherche d’itinéraires :', e);
    }
    rendreInterface();
  }

  champ.addEventListener('input', () => {
    recherche = champ.value.trim();
    clearTimeout(minuteurRech);
    if (recherche.length < 2) {
      if (ctrlRech) ctrlRech.abort();
      etatRech = 'vide';
      resultatsRecherche = [];
      rendreInterface();
      return;
    }
    etatRech = 'attente';
    rendreInterface();
    minuteurRech = setTimeout(() => lancerRecherche(recherche), 350);
  });

  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && recherche.length >= 2) {
      clearTimeout(minuteurRech);
      lancerRecherche(recherche);
    }
  });

  boutonZone.addEventListener('click', majZone);
  boutonCreation.addEventListener('click', basculerCreation);
  boutonMiniAnnuler.addEventListener('click', annulerDerniereActionCreation);
  boutonMiniRecommencer.addEventListener('click', recommencerCreation);
  boutonMiniTerminer.addEventListener('click', basculerCreation);
  boutonFermerCreation.addEventListener('click', fermerCreation);
  let clicApresDeplacement = false;
  boutonReduire.addEventListener('click', () => {
    if (clicApresDeplacement) {
      clicApresDeplacement = false;
      return;
    }
    reduireCommandesCreation(!commandesFlottantes.classList.contains('reduit'));
  });
  let debutDeplacement = null;
  const demarrerDeplacement = (event) => {
    if (event.button !== 0) return;
    const rect = commandesFlottantes.getBoundingClientRect();
    debutDeplacement = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, deplace: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  boutonDeplacer.addEventListener('pointerdown', demarrerDeplacement);
  boutonReduire.addEventListener('pointerdown', (event) => {
    if (commandesFlottantes.classList.contains('reduit')) demarrerDeplacement(event);
  });
  commandesFlottantes.addEventListener('pointermove', (event) => {
    if (!debutDeplacement) return;
    const deltaX = event.clientX - debutDeplacement.x;
    const deltaY = event.clientY - debutDeplacement.y;
    if (!debutDeplacement.deplace && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
      debutDeplacement.deplace = true;
      commandesFlottantes.style.right = 'auto';
      commandesFlottantes.style.bottom = 'auto';
    }
    if (!debutDeplacement.deplace) return;
    const largeur = commandesFlottantes.offsetWidth;
    const hauteur = commandesFlottantes.offsetHeight;
    const gauche = Math.max(8, Math.min(innerWidth - largeur - 8, debutDeplacement.left + deltaX));
    const haut = Math.max(8, Math.min(innerHeight - hauteur - 8, debutDeplacement.top + deltaY));
    commandesFlottantes.style.left = `${gauche}px`;
    commandesFlottantes.style.top = `${haut}px`;
  });
  const terminerDeplacement = () => {
    if (!debutDeplacement) return;
    clicApresDeplacement = debutDeplacement.deplace;
    debutDeplacement = null;
  };
  const annulerDeplacement = () => {
    debutDeplacement = null;
    clicApresDeplacement = false;
  };
  commandesFlottantes.addEventListener('pointerup', terminerDeplacement);
  commandesFlottantes.addEventListener('pointercancel', annulerDeplacement);
  map.on('click', ajouterEtapeCreation);

  // ---------- Options : refuges (partagé avec Éléments de la carte) et aperçu ----------
  caseRefuges.addEventListener('change', () => {
    afficherRefuges(map, caseRefuges.checked);
    ecrire('refuges', caseRefuges.checked);
    window.dispatchEvent(new CustomEvent('calque', { detail: { cle: 'refuges', actif: caseRefuges.checked } }));
  });
  window.addEventListener('calque', (e) => {
    if (e.detail.cle === 'refuges') caseRefuges.checked = e.detail.actif;
  });

  caseApercu.addEventListener('change', () => {
    ecrire('rando-apercu', caseApercu.checked);
    appliquerApercu();
  });

  rendreInterface();

  // ---------- Cycle de vie de l'activité ----------
  function activer() {
    actif = true;
    assurerCouches();
    if (!ecouteurPose) {
      map.on('moveend', signalerDeplacement);
      ecouteurPose = true;
    }
    appliquerApercu();
    rendreInterface();
  }

  function desactiver() {
    actif = false;
    creationActive = false;
    fermerPopupEtapeCreation();
    bloquerFiches(false);
    map.getCanvas().style.cursor = '';
    if (controleurCreation) controleurCreation.abort();
    numeroCalculCreation++;
    etapesCreation = [];
    marqueursEtapes.forEach((marqueur) => marqueur.remove());
    marqueursEtapes = [];
    clearTimeout(minuteurRech);
    if (ctrlZone) ctrlZone.abort();
    retirerMarqueursDecouverte();
    if (ctrlRech) ctrlRech.abort();
    etatZone = 'repos';
    zonePerimee = false;
    compteurZone = 0;
    rendreInterface();
    fermerFiche();
    rendreCommandesCreation();
    appliquerApercu();
  }

  return { id: 'rando', label: 'Randonnée', icone: 'rando', panneau, activer, desactiver };
}