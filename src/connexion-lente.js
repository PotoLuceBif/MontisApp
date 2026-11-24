// Connexion lente (demande du propriétaire du 24 novembre 2026) : en montagne, la liaison traîne plus souvent
// qu'elle ne coupe. On ne juge que sur les tuiles, petites et toujours demandées : une tuile qui attend plus de
// 4 s, c'est le réseau. Les services lents par nature (Overpass, routage, gros fichiers) ne comptent pas.
import { SOURCE_VECTEUR } from './source-vecteur.js';

const SEUIL_TUILE = 4000; // ms : une tuile plus longue que ça
const SEUIL_FOND = 6000; // ms : le fond vectoriel (tuiles chargées dans un travailleur, hors de notre vue) incomplet
const RETOUR = 3000; // ms sans lenteur avant de retirer la pastille : pas de clignotement
const ADRESSE_TUILE = /\/\d{1,2}\/\d+\/\d+(?:@\dx)?(?:\.\w+)?(?:[?#]|$)|[?&]TILEMATRIX=\d/i;

export const estAdresseTuile = (adresse) => /^https?:/i.test(adresse) && ADRESSE_TUILE.test(adresse);

// `surChangement(lente)` à chaque changement d'état
export function suivreConnexionLente(map, surChangement) {
  const enCours = new Map(); // id → début
  let suivant = 0;
  let derniereLenteur = 0;
  let fondIncompletDepuis = null;
  let lente = false;

  // Les tuiles raster et de relief passent par fetch sur la page : on mesure leur attente
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (ressource, options) => {
    const adresse = typeof ressource === 'string' ? ressource : ressource?.url ?? String(ressource);
    if (!estAdresseTuile(adresse)) return fetchOriginal(ressource, options);
    const id = (suivant += 1);
    const debut = performance.now();
    enCours.set(id, debut);
    const fin = (reponse) => {
      enCours.delete(id);
      if (performance.now() - debut > SEUIL_TUILE) derniereLenteur = performance.now();
      return reponse;
    };
    return fetchOriginal(ressource, options).then(fin, (erreur) => {
      enCours.delete(id); // annulée par MapLibre ou en échec : hors ligne le dira
      throw erreur;
    });
  };

  function verifier() {
    const maintenant = performance.now();
    for (const debut of enCours.values()) if (maintenant - debut > SEUIL_TUILE) derniereLenteur = maintenant;
    // Fond vectoriel : seul signal pour ses tuiles, lues dans un travailleur
    const source = map.getSource(SOURCE_VECTEUR);
    const visible = map.getStyle()?.layers?.some((c) => c.source === SOURCE_VECTEUR && c.layout?.visibility !== 'none');
    // Pendant un déplacement, les tuiles manquent forcément : on ne compte qu'à l'arrêt
    if (source && visible && !source.loaded() && !document.hidden && !map.isMoving()) {
      fondIncompletDepuis ??= maintenant;
      if (maintenant - fondIncompletDepuis > SEUIL_FOND) derniereLenteur = maintenant;
    } else fondIncompletDepuis = null;
    // Le téléphone le dit lui-même (Chrome Android seulement)
    if (['slow-2g', '2g'].includes(navigator.connection?.effectiveType)) derniereLenteur = maintenant;
    const etat = derniereLenteur > 0 && maintenant - derniereLenteur < RETOUR;
    if (etat === lente) return;
    lente = etat;
    surChangement(lente);
  }

  setInterval(verifier, 1000);
  return { lente: () => lente };
}
