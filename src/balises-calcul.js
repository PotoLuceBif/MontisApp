// Lecture des fichiers ouverts de la FFVL et réunion avec OpenWindMap, sans doublons.
// Calculs purs, testés (tests/balises-calcul.test.js).

export const RAYON_DOUBLON = 200; // m : deux balises plus proches sont la même station pour l'œil

export const nombre = (valeur) =>
  valeur == null || String(valeur).trim() === '' ? Number.NaN : Number(valeur);

export function distanceMetres(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const positionValide = (station) =>
  Number.isFinite(station.lat) && Number.isFinite(station.lon)
  && station.lat >= -90 && station.lat <= 90 && station.lon >= -180 && station.lon <= 180
  && !(station.lat === 0 && station.lon === 0);

// La FFVL référence les balises OpenWindMap sans publier leurs relevés : elles viennent
// déjà d'OpenWindMap. Les coordonnées de contact des responsables ne sont jamais reprises.
export function lireBalisesFFVL(balises, releves, { nomDefaut = (id) => `FFVL ${id}` } = {}) {
  if (!Array.isArray(balises)) throw new Error('Format des balises FFVL inattendu.');
  const parId = new Map(
    (Array.isArray(releves) ? releves : [])
      .filter((releve) => releve && typeof releve === 'object' && releve.idbalise != null)
      .map((releve) => [String(releve.idbalise), releve])
  );
  return balises
    .filter((balise) => balise && typeof balise === 'object' && balise.idBalise != null)
    .filter((balise) => String(balise.station_type || '').toUpperCase() !== 'OPENWINDMAP')
    .map((balise) => {
      const id = String(balise.idBalise);
      const releve = parId.get(id) || {};
      const altitude = nombre(balise.altitude);
      return {
        id: `ffvl-${id}`,
        reseau: 'ffvl',
        nom: String(balise.nom || '').trim() || nomDefaut(id),
        description: String(balise.remarques || '').trim(),
        lat: nombre(balise.latitude),
        lon: nombre(balise.longitude),
        altitude: altitude > 0 ? altitude : null,
        eteinte: false,
        maintenance: Number(balise.en_maintenance) === 1,
        moyenne: nombre(releve.vitesseVentMoy),
        rafale: nombre(releve.vitesseVentMax),
        minimum: nombre(releve.vitesseVentMin),
        direction: nombre(releve.directVentMoy),
        temperature: nombre(releve.temperature),
        date: new Date(String(releve.date ?? '').replace(' ', 'T')).getTime(),
        lien: `https://www.balisemeteo.com/balise.php?idBalise=${encodeURIComponent(id)}`,
      };
    })
    .filter(positionValide);
}

const aUneMesure = (station) => Number.isFinite(station.moyenne) && Number.isFinite(station.direction)
  && Number.isFinite(station.date) && !station.eteinte;

// La meilleure de deux balises voisines : celle qui mesure, puis la plus récente
export function meilleure(a, b) {
  if (aUneMesure(a) !== aUneMesure(b)) return aUneMesure(a) ? a : b;
  return (b.date || 0) > (a.date || 0) ? b : a;
}

// Une balise FFVL à moins de RAYON_DOUBLON d'une balise OpenWindMap n'en garde qu'une ;
// la gardée connaît l'autre (`voisine`), pour que sa fiche la signale.
export function fusionnerReseaux(openwindmap, ffvl, rayon = RAYON_DOUBLON) {
  const retenues = new Map(openwindmap.map((station) => [station.id, station]));
  const cellule = rayon / 111000; // degrés de latitude, assez pour une grille de voisinage
  const grille = new Map();
  const cle = (lat, lon) => `${Math.floor(lat / cellule)}/${Math.floor(lon / cellule)}`;
  openwindmap.forEach((station) => {
    const ici = cle(station.lat, station.lon);
    grille.set(ici, [...(grille.get(ici) || []), station]);
  });
  const voisineDe = (station) => {
    const kLon = Math.max(0.05, Math.cos((station.lat * Math.PI) / 180));
    const pasLon = Math.ceil(1 / kLon);
    let proche = null;
    let ecart = Infinity;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -pasLon; dx <= pasLon; dx += 1) {
        const cases = grille.get(cle(station.lat + dy * cellule, station.lon + dx * cellule)) || [];
        cases.forEach((candidate) => {
          const d = distanceMetres(station, candidate);
          if (d < rayon && d < ecart) {
            proche = candidate;
            ecart = d;
          }
        });
      }
    }
    return proche;
  };
  const resultat = [];
  ffvl.forEach((station) => {
    const autre = voisineDe(station);
    if (!autre || !retenues.has(autre.id)) {
      resultat.push(station);
      return;
    }
    const gardee = meilleure(autre, station);
    const ecartee = gardee === station ? autre : station;
    const avecVoisine = { ...gardee, voisine: { nom: ecartee.nom, reseau: ecartee.reseau } };
    if (gardee === station) {
      retenues.delete(autre.id);
      resultat.push(avecVoisine);
    } else {
      retenues.set(autre.id, avecVoisine);
    }
  });
  return [...retenues.values(), ...resultat];
}
