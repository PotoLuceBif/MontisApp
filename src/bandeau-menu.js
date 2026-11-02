// Bandeau du menu : ciel de nuit, aurore et crêtes aux couleurs du logo.
// La crête du premier plan prend la couleur du tiroir : le paysage se fond dans le panneau.

const ETOILES = [
  [14, 12, 0.7], [31, 58, 0.5], [47, 8, 0.9, 1], [62, 66, 0.5], [78, 22, 0.6], [96, 60, 0.7], [108, 8, 0.5],
  [121, 40, 0.8, 2], [137, 18, 0.5], [149, 56, 0.6], [163, 10, 1, 3], [176, 34, 0.5], [188, 20, 0.7], [203, 7, 0.5],
  [214, 24, 0.9, 1], [233, 12, 0.6], [247, 30, 0.5], [262, 9, 0.8], [276, 40, 0.6, 2], [289, 62, 0.5], [298, 8, 0.6],
  [316, 66, 0.7, 3], [329, 8, 0.5], [344, 58, 0.8],
];

const etoiles = ETOILES.map(([x, y, r, rythme]) =>
  `<circle cx="${x}" cy="${y}" r="${r}"${rythme ? ` class="menu-etoile menu-etoile-${rythme}"` : ''}/>`
).join('');

export const BANDEAU_MENU = `
  <svg class="menu-bandeau" viewBox="0 0 352 132" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="bandeau-ciel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#070b1c"/>
        <stop offset=".5" stop-color="#151b4d"/>
        <stop offset=".78" stop-color="#3a2f92"/>
        <stop offset="1" stop-color="#8340b4"/>
      </linearGradient>
      <linearGradient id="bandeau-aurore-a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#22d3ee" stop-opacity="0"/>
        <stop offset=".55" stop-color="#22d3ee" stop-opacity=".3"/>
        <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bandeau-aurore-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e040fb" stop-opacity="0"/>
        <stop offset=".6" stop-color="#e040fb" stop-opacity=".24"/>
        <stop offset="1" stop-color="#e040fb" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bandeau-massif" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b3d9e"/>
        <stop offset="1" stop-color="#151a4c"/>
      </linearGradient>
      <linearGradient id="bandeau-neige" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#b9c4ff"/>
      </linearGradient>
    </defs>
    <rect width="352" height="132" fill="url(#bandeau-ciel)"/>
    <path d="M-10 62C50 34 96 66 158 46S268 18 362 44V84C270 58 214 90 150 84S54 88-10 100Z" fill="url(#bandeau-aurore-a)"/>
    <path d="M110 76C170 44 232 66 276 42S336 26 362 30V82C312 68 262 94 212 88S150 86 110 96Z" fill="url(#bandeau-aurore-b)"/>
    <g fill="#fff" opacity=".9">${etoiles}</g>
    <path d="M0 98 38 80l30 9 40-25 36 21 42-26 38 24 42-30 44 26 42-16v69H0Z" fill="#3a3a99" opacity=".62"/>
    <path d="M62 132 148 86l38-22 39-30 37 34 38-10 52 34v40Z" fill="url(#bandeau-massif)"/>
    <path d="m225 34 37 34-20 64h-38l22-66Z" fill="#fff" opacity=".07"/>
    <path d="m300 58 52 34v40h-78l6-36Z" fill="#fff" opacity=".05"/>
    <path d="m225 34 15 14-8 5-6-7-8 9-6-4-3 3-5-4Z" fill="url(#bandeau-neige)"/>
    <path d="m300 58 11 7-6 3-5-3-5 4-7-5Z" fill="url(#bandeau-neige)" opacity=".85"/>
    <path d="M0 116 54 96l36 13 40-16 44 20 42-13 48 19 44-15 44 16v12H0Z" fill="#10163f"/>
    <path d="M0 126C44 112 72 118 112 122S196 110 244 120 320 130 352 116V133H0Z" class="menu-bandeau-avant"/>
  </svg>
`;
