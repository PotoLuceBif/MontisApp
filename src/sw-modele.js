// Service worker de Montis. Ce fichier n'est pas importé par l'application : vite.config.js
// y inscrit la version et la liste des fichiers, puis le publie sous le nom /sw.js.
const VERSION = '__VERSION__';
const FICHIERS = __FICHIERS__;

const CACHE_APP = `montis-app-${VERSION}`;
const CACHE_ZONES = 'montis-zones'; // zones téléchargées : jamais élaguées
const CACHE_TUILES = 'montis-tuiles'; // tuiles vues récemment
const CACHE_DONNEES = 'montis-donnees'; // dernières réponses des services
const MAX_TUILES = 1500;
const MAX_DONNEES = 80;
const DELAI_PAGE = 4000; // ms avant d'ouvrir la version enregistrée de l'application
const DELAI_DONNEES = 8000; // ms avant de préférer les données enregistrées, s'il y en a
const PRESERVES = [CACHE_APP, CACHE_ZONES, CACHE_TUILES, CACHE_DONNEES];
const EN_TETE_DATE = 'x-montis-date';

const TUILES = /tiles\.openfreemap\.org\/planet\/.+\.pbf|s3\.amazonaws\.com\/elevation-tiles-prod\/|demotiles\.maplibre\.org\/font\/|tile\.openstreetmap\.org\/|tile\.opentopomap\.org\/|data\.geopf\.fr\/wmts|geoservices\.brgm\.fr\/geologie\?.*REQUEST=GetMap|server\.arcgisonline\.com\/|tile\.waymarkedtrails\.org\/|sgx\.geodatenzentrum\.de\/wmts_topplus_open\/|tile-cyclosm\.openstreetmap\.fr\/|wmts\.geo\.admin\.ch\/|mapsneu\.wien\.gv\.at\/basemap\/|www\.ign\.es\/wmts\/|geoserveis\.icgc\.cat\/|cache\.kartverket\.no\/|cartoweb\.wmts\.ngi\.be\/|basemap\.nationalmap\.gov\/|maps\.geogratis\.gc\.ca\/wms\/|cyberjapandata\.gsi\.go\.jp\//;
const DONNEES = /api\.open-meteo\.com\/|api\.pioupiou\.fr\/|www\.data\.gouv\.fr\/api\/1\/datasets\/r\/|(?:hiking|mtb|cycling)\.waymarkedtrails\.org\/api\/|static\.avalanche\.report\//;
const DESCRIPTION_FOND = 'https://tiles.openfreemap.org/planet';

let compteurTuiles = 0;
let donneesServiesDepuisLeCache = false;

// À garder identique à cleTuile() dans zones-hors-ligne.js. La version du fond change chaque
// semaine : sans ce nettoyage, les zones téléchargées ne seraient plus retrouvées.
function cleTuile(adresse) {
  const url = new URL(adresse);
  if (url.hostname === 'tiles.openfreemap.org') {
    return `${url.origin}${url.pathname.replace(/^\/planet\/[^/]+\//, '/planet/')}`;
  }
  if (url.hostname === 'demotiles.maplibre.org') return decodeURIComponent(url.href);
  return url.href;
}

// L'historique d'une balise demande « depuis 24 h » : l'heure change, pas la question
function cleDonnees(adresse) {
  const url = new URL(adresse);
  if (url.hostname === 'api.pioupiou.fr') url.searchParams.delete('start');
  return url.href;
}

async function prevenir(message) {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage(message));
}

async function elaguer(nom, maximum) {
  const cache = await caches.open(nom);
  const cles = await cache.keys();
  await Promise.all(cles.slice(0, Math.max(0, cles.length - maximum)).map((cle) => cache.delete(cle)));
}

async function serviePage(requete) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_PAGE);
  try {
    const reponse = await fetch(requete, { signal: controleur.signal });
    // Une passerelle en panne répond une erreur plutôt que d'échouer : même remède
    if (reponse.status < 500) return reponse;
    return (await caches.match('/index.html', { cacheName: CACHE_APP, ignoreVary: true })) || reponse;
  } catch {
    return (await caches.match('/index.html', { cacheName: CACHE_APP, ignoreVary: true })) || Response.error();
  } finally {
    clearTimeout(minuteur);
  }
}

