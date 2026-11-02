// Balises de vent sur la carte : une pastille avec la vitesse, et une manche à air qui en sort
// dans le sens du vent. Deux couches de symboles, car la pastille reste droite quand la manche
// tourne ; on écarte nous-mêmes les balises trop proches pour que les deux restent appariées.
import { creerFicheBalise } from './balise-fiche.js';
import {
  COULEUR_BALISE_INACTIVE,
  PALETTE_BALISES,
  etatStation,
  palierBalise,
  rafaleMarquee,
} from './balises-sources.js';

const SOURCE = 'balises-vent';
const COUCHE_SELECTION = 'balises-vent-selection';
const COUCHE_MANCHE = 'balises-vent-manches';
const COUCHE_PASTILLE = 'balises-vent-pastilles';
const COUCHES_CLIC = [COUCHE_PASTILLE, COUCHE_MANCHE];
const TOLERANCE_CLIC = 12;
const CELLULE_ECART = 46; // px : une seule balise par case de cette taille
const RANG_ETAT = { actif: 0, ancien: 1, hs: 2 };
const LONGUEURS_MANCHE = [23, 27, 30, 33, 35]; // px depuis le mât : la manche se gonfle avec le vent
const TAILLE_MANCHE = 72;
const COULEUR_CERNE = 'rgba(8, 12, 24, .88)';
const COULEUR_RAFALE = '#ffb155';
const FOND_PASTILLE = '#111728';
const FOND_PASTILLE_INACTIVE = '#2b303d';

const police = () => getComputedStyle(document.body).fontFamily;

