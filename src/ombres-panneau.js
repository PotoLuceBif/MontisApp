// Bloc « Ombre du soleil » de la rubrique Soleil et Lune (soleil-lune.js). Les couches (ombres.js) ne se
// chargent qu'à la première activation, ou au démarrage si les ombres étaient allumées.
import { lire, ecrire } from './reglages.js';
import { poser, ta } from './i18n.js';

const ICONE_SOLEIL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`;

// `partage` : jour et heure communs de la rubrique (soleil-lune.js)
export function creerOptionOmbres(map, partage) {
  const bloc = document.createElement('div');
  bloc.className = 'relief-ombres';
  bloc.innerHTML = `
    <div class="relief-bascule ombres-choix" role="group" ${ta('aria-label', 'ombres.titre')}>
      <button type="button" aria-pressed="false">${ICONE_SOLEIL}<span data-i18n="ombres.afficher"></span></button>
    </div>
    <div class="ombres-details" hidden></div>
  `;
  bloc.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const bouton = bloc.querySelector('.ombres-choix button');
  const details = bloc.querySelector('.ombres-details');

  let actif = lire('ombres', false);
  let module = null; // promesse de l'interface chargée (ombres.js)

  const charger = () => {
    module ??= Promise.all([import('./ombres.js'), partage.charger()])
      .then(([m, reglage]) => m.initOmbres(map, { details, reglage, partage, eteindre: () => basculer(false) }));
    return module;
  };

  function majBouton() {
    bouton.classList.toggle('actif', actif);
    bouton.setAttribute('aria-pressed', String(actif));
    details.hidden = !actif;
  }

  async function basculer(oui) {
    actif = oui;
    ecrire('ombres', oui);
    majBouton();
    if (!oui && !module) return;
    const ombres = await charger();
    // Un second appui a pu arriver pendant le chargement
    ombres.afficher(actif);
  }

  bouton.addEventListener('click', () => basculer(!actif));
  majBouton();
  if (actif) basculer(true);
  return { bloc, actif: () => actif };
}
