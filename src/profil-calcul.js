// Profil vertical heure par heure (« windgram ») au-dessus d'un point : vent par altitude,
// thermiques, base des nuages et couches humides. Calculs purs, testés.
// Thermiques par la méthode de la particule : l'air du sol monte en suivant l'adiabatique sèche
// (9,8 °C par km) jusqu'à sa condensation, puis l'adiabatique humide (environ 6 °C par km) ;
// il s'arrête là où il n'est plus plus chaud que l'air autour. Elle part de la plus chaude de deux
// estimations du sol (température à 2 m, ou premier niveau du modèle ramené au sol : la température
// à 2 m est recalée sur un relief plus fin que celui du modèle), plus 1 °C de déclenchement.
// Sans soleil, pas de thermique.
import { composantes, depuisComposantes } from './vent-calcul.js';

export const NIVEAUX_PROFIL = [1000, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500];
const CHAMPS_NIVEAU = ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height'];

export const VARIABLES_PROFIL = [
  'temperature_2m', 'dew_point_2m', 'shortwave_radiation', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'precipitation', 'cape',
  ...NIVEAUX_PROFIL.flatMap((p) => CHAMPS_NIVEAU.map((champ) => `${champ}_${p}hPa`)),
];

const ADIABATIQUE_SECHE = 0.0098; // °C par mètre
const ADIABATIQUE_HUMIDE = 0.006;
const PAS_PARTICULE = 25; // m
const DECLENCHEMENT = 1; // °C : l'air surchauffé au contact du sol
const RAYONNEMENT_MIN = 50; // W/m² : en dessous, pas assez de soleil pour chauffer le sol
const EPAISSEUR_MIN = 150; // en dessous, pas de thermique exploitable
const ALTITUDE_MAX_CALCUL = 7000;

const nombre = (valeur) => (Number.isFinite(valeur) ? valeur : null);

// Air au-dessus du point à l'heure `i`, de bas en haut, en altitudes au-dessus de la mer.
// Le sol prend la température à 2 m et le vent à 10 m ; les niveaux sous le relief sont écartés.
export function colonneAir(hourly, i, elevation) {
  const colonne = [];
  const vitesseSol = nombre(hourly.wind_speed_10m?.[i]);
  const directionSol = nombre(hourly.wind_direction_10m?.[i]);
  colonne.push({
    altitude: elevation,
    temperature: nombre(hourly.temperature_2m?.[i]),
    humidite: null,
    ...(vitesseSol !== null && directionSol !== null ? composantes(vitesseSol, directionSol) : { u: null, v: null }),
  });
  for (const p of NIVEAUX_PROFIL) {
    const altitude = nombre(hourly[`geopotential_height_${p}hPa`]?.[i]);
    if (altitude === null || altitude <= elevation + 50) continue;
    const vitesse = nombre(hourly[`wind_speed_${p}hPa`]?.[i]);
    const direction = nombre(hourly[`wind_direction_${p}hPa`]?.[i]);
    colonne.push({
      altitude,
      temperature: nombre(hourly[`temperature_${p}hPa`]?.[i]),
      humidite: nombre(hourly[`relative_humidity_${p}hPa`]?.[i]),
      ...(vitesse !== null && direction !== null ? composantes(vitesse, direction) : { u: null, v: null }),
    });
  }
  return colonne.sort((a, b) => a.altitude - b.altitude);
}

// Valeur d'un champ à une altitude, par interpolation linéaire entre les deux niveaux qui l'encadrent
export function interpoler(colonne, altitude, champ) {
  const points = colonne.filter((niveau) => niveau[champ] !== null);
  if (!points.length || altitude < points[0].altitude || altitude > points.at(-1).altitude) return null;
  const haut = points.findIndex((niveau) => niveau.altitude >= altitude);
  if (points[haut].altitude === altitude || haut === 0) return points[haut][champ];
  const bas = points[haut - 1];
  const ratio = (altitude - bas.altitude) / (points[haut].altitude - bas.altitude);
  return bas[champ] + (points[haut][champ] - bas[champ]) * ratio;
}

// Vent à une altitude ; interpolé sur les composantes, pour ne pas fausser le cap autour du nord
export function ventAltitude(colonne, altitude) {
  const u = interpoler(colonne, altitude, 'u');
  const v = interpoler(colonne, altitude, 'v');
  if (u === null || v === null) return null;
  return { u, v, ...depuisComposantes(u, v) };
}

// Base des cumulus : environ 125 m par degré d'écart entre la température et le point de rosée
export const baseNuages = (elevation, temperature, rosee) =>
  Number.isFinite(temperature) && Number.isFinite(rosee) ? elevation + Math.max(0, 125 * (temperature - rosee)) : null;

