// Sauvegarde dans un fichier .json : réglages (thème, unités, langue, panneaux…) et
// « Mes parcours » Rando et Vélo. Les zones de carte hors ligne n'y sont pas : trop lourdes.
import { toutLire, toutRemplacer } from './reglages.js';
import { t } from './i18n.js';

export const FORMAT = 'montis-sauvegarde';
export const VERSION = 1;
const ACTIVITES = ['rando', 'velo'];
const CLE_FINESSE = 'montis.finesse';
const TAILLE_MAX = 20 * 1024 * 1024;
// Propres à cet appareil ou recalculées : inutiles dans une sauvegarde
const REGLAGES_EXCLUS = ['menu-activite'];

const cleParcours = (activite) => `montis.${activite}-parcours`;

function lireListe(cle) {
  try {
    const liste = JSON.parse(localStorage.getItem(cle));
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

export function creerSauvegarde() {
  const reglages = toutLire();
  REGLAGES_EXCLUS.forEach((cle) => delete reglages[cle]);
  let finesse = null;
  try {
    finesse = localStorage.getItem(CLE_FINESSE);
  } catch {
    /* rien à reprendre */
  }
  return {
    format: FORMAT,
    version: VERSION,
    date: new Date().toISOString(),
    reglages,
    finesse,
    parcours: Object.fromEntries(ACTIVITES.map((activite) => [activite, lireListe(cleParcours(activite))])),
  };
}

export function telechargerSauvegarde() {
  const contenu = JSON.stringify(creerSauvegarde(), null, 2);
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  lien.download = `montis-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

const erreur = (cle, variables) => Object.assign(new Error(t(cle, variables)), { cle, variables });

const coordonnee = (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);

// Chaque étape est vérifiée : un fichier abîmé ferait sinon planter l'éditeur à l'ouverture du parcours
const etapeValide = (etape) =>
  etape && typeof etape === 'object'
  && Number.isFinite(etape.lng) && Number.isFinite(etape.lat)
  && (etape.troncon == null || (Array.isArray(etape.troncon.geom) && etape.troncon.geom.every(coordonnee)));

const parcoursValide = (parcours) =>
  parcours && typeof parcours === 'object'
  && typeof parcours.id === 'string' && parcours.id
  && typeof parcours.nom === 'string'
  && Array.isArray(parcours.etapes) && parcours.etapes.every(etapeValide);

// Vérifie le fichier avant d'y toucher : un message clair plutôt qu'un import à moitié fait
export async function lireSauvegarde(fichier) {
  if (fichier.size > TAILLE_MAX) throw erreur('sauv.erreur-taille');
  let donnees;
  try {
    donnees = JSON.parse(await fichier.text());
  } catch {
    throw erreur('sauv.erreur-json');
  }
  if (!donnees || typeof donnees !== 'object' || donnees.format !== FORMAT) throw erreur('sauv.erreur-format');
  if (!Number.isInteger(donnees.version) || donnees.version < 1) throw erreur('sauv.erreur-version-invalide');
  if (donnees.version > VERSION) throw erreur('sauv.erreur-version-recente', { version: donnees.version });
  if (!donnees.reglages || typeof donnees.reglages !== 'object' || Array.isArray(donnees.reglages)) throw erreur('sauv.erreur-reglages');
  if (!donnees.parcours || typeof donnees.parcours !== 'object') throw erreur('sauv.erreur-parcours');
  const parcours = {};
  for (const activite of ACTIVITES) {
    const liste = donnees.parcours[activite] ?? [];
    if (!Array.isArray(liste) || !liste.every(parcoursValide)) throw erreur('sauv.erreur-parcours');
    parcours[activite] = liste;
  }
  return {
    date: Number.isNaN(Date.parse(donnees.date)) ? null : Date.parse(donnees.date),
    reglages: donnees.reglages,
    finesse: typeof donnees.finesse === 'string' ? donnees.finesse : null,
    parcours,
  };
}

// `mode` : 'fusion' ajoute au contenu actuel (le fichier l'emporte en cas de doublon),
// 'remplacement' efface d'abord réglages et parcours actuels
export function appliquerSauvegarde(sauvegarde, mode) {
  const actuels = toutLire();
  const reglages = mode === 'remplacement' ? { ...sauvegarde.reglages } : { ...actuels, ...sauvegarde.reglages };
  REGLAGES_EXCLUS.forEach((cle) => {
    if (cle in actuels) reglages[cle] = actuels[cle];
    else delete reglages[cle];
  });
  let reussi = toutRemplacer(reglages);
  try {
    if (sauvegarde.finesse) localStorage.setItem(CLE_FINESSE, sauvegarde.finesse);
    for (const activite of ACTIVITES) {
      const importes = sauvegarde.parcours[activite];
      const ids = new Set(importes.map(({ id }) => id));
      const liste = mode === 'remplacement'
        ? importes
        : [...importes, ...lireListe(cleParcours(activite)).filter(({ id }) => !ids.has(id))];
      localStorage.setItem(cleParcours(activite), JSON.stringify(liste));
    }
  } catch (erreurEcriture) {
    console.warn('Restauration :', erreurEcriture);
    reussi = false;
  }
  return reussi;
}

// Ce que le fichier contient, pour l'aperçu avant import
export function resumerSauvegarde(sauvegarde) {
  const actuels = Object.fromEntries(ACTIVITES.map((activite) => [activite, lireListe(cleParcours(activite))]));
  const nouveaux = (activite) => {
    const ids = new Set(actuels[activite].map(({ id }) => id));
    return sauvegarde.parcours[activite].filter(({ id }) => !ids.has(id)).length;
  };
  return {
    date: sauvegarde.date,
    nombreReglages: Object.keys(sauvegarde.reglages).length,
    unites: sauvegarde.reglages.unites,
    uniteVent: sauvegarde.reglages['unite-vent'],
    langue: sauvegarde.reglages.langue,
    theme: sauvegarde.reglages.theme,
    rando: sauvegarde.parcours.rando.length,
    velo: sauvegarde.parcours.velo.length,
    nouveauxRando: nouveaux('rando'),
    nouveauxVelo: nouveaux('velo'),
    actuelsRando: actuels.rando.length,
    actuelsVelo: actuels.velo.length,
  };
}
