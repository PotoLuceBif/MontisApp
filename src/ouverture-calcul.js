// Ouverture sur sa position : au premier lancement, ou après une absence. Sinon on reprend la
// dernière vue, pour ne pas perdre sa place en revenant d'une autre appli. Calcul pur, testé
// (tests/ouverture-calcul.test.js).
export const ABSENCE_LONGUE = 6 * 60 * 60 * 1000;

// `derniereVisite` : dernier moment où l'appli était utilisée (ms), ou null si jamais
export function doitCentrerSurPosition({ vueSauvee, derniereVisite, maintenant }) {
  if (!vueSauvee) return true;
  if (!Number.isFinite(derniereVisite)) return true;
  return maintenant - derniereVisite >= ABSENCE_LONGUE;
}
