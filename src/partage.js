// Partage par lien : feuille de partage du téléphone si elle existe, sinon lien copié.
// Ouverture d'un lien reçu (`ouvrirLienRecu`, appelée par main.js). Calculs dans partage-calcul.js.
import { lireFragment, lireParcours } from './partage-calcul.js';
import { deposer } from './demandes.js';
import { t } from './i18n.js';

export const ICONE_PARTAGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>';

let annonce = null;
let minuteur = null;
export function annoncer(texte, erreur = false, duree = 3500) {
  if (!annonce) {
    annonce = document.createElement('div');
    annonce.className = 'montis-annonce';
    annonce.setAttribute('role', 'status');
    document.body.append(annonce);
  }
  annonce.textContent = texte;
  annonce.classList.toggle('erreur', erreur);
  annonce.hidden = false;
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { annonce.hidden = true; }, duree);
}

export const adresseDe = (fragment) => `${location.origin}${location.pathname}#${fragment}`;

// `titre` : ce que la messagerie montre au-dessus du lien
// `note` : précision ajoutée à « Lien copié » (tracé simplifié…)
export async function partagerLien(fragment, titre, note = '') {
  const url = adresseDe(fragment);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: titre, text: titre, url });
      return;
    } catch (erreur) {
      if (erreur?.name === 'AbortError') return; // partage annulé
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    annoncer(note ? `${t('partage.copie')} ${note}` : t('partage.copie'), false, note ? 6000 : 3500);
  } catch {
    // Presse-papiers refusé : le lien reste lisible pour le copier à la main
    window.prompt(t('partage.copier-main'), url);
  }
}

// ===== Lien reçu =====
// La vue s'applique avant le premier affichage (`vueDemandee`) ; point et parcours une fois l'interface posée.
const demandeInitiale = lireFragment(location.hash);
export const vueDemandee = () => (demandeInitiale && demandeInitiale.type !== 'parcours' ? demandeInitiale : null);

const effacerAdresse = () => history.replaceState(null, '', location.pathname + location.search);

async function ouvrir(map, demande) {
  if (!demande) return;
  effacerAdresse(); // un rafraîchissement ne rejoue pas le lien, la vue suit ensuite sa mémoire habituelle
  if (demande.type === 'vue') return;
  if (demande.type === 'point') {
    // Sur téléphone, la fiche couvre le bas de l'écran : le point se place au-dessus
    if (innerWidth < 768) map.easeTo({ center: [demande.lng, demande.lat], zoom: demande.zoom, offset: [0, -Math.round(innerHeight * 0.25)], duration: 0 });
    window.dispatchEvent(new CustomEvent('montis:ouvrir-point', { detail: { lng: demande.lng, lat: demande.lat } }));
    return;
  }
  const parcours = await lireParcours(demande.code);
  if (!parcours) {
    annoncer(t('partage.illisible'), true);
    return;
  }
  deposer(`parcours-partage-${parcours.activite}`, parcours);
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'activites', module: parcours.activite } }));
}

export function ouvrirLienRecu(map) {
  if (demandeInitiale) ouvrir(map, demandeInitiale);
  // Lien ouvert alors que Montis l'était déjà (même onglet)
  window.addEventListener('hashchange', () => {
    const demande = lireFragment(location.hash);
    if (!demande) return;
    if (demande.type !== 'parcours') {
      map.jumpTo({
        center: [demande.lng, demande.lat],
        zoom: demande.zoom,
        ...(demande.type === 'vue' ? { bearing: demande.bearing, pitch: demande.pitch } : {}),
      });
    }
    ouvrir(map, demande);
  });
}
