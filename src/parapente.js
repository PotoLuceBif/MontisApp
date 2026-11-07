import { BALISES, URL_TERRAINS_FFVL, lireJson } from './balises-sources.js';
import { creerCoucheBalises } from './balises-couche.js';
import { creerFicheTerrain } from './terrain-fiche.js';
import { lireTerrains, terrainsEnGeoJSON } from './terrains-calcul.js';
import { IMAGE_AUTORISATION, IMAGE_GROUPE, chargerImagesTerrains, fournirImageTerrain, nomAnneau, poserImagesTerrains } from './terrains-images.js';
import { dateLisible, estHorsLigne } from './hors-ligne.js';
import { heureCourte, surLangue, t } from './i18n.js';

const INTERVALLE_ACTUALISATION = 5 * 60 * 1000;
const DELAI_RELECTURE = 60 * 1000;
const DUREE_TERRAINS = 12 * 60 * 60 * 1000; // la FFVL publie ses terrains une fois par jour
const SOURCE_TERRAINS = 'terrains-ffvl';
const COUCHE_GROUPES = 'terrains-ffvl-groupes';
const COUCHE_ANNEAUX = 'terrains-ffvl-anneaux';
const COUCHE_ANNEAU_CHOISI = 'terrains-ffvl-anneau-choisi';
const COUCHE_TERRAINS = 'terrains-ffvl-points';
const COUCHE_AUTORISATIONS = 'terrains-ffvl-autorisations';
const COUCHE_TERRAINS_NOMS = 'terrains-ffvl-noms';
const COUCHES_TERRAINS = [COUCHE_GROUPES, COUCHE_ANNEAUX, COUCHE_ANNEAU_CHOISI, COUCHE_TERRAINS, COUCHE_AUTORISATIONS, COUCHE_TERRAINS_NOMS];
const TOLERANCE_CLIC = 6;
// Au-delà (à partir du zoom 11), chaque terrain a son pin ; jusque-là, les voisins se regroupent comme les stations
const ZOOM_MAX_GROUPES = 10;
// Pointe du pin (48 px) à 4,25 px du bas ; centre de la tête 17 px au-dessus de la pointe, 19,5 choisi (×1,15)
const DECALAGE_POINTE = [0, 4.25];
const HAUT_TETE = 17;
const HAUT_TETE_CHOISIE = 19.5;
const SANS_GROUPE = ['!', ['has', 'point_count']];
// Pastille « ! » en haut à droite de la tête du pin, à 45°
const PLACE_AUTORISATION = [9, -26];
const PLACE_AUTORISATION_CHOISIE = [10.5, -30];
const ATTRIBUTION_TERRAINS = 'Terrains © <a href="https://www.data.gouv.fr/fr/organizations/federation-francaise-de-vol-libre/" target="_blank" rel="noopener noreferrer">FFVL</a> (Licence Ouverte)';

