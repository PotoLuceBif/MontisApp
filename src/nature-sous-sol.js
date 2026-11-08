// Rubrique « Nature et sous-sol » du menu Carte : la géologie, puis la faune et la flore (lot 3.8).
// La couche géologique (geologie.js) ne se charge qu'à la première activation, ou au démarrage si elle était allumée.
import { lire, ecrire } from './reglages.js';
import { poser, surLangue, ta } from './i18n.js';
import { pourcent } from './unites.js';

const ICONE_STRATES = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M3 7c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 17c3-2 6 2 9 0s6-2 9 0"/></svg>`;

export function creerNatureSousSol(map) {
  const panneau = document.createElement('div');
  panneau.className = 'nature-panneau';
  panneau.innerHTML = `
    <div class="geologie">
      <h3 data-i18n="geologie.titre"></h3>
      <div class="relief-bascule geologie-choix" role="group" ${ta('aria-label', 'geologie.titre')}>
        <button type="button" aria-pressed="false">${ICONE_STRATES}<span data-i18n="geologie.afficher"></span></button>
      </div>
      <p class="note geologie-hors-ligne" data-i18n="geologie.hors-ligne-off"></p>
      <div class="geologie-details" hidden>
        <p class="note geologie-etat" role="status" hidden></p>
        <div class="relief-reglage">
          <div class="relief-entete">
            <span data-i18n="geologie.opacite"></span>
            <strong class="geologie-opacite-valeur"></strong>
          </div>
          <input type="range" class="geologie-opacite" min="0.2" max="1" step="0.05" ${ta('aria-label', 'geologie.opacite')}>
        </div>
        <p class="note" data-i18n="geologie.aide"></p>
        <p class="note geologie-credit" data-i18n="geologie.credit"></p>
      </div>
    </div>
  `;
  panneau.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));

  const bouton = panneau.querySelector('.geologie-choix button');
  const details = panneau.querySelector('.geologie-details');
  const note = panneau.querySelector('.geologie-etat');
  const curseur = panneau.querySelector('.geologie-opacite');
  const valeurOpacite = panneau.querySelector('.geologie-opacite-valeur');

  let actif = lire('geologie', false);
  let module = null; // promesse de la couche chargée (geologie.js)

  // Ce qui manque sur la carte : hors de France, hors ligne, service en panne
  function surEtat(etatCouche) {
    note.hidden = etatCouche === 'ok';
    if (!note.hidden) poser(note, `geologie.etat-${etatCouche}`);
  }

  const charger = () => {
    module ??= import('./geologie.js').then((m) => m.initGeologie(map, { surEtat, eteindre: () => basculer(false) }));
    return module;
  };

  function majBouton() {
    bouton.classList.toggle('actif', actif);
    bouton.setAttribute('aria-pressed', String(actif));
    // Hors ligne, on ne peut pas l'allumer (grisé), mais toujours l'éteindre
    if (actif) delete bouton.dataset.reseauRequis;
    else bouton.dataset.reseauRequis = '';
    details.hidden = !actif;
  }

  async function basculer(oui) {
    actif = oui;
    ecrire('geologie', oui);
    majBouton();
    if (!oui && !module) return;
    const geologie = await charger();
    // Un second appui a pu arriver pendant le chargement
    geologie.afficher(actif);
  }
  bouton.addEventListener('click', () => basculer(!actif));

  // ---------- Opacité ----------
  const afficherOpacite = (v) => { valeurOpacite.textContent = pourcent(v * 100); };
  curseur.value = lire('geologie-opacite', 0.7);
  afficherOpacite(Number(curseur.value));
  curseur.addEventListener('input', async () => {
    const v = Number(curseur.value);
    afficherOpacite(v);
    (await charger()).opacite(v);
  });
  surLangue(() => {
    afficherOpacite(Number(curseur.value));
    module?.then((g) => g.rafraichir());
  });

  majBouton();
  if (actif) basculer(true);

  return {
    id: 'nature',
    labelCle: 'nature.titre',
    icone: 'nature',
    panneau,
    activer() {},
    desactiver() {},
  };
}
