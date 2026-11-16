// Rubrique Soleil et Lune (lot 4.7), sous Météo et Carte. En tête, la frise commune : jour, heure, course du
// soleil et de la Lune (soleil-reglage.js), et l'option « Dans le ciel » (3D) qui dessine les deux astres
// à leur place sans l'ombre. Puis la ligne Soleil (position et Ombre du soleil) et la ligne Lune (lune.js,
// chargée à sa première ouverture). Tout se calcule au centre de la carte.
// Le réglage et le dessin du ciel ne se chargent qu'à la première ouverture, ou au démarrage si l'ombre ou
// le ciel sont allumés : le code de démarrage reste léger.
import { creerOptionOmbres } from './ombres-panneau.js';
import { creerPastilleCouche } from './couches-actives.js';
import { etat } from './options-carte.js';
import { lire, ecrire } from './reglages.js';
import { poser, surLangue, t } from './i18n.js';

const ICONE_CIEL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="9" r="3.2"/><path d="M9 2.5v1.3M2.5 9h1.3M14.2 9h1.3M9 14.2v1.3M4.4 4.4l.9.9M12.7 5.3l.9-.9M4.4 13.6l.9-.9"/><path d="M21.5 17.2a4.6 4.6 0 1 1-5-5 3.7 3.7 0 0 0 5 5Z"/></svg>`;

export const ouvrirSoleilLune = (module = 'ombres') =>
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'ciel', module } }));

export function creerSoleilLune(map) {
  const abonnes = new Set();
  const entete = document.createElement('div');
  entete.className = 'ciel-entete';
  entete.innerHTML = `
    <div class="relief-bascule ciel-choix" role="group">
      <button type="button" aria-pressed="false">${ICONE_CIEL}<span data-i18n="ciel.dans-le-ciel"></span></button>
    </div>
    <p class="note ciel-fuseau"></p>
  `;
  entete.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const choixCiel = entete.querySelector('.ciel-choix');
  const boutonCiel = choixCiel.querySelector('button');
  const fuseau = entete.querySelector('.ciel-fuseau');

  // Position du soleil, en tête de la ligne Soleil
  const position = document.createElement('div');
  position.className = 'ombres-soleil ciel-position-soleil';
  position.setAttribute('role', 'status');

  const visible = () => entete.offsetParent !== null;
  let ombres = null;
  let cielActif = lire('ciel-astres', false);
  let reglage = null;
  let m = null; // modules chargés : { r: réglage, s: soleil, l: Lune, c: ciel }
  let ciel = null;
  let lieu = null;
  let chargement = null;
  const charger = () => {
    chargement ??= Promise.all([
      import('./soleil-reglage.js'),
      import('./soleil.js'),
      import('./lune-calcul.js'),
      import('./soleil-ciel.js'),
      import('./ciel-lieu.js'),
    ]).then(([r, s, l, c, lieuModule]) => {
      m = { r, s, l };
      reglage = r.creerReglageSoleil(map, {
        course: true,
        surChangement: (options) => maj(options),
        actif: () => visible() || Boolean(ombres?.actif()) || cielActif,
      });
      entete.prepend(reglage.element);
      // Le lieu, en petit sous le jour
      lieu = lieuModule.creerLieuCiel(map, { reglage, visible });
      reglage.element.querySelector('.ombres-jour').after(lieu.element);
      position.innerHTML = `${r.cadran('ombres-cadran')}<span class="ciel-position-texte"></span>`;
      ciel = c.creerSoleilCiel(map);
      maj();
      return reglage;
    });
    return chargement;
  };

  function majTextes() {
    reglage.majTextes();
    const cle = reglage.fuseauLieu() === null ? 'soleil.fuseau-appareil' : 'ciel.fuseau-lieu';
    fuseau.textContent = t(cle, { fuseau: m.s.nomDecalage(reglage.decalage()) });
    lieu.majTextes();
    const soleil = reglage.soleil();
    if (soleil) {
      // Même texte que le réglage (« Soleil à 23°, vers 160° SSE »)
      position.querySelector('.ciel-position-texte').textContent = reglage.element.querySelector('.ombres-soleil-texte').textContent;
      m.r.tournerCadrans(position, soleil, map.getBearing());
    }
  }

  // ---------- Soleil et Lune dans le ciel, en 3D ----------
  const luneIci = () => {
    const { lng, lat } = map.getCenter();
    const instant = reglage.instant();
    return { ...m.l.positionLune(instant, lat, lng), fraction: m.l.eclairementLune(instant).fraction };
  };
  // Une visite ou une sortie montre son propre soleil (visite-station.js, sortie-ombre.js)
  function majCiel() {
    if (!ciel) return;
    const voir = (cielActif || Boolean(ombres?.actif())) && etat.mode3D && !etat.enVisite && !etat.ombreSortie;
    ciel.montrer(voir ? reglage.soleil() : null, voir ? luneIci() : null);
  }

  const pastille = creerPastilleCouche({
    ordre: 2,
    nom: () => (reglage ? t('ciel.pastille', { heure: m.s.heureDuLieu(reglage.instant(), reglage.decalage()) }) : t('menu.ciel')),
    legende: () => `<span class="mini-icone-ciel">${ICONE_CIEL}</span>`,
    rubrique: 'ciel',
    onOuvrir: () => ouvrirSoleilLune(),
    onRetirer: () => basculerCiel(false),
  });
  const majPastille = () => {
    pastille.montrer(cielActif && Boolean(etat.mode3D));
    if (pastille.visible) pastille.maj();
  };

  function majChoix() {
    boutonCiel.classList.toggle('actif', cielActif);
    boutonCiel.setAttribute('aria-pressed', String(cielActif));
    // Option utile en 3D seulement : masquée en 2D (règle des panneaux)
    choixCiel.hidden = !etat.mode3D;
  }

  async function basculerCiel(oui) {
    cielActif = oui;
    ecrire('ciel-astres', oui);
    majChoix();
    if (oui) await charger();
    majCiel();
    majPastille();
  }
  boutonCiel.addEventListener('click', () => basculerCiel(!cielActif));

  // `attendre` : pendant un glissement du curseur, l'ombre portée attend que le doigt se pose
  function maj(options = {}) {
    if (!reglage) return;
    reglage.calculer();
    if (visible()) majTextes();
    majCiel();
    if (pastille.visible) pastille.maj();
    abonnes.forEach((f) => f(options));
  }

  // Le soleil et la Lune se calculent au centre de la carte : un grand déplacement les change un peu
  map.on('moveend', () => { if (visible() || ombres?.actif() || cielActif) maj(); });
  map.on('rotate', () => { if (reglage?.soleil()) m.r.tournerCadrans(position, reglage.soleil(), map.getBearing()); });
  window.addEventListener('mode3d', () => {
    majChoix();
    majCiel();
    majPastille();
  });
  surLangue(() => { if (reglage && visible()) majTextes(); });

  const partage = {
    // Promesse du réglage, chargé au premier besoin
    charger,
    // `f({ attendre })` à chaque changement de jour, d'heure ou de lieu ; renvoie de quoi se désabonner
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    // L'ombre s'allume ou s'éteint, une visite ou une sortie commence ou finit
    majCiel,
  };

  ombres = creerOptionOmbres(map, partage);
  // Une visite ou une sortie rappelle etat.majOmbres ; ombres.js la remplace (et rappelle majCiel) une fois chargé
  etat.majOmbres ??= majCiel;
  ombres.bloc.prepend(position);
  poserAttributCiel();
  majChoix();
  if (cielActif) basculerCiel(true);

  function poserAttributCiel() {
    choixCiel.setAttribute('aria-label', t('ciel.dans-le-ciel'));
    surLangue(() => choixCiel.setAttribute('aria-label', t('ciel.dans-le-ciel')));
  }

  return {
    partage,
    entete,
    // Le panneau s'ouvre : le centre de la carte a pu changer depuis
    surOuverture: () => charger().then(() => requestAnimationFrame(() => {
      maj();
      lieu.surOuverture();
    })),
    ombres: {
      id: 'ombres',
      labelCle: 'soleil.titre',
      icone: 'ombre',
      panneau: ombres.bloc,
      activer() {},
      desactiver() {},
    },
  };
}
