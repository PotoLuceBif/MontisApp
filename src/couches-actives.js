// Pastilles des couches allumées depuis Carte ou Météo (pentes, éléments, radar, vent) : elles restent
// sur la carte panneau fermé, disent ce qui est affiché, l'éteignent (✕) ou rouvrent son réglage.
import { poserAttribut, surLangue, t } from './i18n.js';

// Mini-légendes des couches météo (mêmes dessins que les lignes du menu)
export const MINI_PLUIE = '<svg class="mini-icone" viewBox="0 0 24 24"><path d="M7 15a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 7.5a3.75 3.75 0 0 1 0 7.5"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/></svg>';
export const MINI_VENT = '<svg class="mini-icone" viewBox="0 0 24 24"><path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/></svg>';

// Ferme le menu et les panneaux Météo et Carte, pour montrer un panneau posé sur la carte (vent)
export const montrerCarte = () => window.dispatchEvent(new CustomEvent('montis:montrer-carte'));

const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

let rangee = null;
const pastilles = new Set();

// Rubriques de Carte : dès que deux de leurs couches sont allumées, une seule pastille les remplace
// (« Éléments de la carte · 5 »), qui ouvre la rubrique ; sa ✕ les éteint toutes (décision du propriétaire
// du 12 novembre 2026). Seule, une couche garde sa pastille détaillée.
const RUBRIQUES = {
  relief: { cle: 'relief.titre', ordre: 0 },
  nature: { cle: 'nature.titre', ordre: 5 },
  elements: { cle: 'elements.titre', ordre: 10 },
  fond: { cle: 'fond.titre', ordre: 40 },
};
const rubriques = new Map(); // id → pastille de rubrique

function conteneur() {
  if (!rangee) {
    rangee = document.createElement('div');
    rangee.className = 'couches-actives';
    rangee.setAttribute('role', 'group');
    poserAttribut(rangee, 'aria-label', 'couches.titre');
    document.body.append(rangee);
    surLangue(() => {
      pastilles.forEach((p) => p.maj());
      rubriques.forEach((r) => r.maj());
    });
  }
  return rangee;
}

const majRangee = () => {
  rangee.hidden = ![...pastilles].some((p) => p.visible);
};

function pastilleRubrique(id) {
  if (rubriques.has(id)) return rubriques.get(id);
  const { cle, ordre } = RUBRIQUES[id];
  const element = document.createElement('div');
  element.className = 'couche-pastille couche-pastille-rubrique';
  element.style.order = ordre;
  element.hidden = true;
  element.innerHTML = `
    <button type="button" class="couche-pastille-corps"><span class="couche-pastille-nom"></span></button>
    <button type="button" class="couche-pastille-retirer">${CROIX}</button>
  `;
  conteneur().append(element);
  const corps = element.querySelector('.couche-pastille-corps');
  const retirer = element.querySelector('.couche-pastille-retirer');
  const membres = () => [...pastilles].filter((p) => p.rubrique === id && p.visible);
  corps.addEventListener('click', () => ouvrirReglage(id));
  // Éteint toutes les couches de la rubrique ; chacune se retire de la liste en s'éteignant
  retirer.addEventListener('click', () => membres().forEach((p) => p.retirer()));
  const rubrique = {
    maj() {
      const n = membres().length;
      element.hidden = n < 2;
      const texte = `${t(cle)} · ${n}`;
      element.querySelector('.couche-pastille-nom').textContent = texte;
      corps.setAttribute('aria-label', t('couches.regler', { nom: texte }));
      corps.title = corps.getAttribute('aria-label');
      retirer.setAttribute('aria-label', t('couches.masquer', { nom: texte }));
      retirer.title = retirer.getAttribute('aria-label');
    },
  };
  rubriques.set(id, rubrique);
  return rubrique;
}

// Montre chaque pastille seule, ou sa rubrique à la place quand elle en a deux allumées ou plus
function majRubriques() {
  for (const id of Object.keys(RUBRIQUES)) {
    const membres = [...pastilles].filter((p) => p.rubrique === id);
    if (!membres.length) continue;
    const regroupe = membres.filter((p) => p.visible).length >= 2;
    membres.forEach((p) => p.cacher(regroupe));
    pastilleRubrique(id).maj();
  }
}

// Ouvre le panneau Carte sur un module (relief, elements), même réduit
export const ouvrirReglage = (module) =>
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'carte', module } }));

// `ordre` : place dans la rangée. `nom()` : texte de la pastille. `legende()` : HTML facultatif devant le nom.
// `rubrique` : rubrique de Carte (relief, nature, elements, fond) où la pastille se regroupe.
export function creerPastilleCouche({ ordre = 0, nom, legende = () => '', onOuvrir, onRetirer, rubrique = null }) {
  const element = document.createElement('div');
  element.className = 'couche-pastille';
  element.style.order = ordre;
  element.hidden = true;
  element.innerHTML = `
    <button type="button" class="couche-pastille-corps">
      <span class="couche-pastille-legende" aria-hidden="true"></span>
      <span class="couche-pastille-nom"></span>
    </button>
    <button type="button" class="couche-pastille-action" hidden></button>
    <button type="button" class="couche-pastille-retirer">${CROIX}</button>
  `;
  conteneur().append(element);

  const corps = element.querySelector('.couche-pastille-corps');
  const action = element.querySelector('.couche-pastille-action');
  const retirer = element.querySelector('.couche-pastille-retirer');
  let actionEnCours = null; // { cle, faire } : bouton supplémentaire (« Rapprocher »)

  corps.addEventListener('click', () => onOuvrir());
  retirer.addEventListener('click', () => onRetirer());
  action.addEventListener('click', () => actionEnCours?.faire());

  let cachee = false; // remplacée par la pastille de sa rubrique
  const pastille = {
    visible: false,
    rubrique,
    retirer: () => onRetirer(),
    cacher(oui) {
      cachee = oui;
      element.hidden = !pastille.visible || cachee;
    },
    maj() {
      const texte = nom();
      const legendeHtml = legende();
      const zoneLegende = element.querySelector('.couche-pastille-legende');
      zoneLegende.innerHTML = legendeHtml;
      zoneLegende.hidden = !legendeHtml;
      element.querySelector('.couche-pastille-nom').textContent = texte;
      corps.setAttribute('aria-label', t('couches.regler', { nom: texte }));
      corps.title = corps.getAttribute('aria-label');
      retirer.setAttribute('aria-label', t('couches.masquer', { nom: texte }));
      retirer.title = retirer.getAttribute('aria-label');
      action.hidden = !actionEnCours;
      if (actionEnCours) action.textContent = t(actionEnCours.cle);
      element.classList.toggle('avec-action', !!actionEnCours);
    },
    montrer(oui) {
      if (oui === pastille.visible) return;
      pastille.visible = oui;
      element.hidden = !oui || cachee;
      if (oui) pastille.maj();
      majRangee();
      if (rubrique) majRubriques();
    },
    // Un bouton de plus dans la pastille, ou aucun (null)
    action(cle, faire) {
      actionEnCours = cle ? { cle, faire } : null;
      pastille.maj();
    },
  };
  pastilles.add(pastille);
  majRangee();
  return pastille;
}
