// Grands itinéraires découpés en tronçons (EuroVelo, GR…) : un panneau qui donne l'ensemble, puis une
// liste compacte. Un tronçon s'ouvre dans la fiche habituelle ; la flèche retour ramène à la liste.
import { creerPanneauCarte } from './panneau-carte.js';
import { distance, extraireTrace, niveau, titreDe } from './rando-api.js';

const PARALLELE = 3;
const MEMOIRE_MAX = 80;
const SAUT_MAX = 300; // m : au-delà, deux morceaux ne se suivent pas et le profil n'aurait pas de sens
// Le nom d'un itinéraire entier ne précise ni partie ni étape : on évite d'en charger les ~10 Mo pour rien
const NOM_DE_TRONCON = /part|partie|tron[cç]on|etapa|section|france|deel|teil|[–,→]|\d{2}|verbindung|variant/i;

const km = (m) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: m < 100000 ? 1 : 0 })} km`;
const metres = (m) => `${Math.round(m).toLocaleString('fr-FR')} m`;

export const estIntegral = (route) => !NOM_DE_TRONCON.test(route.name ?? '');

export function aDesSauts(chaine) {
  for (let i = 1; i < chaine.length; i += 1) {
    if (distance(chaine[i - 1], chaine[i]) > SAUT_MAX) return true;
  }
  return false;
}

export function creerItineraires(map, { activite, editeur, clients, typeDe, onFermerTout = () => {}, ouvrirMenu = () => {}, fermerMenu = () => {}, signaler = () => {} }) {
  const source = `${activite.id}-groupe`;
  const couche = `${activite.id}-groupe-ligne`;
  const memoire = new Map();
  let groupe = null; // { titre, routes, longueurTotale, observateur }
  let catalogue = null;
  let jeton = 0;
  const lignesChargees = new Map();

  const panneau = creerPanneauCarte({
    cle: `${activite.id}-liste-reduite`,
    libelle: 'liste des itinéraires',
    classe: 'bf-outil bf-liste',
    onFermer: () => onFermerTout(),
    onRetour: () => revenir(),
  });
  panneau.corps.innerHTML = `
    <div class="pc-groupe-stats" hidden>
      <div class="parcours-stat"><span>Tronçons</span><strong data-g="nombre"></strong></div>
      <div class="parcours-stat"><span>Distance connue</span><strong data-g="distance"></strong></div>
    </div>
    <button type="button" class="para-bouton pc-groupe-tout" hidden>Voir tout l’itinéraire sur la carte</button>
    <p class="note pc-liste-message" role="status" aria-live="polite" hidden></p>
    <div class="pc-liste"></div>
    <p class="note pc-liste-note" hidden></p>
  `;
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const liste = $('.pc-liste');
  const message = $('.pc-liste-message');
  const note = $('.pc-liste-note');
  const blocStats = $('.pc-groupe-stats');
  const boutonTout = $('.pc-groupe-tout');

  function afficherMessage(texte) {
    message.textContent = texte;
    message.hidden = !texte;
  }

  function assurerCouche() {
    if (map.getSource(source)) return;
    map.addSource(source, { type: 'geojson', tolerance: 0, data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: couche,
      type: 'line',
      source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': activite.couleurGroupe, 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2, 14, 4] },
    }, map.getLayer(`${activite.id}-trace-contour`) ? `${activite.id}-trace-contour` : undefined); // le tronçon choisi reste au-dessus
  }

  function dessinerGroupe() {
    assurerCouche();
    map.getSource(source).setData({
      type: 'FeatureCollection',
      features: [...lignesChargees.values()].map((coordinates) => ({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates }, properties: {} })),
    });
  }

  async function detailsDe(route, signal) {
    const cle = `${route.carte}/${route.id}`;
    if (memoire.has(cle)) return memoire.get(cle);
    const details = await clients[route.carte].details(route.id, signal);
    const trace = extraireTrace(details);
    const entree = { details, trace, longueur: Number(details.route?.length) || 0 };
    memoire.set(cle, entree);
    while (memoire.size > MEMOIRE_MAX) memoire.delete(memoire.keys().next().value);
    return entree;
  }

  function revenir() {
    if (catalogue && groupe) {
      nettoyerGroupe();
      afficherCatalogue();
      return;
    }
    nettoyerGroupe();
    catalogue = null;
    panneau.masquer();
    ouvrirMenu();
  }

  function nettoyerGroupe() {
    groupe?.observateur?.disconnect();
    groupe = null;
    jeton += 1;
    lignesChargees.clear();
    if (map.getSource(source)) dessinerGroupe();
  }

  // ---------- Ouverture d'un itinéraire ----------
  async function ouvrirRoute(route, { depuisGroupe = false, integral = false } = {}) {
    // Depuis le menu, ce panneau est encore caché : le message s'affiche là où l'on regarde
    const dire = panneau.ouvert ? afficherMessage : signaler;
    dire('Chargement de l’itinéraire…');
    try {
      const { details, trace, longueur } = await detailsDe(route);
      dire('');
      const sous = Array.isArray(details.subroutes) ? details.subroutes : (details.subroutes ? Object.values(details.subroutes) : []);
      if (!integral && sous.length >= 2) {
        ouvrirGroupe({
          titre: titreDe(route),
          routes: sous.map((s) => ({ ...s, carte: route.carte })),
          integrale: { ...route },
          longueurTotale: longueur,
        });
        return true;
      }
      if (!trace.lignes.length) throw new Error('tracé vide');
      const { court } = niveau(details.group ?? route.group);
      const etapes = details.itinerary ?? route.itinerary;
      fermerMenu();
      panneau.masquer();
      const hote = `${route.carte}.waymarkedtrails.org`;
      editeur.ouvrirTrace({
        nom: titreDe(route),
        chaine: trace.chaine,
        lignes: trace.lignes,
        avecSauts: aDesSauts(trace.chaine),
        lien: `https://${hote}/#route?id=${route.id}`,
        meta: [typeDe(route), court, etapes?.length ? etapes.join(' → ') : null].filter(Boolean).join(' · '),
        infos: activite.infosRoute?.(details, trace) ?? [],
        onRetour: depuisGroupe && groupe ? () => reafficherGroupe() : null,
        onAnalyse: ({ plus }) => noterDenivele(route, plus),
      });
      return true;
    } catch (erreur) {
      console.warn('Itinéraire :', erreur);
      dire('Impossible de charger cet itinéraire pour le moment.');
      return false;
    }
  }

  // ---------- Groupe de tronçons ----------
  function noterDenivele(route, plus) {
    const cle = `${route.carte}/${route.id}`;
    if (memoire.has(cle)) memoire.get(cle).plus = plus;
    const ligne = liste.querySelector(`[data-cle="${cle}"]`);
    if (ligne) rendreDetail(ligne, route);
  }

  function rendreDetail(ligne, route) {
    const entree = memoire.get(`${route.carte}/${route.id}`);
    const textes = [];
    if (entree?.longueur) textes.push(km(entree.longueur));
    if (Number.isFinite(entree?.plus)) textes.push(`D+ ${metres(entree.plus)}`);
    ligne.querySelector('.pc-ligne-valeur').textContent = textes.join(' · ') || '…';
  }

  function rendreTotal() {
    if (!groupe) return;
    const connue = groupe.routes.reduce((total, route) => total + (memoire.get(`${route.carte}/${route.id}`)?.longueur ?? 0), 0);
    $('[data-g="distance"]').textContent = groupe.longueurTotale ? km(groupe.longueurTotale) : connue ? `≈ ${km(connue)}` : '…';
  }

  // Les distances se chargent au fil de la liste : un itinéraire compte des dizaines de tronçons
  function preparerChargement(routes, lignes) {
    const file = [];
    const demande = jeton;
    let enCours = 0;
    const suivante = () => {
      while (enCours < PARALLELE && file.length && demande === jeton) {
        const { route, ligne } = file.shift();
        enCours += 1;
        detailsDe(route)
          .then((entree) => {
            if (demande !== jeton) return;
            rendreDetail(ligne, route);
            rendreTotal();
            lignesChargees.set(`${route.carte}/${route.id}`, entree.trace.lignes);
            dessinerGroupe();
          })
          .catch((erreur) => console.warn('Tronçon :', erreur))
          .finally(() => {
            enCours -= 1;
            suivante();
          });
      }
    };
    const observateur = new IntersectionObserver((entrees) => {
      entrees.forEach(({ isIntersecting, target }) => {
        if (!isIntersecting) return;
        observateur.unobserve(target);
        const route = routes[Number(target.dataset.rang)];
        if (route) file.push({ route, ligne: target });
      });
      suivante();
    }, { root: panneau.element });
    lignes.forEach((ligne) => observateur.observe(ligne));
    return observateur;
  }

  function reafficherGroupe() {
    editeur.fermerSansQuitter();
    panneau.afficher();
    panneau.definirResume({ nom: groupe.titre });
  }

  function ouvrirGroupe({ titre, routes, integrale = null, longueurTotale = 0, resume = '' }) {
    nettoyerGroupe();
    fermerMenu();
    editeur.fermerSansQuitter();
    const troncons = routes.filter((route) => route.id !== integrale?.id);
    groupe = { titre, routes: troncons, longueurTotale };
    panneau.titre.textContent = titre;
    panneau.meta.textContent = '';
    panneau.definirResume({ nom: titre, detail: `${troncons.length} tronçons`, valeur: '', unite: '', rose: activite.icone });
    blocStats.hidden = false;
    $('[data-g="nombre"]').textContent = String(troncons.length);
    rendreTotal();
    boutonTout.hidden = !integrale;
    boutonTout.onclick = integrale ? () => void ouvrirRoute(integrale, { integral: true, depuisGroupe: true }) : null;
    note.hidden = !resume;
    note.textContent = resume;
    afficherMessage('');
    const lignes = troncons.map((route, rang) => {
      const ligne = document.createElement('button');
      ligne.type = 'button';
      ligne.className = 'pc-ligne';
      ligne.dataset.rang = String(rang);
      ligne.dataset.cle = `${route.carte}/${route.id}`;
      const nom = document.createElement('span');
      nom.className = 'pc-ligne-nom';
      nom.textContent = route.name || titreDe(route);
      const valeur = document.createElement('span');
      valeur.className = 'pc-ligne-valeur';
      valeur.textContent = '…';
      ligne.append(nom, valeur);
      if (route.proche) {
        const pastille = document.createElement('span');
        pastille.className = 'pc-ligne-proche';
        pastille.textContent = 'Ici';
        ligne.append(pastille);
      }
      ligne.addEventListener('click', () => {
        liste.querySelectorAll('[aria-current]').forEach((autre) => autre.removeAttribute('aria-current'));
        ligne.setAttribute('aria-current', 'true');
        void ouvrirRoute(route, { depuisGroupe: true });
      });
      rendreDetail(ligne, route);
      return ligne;
    });
    liste.replaceChildren(...lignes);
    panneau.afficher();
    panneau.element.scrollTop = 0;
    groupe.observateur = preparerChargement(troncons, lignes);
  }

  // ---------- Catalogue (les 17 EuroVelo) ----------
  function afficherCatalogue() {
    panneau.titre.textContent = catalogue.titre;
    panneau.meta.textContent = '';
    panneau.definirResume({ nom: catalogue.titre, detail: `${catalogue.entrees.length} itinéraires`, valeur: '', unite: '', rose: activite.icone });
    blocStats.hidden = true;
    boutonTout.hidden = true;
    note.hidden = !catalogue.note;
    note.innerHTML = catalogue.note ?? '';
    afficherMessage('');
    liste.replaceChildren(...catalogue.entrees.map((entree) => {
      const ligne = document.createElement('button');
      ligne.type = 'button';
      ligne.className = 'pc-ligne pc-ligne-catalogue';
      const code = document.createElement('b');
      code.textContent = entree.code;
      const nom = document.createElement('span');
      nom.className = 'pc-ligne-nom';
      nom.textContent = entree.nom;
      ligne.append(code, nom);
      ligne.addEventListener('click', () => void ouvrirEntree(entree));
      return ligne;
    }));
    panneau.afficher();
    panneau.element.scrollTop = 0;
  }

  async function ouvrirEntree(entree) {
    jeton += 1;
    const demande = jeton;
    afficherMessage(`Recherche des tronçons de ${entree.code}…`);
    try {
      const routes = await catalogue.chercher(entree);
      if (demande !== jeton) return;
      if (!routes.length) {
        afficherMessage('Aucun tronçon trouvé dans OpenStreetMap pour cet itinéraire.');
        return;
      }
      const integrale = routes.find(estIntegral) ?? null;
      ouvrirGroupe({
        titre: `${entree.code} · ${entree.nom}`,
        routes: routes.filter((route) => !estIntegral(route) || route === integrale),
        integrale,
        resume: catalogue.resume?.(routes) ?? '',
      });
    } catch (erreur) {
      console.warn('Catalogue :', erreur);
      afficherMessage('Tronçons indisponibles pour le moment. Réessayez plus tard.');
    }
  }

  return {
    ouvrirRoute,
    ouvrirGroupe,
    ouvrirCatalogue(nouveau) {
      nettoyerGroupe();
      catalogue = nouveau;
      fermerMenu();
      editeur.fermerSansQuitter();
      afficherCatalogue();
    },
    reafficherListe() {
      if (groupe) {
        panneau.afficher();
      } else if (catalogue) {
        afficherCatalogue();
      }
    },
    fermer() {
      nettoyerGroupe();
      catalogue = null;
      panneau.masquer();
    },
  };
}
