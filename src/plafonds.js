// Carte des plafonds de Vol libre : altitude du sommet des thermiques (ou de la base des cumulus),
// en couleurs sur la carte, avec le curseur des heures. Un point de prévision tous les septièmes de
// vue (plus lâche au dézoom) ; même modèle et même calcul que le profil de l'analyse du vent.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerPastilleCouche, montrerCarte } from './couches-actives.js';
import { annoncerOutilActivite } from './outil-activite.js';
import { REPERE_CALQUES } from './style-montis.js';
import {
  COULEURS_PLAFOND, PALIERS_PLAFOND, VARIABLES_PLAFONDS, grilleCouvre, grillePlafonds, plafondAu, plafondPoint, rasteriser,
} from './plafonds-calcul.js';
import { formatAltitude } from './unites.js';
import { estHorsLigne } from './hors-ligne.js';
import { erreurHttp, messageErreur, requete } from './requete.js';
import { surPreferences } from './preferences.js';
import { heureCourte, nomJour, poser, t, ta, ti, tt } from './i18n.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const SOURCE = 'plafonds';
const ECHEANCE_MAX = 48;
const DELAI_RECHARGE = 700;
const DELAI_REQUETE = 25000;
const DUREE_VALIDITE = 60 * 60 * 1000;
const TAILLE_IMAGE = 96;
const OPACITE = 0.55;

const degrade = () => `linear-gradient(90deg, ${COULEURS_PLAFOND.map((c) => `rgb(${c.join(', ')})`).join(', ')})`;
const MINI = () => `<span class="mini-plafonds" style="background: ${degrade()}"></span>`;

