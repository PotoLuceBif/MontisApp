// Enneigement (prévisions Open-Meteo) et risque d'avalanche (bulletins EAWS) d'une station
import { formatAltitude, formatNeige, formatTemp, formatVent, nombre as formatNombre, uniteNeige, versNeige } from './unites.js';
const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const URL_RISQUES = 'https://static.avalanche.report/eaws_bulletins';
const DUREE_CACHE_NEIGE_MS = 30 * 60 * 1000;

const NIVEAUX_RISQUE = {
  1: 'Faible',
  2: 'Limité',
  3: 'Marqué',
  4: 'Fort',
  5: 'Très fort',
};

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
    const libelles = { '-1': 'Hier', 0: 'Auj.', 1: 'Dem.' };
    const libelle = libelles[ecart]
      || new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
    return { libelle, cm: Number(reponse.daily.snowfall_sum?.[i]) || 0 };
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

  const reponse = await fetch(`${API_PREVISIONS}?${params}`);
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
    const titre = points.length > 1 ? (i === 0 ? 'Haut du domaine' : 'Bas du domaine') : 'Station';
    carte.append(el('span', 'ski-neige-lieu', point.altitude != null ? `${titre} · ${formatAltitude(point.altitude)}` : titre));
    const neige = el('strong', 'ski-neige-valeur', point.neigeCm != null ? formatNeige(point.neigeCm) : '—');
    carte.append(neige, el('span', 'ski-neige-legende', 'de neige au sol (estimation)'));
    const details = [
      point.temperature != null ? formatTemp(point.temperature) : '',
      point.rafales != null ? `rafales ${formatVent(point.rafales)}` : '',
    ].filter(Boolean).join(' · ');
    if (details) carte.append(el('span', 'ski-neige-details', details));
    cartes.append(carte);
  });
  bloc.append(cartes);

  const maximum = Math.max(1, ...jours.map((jour) => jour.cm));
  const titreChutes = duHaut ? 'Chutes de neige, en haut du domaine' : 'Chutes de neige';
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
    isotherme != null ? `Isotherme ${formatTemp(0)} vers ${formatAltitude(isotherme)}. ` : '',
    `Prévisions de modèle en ${uniteNeige()}, pas des relevés de la station. Source : `,
    lienExterne('Open-Meteo', 'https://open-meteo.com/'),
    ' (CC BY 4.0).'
  );
  bloc.append(pied);
  return bloc;
}

// ---------- Risque d'avalanche ----------
async function chargerNiveaux(date) {
  if (!cacheRisques.has(date)) {
    const demande = fetch(`${URL_RISQUES}/${date}/${date}.ratings.json`)
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
    ? lienExterne('Lire le bulletin Météo-France', 'https://meteofrance.com/meteo-montagne')
    : lienExterne('Lire le bulletin officiel', 'https://www.avalanches.org/');
}

export function creerBlocRisque(risque, station) {
  const bloc = el('div', 'ski-risque');
  const ligne = el('div', 'ski-risque-ligne');
  if (risque?.max) {
    const niveau = el('span', `ski-risque-niveau ski-risque-${risque.max}`, String(risque.max));
    niveau.setAttribute('aria-hidden', 'true');
    const textes = el('div', 'ski-risque-textes');
    textes.append(el('strong', null, `Risque ${NIVEAUX_RISQUE[risque.max].toLowerCase()} (${risque.max}/5)`));
    textes.append(el('span', null, `Massif : ${station.massifNom || station.massif}`));
    const nuances = [];
    if (risque.matin && risque.apresMidi && risque.matin !== risque.apresMidi) {
      nuances.push(`matin ${risque.matin}/5, après-midi ${risque.apresMidi}/5`);
    }
    if (risque.haut && risque.bas && risque.haut !== risque.bas) {
      nuances.push(`en altitude ${risque.haut}/5, plus bas ${risque.bas}/5`);
    }
    if (nuances.length) textes.append(el('span', null, nuances.join(' · ')));
    ligne.append(niveau, textes);
  } else {
    const textes = el('div', 'ski-risque-textes');
    textes.append(el('strong', null, 'Aucun niveau de risque publié aujourd’hui'));
    textes.append(el('span', null, station.massifNom ? `Massif : ${station.massifNom}` : 'Massif non identifié pour cette station'));
    ligne.append(textes);
  }
  bloc.append(ligne);

  const pied = el('p', 'ski-conditions-note');
  pied.append(
    risque?.max
      ? 'Niveau maximal du massif, pas de votre pente. '
      : 'L’absence de bulletin ne veut pas dire absence de risque. ',
    lienBulletin(station.pays),
    ' avant toute sortie hors-piste. Source : ',
    lienExterne('EAWS', 'https://www.avalanches.org/'),
    '.'
  );
  bloc.append(pied);
  return bloc;
}
