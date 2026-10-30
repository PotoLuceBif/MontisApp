import { creerActiviteParapente } from './activite-parapente.js';
import { creerFondDeCarte } from './fond-de-carte.js';
import { creerOptionRelief } from './relief.js';
import { creerElementsCarte } from './elements-carte.js';
import { creerPageParametres } from './parametres.js';
import { lire, ecrire } from './reglages.js';
import { creerActiviteRandonnee } from './activite-randonnee.js';
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
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  generic: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
};

function creerIconeMenu(nom) {
  const dessin = ICONES_MENU[nom] || ICONES_MENU.generic;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessin}</svg>`;
}

// Module « à venir » : une ligne dans le menu avec un petit texte
function creerModuleBientot(id, label, icone, texte) {
  const panneau = document.createElement('div');
  panneau.innerHTML = `<p>${texte}</p>`;
  return { id, label, icone, panneau, activer() {}, desactiver() {} };
}

export function initMenu(map) {
  const categories = [
    {
      id: 'activites',
      titre: 'Activités',
      icone: 'activites',
      aide: 'Choisissez votre activité en montagne.',
      exclusif: true,
      modules: [
        creerActiviteParapente(map),
        creerActiviteRandonnee(map),
        creerModuleBientot('velo', 'Vélo', 'velo', 'Cette activité arrive bientôt. Idées : sentiers VTT, dénivelé, profil d’altitude.'),
        creerModuleBientot('ski', 'Ski', 'ski', 'Cette activité arrive bientôt. Idées : pistes, remontées, pentes et expositions.'),
      ],
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
    },
  ];

  // ---------- Bouton et tiroir ----------
  const bouton = document.createElement('button');
  bouton.id = 'menu-bouton';
  bouton.type = 'button';
  bouton.setAttribute('aria-label', 'Ouvrir le menu');
  bouton.setAttribute('aria-controls', 'menu-tiroir');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  `;

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
        <span class="menu-sous-titre">Cartographie alpine</span>
      </div>
      <button id="menu-fermer" type="button" aria-label="Fermer le menu">${creerIconeMenu('close')}</button>
    </div>
    <nav class="menu-navigation" role="tablist" aria-label="Rubriques principales"></nav>
    <div class="menu-corps"></div>
    <div class="menu-pied">
      <button id="menu-params" type="button" class="btn-secondaire">Paramètres</button>
    </div>
    <div class="menu-parametres"></div>
  `;
  document.body.append(bouton, tiroir);
  const navigation = tiroir.querySelector('.menu-navigation');
  const corps = tiroir.querySelector('.menu-corps');

  const boutonFermer = tiroir.querySelector('#menu-fermer');
  const ouvrir = (ouvert) => {
    tiroir.classList.toggle('ouvert', ouvert);
    bouton.setAttribute('aria-expanded', String(ouvert));
    bouton.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
  };
  bouton.addEventListener('click', () => ouvrir(!tiroir.classList.contains('ouvert')));
  boutonFermer.addEventListener('click', () => ouvrir(false));

  // ---------- Page Paramètres ----------
  const montrerParametres = (oui) => tiroir.classList.toggle('en-parametres', oui);
  tiroir
    .querySelector('.menu-parametres')
    .appendChild(creerPageParametres({ retour: () => montrerParametres(false) }));
  tiroir.querySelector('#menu-params').addEventListener('click', () => montrerParametres(true));

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
  let categorieCourante = lire('menu-categorie', 'activites');
  if (!categories.some((categorie) => categorie.id === categorieCourante)) {
    categorieCourante = 'activites';
  }
  const vues = new Map();
  const onglets = new Map();

  function afficherCategorie(id) {
    categorieCourante = id;
    ecrire('menu-categorie', id);
    for (const categorie of categories) {
      const actif = categorie.id === id;
      onglets.get(categorie.id).classList.toggle('actif', actif);
      onglets.get(categorie.id).setAttribute('aria-selected', String(actif));
      onglets.get(categorie.id).tabIndex = actif ? 0 : -1;
      vues.get(categorie.id).hidden = !actif;
    }
  }

  for (const [index, categorie] of categories.entries()) {
    const onglet = document.createElement('button');
    onglet.type = 'button';
    onglet.className = 'menu-onglet';
    onglet.setAttribute('role', 'tab');
    onglet.id = `menu-onglet-${categorie.id}`;
    onglet.setAttribute('aria-controls', `menu-vue-${categorie.id}`);
    onglet.innerHTML = `${creerIconeMenu(categorie.icone)}<span>${categorie.titre}</span>`;
    onglet.addEventListener('click', () => afficherCategorie(categorie.id));
    onglet.addEventListener('keydown', (event) => {
      let prochainIndex;
      if (event.key === 'ArrowRight') prochainIndex = (index + 1) % categories.length;
      else if (event.key === 'ArrowLeft') prochainIndex = (index - 1 + categories.length) % categories.length;
      else if (event.key === 'Home') prochainIndex = 0;
      else if (event.key === 'End') prochainIndex = categories.length - 1;
      else return;
      event.preventDefault();
      const prochaineCategorie = categories[prochainIndex];
      afficherCategorie(prochaineCategorie.id);
      onglets.get(prochaineCategorie.id).focus();
    });
    navigation.appendChild(onglet);
    onglets.set(categorie.id, onglet);

    const vue = document.createElement('section');
    vue.className = 'menu-vue';
    vue.id = `menu-vue-${categorie.id}`;
    vue.setAttribute('role', 'tabpanel');
    vue.setAttribute('aria-labelledby', onglet.id);
    vue.innerHTML = `
      <header class="menu-vue-entete">
        <h2>${categorie.titre}</h2>
        <p>${categorie.aide}</p>
      </header>
    `;
    vues.set(categorie.id, vue);

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
          etats.forEach((autre) => autre !== etat && autre.actif && arreter(autre));
          ecrire('menu-activite', module.id);
        }
        demarrer(etat);
      });
    }

    if (categorie.exclusif && activiteSauvee) {
      const etat = etats.find((element) => element.module.id === activiteSauvee);
      if (etat) {
        try {
          demarrer(etat);
        } catch (err) {
          console.warn('Activité non rétablie :', err);
        }
      }
    }

    corps.appendChild(vue);
  }

  afficherCategorie(categorieCourante);
}