function libelleHeure(iso) {
  const date = new Date(iso);
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
        <div class="plafonds-degrade"></div>
        <div class="plafonds-echelle" data-plafonds-echelle></div>
        <span class="plafonds-sans"><i></i>${tt('plafonds.sans')}</span>
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
  const echelle = corps.querySelector('[data-plafonds-echelle]');
  const lecture = corps.querySelector('.plafonds-lecture');
  const statut = corps.querySelector('.plafonds-statut');
  corps.querySelector('.plafonds-degrade').style.background = degrade();

  let actif = false;
  let zone = null; // { grille, reponses, zoom, recue }
  let valeurs = null; // plafonds de la grille à l'heure affichée
  let heureAffichee = '';
  let controleur = null;
  let minuteur = null;
  const canvas = document.createElement('canvas');
  canvas.width = TAILLE_IMAGE;
  canvas.height = TAILLE_IMAGE;

  const pastille = creerPastilleCouche({
    ordre: 4,
    nom: () => (statut.classList.contains('erreur')
      ? t('plafonds.court-erreur')
      : heureAffichee ? t('plafonds.court-heure', { heure: libelleHeure(heureAffichee).court }) : t('plafonds.court')),
    legende: MINI,
    onOuvrir: () => {
      montrerCarte();
      panneau.agrandir();
    },
    onRetirer: () => panneau.demanderFermeture(),
  });

  function majEchelle() {
    echelle.innerHTML = PALIERS_PLAFOND.map((palier, i) => `<span>${i === PALIERS_PLAFOND.length - 1 ? '' : i === 0 ? '≤ ' : ''}${formatAltitude(palier, { pas: 100 })}${i === PALIERS_PLAFOND.length - 1 ? ' +' : ''}</span>`).join('');
  }

  function retirerCouche() {
    if (map.getLayer(SOURCE)) map.removeLayer(SOURCE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  const heureBase = () => heureBaseDe(zone.reponses[0]);

  function afficherEcheance() {
    const echeance = Number(curseur.value);
    if (!zone) {
      heureTexte.textContent = '—';
      ecartTexte.textContent = '';
      return;
    }
    const base = heureBase();
    const heures = zone.reponses[0].hourly.time;
    curseur.max = String(Math.max(0, Math.min(ECHEANCE_MAX, heures.length - 1 - base)));
    const index = Math.min(heures.length - 1, base + echeance);
    heureAffichee = heures[index];
    heureTexte.textContent = libelleHeure(heureAffichee).long;
    ecartTexte.textContent = echeance === 0 ? t('vent.prochaine-heure') : t('vent.dans-h', { n: echeance });
    // Chaque point a son fuseau : on prend la même échéance pour tous
    valeurs = zone.reponses.map((donnees) => plafondPoint(donnees, Math.min(donnees.hourly.time.length - 1, heureBaseDe(donnees) + echeance)));
    dessiner();
    majLecture();
    if (pastille.visible) pastille.maj();
    panneau.definirResume({ nom: t('plafonds.titre'), detail: heureTexte.textContent });
  }

  // Échéance 0 : la prochaine heure entière, à l'heure du lieu, comme l'analyse du vent
  function heureBaseDe(donnees) {
    const maintenant = new Date(Date.now() + (donnees.utc_offset_seconds ?? 0) * 1000).toISOString().slice(0, 16);
    const base = donnees.hourly.time.findIndex((h) => h >= maintenant);
    return base < 0 ? 0 : base;
  }

  function dessiner() {
    if (!zone || !valeurs) return;
    const { grille } = zone;
    const pixels = rasteriser(grille, valeurs, TAILLE_IMAGE, TAILLE_IMAGE);
    const contexte = canvas.getContext('2d');
    contexte.putImageData(new ImageData(pixels, TAILLE_IMAGE, TAILLE_IMAGE), 0, 0);
    const url = canvas.toDataURL('image/png');
    const coordinates = [[grille.ouest, grille.nord], [grille.est, grille.nord], [grille.est, grille.sud], [grille.ouest, grille.sud]];
    const source = map.getSource(SOURCE);
    if (source) {
      source.updateImage({ url, coordinates });
      return;
    }
    map.addSource(SOURCE, { type: 'image', url, coordinates });
    map.addLayer(
      { id: SOURCE, type: 'raster', source: SOURCE, paint: { 'raster-opacity': OPACITE, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
      map.getLayer(REPERE_CALQUES) ? REPERE_CALQUES : undefined,
    );
  }

  function majLecture() {
    if (!zone || !valeurs) {
      lecture.textContent = '';
      return;
    }
    const { lng, lat } = map.getCenter();
    const valeur = plafondAu(zone.grille, valeurs, lng, lat);
    lecture.textContent = valeur === null
      ? t('plafonds.centre-sans')
      : t('plafonds.centre', { altitude: formatAltitude(valeur, { pas: 50 }) });
  }

  async function charger() {
    if (!actif) return;
    const limites = map.getBounds();
    const vue = { ouest: limites.getWest(), sud: limites.getSouth(), est: limites.getEast(), nord: limites.getNorth() };
    const grille = grillePlafonds(vue);
    controleur?.abort();
    const ici = new AbortController();
    controleur = ici;
    statut.classList.remove('erreur');
    poser(statut, 'plafonds.chargement');
    const params = new URLSearchParams({
      latitude: grille.positions.map((p) => p.latitude.toFixed(3)).join(','),
      longitude: grille.positions.map((p) => p.longitude.toFixed(3)).join(','),
      hourly: VARIABLES_PLAFONDS.join(','),
      models: 'meteofrance_seamless',
      forecast_days: '3',
      timezone: 'auto',
    });
    try {
      const reponse = await requete(`${API}?${params}`, { signal: ici.signal }, DELAI_REQUETE);
      if (!reponse.ok) throw erreurHttp(reponse);
      const json = await reponse.json();
      if (controleur !== ici || !actif) return;
      const reponses = Array.isArray(json) ? json : [json];
      if (reponses.length !== grille.positions.length || !reponses.every((r) => Array.isArray(r?.hourly?.time))) {
        throw new Error(t('vent.points-inattendus'));
      }
      zone = { grille, reponses, zoom: map.getZoom(), recue: Date.now() };
      statut.textContent = '';
      delete statut.dataset.i18n;
      afficherEcheance();
    } catch (erreur) {
      if (controleur !== ici || !actif) return;
      console.warn('Plafonds :', erreur);
      statut.classList.add('erreur');
      if (estHorsLigne()) poser(statut, 'plafonds.hors-ligne');
      else poser(statut, 'plafonds.erreur', { message: messageErreur(erreur) });
      if (pastille.visible) pastille.maj();
    } finally {
      if (controleur === ici) controleur = null;
    }
  }

  // La grille suit la vue : rechargée quand la vue sort de la zone, change d'échelle ou vieillit
  function suivreVue() {
    majLecture();
    if (!actif) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      const limites = map.getBounds();
      const vue = { ouest: limites.getWest(), sud: limites.getSouth(), est: limites.getEast(), nord: limites.getNorth() };
      const perimee = !zone
        || !grilleCouvre(zone.grille, vue)
        || Math.abs(map.getZoom() - zone.zoom) >= 1.5
        || Date.now() - zone.recue > DUREE_VALIDITE;
      if (perimee) void charger();
    }, DELAI_RECHARGE);
  }

  curseur.addEventListener('input', afficherEcheance);
  map.on('moveend', suivreVue);
  map.on('style.load', () => {
    if (actif && zone) dessiner();
  });
  surPreferences(() => {
    majEchelle();
    afficherEcheance();
  });
  majEchelle();

  return {
    ouvrir() {
      annoncerOutilActivite();
      actif = true;
      panneau.afficher();
      pastille.montrer(true);
      if (zone && Date.now() - zone.recue < DUREE_VALIDITE) {
        afficherEcheance();
        suivreVue();
      } else void charger();
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
