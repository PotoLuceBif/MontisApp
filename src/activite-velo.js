// Activité vélo : la configuration du menu commun, plus les bike parks et les EuroVelo.
import { lire, ecrire } from './reglages.js';
import { creerActiviteParcours } from './activite-parcours.js';
import { creerBikeParks } from './velo-bike-parks.js';
import { ECHELLE_VTT } from './parcours-analyse.js';
import { t, tt } from './i18n.js';

const dureeVelo = (vitesse, montee) => (distance, plus) => distance / 1000 / vitesse + plus / montee;
const cycliste = (type) => ({ costing: 'bicycle', costing_options: { bicycle: { bicycle_type: type } } });

const PRATIQUES = {
  vtt: { id: 'vtt', cle: 'velo.vtt', brouter: 'mtb', valhalla: cycliste('Mountain'), couleur: '#ff8a3d', duree: dureeVelo(14, 500), seuilRaide: 20 },
  gravel: { id: 'gravel', cle: 'velo.gravel', brouter: 'gravel', valhalla: cycliste('Cross'), couleur: '#e3b341', duree: dureeVelo(19, 600), seuilRaide: 14 },
  route: { id: 'route', cle: 'velo.route', brouter: 'fastbike', valhalla: cycliste('Road'), couleur: '#4aa8ff', duree: dureeVelo(25, 800), seuilRaide: 12 },
};
const GRAVEL = /gravel/i;

// Numéros de eurovelo.com ; les noms officiels sont dans les traductions (ev.N).
// Les tracés viennent d'OpenStreetMap, pas du site
const EUROVELO = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19];
const TRONCONS_MAX = 50;
const ZOOM_MIN_ZONE = 7;

// Une EuroVelo existe en dizaines de relations dans OSM : celles de la zone, puis de France, d'abord
function catalogueEuroVelo(map, client) {
  return {
    titre: 'EuroVelo',
    entrees: EUROVELO.map((numero) => ({ numero, get nom() { return t(`ev.${numero}`); }, code: `EV${numero}` })),
    get note() {
      return t('velo.eurovelo-note');
    },
    resume: (routes) => (routes.some(({ proche }) => proche) ? t('velo.eurovelo-proches') : ''),
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
    labelCle: 'velo.titre',
    iconeMenu: 'velo',
    icone: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.500"/><circle cx="18" cy="17" r="3.500"/><path d="m6 17 4-8h6l2 8M10 9 9 6H7M16 9l-1-3h3"/></svg>',
    couleurGroupe: '#7a86ff',
    libelle: 'velo.libelle',
    nomPluriel: 'velo.pluriel',
    placeholder: 'velo.placeholder',
    pratiques: PRATIQUES,
    pratiqueDefaut: 'vtt',
    difficulte: { titre: 'velo.difficulte', note: 'velo.echelle', ...ECHELLE_VTT, texteTechnique: 'velo.technique' },
    portage: true,
    filtres: [
      { id: 'tous', cle: 'rando.filtre-tous', cartes: ['mtb', 'cycling'] },
      { id: 'vtt', cle: 'velo.vtt', cartes: ['mtb'] },
      // Rien ne distingue le gravel dans ces données, à part le nom de l'itinéraire
      { id: 'gravel', cle: 'velo.gravel', cartes: ['mtb', 'cycling'], garde: ({ name, ref }) => GRAVEL.test(`${name} ${ref}`) },
      { id: 'route', cle: 'velo.route', cartes: ['cycling'], garde: ({ name, ref }) => !GRAVEL.test(`${name} ${ref}`) },
    ],
    calques: ({ id }) => ({ tous: ['mtb', 'cycling'], vtt: ['mtb'], gravel: ['cycling'], route: ['cycling'] }[id]),
    typeDe: ({ carte, name, ref }) => (GRAVEL.test(`${name} ${ref}`) ? t('velo.gravel') : carte === 'mtb' ? t('velo.vtt') : t('velo.velo')),
    aPropos: 'velo.a-propos',
    entrees: (_, { itineraires, clients }) => [
      { libelle: 'velo.eurovelo', sous: 'velo.eurovelo-sous', ouvrir: () => itineraires.ouvrirCatalogue(catalogueEuroVelo(map, clients.cycling)) },
    ],
    sections(_, { editeur, itineraires }) {
      bikeParks.definirMasque(() => editeur.ouvert || itineraires.ouvert);
      return [bikeParks.section];
    },
    options(_, { appliquerCalque }) {
      const option = document.createElement('label');
      option.className = 'option-case';
      option.innerHTML = `<input type="checkbox" class="parcours-calque"> ${tt('velo.calque')}<small>${tt('velo.calque-detail')}</small>`;
      const caseCalque = option.querySelector('input');
      caseCalque.checked = lire('velo-calque', true) !== false;
      caseCalque.addEventListener('change', () => {
        ecrire('velo-calque', caseCalque.checked);
        appliquerCalque();
      });
      return option;
    },
    crochets: () => ({ activer: () => bikeParks.activer(), desactiver: () => bikeParks.desactiver() }),
  }, outils);
}
