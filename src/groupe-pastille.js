// Pastille d'un groupe de lieux sur la carte (stations, bike parks, randos) : ronde, petite, le nombre au centre,
// un peu plus grande quand le groupe est gros. Elle remplace l'hexagone de 58 px, jugé grossier par le propriétaire
// le 24 novembre 2026. Un appui zoome sur le groupe ; un appui long (ou le survol) montre sa liste.

const DUREE_APPUI_LONG = 450;

// Nombre court : « 99+ » serait ambigu sur une carte, on écrit « 1,2k » au-delà de 999
export function nombreGroupe(n) {
  if (n < 1000) return String(n);
  const milliers = n / 1000;
  return `${(milliers < 10 ? Math.round(milliers * 10) / 10 : Math.round(milliers)).toString().replace('.', ',')}k`;
}

export const tailleGroupe = (n) => (n < 10 ? 'petit' : n < 50 ? 'moyen' : 'grand');

// Remplit le bouton du groupe ; `nouveau` : il vient d'apparaître (un groupe qui se sépare en zoomant), en fondu
export function poserPastilleGroupe(element, n, { nouveau = false } = {}) {
  element.classList.add('groupe-pastille');
  element.classList.toggle('groupe-apparait', nouveau);
  element.dataset.taille = tailleGroupe(n);
  element.innerHTML = `<span>${nombreGroupe(n)}</span>`;
}

// Appui long au doigt : `action()`, et le clic qui suit est absorbé (pas de zoom en plus)
export function surAppuiLong(element, action) {
  let minuteur = null;
  let fait = false;
  const annuler = () => clearTimeout(minuteur);
  element.addEventListener('pointerdown', (event) => {
    fait = false;
    if (event.pointerType !== 'touch') return;
    minuteur = setTimeout(() => {
      fait = true;
      action();
    }, DUREE_APPUI_LONG);
  });
  element.addEventListener('pointerup', annuler);
  element.addEventListener('pointercancel', annuler);
  element.addEventListener('pointerleave', annuler);
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  element.addEventListener('click', (event) => {
    if (!fait) return;
    fait = false;
    event.stopImmediatePropagation();
    event.preventDefault();
  }, true);
}
