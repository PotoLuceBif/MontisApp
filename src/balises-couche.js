// Balises de vent sur la carte : une pastille avec la vitesse, et une manche à air qui en sort
// dans le sens du vent. Deux couches de symboles, car la pastille reste droite quand la manche
// tourne ; on écarte nous-mêmes les balises trop proches pour que les deux restent appariées.
import { creerFicheBalise } from './balise-fiche.js';
import { COULEUR_BALISE_INACTIVE, etatStation, reseauDe } from './balises-sources.js';
import { distanceMetres } from './balises-calcul.js';
import { PALETTE_CARTE, palierVent } from './vent-cadran.js';
import { valeurVent } from './unites.js';
import { surPreferences } from './preferences.js';

const SOURCE = 'balises-vent';
const COUCHE_SELECTION = 'balises-vent-selection';
const COUCHE_MANCHE = 'balises-vent-manches';
const COUCHE_PASTILLE = 'balises-vent-pastilles';
const COUCHES_CLIC = [COUCHE_PASTILLE, COUCHE_MANCHE];
const TOLERANCE_CLIC = 12;
const ECART_MIN = 42; // px entre deux balises à l'écran
const RANG_ETAT = { actif: 0, ancien: 1, hs: 2 };
const LONGUEURS_MANCHE = [23, 27, 30, 33, 35]; // px depuis le mât : la manche se gonfle avec le vent
const TAILLE_MANCHE = 72;
const DENSITE_IMAGE = 3; // assez de pixels pour rester net sur les écrans de téléphone
const COULEUR_CERNE = 'rgba(8, 12, 24, .88)';
const FOND_PASTILLE = '#111728';
const FOND_PASTILLE_INACTIVE = '#2b303d';

const police = () => getComputedStyle(document.body).fontFamily;

