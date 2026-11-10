// Bloc « Avalanches ici » du ski de rando : niveau du bulletin pour le massif au centre de la carte,
// suivi au fil des déplacements, et bulletin détaillé à déplier (bulletin-detaille.js).
// Massifs simplifiés dans /data/avalanches/massifs.json (EAWS).
import { chargerNiveauxDuJour, creerBlocRisque } from './ski-conditions.js';
import { massifAuPoint, nomMassif, risqueDuMassif } from './skirando-calcul.js';
import { chargerBulletin, chargerNeigeRecente, creerBulletinDetaille } from './bulletin-detaille.js';
import { zonesExposees } from './bulletin-calcul.js';
import { afficherPentesExposees, ZOOM_MIN_PENTES } from './pentes-couche.js';
import { COULEURS_PENTE, SEUILS_PENTE, zonesVersTexte } from './pente-calcul.js';
import { creerPastilleCouche } from './couches-actives.js';
import { etat } from './options-carte.js';
import { messageErreur } from './requete.js';
import { lire, ecrire } from './reglages.js';
import { langue, surPreferences } from './preferences.js';
import { poser, t } from './i18n.js';

const URL_MASSIFS = '/data/avalanches/massifs.json';
const ATTENTE_MS = 400;
const MINI_PENTES = `<span class="mini-pentes">${SEUILS_PENTE.map((s) => `<i style="background: rgb(${COULEURS_PENTE[s].join(', ')})"></i>`).join('')}</span>`;
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

let chargementMassifs = null;
function chargerMassifs() {
  chargementMassifs ??= fetch(new URL(URL_MASSIFS, window.location.origin).href)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .then((json) => json.massifs ?? [])
    .catch((erreur) => {
      chargementMassifs = null;
      throw erreur;
    });
  return chargementMassifs;
}

function attente(cle) {
  const bloc = document.createElement('div');
  bloc.className = 'rando-attente';
  const roue = document.createElement('span');
  roue.className = 'rech-attente';
  bloc.append(roue, t(cle));
  return bloc;
}

function message(texte) {
  const bloc = document.createElement('div');
  bloc.className = 'rando-attente';
  bloc.textContent = texte;
  return bloc;
}

