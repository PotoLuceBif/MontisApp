// Calculs de la frise météo : niveaux, échelles et fenêtre d'heures. Sans DOM, testés.

// Codes WMO d'un orage annoncé par le modèle
const CODES_ORAGE = new Set([95, 96, 99]);

// CAPE en J/kg : énergie disponible pour une convection. Ce n'est pas une probabilité d'orage,
// d'où les mots « instabilité » tant que le modèle n'annonce pas l'orage lui-même.
export const SEUILS_CAPE = [300, 1000];

// 0 : rien à signaler, 1 : instabilité modérée, 2 : instabilité forte, 3 : orage prévu
export function niveauOrage(cape, code) {
  if (CODES_ORAGE.has(code)) return 3;
  if (!Number.isFinite(cape)) return 0;
  if (cape >= SEUILS_CAPE[1]) return 2;
  if (cape >= SEUILS_CAPE[0]) return 1;
  return 0;
}

// Heures à montrer : les 24 prochaines, ou le jour choisi à partir de `debut`.
// Les heures d'Open-Meteo (« 2026-11-06T14:00 ») sont à l'heure du lieu : on compare des textes.
export function indicesHeures(heures, debut, date = null, nombre = 24) {
  if (!Array.isArray(heures)) return [];
  if (date) {
    const indices = [];
    heures.forEach((valeur, index) => {
      if (valeur.startsWith(`${date}T`) && valeur >= debut) indices.push(index);
    });
    return indices;
  }
  const premier = heures.findIndex((valeur) => valeur >= debut);
  if (premier < 0) return [];
  return Array.from({ length: Math.min(nombre, heures.length - premier) }, (_, decalage) => premier + decalage);
}

// Bornes rondes d'une échelle : `pas` arrondit, `ecartMin` évite d'exagérer une petite variation
export function bornesEchelle(valeurs, { pas = 1, ecartMin = 0, inclure = [] } = {}) {
  const nombres = [...valeurs, ...inclure].filter(Number.isFinite);
  if (!nombres.length) return null;
  let bas = Math.floor(Math.min(...nombres) / pas) * pas;
  let haut = Math.ceil(Math.max(...nombres) / pas) * pas;
  if (haut - bas < ecartMin) {
    const centre = (bas + haut) / 2;
    bas = Math.floor((centre - ecartMin / 2) / pas) * pas;
    haut = Math.ceil((centre + ecartMin / 2) / pas) * pas;
  }
  if (haut === bas) haut = bas + pas;
  return { bas, haut };
}

// Plafond des précipitations : au moins 2 mm par heure, pour qu'une bruine reste une petite barre
export function plafondPluie(valeurs) {
  const maximum = Math.max(0, ...valeurs.filter(Number.isFinite));
  return Math.max(2, Math.ceil(maximum));
}

// Plafond du vent en km/h : au moins 30, arrondi à la dizaine
export function plafondVent(valeurs) {
  const maximum = Math.max(0, ...valeurs.filter(Number.isFinite));
  return Math.max(30, Math.ceil(maximum / 10) * 10);
}

// Neige plutôt que pluie : plus de la moitié de l'eau tombe en neige (1 cm de neige ≈ 0,7 mm d'eau)
export function estNeige(precipitation, chuteNeige) {
  if (!Number.isFinite(precipitation) || precipitation <= 0 || !Number.isFinite(chuteNeige)) return false;
  return chuteNeige * 0.7 >= precipitation / 2;
}

// Indices où la frise change de jour (minuit), pour les séparer
export function changementsDeJour(heures, indices) {
  return indices.filter((index, rang) => rang > 0 && heures[index].slice(0, 10) !== heures[indices[rang - 1]].slice(0, 10));
}

// Moyenne de directions par composantes : 350° et 10° donnent 0°, pas 180°
export function directionMoyenne(directions) {
  let x = 0;
  let y = 0;
  directions.forEach((direction) => {
    if (!Number.isFinite(direction)) return;
    x += Math.sin((direction * Math.PI) / 180);
    y += Math.cos((direction * Math.PI) / 180);
  });
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  const angle = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return angle > 360 - 1e-9 ? 0 : angle;
}
