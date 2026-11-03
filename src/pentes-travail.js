// Travailleur des couches de pente et d'ombre : le calcul d'une tuile ne bloque pas la carte.
// Un seul travailleur : les tuiles de relief lues restent en cache pour les deux.
import { tuile } from './pentes-tuile.js';
import { tuileOmbre } from './ombre-tuile.js';

const annulees = new Set();

self.onmessage = async ({ data }) => {
  if (data.annuler !== undefined) {
    annulees.add(data.annuler);
    return;
  }
  const { id, z, x, y, genre, soleil } = data;
  const annulee = () => annulees.has(id);
  try {
    const pixels = genre === 'ombre' ? await tuileOmbre(z, x, y, soleil, annulee) : await tuile(z, x, y, genre, annulee);
    self.postMessage({ id, pixels }, [pixels.buffer]);
  } catch (e) {
    self.postMessage({ id, erreur: e?.message || String(e) });
  } finally {
    annulees.delete(id);
  }
};
