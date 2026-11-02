// Les bike parks : même recherche que les stations de ski, une fiche, puis la visite 3D sur demande.
// La liste vient de scripts/extraire-bike-parks.mjs : des secteurs de pistes balisées dans
// OpenStreetMap, pas un annuaire officiel. Ni l'ouverture ni les horaires n'y figurent.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerVisiteStation } from './visite-station.js';
import { creerReperesZone, lieuxDansLaVue, normaliser, scoreRecherche } from './zone-lieux.js';

const URL_LISTE = '/data/bike-parks.json';
const RESULTATS_MAX = 12;
const ZOOM_FICHE = 12.5;
const NIVEAUX = [
  ['verte', 'Verte', '#1f9d55'],
  ['bleue', 'Bleue', '#1f6fd6'],
  ['rouge', 'Rouge', '#d92b2f'],
  ['noire', 'Noire', '#15181d'],
  ['inconnu', 'Non cotée', '#6f7884'],
];
const ICONE = '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.500"/><circle cx="18" cy="17" r="3.500"/><path d="M6 17 10 9h6l2 8M3 6l6 3M21 4l-5 5"/></svg>';
const ICONE_ZONE = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2.600"/></svg>';
const LIBELLE_ZONE = 'Bike parks dans la zone visible';
// Le repère actuel des itinéraires, en attendant des repères par activité
const DESSIN_REPERE = '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="rando-repere-trace" d="m15 31 5-11 5 11 5-11 4 9"/></svg>';

const km = (valeur) => `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: valeur < 10 ? 1 : 0 })} km`;
const pistesDe = (nombre) => `${nombre} piste${nombre > 1 ? 's' : ''}`;
const surTelephone = () => window.matchMedia('(max-width: 640px)').matches;

