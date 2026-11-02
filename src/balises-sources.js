import { dateEtHeure, t } from './i18n.js';
import { dateHorsLigne } from './hors-ligne.js';

// Sources de relevés de vent. Chaque source renvoie les mêmes stations :
// { id, nom, description, lat, lon, altitude, eteinte, moyenne, rafale, minimum, direction, date, lien }
// `direction` : d'où vient le vent, en degrés. `date` : horodatage en millisecondes.
//
// Une seule source à la fois : la licence d'OpenWindMap interdit de mêler ses mesures
// à celles de capteurs dont les données ne sont pas ouvertes.

// FFVL : à passer à 1 (VITE_FFVL=1) une fois la clé obtenue. La clé ne doit pas arriver
// dans le navigateur : `/ffvl` doit pointer vers un relais serveur qui l'ajoute.
export const FFVL_ACTIVE = import.meta.env.VITE_FFVL === '1';

const URL_OPENWINDMAP = 'https://api.pioupiou.fr/v1/live-with-meta/all';
const URL_ARCHIVE_OPENWINDMAP = 'https://api.pioupiou.fr/v1/archive/';
const URL_BALISES_FFVL = '/ffvl/json/balises.json';
const URL_RELEVES_FFVL = '/ffvl/json/relevesmeteo.json';
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

const nombre = (valeur) =>
  valeur == null || String(valeur).trim() === '' ? Number.NaN : Number(valeur);

// Sans mesure, une balise reste affichée comme hors service : seule sa position est indispensable
function stationValide(station) {
  return station.lat >= -90 && station.lat <= 90
    && station.lon >= -180 && station.lon <= 180;
}

async function lireJson(url, signal) {
  const reponse = await fetch(url, { signal, cache: 'no-store' });
  if (reponse.status === 429) throw new Error(t('balises.trop-requetes'));
  if (!reponse.ok) throw new Error(t('commun.statut-http', { statut: reponse.status }));
  return { ...(await reponse.json()), dateEnregistree: dateHorsLigne(reponse) };
}

function erreurFFVL(message, code) {
  const erreur = new Error(message);
  erreur.code = code;
  return erreur;
}

export async function chargerFFVL(url, signal) {
  const rep = await fetch(url, { signal, cache: 'no-store' });
  const texte = await rep.text();
  if (
    rep.status === 401 ||
    rep.status === 403 ||
    /available using an ffvl api key|clé api|api key/i.test(texte)
  ) {
    throw erreurFFVL(t('balises.ffvl-cle'), 'acces');
  }
  if (!rep.ok) throw new Error(`${url} : erreur HTTP ${rep.status} – ${texte.slice(0, 200)}`);

  let donnees;
  try {
    donnees = JSON.parse(texte);
  } catch {
    throw new Error(`${url} : réponse non JSON : ${texte.slice(0, 200)}`);
  }

  if (Array.isArray(donnees)) return donnees;
  if (donnees && typeof donnees === 'object') return Object.values(donnees);
  throw new Error(`${url} : format de données FFVL inattendu.`);
}

const OPENWINDMAP = {
  id: 'openwindmap',
  libelle: 'OpenWindMap',
  lien: 'https://www.openwindmap.org',
  attribution: 'Vent © <a href="https://www.openwindmap.org" target="_blank" rel="noopener noreferrer">contributeurs OpenWindMap</a>',
  async charger(signal) {
    const { data, dateEnregistree } = await lireJson(URL_OPENWINDMAP, signal);
    if (!Array.isArray(data)) throw new Error('Format de données OpenWindMap inattendu.');
    const stations = data
      .filter((brut) => brut?.location?.success !== false && brut?.location?.latitude != null)
      .map((brut) => ({
        id: String(brut.id),
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
    const { data } = await lireJson(url, signal);
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

const FFVL = {
  id: 'ffvl',
  libelle: 'FFVL',
  lien: 'https://federation.ffvl.fr/pages/opendata',
  attribution: 'Vent © <a href="https://federation.ffvl.fr/pages/opendata" target="_blank" rel="noopener noreferrer">FFVL</a>',
  async charger(signal) {
    const [balises, releves] = await Promise.all([
      chargerFFVL(URL_BALISES_FFVL, signal),
      chargerFFVL(URL_RELEVES_FFVL, signal),
    ]);
    const parId = new Map(
      releves
        .filter((releve) => releve && typeof releve === 'object' && releve.idbalise != null)
        .map((releve) => [String(releve.idbalise), releve])
    );
    return balises
      .filter((balise) => balise && typeof balise === 'object' && parId.has(String(balise.idBalise)))
      .map((balise) => {
        const releve = parId.get(String(balise.idBalise));
        return {
          id: String(balise.idBalise),
          nom: balise.nom || t('balises.nom-defaut', { id: balise.idBalise }),
          description: '',
          lat: nombre(balise.latitude),
          lon: nombre(balise.longitude),
          altitude: nombre(balise.altitude),
          eteinte: false,
          moyenne: nombre(releve.vitesseVentMoy),
          rafale: nombre(releve.vitesseVentMax),
          minimum: nombre(releve.vitesseVentMin),
          direction: nombre(releve.directVentMoy),
          date: new Date(String(releve.date ?? '').replace(' ', 'T')).getTime(),
          lien: '',
        };
      })
      .filter(stationValide);
  },
};

export const SOURCES_BALISES = FFVL_ACTIVE ? [OPENWINDMAP, FFVL] : [OPENWINDMAP];
