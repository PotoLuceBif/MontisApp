// Repères posés sur la carte après « Rechercher ici » : un par itinéraire, regroupés quand ils se
// touchent. Le survol ou l'appui long donne un résumé, le clic ouvre la fiche.
import * as maplibregl from 'maplibre-gl';
import { distance, echantillonner, extraireTrace, titreDe } from './rando-api.js';
import { altitudesDuTrace, denivele, lisser } from './rando-profil.js';
import { DECALAGE_PIN, imagePin } from './pins.js';
import { formatAltitude, formatDistance } from './unites.js';
import { t } from './i18n.js';

const PARALLELISME_REPERES = 2;
const DISTANCE_GRAPPE_PX = 56;

const km = formatDistance;
const metres = formatAltitude;

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

// Le milieu et les extrémités de la partie du segment [a, b] qui entre dans la zone
function pointsDansZone(a, b, limites) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let debut = 0;
  let fin = 1;
  const contraintes = [
    [-dx, a[0] - limites.getWest()],
    [dx, limites.getEast() - a[0]],
    [-dy, a[1] - limites.getSouth()],
    [dy, limites.getNorth() - a[1]],
  ];
  for (const [p, q] of contraintes) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const ratio = q / p;
      if (p < 0) debut = Math.max(debut, ratio);
      else fin = Math.min(fin, ratio);
      if (debut > fin) return null;
    }
  }
  const pointDebut = [a[0] + debut * dx, a[1] + debut * dy];
  const pointFin = [a[0] + fin * dx, a[1] + fin * dy];
  return [
    [pointDebut[0] + (pointFin[0] - pointDebut[0]) / 2, pointDebut[1] + (pointFin[1] - pointDebut[1]) / 2],
    pointDebut,
    pointFin,
  ];
}

function ancrer(trace, limites, centre) {
  let coordonnees = null;
  let meilleureDistance = Infinity;
  for (const ligne of trace.lignes) {
    if (ligne.length && limites.contains(ligne[0])) return ligne[0];
    for (let i = 1; i < ligne.length; i += 1) {
      for (const point of pointsDansZone(ligne[i - 1], ligne[i], limites) ?? []) {
        const ecart = distance(point, centre);
        if (ecart < meilleureDistance) {
          coordonnees = point;
          meilleureDistance = ecart;
        }
      }
    }
  }
  return coordonnees;
}

