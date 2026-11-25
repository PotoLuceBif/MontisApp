import { creerFondDeCarte } from './fond-de-carte.js';
import { creerOptionRelief } from './relief.js';
import { creerElementsCarte } from './elements-carte.js';
import { creerNatureSousSol } from './nature-sous-sol.js';
import { creerSoleilLune } from './soleil-lune.js';
import { lire, ecrire } from './reglages.js';
import { BANDEAU_MENU } from './bandeau-menu.js';
import { creerCartesHorsLigne } from './zones-hors-ligne.js';
import { differer, facade, immediat } from './module-differe.js';
import { fichierDisparu, rechargerSurNouvelleVersion } from './mise-a-jour.js';
import { OUTIL_ACTIVITE } from './outil-activite.js';
import { creerPastilleCouche } from './couches-actives.js';
import { poser, poserAttribut, surLangue, t, ta, ti } from './i18n.js';
import { etat as etatCarte } from './options-carte.js';
import { fragmentVue } from './partage-calcul.js';
import { partagerLien } from './partage.js';
import { visiterLaLune } from './lune-bulle.js';
import { deposer } from './demandes.js';
import { getMoonIllumination, getTimes } from 'suncalc';
import { fixerPleinJour, pleinJour } from './heure-espace.js';
import { suivreGlisse } from './geste-feuille.js';

const ICONES_MENU = {
  activites: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  meteo: '<path d="M7 18h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9.5 4.2 4.2 0 0 0 7 18Z"/><path d="m9 21-1 2m6-2-1 2m6-2-1 2"/>',
  carte: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
  ciel: '<circle cx="9" cy="9" r="3.2"/><path d="M9 2.5v1.3M2.5 9h1.3M14.2 9h1.3M9 14.2v1.3M4.4 4.4l.9.9M12.7 5.3l.9-.9M4.4 13.6l.9-.9"/><path d="M21.5 17.2a4.6 4.6 0 1 1-5-5 3.7 3.7 0 0 0 5 5Z"/>',
  ombre: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  lune: '<path d="M20 14.6A8.2 8.2 0 1 1 9.4 4a6.5 6.5 0 0 0 10.6 10.6Z"/>',
  radar: '<path d="M12 12 20 5"/><path d="M5.6 18.4a9 9 0 1 1 12.8 0"/><path d="M8.4 15.6a5 5 0 1 1 7.2 0"/><circle cx="12" cy="12" r="1"/>',
  vent: '<path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/>',
  fond: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
  relief: '<path d="m3 20 7-13 4 7 3-4 4 10H3Z"/><path d="m8 20 4-7 4 7"/>',
  courbes: '<path d="M4 19c4-5 12-5 16 0M3 14c5-6 13-6 18 0M5 9c4-4 10-4 14 0"/>',
  nature: '<path d="M3 7c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 17c3-2 6 2 9 0s6-2 9 0"/>',
  elements: '<path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  reglages: '<path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.5 1.1c1.6-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.5c.9 1.6-.8 3.3-2.4 2.4a1.7 1.7 0 0 0-2.5 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.5c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1-2.5c-.9-1.6.8-3.3 2.4-2.4 1 .6 2.3.1 2.5-1.1Z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  partage: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  'hors-ligne': '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  sorties: '<path d="M12 8v4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>',
  parcours: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h7.5a3.5 3.5 0 0 1 0 7h-7a3.5 3.5 0 0 0 0 7H16" stroke-dasharray="2 2.5"/>',
  jeux: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="18" cy="13.8" r="1"/>',
  panorama: '<path d="M2 20h20"/><path d="m4 20 5-8 3 4 3-5 5 9"/><path d="M5 7.5a10 10 0 0 1 14 0"/><path d="M12 4.5v1.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3Z"/>',
  // Onglets : dessins de la maquette choisie par le propriétaire (25 novembre 2026)
  'onglet-carte': '<path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z"/><path d="M9 4v13M15 7v13"/>',
  'onglet-preparer': '<path d="M2.5 20 9.5 8.5l3.6 5.6 2.6-3.6L21.5 20h-19Z"/><path d="m7.4 12 2.1 1.6 1.7-1.5"/><circle cx="18" cy="5" r="1.8"/>',
  'onglet-meteo': '<path d="M6.7 18C4 18 2 16 2 13.5S4 9 6.7 9c.4-1.8 1.8-3.2 3.6-3.8 1.9-.6 4-.2 5.5 1 1.5 1.2 2.1 3 1.8 4.8h1c1.9 0 3.4 1.6 3.4 3.5S20.5 18 18.6 18H6.7Z"/>',
  'onglet-traces': '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H12"/>',
  'onglet-explorer': '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  position: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',
  'creer-parcours': '<circle cx="5.5" cy="18.5" r="2"/><path d="M7.5 18.5h4a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h2"/><path d="M18 4v7M14.5 7.5h7"/>',
  generic: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>',
};

