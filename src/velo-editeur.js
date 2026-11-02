// Parcours vélo sur la carte : points déplaçables, routage selon la pratique, annuler / rétablir.
import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { bloquerFiches } from './fiche.js';
import { creerPanneauCarte } from './panneau-carte.js';
import { estHorsLigne } from './hors-ligne.js';
import { distance } from './rando-api.js';
import { PRATIQUES, calculerTroncon, tronconLibre } from './velo-routage.js';

const SOURCE_TRACE = 'velo-trace';
const COUCHE_CONTOUR = 'velo-trace-contour';
const COUCHE_TRACE = 'velo-trace-ligne';
const COUCHE_LIBRE = 'velo-trace-libre';
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

export function creerEditeurVelo(map, { pratique: pratiqueInitiale, onPratique = () => {}, onFermer = () => {} }) {
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
    // Tireté : ce tronçon n'est pas un chemin connu
    map.addLayer({
      id: COUCHE_LIBRE,
      type: 'line',
      source: SOURCE_TRACE,
      filter: ['==', ['get', 'libre'], true],
      paint: { 'line-color': ['get', 'couleur'], 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
    });
  }

  function dessinerTrace() {
    assurerCouches();
    const couleur = pratique.couleur;
    map.getSource(SOURCE_TRACE).setData({
      type: 'FeatureCollection',
      features: etapes.slice(1).filter(({ troncon }) => troncon).map(({ troncon }) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: troncon.geom },
        properties: { couleur, libre: troncon.source === 'libre' },
      })),
    });
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

  function longueurTotale() {
    return etapes.slice(1).reduce((total, { troncon }) => {
      if (!troncon) return total;
      let somme = 0;
      for (let i = 1; i < troncon.geom.length; i += 1) somme += distance(troncon.geom[i - 1], troncon.geom[i]);
      return total + somme;
    }, 0);
  }

  function apresCalcul({ secours, echecs }) {
    const total = longueurTotale();
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
    panneau.definirResume({ detail: total ? km(total) : 'Touchez la carte', valeur: total ? (total / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '', unite: total ? 'km' : '' });
    rendre();
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
    if (!panneau.ouvert || !edition) return;
    if (document.querySelector('#menu-tiroir.ouvert')) return;
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
    ouvrirCreation() {
      edition = true;
      bloquerFiches(true);
      panneau.afficher();
      map.getCanvas().style.cursor = 'crosshair';
      recalculer();
    },
    fermer() {
      controleur?.abort();
      controleur = null;
      edition = false;
      bloquerFiches(false);
      panneau.masquer();
      fermerPopup();
      marqueurs.forEach((marqueur) => marqueur.remove());
      marqueurs = [];
      etapes = [];
      passe = [];
      futur = [];
      map.getCanvas().style.cursor = '';
      if (map.getSource(SOURCE_TRACE)) dessinerTrace();
    },
  };
}
