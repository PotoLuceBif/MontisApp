import * as maplibregl from 'maplibre-gl';

const SERVEURS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ZOOM_MIN = 7.5;
const SOURCE_STATIONS = 'ski-stations';
const VIDE = { type: 'FeatureCollection', features: [] };

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

function geojsonStations(elements) {
  const stations = [];
  const vus = new Map();
  for (const element of elements) {
    const tags = element.tags || {};
    if (tags.leisure !== 'ski_resort' && tags.landuse !== 'winter_sports') continue;
    const nom = String(tags.name || tags['name:fr'] || '').trim();
    const coordonnees = centreElement(element);
    if (!nom || !coordonnees || !coordonnees.every(Number.isFinite)) continue;

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
    const delai = setTimeout(() => controleur.abort(), 7000);
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
      derniereErreur = erreur.name === 'AbortError' ? new Error('Délai de réponse dépassé.') : erreur;
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

  function assurerCouches() {
    if (!map.getSource(SOURCE_STATIONS)) {
      map.addSource(SOURCE_STATIONS, {
        type: 'geojson',
        data: VIDE,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 10,
      });
      map.addLayer({
        id: 'ski-stations-clusters',
        type: 'circle',
        source: SOURCE_STATIONS,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#132535',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 30, 27],
          'circle-stroke-color': '#ff59d6',
          'circle-stroke-width': 2,
          'circle-blur': 0.12,
        },
      });
      map.addLayer({
        id: 'ski-stations-nombres',
        type: 'symbol',
        source: SOURCE_STATIONS,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#4debd4', 'text-halo-color': '#08111b', 'text-halo-width': 1 },
      });
      map.addLayer({
        id: 'ski-stations-points',
        type: 'circle',
        source: SOURCE_STATIONS,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#4debd4',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 8],
          'circle-stroke-color': '#ff59d6',
          'circle-stroke-width': 2,
          'circle-blur': 0.08,
        },
      });
      map.addLayer({
        id: 'ski-stations-noms',
        type: 'symbol',
        source: SOURCE_STATIONS,
        filter: ['!', ['has', 'point_count']],
        minzoom: 9,
        layout: {
          'text-field': ['get', 'nom'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#e6f7ff',
          'text-halo-color': '#09131e',
          'text-halo-width': 1.5,
        },
      });

      map.on('click', 'ski-stations-clusters', (event) => {
        const feature = event.features?.[0];
        const source = map.getSource(SOURCE_STATIONS);
        if (!feature || !source) return;
        source
          .getClusterExpansionZoom(Number(feature.properties.cluster_id))
          .then((zoom) => map.easeTo({ center: feature.geometry.coordinates, zoom }))
          .catch((erreur) => console.warn('Zoom du groupe de stations :', erreur));
      });
      map.on('click', 'ski-stations-points', afficherStationCarte);
      for (const id of ['ski-stations-clusters', 'ski-stations-points']) {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
    }
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
      if (popupStation === popup) popupStation = null;
    });
  }

  function afficherStationCarte(event) {
    const feature = event.features?.[0];
    if (!feature) return;
    afficherPopup(feature.properties, feature.geometry.coordinates);
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
        map.flyTo({ center: coordonnees, zoom: Math.max(map.getZoom(), 12), duration: 900 });
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
      `nwr["landuse"="winter_sports"](${sud},${ouest},${nord},${est}););out center tags 80;`;
    actualiser.disabled = true;
    actualiser.textContent = 'Recherche…';
    statut.dataset.etat = 'chargement';
    statut.setAttribute('aria-busy', 'true');
    message.textContent = 'Recherche des stations dans la zone affichée…';

    try {
      const elements = await interrogerOverpass(requete, nouveauControleur.signal);
      if (!actif) return;
      const donnees = geojsonStations(elements);
      if (popupStation) popupStation.remove();
      stations = donnees.features;
      assurerCouches();
      map.getSource(SOURCE_STATIONS).setData(donnees);
      rendreListe();
      statut.dataset.etat = 'ok';
      message.textContent = stations.length
        ? `${stations.length} station${stations.length > 1 ? 's' : ''} repérée${stations.length > 1 ? 's' : ''} dans la zone affichée.`
        : 'Aucune station trouvée dans cette zone. Vous pouvez essayer une zone voisine.';
    } catch (erreur) {
      if (erreur.name === 'AbortError') return;
      if (controleur !== nouveauControleur) return;
      statut.dataset.etat = 'erreur';
      message.textContent = 'Recherche indisponible. Vérifiez votre connexion et réessayez.';
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
      if (popupStation) popupStation.remove();
      if (map.getSource(SOURCE_STATIONS)) map.getSource(SOURCE_STATIONS).setData(VIDE);
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
