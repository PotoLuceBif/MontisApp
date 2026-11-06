// Fiche d'un point quelconque de la carte (appui long, ou clic droit) : terrain, soleil, météo,
// refuge et point d'eau les plus proches. Chargée au premier appui long.
import { terrainAuPoint } from './relief-donnees.js';
import { classePente, dansPolygone, distanceGeometrie, plusProche, pointsEau, cap } from './point-calcul.js';
import { SOURCE_VECTEUR } from './source-vecteur.js';
import { DECALAGE_PIN, creerPinSeul } from './pins.js';
import { deposer } from './demandes.js';
import { Marker } from 'maplibre-gl';
import { interroger } from './overpass.js';
import { codeCardinal } from './vent-calcul.js';
import { creerIconeMeteo, descriptionMeteo } from './meteo-icone.js';
import { dateHorsLigne, estHorsLigne, texteDonneesDu } from './hors-ligne.js';
import { decalageAppareil, heureDuLieu, jourLocal, journeeSoleil, nomDecalage, positionSoleil } from './soleil.js';
import { formatAltitude, formatLongueur, formatPente, formatTemp, formatVent } from './unites.js';
import { t } from './i18n.js';
import { CHAMPS_FRISE, creerFrise } from './meteo-frise.js';
import { indicesHeures } from './frise-calcul.js';
import { ecrire, lire } from './reglages.js';

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

// Eau visible dans les tuiles du fond Montis (OpenMapTiles) : lacs, cours d'eau, fontaines.
// Ces tuiles sont déjà chargées, et gardées hors ligne : aucune requête de plus.
const CLASSES_PLAN_EAU = ['lake', 'pond', 'river', 'reservoir', 'basin'];
const CLASSES_COURS_EAU = ['stream', 'river', 'canal'];
function eauDansLesTuiles(map, point) {
  if (!map?.getSource(SOURCE_VECTEUR)) return [];
  const lireCouche = (couche, filtre) => {
    try {
      return map.querySourceFeatures(SOURCE_VECTEUR, { sourceLayer: couche }).filter(filtre);
    } catch {
      return [];
    }
  };
  const resultats = [];
  const retenir = (feature, genre, nom = '') => {
    const r = distanceGeometrie(point, feature.geometry);
    if (r && r.distance <= RAYON_EAU) resultats.push({ ...r, genre, nom });
  };
  // Le nom d'un lac est à part : un point, ou une ligne pour un grand lac, posé dans le lac
  const repere = (g) => (g.type === 'Point' ? g.coordinates : g.type === 'LineString' ? g.coordinates[Math.floor(g.coordinates.length / 2)] : null);
  const noms = lireCouche('water_name', (f) => f.properties?.name && repere(f.geometry))
    .map((f) => ({ nom: f.properties.name, coordonnees: repere(f.geometry) }));
  for (const f of lireCouche('water', (f) => CLASSES_PLAN_EAU.includes(f.properties?.class))) {
    const nom = noms.find((n) => dansPolygone(n.coordonnees, f.geometry))?.nom;
    retenir(f, 'lac', nom);
  }
  for (const f of lireCouche('waterway', (f) => CLASSES_COURS_EAU.includes(f.properties?.class))) {
    retenir(f, 'cours', f.properties.name);
  }
  for (const f of lireCouche('poi', (f) => f.properties?.class === 'drinking_water' || f.properties?.subclass === 'drinking_water')) {
    retenir(f, 'potable', f.properties.name);
  }
  return resultats;
}

function indisponible(texte) {
  const s = document.createElement('span');
  s.className = 'point-indisponible';
  s.textContent = texte;
  return s;
}

