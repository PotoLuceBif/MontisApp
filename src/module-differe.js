// Module de menu chargé à sa première ouverture. Le menu n'en connaît d'abord que la ligne
// (id, libellé, icône) ; le code arrive par import(), dans un fichier à part que le service
// worker précharge avec le reste de l'application : il reste disponible hors ligne.
//
// `infos` : { id, labelCle, icone, surCarte?, reseauRequis? }
// `charger` : () => Promise<module>, le module complet ({ panneau, activer, desactiver… })
export function differer(infos, charger) {
  let promesse = null;
  const quandCharge = new Set();
  const definition = {
    ...infos,
    instance: null,
    obtenir() {
      promesse ??= charger().then(
        (module) => {
          definition.instance = module;
          quandCharge.forEach((action) => action(module));
          return module;
        },
        (erreur) => {
          promesse = null; // le prochain essai recommence
          throw erreur;
        }
      );
      return promesse;
    },
    // Appelée tout de suite si le module est déjà là
    quandCharge(action) {
      if (definition.instance) action(definition.instance);
      else quandCharge.add(action);
    },
  };
  return definition;
}

// Le même module, sans attendre : pour les rubriques nécessaires dès le démarrage
export function immediat(module) {
  return {
    id: module.id,
    labelCle: module.labelCle,
    label: module.label,
    icone: module.icone,
    surCarte: module.surCarte,
    reseauRequis: module.reseauRequis,
    instance: module,
    obtenir: () => Promise.resolve(module),
    quandCharge: (action) => action(module),
  };
}

// Façade d'un module différé pour un autre module qui le pilote (le Vol libre ouvre l'analyse
// du vent) : activer() charge si besoin, desactiver() annule une activation encore en route.
export function facade(definition) {
  let voulu = false;
  return {
    activer(options) {
      voulu = true;
      definition.obtenir().then(
        (module) => voulu && module.activer(options),
        (erreur) => console.error(`Chargement de « ${definition.id} » impossible :`, erreur)
      );
    },
    desactiver() {
      voulu = false;
      definition.instance?.desactiver();
    },
  };
}
