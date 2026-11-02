import { lire, ecrire } from './reglages.js';
import { CALQUES_MONTIS } from './style-montis.js';
import { surLangue, t, ti, poser } from './i18n.js';

const wmts = (couche, format) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${couche}&STYLE=normal&FORMAT=${format}&TILEMATRIXSET=PM` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

// Sources déjà sur la carte, que la visite réutilise sans toucher au fond choisi
export const SOURCE_TOPO = 'topo';
export const SOURCE_SATELLITE = 'esri-sat';

// Pour ajouter un fond : une entrée de plus dans cette liste (zone : 'France' ou 'Monde')
const FONDS = [
  { id: 'montis', cle: 'fond.montis', zone: 'Monde', photo: false, integre: true },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    zone: 'Monde',
    photo: false,
    source: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      maxzoom: 19,
      get attribution() { return t('fond.osm-attribution'); },
    },
  },
  {
    id: 'topo',
    label: 'OpenTopoMap',
    zone: 'Monde',
    photo: false,
    source: {
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      maxzoom: 17,
      get attribution() { return t('fond.otm-attribution'); },
    },
  },
  {
    id: 'ign-plan',
    cle: 'fond.ign-plan',
    zone: 'France',
    photo: false,
    source: {
      tiles: [wmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png')],
      maxzoom: 18,
      attribution: '© IGN',
    },
  },
  {
    id: 'ign-ortho',
    cle: 'fond.ign-photo',
    zone: 'France',
    photo: true,
    source: {
      tiles: [wmts('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')],
      maxzoom: 19,
      attribution: '© IGN',
    },
  },
  {
    id: 'esri-sat',
    cle: 'fond.esri',
    zone: 'Monde',
    photo: true,
    source: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      maxzoom: 19,
      attribution: 'Tiles © Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    },
  },
];

const ZONES = [
  {
    nom: 'France',
    cle: 'fond.zone-france',
    aide: 'fond.aide-france',
  },
  { nom: 'Monde', cle: 'fond.zone-monde', aide: '' },
];

let fondImpose = false; // sans réseau, le fond Montis prime sur le choix enregistré

// Les noms propres (OpenStreetMap, OpenTopoMap) restent tels quels
const nomFond = (f) => (f.cle ? t(f.cle) : f.label);
const coucheDe = (f) => (f.integre ? 'montis-background' : `fond-${f.id}`);

// Affiche le fond choisi, cache les autres, adapte les courbes de niveau
function appliquerFond(map, id) {
  const choix = FONDS.find((f) => f.id === id) ?? FONDS[0];

  FONDS.forEach((f) => {
    if (map.getLayer(coucheDe(f))) {
      map.setLayoutProperty(
        coucheDe(f),
        'visibility',
        f.id === choix.id ? 'visible' : 'none'
      );
    }
  });
  for (const id of CALQUES_MONTIS) {
    if (id !== 'montis-background' && map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', choix.id === 'montis' ? 'visible' : 'none');
    }
  }
  if (choix.id === 'montis' && map.getLayer('montis-background')) {
    map.setLayoutProperty('montis-background', 'visibility', 'visible');
  }

  // Sur une photo, les courbes de niveau passent en blanc pour rester lisibles
  if (map.getLayer('courbes')) {
    map.setPaintProperty('courbes', 'line-color', choix.photo ? '#ffffff' : '#8a5a2b');
    map.setPaintProperty('courbes', 'line-opacity', choix.photo ? 0.75 : 0.6);
  }
  if (map.getLayer('courbes-altitude')) {
    map.setPaintProperty('courbes-altitude', 'text-color', choix.photo ? '#ffffff' : '#6b4220');
    map.setPaintProperty('courbes-altitude', 'text-halo-color', choix.photo ? '#000000' : '#ffffff');
  }
}

// Rétablit le dernier fond utilisé (appelée depuis main.js au démarrage)
export function retablirFond(map) {
  let id = fondImpose ? 'montis' : lire('fond', 'montis');
  if (!FONDS.some((f) => f.id === id)) id = 'osm';
  try {
    appliquerFond(map, id);
    console.info('Fond de carte rétabli :', id);
  } catch (e) {
    console.error('Fond de carte non rétabli :', e);
  }
}

// Sans réseau, seul le fond Montis peut s'afficher entièrement. Le choix enregistré ne change pas.
export function basculerFondHorsLigne(map, horsLigne) {
  fondImpose = horsLigne;
  retablirFond(map);
}

export function creerFondDeCarte(map) {
  // Un fond = une source + une couche insérée sous OpenStreetMap, masquée au départ
  for (const f of FONDS) {
    if (!f.source) continue;
    map.addSource(f.id, { type: 'raster', tileSize: 256, ...f.source });
    map.addLayer(
      { id: coucheDe(f), type: 'raster', source: f.id, layout: { visibility: 'none' } },
      'montis-landuse'
    );
  }

  let idActif = lire('fond', 'montis');
  if (!FONDS.some((f) => f.id === idActif)) idActif = 'osm';

  let zoneCourante = lire('fond-onglet', null);
  if (!ZONES.some((z) => z.nom === zoneCourante)) {
    zoneCourante = FONDS.find((f) => f.id === idActif).zone;
  }

  const panneau = document.createElement('div');
  panneau.innerHTML = `
    <div class="fond-onglets" role="tablist">
      ${ZONES.map((z) => `<button type="button" data-zone="${z.nom}" ${ti(z.cle)}>${t(z.cle)}</button>`).join('')}
    </div>
    <p class="note fond-aide"></p>
    <div class="liste-fonds"></div>
    <p class="note fond-actuel"></p>
  `;

  const boutonsOnglets = panneau.querySelectorAll('.fond-onglets button');
  const aide = panneau.querySelector('.fond-aide');
  const liste = panneau.querySelector('.liste-fonds');
  const actuel = panneau.querySelector('.fond-actuel');

  function afficher() {
    boutonsOnglets.forEach((b) => b.classList.toggle('actif', b.dataset.zone === zoneCourante));

    const cleAide = ZONES.find((z) => z.nom === zoneCourante).aide;
    aide.textContent = cleAide ? t(cleAide) : '';
    aide.style.display = aide.textContent ? 'block' : 'none';
    poser(actuel, 'fond.actuel', { nom: nomFond(FONDS.find((f) => f.id === idActif)) });

    liste.innerHTML = '';
    for (const f of FONDS.filter((x) => x.zone === zoneCourante)) {
      const ligne = document.createElement('label');
      ligne.className = 'fond-item';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'fond';
      radio.value = f.id;
      radio.checked = f.id === idActif;
      radio.addEventListener('change', () => {
        idActif = f.id;
        appliquerFond(map, idActif);
        ecrire('fond', idActif);
        poser(actuel, 'fond.actuel', { nom: nomFond(f) });
      });

      const nom = document.createElement('span');
      nom.className = 'fond-nom';
      nom.textContent = nomFond(f);

      ligne.append(radio, nom);
      liste.appendChild(ligne);
    }
  }

  boutonsOnglets.forEach((b) => {
    b.addEventListener('click', () => {
      zoneCourante = b.dataset.zone;
      ecrire('fond-onglet', zoneCourante);
      afficher();
    });
  });

  afficher();
  surLangue(afficher);

  return { id: 'fond', labelCle: 'fond.titre', icone: 'fond', panneau, activer() {}, desactiver() {} };
}