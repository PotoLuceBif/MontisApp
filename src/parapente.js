import { BALISES, URL_TERRAINS_FFVL, lireJson } from './balises-sources.js';
import { creerCoucheBalises } from './balises-couche.js';
import { creerFicheTerrain } from './terrain-fiche.js';
import { lireTerrains, terrainsEnGeoJSON } from './terrains-calcul.js';
import { dateLisible, estHorsLigne } from './hors-ligne.js';
import { heureCourte, surLangue, t } from './i18n.js';

const INTERVALLE_ACTUALISATION = 5 * 60 * 1000;
const DELAI_RELECTURE = 60 * 1000;
const DUREE_TERRAINS = 12 * 60 * 60 * 1000; // la FFVL publie ses terrains une fois par jour
const SOURCE_TERRAINS = 'terrains-ffvl';
const COUCHE_TERRAINS = 'terrains-ffvl-points';
const COUCHE_TERRAINS_NOMS = 'terrains-ffvl-noms';
const COUCHES_TERRAINS = [COUCHE_TERRAINS, COUCHE_TERRAINS_NOMS];
const TOLERANCE_CLIC = 12;
const COULEURS_TERRAINS = { decollage: '#2e9e4f', atterrissage: '#1f6fd1', interdit: '#d93a2b' };
const ATTRIBUTION_TERRAINS = 'Terrains © <a href="https://www.data.gouv.fr/fr/organizations/federation-francaise-de-vol-libre/" target="_blank" rel="noopener noreferrer">FFVL</a> (Licence Ouverte)';

export function initParapente(map, { onEtat = () => {}, onDonnees = () => {}, peutOuvrirBalise = () => true, onRetourFiche } = {}) {
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
    onFermer: () => marquerTerrain(null),
    onRetour: onRetourFiche,
    baliseProche: (lon, lat, rayon) => couche.plusProche(lon, lat, rayon),
    ouvrirBalise: (id) => couche.centrerSur(id),
  });

  function majVisibilite() {
    COUCHES_TERRAINS.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sitesVisibles ? 'visible' : 'none');
    });
    if (!sitesVisibles) ficheTerrain.fermer();
    couche.definirVisible(balisesVisibles);
  }

  function marquerTerrain(id) {
    if (map.getLayer(COUCHE_TERRAINS)) {
      map.setPaintProperty(COUCHE_TERRAINS, 'circle-stroke-width', ['case', ['==', ['get', 'id'], id ?? ''], 3.5, 1.5]);
    }
  }

  // Sous les balises : un relevé se lit par-dessus son décollage
  function assurerCouchesTerrains() {
    if (!terrains.size) return;
    const donnees = terrainsEnGeoJSON([...terrains.values()]);
    if (!map.getSource(SOURCE_TERRAINS)) {
      map.addSource(SOURCE_TERRAINS, { type: 'geojson', data: donnees, attribution: ATTRIBUTION_TERRAINS });
    } else {
      map.getSource(SOURCE_TERRAINS).setData(donnees);
    }
    const dessous = ['balises-vent-selection', 'balises-vent-manches', 'balises-vent-pastilles'].find((id) => map.getLayer(id));
    if (!map.getLayer(COUCHE_TERRAINS)) {
      map.addLayer({
        id: COUCHE_TERRAINS,
        type: 'circle',
        source: SOURCE_TERRAINS,
        // Les interdits par-dessus : on doit les voir même en zone dense
        layout: { 'circle-sort-key': ['match', ['get', 'classe'], 'interdit', 2, 'decollage', 1, 0] },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 10, 5.5, 14, 8],
          'circle-color': ['match', ['get', 'classe'], 'interdit', COULEURS_TERRAINS.interdit, 'atterrissage', COULEURS_TERRAINS.atterrissage, COULEURS_TERRAINS.decollage],
          'circle-stroke-color': ['case', ['get', 'autorisation'], '#f0a020', '#ffffff'],
          'circle-stroke-width': 1.5,
        },
      }, dessous);
    }
    if (!map.getLayer(COUCHE_TERRAINS_NOMS)) {
      map.addLayer({
        id: COUCHE_TERRAINS_NOMS,
        type: 'symbol',
        source: SOURCE_TERRAINS,
        minzoom: 12,
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
    const touches = map.queryRenderedFeatures(boite, { layers: [COUCHE_TERRAINS] });
    const plusPres = touches
      .map((feature) => {
        const ecran = map.project(feature.geometry.coordinates);
        return { feature, ecart: Math.hypot(ecran.x - x, ecran.y - y) };
      })
      .sort((a, b) => a.ecart - b.ecart)[0]?.feature;
    const terrain = plusPres && terrains.get(String(plusPres.properties.id));
    if (!terrain) {
      ficheTerrain.fermer();
      return;
    }
    ficheTerrain.ouvrir(terrain);
    marquerTerrain(terrain.id);
  });
  map.on('mousemove', (event) => {
    if (!sitesVisibles || !map.getLayer(COUCHE_TERRAINS)) return;
    if (map.queryRenderedFeatures(event.point, { layers: [COUCHE_TERRAINS] }).length) map.getCanvas().style.cursor = 'pointer';
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
