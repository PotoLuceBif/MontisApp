// Ce que Montis garde sur l'appareil, pour la page Paramètres : mesure par type, vidage du
// cache et option « Wi-Fi uniquement ». Les caches sont ceux de sw-modele.js et de
// zones-hors-ligne.js : on les lit, on ne les recrée pas.
import { lire, ecrire } from './reglages.js';
import { listerZones } from './zones-hors-ligne.js';

const CACHE_ZONES = 'montis-zones';
const CACHE_TUILES = 'montis-tuiles';
const CACHE_DONNEES = 'montis-donnees';
const PREFIXE_APP = 'montis-app-';
const METEO = /api\.open-meteo\.com|api\.pioupiou\.fr|static\.avalanche\.report/;
const CLES_PARCOURS = ['montis.rando-parcours', 'montis.velo-parcours', 'montis.rando-brouillon', 'montis.velo-brouillon'];

// ---------- Wi-Fi uniquement ----------
// Seul Chrome sur Android dit le type de connexion ; Safari (iPhone) et Firefox ne le disent pas
export const wifiDetectable = () => typeof navigator.connection?.type === 'string';
export const wifiUniquement = () => lire('hl-wifi-seul', false) === true;
export function definirWifiUniquement(oui) {
  ecrire('hl-wifi-seul', Boolean(oui));
  window.dispatchEvent(new Event('wifi-seul-change'));
}

// Vrai quand l'option est active et que l'appareil dit ne pas être en Wi-Fi (ou câble)
export function telechargementBloque() {
  if (!wifiUniquement() || !wifiDetectable()) return false;
  return !['wifi', 'ethernet', 'none', 'unknown'].includes(navigator.connection.type);
}

// ---------- Mesure de l'espace ----------
async function tailleCache(nom, garder = () => true) {
  if (!('caches' in window) || !(await caches.has(nom))) return 0;
  const cache = await caches.open(nom);
  let total = 0;
  for (const requete of await cache.keys()) {
    if (!garder(requete.url)) continue;
    const reponse = await cache.match(requete);
    const longueur = Number(reponse?.headers.get('content-length'));
    total += Number.isFinite(longueur) && longueur > 0 ? longueur : (await reponse.blob()).size;
  }
  return total;
}

const tailleTexte = (texte) => (texte ? new Blob([texte]).size : 0);

export async function mesurerStockage() {
  const estimation = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const noms = 'caches' in window ? await caches.keys() : [];
  const app = (await Promise.all(noms.filter((nom) => nom.startsWith(PREFIXE_APP)).map((nom) => tailleCache(nom)))).reduce((a, b) => a + b, 0);
  const [zones, tuiles, meteo, autres] = await Promise.all([
    tailleCache(CACHE_ZONES),
    tailleCache(CACHE_TUILES),
    tailleCache(CACHE_DONNEES, (url) => METEO.test(url)),
    tailleCache(CACHE_DONNEES, (url) => !METEO.test(url)),
  ]);
  let parcours = 0;
  try {
    CLES_PARCOURS.forEach((cle) => {
      parcours += tailleTexte(localStorage.getItem(cle));
    });
  } catch {
    /* stockage illisible : on compte zéro */
  }
  const nombreParcours = ['montis.rando-parcours', 'montis.velo-parcours'].reduce((total, cle) => {
    try {
      const liste = JSON.parse(localStorage.getItem(cle));
      return total + (Array.isArray(liste) ? liste.length : 0);
    } catch {
      return total;
    }
  }, 0);
  const somme = zones + tuiles + meteo + autres + parcours + app;
  return {
    // L'estimation du navigateur compte aussi ses propres marges : elle peut dépasser la somme
    total: Math.max(estimation.usage ?? 0, somme),
    quota: estimation.quota ?? 0,
    cartes: zones + tuiles,
    zones,
    tuiles,
    meteo,
    autres,
    parcours,
    nombreParcours,
    nombreZones: listerZones().length,
    app,
  };
}

// Vide ce qui se reconstitue en naviguant : tuiles vues et réponses des services.
// Les zones téléchargées, les parcours et l'application elle-même sont conservés.
export async function viderCache() {
  if (!('caches' in window)) return;
  await Promise.all([CACHE_TUILES, CACHE_DONNEES].map((nom) => caches.delete(nom)));
}
