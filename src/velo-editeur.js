// Parcours vélo sur la carte : points déplaçables, routage selon la pratique, annuler / rétablir.
import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { bloquerFiches } from './fiche.js';
import { creerPanneauCarte } from './panneau-carte.js';
import { estHorsLigne } from './hors-ligne.js';
import { distance } from './rando-api.js';
import { telechargerGpx } from './rando-profil.js';
import { formaterDuree } from './rando-profil.js';
import { paletteInterface } from './vent-cadran.js';
import { PRATIQUES, calculerTroncon, tronconLibre } from './velo-routage.js';
import { DIFFICULTES, PALIERS_PENTE, VOIES, analyserTrace, palierDifficulte, palierPente, repartir } from './velo-analyse.js';
import { creerProfilVelo } from './velo-profil.js';
import { compacter, ecrireBrouillon, effacerBrouillon, enregistrerParcours, lireBrouillon } from './velo-parcours.js';

const SOURCE_TRACE = 'velo-trace';
const COUCHE_CONTOUR = 'velo-trace-contour';
const COUCHE_TRACE = 'velo-trace-ligne';
const COUCHE_LIBRE = 'velo-trace-libre';
const SOURCE_CURSEUR = 'velo-curseur';
const COUCHE_CURSEUR = 'velo-curseur-point';
const TOLERANCE_CARTE = 24; // px pour lire le profil depuis la carte
const POINTS_TRACE_REPRISE = 12; // une trace reprise garde ses détails entre quelques points déplaçables
const ATTENTE_ANALYSE = 250; // ms : on ne relit pas le relief à chaque modification rapprochée
const MODES_COULEUR = [['pratique', 'Pratique'], ['pente', 'Pente'], ['surface', 'Surface'], ['difficulte', 'Difficulté']];
const COULEUR_CERNE = '#0b111b';
const TOLERANCE_LIGNE = 16; // px pour insérer un point sur le tracé
const MAX_HISTORIQUE = 60;
const COMMANDES = [
  ['annuler', 'Annuler', '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'],
  ['retablir', 'Rétablir', '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'],
  ['libre', 'Tracé libre, en ligne droite', '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>'],
  ['boucle', 'Revenir au départ', '<path d="M17 2.5 21 6.500 17 10.500"/><path d="M3 12V9.500a3 3 0 0 1 3-3h15"/><path d="M7 21.500 3 17.500 7 13.500"/><path d="M21 12v2.500a3 3 0 0 1-3 3H3"/>'],
  ['allerRetour', 'Aller-retour par le même chemin', '<path d="M4 8h14l-4-4"/><path d="M20 16H6l4 4"/>'],
  ['effacer', 'Tout effacer', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'],
];

const km = (m) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: m < 100000 ? 1 : 0 })} km`;
const copier = (etapes) => etapes.map((etape) => ({ ...etape }));
const metres = (m) => `${Math.round(m).toLocaleString('fr-FR')} m`;
const pourcent = (partie, total) => (total ? Math.round((partie / total) * 100) : 0);

function barre(parts, total) {
  return parts
    .filter(({ longueur }) => longueur > 0)
    .map(({ couleur, longueur }) => `<i style="width: ${((longueur / total) * 100).toFixed(2)}%; background: ${couleur}"></i>`)
    .join('');
}

function legende(parts, total) {
  return parts
    .filter(({ longueur }) => longueur > 0)
    .map(({ couleur, libelle, longueur }) => `<span><i style="background: ${couleur}"></i>${libelle} ${pourcent(longueur, total)} %</span>`)
    .join('');
}

export function creerEditeurVelo(map, { pratique: pratiqueInitiale, onPratique = () => {}, onFermer = () => {}, onEnregistre = () => {} }) {
  let pratique = pratiqueInitiale;
  let etapes = []; // { lng, lat, mode: 'route' | 'libre' | 'fixe', troncon } ; troncon : ce qui y mène
  let edition = false;
  let modeLibre = lire('velo-libre', false) === true;
  let passe = [];
  let futur = [];
  let marqueurs = [];
  let popup = null;
  let controleur = null;
  let nom = 'Nouveau parcours';
  let idParcours = null;
  let analyse = null;
  let repartition = null;
  let jetonAnalyse = 0;
  let minuteurAnalyse = null;
  let modeCouleur = MODES_COULEUR.some(([id]) => id === lire('velo-couleur', '')) ? lire('velo-couleur', '') : 'pratique';

  const panneau = creerPanneauCarte({
    cle: 'velo-panneau-reduit',
    libelle: 'parcours vélo',
    classe: 'bf-outil bf-velo',
    onFermer: () => onFermer(),
  });
  panneau.corps.innerHTML = `
    <div class="velo-pratiques velo-pratiques-panneau" role="group" aria-label="Pratique">
      ${Object.values(PRATIQUES).map(({ id, libelle }) => `<button type="button" data-pratique="${id}" aria-pressed="false">${libelle}</button>`).join('')}
    </div>
    <div class="velo-commandes" role="group" aria-label="Modifier le parcours">
      ${COMMANDES.map(([id, libelle, dessin]) => `<button type="button" data-commande="${id}" aria-label="${libelle}" title="${libelle}"><svg viewBox="0 0 24 24" aria-hidden="true">${dessin}</svg></button>`).join('')}
    </div>
    <p class="velo-etat" role="status" aria-live="polite"></p>
    <div class="velo-analyse" hidden>
      <div class="velo-stats">
        <div class="velo-stat velo-stat-principale"><span>Distance</span><strong data-v="distance">—</strong></div>
        <div class="velo-stat velo-stat-principale"><span>Durée estimée</span><strong data-v="duree">—</strong></div>
        <div class="velo-stat"><span>D+</span><strong data-v="plus">—</strong></div>
        <div class="velo-stat"><span>D−</span><strong data-v="moins">—</strong></div>
        <div class="velo-stat"><span>Alt. max</span><strong data-v="max">—</strong></div>
        <div class="velo-stat"><span>Alt. min</span><strong data-v="min">—</strong></div>
        <div class="velo-stat"><span>Pente max</span><strong data-v="pente">—</strong></div>
      </div>
      <div class="velo-profil">
        <p class="velo-lecture">Touchez le profil pour lire un point du tracé.</p>
        <canvas class="velo-graphique" tabindex="0" role="img" aria-label="Profil du parcours coloré selon la pente. Glisser ou utiliser les flèches du clavier pour lire un point."></canvas>
        <div class="velo-legende-pente" aria-hidden="true"></div>
      </div>
      <div class="velo-repartition" data-bloc="surfaces" hidden><h4>Surfaces</h4><div class="velo-barre"></div><div class="velo-legende"></div></div>
      <div class="velo-repartition" data-bloc="difficulte" hidden><h4>Difficulté VTT <small>(échelle OpenStreetMap)</small></h4><div class="velo-barre"></div><div class="velo-legende"></div></div>
      <label class="velo-couleur"><span>Colorer le tracé selon</span><select>
        ${MODES_COULEUR.map(([id, libelle]) => `<option value="${id}">${libelle}</option>`).join('')}
      </select></label>
    </div>
    <label class="velo-nom"><span>Nom</span><input type="text" maxlength="60" placeholder="Nom du parcours"></label>
    <div class="velo-pied">
      <button type="button" class="para-bouton velo-terminer">Terminer</button>
      <button type="button" class="para-bouton para-bouton-principal velo-enregistrer">Enregistrer</button>
      <button type="button" class="para-bouton velo-gpx" disabled>GPX</button>
    </div>
    <p class="velo-source" hidden></p>
  `;
  panneau.titre.textContent = nom;
  panneau.definirResume({
    rose: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.500"/><circle cx="18" cy="17" r="3.500"/><path d="m6 17 4-8h6l2 8M10 9 9 6H7M16 9l-1-3h3"/></svg>',
    nom,
    detail: '',
    valeur: '',
    unite: '',
  });
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const commande = (id) => $(`[data-commande="${id}"]`);
  const message = $('.velo-etat');
  const boutonsPratique = [...panneau.corps.querySelectorAll('[data-pratique]')];
  const blocAnalyse = $('.velo-analyse');
  const lecture = $('.velo-lecture');
  const selecteurCouleur = $('.velo-couleur select');
  const boutonTerminer = $('.velo-terminer');
  const boutonGpx = $('.velo-gpx');
  const boutonEnregistrer = $('.velo-enregistrer');
  const champNom = $('.velo-nom input');
  const source = $('.velo-source');
  const valeur = (id) => $(`[data-v="${id}"]`);
  selecteurCouleur.value = modeCouleur;

  const profil = creerProfilVelo($('.velo-graphique'), {
    onCurseur: (index) => afficherCurseur(index),
  });

  // ---------- Couches ----------
  function assurerCouches() {
    if (map.getSource(SOURCE_TRACE)) return;
    map.addSource(SOURCE_TRACE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: COUCHE_CONTOUR,
      type: 'line',
      source: SOURCE_TRACE,
      layout: lissage,
      paint: { 'line-color': COULEUR_CERNE, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 9] },
    });
    map.addLayer({
      id: COUCHE_TRACE,
      type: 'line',
      source: SOURCE_TRACE,
      filter: ['!=', ['get', 'libre'], true],
      layout: lissage,
      paint: { 'line-color': ['get', 'couleur'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 14, 5] },
    });
    map.addLayer({
      id: COUCHE_LIBRE,
      type: 'line',
      source: SOURCE_TRACE,
      filter: ['==', ['get', 'libre'], true],
      paint: { 'line-color': ['get', 'couleur'], 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
    });
    map.addSource(SOURCE_CURSEUR, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: COUCHE_CURSEUR,
      type: 'circle',
      source: SOURCE_CURSEUR,
      paint: { 'circle-radius': 7, 'circle-color': '#ffffff', 'circle-stroke-color': COULEUR_CERNE, 'circle-stroke-width': 3 },
    });
  }

  // Tracé en morceaux colorés, depuis l'échantillonnage du profil
  function morceauxColores() {
    const couleurs = paletteInterface();
    const { points, pentes, total } = analyse;
    const tronconsPlats = etapes.slice(1).flatMap(({ troncon }) => troncon?.troncons ?? []);
    const totalTroncons = tronconsPlats.reduce((somme, { longueur }) => somme + longueur, 0) || 1;
    const echelle = total / totalTroncons;
    let indiceTroncon = 0;
    let fin = (tronconsPlats[0]?.longueur ?? 0) * echelle;
    const features = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      while (indiceTroncon < tronconsPlats.length - 1 && points[i].d > fin) {
        indiceTroncon += 1;
        fin += tronconsPlats[indiceTroncon].longueur * echelle;
      }
      const portion = tronconsPlats[indiceTroncon];
      let couleur = VOIES.inconnu.couleur;
      if (modeCouleur === 'pente') couleur = couleurs[palierPente(pentes[i])];
      else if (modeCouleur === 'surface' && portion) couleur = VOIES[portion.voie].couleur;
      else if (modeCouleur === 'difficulte' && portion && portion.difficulte !== null && portion.difficulte !== undefined) couleur = DIFFICULTES[palierDifficulte(portion.difficulte)].couleur;
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[points[i].lng, points[i].lat], [points[i + 1].lng, points[i + 1].lat]] },
        properties: { couleur, libre: false },
      });
    }
    return features;
  }

  function dessinerTrace() {
    assurerCouches();
    const couleur = pratique.couleur;
    map.getSource(SOURCE_TRACE).setData({
      type: 'FeatureCollection',
      features: modeCouleur !== 'pratique' && analyse ? morceauxColores() : etapes.slice(1).filter(({ troncon }) => troncon).map(({ troncon }) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: troncon.geom },
        properties: { couleur, libre: troncon.source === 'libre' },
      })),
    });
  }

  function afficherCurseur(index) {
    const point = index === null ? null : analyse?.points[index];
    assurerCouches();
    map.getSource(SOURCE_CURSEUR).setData({
      type: 'FeatureCollection',
      features: point ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lng, point.lat] }, properties: {} }] : [],
    });
    if (!point) {
      lecture.textContent = 'Touchez le profil pour lire un point du tracé.';
      return;
    }
    const pente = analyse.pentes[index];
    lecture.innerHTML = `<strong>${km(point.d)}</strong> · ${metres(analyse.alts[index])} · <b style="color: ${paletteInterface()[palierPente(pente)]}">${pente > 0 ? '+' : ''}${Math.round(pente)} %</b>`;
  }

  // Le point du profil le plus proche de la carte, s'il est assez près du tracé
  function indiceDepuisCarte(point) {
    if (!analyse) return null;
    let meilleur = null;
    let ecart = TOLERANCE_CARTE;
    analyse.points.forEach(({ lng, lat }, index) => {
      const p = map.project([lng, lat]);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < ecart) {
        ecart = d;
        meilleur = index;
      }
    });
    return meilleur;
  }

  function fermerPopup() {
    popup?.remove();
    popup = null;
  }

  function dessinerMarqueurs() {
    marqueurs.forEach((marqueur) => marqueur.remove());
    marqueurs = etapes.map((etape, index) => {
      const dernier = index === etapes.length - 1 && index > 0;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `velo-etape${index === 0 ? ' velo-etape-depart' : dernier ? ' velo-etape-arrivee' : ''}`;
      element.style.setProperty('--velo-couleur', pratique.couleur);
      element.textContent = index === 0 ? 'D' : dernier ? 'A' : String(index);
      element.setAttribute('aria-label', index === 0 ? 'Départ' : dernier ? 'Arrivée' : `Point ${index}`);
      if (!edition && index !== 0 && !dernier) element.hidden = true;
      const marqueur = new maplibregl.Marker({ element, draggable: edition }).setLngLat([etape.lng, etape.lat]).addTo(map);
      marqueur.on('dragend', () => {
        const { lng, lat } = marqueur.getLngLat();
        deplacerEtape(index, lng, lat);
      });
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        if (edition) ouvrirPopupEtape(index);
      });
      return marqueur;
    });
  }

  function ouvrirPopupEtape(index) {
    fermerPopup();
    const etape = etapes[index];
    const contenu = document.createElement('div');
    contenu.className = 'velo-popup';
    if (index > 0) {
      const libre = document.createElement('button');
      libre.type = 'button';
      libre.textContent = etape.mode === 'libre' ? 'Suivre les chemins pour venir ici' : 'Venir ici en ligne droite';
      libre.addEventListener('click', () => {
        fermerPopup();
        memoriser();
        etapes[index] = { ...etape, mode: etape.mode === 'libre' ? 'route' : 'libre', troncon: null };
        recalculer();
      });
      contenu.append(libre);
    }
    const retirer = document.createElement('button');
    retirer.type = 'button';
    retirer.className = 'velo-popup-retirer';
    retirer.textContent = 'Supprimer ce point';
    retirer.addEventListener('click', () => {
      fermerPopup();
      memoriser();
      etapes.splice(index, 1);
      if (etapes[index]) etapes[index] = { ...etapes[index], troncon: null, mode: etapes[index].mode === 'fixe' ? 'route' : etapes[index].mode };
      if (etapes[0]) etapes[0] = { ...etapes[0], troncon: null };
      recalculer();
    });
    contenu.append(retirer);
    popup = new maplibregl.Popup({ offset: 20, closeButton: false }).setLngLat([etape.lng, etape.lat]).setDOMContent(contenu).addTo(map);
  }

  // ---------- Historique ----------
  function memoriser() {
    passe.push(copier(etapes));
    if (passe.length > MAX_HISTORIQUE) passe.shift();
    futur = [];
  }

  function restaurer(depuis, vers) {
    if (!depuis.length) return;
    vers.push(copier(etapes));
    etapes = depuis.pop();
    fermerPopup();
    recalculer();
  }

  // ---------- Modifications ----------
  function ajouterEtape(lng, lat, indice = etapes.length) {
    memoriser();
    etapes.splice(indice, 0, { lng, lat, mode: modeLibre ? 'libre' : 'route', troncon: null });
    if (etapes[indice + 1]) etapes[indice + 1] = { ...etapes[indice + 1], troncon: null, mode: etapes[indice + 1].mode === 'fixe' ? 'route' : etapes[indice + 1].mode };
    recalculer();
  }

  function deplacerEtape(index, lng, lat) {
    memoriser();
    const sansTrace = (etape) => ({ ...etape, troncon: null, mode: etape.mode === 'fixe' ? 'route' : etape.mode });
    etapes[index] = { ...sansTrace(etapes[index]), lng, lat };
    if (etapes[index + 1]) etapes[index + 1] = sansTrace(etapes[index + 1]);
    recalculer();
  }

  function boucler() {
    if (etapes.length < 2) return;
    const { lng, lat } = etapes[0];
    ajouterEtape(lng, lat);
  }

  // Le retour reprend les tronçons de l'aller : pas besoin de les recalculer
  function allerRetour() {
    if (etapes.length < 2) return;
    memoriser();
    const retour = [];
    for (let i = etapes.length - 2; i >= 0; i -= 1) {
      const { troncon, mode } = etapes[i + 1];
      retour.push({
        lng: etapes[i].lng,
        lat: etapes[i].lat,
        mode,
        troncon: troncon && { ...troncon, geom: [...troncon.geom].reverse(), troncons: [...troncon.troncons].reverse() },
      });
    }
    etapes.push(...retour);
    recalculer();
  }

  function indiceSurLigne(point) {
    let meilleur = null;
    let ecart = TOLERANCE_LIGNE;
    etapes.slice(1).forEach(({ troncon }, index) => {
      if (!troncon) return;
      const pas = Math.max(1, Math.floor(troncon.geom.length / 200));
      for (let i = 0; i < troncon.geom.length; i += pas) {
        const p = map.project(troncon.geom[i]);
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d < ecart) {
          ecart = d;
          meilleur = index + 1;
        }
      }
    });
    return meilleur;
  }

  // ---------- Calcul ----------
  const tronconValide = ({ troncon, mode }) => {
    if (!troncon) return false;
    return mode === 'fixe' || mode === 'libre' || troncon.pratique === pratique.id;
  };

  async function recalculer() {
    controleur?.abort();
    const requete = new AbortController();
    controleur = requete;
    dessinerMarqueurs();
    dessinerTrace();
    rendre();
    let secours = false;
    let echecs = 0;
    for (let i = 1; i < etapes.length; i += 1) {
      const etape = etapes[i];
      const precedente = etapes[i - 1];
      if (tronconValide(etape)) continue;
      const de = [precedente.lng, precedente.lat];
      const vers = [etape.lng, etape.lat];
      if (etape.mode === 'libre') {
        etape.troncon = tronconLibre(de, vers);
      } else {
        message.textContent = 'Calcul du tracé…';
        try {
          if (estHorsLigne()) throw new Error('hors ligne');
          const troncon = await calculerTroncon(de, vers, pratique, requete.signal);
          if (requete.signal.aborted) return;
          etape.troncon = { ...troncon, pratique: pratique.id };
          if (troncon.source === 'valhalla') secours = true;
        } catch (erreur) {
          if (requete.signal.aborted) return;
          console.warn('Tronçon vélo non calculé :', erreur);
          etape.troncon = { ...tronconLibre(de, vers), pratique: pratique.id };
          echecs += 1;
        }
      }
      dessinerTrace();
    }
    if (controleur === requete) controleur = null;
    apresCalcul({ secours, echecs });
  }

  function apresCalcul({ secours, echecs }) {
    const tronconsPlats = etapes.slice(1).flatMap(({ troncon }) => troncon?.troncons ?? []);
    repartition = repartir(tronconsPlats);
    const total = repartition.total;
    programmerAnalyse();
    rendreRepartition();
    if (echecs) {
      message.textContent = estHorsLigne()
        ? 'Hors ligne : les tronçons sont tracés en ligne droite (tiretés).'
        : `${echecs} tronçon${echecs > 1 ? 's' : ''} non calculé${echecs > 1 ? 's' : ''} : tracé en ligne droite. Rapprochez les points ou réessayez.`;
    } else if (etapes.length < 2) {
      message.textContent = etapes.length ? 'Touchez la carte pour poser le point suivant.' : 'Touchez la carte pour poser le départ.';
    } else {
      message.textContent = secours
        ? 'Tracé de secours : surfaces et difficulté indisponibles sur ce tronçon.'
        : 'Touchez la carte pour ajouter un point, ou le tracé pour y insérer un passage.';
    }
    if (edition) {
      if (etapes.length) ecrireBrouillon({ nom, pratique: pratique.id, etapes: compacter(etapes) });
      else effacerBrouillon();
    }
    boutonEnregistrer.disabled = etapes.length < 2;
    panneau.definirResume({ detail: total ? km(total) : 'Touchez la carte', valeur: total ? (total / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '', unite: total ? 'km' : '' });
    rendre();
  }

  function programmerAnalyse() {
    clearTimeout(minuteurAnalyse);
    jetonAnalyse += 1;
    const jeton = jetonAnalyse;
    const chaine = etapes.slice(1).flatMap(({ troncon }) => troncon?.geom ?? []);
    boutonGpx.disabled = true;
    if (chaine.length < 2) {
      analyse = null;
      profil.definir(null);
      blocAnalyse.hidden = true;
      afficherCurseur(null);
      return;
    }
    blocAnalyse.hidden = false;
    valeur('distance').textContent = km(repartition.total);
    minuteurAnalyse = setTimeout(async () => {
      try {
        const resultat = await analyserTrace(chaine, pratique);
        if (jeton !== jetonAnalyse) return;
        analyse = resultat;
        profil.definir(analyse);
        afficherCurseur(null);
        rendreStats();
        dessinerTrace();
        boutonGpx.disabled = false;
      } catch (erreur) {
        if (jeton !== jetonAnalyse) return;
        console.warn('Profil vélo :', erreur);
        analyse = null;
        profil.definir(null);
        lecture.textContent = estHorsLigne()
          ? 'Hors ligne : le relief de cette zone n’est pas enregistré.'
          : 'Profil indisponible pour le moment : le relief ne répond pas.';
        dessinerTrace();
      }
    }, ATTENTE_ANALYSE);
  }

  function definirNom(nouveau) {
    nom = nouveau;
    panneau.titre.textContent = nom;
    panneau.definirResume({ nom });
    if (champNom.value !== nom) champNom.value = nom;
  }

  function enregistrer() {
    if (etapes.length < 2) return;
    idParcours = idParcours ?? String(Date.now());
    const reussi = enregistrerParcours({
      id: idParcours,
      nom,
      pratique: pratique.id,
      date: Date.now(),
      total: repartition?.total ?? 0,
      plus: analyse?.plus ?? null,
      etapes: compacter(etapes),
    });
    message.textContent = reussi
      ? `« ${nom} » est dans Mes parcours.`
      : 'Enregistrement impossible : l’espace du navigateur est plein. Supprimez un ancien parcours.';
    if (reussi) {
      effacerBrouillon();
      onEnregistre();
    }
  }

  // Tout le détail du tracé, avec l'altitude du profil au même endroit
  function exporterGpx() {
    if (!analyse) return;
    const chaine = etapes.slice(1).flatMap(({ troncon }) => troncon?.geom ?? []);
    let parcouru = 0;
    const points = chaine.map(([lng, lat], index) => {
      if (index) parcouru += distance(chaine[index - 1], chaine[index]);
      return { lng, lat, d: parcouru };
    });
    const dernier = analyse.alts.length - 1;
    const alts = points.map(({ d }) => analyse.alts[Math.min(dernier, Math.round((d / (parcouru || 1)) * dernier))]);
    telechargerGpx(nom, points, alts);
  }

  // Le panneau couvre une partie de la carte : le tracé doit tenir dans le reste
  function cadrer(chaine) {
    const lngs = chaine.map(([lng]) => lng);
    const lats = chaine.map(([, lat]) => lat);
    const cadre = panneau.element.getBoundingClientRect();
    const toutLaLargeur = cadre.width >= window.innerWidth - 4;
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: {
        top: 90,
        right: toutLaLargeur ? 30 : 80,
        bottom: toutLaLargeur ? cadre.height + 20 : 30,
        left: toutLaLargeur ? 30 : cadre.right + 30,
      },
      duration: estHorsLigne() ? 0 : 700,
      maxZoom: 15,
    });
  }

  // Une trace existante : ses détails sont gardés, répartis entre quelques points déplaçables
  function etapesDepuisChaine(chaine) {
    const nombre = Math.min(POINTS_TRACE_REPRISE, chaine.length);
    const indices = Array.from({ length: nombre }, (_, i) => Math.round((i * (chaine.length - 1)) / (nombre - 1)));
    return indices.map((indice, rang) => {
      const [lng, lat] = chaine[indice];
      if (!rang) return { lng, lat, mode: 'fixe', troncon: null };
      const geom = chaine.slice(indices[rang - 1], indice + 1);
      let longueur = 0;
      for (let i = 1; i < geom.length; i += 1) longueur += distance(geom[i - 1], geom[i]);
      return { lng, lat, mode: 'fixe', troncon: { geom, troncons: [{ longueur, voie: 'inconnu', difficulte: null, marches: false }], source: 'trace' } };
    });
  }

  function rendreStats() {
    const { total, plus, moins, altitudeMax, altitudeMin, penteMax, duree } = analyse;
    valeur('distance').textContent = km(total);
    valeur('duree').textContent = formaterDuree(duree);
    valeur('plus').textContent = metres(plus);
    valeur('moins').textContent = metres(moins);
    valeur('max').textContent = metres(altitudeMax);
    valeur('min').textContent = metres(altitudeMin);
    valeur('pente').textContent = `${Math.round(penteMax)} %`;
    panneau.definirResume({ detail: `${km(total)} · D+ ${metres(plus)} · ${formaterDuree(duree)}` });
  }

  function rendreRepartition() {
    const { voies, difficultes, total } = repartition;
    const blocSurfaces = $('[data-bloc="surfaces"]');
    const connues = total - voies.inconnu;
    blocSurfaces.hidden = !connues;
    if (connues) {
      const parts = Object.entries(VOIES).map(([id, { libelle, couleur }]) => ({ libelle, couleur, longueur: voies[id] }));
      blocSurfaces.querySelector('.velo-barre').innerHTML = barre(parts, total);
      blocSurfaces.querySelector('.velo-legende').innerHTML = legende(parts, total);
    }
    const blocDifficulte = $('[data-bloc="difficulte"]');
    const cotes = difficultes.reduce((somme, longueur) => somme + longueur, 0);
    blocDifficulte.hidden = !cotes;
    if (cotes) {
      const parts = DIFFICULTES.map(({ libelle, couleur }, index) => ({ libelle, couleur, longueur: difficultes[index] }));
      parts.push({ libelle: 'Non coté', couleur: VOIES.inconnu.couleur, longueur: total - cotes });
      blocDifficulte.querySelector('.velo-barre').innerHTML = barre(parts, total);
      blocDifficulte.querySelector('.velo-legende').innerHTML = legende(parts, total);
    }
    const couleurs = paletteInterface();
    const bornes = ['0', ...PALIERS_PENTE.map(String)];
    $('.velo-legende-pente').innerHTML = couleurs.map((couleur, index) => `<span><i style="background: ${couleur}"></i>${index < PALIERS_PENTE.length ? `${bornes[index]}–${PALIERS_PENTE[index]}` : `${PALIERS_PENTE.at(-1)}+`}</span>`).join('') + '<span>%</span>';
  }

  // Lecture seule : la carte redevient libre, un toucher sur le tracé lit le profil
  function definirEdition(valeurEdition) {
    edition = valeurEdition;
    map.getCanvas().style.cursor = edition ? 'crosshair' : '';
    boutonTerminer.textContent = edition ? 'Terminer' : 'Modifier';
    panneau.element.classList.toggle('bf-velo-lecture', !edition);
    fermerPopup();
    dessinerMarqueurs();
  }

  function rendre() {
    boutonsPratique.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.pratique === pratique.id)));
    commande('annuler').disabled = !passe.length;
    commande('retablir').disabled = !futur.length;
    commande('libre').setAttribute('aria-pressed', String(modeLibre));
    commande('boucle').disabled = etapes.length < 2;
    commande('allerRetour').disabled = etapes.length < 2;
    commande('effacer').disabled = !etapes.length;
    panneau.element.style.setProperty('--vent-couleur', pratique.couleur);
  }

  // ---------- Événements ----------
  function surClic(event) {
    if (!panneau.ouvert) return;
    if (document.querySelector('#menu-tiroir.ouvert')) return;
    if (!edition) {
      const indice = indiceDepuisCarte(event.point);
      profil.placerDepuisCarte(indice);
      afficherCurseur(indice);
      return;
    }
    if (event.originalEvent?.target?.closest?.('.velo-etape')) return;
    if (popup) {
      fermerPopup();
      return;
    }
    const { lng, lat } = event.lngLat;
    const indice = etapes.length > 1 ? indiceSurLigne(event.point) : null;
    ajouterEtape(lng, lat, indice ?? etapes.length);
  }

  map.on('click', surClic);
  map.on('mousemove', (event) => {
    if (!panneau.ouvert || !analyse || document.querySelector('#menu-tiroir.ouvert')) return;
    const indice = indiceDepuisCarte(event.point);
    profil.placerDepuisCarte(indice);
    afficherCurseur(indice);
  });
  selecteurCouleur.addEventListener('change', () => {
    modeCouleur = selecteurCouleur.value;
    ecrire('velo-couleur', modeCouleur);
    dessinerTrace();
  });
  boutonTerminer.addEventListener('click', () => definirEdition(!edition));
  boutonGpx.addEventListener('click', exporterGpx);
  boutonEnregistrer.addEventListener('click', enregistrer);
  champNom.addEventListener('input', () => definirNom(champNom.value.trim() || 'Parcours sans nom'));
  commande('annuler').addEventListener('click', () => restaurer(passe, futur));
  commande('retablir').addEventListener('click', () => restaurer(futur, passe));
  commande('libre').addEventListener('click', () => {
    modeLibre = !modeLibre;
    ecrire('velo-libre', modeLibre);
    rendre();
  });
  commande('boucle').addEventListener('click', boucler);
  commande('allerRetour').addEventListener('click', allerRetour);
  commande('effacer').addEventListener('click', () => {
    memoriser();
    etapes = [];
    fermerPopup();
    recalculer();
  });
  boutonsPratique.forEach((bouton) => {
    bouton.addEventListener('click', () => {
      onPratique(bouton.dataset.pratique);
    });
  });

  return {
    get ouvert() {
      return panneau.ouvert;
    },
    definirPratique(id) {
      pratique = PRATIQUES[id];
      if (panneau.ouvert) recalculer();
    },
    // Itinéraire balisé ou trace importée : consultation d'abord, modification ensuite si besoin
    ouvrirTrace({ nom: nomTrace, chaine, lien }) {
      controleur?.abort();
      etapes = etapesDepuisChaine(chaine);
      idParcours = null;
      passe = [];
      futur = [];
      definirNom(nomTrace);
      source.hidden = !lien;
      if (lien) source.innerHTML = `<a href="${lien}" target="_blank" rel="noopener noreferrer">Fiche sur Waymarked Trails ↗</a> · © contributeurs OpenStreetMap`;
      bloquerFiches(true);
      panneau.afficher();
      definirEdition(false);
      recalculer();
      cadrer(chaine);
    },
    // Un parcours enregistré se rouvre tel quel : son tracé n'a pas à être recalculé
    ouvrirEnregistre(parcours) {
      controleur?.abort();
      etapes = parcours.etapes.map((etape) => ({ ...etape }));
      idParcours = parcours.id;
      passe = [];
      futur = [];
      definirNom(parcours.nom);
      source.hidden = true;
      bloquerFiches(true);
      panneau.afficher();
      definirEdition(false);
      recalculer();
      cadrer(etapes.slice(1).flatMap(({ troncon }) => troncon?.geom ?? []));
    },
    // Reprend le parcours en cours s'il y en a un : le téléphone a pu fermer l'app entre-temps
    ouvrirCreation() {
      const brouillon = lireBrouillon();
      if (edition && etapes.length) {
        /* déjà en cours */
      } else if (brouillon?.etapes?.length) {
        etapes = brouillon.etapes.map((etape) => ({ ...etape }));
        idParcours = null;
        definirNom(brouillon.nom || 'Nouveau parcours');
      } else {
        etapes = [];
        idParcours = null;
        definirNom('Nouveau parcours');
      }
      passe = [];
      futur = [];
      source.hidden = true;
      bloquerFiches(true);
      panneau.afficher();
      definirEdition(true);
      recalculer();
    },
    fermer() {
      controleur?.abort();
      controleur = null;
      edition = false;
      idParcours = null;
      bloquerFiches(false);
      panneau.masquer();
      fermerPopup();
      marqueurs.forEach((marqueur) => marqueur.remove());
      marqueurs = [];
      etapes = [];
      passe = [];
      futur = [];
      analyse = null;
      clearTimeout(minuteurAnalyse);
      jetonAnalyse += 1;
      blocAnalyse.hidden = true;
      map.getCanvas().style.cursor = '';
      if (map.getSource(SOURCE_TRACE)) {
        dessinerTrace();
        afficherCurseur(null);
      }
    },
  };
}
