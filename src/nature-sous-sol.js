// Rubrique « Nature et sous-sol » du menu Carte : la géologie, puis la faune et la flore (lot 3.8).
// La couche géologique (geologie.js) ne se charge qu'à la première activation, ou au démarrage si elle était allumée.
import { lire, ecrire } from './reglages.js';
import { poser, surLangue, ta } from './i18n.js';
import { pourcent } from './unites.js';
import { FAMILLES } from './geologie-familles.js';

const VUES = ['simple', 'detaillee'];

const ICONE_STRATES = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M3 7c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 17c3-2 6 2 9 0s6-2 9 0"/></svg>`;
// Cible : un appui sur la carte identifie la roche (vue détaillée)
const ICONE_CIBLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
const CHEVRON = '<svg class="geologie-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

// Une famille de roches : sa couleur, son nom, une ligne de résumé ; un appui déplie ce qu'elle change sur le terrain
const ligneFamille = ({ cle, couleur }) => `
  <li class="geologie-famille" data-famille="${cle}">
    <button type="button" class="geologie-famille-entete" aria-expanded="false">
      <i class="geologie-pastille" style="background: ${couleur}"></i>
      <span class="geologie-famille-textes">
        <strong data-i18n="geologie.roche-${cle}"></strong>
        <small data-i18n="geologie.resume-${cle}"></small>
      </span>
      ${CHEVRON}
    </button>
    <p class="geologie-terrain" data-i18n="geologie.terrain-${cle}" hidden></p>
  </li>`;

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
        <div class="relief-bascule geologie-vues" role="group" ${ta('aria-label', 'geologie.vue')}>
          ${VUES.map((vue) => `<button type="button" data-vue="${vue}" data-i18n="geologie.vue-${vue}"></button>`).join('')}
        </div>
        <p class="note geologie-etat" role="status" hidden></p>
        <div class="geologie-vue" data-pour="detaillee">
          <div class="geologie-astuce">
            <span class="geologie-astuce-icone" aria-hidden="true">${ICONE_CIBLE}</span>
            <span class="geologie-astuce-textes">
              <strong data-i18n="geologie.identifier"></strong>
              <span class="geologie-astuce-toucher" data-i18n="geologie.identifier-toucher"></span>
              <span class="geologie-astuce-cliquer" data-i18n="geologie.identifier-cliquer"></span>
            </span>
          </div>
        </div>
        <div class="relief-reglage">
          <div class="relief-entete">
            <span data-i18n="geologie.opacite"></span>
            <strong class="geologie-opacite-valeur"></strong>
          </div>
          <input type="range" class="geologie-opacite" min="0.2" max="1" step="0.05" ${ta('aria-label', 'geologie.opacite')}>
        </div>
        <div class="geologie-vue" data-pour="simple">
          <p class="note" data-i18n="geologie.simple-aide"></p>
          <ul class="geologie-familles">${FAMILLES.map(ligneFamille).join('')}</ul>
          <p class="note geologie-prudence" data-i18n="geologie.prudence"></p>
        </div>
        <div class="geologie-vue" data-pour="detaillee">
          <p class="note" data-i18n="geologie.detaillee-aide"></p>
        </div>
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
  const boutonsVue = panneau.querySelectorAll('.geologie-vues button');

  let actif = lire('geologie', false);
  let vue = lire('geologie-vue', 'simple');
  if (!VUES.includes(vue)) vue = 'simple';
  let module = null; // promesse de la couche chargée (geologie.js)

  // Ce qui manque sur la carte : trop loin, hors de France, hors ligne, service en panne
  function surEtat(etatCouche) {
    note.hidden = etatCouche === 'ok';
    if (!note.hidden) poser(note, `geologie.etat-${etatCouche}`);
  }

  const charger = () => {
    module ??= import('./geologie.js').then((m) => m.initGeologie(map, { surEtat, eteindre: () => basculer(false) }));
    return module;
  };

  function majBoutons() {
    bouton.classList.toggle('actif', actif);
    bouton.setAttribute('aria-pressed', String(actif));
    // Hors ligne, on ne peut pas l'allumer (grisé), mais toujours l'éteindre
    if (actif) delete bouton.dataset.reseauRequis;
    else bouton.dataset.reseauRequis = '';
    details.hidden = !actif;
    boutonsVue.forEach((b) => {
      b.classList.toggle('actif', b.dataset.vue === vue);
      b.setAttribute('aria-pressed', String(b.dataset.vue === vue));
    });
    panneau.querySelectorAll('.geologie-vue').forEach((bloc) => { bloc.hidden = bloc.dataset.pour !== vue; });
  }

  async function basculer(oui) {
    actif = oui;
    ecrire('geologie', oui);
    majBoutons();
    if (!oui && !module) return;
    const geologie = await charger();
    // Un second appui a pu arriver pendant le chargement
    geologie.afficher(actif, vue);
  }
  bouton.addEventListener('click', () => basculer(!actif));

  boutonsVue.forEach((b) => b.addEventListener('click', () => {
    vue = b.dataset.vue;
    ecrire('geologie-vue', vue);
    basculer(true);
  }));

  // ---------- Familles : un appui déplie ce que la roche change sur le terrain ----------
  panneau.querySelectorAll('.geologie-famille-entete').forEach((entete) => {
    entete.addEventListener('click', () => {
      const ouvert = entete.getAttribute('aria-expanded') !== 'true';
      entete.setAttribute('aria-expanded', String(ouvert));
      entete.nextElementSibling.hidden = !ouvert;
    });
  });

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

  majBoutons();
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

