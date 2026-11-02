// Activité vélo : la configuration du menu commun, plus les bike parks et les EuroVelo.
import { lire, ecrire } from './reglages.js';
import { creerActiviteParcours } from './activite-parcours.js';
import { creerBikeParks } from './velo-bike-parks.js';
import { ECHELLE_VTT } from './parcours-analyse.js';

const dureeVelo = (vitesse, montee) => (distance, plus) => distance / 1000 / vitesse + plus / montee;
const cycliste = (type) => ({ costing: 'bicycle', costing_options: { bicycle: { bicycle_type: type } } });

const PRATIQUES = {
  vtt: { id: 'vtt', libelle: 'VTT', libelleListe: 'VTT', brouter: 'mtb', valhalla: cycliste('Mountain'), couleur: '#ff8a3d', duree: dureeVelo(14, 500), seuilRaide: 20 },
  gravel: { id: 'gravel', libelle: 'Gravel', libelleListe: 'Gravel', brouter: 'gravel', valhalla: cycliste('Cross'), couleur: '#e3b341', duree: dureeVelo(19, 600), seuilRaide: 14 },
  route: { id: 'route', libelle: 'Route', libelleListe: 'Route', brouter: 'fastbike', valhalla: cycliste('Road'), couleur: '#4aa8ff', duree: dureeVelo(25, 800), seuilRaide: 12 },
};
const GRAVEL = /gravel/i;

// Noms et numéros de fr.eurovelo.com. Les tracés viennent d'OpenStreetMap, pas du site
const EUROVELO = [
  [1, 'Atlantic Coast Route'],
  [2, 'Véloroute des Capitales'],
  [3, 'Véloroute des Pèlerins'],
  [4, 'Véloroute de l’Europe Centrale'],
  [5, 'Via Romea (Francigena)'],
  [6, 'Atlantique - Mer Noire'],
  [7, 'Véloroute du Soleil'],
  [8, 'Véloroute de la Méditerranée'],
  [9, 'Baltique - Adriatique'],
  [10, 'Véloroute de la Baltique'],
  [11, 'Véloroute de l’Europe de l’Est'],
  [12, 'Véloroute de la Mer du Nord'],
  [13, 'Véloroute du Rideau de Fer'],
  [14, 'Lacs et Rivières d’Europe Centrale'],
  [15, 'Véloroute Rhin'],
  [17, 'Véloroute du Rhône'],
  [19, 'La Meuse à Vélo'],
];
const TRONCONS_MAX = 50;
const ZOOM_MIN_ZONE = 7;

// Une EuroVelo existe en dizaines de relations dans OSM : celles de la zone, puis de France, d'abord
function catalogueEuroVelo(map, client) {
  return {
    titre: 'EuroVelo',
    entrees: EUROVELO.map(([numero, nom]) => ({ numero, nom, code: `EV${numero}` })),
    note: 'EuroVelo® est une marque de l’ECF. Tracés issus d’OpenStreetMap, parfois différents du tracé officiel : consultez <a class="para-lien" href="https://fr.eurovelo.com/" target="_blank" rel="noopener noreferrer">fr.eurovelo.com ↗</a>',
    resume: (routes) => (routes.some(({ proche }) => proche) ? 'Les tronçons de la zone visible sont en tête de liste.' : ''),
    async chercher({ numero }) {
      const estCette = ({ group, ref, name }) => group === 'INT'
        && (new RegExp(`^EV\\s*${numero}$`, 'i').test(ref ?? '') || new RegExp(`Euro ?V[eé]lo ${numero}\\b`, 'i').test(name ?? ''));
      const reponses = await Promise.allSettled([
        client.chercher(`EuroVelo ${numero}`, undefined, TRONCONS_MAX),
        client.chercher(`EV${numero}`, undefined, TRONCONS_MAX),
        map.getZoom() >= ZOOM_MIN_ZONE ? client.dansLaZone(map.getBounds()) : Promise.resolve([]),
      ]);
      if (reponses.every(({ status }) => status === 'rejected')) throw new Error('recherche impossible');
      const [parNom, parRef, dansZone] = reponses.map((reponse) => (reponse.status === 'fulfilled' ? reponse.value : []));
      const proches = new Set(dansZone.filter(estCette).map(({ id }) => id));
      const rang = (route) => {
        if (proches.has(route.id)) return 0;
        return /france|fran[cç]ais|\bFR\b/i.test(route.name ?? '') ? 1 : 2;
      };
      return [...new Map([...dansZone, ...parNom, ...parRef].filter(estCette).map((route) => [route.id, route])).values()]
        .sort((a, b) => rang(a) - rang(b) || String(a.name).localeCompare(String(b.name), 'fr'))
        .slice(0, TRONCONS_MAX)
        .map((route) => ({ ...route, carte: 'cycling', proche: proches.has(route.id) }));
    },
  };
}

