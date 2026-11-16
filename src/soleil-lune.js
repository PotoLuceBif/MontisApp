// Rubrique Soleil et Lune (lot 4.7), sous Météo et Carte : le jour et l'heure, communs au soleil et à la
// Lune, en tête avec la position du soleil ; puis l'Ombre du soleil (venue de Carte › Relief) et la Lune,
// chargée à sa première ouverture. Le soleil et la Lune se calculent au centre de la carte.
// Le réglage (soleil-reglage.js) ne se charge qu'à la première ouverture, ou au démarrage si l'ombre est
// allumée : il garde le code de démarrage léger.
import { creerOptionOmbres } from './ombres-panneau.js';
import { surLangue, t } from './i18n.js';

export function creerSoleilLune(map) {
  const abonnes = new Set();
  const entete = document.createElement('div');
  entete.className = 'ciel-entete';
  const fuseau = document.createElement('p');
  fuseau.className = 'note ciel-fuseau';

  const visible = () => entete.offsetParent !== null;
  let ombres = null;
  let reglage = null;
  let nomDecalage = null;
  let chargement = null;
  const charger = () => {
    chargement ??= Promise.all([import('./soleil-reglage.js'), import('./soleil.js')]).then(([r, s]) => {
      nomDecalage = s.nomDecalage;
      reglage = r.creerReglageSoleil(map, {
        surChangement: (options) => maj(options),
        actif: () => visible() || Boolean(ombres?.actif()),
      });
      entete.prepend(reglage.element);
      if (visible()) maj();
      return reglage;
    });
    return chargement;
  };
  entete.append(fuseau);

  function majTextes() {
    reglage.majTextes();
    fuseau.textContent = t('soleil.fuseau-appareil', { fuseau: nomDecalage(reglage.decalage()) });
  }

  // `attendre` : pendant un glissement du curseur, l'ombre portée attend que le doigt se pose
  function maj(options = {}) {
    if (!reglage) return;
    reglage.calculer();
    if (visible()) majTextes();
    abonnes.forEach((f) => f(options));
  }

  // Le soleil et la Lune se calculent au centre de la carte : un grand déplacement les change un peu
  map.on('moveend', () => { if (visible() || ombres?.actif()) maj(); });
  surLangue(() => { if (reglage && visible()) majTextes(); });

  const partage = {
    // Promesse du réglage, chargé au premier besoin
    charger,
    // `f({ attendre })` à chaque changement de jour, d'heure ou de lieu ; renvoie de quoi se désabonner
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
  };

  ombres = creerOptionOmbres(map, partage);

  return {
    partage,
    entete,
    // Le panneau s'ouvre : le centre de la carte a pu changer depuis
    surOuverture: () => charger().then(() => requestAnimationFrame(() => maj())),
    ombres: {
      id: 'ombres',
      labelCle: 'ombres.titre',
      icone: 'ombre',
      panneau: ombres.bloc,
      activer() {},
      desactiver() {},
    },
  };
}
