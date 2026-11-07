// Terrains de pratique de la FFVL : lecture du fichier ouvert et accord du vent avec un décollage.
// Calculs purs, testés (tests/terrains-calcul.test.js).

export const SECTEURS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const PRATIQUES_VOL = ['parapente', 'delta', 'speed-riding'];
const FONCTIONS_DECOLLAGE = ['décollage', 'treuil', 'pente-école', 'tyrolienne'];

const liste = (texte) => String(texte ?? '').split(';').map((mot) => mot.trim()).filter(Boolean);
// Un champ fait seulement de ponctuation (« . », « - ») ne dit rien
const texte = (valeur) => {
  const propre = String(valeur ?? '').replace(/\r\n?/g, '\n').trim();
  return /[\p{L}\p{N}]/u.test(propre) ? propre : '';
};

// « SE;S;SO », mais aussi « SE,S,SO » ou « NO-N » selon les saisies : secteurs connus, sans doublon,
// dans l'ordre de la rose
export function lireSecteurs(valeur) {
  const vus = new Set(String(valeur ?? '').toUpperCase().split(/[;,\-\s]+/).filter((mot) => SECTEURS.includes(mot)));
  return SECTEURS.filter((secteur) => vus.has(secteur));
}

export function statutTerrain(statut) {
  const valeur = String(statut ?? '');
  if (valeur === 'interdit') return 'interdit';
  if (valeur === 'non_praticable_temporaire') return 'ferme';
  if (/autorisation/.test(valeur)) return 'autorisation';
  return 'ok';
}

// Décollage d'abord : un terrain qui sert aux deux se cherche surtout pour s'élancer
export function genreTerrain(fonctions) {
  if (fonctions.some((fonction) => FONCTIONS_DECOLLAGE.includes(fonction))) return 'decollage';
  if (fonctions.includes('atterrissage')) return 'atterrissage';
  return null;
}

// Seulement le vol libre (pas le kite ni le cerf-volant), avec une position et une fonction
export function lireTerrains(brut) {
  if (!Array.isArray(brut)) throw new Error('Format des terrains FFVL inattendu.');
  const terrains = [];
  brut.forEach((terrain) => {
    if (!terrain || typeof terrain !== 'object') return;
    const pratiques = liste(terrain.possible_usages_text);
    if (!pratiques.some((pratique) => PRATIQUES_VOL.includes(pratique))) return;
    const fonctions = liste(terrain.flying_functions_text);
    const genre = genreTerrain(fonctions);
    const lat = Number(terrain.latitude);
    const lon = Number(terrain.longitude);
    if (!genre || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180
      || (lat === 0 && lon === 0)) return;
    const altitude = Number(terrain.altitude);
    const marche = Number(terrain.walking_time_from_parking_minutes);
    terrains.push({
      id: String(terrain.suid),
      nom: texte(terrain.toponym) || texte(terrain.city),
      commune: texte(terrain.city),
      lat,
      lon,
      altitude: terrain.altitude != null && Number.isFinite(altitude) ? altitude : null,
      genre,
      fonctions,
      pratiques: pratiques.filter((pratique) => PRATIQUES_VOL.includes(pratique)),
      statut: statutTerrain(terrain.status),
      favorables: lireSecteurs(terrain.wind_orientations_ok),
      defavorables: lireSecteurs(terrain.wind_orientations_nok),
      niveau: /^ippi\d$/i.test(terrain.terrain_experience_conseillee ?? '') ? terrain.terrain_experience_conseillee.slice(4) : null,
      marche: marche > 0 ? marche : null,
      alerte: texte(terrain.alert_msg),
      consignes: texte(terrain.warnings).toLowerCase() === 'ras' ? '' : texte(terrain.warnings),
      restrictions: texte(terrain.restrictions),
      regles: texte(terrain.flying_rules_description),
      conditions: texte(terrain.ideal_conditions_description),
      description: texte(terrain.description),
      acces: texte(terrain.access_description),
      modification: Date.parse(terrain.last_modification_datetime ?? '') || null,
    });
  });
  return terrains;
}

// Une balise mesure-t-elle sur le terrain même : à 100 m au plus, et à 100 m d'altitude près
// quand les deux altitudes sont connues
export const ECART_SUR_PLACE = 100;
export function baliseSurPlace(distance, altitudeTerrain, altitudeBalise) {
  if (!Number.isFinite(distance) || distance > ECART_SUR_PLACE) return false;
  if (!Number.isFinite(altitudeTerrain) || !Number.isFinite(altitudeBalise)) return true;
  return Math.abs(altitudeTerrain - altitudeBalise) <= ECART_SUR_PLACE;
}

export function secteurDe(direction) {
  if (!Number.isFinite(direction)) return null;
  return SECTEURS[Math.round((((direction % 360) + 360) % 360) / 45) % 8];
}

// Le vent qui vient de `direction` est-il dans l'axe du décollage ?
export function accordVent(direction, { favorables = [], defavorables = [] } = {}) {
  const secteur = secteurDe(direction);
  if (!secteur) return 'inconnu';
  if (favorables.includes(secteur)) return 'favorable';
  if (defavorables.includes(secteur)) return 'defavorable';
  return 'inconnu';
}

// Le pin d'un terrain : fermé ou interdit d'abord, puis la fonction (le treuil prend celui du décollage)
export function pinTerrain({ statut, genre, fonctions = [] }) {
  if (statut === 'interdit' || statut === 'ferme') return 'terrain-ferme';
  const ecole = fonctions.includes('pente-école') && !fonctions.some((f) => ['décollage', 'treuil', 'tyrolienne'].includes(f));
  if (ecole) return 'terrain-pente-ecole';
  return genre === 'decollage' ? 'terrain-decollage' : 'terrain-atterrissage';
}

// L'anneau des orientations, un caractère par secteur depuis le nord : o favorable, n à éviter,
// - non renseigné. Vide pour un terrain fermé : il n'a pas d'anneau.
export function codeAnneau({ statut, favorables = [], defavorables = [] }) {
  if (statut === 'interdit' || statut === 'ferme') return '';
  return SECTEURS.map((secteur) => (favorables.includes(secteur) ? 'o' : defavorables.includes(secteur) ? 'n' : '-')).join('');
}

export function terrainsEnGeoJSON(terrains) {
  return {
    type: 'FeatureCollection',
    features: terrains.map((terrain) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [terrain.lon, terrain.lat] },
      properties: {
        id: terrain.id,
        nom: terrain.nom,
        // Interdit et fermé se lisent pareil sur la carte : ne pas s'y poser
        classe: terrain.statut === 'interdit' || terrain.statut === 'ferme' ? 'interdit' : terrain.genre,
        autorisation: terrain.statut === 'autorisation',
        pin: pinTerrain(terrain),
        anneau: codeAnneau(terrain),
      },
    })),
  };
}