export function creerFichePoint({ map, lng, lat, maj, fermer = () => {}, cible = null }) {
  const point = [lng, lat];
  const controleur = new AbortController();
  const etat = {
    terrain: 'chargement',
    meteo: estHorsLigne() ? 'hors-ligne' : 'chargement',
    refuge: 'chargement',
    eauTuiles: eauDansLesTuiles(map, point),
    eau: estHorsLigne() ? 'hors-ligne' : 'chargement', // fontaines et sources d'OpenStreetMap (Overpass)
    decalage: null, // fuseau du lieu, donné par Open-Meteo
    cible: null, // 'refuge' ou 'eau' quand l'utilisateur l'a localisé
  };
  let marqueurCible = null;
  // Retour depuis l'éditeur de parcours : la cible reste localisée, une fois la fiche affichée
  if (cible) {
    etat.cible = cible.cle;
    etat.cibleCoordonnees = cible.coordonnees;
    const pin = creerPinSeul('rando', 'selected');
    marqueurCible = new Marker({ element: pin.element, anchor: 'bottom', offset: DECALAGE_PIN }).setLngLat(cible.coordonnees).addTo(map);
    requestAnimationFrame(() => !controleur.signal.aborted && cadrerAvec(cible.coordonnees));
  }
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
      hourly: CHAMPS_FRISE.join(','),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
      // Deux jours : la frise montre les 24 heures qui suivent, même en soirée
      forecast_days: '2',
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
      `);out;`;
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
    pastille.textContent = formatPente(terrain.pente);
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
    bouton.className = 'point-lien';
    bouton.innerHTML = `
      <svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>
      <span></span>
      <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
    bouton.querySelector('span').textContent = t('point.previsions');
    bouton.addEventListener('click', () => {
      const lieu = { longitude: lng, latitude: lat };
      ecrire(CLE_LIEU_METEO, lieu);
      window.dispatchEvent(new CustomEvent('montis:meteo-ici', { detail: lieu }));
      fermer();
      // La croix de Météo ramène à cette fiche
      window.dispatchEvent(new CustomEvent('montis:ouvrir-module', {
        detail: { categorie: 'meteo', module: 'meteo-locale', retour: rouvrirIci },
      }));
    });
    return bouton;
  }

  // Frise des 24 prochaines heures, sous la météo ; gardée d'un rendu à l'autre pour garder l'heure lue
  let frise = null;
  let blocFrise = null;
  function friseMeteo() {
    const meteo = etat.meteo;
    if (!meteo || typeof meteo !== 'object' || !Array.isArray(meteo.hourly?.time) || typeof meteo.current?.time !== 'string') return null;
    if (!frise) {
      frise = creerFrise({ lignes: ['temperature', 'precipitations', 'vent', 'orage'], choix: false });
      blocFrise = document.createElement('section');
      blocFrise.className = 'point-frise';
      const titre = document.createElement('h4');
      blocFrise.append(titre, frise.element);
    }
    blocFrise.querySelector('h4').textContent = t('meteo.24h');
    const altitude = typeof etat.terrain === 'object' && Number.isFinite(etat.terrain?.altitude) ? etat.terrain.altitude : meteo.elevation;
    frise.definir({
      hourly: meteo.hourly,
      rangs: indicesHeures(meteo.hourly.time, `${meteo.current.time.slice(0, 13)}:00`),
      altitude,
      garderHeure: true,
    });
    return blocFrise;
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
    const nom = refuge.nom || t(refuge.genre === 'libre' ? 'point.cabane-sans-nom' : 'point.refuge-sans-nom');
    const details = [loin(refuge)];
    if (Number.isFinite(refuge.ele)) details.push(formatAltitude(refuge.ele));
    if (refuge.nom) details.push(t(refuge.genre === 'libre' ? 'point.type-cabane' : 'point.type-refuge'));
    return cibleTouchable('refuge', { ...refuge, nom }, nom, details);
  }

  // L'eau la plus proche : tuiles du fond et OpenStreetMap réunis
  function eauLaPlusProche() {
    const candidats = [...etat.eauTuiles];
    if (etat.eau && typeof etat.eau === 'object') {
      candidats.push(etat.eau);
    }
    if (!candidats.length) return null;
    const meilleur = candidats.reduce((a, b) => (b.distance < a.distance ? b : a));
    return { ...meilleur, cap: cap(point, meilleur.coordonnees) };
  }

  function boutonReessayer() {
    const reessayer = document.createElement('button');
    reessayer.type = 'button';
    reessayer.className = 'point-raccourci';
    reessayer.textContent = t('point.reessayer');
    reessayer.addEventListener('click', () => {
      poser('eau', 'chargement');
      chargerEau();
    });
    return reessayer;
  }

  function valeurEau() {
    const eau = eauLaPlusProche();
    if (!eau) {
      if (etat.eau === 'chargement') return enAttente();
      if (etat.eau === 'hors-ligne') return indisponible(t('point.eau-hors-ligne'));
      if (etat.eau === 'erreur') {
        const bloc = document.createElement('div');
        bloc.append(indisponible(t('point.eau-erreur')), boutonReessayer());
        return bloc;
      }
      return indisponible(t('point.aucune-eau', { distance: formatLongueur(RAYON_EAU) }));
    }
    const nomGenre = t(`point.eau-${eau.genre}`);
    const details = [eau.distance < 20 ? t('point.ici') : loin(eau)];
    if (eau.nom) details.push(nomGenre);
    if (eau.genre !== 'potable' && eau.genre !== 'non-potable') details.push(t('point.eau-a-traiter'));
    if (etat.eau === 'chargement') details.push(t('point.eau-recherche'));
    return cibleTouchable('eau', { ...eau, nom: eau.nom || nomGenre }, eau.nom || nomGenre, details);
  }

  // ---------- Localiser un refuge ou un point d'eau, puis y aller ----------
  function localiser(cle, objet) {
    etat.cible = cle;
    etat.cibleCoordonnees = objet.coordonnees;
    marqueurCible?.remove();
    const pin = creerPinSeul('rando', 'selected');
    pin.element.classList.add('point-pin');
    marqueurCible = new Marker({ element: pin.element, anchor: 'bottom', offset: DECALAGE_PIN }).setLngLat(objet.coordonnees).addTo(map);
    cadrerAvec(objet.coordonnees);
    maj();
  }

  // Le point et la cible visibles ensemble, au-dessus de la fiche sur téléphone
  function cadrerAvec(coordonnees) {
    const fiche = document.getElementById('fiche');
    const telephone = window.matchMedia('(max-width: 640px)').matches;
    const hauteurFiche = fiche && !fiche.hidden ? fiche.getBoundingClientRect().height : 0;
    map.fitBounds([point, coordonnees], {
      padding: { top: 160, left: 60, right: telephone ? 80 : 440, bottom: telephone ? hauteurFiche + 50 : 60 },
      maxZoom: 15.5,
      duration: 800,
    });
  }

  // Rouvre cette fiche, avec la cible localisée s'il y en a une
  function rouvrirIci() {
    const cible = etat.cible && etat.cibleCoordonnees ? { cle: etat.cible, coordonnees: etat.cibleCoordonnees } : null;
    window.dispatchEvent(new CustomEvent('montis:ouvrir-point', { detail: { lng, lat, cible } }));
  }

  function allerVers(cle, objet) {
    const activite = lire('menu-activite', null) === 'velo' ? 'velo' : 'rando';
    deposer(`itineraire-${activite}`, {
      depart: point,
      arrivee: objet.coordonnees,
      nom: t('point.vers', { nom: objet.nom }),
      // La flèche retour de l'éditeur ramène à cette fiche, cible toujours localisée
      retour: rouvrirIci,
    });
    fermer();
    window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'activites', module: activite } }));
  }

  // Le nom se touche pour localiser la cible ; « Y aller » apparaît ensuite
  function cibleTouchable(cle, objet, titre, details) {
    const bloc = document.createElement('div');
    const surtitre = document.createElement('div');
    surtitre.className = 'point-surtitre';
    surtitre.textContent = t(cle === 'eau' ? 'point.eau-plus-proche' : 'point.refuge-plus-proche');
    bloc.append(surtitre);
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'point-cible';
    bouton.setAttribute('aria-label', `${surtitre.textContent} : ${t('point.localiser', { nom: titre })}`);
    const nom = document.createElement('span');
    nom.className = 'point-cible-nom';
    nom.textContent = titre;
    const icone = document.createElement('span');
    icone.className = 'point-cible-icone';
    icone.setAttribute('aria-hidden', 'true');
    icone.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
    bouton.append(nom, icone);
    bouton.addEventListener('click', () => localiser(cle, objet));
    bloc.append(bouton, texteSecondaire(details.join(' · ')));
    if (etat.cible === cle) {
      const aller = document.createElement('button');
      aller.type = 'button';
      aller.className = 'point-lien point-aller';
      aller.innerHTML = `
        <svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/></svg>
        <span></span>
        <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
      aller.querySelector('span').textContent = t('point.y-aller');
      aller.addEventListener('click', () => allerVers(cle, objet));
      bloc.append(aller);
    }
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
        ...[friseMeteo()].filter(Boolean),
        ligne(t('point.refuge'), valeurRefuge()),
        ligne(t('point.eau'), valeurEau())
      );
      const prudence = document.createElement('div');
      prudence.className = 'point-prudence';
      prudence.textContent = t('prudence.courte');
      corps.append(prudence);
    },
    arreter() {
      controleur.abort();
      marqueurCible?.remove();
      marqueurCible = null;
    },
  };
}
