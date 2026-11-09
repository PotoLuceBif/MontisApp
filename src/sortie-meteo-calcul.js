// Météo du jour d'une sortie, d'après les archives d'Open-Meteo : adresse de la requête,
// valeurs à chaque point de la trace, résumé. Calculs purs (testés).

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const JOUR = 86400000;
// Les archives (ERA5) arrivent avec quelques jours de retard ; avant, l'API des prévisions garde le passé récent
const RETARD_ARCHIVE = 6 * JOUR;
const PASSE_PREVISIONS = 90 * JOUR;
export const CHAMPS_METEO = [
  'temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'cloud_cover', 'weather_code',
];

const jourUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

// null quand la sortie est dans le futur, ou trop récente et trop ancienne à la fois (aucune source)
export function adresseMeteoSortie({ lat, lng, debut, fin }, maintenant = Date.now()) {
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || debut > maintenant) return null;
  const age = maintenant - fin;
  const base = age > RETARD_ARCHIVE ? ARCHIVE : age <= PASSE_PREVISIONS ? PREVISIONS : null;
  if (!base) return null;
  const parametres = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    start_date: jourUtc(debut),
    end_date: jourUtc(fin),
    hourly: CHAMPS_METEO.join(','),
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  return `${base}?${parametres}`;
}

// Réponse d'Open-Meteo -> { heures (ms UTC), et une série par champ }
export function lireMeteo(reponse) {
  const horaire = reponse?.hourly;
  if (!horaire || !Array.isArray(horaire.time) || !horaire.time.length) return null;
  const heures = horaire.time.map((texte) => Date.parse(`${texte}Z`));
  if (!heures.every(Number.isFinite)) return null;
  const meteo = { heures };
  for (const champ of CHAMPS_METEO) meteo[champ] = Array.isArray(horaire[champ]) ? horaire[champ] : null;
  return meteo;
}

// Valeur interpolée à chaque instant, entre les deux heures qui l'encadrent
export function interpolerHoraire(heures, valeurs, instants) {
  if (!valeurs) return null;
  let k = 0;
  return instants.map((instant) => {
    while (k < heures.length - 2 && heures[k + 1] <= instant) k++;
    const [a, b] = [valeurs[k], valeurs[k + 1]];
    if (a == null && b == null) return null;
    if (a == null || b == null || heures[k + 1] === heures[k]) return a ?? b;
    const f = Math.min(1, Math.max(0, (instant - heures[k]) / (heures[k + 1] - heures[k])));
    return a + (b - a) * f;
  });
}

// Pour les directions : la moyenne de 350° et 10° est 0°, pas 180°
function directionMoyenne(directions, poids) {
  let x = 0;
  let y = 0;
  directions.forEach((d, i) => {
    if (d == null) return;
    const w = poids?.[i] ?? 1;
    x += Math.sin((d * Math.PI) / 180) * w;
    y += Math.cos((d * Math.PI) / 180) * w;
  });
  if (!x && !y) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

// Codes WMO du plus calme au plus marqué : le résumé garde le temps le plus marqué de la sortie
const GRAVITE = (code) => {
  if (code >= 95) return 6;
  if (code >= 71 && code <= 86 && ![80, 81, 82].includes(code)) return 5;
  if (code >= 51) return 4;
  if (code >= 45 && code <= 48) return 3;
  return code ?? -1;
};

// Résumé sur les heures de la sortie (l'heure qui précède le départ comprise)
export function resumerMeteo(meteo, debut, fin) {
  const indices = meteo.heures.map((h, i) => [h, i]).filter(([h]) => h >= debut - 3600000 && h <= fin + 3600000).map(([, i]) => i);
  if (!indices.length) return null;
  const serie = (champ) => (meteo[champ] ? indices.map((i) => meteo[champ][i]).filter((v) => v != null) : []);
  const temperatures = serie('temperature_2m');
  const vents = serie('wind_speed_10m');
  const rafales = serie('wind_gusts_10m');
  const pluie = serie('precipitation');
  const nuages = serie('cloud_cover');
  const codes = serie('weather_code');
  const moyenne = (valeurs) => (valeurs.length ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : null);
  return {
    tMin: temperatures.length ? Math.min(...temperatures) : null,
    tMax: temperatures.length ? Math.max(...temperatures) : null,
    vent: moyenne(vents),
    rafales: rafales.length ? Math.max(...rafales) : null,
    direction: meteo.wind_direction_10m
      ? directionMoyenne(indices.map((i) => meteo.wind_direction_10m[i]), indices.map((i) => meteo.wind_speed_10m?.[i] ?? 1))
      : null,
    pluie: pluie.length ? pluie.reduce((a, b) => a + b, 0) : null,
    nuages: moyenne(nuages),
    code: codes.length ? codes.reduce((a, b) => (GRAVITE(b) > GRAVITE(a) ? b : a)) : null,
  };
}
