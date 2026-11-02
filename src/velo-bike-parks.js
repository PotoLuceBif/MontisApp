// Les bike parks : même recherche et même fiche que les stations de ski, avec la visite 3D sur demande.
// La liste vient de scripts/extraire-bike-parks.mjs : des secteurs de pistes balisées dans
// OpenStreetMap, pas un annuaire officiel. Ni l'ouverture ni les horaires n'y figurent.
import { creerVisiteStation } from './visite-station.js';
import { creerFavoris, creerFicheLieu, creerItemLieu, creerNiveaux, creerPosition, el, km, stat } from './fiche-lieu.js';
import { creerRechercheLieux, creerReperesZone, lieuxDansLaVue, normaliser, scoreRecherche } from './zone-lieux.js';

const URL_LISTE = '/data/bike-parks.json';
const RESULTATS_MAX = 12;
const ICONE_RECHERCHE = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>';
const ICONE_ZONE = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2.600"/></svg>';
const LIBELLE_ZONE = 'Bike parks dans la zone visible';
// Le repère actuel des itinéraires, en attendant des repères par activité
const DESSIN_REPERE = '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="rando-repere-trace" d="m15 31 5-11 5 11 5-11 4 9"/></svg>';

const pistesDe = (nombre) => `${nombre} piste${nombre > 1 ? 's' : ''}`;
const surTelephone = () => window.matchMedia('(max-width: 640px)').matches;

