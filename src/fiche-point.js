// Fiche d'un point quelconque de la carte (appui long, ou clic droit) : terrain, soleil, météo,
// refuge et point d'eau les plus proches. Chargée au premier appui long.
import { terrainAuPoint } from './relief-donnees.js';
import { classePente, plusProche, pointsEau } from './point-calcul.js';
import { interroger } from './overpass.js';
import { codeCardinal } from './vent-calcul.js';
import { creerIconeMeteo, descriptionMeteo } from './meteo-icone.js';
import { dateHorsLigne, estHorsLigne, texteDonneesDu } from './hors-ligne.js';
import { decalageAppareil, heureDuLieu, jourLocal, journeeSoleil, nomDecalage, positionSoleil } from './soleil.js';
import { formatAltitude, formatLongueur, formatTemp, formatVent } from './unites.js';
import { t } from './i18n.js';
import { ecrire } from './reglages.js';

const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const RAYON_REFUGE = 30000;
const RAYON_EAU = 3000;
const DELAI = 20000;
const DELAI_EAU = 30000;
const DELAI_EAU_SERVEUR = 10000;
// Clé lue par Météo › Conditions locales (meteo.js) pour le lieu des prévisions
const CLE_LIEU_METEO = 'meteo-position';

const cardinal = (degres) => t(`cardinal.${codeCardinal(degres)}`);

// Refuges, cabanes et abris : le fichier local, préchargé pour le hors-ligne
let refuges = null;
function chargerRefuges() {
  if (!refuges) {
    refuges = fetch('/data/refuges.json')
      .then((reponse) => {
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        return reponse.json();
      })
      .then((json) =>
        (json.features || []).map((f) => ({
          coordonnees: f.geometry.coordinates,
          nom: f.properties.name || '',
          genre: f.properties.genre,
          ele: parseFloat(f.properties.ele),
        }))
      );
    refuges.catch(() => (refuges = null));
  }
  return refuges;
}

function texteSecondaire(texte) {
  const s = document.createElement('div');
  s.className = 'point-detail';
  s.textContent = texte;
  return s;
}

function principal(...enfants) {
  const p = document.createElement('div');
  p.className = 'point-principal';
  p.append(...enfants);
  return p;
}

function enAttente() {
  const s = document.createElement('span');
  s.className = 'point-attente';
  s.textContent = t('point.chargement');
  return s;
}

function indisponible(texte) {
  const s = document.createElement('span');
  s.className = 'point-indisponible';
  s.textContent = texte;
  return s;
}

