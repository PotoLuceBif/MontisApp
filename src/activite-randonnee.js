// Activité randonnée : la configuration du menu commun, plus les refuges et l'aperçu des sentiers.
import { lire, ecrire } from './reglages.js';
import { afficherRefuges } from './lieux.js';
import { nomSac } from './rando-api.js';
import { t, tt } from './i18n.js';
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
  if (trace.sac != null) infos.push({ texte: t('rando.difficulte-max', { nom: nomSac(trace.sac) }) });
  const wikipedia = lienWikipedia(tags.wikipedia);
  if (wikipedia) infos.push({ texte: t('lien.wikipedia'), lien: wikipedia });
  const site = tags.website || tags.url;
  if (site && /^https?:\/\//i.test(site)) infos.push({ texte: t('lien.site'), lien: site });
  infos.push({ texte: 'OpenStreetMap ↗', lien: `https://www.openstreetmap.org/relation/${details.id}` });
  return infos;
}

function caseOption(classe, titre, detail, coche, surChange) {
  const option = document.createElement('label');
  option.className = 'option-case';
  option.innerHTML = `<input type="checkbox" class="${classe}"> ${tt(titre)}<small>${tt(detail)}</small>`;
  const champ = option.querySelector('input');
  champ.checked = coche;
  champ.addEventListener('change', () => surChange(champ.checked));
  return option;
}

export function creerActiviteRandonnee(map, outils) {
  return creerActiviteParcours(map, {
    id: 'rando',
    labelCle: 'rando.titre',
    iconeMenu: 'rando',
    icone: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="1.700"/><path d="m9 21 3-7-2-3 1-4 3 3h3M7 12l2-4 2-1M14 14l2 7"/></svg>',
    couleurGroupe: '#7a86ff',
    libelle: 'rando.libelle',
    nomPluriel: 'rando.pluriel',
    placeholder: 'rando.placeholder',
    pratiques: {
      rando: { id: 'rando', cle: 'rando.pratique', brouter: 'hiking-mountain', valhalla: { costing: 'pedestrian' }, echelle: 'sac', couleur: '#4debd4', duree: dureeEstimee, seuilRaide: 35 },
    },
    pratiqueDefaut: 'rando',
    preferences: [['sentiers', 'preference.sentiers'], ['chemins', 'preference.chemins'], ['balises', 'preference.balises'], ['routes', 'preference.routes']],
    preferencesDefaut: ['sentiers'],
    difficulte: { titre: 'rando.difficulte', note: 'rando.echelle', ...ECHELLE_SAC, texteTechnique: 'rando.technique' },
    portage: false,
    allure: true,
    libelleVoies: { single: 'voie.sentier', chemin: 'voie.piste' },
    filtres: [{ id: 'tous', cle: 'rando.filtre-tous', cartes: ['hiking'] }],
    calques: () => ['hiking'],
    typeDe: (route) => (estGR(route) ? 'GR' : estPR(route) ? 'PR' : t('rando.type')),
    infosRoute,
    aPropos: 'rando.a-propos',
    options(_, { appliquerCalque }) {
      const bloc = document.createElement('div');
      bloc.className = 'rando-options';
      // Même réglage que dans Éléments de la carte
      const refuges = caseOption('parcours-refuges', 'rando.refuges', 'rando.refuges-detail', !!lire('refuges', false), (actif) => {
        afficherRefuges(map, actif);
        ecrire('refuges', actif);
        window.dispatchEvent(new CustomEvent('calque', { detail: { cle: 'refuges', actif } }));
      });
      window.addEventListener('calque', (event) => {
        if (event.detail.cle === 'refuges') refuges.querySelector('input').checked = event.detail.actif;
      });
      const apercu = caseOption('parcours-calque', 'rando.apercu', 'rando.apercu-detail', !!lire('rando-apercu', false), (actif) => {
        ecrire('rando-apercu', actif);
        appliquerCalque();
      });
      bloc.append(refuges, apercu);
      return bloc;
    },
  }, outils);
}