// `pinDe(route)` : nom du pin d'un itinéraire ; `poser` reçoit des tracés déjà connus (ski de rando)
export function creerDecouverte(map, { clients = {}, ouvrirRoute, masque = () => false, nomPluriel = 'velo.pluriel', pinDe = (route) => (route.carte === 'hiking' ? 'rando' : 'route') }) {
  let actif = false;
  let entrees = [];
  let marqueurs = [];
  let controleur = null;
  let popupGrappe = null;
  let popupResume = null;
  let minuteurGrappe = null;
  let minuteurResume = null;

  function retirerElements() {
    clearTimeout(minuteurGrappe);
    minuteurGrappe = null;
    popupGrappe?.remove();
    popupGrappe = null;
    clearTimeout(minuteurResume);
    minuteurResume = null;
    popupResume?.remove();
    popupResume = null;
    marqueurs.forEach((marqueur) => marqueur.remove());
    marqueurs = [];
  }

  function programmerFermetureGrappe() {
    if (popupResume) return;
    clearTimeout(minuteurGrappe);
    minuteurGrappe = window.setTimeout(() => {
      popupGrappe?.remove();
      popupGrappe = null;
      minuteurGrappe = null;
    }, 350);
  }

  function programmerFermetureResume(delai = 180) {
    clearTimeout(minuteurResume);
    minuteurResume = window.setTimeout(() => {
      popupResume?.remove();
      popupResume = null;
      minuteurResume = null;
      if (popupGrappe) programmerFermetureGrappe();
    }, delai);
  }

  function afficherResume(entree) {
    clearTimeout(minuteurResume);
    minuteurResume = null;
    popupResume?.remove();

    const contenu = el('div', 'rando-resume-repere');
    contenu.append(el('strong', 'rando-resume-titre', titreDe(entree.route)));
    const stats = el('div', 'rando-resume-stats');
    const longueur = Number(entree.details?.route?.length);
    const echantillon = echantillonner(entree.trace.chaine);
    const total = longueur > 0 ? longueur : echantillon.total;
    const ajouterStat = (valeur, libelle) => {
      const ligne = el('div', 'rando-resume-ligne');
      ligne.append(el('span', null, libelle), el('strong', null, valeur));
      stats.append(ligne);
    };
    ajouterStat(km(total), t('editeur.distance'));
    if (entree.resumeAltitude) {
      ajouterStat(`+${metres(entree.resumeAltitude.plus)}`, t('decouverte.denivele-plus'));
      ajouterStat(`−${metres(entree.resumeAltitude.moins)}`, t('decouverte.denivele-moins'));
      ajouterStat(metres(entree.resumeAltitude.max), t('decouverte.alt-max'));
      ajouterStat(metres(entree.resumeAltitude.min), t('decouverte.alt-min'));
    } else if (entree.erreurResumeAltitude) {
      ajouterStat(t('decouverte.indisponible'), t('decouverte.denivele-altitudes'));
    } else {
      ajouterStat(t('decouverte.calcul'), t('decouverte.denivele-altitudes'));
    }
    contenu.append(stats);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: true,
      maxWidth: '260px',
      offset: [0, 0],
      className: 'rando-resume-popup',
    })
      .setLngLat(entree.coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupResume = popup;
    if (popupGrappe) {
      const boundsCarte = map.getContainer().getBoundingClientRect();
      const boundsGrappe = popupGrappe.getElement().getBoundingClientRect();
      const boundsResume = popup.getElement().getBoundingClientRect();
      const point = map.project(entree.coordonnees);
      const espaceDroite = boundsCarte.right - boundsGrappe.right;
      const espaceGauche = boundsGrappe.left - boundsCarte.left;
      const aDroite = espaceDroite >= boundsResume.width + 12 || espaceDroite >= espaceGauche;
      const centreX = aDroite
        ? boundsGrappe.right + 12 + boundsResume.width / 2
        : boundsGrappe.left - 12 - boundsResume.width / 2;
      const centreY = (boundsGrappe.top + boundsGrappe.bottom) / 2;
      popup.setOffset([centreX - (boundsCarte.left + point.x), centreY - (boundsCarte.top + point.y)]);
    }
    popup.on('close', () => {
      if (popupResume === popup) popupResume = null;
    });

    if (entree.resumeAltitude || entree.erreurResumeAltitude || entree.calculResumeAltitude) return;
    entree.calculResumeAltitude = (async () => {
      const pas = Math.max(1, Math.ceil(echantillon.points.length / 100));
      const pointsAltitude = echantillon.points.filter((_, index) => index % pas === 0);
      const dernierPoint = echantillon.points[echantillon.points.length - 1];
      if (pointsAltitude[pointsAltitude.length - 1] !== dernierPoint) pointsAltitude.push(dernierPoint);
      if (pointsAltitude.length < 2) throw new Error('Tracé trop court');
      const lisses = lisser(await altitudesDuTrace(pointsAltitude, total), 2);
      const { plus, moins } = denivele(lisses, 3);
      return { plus, moins, min: Math.min(...lisses), max: Math.max(...lisses) };
    })();
    entree.calculResumeAltitude
      .then((resume) => {
        entree.resumeAltitude = resume;
        if (popupResume === popup) afficherResume(entree);
      })
      .catch((erreur) => {
        console.warn(`Résumé d’altitude indisponible pour l’itinéraire ${entree.route.id} :`, erreur);
        entree.erreurResumeAltitude = true;
        if (popupResume === popup) afficherResume(entree);
      })
      .finally(() => {
        entree.calculResumeAltitude = null;
      });
  }

  function ouvrir(route) {
    retirerElements();
    void ouvrirRoute(route);
  }

  function creerRepere(entree) {
    const { route, coordonnees } = entree;
    const element = el('button', 'rando-repere');
    element.type = 'button';
    element.setAttribute('aria-label', t('decouverte.resume-aria', { nom: titreDe(route) }));
    element.title = t('decouverte.resume-aide');
    element.append(imagePin(pinDe(route)), el('span', 'rando-repere-nom', titreDe(route)));
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherResume(entree);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureResume();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherResume(entree);
    });
    element.addEventListener('blur', () => programmerFermetureResume());
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    let appuiLong = false;
    let minuteurAppuiLong = null;
    let ignorerClicAppuiLong = false;
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      appuiLong = false;
      minuteurAppuiLong = window.setTimeout(() => {
        appuiLong = true;
        afficherResume(entree);
      }, 550);
    });
    const terminerAppuiLong = () => {
      clearTimeout(minuteurAppuiLong);
      minuteurAppuiLong = null;
      if (!appuiLong) return;
      ignorerClicAppuiLong = true;
      window.setTimeout(() => {
        ignorerClicAppuiLong = false;
      }, 500);
      programmerFermetureResume(3500);
    };
    element.addEventListener('pointerup', terminerAppuiLong);
    element.addEventListener('pointercancel', terminerAppuiLong);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      if (ignorerClicAppuiLong) {
        event.preventDefault();
        ignorerClicAppuiLong = false;
        return;
      }
      ouvrir(route);
    });
    return new maplibregl.Marker({ element, anchor: 'bottom', offset: DECALAGE_PIN }).setLngLat(coordonnees).addTo(map);
  }

  function afficherGrappe(routes, coordonnees) {
    clearTimeout(minuteurGrappe);
    minuteurGrappe = null;
    popupGrappe?.remove();

    const contenu = el('div', 'rando-groupe-liste');
    contenu.appendChild(el('strong', 'rando-groupe-titre', t('decouverte.proximite', { n: routes.length, nom: t(nomPluriel) })));
    routes.forEach((entree) => {
      const choix = el('button', 'rando-groupe-choix', titreDe(entree.route));
      choix.type = 'button';
      choix.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'touch') afficherResume(entree);
      });
      choix.addEventListener('pointerleave', (event) => {
        if (event.pointerType !== 'touch') programmerFermetureResume();
      });
      choix.addEventListener('focus', () => {
        if (choix.matches(':focus-visible')) afficherResume(entree);
      });
      choix.addEventListener('blur', () => programmerFermetureResume());
      choix.addEventListener('click', () => ouvrir(entree.route));
      contenu.appendChild(choix);
    });
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, closeOnMove: false, maxWidth: '300px', offset: 8 })
      .setLngLat(coordonnees)
      .setDOMContent(contenu)
      .addTo(map);
    popupGrappe = popup;
    const elementPopup = popup.getElement();
    elementPopup.addEventListener('pointerenter', () => {
      clearTimeout(minuteurGrappe);
      minuteurGrappe = null;
    });
    elementPopup.addEventListener('pointerleave', programmerFermetureGrappe);
    popup.on('close', () => {
      if (popupGrappe === popup) {
        popupGrappe = null;
        popupResume?.remove();
      }
    });
  }

  function creerGrappe(routes, coordonnees) {
    const element = el('button', 'rando-groupe');
    element.type = 'button';
    element.setAttribute('aria-label', t('decouverte.regroupes-aria', { n: routes.length, nom: t(nomPluriel) }));
    element.title = t('decouverte.regroupes-aide', { n: routes.length, nom: t(nomPluriel) });
    element.innerHTML =
      `<svg viewBox="0 0 56 56" aria-hidden="true"><path class="rando-groupe-halo" d="M28 2 52 16v24L28 54 4 40V16z"/><path class="rando-groupe-forme" d="M28 7 47 18v20L28 49 9 38V18z"/></svg><span>${routes.length}</span>`;
    element.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch') afficherGrappe(routes, coordonnees);
    });
    element.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'touch') programmerFermetureGrappe();
    });
    element.addEventListener('focus', () => {
      if (element.matches(':focus-visible')) afficherGrappe(routes, coordonnees);
    });
    element.addEventListener('blur', () => programmerFermetureGrappe());
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      afficherGrappe(routes, coordonnees);
    });
    return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(coordonnees).addTo(map);
  }

  function actualiser() {
    retirerElements();
    if (!actif || masque() || !entrees.length) return;

    const { clientWidth: largeur, clientHeight: hauteur } = map.getContainer();
    const visibles = entrees
      .map((entree) => ({ entree, pixel: map.project(entree.coordonnees) }))
      .filter(({ pixel }) => pixel.x >= 0 && pixel.x <= largeur && pixel.y >= 0 && pixel.y <= hauteur);
    const parents = visibles.map((_, index) => index);
    const racine = (depart) => {
      let index = depart;
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    };
    for (let i = 0; i < visibles.length; i += 1) {
      for (let j = i + 1; j < visibles.length; j += 1) {
        const dx = visibles[i].pixel.x - visibles[j].pixel.x;
        const dy = visibles[i].pixel.y - visibles[j].pixel.y;
        if (dx * dx + dy * dy <= DISTANCE_GRAPPE_PX * DISTANCE_GRAPPE_PX) parents[racine(j)] = racine(i);
      }
    }
    const groupes = new Map();
    visibles.forEach(({ entree }, index) => {
      const id = racine(index);
      if (!groupes.has(id)) groupes.set(id, []);
      groupes.get(id).push(entree);
    });
    groupes.forEach((groupe) => {
      if (groupe.length === 1) {
        marqueurs.push(creerRepere(groupe[0]));
        return;
      }
      const coordonnees = groupe.reduce(
        (centre, { coordonnees: point }) => [centre[0] + point[0] / groupe.length, centre[1] + point[1] / groupe.length],
        [0, 0]
      );
      marqueurs.push(creerGrappe(groupe, coordonnees));
    });
  }

  function retirer() {
    controleur?.abort();
    controleur = null;
    entrees = [];
    retirerElements();
  }

  return {
    actualiser,
    retirer,
    masquer: retirerElements,
    activer() {
      actif = true;
      map.on('moveend', actualiser);
    },
    desactiver() {
      actif = false;
      map.off('moveend', actualiser);
      retirer();
    },
    // Itinéraires dont le tracé est déjà là : [{ route, trace: { chaine, lignes } }]
    poser(liste) {
      retirer();
      const limites = map.getBounds();
      const centre = map.getCenter().toArray();
      entrees = liste
        .map(({ route, trace }) => ({ route, trace, coordonnees: ancrer(trace, limites, centre) }))
        .filter(({ coordonnees }) => coordonnees);
      actualiser();
      return entrees.length;
    },
    // Rend le nombre de repères posés, ou null si une autre recherche a pris la main
    async charger(routes, progression = () => {}) {
      retirer();
      if (!routes.length) return { affiches: 0, manquants: 0 };
      const requete = new AbortController();
      controleur = requete;
      const limites = map.getBounds();
      const centre = map.getCenter().toArray();
      const ancrages = new Array(routes.length);
      let prochain = 0;
      let termines = 0;
      const charger = async () => {
        while (prochain < routes.length && !requete.signal.aborted) {
          const index = prochain;
          prochain += 1;
          const route = routes[index];
          try {
            const details = await clients[route.carte].details(route.id, requete.signal);
            if (requete.signal.aborted) return;
            const trace = extraireTrace(details);
            const coordonnees = ancrer(trace, limites, centre);
            if (coordonnees) ancrages[index] = { route, details, trace, coordonnees };
          } catch (erreur) {
            if (erreur.name === 'AbortError') return;
            console.warn(`Repère indisponible pour l’itinéraire ${route.id} :`, erreur);
          } finally {
            termines += 1;
            if (!requete.signal.aborted) progression(termines, routes.length);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLELISME_REPERES, routes.length) }, charger));
      if (requete.signal.aborted || controleur !== requete) return null;
      entrees = ancrages.filter(Boolean);
      actualiser();
      return { affiches: entrees.length, manquants: routes.length - entrees.length };
    },
  };
}
