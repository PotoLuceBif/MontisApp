// Les pins de la carte (public/pins). Ce sont des marqueurs HTML : ils gardent le survol, l'appui long
// et le clavier, et ne dépendent pas du style de la carte.
const LARGEUR_PIN = 48; // px à l'écran pour une image de 96
const POINTE_DEPUIS_LE_BAS = 8.5 * (LARGEUR_PIN / 96);

// La pointe du pin tombe sur la coordonnée, pas le bas de l'image
export const DECALAGE_PIN = [0, POINTE_DEPUIS_LE_BAS];

function urlPin(nom, etat) {
  return `/pins/${nom}${etat ? `-${etat}` : ''}.svg`;
}

export function imagePin(nom, selectionne = false) {
  const image = document.createElement('img');
  image.className = 'repere-pin';
  image.src = urlPin(nom, selectionne ? 'selected' : '');
  image.alt = '';
  image.draggable = false;
  return image;
}

// Un pin seul sur la carte. L'image a besoin d'un parent : MapLibre place le marqueur avec `transform`,
// que celui de .repere-pin écraserait. État : '' (normal), 'selected' ou 'disabled'.
export function creerPinSeul(nom, etat = '') {
  const image = imagePin(nom);
  image.src = urlPin(nom, etat);
  const element = document.createElement('div');
  element.className = 'repere-seul';
  element.append(image);
  return {
    element,
    changerEtat(nouvelEtat = '') {
      image.src = urlPin(nom, nouvelEtat);
    },
  };
}
