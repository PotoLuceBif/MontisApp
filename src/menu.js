import { creerActiviteParapente } from './activite-parapente.js';
import { creerFondDeCarte } from './fond-de-carte.js';
import { creerOptionRelief } from './relief.js';
import { creerElementsCarte } from './elements-carte.js';
import { creerPageParametres } from './parametres.js';
import { lire, ecrire } from './reglages.js';

// Module « à venir » : une ligne dans le menu avec un petit texte
function creerModuleBientot(id, label, icone, texte) {
  const panneau = document.createElement('div');
  panneau.innerHTML = `<p>${texte}</p>`;
  return { id, label, icone, panneau, activer() {}, desactiver() {} };
}

export function initMenu(map) {
  // Pour ajouter une fonction : créer un module et l'ajouter dans la bonne section.
  // exclusif = un seul module actif à la fois dans la section (comme les activités).
  const sections = [
    {
      titre: 'Activité',
      exclusif: true,
      ouverte: true,
      modules: [
        creerActiviteParapente(map),
        creerModuleBientot('velo', 'Vélo', '🚴', 'Cette activité arrive bientôt. Idées : sentiers VTT, dénivelé, profil d’altitude.'),
        creerModuleBientot('ski', 'Ski', '⛷️', 'Cette activité arrive bientôt. Idées : pistes, remontées, pentes et expositions.'),
      ],
    },
    {
      titre: 'Météo',
      exclusif: false,
      ouverte: false,
      modules: [
        creerModuleBientot('radar', 'Radar de pluie', '🌧️', 'Prochaine étape : radar animé sur les 2 dernières heures.'),
        creerModuleBientot('vent', 'Vent et prévisions', '💨', 'À venir : choix du modèle de prévision.'),
      ],
    },
    {
      titre: 'Carte',
      exclusif: false,
      ouverte: false,
      modules: [
        creerFondDeCarte(map),
        creerOptionRelief(map), // inclut les courbes de niveau
        creerElementsCarte(map),
      ],
    },
  ];

  // ---------- Bouton et tiroir ----------
  const bouton = document.createElement('button');
  bouton.id = 'menu-bouton';
  bouton.textContent = '☰';
  bouton.setAttribute('aria-label', 'Menu');

  const tiroir = document.createElement('aside');
  tiroir.id = 'menu-tiroir';
  tiroir.innerHTML = `
    <div class="menu-entete">
      <strong>Montis</strong>
      <button id="menu-fermer" aria-label="Fermer">✕</button>
    </div>
    <div class="menu-corps"></div>
    <div class="menu-pied">
      <button id="menu-params" type="button" class="btn-secondaire">⚙️ Paramètres</button>
    </div>
    <div class="menu-parametres"></div>
  `;
  document.body.append(bouton, tiroir);
  const corps = tiroir.querySelector('.menu-corps');

  const ouvrir = (ouvert) => tiroir.classList.toggle('ouvert', ouvert);
  bouton.addEventListener('click', () => ouvrir(!tiroir.classList.contains('ouvert')));
  tiroir.querySelector('#menu-fermer').addEventListener('click', () => ouvrir(false));

  // ---------- Page Paramètres ----------
  const montrerParametres = (oui) => tiroir.classList.toggle('en-parametres', oui);
  tiroir
    .querySelector('.menu-parametres')
    .appendChild(creerPageParametres({ retour: () => montrerParametres(false) }));
  tiroir.querySelector('#menu-params').addEventListener('click', () => montrerParametres(true));

  // ---------- Sections et modules ----------
  function demarrer(e) {
    e.actif = true;
    e.ligne.classList.add('actif');
    e.contenu.style.display = 'block';
    e.module.activer();
  }

  function arreter(e) {
    e.actif = false;
    e.ligne.classList.remove('actif');
    e.contenu.style.display = 'none';
    e.module.desactiver();
  }

  const sectionsOuvertes = lire('menu-sections', {});
  const activiteSauvee = lire('menu-activite', null);

  for (const section of sections) {
    const details = document.createElement('details');
    details.className = 'menu-section';
    details.open = section.titre in sectionsOuvertes
      ? !!sectionsOuvertes[section.titre]
      : !!section.ouverte;

    details.addEventListener('toggle', () => {
      const o = lire('menu-sections', {});
      o[section.titre] = details.open;
      ecrire('menu-sections', o);
    });

    const titre = document.createElement('summary');
    titre.textContent = section.titre;
    details.appendChild(titre);

    const etats = [];
    for (const module of section.modules) {
      const bloc = document.createElement('div');
      bloc.className = 'menu-module';

      const ligne = document.createElement('button');
      ligne.className = 'menu-ligne';
      ligne.textContent = `${module.icone} ${module.label}`;

      const contenu = document.createElement('div');
      contenu.className = 'menu-contenu';
      contenu.style.display = 'none';
      contenu.appendChild(module.panneau);

      bloc.append(ligne, contenu);
      details.appendChild(bloc);

      const etat = { module, ligne, contenu, actif: false };
      etats.push(etat);

      ligne.addEventListener('click', () => {
        if (etat.actif) {
          arreter(etat);
          if (section.exclusif) ecrire('menu-activite', null);
          return;
        }
        if (section.exclusif) {
          etats.forEach((o) => o !== etat && o.actif && arreter(o));
          ecrire('menu-activite', module.id);
        }
        demarrer(etat);
      });
    }

    // Rétablit l'activité choisie la dernière fois (jamais deux à la fois)
    if (section.exclusif && activiteSauvee) {
      const e = etats.find((x) => x.module.id === activiteSauvee);
      if (e) {
        try {
          demarrer(e);
        } catch (err) {
          console.warn('Activité non rétablie :', err);
        }
      }
    }

    corps.appendChild(details);
  }
}