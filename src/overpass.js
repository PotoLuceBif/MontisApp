// Interroge Overpass en essayant plusieurs serveurs publics (le principal est souvent saturé)
const URLS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const DELAI_PAR_SERVEUR = 12000;

let prefere = 0; // dernier serveur qui a répondu : on l'essaie en premier

export async function interroger(requete, signal) {
  let derniereErreur = null;

  for (let i = 0; i < URLS_OVERPASS.length; i++) {
    const index = (prefere + i) % URLS_OVERPASS.length;
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), DELAI_PAR_SERVEUR);
    const annuler = () => controleur.abort();
    if (signal) signal.addEventListener('abort', annuler);

    try {
      const rep = await fetch(URLS_OVERPASS[index], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(requete),
        signal: controleur.signal,
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const json = await rep.json();
      if (json.remark && /error|timeout/i.test(json.remark)) throw new Error(json.remark);
      prefere = index;
      return json;
    } catch (e) {
      if (signal && signal.aborted) throw e; // annulation demandée par l'appelant
      derniereErreur = e;
    } finally {
      clearTimeout(delai);
      if (signal) signal.removeEventListener('abort', annuler);
    }
  }
  throw derniereErreur;
}