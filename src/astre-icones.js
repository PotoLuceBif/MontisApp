// Pictogrammes des tuiles Lever, Au plus haut et Coucher, communs aux lignes Soleil et Lune (soleil-lune.js, lune.js)
const trait = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
export const ICONES_ASTRE = {
  lever: `<svg viewBox="0 0 24 24" aria-hidden="true" ${trait}><path d="M3 18h18M7 18a5 5 0 0 1 10 0"/><path d="M12 3v6M9.5 5.5 12 3l2.5 2.5"/></svg>`,
  haut: `<svg viewBox="0 0 24 24" aria-hidden="true" ${trait}><path d="M3 19h18"/><path d="M4 19c2-7 5-11 8-11s6 4 8 11" stroke-dasharray="1.5 3"/><circle cx="12" cy="7.5" r="2.6"/></svg>`,
  coucher: `<svg viewBox="0 0 24 24" aria-hidden="true" ${trait}><path d="M3 18h18M7 18a5 5 0 0 1 10 0"/><path d="M12 9V3M9.5 6.5 12 9l2.5-2.5"/></svg>`,
};

// Trois tuiles : `classes` donne la classe de la valeur de chacune ({ lever, haut, coucher })
export const tuilesAstre = (classes) => `
  <div class="astre-tuiles">
    <div class="astre-tuile">${ICONES_ASTRE.lever}<span data-i18n="lune.lever"></span><strong class="${classes.lever}"></strong></div>
    <div class="astre-tuile">${ICONES_ASTRE.haut}<span data-i18n="lune.culmination"></span><strong class="${classes.haut}"></strong></div>
    <div class="astre-tuile">${ICONES_ASTRE.coucher}<span data-i18n="lune.coucher"></span><strong class="${classes.coucher}"></strong></div>
  </div>`;
