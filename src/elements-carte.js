import { lire, ecrire, quandPret } from './reglages.js';
import { afficherSommets } from './sommets.js';
import { afficherVilles, afficherRefuges, afficherFrontieres } from './lieux.js';
import { afficherBatiments } from './batiments.js';
import { afficherForets, afficherEaux, afficherGlaciers, afficherParcs } from './nature.js';
import { poser, surLangue, t } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';

// Pour ajouter un élément : une ligne dans le bon groupe (ou un nouveau groupe = un nouvel onglet)
const GROUPES = [
  {
    id: 'lieux',
    nom: 'elements.lieux',
    calques: [
      { cle: 'sommets', label: 'elements.sommets', aide: 'elements.sommets-aide', defaut: false, appliquer: afficherSommets },
      { cle: 'villes', label: 'elements.villes', aide: 'elements.villes-aide', defaut: false, appliquer: afficherVilles },
      { cle: 'refuges', label: 'elements.refuges', aide: 'elements.refuges-aide', defaut: false, appliquer: afficherRefuges },
      { cle: 'frontieres', label: 'elements.frontieres', aide: 'elements.frontieres-aide', defaut: false, appliquer: afficherFrontieres },
    ],
  },
   {
    id: 'nature',
    nom: 'elements.nature',
    calques: [
      { cle: 'forets', label: 'elements.forets', aide: 'elements.forets-aide', defaut: false, appliquer: afficherForets },
      { cle: 'eaux', label: 'elements.eaux', aide: 'elements.eaux-aide', defaut: false, appliquer: afficherEaux },
      { cle: 'glaciers', label: 'elements.glaciers', aide: 'elements.glaciers-aide', defaut: false, appliquer: afficherGlaciers },
      { cle: 'parcs', label: 'elements.parcs', aide: 'elements.parcs-aide', defaut: false, appliquer: afficherParcs },
    ],
  },
  {
    id: 'construit',
    nom: 'elements.construit',
    calques: [
      { cle: 'batiments', label: 'elements.batiments', aide: 'elements.batiments-aide', defaut: false, appliquer: afficherBatiments },
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
  let rang = 0;

  // Texte des onglets (avec le nombre d'éléments actifs) et onglet visible
  function majOnglets() {
    for (const g of GROUPES) {
      const nb = g.calques.filter((c) => lire(c.cle, c.defaut)).length;
      const bouton = boutons.get(g.id);
      bouton.textContent = nb ? `${t(g.nom)} · ${nb}` : t(g.nom);
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
      poser(texte, c.label);
      const aide = poser(document.createElement('small'), c.aide);
      ligne.append(input, ' ', texte, aide);
      bloc.appendChild(ligne);

      // Pastille sur la carte tant que l'élément est affiché : ✕ l'enlève, un appui ouvre son onglet
      const pastille = creerPastilleCouche({
        ordre: 10 + rang,
        nom: () => t(`elements.court-${c.cle}`),
        onOuvrir: () => {
          groupeCourant = g.id;
          ecrire('elements-onglet', g.id);
          majOnglets();
          ouvrirReglage('elements');
        },
        onRetirer: () => {
          input.checked = false;
          input.dispatchEvent(new Event('change'));
        },
      });
      rang += 1;

      // Rétablit l'état précédent dès que la carte est prête
      if (actifAuDepart) quandPret(map, () => c.appliquer(map, true));
      pastille.montrer(actifAuDepart);

      input.addEventListener('change', () => {
        c.appliquer(map, input.checked);
        ecrire(c.cle, input.checked);
        pastille.montrer(input.checked);
        majOnglets();
        window.dispatchEvent(new CustomEvent('calque', { detail: { cle: c.cle, actif: input.checked } }));
      });

      // Reste synchronisé avec les raccourcis d'autres panneaux (ex. activité Randonnée)
      window.addEventListener('calque', (e) => {
        if (e.detail.cle === c.cle && input.checked !== e.detail.actif) {
          input.checked = e.detail.actif;
          pastille.montrer(e.detail.actif);
          majOnglets();
        }
      });
    }
  }

  majOnglets();
  surLangue(majOnglets);

  return {
    id: 'elements',
    labelCle: 'elements.titre',
    icone: 'elements',
    panneau,
    activer() {},
    desactiver() {},
  };
}