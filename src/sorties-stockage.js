// Sorties de Mes traces, rangées dans IndexedDB : une sortie de plusieurs heures pèse
// près d'un mégaoctet, le localStorage serait plein en quelques sorties.
// Deux magasins : les fiches (nom, type, résumé), lues pour la liste, et les points, lus à l'ouverture.
import { resumerSortie } from './sortie-lecture.js';

const BASE = 'montis';
const VERSION_BASE = 1;
const FICHES = 'sorties';
const POINTS = 'sorties-points';

let ouverture = null;

function ouvrirBase() {
  ouverture ??= new Promise((resoudre, rejeter) => {
    if (!('indexedDB' in globalThis)) {
      rejeter(new Error('indexeddb-absent'));
      return;
    }
    const demande = indexedDB.open(BASE, VERSION_BASE);
    demande.onupgradeneeded = () => {
      const base = demande.result;
      if (!base.objectStoreNames.contains(FICHES)) base.createObjectStore(FICHES, { keyPath: 'id' });
      if (!base.objectStoreNames.contains(POINTS)) base.createObjectStore(POINTS, { keyPath: 'id' });
    };
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  }).catch((erreur) => {
    ouverture = null;
    throw erreur;
  });
  return ouverture;
}

async function transaction(magasins, mode, action) {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const tx = base.transaction(magasins, mode);
    let resultat;
    Promise.resolve(action(tx, (valeur) => { resultat = valeur; })).catch(rejeter);
    tx.oncomplete = () => resoudre(resultat);
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error ?? new Error('transaction-annulee'));
  });
}

const demander = (requete) =>
  new Promise((resoudre, rejeter) => {
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(requete.error);
  });

// Même départ, même nombre de points, même premier point : c'est le même fichier
export function empreinte(sortie) {
  const { lng, lat } = sortie.points;
  return `${sortie.debut ?? 'x'}:${lng.length}:${lng[0]}:${lat[0]}`;
}

function fiche(sortie, id) {
  return {
    id,
    nom: sortie.nom ?? null,
    type: sortie.type ?? null,
    format: sortie.format,
    debut: sortie.debut ?? null,
    ajoute: sortie.ajoute ?? Date.now(),
    empreinte: empreinte(sortie),
    canaux: Object.keys(sortie.points).filter((canal) => !['lng', 'lat'].includes(canal) && sortie.points[canal]),
    resume: resumerSortie(sortie),
    decalage: Number.isFinite(sortie.decalage) ? sortie.decalage : null,
  };
}

const nouvelId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function listerSorties() {
  const fiches = await transaction([FICHES], 'readonly', async (tx, rendre) => {
    rendre(await demander(tx.objectStore(FICHES).getAll()));
  });
  return fiches.sort((a, b) => (b.debut ?? b.ajoute) - (a.debut ?? a.ajoute));
}

// Renvoie la fiche ajoutée, ou { doublon: fiche existante } si le fichier est déjà là
export async function ajouterSortie(sortie) {
  const existantes = await listerSorties();
  const cle = empreinte(sortie);
  const doublon = existantes.find((autre) => autre.empreinte === cle);
  if (doublon) {
    // Importée avant que Montis lise le fuseau de la montre : le nouvel import le complète
    if (doublon.decalage == null && Number.isFinite(sortie.decalage)) {
      return { doublon: (await modifierSortie(doublon.id, { decalage: sortie.decalage })) ?? doublon };
    }
    return { doublon };
  }
  const id = nouvelId();
  const nouvelle = fiche(sortie, id);
  await transaction([FICHES, POINTS], 'readwrite', (tx) => {
    tx.objectStore(FICHES).put(nouvelle);
    tx.objectStore(POINTS).put({ id, points: sortie.points, coupures: sortie.coupures ?? [] });
  });
  return nouvelle;
}

export async function lireSortieComplete(id) {
  return transaction([FICHES, POINTS], 'readonly', async (tx, rendre) => {
    const [ficheLue, points] = await Promise.all([
      demander(tx.objectStore(FICHES).get(id)),
      demander(tx.objectStore(POINTS).get(id)),
    ]);
    rendre(ficheLue && points ? { ...ficheLue, points: points.points, coupures: points.coupures } : null);
  });
}

export async function modifierSortie(id, changements) {
  return transaction([FICHES], 'readwrite', async (tx, rendre) => {
    const magasin = tx.objectStore(FICHES);
    const actuelle = await demander(magasin.get(id));
    if (!actuelle) return;
    const modifiee = { ...actuelle, ...changements };
    magasin.put(modifiee);
    rendre(modifiee);
  });
}

export async function supprimerSortie(id) {
  await transaction([FICHES, POINTS], 'readwrite', (tx) => {
    tx.objectStore(FICHES).delete(id);
    tx.objectStore(POINTS).delete(id);
  });
}

// --- Sauvegarde .json ---

export async function toutesLesSorties() {
  return transaction([FICHES, POINTS], 'readonly', async (tx, rendre) => {
    const [fiches, points] = await Promise.all([
      demander(tx.objectStore(FICHES).getAll()),
      demander(tx.objectStore(POINTS).getAll()),
    ]);
    const parId = new Map(points.map((entree) => [entree.id, entree]));
    rendre(
      fiches
        .filter(({ id }) => parId.has(id))
        .map(({ id, nom, type, format, debut, ajoute, decalage }) => ({
          id, nom, type, format, debut, ajoute, decalage,
          points: parId.get(id).points,
          coupures: parId.get(id).coupures,
        }))
    );
  });
}

// `mode` : 'fusion' garde les sorties actuelles (le fichier l'emporte sur un même id), 'remplacement' les efface
export async function restaurerSorties(sorties, mode) {
  await transaction([FICHES, POINTS], 'readwrite', (tx) => {
    const fiches = tx.objectStore(FICHES);
    const points = tx.objectStore(POINTS);
    if (mode === 'remplacement') {
      fiches.clear();
      points.clear();
    }
    for (const sortie of sorties) {
      fiches.put(fiche(sortie, sortie.id));
      points.put({ id: sortie.id, points: sortie.points, coupures: sortie.coupures ?? [] });
    }
  });
}

// Liste vide si IndexedDB est indisponible (navigation privée de certains navigateurs)
export async function idsDesSorties() {
  try {
    return new Set((await listerSorties()).map(({ id }) => id));
  } catch {
    return new Set();
  }
}
