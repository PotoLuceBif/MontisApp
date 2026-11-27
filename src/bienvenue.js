import { ecrire } from './reglages.js';
import { surLangue, t } from './i18n.js';
import { suivreGlisse } from './geste-feuille.js';

// « Montis en 20 secondes » (lot R.5, 26 novembre 2026) : au tout premier lancement, ce que fait l'appli et
// ce qu'il y a dans chaque onglet. Une fois fermée, elle ne revient plus (`bienvenue-vue`), sauf par
// « Revoir la présentation » des Paramètres. Chargée à la demande : rien de plus au démarrage.
// `icone(nom)` : le dessin des icônes d'onglets de menu.js, pour qu'elles soient les mêmes que la barre.
// [icône, nom de l'onglet, texte, nombre de sous-sections] ; une sous-section : `<texte>-<n>` = « Nom|ce qu'on y fait »
const ONGLETS = [
  ['onglet-carte', 'menu.carte', 'bienvenue.carte', 4],
  ['onglet-preparer', 'onglets.preparer', 'bienvenue.preparer', 4],
  ['onglet-meteo', 'menu.meteo', 'bienvenue.meteo', 3],
  ['onglet-traces', 'onglets.traces', 'bienvenue.traces', 3],
  ['onglet-explorer', 'onglets.explorer', 'bienvenue.plus', 4],
];
const CHEVRON = '<svg class="bienvenue-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

let ouverte = null;
let deplie = -1; // ligne dépliée : une à la fois, gardée le temps de la session

export function montrerBienvenue({ icone }) {
  if (ouverte) return;
  const fond = document.createElement('div');
  fond.className = 'bienvenue-fond';
  const carte = document.createElement('section');
  carte.className = 'bienvenue';
  carte.setAttribute('role', 'dialog');
  carte.setAttribute('aria-modal', 'true');
  carte.setAttribute('aria-labelledby', 'bienvenue-titre');
  fond.append(carte);

  function remplir() {
    carte.innerHTML = `
      <header class="bienvenue-tete">
        <img src="/logos/montis-icon-fullbleed.svg" alt="" width="52" height="52" />
        <div>
          <h2 id="bienvenue-titre"></h2>
          <p class="bienvenue-accroche"></p>
        </div>
      </header>
      <ul class="bienvenue-onglets">
        ${ONGLETS.map(([nom], i) => `<li><button type="button" class="bienvenue-ligne" aria-expanded="false" aria-controls="bienvenue-sous-${i}"><span class="bienvenue-icone">${icone(nom)}</span><span class="bienvenue-textes"><strong></strong><small></small></span>${CHEVRON}</button><ul class="bienvenue-sous" id="bienvenue-sous-${i}" hidden></ul></li>`).join('')}
      </ul>
      <p class="bienvenue-astuce"></p>
      <button type="button" class="bienvenue-ok"></button>`;
    carte.querySelector('h2').textContent = t('bienvenue.titre');
    carte.querySelector('.bienvenue-accroche').textContent = t('params.accroche');
    carte.querySelectorAll('.bienvenue-onglets > li').forEach((li, i) => {
      const [, nom, texte, nombre] = ONGLETS[i];
      li.querySelector('strong').textContent = t(nom);
      li.querySelector('small').textContent = t(texte);
      const sous = li.querySelector('.bienvenue-sous');
      for (let n = 1; n <= nombre; n += 1) {
        const [titre, detail] = t(`${texte}-${n}`).split('|');
        const ligne = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = titre;
        const span = document.createElement('span');
        span.textContent = detail ?? '';
        ligne.append(b, span);
        sous.append(ligne);
      }
      li.querySelector('.bienvenue-ligne').addEventListener('click', () => {
        deplie = deplie === i ? -1 : i;
        majDeplie();
      });
    });
    majDeplie();
    carte.querySelector('.bienvenue-astuce').textContent = t('bienvenue.astuce');
    const ok = carte.querySelector('.bienvenue-ok');
    ok.textContent = t('bienvenue.ok');
    ok.addEventListener('click', fermer);
  }

  // Un appui sur une ligne montre ses sous-sections ; une seule ouverte à la fois
  function majDeplie() {
    carte.querySelectorAll('.bienvenue-onglets > li').forEach((li, i) => {
      const oui = i === deplie;
      li.classList.toggle('ouvert', oui);
      li.querySelector('.bienvenue-ligne').setAttribute('aria-expanded', String(oui));
      li.querySelector('.bienvenue-sous').hidden = !oui;
    });
  }

  function fermer() {
    ecrire('bienvenue-vue', true);
    document.removeEventListener('keydown', echap);
    fond.classList.add('sortie');
    setTimeout(() => fond.remove(), 200);
    ouverte = null;
  }
  const echap = (event) => {
    if (event.key === 'Escape') fermer();
  };

  remplir();
  surLangue(() => ouverte === fond && remplir());
  // Un appui à côté ferme aussi ; sur téléphone, la feuille se glisse vers le bas
  fond.addEventListener('click', (event) => {
    if (event.target === fond) fermer();
  });
  document.addEventListener('keydown', echap);
  document.body.append(fond);
  suivreGlisse(carte, (cible) => !cible.closest('button'), { bas: fermer });
  ouverte = fond;
}
