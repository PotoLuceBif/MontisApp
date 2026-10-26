// Barre en haut à gauche : contient le sélecteur 2D | 3D et la recherche
let barre = null;

export function obtenirBarre() {
  if (!barre) {
    barre = document.createElement('div');
    barre.id = 'barre-haut';
    document.body.appendChild(barre);
  }
  return barre;
}