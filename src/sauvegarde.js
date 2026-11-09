// Sauvegarde dans un fichier .json : réglages (thème, unités, langue, panneaux…) et
// « Mes parcours » Rando et Vélo, et les sorties de Mes traces (IndexedDB, lues à la demande).
// Les zones de carte hors ligne n'y sont pas : trop lourdes.
import { toutLire, toutRemplacer } from './reglages.js';
import { t } from './i18n.js';

export const FORMAT = 'montis-sauvegarde';
// Version 2 : ajout des sorties (une sauvegarde de version 1 n'en a pas)
export const VERSION = 2;
const ACTIVITES = ['rando', 'velo'];
const CLE_FINESSE = 'montis.finesse';
const TAILLE_MAX = 100 * 1024 * 1024;
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

// Chargé à la demande : le stockage des sorties n'a rien à faire au démarrage
const stockageSorties = () => import('./sorties-stockage.js');

async function lireSorties() {
  try {
    return await (await stockageSorties()).toutesLesSorties();
  } catch (probleme) {
    console.warn('Sorties non lues :', probleme);
    return [];
  }
}

export async function creerSauvegarde() {
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
    sorties: await lireSorties(),
  };
}

export async function telechargerSauvegarde() {
  // Sans indentation : les points des sorties prendraient une ligne chacun
  const contenu = JSON.stringify(await creerSauvegarde());
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

const nombreOuNul = (valeur) => valeur === null || Number.isFinite(valeur);

// Une sortie abîmée planterait sa vue : colonnes de même longueur, coordonnées toutes valides
export function sortieValide(sortie) {
  if (!sortie || typeof sortie !== 'object' || typeof sortie.id !== 'string' || !sortie.id) return false;
  if (sortie.nom != null && typeof sortie.nom !== 'string') return false;
  if (sortie.type != null && typeof sortie.type !== 'string') return false;
  if (sortie.debut != null && !Number.isFinite(sortie.debut)) return false;
  const points = sortie.points;
  if (!points || typeof points !== 'object' || !Array.isArray(points.lng) || !Array.isArray(points.lat)) return false;
  const n = points.lng.length;
  if (n < 2 || points.lat.length !== n) return false;
  if (!points.lng.every(Number.isFinite) || !points.lat.every(Number.isFinite)) return false;
  for (const [canal, valeurs] of Object.entries(points)) {
    if (canal === 'lng' || canal === 'lat' || valeurs == null) continue;
    if (!Array.isArray(valeurs) || valeurs.length !== n || !valeurs.every(nombreOuNul)) return false;
  }
  if (sortie.decalage != null && !Number.isFinite(sortie.decalage)) return false;
  return sortie.coupures == null || (Array.isArray(sortie.coupures) && sortie.coupures.every(Number.isInteger));
}

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
  const sorties = donnees.sorties ?? [];
  if (!Array.isArray(sorties) || !sorties.every(sortieValide)) throw erreur('sauv.erreur-sorties');
  return {
    date: Number.isNaN(Date.parse(donnees.date)) ? null : Date.parse(donnees.date),
    reglages: donnees.reglages,
    finesse: typeof donnees.finesse === 'string' ? donnees.finesse : null,
    parcours,
    sorties,
  };
}

// `mode` : 'fusion' ajoute au contenu actuel (le fichier l'emporte en cas de doublon),
// 'remplacement' efface d'abord réglages, parcours et sorties actuels
export async function appliquerSauvegarde(sauvegarde, mode) {
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
  if (sauvegarde.sorties.length || mode === 'remplacement') {
    try {
      await (await stockageSorties()).restaurerSorties(sauvegarde.sorties, mode);
    } catch (erreurSorties) {
      console.warn('Restauration des sorties :', erreurSorties);
      reussi = false;
    }
  }
  return reussi;
}

// Identifiants des sorties déjà rangées, pour compter les nouvelles dans l'aperçu
export async function idsSortiesActuelles() {
  try {
    return await (await stockageSorties()).idsDesSorties();
  } catch {
    return new Set();
  }
}

// Ce que le fichier contient, pour l'aperçu avant import
export function resumerSauvegarde(sauvegarde, idsSorties = new Set()) {
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
    sorties: sauvegarde.sorties.length,
    nouvellesSorties: sauvegarde.sorties.filter(({ id }) => !idsSorties.has(id)).length,
    actuellesSorties: idsSorties.size,
  };
}
