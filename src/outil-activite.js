// Un outil d'activité qui prend la carte (tracé, recherche de lieux, portée de vol) le signale :
// le menu retire alors la météo affichée (radar, analyse du vent). Ouvrir le menu ou changer
// d'activité, sans rien lancer, la laisse en place.
export const OUTIL_ACTIVITE = 'outil-activite';
export const annoncerOutilActivite = () => window.dispatchEvent(new Event(OUTIL_ACTIVITE));