function dessinerManche(couleur, longueur) {
  const canvas = document.createElement('canvas');
  canvas.width = TAILLE_MANCHE * 2;
  canvas.height = TAILLE_MANCHE * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const centre = TAILLE_MANCHE / 2;
  const depart = centre - 6;
  const pointe = centre - longueur;
  const demiBase = 7.5;
  const demiPointe = 3.6;
  const contour = new Path2D();
  contour.moveTo(centre - demiBase, depart);
  contour.lineTo(centre - demiPointe, pointe);
  contour.lineTo(centre + demiPointe, pointe);
  contour.lineTo(centre + demiBase, depart);
  contour.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = COULEUR_CERNE;
  ctx.stroke(contour);
  ctx.save();
  ctx.clip(contour);
  // Bandes alternées, comme une vraie manche à air
  const bandes = 5;
  const hauteurBande = (depart - pointe) / bandes;
  for (let index = 0; index < bandes; index += 1) {
    ctx.fillStyle = index % 2 ? '#f6f8fc' : couleur;
    ctx.fillRect(centre - demiBase, depart - (index + 1) * hauteurBande, demiBase * 2, hauteurBande + 0.5);
  }
  ctx.restore();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// id : balise-pastille|couleur (palier ou état)|moyenne|rafale
function dessinerPastille(palier, moyenne, rafale) {
  const inactive = palier === 'ancien' || palier === 'hs';
  const bordure = inactive ? COULEUR_BALISE_INACTIVE : PALETTE_BALISES[Number(palier)];
  const mesure = document.createElement('canvas').getContext('2d');
  const principal = `700 12.5px ${police()}`;
  const secondaire = `700 10.5px ${police()}`;
  mesure.font = principal;
  const largeurMoyenne = mesure.measureText(moyenne).width;
  mesure.font = secondaire;
  const largeurRafale = rafale ? mesure.measureText(rafale).width + 4 : 0;
  const hauteur = 21;
  const largeur = Math.max(hauteur, Math.ceil(largeurMoyenne + largeurRafale + 11));
  const marge = 2;
  const canvas = document.createElement('canvas');
  canvas.width = (largeur + marge * 2) * 2;
  canvas.height = (hauteur + marge * 2) * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.beginPath();
  ctx.roundRect(marge, marge, largeur, hauteur, hauteur / 2);
  ctx.fillStyle = inactive ? FOND_PASTILLE_INACTIVE : FOND_PASTILLE;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = bordure;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const x = marge + (largeur - largeurMoyenne - largeurRafale) / 2;
  const y = marge + hauteur / 2 + 0.5;
  ctx.font = principal;
  ctx.fillStyle = inactive ? '#c6ccd7' : '#ffffff';
  ctx.fillText(moyenne, x, y);
  if (rafale) {
    ctx.font = secondaire;
    ctx.fillStyle = COULEUR_RAFALE;
    ctx.fillText(rafale, x + largeurMoyenne + 4, y);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function creerCoucheBalises(map, { peutOuvrir = () => true } = {}) {
  let stations = [];
  let source = null;
  let visible = false;
  let zoomCalcule = null;

  const fiche = creerFicheBalise(map, { onFermer: () => marquerSelection(null) });

  function imageManche(station, etat) {
    if (etat === 'hs') return '';
    return etat === 'ancien' ? 'balise-manche|ancien' : `balise-manche|${palierBalise(station.moyenne)}`;
  }

  function imagePastille(station, etat) {
    if (etat === 'hs') return 'balise-pastille|hs|×|';
    const palier = etat === 'ancien' ? 'ancien' : palierBalise(station.moyenne);
    const rafale = etat === 'actif' && rafaleMarquee(station) ? Math.round(station.rafale) : '';
    return `balise-pastille|${palier}|${Math.round(station.moyenne)}|${rafale}`;
  }

  // Une balise par case de la grille du monde : déplacer la carte ne change pas celles retenues
  function stationsRetenues() {
    const echelle = 512 * 2 ** (Math.round(map.getZoom() * 2) / 2);
    const cases = new Map();
    stations.forEach((station) => {
      const etat = etatStation(station);
      const sinus = Math.sin((station.lat * Math.PI) / 180);
      const x = ((station.lon + 180) / 360) * echelle;
      const y = (0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * echelle;
      const cle = `${Math.floor(x / CELLULE_ECART)}/${Math.floor(y / CELLULE_ECART)}`;
      const rang = station.id === fiche.idOuverte ? -1 : RANG_ETAT[etat];
      const actuelle = cases.get(cle);
      if (!actuelle || rang < actuelle.rang || (rang === actuelle.rang && station.date > actuelle.station.date)) {
        cases.set(cle, { station, etat, rang });
      }
    });
    return [...cases.values()];
  }

  function assurerImage(id) {
    if (!id || map.hasImage(id)) return;
    const [genre, valeur, moyenne, rafale] = id.split('|');
    if (genre === 'balise-manche') {
      const inactive = valeur === 'ancien';
      const image = dessinerManche(
        inactive ? COULEUR_BALISE_INACTIVE : PALETTE_BALISES[Number(valeur)],
        inactive ? LONGUEURS_MANCHE[1] : LONGUEURS_MANCHE[Number(valeur)]
      );
      map.addImage(id, image, { pixelRatio: 2 });
    } else {
      map.addImage(id, dessinerPastille(valeur, moyenne, rafale), { pixelRatio: 2 });
    }
  }

  function donnees() {
    return {
      type: 'FeatureCollection',
      features: stationsRetenues().map(({ station, etat }) => {
        const manche = imageManche(station, etat);
        const pastille = imagePastille(station, etat);
        assurerImage(manche);
        assurerImage(pastille);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: {
            id: station.id,
            manche,
            pastille,
            cap: Number.isFinite(station.direction) ? (station.direction + 180) % 360 : 0, // la manche va où va le vent
          },
        };
      }),
    };
  }

  function retirerCouches() {
    [COUCHE_PASTILLE, COUCHE_MANCHE, COUCHE_SELECTION].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  function assurerCouches() {
    if (!source) return;
    if (!map.getSource(SOURCE)) {
      map.addSource(SOURCE, { type: 'geojson', data: donnees(), attribution: source.attribution });
    }
    if (!map.getLayer(COUCHE_SELECTION)) {
      map.addLayer({
        id: COUCHE_SELECTION,
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: { 'circle-radius': 22, 'circle-color': '#ffffff', 'circle-opacity': 0.22, 'circle-stroke-color': '#111728', 'circle-stroke-width': 2 },
      });
    }
    if (!map.getLayer(COUCHE_MANCHE)) {
      map.addLayer({
        id: COUCHE_MANCHE,
        type: 'symbol',
        source: SOURCE,
        filter: ['!=', ['get', 'manche'], ''],
        layout: {
          'icon-image': ['get', 'manche'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.72, 10, 1],
          'icon-rotate': ['get', 'cap'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
    if (!map.getLayer(COUCHE_PASTILLE)) {
      map.addLayer({
        id: COUCHE_PASTILLE,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'icon-image': ['get', 'pastille'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.86, 10, 1],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }
    zoomCalcule = Math.round(map.getZoom() * 2);
    [COUCHE_SELECTION, COUCHE_MANCHE, COUCHE_PASTILLE].forEach((id) => {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    });
  }

  function publier() {
    zoomCalcule = Math.round(map.getZoom() * 2);
    map.getSource(SOURCE)?.setData(donnees());
  }

  function marquerSelection(id) {
    if (map.getLayer(COUCHE_SELECTION)) map.setFilter(COUCHE_SELECTION, ['==', ['get', 'id'], id ?? '']);
  }

  function ouvrir(id) {
    const station = stations.find((candidate) => candidate.id === id);
    if (!station) return;
    fiche.ouvrir(station, source);
    publier(); // la balise ouverte reste affichée, même en zone dense
    marquerSelection(id);
  }

  // Un clic général et une tolérance : au doigt, viser une petite balise est difficile
  map.on('click', (event) => {
    if (!visible || !map.getLayer(COUCHE_PASTILLE) || !peutOuvrir()) return;
    const { x, y } = event.point;
    const [trouve] = map.queryRenderedFeatures(
      [[x - TOLERANCE_CLIC, y - TOLERANCE_CLIC], [x + TOLERANCE_CLIC, y + TOLERANCE_CLIC]],
      { layers: COUCHES_CLIC }
    );
    if (trouve) ouvrir(trouve.properties.id);
    else fiche.fermer();
  });
  map.on('mousemove', (event) => {
    if (!visible || !map.getLayer(COUCHE_PASTILLE)) return;
    const survol = map.queryRenderedFeatures(event.point, { layers: COUCHES_CLIC }).length > 0;
    if (survol) map.getCanvas().style.cursor = 'pointer';
    else if (map.getCanvas().style.cursor === 'pointer') map.getCanvas().style.cursor = '';
  });
  map.on('zoom', () => {
    if (visible && Math.round(map.getZoom() * 2) !== zoomCalcule) publier();
  });
  map.on('style.load', assurerCouches);

  return {
    // `nouvelleSource` : l'attribution de la carte suit la source affichée
    definir(nouvellesStations, nouvelleSource) {
      stations = nouvellesStations;
      if (nouvelleSource !== source) {
        fiche.fermer();
        retirerCouches();
        source = nouvelleSource;
      }
      assurerCouches();
      publier();
      const ouverte = stations.find(({ id }) => id === fiche.idOuverte);
      if (ouverte) fiche.actualiser(ouverte);
      const etats = stations.map(etatStation);
      return {
        recentes: etats.filter((etat) => etat === 'actif').length,
        anciennes: etats.filter((etat) => etat === 'ancien').length,
        horsService: etats.filter((etat) => etat === 'hs').length,
      };
    },
    definirVisible(valeur) {
      visible = valeur;
      [COUCHE_SELECTION, COUCHE_MANCHE, COUCHE_PASTILLE].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', valeur ? 'visible' : 'none');
      });
      if (!valeur) fiche.fermer();
      else if (map.getSource(SOURCE) && Math.round(map.getZoom() * 2) !== zoomCalcule) publier();
    },
    // Les relevés récents de la zone visible, du centre vers les bords
    proches(limite) {
      const limites = map.getBounds();
      const { lng, lat } = map.getCenter();
      const kLng = Math.cos((lat * Math.PI) / 180);
      return stations
        .filter((station) => etatStation(station) === 'actif' && limites.contains([station.lon, station.lat]))
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
