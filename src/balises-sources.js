import { dateEtHeure, t } from './i18n.js';
import { dateHorsLigne } from './hors-ligne.js';
import { fusionnerReseaux, lireBalisesFFVL, nombre } from './balises-calcul.js';
import { requete as requeteReseau } from './requete.js';

// Sources de relevés de vent, réunies sur la carte. Chaque source renvoie les mêmes stations :
// { id, reseau, nom, description, lat, lon, altitude, eteinte, moyenne, rafale, minimum, direction, date, lien }
// `direction` : d'où vient le vent, en degrés. `date` : horodatage en millisecondes.
//
// La licence d'OpenWindMap n'admet que des capteurs aux données ouvertes à côté des siens :
// c'est le cas de la FFVL (Licence Ouverte 2.0, fichiers publics, mêmes relevés, sans délai).

const URL_OPENWINDMAP = 'https://api.pioupiou.fr/v1/live-with-meta/all';
const URL_ARCHIVE_OPENWINDMAP = 'https://api.pioupiou.fr/v1/archive/';
// Adresses stables de data.gouv.fr : elles redirigent vers le dernier fichier publié
const URL_DATA_GOUV = 'https://www.data.gouv.fr/api/1/datasets/r/';
const URL_BALISES_FFVL = `${URL_DATA_GOUV}8d795154-9145-4ab2-99de-6768a36f31ea`;
const URL_RELEVES_FFVL = `${URL_DATA_GOUV}047b2ab9-627f-4e5f-9d68-5b948433c61d`;
export const URL_TERRAINS_FFVL = `${URL_DATA_GOUV}4375c95d-cf26-4e71-b72d-2e09be5a0e36`;
export const LIEN_FFVL = 'https://www.data.gouv.fr/fr/organizations/federation-francaise-de-vol-libre/';
const DUREE_HISTORIQUE = 24 * 60 * 60 * 1000;
const AGE_ANCIEN = 2 * 60 * 60 * 1000;
const AGE_HORS_SERVICE = 24 * 60 * 60 * 1000;

export const COULEUR_BALISE_INACTIVE = '#9aa3b2';
// actif : relevé récent. ancien : plus rien depuis 2 h. hs : éteinte, muette ou sans mesure de vent.
export function etatStation(station) {
  const age = Date.now() - station.date;
  if (station.eteinte || !Number.isFinite(age) || age > AGE_HORS_SERVICE) return 'hs';
  if (!Number.isFinite(station.moyenne) || !Number.isFinite(station.direction)) return 'hs';
  return age > AGE_ANCIEN ? 'ancien' : 'actif';
}

export function texteAge(date) {
  const minutes = Math.max(0, Math.round((Date.now() - date) / 60000));
  if (minutes < 1) return t('age.instant');
  if (minutes < 60) return t('age.minutes', { n: minutes });
  if (minutes < 48 * 60) return t('age.heures', { n: Math.round(minutes / 60) });
  return t('age.jours', { n: Math.round(minutes / 1440) });
}

export const dateComplete = (date) => t('commun.le-date', { date: dateEtHeure(date) });

// Sans mesure, une balise reste affichée comme hors service : seule sa position est indispensable
function stationValide(station) {
  return station.lat >= -90 && station.lat <= 90
    && station.lon >= -180 && station.lon <= 180;
}

const PAUSE_NOUVEL_ESSAI = 1500;

// Une coupure réseau a droit à une seconde tentative : en montagne, la liaison va et vient
async function recuperer(url, signal, cache) {
  try {
    return await requeteReseau(url, { signal, cache });
  } catch (erreur) {
    if (signal?.aborted || erreur.name === 'AbortError' || erreur.name === 'TimeoutError') throw erreur;
    await new Promise((fin) => setTimeout(fin, PAUSE_NOUVEL_ESSAI));
    if (signal?.aborted) throw erreur;
    return requeteReseau(url, { signal, cache });
  }
}

export async function lireJson(url, signal, { cache = 'no-store' } = {}) {
  const reponse = await recuperer(url, signal, cache);
  if (reponse.status === 429) throw new Error(t('balises.trop-requetes'));
  if (!reponse.ok) throw new Error(t('commun.statut-http', { statut: reponse.status }));
  return { donnees: await reponse.json(), dateEnregistree: dateHorsLigne(reponse) };
}

