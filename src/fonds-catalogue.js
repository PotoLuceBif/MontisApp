// Catalogue des fonds de carte et des calques officiels à superposer.
// Pour ajouter un fond : une entrée dans FONDS ; un calque : une entrée dans CALQUES.
// - pays : code de PAYS (null = monde entier) ; zone : contour qui limite le fond (code de fonds-zones.js,
//   ou rectangle [ouest, sud, est, nord]) ; hors de sa zone, le fond Montis complète la carte.
// - ancienne : rangé dans « Cartes anciennes » ; epoque : texte affiché sous le nom.
// - nom : nom propre (jamais traduit) ou cle ; desc : clé de la ligne sous le nom.
import { t } from './i18n.js';
import { EMPRISES_PAYS } from './fonds-emprises.js';

// Régions puis pays, dans l'ordre d'affichage
export const REGIONS = ['europe', 'ameriques', 'asie'];
export const PAYS = [
  { code: 'FR', region: 'europe' },
  { code: 'CH', region: 'europe' },
  { code: 'AT', region: 'europe' },
  { code: 'ES', region: 'europe' },
  { code: 'NO', region: 'europe' },
  { code: 'BE', region: 'europe' },
  { code: 'US', region: 'ameriques' },
  { code: 'CA', region: 'ameriques' },
  { code: 'JP', region: 'asie' },
];

// La Catalogne n'a pas de contour dans Natural Earth au 1/50 000 000 : un rectangle suffit
const CATALOGNE = [0.15, 40.5, 3.35, 42.9];

const geopf = (couche, format, grille, style = 'normal') =>
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  `&LAYER=${couche}&STYLE=${style}&FORMAT=${format}&TILEMATRIXSET=${grille}` +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const swisstopo = (couche, extension = 'png') =>
  `https://wmts.geo.admin.ch/1.0.0/${couche}/default/current/3857/{z}/{x}/{y}.${extension}`;
const basemapAt = (couche, style, extension) =>
  `https://mapsneu.wien.gv.at/basemap/${couche}/${style}/google3857/{z}/{y}/{x}.${extension}`;
const usgs = (couche) => `https://basemap.nationalmap.gov/arcgis/rest/services/${couche}/MapServer/tile/{z}/{y}/{x}`;

const IGN = '© IGN';
// swisstopo dessine ses tuiles 3857 avec des textes et symboles deux fois trop gros : déclarées en 128 px,
// elles sont demandées un niveau plus loin et s'affichent à leur taille
const TUILE_SWISSTOPO = 128;
const SWISSTOPO = '© swisstopo';

// Fonds proposés sous le fond Montis, en tête du panneau ; les autres sont dans « Avancé »
export const FONDS_DE_BASE = ['esri-sat', 'topo', 'osm'];

