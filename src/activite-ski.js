import * as maplibregl from 'maplibre-gl';
import { distance } from './rando-api.js';
import { creerVisiteStation } from './visite-station.js';
import { lire, ecrire } from './reglages.js';
import { chargerNeige, creerBlocNeige, chargerRisque, creerBlocRisque } from './ski-conditions.js';

const URL_STATIONS = '/data/stations-ski.json';
const URL_PHOTON = 'https://photon.komoot.io/api/';
const DISTANCE_GROUPE_PX = 56;
const MAX_RESULTATS = 25;
const ZOOM_STATION = 12.5;
const ZOOM_LISTE_GROUPE = 13;
const DISTANCE_DOUBLON_M = 5000;
const DISTANCE_DOMAINE_PROCHE_M = 10000;
const ZOOM_POSITION = 14;

const ICONE_RECHERCHE = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>';
const ICONE_LOCALISER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
const ICONE_VISITER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 19.5 6.5-13 4 7.5 2-3 5.5 8.5H3Z"/><path d="m7.3 11 2.2 1.6 1.8-1.6"/></svg>';
const ICONE_ZONE = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2.6"/></svg>';
const ICONE_COURBES = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 18c3-1 4-5 9-5s6 4 9 5"/><path d="M6 13c2-.8 3-4 6-4s4 3.2 6 4"/><path d="M9.5 8c.9-.6 1.4-2 2.5-2s1.600 1.400 2.500 2"/></svg>';
const ICONE_PENTES = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 20h18L6.500 6 3 20Z"/><path d="M11.500 20a7 7 0 0 0-1.400-4.200"/></svg>';
const ICONE_FAVORI ='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.6Z"/></svg>';

const FILTRES = [
  ['tous', 'Tous'],
  ['alpin', 'Alpin'],
  ['nordique', 'Fond'],
];
const ONGLETS_FICHE = [
  ['domaine', 'Domaine'],
  ['neige', 'Neige'],
  ['securite', 'Sécurité'],
];
const CLASSES_PENTES = [
  ['30-35°', '#f7e600'],
  ['35-40°', '#f5801f'],
  ['40-45°', '#e8005f'],
  ['45° et +', '#c98abf'],
];

const NIVEAUX = [
  ['verte', 'Vertes'],
  ['bleue', 'Bleues'],
  ['rouge', 'Rouges'],
  ['noire', 'Noires'],
];

// Écritures équivalentes : « St » et « Saint », « 3 Vallées » et « Trois Vallées »…
const EQUIVALENTS = { st: 'saint', ste: 'sainte', 2: 'deux', 3: 'trois', 4: 'quatre', 7: 'sept' };

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((mot) => EQUIVALENTS[mot] || mot)
    .join(' ');
}

const contientMot = (texte, mot) => ` ${texte}`.includes(` ${mot}`);

// Plus le score est bas, plus la station correspond ; null si elle ne correspond pas
function scoreRecherche(entree, requete) {
  const { nom, lieu } = entree;
  const mots = requete.split(' ');
  if (nom === requete) return 0;
  if (nom.startsWith(requete)) return 1;
  if (contientMot(nom, requete)) return 2;
  if (mots.every((mot) => contientMot(nom, mot))) return 3;
  if (nom.includes(requete)) return 4;
  if (mots.every((mot) => contientMot(nom, mot) || contientMot(lieu, mot))) return 5;
  return null;
}

const tailleStation = ({ properties: s }) => (s.kmAlpin || 0) + (s.kmNordique || 0) + (s.remontees || 0);

const km = (valeur) =>
  `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: valeur < 10 ? 1 : 0 })} km`;
const metres = (valeur) => `${Math.round(valeur).toLocaleString('fr-FR')} m`;
const pluriel = (nombre, mot) => `${nombre} ${mot}${nombre > 1 ? 's' : ''}`;

function typeStation(station) {
  if (station.alpin && station.nordique) return { court: 'Mixte', couleur: '#7a4bb7' };
  if (station.alpin) return { court: 'Alpin', couleur: '#2f6fc4' };
  if (station.nordique) return { court: 'Fond', couleur: '#2e9e5b' };
  return { court: 'Station', couleur: '#6b706c' };
}

function nomPays(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) || '';
  } catch {
    return '';
  }
}

function lienExterne(texte, url) {
  const a = el('a', null, texte);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function urlSite(site) {
  if (!site) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// Résultat de Photon mis au format des stations du fichier local
function stationPhoton(feature) {
  const p = feature.properties || {};
  const types = { N: 'node', W: 'way', R: 'relation' };
  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      nom: p.name,
      lieu: p.city || p.county,
      region: p.state,
      pays: p.countrycode,
      site: p.website,
      osm: types[p.osm_type] && p.osm_id ? `${types[p.osm_type]}/${p.osm_id}` : undefined,
    },
  };
}

function estStationPhoton(feature) {
  const p = feature.properties || {};
  return (
    ((p.osm_key === 'leisure' && p.osm_value === 'ski_resort') ||
      (p.osm_key === 'landuse' && p.osm_value === 'winter_sports') ||
      (p.osm_key === 'site' && p.osm_value === 'piste')) &&
    p.name &&
    feature.geometry?.type === 'Point' &&
    feature.geometry.coordinates?.every(Number.isFinite)
  );
}

