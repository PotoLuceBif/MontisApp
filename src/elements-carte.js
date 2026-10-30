import { lire, ecrire, quandPret } from './reglages.js';
import { afficherSommets } from './sommets.js';
import { afficherVilles, afficherRefuges } from './lieux.js';
import { afficherBatiments } from './batiments.js';
import { afficherForets, afficherEaux, afficherGlaciers, afficherParcs } from './nature.js';

// Pour ajouter un élément : une ligne dans le bon groupe (ou un nouveau groupe = un nouvel onglet)
const GROUPES = [
  {
    id: 'lieux',
    nom: 'Lieux',
    calques: [
      { cle: 'sommets', label: 'Sommets', aide: 'Noms et altitudes, dès le zoom 9', defaut: false, appliquer: afficherSommets },
      { cle: 'villes', label: 'Villes et villages', aide: 'Noms des communes et des hameaux', defaut: false, appliquer: afficherVilles },
      { cle: 'refuges', label: 'Refuges et cabanes', aide: 'Refuges gardés et abris, dès le zoom 7', defaut: false, appliquer: afficherRefuges },
    ],
  },
   {
    id: 'nature',
    nom: 'Nature',
    calques: [
      { cle: 'forets', label: 'Forêts', aide: 'Motif d’arbres dès le zoom 11', defaut: false, appliquer: afficherForets },
      { cle: 'eaux', label: 'Lacs et rivières', aide: 'Avec leurs noms', defaut: false, appliquer: afficherEaux },
      { cle: 'glaciers', label: 'Glaciers', aide: 'Hachures dès le zoom 9', defaut: false, appliquer: afficherGlaciers },
      { cle: 'parcs', label: 'Parcs et réserves', aide: 'Limites et noms, dès le zoom 5', defaut: false, appliquer: afficherParcs },
    ],
  },
  {
    id: 'construit',
    nom: 'Construit',
    calques: [
      { cle: 'batiments', label: 'Bâtiments 3D', aide: 'Dès le zoom 14, plus lisibles en 3D', defaut: false, appliquer: afficherBatiments },
    ],
  },
];

export function creerElementsCarte(map) {
  const panneau = document.createElement('div');

  let groupeCourant = lire('elements-onglet', GROUPES[0].id);
  if (!GROUPES.some((g) => g.id === groupeCourant)) groupeCourant = GROUPES[0].id;

  const onglets = document.createElement('div');
  onglets.className = 'fond-onglets';
  onglets.setAttribute('role', 'tablist');
  panneau.appendChild(onglets);

  const boutons = new Map();
  const blocs = new Map();

  // Texte des onglets (avec le nombre d'éléments actifs) et onglet visible
  function majOnglets() {
    for (const g of GROUPES) {
      const nb = g.calques.filter((c) => lire(c.cle, c.defaut)).length;
      const bouton = boutons.get(g.id);
      bouton.textContent = nb ? `${g.nom} · ${nb}` : g.nom;
      bouton.classList.toggle('actif', g.id === groupeCourant);
      blocs.get(g.id).hidden = g.id !== groupeCourant;
    }
  }

  for (const g of GROUPES) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.addEventListener('click', () => {
      groupeCourant = g.id;
      ecrire('elements-onglet', g.id);
      majOnglets();
    });
    onglets.appendChild(bouton);
    boutons.set(g.id, bouton);

    const bloc = document.createElement('div');
    panneau.appendChild(bloc);
    blocs.set(g.id, bloc);

    for (const c of g.calques) {
      const actifAuDepart = lire(c.cle, c.defaut);

      const ligne = document.createElement('label');
      ligne.className = 'option-case';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = actifAuDepart;
      const texte = document.createElement('span');
      texte.textContent = ' ' + c.label;
      const aide = document.createElement('small');
      aide.textContent = c.aide;
      ligne.append(input, texte, aide);
      bloc.appendChild(ligne);

      // Rétablit l'état précédent dès que la carte est prête
      if (actifAuDepart) quandPret(map, () => c.appliquer(map, true));

      input.addEventListener('change', () => {
        c.appliquer(map, input.checked);
        ecrire(c.cle, input.checked);
        majOnglets();
        window.dispatchEvent(new CustomEvent('calque', { detail: { cle: c.cle, actif: input.checked } }));
      });

      // Reste synchronisé avec les raccourcis d'autres panneaux (ex. activité Randonnée)
      window.addEventListener('calque', (e) => {
        if (e.detail.cle === c.cle && input.checked !== e.detail.actif) {
          input.checked = e.detail.actif;
          majOnglets();
        }
      });
    }
  }

  majOnglets();

  return {
    id: 'elements',
    label: 'Éléments de la carte',
    icone: 'elements',
    panneau,
    activer() {},
    desactiver() {},
  };
}