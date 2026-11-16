import { lire, ecrire, quandPret } from './reglages.js';
import { afficherSommets } from './sommets.js';
import { afficherVilles, afficherRefuges, afficherFrontieres } from './lieux.js';
import { afficherBatiments } from './batiments.js';
import { afficherGares, afficherRails } from './transports.js';
import { afficherForets, afficherEaux, afficherGlaciers, afficherParcs } from './nature.js';
import { poser, surLangue, t } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';

// Pour ajouter un élément : une ligne dans le bon groupe (ou un nouveau groupe = un nouvel onglet)
const GROUPES = [
  {
    id: 'lieux',
    nom: 'elements.lieux',
    calques: [
      { cle: 'villes', label: 'elements.villes', aide: 'elements.villes-aide', defaut: false, appliquer: afficherVilles },
      { cle: 'refuges', label: 'elements.refuges', aide: 'elements.refuges-aide', defaut: false, appliquer: afficherRefuges },
      { cle: 'frontieres', label: 'elements.frontieres', aide: 'elements.frontieres-aide', defaut: false, appliquer: afficherFrontieres },
    ],
  },
  {
    id: 'nature',
    nom: 'elements.nature',
    calques: [
      { cle: 'sommets', label: 'elements.sommets', aide: 'elements.sommets-aide', defaut: false, appliquer: afficherSommets },
      { cle: 'forets', label: 'elements.forets', aide: 'elements.forets-aide', defaut: false, appliquer: afficherForets },
      { cle: 'eaux', label: 'elements.eaux', aide: 'elements.eaux-aide', defaut: true, appliquer: afficherEaux },
      { cle: 'glaciers', label: 'elements.glaciers', aide: 'elements.glaciers-aide', defaut: false, appliquer: afficherGlaciers },
      { cle: 'parcs', label: 'elements.parcs', aide: 'elements.parcs-aide', defaut: false, appliquer: afficherParcs },
    ],
  },
  {
    id: 'construit',
    nom: 'elements.construit',
    calques: [
      { cle: 'batiments', label: 'elements.batiments', aide: 'elements.batiments-aide', defaut: true, appliquer: afficherBatiments },
      // Voies ferrées : déjà dans le fond Montis, allumées par défaut comme les bâtiments (sans pastille)
      { cle: 'rails', label: 'elements.rails', aide: 'elements.rails-aide', defaut: true, appliquer: afficherRails },
      { cle: 'gares', label: 'elements.gares', aide: 'elements.gares-aide', defaut: false, appliquer: afficherGares },
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

      // Pastille sur la carte tant que l'élément est affiché : ✕ l'enlève, un appui ouvre son onglet.
      // Un élément allumé par défaut (bâtiments) n'en a pas, comme les courbes : il fait partie du fond.
      const avecPastille = !c.defaut;
      const pastilleCouche = creerPastilleCouche({
        rubrique: 'elements',
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
      const pastille = { montrer: (oui) => pastilleCouche.montrer(oui && avecPastille) };
      rang += 1;

      // Rétablit l'état précédent dès que la carte est prête
      // Un élément allumé par défaut est dans le style : éteint par l'utilisateur, il faut le cacher aussi
      if (actifAuDepart || c.defaut) quandPret(map, () => c.appliquer(map, actifAuDepart));
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