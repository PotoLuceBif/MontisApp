// Calculs purs de la visite de la Lune (lot 4.10) : échelle (MapLibre dessine un globe de la taille de la
// Terre), éclairage réel (point subsolaire sélénographique), reprojection des tuiles plate carrée de la NASA
// en Mercator, noms traduits avec leur latin, direction de la Terre et du soleil dans le ciel lunaire.
import { getMoonIllumination } from 'suncalc';

const RAD = Math.PI / 180;
export const RAYON_LUNE = 1737.4; // km, sphère de référence de LOLA
export const RAYON_TERRE = 6371.0088; // km, celui de MapLibre
// Facteur Lune → globe de MapLibre : relief exagéré d'autant pour garder ses vraies proportions, distances
// et altitudes lues sur la carte divisées d'autant
export const ECHELLE_LUNE = RAYON_TERRE / RAYON_LUNE;

export const altitudeReelle = (altitudeCarte) => altitudeCarte / ECHELLE_LUNE;
export const distanceReelle = (metresCarte) => metresCarte / ECHELLE_LUNE;

// ---------- Éclairage ----------
// Le soleil est au zénith en ce point de la Lune. Sa longitude suit l'élongation de la Lune (phase de suncalc,
// 0 nouvelle, 0,5 pleine) : à la nouvelle lune, il éclaire la face cachée (180°) ; à la pleine lune, la face
// visible (0°) ; au premier quartier, le bord est (mer des Crises, à droite vu de l'hémisphère Nord).
// Latitude et libration (quelques degrés) négligées.
export function pointSubsolaireLune(date) {
  const { phase } = getMoonIllumination(new Date(date));
  return { lng: normaliserLng(180 - 360 * phase), lat: 0 };
}
export const normaliserLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// Hauteur du soleil (degrés) en un point de la Lune
export function hauteurSoleilLune(lng, lat, sub) {
  const s = Math.sin(lat * RAD) * Math.sin(sub.lat * RAD)
    + Math.cos(lat * RAD) * Math.cos(sub.lat * RAD) * Math.cos((lng - sub.lng) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

// Opacité de la nuit : sans atmosphère, le terminateur est net ; un degré de fondu pour ne pas créneler
export const NUIT_MAX = 0.86;
export function opaciteNuit(hauteur) {
  if (hauteur >= 0.5) return 0;
  if (hauteur <= -0.5) return NUIT_MAX;
  return NUIT_MAX * (0.5 - hauteur);
}

// ---------- Tuiles ----------
// Emprise d'une tuile Mercator
export function boiteTuile(z, x, y) {
  const n = 2 ** z;
  const lat = (v) => Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) / RAD;
  return { ouest: (x / n) * 360 - 180, est: ((x + 1) / n) * 360 - 180, nord: lat(y), sud: lat(y + 1) };
}
// Latitude du centre de la ligne `py` d'une tuile Mercator de `cote` pixels
export function latitudeLigne(z, y, py, cote) {
  const v = (y + (py + 0.5) / cote) / 2 ** z;
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * v))) / RAD;
}
// Niveau plate carrée de même finesse à l'équateur (2^(n+1) × 2^n tuiles de 256 px au niveau n), plafonné
export const niveauPlateCarree = (z, max) => Math.max(0, Math.min(max, z - 1));
// Près des pôles, Mercator étire les tuiles : il faut une image plate carrée plus fine, sinon tout se pixelise
export function niveauPourTuile(z, y, max) {
  const b = boiteTuile(z, 0, y);
  const lat = Math.min(Math.abs(b.nord), Math.abs(b.sud), 89);
  const etirement = (b.nord > 0) === (b.sud > 0) ? Math.log2(1 / Math.cos(lat * RAD)) : 0;
  return Math.max(0, Math.min(max, z - 1 + Math.round(etirement)));
}

