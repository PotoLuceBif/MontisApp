import * as maplibregl from 'maplibre-gl';

// À ajuster quand la clé API FFVL arrivera (adresses et format exacts à confirmer)
const URL_BALISES = '/ffvl/json/balises.json';
const URL_RELEVES = '/ffvl/json/relevesmeteo.json';
const URL_SITES = '/ffvl/json/sites.json';

const couleurVent = (v) =>
  v < 10 ? '#2e9e4f' : v < 20 ? '#e6a800' : v < 30 ? '#f07a00' : '#d62828';

const sansAccent = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function charger(url) {
  const rep = await fetch(url);
  const texte = await rep.text();
  if (!rep.ok) throw new Error(`${url} : erreur ${rep.status} – ${texte.slice(0, 200)}`);
  let data;
  try {
    data = JSON.parse(texte);
  } catch {
    throw new Error(`${url} : réponse non JSON : ${texte.slice(0, 300)}`);
  }
  return Array.isArray(data) ? data : Object.values(data);
}

function sitesEnGeoJSON(sites) {
  const features = [];
  for (const s of sites) {
    if (!(s.pratiques || '').split(';').includes('parapente')) continue;
    const type = sansAccent(s.site_sous_type);
    const genre = type.includes('atterr') ? 'atterrissage' : type.includes('decol') ? 'decollage' : null;
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);
    if (!genre || isNaN(lat) || isNaN(lon)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        genre,
        nom: s.nom,
        sous_nom: s.sous_nom,
        alt: s.alt,
        orientation: s.orientation,
        vent_favo: s.vent_favo,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function initParapente(map) {
  let marqueurs = [];
  let balisesVisibles = false;
  let sitesVisibles = false;
  const couchesSites = ['decollages', 'atterrissages', 'sites-noms'];

  // ---------- Décollages et atterrissages ----------
  charger(URL_SITES)
    .then((sites) => {
      map.addSource('sites', { type: 'geojson', data: sitesEnGeoJSON(sites) });

      const rayon = ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 8];
      map.addLayer({
        id: 'decollages',
        type: 'circle',
        source: 'sites',
        filter: ['==', ['get', 'genre'], 'decollage'],
        paint: {
          'circle-radius': rayon,
          'circle-color': '#2e9e4f',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'atterrissages',
        type: 'circle',
        source: 'sites',
        filter: ['==', ['get', 'genre'], 'atterrissage'],
        paint: {
          'circle-radius': rayon,
          'circle-color': '#1f6fd1',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });
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

      for (const id of ['decollages', 'atterrissages']) {
        map.on('click', id, (e) => {
          const f = e.features[0];
          const p = f.properties;
          const titre = id === 'decollages' ? 'Décollage' : 'Atterrissage';
          new maplibregl.Popup({ offset: 10 })
            .setLngLat(f.geometry.coordinates)
            .setHTML(
              `<strong>${esc(p.nom)}</strong><br>${esc(titre)}${p.sous_nom ? ' – ' + esc(p.sous_nom) : ''}` +
                `<br>Altitude : ${esc(p.alt)} m` +
                (p.orientation ? `<br>Orientation : ${esc(p.orientation)}` : '') +
                (p.vent_favo ? `<br>Vent favorable : ${esc(p.vent_favo)}` : '')
            )
            .addTo(map);
        });
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
      majVisibilite();
    })
    .catch((err) => console.warn('FFVL sites :', err));

  // ---------- Balises de vent ----------
  async function chargerBalises() {
    const [balises, releves] = await Promise.all([charger(URL_BALISES), charger(URL_RELEVES)]);
    const parId = new Map(releves.map((r) => [String(r.idbalise), r]));

    marqueurs.forEach((m) => m.remove());
    marqueurs = [];

    for (const b of balises) {
      const r = parId.get(String(b.idBalise));
      const lat = parseFloat(b.latitude);
      const lon = parseFloat(b.longitude);
      if (!r || isNaN(lat) || isNaN(lon)) continue;

      const moy = Number(r.vitesseVentMoy);
      const max = Number(r.vitesseVentMax);
      const dir = Number(r.directVentMoy);
      const ageH = (Date.now() - new Date(String(r.date).replace(' ', 'T')).getTime()) / 3600000;
      const perime = isNaN(ageH) || ageH > 2; // relevé de plus de 2 h : grisé
      const couleur = perime ? '#999' : couleurVent(moy);

      const el = document.createElement('div');
      el.className = 'balise' + (perime ? ' balise-perimee' : '');
      el.innerHTML =
        `<svg viewBox="0 0 24 24" style="transform:rotate(${(dir + 180) % 360}deg)">` +
        `<path d="M12 2 L19 21 L12 17 L5 21 Z" fill="${couleur}" stroke="#fff" stroke-width="1.5"/></svg>` +
        `<span>${isNaN(moy) ? '?' : Math.round(moy)}</span>`;

      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${esc(b.nom)}</strong><br>Altitude : ${esc(b.altitude)} m` +
          `<br>Vent moyen : ${esc(moy)} km/h (rafales ${esc(max)} km/h)` +
          `<br>Direction : ${esc(dir)}° (vent venant de cette direction)` +
          (r.temperature != null ? `<br>Température : ${esc(r.temperature)} °C` : '') +
          `<br><small>Relevé : ${esc(r.date)}${perime ? ' – ANCIEN' : ''}</small>`
      );

      const m = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).setPopup(popup).addTo(map);
      marqueurs.push(m);
    }
    majVisibilite();
  }

  chargerBalises().catch((err) => console.warn('FFVL balises :', err));
  setInterval(
    () => chargerBalises().catch((err) => console.warn('FFVL balises :', err)),
    5 * 60 * 1000
  );

  // ---------- Afficher / masquer ----------
  function majVisibilite() {
    couchesSites.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', sitesVisibles ? 'visible' : 'none');
    });
    marqueurs.forEach((m) => (m.getElement().style.display = balisesVisibles ? '' : 'none'));
  }

  return {
    setBalises(v) {
      balisesVisibles = v;
      majVisibilite();
    },
    setSites(v) {
      sitesVisibles = v;
      majVisibilite();
    },
  };
}