import { describe, expect, it } from 'vitest';
import { FORMAT, VERSION, lireSauvegarde, sortieValide } from '../src/sauvegarde.js';

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
    // Fichier d'avant le ski de rando : aucun parcours de ski de rando, pas d'erreur
    expect(lue.parcours.skirando).toEqual([]);
  });

  it('lit les parcours de ski de rando', async () => {
    const donnees = sauvegarde([]);
    donnees.parcours.skirando = [parcours([etape(7, 46), etape(7.01, 46.01, [[7, 46], [7.01, 46.01]])])];
    const lue = await lireSauvegarde(fichier(donnees));
    expect(lue.parcours.skirando).toHaveLength(1);
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

describe('sorties dans la sauvegarde', () => {
  const sortie = (points) => ({ id: 's1', nom: 'Rando', type: 'rando', format: 'gpx', debut: 1, points, coupures: [] });
  const points = { lng: [6, 6.1], lat: [45, 45.1], alt: [1000, null] };

  it('lit une sauvegarde sans sorties (version 1)', async () => {
    const lue = await lireSauvegarde(fichier({ ...sauvegarde([]), version: 1 }));
    expect(lue.sorties).toEqual([]);
  });

  it('accepte une sortie aux colonnes de même longueur', async () => {
    const lue = await lireSauvegarde(fichier({ ...sauvegarde([]), sorties: [sortie(points)] }));
    expect(lue.sorties).toHaveLength(1);
  });

  it('refuse une sortie abîmée', async () => {
    expect(sortieValide(sortie({ ...points, alt: [1000] }))).toBe(false);
    expect(sortieValide(sortie({ lng: [6, 'x'], lat: [45, 45.1] }))).toBe(false);
    expect(sortieValide(sortie({ lng: [6], lat: [45] }))).toBe(false);
    expect(sortieValide({ ...sortie(points), id: '' })).toBe(false);
    await expect(lireSauvegarde(fichier({ ...sauvegarde([]), sorties: [sortie({ lng: [6], lat: [45] })] })))
      .rejects.toMatchObject({ cle: 'sauv.erreur-sorties' });
  });
});