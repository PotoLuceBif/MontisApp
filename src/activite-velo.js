// Activité vélo : choix de la pratique et accès aux parcours. L'édition se fait sur la carte.
import { lire, ecrire } from './reglages.js';
import { clientItineraires, extraireTrace, niveau } from './rando-api.js';
import { titreDe } from './activite-randonnee.js';
import { PRATIQUES } from './velo-routage.js';
import { creerEditeurVelo } from './velo-editeur.js';

const ZOOM_MIN_ZONE = 7;
const CLIENTS = { mtb: clientItineraires('mtb'), cycling: clientItineraires('cycling') };
const LIBELLES_CARTE = { mtb: 'VTT', cycling: 'Vélo' };

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
    </div>
    <input type="text" class="rando-champ velo-recherche" placeholder="Rechercher un itinéraire balisé…" autocomplete="off" spellcheck="false" inputmode="search" aria-label="Rechercher un itinéraire balisé">
    <p class="note velo-message" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste velo-liste" hidden></div>
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
  let controleurListe = null;
  let minuteurRecherche = null;
  let derniereDemande = null;

  const editeur = creerEditeurVelo(map, {
    pratique,
    onPratique: choisirPratique,
    onFermer: () => editeur.fermer(),
  });

  function afficherMessage(texte) {
    messageListe.textContent = texte;
    messageListe.hidden = !texte;
  }

  async function ouvrirItineraire(route) {
    afficherMessage('Chargement de l’itinéraire…');
    try {
      const details = await CLIENTS[route.carte].details(route.id);
      const { chaine } = extraireTrace(details);
      if (chaine.length < 2) throw new Error('tracé vide');
      afficherMessage('');
      fermerMenu();
      editeur.ouvrirTrace({
        nom: titreDe(route),
        chaine,
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
    liste.replaceChildren(...routes.map((route) => {
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
    }));
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

  function rendrePratique() {
    boutonsPratique.forEach((bouton) => bouton.setAttribute('aria-pressed', String(bouton.dataset.pratique === pratique.id)));
  }

  function choisirPratique(id) {
    if (id === pratique.id) return;
    pratique = PRATIQUES[id];
    ecrire('velo-pratique', id);
    rendrePratique();
    editeur.definirPratique(id);
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
  rendrePratique();

  return {
    id: 'velo',
    label: 'Vélo',
    icone: 'velo',
    panneau,
    activer() {},
    desactiver() {
      controleurListe?.abort();
      editeur.fermer();
    },
  };
}
