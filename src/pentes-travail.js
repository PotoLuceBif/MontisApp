// Travailleur des couches de pente : le calcul d'une tuile ne bloque pas la carte.
import { tuile } from './pentes-tuile.js';

const annulees = new Set();

self.onmessage = async ({ data }) => {
  if (data.annuler !== undefined) {
    annulees.add(data.annuler);
    return;
  }
  const { id, z, x, y, genre } = data;
  try {
    const pixels = await tuile(z, x, y, genre, () => annulees.has(id));
    self.postMessage({ id, pixels }, [pixels.buffer]);
  } catch (e) {
    self.postMessage({ id, erreur: e?.message || String(e) });
  } finally {
    annulees.delete(id);
  }
};