// ---------- Pôles ----------
// Au-delà de 85°, MapLibre étire la dernière rangée de pixels jusqu'au pôle : des rayons. L'image se fond donc
// vers une teinte unie de 83,6° à 85°, et deux calottes de cette teinte couvrent le reste.
export const GRIS_POLAIRE = [84, 84, 87];
export const fonduPolaire = (lat) => Math.max(0, Math.min(1, (Math.abs(lat) - 83.6) / 1.4));
// Bandes au bord du monde, en tranches de longitude (nuit lunaire comprise en temps réel)
export function calottesLune(sub = null, secteurs = 48) {
  const pas = 360 / secteurs;
  const features = [];
  for (const nord of [true, false]) {
    const [bas, haut] = nord ? [84.9, 86] : [-86, -84.9];
    for (let i = 0; i < secteurs; i += 1) {
      const ouest = -180 + i * pas;
      const nuit = sub ? opaciteNuit(hauteurSoleilLune(ouest + pas / 2, nord ? 85 : -85, sub)) : 0;
      const couleur = GRIS_POLAIRE.map((c, k) => Math.round(c * (1 - nuit) + [6, 8, 16][k] * nuit));
      features.push({
        type: 'Feature',
        properties: { couleur: `rgb(${couleur.join(', ')})` },
        geometry: { type: 'Polygon', coordinates: [[[ouest, bas], [ouest + pas, bas], [ouest + pas, haut], [ouest, haut], [ouest, bas]]] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
// Position en pixels, au niveau n, d'un point (colonne 0 à -180°, ligne 0 à 90° N)
export function pixelPlateCarree(n, lng, lat, cote = 256) {
  return { x: ((lng + 180) / 360) * 2 ** (n + 1) * cote, y: ((90 - lat) / 180) * 2 ** n * cote };
}
// Tuiles plate carrée qui couvrent une tuile Mercator : colonnes et lignes, bornées au monde
export function tuilesCouvrantes(z, x, y, n, cote = 256) {
  const b = boiteTuile(z, x, y);
  const hg = pixelPlateCarree(n, b.ouest, b.nord, cote);
  const bd = pixelPlateCarree(n, b.est, b.sud, cote);
  const borne = (v, m) => Math.max(0, Math.min(m - 1, v));
  return {
    col0: borne(Math.floor(hg.x / cote), 2 ** (n + 1)),
    col1: borne(Math.ceil(bd.x / cote) - 1, 2 ** (n + 1)),
    lig0: borne(Math.floor(hg.y / cote), 2 ** n),
    lig1: borne(Math.ceil(bd.y / cote) - 1, 2 ** n),
  };
}

// ---------- Noms ----------
// Le gazetteer de l'IAU ne donne que le latin. Mers, lacs, golfes, marais, chaînes et quelques lieux célèbres
// traduits ici ; les cratères portent des noms de personnes, qui ne se traduisent pas.
const T = (fr, en) => ({ fr, en });
export const TRADUCTIONS = {
  'Oceanus Procellarum': T('Océan des Tempêtes', 'Ocean of Storms'),
  'Mare Imbrium': T('Mer des Pluies', 'Sea of Showers'),
  'Mare Serenitatis': T('Mer de la Sérénité', 'Sea of Serenity'),
  'Mare Tranquillitatis': T('Mer de la Tranquillité', 'Sea of Tranquility'),
  'Mare Crisium': T('Mer des Crises', 'Sea of Crises'),
  'Mare Fecunditatis': T('Mer de la Fécondité', 'Sea of Fecundity'),
  'Mare Nectaris': T('Mer du Nectar', 'Sea of Nectar'),
  'Mare Nubium': T('Mer des Nuées', 'Sea of Clouds'),
  'Mare Humorum': T('Mer des Humeurs', 'Sea of Moisture'),
  'Mare Frigoris': T('Mer du Froid', 'Sea of Cold'),
  'Mare Vaporum': T('Mer des Vapeurs', 'Sea of Vapors'),
  'Mare Cognitum': T('Mer de la Connaissance', 'Sea that has Become Known'),
  'Mare Insularum': T('Mer des Îles', 'Sea of Islands'),
  'Mare Orientale': T('Mer Orientale', 'Eastern Sea'),
  'Mare Moscoviense': T('Mer de Moscou', 'Sea of Muscovy'),
  'Mare Marginis': T('Mer Bordière', 'Sea of the Edge'),
  'Mare Smythii': T('Mer de Smyth', "Smyth's Sea"),
  'Mare Australe': T('Mer Australe', 'Southern Sea'),
  'Mare Undarum': T('Mer des Ondes', 'Sea of Waves'),
  'Mare Spumans': T('Mer Écumeuse', 'Foaming Sea'),
  'Mare Anguis': T('Mer du Serpent', 'Serpent Sea'),
  'Mare Ingenii': T('Mer de l’Ingéniosité', 'Sea of Cleverness'),
  'Mare Humboldtianum': T('Mer de Humboldt', "Humboldt's Sea"),
  'Sinus Iridum': T('Golfe des Iris', 'Bay of Rainbows'),
  'Sinus Medii': T('Golfe du Centre', 'Central Bay'),
  'Sinus Aestuum': T('Golfe Torride', 'Seething Bay'),
  'Sinus Roris': T('Golfe de la Rosée', 'Bay of Dew'),
  'Sinus Amoris': T('Golfe de l’Amour', 'Bay of Love'),
  'Sinus Concordiae': T('Golfe de la Concorde', 'Bay of Harmony'),
  'Sinus Successus': T('Golfe du Succès', 'Bay of Success'),
  'Sinus Fidei': T('Golfe de la Foi', 'Bay of Trust'),
  'Sinus Honoris': T('Golfe de l’Honneur', 'Bay of Honor'),
  'Sinus Lunicus': T('Golfe de Lunik', 'Lunik Bay'),
  'Sinus Asperitatis': T('Golfe de l’Âpreté', 'Bay of Roughness'),
  'Sinus Viscositatis': T('Golfe de la Viscosité', 'Bay of Viscosity'),
  'Lacus Somniorum': T('Lac des Songes', 'Lake of Dreams'),
  'Lacus Mortis': T('Lac de la Mort', 'Lake of Death'),
  'Lacus Veris': T('Lac du Printemps', 'Spring Lake'),
  'Lacus Autumni': T('Lac de l’Automne', 'Autumn Lake'),
  'Lacus Aestatis': T('Lac de l’Été', 'Summer Lake'),
  'Lacus Hiemalis': T('Lac de l’Hiver', 'Winter Lake'),
  'Lacus Temporis': T('Lac du Temps', 'Lake of Time'),
  'Lacus Excellentiae': T('Lac de l’Excellence', 'Lake of Excellence'),
  'Lacus Timoris': T('Lac de la Peur', 'Lake of Fear'),
  'Lacus Solitudinis': T('Lac de la Solitude', 'Lake of Solitude'),
  'Lacus Bonitatis': T('Lac de la Bonté', 'Lake of Goodness'),
  'Lacus Doloris': T('Lac de la Douleur', 'Lake of Sorrow'),
  'Lacus Felicitatis': T('Lac du Bonheur', 'Lake of Happiness'),
  'Lacus Gaudii': T('Lac de la Joie', 'Lake of Joy'),
  'Lacus Tenebrarum': T('Lac des Ténèbres', 'Lake of Darkness'),
  'Lacus Lenitatis': T('Lac de la Douceur', 'Lake of Tenderness'),
  'Lacus Spei': T('Lac de l’Espérance', 'Lake of Hope'),
  'Lacus Odii': T('Lac de la Haine', 'Lake of Hatred'),
  'Lacus Perseverantiae': T('Lac de la Persévérance', 'Lake of Perseverance'),
  'Lacus Luxuriae': T('Lac du Luxe', 'Lake of Luxury'),
  'Lacus Oblivionis': T('Lac de l’Oubli', 'Lake of Forgetfulness'),
  'Palus Putredinis': T('Marais de la Putréfaction', 'Marsh of Decay'),
  'Palus Epidemiarum': T('Marais des Épidémies', 'Marsh of Epidemics'),
  'Palus Somni': T('Marais du Sommeil', 'Marsh of Sleep'),
  'Montes Apenninus': T('Monts Apennins', 'Apennine Mountains'),
  'Montes Alpes': T('Alpes lunaires', 'Lunar Alps'),
  'Montes Caucasus': T('Monts Caucase', 'Caucasus Mountains'),
  'Montes Carpatus': T('Monts Carpates', 'Carpathian Mountains'),
  'Montes Jura': T('Monts Jura', 'Jura Mountains'),
  'Montes Pyrenaeus': T('Monts Pyrénées', 'Pyrenees Mountains'),
  'Montes Haemus': T('Monts Hémus', 'Haemus Mountains'),
  'Montes Taurus': T('Monts Taurus', 'Taurus Mountains'),
  'Montes Riphaeus': T('Monts Riphées', 'Riphean Mountains'),
  'Montes Cordillera': T('Cordillère', 'Cordillera Mountains'),
  'Montes Rook': T('Monts Rook', 'Rook Mountains'),
  'Montes Recti': T('Monts Droits', 'Straight Range'),
  'Montes Teneriffe': T('Monts Tenerife', 'Teneriffe Mountains'),
  'Montes Spitzbergen': T('Monts Spitzberg', 'Spitzbergen Mountains'),
  'Montes Archimedes': T('Monts Archimède', 'Archimedes Mountains'),
  'Montes Agricola': T('Monts Agricola', 'Agricola Mountains'),
  'Montes Harbinger': T('Monts Harbinger', 'Harbinger Mountains'),
  'Vallis Alpes': T('Vallée des Alpes', 'Alpine Valley'),
  'Vallis Schröteri': T('Vallée de Schröter', "Schröter's Valley"),
  'Rupes Recta': T('Mur Droit', 'Straight Wall'),
  'Rupes Altai': T('Escarpement Altaï', 'Altai Scarp'),
  'Statio Tranquillitatis': T('Base de la Tranquillité', 'Tranquility Base'),
  'Planitia Descensus': T('Plaine de la Descente', 'Plain of Descent'),
};

// Nom à afficher et son latin (`null` quand il n'y a rien à ajouter)
export function nomsLieu(latin, langue = 'fr') {
  const traduit = TRADUCTIONS[latin]?.[langue === 'en' ? 'en' : 'fr'];
  if (traduit) return { nom: traduit, latin };
  // « Mons Hadley » : un mont nommé d'après une personne ou un lieu
  const mons = /^Mons (.+)$/.exec(latin);
  if (mons) return { nom: `${langue === 'en' ? 'Mount' : 'Mont'} ${mons[1]}`, latin };
  return { nom: latin, latin: null };
}

// Genre d'un lieu (codes du gazetteer) : clé de traduction `lune-visite.type-<genre>`
const GENRES = {
  AA: 'cratere', ME: 'mer', OC: 'ocean', LC: 'lac', SI: 'golfe', PA: 'marais', MO: 'mont', VA: 'vallee',
  RI: 'rainure', DO: 'dorsale', RU: 'escarpement', CA: 'chaine', PR: 'cap', ST: 'station', PL: 'plaine',
  AL: 'albedo', LF: 'site',
};
export const genreLieu = (code) => GENRES[code] ?? 'lieu';
const GRANDS = new Set(['ME', 'OC']);
const ETENDUS = new Set(['LC', 'SI', 'PA', 'MO', 'VA', 'RU', 'PL']);

// Zoom à partir duquel un nom apparaît : mers d'abord, puis selon la taille
// Vue d'ensemble légère (demande du propriétaire du 16 novembre 2026) : les grandes mers seules, puis les détails
// en se rapprochant ; rainures, dorsales et chaînes de cratères un cran plus tard
const DETAILS = new Set(['RI', 'DO', 'CA', 'LF', 'PR', 'ST', 'AL']);
export function zoomNom(code, diametre) {
  if (GRANDS.has(code)) return diametre > 500 ? 0 : 2.2;
  const d = diametre * (ETENDUS.has(code) ? 1.5 : 1);
  const retard = DETAILS.has(code) ? 1 : 0;
  if (d >= 200) return 2.8 + retard;
  if (d >= 100) return 3.5 + retard;
  if (d >= 50) return 4.3 + retard;
  if (d >= 25) return 5.2 + retard;
  if (d >= 10) return 6.2 + retard;
  return 7.2 + retard;
}

// Lieux du gazetteer (`[nom, code, diamètre, lng, lat, origine]`) en GeoJSON pour la carte
export function lieuxEnGeojson(liste, langue = 'fr') {
  return {
    type: 'FeatureCollection',
    features: liste.map(([latin, code, diametre, lng, lat, origine], i) => {
      const { nom, latin: sousTitre } = nomsLieu(latin, langue);
      return {
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: {
          nom, latin: sousTitre ?? '', code, genre: genreLieu(code), diametre, origine,
          z: zoomNom(code, diametre), grand: GRANDS.has(code) ? 1 : 0, rang: -diametre,
        },
      };
    }),
  };
}

// Sites d'alunissage, écrits à la main (position approximative à quelques centaines de mètres)
export const SITES_ALUNISSAGE = [
  { id: 'apollo-11', nom: 'Apollo 11', date: '1969-07-20', lng: 23.473, lat: 0.674, equipage: true },
  { id: 'apollo-12', nom: 'Apollo 12', date: '1969-11-19', lng: -23.422, lat: -3.012, equipage: true },
  { id: 'apollo-14', nom: 'Apollo 14', date: '1971-02-05', lng: -17.471, lat: -3.645, equipage: true },
  { id: 'apollo-15', nom: 'Apollo 15', date: '1971-07-30', lng: 3.634, lat: 26.132, equipage: true },
  { id: 'apollo-16', nom: 'Apollo 16', date: '1972-04-21', lng: 15.5, lat: -8.973, equipage: true },
  { id: 'apollo-17', nom: 'Apollo 17', date: '1972-12-11', lng: 30.772, lat: 20.191, equipage: true },
  { id: 'luna-9', nom: 'Luna 9', date: '1966-02-03', lng: -64.37, lat: 7.08 },
  { id: 'surveyor-1', nom: 'Surveyor 1', date: '1966-06-02', lng: -43.339, lat: -2.475 },
  { id: 'surveyor-3', nom: 'Surveyor 3', date: '1967-04-20', lng: -23.418, lat: -3.016 },
  { id: 'luna-16', nom: 'Luna 16', date: '1970-09-20', lng: 56.364, lat: -0.513 },
  { id: 'luna-17', nom: 'Luna 17 · Lunokhod 1', date: '1970-11-17', lng: -35.0, lat: 38.24 },
  { id: 'luna-21', nom: 'Luna 21 · Lunokhod 2', date: '1973-01-15', lng: 30.45, lat: 25.85 },
  { id: 'luna-24', nom: 'Luna 24', date: '1976-08-18', lng: 62.213, lat: 12.715 },
  { id: 'change-3', nom: 'Chang’e 3', date: '2013-12-14', lng: -19.512, lat: 44.121 },
  { id: 'change-4', nom: 'Chang’e 4', date: '2019-01-03', lng: 177.599, lat: -45.445 },
  { id: 'change-5', nom: 'Chang’e 5', date: '2020-12-01', lng: -51.916, lat: 43.058 },
  { id: 'chandrayaan-3', nom: 'Chandrayaan-3', date: '2023-08-23', lng: 32.319, lat: -69.373 },
  { id: 'slim', nom: 'SLIM', date: '2024-01-19', lng: 25.251, lat: -13.316 },
  { id: 'im-1', nom: 'Odysseus (IM-1)', date: '2024-02-22', lng: 1.44, lat: -80.13 },
  { id: 'change-6', nom: 'Chang’e 6', date: '2024-06-01', lng: -153.986, lat: -41.638 },
  { id: 'blue-ghost-1', nom: 'Blue Ghost 1', date: '2025-03-02', lng: 61.81, lat: 18.56 },
];
export const sitesEnGeojson = () => ({
  type: 'FeatureCollection',
  features: SITES_ALUNISSAGE.map((site) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [site.lng, site.lat] },
    properties: { ...site, equipage: site.equipage ? 1 : 0 },
  })),
});

// ---------- Ciel lunaire ----------
// Direction d'un point de la sphère (« zénith » au-dessus de lui), vue d'un autre point : hauteur et azimut
// (degrés depuis le nord). La Terre est au zénith du point (0°, 0°), à peu près fixe dans le ciel lunaire ;
// le soleil au zénith du point subsolaire. Ils sont assez loin pour que la parallaxe ne compte pas.
export function directionDepuis(lng, lat, cible) {
  const p1 = lat * RAD;
  const p2 = cible.lat * RAD;
  const dl = (cible.lng - lng) * RAD;
  const cosDistance = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  const hauteur = 90 - Math.acos(Math.max(-1, Math.min(1, cosDistance))) / RAD;
  const azimut = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD;
  return { hauteur, azimut: (azimut + 360) % 360 };
}
export const POINT_SOUS_TERRE = { lng: 0, lat: 0 };
// Vue d'un point de la face visible, la Terre est presque au zénith : hors de portée de la caméra. Pour la voir,
// on va près du bord de la face visible (à `distance` degrés du point sous la Terre, du côté du centre actuel) :
// elle s'y lève juste au-dessus de l'horizon. Renvoie le point et le cap qui regarde vers elle.
export function pointVersTerre(lng, lat, distance = 86) {
  const versCentre = directionDepuis(POINT_SOUS_TERRE.lng, POINT_SOUS_TERRE.lat, { lng, lat });
  const loin = 90 - versCentre.hauteur; // distance angulaire au point sous la Terre
  const cap = loin < 1 ? 90 : versCentre.azimut; // au centre de la face visible : vers l'est (mer des Crises)
  const d = distance * RAD;
  const c0 = cap * RAD;
  const latArrivee = Math.asin(Math.sin(d) * Math.cos(c0));
  const lngArrivee = Math.atan2(Math.sin(c0) * Math.sin(d), Math.cos(d));
  const point = { lng: normaliserLng(lngArrivee / RAD), lat: latArrivee / RAD };
  return { ...point, cap: directionDepuis(point.lng, point.lat, POINT_SOUS_TERRE).azimut };
}
// Vue de la Lune, la Terre est « pleine » à la nouvelle lune, et inversement
export const fractionTerre = (fractionLune) => 1 - fractionLune;

// Coordonnées sélénographiques lisibles : « 0,674° N · 23,473° E »
export function texteCoordonnees(lng, lat, { nombre = (v) => v.toFixed(3), langue = 'fr' } = {}) {
  return `${nombre(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'} · ${nombre(Math.abs(lng))}° ${lng >= 0 ? 'E' : langue === 'en' ? 'W' : 'O'}`;
}

// ---------- Altitude lue dans les tuiles de relief (public/data/lune/relief) ----------
// Tuile Mercator et pixel d'un point, au zoom `z` (tuiles de `cote` pixels)
export function pixelTuile(lng, lat, z, cote = 512) {
  const n = 2 ** z;
  const l = Math.max(-85.0511, Math.min(85.0511, lat)) * RAD;
  const mx = ((normaliserLng(lng) + 180) / 360) * n;
  const my = ((1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.floor(mx));
  const y = Math.min(n - 1, Math.floor(my));
  return { x, y, px: Math.min(cote - 1, Math.floor((mx - x) * cote)), py: Math.min(cote - 1, Math.floor((my - y) * cote)) };
}
// Encodage Terrarium : altitude vraie de la Lune, en mètres (sans l'exagération de la carte)
export const decoderTerrarium = (r, v, b) => r * 256 + v + b / 256 - 32768;
