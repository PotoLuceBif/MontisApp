// Prévisions Open-Meteo simulées, pour les captures : en session cloud, Open-Meteo est injoignable.
// Une journée de montagne type : brouillard le matin, orage l'après-midi, vent qui forcit,
// puis de la neige le surlendemain. Répond seulement aux champs demandés.

const deux = (n) => String(n).padStart(2, '0');
const texteHeure = (date) =>
  `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}T${deux(date.getHours())}:00`;

function serieHoraire(champ, jour, heure) {
  const apresMidi = Math.max(0, Math.sin(((heure - 9) / 12) * Math.PI));
  const orageJour = jour === 0;
  const neigeJour = jour === 2;
  switch (champ) {
    case 'temperature_2m':
      return Math.round((neigeJour ? -3 : 4 - jour) + apresMidi * (neigeJour ? 4 : 11) + Math.cos(heure) * 0.3) / 1;
    case 'precipitation':
      if (orageJour && heure >= 14 && heure <= 18) return [0.4, 2.6, 5.8, 3.1, 0.6][heure - 14];
      if (neigeJour && heure >= 6 && heure <= 16) return 1.2;
      return 0;
    case 'rain':
      return neigeJour ? 0 : serieHoraire('precipitation', jour, heure);
    case 'snowfall':
      return neigeJour && heure >= 6 && heure <= 16 ? 1.6 : 0;
    case 'precipitation_probability':
      if (orageJour) return heure >= 12 && heure <= 19 ? [35, 50, 70, 85, 90, 75, 50, 30][heure - 12] : 10;
      if (neigeJour) return heure >= 5 && heure <= 17 ? 80 : 40;
      return 5;
    case 'weather_code':
      if (orageJour && (heure === 16 || heure === 17)) return 95;
      if (orageJour && heure >= 14 && heure <= 18) return 81;
      if (neigeJour && heure >= 6 && heure <= 16) return 73;
      return heure < 10 && jour < 2 ? 45 : 2;
    case 'wind_speed_10m':
      return Math.round(6 + apresMidi * (orageJour ? 22 : 12) + jour * 4);
    case 'wind_gusts_10m':
      return Math.round((6 + apresMidi * (orageJour ? 22 : 12) + jour * 4) * 1.7 + (orageJour && heure >= 15 && heure <= 17 ? 25 : 0));
    case 'wind_direction_10m':
      return (heure < 11 ? 140 : orageJour && heure >= 15 ? 290 : 230) + jour * 15;
    case 'cape':
      if (!orageJour) return jour === 1 ? Math.round(apresMidi * 450) : 0;
      return Math.round(apresMidi * 1800);
    case 'cloud_cover_low':
      if (heure < 10 && jour < 2) return [95, 95, 95, 90, 90, 90, 85, 80, 60, 30][heure];
      if (neigeJour) return 85;
      return orageJour && heure >= 14 && heure <= 18 ? 55 : 10;
    case 'freezing_level_height':
      return Math.round(neigeJour ? 850 + heure * 5 : 2500 + apresMidi * 500 - jour * 300);
    case 'apparent_temperature':
      return serieHoraire('temperature_2m', jour, heure) - 2;
    case 'wind_speed_10m_max':
      return 0;
    case 'dew_point_2m':
      return serieHoraire('temperature_2m', jour, heure) - (orageJour ? 2 + apresMidi * 5 : 3 + apresMidi * 7);
    case 'shortwave_radiation':
      return heure >= 8 && heure <= 17 ? Math.round(Math.max(0, Math.sin(((heure - 7) / 11) * Math.PI)) * (neigeJour ? 120 : 620)) : 0;
    default:
      return niveauPression(champ, jour, heure, apresMidi) ?? 0;
  }
}

// Niveaux de pression (profil vertical de l'analyse du vent) : atmosphère standard, réchauffée
// l'après-midi dans les basses couches, sol à 1 035 m comme `elevation`
const HAUTEURS_NIVEAUX = { 1000: 110, 950: 540, 925: 760, 900: 990, 850: 1460, 800: 1950, 750: 2470, 700: 3010, 650: 3590, 600: 4200, 550: 4850, 500: 5570 };
function niveauPression(champ, jour, heure, apresMidi) {
  const lu = /^(temperature|relative_humidity|wind_speed|wind_direction|geopotential_height)_(\d+)hPa$/.exec(champ);
  if (!lu) return null;
  const hauteur = HAUTEURS_NIVEAUX[lu[2]];
  if (hauteur === undefined) return null;
  const dessus = Math.max(0, hauteur - 1035);
  switch (lu[1]) {
    case 'geopotential_height':
      return hauteur;
    case 'temperature':
      return Math.round((3 - jour * 2 + apresMidi * 6 * Math.max(0, 1 - dessus / 2200) - 0.0065 * dessus) * 10) / 10;
    case 'relative_humidity':
      if (jour === 0 && heure >= 14 && heure <= 18) return hauteur > 2500 ? 97 : 80;
      if (heure < 10 && jour < 2 && hauteur < 1600) return 96;
      return hauteur > 4000 ? 88 : 55;
    case 'wind_speed':
      return Math.round(8 + dessus / 120 + jour * 4 + apresMidi * 4);
    case 'wind_direction':
      return Math.round(220 + Math.min(60, dessus / 60) + jour * 15) % 360;
    default:
      return null;
  }
}

