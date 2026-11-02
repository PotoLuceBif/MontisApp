// Activité vélo : choix de la pratique et accès aux parcours. L'édition se fait sur la carte.
import { lire, ecrire } from './reglages.js';
import { clientItineraires, extraireTrace, niveau } from './rando-api.js';
import { lireGpx, titreDe } from './activite-randonnee.js';
import { listerParcours, renommerParcours, supprimerParcours } from './velo-parcours.js';
import { dateLisible } from './hors-ligne.js';
import { PRATIQUES } from './velo-routage.js';
import { creerEditeurVelo } from './velo-editeur.js';
import { creerBikeParks } from './velo-bike-parks.js';

const ZOOM_MIN_ZONE = 7;
const CLIENTS = { mtb: clientItineraires('mtb'), cycling: clientItineraires('cycling') };
const LIBELLES_CARTE = { mtb: 'VTT', cycling: 'Vélo' };
const TAILLE_MAX_GPX = 10 * 1024 * 1024;
// Noms et numéros de fr.eurovelo.com. Les tracés viennent d'OpenStreetMap, pas du site
const EUROVELO = [
  [1, 'Atlantic Coast Route'],
  [2, 'Véloroute des Capitales'],
  [3, 'Véloroute des Pèlerins'],
  [4, 'Véloroute de l’Europe Centrale'],
  [5, 'Via Romea (Francigena)'],
  [6, 'Atlantique - Mer Noire'],
  [7, 'Véloroute du Soleil'],
  [8, 'Véloroute de la Méditerranée'],
  [9, 'Baltique - Adriatique'],
  [10, 'Véloroute de la Baltique'],
  [11, 'Véloroute de l’Europe de l’Est'],
  [12, 'Véloroute de la Mer du Nord'],
  [13, 'Véloroute du Rideau de Fer'],
  [14, 'Lacs et Rivières d’Europe Centrale'],
  [15, 'Véloroute Rhin'],
  [17, 'Véloroute du Rhône'],
  [19, 'La Meuse à Vélo'],
];
const TRONCONS_MAX = 50;