export function creerBikeParks(map, { fermerMenu = () => {} }) {
  const visite = creerVisiteStation(map, {
    ete: true,
    dossier: '/data/bike-parks',
    attribution: 'Pistes VTT et remontées : © contributeurs OpenStreetMap (ODbL), OpenSkiData',
  });
  let actif = false;
  let chargement = null;
  let index = [];
  let dansZone = [];
  let limitesZone = null;
  let zoneCherchee = false;
  let zonePerimee = false;
  let masque = () => false;
  const favoris = creerFavoris('bikepark-favoris');

  const section = el('section', 'pc-section');
  section.setAttribute('aria-label', 'Bike parks');
  section.innerHTML = `
    <h3>Bike parks</h3>
    <label class="ski-champ">
      ${ICONE_RECHERCHE}
      <input type="text" class="rando-champ parcours-park-recherche" placeholder="Chercher un bike park…"
        autocomplete="off" spellcheck="false" inputmode="search" aria-label="Chercher un bike park"
        role="combobox" aria-autocomplete="list" aria-controls="bikepark-resultats" aria-expanded="false">
    </label>
    <div class="rando-liste" id="bikepark-resultats" role="listbox" aria-label="Bike parks trouvés" hidden></div>
    <section class="ski-favoris parcours-park-favoris" aria-label="Mes bike parks favoris" hidden>
      <h3 class="ski-favoris-titre">Mes favoris</h3>
      <div class="rando-liste ski-favoris-liste" role="listbox" aria-label="Mes bike parks favoris"></div>
    </section>
    <div class="rando-actions-principales">
      <button type="button" class="rando-action-principale parcours-park-zone">${ICONE_ZONE}<span>${LIBELLE_ZONE}</span></button>
    </div>
    <p class="note parcours-park-message" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste parcours-park-liste" role="listbox" aria-label="Bike parks de la zone" hidden></div>
  `;
  const champ = section.querySelector('.parcours-park-recherche');
  const boutonZone = section.querySelector('.parcours-park-zone');
  const message = section.querySelector('.parcours-park-message');
  const listeZone = section.querySelector('.parcours-park-liste');
  const sectionFavoris = section.querySelector('.parcours-park-favoris');
  const listeFavoris = sectionFavoris.querySelector('.ski-favoris-liste');

  function afficherMessage(texte) {
    message.textContent = texte;
    message.hidden = !texte;
  }

  // ---------- Données ----------
  function chargerListe() {
    if (!chargement) {
      chargement = fetch(new URL(URL_LISTE, window.location.origin).href)
        .then((reponse) => {
          if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
          return reponse.json();
        })
        .then((parks) => {
          index = parks.map((park) => ({
            feature: { type: 'Feature', geometry: { type: 'Point', coordinates: [park.lng, park.lat] }, properties: park },
            nom: normaliser(park.nom),
            lieu: normaliser(park.lieu),
          }));
        })
        .catch((erreur) => {
          chargement = null; // la prochaine recherche retentera le téléchargement
          throw erreur;
        });
    }
    return chargement;
  }

  function chercherLocal(texte) {
    const requete = normaliser(texte);
    if (!requete) return [];
    return index
      .map((entree) => ({ entree, score: scoreRecherche(entree, requete) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => a.score - b.score || b.entree.feature.properties.km - a.entree.feature.properties.km)
      .slice(0, RESULTATS_MAX)
      .map(({ entree }) => entree.feature);
  }

  function creerItem(feature, identifiant) {
    const park = feature.properties;
    return creerItemLieu({
      feature,
      identifiant,
      sous: [pistesDe(park.pistes), km(park.km), park.lieu].filter(Boolean).join(' · '),
      peutVisiter: true,
      localiser: (lieu) => fiche.localiser(lieu),
      visiter: (lieu) => fiche.visiter(lieu),
    });
  }

  const recherche = (options) => creerRechercheLieux({
    ...options,
    charger: chargerListe,
    chercherLocal,
    creerItem,
    textes: { attente: 'Recherche des bike parks…', vide: (texte) => `Aucun bike park pour « ${texte} »` },
    peutVisiter: () => true,
    visiter: (lieu) => fiche.visiter(lieu),
    localiser: (lieu) => fiche.localiser(lieu),
  });

  // ---------- Fiche ----------
  const fiche = creerFicheLieu(map, {
    id: 'bikepark-fiche',
    visite,
    textes: {
      visiter: 'Visiter le bike park',
      fermer: 'Fermer la fiche du bike park',
      chercher: 'Chercher un autre bike park…',
      detail: 'Afficher le détail du bike park',
    },
    decrire: ({ properties: park }) => ({ badge: { court: 'Bike park', couleur: '#d9702b' }, situation: park.lieu }),
    peutVisiter: () => true,
    favoris,
    creerRecherche: recherche,
    surChangement: () => actualiserReperes(),
    surFavori: () => rendreFavoris(),
    rendreCorps(carte, feature) {
      const park = feature.properties;
      const contenu = el('div', 'ski-fiche-contenu');
      const stats = el('div', 'rando-stats');
      stats.append(stat(km(park.km), 'Pistes VTT'), stat(String(park.pistes), 'Pistes nommées'), stat(String(park.remontees), 'Remontées'));
      contenu.append(stats, creerNiveaux(park.niveaux), creerPosition(map, feature.geometry.coordinates));
      contenu.append(el('p', 'ski-conditions-note', 'Secteur repéré dans OpenStreetMap, sans liste officielle : certaines pistes peuvent manquer ou être fermées, et rien n’indique quelles remontées tournent l’été. Vérifiez auprès de la station.'));
      carte.append(contenu);
      return contenu;
    },
  });

  const reperes = creerReperesZone(map, {
    dessin: DESSIN_REPERE,
    titreGroupe: (nombre) => `${nombre} bike parks à proximité`,
    libelleGroupe: (nombre) => `${nombre} bike parks regroupés.`,
    resume: ({ properties: park }) => [['Pistes', String(park.pistes)], ['Longueur', km(park.km)], ['Remontées', String(park.remontees)]],
    surChoix: (feature, deplacer) => fiche.ouvrir(feature, deplacer),
  });

  // ---------- Recherche ----------
  function actualiserReperes() {
    if (!actif || fiche.enVisite || masque()) reperes.retirer();
    else reperes.actualiser(dansZone, fiche.choisi);
  }

  function rendreFavoris() {
    const parks = favoris.ids()
      .map((id) => index.find((entree) => entree.feature.properties.id === id)?.feature)
      .filter(Boolean);
    listeFavoris.replaceChildren(...parks.map((feature, i) => creerItem(feature, `bikepark-favori-${i}`)));
    sectionFavoris.hidden = !parks.length || champ.value.trim().length >= 2;
  }

  function rendreZone() {
    const nombre = dansZone.length;
    if (!nombre) {
      afficherMessage('Aucun bike park dans la zone visible. Dézoomez ou cherchez par nom.');
    } else {
      const total = `${nombre} bike park${nombre > 1 ? 's' : ''} trouvé${nombre > 1 ? 's' : ''}`;
      afficherMessage(zonePerimee
        ? `${total} dans la zone précédente. Relancez la recherche après avoir déplacé la carte.`
        : `${total} dans cette zone.`);
    }
    listeZone.hidden = !nombre;
    listeZone.replaceChildren(...dansZone.map((feature, i) => creerItem(feature, `bikepark-zone-${i}`)));
  }

  async function chercherZone() {
    if (fiche.enVisite) fiche.quitterVisite();
    recherchePanneau.effacer();
    rendreFavoris();
    boutonZone.disabled = true;
    afficherMessage('Recherche des bike parks dans la zone…');
    try {
      await chargerListe();
    } catch (erreur) {
      console.warn('Liste des bike parks :', erreur);
      afficherMessage('Liste indisponible. Vérifiez votre connexion et réessayez.');
      return;
    } finally {
      boutonZone.disabled = false;
    }
    if (!actif) return;
    dansZone = lieuxDansLaVue(map, index.map(({ feature }) => feature));
    limitesZone = map.getBounds();
    zoneCherchee = true;
    zonePerimee = false;
    rendreZone();
    actualiserReperes();
    if (dansZone.length && surTelephone()) fermerMenu();
  }

  function surDeplacement() {
    if (!actif) return;
    actualiserReperes();
    if (!zoneCherchee || !dansZone.length) return;
    // Zoomer dans la zone déjà cherchée ne rend pas les résultats caducs
    const limites = map.getBounds();
    zonePerimee = !(limitesZone.contains(limites.getNorthEast()) && limitesZone.contains(limites.getSouthWest()));
    rendreZone();
  }

  const recherchePanneau = recherche({ champ, liste: section.querySelector('#bikepark-resultats'), prefixe: 'bikepark-suggestion' });
  champ.addEventListener('input', rendreFavoris);
  boutonZone.addEventListener('click', () => void chercherZone());
  // Un autre panneau (Créer un parcours, itinéraire) prend la carte : la fiche lui laisse la place
  window.addEventListener('panneau-carte', () => {
    if (!actif) return;
    if (fiche.choisi && document.querySelector('.bf:not([hidden])')) fiche.fermer();
    actualiserReperes();
  });

  return {
    section,
    definirMasque(fonction) {
      masque = fonction;
    },
    activer() {
      actif = true;
      fiche.activer();
      map.on('moveend', surDeplacement);
      chargerListe()
        .then(rendreFavoris)
        .catch((erreur) => console.warn('Liste des bike parks :', erreur));
    },
    desactiver() {
      actif = false;
      map.off('moveend', surDeplacement);
      fiche.desactiver();
      dansZone = [];
      limitesZone = null;
      zoneCherchee = false;
      zonePerimee = false;
      recherchePanneau.effacer();
      afficherMessage('');
      listeZone.hidden = true;
      listeZone.replaceChildren();
      reperes.retirer();
    },
  };
}