export const FONDS = [
  // ---------- Monde entier ----------
  { id: 'montis', cle: 'fond.montis', desc: 'fond.desc-montis', pays: null, integre: true },
  // Le satellite juste après Montis (demande du propriétaire du 16 novembre 2026)
  {
    id: 'esri-sat',
    cle: 'fond.esri',
    desc: 'fond.desc-esri',
    pays: null,
    photo: true,
    source: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      maxzoom: 19,
      attribution: 'Tiles © Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    },
  },
  {
    id: 'topo',
    nom: 'OpenTopoMap',
    desc: 'fond.desc-opentopomap',
    pays: null,
    source: {
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      maxzoom: 17,
      get attribution() { return t('fond.otm-attribution'); },
    },
  },
  {
    id: 'topplus',
    nom: 'TopPlusOpen',
    desc: 'fond.desc-topplus',
    pays: null,
    source: {
      tiles: ['https://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web/default/WEBMERCATOR/{z}/{y}/{x}.png'],
      maxzoom: 18,
      attribution: '© <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (TopPlusOpen, CC BY 4.0)',
    },
  },
  {
    id: 'esri-topo',
    cle: 'fond.esri-topo',
    desc: 'fond.desc-esri-topo',
    pays: null,
    source: {
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      maxzoom: 17,
      attribution: 'Tiles © Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community',
    },
  },
  {
    id: 'osm',
    nom: 'OpenStreetMap',
    desc: 'fond.desc-osm',
    pays: null,
    source: {
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      maxzoom: 19,
      get attribution() { return t('fond.osm-attribution'); },
    },
  },
  {
    id: 'cyclosm',
    nom: 'CyclOSM',
    desc: 'fond.desc-cyclosm',
    pays: null,
    source: {
      tiles: ['https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'],
      maxzoom: 18,
      get attribution() { return `© CyclOSM, ${t('fond.osm-attribution')}`; },
    },
  },

  // ---------- France ----------
  {
    id: 'ign-plan',
    cle: 'fond.ign-plan',
    desc: 'fond.desc-ign-plan',
    pays: 'FR',
    source: { tiles: [geopf('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png', 'PM')], maxzoom: 18, attribution: IGN },
  },
  {
    id: 'ign-scan-regional',
    cle: 'fond.ign-scan-regional',
    desc: 'fond.desc-ign-scan-regional',
    pays: 'FR',
    source: {
      tiles: [geopf('IGNF_CARTES_SCAN-REGIONAL', 'image/jpeg', 'PM_0_12', 'SCANREG')],
      maxzoom: 12,
      attribution: IGN,
    },
  },
  {
    id: 'ign-ortho',
    cle: 'fond.ign-photo',
    desc: 'fond.desc-ign-photo',
    pays: 'FR',
    photo: true,
    source: { tiles: [geopf('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg', 'PM')], maxzoom: 19, attribution: IGN },
  },

  // ---------- Suisse ----------
  {
    id: 'swisstopo',
    cle: 'fond.swisstopo',
    desc: 'fond.desc-swisstopo',
    pays: 'CH',
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.pixelkarte-farbe', 'jpeg')], maxzoom: 19, attribution: SWISSTOPO },
  },
  {
    id: 'swisstopo-gris',
    cle: 'fond.swisstopo-gris',
    desc: 'fond.desc-swisstopo-gris',
    pays: 'CH',
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.pixelkarte-grau', 'jpeg')], maxzoom: 19, attribution: SWISSTOPO },
  },
  {
    id: 'swissimage',
    nom: 'SWISSIMAGE',
    desc: 'fond.desc-swissimage',
    pays: 'CH',
    photo: true,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.swissimage', 'jpeg')], maxzoom: 19, attribution: SWISSTOPO },
  },

  // ---------- Autriche ----------
  {
    id: 'basemap-at',
    nom: 'basemap.at',
    desc: 'fond.desc-basemap-at',
    pays: 'AT',
    source: {
      tiles: [basemapAt('geolandbasemap', 'normal', 'png')],
      maxzoom: 19,
      attribution: '© <a href="https://basemap.at" target="_blank" rel="noopener">basemap.at</a> (CC BY 4.0)',
    },
  },
  {
    id: 'basemap-at-photo',
    cle: 'fond.basemap-at-photo',
    desc: 'fond.desc-basemap-at-photo',
    pays: 'AT',
    photo: true,
    source: {
      tiles: [basemapAt('bmaporthofoto30cm', 'normal', 'jpeg')],
      maxzoom: 19,
      attribution: '© <a href="https://basemap.at" target="_blank" rel="noopener">basemap.at</a> (CC BY 4.0)',
    },
  },

  // ---------- Espagne ----------
  {
    id: 'ign-es',
    cle: 'fond.ign-es',
    desc: 'fond.desc-ign-es',
    pays: 'ES',
    source: {
      tiles: ['https://www.ign.es/wmts/mapa-raster?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=MTN&tilematrixset=GoogleMapsCompatible&style=default&tilematrix={z}&tilerow={y}&tilecol={x}'],
      maxzoom: 17,
      attribution: '© Instituto Geográfico Nacional de España (CC BY 4.0)',
    },
  },
  {
    id: 'icgc',
    cle: 'fond.icgc',
    desc: 'fond.desc-icgc',
    pays: 'ES',
    zone: CATALOGNE,
    source: {
      tiles: ['https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW/{z}/{x}/{y}.png'],
      maxzoom: 18,
      attribution: '© Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)',
    },
  },

  // ---------- Norvège ----------
  {
    id: 'kartverket',
    cle: 'fond.kartverket',
    desc: 'fond.desc-kartverket',
    pays: 'NO',
    source: {
      tiles: ['https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png'],
      maxzoom: 18,
      attribution: '© Kartverket (CC BY 4.0)',
    },
  },

  // ---------- Belgique ----------
  {
    id: 'ngi',
    cle: 'fond.ngi',
    desc: 'fond.desc-ngi',
    pays: 'BE',
    source: {
      tiles: ['https://cartoweb.wmts.ngi.be/1.0.0/topo/default/3857/{z}/{y}/{x}.png'],
      maxzoom: 17,
      attribution: '© NGI / IGN Belgique',
    },
  },

  // ---------- États-Unis ----------
  {
    id: 'usgs-topo',
    nom: 'USGS Topo',
    desc: 'fond.desc-usgs-topo',
    pays: 'US',
    source: { tiles: [usgs('USGSTopo')], maxzoom: 16, attribution: 'USGS The National Map' },
  },
  {
    id: 'usgs-photo',
    cle: 'fond.usgs-photo',
    desc: 'fond.desc-usgs-photo',
    pays: 'US',
    photo: true,
    source: { tiles: [usgs('USGSImageryTopo')], maxzoom: 16, attribution: 'USGS The National Map' },
  },

  // ---------- Canada ----------
  {
    id: 'toporama',
    nom: 'Toporama',
    desc: 'fond.desc-toporama',
    pays: 'CA',
    source: {
      // Service WMS : MapLibre demande chaque tuile par son emprise en mètres
      tiles: ['https://maps.geogratis.gc.ca/wms/toporama_fr?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=SCW-Toporama&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png'],
      minzoom: 4,
      maxzoom: 17,
      get attribution() { return t('fond.toporama-attribution'); },
    },
  },

  // ---------- Japon ----------
  {
    id: 'gsi',
    cle: 'fond.gsi',
    desc: 'fond.desc-gsi',
    pays: 'JP',
    source: {
      tiles: ['https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png'],
      maxzoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">© GSI Japan</a>',
    },
  },

  // ---------- Cartes anciennes ----------
  {
    id: 'cassini',
    cle: 'fond.cassini',
    desc: 'fond.desc-cassini',
    epoque: 'fond.epoque-cassini',
    pays: 'FR',
    ancienne: true,
    source: {
      tiles: [geopf('BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI', 'image/png', 'PM_6_14')],
      minzoom: 6,
      maxzoom: 14,
      attribution: '© BnF, IGN',
    },
  },
  {
    id: 'etat-major',
    cle: 'fond.etat-major',
    desc: 'fond.desc-etat-major',
    epoque: 'fond.epoque-etat-major',
    pays: 'FR',
    ancienne: true,
    source: {
      tiles: [geopf('GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', 'image/jpeg', 'PM_6_15')],
      minzoom: 6,
      maxzoom: 15,
      attribution: IGN,
    },
  },
  {
    id: 'ign-1950',
    cle: 'fond.ign-1950',
    desc: 'fond.desc-ign-1950',
    epoque: 'fond.epoque-ign-1950',
    pays: 'FR',
    ancienne: true,
    source: {
      tiles: [geopf('GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950', 'image/jpeg', 'PM_3_15')],
      minzoom: 3,
      maxzoom: 15,
      attribution: IGN,
    },
  },
  {
    id: 'dufour',
    cle: 'fond.dufour',
    desc: 'fond.desc-dufour',
    epoque: 'fond.epoque-dufour',
    pays: 'CH',
    ancienne: true,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.hiks-dufour')], maxzoom: 17, attribution: SWISSTOPO },
  },
  {
    id: 'siegfried',
    cle: 'fond.siegfried',
    desc: 'fond.desc-siegfried',
    epoque: 'fond.epoque-siegfried',
    pays: 'CH',
    ancienne: true,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.hiks-siegfried')], maxzoom: 16, attribution: SWISSTOPO },
  },
];

