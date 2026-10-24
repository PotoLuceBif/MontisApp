import { initParapente } from './parapente.js';
import { initPortee } from './portee.js';

export function creerActiviteParapente(map) {
  const donnees = initParapente(map); // couches créées, masquées au départ

  const panneau = document.createElement('div');
  panneau.innerHTML = `
    <h2>🪂 Parapente</h2>
    <h3>Affichage</h3>
    <label class="option"><input type="checkbox" id="opt-balises" checked> Balises de vent</label>
    <label class="option"><input type="checkbox" id="opt-sites" checked> Décollages et atterrissages</label>
    <h3>Outils</h3>
    <div id="section-portee"></div>
  `;

  const caseBalises = panneau.querySelector('#opt-balises');
  const caseSites = panneau.querySelector('#opt-sites');
  const portee = initPortee(map, panneau.querySelector('#section-portee'));

  caseBalises.addEventListener('change', () => donnees.setBalises(caseBalises.checked));
  caseSites.addEventListener('change', () => donnees.setSites(caseSites.checked));

  return {
    id: 'parapente',
    label: 'Parapente',
    icone: '🪂',
    panneau,
    activer() {
      donnees.setBalises(caseBalises.checked);
      donnees.setSites(caseSites.checked);
    },
    desactiver() {
      donnees.setBalises(false);
      donnees.setSites(false);
      portee.reinitialiser();
    },
  };
}