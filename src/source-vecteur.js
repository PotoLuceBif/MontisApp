// Source vectorielle OpenFreeMap du fond Montis.
//
// Une source déclarée par `url` attend son TileJSON : s'il échoue, MapLibre n'émet jamais
// « load » et rien de Montis ne s'affiche. La source démarre donc avec des adresses de tuiles
// directes (les dernières connues), et le TileJSON ne sert qu'à les mettre à jour, à côté.
import { lire, ecrire } from './reglages.js';
import { poser } from './i18n.js';

export const SOURCE_VECTEUR = 'osm-vecteur';
export const DESCRIPTION_FOND = 'https://tiles.openfreemap.org/planet';

// Version inconnue : le service worker range les tuiles sans leur version, il les retrouve quand même
const TUILES_PAR_DEFAUT = ['https://tiles.openfreemap.org/planet/montis/{z}/{x}/{y}.pbf'];
const CLE_TUILES = 'fond-tuiles';
const DELAI_DESCRIPTION = 10000;
const NOUVEL_ESSAI = 120000;

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> · Données © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const tuilesValides = (tuiles) =>
  Array.isArray(tuiles) && tuiles.length > 0 && tuiles.every((t) => typeof t === 'string' && t.startsWith('https://tiles.openfreemap.org/'));

function tuilesConnues() {
  const tuiles = lire(CLE_TUILES, null);
  return tuilesValides(tuiles) ? tuiles : TUILES_PAR_DEFAUT;
}

export const definitionSourceVecteur = () => ({
  type: 'vector',
  tiles: tuilesConnues(),
  minzoom: 0,
  maxzoom: 14,
  attribution: ATTRIBUTION,
});

export function assurerSourceVecteur(map) {
  if (!map.getSource(SOURCE_VECTEUR)) map.addSource(SOURCE_VECTEUR, definitionSourceVecteur());
}

// Demande le TileJSON et met à jour les adresses des tuiles. En cas d'échec, un message le dit
// et un nouvel essai a lieu au retour du réseau, puis toutes les deux minutes.
export function suivreDescriptionFond(map) {
  const pastille = document.createElement('div');
  pastille.className = 'hl-pastille fond-pastille';
  pastille.setAttribute('role', 'status');
  pastille.hidden = true;
  poser(pastille, 'fond.indisponible');
  document.body.append(pastille);

  let minuteur = null;

  async function actualiser() {
    clearTimeout(minuteur);
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), DELAI_DESCRIPTION);
    try {
      const reponse = await fetch(DESCRIPTION_FOND, { signal: controleur.signal });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      const { tiles } = await reponse.json();
      if (!tuilesValides(tiles)) throw new Error('TileJSON sans tuiles');
      pastille.hidden = true;
      if (JSON.stringify(tiles) === JSON.stringify(tuilesConnues())) return;
      ecrire(CLE_TUILES, tiles);
      map.getSource(SOURCE_VECTEUR)?.setTiles(tiles);
    } catch (erreur) {
      // Hors ligne, l'indicateur « Hors ligne » suffit : les tuiles enregistrées s'affichent
      pastille.hidden = !navigator.onLine;
      console.warn('Description du fond OpenFreeMap indisponible :', erreur);
      minuteur = setTimeout(actualiser, NOUVEL_ESSAI);
    } finally {
      clearTimeout(delai);
    }
  }

  window.addEventListener('online', () => void actualiser());
  void actualiser();
}