export function creerActiviteSki(map) {
  let actif = false;
  let ecouteurPose = false;
  let chargement = null;
  let index = [];
  let etatZone = 'repos'; // repos | chargement | ok | erreur
  let numeroZone = 0;
  let zonePerimee = false;
  let limitesZone = null;
  let stationsZone = [];
  let stationChoisie = null;
  let ficheReduite = false;
  let etatVisite = 'repos'; // repos | chargement | erreur | active
  let numeroVisite = 0;
  let stationEnChargement = null;
  let erreurChangementVisite = false;
  let ongletFiche = 'domaine';
  let conditions = {}; // par onglet : { feature, statut : chargement | ok | erreur, donnees }
  let filtre = lire('ski-filtre', 'tous');
  let favoris = lire('ski-favoris', []);
  const visite = creerVisiteStation(map);
  let marqueurs = [];
  let popupGroupe = null;
  let minuteurFermetureGroupe = null;
  let popupResume = null;

  // ---------- Panneau du menu ----------
  const panneau = el('div', 'rando ski');
  panneau.innerHTML = `
    <label class="ski-champ">
      ${ICONE_RECHERCHE}
      <input type="text" class="rando-champ" placeholder="Visiter une station…"
        autocomplete="off" spellcheck="false" inputmode="search" aria-label="Chercher une station à visiter"
        role="combobox" aria-autocomplete="list" aria-controls="ski-liste" aria-expanded="false">
    </label>
    <div class="rando-liste" id="ski-liste" role="listbox" aria-label="Stations trouvées" hidden></div>
    <section class="ski-favoris" aria-label="Mes stations favorites" hidden>
      <h3 class="ski-favoris-titre">Mes favoris</h3>
      <div class="rando-liste ski-favoris-liste" role="listbox" aria-label="Mes stations favorites"></div>
    </section>
    <div class="ski-zone">
      <div class="segments ski-filtres" role="group" aria-label="Type de domaine">
        ${FILTRES.map(([id, libelle]) => `<button type="button" class="ski-filtre" data-filtre="${id}">${libelle}</button>`).join('')}
      </div>
      <div class="rando-actions-principales">
        <button type="button" class="rando-zone-bouton rando-action-principale">
          ${ICONE_ZONE}
          <span class="rando-zone-libelle">Stations dans la zone visible</span>
        </button>
      </div>
    </div>
    <p class="note rando-aide" role="status" aria-live="polite" hidden></p>
    <p class="note ski-credits">Stations et pistes : OpenSkiData (ODbL), © contributeurs OpenStreetMap, Skimap.org. Vérifiez les ouvertures et les conditions auprès des stations.</p>
  `;
  const champ = panneau.querySelector('.rando-champ');
  const liste = panneau.querySelector('.rando-liste');
  const boutonZone = panneau.querySelector('.rando-zone-bouton');
  const libelleZone = panneau.querySelector('.rando-zone-libelle');
  const aide = panneau.querySelector('.rando-aide');
  const sectionFavoris = panneau.querySelector('.ski-favoris');
  const listeFavoris = panneau.querySelector('.ski-favoris-liste');
  const boutonsFiltre = panneau.querySelectorAll('.ski-filtre');

  // ---------- Fiche de station (en bas de la carte) ----------
  const carte = el('aside');
  carte.id = 'ski-fiche';
  carte.hidden = true;
  document.body.appendChild(carte);

  // ---------- Données ----------
  function chargerStations() {
    if (!chargement) {
      chargement = fetch(new URL(URL_STATIONS, window.location.origin).href)
        .then((reponse) => {
          if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
          return reponse.json();
        })
        .then((donnees) => {
          index = donnees.features.map((feature) => ({
            feature,
            nom: normaliser(feature.properties.nom),
            lieu: normaliser(`${feature.properties.lieu || ''} ${feature.properties.region || ''}`),
          }));
        })
        .catch((erreur) => {
          chargement = null; // la prochaine recherche retentera le téléchargement
          throw erreur;
        });
    }
    return chargement;
  }

  function chercherDansFichier(texte) {
    const requete = normaliser(texte);
    if (!requete) return [];
    return index
      .map((entree) => ({ entree, score: scoreRecherche(entree, requete) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => a.score - b.score || tailleStation(b.entree.feature) - tailleStation(a.entree.feature))
      .slice(0, MAX_RESULTATS)
      .map(({ entree }) => entree.feature);
  }

  function domaineProche(feature) {
    let meilleur = null;
    for (const { feature: candidat } of index) {
      if (candidat === feature || !tailleStation(candidat)) continue;
      if (distance(feature.geometry.coordinates, candidat.geometry.coordinates) > DISTANCE_DOMAINE_PROCHE_M) continue;
      if (!meilleur || tailleStation(candidat) > tailleStation(meilleur)) meilleur = candidat;
    }
    return meilleur;
  }

  // ---------- Fiche ----------
  function stat(valeur, libelle) {
    const s = el('div', 'rando-stat');
    s.append(el('strong', null, valeur), el('span', null, libelle));
    return s;
  }

  function creerNiveaux(niveaux) {
    const presents = NIVEAUX.filter(([couleur]) => niveaux[couleur] > 0);
    const total = presents.reduce((somme, [couleur]) => somme + niveaux[couleur], 0);
    const bloc = el('div', 'ski-niveaux');
    const barre = el('div', 'ski-niveaux-barre');
    barre.setAttribute('aria-hidden', 'true');
    const legende = el('div', 'ski-niveaux-legende');
    for (const [couleur, libelle] of presents) {
      const segment = el('span', `ski-niveau-${couleur}`);
      segment.style.flexGrow = String(niveaux[couleur] / total);
      barre.append(segment);
      const entree = el('span', 'ski-niveaux-entree');
      entree.append(el('i', `ski-niveau-${couleur}`), `${libelle} ${km(niveaux[couleur])}`);
      legende.append(entree);
    }
    bloc.append(barre, legende);
    return bloc;
  }

  function rendreFiche() {
    carte.replaceChildren();
    carte.hidden = !stationChoisie;
    if (!stationChoisie) return;

    const station = stationChoisie.properties;
    const type = typeStation(station);
    const entete = el('div', 'rando-entete');
    const badge = el('span', 'rando-badge', type.court);
    badge.style.background = type.couleur;
    const titres = el('div', 'rando-titres');
    let titre = station.nom;
    if (stationEnChargement && etatVisite === 'active') titre = `Préparation : ${stationEnChargement.properties.nom}…`;
    else if (erreurChangementVisite) titre = 'Visite indisponible, réessayez';
    titres.append(el('div', 'rando-nom', titre));
    const situation = [station.lieu, station.region, nomPays(station.pays)].filter(Boolean).join(' · ');
    if (situation) titres.append(el('div', 'rando-sous', situation));
    const reduire = el('button', 'rando-fiche-reduire');
    reduire.type = 'button';
    reduire.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    reduire.addEventListener('click', () => reduireFiche(!ficheReduite));
    const chercher = el('button', 'rando-fiche-reduire ouverte ski-fiche-chercher');
    chercher.type = 'button';
    chercher.innerHTML = ICONE_RECHERCHE;
    chercher.setAttribute('aria-label', 'Chercher une autre station');
    chercher.setAttribute('aria-expanded', String(!zoneRechercheFiche.hidden));
    chercher.addEventListener('click', () => {
      if (zoneRechercheFiche.hidden) ouvrirRechercheFiche();
      else fermerRechercheFiche();
    });
    entete.append(badge, titres);
    if (station.id) {
      const favori = estFavori(stationChoisie);
      const etoile = el('button', `rando-fiche-reduire ouverte ski-fiche-favori${favori ? ' actif' : ''}`);
      etoile.type = 'button';
      etoile.innerHTML = ICONE_FAVORI;
      etoile.setAttribute('aria-pressed', String(favori));
      etoile.setAttribute('aria-label', favori ? 'Retirer des favoris' : 'Ajouter aux favoris');
      etoile.title = etoile.getAttribute('aria-label');
      etoile.addEventListener('click', () => basculerFavori(stationChoisie));
      entete.append(etoile);
    }
    entete.append(chercher, reduire);
    if (etatVisite === 'active') {
      const quitter = el('button', 'fiche-copier ski-visite-quitter', 'Quitter');
      quitter.type = 'button';
      quitter.setAttribute('aria-label', 'Quitter la visite');
      quitter.addEventListener('click', quitterVisite);
      entete.append(quitter);
    } else {
      const fermer = el('button', 'fiche-fermer', '✕');
      fermer.type = 'button';
      fermer.setAttribute('aria-label', 'Fermer la fiche de la station');
      fermer.addEventListener('click', fermerFiche);
      entete.append(fermer);
    }
    carte.append(entete);
    if (etatVisite === 'active') carte.append(creerCalquesVisite());
    majReduction();

    const onglets = el('div', 'segments ski-onglets');
    onglets.setAttribute('role', 'tablist');
    onglets.setAttribute('aria-label', 'Informations de la station');
    for (const [id, libelle] of ONGLETS_FICHE) {
      const onglet = el('button', id === ongletFiche ? 'actif' : '', libelle);
      onglet.type = 'button';
      onglet.setAttribute('role', 'tab');
      onglet.setAttribute('aria-selected', String(id === ongletFiche));
      onglet.addEventListener('click', () => {
        ongletFiche = id;
        chargerConditions();
        rendreFiche();
      });
      onglets.append(onglet);
    }
    carte.append(onglets);

    const contenu = el('div', 'ski-fiche-contenu');
    contenu.setAttribute('role', 'tabpanel');
    if (ongletFiche === 'neige') contenu.append(creerOngletNeige());
    else if (ongletFiche === 'securite') contenu.append(creerOngletSecurite());
    else contenu.append(...creerOngletDomaine());
    carte.append(contenu);

    const actions = el('div', 'rando-actions');
    if (station.pistes && etatVisite !== 'active') {
      const visiter = el('button', 'fiche-copier ski-visiter');
      visiter.type = 'button';
      visiter.innerHTML = ICONE_VISITER;
      visiter.append(etatVisite === 'chargement' ? 'Préparation de la visite…' : 'Visiter la station');
      visiter.disabled = etatVisite === 'chargement';
      visiter.addEventListener('click', () => lancerVisite(stationChoisie));
      actions.append(visiter);
      if (etatVisite === 'erreur') {
        actions.append(el('span', 'ski-visite-erreur', 'Visite indisponible. Vérifiez votre connexion et réessayez.'));
      }
    }
    if (!tailleStation(stationChoisie)) {
      const domaine = domaineProche(stationChoisie);
      if (domaine) {
        const voir = el('button', 'fiche-copier', `Voir le domaine : ${domaine.properties.nom}`);
        voir.type = 'button';
        voir.addEventListener('click', () => ouvrirStation(domaine, true));
        actions.append(voir);
      } else if (ongletFiche === 'domaine') {
        contenu.append(el('div', 'rando-attente', 'Aucun détail sur les pistes pour cette station.'));
      }
    }
    const liens = el('span', 'fiche-liens');
    const site = urlSite(station.site);
    if (site) liens.append(lienExterne('Site de la station', site));
    if (station.osm) liens.append(lienExterne('OpenStreetMap', `https://www.openstreetmap.org/${station.osm}`));
    if (liens.children.length) actions.append(liens);
    if (actions.children.length) carte.append(actions);
  }

  // ---------- Onglets de la fiche ----------
  function creerPosition() {
    const [lng, lat] = stationChoisie.geometry.coordinates;
    const texte = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const bloc = el('div', 'ski-position');
    const icone = el('span', 'ski-position-icone');
    icone.innerHTML = ICONE_LOCALISER;
    const textes = el('div', 'ski-position-textes');
    textes.append(el('span', null, 'Position GPS'), el('strong', null, texte));
    const copier = el('button', 'fiche-copier', 'Copier');
    copier.type = 'button';
    copier.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texte);
        copier.textContent = 'Copié ✓';
      } catch {
        copier.textContent = 'Indisponible';
      }
    });
    const zoomer = el('button', 'fiche-copier', 'Zoomer');
    zoomer.type = 'button';
    zoomer.addEventListener('click', () => {
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), ZOOM_POSITION), offset: [0, -70], duration: 900, essential: true });
    });
    bloc.append(icone, textes, copier, zoomer);
    return bloc;
  }

  function creerOngletDomaine() {
    const station = stationChoisie.properties;
    const blocs = [];
    const stats = el('div', 'rando-stats');
    if (station.kmAlpin) stats.append(stat(km(station.kmAlpin), 'Pistes alpines'));
    if (station.kmNordique) stats.append(stat(km(station.kmNordique), 'Ski de fond'));
    if (station.remontees) stats.append(stat(String(station.remontees), 'Remontées'));
    if (station.altMin && station.altMax) {
      const bas = station.altMin.toLocaleString('fr-FR');
      stats.append(stat(`${bas} – ${metres(station.altMax)}`, 'Altitudes'));
    } else if (station.altMax) {
      stats.append(stat(metres(station.altMax), 'Altitude max'));
    }
    if (stats.children.length) blocs.push(stats);
    if (station.niveaux) blocs.push(creerNiveaux(station.niveaux));
    if (etatVisite === 'active' && visite.communes().length) {
      blocs.push(el('div', 'rando-diff', `Communes : ${visite.communes().join(', ')}`));
    }
    blocs.push(creerPosition());
    return blocs;
  }

  function creerOngletNeige() {
    const etat = conditions.neige?.feature === stationChoisie ? conditions.neige : null;
    if (etat?.statut === 'ok') return creerBlocNeige(etat.donnees);
    if (etat?.statut === 'erreur') return el('div', 'rando-attente', 'Prévisions de neige indisponibles pour le moment. Réessayez plus tard.');
    const attente = el('div', 'rando-attente');
    attente.append(el('span', 'rech-attente'), 'Chargement des prévisions de neige…');
    return attente;
  }

  function creerBoutonCalque(icone, libelle, description, actif, surChangement) {
    const bouton = el('button', 'ski-visite-calque');
    bouton.type = 'button';
    bouton.innerHTML = icone;
    bouton.append(libelle);
    bouton.title = description;
    bouton.setAttribute('aria-label', description);
    bouton.setAttribute('aria-pressed', String(actif));
    bouton.addEventListener('click', () => {
      const coche = bouton.getAttribute('aria-pressed') !== 'true';
      bouton.setAttribute('aria-pressed', String(coche));
      surChangement(coche);
    });
    return bouton;
  }

  // Toujours visibles pendant la visite, même fiche réduite
  function creerCalquesVisite() {
    const bloc = el('div', 'ski-visite-calques');
    const legende = el('div', 'ski-pentes-legende');
    legende.hidden = !visite.pentesVisibles();
    for (const [libelle, couleur] of CLASSES_PENTES) {
      const entree = el('span', 'ski-niveaux-entree');
      const pastille = el('i');
      pastille.style.background = couleur;
      entree.append(pastille, libelle);
      legende.append(entree);
    }
    bloc.append(
      creerBoutonCalque(ICONE_COURBES, 'Courbes', 'Courbes de niveau et altitudes', visite.courbesVisibles(), (coche) => {
        visite.afficherCourbes(coche);
      }),
      creerBoutonCalque(ICONE_PENTES, 'Pentes 30°+', 'Pentes de plus de 30 degrés', visite.pentesVisibles(), (coche) => {
        visite.afficherPentes(coche);
        legende.hidden = !coche;
        placerRechercheFiche();
      }),
      legende,
      visite.creerChoixFond()
    );
    return bloc;
  }

  function creerOngletSecurite() {
    const bloc = el('div', 'ski-securite');
    const station = stationChoisie.properties;
    const etat = conditions.risque?.feature === stationChoisie ? conditions.risque : null;
    if (!station.massif || etat?.statut === 'ok') {
      bloc.append(creerBlocRisque(station.massif ? etat.donnees : null, station));
    } else if (etat?.statut === 'erreur') {
      bloc.append(el('div', 'rando-attente', 'Niveau de risque indisponible pour le moment. Consultez le bulletin officiel.'));
    } else {
      const attente = el('div', 'rando-attente');
      attente.append(el('span', 'rech-attente'), 'Chargement du niveau de risque…');
      bloc.append(attente);
    }

    bloc.append(el('p', 'ski-conditions-note', 'Carte des pentes (IGN, France) : elle montre l’inclinaison du terrain, pas le danger du jour.'));
    return bloc;
  }

  // Les conditions ne se chargent qu'à l'ouverture de leur onglet, pour limiter les appels
  function chargerConditions() {
    const feature = stationChoisie;
    if (!feature) return;
    const charger = (cle, promesse) => {
      if (conditions[cle]?.feature === feature && conditions[cle].statut !== 'erreur') return;
      conditions[cle] = { feature, statut: 'chargement' };
      // Une réponse arrivée après un changement de station ne doit jamais s'afficher sur la nouvelle
      const toujoursAttendue = () => conditions[cle]?.feature === feature;
      promesse()
        .then((donnees) => { if (toujoursAttendue()) conditions[cle] = { feature, statut: 'ok', donnees }; })
        .catch((erreur) => {
          if (toujoursAttendue()) conditions[cle] = { feature, statut: 'erreur' };
          console.warn('Conditions de la station :', erreur);
        })
        .finally(() => {
          if (stationChoisie === feature && ongletFiche === (cle === 'neige' ? 'neige' : 'securite')) rendreFiche();
        });
    };
    if (ongletFiche === 'neige') charger('neige', () => chargerNeige(feature));
    if (ongletFiche === 'securite' && feature.properties.massif) {
      charger('risque', () => chargerRisque(feature.properties.massif));
    }
  }

  // ---------- Favoris ----------
  function estFavori(feature) {
    return favoris.includes(feature.properties.id);
  }

  function basculerFavori(feature) {
    const { id } = feature.properties;
    favoris = favoris.includes(id) ? favoris.filter((autre) => autre !== id) : [...favoris, id];
    ecrire('ski-favoris', favoris);
    rendreFiche();
    rendreFavoris();
  }

  // Sous le champ quand il est vide ; un favori disparu de la source est simplement ignoré
  function rendreFavoris() {
    const stations = favoris
      .map((id) => index.find((entree) => entree.feature.properties.id === id)?.feature)
      .filter(Boolean);
    listeFavoris.replaceChildren(...stations.map((feature, i) => creerItem(feature, `ski-favori-${i}`)));
    sectionFavoris.hidden = !stations.length || champ.value.trim().length >= 2;
  }

  // ---------- Filtre de la zone ----------
  function stationsFiltrees() {
    return filtre === 'tous' ? stationsZone : stationsZone.filter((feature) => feature.properties[filtre]);
  }

  function majFiltres() {
    boutonsFiltre.forEach((bouton) => {
      const actif = bouton.dataset.filtre === filtre;
      bouton.classList.toggle('actif', actif);
      bouton.setAttribute('aria-pressed', String(actif));
    });
  }

  function majReduction() {
    carte.classList.toggle('fiche-reduite', ficheReduite);
    const bouton = carte.querySelector('.rando-fiche-reduire:not(.ski-fiche-chercher):not(.ski-fiche-favori)');
    if (!bouton) return;
    bouton.classList.toggle('ouverte', !ficheReduite);
    bouton.setAttribute('aria-expanded', String(!ficheReduite));
    bouton.setAttribute('aria-label', ficheReduite ? 'Afficher le détail de la station' : 'Réduire la fiche de la station');
    placerRechercheFiche();
  }

  function reduireFiche(reduite) {
    ficheReduite = reduite;
    majReduction();
  }

  // Sur mobile, la fiche s'efface dès qu'on manipule la carte pour ne pas masquer la vue
  function reduireSiMobile(event) {
    if (!event.originalEvent) return;
    fermerRechercheFiche();
    if (!stationChoisie || ficheReduite) return;
    if (window.matchMedia('(max-width: 640px)').matches) reduireFiche(true);
  }

  // ---------- Visite de la station ----------
  // Depuis une visite en cours, la station affichée ne change qu'une fois ses pistes chargées
  async function lancerVisite(feature) {
    if (!feature?.properties.pistes) return;
    if (etatVisite === 'chargement' && stationEnChargement === feature) return;
    const numero = ++numeroVisite;
    const changement = etatVisite === 'active';
    stationEnChargement = feature;
    erreurChangementVisite = false;
    if (!changement) etatVisite = 'chargement';
    rendreFiche();
    try {
      const donnees = await visite.charger(feature.properties.id);
      if (numero !== numeroVisite || !actif) return;
      stationChoisie = feature;
      stationEnChargement = null;
      etatVisite = 'active';
      ficheReduite = true;
      visite.demarrer(donnees);
      chargerConditions();
      rendreFiche();
      actualiserMarqueurs();
      document.getElementById('menu-fermer')?.click();
    } catch (erreur) {
      if (numero !== numeroVisite || !actif) return;
      stationEnChargement = null;
      if (changement) erreurChangementVisite = true;
      else etatVisite = 'erreur';
      console.warn('Visite de la station :', erreur);
      rendreFiche();
    }
  }

  function arreterVisite(restaurer) {
    numeroVisite++;
    etatVisite = 'repos';
    stationEnChargement = null;
    erreurChangementVisite = false;
    visite.quitter({ restaurer });
  }

  function quitterVisite() {
    fermerRechercheFiche();
    arreterVisite(true);
    ficheReduite = false;
    rendreFiche();
    actualiserMarqueurs();
  }

  function ouvrirStation(feature, deplacer) {
    arreterVisite(false);
    stationChoisie = feature;
    ficheReduite = false;
    chargerConditions();
    rendreFiche();
    actualiserMarqueurs();
    if (deplacer) {
      map.flyTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(map.getZoom(), ZOOM_STATION),
        offset: [0, -70], // garde le repère au-dessus de la fiche
        duration: 900,
      });
    }
  }

  function fermerFiche() {
    fermerRechercheFiche();
    arreterVisite(false);
    stationChoisie = null;
    ficheReduite = false;
    rendreFiche();
    actualiserMarqueurs();
  }

  // ---------- Repères sur la carte ----------
  function fermerPopups() {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = null;
    if (popupGroupe) popupGroupe.remove();
    popupGroupe = null;
    if (popupResume) popupResume.remove();
    popupResume = null;
  }

  function retirerMarqueurs() {
    fermerPopups();
    marqueurs.forEach((marqueur) => marqueur.remove());
    marqueurs = [];
  }

  function afficherResume(feature) {
    if (popupResume) popupResume.remove();
    const station = feature.properties;
    const contenu = el('div', 'rando-resume-repere');
    contenu.append(el('strong', 'rando-resume-titre', station.nom));
    const stats = el('div', 'rando-resume-stats');
    const ajouterStat = (libelle, valeur) => {
      const ligne = el('div', 'rando-resume-ligne');
      ligne.append(el('span', null, libelle), el('strong', null, valeur));
      stats.append(ligne);
    };
    if (station.kmAlpin) ajouterStat('Pistes alpines', km(station.kmAlpin));
    if (station.kmNordique) ajouterStat('Ski de fond', km(station.kmNordique));
    if (station.remontees) ajouterStat('Remontées', String(station.remontees));
    if (station.altMax) ajouterStat('Altitude max', metres(station.altMax));
    if (stats.children.length) contenu.append(stats);
    popupResume = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -50],
      maxWidth: '260px',
      className: 'rando-resume-popup',
    })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(contenu)
      .addTo(map);
  }

  function fermerResume() {
    if (popupResume) popupResume.remove();
    popupResume = null;
  }

  function creerRepere(feature) {
    const station = feature.properties;
    const element = el('button', 'rando-repere ski-repere');
    element.type = 'button';
    element.classList.toggle('selectionne', feature === stationChoisie);
    element.setAttribute('aria-label', `Ouvrir la fiche de ${station.nom}`);
    element.innerHTML =
      '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="ski-repere-flocon" d="M24 14v20m-8.66-15 17.32 10m0-10-17.32 10m8.66-15-2.5 2.5M24 14l2.5 2.5M24 34l-2.5-2.5m2.5 2.5 2.5-2.5m-11.16-13 3.4.9m-3.4-.9.9 3.4m15.42 6.2-3.4-.9m3.4.9-.9-3.4m.9-6.2-3.4.9m3.4-.9-.9 3.4m-15.42 6.2 3.4-.9m-3.4.9.9-3.4"/></svg>';
    element.append(el('span', 'rando-repere-nom', station.nom));
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherResume(feature);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') fermerResume();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherResume(feature);
    });
    element.addEventListener('blur', fermerResume);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      fermerResume();
      ouvrirStation(feature, false);
    });
    return new maplibregl.Marker({ element, anchor: 'bottom' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);
  }

  function programmerFermetureGroupe() {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = window.setTimeout(() => {
      if (popupGroupe) popupGroupe.remove();
      popupGroupe = null;
      minuteurFermetureGroupe = null;
    }, 350);
  }

  function afficherGroupe(features, coordonnees) {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = null;
    if (popupGroupe) popupGroupe.remove();

    const contenu = el('div', 'rando-groupe-liste ski-groupe-liste');
    contenu.append(el('strong', 'rando-groupe-titre', `${features.length} stations à proximité`));
    for (const feature of features) {
      const choix = el('button', 'rando-groupe-choix ski-groupe-choix', feature.properties.nom);
      choix.type = 'button';
      choix.addEventListener('click', () => {
        if (popupGroupe) popupGroupe.remove();
        popupGroupe = null;
        ouvrirStation(feature, true);
      });
      contenu.append(choix);
    }
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '300px', offset: 8 })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupGroupe = popup;
    const elementPopup = popup.getElement();
    elementPopup.addEventListener('pointerenter', () => {
      clearTimeout(minuteurFermetureGroupe);
      minuteurFermetureGroupe = null;
    });
    elementPopup.addEventListener('pointerleave', programmerFermetureGroupe);
    popup.on('close', () => {
      if (popupGroupe === popup) popupGroupe = null;
    });
  }

  function zoomerSurGroupe(features) {
    const limites = new maplibregl.LngLatBounds();
    features.forEach((feature) => limites.extend(feature.geometry.coordinates));
    map.fitBounds(limites, { padding: 90, maxZoom: ZOOM_LISTE_GROUPE, duration: 700 });
  }

  function creerRepereGroupe(features, coordonnees) {
    const element = el('button', 'rando-groupe ski-groupe');
    element.type = 'button';
    element.setAttribute('aria-label', `${features.length} stations regroupées. Touchez pour zoomer ou choisir une station.`);
    element.innerHTML =
      `<svg viewBox="0 0 56 56" aria-hidden="true"><path class="rando-groupe-halo" d="M28 2 52 16v24L28 54 4 40V16z"/><path class="rando-groupe-forme" d="M28 7 47 18v20L28 49 9 38V18z"/></svg><span>${features.length}</span>`;
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherGroupe(features, coordonnees);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureGroupe();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherGroupe(features, coordonnees);
    });
    element.addEventListener('blur', programmerFermetureGroupe);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (map.getZoom() >= ZOOM_LISTE_GROUPE) {
        afficherGroupe(features, coordonnees);
        return;
      }
      fermerPopups();
      zoomerSurGroupe(features);
    });
    return new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(coordonnees)
      .addTo(map);
  }

  // Les plus grandes stations servent de centre de groupe ; la grille évite de comparer
  // chaque station à toutes les autres quand la zone en contient des milliers.
  function grouper(entrees) {
    const rayon2 = DISTANCE_GROUPE_PX * DISTANCE_GROUPE_PX;
    const grille = new Map();
    const groupes = [];
    for (const entree of entrees) {
      const colonne = Math.floor(entree.pixel.x / DISTANCE_GROUPE_PX);
      const ligne = Math.floor(entree.pixel.y / DISTANCE_GROUPE_PX);
      let meilleur = null;
      let meilleurEcart = rayon2;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const groupe of grille.get(`${colonne + dx}:${ligne + dy}`) || []) {
            const ecartX = groupe[0].pixel.x - entree.pixel.x;
            const ecartY = groupe[0].pixel.y - entree.pixel.y;
            const ecart = ecartX * ecartX + ecartY * ecartY;
            if (ecart <= meilleurEcart) {
              meilleur = groupe;
              meilleurEcart = ecart;
            }
          }
        }
      }
      if (meilleur) {
        meilleur.push(entree);
      } else {
        const groupe = [entree];
        groupes.push(groupe);
        const cle = `${colonne}:${ligne}`;
        if (!grille.has(cle)) grille.set(cle, []);
        grille.get(cle).push(groupe);
      }
    }
    return groupes;
  }

  function stationsVisibles() {
    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    return stationsFiltrees()
      .map((feature) => ({ feature, pixel: map.project(feature.geometry.coordinates) }))
      .filter(({ pixel }) => pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur);
  }

  function actualiserMarqueurs() {
    retirerMarqueurs();
    if (!actif || etatVisite === 'active') return;
    const visibles = stationsVisibles().filter(({ feature }) => feature !== stationChoisie);
    for (const groupe of grouper(visibles)) {
      if (groupe.length === 1) {
        marqueurs.push(creerRepere(groupe[0].feature));
      } else {
        marqueurs.push(creerRepereGroupe(groupe.map(({ feature }) => feature), groupe[0].feature.geometry.coordinates));
      }
    }
    if (stationChoisie) marqueurs.push(creerRepere(stationChoisie));
  }

  // ---------- Recherche dans la zone visible ----------
  function rendreZone() {
    let texte = '';
    if (etatZone === 'chargement') texte = 'Recherche des stations dans la zone…';
    else if (etatZone === 'erreur') texte = 'Liste des stations indisponible. Vérifiez votre connexion et réessayez.';
    else if (etatZone === 'ok') {
      const nombre = stationsFiltrees().length;
      const total = nombre
        ? `${pluriel(nombre, 'station')} trouvée${nombre > 1 ? 's' : ''}`
        : 'Aucune station trouvée';
      texte = zonePerimee
        ? `${total} dans la zone précédente. Relancez la recherche après avoir déplacé la carte.`
        : `${total} dans cette zone.`;
    }
    aide.textContent = texte;
    aide.hidden = !texte;
    boutonZone.disabled = etatZone === 'chargement';
    libelleZone.textContent = etatZone === 'chargement' ? 'Recherche…' : 'Stations dans la zone visible';
  }

  async function rechercherZone() {
    if (!actif) return;
    if (etatVisite === 'active') quitterVisite();
    const numero = ++numeroZone;
    recherchePanneau.effacer();
    etatZone = 'chargement';
    rendreZone();
    try {
      await chargerStations();
      if (!actif || numero !== numeroZone) return;
    } catch (erreur) {
      if (!actif || numero !== numeroZone) return;
      etatZone = 'erreur';
      console.warn('Stations de ski :', erreur);
      rendreZone();
      return;
    }

    const limites = map.getBounds();
    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    stationsZone = index
      .map(({ feature }) => feature)
      .filter((feature) => {
        if (!limites.contains(feature.geometry.coordinates)) return false;
        const pixel = map.project(feature.geometry.coordinates);
        return pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur;
      });
    limitesZone = limites;
    zonePerimee = false;
    etatZone = 'ok';
    rendreZone();
    actualiserMarqueurs();
    if (stationsFiltrees().length && window.matchMedia('(max-width: 640px)').matches) {
      document.getElementById('menu-fermer')?.click();
    }
  }

  function signalerDeplacement() {
    if (!actif) return;
    actualiserMarqueurs();
    if (etatZone !== 'ok' || !limitesZone) return;
    // Zoomer dans la zone déjà cherchée ne rend pas les résultats caducs
    const limites = map.getBounds();
    zonePerimee = !(limitesZone.contains(limites.getNorthEast()) && limitesZone.contains(limites.getSouthWest()));
    rendreZone();
  }

  // ---------- Recherche par nom ----------
  function creerActionItem(classe, icone, libelle, description, action) {
    const bouton = el('button', `ski-item-action ${classe}`);
    bouton.type = 'button';
    bouton.innerHTML = icone;
    bouton.append(libelle);
    bouton.setAttribute('aria-label', description);
    bouton.title = description;
    bouton.addEventListener('click', action);
    return bouton;
  }

  function creerItem(feature, identifiant) {
    const station = feature.properties;
    const item = el('div', 'rando-item ski-item');
    item.id = identifiant;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');

    const infos = el('button', 'ski-item-infos');
    infos.type = 'button';
    infos.append(el('span', 'rando-item-nom', station.nom));
    const pistes = (station.kmAlpin || 0) + (station.kmNordique || 0);
    const type = typeStation(station).court;
    const sous = [
      type === 'Station' ? '' : type,
      pistes ? km(pistes) : '',
      station.region || station.lieu || nomPays(station.pays),
    ]
      .filter(Boolean)
      .join(' · ');
    if (sous) infos.append(el('span', 'rando-item-sous', sous));
    infos.setAttribute('aria-label', `Localiser ${station.nom}`);
    infos.addEventListener('click', () => localiserStation(feature));

    const localiser = creerActionItem(
      'ski-item-localiser', ICONE_LOCALISER, 'Localiser', `Localiser ${station.nom} sur la carte`,
      () => localiserStation(feature)
    );
    const visiter = creerActionItem(
      'ski-item-visiter', ICONE_VISITER, 'Visiter',
      station.pistes ? `Visiter ${station.nom}` : 'Visite pas encore disponible pour cette station',
      () => visiterStation(feature)
    );
    visiter.disabled = !station.pistes;
    item.append(infos, localiser, visiter);
    return item;
  }

  function visiterStation(feature) {
    fermerRechercheFiche();
    if (etatVisite !== 'active') {
      stationChoisie = feature;
      ficheReduite = false;
      chargerConditions();
    }
    lancerVisite(feature);
  }

  function localiserStation(feature) {
    fermerRechercheFiche();
    ouvrirStation(feature, true);
    if (window.matchMedia('(max-width: 640px)').matches) {
      document.getElementById('menu-fermer')?.click();
    }
  }

  // Le fichier répond tout de suite ; Photon complète ensuite avec les stations
  // connues seulement d'OpenStreetMap (Flaine, Les Saisies…) et tolère les fautes de frappe.
  function completerAvecPhoton(resultatsLocaux, trouvees, requete) {
    const mots = requete.split(' ');
    const retenues = [...resultatsLocaux];
    for (const feature of trouvees.filter(estStationPhoton)) {
      const nom = normaliser(feature.properties.name);
      if (resultatsLocaux.length && !mots.every((mot) => contientMot(nom, mot))) continue;
      const doublon = retenues.some(
        (existante) => distance(existante.geometry.coordinates, feature.geometry.coordinates) < DISTANCE_DOUBLON_M
      );
      if (!doublon) retenues.push(stationPhoton(feature));
    }
    return retenues.slice(0, MAX_RESULTATS);
  }

  // Un champ et sa liste de résultats : celui du menu et celui de la fiche fonctionnent pareil
  function creerRecherche({ champ, liste, prefixe, surEchap }) {
    let recherche = '';
    let etatRech = 'vide'; // vide | attente | ok | erreur
    let resultats = [];
    let suggestionActive = -1;
    let minuteurRech = null;
    let ctrlRech = null;

    function rendre() {
      const enRecherche = recherche.length >= 2;
      liste.replaceChildren();
      liste.hidden = !enRecherche;
      champ.setAttribute('aria-expanded', String(enRecherche));
      champ.removeAttribute('aria-activedescendant');
      suggestionActive = -1;
      if (!enRecherche) return;

      if (resultats.length) {
        resultats.forEach((feature, position) =>
          liste.append(creerItem(feature, `${prefixe}-${position}`)));
      } else if (etatRech === 'attente') {
        const attente = el('div', 'rando-attente');
        attente.append(el('span', 'rech-attente'), 'Recherche des stations…');
        liste.append(attente);
      } else if (etatRech === 'erreur') {
        liste.append(el('div', 'rando-attente', 'Recherche indisponible. Vérifiez votre connexion et réessayez.'));
      } else {
        liste.append(el('div', 'rando-attente', `Aucune station pour « ${recherche} »`));
      }
    }

    function activerSuggestion(position) {
      const options = liste.querySelectorAll('[role="option"]');
      if (!options.length) return;
      suggestionActive = (position + options.length) % options.length;
      options.forEach((option, i) => option.setAttribute('aria-selected', String(i === suggestionActive)));
      options[suggestionActive].scrollIntoView({ block: 'nearest' });
      champ.setAttribute('aria-activedescendant', options[suggestionActive].id);
    }

    async function lancer(texte) {
      if (ctrlRech) ctrlRech.abort();
      const controleur = new AbortController();
      ctrlRech = controleur;
      const centre = map.getCenter();
      const url =
        `${URL_PHOTON}?q=${encodeURIComponent(texte)}&limit=15&lang=fr&lat=${centre.lat.toFixed(3)}&lon=${centre.lng.toFixed(3)}` +
        '&osm_tag=leisure:ski_resort&osm_tag=landuse:winter_sports&osm_tag=site:piste';
      const [fichier, photon] = await Promise.allSettled([
        chargerStations(),
        fetch(url, { signal: controleur.signal }).then((reponse) => {
          if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
          return reponse.json();
        }),
      ]);
      if (controleur.signal.aborted || ctrlRech !== controleur || texte !== recherche) return;

      const locaux = chercherDansFichier(texte);
      if (photon.status === 'fulfilled') {
        resultats = completerAvecPhoton(locaux, photon.value.features || [], normaliser(texte));
      } else {
        console.warn('Recherche de stations (Photon) :', photon.reason);
        resultats = locaux;
      }
      etatRech = fichier.status === 'rejected' && photon.status === 'rejected' ? 'erreur' : 'ok';
      rendre();
    }

    function effacer() {
      clearTimeout(minuteurRech);
      if (ctrlRech) ctrlRech.abort();
      champ.value = '';
      recherche = '';
      etatRech = 'vide';
      resultats = [];
      rendre();
    }

    champ.addEventListener('input', () => {
      recherche = champ.value.trim();
      clearTimeout(minuteurRech);
      if (ctrlRech) ctrlRech.abort();
      if (recherche.length < 2) {
        etatRech = 'vide';
        resultats = [];
        rendre();
        return;
      }
      etatRech = 'attente';
      resultats = chercherDansFichier(recherche);
      rendre();
      const texte = recherche;
      minuteurRech = setTimeout(() => lancer(texte), 350);
    });

    champ.addEventListener('focus', () => {
      if (recherche.length >= 2) rendre();
    });

    champ.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && !liste.hidden) {
        event.preventDefault();
        activerSuggestion(suggestionActive + 1);
      } else if (event.key === 'ArrowUp' && !liste.hidden) {
        event.preventDefault();
        activerSuggestion(suggestionActive < 0 ? -1 : suggestionActive - 1);
      } else if (event.key === 'Enter' && !liste.hidden) {
        // Entrée lance la visite ; sans pistes disponibles, elle localise la station
        const feature = resultats[Math.max(suggestionActive, 0)];
        if (feature?.properties.pistes) visiterStation(feature);
        else if (feature) localiserStation(feature);
      } else if (event.key === 'Escape') {
        if (surEchap) {
          surEchap();
        } else if (!liste.hidden) {
          liste.hidden = true;
          champ.setAttribute('aria-expanded', 'false');
          champ.removeAttribute('aria-activedescendant');
        }
      }
    });

    return { effacer };
  }

  const recherchePanneau = creerRecherche({ champ, liste, prefixe: 'ski-suggestion' });

  // ---------- Recherche depuis la fiche ----------
  const zoneRechercheFiche = el('div', 'ski-fiche-recherche');
  zoneRechercheFiche.hidden = true;
  zoneRechercheFiche.innerHTML = `
    <input type="text" placeholder="Chercher une autre station…"
      autocomplete="off" spellcheck="false" inputmode="search" aria-label="Chercher une autre station"
      role="combobox" aria-autocomplete="list" aria-controls="ski-fiche-liste" aria-expanded="false">
    <div class="rando-liste" id="ski-fiche-liste" role="listbox" aria-label="Stations trouvées" hidden></div>
  `;
  document.body.appendChild(zoneRechercheFiche);
  const champFiche = zoneRechercheFiche.querySelector('input');
  const rechercheFiche = creerRecherche({
    champ: champFiche,
    liste: zoneRechercheFiche.querySelector('.rando-liste'),
    prefixe: 'ski-fiche-suggestion',
    surEchap: fermerRechercheFiche,
  });

  function placerRechercheFiche() {
    if (zoneRechercheFiche.hidden || carte.hidden) return;
    const bas = window.innerHeight - carte.getBoundingClientRect().top + 8;
    zoneRechercheFiche.style.setProperty('--ski-recherche-bas', `${bas}px`);
  }

  function majBoutonRechercheFiche() {
    carte.querySelector('.ski-fiche-chercher')?.setAttribute('aria-expanded', String(!zoneRechercheFiche.hidden));
  }

  function ouvrirRechercheFiche() {
    erreurChangementVisite = false;
    zoneRechercheFiche.hidden = false;
    placerRechercheFiche();
    majBoutonRechercheFiche();
    champFiche.focus();
  }

  function fermerRechercheFiche() {
    if (zoneRechercheFiche.hidden) return;
    zoneRechercheFiche.hidden = true;
    rechercheFiche.effacer();
    majBoutonRechercheFiche();
  }

  window.addEventListener('resize', placerRechercheFiche);

  champ.addEventListener('input', rendreFavoris);

  boutonsFiltre.forEach((bouton) => {
    bouton.addEventListener('click', () => {
      filtre = bouton.dataset.filtre;
      ecrire('ski-filtre', filtre);
      majFiltres();
      rendreZone();
      actualiserMarqueurs();
    });
  });
  majFiltres();

  boutonZone.addEventListener('click', rechercherZone);

  // ---------- Cycle de vie de l'activité ----------
  return {
    id: 'ski',
    label: 'Ski',
    icone: 'ski',
    panneau,
    activer() {
      actif = true;
      if (!ecouteurPose) {
        map.on('moveend', signalerDeplacement);
        map.on('dragstart', reduireSiMobile);
        map.on('zoomstart', reduireSiMobile);
        map.on('click', fermerRechercheFiche);
        ecouteurPose = true;
      }
      chargerStations()
        .then(rendreFavoris)
        .catch((erreur) => console.warn('Stations de ski :', erreur));
    },
    desactiver() {
      actif = false;
      numeroZone++;
      arreterVisite(true);
      ficheReduite = false;
      fermerRechercheFiche();
      recherchePanneau.effacer();
      etatZone = 'repos';
      zonePerimee = false;
      limitesZone = null;
      stationsZone = [];
      stationChoisie = null;
      conditions = {};
      rendreFiche();
      retirerMarqueurs();
      rendreZone();
    },
  };
}
