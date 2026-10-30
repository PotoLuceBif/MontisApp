import { creerActiviteParapente } from './activite-parapente.js';
import { creerFondDeCarte } from './fond-de-carte.js';
import { creerOptionRelief } from './relief.js';
import { creerElementsCarte } from './elements-carte.js';
import { creerPageParametres } from './parametres.js';
import { lire, ecrire } from './reglages.js';
import { creerActiviteRandonnee } from './activite-randonnee.js';
import { creerActiviteSki } from './activite-ski.js';
import { creerConditionsLocales, creerRadarPluie } from './meteo.js';

const ICONES_MENU = {
  activites: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  meteo: '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9.5 4.2 4.2 0 0 0 7 18Z"/><path d="m9 21-1 2m6-2-1 2m6-2-1 2"/>',
  carte: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  parapente: '<path d="M3 9c4-7 14-7 18 0-5-2-13-2-18 0Z"/><path d="m5 9 7 10 7-10"/><circle cx="12" cy="21" r="1"/>',
  rando: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  velo: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m6 17 4-8h4l4 8m-8-8 3 8h5m-8-11h3"/>',
  ski: '<path d="m4 20 6-16m4 16 6-16M3 15l4 2m10-2 4 2M8 6l3 2m5-2 3 2"/>',
  radar: '<path d="M12 12 20 5"/><path d="M5.6 18.4a9 9 0 1 1 12.8 0"/><path d="M8.4 15.6a5 5 0 1 1 7.2 0"/><circle cx="12" cy="12" r="1"/>',
  vent: '<path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/>',
  fond: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  relief: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  courbes: '<path d="M4 19c4-5 12-5 16 0M3 14c5-6 13-6 18 0M5 9c4-4 10-4 14 0"/>',
  elements: '<path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  reglages: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .8v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.8l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.8-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .8-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.8v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .8l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .8 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.8 3Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  generic: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
};

