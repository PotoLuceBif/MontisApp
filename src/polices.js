// Police de la carte : Noto Sans, servie par OpenFreeMap comme les tuiles du fond.
// Une seule police par pile : OpenFreeMap ne sert pas les piles combinées (« A,B »).
export const ADRESSE_POLICES = 'https://tiles.openfreemap.org/fonts';
export const POLICE = ['Noto Sans Regular'];
export const POLICE_GRAS = ['Noto Sans Bold'];
export const POLICE_ITALIQUE = ['Noto Sans Italic'];
export const POLICES_CARTE = [POLICE, POLICE_GRAS, POLICE_ITALIQUE].map(([nom]) => nom);
