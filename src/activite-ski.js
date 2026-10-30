import * as maplibregl from 'maplibre-gl';

const SERVEURS_OVERPASS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ZOOM_MIN = 7.5;
const DISTANCE_GROUPE_PX = 56;

function centreElement(element) {
  if (element.type === 'node') return [element.lon, element.lat];
  if (element.center) return [element.center.lon, element.center.lat];
  return null;
}

function distanceMetres(a, b) {
  const radians = (degres) => (degres * Math.PI) / 180;
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const latA = radians(a[1]);
  const latB = radians(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

function geojsonStations(elements, bornes) {
  const stations = [];
  const vus = new Map();
  for (const element of elements) {
    const tags = element.tags || {};
    if (
      tags.leisure !== 'ski_resort' &&
      tags.landuse !== 'winter_sports' &&
      tags.site !== 'piste'
    ) continue;
    const nom = String(tags.name || tags['name:fr'] || '').trim();
    const coordonnees = centreElement(element);
    if (!nom || !coordonnees || !coordonnees.every(Number.isFinite)) continue;
    if (bornes && !bornes.contains(coordonnees)) continue;

    const cle = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const coordonneesDejaVues = vus.get(cle) || [];
    if (coordonneesDejaVues.some((coordonneesExistantes) => distanceMetres(coordonnees, coordonneesExistantes) < 2500)) {
      continue;
    }
    coordonneesDejaVues.push(coordonnees);
    vus.set(cle, coordonneesDejaVues);
    stations.push({
      type: 'Feature',
      id: `${element.type}/${element.id}`,
      geometry: { type: 'Point', coordinates: coordonnees },
      properties: {
        nom,
        ele: tags.ele || '',
        operateur: tags.operator || '',
        site: tags.website || tags['contact:website'] || '',
      },
    });
  }
  stations.sort((a, b) => a.properties.nom.localeCompare(b.properties.nom, 'fr'));
  return { type: 'FeatureCollection', features: stations };
}

async function interrogerOverpass(requete, signal) {
  let derniereErreur = null;
  for (const url of SERVEURS_OVERPASS) {
    if (signal.aborted) {
      const annulation = new Error('Recherche annulée.');
      annulation.name = 'AbortError';
      throw annulation;
    }
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 8000);
    const annuler = () => controleur.abort();
    signal.addEventListener('abort', annuler, { once: true });
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(requete)}`,
        signal: controleur.signal,
      });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const donnees = await reponse.json();
      if (donnees.remark && /error|timeout/i.test(donnees.remark)) throw new Error(donnees.remark);
      if (!Array.isArray(donnees.elements)) throw new Error('Réponse OpenStreetMap inattendue.');
      return donnees.elements;
    } catch (erreur) {
      if (signal.aborted) {
        const annulation = new Error('Recherche annulée.');
        annulation.name = 'AbortError';
        throw annulation;
      }
      derniereErreur = erreur.name === 'AbortError' ? new Error(`Délai dépassé sur ${new URL(url).hostname}.`) : erreur;
    } finally {
      clearTimeout(delai);
      signal.removeEventListener('abort', annuler);
    }
  }
  throw derniereErreur || new Error('Les données OpenStreetMap sont indisponibles.');
}

export function creerActiviteSki(map) {
  const panneau = document.createElement('div');
  panneau.className = 'ski';
  panneau.innerHTML = `
    <section class="para-intro ski-intro">
      <div class="para-intro-meta">
        <span>ACTIVITÉ MONTAGNE</span>
        <span class="para-badge">OPENSTREETMAP</span>
      </div>
      <h2>Ski</h2>
      <p>Explorez les stations référencées près de la zone affichée.</p>
    </section>

    <section class="para-statut ski-statut" data-etat="attente" aria-label="État des stations de ski">
      <div class="para-statut-entete">
        <div class="para-statut-titre">
          <span class="para-indicateur" aria-hidden="true"></span>
          <strong>Stations de ski</strong>
        </div>
        <button class="ski-actualiser" type="button">Rechercher dans cette zone</button>
      </div>
      <p class="para-statut-message" role="status" aria-live="polite">
        Déplacez la carte sur un massif, puis lancez une recherche.
      </p>
    </section>

    <div class="ski-compteur" aria-live="polite">
      <strong data-ski-compteur>—</strong>
      <span>stations dans la zone</span>
    </div>

    <section class="para-section ski-resultats" aria-labelledby="ski-resultats-titre">
      <div class="para-section-entete">
        <span>01</span>
        <h3 id="ski-resultats-titre">À proximité</h3>
      </div>
      <div class="ski-liste" data-ski-liste>
        <p class="ski-vide">Les stations trouvées apparaîtront ici.</p>
      </div>
    </section>

    <p class="ski-securite">
      Données cartographiques © OpenStreetMap. Les stations et leurs informations peuvent être incomplètes ;
      vérifiez les ouvertures et conditions auprès des sources officielles.
    </p>
  `;

  const statut = panneau.querySelector('.ski-statut');
  const message = panneau.querySelector('.para-statut-message');
  const actualiser = panneau.querySelector('.ski-actualiser');
  const compteur = panneau.querySelector('[data-ski-compteur]');
  const liste = panneau.querySelector('[data-ski-liste]');
  let actif = false;
  let controleur = null;
  let popupStation = null;
  let stations = [];
  let stationSelectionnee = null;
  let marqueursStations = [];
  let ecouteurCarte = false;

  function assurerCouches() {
    if (ecouteurCarte) return;
    map.on('moveend', actualiserMarqueurs);
    ecouteurCarte = true;
  }

  function afficherPopup(station, coordonnees) {
    const contenu = document.createElement('div');
    contenu.className = 'ski-popup';
    const titre = document.createElement('strong');
    titre.textContent = station.nom;
    contenu.appendChild(titre);
    if (station.ele) {
      const altitude = document.createElement('p');
      altitude.textContent = `Altitude : ${station.ele} m`;
      contenu.appendChild(altitude);
    }
    if (station.operateur) {
      const operateur = document.createElement('p');
      operateur.textContent = `Exploitant : ${station.operateur}`;
      contenu.appendChild(operateur);
    }
    if (station.site) {
      try {
        const url = new URL(station.site.startsWith('http') ? station.site : `https://${station.site}`);
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          const lien = document.createElement('a');
          lien.href = url.href;
          lien.target = '_blank';
          lien.rel = 'noopener noreferrer';
          lien.textContent = 'Site de la station ↗';
          contenu.appendChild(lien);
        }
      } catch {
        // Une URL OSM invalide n’empêche pas d’afficher les informations de la station.
      }
    }
    if (popupStation) popupStation.remove();
    const popup = new maplibregl.Popup({ offset: 12, closeButton: true, maxWidth: '280px' })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupStation = popup;
    popup.on('close', () => {
      if (popupStation !== popup) return;
      popupStation = null;
      if (stationSelectionnee) {
        stationSelectionnee = null;
        actualiserMarqueurs();
      }
    });
    stationSelectionnee = stations.find((feature) => feature.properties === station) || null;
    actualiserMarqueurs();
  }

  function retirerMarqueurs() {
    marqueursStations.forEach((marqueur) => marqueur.remove());
    marqueursStations = [];
  }

  function afficherGroupe(features, coordonnees) {
    if (map.getZoom() < 15) {
      map.easeTo({ center: coordonnees, zoom: Math.min(16, map.getZoom() + 2) });
      return;
    }

    const contenu = document.createElement('div');
    contenu.className = 'rando-groupe-liste ski-groupe-liste';
    const titre = document.createElement('strong');
    titre.className = 'rando-groupe-titre';
    titre.textContent = `${features.length} stations à proximité`;
    contenu.appendChild(titre);
    features.forEach((feature) => {
      const station = feature.properties;
      const choix = document.createElement('button');
      choix.type = 'button';
      choix.className = 'rando-groupe-choix ski-groupe-choix';
      choix.textContent = station.nom;
      choix.addEventListener('click', () => {
        if (popupStation) popupStation.remove();
        const point = feature.geometry.coordinates;
        map.flyTo({ center: point, zoom: Math.max(map.getZoom(), 13), duration: 700 });
        afficherPopup(station, point);
      });
      contenu.appendChild(choix);
    });

    if (popupStation) popupStation.remove();
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupStation = popup;
    popup.on('close', () => {
      if (popupStation === popup) popupStation = null;
    });
  }

  function creerRepere(feature) {
    const station = feature.properties;
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'rando-repere ski-repere';
    element.setAttribute('aria-label', `Afficher la station ${station.nom}`);
    element.title = station.nom;
    element.innerHTML =
      '<svg viewBox="0 0 48 56" aria-hidden="true"><path class="rando-repere-halo" d="M24 3 43 14v20L24 53 5 34V14z"/><path class="rando-repere-forme" d="M24 5 41 15v18L24 50 7 33V15z"/><path class="ski-repere-flocon" d="M24 15v17m-7-13 14 9m0-9-14 9m3-12 4 3 4-3m-8 18 4-3 4 3"/></svg>';
    const nom = document.createElement('span');
    nom.className = 'rando-repere-nom';
    nom.textContent = station.nom;
    element.appendChild(nom);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      afficherPopup(station, feature.geometry.coordinates);
    });
    return new maplibregl.Marker({ element, anchor: 'bottom' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);
  }

  function creerRepereGroupe(features, coordonnees) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'rando-groupe ski-groupe';
    element.setAttribute(
      'aria-label',
      `${features.length} stations regroupées. Touchez pour zoomer ou choisir une station.`
    );
    element.innerHTML =
      `<svg viewBox="0 0 56 56" aria-hidden="true"><path class="rando-groupe-halo" d="M28 2 52 16v24L28 54 4 40V16z"/><path class="rando-groupe-forme" d="M28 7 47 18v20L28 49 9 38V18z"/></svg><span>${features.length}</span>`;
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      afficherGroupe(features, coordonnees);
    });
    return new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(coordonnees)
      .addTo(map);
  }

  function actualiserMarqueurs() {
    retirerMarqueurs();
    if (!actif || !stations.length) return;

    const { clientWidth, clientHeight } = map.getContainer();
    const stationsAffichees = stationSelectionnee ? [stationSelectionnee] : stations;
    const visibles = stationsAffichees
      .map((feature) => ({ feature, pixel: map.project(feature.geometry.coordinates) }))
      .filter(({ pixel }) =>
        pixel.x >= 0 && pixel.x <= clientWidth && pixel.y >= 0 && pixel.y <= clientHeight);
    const parents = visibles.map((_, index) => index);
    const racine = (index) => {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };

    for (let i = 0; i < visibles.length; i++) {
      for (let j = i + 1; j < visibles.length; j++) {
        const dx = visibles[i].pixel.x - visibles[j].pixel.x;
        const dy = visibles[i].pixel.y - visibles[j].pixel.y;
        if (dx * dx + dy * dy <= DISTANCE_GROUPE_PX * DISTANCE_GROUPE_PX) {
          parents[racine(j)] = racine(i);
        }
      }
    }

    const groupes = new Map();
    visibles.forEach((entree, index) => {
      const id = racine(index);
      if (!groupes.has(id)) groupes.set(id, []);
      groupes.get(id).push(entree);
    });

    groupes.forEach((groupe) => {
      if (groupe.length === 1) {
        marqueursStations.push(creerRepere(groupe[0].feature));
        return;
      }
      const pixel = groupe.reduce(
        (centre, entree) => [centre[0] + entree.pixel.x / groupe.length, centre[1] + entree.pixel.y / groupe.length],
        [0, 0]
      );
      marqueursStations.push(
        creerRepereGroupe(groupe.map((entree) => entree.feature), map.unproject(pixel))
      );
    });
  }

  function rendreListe() {
    compteur.textContent = String(stations.length);
    if (!stations.length) {
      liste.innerHTML = '<p class="ski-vide">Aucune station référencée dans cette zone. Essayez une zone voisine ou la barre de recherche.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const feature of stations) {
      const station = feature.properties;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ski-station-ligne';
      const icone = document.createElement('span');
      icone.className = 'ski-station-icone';
      icone.setAttribute('aria-hidden', 'true');
      icone.textContent = '❄';
      const texte = document.createElement('span');
      texte.className = 'ski-station-texte';
      const nom = document.createElement('strong');
      nom.textContent = station.nom;
      const detail = document.createElement('small');
      detail.textContent = station.ele ? `Station de ski · ${station.ele} m` : 'Station de ski';
      texte.append(nom, detail);
      const fleche = document.createElement('span');
      fleche.className = 'ski-station-fleche';
      fleche.setAttribute('aria-hidden', 'true');
      fleche.textContent = '›';
      item.append(icone, texte, fleche);
      item.addEventListener('click', () => {
        const coordonnees = feature.geometry.coordinates;
        map.flyTo({ center: coordonnees, zoom: Math.max(map.getZoom(), 13), duration: 900 });
        afficherPopup(station, coordonnees);
      });
      fragment.appendChild(item);
    }
    liste.replaceChildren(fragment);
  }

  async function rechercherZone() {
    if (!actif) return;
    if (map.getZoom() < ZOOM_MIN) {
      statut.dataset.etat = 'erreur';
      message.textContent = 'Zoomez davantage sur un massif pour rechercher ses stations.';
      return;
    }

    if (controleur) controleur.abort();
    const nouveauControleur = new AbortController();
    controleur = nouveauControleur;
    const bornes = map.getBounds();
    const sud = Math.max(-85, bornes.getSouth()).toFixed(5);
    const ouest = Math.max(-180, bornes.getWest()).toFixed(5);
    const nord = Math.min(85, bornes.getNorth()).toFixed(5);
    const est = Math.min(180, bornes.getEast()).toFixed(5);
    const requete =
      `[out:json][timeout:25];(nwr["leisure"="ski_resort"](${sud},${ouest},${nord},${est});` +
      `nwr["landuse"="winter_sports"](${sud},${ouest},${nord},${est});` +
      `nwr["site"="piste"](${sud},${ouest},${nord},${est}););out tags center;`;
    actualiser.disabled = true;
    actualiser.textContent = 'Recherche…';
    statut.dataset.etat = 'chargement';
    statut.setAttribute('aria-busy', 'true');
    message.textContent = 'Recherche des stations dans la zone affichée…';
    stationSelectionnee = null;
    if (popupStation) popupStation.remove();
    stations = [];
    retirerMarqueurs();
    compteur.textContent = '0';
    rendreListe();

    try {
      const elements = await interrogerOverpass(requete, nouveauControleur.signal);
      if (!actif || controleur !== nouveauControleur) return;
      const donnees = geojsonStations(elements, bornes);
      stations = donnees.features;
      assurerCouches();
      rendreListe();
      actualiserMarqueurs();
      statut.dataset.etat = 'ok';
      message.textContent = stations.length
        ? `${stations.length} station${stations.length > 1 ? 's' : ''} repérée${stations.length > 1 ? 's' : ''} dans la zone affichée.`
        : 'Aucune station trouvée dans cette zone. Vous pouvez essayer une zone voisine.';
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
      if (controleur !== nouveauControleur) return;
      statut.dataset.etat = 'erreur';
      message.textContent = 'Le service cartographique ne répond pas. Réessayez dans quelques instants.';
      console.warn('Recherche de stations de ski :', erreur);
    } finally {
      if (controleur !== nouveauControleur) return;
      actualiser.disabled = false;
      actualiser.textContent = 'Rechercher dans cette zone';
      statut.setAttribute('aria-busy', 'false');
    }
  }

  actualiser.addEventListener('click', rechercherZone);

  return {
    id: 'ski',
    label: 'Ski',
    icone: 'ski',
    panneau,
    activer() {
      actif = true;
      assurerCouches();
    },
    desactiver() {
      actif = false;
      if (controleur) controleur.abort();
      stationSelectionnee = null;
      if (popupStation) popupStation.remove();
      retirerMarqueurs();
      stations = [];
      compteur.textContent = '—';
      liste.innerHTML = '<p class="ski-vide">Les stations trouvées apparaîtront ici.</p>';
      actualiser.disabled = false;
      actualiser.textContent = 'Rechercher dans cette zone';
      statut.dataset.etat = 'attente';
      statut.setAttribute('aria-busy', 'false');
      message.textContent = 'Déplacez la carte sur un massif, puis lancez une recherche.';
    },
  };
}
