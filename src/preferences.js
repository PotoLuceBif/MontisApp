// Préférences d'affichage : unités et langue. Elles ne changent que la présentation :
// les données internes, les calculs et les fichiers GPX restent en métrique.
import { lire, ecrire } from './reglages.js';

export const SYSTEMES = ['metrique', 'imperial'];
export const UNITES_VENT = ['auto', 'kmh', 'ms', 'kt', 'mph'];
export const LANGUES = ['fr', 'en'];

const EVENEMENT = 'preferences-change';

export const systemeUnites = () => (lire('unites', 'metrique') === 'imperial' ? 'imperial' : 'metrique');

// « auto » suit le système choisi : km/h en métrique, mph en impérial
export const choixUniteVent = () => {
  const choix = lire('unite-vent', 'auto');
  return UNITES_VENT.includes(choix) ? choix : 'auto';
};
export const uniteVent = () => {
  const choix = choixUniteVent();
  if (choix !== 'auto') return choix;
  return systemeUnites() === 'imperial' ? 'mph' : 'kmh';
};

// Au premier lancement, la langue du téléphone décide ; ensuite, le choix est mémorisé
function langueDetectee() {
  const langues = navigator.languages?.length ? navigator.languages : [navigator.language || 'fr'];
  for (const langue of langues) {
    const code = String(langue).slice(0, 2).toLowerCase();
    if (code === 'fr') return 'fr';
    if (code === 'en') return 'en';
  }
  return 'fr';
}

export const langue = () => {
  const choix = lire('langue', null);
  if (LANGUES.includes(choix)) return choix;
  const detectee = langueDetectee();
  ecrire('langue', detectee);
  return detectee;
};

// Locale des nombres et des dates : en anglais, format britannique (24 h, jour avant le mois)
export const locale = () => (langue() === 'en' ? 'en-GB' : 'fr-FR');

function definir(cle, valeur) {
  ecrire(cle, valeur);
  if (cle === 'langue') document.documentElement.lang = valeur;
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { cle, valeur } }));
}

export const definirSysteme = (systeme) => definir('unites', SYSTEMES.includes(systeme) ? systeme : 'metrique');
export const definirUniteVent = (unite) => definir('unite-vent', UNITES_VENT.includes(unite) ? unite : 'auto');
export const definirLangue = (code) => definir('langue', LANGUES.includes(code) ? code : 'fr');

// `cles` : ne réagir qu'à certaines préférences (par défaut : toutes)
export function surPreferences(action, cles = null) {
  const ecouteur = (event) => {
    if (!cles || cles.includes(event.detail?.cle)) action(event.detail);
  };
  window.addEventListener(EVENEMENT, ecouteur);
  return () => window.removeEventListener(EVENEMENT, ecouteur);
}

// Prévient tout le monde d'un coup (après une restauration de sauvegarde, par exemple)
export function annoncerPreferences() {
  document.documentElement.lang = langue();
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { cle: '*' } }));
}

document.documentElement.lang = langue();
