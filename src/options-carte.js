import { lire, ecrire } from './reglages.js';
import { tt } from './i18n.js';

// État partagé : le bouton 3D et le menu doivent s'accorder sur l'affichage des courbes
// (courbes et altitudes sont rétablies depuis la dernière visite)
export const etat = {
  courbes: lire('courbes', true),
  altitudes: lire('altitudes', true),
  mode3D: false,
  fond: 'montis', // 'montis', 'national' (Montis au-delà de la frontière) ou 'autre' (fond-de-carte.js)
};

// Deux ombrages fixes, jamais ensemble : celui du fond Montis (`montis-relief`, en 2D comme en 3D, sous les
// routes et les noms) et celui de la 3D pour les autres fonds (`ombrage`, au-dessus). L'ombre du soleil
// (Carte › Relief) ou celle d'une sortie les remplace tous les deux.
export function majOmbrage(map) {
  if (etat.enVisite) return; // la visite masque la carte et la rétablit ensuite
  const soleil = etat.ombresSoleil || etat.ombreSortie;
  const montis = etat.fond !== 'autre' && !soleil && !(etat.fond === 'national' && etat.mode3D);
  const fixe = etat.mode3D && !soleil && etat.fond !== 'montis';
  if (map.getLayer('montis-relief')) map.setLayoutProperty('montis-relief', 'visibility', montis ? 'visible' : 'none');
  if (map.getLayer('ombrage')) map.setLayoutProperty('ombrage', 'visibility', fixe ? 'visible' : 'none');
}

// Courbes : maîtresses marquées, intermédiaires très fines. Sur une photo, tout passe en blanc.
const MAITRESSE = ['>=', ['get', 'level'], 1];
export function peintureCourbes(photo = false) {
  return {
    'line-color': photo ? '#ffffff' : ['case', MAITRESSE, '#86562c', '#a3805f'],
    'line-opacity': photo ? ['case', MAITRESSE, 0.85, 0.55] : ['case', MAITRESSE, 0.75, 0.42],
    'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', MAITRESSE, 0.8, 0.4], 15, ['case', MAITRESSE, 1.4, 0.6]],
  };
}
export function peintureCotes(photo = false) {
  return {
    'text-color': photo ? '#ffffff' : '#7a4f2a',
    'text-halo-color': photo ? 'rgba(0, 0, 0, 0.75)' : 'rgba(243, 242, 244, 0.9)',
    'text-halo-width': 1.4,
  };
}

export function majCourbes(map) {
  if (etat.enVisite) return; // la visite a ses propres courbes, la carte normale reste coupée
  const visible = etat.courbes && !etat.mode3D;
  const visibleAlt = visible && etat.altitudes;
  if (map.getLayer('courbes')) {
    map.setLayoutProperty('courbes', 'visibility', visible ? 'visible' : 'none');
  }
  if (map.getLayer('courbes-altitude')) {
    map.setLayoutProperty('courbes-altitude', 'visibility', visibleAlt ? 'visible' : 'none');
  }
}

export function creerOptionCourbes(map) {
  const panneau = document.createElement('div');
  panneau.innerHTML = `
    <label class="ligne-coche"><input type="checkbox" id="opt-courbes"> ${tt('courbes.afficher')}</label>
    <label class="ligne-coche"><input type="checkbox" id="opt-altitudes"> ${tt('courbes.altitudes')}</label>
  `;
  const caseCourbes = panneau.querySelector('#opt-courbes');
  const caseAltitudes = panneau.querySelector('#opt-altitudes');

  // Cases dans l'état mémorisé
  caseCourbes.checked = etat.courbes;
  caseAltitudes.checked = etat.altitudes;
  caseAltitudes.disabled = !etat.courbes;

  caseCourbes.addEventListener('change', () => {
    etat.courbes = caseCourbes.checked;
    caseAltitudes.disabled = !caseCourbes.checked;
    ecrire('courbes', etat.courbes);
    majCourbes(map);
  });
  caseAltitudes.addEventListener('change', () => {
    etat.altitudes = caseAltitudes.checked;
    ecrire('altitudes', etat.altitudes);
    majCourbes(map);
  });

  return { id: 'courbes', labelCle: 'relief.courbes', icone: 'courbes', panneau, activer() {}, desactiver() {} };
}