export function initParapente(map, { onEtat = () => {}, onDonnees = () => {}, peutOuvrirBalise = () => true, onRetourFiche, analyserVent = null } = {}) {
  let balisesVisibles = false;
  let sitesVisibles = false;
  let actif = false;
  let minuteur = null;
  let controleur = null;
  let actualisation = null;
  let derniereActualisation = 0;
  let nombreSites = 0;
  let statistiques = { recentes: 0, anciennes: 0, horsService: 0 };
  let donneesDejaChargees = false;
  let dateEnregistree = null;
  let manquants = [];
  let terrains = new Map();
  let terrainsRecus = 0;
  let terrainsEnregistres = null;
  const source = BALISES;
  const couche = creerCoucheBalises(map, { peutOuvrir: peutOuvrirBalise, onRetourFiche });
  const ficheTerrain = creerFicheTerrain(map, {
    onOuvrir: (terrain) => marquerTerrain(terrain.id),
    onFermer: () => marquerTerrain(null),
    onRetour: onRetourFiche,
    baliseProche: (lon, lat, rayon) => couche.plusProche(lon, lat, rayon),
    // Les 24 dernières heures de la balise ; sa flèche retour ramène au terrain
    ouvrirBalise: (id, retour) => couche.centrerSur(id, { retour, periode: 24 }),
    analyserVent,
  });

  function majVisibilite() {
    COUCHES_TERRAINS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sitesVisibles ? 'visible' : 'none');
    });
    if (!sitesVisibles) ficheTerrain.fermer();
    couche.definirVisible(balisesVisibles);
  }

  // Le terrain choisi prend son pin agrandi, passe devant les autres et garde son anneau à sa taille
  function marquerTerrain(id) {
    if (!map.getLayer(COUCHE_TERRAINS)) return;
    const choisi = ['==', ['get', 'id'], id ?? ''];
    const avecAnneau = ['all', SANS_GROUPE, ['!=', ['get', 'anneau'], '']];
    map.setLayoutProperty(COUCHE_TERRAINS, 'icon-image', ['case', choisi, ['concat', ['get', 'pin'], '-selected'], ['get', 'pin']]);
    // Les fermés par-dessus : on doit les voir même en zone dense
    map.setLayoutProperty(COUCHE_TERRAINS, 'symbol-sort-key', ['case', choisi, 10, ['match', ['get', 'pin'], 'terrain-ferme', 2, 'terrain-atterrissage', 0, 1]]);
    map.setFilter(COUCHE_ANNEAUX, ['all', avecAnneau, ['!', choisi]]);
    map.setFilter(COUCHE_ANNEAU_CHOISI, ['all', avecAnneau, choisi]);
    map.setLayoutProperty(COUCHE_AUTORISATIONS, 'icon-offset', ['case', choisi, ['literal', PLACE_AUTORISATION_CHOISIE], ['literal', PLACE_AUTORISATION]]);
    map.setLayoutProperty(COUCHE_AUTORISATIONS, 'symbol-sort-key', ['case', choisi, 10, 0]);
  }

  let images = null;
  chargerImagesTerrains().then((chargees) => {
    images = chargees;
    assurerCouchesTerrains();
  }).catch((erreur) => console.warn('Pins des terrains :', erreur));
  // Seul résolveur de la carte : un autre module qui en voudrait un devra passer par ici
  map.setMissingStyleImageResolver(async (id) => {
    if (id.startsWith('terrain-')) fournirImageTerrain(map, id, await chargerImagesTerrains().catch(() => null));
  });

  // Les secteurs suivent la carte quand elle tourne ; le pin, lui, reste droit
  const coucheAnneau = (id, hauteur, taille) => ({
    id,
    type: 'symbol',
    source: SOURCE_TERRAINS,
    filter: ['==', ['get', 'id'], ''],
    layout: {
      'icon-image': ['concat', nomAnneau(''), ['get', 'anneau']],
      'icon-size': taille,
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-translate': [0, -hauteur], 'icon-translate-anchor': 'viewport' },
  });

  // Sous les balises : un relevé se lit par-dessus son décollage
  function assurerCouchesTerrains() {
    if (!terrains.size || !images) return;
    poserImagesTerrains(map, images);
    const donnees = terrainsEnGeoJSON([...terrains.values()]);
    if (!map.getSource(SOURCE_TERRAINS)) {
      map.addSource(SOURCE_TERRAINS, {
        type: 'geojson',
        data: donnees,
        attribution: ATTRIBUTION_TERRAINS,
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: ZOOM_MAX_GROUPES,
      });
    } else {
      map.getSource(SOURCE_TERRAINS).setData(donnees);
    }
    const dessous = ['balises-vent-selection', 'balises-vent-manches', 'balises-vent-pastilles'].find((id) => map.getLayer(id));
    if (!map.getLayer(COUCHE_GROUPES)) {
      map.addLayer({
        id: COUCHE_GROUPES,
        type: 'symbol',
        source: SOURCE_TERRAINS,
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': IMAGE_GROUPE,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 13,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      }, dessous);
    }
    if (!map.getLayer(COUCHE_ANNEAUX)) map.addLayer(coucheAnneau(COUCHE_ANNEAUX, HAUT_TETE, 1), dessous);
    if (!map.getLayer(COUCHE_ANNEAU_CHOISI)) map.addLayer(coucheAnneau(COUCHE_ANNEAU_CHOISI, HAUT_TETE_CHOISIE, 1.15), dessous);
    if (!map.getLayer(COUCHE_TERRAINS)) {
      map.addLayer({
        id: COUCHE_TERRAINS,
        type: 'symbol',
        source: SOURCE_TERRAINS,
        filter: SANS_GROUPE,
        layout: {
          'icon-image': ['get', 'pin'],
          'icon-anchor': 'bottom',
          'icon-offset': DECALAGE_POINTE,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      }, dessous);
    }
    // Terrain sur autorisation : on vole seulement après avoir prévenu (club, propriétaire…)
    if (!map.getLayer(COUCHE_AUTORISATIONS)) {
      map.addLayer({
        id: COUCHE_AUTORISATIONS,
        type: 'symbol',
        source: SOURCE_TERRAINS,
        filter: ['all', SANS_GROUPE, ['get', 'autorisation']],
        layout: {
          'icon-image': IMAGE_AUTORISATION,
          'icon-offset': PLACE_AUTORISATION,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      }, dessous);
    }
    if (!map.getLayer(COUCHE_TERRAINS_NOMS)) {
      map.addLayer({
        id: COUCHE_TERRAINS_NOMS,
        type: 'symbol',
        source: SOURCE_TERRAINS,
        minzoom: 12,
        filter: SANS_GROUPE,
        layout: {
          'text-field': ['get', 'nom'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
          'text-max-width': 9,
        },
        paint: { 'text-color': '#1d2329', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      }, dessous);
    }
    marquerTerrain(ficheTerrain.idOuvert);
    majVisibilite();
  }

  async function chargerSites(signal) {
    if (terrains.size && Date.now() - terrainsRecus < DUREE_TERRAINS) return;
    // Mis à jour une fois par jour : le cache du navigateur suffit
    const { donnees, dateEnregistree } = await lireJson(URL_TERRAINS_FFVL, signal, { cache: 'default' });
    if (signal.aborted) return;
    terrains = new Map(lireTerrains(donnees).map((terrain) => [terrain.id, terrain]));
    terrainsRecus = Date.now();
    terrainsEnregistres = dateEnregistree;
    nombreSites = terrains.size;
    donneesDejaChargees = true;
    assurerCouchesTerrains();
    onDonnees();
  }

  // Un clic sur un terrain ouvre sa fiche, sauf si une balise est dessus (elle passe d'abord)
  map.on('click', (event) => {
    if (!sitesVisibles || !map.getLayer(COUCHE_TERRAINS) || !peutOuvrirBalise()) return;
    const { x, y } = event.point;
    const boite = [[x - TOLERANCE_CLIC, y - TOLERANCE_CLIC], [x + TOLERANCE_CLIC, y + TOLERANCE_CLIC]];
    const balises = ['balises-vent-pastilles', 'balises-vent-manches'].filter((id) => map.getLayer(id));
    if (balisesVisibles && balises.length && map.queryRenderedFeatures(boite, { layers: balises }).length) {
      ficheTerrain.fermer();
      return;
    }
    // Un groupe : on s'en approche jusqu'à ce qu'il s'ouvre
    const [groupe] = map.queryRenderedFeatures(boite, { layers: [COUCHE_GROUPES] });
    if (groupe) {
      ficheTerrain.fermer();
      map.getSource(SOURCE_TERRAINS).getClusterExpansionZoom(groupe.properties.cluster_id)
        .then((zoom) => map.easeTo({ center: groupe.geometry.coordinates, zoom: Math.max(zoom, ZOOM_MAX_GROUPES + 1), duration: 600 }))
        .catch(() => {});
      return;
    }
    // Le pin le plus proche du doigt : on vise sa tête, au-dessus de la coordonnée
    const touches = map.queryRenderedFeatures(boite, { layers: [COUCHE_TERRAINS] });
    const plusPres = touches
      .map((feature) => {
        const ecran = map.project(feature.geometry.coordinates);
        return { feature, ecart: Math.hypot(ecran.x - x, ecran.y - HAUT_TETE - y) };
      })
      .sort((a, b) => a.ecart - b.ecart)[0]?.feature;
    const terrain = plusPres && terrains.get(String(plusPres.properties.id));
    if (!terrain) {
      ficheTerrain.fermer();
      return;
    }
    ficheTerrain.ouvrir(terrain);
  });
  map.on('mousemove', (event) => {
    if (!sitesVisibles || !map.getLayer(COUCHE_TERRAINS)) return;
    if (map.queryRenderedFeatures(event.point, { layers: [COUCHE_TERRAINS, COUCHE_GROUPES] }).length) map.getCanvas().style.cursor = 'pointer';
  });
  map.on('style.load', assurerCouchesTerrains);
  window.addEventListener('fiche-ouverte', () => ficheTerrain.fermer());

  async function chargerBalises(signal) {
    const stations = await source.charger(signal);
    if (signal.aborted) return;
    statistiques = couche.definir(stations, source);
    manquants = stations.manquants ?? [];
    dateEnregistree = stations.dateEnregistree ?? null;
    ficheTerrain.actualiser();
    donneesDejaChargees = true;
    majVisibilite();
    onDonnees();
  }

  function messageReussite(heure) {
    const sites = sitesVisibles && nombreSites ? t('para.sites', { n: nombreSites }) : '';
    if (!balisesVisibles) {
      if (terrainsEnregistres) return t('para.hors-ligne-terrains', { date: dateLisible(terrainsEnregistres) });
      return t('para.maj-sites', { heure, n: nombreSites });
    }
    if (dateEnregistree) return t('para.hors-ligne-releves', { date: dateLisible(dateEnregistree) }) + sites;
    const { recentes, anciennes, horsService } = statistiques;
    return t('para.maj', { heure, recentes: t('para.recentes', { n: recentes }) })
      + (anciennes ? t('para.anciennes', { n: anciennes }) : '')
      + (horsService ? t('para.hs', { n: horsService }) : '.')
      + sites
      + (manquants.length ? t('para.reseau-absent', { reseau: manquants.join(', ') }) : '');
  }

  // Le message garde de quoi se réécrire dans une autre langue
  let dernierSignal = null;
  function signaler(type, construire) {
    dernierSignal = { type, construire };
    onEtat({ type, message: construire() });
  }
  surLangue(() => {
    if (dernierSignal) onEtat({ type: dernierSignal.type, message: dernierSignal.construire() });
  });

  async function actualiser() {
    if (!actif || actualisation) return actualisation;
    const taches = [];
    const requete = new AbortController();
    if (balisesVisibles) taches.push(chargerBalises);
    if (sitesVisibles) taches.push(chargerSites);
    if (!taches.length) {
      signaler('ok', () => t('para.masquees'));
      return undefined;
    }

    controleur = requete;
    const { signal } = requete;
    signaler('chargement', () => t('para.lecture', { source: source.libelle }));

    const encours = (async () => {
      const resultats = await Promise.allSettled(taches.map((tache) => tache(signal)));
      if (!actif || signal.aborted) return;

      const erreurs = resultats
        .filter((resultat) => resultat.status === 'rejected')
        .map((resultat) => resultat.reason);
      const reussites = resultats.length - erreurs.length;
      erreurs.forEach((erreur) => console.warn('Données parapente :', erreur));
      const quand = new Date();
      const heure = () => heureCourte(quand);
      if (reussites > 0) derniereActualisation = Date.now();

      if (erreurs.length === 0) {
        signaler('ok', () => messageReussite(heure()));
      } else if (reussites > 0) {
        signaler('partiel', () => t('para.partielle', { heure: heure() }));
      } else {
        const dejaCharge = donneesDejaChargees;
        const horsLigne = estHorsLigne();
        signaler('erreur', () => (dejaCharge
          ? t('para.actualisation-impossible', { source: source.libelle })
          : horsLigne
            ? t('para.hors-ligne-aucun')
            : t('para.indisponibles', { source: source.libelle })));
      }
    })();
    actualisation = encours;

    try {
      await encours;
    } finally {
      if (actualisation === encours) actualisation = null;
      if (controleur === requete) controleur = null;
    }
    return undefined;
  }

  function relancer() {
    controleur?.abort();
    controleur = null;
    actualisation = null;
    return actualiser();
  }

  // Inutile de relire le réseau pour un onglet que personne ne regarde
  function surVisibilite() {
    if (actif && !document.hidden && Date.now() - derniereActualisation > INTERVALLE_ACTUALISATION) actualiser();
  }

  function demarrer() {
    if (actif) return;
    actif = true;
    actualiser();
    minuteur = setInterval(() => {
      if (!document.hidden) actualiser();
    }, INTERVALLE_ACTUALISATION);
    document.addEventListener('visibilitychange', surVisibilite);
  }

  function arreter() {
    actif = false;
    if (minuteur !== null) clearInterval(minuteur);
    minuteur = null;
    document.removeEventListener('visibilitychange', surVisibilite);
    controleur?.abort();
    controleur = null;
    actualisation = null;
    majVisibilite();
  }

  return {
    actualiser,
    demarrer,
    arreter,
    balisesProches: (limite) => couche.proches(limite),
    centrerSurBalise: (id) => couche.centrerSur(id),
    setBalises(visible) {
      const devientVisible = visible && !balisesVisibles;
      balisesVisibles = visible;
      majVisibilite();
      // Revenir sur l'onglet ne relit pas le réseau si les relevés viennent d'arriver
      if (devientVisible && actif && Date.now() - derniereActualisation > DELAI_RELECTURE) relancer();
    },
    setSites(visible) {
      const devientVisible = visible && !sitesVisibles;
      sitesVisibles = visible;
      majVisibilite();
      if (devientVisible && actif && !terrains.size) relancer();
    },
  };
}
