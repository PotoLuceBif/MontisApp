// Glisser une feuille du bas (téléphone) : elle suit le doigt ; lâchée assez bas, elle se réduit ou se ferme,
// assez haut, elle se rouvre (demande du propriétaire du 25 novembre 2026). Un glissé de côté (bande qui défile)
// est laissé au navigateur.
const SEUIL = 48;
const surTelephone = () => window.matchMedia('(max-width: 700px)').matches;

// `prise(cible)` : vrai si le geste peut partir de cet élément ; `bas` et `haut` : actions au lâcher
export function suivreGlisse(feuille, prise, { bas, haut }) {
  let depart = null;
  let ecart = 0;
  feuille.addEventListener('pointerdown', (event) => {
    if (!surTelephone() || !prise(event.target)) return;
    depart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    ecart = 0;
  });
  feuille.addEventListener('pointermove', (event) => {
    if (!depart || event.pointerId !== depart.id) return;
    const dy = event.clientY - depart.y;
    const dx = event.clientX - depart.x;
    if (!ecart) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      // Plutôt de côté : c'est un défilement, pas un geste de la feuille
      if (Math.abs(dx) > Math.abs(dy)) {
        depart = null;
        return;
      }
      // Le doigt reste à la feuille même s'il en sort (sans prise possible, le geste continue quand même)
      try {
        feuille.setPointerCapture(event.pointerId);
      } catch {
        /* pointeur déjà relâché ou simulé */
      }
    }
    ecart = dy;
    feuille.style.transition = 'none';
    // Vers le haut, la feuille résiste : elle ne monte que d'un peu
    feuille.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`;
  });
  const finir = () => {
    if (!depart) return;
    depart = null;
    feuille.style.transition = '';
    feuille.style.transform = '';
    const glisse = ecart;
    ecart = 0;
    if (glisse > SEUIL) bas();
    else if (glisse < -SEUIL) haut?.();
    if (Math.abs(glisse) > 8) {
      // Le clic qui suit un glissé ne doit pas ouvrir la carte touchée au départ
      const absorber = (event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      feuille.addEventListener('click', absorber, true);
      window.setTimeout(() => feuille.removeEventListener('click', absorber, true), 60);
    }
  };
  feuille.addEventListener('pointerup', finir);
  feuille.addEventListener('pointercancel', finir);
}
