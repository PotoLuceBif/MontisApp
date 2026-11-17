// Enregistrement de la trace pendant le guidage (interrupteur « Enregistrer la trace ») :
// points gardés dans le localStorage au fil de l'eau, pour ne rien perdre si la page se recharge.
import { ajouterPoint, gpxTrace, lireTraceSauvee, nouvelleTrace, resumeTrace } from './guidage-trace-calcul.js';

const CLE = 'montis.guidage-trace';
const ATTENTE_SAUVEGARDE = 10000; // ms : on n'écrit pas à chaque point

// Trace commencée et jamais terminée (page rechargée, appli fermée), ou null
export function traceInterrompue() {
  try {
    const trace = lireTraceSauvee(JSON.parse(localStorage.getItem(CLE)));
    return trace?.segments.length ? trace : null;
  } catch {
    return null;
  }
}

export function effacerTraceInterrompue() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à effacer */
  }
}

// reprise : trace interrompue à continuer ; la suite part dans un nouveau segment
export function creerEnregistrement({ nom, parcours, reprise = null }) {
  const trace = reprise ?? nouvelleTrace({ nom, parcours, debut: Date.now() });
  let coupure = Boolean(reprise);
  let minuteur = null;

  function sauver() {
    clearTimeout(minuteur);
    minuteur = null;
    try {
      localStorage.setItem(CLE, JSON.stringify(trace));
    } catch (erreur) {
      console.warn('Trace non sauvegardée :', erreur);
    }
  }

  return {
    trace,
    ajouter(position) {
      if (!ajouterPoint(trace, position, { coupure })) return;
      coupure = false;
      minuteur ??= setTimeout(sauver, ATTENTE_SAUVEGARDE);
    },
    sauver,
    resume: () => resumeTrace(trace),
    effacer() {
      clearTimeout(minuteur);
      minuteur = null;
      effacerTraceInterrompue();
    },
  };
}

const nomFichier = (nom) =>
  nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'trace';

export function telechargerTrace(trace) {
  const blob = new Blob([gpxTrace(trace)], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `${nomFichier(trace.nom)}.gpx`;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