export function creerBikeParks(map, { fermerMenu = () => {}, ouvrirMenu = () => {} }) {
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
  let choisi = null;
  let etatVisite = 'repos'; // repos | chargement | erreur | active
  let jeton = 0;
  let masque = () => false;

  const reperes = creerReperesZone(map, {
    dessin: DESSIN_REPERE,
    titreGroupe: (nombre) => `${nombre} bike parks à proximité`,
    libelleGroupe: (nombre) => `${nombre} bike parks regroupés.`,
    resume: ({ properties: park }) => [['Pistes', String(park.pistes)], ['Longueur', km(park.km)], ['Remontées', String(park.remontees)]],
    surChoix: (feature, deplacer) => ouvrirFiche(feature, deplacer),
  });

  const panneau = creerPanneauCarte({
    cle: 'bikepark-panneau-reduit',
    libelle: 'bike park',
    classe: 'bf-outil bf-bikepark',
    onFermer: () => fermerFiche(),
    onRetour() {
      if (etatVisite === 'active') {
        quitterVisite();
        return;
      }
      fermerFiche();
      ouvrirMenu();
    },
  });
  panneau.corps.innerHTML = `
    <div class="parcours-stats parcours-stats-park">
      <div class="parcours-stat"><span>Pistes</span><strong data-bp="pistes"></strong></div>
      <div class="parcours-stat"><span>Longueur</span><strong data-bp="km"></strong></div>
      <div class="parcours-stat"><span>Remontées</span><strong data-bp="remontees"></strong></div>
    </div>
    <div class="parcours-repartition"><div class="parcours-barre" data-bp="barre"></div><div class="parcours-legende" data-bp="legende"></div></div>
    <button type="button" class="para-bouton para-bouton-principal parcours-park-visiter">Visiter le bike park</button>
    <p class="note parcours-park-erreur" role="status" hidden>Visite indisponible. Vérifiez votre connexion et réessayez.</p>
    <div data-bp="options"></div>
    <p class="parcours-etat" data-bp="aide">Touchez une piste pour lire son nom et sa longueur.</p>
    <details class="rando-outils">
      <summary>À savoir</summary>
      <div class="rando-outils-contenu">
        <p class="note">Secteur repéré dans OpenStreetMap, sans liste officielle : certaines pistes peuvent manquer ou être fermées. Les remontées sont celles de la station, sans indication d’ouverture l’été. Vérifiez auprès de la station avant de venir.</p>
      </div>
    </details>
  `;
  const champ = (id) => panneau.corps.querySelector(`[data-bp="${id}"]`);
  const boutonVisiter = panneau.corps.querySelector('.parcours-park-visiter');
  const erreurVisite = panneau.corps.querySelector('.parcours-park-erreur');
  champ('options').append(visite.creerOptions());

  const section = document.createElement('section');
  section.className = 'pc-section';
  section.setAttribute('aria-label', 'Bike parks');
  section.innerHTML = `
    <h3>Bike parks</h3>
    <input type="text" class="rando-champ parcours-park-recherche" placeholder="Chercher un bike park…" autocomplete="off" spellcheck="false" inputmode="search" aria-label="Chercher un bike park">
    <div class="rando-actions-principales">
      <button type="button" class="rando-action-principale parcours-park-zone">${ICONE_ZONE}<span>${LIBELLE_ZONE}</span></button>
    </div>
    <p class="note parcours-park-message" role="status" aria-live="polite" hidden></p>
    <div class="pc-liste parcours-park-liste"></div>
  `;
  const recherche = section.querySelector('.parcours-park-recherche');
  const boutonZone = section.querySelector('.parcours-park-zone');
  const message = section.querySelector('.parcours-park-message');
  const liste = section.querySelector('.parcours-park-liste');

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

  // ---------- Fiche, puis visite ----------
  function rendreFiche() {
    const park = choisi.properties;
    const enVisite = etatVisite === 'active';
    panneau.titre.textContent = park.nom;
    panneau.meta.textContent = park.lieu;
    champ('pistes').textContent = String(park.pistes);
    champ('km').textContent = km(park.km);
    champ('remontees').textContent = String(park.remontees);
    const presents = NIVEAUX.filter(([id]) => park.niveaux[id]);
    champ('barre').innerHTML = presents.map(([id, , couleur]) => `<i style="width: ${(park.niveaux[id] / park.km) * 100}%; background: ${couleur}"></i>`).join('');
    champ('legende').innerHTML = presents.map(([id, libelle, couleur]) => `<span><i style="background: ${couleur}"></i>${libelle} ${km(park.niveaux[id])}</span>`).join('');
    panneau.definirResume({ rose: ICONE, nom: park.nom, detail: `${pistesDe(park.pistes)} · ${km(park.km)}`, valeur: '', unite: '' });
    boutonVisiter.hidden = enVisite;
    boutonVisiter.disabled = etatVisite === 'chargement';
    boutonVisiter.textContent = etatVisite === 'chargement' ? 'Préparation de la visite…' : 'Visiter le bike park';
    erreurVisite.hidden = etatVisite !== 'erreur';
    champ('options').hidden = !enVisite;
    champ('aide').hidden = !enVisite;
  }

  function arreterVisite(restaurer) {
    jeton += 1;
    const enVisite = etatVisite === 'active';
    etatVisite = 'repos';
    if (enVisite) visite.quitter({ restaurer });
  }

  function quitterVisite() {
    arreterVisite(true);
    rendreFiche();
    actualiserReperes();
  }

  function fermerFiche() {
    arreterVisite(true);
    choisi = null;
    panneau.masquer();
    actualiserReperes();
  }

  // La fiche occupe une partie de la carte : le lieu reste dans ce qui est visible
  function decalageFiche() {
    const cadre = panneau.element.getBoundingClientRect();
    if (cadre.width >= window.innerWidth - 4) return [0, -Math.round(cadre.height / 2)];
    return [Math.round(cadre.right / 2), 0];
  }

  function ouvrirFiche(feature, deplacer) {
    arreterVisite(false);
    choisi = feature;
    rendreFiche();
    if (surTelephone()) fermerMenu();
    panneau.afficher();
    actualiserReperes();
    if (deplacer) {
      map.flyTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(map.getZoom(), ZOOM_FICHE),
        offset: decalageFiche(),
        duration: 900,
        essential: true,
      });
    }
  }

  async function lancerVisite() {
    if (!choisi || etatVisite === 'chargement') return;
    jeton += 1;
    const demande = jeton;
    etatVisite = 'chargement';
    rendreFiche();
    try {
      const donnees = await visite.charger(choisi.properties.id);
      if (demande !== jeton) return;
      fermerMenu();
      etatVisite = 'active';
      rendreFiche();
      panneau.afficher();
      const cadre = panneau.element.getBoundingClientRect();
      const toutLaLargeur = cadre.width >= window.innerWidth - 4;
      visite.demarrer(donnees, toutLaLargeur ? { bottom: window.innerHeight - cadre.top + 20 } : { left: cadre.right + 30 });
      actualiserReperes();
    } catch (erreur) {
      if (demande !== jeton) return;
      console.warn('Visite du bike park :', erreur);
      etatVisite = 'erreur';
      rendreFiche();
    }
  }

  // ---------- Recherche ----------
  function actualiserReperes() {
    if (!actif || etatVisite === 'active' || masque()) reperes.retirer();
    else reperes.actualiser(dansZone, choisi);
  }

  function ligne(feature) {
    const park = feature.properties;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pc-ligne';
    const nom = document.createElement('span');
    nom.className = 'pc-ligne-nom';
    nom.textContent = park.nom;
    const lieu = document.createElement('span');
    lieu.className = 'pc-ligne-sous';
    lieu.textContent = park.lieu;
    const pistes = document.createElement('span');
    pistes.className = 'pc-ligne-valeur';
    pistes.textContent = pistesDe(park.pistes);
    item.append(nom, pistes, lieu);
    item.addEventListener('click', () => ouvrirFiche(feature, true));
    return item;
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
    liste.replaceChildren(...dansZone.map(ligne));
  }

  async function chercherNom() {
    const requete = normaliser(recherche.value);
    if (requete.length < 2) {
      if (zoneCherchee) {
        rendreZone();
      } else {
        afficherMessage('');
        liste.replaceChildren();
      }
      return;
    }
    try {
      await chargerListe();
    } catch (erreur) {
      console.warn('Liste des bike parks :', erreur);
      afficherMessage('Liste indisponible. Vérifiez votre connexion et réessayez.');
      return;
    }
    if (normaliser(recherche.value) !== requete) return;
    const trouves = index
      .map((entree) => ({ entree, score: scoreRecherche(entree, requete) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => a.score - b.score || b.entree.feature.properties.km - a.entree.feature.properties.km)
      .slice(0, RESULTATS_MAX)
      .map(({ entree }) => entree.feature);
    afficherMessage(trouves.length ? '' : `Aucun bike park pour « ${recherche.value.trim()} ».`);
    liste.replaceChildren(...trouves.map(ligne));
  }

  async function chercherZone() {
    if (etatVisite === 'active') quitterVisite();
    recherche.value = '';
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
    if (!zoneCherchee || !dansZone.length || recherche.value.trim().length >= 2) return;
    // Zoomer dans la zone déjà cherchée ne rend pas les résultats caducs
    const limites = map.getBounds();
    zonePerimee = !(limitesZone.contains(limites.getNorthEast()) && limitesZone.contains(limites.getSouthWest()));
    rendreZone();
  }

  boutonVisiter.addEventListener('click', () => void lancerVisite());
  recherche.addEventListener('input', () => void chercherNom());
  boutonZone.addEventListener('click', () => void chercherZone());
  window.addEventListener('panneau-carte', () => {
    if (actif) actualiserReperes();
  });

  return {
    section,
    definirMasque(fonction) {
      masque = fonction;
    },
    activer() {
      actif = true;
      map.on('moveend', surDeplacement);
    },
    desactiver() {
      actif = false;
      map.off('moveend', surDeplacement);
      fermerFiche();
      dansZone = [];
      limitesZone = null;
      zoneCherchee = false;
      zonePerimee = false;
      recherche.value = '';
      afficherMessage('');
      liste.replaceChildren();
      reperes.retirer();
    },
  };
}
