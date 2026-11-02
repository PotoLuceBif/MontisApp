// Balises de vent sur la carte : une couche de symboles plutôt qu'un marqueur par station,
// car les réseaux comptent des centaines de balises. La carte écarte celles qui se chevauchent.
import { Popup } from 'maplibre-gl';
import { PALETTE_CARTE, cadranVent, couleurInterface, palierVent, texteProvenance } from './vent-cadran.js';

const SOURCE = 'balises-vent';
const COUCHE = 'balises-vent-symboles';
const AGE_ANCIEN = 2 * 60 * 60 * 1000; // grisée au-delà
const AGE_MAX = 24 * 60 * 60 * 1000; // masquée au-delà : la station ne répond plus
const COULEUR_ANCIENNE = '#a7b0bb';
const TOLERANCE_CLIC = 14;
const DUREE_CACHE_HISTORIQUE = 5 * 60 * 1000;
const POINTS_DIRECTION = 5;
const MARGE_HAUT_FICHE = 76; // hauteur de la barre de recherche et des boutons

const estAncienne = (station) => Date.now() - station.date > AGE_ANCIEN;

export function texteAge(date) {
  const minutes = Math.max(0, Math.round((Date.now() - date) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

function dessinerIcone(couleur) {
  const taille = 64;
  const canvas = document.createElement('canvas');
  canvas.width = taille;
  canvas.height = taille;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const fleche = new Path2D('M16 3 26 20 18.5 17.5V29H13.5V17.5L6 20Z');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(8, 12, 24, .85)';
  ctx.stroke(fleche);
  ctx.fillStyle = couleur;
  ctx.fill(fleche);
  return ctx.getImageData(0, 0, taille, taille);
}

const heureCourte = (date) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date).replace(':', 'h');

// Bande entre le minimum et les rafales, trait pour le vent moyen, puis le cap à intervalles réguliers
function graphiqueHistorique(points) {
  const largeur = 240;
  const hauteur = 58;
  const debut = points[0].date;
  const duree = points.at(-1).date - debut || 1;
  const maximum = Math.max(10, ...points.map(({ rafale, moyenne }) => (Number.isFinite(rafale) ? rafale : moyenne)));
  const x = (date) => (((date - debut) / duree) * largeur).toFixed(1);
  const y = (valeur) => (hauteur - 2 - (valeur / maximum) * (hauteur - 6)).toFixed(1);
  const haut = points.map(({ date, rafale, moyenne }) => `${x(date)},${y(Number.isFinite(rafale) ? rafale : moyenne)}`);
  const bas = points.map(({ date, minimum, moyenne }) => `${x(date)},${y(Number.isFinite(minimum) ? minimum : moyenne)}`).reverse();
  const ligne = points.map(({ date, moyenne }) => `${x(date)},${y(moyenne)}`).join(' ');
  const reperes = Array.from({ length: POINTS_DIRECTION }, (_, index) =>
    points[Math.round((index * (points.length - 1)) / (POINTS_DIRECTION - 1))]);
  return `
    <svg class="balise-graphique" viewBox="0 0 ${largeur} ${hauteur}" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${[...haut, ...bas].join(' ')}"/>
      <polyline points="${ligne}" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="balise-reperes">
      ${reperes.map(({ date, direction }) => `<span>${Number.isFinite(direction)
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 15 13.5 13V21H10.5V13L5 15Z" transform="rotate(${(direction + 180) % 360} 12 12)"/></svg>`
    : ''}${heureCourte(date)}</span>`).join('')}
    </div>
    <p class="balise-historique-echelle">Jusqu’à ${Math.round(maximum)} km/h · la bande va du vent minimum aux rafales</p>`;
}

export function creerCoucheBalises(map, { peutOuvrir = () => true } = {}) {
  let stations = [];
  let source = null;
  let visible = false;
  let popup = null;
  let controleurHistorique = null;
  const cacheHistorique = new Map();

  function assurerImages() {
    [...PALETTE_CARTE, COULEUR_ANCIENNE].forEach((couleur, index) => {
      const id = `balise-fleche-${index}`;
      if (!map.hasImage(id)) map.addImage(id, dessinerIcone(couleur), { pixelRatio: 2 });
    });
  }

  function donnees() {
    return {
      type: 'FeatureCollection',
      features: stations.map((station) => {
        const ancienne = estAncienne(station);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: {
            id: station.id,
            icone: `balise-fleche-${ancienne ? PALETTE_CARTE.length : palierVent(station.moyenne)}`,
            cap: (station.direction + 180) % 360, // la flèche pointe où va le vent
            texte: String(Math.round(station.moyenne)),
            ordre: ancienne ? 1 : 0, // en cas de chevauchement, les relevés récents d'abord
          },
        };
      }),
    };
  }

  function retirerCouche() {
    if (map.getLayer(COUCHE)) map.removeLayer(COUCHE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  function assurerCouche() {
    if (!source) return;
    if (!map.getSource(SOURCE)) {
      assurerImages();
      map.addSource(SOURCE, { type: 'geojson', data: donnees(), attribution: source.attribution });
    }
    if (!map.getLayer(COUCHE)) {
      map.addLayer({
        id: COUCHE,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'icon-image': ['get', 'icone'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.62, 10, 1],
          'icon-rotate': ['get', 'cap'],
          'icon-rotation-alignment': 'map',
          'icon-padding': 1,
          'symbol-sort-key': ['get', 'ordre'],
          'text-field': ['get', 'texte'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12,
          'text-anchor': 'top',
          'text-offset': [0, 1.15],
          'text-optional': true,
        },
        paint: { 'text-color': '#101626', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
      });
    }
    map.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
  }

  // La fiche est haute : on décale la carte pour qu'elle ne passe pas sous les boutons
  function garderFicheVisible() {
    const element = popup?.getElement();
    if (!element) return;
    const cadre = element.getBoundingClientRect();
    const zone = map.getContainer().getBoundingClientRect();
    const depassement = cadre.top - zone.top - MARGE_HAUT_FICHE;
    if (depassement < 0) map.panBy([0, depassement]);
  }

  async function chargerHistorique(station, conteneur) {
    controleurHistorique?.abort();
    if (!source?.historique) {
      conteneur.remove();
      return;
    }
    const memoire = cacheHistorique.get(station.id);
    let points = memoire && Date.now() - memoire.recu < DUREE_CACHE_HISTORIQUE ? memoire.points : null;
    if (!points) {
      const requete = new AbortController();
      controleurHistorique = requete;
      conteneur.innerHTML = '<p class="balise-historique-etat">Chargement de l’évolution…</p>';
      try {
        points = await source.historique(station.id, requete.signal);
        cacheHistorique.set(station.id, { points, recu: Date.now() });
      } catch (erreur) {
        if (requete.signal.aborted) return;
        console.warn('Historique de balise :', erreur);
        conteneur.innerHTML = '<p class="balise-historique-etat">Évolution indisponible pour le moment.</p>';
        return;
      }
      if (requete.signal.aborted) return;
    }
    conteneur.innerHTML = points.length >= 2
      ? `<strong>3 dernières heures</strong>${graphiqueHistorique(points)}`
      : '<p class="balise-historique-etat">Pas de relevé sur les 3 dernières heures.</p>';
    garderFicheVisible();
  }

  function ouvrir(id) {
    const station = stations.find((candidate) => candidate.id === id);
    if (!station) return;
    const contenu = document.createElement('div');
    contenu.className = 'vent-carte-popup balise-popup';
    contenu.style.setProperty('--vent-couleur', couleurInterface(station.moyenne));

    const titre = document.createElement('strong');
    titre.textContent = station.nom;
    const direction = document.createElement('div');
    direction.className = 'vent-carte-popup-direction';
    direction.innerHTML = `${cadranVent((station.direction + 180) % 360, 0, 'vent-cadran-moyen')}<div><strong>${Math.round(station.moyenne)} km/h</strong><small>${texteProvenance(station.direction)}</small></div>`;
    const valeurs = document.createElement('p');
    const details = [];
    if (Number.isFinite(station.rafale)) details.push(`Rafales ${Math.round(station.rafale)} km/h`);
    if (Number.isFinite(station.minimum)) details.push(`min. ${Math.round(station.minimum)} km/h`);
    valeurs.textContent = details.join(' · ');
    const releve = document.createElement('p');
    releve.className = estAncienne(station) ? 'balise-releve balise-releve-ancien' : 'balise-releve';
    releve.textContent = `Relevé ${texteAge(station.date)}`
      + (Number.isFinite(station.altitude) ? ` · ${Math.round(station.altitude)} m` : '')
      + (estAncienne(station) ? ' · ancien' : '');
    contenu.append(titre, direction, valeurs, releve);

    const historique = document.createElement('div');
    historique.className = 'balise-historique';
    contenu.append(historique);
    if (station.description) {
      const description = document.createElement('p');
      description.className = 'balise-description';
      description.textContent = station.description;
      contenu.append(description);
    }
    const pied = document.createElement('p');
    pied.className = 'balise-source';
    const lien = document.createElement('a');
    lien.href = station.lien || source.lien;
    lien.target = '_blank';
    lien.rel = 'noopener noreferrer';
    lien.textContent = `${source.libelle} ↗`;
    pied.append('Relevé indicatif · ', lien);
    contenu.append(pied);

    popup?.remove();
    popup = new Popup({ offset: 18, maxWidth: '290px' })
      .setLngLat([station.lon, station.lat])
      .setDOMContent(contenu)
      .addTo(map);
    popup.on('close', () => controleurHistorique?.abort());
    garderFicheVisible();
    void chargerHistorique(station, historique);
  }

  // Un clic général et une tolérance : au doigt, viser une petite flèche est difficile
  map.on('click', (event) => {
    if (!visible || !map.getLayer(COUCHE) || !peutOuvrir()) return;
    const { x, y } = event.point;
    const [trouve] = map.queryRenderedFeatures(
      [[x - TOLERANCE_CLIC, y - TOLERANCE_CLIC], [x + TOLERANCE_CLIC, y + TOLERANCE_CLIC]],
      { layers: [COUCHE] }
    );
    if (trouve) ouvrir(trouve.properties.id);
  });
  map.on('mousemove', (event) => {
    if (!visible || !map.getLayer(COUCHE)) return;
    const survol = map.queryRenderedFeatures(event.point, { layers: [COUCHE] }).length > 0;
    if (survol) map.getCanvas().style.cursor = 'pointer';
    else if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
  });
  map.on('style.load', assurerCouche);

  return {
    // `nouvelleSource` : l'attribution de la carte suit la source affichée
    definir(nouvellesStations, nouvelleSource) {
      stations = nouvellesStations.filter((station) => Date.now() - station.date <= AGE_MAX);
      if (nouvelleSource !== source) {
        retirerCouche();
        source = nouvelleSource;
        cacheHistorique.clear();
        popup?.remove();
      }
      assurerCouche();
      map.getSource(SOURCE)?.setData(donnees());
      return { total: stations.length, anciennes: stations.filter(estAncienne).length };
    },
    definirVisible(valeur) {
      visible = valeur;
      if (map.getLayer(COUCHE)) map.setLayoutProperty(COUCHE, 'visibility', valeur ? 'visible' : 'none');
      if (!valeur) popup?.remove();
    },
    // Les relevés récents de la zone visible, du centre vers les bords
    proches(limite) {
      const limites = map.getBounds();
      const { lng, lat } = map.getCenter();
      const kLng = Math.cos((lat * Math.PI) / 180);
      return stations
        .filter((station) => !estAncienne(station) && limites.contains([station.lon, station.lat]))
        .map((station) => ({ station, ecart: Math.hypot((station.lon - lng) * kLng, station.lat - lat) }))
        .sort((a, b) => a.ecart - b.ecart)
        .slice(0, limite)
        .map(({ station }) => station);
    },
    centrerSur(id) {
      const station = stations.find((candidate) => candidate.id === id);
      if (!station) return;
      map.once('moveend', () => ouvrir(id));
      map.flyTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 11) });
    },
  };
}
