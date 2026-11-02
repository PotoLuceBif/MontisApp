// Trouver des lieux (stations, bike parks) : par nom ou dans la zone visible, en repères groupés
// sur la carte. Un lieu est un Feature GeoJSON ponctuel dont les propriétés portent `nom`.
import * as maplibregl from 'maplibre-gl';

const DISTANCE_GROUPE_PX = 56;
const ZOOM_LISTE_GROUPE = 13;
// Écritures équivalentes : « St » et « Saint », « 3 Vallées » et « Trois Vallées »…
const EQUIVALENTS = { st: 'saint', ste: 'sainte', 2: 'deux', 3: 'trois', 4: 'quatre', 7: 'sept' };

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

export function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((mot) => EQUIVALENTS[mot] || mot)
    .join(' ');
}

export const contientMot = (texte, mot) => ` ${texte}`.includes(` ${mot}`);

// Plus le score est bas, plus le lieu correspond ; null s'il ne correspond pas
export function scoreRecherche(entree, requete) {
  const { nom, lieu } = entree;
  const mots = requete.split(' ');
  if (nom === requete) return 0;
  if (nom.startsWith(requete)) return 1;
  if (contientMot(nom, requete)) return 2;
  if (mots.every((mot) => contientMot(nom, mot))) return 3;
  if (nom.includes(requete)) return 4;
  if (mots.every((mot) => contientMot(nom, mot) || contientMot(lieu, mot))) return 5;
  return null;
}

// Ce qui est vraiment à l'écran : en 3D, les limites de la carte débordent de la vue
export function lieuxDansLaVue(map, features) {
  const limites = map.getBounds();
  const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
  return features.filter((feature) => {
    if (!limites.contains(feature.geometry.coordinates)) return false;
    const pixel = map.project(feature.geometry.coordinates);
    return pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur;
  });
}

// Les plus grands lieux servent de centre de groupe ; la grille évite de comparer
// chaque lieu à tous les autres quand la zone en contient des milliers.
function grouper(entrees) {
  const rayon2 = DISTANCE_GROUPE_PX * DISTANCE_GROUPE_PX;
  const grille = new Map();
  const groupes = [];
  for (const entree of entrees) {
    const colonne = Math.floor(entree.pixel.x / DISTANCE_GROUPE_PX);
    const ligne = Math.floor(entree.pixel.y / DISTANCE_GROUPE_PX);
    let meilleur = null;
    let meilleurEcart = rayon2;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const groupe of grille.get(`${colonne + dx}:${ligne + dy}`) || []) {
          const ecartX = groupe[0].pixel.x - entree.pixel.x;
          const ecartY = groupe[0].pixel.y - entree.pixel.y;
          const ecart = ecartX * ecartX + ecartY * ecartY;
          if (ecart <= meilleurEcart) {
            meilleur = groupe;
            meilleurEcart = ecart;
          }
        }
      }
    }
    if (meilleur) {
      meilleur.push(entree);
    } else {
      const groupe = [entree];
      groupes.push(groupe);
      const cle = `${colonne}:${ligne}`;
      if (!grille.has(cle)) grille.set(cle, []);
      grille.get(cle).push(groupe);
    }
  }
  return groupes;
}