export function creerActiviteVelo(map, outils) {
  const bikeParks = creerBikeParks(map, outils);
  return creerActiviteParcours(map, {
    id: 'velo',
    label: 'Vélo',
    iconeMenu: 'velo',
    icone: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.500"/><circle cx="18" cy="17" r="3.500"/><path d="m6 17 4-8h6l2 8M10 9 9 6H7M16 9l-1-3h3"/></svg>',
    couleurGroupe: '#7a86ff',
    libelle: 'parcours vélo',
    nomPluriel: 'itinéraires',
    placeholder: 'Rechercher un itinéraire vélo ou VTT…',
    pratiques: PRATIQUES,
    pratiqueDefaut: 'vtt',
    difficulte: { titre: 'Difficulté VTT', note: '(échelle OpenStreetMap)', ...ECHELLE_VTT, texteTechnique: 'Sentier très technique (S4 ou plus)' },
    portage: true,
    filtres: [
      { id: 'tous', libelle: 'Tous', cartes: ['mtb', 'cycling'] },
      { id: 'vtt', libelle: 'VTT', cartes: ['mtb'] },
      // Rien ne distingue le gravel dans ces données, à part le nom de l'itinéraire
      { id: 'gravel', libelle: 'Gravel', cartes: ['mtb', 'cycling'], garde: ({ name, ref }) => GRAVEL.test(`${name} ${ref}`) },
      { id: 'route', libelle: 'Route', cartes: ['cycling'], garde: ({ name, ref }) => !GRAVEL.test(`${name} ${ref}`) },
    ],
    calques: ({ id }) => ({ tous: ['mtb', 'cycling'], vtt: ['mtb'], gravel: ['cycling'], route: ['cycling'] }[id]),
    typeDe: ({ carte, name, ref }) => (GRAVEL.test(`${name} ${ref}`) ? 'Gravel' : carte === 'mtb' ? 'VTT' : 'Vélo'),
    aPropos: '<p class="note">Tracés calculés par BRouter ou Valhalla, à partir des chemins OpenStreetMap. Un tracé calculé n’est pas une garantie de praticabilité : vérifiez le terrain et les accès avant de partir.</p>',
    entrees: (_, { itineraires, clients }) => [
      { libelle: 'EuroVélo', sous: 'Les 17 grands itinéraires européens', ouvrir: () => itineraires.ouvrirCatalogue(catalogueEuroVelo(map, clients.cycling)) },
    ],
    sections: () => [bikeParks.section],
    options(_, { appliquerCalque }) {
      const option = document.createElement('label');
      option.className = 'option-case';
      option.innerHTML = '<input type="checkbox" class="parcours-calque"> Itinéraires balisés sur la carte<small>Superpose le réseau du filtre choisi (Waymarked Trails)</small>';
      const caseCalque = option.querySelector('input');
      caseCalque.checked = lire('velo-calque', true) !== false;
      caseCalque.addEventListener('change', () => {
        ecrire('velo-calque', caseCalque.checked);
        appliquerCalque();
      });
      return option;
    },
    crochets: () => ({ desactiver: () => bikeParks.quitter() }),
  }, outils);
}
