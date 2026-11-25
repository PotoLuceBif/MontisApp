import { lire, ecrire, quandPret } from './reglages.js';
import { afficherSommets } from './sommets.js';
import { afficherVilles, afficherRefuges, afficherFrontieres } from './lieux.js';
import { afficherBatiments } from './batiments.js';
import { afficherGares, afficherRails } from './transports.js';
import { afficherPointUtile } from './points-utiles.js';
import { afficherForets, afficherEaux, afficherGlaciers, afficherParcs } from './nature.js';
import { poser, surLangue, t } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';
import { etat } from './options-carte.js';

// fondMontis : élément qui fait partie du fond Montis (bâtiments, eaux, voies ferrées) : sur ce fond,
// pas de pastille, et il est rallumé chaque fois qu'on revient au fond Montis ; on peut l'éteindre
// ici. Sur les autres fonds, il a sa pastille comme les autres éléments (demande du propriétaire
// du 17 novembre 2026).
// Pour ajouter un élément : une ligne dans le bon groupe (ou un nouveau groupe = un nouveau titre)
const GROUPES = [
  {
    id: 'lieux',
    nom: 'elements.lieux',
    calques: [
      { cle: 'villes', label: 'elements.villes', aide: 'elements.villes-aide', defaut: false, appliquer: afficherVilles },
      { cle: 'refuges', label: 'elements.refuges', aide: 'elements.refuges-aide', defaut: false, appliquer: afficherRefuges },
      { cle: 'frontieres', label: 'elements.frontieres', aide: 'elements.frontieres-aide', defaut: false, appliquer: afficherFrontieres },
      { cle: 'abris', label: 'elements.abris', aide: 'elements.abris-aide', defaut: false, appliquer: (map, oui) => afficherPointUtile(map, 'abris', oui) },
      { cle: 'points-eau', label: 'elements.points-eau', aide: 'elements.points-eau-aide', defaut: false, appliquer: (map, oui) => afficherPointUtile(map, 'points-eau', oui) },
    ],
  },
  {
    id: 'nature',
    nom: 'elements.nature',
    calques: [
      { cle: 'sommets', label: 'elements.sommets', aide: 'elements.sommets-aide', defaut: false, appliquer: afficherSommets },
      { cle: 'forets', label: 'elements.forets', aide: 'elements.forets-aide', defaut: false, appliquer: afficherForets },
      { cle: 'eaux', label: 'elements.eaux', aide: 'elements.eaux-aide', defaut: true, fondMontis: true, appliquer: afficherEaux },
      { cle: 'glaciers', label: 'elements.glaciers', aide: 'elements.glaciers-aide', defaut: false, appliquer: afficherGlaciers },
      { cle: 'parcs', label: 'elements.parcs', aide: 'elements.parcs-aide', defaut: false, appliquer: afficherParcs },
    ],
  },
  {
    id: 'construit',
    nom: 'elements.construit',
    calques: [
      { cle: 'batiments', label: 'elements.batiments', aide: 'elements.batiments-aide', defaut: true, fondMontis: true, appliquer: afficherBatiments },
      { cle: 'rails', label: 'elements.rails', aide: 'elements.rails-aide', defaut: true, fondMontis: true, appliquer: afficherRails },
      { cle: 'parkings', label: 'elements.parkings', aide: 'elements.parkings-aide', defaut: false, appliquer: (map, oui) => afficherPointUtile(map, 'parkings', oui) },
      { cle: 'gares', label: 'elements.gares', aide: 'elements.gares-aide', defaut: false, appliquer: afficherGares },
    ],
  },
];

export function creerElementsCarte(map) {
  const panneau = document.createElement('div');

  // Les groupes l'un sous l'autre, chacun sous son titre (plus de sous-onglets : demande du propriétaire
  // du 25 novembre 2026) ; le titre dit combien d'éléments sont allumés
  panneau.className = 'elements-groupes';
  const titres = new Map();
  let rang = 0;

  function majOnglets() {
    for (const g of GROUPES) {
      const nb = g.calques.filter((c) => lire(c.cle, c.defaut)).length;
      const titre = titres.get(g.id);
      titre.querySelector('span').textContent = t(g.nom);
      titre.querySelector('small').textContent = nb ? t('elements.allumes', { n: nb }) : '';
    }
  }

  for (const g of GROUPES) {
    const titre = document.createElement('h4');
    titre.className = 'fond-groupe elements-titre';
    titre.innerHTML = '<span></span><small></small>';
    panneau.appendChild(titre);
    titres.set(g.id, titre);

    const bloc = document.createElement('div');
    bloc.className = 'elements-bloc';
    panneau.appendChild(bloc);

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
      // Un élément du fond Montis n'en a pas sur ce fond, comme les courbes.
      const avecPastille = () => !(c.fondMontis && etat.fond === 'montis');
      const pastilleCouche = creerPastilleCouche({
        rubrique: 'elements',
        ordre: 10 + rang,
        nom: () => t(`elements.court-${c.cle}`),
        onOuvrir: () => {
          ouvrirReglage('fond', 'elements');
          requestAnimationFrame(() => ligne.scrollIntoView({ block: 'center' }));
        },
        onRetirer: () => {
          input.checked = false;
          input.dispatchEvent(new Event('change'));
        },
      });
      const pastille = { montrer: (oui) => pastilleCouche.montrer(oui && avecPastille()) };
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

      if (c.fondMontis) {
        window.addEventListener('montis:fond-change', ({ detail }) => {
          if (detail.fond === 'montis' && detail.avant !== 'montis' && !input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change'));
          }
          pastille.montrer(input.checked);
        });
      }

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