// Requêtes Overpass (OpenStreetMap) : chaque serveur à tour de rôle, le principal est souvent saturé
const URLS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', // VK Maps : a répondu quand les autres étaient saturés (23 novembre 2026)
];

// `delaiParServeur` (ms) : un serveur qui ne répond pas laisse sa place au suivant
export async function interroger(requete, signal, { delaiParServeur = 0 } = {}) {
  let derniereErreur = null;
  for (const url of URLS_OVERPASS) {
    const local = new AbortController();
    const fin = () => local.abort();
    signal?.addEventListener('abort', fin);
    const minuteur = delaiParServeur ? setTimeout(fin, delaiParServeur) : null;
    try {
      if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
      const rep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(requete),
        signal: local.signal,
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const json = await rep.json();
      if (json.remark && /error|timeout/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) {
      if (signal?.aborted) throw e;
      derniereErreur = e;
      console.warn(`Overpass (${new URL(url).host}) :`, e.message);
    } finally {
      clearTimeout(minuteur);
      signal?.removeEventListener('abort', fin);
    }
  }
  throw derniereErreur;
}

// Objet OpenStreetMap d'un élément des tuiles OpenFreeMap (Planetiler) : identifiant OSM × 10 + genre
// (1 nœud, 2 chemin, 3 relation). Permet de lire l'objet dans l'API d'OpenStreetMap, rapide et fiable,
// là où Overpass est souvent saturé.
const GENRES_OSM = { 1: 'node', 2: 'way', 3: 'relation' };
export function objetOsm(idTuile) {
  const n = Number(idTuile);
  if (!Number.isSafeInteger(n) || n < 10) return null;
  const type = GENRES_OSM[n % 10];
  return type ? { type, id: Math.floor(n / 10) } : null;
}
