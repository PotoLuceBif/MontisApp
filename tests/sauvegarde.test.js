import { describe, expect, it } from 'vitest';
import { FORMAT, VERSION, lireSauvegarde } from '../src/sauvegarde.js';

const fichier = (contenu) => {
  const texte = typeof contenu === 'string' ? contenu : JSON.stringify(contenu);
  return { size: texte.length, text: async () => texte };
};
const parcours = (etapes) => ({ id: '1', nom: 'Tour', etapes });
const sauvegarde = (rando) => ({ format: FORMAT, version: VERSION, date: '2026-11-09T10:00:00Z', reglages: {}, parcours: { rando, velo: [] } });
const etape = (lng, lat, geom) => ({ lng, lat, mode: 'route', troncon: geom ? { geom } : null });

describe('lireSauvegarde', () => {
  it('accepte une sauvegarde complète', async () => {
    const lue = await lireSauvegarde(fichier(sauvegarde([parcours([etape(6, 45), etape(6.1, 45.1, [[6, 45], [6.1, 45.1]])])])));
    expect(lue.parcours.rando).toHaveLength(1);
    expect(lue.date).toBe(Date.parse('2026-11-09T10:00:00Z'));
  });

  it('refuse un fichier illisible ou d’un autre format', async () => {
    await expect(lireSauvegarde(fichier('{ pas du json'))).rejects.toMatchObject({ cle: 'sauv.erreur-json' });
    await expect(lireSauvegarde(fichier({ format: 'autre' }))).rejects.toMatchObject({ cle: 'sauv.erreur-format' });
  });

  it('refuse une étape sans coordonnées', async () => {
    await expect(lireSauvegarde(fichier(sauvegarde([parcours([etape(6, 45), { mode: 'route' }])]))))
      .rejects.toMatchObject({ cle: 'sauv.erreur-parcours' });
  });

  it('refuse un tronçon au tracé abîmé', async () => {
    await expect(lireSauvegarde(fichier(sauvegarde([parcours([etape(6, 45), etape(6.1, 45.1, [[6, 45], ['x', null]])])]))))
      .rejects.toMatchObject({ cle: 'sauv.erreur-parcours' });
  });
});