function dessinerManche(couleur, longueur) {
  const canvas = document.createElement('canvas');
  canvas.width = TAILLE_MANCHE * DENSITE_IMAGE;
  canvas.height = TAILLE_MANCHE * DENSITE_IMAGE;
  const ctx = canvas.getContext('2d');
  ctx.scale(DENSITE_IMAGE, DENSITE_IMAGE);
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

// id : balise-pastille|couleur (palier ou état)|moyenne
function dessinerPastille(palier, moyenne) {
  const inactive = palier === 'ancien' || palier === 'hs';
  const bordure = inactive ? COULEUR_BALISE_INACTIVE : PALETTE_CARTE[Number(palier)];
  const mesure = document.createElement('canvas').getContext('2d');
  const principal = `700 12.5px ${police()}`;
  mesure.font = principal;
  const hauteur = 21;
  const largeur = Math.max(hauteur, Math.ceil(mesure.measureText(moyenne).width + 11));
  const marge = 2;
  const canvas = document.createElement('canvas');
  canvas.width = (largeur + marge * 2) * DENSITE_IMAGE;
  canvas.height = (hauteur + marge * 2) * DENSITE_IMAGE;
  const ctx = canvas.getContext('2d');
  ctx.scale(DENSITE_IMAGE, DENSITE_IMAGE);
  ctx.beginPath();
  ctx.roundRect(marge, marge, largeur, hauteur, hauteur / 2);
  ctx.fillStyle = inactive ? FOND_PASTILLE_INACTIVE : FOND_PASTILLE;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = bordure;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = principal;
  ctx.fillStyle = inactive ? '#c6ccd7' : '#ffffff';
  ctx.fillText(moyenne, marge + largeur / 2, marge + hauteur / 2 + 0.5);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function creerCoucheBalises(map, { peutOuvrir = () => true, onRetourFiche } = {}) {
  let stations = [];
  let source = null;
  let visible = false;
  let zoomCalcule = null;

  // Relevé passé lu sur le graphique de la fiche : sa manche le montre tant que le curseur y reste
  let apercu = null;
  let apercuPlanifie = false;
  const fiche = creerFicheBalise(map, {
    onFermer: () => marquerSelection(null),
    onRetour: onRetourFiche,
    onApercu(point) {
      apercu = point;
      if (apercuPlanifie) return;
      apercuPlanifie = true;
      requestAnimationFrame(() => {
        apercuPlanifie = false;
        publier();
      });
    },
  });

  function imageManche(station, etat) {
    if (etat === 'hs') return '';
    return etat === 'ancien' ? 'balise-manche|ancien' : `balise-manche|${palierVent(station.moyenne)}`;
  }

  function imagePastille(station, etat) {
    if (etat === 'hs') return 'balise-pastille|hs|×';
    const palier = etat === 'ancien' ? 'ancien' : palierVent(station.moyenne);
    return `balise-pastille|${palier}|${valeurVent(station.moyenne)}`;
  }

  // Les relevés les plus utiles d'abord, puis ceux qui ne chevauchent rien. Le calcul se fait
  // en coordonnées du monde : déplacer la carte ne change pas les balises retenues.
  function stationsRetenues() {
    const echelle = 512 * 2 ** (Math.round(map.getZoom() * 2) / 2);
    const candidates = stations.map((station) => {
      const etat = etatStation(station);
      const sinus = Math.sin((station.lat * Math.PI) / 180);
      return {
        station,
        etat,
        rang: station.id === fiche.idOuverte ? -1 : RANG_ETAT[etat],
        x: ((station.lon + 180) / 360) * echelle,
        y: (0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * echelle,
      };
    }).sort((a, b) => a.rang - b.rang || (b.station.date || 0) - (a.station.date || 0) || a.station.id.localeCompare(b.station.id));
    const retenues = [];
    const cases = new Map();
    const cle = (x, y) => `${Math.floor(x / ECART_MIN)}/${Math.floor(y / ECART_MIN)}`;
    candidates.forEach((candidate) => {
      for (let dx = -ECART_MIN; dx <= ECART_MIN; dx += ECART_MIN) {
        for (let dy = -ECART_MIN; dy <= ECART_MIN; dy += ECART_MIN) {
          const voisines = cases.get(cle(candidate.x + dx, candidate.y + dy)) || [];
          if (voisines.some(({ x, y }) => Math.hypot(x - candidate.x, y - candidate.y) < ECART_MIN)) return;
        }
      }
      retenues.push(candidate);
      const ici = cle(candidate.x, candidate.y);
      cases.set(ici, [...(cases.get(ici) || []), candidate]);
    });
    return retenues;
  }

  function assurerImage(id) {
    if (!id || map.hasImage(id)) return;
    const [genre, valeur, moyenne] = id.split('|');
    if (genre === 'balise-manche') {
      const inactive = valeur === 'ancien';
      const image = dessinerManche(
        inactive ? COULEUR_BALISE_INACTIVE : PALETTE_CARTE[Number(valeur)],
        inactive ? LONGUEURS_MANCHE[1] : LONGUEURS_MANCHE[Number(valeur)]
      );
      map.addImage(id, image, { pixelRatio: DENSITE_IMAGE });
    } else {
      map.addImage(id, dessinerPastille(valeur, moyenne), { pixelRatio: DENSITE_IMAGE });
    }
  }

  function donnees() {
    return {
      type: 'FeatureCollection',
      features: stationsRetenues().map(({ station: reelle, etat: etatReel }) => {
        const rejouee = apercu && apercu.id === reelle.id && Number.isFinite(apercu.moyenne);
        const station = rejouee ? { ...reelle, moyenne: apercu.moyenne, direction: apercu.direction } : reelle;
        const etat = rejouee ? 'actif' : etatReel;
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
        paint: { 'circle-radius': 22, 'circle-color': '#ffffff', 'circle-opacity': 0.2, 'circle-stroke-color': '#111728', 'circle-stroke-width': 2.5 },
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
  surPreferences(publier, ['unites', 'unite-vent', '*']);

  function marquerSelection(id) {
    if (!map.getLayer(COUCHE_SELECTION)) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    map.setPaintProperty(COUCHE_SELECTION, 'circle-stroke-color', accent);
    map.setFilter(COUCHE_SELECTION, ['==', ['get', 'id'], id ?? '']);
  }

  function ouvrir(id, options) {
    const station = stations.find((candidate) => candidate.id === id);
    if (!station) return;
    fiche.ouvrir(station, reseauDe(station), options);
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
  // Une seule fiche à la fois : celle d'un point (appui long) ou d'un objet remplace celle de la balise
  window.addEventListener('fiche-ouverte', () => fiche.fermer());

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
    // La balise qui mesure la plus proche d'un point, à moins de `rayon` mètres
    plusProche(lon, lat, rayon) {
      let meilleure = null;
      stations.forEach((station) => {
        if (etatStation(station) === 'hs') return;
        const distance = distanceMetres({ lon, lat }, station);
        if (distance <= rayon && (!meilleure || distance < meilleure.distance)) meilleure = { station, distance };
      });
      return meilleure;
    },
    centrerSur(id, options) {
      const station = stations.find((candidate) => candidate.id === id);
      if (!station) return;
      map.once('moveend', () => ouvrir(id, options));
      map.flyTo({ center: [station.lon, station.lat], zoom: Math.max(map.getZoom(), 11) });
    },
  };
}