export function creerFichePoint({ lng, lat, maj, fermer = () => {} }) {
  const point = [lng, lat];
  const controleur = new AbortController();
  const etat = {
    terrain: 'chargement',
    meteo: estHorsLigne() ? 'hors-ligne' : 'chargement',
    refuge: 'chargement',
    eau: estHorsLigne() ? 'hors-ligne' : 'chargement',
    decalage: null, // fuseau du lieu, donné par Open-Meteo
  };
  // Chaque requête a son délai ; fermer la fiche les annule toutes
  function signalAvecDelai(delai = DELAI) {
    const local = new AbortController();
    const fin = () => local.abort();
    controleur.signal.addEventListener('abort', fin);
    const minuteur = setTimeout(fin, delai);
    return {
      signal: local.signal,
      liberer: () => {
        clearTimeout(minuteur);
        controleur.signal.removeEventListener('abort', fin);
      },
    };
  }
  const poser = (cle, valeur) => {
    if (controleur.signal.aborted) return;
    etat[cle] = valeur;
    maj();
  };

  // Relief : au zoom 13 (cellules de 15 à 20 m dans les Alpes), sinon au 12, toujours présent dans les zones hors ligne
  terrainAuPoint(lng, lat, 13)
    .catch(() => terrainAuPoint(lng, lat, 12))
    .then((terrain) => poser('terrain', terrain))
    .catch(() => poser('terrain', estHorsLigne() ? 'hors-ligne' : 'erreur'));

  chargerRefuges()
    .then((liste) => poser('refuge', plusProche(liste, point, RAYON_REFUGE) || 'aucun'))
    .catch(() => poser('refuge', 'erreur'));

  if (etat.meteo === 'chargement') chargerMeteo();
  if (etat.eau === 'chargement') chargerEau();

  async function chargerMeteo() {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      current: 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'freezing_level_height',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
      forecast_days: '1',
      timezone: 'auto',
    });
    const requete = signalAvecDelai();
    try {
      const reponse = await fetch(`${API_PREVISIONS}?${params}`, { signal: requete.signal });
      if (reponse.status === 429) throw new Error('limite');
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const donnees = await reponse.json();
      if (!donnees.current || !Number.isFinite(donnees.current.temperature_2m)) throw new Error('vide');
      if (Number.isFinite(donnees.utc_offset_seconds)) etat.decalage = Math.round(donnees.utc_offset_seconds / 60);
      poser('meteo', { ...donnees, enregistreeLe: dateHorsLigne(reponse) });
    } catch (e) {
      poser('meteo', e.message === 'limite' ? 'limite' : estHorsLigne() ? 'hors-ligne' : 'erreur');
    } finally {
      requete.liberer();
    }
  }

  async function chargerEau() {
    // Des nœuds seulement : presque toutes les fontaines et sources en sont, et la requête reste légère
    const p = `around:${RAYON_EAU},${lat.toFixed(6)},${lng.toFixed(6)}`;
    const requete =
      `[out:json][timeout:10];(` +
      `node(${p})["amenity"~"^(drinking_water|water_point)$"];` +
      `node(${p})["natural"="spring"];` +
      `node(${p})["man_made"="water_tap"];` +
      `);out tags;`;
    const envoi = signalAvecDelai(DELAI_EAU);
    try {
      const json = await interroger(requete, envoi.signal, { delaiParServeur: DELAI_EAU_SERVEUR });
      poser('eau', plusProche(pointsEau(json.elements), point) || 'aucun');
    } catch (e) {
      console.warn('Points d’eau :', e);
      poser('eau', estHorsLigne() ? 'hors-ligne' : 'erreur');
    } finally {
      envoi.liberer();
    }
  }

  // ---------- Affichage ----------
  function valeurTerrain() {
    const terrain = etat.terrain;
    if (terrain === 'chargement') return enAttente();
    if (typeof terrain === 'string') {
      return indisponible(t(terrain === 'hors-ligne' ? 'point.relief-hors-ligne' : 'point.relief-erreur'));
    }
    const classe = classePente(terrain.pente);
    const pastille = document.createElement('span');
    pastille.className = `point-pente${classe ? ` point-pente-${classe}` : ''}`;
    pastille.textContent = `${Math.round(terrain.pente)}°`;
    const orientation = terrain.orientation === null
      ? t('point.plat')
      : t('point.versant', { direction: cardinal(terrain.orientation) });
    const pente = document.createElement('div');
    pente.append(
      principal(pastille, document.createTextNode(orientation)),
      texteSecondaire(t('point.pente-mesure', { distance: formatLongueur(terrain.fenetre) }))
    );
    return pente;
  }

  function valeurSoleil() {
    const decalage = etat.decalage ?? decalageAppareil();
    const maintenant = new Date();
    const journee = journeeSoleil(jourLocal(maintenant, decalage), lat, lng, decalage);
    const heure = (date) => heureDuLieu(date, decalage);
    const bloc = document.createElement('div');
    if (journee.regime === 'jour-polaire') bloc.append(principal(document.createTextNode(t('soleil.jour-polaire'))));
    else if (journee.regime === 'nuit-polaire') bloc.append(principal(document.createTextNode(t('soleil.nuit-polaire'))));
    else bloc.append(principal(document.createTextNode(t('point.lever-coucher', { lever: heure(journee.lever), coucher: heure(journee.coucher) }))));

    const { hauteur, azimut } = positionSoleil(maintenant, lat, lng);
    const position = hauteur > 0
      ? t('point.soleil-haut', { hauteur: Math.round(hauteur), direction: cardinal(azimut) })
      : t('point.soleil-couche');
    const details = [position];
    if (journee.crepuscule && journee.regime === 'normal') details.push(t('point.crepuscule', { heure: heure(journee.crepuscule) }));
    bloc.append(texteSecondaire(details.join(' · ')));
    if (etat.decalage === null || etat.decalage !== decalageAppareil(maintenant)) {
      bloc.append(texteSecondaire(etat.decalage === null
        ? t('soleil.fuseau-appareil', { fuseau: nomDecalage(decalage) })
        : t('point.fuseau-lieu', { fuseau: nomDecalage(decalage) })));
    }
    return bloc;
  }

  function valeurMeteo() {
    const meteo = etat.meteo;
    if (meteo === 'chargement') return enAttente();
    if (meteo === 'hors-ligne') return indisponible(t('point.internet-requis'));
    if (meteo === 'limite') return indisponible(t('point.meteo-limite'));
    if (typeof meteo === 'string') return indisponible(t('point.meteo-erreur'));
    const actuel = meteo.current;
    const jour = meteo.daily || {};
    const bloc = document.createElement('div');
    const icone = creerIconeMeteo(actuel.weather_code);
    bloc.append(principal(icone, document.createTextNode(`${formatTemp(actuel.temperature_2m)} · ${descriptionMeteo(actuel.weather_code)}`)));
    const details = [];
    const min = jour.temperature_2m_min?.[0];
    const max = jour.temperature_2m_max?.[0];
    if (Number.isFinite(min) && Number.isFinite(max)) {
      details.push(t('point.min-max', { min: formatTemp(min, { court: true }), max: formatTemp(max, { court: true }) }));
    }
    const pluie = jour.precipitation_probability_max?.[0];
    if (Number.isFinite(pluie)) details.push(t('point.pluie', { valeur: pluie }));
    if (details.length) bloc.append(texteSecondaire(details.join(' · ')));
    if (Number.isFinite(actuel.wind_speed_10m)) {
      bloc.append(texteSecondaire(t('point.vent', {
        direction: Number.isFinite(actuel.wind_direction_10m) ? cardinal(actuel.wind_direction_10m) : '—',
        vitesse: formatVent(actuel.wind_speed_10m),
        rafales: Number.isFinite(actuel.wind_gusts_10m) ? formatVent(actuel.wind_gusts_10m) : '—',
      })));
    }
    const montagne = [];
    const iso = isotherme(meteo);
    if (Number.isFinite(iso)) montagne.push(t('point.isotherme', { altitude: formatAltitude(iso, { pas: 50 }) }));
    const uv = jour.uv_index_max?.[0];
    if (Number.isFinite(uv)) montagne.push(t('point.uv', { valeur: Math.round(uv) }));
    if (montagne.length) bloc.append(texteSecondaire(montagne.join(' · ')));
    if (meteo.enregistreeLe) bloc.append(texteSecondaire(texteDonneesDu(meteo.enregistreeLe)));
    return bloc;
  }

  // Isotherme 0 °C de l'heure en cours
  function isotherme(meteo) {
    const heures = meteo.hourly?.time || [];
    const valeurs = meteo.hourly?.freezing_level_height || [];
    const heure = typeof meteo.current?.time === 'string' ? `${meteo.current.time.slice(0, 13)}:00` : null;
    const index = heure ? heures.indexOf(heure) : -1;
    return index >= 0 ? valeurs[index] : undefined;
  }

  // Raccourci vers Météo › Conditions locales, sur ce point
  function boutonPrevisions() {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'point-raccourci';
    bouton.textContent = t('point.previsions');
    bouton.addEventListener('click', () => {
      const lieu = { longitude: lng, latitude: lat };
      ecrire(CLE_LIEU_METEO, lieu);
      window.dispatchEvent(new CustomEvent('montis:meteo-ici', { detail: lieu }));
      window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'meteo', module: 'meteo-locale' } }));
      fermer();
    });
    return bouton;
  }

  function meteoAvecRaccourci() {
    const bloc = document.createElement('div');
    bloc.append(valeurMeteo(), boutonPrevisions());
    return bloc;
  }

  const loin = (objet) =>
    t('point.distance', { distance: formatLongueur(objet.distance), direction: cardinal(objet.cap) });

  function valeurRefuge() {
    const refuge = etat.refuge;
    if (refuge === 'chargement') return enAttente();
    if (refuge === 'aucun') return indisponible(t('point.aucun-refuge', { distance: formatLongueur(RAYON_REFUGE) }));
    if (typeof refuge === 'string') return indisponible(t('point.refuges-erreur'));
    const bloc = document.createElement('div');
    const nom = refuge.nom || t(refuge.genre === 'libre' ? 'fiche.cabane' : 'fiche.refuge');
    bloc.append(principal(document.createTextNode(nom)));
    const details = [loin(refuge)];
    if (Number.isFinite(refuge.ele)) details.push(formatAltitude(refuge.ele));
    if (refuge.nom) details.push(t(refuge.genre === 'libre' ? 'point.type-cabane' : 'point.type-refuge'));
    bloc.append(texteSecondaire(details.join(' · ')));
    return bloc;
  }

  function valeurEau() {
    const eau = etat.eau;
    if (eau === 'chargement') return enAttente();
    if (eau === 'hors-ligne') return indisponible(t('point.internet-requis'));
    if (eau === 'aucun') return indisponible(t('point.aucune-eau', { distance: formatLongueur(RAYON_EAU) }));
    if (typeof eau === 'string') {
      const bloc = document.createElement('div');
      const reessayer = document.createElement('button');
      reessayer.type = 'button';
      reessayer.className = 'point-raccourci';
      reessayer.textContent = t('point.reessayer');
      reessayer.addEventListener('click', () => {
        poser('eau', 'chargement');
        chargerEau();
      });
      bloc.append(indisponible(t('point.eau-erreur')), reessayer);
      return bloc;
    }
    const bloc = document.createElement('div');
    bloc.append(principal(document.createTextNode(eau.nom || t(`point.eau-${eau.genre}`))));
    const details = [loin(eau)];
    if (eau.nom) details.push(t(`point.eau-${eau.genre}`));
    if (eau.genre === 'source' || eau.genre === 'inconnue') details.push(t('point.eau-a-traiter'));
    bloc.append(texteSecondaire(details.join(' · ')));
    return bloc;
  }

  return {
    pin: 'recherche',
    titre: () => t('point.titre'),
    // L'altitude, en tête : c'est la donnée qu'on cherche le plus souvent
    sousTitre: () => {
      if (etat.terrain === 'chargement') return t('point.chargement');
      if (typeof etat.terrain === 'string') return '';
      return t('point.altitude', { altitude: formatAltitude(etat.terrain.altitude) });
    },
    rendre(corps, ligne) {
      corps.append(
        ligne(t('point.pente'), valeurTerrain()),
        ligne(t('soleil.titre'), valeurSoleil()),
        ligne(t('point.meteo'), meteoAvecRaccourci()),
        ligne(t('point.refuge'), valeurRefuge()),
        ligne(t('point.eau'), valeurEau())
      );
      const prudence = document.createElement('div');
      prudence.className = 'point-prudence';
      prudence.textContent = t('prudence.courte');
      corps.append(prudence);
    },
    arreter: () => controleur.abort(),
  };
}
