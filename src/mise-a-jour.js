// Arrivée des nouvelles versions chez les utilisateurs (lot 0.8).
// - Le navigateur ne cherche un nouveau /sw.js qu'en ouvrant la page : une appli installée,
//   gardée en mémoire des jours sur le téléphone, ne le verrait jamais. On le cherche aussi
//   au retour sur l'appli, au plus une fois par heure.
// - Une nouvelle version efface les fichiers de l'ancienne. Une page restée ouverte qui charge
//   alors une activité pour la première fois ne la trouve plus (« Chargement impossible ») :
//   la page se recharge, une fois, sur la nouvelle version.
const ATTENTE_VERIFICATION = 60 * 60 * 1000;
const CLE_RECHARGEMENT = 'montis.rechargement-version';
const ATTENTE_RECHARGEMENT = 5 * 60 * 1000;

// Erreur d'un import() dont le fichier n'existe plus
export const fichierDisparu = (erreur) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload/i.test(String(erreur?.message ?? erreur));

// Recharge sur la nouvelle version, sauf si on vient de le faire (pas de boucle hors ligne)
export function rechargerSurNouvelleVersion() {
  if (!navigator.onLine) return false;
  try {
    const dernier = Number(sessionStorage.getItem(CLE_RECHARGEMENT));
    if (Date.now() - dernier < ATTENTE_RECHARGEMENT) return false;
    sessionStorage.setItem(CLE_RECHARGEMENT, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function suivreMisesAJour(inscription) {
  let verifie = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (Date.now() - verifie < ATTENTE_VERIFICATION) return;
    verifie = Date.now();
    inscription.update().catch(() => {});
  });
}

// Vite signale qu'un fichier chargé à la demande manque : c'est une ancienne version
window.addEventListener('vite:preloadError', (event) => {
  if (rechargerSurNouvelleVersion()) event.preventDefault();
});
