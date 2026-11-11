// Carte des plafonds de Vol libre : altitude du sommet des thermiques (ou de la base des cumulus),
// en tranches de 500 m sur la carte, avec le curseur des heures. Les points suivent un quadrillage fixe
// sur la Terre, plus lâche au dézoom (jusqu'au globe) : un même endroit garde la même valeur, et les
// points déjà reçus resservent pendant une heure. Même calcul que le profil de l'analyse du vent.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerPastilleCouche, montrerCarte } from './couches-actives.js';
import { annoncerOutilActivite } from './outil-activite.js';
import { REPERE_CALQUES } from './style-montis.js';
import {
  COULEURS_PLAFOND, COULEUR_SANS, PALIERS_PLAFOND, SANS_THERMIQUE, VARIABLES_PLAFONDS, plafondAu, plafondsHoraires, quadrillage, rasteriser,
} from './plafonds-calcul.js';
import { formatAltitude, uniteAltitude, valeurAltitude } from './unites.js';
import { estHorsLigne } from './hors-ligne.js';
import { erreurHttp, messageErreur, requete } from './requete.js';
import { surPreferences } from './preferences.js';
import { heureCourte, nomJour, poser, t, ta, ti, tt } from './i18n.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const SOURCE = 'plafonds';
const ECHEANCE_MAX = 48;
const DELAI_RECHARGE = 500;
const DELAI_REQUETE = 25000;
const DUREE_CACHE = 60 * 60 * 1000;
const POINTS_PAR_REQUETE = 100;
const PIXELS_PAR_MAILLE = 32;
const TAILLE_MAX = 512;
const OPACITE = 0.6;
const HEURE = 3600000;

const rgb = (c) => `rgb(${c.join(', ')})`;
const MINI = () => `<span class="mini-plafonds">${COULEURS_PLAFOND.slice(1, 6).map((c) => `<i style="background: ${rgb(c)}"></i>`).join('')}</span>`;