// `dessin` : l'intérieur du repère. `resume` donne les lignes [libellé, valeur] du survol.
// `surChoix(feature, deplacer)` : `deplacer` vaut vrai quand le lieu n'est pas déjà sous le doigt.
export function creerReperesZone(map, { dessin, titreGroupe, libelleGroupe, resume, surChoix }) {
  let marqueurs = [];
  let popupGroupe = null;
  let minuteurFermetureGroupe = null;
  let popupResume = null;

  function fermerPopups() {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = null;
    if (popupGroupe) popupGroupe.remove();
    popupGroupe = null;
    if (popupResume) popupResume.remove();
    popupResume = null;
  }

  function retirer() {
    fermerPopups();
    marqueurs.forEach((marqueur) => marqueur.remove());
    marqueurs = [];
  }

  function afficherResume(feature) {
    if (popupResume) popupResume.remove();
    const contenu = el('div', 'rando-resume-repere');
    contenu.append(el('strong', 'rando-resume-titre', feature.properties.nom));
    const stats = el('div', 'rando-resume-stats');
    resume(feature).forEach(([libelle, valeur]) => {
      const ligne = el('div', 'rando-resume-ligne');
      ligne.append(el('span', null, libelle), el('strong', null, valeur));
      stats.append(ligne);
    });
    if (stats.children.length) contenu.append(stats);
    popupResume = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: [0, -50],
      maxWidth: '260px',
      className: 'rando-resume-popup',
    })
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(contenu)
      .addTo(map);
  }

  function fermerResume() {
    if (popupResume) popupResume.remove();
    popupResume = null;
  }

  function creerRepere(feature, choisi) {
    const { nom } = feature.properties;
    const element = el('button', 'rando-repere ski-repere');
    element.type = 'button';
    element.classList.toggle('selectionne', feature === choisi);
    element.setAttribute('aria-label', `Ouvrir la fiche de ${nom}`);
    element.innerHTML = dessin;
    element.append(el('span', 'rando-repere-nom', nom));
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherResume(feature);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') fermerResume();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherResume(feature);
    });
    element.addEventListener('blur', fermerResume);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      fermerResume();
      surChoix(feature, false);
    });
    return new maplibregl.Marker({ element, anchor: 'bottom' })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);
  }

  function programmerFermetureGroupe() {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = window.setTimeout(() => {
      if (popupGroupe) popupGroupe.remove();
      popupGroupe = null;
      minuteurFermetureGroupe = null;
    }, 350);
  }

  function afficherGroupe(features, coordonnees) {
    clearTimeout(minuteurFermetureGroupe);
    minuteurFermetureGroupe = null;
    if (popupGroupe) popupGroupe.remove();

    const contenu = el('div', 'rando-groupe-liste ski-groupe-liste');
    contenu.append(el('strong', 'rando-groupe-titre', titreGroupe(features.length)));
    for (const feature of features) {
      const choix = el('button', 'rando-groupe-choix ski-groupe-choix', feature.properties.nom);
      choix.type = 'button';
      choix.addEventListener('click', () => {
        if (popupGroupe) popupGroupe.remove();
        popupGroupe = null;
        surChoix(feature, true);
      });
      contenu.append(choix);
    }
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: '300px', offset: 8 })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupGroupe = popup;
    const elementPopup = popup.getElement();
    elementPopup.addEventListener('pointerenter', () => {
      clearTimeout(minuteurFermetureGroupe);
      minuteurFermetureGroupe = null;
    });
    elementPopup.addEventListener('pointerleave', programmerFermetureGroupe);
    popup.on('close', () => {
      if (popupGroupe === popup) popupGroupe = null;
    });
  }

  function zoomerSurGroupe(features) {
    const limites = new maplibregl.LngLatBounds();
    features.forEach((feature) => limites.extend(feature.geometry.coordinates));
    map.fitBounds(limites, { padding: 90, maxZoom: ZOOM_LISTE_GROUPE, duration: 700 });
  }

  function creerRepereGroupe(features, coordonnees) {
    const element = el('button', 'rando-groupe ski-groupe');
    element.type = 'button';
    element.setAttribute('aria-label', `${libelleGroupe(features.length)} Touchez pour zoomer ou choisir.`);
    element.innerHTML =
      `<svg viewBox="0 0 56 56" aria-hidden="true"><path class="rando-groupe-halo" d="M28 2 52 16v24L28 54 4 40V16z"/><path class="rando-groupe-forme" d="M28 7 47 18v20L28 49 9 38V18z"/></svg><span>${features.length}</span>`;
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherGroupe(features, coordonnees);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureGroupe();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherGroupe(features, coordonnees);
    });
    element.addEventListener('blur', programmerFermetureGroupe);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (map.getZoom() >= ZOOM_LISTE_GROUPE) {
        afficherGroupe(features, coordonnees);
        return;
      }
      fermerPopups();
      zoomerSurGroupe(features);
    });
    return new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(coordonnees)
      .addTo(map);
  }

  return {
    retirer,
    // Le lieu choisi garde son repère, même hors des résultats
    actualiser(features, choisi = null) {
      retirer();
      const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
      const visibles = features
        .filter((feature) => feature !== choisi)
        .map((feature) => ({ feature, pixel: map.project(feature.geometry.coordinates) }))
        .filter(({ pixel }) => pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur);
      for (const groupe of grouper(visibles)) {
        if (groupe.length === 1) {
          marqueurs.push(creerRepere(groupe[0].feature, choisi));
        } else {
          marqueurs.push(creerRepereGroupe(groupe.map(({ feature }) => feature), groupe[0].feature.geometry.coordinates));
        }
      }
      if (choisi) marqueurs.push(creerRepere(choisi, choisi));
    },
  };
}
