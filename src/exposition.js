// Raccourci « Évaluer l'exposition » (lot 4.7) : ouvre Soleil et Lune › Ombre du soleil, allumée et cadrée
// sur ce qu'on regarde (un tracé, une station, un décollage, une balise). La croix du panneau ramène d'où
// l'on vient, et éteint l'ombre si c'est le raccourci qui l'a allumée. Module léger, sans import à la demande.
import { estHorsLigne } from './hors-ligne.js';
import { poser } from './i18n.js';

export const ICONE_EXPOSITION = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>';
// Écouté par ombres-panneau.js : `detail.allumee(eteindre)` est appelé si l'ombre était éteinte
export const ALLUMER_OMBRES = 'montis:allumer-ombres';

const METRES_PAR_DEGRE = 111_320;

// La place que laisse le panneau Soleil et Lune : en bas sur téléphone, à droite sur ordinateur.
// `gauche` : bord droit d'un panneau posé à gauche (éditeur de parcours) sur ordinateur
function marges(gauche) {
  if (window.innerWidth <= 700) return { top: 80, right: 30, left: 30, bottom: Math.max(60, window.innerHeight - 390) };
  return { top: 90, right: 560, bottom: 30, left: Math.max(30, gauche) };
}

// `points` : [[lng, lat], …] à cadrer ; sinon `centre` [lng, lat] et un rayon en mètres
export function evaluerExposition(map, { points = [], centre = null, rayon = 1500, gauche = 0, retour = () => {} }) {
  let liste = points;
  if (liste.length < 2 && centre) {
    const [lng, lat] = centre;
    const dLat = rayon / METRES_PAR_DEGRE;
    const dLng = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
    liste = [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]];
  }
  if (liste.length >= 2) {
    const lngs = liste.map((p) => p[0]);
    const lats = liste.map((p) => p[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: marges(gauche),
      maxZoom: 15,
      duration: estHorsLigne() ? 0 : 700,
    });
  }

  let eteindre = null;
  window.dispatchEvent(new CustomEvent(ALLUMER_OMBRES, { detail: { allumee: (f) => { eteindre = f; } } }));
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', {
    detail: {
      categorie: 'ciel',
      module: 'ombres',
      retour: () => {
        eteindre?.();
        retour();
      },
    },
  }));
}

// Bouton « Évaluer l'exposition » au style des raccourcis des fiches (Prévisions, Analyser le vent)
export function boutonExposition(action, classe = 'point-lien lien-exposition') {
  const bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.className = classe;
  bouton.innerHTML = `<svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true">${ICONE_EXPOSITION}</svg><span></span>
    <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
  poser(bouton.querySelector('span'), 'exposition.evaluer');
  bouton.addEventListener('click', action);
  return bouton;
}