const OPENWINDMAP = {
  id: 'openwindmap',
  libelle: 'OpenWindMap',
  lien: 'https://www.openwindmap.org',
  attribution: 'Vent © <a href="https://www.openwindmap.org" target="_blank" rel="noopener noreferrer">contributeurs OpenWindMap</a>',
  async charger(signal) {
    const { donnees: { data } = {}, dateEnregistree } = await lireJson(URL_OPENWINDMAP, signal);
    if (!Array.isArray(data)) throw new Error('Format de données OpenWindMap inattendu.');
    const stations = data
      .filter((brut) => brut?.location?.success !== false && brut?.location?.latitude != null)
      .map((brut) => ({
        id: String(brut.id),
        reseau: 'openwindmap',
        nom: brut.meta?.name || t('balises.nom-defaut', { id: brut.id }),
        description: brut.meta?.description?.trim() || '',
        lat: nombre(brut.location?.latitude),
        lon: nombre(brut.location?.longitude),
        altitude: null,
        eteinte: brut.status?.state === 'off',
        moyenne: nombre(brut.measurements?.wind_speed_avg),
        rafale: nombre(brut.measurements?.wind_speed_max),
        minimum: nombre(brut.measurements?.wind_speed_min),
        direction: nombre(brut.measurements?.wind_heading),
        date: new Date(brut.measurements?.date ?? Number.NaN).getTime(),
        lien: `https://www.openwindmap.org/PP${brut.id}`,
      }))
      .filter(stationValide);
    stations.dateEnregistree = dateEnregistree;
    return stations;
  },
  async historique(id, signal) {
    const debut = new Date(Date.now() - DUREE_HISTORIQUE).toISOString();
    const url = `${URL_ARCHIVE_OPENWINDMAP}${encodeURIComponent(id)}?start=${debut}&stop=now&format=json`;
    const { donnees: { data } = {} } = await lireJson(url, signal);
    // Colonnes : temps, latitude, longitude, min, moyenne, max, direction, pression
    return (Array.isArray(data) ? data : [])
      .map((ligne) => ({
        date: new Date(ligne[0]).getTime(),
        minimum: ligne[3],
        moyenne: ligne[4],
        rafale: ligne[5],
        direction: ligne[6],
      }))
      .filter((point) => Number.isFinite(point.date) && Number.isFinite(point.moyenne));
  },
};

const DUREE_LISTE_FFVL = 6 * 60 * 60 * 1000;
let listeFFVL = null;

const FFVL = {
  id: 'ffvl',
  libelle: 'FFVL',
  lien: LIEN_FFVL,
  attribution: 'Balises et terrains © <a href="https://www.data.gouv.fr/fr/organizations/federation-francaise-de-vol-libre/" target="_blank" rel="noopener noreferrer">FFVL</a> (Licence Ouverte)',
  // Pas d'historique ouvert : la FFVL ne publie que le dernier relevé de chaque balise
  historique: null,
  async charger(signal) {
    // La liste des balises change une fois par jour, les relevés toutes les 5 minutes
    const listeAJour = listeFFVL && Date.now() - listeFFVL.recue < DUREE_LISTE_FFVL;
    const [balises, releves] = await Promise.all([
      listeAJour ? listeFFVL.reponse : lireJson(URL_BALISES_FFVL, signal),
      lireJson(URL_RELEVES_FFVL, signal),
    ]);
    if (!listeAJour) listeFFVL = { reponse: balises, recue: Date.now() };
    const stations = lireBalisesFFVL(balises.donnees, releves.donnees, {
      nomDefaut: (id) => t('balises.nom-defaut', { id }),
    });
    stations.dateEnregistree = releves.dateEnregistree;
    return stations;
  },
};

export const RESEAUX = { openwindmap: OPENWINDMAP, ffvl: FFVL };

// Les deux réseaux à la fois. L'échec de l'un n'empêche pas d'afficher l'autre :
// `stations.manquants` nomme les réseaux qui n'ont pas répondu.
export const BALISES = {
  id: 'balises',
  libelle: 'OpenWindMap · FFVL',
  attribution: `${OPENWINDMAP.attribution} · ${FFVL.attribution}`,
  async charger(signal) {
    const [owm, ffvl] = await Promise.allSettled([OPENWINDMAP.charger(signal), FFVL.charger(signal)]);
    if (owm.status === 'rejected' && ffvl.status === 'rejected') throw owm.reason;
    [owm, ffvl].forEach((resultat) => {
      if (resultat.status === 'rejected') console.warn('Balises :', resultat.reason);
    });
    const liste = (resultat) => (resultat.status === 'fulfilled' ? resultat.value : []);
    const stations = fusionnerReseaux(liste(owm), liste(ffvl));
    stations.manquants = [[owm, OPENWINDMAP], [ffvl, FFVL]]
      .filter(([resultat]) => resultat.status === 'rejected')
      .map(([, reseau]) => reseau.libelle);
    const dates = [liste(owm).dateEnregistree, liste(ffvl).dateEnregistree].filter(Boolean);
    stations.dateEnregistree = dates.length ? Math.min(...dates) : null;
    return stations;
  },
};

export const reseauDe = (station) => RESEAUX[station?.reseau] ?? OPENWINDMAP;