// Calques officiels à superposer au fond choisi (transparents hors de leur sujet)
export const CALQUES = [
  {
    id: 'ign-pentes',
    cle: 'calque.ign-pentes',
    court: 'calque.court-ign-pentes',
    desc: 'calque.desc-ign-pentes',
    pays: 'FR',
    opacite: 0.6,
    source: { tiles: [geopf('GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN', 'image/png', 'PM_0_17')], maxzoom: 17, attribution: IGN },
  },
  {
    id: 'ch-pentes',
    cle: 'calque.ch-pentes',
    court: 'calque.court-ch-pentes',
    desc: 'calque.desc-ch-pentes',
    pays: 'CH',
    opacite: 0.6,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.hangneigung-ueber_30')], maxzoom: 17, attribution: SWISSTOPO },
  },
  {
    id: 'ch-ski-rando',
    cle: 'calque.ch-ski-rando',
    court: 'calque.court-ch-ski-rando',
    desc: 'calque.desc-ch-ski-rando',
    pays: 'CH',
    opacite: 1,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo-karto.skitouren')], maxzoom: 17, attribution: SWISSTOPO },
  },
  {
    id: 'ch-raquettes',
    cle: 'calque.ch-raquettes',
    court: 'calque.court-ch-raquettes',
    desc: 'calque.desc-ch-raquettes',
    pays: 'CH',
    opacite: 1,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo-karto.schneeschuhrouten')], maxzoom: 17, attribution: SWISSTOPO },
  },
  {
    id: 'ch-sentiers',
    cle: 'calque.ch-sentiers',
    court: 'calque.court-ch-sentiers',
    desc: 'calque.desc-ch-sentiers',
    pays: 'CH',
    opacite: 1,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.swisstopo.swisstlm3d-wanderwege')], maxzoom: 18, attribution: SWISSTOPO },
  },
  {
    id: 'ch-faune',
    cle: 'calque.ch-faune',
    court: 'calque.court-ch-faune',
    desc: 'calque.desc-ch-faune',
    pays: 'CH',
    opacite: 0.7,
    source: { tileSize: TUILE_SWISSTOPO, tiles: [swisstopo('ch.bafu.wrz-wildruhezonen_portal')], maxzoom: 18, attribution: '© OFEV / BAFU' },
  },
];

// Zone d'un fond ou d'un calque : son rectangle à lui, sinon le contour de son pays (null : monde entier)
export const zoneDe = (element) => element.zone ?? element.pays ?? null;
// Rectangle [ouest, sud, est, nord] d'une zone, pour limiter les tuiles demandées
export const empriseDe = (element) => {
  const zone = zoneDe(element);
  if (!zone) return null;
  return Array.isArray(zone) ? zone : EMPRISES_PAYS[zone] ?? null;
};
export const nomDe = (element) => (element.cle ? t(element.cle) : element.nom);