// Icônes en couleur des activités (public/icons/activites)
const ICONES_ACTIVITES = {
  parapente: 'parapente',
  rando: 'randonnee',
  velo: 'velo',
  ski: 'ski',
  'culture-geo': 'culture-geo',
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

  // ---------- Onglets (refonte du 25 novembre 2026) : barre du bas sur téléphone, rail à gauche sur ordinateur ----------
  // Carte et Météo sont les boutons de leurs panneaux flottants ; Préparer, Traces et Explorer ouvrent le tiroir
  // sur une seule de ses rubriques. Préparer garde l'identifiant de l'ancien bouton du menu (#menu-bouton).
  const barreOnglets = document.createElement('nav');
  barreOnglets.id = 'barre-onglets';
  poserAttribut(barreOnglets, 'aria-label', 'onglets.titre');
  const creerOnglet = (id, icone, cle) => {
    const onglet = document.createElement('button');
    onglet.id = id;
    onglet.type = 'button';
    onglet.className = 'onglet';
    onglet.setAttribute('aria-controls', 'menu-tiroir');
    onglet.setAttribute('aria-expanded', 'false');
    onglet.innerHTML = `${creerIconeMenu(icone)}<span ${ti(cle)}>${t(cle)}</span>`;
    return onglet;
  };
  const bouton = creerOnglet('menu-bouton', 'onglet-preparer', 'onglets.preparer');
  poserAttribut(bouton, 'aria-label', 'menu.ouvrir-activites');
  const ongletTraces = creerOnglet('onglet-traces', 'onglet-traces', 'onglets.traces');
  const ongletExplorer = creerOnglet('onglet-explorer', 'onglet-explorer', 'onglets.explorer');
  // Onglet → rubrique du tiroir qu'il montre
  const ONGLETS_TIROIR = new Map([[bouton, 'activites'], [ongletTraces, 'traces']]);
  // Chaque onglet ouvre d'abord sa bande de petites cartes, la carte libre au-dessus ; une carte ouvre son panneau
  // (bandes posées en fin d'initMenu)
  let fermerExplorer = () => {};
  const bandes = new Map();
  let bandeOuverte = null;
  const basculeurs = new Map();

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
  tiroir.dataset.onglet = 'activites';
  document.body.append(boutonParametres, tiroir, barreOnglets);
  const corps = tiroir.querySelector('.menu-corps');
  const TITRES_TIROIR = { activites: ['onglet-preparer', 'onglets.preparer'], traces: ['onglet-traces', 'onglets.traces'], jeux: ['jeux', 'menu.jeux'] };
  const enteteTiroir = document.createElement('header');
  enteteTiroir.className = 'outil-rapide-entete tiroir-entete';
  enteteTiroir.innerHTML = `
    <div class="outil-rapide-titre"><span class="tiroir-icone"></span><span class="outil-rapide-noms"><strong></strong></span></div>
    <button type="button" class="outil-rapide-reduire" aria-expanded="true">${CHEVRON_BAS}</button>
    <button type="button" class="outil-rapide-fermer" ${ta('aria-label', 'menu.fermer')}>${creerIconeMenu('close')}</button>
  `;
  corps.before(enteteTiroir);
  const reduireTiroir = (reduit) => {
    tiroir.classList.toggle('reduit', reduit);
    const bouton = enteteTiroir.querySelector('.outil-rapide-reduire');
    poserAttribut(bouton, 'aria-label', reduit ? 'menu.agrandir-panneau' : 'menu.reduire-panneau');
    bouton.title = bouton.getAttribute('aria-label');
    bouton.setAttribute('aria-expanded', String(!reduit));
  };
  const majEnteteTiroir = () => {
    const [icone, cle] = TITRES_TIROIR[tiroir.dataset.onglet] ?? TITRES_TIROIR.activites;
    enteteTiroir.querySelector('.tiroir-icone').innerHTML = icone === 'jeux'
      ? '<img src="/icons/activites/jeux.svg" alt="" width="30" height="30" />'
      : creerIconeMenu(icone);
    enteteTiroir.querySelector('.tiroir-icone').classList.toggle('vignette', icone === 'jeux');
    poser(enteteTiroir.querySelector('strong'), cle);
  };
  enteteTiroir.querySelector('.outil-rapide-reduire').addEventListener('click', (event) => {
    event.stopPropagation();
    reduireTiroir(!tiroir.classList.contains('reduit'));
  });
  enteteTiroir.addEventListener('click', (event) => {
    if (tiroir.classList.contains('reduit') && !event.target.closest('.outil-rapide-fermer')) reduireTiroir(false);
  });
  enteteTiroir.querySelector('.outil-rapide-fermer').addEventListener('click', () => ouvrir(false));
  suivreGlisse(tiroir, (cible) => cible.closest('.tiroir-entete, .params-entete') && !cible.closest('button'), {
    contenu: true,
    // Paramètres n'a pas de barre réduite : un glissé les ferme
    bas: () => (tiroir.classList.contains('reduit') || tiroir.classList.contains('en-parametres') ? ouvrir(false) : reduireTiroir(true)),
    haut: () => reduireTiroir(false),
  });

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
      // L'onglet dont la bande est ouverte reste allumé
      if (bandes.get(bandeOuverte)?.onglet !== boutonsFlottants.get(id)) boutonsFlottants.get(id).setAttribute('aria-expanded', 'false');
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

  // Une fiche (point, objet, balise, station…) passe devant : bandes et panneaux s'effacent, pas de chevauchement
  window.addEventListener('fiche-ouverte', () => {
    fermerPanneauxFlottants();
    fermerExplorer();
  });
  window.addEventListener('panneau-carte', () => {
    if (document.querySelector('.bf:not([hidden]):not(.lune-visite-panneau)')) fermerExplorer();
  });
  // Pastille du vent : son réglage est dans son panneau posé sur la carte, que Météo ou Carte cachent sur téléphone
  window.addEventListener('montis:montrer-carte', () => {
    fermerPanneauxFlottants();
    if (tiroir.classList.contains('ouvert')) ouvrir(false);
  });

  const montrerParametres = (oui) => tiroir.classList.toggle('en-parametres', oui);
  const ouvrir = (ouvert, pageParametres = false, rubrique = 'activites') => {
    tiroir.classList.toggle('ouvert', ouvert);
    reduireTiroir(false);
    if (ouvert) {
      tiroir.dataset.onglet = rubrique;
      majEnteteTiroir();
      fermerExplorer();
    }
    montrerParametres(ouvert && pageParametres);
    for (const [onglet, sienne] of ONGLETS_TIROIR) {
      onglet.setAttribute('aria-expanded', String(ouvert && !pageParametres && tiroir.dataset.onglet === sienne));
    }
    // Géographie s'ouvre depuis Explorer : c'est lui qui reste allumé
    if (tiroir.dataset.onglet === 'jeux') ongletExplorer.setAttribute('aria-expanded', String(ouvert && !pageParametres));
    poserAttribut(bouton, 'aria-label', bouton.getAttribute('aria-expanded') === 'true' ? 'menu.ouvert' : 'menu.ouvrir-activites');
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

  const soleilLune = creerSoleilLune(map);
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
          import('./activite-ski.js').then((m) => m.creerActiviteSki(map, { fermerMenu, ouvrirMenu }))
        ),
      ],
      emplacement: 'menu',
    },
    {
      // Toujours disponible : s'ouvre par-dessus l'activité sans l'arrêter
      id: 'traces',
      titre: 'menu.traces',
      icone: 'sorties',
      aide: 'menu.aide-traces',
      exclusif: false,
      modules: [
        differer({ id: 'sorties', labelCle: 'traces.sorties', icone: 'sorties' }, () =>
          import('./mes-traces.js').then((m) => m.creerSorties(map, { fermerMenu, ouvrirMenu: () => ouvrir(true, false, 'traces') }))
        ),
        differer({ id: 'parcours', labelCle: 'traces.parcours', icone: 'parcours' }, () =>
          import('./mes-traces.js').then((m) => m.creerParcoursTraces(map, { fermerMenu }))
        ),
      ],
      emplacement: 'menu',
    },
    {
      // Lot P.4a : on joue sur le globe sans quitter son activité
      id: 'jeux',
      titre: 'menu.jeux',
      icone: 'jeux',
      aide: 'menu.aide-jeux',
      exclusif: false,
      modules: [
        differer({ id: 'quiz-pays', labelCle: 'jeux.quiz', icone: 'culture-geo' }, () =>
          import('./jeux.js').then((m) => m.creerJeux(map, { fermerMenu, ouvrirMenu: () => ouvrir(true, false, 'jeux') }))
        ),
      ],
      emplacement: 'menu',
    },
    {
      id: 'meteo',
      onglet: true,
      // L'onglet Météo montre tout de suite la météo d'ici, s'il n'y a rien d'autre d'ouvert dedans
      surOuverture: () => {
        const etats = etatsParCategorie.get('meteo');
        if (etats && !etats.some((e) => e.actif)) demarrer(etats[0]);
      },
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
      onglet: true,
      titre: 'menu.carte',
      icone: 'carte',
      aide: 'menu.aide-carte',
      exclusif: false,
      // Nécessaires dès le démarrage : ils rétablissent le fond et les éléments choisis
      modules: [
        // Les éléments de la carte sont rangés dans « Avancé » du fond de carte
        immediat(creerFondDeCarte(map, { elements: creerElementsCarte(map) })),
        immediat(creerOptionRelief(map)), // inclut les courbes de niveau
        immediat(creerNatureSousSol(map)),
        immediat(creerCartesHorsLigne(map, { fermerMenu, ouvrirMenu: () => ouvrirFlottant('carte') })),
      ],
      emplacement: 'flottant',
    },
    {
      // Lot 4.7 : jour et heure communs en tête, puis l'ombre du soleil et la Lune
      id: 'ciel',
      horsColonne: true,
      uneSection: true,
      titre: 'menu.ciel',
      icone: 'ciel',
      aide: 'menu.aide-ciel',
      exclusif: false,
      entete: soleilLune.entete,
      surOuverture: soleilLune.surOuverture,
      modules: [
        // Immédiat : l'ombre se rétablit au démarrage si elle était allumée
        immediat(soleilLune.ombres),
        differer({ id: 'lune', labelCle: 'lune.titre', icone: 'lune' }, () =>
          Promise.all([import('./lune.js'), soleilLune.partage.charger()])
            .then(([m, reglage]) => m.creerLune(map, soleilLune.partage, reglage))
        ),
      ],
      emplacement: 'flottant',
    },
  ];

  // Ouvre le tiroir sur une rubrique, en haut
  const ouvrirRubrique = (rubrique) => {
    ouvrir(true, false, rubrique);
    corps.scrollTop = 0;
  };
  boutonParametres.addEventListener('click', () => {
    ouvrir(true, true);
    obtenirParametres().then(
      (page) => page.surOuverture?.(),
      (erreur) => {
        console.error('Paramètres indisponibles :', erreur);
        if (fichierDisparu(erreur)) rechargerSurNouvelleVersion();
      }
    );
  });
  boutonFermer.addEventListener('click', () => ouvrir(false));

  map.on('click', () => {
    fermerPanneauxFlottants({ garderReduits: true });
    if (!tiroir.classList.contains('reduit')) ouvrir(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fermerPanneauxFlottants();
      ouvrir(false);
    }
  });

  // ---------- Page Paramètres : chargée à sa première ouverture (avec la sauvegarde) ----------
  let pageParametres = null;
  function obtenirParametres() {
    pageParametres ??= import('./parametres.js').then(({ creerPageParametres }) => {
      const page = creerPageParametres({
        retour: () => {
          montrerParametres(false);
          boutonParametres.setAttribute('aria-expanded', 'false');
        },
      });
      tiroir.querySelector('.menu-parametres').appendChild(page);
      return page;
    });
    pageParametres.catch(() => {
      pageParametres = null;
    });
    return pageParametres;
  }

  // ---------- Rubriques et modules ----------
  function finChargement(e) {
    e.ligne.classList.remove('en-chargement');
    e.ligne.removeAttribute('aria-busy');
  }

  // Pastille de l'activité en cours, avec les couches : la carte dit pourquoi elle montre balises ou repères,
  // ✕ arrête l'activité, un appui rouvre le menu sur elle
  let activiteEnCours = null;
  const pastilleActivite = creerPastilleCouche({
    ordre: -10,
    filtre: false, // le mode espace n'arrête pas l'activité
    nom: () => (activiteEnCours ? t(activiteEnCours.def.labelCle) : ''),
    legende: () => {
      const fichier = activiteEnCours && ICONES_ACTIVITES[activiteEnCours.def.icone];
      return fichier ? `<img class="mini-activite" src="/icons/activites/${fichier}.svg" alt="" width="22" height="22">` : '';
    },
    onOuvrir: () => {
      const e = activiteEnCours;
      ouvrir(true, false, 'activites');
      if (e) requestAnimationFrame(() => e.ligne.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    },
    onRetirer: () => activiteEnCours?.ligne.click(),
  });
  function suivreActivite(e, actif) {
    if (!e.exclusif) return;
    if (actif) activiteEnCours = e;
    else if (activiteEnCours === e) activiteEnCours = null;
    pastilleActivite.montrer(!!activiteEnCours);
    if (activiteEnCours) pastilleActivite.maj();
  }

  function demarrer(e) {
    // Soleil et Lune : une seule section ouverte ; replier l'autre ne retire rien de la carte (ombre comprise)
    if (e.uneSection) etatsParCategorie.get(e.categorie)?.forEach((autre) => autre !== e && autre.actif && arreter(autre));
    suivreActivite(e, true);
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
        // Fichier d'une ancienne version, effacé par la nouvelle : la page passe à la nouvelle
        if (fichierDisparu(erreur) && rechargerSurNouvelleVersion()) return;
        if (demande !== e.demande) return;
        finChargement(e);
        arreter(e);
        e.contenu.style.display = 'block';
        e.erreur.hidden = false;
      }
    );
  }

  function arreter(e) {
    suivreActivite(e, false);
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
    const { categorie, retour, section } = event.detail || {};
    // Une pratique qui a ses propres parcours s'ouvre par son activité (le ski de rando par le Ski)
    const module = event.detail?.module === 'skirando' ? 'ski' : event.detail?.module;
    const panneau = panneauxFlottants.get(categorie);
    const etat = etatsParCategorie.get(categorie)?.find((e) => e.def.id === module);
    if (!etat) return;
    // Une activité : comme un appui sur sa ligne du menu (exclusivité comprise), sauf si elle tourne déjà
    if (!panneau) {
      if (!etat.actif) etat.ligne.click();
      return;
    }
    if (panneau.hidden) basculeurs.get(categorie)();
    reduirePanneau(panneau, false);
    if (!etat.actif) demarrer(etat);
    // Le réglage demandé en haut du panneau (appui sur une pastille de couche)
    // (ou sa partie, quand le module en a : éléments de la carte dans « Avancé » du fond)
    const cible = (section && etat.def.instance?.ouvrirSection?.(section)) || etat.ligne;
    requestAnimationFrame(() => cible.scrollIntoView({ block: 'start', behavior: 'smooth' }));
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

    if (categorie.entete) vue.appendChild(categorie.entete);

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
      boutonOutil.innerHTML = `${creerIconeMenu(categorie.onglet ? `onglet-${categorie.id}` : categorie.icone)}<span ${ti(categorie.titre)}>${t(categorie.titre)}</span>`;
      ajouterAideMaintien(boutonOutil, categorie.titre);

      const panneauOutil = document.createElement('aside');
      panneauOutil.className = 'outil-rapide-panneau';
      panneauOutil.id = `outil-rapide-panneau-${categorie.id}`;
      poserAttribut(panneauOutil, 'aria-label', `menu.outils-${categorie.id === 'carte' ? 'carte-court' : categorie.id}`);
      panneauOutil.hidden = true;
      panneauOutil.innerHTML = `
        <header class="outil-rapide-entete">
          <div class="outil-rapide-titre">
            ${categorie.id === 'ciel'
              // Même vignette que sa carte de Plus (comme Jeux)
              ? '<img class="outil-rapide-vignette" src="/icons/activites/ciel.svg" alt="" width="30" height="30" />'
              : creerIconeMenu(categorie.icone)}
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
      // Carte et Météo sont des onglets ; Soleil et Lune reste dans la colonne de droite
      if (categorie.onglet) boutonOutil.classList.add('onglet');
      else if (!categorie.horsColonne) actionsFlottantes.appendChild(boutonOutil);
      document.body.appendChild(panneauOutil);
      boutonsFlottants.set(categorie.id, boutonOutil);
      panneauxFlottants.set(categorie.id, panneauOutil);

      reduirePanneau(panneauOutil, false);
      suivreGlisse(panneauOutil, (cible) => cible.closest('.outil-rapide-entete') && !cible.closest('button'), {
        contenu: true,
        bas: () => {
          if (panneauOutil.classList.contains('reduit')) panneauOutil.querySelector('.outil-rapide-fermer').click();
          else reduirePanneau(panneauOutil, true);
        },
        haut: () => reduirePanneau(panneauOutil, false),
      });
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

      const basculer = () => {
        fermerExplorer();
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
          categorie.surOuverture?.();
        }
      };
      basculeurs.set(categorie.id, basculer);
      // Carte et Météo : l'onglet ouvre sa bande (fin d'initMenu) ; Soleil et Lune ouvre son panneau
      if (!categorie.onglet) boutonOutil.addEventListener('click', basculer);
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

      const etat = { def, ligne, contenu, erreur, actif: false, demande: 0, exclusif: categorie.exclusif, uneSection: categorie.uneSection, categorie: categorie.id };
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

  // ---------- Panorama des sommets (lot 4.1) : dernier bouton de la colonne, chargé au premier appui ----------
  const boutonPanorama = document.createElement('button');
  boutonPanorama.type = 'button';
  boutonPanorama.className = 'outil-rapide-bouton';
  boutonPanorama.id = 'outil-rapide-bouton-panorama';
  poserAttribut(boutonPanorama, 'aria-label', 'panorama.ouvrir');
  boutonPanorama.innerHTML = `${creerIconeMenu('panorama')}<span ${ti('panorama.titre')}>${t('panorama.titre')}</span>`;
  ajouterAideMaintien(boutonPanorama, 'panorama.titre');
  // options : point ({ lng, lat }) et retour, quand Horizon s'ouvre depuis la fiche d'un point
  const ouvrirHorizon = (options = {}) => {
    // iOS n'accorde la boussole que pendant l'appui lui-même : la demande part avant tout chargement
    const boussole = window.DeviceOrientationEvent?.requestPermission?.().catch(() => 'denied');
    fermerPanneauxFlottants();
    ouvrir(false);
    fermerExplorer();
    boutonPanorama.disabled = true;
    import('./panorama.js')
      .then((m) => (options.point
        ? m.ouvrirPanorama(map, { ...options, boussole })
        : m.ouvrirAuBonEndroit(map, (point) => m.ouvrirPanorama(map, { ...options, point, boussole }))))
      .catch((err) => {
        console.warn('Panorama indisponible :', err);
        if (fichierDisparu(err)) rechargerSurNouvelleVersion();
      })
      .finally(() => { boutonPanorama.disabled = false; });
  };
  boutonPanorama.addEventListener('click', () => ouvrirHorizon());
  // « Horizon d'ici » de la fiche du point (fiche-point.js, chargé à la demande : par un événement)
  window.addEventListener('montis:ouvrir-horizon', (event) => {
    const { lng, lat, retour } = event.detail || {};
    if (Number.isFinite(lng) && Number.isFinite(lat)) ouvrirHorizon({ point: { lng, lat }, retour });
  });

  // ---------- Partager la vue (lot 4.5) : position, angle, 2D ou 3D et fond, dans un lien ----------
  const partage = document.createElement('section');
  partage.className = 'menu-vue menu-partage';
  const lignePartage = document.createElement('button');
  lignePartage.type = 'button';
  lignePartage.className = 'menu-ligne';
  lignePartage.innerHTML = `${creerIconeMenu('partage')}<span></span>`;
  poser(lignePartage.querySelector('span'), 'partage.vue');
  lignePartage.addEventListener('click', () => {
    const centre = map.getCenter();
    partagerLien(fragmentVue({
      lng: centre.lng,
      lat: centre.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      mode3D: Boolean(etatCarte.mode3D),
      fond: lire('fond', 'montis'),
    }), 'Montis');
  });
  partage.append(lignePartage);
  // La vue se partage depuis l'onglet Carte
  panneauxFlottants.get('carte').querySelector('.outil-rapide-corps').appendChild(partage);

  // Logo de l'appli en haut à gauche : il ouvre les Paramètres, comme le profil des applis (décision du propriétaire
  // du 25 novembre 2026). Un petit engrenage dans son coin le dit.
  const logo = document.createElement('button');
  logo.id = 'logo-onglets';
  logo.type = 'button';
  logo.setAttribute('aria-controls', 'menu-tiroir');
  logo.innerHTML = `<img src="/logos/montis-icon-fullbleed.svg" alt="" width="48" height="48" /><span class="logo-engrenage">${creerIconeMenu('reglages')}</span>`;
  poserAttribut(logo, 'aria-label', 'menu.ouvrir-parametres');
  poserAttribut(logo, 'title', 'menu.parametres');
  logo.addEventListener('click', () => {
    if (tiroir.classList.contains('en-parametres') && tiroir.classList.contains('ouvert')) ouvrir(false);
    else boutonParametres.click();
  });
  document.body.appendChild(logo);
  barreOnglets.append(boutonsFlottants.get('carte'), bouton, boutonsFlottants.get('meteo'), ongletTraces, ongletExplorer);

  // ---------- Bandes des onglets (refonte du 25 novembre 2026) ----------
  // Un onglet ouvre sa bande de petites cartes en bas, la carte reste libre au-dessus ; une carte ouvre son panneau
  // (qui garde sa croix et se réduit). Explorer n'a que des cartes : Horizon reste dans la colonne.
  const vignette = (fichier) => `<img src="/icons/activites/${fichier}.svg" alt="" width="40" height="40" />`;
  const icone = (nom) => `<span class="bande-icone">${creerIconeMenu(nom)}</span>`;
  function creerBande(id, onglet, cartes) {
    const element = document.createElement('section');
    element.className = 'bande-onglet';
    element.id = `bande-${id}`;
    element.hidden = true;
    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.className = 'bande-fermer';
    poserAttribut(fermer, 'aria-label', 'menu.fermer');
    fermer.innerHTML = creerIconeMenu('close');
    fermer.addEventListener('click', () => fermerExplorer());
    // En-tête : sur ordinateur, le nom de l'onglet et la croix en tête de colonne ; sur téléphone, la croix
    // seule en tête de bande (le nom est caché)
    const tete = document.createElement('div');
    tete.className = 'bande-tete';
    const nom = document.createElement('strong');
    const majNom = () => { nom.textContent = onglet.querySelector('span')?.textContent ?? ''; };
    majNom();
    surLangue(majNom);
    tete.append(nom, fermer);
    element.appendChild(tete);
    const details = [];
    for (const { cle, image, titre, detail, action } of cartes) {
      const carte = document.createElement('button');
      carte.type = 'button';
      carte.className = 'bande-carte';
      carte.dataset.carte = cle;
      carte.innerHTML = `${image}<span class="bande-noms"><strong></strong><small></small></span>`;
      poser(carte.querySelector('strong'), titre);
      carte.addEventListener('click', action);
      element.appendChild(carte);
      details.push([carte, carte.querySelector('small'), detail]);
    }
    const suite = document.createElement('button');
    suite.type = 'button';
    suite.className = 'bande-suite';
    poserAttribut(suite, 'aria-label', 'bande.suite');
    suite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    suite.addEventListener('click', () => element.scrollTo({ left: element.scrollWidth, behavior: 'smooth' }));
    element.appendChild(suite);
    const majSuite = () => element.classList.toggle('deborde', element.scrollWidth - element.clientWidth - element.scrollLeft > 8);
    element.addEventListener('scroll', majSuite, { passive: true });
    window.addEventListener('resize', majSuite);
    document.body.appendChild(element);
    suivreGlisse(element, () => true, { bas: () => fermerExplorer() });
    const maj = () => {
      for (const [carte, petit, detail] of details) {
        const [cle, variables, allume] = detail();
        poser(petit, cle, variables);
        carte.classList.toggle('allumee', Boolean(allume));
      }
    };
    bandes.set(id, { element, onglet, maj: () => { maj(); requestAnimationFrame(majSuite); } });
  }
  let globeEclaire = lire('globe-plein-jour', false);
  const etatModule = (categorie, id) => etatsParCategorie.get(categorie)?.find((e) => e.def.id === id);
  const ouvrirModule = (categorie, module) => () =>
    window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie, module } }));
  // Carte d'un module : son nom, « Allumé » quand il tourne, sinon sa phrase
  const carteModule = (categorie, id, image, detailCle, action = ouvrirModule(categorie, id)) => ({
    cle: id,
    image,
    titre: etatModule(categorie, id)?.def.labelCle ?? detailCle,
    detail: () => (etatModule(categorie, id)?.actif ? ['bande.allume', {}, true] : [detailCle]),
    action,
  });

  creerBande('carte', boutonsFlottants.get('carte'), [
    carteModule('carte', 'fond', icone('fond'), 'bande.fond'),
    carteModule('carte', 'relief', icone('relief'), 'bande.relief'),
    carteModule('carte', 'nature', icone('nature'), 'bande.nature'),
    carteModule('carte', 'hors-ligne', icone('hors-ligne'), 'bande.hors-ligne'),
    { cle: 'partage', image: icone('partage'), titre: 'bande.partage', detail: () => ['bande.partage-detail'], action: () => lignePartage.click() },
  ]);
  const activite = (id, fichier) => carteModule('activites', id, vignette(fichier), `bande.${id}`, () => {
    const etat = etatModule('activites', id);
    if (etat && !etat.actif) etat.ligne.click();
    ouvrirRubrique('activites');
  });
  creerBande('activites', bouton, [activite('parapente', 'parapente'), activite('rando', 'randonnee'), activite('velo', 'velo'), activite('ski', 'ski')]);
  creerBande('meteo', boutonsFlottants.get('meteo'), [
    carteModule('meteo', 'meteo-locale', icone('meteo'), 'bande.meteo-locale'),
    carteModule('meteo', 'radar', icone('radar'), 'bande.radar'),
    carteModule('meteo', 'vent', icone('vent'), 'bande.vent'),
  ]);
  const trace = (id) => carteModule('traces', id, icone(id), `bande.${id}`, () => {
    ouvrirRubrique('traces');
    const etat = etatModule('traces', id);
    if (etat && !etat.actif) etat.ligne.click();
  });
  // Créer un parcours : dans l'activité en cours si elle a ses parcours, sinon en Randonnée ; on le range à
  // l'enregistrement dans l'activité voulue
  const creerParcours = {
    cle: 'creer', image: icone('creer-parcours'), titre: 'bande.creer', detail: () => ['bande.creer-detail'],
    action: () => {
      const enCours = etatsParCategorie.get('activites')?.find((e) => e.actif)?.def.id;
      const activite = ['rando', 'velo'].includes(enCours) ? enCours : 'rando';
      deposer(`creer-parcours-${activite}`, true);
      fermerExplorer();
      window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'activites', module: activite } }));
    },
  };
  creerBande('traces', ongletTraces, [trace('sorties'), trace('parcours'), creerParcours]);

  // Explorer : détails du moment (phase de la Lune, coucher du soleil au centre de la carte)
  const heure = (date) => (Number.isNaN(date?.getTime?.()) ? '' : `${date.getHours()}h${String(date.getMinutes()).padStart(2, '0')}`);
  creerBande('explorer', ongletExplorer, [
    {
      cle: 'horizon', image: vignette('horizon'), titre: 'panorama.titre', detail: () => ['bande.horizon'],
      action: () => ouvrirHorizon(),
    },
    {
      cle: 'ciel', image: vignette('ciel'), titre: 'menu.ciel',
      detail: () => {
        const { lng, lat } = map.getCenter();
        const coucher = heure(getTimes(new Date(), lat, lng).sunset);
        return coucher ? ['explorer.ciel-detail', { heure: coucher }] : ['explorer.ciel-sans-coucher'];
      },
      action: () => {
        fermerExplorer();
        boutonsFlottants.get('ciel')?.click();
      },
    },
    {
      cle: 'globe', image: vignette('globe'), titre: 'explorer.globe', detail: () => ['explorer.globe-detail'],
      action: () => {
        document.body.classList.remove('eclairage-ferme');
        map.flyTo({ zoom: 1.6, pitch: 0, bearing: 0, duration: 2600, essential: true });
      },
    },
    // Jeux : on choisit ensuite le jeu (Géographie aujourd'hui, d'autres viendront)
    {
      cle: 'jeux', image: vignette('jeux'), titre: 'menu.jeux', detail: () => ['bande.jeux'],
      action: () => ouvrirRubrique('jeux'),
    },
  ]);

  // Globe tout éclairé ou à l'heure réelle, avec sa nuit (demande du propriétaire du 25 novembre 2026) ;
  // un jeu remet le plein jour puis l'enlève en finissant : on rétablit alors le choix gardé
  if (globeEclaire) fixerPleinJour(true);
  // Choix posé sur la vue d'espace, sous la colonne de droite, dès que le globe se voit
  const choixEclairage = document.createElement('div');
  choixEclairage.className = 'eclairage-globe';
  choixEclairage.setAttribute('role', 'group');
  poserAttribut(choixEclairage, 'aria-label', 'bande.eclairage');
  // Bulle refermable : elle revient en touchant Globe ou en se rapprochant puis en s'éloignant de nouveau
  choixEclairage.innerHTML = `<strong class="eclairage-titre"></strong><div class="eclairage-choix"><button type="button" data-plein="0"></button><button type="button" data-plein="1"></button></div><button type="button" class="eclairage-fermer">${creerIconeMenu('close')}</button>`;
  poser(choixEclairage.querySelector('.eclairage-titre'), 'bande.eclairage-titre');
  poserAttribut(choixEclairage.querySelector('.eclairage-fermer'), 'aria-label', 'menu.fermer');
  choixEclairage.querySelector('.eclairage-fermer').addEventListener('click', (event) => {
    event.stopPropagation();
    document.body.classList.add('eclairage-ferme');
  });
  poser(choixEclairage.querySelector('[data-plein="0"]'), 'bande.eclairage-reel');
  poser(choixEclairage.querySelector('[data-plein="1"]'), 'bande.eclairage-plein');
  const majChoixEclairage = () => {
    choixEclairage.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.plein === '1') === globeEclaire)));
  };
  choixEclairage.addEventListener('click', (event) => {
    const bouton = event.target.closest('button[data-plein]');
    if (!bouton) return;
    globeEclaire = bouton.dataset.plein === '1';
    ecrire('globe-plein-jour', globeEclaire);
    if (!document.body.classList.contains('jeu-en-cours')) fixerPleinJour(globeEclaire);
    majChoixEclairage();
  });
  majChoixEclairage();
  document.body.appendChild(choixEclairage);
  // « Toute la Terre » : le globe entier tient à l'écran
  const majVueEspace = () => {
    const espace = map.getZoom() < 3.2;
    if (!espace) document.body.classList.remove('eclairage-ferme');
    document.body.classList.toggle('vue-espace', espace);
  };
  map.on('zoomend', majVueEspace);
  map.on('zoom', majVueEspace);
  majVueEspace();
  window.addEventListener('montis:heure-espace', () => {
    if (globeEclaire && !pleinJour() && !document.body.classList.contains('jeu-en-cours')) fixerPleinJour(true);
  });

  window.addEventListener('montis:ouvrir-ciel', () => {
    if (panneauxFlottants.get('ciel')?.hidden) basculeurs.get('ciel')();
  });

  // Jeu, visite, Horizon… : un mode à part. Tout ce qui est ouvert se referme et les onglets s'effacent
  // (style.css, body.jeu-en-cours, en-visite) : on n'ouvre pas les pentes au milieu d'un quiz des drapeaux
  window.addEventListener('montis:plein-ecran', (event) => {
    if (!event.detail?.actif) return;
    fermerExplorer();
    fermerPanneauxFlottants();
    ouvrir(false);
  });

  // Sur ordinateur, la molette fait défiler une bande de côté
  for (const { element } of bandes.values()) {
    element.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      element.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
  }

  const montrerBande = (id) => {
    for (const [nom, { element, onglet, maj }] of bandes) {
      const oui = nom === id;
      if (oui) maj();
      element.hidden = !oui;
      if (oui) element.scrollLeft = 0;
      if (oui || bandeOuverte === nom) onglet.setAttribute('aria-expanded', String(oui));
    }
    bandeOuverte = id;
    document.body.classList.toggle('explorer-ouvert', id === 'explorer');
    document.body.classList.toggle('bande-ouverte', Boolean(id));
  };
  fermerExplorer = () => {
    if (bandeOuverte) montrerBande(null);
  };
  // Un onglet : sa bande ; touché de nouveau, il referme ce qu'il a ouvert (bande ou panneau)
  for (const [id, { onglet }] of bandes) {
    onglet.addEventListener('click', () => {
      if (bandeOuverte === id) {
        montrerBande(null);
        return;
      }
      const ouvertIci = onglet.getAttribute('aria-expanded') === 'true';
      fermerPanneauxFlottants();
      ouvrir(false);
      if (!ouvertIci) montrerBande(id);
    });
  }
}
