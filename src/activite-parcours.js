// Menu commun aux activités à parcours (vélo, randonnée) : mêmes actions, mêmes filtres, même
// liste. Chaque activité n'apporte que sa configuration.
import { lire, ecrire } from './reglages.js';
import { clientItineraires, niveau, titreDe } from './rando-api.js';
import { lireGpx } from './parcours-gpx.js';
import { creerStockageParcours } from './parcours-stockage.js';
import { creerEditeurParcours } from './parcours-editeur.js';
import { creerItineraires, estIntegral } from './parcours-itineraires.js';
import { creerDecouverte } from './parcours-decouverte.js';
import { formatDenivele, formatDistance } from './unites.js';
import { surPreferences } from './preferences.js';
import { formatDate, poser, t, ta, ti, tt } from './i18n.js';
import { annoncerOutilActivite } from './outil-activite.js';
import { reprendre } from './demandes.js';

const ZOOM_MIN_ZONE = 7;
const REPERES_MAX = 40;
const TAILLE_MAX_GPX = 10 * 1024 * 1024;
const GROUPES_REGROUPABLES = new Set(['INT', 'NAT', 'REG']);
const ICONES = {
  creer: '<path d="M3 6.500 8.500 4l7 2.500L21 4v13.500L15.500 20l-7-2.500L3 20V6.500Z"/><path d="M8.500 4v13.500M15.500 6.500V20"/>',
  zone: '<circle cx="10.800" cy="10.800" r="6.300"/><path d="m16 16 4.500 4.500"/>',
  importer: '<path d="M12 15V3m0 0L7.500 7.500M12 3l4.500 4.500"/><path d="M5 13v6h14v-6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  entonnoir: '<path d="M4 5h16l-6.200 7.500V19l-3.600-2v-4.500L4 5Z"/>',
};
// « GR5 » et « GR 5 » ne donnent pas les mêmes résultats : l'API ne connaît que l'écriture exacte
function ecritures(texte) {
  const [, prefixe, reste] = /^([a-z]{1,4})\s*(\d.*)$/i.exec(texte) ?? [];
  if (!prefixe) return [texte];
  return [...new Set([`${prefixe.toUpperCase()} ${reste}`, `${prefixe.toUpperCase()}${reste}`, texte])];
}
const icone = (dessin) => `<svg aria-hidden="true" viewBox="0 0 24 24">${dessin}</svg>`;

