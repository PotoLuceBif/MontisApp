// Activité randonnée : la configuration du menu commun, plus les refuges et l'aperçu des sentiers.
import { lire, ecrire } from './reglages.js';
import { afficherRefuges } from './lieux.js';
import { NOMS_SAC } from './rando-api.js';
import { dureeEstimee } from './rando-profil.js';
import { creerActiviteParcours } from './activite-parcours.js';
import { ECHELLE_SAC } from './parcours-analyse.js';

const estGR = ({ ref, group }) => /^(GR|E\s?\d)/i.test(ref ?? '') || group === 'INT' || group === 'NAT';
const estPR = ({ ref, group }) => !estGR({ ref, group }) && (/^PR/i.test(ref ?? '') || group === 'LOC');

function lienWikipedia(tag) {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const langue = i > 0 ? tag.slice(0, i) : 'fr';
  const titre = i > 0 ? tag.slice(i + 1) : tag;
  if (!/^[a-z-]{2,10}$/i.test(langue)) return null;
  return `https://${langue}.wikipedia.org/wiki/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
}

function infosRoute(details, trace) {
  const tags = details.tags ?? {};
  const infos = [];
  if (trace.sac != null) infos.push({ texte: `Difficulté maximale (échelle SAC) : ${NOMS_SAC[trace.sac]}` });
  const wikipedia = lienWikipedia(tags.wikipedia);
  if (wikipedia) infos.push({ texte: 'Wikipédia ↗', lien: wikipedia });
  const site = tags.website || tags.url;
  if (site && /^https?:\/\//i.test(site)) infos.push({ texte: 'Site web ↗', lien: site });
  infos.push({ texte: 'OpenStreetMap ↗', lien: `https://www.openstreetmap.org/relation/${details.id}` });
  return infos;
}

function caseOption(classe, titre, detail, coche, surChange) {
  const option = document.createElement('label');
  option.className = 'option-case';
  option.innerHTML = `<input type="checkbox" class="${classe}"> ${titre}<small>${detail}</small>`;
  const champ = option.querySelector('input');
  champ.checked = coche;
  champ.addEventListener('change', () => surChange(champ.checked));
  return option;
}

export function creerActiviteRandonnee(map, outils) {
  return creerActiviteParcours(map, {
    id: 'rando',
    label: 'Randonnée',
    iconeMenu: 'rando',
    icone: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.700"/><path d="m9 21 3-7-2-3 1-4 3 3h3M7 12l2-4 2-1M14 14l2 7"/></svg>',
    couleurGroupe: '#7a86ff',
    libelle: 'parcours de randonnée',
    nomPluriel: 'randonnées',
    placeholder: 'Rechercher un itinéraire (GR 20, Tour du Mont-Blanc…)',
    pratiques: {
      rando: { id: 'rando', libelle: 'Randonnée', brouter: 'hiking-mountain', valhalla: { costing: 'pedestrian' }, echelle: 'sac', couleur: '#4debd4', duree: dureeEstimee, seuilRaide: 35 },
    },
    pratiqueDefaut: 'rando',
    difficulte: { titre: 'Difficulté', note: '(échelle SAC)', ...ECHELLE_SAC, texteTechnique: 'Passage alpin très exigeant (T5 ou plus)' },
    portage: false,
    allure: true,
    libelleVoies: { single: 'Sentier', chemin: 'Piste' },
    filtres: [
      { id: 'tous', libelle: 'Tous', cartes: ['hiking'] },
      { id: 'gr', libelle: 'GR', cartes: ['hiking'], garde: estGR },
      { id: 'pr', libelle: 'PR', cartes: ['hiking'], garde: estPR },
      { id: 'autres', libelle: 'Autres', cartes: ['hiking'], garde: (route) => !estGR(route) && !estPR(route) },
    ],
    calques: () => ['hiking'],
    typeDe: (route) => (estGR(route) ? 'GR' : estPR(route) ? 'PR' : 'Randonnée'),
    infosRoute,
    aPropos: '<p class="note">Tracés calculés par BRouter ou Valhalla (profil piéton), à partir des chemins OpenStreetMap. Vérifiez le terrain avant de partir.<br>Itinéraires : © contributeurs OpenStreetMap, Waymarked Trails (CC BY-SA).</p>',
    options(_, { appliquerCalque }) {
      const bloc = document.createElement('div');
      bloc.className = 'rando-options';
      // Même réglage que dans Éléments de la carte
      const refuges = caseOption('parcours-refuges', 'Refuges', 'Même réglage que dans Éléments de la carte', !!lire('refuges', false), (actif) => {
        afficherRefuges(map, actif);
        ecrire('refuges', actif);
        window.dispatchEvent(new CustomEvent('calque', { detail: { cle: 'refuges', actif } }));
      });
      window.addEventListener('calque', (event) => {
        if (event.detail.cle === 'refuges') refuges.querySelector('input').checked = event.detail.actif;
      });
      const apercu = caseOption('parcours-calque', 'Aperçu des sentiers', 'Superpose tous les sentiers balisés (Waymarked Trails)', !!lire('rando-apercu', false), (actif) => {
        ecrire('rando-apercu', actif);
        appliquerCalque();
      });
      bloc.append(refuges, apercu);
      return bloc;
    },
  }, outils);
}
