// Lecture d'un fichier GPX : commune aux activités à parcours.
import { distance } from './rando-api.js';

const LATITUDE_MAX_MERCATOR = 85.05112878;

export function lireGpx(contenu, nomFichier) {
  const documentXml = new DOMParser().parseFromString(contenu, 'application/xml');
  if (
    documentXml.getElementsByTagName('parsererror').length ||
    documentXml.documentElement.localName !== 'gpx'
  ) {
    throw new Error('Le fichier ne contient pas un GPX valide.');
  }

  const lirePoints = (element, nomPoint) => {
    const points = [];
    for (const point of element.getElementsByTagNameNS('*', nomPoint)) {
      const longitude = point.getAttribute('lon');
      const latitude = point.getAttribute('lat');
      if (longitude == null || !longitude.trim() || latitude == null || !latitude.trim()) continue;
      const lng = Number(longitude);
      const lat = Number(latitude);
      if (
        !Number.isFinite(lng) || lng < -180 || lng > 180 ||
        !Number.isFinite(lat) || lat < -LATITUDE_MAX_MERCATOR || lat > LATITUDE_MAX_MERCATOR
      ) continue;
      points.push([lng, lat]);
    }
    return points;
  };

  const lignesTrace = [];
  for (const segment of documentXml.getElementsByTagNameNS('*', 'trkseg')) {
    const points = lirePoints(segment, 'trkpt');
    if (points.length > 1) lignesTrace.push(points);
  }
  if (!lignesTrace.length) {
    for (const route of documentXml.getElementsByTagNameNS('*', 'rte')) {
      const points = lirePoints(route, 'rtept');
      if (points.length > 1) lignesTrace.push(points);
    }
  }
  if (!lignesTrace.length) {
    throw new Error('Aucun tracé valide trouvé (il faut au moins deux points GPS).');
  }

  const chaine = lignesTrace.flat();
  const longueur = lignesTrace.reduce((total, ligne) => {
    for (let i = 1; i < ligne.length; i++) total += distance(ligne[i - 1], ligne[i]);
    return total;
  }, 0);
  if (longueur <= 0) throw new Error('Le tracé ne contient pas de distance exploitable.');

  const metadata = documentXml.getElementsByTagNameNS('*', 'metadata')[0];
  const nomGpx =
    metadata?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() ||
    documentXml.getElementsByTagNameNS('*', 'trk')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() ||
    documentXml.getElementsByTagNameNS('*', 'rte')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();
  const nom = nomGpx || nomFichier.replace(/\.gpx$/i, '') || 'Parcours importé';
  return { nom, trace: { lignes: lignesTrace, chaine }, longueur };
}