export function creerActiviteParcours(map, activite, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'parcours';
  panneau.innerHTML = `
    <div class="rando-actions-principales" role="group" ${ta('aria-label', 'parcours.actions')}>
      <button type="button" class="rando-action-principale parcours-creer">${icone(ICONES.creer)}${tt('parcours.creer')}</button>
      <button type="button" class="rando-action-principale parcours-zone">${icone(ICONES.zone)}${tt('parcours.rechercher-ici')}</button>
      <label class="rando-importer rando-action-principale">${icone(ICONES.importer)}${tt('parcours.importer')}
        <input type="file" class="rando-fichier parcours-fichier" accept=".gpx,application/gpx+xml,application/xml,text/xml">
      </label>
    </div>
    <div class="pc-recherche">
      <input type="text" class="rando-champ parcours-recherche" ${ta('placeholder', activite.placeholder)} autocomplete="off" spellcheck="false" inputmode="search" ${ta('aria-label', activite.placeholder)}>
      ${activite.filtres.length > 1 ? `
        <button type="button" class="pc-filtre-actif" hidden><span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        <button type="button" class="pc-entonnoir" ${ta('title', 'parcours.filtres')} aria-haspopup="menu" aria-expanded="false">${icone(ICONES.entonnoir)}</button>
        <div class="pc-filtres" role="menu" ${ta('aria-label', 'parcours.filtrer')} hidden>
          ${activite.filtres.map(({ id, cle }) => `<button type="button" role="menuitemradio" data-filtre="${id}" aria-checked="false" ${ti(cle)}>${t(cle)}</button>`).join('')}
        </div>` : ''}
    </div>
    <p class="note parcours-message" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste parcours-liste" hidden></div>
    <div class="pc-entrees"></div>
    <div class="pc-sections"></div>
    <section class="parcours-mes" hidden>
      <h3 ${ti('parcours.mes')}>${t('parcours.mes')}</h3>
      <div class="parcours-mes-liste"></div>
    </section>
    <div class="pc-options"></div>
    <details class="rando-outils">
      <summary ${ti('commun.a-propos')}>${t('commun.a-propos')}</summary>
      <div class="rando-outils-contenu" data-i18n-html="${activite.aPropos}">${t(activite.aPropos)}</div>
    </details>
  `;
  const $ = (selecteur) => panneau.querySelector(selecteur);
  const messageListe = $('.parcours-message');
  const liste = $('.parcours-liste');
  const champRecherche = $('.parcours-recherche');
  const blocMes = $('.parcours-mes');
  const listeMes = $('.parcours-mes-liste');
  const champFichier = $('.parcours-fichier');
  const boutonsFiltre = [...panneau.querySelectorAll('[data-filtre]')];
  const entonnoir = $('.pc-entonnoir');
  const menuFiltres = $('.pc-filtres');
  const filtreActif = $('.pc-filtre-actif');
  const cartes = [...new Set(activite.filtres.flatMap((filtre) => filtre.cartes))];
  const clients = Object.fromEntries(cartes.map((carte) => [carte, clientItineraires(carte)]));
  const stockage = creerStockageParcours(activite.id);

  const idFiltreLu = lire(`${activite.id}-filtre`, 'tous');
  let filtre = activite.filtres.find(({ id }) => id === idFiltreLu) ?? activite.filtres[0];
  let actif = false;
  let controleurListe = null;
  let minuteurRecherche = null;
  let derniereDemande = null;
  let brutes = [];
  let vide = '';

  function fermerTout() {
    itineraires.fermer();
    editeur.fermer();
    decouverte.actualiser();
  }

  const editeur = creerEditeurParcours(map, {
    activite,
    onFermer: fermerTout,
    onRetour: () => ouvrirMenu(),
    onEnregistre: () => window.dispatchEvent(new CustomEvent('montis:parcours-modifies')),
    stockage,
  });
  const typeDe = (route) => activite.typeDe(route);
  const itineraires = creerItineraires(map, {
    activite,
    editeur,
    clients,
    typeDe,
    fermerMenu,
    onFermerTout: fermerTout,
    signaler: afficherMessage,
    ouvrirMenu() {
      ouvrirMenu();
      decouverte.actualiser();
    },
  });
  const decouverte = creerDecouverte(map, {
    clients,
    nomPluriel: activite.nomPluriel,
    ouvrirRoute: itineraires.ouvrirRoute,
    masque: () => editeur.ouvert || itineraires.ouvert,
  });

  function afficherMessage(texte) {
    messageListe.textContent = texte;
    messageListe.hidden = !texte;
  }

  // ---------- Résultats ----------
  // Les tronçons d'un même grand itinéraire ne font qu'une ligne
  function regrouper(routes) {
    const parRef = new Map();
    const lignes = [];
    routes.forEach((route) => {
      const cle = route.ref && GROUPES_REGROUPABLES.has(route.group) ? `${route.carte}/${route.ref}` : null;
      if (!cle) {
        lignes.push({ route });
        return;
      }
      if (!parRef.has(cle)) {
        const groupe = { route, membres: [] };
        parRef.set(cle, groupe);
        lignes.push(groupe);
      }
      parRef.get(cle).membres.push(route);
    });
    return lignes;
  }

  function ligneResultat({ route, membres }) {
    const enGroupe = membres && membres.length >= 2;
    const { court, couleur } = niveau(route.group);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rando-item parcours-item';
    const badge = document.createElement('span');
    badge.className = 'rando-badge';
    badge.textContent = court;
    badge.style.background = couleur;
    const textes = document.createElement('span');
    textes.className = 'rando-item-textes';
    const nom = document.createElement('span');
    nom.className = 'rando-item-nom';
    nom.textContent = enGroupe ? route.ref : titreDe(route);
    const sous = document.createElement('span');
    sous.className = 'rando-item-sous';
    sous.textContent = enGroupe
      ? t('parcours.troncons', { type: typeDe(route), n: membres.length })
      : [typeDe(route), route.itinerary?.join(' → ')].filter(Boolean).join(' · ');
    textes.append(nom, sous);
    item.append(badge, textes);
    item.addEventListener('click', () => {
      if (enGroupe) {
        itineraires.ouvrirGroupe({ titre: route.ref, routes: membres });
      } else {
        void itineraires.ouvrirRoute(route);
      }
    });
    return item;
  }

  function rendreResultats() {
    const routes = brutes.filter((route) => !filtre.garde || filtre.garde(route));
    const lignes = regrouper(routes);
    liste.hidden = !lignes.length;
    if (derniereDemande) afficherMessage(lignes.length ? '' : vide);
    liste.replaceChildren(...lignes.map(ligneResultat));
    if (derniereDemande === chercherDansLaZone) void poserReperes(routes);
    else decouverte.retirer();
  }

  // Une EuroVelo entière pèse des Mo : ses tronçons suffisent à la repérer
  async function poserReperes(routes) {
    const aPoser = routes.filter((route) => route.group !== 'INT' || !estIntegral(route)).slice(0, REPERES_MAX);
    if (!aPoser.length) {
      decouverte.retirer();
      return;
    }
    const resultat = await decouverte.charger(aPoser, (termines, total) => afficherMessage(t('parcours.positionnement', { n: termines, total })));
    if (!resultat) return;
    afficherMessage(resultat.manquants ? t('parcours.reperes-manquants', { n: resultat.affiches, manquants: resultat.manquants }) : '');
  }

  // Une carte d'itinéraires en panne n'empêche pas les autres de répondre
  async function chargerListe(appel, attente, messageVide) {
    controleurListe?.abort();
    const requete = new AbortController();
    controleurListe = requete;
    afficherMessage(attente);
    const resultats = await Promise.allSettled(filtre.cartes.map(async (carte) => {
      const routes = await appel(clients[carte], requete.signal);
      return routes.map((route) => ({ ...route, carte }));
    }));
    if (requete.signal.aborted) return;
    brutes = resultats.flatMap((resultat) => (resultat.status === 'fulfilled' ? resultat.value : []));
    vide = !brutes.length && resultats.every(({ status }) => status === 'rejected')
      ? t('parcours.indisponibles')
      : messageVide;
    rendreResultats();
  }

  function chercherDansLaZone() {
    annoncerOutilActivite();
    if (map.getZoom() < ZOOM_MIN_ZONE) {
      brutes = [];
      vide = t('parcours.zoomer');
      derniereDemande = chercherDansLaZone;
      rendreResultats();
      return;
    }
    const limites = map.getBounds();
    derniereDemande = chercherDansLaZone;
    void chargerListe((client, signal) => client.dansLaZone(limites, signal), t('parcours.recherche-zone'), t('parcours.aucun-zone'));
  }

  function chercherTexte() {
    const texte = champRecherche.value.trim();
    if (texte.length < 2) return;
    derniereDemande = chercherTexte;
    void chargerListe(async (client, signal) => {
      const listes = await Promise.all(ecritures(texte).map((ecriture) => client.chercher(ecriture, signal)));
      return [...new Map(listes.flat().map((route) => [route.id, route])).values()];
    }, t('parcours.recherche'), t('parcours.aucun'));
  }

  // ---------- Réseau sur la carte ----------
  const casesCalque = () => panneau.querySelector('.parcours-calque');

  function appliquerCalque() {
    const voulu = actif && casesCalque()?.checked ? activite.calques(filtre) : [];
    cartes.forEach((carte) => {
      const id = `${activite.id}-calque-${carte}`;
      if (voulu.includes(carte) && !map.getSource(id)) {
        map.addSource(id, {
          type: 'raster',
          tiles: [`https://tile.waymarkedtrails.org/${carte}/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 18,
          attribution: t('parcours.calque-attribution'),
        });
        const dessous = `${activite.id}-groupe-ligne`;
        map.addLayer(
          { id, type: 'raster', source: id, paint: { 'raster-opacity': 0.8 } },
          map.getLayer(dessous) ? dessous : map.getLayer(`${activite.id}-trace-contour`) ? `${activite.id}-trace-contour` : undefined
        );
      }
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', voulu.includes(carte) ? 'visible' : 'none');
    });
  }

  function rendreFiltres() {
    boutonsFiltre.forEach((bouton) => bouton.setAttribute('aria-checked', String(bouton.dataset.filtre === filtre.id)));
    if (!entonnoir) return;
    const filtrant = filtre.id !== activite.filtres[0].id;
    entonnoir.classList.toggle('actif', filtrant);
    entonnoir.setAttribute('aria-label', filtrant ? t('parcours.filtres-actif', { nom: t(filtre.cle) }) : t('parcours.filtres'));
    filtreActif.hidden = !filtrant;
    filtreActif.setAttribute('aria-label', t('parcours.retirer-filtre', { nom: t(filtre.cle) }));
    poser(filtreActif.querySelector('span'), filtre.cle);
  }

  function choisirFiltre(id) {
    if (id === filtre.id) return;
    const anciennesCartes = filtre.cartes.join();
    filtre = activite.filtres.find((autre) => autre.id === id);
    ecrire(`${activite.id}-filtre`, id);
    rendreFiltres();
    appliquerCalque();
    if (!derniereDemande) return;
    // Mêmes cartes interrogées : le filtre se joue sans réseau
    if (filtre.cartes.join() === anciennesCartes) rendreResultats();
    else derniereDemande();
  }

  // ---------- Mes parcours ----------
  function ligneParcours(parcours) {
    const ligne = document.createElement('div');
    ligne.className = 'parcours-parcours';
    const ouvrir = document.createElement('button');
    ouvrir.type = 'button';
    ouvrir.className = 'parcours-parcours-texte';
    const nom = document.createElement('strong');
    nom.textContent = parcours.nom;
    const detail = document.createElement('small');
    const distance = formatDistance(parcours.total);
    const denivele = Number.isFinite(parcours.plus) ? ` · D+ ${formatDenivele(parcours.plus)}` : '';
    const pratique = Object.keys(activite.pratiques).length > 1 ? activite.pratiques[parcours.pratique] : null;
    const libelle = pratique ? t(pratique.cle) : '';
    detail.textContent = `${libelle ? `${libelle} · ` : ''}${distance}${denivele} · ${formatDate(parcours.date, { day: 'numeric', month: 'short' })}`;
    ouvrir.append(nom, detail);
    ouvrir.addEventListener('click', () => {
      fermerMenu();
      itineraires.fermer();
      decouverte.masquer();
      editeur.ouvrirEnregistre(parcours);
    });
    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'zh-zone-bouton';
    renommer.setAttribute('aria-label', t('parcours.renommer', { nom: parcours.nom }));
    renommer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>';
    renommer.addEventListener('click', () => {
      const champ = document.createElement('input');
      champ.type = 'text';
      champ.maxLength = 60;
      champ.value = parcours.nom;
      champ.className = 'parcours-parcours-champ';
      champ.setAttribute('aria-label', t('parcours.nouveau-nom'));
      const valider = () => {
        const valeur = champ.value.trim();
        if (valeur && valeur !== parcours.nom) stockage.renommer(parcours.id, valeur);
        window.dispatchEvent(new CustomEvent('montis:parcours-modifies'));
      };
      champ.addEventListener('blur', valider);
      champ.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') champ.blur();
      });
      ouvrir.replaceWith(champ);
      champ.focus();
      champ.select();
    });
    const supprimer = document.createElement('button');
    supprimer.type = 'button';
    supprimer.className = 'zh-zone-bouton zh-zone-supprimer';
    supprimer.setAttribute('aria-label', t('parcours.supprimer', { nom: parcours.nom }));
    supprimer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
    supprimer.addEventListener('click', () => {
      if (!confirm(t('parcours.supprimer-confirmer', { nom: parcours.nom }))) return;
      stockage.supprimer(parcours.id);
      window.dispatchEvent(new CustomEvent('montis:parcours-modifies'));
    });
    ligne.append(ouvrir, renommer, supprimer);
    return ligne;
  }

  function rendreMesParcours() {
    const parcours = stockage.lister();
    blocMes.hidden = !parcours.length;
    listeMes.replaceChildren(...parcours.map(ligneParcours));
  }

  async function importerGpx() {
    const [fichier] = champFichier.files;
    champFichier.value = '';
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX_GPX) {
      afficherMessage(t('parcours.gpx-lourd'));
      return;
    }
    afficherMessage(t('parcours.gpx-lecture'));
    try {
      const { nom, trace } = lireGpx(await fichier.text(), fichier.name);
      afficherMessage('');
      fermerMenu();
      itineraires.fermer();
      decouverte.masquer();
      editeur.ouvrirTrace({ nom, chaine: trace.chaine, lignes: trace.lignes, meta: t('parcours.trace-importee') });
    } catch (erreur) {
      console.warn('Import GPX :', erreur);
      afficherMessage(erreur instanceof Error ? erreur.message : t('parcours.gpx-illisible'));
    }
  }

  // ---------- Événements ----------
  function ouvrirMenuFiltres(ouvert) {
    if (!menuFiltres) return;
    menuFiltres.hidden = !ouvert;
    entonnoir.setAttribute('aria-expanded', String(ouvert));
  }
  boutonsFiltre.forEach((bouton) => bouton.addEventListener('click', () => {
    choisirFiltre(bouton.dataset.filtre);
    ouvrirMenuFiltres(false);
  }));
  entonnoir?.addEventListener('click', () => ouvrirMenuFiltres(menuFiltres.hidden));
  filtreActif?.addEventListener('click', () => choisirFiltre(activite.filtres[0].id));
  if (menuFiltres) {
    document.addEventListener('pointerdown', (event) => {
      if (!menuFiltres.hidden && !event.target.closest('.pc-filtres, .pc-entonnoir')) ouvrirMenuFiltres(false);
    });
    panneau.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') ouvrirMenuFiltres(false);
    });
  }
  $('.parcours-creer').addEventListener('click', () => {
    annoncerOutilActivite();
    fermerMenu();
    itineraires.fermer();
    decouverte.masquer();
    editeur.ouvrirCreation();
  });
  $('.parcours-zone').addEventListener('click', chercherDansLaZone);
  champRecherche.addEventListener('input', () => {
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(chercherTexte, 350);
  });
  champFichier.addEventListener('change', () => void importerGpx());

  // ---------- Ce que l'activité ajoute ----------
  const outils = { fermerMenu, ouvrirMenu, itineraires, editeur, clients, appliquerCalque, panneau };
  (activite.entrees?.(map, outils) ?? []).forEach(({ libelle, sous, ouvrir }) => {
    const ligne = document.createElement('button');
    ligne.type = 'button';
    ligne.className = 'pc-entree';
    ligne.innerHTML = `<span><strong></strong><small></small></span>${icone(ICONES.chevron)}`;
    poser(ligne.querySelector('strong'), libelle);
    poser(ligne.querySelector('small'), sous);
    ligne.addEventListener('click', ouvrir);
    $('.pc-entrees').append(ligne);
  });
  (activite.sections?.(map, outils) ?? []).forEach((section) => $('.pc-sections').append(section));
  const options = activite.options?.(map, outils);
  if (options) $('.pc-options').append(options);
  const crochets = activite.crochets?.(map, outils) ?? {};

  rendreFiltres();
  rendreMesParcours();

  surPreferences(() => {
    rendreFiltres();
    rendreMesParcours();
    if (brutes.length) liste.replaceChildren(...regrouper(brutes.filter((route) => !filtre.garde || filtre.garde(route))).map(ligneResultat));
  });

  // « Y aller » depuis la fiche d'un point : un parcours du point jusqu'au refuge ou à l'eau
  const cleItineraire = `itineraire-${activite.id}`;
  function reprendreItineraire() {
    const demande = actif && reprendre(cleItineraire);
    if (!demande) return;
    annoncerOutilActivite();
    fermerMenu();
    itineraires.fermer();
    decouverte.masquer();
    const { retour, ...trajet } = demande;
    editeur.ouvrirVers({
      ...trajet,
      // Le brouillon reste : « Créer un parcours » le reprend
      onRetour: retour ? () => {
        editeur.fermer();
        retour();
      } : null,
    });
  }
  window.addEventListener('montis:demande', (event) => {
    if (event.detail === cleItineraire) reprendreItineraire();
    if (event.detail === cleParcours) reprendreParcours();
  });

  // Un parcours touché dans Mes traces › Parcours s'ouvre ici, comme depuis Mes parcours
  const cleParcours = `ouvrir-parcours-${activite.id}`;
  function reprendreParcours() {
    const id = actif && reprendre(cleParcours);
    if (!id) return;
    const parcours = stockage.lister().find((autre) => autre.id === id);
    if (!parcours) return;
    fermerMenu();
    itineraires.fermer();
    decouverte.masquer();
    editeur.ouvrirEnregistre(parcours);
  }
  // Parcours reçu par lien (partage.js) : ouvert sans être enregistré, « Enregistrer » le garde
  const clePartage = `parcours-partage-${activite.id}`;
  function reprendrePartage() {
    const parcours = actif && reprendre(clePartage);
    if (!parcours) return;
    fermerMenu();
    itineraires.fermer();
    decouverte.masquer();
    editeur.ouvrirEnregistre({ ...parcours, id: null }, { recu: true });
  }
  window.addEventListener('montis:demande', (event) => {
    if (event.detail === clePartage) reprendrePartage();
  });
  // Renommé ou supprimé depuis Mes traces
  window.addEventListener('montis:parcours-modifies', rendreMesParcours);

  return {
    id: activite.id,
    labelCle: activite.labelCle,
    icone: activite.iconeMenu,
    panneau,
    activer() {
      actif = true;
      appliquerCalque();
      decouverte.activer();
      crochets.activer?.();
      reprendreItineraire();
      reprendreParcours();
      reprendrePartage();
    },
    desactiver() {
      actif = false;
      appliquerCalque();
      controleurListe?.abort();
      crochets.desactiver?.();
      decouverte.desactiver();
      fermerTout();
    },
  };
}