export function creerAvalanchesIci(map, { ouvrirMenu = () => {} } = {}) {
  const section = document.createElement('section');
  section.className = 'skirando-avalanches';
  section.innerHTML = `<h3></h3><div class="skirando-avalanches-contenu"></div>
    <button type="button" class="skirando-bulletin-bouton" aria-expanded="false" hidden><span></span>${CHEVRON}</button>
    <div class="skirando-bulletin" hidden></div>`;
  poser(section.querySelector('h3'), 'skirando.avalanches-ici');
  const contenu = section.querySelector('.skirando-avalanches-contenu');
  const bouton = section.querySelector('.skirando-bulletin-bouton');
  const detail = section.querySelector('.skirando-bulletin');
  poser(bouton.querySelector('span'), 'bulletin.detaille');

  let actif = false;
  let minuteur = null;
  let numero = 0;
  let dernier = null; // massif et niveaux du dernier rendu, pour ne pas redessiner à chaque déplacement
  let massifCourant = null;
  let detailRendu = null; // massif du bulletin détaillé affiché
  let ouvert = !!lire('skirando-bulletin-ouvert', false);

  // ---------- Pentes concernées sur la carte ----------
  // Pentes de 30° et plus aux orientations et altitudes du bulletin ; elles remplacent les pentes
  // de Carte › Relief le temps qu'elles sont affichées
  let exposeesVoulues = !!lire('skirando-exposees', false);
  let bulletinCourant = null; // { id, bulletin } du massif au centre, quand il est chargé
  let zonesAffichees = '';
  let pentesMasquees = false;
  const pastille = creerPastilleCouche({
    ordre: 0,
    nom: () => t(map.getZoom() < ZOOM_MIN_PENTES ? 'pentes.trop-loin' : 'bulletin.pastille'),
    legende: () => MINI_PENTES,
    onOuvrir: () => ouvrirMenu(),
    onRetirer: () => basculerExposees(false),
  });

  function appliquerExposees() {
    const zones = actif && exposeesVoulues && bulletinCourant?.id === massifCourant?.id ? zonesExposees(bulletinCourant.bulletin) : [];
    const texte = zonesVersTexte(zones);
    if (texte !== zonesAffichees) {
      zonesAffichees = texte;
      afficherPentesExposees(map, zones);
    }
    if (zones.length && etat.pentes?.choix() === 'pentes') {
      pentesMasquees = true;
      etat.pentes.choisir('aucune');
    } else if (!(actif && exposeesVoulues) && pentesMasquees) {
      // Rétablies seulement à l'extinction : pas pendant le chargement du bulletin d'un autre massif
      pentesMasquees = false;
      if (etat.pentes?.choix() === 'aucune') etat.pentes.choisir('pentes');
    }
    pastille.montrer(zones.length > 0);
    majPastille();
  }

  function majPastille() {
    if (!pastille.visible) return;
    const loin = map.getZoom() < ZOOM_MIN_PENTES;
    pastille.action(loin ? 'pentes.zoomer' : null, () => map.easeTo({ zoom: ZOOM_MIN_PENTES + 0.5, duration: 900 }));
    pastille.maj();
  }
  map.on('zoomend', majPastille);

  function basculerExposees(voulu = !exposeesVoulues) {
    exposeesVoulues = voulu;
    ecrire('skirando-exposees', voulu);
    appliquerExposees();
    if (voulu) void chargerBulletinCourant();
    detailRendu = null;
    void rendreDetail();
  }

  async function chargerBulletinCourant() {
    const massif = massifCourant;
    if (!massif || bulletinCourant?.id === massif.id) return bulletinCourant?.bulletin ?? null;
    const bulletin = await chargerBulletin(massif.id, langue());
    if (massifCourant?.id === massif.id) {
      bulletinCourant = { id: massif.id, bulletin };
      appliquerExposees();
    }
    return bulletin;
  }

  // ---------- Bulletin détaillé ----------
  async function rendreDetail() {
    detail.hidden = !ouvert || !massifCourant;
    bouton.setAttribute('aria-expanded', String(ouvert));
    if (!ouvert || !massifCourant || detailRendu === `${massifCourant.id}/${langue()}`) return;
    const massif = massifCourant;
    const cle = `${massif.id}/${langue()}`;
    detailRendu = cle;
    detail.replaceChildren(attente('bulletin.chargement'));
    const { lng, lat } = map.getCenter();
    const [bulletin, neige] = await Promise.allSettled([chargerBulletinCourant(), chargerNeigeRecente([lng, lat])]);
    if (detailRendu !== cle) return;
    const neigeLue = neige.status === 'fulfilled' ? neige.value : null;
    if (bulletin.status === 'rejected') {
      console.warn('Bulletin détaillé :', bulletin.reason);
      detailRendu = null; // le prochain dépliage réessaie
      detail.replaceChildren(message(t('bulletin.erreur', { raison: messageErreur(bulletin.reason) })));
      return;
    }
    if (!bulletin.value) {
      const vide = message(t('bulletin.absent'));
      detail.replaceChildren(vide);
      if (neigeLue) detail.append(creerBulletinDetaille({ niveaux: [], orientations: [], problemes: [], activite: [], manteau: [], meteo: [], tendance: { type: null, texte: [] }, max: 0 }, neigeLue));
      return;
    }
    const carte = zonesExposees(bulletin.value).length ? { actif: exposeesVoulues, basculer: () => basculerExposees() } : null;
    detail.replaceChildren(creerBulletinDetaille(bulletin.value, neigeLue, carte));
  }

  bouton.addEventListener('click', () => {
    ouvert = !ouvert;
    ecrire('skirando-bulletin-ouvert', ouvert);
    void rendreDetail();
  });

  // ---------- Niveau du massif ----------
  async function actualiser() {
    if (!actif) return;
    const ici = ++numero;
    if (!dernier) contenu.replaceChildren(attente('skirando.avalanches-chargement'));
    const { lng, lat } = map.getCenter();
    let massifs;
    let niveaux;
    try {
      [massifs, niveaux] = await Promise.all([chargerMassifs(), chargerNiveauxDuJour()]);
    } catch (erreur) {
      if (ici !== numero) return;
      console.warn('Avalanches ici :', erreur);
      dernier = null;
      massifCourant = null;
      bouton.hidden = true;
      detail.hidden = true;
      contenu.replaceChildren(message(t('skirando.avalanches-erreur', { raison: messageErreur(erreur) })));
      return;
    }
    if (ici !== numero || !actif) return;
    const massif = massifAuPoint(massifs, [lng, lat], niveaux);
    massifCourant = massif;
    bouton.hidden = !massif;
    appliquerExposees();
    if (massif && exposeesVoulues) chargerBulletinCourant().catch((erreur) => console.warn('Pentes concernées :', erreur));
    if (!massif) {
      detail.hidden = true;
      if (dernier?.id === null) return;
      dernier = { id: null };
      contenu.replaceChildren(message(t('skirando.avalanches-hors')));
      return;
    }
    const risque = risqueDuMassif(niveaux, massif.id);
    const cle = `${massif.id}/${JSON.stringify(risque)}/${langue()}`;
    if (dernier?.cle !== cle) {
      dernier = { id: massif.id, cle };
      contenu.replaceChildren(creerBlocRisque(risque.max ? risque : null, {
        massif: massif.id,
        massifNom: nomMassif(massif, langue()),
        pays: massif.id.slice(0, 2),
      }));
    }
    void rendreDetail();
  }

  const programmer = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(actualiser, ATTENTE_MS);
  };
  map.on('moveend', programmer);
  surPreferences(() => {
    dernier = null;
    detailRendu = null;
    bulletinCourant = null; // les textes suivent la langue
    if (actif) void actualiser();
  });

  return {
    section,
    activer() {
      actif = true;
      void actualiser();
    },
    desactiver() {
      actif = false;
      numero += 1;
      clearTimeout(minuteur);
      appliquerExposees();
    },
  };
}
