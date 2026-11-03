// Demandes adressées à un module chargé à la demande : il les reprend à son ouverture,
// ou tout de suite s'il est déjà ouvert (événement `montis:demande`)
const enAttente = new Map();

export function deposer(cle, valeur) {
  enAttente.set(cle, valeur);
  window.dispatchEvent(new CustomEvent('montis:demande', { detail: cle }));
}

export function reprendre(cle) {
  const valeur = enAttente.get(cle);
  enAttente.delete(cle);
  return valeur;
}
