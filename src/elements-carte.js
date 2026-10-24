import { lire, ecrire, quandPret } from './reglages.js';
import { afficherSommets } from './sommets.js';
import { afficherBatiments } from './batiments.js';
import { afficherForets, afficherEaux, afficherGlaciers } from './nature.js';

// Pour ajouter un élément : une ligne ici
const calques = [
  { cle: 'sommets', label: 'Sommets (noms et altitudes)', defaut: false, appliquer: afficherSommets },
  { cle: 'forets', label: 'Forêts', defaut: false, appliquer: afficherForets },
  { cle: 'eaux', label: 'Lacs et rivières', defaut: false, appliquer: afficherEaux },
  { cle: 'glaciers', label: 'Glaciers', defaut: false, appliquer: afficherGlaciers },
  { cle: 'batiments', label: 'Bâtiments 3D', defaut: false, appliquer: afficherBatiments },
];

export function creerElementsCarte(map) {
  const panneau = document.createElement('div');

  for (const c of calques) {
    const actifAuDepart = lire(c.cle, c.defaut);

    const ligne = document.createElement('label');
    ligne.className = 'option-case';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = actifAuDepart;
    ligne.append(input, ' ' + c.label);
    panneau.appendChild(ligne);

    // Rétablit l'état précédent dès que la carte est prête
    if (actifAuDepart) quandPret(map, () => c.appliquer(map, true));

    input.addEventListener('change', () => {
      c.appliquer(map, input.checked);
      ecrire(c.cle, input.checked);
    });
  }

  return {
    id: 'elements',
    label: 'Éléments de la carte',
    icone: '📍',
    panneau,
    activer() {},
    desactiver() {},
  };
}