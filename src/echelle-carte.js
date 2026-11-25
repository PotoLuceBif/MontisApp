const SELECTEURS_OBSTACLES = [
  '#menu-tiroir',
  '.outil-rapide-panneau',
  '#fiche',
  '#ski-fiche',
  '#bikepark-fiche',
  '.ski-fiche-recherche',
  '.bf',
  '#barre-haut',
  '#bascule-mode',
  '#menu-bouton',
  '#menu-parametres-bouton',
  '.outils-rapides',
  '#explorer-bande',
  '.maplibregl-ctrl-top-right',
  '.maplibregl-ctrl-bottom-right',
  '.maplibregl-popup',
];
const SELECTEURS_PANNEAUX = [
  '#explorer-bande',
  '#menu-tiroir',
  '.outil-rapide-panneau',
  '#fiche',
  '#ski-fiche',
  '#bikepark-fiche',
  '.bf',
];

export function initEchelleCarte(map) {
  const conteneur = map.getContainer();
  let animationPlanifiee = false;
  let animationTransition = false;
  let cadreTransition = 0;

  function actualiser() {
    animationPlanifiee = false;
    const position = conteneur.querySelector('.maplibregl-ctrl-bottom-left');
    const echelle = position?.querySelector('.maplibregl-ctrl-scale');
    if (!position || !echelle) return;

    const carte = conteneur.getBoundingClientRect();
    const boitePosition = position.getBoundingClientRect();
    const boiteEchelle = echelle.getBoundingClientRect();
    if (!carte.width || !carte.height || !boiteEchelle.width || !boiteEchelle.height) return;

    const obstacles = SELECTEURS_OBSTACLES.flatMap((selecteur) =>
      [...document.querySelectorAll(selecteur)]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.getClientRects().length > 0
          );
        })
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
    );
    const panneaux = SELECTEURS_PANNEAUX.flatMap((selecteur) =>
      [...document.querySelectorAll(selecteur)]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            element.getClientRects().length > 0
          );
        })
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0)
    );

    const marge = 12;
    const largeur = boiteEchelle.width;
    const hauteur = boiteEchelle.height;
    const yBas = carte.bottom - hauteur - marge;
    const candidats = [
      ...panneaux.flatMap((panneau) => [
        {
          x: panneau.right + marge,
          y: Math.max(panneau.top, Math.min(panneau.bottom - hauteur, yBas)),
        },
        {
          x: panneau.left - largeur - marge,
          y: Math.max(panneau.top, Math.min(panneau.bottom - hauteur, yBas)),
        },
        { x: panneau.left, y: panneau.top - hauteur - marge },
        { x: panneau.right - largeur, y: panneau.top - hauteur - marge },
        { x: panneau.left, y: panneau.bottom + marge },
        { x: panneau.right - largeur, y: panneau.bottom + marge },
        { x: panneau.left - largeur - marge, y: panneau.top },
        { x: panneau.right + marge, y: panneau.top },
      ]),
      { x: carte.left + marge, y: carte.bottom - hauteur - marge },
      // Juste au-dessus de ce qui occupe le bas (crédits dépliés, fiche) : l'échelle reste en bas
      ...obstacles.map((obstacle) => ({ x: carte.left + marge, y: obstacle.top - hauteur - marge })),
      { x: carte.right - largeur - marge, y: carte.bottom - hauteur - marge },
      { x: carte.left + marge, y: carte.top + marge },
      { x: carte.right - largeur - marge, y: carte.top + marge },
    ].map((candidat) => ({
      ...candidat,
      x: Math.max(carte.left + marge, Math.min(carte.right - largeur - marge, candidat.x)),
      y: Math.max(carte.top + marge, Math.min(carte.bottom - hauteur - marge, candidat.y)),
    }));

    const aireRecouvrement = (a, b) => {
      const largeurCommune = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const hauteurCommune = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return largeurCommune * hauteurCommune;
    };

    const meilleur = candidats
      .map((candidat) => {
        const boite = {
          left: candidat.x,
          top: candidat.y,
          right: candidat.x + largeur,
          bottom: candidat.y + hauteur,
        };
        return {
          ...candidat,
          score: obstacles.reduce((total, obstacle) => total + aireRecouvrement(boite, obstacle), 0),
        };
      })
      // À recouvrement égal, la place la plus proche du coin bas gauche habituel
      .sort((a, b) => a.score - b.score
        || Math.hypot(a.x - carte.left, carte.bottom - a.y) - Math.hypot(b.x - carte.left, carte.bottom - b.y))[0];

    const decalageGauche = boiteEchelle.left - boitePosition.left;
    const decalageHaut = boiteEchelle.top - boitePosition.top;
    position.style.left = `${meilleur.x - carte.left - decalageGauche}px`;
    position.style.top = `${meilleur.y - carte.top - decalageHaut}px`;
    position.style.right = 'auto';
    position.style.bottom = 'auto';
    position.style.zIndex = '30';
  }

  function planifierActualisation() {
    if (animationPlanifiee) return;
    animationPlanifiee = true;
    requestAnimationFrame(actualiser);
  }

  function suivreTransition() {
    if (!animationTransition) return;
    planifierActualisation();
    cadreTransition = requestAnimationFrame(suivreTransition);
  }

  const observerTiroir = new MutationObserver(() => observerPanneaux());
  const elementsObserves = new Set();
  const observerTaille = new ResizeObserver(planifierActualisation);

  function observerPanneaux() {
    for (const element of document.querySelectorAll(SELECTEURS_OBSTACLES.join(','))) {
      if (elementsObserves.has(element)) continue;
      elementsObserves.add(element);
      observerTiroir.observe(element, { attributes: true, attributeFilter: ['class', 'hidden'] });
      observerTaille.observe(element);
      element.addEventListener('transitionrun', () => {
        animationTransition = true;
        if (!cadreTransition) suivreTransition();
      });
      const terminerTransition = () => {
        animationTransition = false;
        cancelAnimationFrame(cadreTransition);
        cadreTransition = 0;
        planifierActualisation();
      };
      element.addEventListener('transitionend', terminerTransition);
      element.addEventListener('transitioncancel', terminerTransition);
    }
    planifierActualisation();
  }

  observerTiroir.observe(document.body, { childList: true });
  observerTiroir.observe(conteneur, { childList: true, subtree: true });
  observerTaille.observe(conteneur);
  observerPanneaux();
  window.addEventListener('resize', planifierActualisation);
  map.on('load', planifierActualisation);
  map.on('resize', planifierActualisation);
  map.on('move', planifierActualisation);

  return () => {
    observerTiroir.disconnect();
    observerTaille.disconnect();
    window.removeEventListener('resize', planifierActualisation);
    map.off('load', planifierActualisation);
    map.off('resize', planifierActualisation);
    map.off('move', planifierActualisation);
    cancelAnimationFrame(cadreTransition);
  };
}
