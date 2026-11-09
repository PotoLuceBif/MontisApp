// Enneigement (prévisions Open-Meteo) et risque d'avalanche (bulletins EAWS) d'une station
import { formatAltitude, formatNeige, formatTemp, formatVent, nombre as formatNombre, uniteNeige, versNeige } from './unites.js';
import { formatDate, t } from './i18n.js';
import { requete as requeteReseau } from './requete.js';
const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const URL_RISQUES = 'https://static.avalanche.report/eaws_bulletins';
const DUREE_CACHE_NEIGE_MS = 30 * 60 * 1000;


const cacheNeige = new Map();
const cacheRisques = new Map();

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

function lienExterne(texte, url) {
  const a = el('a', null, texte);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

const dateLocale = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const entier = (valeur) => (Number.isFinite(valeur) ? Math.round(valeur) : null);

// ---------- Enneigement ----------
function lirePoint(reponse, altitude) {
  const heures = reponse.hourly;
  // Les heures de la réponse sont exprimées à l'heure locale de la station
  const maintenant = new Date(Date.now() + reponse.utc_offset_seconds * 1000).toISOString().slice(0, 13);
  const i = Math.max(0, heures.time.findIndex((t) => t.startsWith(maintenant)));
  const neigeM = heures.snow_depth?.[i];
  return {
    altitude,
    temperature: entier(heures.temperature_2m?.[i]),
    neigeCm: Number.isFinite(neigeM) ? Math.round(neigeM * 100) : null,
    rafales: entier(heures.wind_gusts_10m?.[i]),
    isotherme: entier(heures.freezing_level_height?.[i]),
  };
}

function lireJours(reponse) {
  const aujourdhui = new Date(Date.now() + reponse.utc_offset_seconds * 1000).toISOString().slice(0, 10);
  return reponse.daily.time.map((date, i) => {
    const ecart = Math.round((Date.parse(date) - Date.parse(aujourdhui)) / 86_400_000);
    // Le libellé se calcule à l'affichage : il doit suivre la langue, même pour des données en cache
    return {
      get libelle() {
        const proches = { '-1': 'jour.hier-court', 0: 'jour.auj-court', 1: 'jour.dem-court' };
        return proches[ecart] ? t(proches[ecart]) : formatDate(`${date}T12:00:00Z`, { weekday: 'short', timeZone: 'UTC' });
      },
      cm: Number(reponse.daily.snowfall_sum?.[i]) || 0,
    };
  });
}

export async function chargerNeige(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  const { altMin, altMax } = feature.properties;
  const cle = `${lng},${lat}`;
  const enCache = cacheNeige.get(cle);
  if (enCache && Date.now() - enCache.heure < DUREE_CACHE_NEIGE_MS) return enCache.donnees;

  const altitudes = altMin && altMax && altMax > altMin ? [altMax, altMin] : [];
  const nombre = altitudes.length || 1;
  const params = new URLSearchParams({
    latitude: Array(nombre).fill(lat).join(','),
    longitude: Array(nombre).fill(lng).join(','),
    hourly: 'temperature_2m,snow_depth,wind_gusts_10m,freezing_level_height',
    daily: 'snowfall_sum',
    past_days: '1',
    forecast_days: '4',
    timezone: 'auto',
  });
  if (altitudes.length) params.set('elevation', altitudes.join(','));

  const reponse = await requeteReseau(`${API_PREVISIONS}?${params}`);
  const json = await reponse.json().catch(() => null);
  if (!reponse.ok || !json || json.error) throw new Error(json?.reason || `HTTP ${reponse.status}`);

  const reponses = Array.isArray(json) ? json : [json];
  const donnees = {
    points: reponses.map((r, i) => lirePoint(r, altitudes[i] ?? entier(r.elevation))),
    jours: lireJours(reponses[0]),
    duHaut: altitudes.length > 0,
  };
  cacheNeige.set(cle, { heure: Date.now(), donnees });
  return donnees;
}

export function creerBlocNeige({ points, jours, duHaut }) {
  const bloc = el('div', 'ski-neige');

  const cartes = el('div', 'ski-neige-points');
  points.forEach((point, i) => {
    const carte = el('div', 'ski-neige-point');
    const titre = t(points.length > 1 ? (i === 0 ? 'neige.haut' : 'neige.bas') : 'neige.station');
    carte.append(el('span', 'ski-neige-lieu', point.altitude != null ? `${titre} · ${formatAltitude(point.altitude)}` : titre));
    const neige = el('strong', 'ski-neige-valeur', point.neigeCm != null ? formatNeige(point.neigeCm) : '—');
    carte.append(neige, el('span', 'ski-neige-legende', t('neige.au-sol')));
    const details = [
      point.temperature != null ? formatTemp(point.temperature) : '',
      point.rafales != null ? t('neige.rafales', { vent: formatVent(point.rafales) }) : '',
    ].filter(Boolean).join(' · ');
    if (details) carte.append(el('span', 'ski-neige-details', details));
    cartes.append(carte);
  });
  bloc.append(cartes);

  const maximum = Math.max(1, ...jours.map((jour) => jour.cm));
  const titreChutes = t(duHaut ? 'neige.chutes-haut' : 'neige.chutes');
  bloc.append(el('div', 'ski-neige-titre', titreChutes));
  const graphique = el('div', 'ski-neige-jours');
  for (const jour of jours) {
    const colonne = el('div', 'ski-neige-jour');
    colonne.setAttribute('aria-label', `${jour.libelle} : ${formatNeige(jour.cm)}`);
    colonne.setAttribute('role', 'img');
    const piste = el('div', 'ski-neige-piste');
    const barre = el('i');
    barre.style.height = `${(jour.cm / maximum) * 100}%`;
    piste.append(barre);
    colonne.append(el('strong', null, formatNombre(versNeige(jour.cm), versNeige(jour.cm) < 10 ? 1 : 0)), piste, el('span', null, jour.libelle));
    graphique.append(colonne);
  }
  bloc.append(graphique);

  const isotherme = points[0]?.isotherme;
  const pied = el('p', 'ski-conditions-note');
  pied.append(
    isotherme != null ? t('neige.isotherme', { temp: formatTemp(0), altitude: formatAltitude(isotherme) }) : '',
    t('neige.source', { unite: uniteNeige() }),
    lienExterne('Open-Meteo', 'https://open-meteo.com/'),
    ' (CC BY 4.0).'
  );
  bloc.append(pied);
  return bloc;
}

// ---------- Risque d'avalanche ----------
async function chargerNiveaux(date) {
  if (!cacheRisques.has(date)) {
    const demande = requeteReseau(`${URL_RISQUES}/${date}/${date}.ratings.json`)
      .then((reponse) => {
        if (reponse.status === 404) return {}; // aucun bulletin publié pour cette date
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        return reponse.json().then((json) => json.maxDangerRatings || {});
      })
      .catch((erreur) => {
        cacheRisques.delete(date);
        throw erreur;
      });
    cacheRisques.set(date, demande);
  }
  return cacheRisques.get(date);
}

export async function chargerRisque(massif) {
  const niveaux = await chargerNiveaux(dateLocale());
  const lire = (suffixe) => Number(niveaux[`${massif}${suffixe}`]) || 0;
  return {
    max: lire(''),
    matin: lire(':am'),
    apresMidi: lire(':pm'),
    haut: lire(':high'),
    bas: lire(':low'),
  };
}

function lienBulletin(pays) {
  return pays === 'FR'
    ? lienExterne(t('risque.bulletin-fr'), 'https://meteofrance.com/meteo-montagne')
    : lienExterne(t('risque.bulletin'), 'https://www.avalanches.org/');
}

export function creerBlocRisque(risque, station) {
  const bloc = el('div', 'ski-risque');
  const ligne = el('div', 'ski-risque-ligne');
  if (risque?.max) {
    const niveau = el('span', `ski-risque-niveau ski-risque-${risque.max}`, String(risque.max));
    niveau.setAttribute('aria-hidden', 'true');
    const textes = el('div', 'ski-risque-textes');
    textes.append(el('strong', null, t('risque.titre', { nom: t(`risque.${risque.max}`).toLowerCase(), n: risque.max }).replace(/^./, (c) => c.toUpperCase())));
    textes.append(el('span', null, t('risque.massif', { nom: station.massifNom || station.massif })));
    const nuances = [];
    if (risque.matin && risque.apresMidi && risque.matin !== risque.apresMidi) {
      nuances.push(t('risque.matin-aprem', { matin: risque.matin, aprem: risque.apresMidi }));
    }
    if (risque.haut && risque.bas && risque.haut !== risque.bas) {
      nuances.push(t('risque.haut-bas', { haut: risque.haut, bas: risque.bas }));
    }
    if (nuances.length) textes.append(el('span', null, nuances.join(' · ')));
    ligne.append(niveau, textes);
  } else {
    const textes = el('div', 'ski-risque-textes');
    textes.append(el('strong', null, t('risque.aucun')));
    textes.append(el('span', null, station.massifNom ? t('risque.massif', { nom: station.massifNom }) : t('risque.massif-inconnu')));
    ligne.append(textes);
  }
  bloc.append(ligne);

  const pied = el('p', 'ski-conditions-note');
  pied.append(
    t(risque?.max ? 'risque.max-massif' : 'risque.absence'),
    lienBulletin(station.pays),
    t('risque.avant-sortie'),
    lienExterne('EAWS', 'https://www.avalanches.org/'),
    '.'
  );
  bloc.append(pied);
  return bloc;
}
