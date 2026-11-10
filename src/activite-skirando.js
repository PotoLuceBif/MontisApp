// Pratique Ski de rando de l'activité Ski : la structure de la Randonnée (créer un parcours,
// rechercher ici, Mes parcours, import GPX), avec les itinéraires de ski de rando d'OSM,
// un routage qui les suit et le bulletin d'avalanche du massif au centre de la carte.
import { creerActiviteParcours } from './activite-parcours.js';
import { ECHELLE_SAC } from './parcours-analyse.js';
import { cheminSurReseau, creerReseau, dureeSkiRando } from './skirando-calcul.js';
import { creerZoneSkitour } from './skirando-itineraires.js';
import { creerAvalanchesIci } from './skirando-avalanches.js';

export const COULEUR_SKIRANDO = '#8fd3ff';

export function creerSkiRando(map, outils) {
  const avalanches = creerAvalanchesIci(map, outils);
  let reseau = null;
  let zone = null;
  return creerActiviteParcours(map, {
    id: 'skirando',
    labelCle: 'ski.titre',
    iconeMenu: 'ski',
    icone: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="14" cy="4" r="1.700"/><path d="m9 13 3-6 3 3 3 1M12 7l-2 5 3 3-1 5M3 19l18-4"/></svg>',
    couleurGroupe: '#7a86ff',
    libelle: 'skirando.libelle',
    nomPluriel: 'skirando.pluriel',
    placeholder: 'skirando.libelle',
    pratiques: {
      // Profil piéton de montagne, complété pour suivre les traces de ski de rando d'OSM
      skirando: { id: 'skirando', cle: 'skirando.pratique', brouter: 'hiking-mountain', reglages: ['skitour'], valhalla: { costing: 'pedestrian' }, echelle: 'sac', couleur: COULEUR_SKIRANDO, duree: dureeSkiRando, seuilRaide: 30, tronconLocal: (de, vers) => (reseau ? cheminSurReseau(reseau, de, vers) : null) },
    },
    pratiqueDefaut: 'skirando',
    preferences: [],
    difficulte: { titre: 'rando.difficulte', note: 'rando.echelle', ...ECHELLE_SAC, texteTechnique: 'rando.technique' },
    portage: false,
    allure: false,
    libelleVoies: { single: 'voie.sentier', chemin: 'voie.piste' },
    filtres: [{ id: 'tous', cle: 'rando.filtre-tous', cartes: [] }],
    calques: () => [],
    typeDe: () => '',
    sansRecherche: true,
    aPropos: 'skirando.a-propos',
    zone(carte, outilsParcours) {
      zone = creerZoneSkitour(carte, {
        ...outilsParcours,
        surItineraires(itineraires) {
          reseau = itineraires.length ? creerReseau(itineraires.flatMap(({ lignes }) => lignes)) : null;
        },
      });
      return zone;
    },
    avantCreation: () => zone?.preparer(),
    sections: () => [avalanches.section],
    crochets: () => ({ activer: avalanches.activer, desactiver: avalanches.desactiver }),
  }, outils);
}
