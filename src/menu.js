import { creerFondDeCarte } from './fond-de-carte.js';
import { creerOptionRelief } from './relief.js';
import { creerElementsCarte } from './elements-carte.js';
import { creerPageParametres } from './parametres.js';
import { lire, ecrire } from './reglages.js';
import { BANDEAU_MENU } from './bandeau-menu.js';
import { creerCartesHorsLigne } from './zones-hors-ligne.js';
import { differer, facade, immediat } from './module-differe.js';
import { OUTIL_ACTIVITE } from './outil-activite.js';
import { poser, poserAttribut, surLangue, t, ta, ti } from './i18n.js';

const ICONES_MENU = {
  activites: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  meteo: '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9.5 4.2 4.2 0 0 0 7 18Z"/><path d="m9 21-1 2m6-2-1 2m6-2-1 2"/>',
  carte: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  radar: '<path d="M12 12 20 5"/><path d="M5.6 18.4a9 9 0 1 1 12.8 0"/><path d="M8.4 15.6a5 5 0 1 1 7.2 0"/><circle cx="12" cy="12" r="1"/>',
  vent: '<path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/>',
  fond: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
  relief: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  courbes: '<path d="M4 19c4-5 12-5 16 0M3 14c5-6 13-6 18 0M5 9c4-4 10-4 14 0"/>',
  elements: '<path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  reglages: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .8v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.8l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.8-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .8-3l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.8v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .8l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .8 3h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-.8 3Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  'hors-ligne': '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  generic: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
};

// Icônes en couleur des activités (public/icons/activites)
const ICONES_ACTIVITES = {
  parapente: 'parapente',
  rando: 'randonnee',
  velo: 'velo',
  ski: 'ski',
};

