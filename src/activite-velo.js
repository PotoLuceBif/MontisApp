// Activité vélo : choix de la pratique et accès aux parcours. L'édition se fait sur la carte.
import { lire, ecrire } from './reglages.js';
import { PRATIQUES } from './velo-routage.js';
import { creerEditeurVelo } from './velo-editeur.js';

export function creerActiviteVelo(map, { fermerMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'velo';
  panneau.innerHTML = `
    <div class="velo-pratiques" role="group" aria-label="Pratique">
      ${Object.values(PRATIQUES).map(({ id, libelle }) => `<button type="button" data-pratique="${id}" aria-pressed="false">${libelle}</button>`).join('')}
    </div>
    <div class="rando-actions-principales" role="group" aria-label="Actions vélo">
      <button type="button" class="rando-action-principale velo-creer">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6.500 8.500 4l7 2.500L21 4v13.500L15.500 20l-7-2.500L3 20V6.500Z"/><path d="M8.500 4v13.500M15.500 6.500V20"/></svg>
        <span>Créer un parcours</span>
      </button>
    </div>
    <details class="rando-outils">
      <summary>À propos</summary>
      <div class="rando-outils-contenu">
        <p class="note">Tracés calculés par BRouter ou Valhalla, à partir des chemins OpenStreetMap. Un tracé calculé n’est pas une garantie de praticabilité : vérifiez le terrain et les accès avant de partir.</p>
      </div>
    </details>
  `;
  const idLu = lire('velo-pratique', 'vtt');
  let pratique = PRATIQUES[idLu] ?? PRATIQUES.vtt;
  const boutonsPratique = [...panneau.querySelectorAll('[data-pratique]')];

  const editeur = creerEditeurVelo(map, {
    pratique,
    onPratique: choisirPratique,
    onFermer: () => editeur.fermer(),
  });

  function rendrePratique() {
    boutonsPratique.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.pratique === pratique.id)));
  }

  function choisirPratique(id) {
    if (id === pratique.id) return;
    pratique = PRATIQUES[id];
    ecrire('velo-pratique', id);
    rendrePratique();
    editeur.definirPratique(id);
  }

  boutonsPratique.forEach((bouton) => {
    bouton.addEventListener('click', () => choisirPratique(bouton.dataset.pratique));
  });
  panneau.querySelector('.velo-creer').addEventListener('click', () => {
    fermerMenu();
    editeur.ouvrirCreation();
  });
  rendrePratique();

  return {
    id: 'velo',
    label: 'Vélo',
    icone: 'velo',
    panneau,
    activer() {},
    desactiver() {
      editeur.fermer();
    },
  };
}
