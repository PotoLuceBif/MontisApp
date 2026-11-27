import { ecrire } from './reglages.js';
import { surLangue, t } from './i18n.js';
import { suivreGlisse } from './geste-feuille.js';

// « Montis en 20 secondes » (lot R.5, 26 novembre 2026) : au tout premier lancement, ce que fait l'appli et
// ce qu'il y a dans chaque onglet. Une fois fermée, elle ne revient plus (`bienvenue-vue`), sauf par
// « Revoir la présentation » des Paramètres. Chargée à la demande : rien de plus au démarrage.
// `icone(nom)` : le dessin des icônes d'onglets de menu.js, pour qu'elles soient les mêmes que la barre.
const ONGLETS = [
  ['onglet-carte', 'menu.carte', 'bienvenue.carte'],
  ['onglet-preparer', 'onglets.preparer', 'bienvenue.preparer'],
  ['onglet-meteo', 'menu.meteo', 'bienvenue.meteo'],
  ['onglet-traces', 'onglets.traces', 'bienvenue.traces'],
  ['onglet-explorer', 'onglets.explorer', 'bienvenue.plus'],
];

let ouverte = null;

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
        ${ONGLETS.map(([nom]) => `<li><span class="bienvenue-icone">${icone(nom)}</span><span><strong></strong><small></small></span></li>`).join('')}
      </ul>
      <p class="bienvenue-astuce"></p>
      <button type="button" class="bienvenue-ok"></button>`;
    carte.querySelector('h2').textContent = t('bienvenue.titre');
    carte.querySelector('.bienvenue-accroche').textContent = t('params.accroche');
    carte.querySelectorAll('.bienvenue-onglets li').forEach((li, i) => {
      li.querySelector('strong').textContent = t(ONGLETS[i][1]);
      li.querySelector('small').textContent = t(ONGLETS[i][2]);
    });
    carte.querySelector('.bienvenue-astuce').textContent = t('bienvenue.astuce');
    const ok = carte.querySelector('.bienvenue-ok');
    ok.textContent = t('bienvenue.ok');
    ok.addEventListener('click', fermer);
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
