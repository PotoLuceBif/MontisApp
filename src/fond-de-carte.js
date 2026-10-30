import { lire, ecrire } from './reglages.js';
import { CALQUES_MONTIS } from './style-montis.js';

const wmts = (couche, format) =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${couche}&STYLE=normal&FORMAT=${format}&TILEMATRIXSET=PM` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

// Pour ajouter un fond : une entrée de plus dans cette liste (zone : 'France' ou 'Monde')
const FONDS = [
  { id: 'montis', label: 'Montis · relief', zone: 'Monde', photo: false, integre: true },
  {
    id: 'osm',
    label: 'OpenStreetMap',
    zone: 'Monde',
    photo: false,
    source: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      maxzoom: 19,
      attribution: '© les contributeurs OpenStreetMap',
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
      attribution: '© OpenTopoMap (CC-BY-SA), © les contributeurs OpenStreetMap',
    },
  },
  {
    id: 'ign-plan',
    label: 'Plan IGN',
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
    label: 'Photo aérienne IGN',
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
    label: 'Satellite Esri',
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
    aide: 'Couverture France uniquement : hors de France, la carte reste vide. Repasse alors sur un fond « Monde ».',
  },
  { nom: 'Monde', aide: '' },
];

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
  let id = lire('fond', 'montis');
  if (!FONDS.some((f) => f.id === id)) id = 'osm';
  try {
    appliquerFond(map, id);
    console.info('Fond de carte rétabli :', id);
  } catch (e) {
    console.error('Fond de carte non rétabli :', e);
  }
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
      ${ZONES.map((z) => `<button type="button" data-zone="${z.nom}">${z.nom}</button>`).join('')}
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

    aide.textContent = ZONES.find((z) => z.nom === zoneCourante).aide;
    aide.style.display = aide.textContent ? 'block' : 'none';
    actuel.textContent = `Fond actuel : ${FONDS.find((f) => f.id === idActif).label}`;

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
        actuel.textContent = `Fond actuel : ${f.label}`;
      });

      const nom = document.createElement('span');
      nom.className = 'fond-nom';
      nom.textContent = f.label;

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

  return { id: 'fond', label: 'Fond de carte', icone: 'fond', panneau, activer() {}, desactiver() {} };
}