// Thermiques au-dessus du point : `plafond` (sommet des thermiques secs, ou base des nuages s'ils
// condensent), `base` et `sommet` des cumulus, `gradient` moyen en °C pour 100 m, et l'écart de
// température de la particule (`exces`) à chaque altitude. `null` si l'air est stable.
export function thermique(colonne, rosee, rayonnement = null) {
  const sol = colonne[0];
  if (!sol || sol.temperature === null) return null;
  if (Number.isFinite(rayonnement) && rayonnement < RAYONNEMENT_MIN) return null;
  // Le premier niveau ne sert que s'il est plus froid que le sol : sous une inversion, le ramener
  // au sol inventerait de la chaleur
  const premier = colonne.find((niveau) => niveau !== sol && niveau.temperature !== null);
  const ramene = premier && premier.temperature < sol.temperature && premier.altitude - sol.altitude < 600
    ? premier.temperature + ADIABATIQUE_SECHE * (premier.altitude - sol.altitude)
    : -Infinity;
  const depart = Math.max(sol.temperature, ramene) + DECLENCHEMENT;
  const base = baseNuages(sol.altitude, sol.temperature, rosee);
  const particule = (altitude) => {
    if (base === null || altitude <= base) return depart - ADIABATIQUE_SECHE * (altitude - sol.altitude);
    return depart - ADIABATIQUE_SECHE * (base - sol.altitude) - ADIABATIQUE_HUMIDE * (altitude - base);
  };
  let sommet = null;
  for (let altitude = sol.altitude + PAS_PARTICULE; altitude <= ALTITUDE_MAX_CALCUL; altitude += PAS_PARTICULE) {
    const air = interpoler(colonne, altitude, 'temperature');
    if (air === null || particule(altitude) <= air) {
      sommet = altitude;
      break;
    }
  }
  if (sommet === null || sommet - sol.altitude < EPAISSEUR_MIN) return null;
  const condense = base !== null && base < sommet;
  const plafond = condense ? base : sommet;
  const airPlafond = interpoler(colonne, plafond, 'temperature');
  return {
    plafond,
    base: condense ? base : null,
    sommet: condense ? sommet : null,
    gradient: airPlafond === null ? null : ((sol.temperature - airPlafond) / (plafond - sol.altitude)) * 100,
    exces: (altitude) => {
      const air = interpoler(colonne, altitude, 'temperature');
      return air === null ? null : particule(altitude) - air;
    },
  };
}

// Force du thermique d'après l'écart de la particule : 1 faible, 2 moyen, 3 fort
export function forceThermique(exces) {
  if (!Number.isFinite(exces) || exces <= 0) return 0;
  if (exces < 1) return 1;
  if (exces < 2.5) return 2;
  return 3;
}

// Couche nuageuse d'après l'humidité : de 0 (sec) à 1 (saturé), à partir de 85 %
export const densiteNuage = (humidite) => (Number.isFinite(humidite) ? Math.max(0, Math.min(1, (humidite - 85) / 15)) : 0);

// Altitudes des lignes : le sol, puis tous les `pas` mètres jusqu'à `max`
export function altitudesProfil(elevation, { pas = 250, max = 4000 } = {}) {
  const altitudes = [Math.round(elevation)];
  for (let altitude = Math.ceil((elevation + pas * 0.4) / pas) * pas; altitude <= max; altitude += pas) altitudes.push(altitude);
  return altitudes;
}

// Profil d'une journée (`jour` : AAAA-MM-JJ à l'heure du lieu) entre `heureMin` et `heureMax`
export function profilJour(donnees, jour, { heureMin = 7, heureMax = 20, pas = 250, max = 4000 } = {}) {
  const { hourly, elevation } = donnees;
  const altitudes = altitudesProfil(elevation, { pas, max });
  const heures = [];
  (hourly?.time ?? []).forEach((time, i) => {
    if (!time.startsWith(jour)) return;
    const heure = Number(time.slice(11, 13));
    if (heure < heureMin || heure > heureMax) return;
    const colonne = colonneAir(hourly, i, elevation);
    const therm = thermique(colonne, nombre(hourly.dew_point_2m?.[i]), nombre(hourly.shortwave_radiation?.[i]));
    const cellules = altitudes.map((altitude) => {
      const vent = ventAltitude(colonne, altitude);
      const dansThermique = therm && altitude <= therm.plafond;
      const dansCumulus = therm?.base !== null && therm?.base !== undefined && altitude >= therm.base && altitude <= therm.sommet;
      return {
        altitude,
        vent,
        thermique: dansThermique ? Math.max(1, forceThermique(therm.exces(altitude))) : 0,
        nuage: dansCumulus ? 1 : densiteNuage(interpoler(colonne, altitude, 'humidite')),
      };
    });
    heures.push({
      time,
      heure,
      index: i,
      thermique: therm,
      cellules,
      rafales: nombre(hourly.wind_gusts_10m?.[i]),
      pluie: nombre(hourly.precipitation?.[i]),
      cape: nombre(hourly.cape?.[i]),
    });
  });
  return { altitudes, heures, elevation };
}
