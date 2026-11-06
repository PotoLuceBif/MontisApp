// Bloc « Pentes et orientation » du panneau Relief : choix de la couche, légende, opacité, état.
import { initCouchePentes, ZOOM_MIN_PENTES } from './pentes-couche.js';
import { CODES_SECTEURS, COULEURS_ORIENTATION, COULEURS_PENTE, PENTE_MIN_ORIENTATION, SEUILS_PENTE, pourcentagePente } from './pente-calcul.js';
import { estHorsLigne } from './hors-ligne.js';
import { etat } from './options-carte.js';
import { lire } from './reglages.js';
import { poser, surLangue, t, ta } from './i18n.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';
import { formatPente, nombre, pourcent } from './unites.js';

const ZOOM_CIBLE = ZOOM_MIN_PENTES + 0.5;
const ICONE_LOUPE = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
  <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>`;

const rgb = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;

// Mini-légendes des pastilles sur la carte : les quatre classes, ou la rose sans ses lettres
const MINI_PENTES = `<span class="mini-pentes">${SEUILS_PENTE.map((s) => `<i style="background: ${rgb(COULEURS_PENTE[s])}"></i>`).join('')}</span>`;
const MINI_ROSE = `<svg class="mini-rose" viewBox="0 0 20 20">${COULEURS_ORIENTATION.map((couleur, i) => {
  const point = (angle) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return `${(10 + 9 * Math.cos(a)).toFixed(2)} ${(10 + 9 * Math.sin(a)).toFixed(2)}`;
  };
  return `<path d="M10 10 L${point(i * 45 - 22.5)} A9 9 0 0 1 ${point(i * 45 + 22.5)} Z" fill="${rgb(couleur)}"/>`;
}).join('')}</svg>`;

// Rose des orientations : huit secteurs, lettres autour
function roseOrientation() {
  const centre = 50;
  const rayon = 34;
  const point = (angle, r) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return `${(centre + r * Math.cos(a)).toFixed(2)} ${(centre + r * Math.sin(a)).toFixed(2)}`;
  };
  const secteurs = COULEURS_ORIENTATION.map((couleur, i) => {
    const debut = i * 45 - 22.5;
    return `<path d="M${centre} ${centre} L${point(debut, rayon)} A${rayon} ${rayon} 0 0 1 ${point(debut + 45, rayon)} Z" fill="${rgb(couleur)}"/>`;
  }).join('');
  const lettres = COULEURS_ORIENTATION.map((_, i) => {
    const [x, y] = point(i * 45, rayon + 10).split(' ');
    return `<text x="${x}" y="${y}" data-cardinal="${CODES_SECTEURS[i]}"></text>`;
  }).join('');
  return `<svg class="pentes-rose" viewBox="0 0 100 100" aria-hidden="true">${secteurs}
    <circle cx="${centre}" cy="${centre}" r="9" class="pentes-rose-centre"/>${lettres}</svg>`;
}

export function creerOptionPentes(map) {
  const couche = initCouchePentes(map);
  etat.majPentes = couche.appliquer;

  const bloc = document.createElement('div');
  bloc.className = 'relief-pentes';
  bloc.innerHTML = `
    <h3 data-i18n="pentes.titre"></h3>
    <div class="relief-bascule pentes-choix" role="group" ${ta('aria-label', 'pentes.titre')}>
      <button type="button" data-genre="pentes" data-i18n="pentes.pentes"></button>
      <button type="button" data-genre="orientation" data-i18n="pentes.orientation"></button>
    </div>
    <div class="pentes-loin" role="status" hidden>
      <p class="pentes-loin-texte"></p>
      <button type="button" class="pentes-zoomer">${ICONE_LOUPE}<span data-i18n="pentes.zoomer"></span></button>
    </div>
    <p class="note pentes-etat" role="status"></p>
    <div class="pentes-details">
      <div class="pentes-legende" data-pour="pentes">
        <div class="pentes-classes">
          ${SEUILS_PENTE.map((seuil, i) => `
            <div class="pentes-classe">
              <i style="background: ${rgb(COULEURS_PENTE[seuil])}"></i>
              <span class="pentes-degres" data-seuil="${i}"></span>
              <span class="pentes-pourcent" data-seuil="${i}"></span>
            </div>`).join('')}
        </div>
        <p class="note pentes-sous"></p>
      </div>
      <div class="pentes-legende pentes-legende-rose" data-pour="orientation">
        ${roseOrientation()}
        <p class="note pentes-rose-aide"></p>
      </div>
      <div class="relief-reglage">
        <div class="relief-entete">
          <span data-i18n="pentes.opacite"></span>
          <strong class="pentes-opacite-valeur"></strong>
        </div>
        <input type="range" class="pentes-opacite" min="0.2" max="1" step="0.05" ${ta('aria-label', 'pentes.opacite')}>
      </div>
      <p class="note pentes-prudence" data-i18n="pentes.prudence"></p>
    </div>
  `;
  bloc.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));

  const boutons = bloc.querySelectorAll('.pentes-choix button');
  const details = bloc.querySelector('.pentes-details');
  const curseur = bloc.querySelector('.pentes-opacite');
  const valeurOpacite = bloc.querySelector('.pentes-opacite-valeur');
  const note = bloc.querySelector('.pentes-etat');

  // Textes qui dépendent de la langue (degrés, pourcentages, points cardinaux)
  function majTextes() {
    SEUILS_PENTE.forEach((seuil, i) => {
      const suivant = SEUILS_PENTE[i + 1];
      const degres = suivant ? `${nombre(seuil)}–${nombre(suivant)}°` : `≥ ${nombre(seuil)}°`;
      const pc = suivant
        ? `${nombre(Math.round(pourcentagePente(seuil)))}–${pourcent(pourcentagePente(suivant))}`
        : `≥ ${pourcent(pourcentagePente(seuil))}`;
      bloc.querySelector(`.pentes-degres[data-seuil="${i}"]`).textContent = degres;
      bloc.querySelector(`.pentes-pourcent[data-seuil="${i}"]`).textContent = pc;
    });
    bloc.querySelector('.pentes-sous').textContent = t('pentes.sous', { valeur: formatPente(SEUILS_PENTE[0]) });
    bloc.querySelector('.pentes-rose-aide').textContent = t('pentes.rose-aide', { valeur: `${nombre(PENTE_MIN_ORIENTATION)}°` });
    bloc.querySelectorAll('.pentes-rose text').forEach((el) => { el.textContent = t(`cardinal.${el.dataset.cardinal}`); });
    majEtat();
  }

  // ---------- Pastille sur la carte : couche affichée, ✕ pour l'éteindre ; trop loin, « Rapprocher » ----------
  const loin = bloc.querySelector('.pentes-loin');
  bloc.querySelectorAll('.pentes-zoomer [data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const zoomer = () => map.easeTo({ zoom: ZOOM_CIBLE, duration: 900 });
  bloc.querySelector('.pentes-zoomer').addEventListener('click', zoomer);
  let tropLoin = false;
  const pastille = creerPastilleCouche({
    ordre: 0,
    nom: () => {
      // Trop loin : la mini-légende dit déjà quelle couche, le texte dit pourquoi elle n'apparaît pas
      if (tropLoin) return t('pentes.trop-loin');
      return t(couche.choix === 'orientation' ? 'pentes.orientation' : 'pentes.pentes');
    },
    legende: () => (couche.choix === 'orientation' ? MINI_ROSE : MINI_PENTES),
    onOuvrir: () => ouvrirReglage('relief'),
    onRetirer: () => choisir('aucune'),
  });

  function majTropLoin() {
    const actif = couche.choix !== 'aucune';
    const loinMaintenant = actif && map.getZoom() < ZOOM_MIN_PENTES;
    loin.hidden = !loinMaintenant;
    if (loinMaintenant) poser(loin.querySelector('.pentes-loin-texte'), 'pentes.zoom');
    pastille.montrer(actif);
    if (loinMaintenant !== tropLoin || !actif) {
      tropLoin = loinMaintenant;
      pastille.action(tropLoin ? 'pentes.zoomer' : null, zoomer);
    }
  }
  map.on('zoom', majTropLoin);

  // ---------- Hors ligne, relief manquant ----------
  let erreurs = 0;
  function majEtat() {
    majTropLoin();
    let texte = '';
    if (couche.choix !== 'aucune' && map.getZoom() >= ZOOM_MIN_PENTES && erreurs) {
      texte = t(estHorsLigne() ? 'pentes.hors-ligne' : 'pentes.erreur');
    }
    note.textContent = texte;
    note.hidden = !texte;
  }
  map.on('error', (e) => {
    // Une tuile abandonnée pendant un déplacement n'est pas un échec
    if (!couche.estSource(e.sourceId) || e.error?.message === 'annulée') return;
    erreurs += 1;
    majEtat();
  });
  map.on('movestart', () => { erreurs = 0; });
  map.on('moveend', majEtat);

  // ---------- Choix de la couche ----------
  function majChoix() {
    boutons.forEach((b) => {
      const actif = b.dataset.genre === couche.choix;
      b.classList.toggle('actif', actif);
      b.setAttribute('aria-pressed', String(actif));
    });
    details.hidden = couche.choix === 'aucune';
    bloc.querySelectorAll('.pentes-legende').forEach((l) => { l.hidden = l.dataset.pour !== couche.choix; });
    majEtat();
    if (pastille.visible) pastille.maj();
  }
  // Deux interrupteurs exclusifs : un appui allume, un second éteint
  function choisir(genre) {
    erreurs = 0;
    couche.afficher(genre);
    majChoix();
  }
  boutons.forEach((b) => b.addEventListener('click', () => {
    choisir(b.dataset.genre === couche.choix ? 'aucune' : b.dataset.genre);
  }));

  // ---------- Opacité ----------
  const afficherOpacite = (v) => { valeurOpacite.textContent = pourcent(v * 100); };
  curseur.value = lire('pentes-opacite', 0.6);
  afficherOpacite(Number(curseur.value));
  curseur.addEventListener('input', () => {
    const v = Number(curseur.value);
    afficherOpacite(v);
    couche.opacite(v);
  });

  majChoix();
  majTextes();
  surLangue(() => {
    majTextes();
    afficherOpacite(Number(curseur.value));
  });
  return bloc;
}
