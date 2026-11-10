// Demandes adressées à un module chargé à la demande : il les reprend à son ouverture,
// ou tout de suite s'il est déjà ouvert (événement `montis:demande`)
const demandes = new Map();

export function deposer(cle, valeur) {
  demandes.set(cle, valeur);
  window.dispatchEvent(new CustomEvent('montis:demande', { detail: cle }));
}

export function reprendre(cle) {
  const valeur = demandes.get(cle);
  demandes.delete(cle);
  return valeur;
}

// Une demande attend-elle ce module ? (sans la reprendre)
export const enAttente = (cle) => demandes.has(cle);