export function creerActiviteVelo(map, { fermerMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'velo';
  panneau.innerHTML = `
    <div class="velo-pratiques" role="group" aria-label="Pratique">
      ${Object.values(PRATIQUES).map(({ id, libelle }) => `<button type="button" data-pratique="${id}" aria-pressed="false">${libelle}</button>`).join('')}
    </div>
    <div class="rando-actions-principales" role="group" aria-label="Actions vélo">
      <button type="button" class="rando-action-principale velo-creer">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6.500 8.500 4l7 2.500L21 4v13.500L15.500 20l-7-2.500L3 20V6.500Z"/><path d="M8.500 4v13.500M15.500 6.500V20"/></svg>
        <span>Créer un parcours</span>
      </button>
      <button type="button" class="rando-action-principale velo-zone">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.500 4.500"/></svg>
        <span>Balisés ici</span>
      </button>
      <label class="rando-importer rando-action-principale">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15V3m0 0L7.500 7.500M12 3l4.500 4.500"/><path d="M5 13v6h14v-6"/></svg>
        <span>Importer un GPX</span>
        <input type="file" class="rando-fichier velo-fichier" accept=".gpx,application/gpx+xml,application/xml,text/xml">
      </label>
    </div>
    <input type="text" class="rando-champ velo-recherche" placeholder="Rechercher un itinéraire balisé…" autocomplete="off" spellcheck="false" inputmode="search" aria-label="Rechercher un itinéraire balisé">
    <p class="note velo-message" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste velo-liste" hidden></div>
    <section class="velo-mes" hidden>
      <h3>Mes parcours</h3>
      <div class="velo-mes-liste"></div>
    </section>
    <details class="rando-outils velo-repli velo-repli-parks">
      <summary>Visiter un bike park</summary>
      <div class="rando-outils-contenu velo-parks"></div>
    </details>
    <details class="rando-outils velo-repli">
      <summary>EuroVelo</summary>
      <div class="rando-outils-contenu velo-eurovelo">
        <div class="velo-ev-liste">
          ${EUROVELO.map(([numero, nom]) => `<button type="button" class="velo-ev" data-ev="${numero}" aria-pressed="false"><b>EV${numero}</b><span>${nom}</span></button>`).join('')}
        </div>
        <p class="note velo-ev-message" role="status" aria-live="polite" hidden></p>
        <div class="rando-liste velo-ev-troncons" hidden></div>
        <p class="note">EuroVelo® est une marque de l’ECF. Tracés issus d’OpenStreetMap, parfois différents du tracé officiel : consultez <a class="para-lien" href="https://fr.eurovelo.com/" target="_blank" rel="noopener noreferrer">fr.eurovelo.com ↗</a></p>
      </div>
    </details>
    <label class="option-case"><input type="checkbox" class="velo-calque"> Itinéraires balisés sur la carte
      <small>Superpose le réseau de la pratique choisie (Waymarked Trails)</small></label>
    <details class="rando-outils">
      <summary>À propos</summary>
      <div class="rando-outils-contenu">
        <p class="note">Tracés calculés par BRouter ou Valhalla, à partir des chemins OpenStreetMap. Un tracé calculé n’est pas une garantie de praticabilité : vérifiez le terrain et les accès avant de partir.</p>
      </div>
    </details>
  `;
  const idLu = lire('velo-pratique', 'vtt');
  let pratique = PRATIQUES[idLu] ?? PRATIQUES.vtt;
  const boutonsPratique = [...panneau.querySelectorAll('[data-pratique]')];
  const messageListe = panneau.querySelector('.velo-message');
  const liste = panneau.querySelector('.velo-liste');
  const champRecherche = panneau.querySelector('.velo-recherche');
  const blocMes = panneau.querySelector('.velo-mes');
  const listeMes = panneau.querySelector('.velo-mes-liste');
  const champFichier = panneau.querySelector('.velo-fichier');
  const caseCalque = panneau.querySelector('.velo-calque');
  const boutonsEv = [...panneau.querySelectorAll('[data-ev]')];
  const messageEv = panneau.querySelector('.velo-ev-message');
  const listeEv = panneau.querySelector('.velo-ev-troncons');
  let controleurEv = null;
  let actif = false;
  caseCalque.checked = lire('velo-calque', true) !== false;
  let controleurListe = null;
  let minuteurRecherche = null;
  let derniereDemande = null;

  const editeur = creerEditeurVelo(map, {
    pratique,
    onPratique: choisirPratique,
    onFermer: () => editeur.fermer(),
    onEnregistre: () => rendreMesParcours(),
  });

  const bikeParks = creerBikeParks(map, { conteneur: panneau.querySelector('.velo-parks'), fermerMenu });
  panneau.querySelector('.velo-repli-parks').addEventListener('toggle', (event) => {
    if (event.target.open) void bikeParks.charger();
  });

  function afficherMessage(texte) {
    messageListe.textContent = texte;
    messageListe.hidden = !texte;
  }

  async function ouvrirItineraire(route) {
    afficherMessage('Chargement de l’itinéraire…');
    try {
      const details = await CLIENTS[route.carte].details(route.id);
      const { chaine, lignes } = extraireTrace(details);
      if (chaine.length < 2) throw new Error('tracé vide');
      afficherMessage('');
      fermerMenu();
      editeur.ouvrirTrace({
        nom: titreDe(route),
        chaine,
        lignes,
        lien: `https://${route.carte}.waymarkedtrails.org/#route?id=${route.id}`,
      });
    } catch (erreur) {
      console.warn('Itinéraire vélo :', erreur);
      afficherMessage('Impossible de charger cet itinéraire pour le moment.');
    }
  }

  function afficherResultats(routes, vide) {
    liste.hidden = !routes.length;
    afficherMessage(routes.length ? '' : vide);
    liste.replaceChildren(...routes.map(ligneItineraire));
  }

  function ligneItineraire(route) {
    const { court, couleur } = niveau(route.group);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'rando-item velo-item';
    const badge = document.createElement('span');
    badge.className = 'rando-badge';
    badge.textContent = court;
    badge.style.background = couleur;
    const textes = document.createElement('span');
    textes.className = 'rando-item-textes';
    const nomRoute = document.createElement('span');
    nomRoute.className = 'rando-item-nom';
    nomRoute.textContent = titreDe(route);
    const sous = document.createElement('span');
    sous.className = 'rando-item-sous';
    sous.textContent = [LIBELLES_CARTE[route.carte], route.itinerary?.join(' → ')].filter(Boolean).join(' · ');
    textes.append(nomRoute, sous);
    item.append(badge, textes);
    item.addEventListener('click', () => void ouvrirItineraire(route));
    return item;
  }

  // Une EuroVelo existe en dizaines de relations dans OSM : celles de la zone, puis de France, d'abord
  async function afficherEuroVelo(numero) {
    boutonsEv.forEach((bouton) => bouton.setAttribute('aria-pressed', String(Number(bouton.dataset.ev) === numero)));
    controleurEv?.abort();
    const requete = new AbortController();
    controleurEv = requete;
    listeEv.hidden = true;
    messageEv.hidden = false;
    messageEv.textContent = 'Recherche des tronçons…';
    const client = CLIENTS.cycling;
    const estCette = ({ group, ref, name }) => group === 'INT'
      && (new RegExp(`^EV\\s*${numero}$`, 'i').test(ref ?? '') || new RegExp(`Euro ?V[eé]lo ${numero}\\b`, 'i').test(name ?? ''));
    const reponses = await Promise.allSettled([
      client.chercher(`EuroVelo ${numero}`, requete.signal, TRONCONS_MAX),
      client.chercher(`EV${numero}`, requete.signal, TRONCONS_MAX),
      map.getZoom() >= ZOOM_MIN_ZONE ? client.dansLaZone(map.getBounds(), requete.signal) : Promise.resolve([]),
    ]);
    if (requete.signal.aborted) return;
    if (reponses.every(({ status }) => status === 'rejected')) {
      messageEv.textContent = 'Tronçons indisponibles pour le moment. Réessayez plus tard.';
      return;
    }
    const [parNom, parRef, dansZone] = reponses.map((reponse) => (reponse.status === 'fulfilled' ? reponse.value : []));
    const proches = new Set(dansZone.filter(estCette).map(({ id }) => id));
    const rang = (route) => {
      if (proches.has(route.id)) return 0;
      return /france|fran[cç]ais|\bFR\b/i.test(route.name ?? '') ? 1 : 2;
    };
    const routes = [...new Map([...dansZone, ...parNom, ...parRef].filter(estCette).map((route) => [route.id, route])).values()]
      .sort((a, b) => rang(a) - rang(b) || String(a.name).localeCompare(String(b.name), 'fr'))
      .slice(0, TRONCONS_MAX)
      .map((route) => ({ ...route, carte: 'cycling' }));
    messageEv.textContent = routes.length
      ? (proches.size ? `${proches.size} tronçon${proches.size > 1 ? 's' : ''} dans la zone visible, en tête de liste.` : 'Aucun tronçon dans la zone visible.')
      : 'Aucun tronçon trouvé dans OpenStreetMap pour cet itinéraire.';
    listeEv.hidden = !routes.length;
    listeEv.replaceChildren(...routes.map(ligneItineraire));
  }

  // Chaque pratique interroge ses cartes : une carte en panne n'empêche pas les autres de répondre
  async function chargerListe(appel, attente, vide) {
    controleurListe?.abort();
    const requete = new AbortController();
    controleurListe = requete;
    afficherMessage(attente);
    const resultats = await Promise.allSettled(pratique.itineraires.map(async (carte) => {
      const routes = await appel(CLIENTS[carte], requete.signal);
      return routes.map((route) => ({ ...route, carte }));
    }));
    if (requete.signal.aborted) return;
    const routes = resultats.flatMap((resultat) => (resultat.status === 'fulfilled' ? resultat.value : []));
    if (!routes.length && resultats.every(({ status }) => status === 'rejected')) {
      afficherResultats([], 'Itinéraires indisponibles pour le moment. Réessayez plus tard.');
      return;
    }
    afficherResultats(routes, vide);
  }

  function chercherDansLaZone() {
    if (map.getZoom() < ZOOM_MIN_ZONE) {
      afficherResultats([], 'Zoomez davantage pour chercher dans cette zone.');
      return;
    }
    const limites = map.getBounds();
    derniereDemande = chercherDansLaZone;
    void chargerListe((client, signal) => client.dansLaZone(limites, signal), 'Recherche dans la zone visible…', 'Aucun itinéraire balisé dans cette zone pour cette pratique.');
  }

  function chercherTexte() {
    const texte = champRecherche.value.trim();
    if (texte.length < 2) return;
    derniereDemande = chercherTexte;
    void chargerListe((client, signal) => client.chercher(texte, signal), 'Recherche…', 'Aucun itinéraire trouvé pour cette pratique.');
  }

  function ligneParcours(parcours) {
    const ligne = document.createElement('div');
    ligne.className = 'velo-parcours';
    const ouvrir = document.createElement('button');
    ouvrir.type = 'button';
    ouvrir.className = 'velo-parcours-texte';
    const nom = document.createElement('strong');
    nom.textContent = parcours.nom;
    const detail = document.createElement('small');
    const distance = `${(parcours.total / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
    const denivele = Number.isFinite(parcours.plus) ? ` · D+ ${Math.round(parcours.plus).toLocaleString('fr-FR')} m` : '';
    detail.textContent = `${PRATIQUES[parcours.pratique]?.libelle ?? ''} · ${distance}${denivele} · ${dateLisible(parcours.date).split(' à ')[0]}`;
    ouvrir.append(nom, detail);
    ouvrir.addEventListener('click', () => {
      choisirPratique(parcours.pratique);
      fermerMenu();
      editeur.ouvrirEnregistre(parcours);
    });
    const renommer = document.createElement('button');
    renommer.type = 'button';
    renommer.className = 'zh-zone-bouton';
    renommer.setAttribute('aria-label', `Renommer ${parcours.nom}`);
    renommer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/></svg>';
    renommer.addEventListener('click', () => {
      const champ = document.createElement('input');
      champ.type = 'text';
      champ.maxLength = 60;
      champ.value = parcours.nom;
      champ.className = 'velo-parcours-champ';
      champ.setAttribute('aria-label', 'Nouveau nom');
      const valider = () => {
        const valeur = champ.value.trim();
        if (valeur && valeur !== parcours.nom) renommerParcours(parcours.id, valeur);
        rendreMesParcours();
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
    supprimer.setAttribute('aria-label', `Supprimer ${parcours.nom}`);
    supprimer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
    supprimer.addEventListener('click', () => {
      if (!confirm(`Supprimer « ${parcours.nom} » ?`)) return;
      supprimerParcours(parcours.id);
      rendreMesParcours();
    });
    ligne.append(ouvrir, renommer, supprimer);
    return ligne;
  }

  function rendreMesParcours() {
    const parcours = listerParcours();
    blocMes.hidden = !parcours.length;
    listeMes.replaceChildren(...parcours.map(ligneParcours));
  }

  async function importerGpx() {
    const [fichier] = champFichier.files;
    champFichier.value = '';
    if (!fichier) return;
    if (fichier.size > TAILLE_MAX_GPX) {
      afficherMessage('Ce fichier dépasse 10 Mo : importez une trace plus légère.');
      return;
    }
    afficherMessage('Lecture du fichier GPX…');
    try {
      const { nom, trace } = lireGpx(await fichier.text(), fichier.name);
      afficherMessage('');
      fermerMenu();
      editeur.ouvrirTrace({ nom, chaine: trace.chaine });
    } catch (erreur) {
      console.warn('Import GPX vélo :', erreur);
      afficherMessage(erreur instanceof Error ? erreur.message : 'Impossible de lire ce fichier GPX.');
    }
  }

  // Le réseau de la pratique, sous le tracé du parcours
  function appliquerCalque() {
    const voulu = actif && caseCalque.checked ? pratique.calque : null;
    ['mtb', 'cycling'].forEach((carte) => {
      const id = `velo-calque-${carte}`;
      if (carte === voulu && !map.getSource(id)) {
        map.addSource(id, {
          type: 'raster',
          tiles: [`https://tile.waymarkedtrails.org/${carte}/{z}/{x}/{y}.png`],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Itinéraires : © Waymarked Trails (CC BY-SA), © contributeurs OpenStreetMap',
        });
        map.addLayer(
          { id, type: 'raster', source: id, paint: { 'raster-opacity': 0.8 } },
          map.getLayer('velo-trace-contour') ? 'velo-trace-contour' : undefined
        );
      }
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', carte === voulu ? 'visible' : 'none');
    });
  }

  function rendrePratique() {
    boutonsPratique.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.pratique === pratique.id)));
  }

  function choisirPratique(id) {
    if (id === pratique.id) return;
    pratique = PRATIQUES[id];
    ecrire('velo-pratique', id);
    rendrePratique();
    editeur.definirPratique(id);
    appliquerCalque();
    derniereDemande?.();
  }

  boutonsPratique.forEach((bouton) => {
    bouton.addEventListener('click', () => choisirPratique(bouton.dataset.pratique));
  });
  panneau.querySelector('.velo-creer').addEventListener('click', () => {
    fermerMenu();
    editeur.ouvrirCreation();
  });
  panneau.querySelector('.velo-zone').addEventListener('click', chercherDansLaZone);
  champRecherche.addEventListener('input', () => {
    clearTimeout(minuteurRecherche);
    minuteurRecherche = setTimeout(chercherTexte, 350);
  });
  champFichier.addEventListener('change', () => void importerGpx());
  boutonsEv.forEach((bouton) => {
    bouton.addEventListener('click', () => void afficherEuroVelo(Number(bouton.dataset.ev)));
  });
  caseCalque.addEventListener('change', () => {
    ecrire('velo-calque', caseCalque.checked);
    appliquerCalque();
  });
  rendrePratique();
  rendreMesParcours();

  return {
    id: 'velo',
    label: 'Vélo',
    icone: 'velo',
    panneau,
    activer() {
      actif = true;
      appliquerCalque();
    },
    desactiver() {
      actif = false;
      appliquerCalque();
      controleurListe?.abort();
      controleurEv?.abort();
      bikeParks.quitter();
      editeur.fermer();
    },
  };
}
