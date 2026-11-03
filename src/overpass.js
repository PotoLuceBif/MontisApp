// Requêtes Overpass (OpenStreetMap) : chaque serveur à tour de rôle, le principal est souvent saturé
const URLS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export async function interroger(requete, signal) {
  let derniereErreur = null;
  for (const url of URLS_OVERPASS) {
    try {
      const rep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(requete),
        signal,
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const json = await rep.json();
      if (json.remark && /error|timeout/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      derniereErreur = e;
    }
  }
  throw derniereErreur;
}
