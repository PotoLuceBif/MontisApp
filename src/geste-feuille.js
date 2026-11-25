// Glisser une feuille du bas (téléphone) : elle suit le doigt ; lâchée assez bas, elle se réduit ou se ferme,
// assez haut, elle se rouvre (demande du propriétaire du 25 novembre 2026). Comme dans les applis : on la tire par
// son en-tête, ou par son contenu quand celui-ci est tout en haut et qu'on tire vers le bas. Un glissé de côté
// (bande qui défile) est laissé au navigateur. Événements tactiles : sur téléphone, un défilement du contenu
// annule les événements de pointeur avant qu'on puisse décider.
const SEUIL = 48;
const surTelephone = () => window.matchMedia('(max-width: 700px)').matches;

// Premier parent défilant de la cible, dans la feuille
function zoneDefilante(cible, feuille) {
  for (let el = cible; el && el !== feuille.parentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    if (el === feuille) break;
  }
  return null;
}

// `prise(cible)` : vrai si le geste peut partir de cet élément (en-tête) ; `contenu` : le contenu aussi, s'il est en
// haut ; `bas` et `haut` : actions au lâcher
export function suivreGlisse(feuille, prise, { bas, haut, contenu = false }) {
  let depart = null;
  let ecart = 0;
  let engage = false;

  feuille.addEventListener('touchstart', (event) => {
    if (!surTelephone() || event.touches.length !== 1) return;
    const cible = event.target;
    if (cible.closest('input, textarea, select, [contenteditable]')) return;
    const parPrise = Boolean(prise(cible));
    const zone = contenu && !parPrise ? zoneDefilante(cible, feuille) : null;
    if (!parPrise && !(contenu && (!zone || zone.scrollTop <= 0))) return;
    const { clientX, clientY } = event.touches[0];
    depart = { x: clientX, y: clientY, parPrise, zone };
    ecart = 0;
    engage = false;
  }, { passive: true });

  feuille.addEventListener('touchmove', (event) => {
    if (!depart) return;
    const { clientX, clientY } = event.touches[0];
    const dy = clientY - depart.y;
    const dx = clientX - depart.x;
    if (!engage) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      // Plutôt de côté : c'est un défilement, pas un geste de la feuille
      if (Math.abs(dx) > Math.abs(dy)) {
        depart = null;
        return;
      }
      // Depuis le contenu : seulement vers le bas, et contenu en haut ; sinon on laisse défiler
      if (!depart.parPrise && (dy < 0 || (depart.zone && depart.zone.scrollTop > 0))) {
        depart = null;
        return;
      }
      engage = true;
    }
    event.preventDefault();
    ecart = dy;
    feuille.style.transition = 'none';
    // Vers le haut, la feuille résiste : elle ne monte que d'un peu
    feuille.style.transform = `translateY(${dy > 0 ? dy : dy / 4}px)`;
  }, { passive: false });

  const finir = () => {
    if (!depart) return;
    depart = null;
    feuille.style.transition = '';
    feuille.style.transform = '';
    const glisse = engage ? ecart : 0;
    ecart = 0;
    engage = false;
    if (glisse > SEUIL) bas();
    else if (glisse < -SEUIL) haut?.();
    if (Math.abs(glisse) > 8) {
      // Le clic qui suit un glissé ne doit pas ouvrir ce qui était sous le doigt au départ
      const absorber = (event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      feuille.addEventListener('click', absorber, true);
      window.setTimeout(() => feuille.removeEventListener('click', absorber, true), 80);
    }
  };
  feuille.addEventListener('touchend', finir);
  feuille.addEventListener('touchcancel', finir);
}