// Plusieurs points (analyse du vent, plafonds) : un tableau, chaque point un peu différent
export function previsionsSimulees(url) {
  const params = new URL(url).searchParams;
  const latitudes = (params.get('latitude') || '').split(',');
  if (latitudes.length > 1) {
    const longitudes = (params.get('longitude') || '').split(',');
    return latitudes.map((lat, i) => {
      const adresse = new URL(url);
      adresse.searchParams.set('latitude', lat);
      adresse.searchParams.set('longitude', longitudes[i] ?? longitudes[0]);
      return previsionsPoint(adresse, i);
    });
  }
  return previsionsPoint(new URL(url), null);
}

// Variante d'un point de grille : relief et chauffage du sol qui changent d'un point à l'autre
const variantePoint = (i) => (i === null ? { elevation: 1035, chauffe: 0 } : { elevation: 700 + ((i * 37) % 11) * 110, chauffe: ((i * 13) % 7) - 3 });

function previsionsPoint(adresseUrl, indexPoint) {
  const params = adresseUrl.searchParams;
  const { elevation, chauffe } = variantePoint(indexPoint);
  const valeurPoint = (champ, jour, h) => {
    const brute = serieHoraire(champ, jour, h);
    if (champ === 'surface_pressure') return Math.round(1013.25 * Math.exp(-elevation / 8434) * 10) / 10;
    if (champ === 'temperature_2m' || champ === 'dew_point_2m') {
      const apresMidi = Math.max(0, Math.sin(((h - 9) / 12) * Math.PI));
      return brute - 0.0065 * (elevation - 1035) + (champ === 'temperature_2m' ? chauffe * apresMidi : 0);
    }
    return brute;
  };
  const jours = Number(params.get('forecast_days') || 5);
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  const champsHoraires = (params.get('hourly') || '').split(',').filter(Boolean);
  const champsActuels = (params.get('current') || '').split(',').filter(Boolean);
  const champsJour = (params.get('daily') || '').split(',').filter(Boolean);

  const hourly = { time: [] };
  champsHoraires.forEach((champ) => { hourly[champ] = []; });
  for (let h = 0; h < jours * 24; h += 1) {
    const date = new Date(debut.getTime() + h * 3600 * 1000);
    hourly.time.push(texteHeure(date));
    champsHoraires.forEach((champ) => hourly[champ].push(valeurPoint(champ, Math.floor(h / 24), h % 24)));
  }

  const maintenant = new Date();
  const heure = maintenant.getHours();
  const current = { time: texteHeure(maintenant) };
  champsActuels.forEach((champ) => { current[champ] = valeurPoint(champ, 0, heure); });

  const daily = { time: [] };
  champsJour.forEach((champ) => { daily[champ] = []; });
  for (let j = 0; j < jours; j += 1) {
    daily.time.push(texteHeure(new Date(debut.getTime() + j * 86400000)).slice(0, 10));
    const heures = Array.from({ length: 24 }, (_, h) => h);
    const valeurs = (champ) => heures.map((h) => serieHoraire(champ, j, h));
    champsJour.forEach((champ) => {
      const valeur = {
        weather_code: j === 0 ? 95 : j === 2 ? 73 : 2,
        temperature_2m_max: Math.max(...valeurs('temperature_2m')),
        temperature_2m_min: Math.min(...valeurs('temperature_2m')),
        precipitation_probability_max: Math.max(...valeurs('precipitation_probability')),
        wind_speed_10m_max: Math.max(...valeurs('wind_speed_10m')),
        uv_index_max: 4,
      }[champ];
      daily[champ].push(valeur ?? 0);
    });
  }

  return {
    latitude: Number(params.get('latitude')),
    longitude: Number(params.get('longitude')),
    elevation,
    utc_offset_seconds: -maintenant.getTimezoneOffset() * 60,
    timezone: 'GMT',
    current,
    hourly,
    daily,
  };
}

// Archives d'Open-Meteo simulées (météo du jour d'une sortie) : la journée « type » du lendemain, en heures UTC
export function archiveSimulee(url) {
  const params = new URL(url).searchParams;
  const debut = Date.parse(`${params.get('start_date')}T00:00:00Z`);
  const fin = Date.parse(`${params.get('end_date')}T00:00:00Z`) + 86400000;
  const champs = (params.get('hourly') || '').split(',').filter(Boolean);
  const hourly = { time: [] };
  champs.forEach((champ) => { hourly[champ] = []; });
  for (let instant = debut; instant < fin; instant += 3600000) {
    hourly.time.push(new Date(instant).toISOString().slice(0, 16));
    const heure = new Date(instant).getUTCHours();
    // Une journée d'été : la journée type, douze degrés plus chaude
    const valeur = (champ) => {
      if (champ === 'cloud_cover') return heure < 11 ? 30 : 70;
      return serieHoraire(champ, 1, heure) + (champ === 'temperature_2m' ? 12 : 0);
    };
    champs.forEach((champ) => hourly[champ].push(valeur(champ)));
  }
  return { latitude: Number(params.get('latitude')), longitude: Number(params.get('longitude')), timezone: 'GMT', hourly };
}