const CHEVRON_BAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function creerIconeMenu(nom) {
  if (ICONES_ACTIVITES[nom]) {
    return `<img class="icone-activite" src="/icons/activites/${ICONES_ACTIVITES[nom]}.svg" alt="" width="40" height="40" />`;
  }
  const dessin = ICONES_MENU[nom] || ICONES_MENU.generic;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessin}</svg>`;
}

function ajouterAideMaintien(bouton, cleLibelle) {
  const majTitre = () => {
    bouton.title = t('menu.maintenir', { nom: t(cleLibelle) });
  };
  majTitre();
  surLangue(majTitre);
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

export function initMenu(map) {
  // Activités, météo et analyse du vent : chargées à leur première ouverture (module-differe.js)
  const vent = differer({ id: 'vent', labelCle: 'vent.titre', icone: 'vent', surCarte: true }, () =>
    import('./carte-vent.js').then((m) => m.creerCarteVent(map))
  );

  // ---------- Bouton et tiroir ----------
  const bouton = document.createElement('button');
  bouton.id = 'menu-bouton';
  bouton.type = 'button';
  bouton.setAttribute('aria-controls', 'menu-tiroir');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.innerHTML = `
    <img src="/logos/montis-icon-fullbleed.svg" alt="" width="48" height="48" />
  `;
  poserAttribut(bouton, 'aria-label', 'menu.ouvrir-activites');
  poserAttribut(bouton, 'title', 'menu.activites');

  const boutonParametres = document.createElement('button');
  boutonParametres.id = 'menu-parametres-bouton';
  boutonParametres.type = 'button';
  poserAttribut(boutonParametres, 'aria-label', 'menu.ouvrir-parametres');
  boutonParametres.setAttribute('aria-controls', 'menu-tiroir');
  boutonParametres.innerHTML = creerIconeMenu('reglages');
  poserAttribut(boutonParametres, 'title', 'menu.parametres');

  const tiroir = document.createElement('aside');
  tiroir.id = 'menu-tiroir';
  poserAttribut(tiroir, 'aria-label', 'menu.principal');
  tiroir.innerHTML = `
    <div class="menu-entete">
      ${BANDEAU_MENU}
      <div class="menu-marque">
        <span class="menu-logotype">
          <img src="/logos/montis-lockup-for-dark.svg" alt="Montis" width="124" height="42" />
        </span>
        <span class="menu-sous-titre" ${ti('menu.sous-titre')}>${t('menu.sous-titre')}</span>
      </div>
      <button id="menu-fermer" type="button" ${ta('aria-label', 'menu.fermer')}>${creerIconeMenu('close')}</button>
    </div>
    <div class="menu-corps" ${ta('aria-label', 'menu.activites')}></div>
    <div class="menu-parametres"></div>
  `;
  document.body.append(bouton, boutonParametres, tiroir);
  const corps = tiroir.querySelector('.menu-corps');

  const boutonFermer = tiroir.querySelector('#menu-fermer');
  const panneauxFlottants = new Map();
  const boutonsFlottants = new Map();

  // Panneau ouvert depuis une fiche : sa croix y ramène (Météo depuis la fiche d'un point)
  let retourFlottant = null;
  // `garderReduits` : un panneau réduit reste en bas de l'écran pendant qu'on manipule la carte
  function fermerPanneauxFlottants({ garderReduits = false } = {}) {
    retourFlottant = null;
    for (const [id, panneau] of panneauxFlottants) {
      if (garderReduits && panneau.classList.contains('reduit')) continue;
      panneau.hidden = true;
      reduirePanneau(panneau, false);
      boutonsFlottants.get(id).setAttribute('aria-expanded', 'false');
    }
  }

  // Réduit : seule la barre de titre reste, avec ce qui est ouvert dedans ; tout le reste est gardé tel quel
  function reduirePanneau(panneau, reduit) {
    panneau.classList.toggle('reduit', reduit);
    const bouton = panneau.querySelector('.outil-rapide-reduire');
    if (!bouton) return;
    poserAttribut(bouton, 'aria-label', reduit ? 'menu.agrandir-panneau' : 'menu.reduire-panneau');
    bouton.title = bouton.getAttribute('aria-label');
    bouton.setAttribute('aria-expanded', String(!reduit));
    const ouverts = [...panneau.querySelectorAll('.menu-ligne[aria-pressed="true"] span')].map((el) => el.textContent);
    const resume = panneau.querySelector('.outil-rapide-resume');
    resume.textContent = reduit ? ouverts.join(' · ') : '';
    resume.hidden = !resume.textContent;
  }

  window.addEventListener('fiche-ouverte', fermerPanneauxFlottants);

  const montrerParametres = (oui) => tiroir.classList.toggle('en-parametres', oui);
  const ouvrir = (ouvert, pageParametres = false) => {
    tiroir.classList.toggle('ouvert', ouvert);
    montrerParametres(ouvert && pageParametres);
    bouton.setAttribute('aria-expanded', String(ouvert));
    poserAttribut(bouton, 'aria-label', ouvert ? 'menu.ouvert' : 'menu.ouvrir-activites');
    boutonParametres.setAttribute('aria-expanded', String(ouvert && pageParametres));
    // La météo affichée (radar, vent) reste sur la carte pendant qu'on parcourt le menu
    if (ouvert) {
      fermerPanneauxFlottants();
      arreterCategoriesFlottantes(['meteo']);
    }
  };

  const fermerMenu = () => {
    fermerPanneauxFlottants();
    ouvrir(false);
  };
  const ouvrirMenu = () => ouvrir(true);
  // Revenir à un menu flottant sans rien arrêter de ce qui tourne sur la carte
  const ouvrirFlottant = (id) => {
    fermerPanneauxFlottants();
    panneauxFlottants.get(id).hidden = false;
    boutonsFlottants.get(id).setAttribute('aria-expanded', 'true');
  };

  const categories = [
    {
      id: 'activites',
      titre: 'menu.activites',
      icone: 'activites',
      aide: 'menu.aide-activites',
      exclusif: true,
      modules: [
        differer({ id: 'parapente', labelCle: 'para.titre', icone: 'parapente' }, () =>
          import('./activite-parapente.js').then((m) =>
            m.creerActiviteParapente(map, { fermerMenu, ouvrirMenu, analyseVent: facade(vent) })
          )
        ),
        differer({ id: 'rando', labelCle: 'rando.titre', icone: 'rando' }, () =>
          import('./activite-randonnee.js').then((m) => m.creerActiviteRandonnee(map, { fermerMenu, ouvrirMenu }))
        ),
        differer({ id: 'velo', labelCle: 'velo.titre', icone: 'velo' }, () =>
          import('./activite-velo.js').then((m) => m.creerActiviteVelo(map, { fermerMenu, ouvrirMenu }))
        ),
        differer({ id: 'ski', labelCle: 'ski.titre', icone: 'ski' }, () =>
          import('./activite-ski.js').then((m) => m.creerActiviteSki(map))
        ),
      ],
      emplacement: 'menu',
    },
    {
      id: 'meteo',
      titre: 'menu.meteo',
      icone: 'meteo',
      aide: 'menu.aide-meteo',
      exclusif: false,
      modules: [
        differer({ id: 'meteo-locale', labelCle: 'meteo.titre', icone: 'meteo' }, () =>
          import('./meteo.js').then((m) => m.creerConditionsLocales(map))
        ),
        differer({ id: 'radar', labelCle: 'radar.titre', icone: 'radar', reseauRequis: true }, () =>
          import('./meteo.js').then((m) => m.creerRadarPluie(map))
        ),
        vent,
      ],
      emplacement: 'flottant',
    },
    {
      id: 'carte',
      titre: 'menu.carte',
      icone: 'carte',
      aide: 'menu.aide-carte',
      exclusif: false,
      // Nécessaires dès le démarrage : ils rétablissent le fond et les éléments choisis
      modules: [
        immediat(creerFondDeCarte(map)),
        immediat(creerOptionRelief(map)), // inclut les courbes de niveau
        immediat(creerElementsCarte(map)),
        immediat(creerCartesHorsLigne(map, { fermerMenu, ouvrirMenu: () => ouvrirFlottant('carte') })),
      ],
      emplacement: 'flottant',
    },
  ];

  bouton.addEventListener('click', () => ouvrir(!tiroir.classList.contains('ouvert')));
  boutonParametres.addEventListener('click', () => {
    ouvrir(true, true);
    pageParametres.surOuverture?.();
  });
  boutonFermer.addEventListener('click', () => ouvrir(false));

  map.on('click', () => {
    fermerPanneauxFlottants({ garderReduits: true });
    ouvrir(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fermerPanneauxFlottants();
      ouvrir(false);
    }
  });

  // ---------- Page Paramètres ----------
  const pageParametres = creerPageParametres({
    retour: () => {
      montrerParametres(false);
      boutonParametres.setAttribute('aria-expanded', 'false');
    },
  });
  tiroir.querySelector('.menu-parametres').appendChild(pageParametres);

  // ---------- Rubriques et modules ----------
  function finChargement(e) {
    e.ligne.classList.remove('en-chargement');
    e.ligne.removeAttribute('aria-busy');
  }

  function demarrer(e) {
    e.actif = true;
    e.ligne.classList.add('actif');
    e.ligne.setAttribute('aria-pressed', 'true');
    e.contenu.style.display = 'block';
    e.erreur.hidden = true;
    // Un outil posé sur la carte se ferme lui-même : le menu doit le savoir
    const lancer = (module) =>
      module.activer({
        onFermer: () => {
          if (e.actif) arreter(e);
        },
        onRetour: () => ouvrirFlottant('meteo'),
      });
    if (e.def.instance) {
      lancer(e.def.instance);
      return;
    }
    // Premier lancement : le code se charge. Un nouvel appui pendant ce temps l'annule.
    const demande = ++e.demande;
    e.ligne.classList.add('en-chargement');
    e.ligne.setAttribute('aria-busy', 'true');
    e.def.obtenir().then(
      (module) => {
        if (demande !== e.demande) return;
        finChargement(e);
        if (e.actif) lancer(module);
      },
      (erreur) => {
        console.error(`Chargement de « ${e.def.id} » impossible :`, erreur);
        if (demande !== e.demande) return;
        finChargement(e);
        arreter(e);
        e.contenu.style.display = 'block';
        e.erreur.hidden = false;
      }
    );
  }

  function arreter(e) {
    e.actif = false;
    e.demande += 1;
    finChargement(e);
    e.ligne.classList.remove('actif');
    e.ligne.setAttribute('aria-pressed', 'false');
    e.contenu.style.display = 'none';
    e.def.instance?.desactiver();
  }

  const activiteSauvee = lire('menu-activite', null);
  const actionsFlottantes = document.createElement('div');
  actionsFlottantes.className = 'outils-rapides';
  poserAttribut(actionsFlottantes, 'aria-label', 'menu.outils-carte');
  document.body.appendChild(actionsFlottantes);
  const etatsParCategorie = new Map();

  function arreterCategoriesFlottantes(conservees = []) {
    for (const categorie of categories) {
      if (categorie.emplacement !== 'flottant' || conservees.includes(categorie.id)) continue;
      etatsParCategorie.get(categorie.id)?.forEach((etat) => etat.actif && arreter(etat));
    }
  }

  // Un outil d'activité prend la carte (outil-activite.js) : la météo se retire proprement
  window.addEventListener(OUTIL_ACTIVITE, () => {
    etatsParCategorie.get('meteo')?.forEach((etat) => etat.actif && arreter(etat));
    if (panneauxFlottants.get('meteo')?.hidden === false) fermerPanneauxFlottants();
  });

  // Raccourci depuis une fiche : ouvre une activité, ou un panneau flottant sur l'un de ses modules (Météo › Conditions locales)
  window.addEventListener('montis:ouvrir-module', (event) => {
    const { categorie, module, retour } = event.detail || {};
    const panneau = panneauxFlottants.get(categorie);
    const etat = etatsParCategorie.get(categorie)?.find((e) => e.def.id === module);
    if (!etat) return;
    // Une activité : comme un appui sur sa ligne du menu (exclusivité comprise), sauf si elle tourne déjà
    if (!panneau) {
      if (!etat.actif) etat.ligne.click();
      return;
    }
    if (panneau.hidden) boutonsFlottants.get(categorie).click();
    if (!etat.actif) demarrer(etat);
    retourFlottant = typeof retour === 'function' ? { categorie, etat, retour } : null;
  });

  for (const categorie of categories) {
    const vue = document.createElement('section');
    vue.className = 'menu-vue';
    vue.id = `menu-vue-${categorie.id}`;
    poserAttribut(vue, 'aria-label', categorie.titre);
    vue.innerHTML = `
      <header class="menu-vue-entete">
        <h2 ${ti(categorie.titre)}>${t(categorie.titre)}</h2>
        <p ${ti(categorie.aide)}>${t(categorie.aide)}</p>
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
      poserAttribut(boutonOutil, 'aria-label', `menu.ouvrir-outils-${categorie.id}`);
      boutonOutil.innerHTML = `${creerIconeMenu(categorie.icone)}<span ${ti(categorie.titre)}>${t(categorie.titre)}</span>`;
      ajouterAideMaintien(boutonOutil, categorie.titre);

      const panneauOutil = document.createElement('aside');
      panneauOutil.className = 'outil-rapide-panneau';
      panneauOutil.id = `outil-rapide-panneau-${categorie.id}`;
      poserAttribut(panneauOutil, 'aria-label', categorie.id === 'meteo' ? 'menu.outils-meteo' : 'menu.outils-carte-court');
      panneauOutil.hidden = true;
      panneauOutil.innerHTML = `
        <header class="outil-rapide-entete">
          <div class="outil-rapide-titre">
            ${creerIconeMenu(categorie.icone)}
            <span class="outil-rapide-noms">
              <strong ${ti(categorie.titre)}>${t(categorie.titre)}</strong>
              <small class="outil-rapide-resume" hidden></small>
            </span>
          </div>
          <button type="button" class="outil-rapide-reduire" aria-expanded="true">${CHEVRON_BAS}</button>
          <button type="button" class="outil-rapide-fermer" ${ta('aria-label', `menu.fermer-${categorie.id}`)}>${creerIconeMenu('close')}</button>
        </header>
        <div class="outil-rapide-corps"></div>
      `;
      panneauOutil.querySelector('.outil-rapide-corps').appendChild(vue);
      actionsFlottantes.appendChild(boutonOutil);
      document.body.appendChild(panneauOutil);
      boutonsFlottants.set(categorie.id, boutonOutil);
      panneauxFlottants.set(categorie.id, panneauOutil);

      reduirePanneau(panneauOutil, false);
      const reduire = panneauOutil.querySelector('.outil-rapide-reduire');
      reduire.addEventListener('click', (event) => {
        event.stopPropagation();
        reduirePanneau(panneauOutil, !panneauOutil.classList.contains('reduit'));
      });
      // Réduit, toute la barre se touche pour rouvrir le panneau là où on l'avait laissé
      panneauOutil.querySelector('.outil-rapide-entete').addEventListener('click', (event) => {
        if (panneauOutil.classList.contains('reduit') && !event.target.closest('.outil-rapide-fermer')) {
          reduirePanneau(panneauOutil, false);
        }
      });

      boutonOutil.addEventListener('click', () => {
        // Le bouton d'un panneau réduit le rouvre, sans rien arrêter
        if (!panneauOutil.hidden && panneauOutil.classList.contains('reduit')) {
          reduirePanneau(panneauOutil, false);
          return;
        }
        const ouvrirPanneau = panneauOutil.hidden;
        fermerPanneauxFlottants();
        ouvrir(false);
        arreterCategoriesFlottantes([categorie.id, 'meteo']);
        // Météo et Carte s'ouvrent par-dessus l'activité : elle continue (sortie en cours, tracé…)
        if (ouvrirPanneau) {
          panneauOutil.hidden = false;
          boutonOutil.setAttribute('aria-expanded', 'true');
        }
      });
      panneauOutil.querySelector('.outil-rapide-fermer').addEventListener('click', () => {
        const retour = retourFlottant?.categorie === categorie.id ? retourFlottant : null;
        fermerPanneauxFlottants();
        if (!retour) return;
        // Le module n'était ouvert que pour ce détour : il s'arrête, la fiche revient
        if (retour.etat.actif) arreter(retour.etat);
        retour.retour();
      });
    }

    const etats = [];
    for (const def of categorie.modules) {
      const bloc = document.createElement('div');
      bloc.className = 'menu-module';

      const ligne = document.createElement('button');
      ligne.type = 'button';
      ligne.className = 'menu-ligne';
      if (ICONES_ACTIVITES[def.icone]) {
        ligne.classList.add('menu-ligne-activite');
      }
      ligne.innerHTML = `${creerIconeMenu(def.icone || def.id)}<span></span>`;
      if (def.labelCle) poser(ligne.querySelector('span'), def.labelCle);
      else ligne.querySelector('span').textContent = def.label;
      ligne.setAttribute('aria-pressed', 'false');
      if (def.reseauRequis) ligne.dataset.reseauRequis = '';
      ligne.dataset.module = def.id;

      const contenu = document.createElement('div');
      contenu.className = 'menu-contenu';
      contenu.style.display = 'none';
      const erreur = poser(document.createElement('p'), 'menu.chargement-impossible');
      erreur.className = 'menu-erreur';
      erreur.hidden = true;
      contenu.appendChild(erreur);
      def.quandCharge((module) => contenu.appendChild(module.panneau));

      bloc.append(ligne, contenu);
      vue.appendChild(bloc);

      const etat = { def, ligne, contenu, erreur, actif: false, demande: 0 };
      etats.push(etat);

      ligne.addEventListener('click', () => {
        if (etat.actif) {
          arreter(etat);
          if (categorie.exclusif) ecrire('menu-activite', null);
          return;
        }
        if (categorie.exclusif) {
          // Changer d'activité garde la météo : seul un outil lancé la retire
          arreterCategoriesFlottantes(['meteo']);
          etats.forEach((autre) => autre !== etat && autre.actif && arreter(autre));
          ecrire('menu-activite', def.id);
        }
        demarrer(etat);
        if (def.surCarte) fermerMenu();
      });
    }
    etatsParCategorie.set(categorie.id, etats);

    if (categorie.emplacement === 'menu' && activiteSauvee) {
      const etat = etats.find((element) => element.def.id === activiteSauvee);
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