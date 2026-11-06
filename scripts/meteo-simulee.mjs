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
    default:
      return 0;
  }
}

export function previsionsSimulees(url) {
  const params = new URL(url).searchParams;
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
    champsHoraires.forEach((champ) => hourly[champ].push(serieHoraire(champ, Math.floor(h / 24), h % 24)));
  }

  const maintenant = new Date();
  const heure = maintenant.getHours();
  const current = { time: texteHeure(maintenant) };
  champsActuels.forEach((champ) => { current[champ] = serieHoraire(champ, 0, heure); });

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
    elevation: 1035,
    utc_offset_seconds: -maintenant.getTimezoneOffset() * 60,
    timezone: 'GMT',
    current,
    hourly,
    daily,
  };
}
