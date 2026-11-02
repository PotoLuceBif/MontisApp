// Les pins de la carte (public/pins). Ce sont des marqueurs HTML : ils gardent le survol, l'appui long
// et le clavier, et ne dépendent pas du style de la carte.
const LARGEUR_PIN = 48; // px à l'écran pour une image de 96
const POINTE_DEPUIS_LE_BAS = 8.5 * (LARGEUR_PIN / 96);

// La pointe du pin tombe sur la coordonnée, pas le bas de l'image
export const DECALAGE_PIN = [0, POINTE_DEPUIS_LE_BAS];

export function imagePin(nom, selectionne = false) {
  const image = document.createElement('img');
  image.className = 'repere-pin';
  image.src = `/pins/${nom}${selectionne ? '-selected' : ''}.svg`;
  image.alt = '';
  image.draggable = false;
  return image;
}
