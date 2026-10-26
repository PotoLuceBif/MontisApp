import { etat } from './options-carte.js';
import { obtenirBarre } from './barre-haut.js';

// Sélecteur 2D | 3D toujours visible, à gauche de la recherche
export function initBasculeMode() {
  if (document.getElementById('bascule-mode')) return;

  const racine = document.createElement('div');
  racine.id = 'bascule-mode';
  racine.setAttribute('role', 'group');
  racine.setAttribute('aria-label', 'Mode d’affichage');
  racine.innerHTML = `
    <button type="button" data-mode="2d">2D</button>
    <button type="button" data-mode="3d">3D</button>
  `;
  obtenirBarre().prepend(racine);

  const boutons = racine.querySelectorAll('button');

  const maj = (mode3D) =>
    boutons.forEach((b) => {
      const actif = (b.dataset.mode === '3d') === mode3D;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', String(actif));
    });
  maj(!!etat.mode3D);

  boutons.forEach((b) => {
    b.addEventListener('click', () => {
      const veut3d = b.dataset.mode === '3d';
      if (veut3d !== !!etat.mode3D && etat.basculerMode) etat.basculerMode();
    });
  });

  window.addEventListener('mode3d', (e) => maj(e.detail));
}