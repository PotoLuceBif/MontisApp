import { lire, ecrire } from './reglages.js';

// État partagé : le bouton 3D et le menu doivent s'accorder sur l'affichage des courbes
// (courbes et altitudes sont rétablies depuis la dernière visite)
export const etat = {
  courbes: lire('courbes', true),
  altitudes: lire('altitudes', true),
  mode3D: false,
};

export function majCourbes(map) {
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
    <label class="ligne-coche"><input type="checkbox" id="opt-courbes"> Afficher les courbes de niveau</label>
    <label class="ligne-coche"><input type="checkbox" id="opt-altitudes"> Afficher les altitudes sur les courbes</label>
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

  return { id: 'courbes', label: 'Courbes de niveau', icone: '〰️', panneau, activer() {}, desactiver() {} };
}