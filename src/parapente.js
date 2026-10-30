import * as maplibregl from 'maplibre-gl';

const URL_BALISES = '/ffvl/json/balises.json';
const URL_RELEVES = '/ffvl/json/relevesmeteo.json';
const URL_SITES = '/ffvl/json/sites.json';
const INTERVALLE_ACTUALISATION = 5 * 60 * 1000;

const couleurVent = (v) =>
  !Number.isFinite(v) ? '#66717a' : v < 10 ? '#2e9e4f' : v < 20 ? '#e6a800' : v < 30 ? '#f07a00' : '#d62828';

const nombre = (valeur) =>
  valeur == null || String(valeur).trim() === '' ? Number.NaN : Number(valeur);

const sansAccent = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function erreurFFVL(message, code) {
  const erreur = new Error(message);
  erreur.code = code;
  return erreur;
}

async function charger(url, signal) {
  const rep = await fetch(url, { signal, cache: 'no-store' });
  const texte = await rep.text();
  if (
    rep.status === 401 ||
    rep.status === 403 ||
    /available using an ffvl api key|clé api|api key/i.test(texte)
  ) {
    throw erreurFFVL('L’accès aux données nécessite une clé API FFVL.', 'acces');
  }
  if (!rep.ok) throw new Error(`${url} : erreur HTTP ${rep.status} – ${texte.slice(0, 200)}`);

  let donnees;
  try {
    donnees = JSON.parse(texte);
  } catch {
    throw new Error(`${url} : réponse non JSON : ${texte.slice(0, 200)}`);
  }

  if (Array.isArray(donnees)) return donnees;
  if (donnees && typeof donnees === 'object') return Object.values(donnees);
  throw new Error(`${url} : format de données FFVL inattendu.`);
}

