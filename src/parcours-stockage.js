// « Mes parcours » : enregistrés avec tout leur tracé, ils se rouvrent sans réseau ni nouveau calcul.
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

export function creerStockageParcours(activite) {
  const cleParcours = `montis.${activite}-parcours`;
  const cleBrouillon = `montis.${activite}-brouillon`;
  const lister = () => {
    const parcours = lireJson(cleParcours, []);
    return Array.isArray(parcours) ? parcours : [];
  };
  return {
    lister,
    enregistrer(parcours) {
      return ecrireJson(cleParcours, [parcours, ...lister().filter(({ id }) => id !== parcours.id)]);
    },
    supprimer: (id) => ecrireJson(cleParcours, lister().filter((parcours) => parcours.id !== id)),
    renommer: (id, nom) => ecrireJson(cleParcours, lister().map((parcours) => (parcours.id === id ? { ...parcours, nom } : parcours))),
    lireBrouillon: () => lireJson(cleBrouillon, null),
    ecrireBrouillon: (brouillon) => ecrireJson(cleBrouillon, brouillon),
    effacerBrouillon() {
      try {
        localStorage.removeItem(cleBrouillon);
      } catch {
        /* rien à effacer */
      }
    },
  };
}