// ignoreVary : les scripts sont demandés avec un en-tête Origin que le cache n'a pas enregistré
async function servieFichier(requete) {
  return (await caches.match(requete, { cacheName: CACHE_APP, ignoreSearch: true, ignoreVary: true })) || fetch(requete);
}

async function servieTuile(requete) {
  const cle = cleTuile(requete.url);
  const zone = await (await caches.open(CACHE_ZONES)).match(cle, { ignoreVary: true });
  if (zone) return zone;
  const cache = await caches.open(CACHE_TUILES);
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) {
      await cache.put(cle, reponse.clone());
      compteurTuiles += 1;
      if (compteurTuiles % 100 === 0) void elaguer(CACHE_TUILES, MAX_TUILES);
    } else if (reponse.status >= 500) {
      return (await cache.match(cle, { ignoreVary: true })) || reponse;
    }
    return reponse;
  } catch {
    return (await cache.match(cle, { ignoreVary: true })) || new Response(null, { status: 504 });
  }
}

async function enregistrerDonnees(cache, cle, reponse) {
  const corps = await reponse.clone().arrayBuffer();
  await cache.put(cle, new Response(corps, {
    status: reponse.status,
    headers: {
      'content-type': reponse.headers.get('content-type') || 'application/json',
      [EN_TETE_DATE]: String(Date.now()),
      // Sans cela, le navigateur cache cet en-tête à l'application (requêtes entre domaines)
      'access-control-allow-origin': '*',
      'access-control-expose-headers': EN_TETE_DATE,
    },
  }));
  void elaguer(CACHE_DONNEES, MAX_DONNEES);
}

async function servieDonnees(requete, signaler) {
  const cache = await caches.open(CACHE_DONNEES);
  const cle = cleDonnees(requete.url);
  const depuisLeCache = async () => {
    const enregistree = await cache.match(cle, { ignoreVary: true });
    if (enregistree && signaler) {
      donneesServiesDepuisLeCache = true;
      void prevenir({ type: 'donnees-enregistrees', date: Number(enregistree.headers.get(EN_TETE_DATE)) });
    }
    return enregistree;
  };
  // Toujours le vrai réseau : le cache HTTP ferait passer une ancienne réponse pour une fraîche
  const reseau = fetch(new Request(requete, { cache: 'no-store' })).then(async (reponse) => {
    if (reponse.status >= 500) return (await depuisLeCache()) || reponse;
    if (reponse.ok) await enregistrerDonnees(cache, cle, reponse);
    if (donneesServiesDepuisLeCache) {
      donneesServiesDepuisLeCache = false;
      void prevenir({ type: 'reseau-retabli' });
    }
    return reponse;
  });
  const delai = new Promise((resoudre) => {
    setTimeout(() => resoudre('delai'), DELAI_DONNEES);
  });
  try {
    const premier = await Promise.race([reseau, delai]);
    if (premier !== 'delai') return premier;
    // Réseau de montagne : mieux vaut des données datées qu'une attente sans fin
    return (await depuisLeCache()) || (await reseau);
  } catch (erreur) {
    const enregistree = await depuisLeCache();
    if (enregistree) return enregistree;
    throw erreur;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await cache.addAll(FICHIERS);
    // Sans cette description, la carte ne démarrerait pas sans réseau
    try {
      const fond = await fetch(DESCRIPTION_FOND);
      if (fond.ok) await enregistrerDonnees(await caches.open(CACHE_DONNEES), DESCRIPTION_FOND, fond);
    } catch {
      /* elle sera enregistrée à la prochaine ouverture */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((nom) => nom.startsWith('montis-') && !PRESERVES.includes(nom)).map((nom) => caches.delete(nom)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request: requete } = event;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    if (requete.mode === 'navigate') event.respondWith(serviePage(requete));
    else if (/^\/data\/(pistes|bike-parks|avalanches)\//.test(url.pathname)) event.respondWith(servieDonnees(requete, false));
    else if (FICHIERS.includes(url.pathname)) event.respondWith(servieFichier(requete));
    return;
  }
  // `cache: 'reload'` : le téléchargement d'une zone range lui-même ses tuiles
  if (TUILES.test(requete.url)) {
    if (requete.cache !== 'reload') event.respondWith(servieTuile(requete));
    return;
  }
  if (requete.url === DESCRIPTION_FOND) event.respondWith(servieDonnees(requete, false));
  else if (DONNEES.test(requete.url)) event.respondWith(servieDonnees(requete, true));
});
