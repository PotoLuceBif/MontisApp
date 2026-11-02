// État du réseau : service worker, indicateur « hors ligne » et date des données enregistrées.
import { basculerFondHorsLigne } from './fond-de-carte.js';
import { dateEtHeure, poser, t } from './i18n.js';

const EN_TETE_DATE = 'x-montis-date';

let reseauCoupe = !navigator.onLine;
let reseauDefaillant = false; // connecté en apparence, mais le service worker n'obtient plus rien
let dateDonnees = null;
let demandeInstallation = null;
const ecouteursInstallation = new Set();

export const estHorsLigne = () => reseauCoupe || reseauDefaillant;

export const dateLisible = dateEtHeure;

// La date d'une réponse servie depuis les données enregistrées, sinon null
export function dateHorsLigne(reponse) {
  const date = Number(reponse.headers.get(EN_TETE_DATE));
  return Number.isFinite(date) && date > 0 ? date : null;
}

export const texteDonneesDu = (date) => t('hl.donnees-du', { date: dateLisible(date) });

export const installationPossible = () => Boolean(demandeInstallation);

export const applicationInstallee = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function installerApplication() {
  if (!demandeInstallation) return;
  const demande = demandeInstallation;
  demandeInstallation = null;
  await demande.prompt();
  ecouteursInstallation.forEach((ecouteur) => ecouteur());
}

export function surInstallationChangee(ecouteur) {
  ecouteursInstallation.add(ecouteur);
}

export function initHorsLigne(map) {
  const pastille = document.createElement('div');
  pastille.className = 'hl-pastille';
  pastille.setAttribute('role', 'status');
  pastille.hidden = true;
  document.body.append(pastille);

  let etaitHorsLigne = false;

  function majEtat() {
    const horsLigne = estHorsLigne();
    document.documentElement.dataset.reseau = horsLigne ? 'hors-ligne' : 'en-ligne';
    pastille.hidden = !horsLigne;
    if (dateDonnees) poser(pastille, 'hl.hors-ligne-date', { date: dateLisible(dateDonnees) });
    else poser(pastille, 'hl.hors-ligne');
    if (horsLigne === etaitHorsLigne) return;
    etaitHorsLigne = horsLigne;
    if (!horsLigne) dateDonnees = null;
    basculerFondHorsLigne(map, horsLigne);
    window.dispatchEvent(new CustomEvent('reseau-change', { detail: horsLigne }));
  }

  window.addEventListener('online', () => {
    reseauCoupe = false;
    reseauDefaillant = false;
    majEtat();
  });
  window.addEventListener('offline', () => {
    reseauCoupe = true;
    majEtat();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    demandeInstallation = event;
    ecouteursInstallation.forEach((ecouteur) => ecouteur());
  });
  window.addEventListener('appinstalled', () => {
    demandeInstallation = null;
    ecouteursInstallation.forEach((ecouteur) => ecouteur());
  });

  // Hors ligne, chaque tuile absente déclencherait une erreur : elles sont attendues
  map.on('error', (event) => {
    if (!estHorsLigne()) console.error(event.error ?? event);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type === 'donnees-enregistrees') {
        // On affiche la plus ancienne : c'est elle qui dit jusqu'où faire confiance
        dateDonnees = dateDonnees ? Math.min(dateDonnees, data.date) : data.date;
        reseauDefaillant = true;
        majEtat();
      } else if (data?.type === 'reseau-retabli') {
        reseauDefaillant = false;
        majEtat();
      }
    });
    // Le développement n'en a pas : il masquerait les modifications
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch((erreur) => {
        console.warn('Mode hors ligne indisponible :', erreur);
      });
    }
  }

  majEtat();
}