function libelleHeure(instant) {
  const date = new Date(instant);
  const heure = heureCourte(date);
  const jour = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const auj = new Date();
  const ecart = Math.round((jour - new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 86400000);
  if (ecart === 0) return { long: t('vent.aujourdhui-heure', { heure }), court: heure };
  if (ecart === 1) return { long: t('vent.demain-heure', { heure }), court: `${nomJour(date, 'short')} ${heure}` };
  return { long: t('vent.jour-heure', { jour: nomJour(date), heure }), court: `${nomJour(date, 'short')} ${heure}` };
}

export function initPlafonds(map, { onFermer = () => {}, onRetour = null } = {}) {
  const panneau = creerPanneauCarte({
    cle: 'plafonds-panneau-reduit',
    libelle: 'panneau.plafonds',
    classe: 'bf-outil',
    onFermer: () => onFermer(),
    onRetour,
  });
  poser(panneau.titre, 'plafonds.titre');
  panneau.corps.innerHTML = `
    <div class="plafonds">
      <div class="vent-temps">
        <div class="vent-temps-heure"><strong data-plafonds-heure>—</strong><span data-plafonds-ecart></span></div>
        <input class="vent-temps-curseur" type="range" min="0" max="${ECHEANCE_MAX}" step="1" value="0" ${ta('aria-label', 'vent.echeance')}>
        <div class="vent-temps-reperes" aria-hidden="true">${tt('vent.maintenant')}<span>+12 h</span><span>+24 h</span><span>+36 h</span><span>+48 h</span></div>
      </div>
      <div class="plafonds-legende" ${ta('aria-label', 'plafonds.legende')}>
        <span class="plafonds-legende-titre" data-plafonds-titre></span>
        <div class="plafonds-paliers" data-plafonds-paliers></div>
        <span class="plafonds-sans"><i style="background: ${rgb(COULEUR_SANS)}"></i>${tt('plafonds.sans')}</span>
      </div>
      <p class="plafonds-lecture" aria-live="polite"></p>
      <p class="plafonds-statut" role="status" aria-live="polite"></p>
      <details class="rando-outils">
        <summary ${ti('commun.a-savoir')}>${t('commun.a-savoir')}</summary>
        <div class="rando-outils-contenu">
          <p class="note" ${ti('plafonds.note')}>${t('plafonds.note')}</p>
        </div>
      </details>
      <p class="vent-source" data-i18n-html="vent.source">${t('vent.source')}</p>
    </div>
  `;
  const corps = panneau.corps;
  const curseur = corps.querySelector('.vent-temps-curseur');
  const heureTexte = corps.querySelector('[data-plafonds-heure]');
  const ecartTexte = corps.querySelector('[data-plafonds-ecart]');
  const paliers = corps.querySelector('[data-plafonds-paliers]');
  const titreLegende = corps.querySelector('[data-plafonds-titre]');
  const lecture = corps.querySelector('.plafonds-lecture');
  const statut = corps.querySelector('.plafonds-statut');

  const cache = new Map(); // clé du nœud → { debut, plafonds, recu }
  let actif = false;
  let grille = null; // quadrillage de la vue affichée
  let valeurs = null; // plafonds de ses nœuds à l'heure affichée
  let controleur = null;
  let minuteur = null;
  let erreur = false;
  const canvas = document.createElement('canvas');

  const pastille = creerPastilleCouche({
    ordre: 4,
    nom: () => (erreur ? t('plafonds.court-erreur') : t('plafonds.court-heure', { heure: libelleHeure(instantAffiche()).court })),
    legende: MINI,
    onOuvrir: () => {
      montrerCarte();
      panneau.agrandir();
    },
    onRetirer: () => panneau.demanderFermeture(),
  });

  function majLegende() {
    titreLegende.textContent = t('plafonds.legende-titre', { unite: uniteAltitude() });
    const bornes = PALIERS_PLAFOND.map((palier) => valeurAltitude(palier, { pas: 100 }));
    paliers.innerHTML = COULEURS_PLAFOND.map((couleur, i) => {
      const texte = i === 0 ? `< ${bornes[0]}` : i === bornes.length ? `${bornes.at(-1)} +` : `${bornes[i - 1]}`;
      return `<span style="background: ${rgb(couleur)}">${texte}</span>`;
    }).join('');
  }

  // Échéance 0 : la prochaine heure entière
  function instantAffiche() {
    const prochaine = Math.ceil(Date.now() / HEURE) * HEURE;
    return prochaine + Number(curseur.value) * HEURE;
  }

  function valeurNoeud(noeud, instant) {
    const entree = cache.get(noeud.cle);
    if (!entree) return null;
    const index = Math.round((instant - entree.debut) / HEURE);
    return entree.plafonds[index] ?? null;
  }

  function retirerCouche() {
    if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  function dessiner() {
    if (!grille) return;
    const instant = instantAffiche();
    valeurs = grille.noeuds.map((noeud) => valeurNoeud(noeud, instant));
    const largeur = Math.min(TAILLE_MAX, (grille.nx - 1) * PIXELS_PAR_MAILLE);
    const hauteur = Math.min(TAILLE_MAX, (grille.ny - 1) * PIXELS_PAR_MAILLE);
    canvas.width = largeur;
    canvas.height = hauteur;
    canvas.getContext('2d').putImageData(new ImageData(rasteriser(grille, valeurs, largeur, hauteur), largeur, hauteur), 0, 0);
    const url = canvas.toDataURL('image/png');
    const coordinates = [[grille.ouest, grille.nord], [grille.est, grille.nord], [grille.est, grille.sud], [grille.ouest, grille.sud]];
    const source = map.getSource(SOURCE);
    if (source) source.updateImage({ url, coordinates });
    else {
      map.addSource(SOURCE, { type: 'image', url, coordinates });
      map.addLayer(
        { id: SOURCE, type: 'raster', source: SOURCE, paint: { 'raster-opacity': OPACITE, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
        map.getLayer(REPERE_CALQUES) ? REPERE_CALQUES : undefined,
      );
    }
    majLecture();
  }

  function afficherEcheance() {
    const instant = instantAffiche();
    heureTexte.textContent = libelleHeure(instant).long;
    ecartTexte.textContent = Number(curseur.value) === 0 ? t('vent.prochaine-heure') : t('vent.dans-h', { n: Number(curseur.value) });
    dessiner();
    if (pastille.visible) pastille.maj();
    panneau.definirResume({ nom: t('plafonds.titre'), detail: heureTexte.textContent });
  }

  function majLecture() {
    if (!grille || !valeurs) {
      lecture.textContent = '';
      return;
    }
    const { lng, lat } = map.getCenter();
    const valeur = plafondAu(grille, valeurs, lng, lat);
    if (valeur === null) lecture.textContent = '';
    else if (valeur === SANS_THERMIQUE) lecture.textContent = t('plafonds.centre-sans');
    else lecture.textContent = t('plafonds.centre', { altitude: formatAltitude(valeur, { pas: 50 }) });
  }

  function vueActuelle() {
    const limites = map.getBounds();
    return { ouest: limites.getWest(), sud: limites.getSouth(), est: limites.getEast(), nord: limites.getNorth() };
  }

  // Les nœuds sans prévisions récentes, par paquets de cent ; l'image se complète à chaque paquet
  async function chargerManquants() {
    if (!actif || !grille) return;
    const maintenant = Date.now();
    const vus = new Set();
    const manquants = grille.noeuds.filter((noeud) => {
      if (vus.has(noeud.cle)) return false;
      vus.add(noeud.cle);
      const entree = cache.get(noeud.cle);
      return !entree || maintenant - entree.recu > DUREE_CACHE;
    });
    if (!manquants.length) {
      if (!erreur) statut.textContent = '';
      return;
    }
    controleur?.abort();
    const ici = new AbortController();
    controleur = ici;
    erreur = false;
    statut.classList.remove('erreur');
    poser(statut, 'plafonds.chargement');
    try {
      for (let debut = 0; debut < manquants.length; debut += POINTS_PAR_REQUETE) {
        const paquet = manquants.slice(debut, debut + POINTS_PAR_REQUETE);
        const params = new URLSearchParams({
          latitude: paquet.map((n) => n.latitude.toFixed(3)).join(','),
          longitude: paquet.map((n) => n.longitude.toFixed(3)).join(','),
          hourly: VARIABLES_PLAFONDS.join(','),
          models: 'meteofrance_seamless',
          forecast_days: '3',
          timezone: 'GMT',
        });
        const reponse = await requete(`${API}?${params}`, { signal: ici.signal }, DELAI_REQUETE);
        if (!reponse.ok) throw erreurHttp(reponse);
        const json = await reponse.json();
        if (controleur !== ici || !actif) return;
        const reponses = Array.isArray(json) ? json : [json];
        if (reponses.length !== paquet.length) throw new Error(t('vent.points-inattendus'));
        const recu = Date.now();
        reponses.forEach((donnees, i) => {
          const premiere = donnees?.hourly?.time?.[0];
          if (!premiere) return;
          cache.set(paquet[i].cle, { debut: Date.parse(`${premiere}:00Z`), plafonds: plafondsHoraires(donnees), recu });
        });
        while (cache.size > 3000) cache.delete(cache.keys().next().value);
        dessiner();
      }
      statut.textContent = '';
      delete statut.dataset.i18n;
    } catch (e) {
      if (controleur !== ici || !actif) return;
      console.warn('Plafonds :', e);
      erreur = true;
      statut.classList.add('erreur');
      if (estHorsLigne()) poser(statut, 'plafonds.hors-ligne');
      else poser(statut, 'plafonds.erreur', { message: messageErreur(e) });
    } finally {
      if (controleur === ici) controleur = null;
      if (pastille.visible) pastille.maj();
    }
  }

  // À chaque déplacement : l'image se redessine avec ce qui est déjà connu, puis les trous se remplissent
  function suivreVue() {
    if (!actif) return;
    grille = quadrillage(vueActuelle());
    dessiner();
    clearTimeout(minuteur);
    minuteur = setTimeout(() => void chargerManquants(), DELAI_RECHARGE);
  }

  curseur.addEventListener('input', afficherEcheance);
  map.on('moveend', suivreVue);
  map.on('style.load', () => {
    if (actif) dessiner();
  });
  surPreferences(() => {
    majLegende();
    afficherEcheance();
  });
  majLegende();

  return {
    ouvrir() {
      annoncerOutilActivite();
      actif = true;
      panneau.afficher();
      pastille.montrer(true);
      grille = quadrillage(vueActuelle());
      afficherEcheance();
      void chargerManquants();
    },
    fermer() {
      actif = false;
      clearTimeout(minuteur);
      controleur?.abort();
      controleur = null;
      panneau.masquer();
      pastille.montrer(false);
      retirerCouche();
    },
  };
}
