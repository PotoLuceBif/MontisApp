// « Rechercher ici » du ski de rando : itinéraires d'OSM (`piste:type=skitour`) de la vue, lus dans
// /data/skitour (un fichier par carré de 1°, d'après OpenSkiData : Overpass est trop souvent saturé),
// posés sur la carte en pins de ski de rando, regroupés quand ils se touchent (comme la Randonnée),
// et listés dans le panneau. Un appui ouvre l'itinéraire dans l'éditeur de
// parcours, comme une trace importée (profil, pentes, durée, export GPX).
import { carresDeLaVue, lireCarresSkitour } from './skirando-calcul.js';
import { messageErreur } from './requete.js';
import { annoncerOutilActivite } from './outil-activite.js';
import { creerDecouverte } from './parcours-decouverte.js';
import { formatDistance } from './unites.js';
import { surLangue, t } from './i18n.js';

const DOSSIER = '/data/skitour';
const ZOOM_MIN = 9;
const MAX_LISTE = 40;

function lireJson(adresse) {
  return fetch(adresse).then((reponse) => {
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    return reponse.json();
  });
}

// Carrés qui ont des itinéraires : un carré absent n'est jamais demandé
let chargementIndex = null;
function chargerIndex() {
  chargementIndex ??= lireJson(`${DOSSIER}/index.json`)
    .then((json) => new Set(json.carres ?? []))
    .catch((erreur) => {
      chargementIndex = null;
      throw erreur;
    });
  return chargementIndex;
}

const carres = new Map();
function chargerCarre(cle) {
  if (!carres.has(cle)) {
    const promesse = lireJson(`${DOSSIER}/${cle}.json`);
    promesse.catch(() => carres.delete(cle));
    carres.set(cle, promesse);
  }
  return carres.get(cle);
}

// `surItineraires` reçoit les itinéraires chargés (le routage les suit), une liste vide quand ils partent
export function creerZoneSkitour(map, { editeur, fermerMenu, afficherMessage, liste, surItineraires = () => {} }) {
  let itineraires = [];
  let numero = 0;
  let actif = false;
  let message = null; // [clé, variables] du dernier message, réécrit au changement de langue
  const annoncer = (cle, variables) => {
    message = cle ? [cle, variables] : null;
    afficherMessage(cle ? t(cle, variables) : '');
  };

  // OpenSkiData réunit parfois plusieurs noms (« A, B, C ») : le premier suffit
  const nomDe = (itineraire) => itineraire.nom.split(', ')[0] || t('skirando.sans-nom');

  // Un pin par itinéraire ; un appui l'ouvre, l'appui long ou le survol en donne le résumé
  const decouverte = creerDecouverte(map, {
    ouvrirRoute: (route) => ouvrir(route.itineraire),
    masque: () => editeur.ouvert,
    nomPluriel: 'skirando.pluriel',
    pinDe: () => 'skirando',
  });
  function poserReperes() {
    decouverte.poser(itineraires.map((itineraire) => ({
      route: { id: itineraire.id, name: nomDe(itineraire), itineraire },
      trace: { chaine: itineraire.lignes.flat(), lignes: itineraire.lignes },
    })));
  }

  function ouvrir(itineraire) {
    fermerMenu();
    decouverte.masquer();
    editeur.ouvrirTrace({
      nom: nomDe(itineraire),
      chaine: itineraire.lignes.flat(),
      lignes: itineraire.lignes,
      avecSauts: itineraire.lignes.length > 1,
      meta: [t('skirando.itineraire'), itineraire.difficulte ? t(`skirando.difficulte-${itineraire.difficulte}`) : ''].filter(Boolean).join(' · '),
      infos: itineraire.osm ? [{ texte: t('skirando.voir-osm'), lien: `https://www.openstreetmap.org/${itineraire.osm}` }] : [],
    });
  }

  function ligne(itineraire) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rando-item parcours-item';
    const badge = document.createElement('span');
    badge.className = 'rando-badge skirando-badge';
    badge.textContent = t('skirando.badge');
    const textes = document.createElement('span');
    textes.className = 'rando-item-textes';
    const nom = document.createElement('span');
    nom.className = 'rando-item-nom';
    nom.textContent = nomDe(itineraire);
    const sous = document.createElement('span');
    sous.className = 'rando-item-sous';
    sous.textContent = [formatDistance(itineraire.longueur), itineraire.difficulte ? t(`skirando.difficulte-${itineraire.difficulte}`) : ''].filter(Boolean).join(' · ');
    textes.append(nom, sous);
    item.append(badge, textes);
    item.addEventListener('click', () => ouvrir(itineraire));
    return item;
  }

  function rendre() {
    const affiches = itineraires.slice(0, MAX_LISTE);
    liste.hidden = !affiches.length;
    liste.replaceChildren(...affiches.map(ligne));
  }

  function vider() {
    itineraires = [];
    rendre();
    decouverte.retirer();
    surItineraires([]);
  }

  // `discret` : chargement pour le routage à l'ouverture de l'éditeur, sans message dans le panneau
  async function chercher({ discret = false } = {}) {
    if (!discret) annoncerOutilActivite();
    const ici = ++numero;
    const limites = map.getBounds();
    const boite = [limites.getWest(), limites.getSouth(), limites.getEast(), limites.getNorth()];
    if (map.getZoom() < ZOOM_MIN || !carresDeLaVue(boite)) {
      vider();
      if (!discret) annoncer('skirando.zoomer');
      return;
    }
    if (!discret) {
      annoncer('skirando.recherche');
      liste.hidden = true;
    }
    let listes;
    try {
      const disponibles = await chargerIndex();
      listes = await Promise.all(carresDeLaVue(boite, disponibles).map(chargerCarre));
    } catch (erreur) {
      if (ici !== numero || !actif) return;
      console.warn('Itinéraires de ski de rando :', erreur);
      if (!discret) annoncer('skirando.erreur', { get raison() { return messageErreur(erreur); } });
      return;
    }
    if (ici !== numero || !actif) return;
    itineraires = lireCarresSkitour(listes, boite);
    poserReperes();
    rendre();
    surItineraires(itineraires);
    const nombre = itineraires.length;
    if (!discret || nombre) annoncer(nombre ? (nombre > MAX_LISTE ? 'skirando.trouves-max' : 'skirando.trouves') : 'skirando.aucun', { n: nombre, max: MAX_LISTE });
  }

  surLangue(() => {
    if (message) afficherMessage(t(...message));
    rendre();
  });

  return {
    chercher: () => chercher(),
    // Avant de tracer : les itinéraires de la vue, si aucun n'est encore chargé
    preparer() {
      if (!itineraires.length) void chercher({ discret: true });
    },
    // Repères masqués pendant qu'un tracé est ouvert, rétablis à sa fermeture
    masquer: () => decouverte.masquer(),
    actualiser: () => decouverte.actualiser(),
    activer() {
      actif = true;
      decouverte.activer();
    },
    desactiver() {
      actif = false;
      numero += 1;
      vider();
      decouverte.desactiver();
      annoncer(null);
    },
  };
}
