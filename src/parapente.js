import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { FFVL_ACTIVE, SOURCES_BALISES, chargerFFVL } from './balises-sources.js';
import { creerCoucheBalises } from './balises-couche.js';
import { dateLisible, estHorsLigne } from './hors-ligne.js';
import { formatAltitude } from './unites.js';
import { heureCourte, t } from './i18n.js';

const URL_SITES = '/ffvl/json/sites.json';
const INTERVALLE_ACTUALISATION = 5 * 60 * 1000;
const DELAI_RELECTURE = 60 * 1000;

const nombre = (valeur) =>
  valeur == null || String(valeur).trim() === '' ? Number.NaN : Number(valeur);

const sansAccent = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sitesEnGeoJSON(sites) {
  const features = [];
  for (const site of sites) {
    if (!site || typeof site !== 'object') continue;
    const pratiques = typeof site.pratiques === 'string' ? site.pratiques.split(';') : [];
    if (!pratiques.some((pratique) => sansAccent(pratique.trim()) === 'parapente')) continue;
    const type = sansAccent(site.site_sous_type);
    const genre = type.includes('atterr') ? 'atterrissage' : type.includes('decol') ? 'decollage' : null;
    const lat = nombre(site.lat);
    const lon = nombre(site.lon);
    if (
      !genre ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180
    ) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        genre,
        nom: site.nom,
        sous_nom: site.sous_nom,
        alt: site.alt,
        orientation: site.orientation,
        vent_favo: site.vent_favo,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function initParapente(map, { onEtat = () => {}, onDonnees = () => {}, peutOuvrirBalise, onRetourFiche } = {}) {
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
  let source = SOURCES_BALISES.find(({ id }) => id === lire('balises-source', '')) ?? SOURCES_BALISES[0];
  const couchesSites = ['decollages', 'atterrissages', 'sites-noms'];
  const couche = creerCoucheBalises(map, { peutOuvrir: peutOuvrirBalise, onRetourFiche });

  function majVisibilite() {
    couchesSites.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', sitesVisibles ? 'visible' : 'none');
      }
    });
    couche.definirVisible(balisesVisibles);
  }

  function assurerCouchesSites(geojson) {
    if (!map.getSource('sites')) {
      map.addSource('sites', { type: 'geojson', data: geojson });
    } else {
      map.getSource('sites').setData(geojson);
    }

    const rayon = ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8];
    for (const [id, genre, couleur] of [
      ['decollages', 'decollage', '#2e9e4f'],
      ['atterrissages', 'atterrissage', '#1f6fd1'],
    ]) {
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'circle',
          source: 'sites',
          filter: ['==', ['get', 'genre'], genre],
          paint: {
            'circle-radius': rayon,
            'circle-color': couleur,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
          },
        });
        map.on('click', id, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const properties = feature.properties;
          const titre = t(id === 'decollages' ? 'para.decollage' : 'para.atterrissage');
          new maplibregl.Popup({ offset: 10 })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(
              `<strong>${esc(properties.nom)}</strong><br>${esc(titre)}` +
                (properties.sous_nom ? ` – ${esc(properties.sous_nom)}` : '') +
                `<br>${esc(t('para.altitude', { valeur: formatAltitude(Number(properties.alt)) }))}` +
                (properties.orientation ? `<br>${esc(t('para.orientation', { valeur: properties.orientation }))}` : '') +
                (properties.vent_favo ? `<br>${esc(t('para.vent-favorable', { valeur: properties.vent_favo }))}` : '')
            )
            .addTo(map);
        });
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    }

    if (!map.getLayer('sites-noms')) {
      map.addLayer({
        id: 'sites-noms',
        type: 'symbol',
        source: 'sites',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'nom'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
        },
        paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
    }
    nombreSites = geojson.features.length;
    donneesDejaChargees = true;
    majVisibilite();
    onDonnees();
  }

  async function chargerSites(signal) {
    const sites = await chargerFFVL(URL_SITES, signal);
    if (signal.aborted) return;
    assurerCouchesSites(sitesEnGeoJSON(sites));
  }

  async function chargerBalises(signal) {
    const sourceDemandee = source;
    const stations = await sourceDemandee.charger(signal);
    if (signal.aborted || sourceDemandee !== source) return;
    statistiques = couche.definir(stations, sourceDemandee);
    dateEnregistree = stations.dateEnregistree ?? null;
    donneesDejaChargees = true;
    majVisibilite();
    onDonnees();
  }

  function messageReussite(heure) {
    if (!balisesVisibles) return t('para.maj-sites', { heure, n: nombreSites });
    if (dateEnregistree) return t('para.hors-ligne-releves', { date: dateLisible(dateEnregistree) });
    const { recentes, anciennes, horsService } = statistiques;
    return t('para.maj', { heure, recentes: t('para.recentes', { n: recentes }) })
      + (anciennes ? t('para.anciennes', { n: anciennes }) : '')
      + (horsService ? t('para.hs', { n: horsService }) : '.')
      + (FFVL_ACTIVE ? t('para.sites', { n: nombreSites }) : '');
  }

  async function actualiser() {
    if (!actif || actualisation) return actualisation;
    const taches = [];
    const requete = new AbortController();
    if (balisesVisibles) taches.push(chargerBalises);
    if (FFVL_ACTIVE && sitesVisibles) taches.push(chargerSites);
    if (!taches.length) {
      onEtat({ type: 'ok', message: t('para.masquees') });
      return undefined;
    }

    controleur = requete;
    const { signal } = requete;
    onEtat({ type: 'chargement', message: t('para.lecture', { source: source.libelle }) });

    const encours = (async () => {
      const resultats = await Promise.allSettled(taches.map((tache) => tache(signal)));
      if (!actif || signal.aborted) return;

      const erreurs = resultats
        .filter((resultat) => resultat.status === 'rejected')
        .map((resultat) => resultat.reason);
      const reussites = resultats.length - erreurs.length;
      erreurs.forEach((erreur) => console.warn('Données parapente :', erreur));
      const heure = heureCourte(new Date());
      if (reussites > 0) derniereActualisation = Date.now();

      if (erreurs.length === 0) {
        onEtat({ type: 'ok', message: messageReussite(heure) });
      } else if (reussites > 0) {
        onEtat({ type: 'partiel', message: t('para.partielle', { heure }) });
      } else if (erreurs.some((erreur) => erreur.code === 'acces')) {
        onEtat({
          type: 'acces',
          message: donneesDejaChargees
            ? t('para.ffvl-refuse')
            : t('para.ffvl-cle'),
        });
      } else {
        onEtat({
          type: 'erreur',
          message: donneesDejaChargees
            ? t('para.actualisation-impossible', { source: source.libelle })
            : estHorsLigne()
              ? t('para.hors-ligne-aucun')
              : t('para.indisponibles', { source: source.libelle }),
        });
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
    get sourceActive() {
      return source;
    },
    choisirSource(id) {
      const choix = SOURCES_BALISES.find((candidate) => candidate.id === id);
      if (!choix || choix === source) return;
      source = choix;
      ecrire('balises-source', id);
      donneesDejaChargees = false;
      relancer();
    },
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
      sitesVisibles = visible;
      majVisibilite();
    },
  };
}
