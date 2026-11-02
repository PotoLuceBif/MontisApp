// Parcours sur la carte, commun aux activités : points déplaçables, routage selon la pratique, annuler / rétablir.
import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { bloquerFiches } from './fiche.js';
import { creerPanneauCarte } from './panneau-carte.js';
import { estHorsLigne } from './hors-ligne.js';
import { distance } from './rando-api.js';
import { telechargerGpx } from './rando-profil.js';
import { formaterDuree } from './rando-profil.js';
import { paletteInterface } from './vent-cadran.js';
import { calculerTroncon, tronconLibre } from './parcours-routage.js';
import { PALIERS_PENTE, VOIES, analyserTrace, palierDifficulte, palierPente, passagesRaides, repartir } from './parcours-analyse.js';
import { creerProfilParcours } from './parcours-profil.js';
import { compacter } from './parcours-stockage.js';
import { formatAltitude, formatDistance, formatLongueur, uniteAllure, uniteDistance, valeurDistance, versAllure, depuisAllure } from './unites.js';
import { surPreferences } from './preferences.js';

const TOLERANCE_CARTE = 24; // px pour lire le profil depuis la carte
const POINTS_TRACE_REPRISE = 12; // une trace reprise garde ses détails entre quelques points déplaçables
const LONGUEUR_MAX_DETAIL = 400000; // m : au-delà, le profil demanderait des centaines de tuiles de relief
const ATTENTE_ANALYSE = 250; // ms : on ne relit pas le relief à chaque modification rapprochée
const MODES_COULEUR = [['pratique', 'Pratique'], ['pente', 'Pente'], ['surface', 'Surface'], ['difficulte', 'Difficulté']];
const COULEUR_CERNE = '#0b111b';
const TOLERANCE_LIGNE = 16; // px pour insérer un point sur le tracé
const MAX_HISTORIQUE = 60;
const PASSAGES_AFFICHES = 3;
const PENTE_PORTAGE = 25; // % au-delà desquels on pousse ou on porte le plus souvent
const COMMANDES = [
  ['annuler', 'Annuler', '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'],
  ['retablir', 'Rétablir', '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'],
  ['libre', 'Tracé libre, en ligne droite', '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>'],
  ['boucle', 'Boucler le parcours', '<path d="M17 2.5 21 6.500 17 10.500"/><path d="M3 12V9.500a3 3 0 0 1 3-3h15"/><path d="M7 21.500 3 17.500 7 13.500"/><path d="M21 12v2.500a3 3 0 0 1-3 3H3"/>'],
  ['allerRetour', 'Aller-retour par le même chemin', '<path d="M4 8h14l-4-4"/><path d="M20 16H6l4 4"/>'],
  ['effacer', 'Tout effacer', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'],
];

const km = formatDistance;
const copier = (etapes) => etapes.map((etape) => ({ ...etape }));
const metres = formatAltitude;
const pourcent = (partie, total) => (total ? Math.round((partie / total) * 100) : 0);

// L'allure est mémorisée en min/km ; elle se saisit dans l'unité affichée
const lireDuree = (texte) => {
  const resultat = /^(\d{1,3})(?:[:.,]([0-5]\d))?$/.exec(String(texte).trim());
  return resultat ? Number(resultat[1]) + Number(resultat[2] || 0) / 60 : 0;
};
const ecrireDuree = (minutes) => {
  const secondes = Math.round(minutes * 60);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
};
const allureAffichee = (memo) => {
  const minutes = lireDuree(memo);
  return minutes > 0 ? ecrireDuree(versAllure(minutes)) : memo;
};

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

export function creerEditeurParcours(map, { activite, stockage, onFermer = () => {}, onRetour = () => {}, onEnregistre = () => {} }) {
  const SOURCE_TRACE = `${activite.id}-trace`;
  const COUCHE_CONTOUR = `${activite.id}-trace-contour`;
  const COUCHE_TRACE = `${activite.id}-trace-ligne`;
  const COUCHE_LIBRE = `${activite.id}-trace-libre`;
  const SOURCE_CURSEUR = `${activite.id}-curseur`;
  const COUCHE_CURSEUR = `${activite.id}-curseur-point`;
  const { pratiques, difficulte: echelle } = activite;
  const { niveaux: DIFFICULTES } = echelle;
  // Le choix de pratique ne pilote que le routage : il vit ici, pas dans le menu
  let pratique = pratiques[lire(`${activite.id}-pratique`, activite.pratiqueDefaut)] ?? pratiques[activite.pratiqueDefaut];
  let retourCourant = onRetour;
  let onAnalyse = null;
  let etapes = []; // { lng, lat, mode: 'route' | 'libre' | 'fixe', troncon } ; troncon : ce qui y mène
  let edition = false;
  let modeLibre = lire(`${activite.id}-libre`, false) === true;
  let passe = [];
  let futur = [];
  let marqueurs = [];
  let popup = null;
  let controleur = null;
  let nom = 'Nouveau parcours';
  let idParcours = null;
  let lignesEnsemble = null; // très long itinéraire : affiché, mais ni analysé ni modifiable
  let analyse = null;
  let repartition = null;
  let jetonAnalyse = 0;
  let minuteurAnalyse = null;
  let modeCouleur = MODES_COULEUR.some(([id]) => id === lire(`${activite.id}-couleur`, '')) ? lire(`${activite.id}-couleur`, '') : 'pratique';

  const panneau = creerPanneauCarte({
    cle: `${activite.id}-panneau-reduit`,
    libelle: activite.libelle,
    classe: 'bf-outil bf-parcours',
    onFermer: () => onFermer(),
    onRetour: () => retourCourant?.(),
  });
  panneau.corps.innerHTML = `
    <div class="parcours-pratiques parcours-pratiques-panneau" role="group" aria-label="Pratique"${Object.keys(pratiques).length < 2 ? ' hidden' : ''}>
      ${Object.values(pratiques).map(({ id, libelle }) => `<button type="button" data-pratique="${id}" aria-pressed="false">${libelle}</button>`).join('')}
    </div>
    <div class="parcours-commandes" role="group" aria-label="Modifier le parcours">
      ${COMMANDES.map(([id, libelle, dessin]) => `<button type="button" data-commande="${id}" aria-label="${libelle}" title="${libelle}"><svg viewBox="0 0 24 24" aria-hidden="true">${dessin}</svg></button>`).join('')}
    </div>
    <p class="parcours-etat" role="status" aria-live="polite"></p>
    <div class="parcours-analyse" hidden>
      <div class="parcours-stats">
        <div class="parcours-stat parcours-stat-principale"><span>Distance</span><strong data-v="distance">—</strong></div>
        <div class="parcours-stat parcours-stat-principale"><span>Durée estimée</span><strong data-v="duree">—</strong></div>
        <div class="parcours-stat"><span>D+</span><strong data-v="plus">—</strong></div>
        <div class="parcours-stat"><span>D−</span><strong data-v="moins">—</strong></div>
        <div class="parcours-stat"><span>Alt. max</span><strong data-v="max">—</strong></div>
        <div class="parcours-stat"><span>Alt. min</span><strong data-v="min">—</strong></div>
        <div class="parcours-stat"><span>Pente max</span><strong data-v="pente">—</strong></div>
        ${activite.allure ? `<label class="parcours-stat parcours-allure"><span>Allure (<b data-unite-allure>${uniteAllure()}</b>)</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="10:00" value="${allureAffichee(lire(`${activite.id}-allure`, '10:00'))}" title="Temps par kilomètre au format minutes:secondes" aria-label="Temps par kilomètre au format minutes:secondes"><strong aria-live="polite">—</strong></label>` : ''}
      </div>
      <div class="parcours-profil">
        <p class="parcours-lecture">Touchez le profil pour lire un point du tracé.</p>
        <canvas class="parcours-graphique" tabindex="0" role="img" aria-label="Profil du parcours coloré selon la pente. Glisser ou utiliser les flèches du clavier pour lire un point."></canvas>
        <div class="parcours-legende-pente" aria-hidden="true"></div>
      </div>
      <div class="parcours-alertes" hidden></div>
      <div class="parcours-repartition" data-bloc="surfaces" hidden><h4>Surfaces</h4><div class="parcours-barre"></div><div class="parcours-legende"></div></div>
      <div class="parcours-repartition" data-bloc="difficulte" hidden><h4>${echelle.titre} <small>${echelle.note}</small></h4><div class="parcours-barre"></div><div class="parcours-legende"></div></div>
      <label class="parcours-couleur"><span>Colorer le tracé selon</span><select>
        ${MODES_COULEUR.map(([id, libelle]) => `<option value="${id}">${id === 'pratique' && Object.keys(pratiques).length < 2 ? 'Couleur unie' : libelle}</option>`).join('')}
      </select></label>
    </div>
    <label class="parcours-nom"><span>Nom</span><input type="text" maxlength="60" placeholder="Nom du parcours"></label>
    <div class="parcours-pied">
      <button type="button" class="para-bouton parcours-terminer">Terminer</button>
      <button type="button" class="para-bouton para-bouton-principal parcours-enregistrer">Enregistrer</button>
      <button type="button" class="para-bouton parcours-gpx" disabled>GPX</button>
    </div>
    <div class="pc-infos" hidden></div>
    <p class="parcours-source" hidden></p>
  `;
  panneau.titre.textContent = nom;
  panneau.definirResume({
    rose: activite.icone,
    nom,
    detail: '',
    valeur: '',
    unite: '',
  });
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const commande = (id) => $(`[data-commande="${id}"]`);
  const message = $('.parcours-etat');
  const boutonsPratique = [...panneau.corps.querySelectorAll('[data-pratique]')];
  const blocAnalyse = $('.parcours-analyse');
  const lecture = $('.parcours-lecture');
  const selecteurCouleur = $('.parcours-couleur select');
  const boutonTerminer = $('.parcours-terminer');
  const boutonGpx = $('.parcours-gpx');
  const boutonEnregistrer = $('.parcours-enregistrer');
  const champNom = $('.parcours-nom input');
  const source = $('.parcours-source');
  const valeur = (id) => $(`[data-v="${id}"]`);
  selecteurCouleur.value = modeCouleur;

  const profil = creerProfilParcours($('.parcours-graphique'), {
    onCurseur: (index) => afficherCurseur(index),
  });

  // ---------- Couches ----------
  function assurerCouches() {
    if (map.getSource(SOURCE_TRACE)) return;
    // tolerance 0 : sinon, de loin, la carte supprime les milliers de petits morceaux d'un long itinéraire
    map.addSource(SOURCE_TRACE, { type: 'geojson', tolerance: 0, data: { type: 'FeatureCollection', features: [] } });
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
      else if (modeCouleur === 'difficulte' && portion && portion.difficulte !== null && portion.difficulte !== undefined) couleur = DIFFICULTES[palierDifficulte(portion.difficulte, DIFFICULTES)].couleur;
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
      features: lignesEnsemble ? [{
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: lignesEnsemble },
        properties: { couleur, libre: false },
      }] : modeCouleur !== 'pratique' && analyse ? morceauxColores() : etapes.slice(1).filter(({ troncon }) => troncon).map(({ troncon }) => ({
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
      element.className = `parcours-etape${index === 0 ? ' parcours-etape-depart' : dernier ? ' parcours-etape-arrivee' : ''}`;
      element.style.setProperty('--parcours-couleur', pratique.couleur);
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
    contenu.className = 'parcours-popup';
    const derniere = etapes[etapes.length - 1];
    const dejaBoucle = etapes.length > 2 && derniere.lng === etape.lng && derniere.lat === etape.lat;
    if (index === 0 && etapes.length > 1 && !dejaBoucle) {
      const boucle = document.createElement('button');
      boucle.type = 'button';
      boucle.textContent = 'Boucler le parcours';
      boucle.addEventListener('click', () => {
        fermerPopup();
        boucler();
      });
      contenu.append(boucle);
    }
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
    retirer.className = 'parcours-popup-retirer';
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
          console.warn('Tronçon non calculé :', erreur);
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
    repartition = repartir(tronconsPlats, DIFFICULTES);
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
      if (etapes.length) stockage.ecrireBrouillon({ nom, pratique: pratique.id, etapes: compacter(etapes) });
      else stockage.effacerBrouillon();
    }
    boutonEnregistrer.disabled = etapes.length < 2;
    panneau.definirResume({ detail: total ? km(total) : 'Touchez la carte', valeur: total ? valeurDistance(total) : '', unite: total ? uniteDistance() : '' });
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
        rendreAlertes();
        dessinerTrace();
        boutonGpx.disabled = false;
        onAnalyse?.(analyse);
      } catch (erreur) {
        if (jeton !== jetonAnalyse) return;
        console.warn('Profil du parcours :', erreur);
        analyse = null;
        profil.definir(null);
        lecture.textContent = estHorsLigne()
          ? 'Hors ligne : le relief de cette zone n’est pas enregistré.'
          : 'Profil indisponible pour le moment : le relief ne répond pas.';
        dessinerTrace();
      }
    }, ATTENTE_ANALYSE);
  }

  // Ce que la fiche d'un itinéraire ajoute : difficulté, liens
  function rendreInfos(infos) {
    const bloc = $('.pc-infos');
    bloc.hidden = !infos.length;
    bloc.replaceChildren(...infos.map(({ texte, lien }) => {
      const element = document.createElement(lien ? 'a' : 'p');
      element.textContent = texte;
      if (lien) {
        element.href = lien;
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
      return element;
    }));
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
    const reussi = stockage.enregistrer({
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
      stockage.effacerBrouillon();
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
    const cadre = panneau.element.getBoundingClientRect();
    let ouest = 180;
    let est = -180;
    let sud = 90;
    let nord = -90;
    chaine.forEach(([lng, lat]) => {
      ouest = Math.min(ouest, lng);
      est = Math.max(est, lng);
      sud = Math.min(sud, lat);
      nord = Math.max(nord, lat);
    });
    const toutLaLargeur = cadre.width >= window.innerWidth - 4;
    map.fitBounds([[ouest, sud], [est, nord]], {
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
    rendreAllure();
  }

  // Le clavier numérique n'a pas de deux-points : « 10,30 » est aussi accepté
  function rendreAllure() {
    const champ = $('.parcours-allure input');
    if (!champ || !analyse) return;
    const minutesParKm = depuisAllure(lireDuree(champ.value));
    const heuresParKm = minutesParKm / 60;
    champ.setAttribute('aria-invalid', String(!(heuresParKm > 0)));
    $('.parcours-allure strong').textContent = heuresParKm > 0 ? `≈ ${formaterDuree((analyse.total / 1000) * heuresParKm)}` : '—';
    if (heuresParKm > 0) ecrire(`${activite.id}-allure`, ecrireDuree(minutesParKm));
  }

  // Ce qui peut surprendre sur le terrain : pentes, marches, sentiers très techniques
  $('.parcours-allure input')?.addEventListener('input', rendreAllure);

  function rendreAlertes() {
    const bloc = $('.parcours-alertes');
    const elements = [];
    const passages = analyse ? passagesRaides(analyse, pratique.seuilRaide) : [];
    passages.slice(0, PASSAGES_AFFICHES).forEach(({ indice, d, longueur, pente }) => {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      const portage = activite.portage && pente >= PENTE_PORTAGE;
      bouton.className = `parcours-alerte${portage ? ' parcours-alerte-forte' : ''}`;
      bouton.textContent = `${portage ? 'Portage probable' : pente > 0 ? 'Montée raide' : 'Descente raide'} · ${pente > 0 ? '+' : ''}${Math.round(pente)} % sur ${formatLongueur(longueur)} · ${uniteDistance()} ${valeurDistance(d)}`;
      bouton.addEventListener('click', () => {
        profil.placerDepuisCarte(indice);
        afficherCurseur(indice);
        const { lng, lat } = analyse.points[indice];
        map.easeTo({ center: [lng, lat], duration: estHorsLigne() ? 0 : 500 });
      });
      elements.push(bouton);
    });
    const ajouterTexte = (texte) => {
      const ligne = document.createElement('p');
      ligne.className = 'parcours-alerte parcours-alerte-forte';
      ligne.textContent = texte;
      elements.push(ligne);
    };
    if (passages.length > PASSAGES_AFFICHES) {
      const ligne = document.createElement('p');
      ligne.className = 'parcours-alerte-suite';
      ligne.textContent = `Et ${passages.length - PASSAGES_AFFICHES} autre${passages.length - PASSAGES_AFFICHES > 1 ? 's' : ''} passage${passages.length - PASSAGES_AFFICHES > 1 ? 's' : ''} raide${passages.length - PASSAGES_AFFICHES > 1 ? 's' : ''}.`;
      elements.push(ligne);
    }
    if (activite.portage && repartition?.marches) ajouterTexte(`Marches sur le tracé : ${formatLongueur(repartition.marches)}`);
    const techniques = repartition?.difficultes.at(-1) ?? 0;
    if (techniques) ajouterTexte(`${echelle.texteTechnique} : ${formatLongueur(techniques)}`);
    bloc.replaceChildren(...elements);
    bloc.hidden = !elements.length;
  }

  function rendreRepartition() {
    const { voies, difficultes, total } = repartition;
    const blocSurfaces = $('[data-bloc="surfaces"]');
    const connues = total - voies.inconnu;
    blocSurfaces.hidden = !connues;
    if (connues) {
      const parts = Object.entries(VOIES).map(([id, { libelle, couleur }]) => ({ libelle: activite.libelleVoies?.[id] ?? libelle, couleur, longueur: voies[id] }));
      blocSurfaces.querySelector('.parcours-barre').innerHTML = barre(parts, total);
      blocSurfaces.querySelector('.parcours-legende').innerHTML = legende(parts, total);
    }
    const blocDifficulte = $('[data-bloc="difficulte"]');
    const cotes = difficultes.reduce((somme, longueur) => somme + longueur, 0);
    blocDifficulte.hidden = !cotes;
    if (cotes) {
      const parts = DIFFICULTES.map(({ libelle, couleur }, index) => ({ libelle, couleur, longueur: difficultes[index] }));
      parts.push({ libelle: 'Non coté', couleur: VOIES.inconnu.couleur, longueur: total - cotes });
      blocDifficulte.querySelector('.parcours-barre').innerHTML = barre(parts, total);
      blocDifficulte.querySelector('.parcours-legende').innerHTML = legende(parts, total);
    }
    const couleurs = paletteInterface();
    const bornes = ['0', ...PALIERS_PENTE.map(String)];
    $('.parcours-legende-pente').innerHTML = couleurs.map((couleur, index) => `<span><i style="background: ${couleur}"></i>${index < PALIERS_PENTE.length ? `${bornes[index]}–${PALIERS_PENTE[index]}` : `${PALIERS_PENTE.at(-1)}+`}</span>`).join('') + '<span>%</span>';
  }

  // Lecture seule : la carte redevient libre, un toucher sur le tracé lit le profil
  function definirEdition(valeurEdition) {
    edition = valeurEdition;
    map.getCanvas().style.cursor = edition ? 'crosshair' : '';
    boutonTerminer.textContent = edition ? 'Terminer' : 'Modifier';
    panneau.element.classList.toggle('bf-parcours-lecture', !edition);
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
    if (event.originalEvent?.target?.closest?.('.parcours-etape')) return;
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
    ecrire(`${activite.id}-couleur`, modeCouleur);
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
    ecrire(`${activite.id}-libre`, modeLibre);
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
      pratique = pratiques[bouton.dataset.pratique];
      ecrire(`${activite.id}-pratique`, pratique.id);
      recalculer();
    });
  });

  // Unités ou langue changées : tout ce qui est affiché se réécrit, sans recalcul
  function reafficher() {
    const champAllure = $('.parcours-allure input');
    if (champAllure) {
      champAllure.value = allureAffichee(lire(`${activite.id}-allure`, '10:00'));
      $('[data-unite-allure]').textContent = uniteAllure();
    }
    if (repartition) {
      const total = repartition.total;
      panneau.definirResume({ detail: total ? km(total) : '', valeur: total ? valeurDistance(total) : '', unite: total ? uniteDistance() : '' });
      if (!analyse) valeur('distance').textContent = km(total);
      rendreRepartition();
    }
    if (analyse) {
      profil.definir(analyse);
      rendreStats();
      rendreAlertes();
      afficherCurseur(null);
    }
  }
  surPreferences(reafficher);

  return {
    get ouvert() {
      return panneau.ouvert;
    },
    // Itinéraire balisé ou trace importée : consultation d'abord, modification ensuite si besoin
    ouvrirTrace({ nom: nomTrace, chaine, lignes, avecSauts = false, lien, meta = '', infos = [], onRetour: retour = null, onAnalyse: rappel = null }) {
      controleur?.abort();
      retourCourant = retour ?? onRetour;
      onAnalyse = rappel;
      passe = [];
      futur = [];
      idParcours = null;
      definirNom(nomTrace);
      panneau.meta.textContent = meta;
      source.hidden = !lien;
      if (lien) source.innerHTML = `<a href="${lien}" target="_blank" rel="noopener noreferrer">Fiche sur Waymarked Trails ↗</a> · © contributeurs OpenStreetMap`;
      rendreInfos(infos);
      bloquerFiches(true);
      const longueur = (lignes ?? [chaine]).reduce((total, ligne) => {
        let somme = total;
        for (let i = 1; i < ligne.length; i += 1) somme += distance(ligne[i - 1], ligne[i]);
        return somme;
      }, 0);
      if (longueur > LONGUEUR_MAX_DETAIL || avecSauts || chaine.length < 2) {
        etapes = [];
        lignesEnsemble = lignes ?? [chaine];
        panneau.afficher();
        panneau.element.classList.add('bf-parcours-ensemble');
        definirEdition(false);
        analyse = null;
        jetonAnalyse += 1;
        blocAnalyse.hidden = true;
        message.textContent = longueur > LONGUEUR_MAX_DETAIL
          ? `Environ ${km(longueur)} avec les variantes. Sur un itinéraire aussi long, le profil et l’export ne sont pas proposés.`
          : `Environ ${km(longueur)}. Cet itinéraire a des variantes ou des morceaux séparés : son profil ne serait pas juste, il n’est pas calculé.`;
        panneau.definirResume({ detail: km(longueur), valeur: '', unite: '' });
        dessinerTrace();
        cadrer(lignesEnsemble.flat());
        return;
      }
      lignesEnsemble = null;
      panneau.element.classList.remove('bf-parcours-ensemble');
      etapes = etapesDepuisChaine(chaine);
      panneau.afficher();
      definirEdition(false);
      recalculer();
      cadrer(chaine);
    },
    // Un parcours enregistré se rouvre tel quel : son tracé n'a pas à être recalculé
    ouvrirEnregistre(parcours) {
      controleur?.abort();
      lignesEnsemble = null;
      panneau.element.classList.remove('bf-parcours-ensemble');
      etapes = parcours.etapes.map((etape) => ({ ...etape }));
      if (pratiques[parcours.pratique]) pratique = pratiques[parcours.pratique];
      retourCourant = onRetour;
      onAnalyse = null;
      panneau.meta.textContent = '';
      rendreInfos([]);
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
      lignesEnsemble = null;
      panneau.element.classList.remove('bf-parcours-ensemble');
      retourCourant = onRetour;
      onAnalyse = null;
      panneau.meta.textContent = '';
      rendreInfos([]);
      const brouillon = stockage.lireBrouillon();
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
    // Cède la place à un autre panneau du même menu, sans rien laisser sur la carte
    fermerSansQuitter() {
      if (panneau.ouvert || etapes.length || lignesEnsemble) this.fermer();
    },
    fermer() {
      controleur?.abort();
      controleur = null;
      edition = false;
      idParcours = null;
      lignesEnsemble = null;
      panneau.element.classList.remove('bf-parcours-ensemble');
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
