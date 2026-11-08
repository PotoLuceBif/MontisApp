// Familles de roches de la carte lithologique simplifiée du BRGM (1/1 000 000), dans l'ordre de la légende.
// `code` : CODE_GEOL du BRGM ; `couleur` : celle de la carte du BRGM ; textes : clés `geologie.roche-<cle>`,
// `geologie.resume-<cle>` (une ligne) et `geologie.terrain-<cle>` (ce que la roche change sur le terrain).
export const FAMILLES = [
  { code: 2, cle: 'calcaires', couleur: '#73b3ff', type: 'sedimentaire' },
  { code: 3, cle: 'craie', couleur: '#bfd1ff', type: 'sedimentaire' },
  { code: 1, cle: 'argiles', couleur: '#d4ffbf', type: 'sedimentaire' },
  { code: 5, cle: 'gres', couleur: '#f5c97a', type: 'sedimentaire' },
  { code: 6, cle: 'sables', couleur: '#ffff73', type: 'sedimentaire' },
  { code: 8, cle: 'granites', couleur: '#ff0000', type: 'magmatique' },
  { code: 7, cle: 'volcaniques', couleur: '#004ca8', type: 'magmatique' },
  { code: 10, cle: 'gneiss', couleur: '#ffbfe8', type: 'metamorphique' },
  { code: 11, cle: 'micaschistes', couleur: '#ffebbf', type: 'metamorphique' },
  { code: 12, cle: 'schistes', couleur: '#8a8a45', type: 'metamorphique' },
  { code: 9, cle: 'ophiolites', couleur: '#008700', type: 'metamorphique' },
];

export const familleDuCode = (code) => FAMILLES.find((f) => f.code === Number(code)) ?? null;
