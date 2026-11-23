// Réponses lentes gardées d'une ouverture de l'appli à l'autre (Overpass, avalanches, balises, terrains) :
// tant qu'une réponse est fraîche, on ne la redemande pas. Rangées dans le Cache Storage du navigateur
// (cache `montis-reponses`, que le service worker garde d'une version à l'autre), en développement aussi.
// Sans Cache Storage (navigation privée, tests), tout se redemande comme avant.
const CACHE = 'montis-reponses';
const EN_TETE_DATE = 'x-montis-gardee';
const MAXIMUM = 120;

// Bulletins d'avalanche publiés vers 17 h et corrigés le matin : une demi-heure sans les redemander
export const DUREE_AVALANCHES = 30 * 60 * 1000;

// La clé devient une adresse fictive : le Cache Storage ne range que des requêtes
export function adresseGardee(cle) {
  let empreinte = 0x811c9dc5;
  for (let i = 0; i < cle.length; i++) {
    empreinte ^= cle.charCodeAt(i);
    empreinte = Math.imul(empreinte, 0x01000193) >>> 0;
  }
  const lisible = cle.slice(0, 80).replace(/[^\w.-]+/g, '-');
  return `https://reponses.montis.invalid/${lisible}-${empreinte.toString(36)}-${cle.length}`;
}

const ouvrir = () => (typeof caches === 'undefined' ? null : caches.open(CACHE));

// Réponse gardée de moins de `duree` ms, ou null
export async function lireGardee(cle, duree) {
  try {
    const cache = await ouvrir();
    const reponse = await cache?.match(adresseGardee(cle));
    if (!reponse) return null;
    const date = Number(reponse.headers.get(EN_TETE_DATE));
    if (!(Date.now() - date < duree)) return null;
    return await reponse.json();
  } catch {
    return null;
  }
}

let ajouts = 0;
export async function garder(cle, donnees) {
  try {
    const cache = await ouvrir();
    if (!cache) return;
    await cache.put(adresseGardee(cle), new Response(JSON.stringify(donnees), {
      headers: { 'content-type': 'application/json', [EN_TETE_DATE]: String(Date.now()) },
    }));
    // Les plus anciennes partent d'abord : le Cache Storage garde l'ordre d'arrivée
    if (++ajouts % 20 === 0) {
      const cles = await cache.keys();
      await Promise.all(cles.slice(0, Math.max(0, cles.length - MAXIMUM)).map((requete) => cache.delete(requete)));
    }
  } catch {
    /* plein ou indisponible : la prochaine fois, on redemandera */
  }
}

// La réponse gardée si elle a moins de `duree` ms, sinon `charger()`, gardée pour la prochaine fois
export async function gardee(cle, duree, charger) {
  const enregistree = await lireGardee(cle, duree);
  if (enregistree !== null) return enregistree;
  const donnees = await charger();
  void garder(cle, donnees);
  return donnees;
}
