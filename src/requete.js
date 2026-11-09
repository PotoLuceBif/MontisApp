// Requêtes réseau avec un délai maximal, et messages d'échec lisibles.
// En montagne, la liaison ne coupe pas toujours net : elle traîne. Sans délai, une requête
// peut attendre sans fin et laisser « Chargement… » à l'écran.
import { t } from './i18n.js';
import { estHorsLigne } from './hors-ligne.js';

export const DELAI_RESEAU = 15000;

// Comme fetch, avec un délai (ms) jusqu'aux en-têtes de la réponse. Le dépassement lève une
// erreur `TimeoutError` (pas `AbortError`, que les appelants ignorent comme une annulation voulue).
export async function requete(adresse, options = {}, delai = DELAI_RESEAU) {
  const local = new AbortController();
  const externe = options.signal;
  let depasse = false;
  const minuteur = setTimeout(() => {
    depasse = true;
    local.abort();
  }, delai);
  const relayer = () => local.abort();
  if (externe?.aborted) local.abort();
  else externe?.addEventListener('abort', relayer, { once: true });
  try {
    return await fetch(adresse, { ...options, signal: local.signal });
  } catch (erreur) {
    if (depasse && !externe?.aborted) throw Object.assign(new Error('délai dépassé'), { name: 'TimeoutError' });
    throw erreur;
  } finally {
    clearTimeout(minuteur);
    externe?.removeEventListener('abort', relayer);
  }
}

// Erreur d'un statut HTTP, que `messageErreur` sait lire
export const erreurHttp = (reponse) => Object.assign(new Error(`HTTP ${reponse.status}`), { statut: reponse.status });

// Message pour l'utilisateur ; le détail technique reste dans la console
export function messageErreur(erreur) {
  if (estHorsLigne()) return t('reseau.hors-ligne');
  if (erreur?.name === 'TimeoutError') return t('reseau.trop-long');
  if (erreur?.statut === 429) return t('reseau.trop-demandes');
  return t('reseau.service');
}
