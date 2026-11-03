// Pastilles des couches allumées depuis le menu Carte (pentes, éléments de la carte) : elles restent
// sur la carte panneau fermé, disent ce qui est affiché, l'éteignent (✕) ou rouvrent son réglage.
import { poserAttribut, surLangue, t } from './i18n.js';

const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';

let rangee = null;
const pastilles = new Set();

function conteneur() {
  if (!rangee) {
    rangee = document.createElement('div');
    rangee.className = 'couches-actives';
    rangee.setAttribute('role', 'group');
    poserAttribut(rangee, 'aria-label', 'couches.titre');
    document.body.append(rangee);
    surLangue(() => pastilles.forEach((p) => p.maj()));
  }
  return rangee;
}

const majRangee = () => {
  rangee.hidden = ![...pastilles].some((p) => p.visible);
};

// Ouvre le panneau Carte sur un module (relief, elements), même réduit
export const ouvrirReglage = (module) =>
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'carte', module } }));

// `ordre` : place dans la rangée. `nom()` : texte de la pastille. `legende()` : HTML facultatif devant le nom.
export function creerPastilleCouche({ ordre = 0, nom, legende = () => '', onOuvrir, onRetirer }) {
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

  const pastille = {
    visible: false,
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
      element.hidden = !oui;
      if (oui) pastille.maj();
      majRangee();
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
