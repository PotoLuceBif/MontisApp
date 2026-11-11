// Carte des plafonds de Vol libre, sur le modèle de Meteo-Parapente : une seule demande par heure au
// relais /api/plafonds, qui sert la carte de toute la Terre déjà calculée (GFS de la NOAA, 0,25°) ;
// l'appli la dessine en tranches de 500 m, quel que soit le zoom.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerPastilleCouche, montrerCarte } from './couches-actives.js';
import { annoncerOutilActivite } from './outil-activite.js';
import { REPERE_CALQUES } from './style-montis.js';
import {
  COULEURS_PLAFOND, COULEUR_SANS, EMPRISE_MONDE, PALIERS_PLAFOND, SANS_THERMIQUE, plafondAu, rasteriserMonde,
} from './plafonds-calcul.js';
import { formatAltitude, uniteAltitude, valeurAltitude } from './unites.js';
import { estHorsLigne } from './hors-ligne.js';
import { messageErreur, requete } from './requete.js';
import { surPreferences } from './preferences.js';
import { heureCourte, nomJour, poser, t, ta, ti, tt } from './i18n.js';

const RELAIS = '/api/plafonds';
const SOURCE = 'plafonds';
const ECHEANCE_MAX = 48;
const DELAI_CURSEUR = 250;
const DELAI_REQUETE = 30000;
const LARGEUR_IMAGE = 1440; // une colonne par maille de 0,25°
const HEURES_GARDEES = 8;
const OPACITE = 0.6;
const HEURE = 3600000;

const rgb = (c) => `rgb(${c.join(', ')})`;
const MINI = () => `<span class="mini-plafonds">${COULEURS_PLAFOND.slice(1, 6).map((c) => `<i style="background: ${rgb(c)}"></i>`).join('')}</span>`;
const deux = (n) => String(n).padStart(2, '0');
const cleHeure = (instant) => {
  const d = new Date(instant);
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}T${deux(d.getUTCHours())}`;
};

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
      <p class="vent-source" ${ti('plafonds.source')}>${t('plafonds.source')}</p>
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

  const cartes = new Map(); // heure (UTC) → promesse de { grille, codes, url }
  let actif = false;
  let affichee = null; // carte dessinée
  let demande = 0;
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
    return Math.ceil(Date.now() / HEURE) * HEURE + Number(curseur.value) * HEURE;
  }

  // Une carte par heure, gardée pour revenir en arrière sur le curseur sans la redemander
  function chargerCarte(cle) {
    if (!cartes.has(cle)) {
      const promesse = (async () => {
        const reponse = await requete(`${RELAIS}?t=${cle}`, {}, DELAI_REQUETE);
        if (!reponse.ok) {
          const corpsErreur = await reponse.json().catch(() => null);
          throw Object.assign(new Error(corpsErreur?.erreur ?? `HTTP ${reponse.status}`), { statut: reponse.status });
        }
        const grille = JSON.parse(reponse.headers.get('X-Montis-Grille') ?? 'null');
        const codes = new Uint8Array(await reponse.arrayBuffer());
        if (!grille || codes.length !== grille.ni * grille.nj) throw new Error('Carte des plafonds incomplète');
        const hauteur = LARGEUR_IMAGE; // le monde en Mercator est carré
        canvas.width = LARGEUR_IMAGE;
        canvas.height = hauteur;
        canvas.getContext('2d').putImageData(new ImageData(rasteriserMonde(grille, codes, LARGEUR_IMAGE, hauteur), LARGEUR_IMAGE, hauteur), 0, 0);
        return { grille, codes, url: canvas.toDataURL('image/png') };
      })();
      promesse.catch(() => cartes.delete(cle));
      cartes.set(cle, promesse);
      while (cartes.size > HEURES_GARDEES) cartes.delete(cartes.keys().next().value);
    }
    return cartes.get(cle);
  }

  function poserImage(url) {
    const source = map.getSource(SOURCE);
    if (source) source.updateImage({ url, coordinates: EMPRISE_MONDE });
    else {
      map.addSource(SOURCE, { type: 'image', url, coordinates: EMPRISE_MONDE });
      map.addLayer(
        { id: SOURCE, type: 'raster', source: SOURCE, paint: { 'raster-opacity': OPACITE, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
        map.getLayer(REPERE_CALQUES) ? REPERE_CALQUES : undefined,
      );
    }
  }

  function retirerCouche() {
    if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  async function afficher() {
    if (!actif) return;
    const ici = ++demande;
    const cle = cleHeure(instantAffiche());
    erreur = false;
    statut.classList.remove('erreur');
    poser(statut, 'plafonds.chargement');
    try {
      const carte = await chargerCarte(cle);
      if (ici !== demande || !actif) return;
      affichee = carte;
      poserImage(carte.url);
      statut.textContent = '';
      delete statut.dataset.i18n;
      majLecture();
    } catch (e) {
      if (ici !== demande || !actif) return;
      console.warn('Plafonds :', e);
      erreur = true;
      statut.classList.add('erreur');
      if (estHorsLigne()) poser(statut, 'plafonds.hors-ligne');
      else if (e.statut === 404) poser(statut, 'plafonds.absente');
      else poser(statut, 'plafonds.erreur', { message: messageErreur(e) });
    } finally {
      if (pastille.visible) pastille.maj();
    }
  }

  function afficherEcheance() {
    const instant = instantAffiche();
    heureTexte.textContent = libelleHeure(instant).long;
    ecartTexte.textContent = Number(curseur.value) === 0 ? t('vent.prochaine-heure') : t('vent.dans-h', { n: Number(curseur.value) });
    if (pastille.visible) pastille.maj();
    panneau.definirResume({ nom: t('plafonds.titre'), detail: heureTexte.textContent });
  }

  function majLecture() {
    if (!affichee) {
      lecture.textContent = '';
      return;
    }
    const { lng, lat } = map.getCenter();
    const valeur = plafondAu(affichee.grille, affichee.codes, lng, lat);
    if (valeur === null) lecture.textContent = '';
    else if (valeur === SANS_THERMIQUE) lecture.textContent = t('plafonds.centre-sans');
    else lecture.textContent = t('plafonds.centre', { altitude: formatAltitude(valeur, { pas: 50 }) });
  }

  // Pendant un glissé du curseur, l'heure s'affiche tout de suite ; la carte attend que le doigt ralentisse
  curseur.addEventListener('input', () => {
    afficherEcheance();
    clearTimeout(minuteur);
    minuteur = setTimeout(() => void afficher(), DELAI_CURSEUR);
  });
  map.on('moveend', () => {
    if (actif) majLecture();
  });
  map.on('style.load', () => {
    if (actif && affichee) poserImage(affichee.url);
  });
  surPreferences(() => {
    majLegende();
    afficherEcheance();
    majLecture();
  });
  majLegende();

  return {
    ouvrir() {
      annoncerOutilActivite();
      actif = true;
      panneau.afficher();
      pastille.montrer(true);
      afficherEcheance();
      void afficher();
    },
    fermer() {
      actif = false;
      demande += 1;
      clearTimeout(minuteur);
      panneau.masquer();
      pastille.montrer(false);
      affichee = null;
      retirerCouche();
    },
  };
}
