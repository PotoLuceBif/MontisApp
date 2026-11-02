// « Mes parcours » : enregistrés avec tout leur tracé, ils se rouvrent sans réseau ni nouveau calcul.
const CLE_PARCOURS = 'montis.velo-parcours';
const CLE_BROUILLON = 'montis.velo-brouillon';

const arrondir = ([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];

function lireJson(cle, defaut) {
  try {
    return JSON.parse(localStorage.getItem(cle)) ?? defaut;
  } catch {
    return defaut;
  }
}

function ecrireJson(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch (erreur) {
    console.warn('Parcours non enregistré :', erreur);
    return false;
  }
}

export function compacter(etapes) {
  return etapes.map(({ lng, lat, mode, troncon }) => ({
    lng,
    lat,
    mode,
    troncon: troncon && { ...troncon, geom: troncon.geom.map(arrondir) },
  }));
}

export const listerParcours = () => {
  const parcours = lireJson(CLE_PARCOURS, []);
  return Array.isArray(parcours) ? parcours : [];
};

export function enregistrerParcours(parcours) {
  const autres = listerParcours().filter(({ id }) => id !== parcours.id);
  return ecrireJson(CLE_PARCOURS, [parcours, ...autres]);
}

export const supprimerParcours = (id) => ecrireJson(CLE_PARCOURS, listerParcours().filter((parcours) => parcours.id !== id));

export const renommerParcours = (id, nom) =>
  ecrireJson(CLE_PARCOURS, listerParcours().map((parcours) => (parcours.id === id ? { ...parcours, nom } : parcours)));

export const lireBrouillon = () => lireJson(CLE_BROUILLON, null);
export const ecrireBrouillon = (brouillon) => ecrireJson(CLE_BROUILLON, brouillon);
export function effacerBrouillon() {
  try {
    localStorage.removeItem(CLE_BROUILLON);
  } catch {
    /* rien à effacer */
  }
}
