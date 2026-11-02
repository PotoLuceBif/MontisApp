import { distance } from './rando-api.js';
import { creerVisiteStation } from './visite-station.js';
import { lire, ecrire } from './reglages.js';
import { creerFavoris, creerFicheLieu, creerItemLieu, creerNiveaux, creerPosition, el, km, stat } from './fiche-lieu.js';
import { contientMot, creerRechercheLieux, creerReperesZone, lieuxDansLaVue, normaliser, scoreRecherche } from './zone-lieux.js';
import { chargerNeige, creerBlocNeige, chargerRisque, creerBlocRisque } from './ski-conditions.js';

const URL_STATIONS = '/data/stations-ski.json';
const URL_PHOTON = 'https://photon.komoot.io/api/';
const MAX_RESULTATS = 25;
const MAX_LISTE_ZONE = 30;
const DISTANCE_DOUBLON_M = 5000;
const DISTANCE_DOMAINE_PROCHE_M = 10000;

const ICONE_RECHERCHE = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>';
const ICONE_ZONE = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><circle cx="12" cy="12" r="2.6"/></svg>';

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

const tailleStation = ({ properties: s }) => (s.kmAlpin || 0) + (s.kmNordique || 0) + (s.remontees || 0);

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
  let ongletFiche = 'domaine';
  let conditions = {}; // par onglet : { feature, statut : chargement | ok | erreur, donnees }
  let filtre = lire('ski-filtre', 'tous');
  const favoris = creerFavoris('ski-favoris');
  const visite = creerVisiteStation(map);
  const reperes = creerReperesZone(map, {
    dessin: '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="ski-repere-flocon" d="M24 14v20m-8.66-15 17.32 10m0-10-17.32 10m8.66-15-2.5 2.5M24 14l2.5 2.5M24 34l-2.5-2.5m2.5 2.5 2.5-2.5m-11.16-13 3.4.9m-3.4-.9.9 3.4m15.42 6.2-3.4-.9m3.4.9-.9-3.4m.9-6.2-3.4.9m3.4-.9-.9 3.4m-15.42 6.2 3.4-.9m-3.4.9.9-3.4"/></svg>',
    titreGroupe: (nombre) => `${nombre} stations à proximité`,
    libelleGroupe: (nombre) => `${nombre} stations regroupées.`,
    resume({ properties: station }) {
      const lignes = [];
      if (station.kmAlpin) lignes.push(['Pistes alpines', km(station.kmAlpin)]);
      if (station.kmNordique) lignes.push(['Ski de fond', km(station.kmNordique)]);
      if (station.remontees) lignes.push(['Remontées', String(station.remontees)]);
      if (station.altMax) lignes.push(['Altitude max', metres(station.altMax)]);
      return lignes;
    },
    surChoix: (feature, deplacer) => fiche.ouvrir(feature, deplacer),
  });

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
    <div class="rando-liste ski-zone-liste" role="listbox" aria-label="Stations de la zone" hidden></div>
    <p class="note ski-credits">Stations et pistes : OpenSkiData (ODbL), © contributeurs OpenStreetMap, Skimap.org. Vérifiez les ouvertures et les conditions auprès des stations.</p>
  `;
  const champ = panneau.querySelector('.rando-champ');
  const liste = panneau.querySelector('.rando-liste');
  const boutonZone = panneau.querySelector('.rando-zone-bouton');
  const libelleZone = panneau.querySelector('.rando-zone-libelle');
  const aide = panneau.querySelector('.rando-aide');
  const listeZone = panneau.querySelector('.ski-zone-liste');
  const sectionFavoris = panneau.querySelector('.ski-favoris');
  const listeFavoris = panneau.querySelector('.ski-favoris-liste');
  const boutonsFiltre = panneau.querySelectorAll('.ski-filtre');

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

  // ---------- Fiche (en bas de la carte) ----------
  const fiche = creerFicheLieu(map, {
    id: 'ski-fiche',
    visite,
    textes: {
      visiter: 'Visiter la station',
      fermer: 'Fermer la fiche de la station',
      chercher: 'Chercher une autre station…',
      detail: 'Afficher le détail de la station',
    },
    decrire({ properties: station }) {
      return {
        badge: typeStation(station),
        situation: [station.lieu, station.region, nomPays(station.pays)].filter(Boolean).join(' · '),
      };
    },
    peutVisiter: (feature) => !!feature?.properties.pistes,
    favoris,
    creerRecherche: (options) => creerRecherche(options),
    surChoix: () => chargerConditions(),
    surChangement: () => actualiserMarqueurs(),
    surFavori: () => rendreFavoris(),
    rendreCorps(carte) {
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
          fiche.rendre();
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
      return contenu;
    },
    rendreActions(actions, contenu, feature) {
      const station = feature.properties;
      if (!tailleStation(feature)) {
        const domaine = domaineProche(feature);
        if (domaine) {
          const voir = el('button', 'fiche-copier', `Voir le domaine : ${domaine.properties.nom}`);
          voir.type = 'button';
          voir.addEventListener('click', () => fiche.ouvrir(domaine, true));
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
    },
  });

  // ---------- Onglets de la fiche ----------
  function creerOngletDomaine() {
    const station = fiche.choisi.properties;
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
    if (fiche.enVisite && visite.communes().length) {
      blocs.push(el('div', 'rando-diff', `Communes : ${visite.communes().join(', ')}`));
    }
    blocs.push(creerPosition(map, fiche.choisi.geometry.coordinates));
    return blocs;
  }

  function creerOngletNeige() {
    const etat = conditions.neige?.feature === fiche.choisi ? conditions.neige : null;
    if (etat?.statut === 'ok') return creerBlocNeige(etat.donnees);
    if (etat?.statut === 'erreur') return el('div', 'rando-attente', 'Prévisions de neige indisponibles pour le moment. Réessayez plus tard.');
    const attente = el('div', 'rando-attente');
    attente.append(el('span', 'rech-attente'), 'Chargement des prévisions de neige…');
    return attente;
  }

  function creerOngletSecurite() {
    const bloc = el('div', 'ski-securite');
    const station = fiche.choisi.properties;
    const etat = conditions.risque?.feature === fiche.choisi ? conditions.risque : null;
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
    const feature = fiche.choisi;
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
          if (fiche.choisi === feature && ongletFiche === (cle === 'neige' ? 'neige' : 'securite')) fiche.rendre();
        });
    };
    if (ongletFiche === 'neige') charger('neige', () => chargerNeige(feature));
    if (ongletFiche === 'securite' && feature.properties.massif) {
      charger('risque', () => chargerRisque(feature.properties.massif));
    }
  }

  // ---------- Favoris ----------
  // Sous le champ quand il est vide ; un favori disparu de la source est simplement ignoré
  function rendreFavoris() {
    const stations = favoris.ids()
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

  // ---------- Repères sur la carte ----------
  function actualiserMarqueurs() {
    if (!actif || fiche.enVisite) reperes.retirer();
    else reperes.actualiser(stationsFiltrees(), fiche.choisi);
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
    // Les plus grandes d'abord : à petite échelle, la zone en contient des centaines
    const stations = etatZone === 'ok' ? [...stationsFiltrees()].sort((a, b) => tailleStation(b) - tailleStation(a)) : [];
    if (stations.length > MAX_LISTE_ZONE) texte += ` Voici les ${MAX_LISTE_ZONE} plus grandes.`;
    listeZone.hidden = !stations.length;
    listeZone.replaceChildren(...stations.slice(0, MAX_LISTE_ZONE).map((feature, i) => creerItem(feature, `ski-zone-${i}`)));
    aide.textContent = texte;
    aide.hidden = !texte;
    boutonZone.disabled = etatZone === 'chargement';
    libelleZone.textContent = etatZone === 'chargement' ? 'Recherche…' : 'Stations dans la zone visible';
  }

  async function rechercherZone() {
    if (!actif) return;
    if (fiche.enVisite) fiche.quitterVisite();
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

    stationsZone = lieuxDansLaVue(map, index.map(({ feature }) => feature));
    limitesZone = map.getBounds();
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
  function creerItem(feature, identifiant) {
    const station = feature.properties;
    const pistes = (station.kmAlpin || 0) + (station.kmNordique || 0);
    const type = typeStation(station).court;
    return creerItemLieu({
      feature,
      identifiant,
      sous: [
        type === 'Station' ? '' : type,
        pistes ? km(pistes) : '',
        station.region || station.lieu || nomPays(station.pays),
      ].filter(Boolean).join(' · '),
      peutVisiter: !!station.pistes,
      descriptionVisiteImpossible: 'Visite pas encore disponible pour cette station',
      localiser: (lieu) => fiche.localiser(lieu),
      visiter: (lieu) => fiche.visiter(lieu),
    });
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
  function creerRecherche(options) {
    return creerRechercheLieux({
      ...options,
      charger: chargerStations,
      chercherLocal: chercherDansFichier,
      completer(texte, signal) {
        const centre = map.getCenter();
        const url =
          `${URL_PHOTON}?q=${encodeURIComponent(texte)}&limit=15&lang=fr&lat=${centre.lat.toFixed(3)}&lon=${centre.lng.toFixed(3)}` +
          '&osm_tag=leisure:ski_resort&osm_tag=landuse:winter_sports&osm_tag=site:piste';
        return fetch(url, { signal }).then((reponse) => {
          if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
          return reponse.json();
        });
      },
      fusionner: (locaux, photon, texte) => completerAvecPhoton(locaux, photon.features || [], normaliser(texte)),
      creerItem,
      textes: { attente: 'Recherche des stations…', vide: (texte) => `Aucune station pour « ${texte} »` },
      peutVisiter: (feature) => !!feature.properties.pistes,
      visiter: (feature) => fiche.visiter(feature),
      localiser: (feature) => fiche.localiser(feature),
    });
  }

  const recherchePanneau = creerRecherche({ champ, liste, prefixe: 'ski-suggestion' });

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
      fiche.activer();
      if (!ecouteurPose) {
        map.on('moveend', signalerDeplacement);
        ecouteurPose = true;
      }
      chargerStations()
        .then(rendreFavoris)
        .catch((erreur) => console.warn('Stations de ski :', erreur));
    },
    desactiver() {
      actif = false;
      numeroZone++;
      fiche.desactiver();
      recherchePanneau.effacer();
      etatZone = 'repos';
      zonePerimee = false;
      limitesZone = null;
      stationsZone = [];
      conditions = {};
      reperes.retirer();
      rendreZone();
    },
  };
}
