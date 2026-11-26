import { surLangue, t, ta } from './i18n.js';

// Bouton « ? » d'un graphique difficile à lire (demande du propriétaire du 25 novembre 2026) : un appui
// déplie juste en dessous une courte explication, refermée par sa croix ou le même bouton. Jamais ouverte
// d'office. Le texte est `aide.<cle>` ; une ligne vide sépare les paragraphes.
// Renvoie { bouton, bulle } : l'appelant pose le bouton près du titre et la bulle sous le graphique.
export function creerAide(cle) {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = 'aide-bouton';
  bouton.setAttribute('aria-expanded', 'false');
  bouton.textContent = '?';

  const bulle = document.createElement('div');
  bulle.className = 'aide-bulle';
  bulle.hidden = true;
  bulle.setAttribute('role', 'note');

  function remplir() {
    bouton.setAttribute('aria-label', t('aide.ouvrir'));
    bouton.title = t('aide.ouvrir');
    bulle.innerHTML = `<button type="button" class="aide-fermer" ${ta('aria-label', 'aide.fermer')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
    for (const texte of t(`aide.${cle}`).split('\n')) {
      if (!texte.trim()) continue;
      const p = document.createElement('p');
      p.textContent = texte;
      bulle.append(p);
    }
    bulle.querySelector('.aide-fermer').addEventListener('click', () => montrer(false));
  }

  function montrer(oui) {
    bulle.hidden = !oui;
    bouton.setAttribute('aria-expanded', String(oui));
    bouton.classList.toggle('actif', oui);
    if (oui) bulle.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  bouton.addEventListener('click', (event) => {
    event.stopPropagation();
    montrer(bulle.hidden);
  });
  remplir();
  surLangue(remplir);
  return { bouton, bulle };
}
