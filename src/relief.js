import { etat, creerOptionCourbes } from './options-carte.js';
import { lire, ecrire } from './reglages.js';

const SOURCE_RELIEF = 'relief';
const LIBELLE_CURSEUR = 'Hauteur du relief';

// Valeur de départ (partagée avec le bouton 2D/3D de la carte)
etat.exageration = lire('exageration', 1.2);

const formaterFacteur = (v) => `×${v.toFixed(1).replace('.', ',')}`;

export function creerOptionRelief(map) {
  const panneau = document.createElement('div');
  panneau.className = 'relief-panneau';

  // Un bloc avec data-seulement="2d" ou "3d" n'apparaît que dans ce mode.
  // Un bloc sans cet attribut apparaît dans les deux modes.
  panneau.innerHTML = `
    <div class="relief-bascule" role="group" aria-label="Mode d'affichage">
      <button type="button" data-mode="2d">2D</button>
      <button type="button" data-mode="3d">3D</button>
    </div>

    <div class="relief-reglage" data-seulement="3d">
      <div class="relief-entete">
        <span>${LIBELLE_CURSEUR}</span>
        <strong id="val-exag">${formaterFacteur(etat.exageration)}</strong>
      </div>
      <input type="range" id="curseur-exag" min="0.5" max="4" step="0.1" value="${etat.exageration}">
    </div>

    <div class="relief-courbes" data-seulement="2d">
      <h3>Courbes de niveau</h3>
    </div>
  `;

  const boutons = panneau.querySelectorAll('.relief-bascule button');
  const curseur = panneau.querySelector('#curseur-exag');
  const valeur = panneau.querySelector('#val-exag');

  // ---------- Affichage selon le mode ----------
  function majAffichage(mode3D) {
    boutons.forEach((b) => b.classList.toggle('actif', (b.dataset.mode === '3d') === mode3D));
    panneau.querySelectorAll('[data-seulement]').forEach((bloc) => {
      bloc.hidden = bloc.dataset.seulement !== (mode3D ? '3d' : '2d');
    });
  }
  majAffichage(!!etat.mode3D);

  // ---------- Bascule 2D / 3D (même fonction que le bouton de la carte) ----------
  boutons.forEach((b) => {
    b.addEventListener('click', () => {
      const veut3d = b.dataset.mode === '3d';
      if (veut3d !== !!etat.mode3D && etat.basculerMode) etat.basculerMode();
    });
  });

  // Mise à jour quand le mode change (depuis n'importe quel bouton)
  window.addEventListener('mode3d', (e) => majAffichage(e.detail));

  // ---------- Hauteur du relief (3D) ----------
  curseur.addEventListener('input', () => {
    const v = parseFloat(curseur.value);
    etat.exageration = v;
    valeur.textContent = formaterFacteur(v);
    ecrire('exageration', v);
    if (etat.mode3D) {
      if (etat.majTerrain) etat.majTerrain();
      else map.setTerrain({ source: SOURCE_RELIEF, exaggeration: v });
    }
  });

  // ---------- Courbes de niveau (2D et 3D) ----------
  const courbes = creerOptionCourbes(map);
  panneau.querySelector('.relief-courbes').append(courbes.panneau);

  return {
    id: 'relief',
    label: 'Relief',
    icone: 'relief',
    panneau,
    activer() {},
    desactiver() {},
  };
}