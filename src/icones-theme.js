// Logos de l'appli (public/icons/activites/) : en thème clair, leur version sur fond blanc (`-clair.svg`, même dessin,
// même contour, personnage bleu nuit ; décision du propriétaire du 25 novembre 2026). Chaque image de logo prend la
// bonne version à son apparition et au changement de thème, sans que les modules qui la posent s'en occupent.
const DOSSIER = '/icons/activites/';

const versionPour = (src, clair) => {
  const base = src.replace(/-clair\.svg$/, '.svg');
  return clair ? base.replace(/\.svg$/, '-clair.svg') : base;
};

function ajuster(image, clair) {
  const src = image.getAttribute('src');
  if (!src?.includes(DOSSIER)) return;
  const voulue = versionPour(src, clair);
  if (voulue !== src) image.setAttribute('src', voulue);
}

export function initIconesTheme() {
  const racine = document.documentElement;
  const estClair = () => racine.dataset.theme === 'clair';
  const toutAjuster = () => document.querySelectorAll(`img[src*="${DOSSIER}"]`).forEach((img) => ajuster(img, estClair()));

  new MutationObserver(toutAjuster).observe(racine, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver((changements) => {
    if (!estClair()) return;
    for (const { addedNodes } of changements) {
      for (const noeud of addedNodes) {
        if (noeud.nodeType !== 1) continue;
        if (noeud.tagName === 'IMG') ajuster(noeud, true);
        else noeud.querySelectorAll?.(`img[src*="${DOSSIER}"]`).forEach((img) => ajuster(img, true));
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  toutAjuster();
}