function sitesEnGeoJSON(sites) {
  const features = [];
  for (const site of sites) {
    if (!site || typeof site !== 'object') continue;
    const pratiques = typeof site.pratiques === 'string' ? site.pratiques.split(';') : [];
    if (!pratiques.some((pratique) => sansAccent(pratique.trim()) === 'parapente')) continue;
    const type = sansAccent(site.site_sous_type);
    const genre = type.includes('atterr') ? 'atterrissage' : type.includes('decol') ? 'decollage' : null;
    const lat = nombre(site.lat);
    const lon = nombre(site.lon);
    if (
      !genre ||
      !Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lon) || lon < -180 || lon > 180
    ) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        genre,
        nom: site.nom,
        sous_nom: site.sous_nom,
        alt: site.alt,
        orientation: site.orientation,
        vent_favo: site.vent_favo,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function initParapente(map, { onEtat = () => {}, onStatistiques = () => {} } = {}) {
  let marqueurs = [];
  let balisesVisibles = false;
  let sitesVisibles = false;
  let actif = false;
  let minuteur = null;
  let controleur = null;
  let actualisation = null;
  let nombreSites = 0;
  let nombreBalises = 0;
  let nombrePerimees = 0;
  let donneesDejaChargees = false;
  const couchesSites = ['decollages', 'atterrissages', 'sites-noms'];

  function publierStatistiques() {
    onStatistiques({ sites: nombreSites, balises: nombreBalises, perimees: nombrePerimees });
  }

  function majVisibilite() {
    couchesSites.forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', sitesVisibles ? 'visible' : 'none');
      }
    });
    marqueurs.forEach((marqueur) => {
      marqueur.getElement().style.display = balisesVisibles ? '' : 'none';
    });
  }

  function assurerCouchesSites(geojson) {
    if (!map.getSource('sites')) {
      map.addSource('sites', { type: 'geojson', data: geojson });
    } else {
      map.getSource('sites').setData(geojson);
    }

    const rayon = ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8];
    for (const [id, genre, couleur] of [
      ['decollages', 'decollage', '#2e9e4f'],
      ['atterrissages', 'atterrissage', '#1f6fd1'],
    ]) {
      if (!map.getLayer(id)) {
        map.addLayer({
          id,
          type: 'circle',
          source: 'sites',
          filter: ['==', ['get', 'genre'], genre],
          paint: {
            'circle-radius': rayon,
            'circle-color': couleur,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
          },
        });
        map.on('click', id, (event) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const properties = feature.properties;
          const titre = id === 'decollages' ? 'Décollage' : 'Atterrissage';
          new maplibregl.Popup({ offset: 10 })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(
              `<strong>${esc(properties.nom)}</strong><br>${esc(titre)}` +
                (properties.sous_nom ? ` – ${esc(properties.sous_nom)}` : '') +
                `<br>Altitude : ${esc(properties.alt)} m` +
                (properties.orientation ? `<br>Orientation : ${esc(properties.orientation)}` : '') +
                (properties.vent_favo ? `<br>Vent favorable : ${esc(properties.vent_favo)}` : '')
            )
            .addTo(map);
        });
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    }

    if (!map.getLayer('sites-noms')) {
      map.addLayer({
        id: 'sites-noms',
        type: 'symbol',
        source: 'sites',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'nom'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 0.9],
        },
        paint: { 'text-color': '#222', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      });
    }
    nombreSites = geojson.features.length;
    donneesDejaChargees = true;
    majVisibilite();
    publierStatistiques();
  }

  async function chargerSites(signal) {
    const sites = await charger(URL_SITES, signal);
    assurerCouchesSites(sitesEnGeoJSON(sites));
  }

  async function chargerBalises(signal) {
    const [balises, releves] = await Promise.all([
      charger(URL_BALISES, signal),
      charger(URL_RELEVES, signal),
    ]);
    const parId = new Map(
      releves
        .filter((releve) => releve && typeof releve === 'object' && releve.idbalise != null)
        .map((releve) => [String(releve.idbalise), releve])
    );
    const nouveauxMarqueurs = [];
    let perimees = 0;

    for (const balise of balises) {
      if (!balise || typeof balise !== 'object') continue;
      const releve = parId.get(String(balise.idBalise));
      const lat = nombre(balise.latitude);
      const lon = nombre(balise.longitude);
      if (!releve || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
        continue;
      }

      const moyenne = nombre(releve.vitesseVentMoy);
      const maximum = nombre(releve.vitesseVentMax);
      const direction = nombre(releve.directVentMoy);
      const date = String(releve.date ?? '');
      const ageHeures = (Date.now() - new Date(date.replace(' ', 'T')).getTime()) / 3600000;
      const perime = !Number.isFinite(ageHeures) || ageHeures > 2 || ageHeures < -1;
      if (perime) perimees++;
      const couleur = perime ? '#999' : couleurVent(moyenne);
      const directionValide = Number.isFinite(direction) ? direction : 0;

      const element = document.createElement('div');
      element.className = `balise${perime ? ' balise-perimee' : ''}`;
      element.setAttribute('aria-label', `${balise.nom || 'Balise FFVL'} : ${Number.isFinite(moyenne) ? `${Math.round(moyenne)} km/h` : 'vent indisponible'}`);
      element.innerHTML =
        `<svg viewBox="0 0 24 24" style="transform:rotate(${(directionValide + 180) % 360}deg)">` +
        `<path d="M12 2 L19 21 L12 17 L5 21 Z" fill="${couleur}" stroke="#fff" stroke-width="1.5"/></svg>` +
        `<span>${Number.isFinite(moyenne) ? Math.round(moyenne) : '?'}</span>`;

      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(balise.nom)}</strong><br>Altitude : ${esc(balise.altitude)} m` +
          `<br>Vent moyen : ${esc(Number.isFinite(moyenne) ? `${Math.round(moyenne)} km/h` : 'indisponible')}` +
          `<br>Rafales : ${esc(Number.isFinite(maximum) ? `${Math.round(maximum)} km/h` : 'indisponibles')}` +
          `<br>Direction : ${esc(Number.isFinite(direction) ? `${Math.round(direction)}° (vent venant de cette direction)` : 'indisponible')}` +
          (releve.temperature != null ? `<br>Température : ${esc(releve.temperature)} °C` : '') +
          `<br><small>Relevé : ${esc(date || 'date inconnue')}${perime ? ' – ancien' : ''}</small>`
      );

      nouveauxMarqueurs.push(
        new maplibregl.Marker({ element })
          .setLngLat([lon, lat])
          .setPopup(popup)
      );
    }

    marqueurs.forEach((marqueur) => marqueur.remove());
    marqueurs = nouveauxMarqueurs;
    marqueurs.forEach((marqueur) => marqueur.addTo(map));
    nombreBalises = marqueurs.length;
    nombrePerimees = perimees;
    donneesDejaChargees = true;
    majVisibilite();
    publierStatistiques();
  }

  async function actualiser() {
    if (!actif || actualisation) return actualisation;

    controleur = new AbortController();
    const { signal } = controleur;
    onEtat({ type: 'chargement', message: 'Actualisation des sites et des relevés météo…' });

    actualisation = (async () => {
      const resultats = await Promise.allSettled([chargerSites(signal), chargerBalises(signal)]);
      if (!actif || signal.aborted) return;

      const erreurs = resultats
        .filter((resultat) => resultat.status === 'rejected')
        .map((resultat) => resultat.reason);
      const reussites = resultats.length - erreurs.length;
      const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());

      if (erreurs.length === 0) {
        onEtat({
          type: 'ok',
          message: `Mis à jour à ${heure} · ${nombreSites} sites, ${nombreBalises} balises.`,
        });
        return;
      }

      if (reussites > 0) {
        onEtat({
          type: 'partiel',
          message: `Mise à jour partielle à ${heure}. ${erreurs[0].message}`,
        });
      } else if (erreurs.some((erreur) => erreur.code === 'acces')) {
        onEtat({
          type: 'acces',
          message: donneesDejaChargees
            ? 'La FFVL exige une clé API et les demandes d’accès OpenData sont temporairement suspendues. Les dernières données reçues restent visibles et peuvent être périmées.'
            : 'La FFVL exige une clé API. La Fédération indique que les demandes d’accès OpenData sont temporairement suspendues.',
        });
      } else {
        onEtat({
          type: 'erreur',
          message: donneesDejaChargees
            ? `Impossible d’actualiser les données FFVL. Les dernières données reçues restent visibles et peuvent être périmées. ${erreurs[0].message}`
            : `Impossible de charger les données FFVL. ${erreurs[0].message}`,
        });
      }
    })();

    try {
      await actualisation;
    } finally {
      actualisation = null;
      controleur = null;
    }
  }

  function demarrer() {
    if (actif) return;
    actif = true;
    actualiser();
    minuteur = setInterval(actualiser, INTERVALLE_ACTUALISATION);
  }

  function arreter() {
    actif = false;
    if (minuteur !== null) clearInterval(minuteur);
    minuteur = null;
    controleur?.abort();
    controleur = null;
    majVisibilite();
  }

  return {
    actualiser,
    demarrer,
    arreter,
    setBalises(visible) {
      balisesVisibles = visible;
      majVisibilite();
    },
    setSites(visible) {
      sitesVisibles = visible;
      majVisibilite();
    },
  };
}