function creerIconeMenu(nom) {
  const dessin = ICONES_MENU[nom] || ICONES_MENU.generic;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessin}</svg>`;
}

function ajouterAideMaintien(bouton, libelle) {
  bouton.title = `${libelle} — maintenir appuyé pour afficher le libellé`;
  bouton.addEventListener('contextmenu', (event) => event.preventDefault());

  let minuterie;
  let maintienActif = false;
  let ignorerClic = false;

  bouton.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    minuterie = window.setTimeout(() => {
      maintienActif = true;
      bouton.classList.add('appui-long');
    }, 500);
  });

  const terminerMaintien = () => {
    window.clearTimeout(minuterie);
    if (!maintienActif) return;
    maintienActif = false;
    bouton.classList.remove('appui-long');
    ignorerClic = true;
    window.setTimeout(() => {
      ignorerClic = false;
    }, 0);
  };
  bouton.addEventListener('pointerup', terminerMaintien);
  bouton.addEventListener('pointercancel', terminerMaintien);
  bouton.addEventListener(
    'click',
    (event) => {
      if (!ignorerClic) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      ignorerClic = false;
    },
    true
  );
}

// Module « à venir » : une ligne dans le menu avec un petit texte
function creerModuleBientot(id, label, icone, texte) {
  const panneau = document.createElement('div');
  panneau.innerHTML = `<p>${texte}</p>`;
  return { id, label, icone, panneau, activer() {}, desactiver() {} };
}

export function initMenu(map) {
  // ---------- Bouton et tiroir ----------
  const bouton = document.createElement('button');
  bouton.id = 'menu-bouton';
  bouton.type = 'button';
  bouton.setAttribute('aria-label', 'Ouvrir le menu');
  bouton.setAttribute('aria-controls', 'menu-tiroir');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.innerHTML = `
    <img src="/favicon.svg" alt="" width="30" height="30" />
  `;
  bouton.setAttribute('aria-label', 'Ouvrir les activités');
  bouton.title = 'Activités';

  const boutonParametres = document.createElement('button');
  boutonParametres.id = 'menu-parametres-bouton';
  boutonParametres.type = 'button';
  boutonParametres.setAttribute('aria-label', 'Ouvrir les paramètres');
  boutonParametres.setAttribute('aria-controls', 'menu-tiroir');
  boutonParametres.innerHTML = creerIconeMenu('reglages');
  boutonParametres.title = 'Paramètres';

  const tiroir = document.createElement('aside');
  tiroir.id = 'menu-tiroir';
  tiroir.setAttribute('aria-label', 'Menu principal');
  tiroir.innerHTML = `
    <div class="menu-entete">
      <div class="menu-marque">
        <span class="menu-logotype">
          <img src="/favicon.svg" alt="" width="34" height="34" />
          <strong>Montis</strong>
        </span>
        <span class="menu-sous-titre">ACTIVITÉS MONTAGNE</span>
      </div>
      <button id="menu-fermer" type="button" aria-label="Fermer le menu">${creerIconeMenu('close')}</button>
    </div>
    <div class="menu-corps" aria-label="Activités"></div>
    <div class="menu-parametres"></div>
  `;
  document.body.append(bouton, boutonParametres, tiroir);
  const corps = tiroir.querySelector('.menu-corps');

  const boutonFermer = tiroir.querySelector('#menu-fermer');
  const panneauxFlottants = new Map();
  const boutonsFlottants = new Map();

  function fermerPanneauxFlottants() {
    for (const [id, panneau] of panneauxFlottants) {
      panneau.hidden = true;
      boutonsFlottants.get(id).setAttribute('aria-expanded', 'false');
    }
  }

  window.addEventListener('fiche-ouverte', fermerPanneauxFlottants);

  const montrerParametres = (oui) => tiroir.classList.toggle('en-parametres', oui);
  const ouvrir = (ouvert, pageParametres = false) => {
    tiroir.classList.toggle('ouvert', ouvert);
    montrerParametres(ouvert && pageParametres);
    bouton.setAttribute('aria-expanded', String(ouvert));
    bouton.setAttribute('aria-label', ouvert ? 'Menu ouvert' : 'Ouvrir les activités');
    boutonParametres.setAttribute('aria-expanded', String(ouvert && pageParametres));
    if (ouvert) {
      fermerPanneauxFlottants();
      arreterCategoriesFlottantes();
    }
  };

  const categories = [
    {
      id: 'activites',
      titre: 'Activités',
      icone: 'activites',
      aide: 'Choisissez une activité pour afficher ses outils sur la carte.',
      exclusif: true,
      modules: [
        creerActiviteParapente(map, { onChoisirPoint: () => ouvrir(false) }),
        creerActiviteRandonnee(map),
        creerModuleBientot('velo', 'Vélo', 'velo', 'Cette activité arrive bientôt. Idées : sentiers VTT, dénivelé, profil d’altitude.'),
        creerActiviteSki(map),
      ],
      emplacement: 'menu',
    },
    {
      id: 'meteo',
      titre: 'Météo',
      icone: 'meteo',
      aide: 'Conditions et prévisions en montagne.',
      exclusif: false,
      modules: [
        creerConditionsLocales(map),
        creerRadarPluie(map),
        creerModuleBientot('vent', 'Vent et prévisions', 'vent', 'À venir : choix du modèle de prévision.'),
      ],
      emplacement: 'flottant',
    },
    {
      id: 'carte',
      titre: 'Carte',
      icone: 'carte',
      aide: 'Personnalisez le fond et les informations affichées.',
      exclusif: false,
      modules: [
        creerFondDeCarte(map),
        creerOptionRelief(map), // inclut les courbes de niveau
        creerElementsCarte(map),
      ],
      emplacement: 'flottant',
    },
  ];

  bouton.addEventListener('click', () => ouvrir(!tiroir.classList.contains('ouvert')));
  boutonParametres.addEventListener('click', () => ouvrir(true, true));
  boutonFermer.addEventListener('click', () => ouvrir(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fermerPanneauxFlottants();
      ouvrir(false);
    }
  });

  // ---------- Page Paramètres ----------
  tiroir
    .querySelector('.menu-parametres')
    .appendChild(
      creerPageParametres({
        retour: () => {
          montrerParametres(false);
          boutonParametres.setAttribute('aria-expanded', 'false');
        },
      })
    );

  // ---------- Rubriques et modules ----------
  function demarrer(e) {
    e.actif = true;
    e.ligne.classList.add('actif');
    e.ligne.setAttribute('aria-pressed', 'true');
    e.contenu.style.display = 'block';
    e.module.activer();
  }

  function arreter(e) {
    e.actif = false;
    e.ligne.classList.remove('actif');
    e.ligne.setAttribute('aria-pressed', 'false');
    e.contenu.style.display = 'none';
    e.module.desactiver();
  }

  const activiteSauvee = lire('menu-activite', null);
  const actionsFlottantes = document.createElement('div');
  actionsFlottantes.className = 'outils-rapides';
  actionsFlottantes.setAttribute('aria-label', 'Outils de la carte');
  document.body.appendChild(actionsFlottantes);
  const etatsParCategorie = new Map();

  function arreterCategoriesFlottantes(categorieConservee) {
    for (const categorie of categories) {
      if (categorie.emplacement !== 'flottant' || categorie.id === categorieConservee) continue;
      etatsParCategorie.get(categorie.id)?.forEach((etat) => etat.actif && arreter(etat));
    }
  }

  for (const categorie of categories) {
    const vue = document.createElement('section');
    vue.className = 'menu-vue';
    vue.id = `menu-vue-${categorie.id}`;
    vue.setAttribute('aria-label', categorie.titre);
    vue.innerHTML = `
      <header class="menu-vue-entete">
        <h2>${categorie.titre}</h2>
        <p>${categorie.aide}</p>
      </header>
    `;

    if (categorie.emplacement === 'menu') {
      corps.appendChild(vue);
    } else {
      const boutonOutil = document.createElement('button');
      boutonOutil.type = 'button';
      boutonOutil.className = 'outil-rapide-bouton';
      boutonOutil.id = `outil-rapide-bouton-${categorie.id}`;
      boutonOutil.setAttribute('aria-controls', `outil-rapide-panneau-${categorie.id}`);
      boutonOutil.setAttribute('aria-expanded', 'false');
      boutonOutil.setAttribute('aria-label', `Ouvrir les outils ${categorie.titre.toLowerCase()}`);
      boutonOutil.innerHTML = `${creerIconeMenu(categorie.icone)}<span>${categorie.titre}</span>`;
      ajouterAideMaintien(boutonOutil, categorie.titre);

      const panneauOutil = document.createElement('aside');
      panneauOutil.className = 'outil-rapide-panneau';
      panneauOutil.id = `outil-rapide-panneau-${categorie.id}`;
      panneauOutil.setAttribute('aria-label', `Outils ${categorie.titre.toLowerCase()}`);
      panneauOutil.hidden = true;
      panneauOutil.innerHTML = `
        <header class="outil-rapide-entete">
          <div class="outil-rapide-titre">
            ${creerIconeMenu(categorie.icone)}
            <strong>${categorie.titre}</strong>
          </div>
          <button type="button" class="outil-rapide-fermer" aria-label="Fermer ${categorie.titre.toLowerCase()}">${creerIconeMenu('close')}</button>
        </header>
        <div class="outil-rapide-corps"></div>
      `;
      panneauOutil.querySelector('.outil-rapide-corps').appendChild(vue);
      actionsFlottantes.appendChild(boutonOutil);
      document.body.appendChild(panneauOutil);
      boutonsFlottants.set(categorie.id, boutonOutil);
      panneauxFlottants.set(categorie.id, panneauOutil);

      boutonOutil.addEventListener('click', () => {
        const ouvrirPanneau = panneauOutil.hidden;
        fermerPanneauxFlottants();
        ouvrir(false);
        arreterCategoriesFlottantes(categorie.id);
        etatsParCategorie.get('activites')?.forEach((etat) => etat.actif && arreter(etat));
        ecrire('menu-activite', null);
        if (ouvrirPanneau) {
          panneauOutil.hidden = false;
          boutonOutil.setAttribute('aria-expanded', 'true');
        }
      });
      panneauOutil.querySelector('.outil-rapide-fermer').addEventListener('click', fermerPanneauxFlottants);
    }

    const etats = [];
    for (const module of categorie.modules) {
      const bloc = document.createElement('div');
      bloc.className = 'menu-module';

      const ligne = document.createElement('button');
      ligne.type = 'button';
      ligne.className = 'menu-ligne';
      ligne.innerHTML = `${creerIconeMenu(module.icone || module.id)}<span>${module.label}</span>`;
      ligne.setAttribute('aria-pressed', 'false');

      const contenu = document.createElement('div');
      contenu.className = 'menu-contenu';
      contenu.style.display = 'none';
      contenu.appendChild(module.panneau);

      bloc.append(ligne, contenu);
      vue.appendChild(bloc);

      const etat = { module, ligne, contenu, actif: false };
      etats.push(etat);

      ligne.addEventListener('click', () => {
        if (etat.actif) {
          arreter(etat);
          if (categorie.exclusif) ecrire('menu-activite', null);
          return;
        }
        if (categorie.exclusif) {
          arreterCategoriesFlottantes();
          etats.forEach((autre) => autre !== etat && autre.actif && arreter(autre));
          ecrire('menu-activite', module.id);
        }
        demarrer(etat);
      });
    }
    etatsParCategorie.set(categorie.id, etats);

    if (categorie.emplacement === 'menu' && activiteSauvee) {
      const etat = etats.find((element) => element.module.id === activiteSauvee);
      if (etat) {
        try {
          demarrer(etat);
        } catch (err) {
          console.warn('Activité non rétablie :', err);
        }
      }
    }
  }
}