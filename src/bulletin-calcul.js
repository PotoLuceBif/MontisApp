// Bulletins d'avalanche détaillés de l'EAWS (format CAAML JSON, https://static.avalanche.report) :
// quel fichier lire pour un massif, et ce qu'il dit de ce massif. Calculs purs.

export const NIVEAUX = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 };
export const PROBLEMES = ['new_snow', 'wind_slab', 'persistent_weak_layers', 'wet_snow', 'gliding_snow', 'cornices', 'no_distinct_avalanche_problem', 'favourable_situation'];
export const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PERIODES = ['all_day', 'earlier', 'later'];

// Page de la liste des fichiers d'un jour → noms sans date ni extension : « FR », « AT-07.fr »…
export function fichiersDuJour(page, date) {
  const noms = new Set();
  const motif = new RegExp(`${date}-([A-Za-z0-9-]+(?:\\.[a-z]{2})?)\\.json`, 'g');
  for (const [, nom] of String(page ?? '').matchAll(motif)) {
    if (!/\.(ratings|problems)$/.test(nom) && !/^(ratings|problems)$/.test(nom)) noms.add(nom);
  }
  return noms;
}

// Le fichier d'un massif est celui du service au plus long préfixe commun (AT-07-02-01 → AT-07),
// dans la langue de l'appli quand il existe
export function fichierDuMassif(id, fichiers, langue = 'fr') {
  const morceaux = String(id ?? '').split('-');
  for (let n = morceaux.length; n >= 1; n -= 1) {
    const service = morceaux.slice(0, n).join('-');
    if (fichiers.has(`${service}.${langue}`)) return `${service}.${langue}`;
    if (fichiers.has(service)) return service;
  }
  return null;
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Texte d'un bulletin (HTML léger chez certains services) → paragraphes de texte brut
export function texteBrut(valeur) {
  if (typeof valeur !== 'string') return [];
  const texte = valeur
    .replace(/<\s*(br|\/p|\/h\d|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (tout, code) => (code[0] === '#' ? String.fromCharCode(Number(code.slice(1))) : ENTITES[code.toLowerCase()] ?? tout));
  return texte.split(/\n\s*\n|\n/).map((ligne) => ligne.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const altitude = (valeur) => {
  const nombre = Number.parseInt(valeur, 10);
  return Number.isFinite(nombre) ? nombre : null;
};
const tranche = (elevation) => ({ min: altitude(elevation?.lowerBound), max: altitude(elevation?.upperBound) });
const orientations = (liste) => ORIENTATIONS.filter((o) => Array.isArray(liste) && liste.includes(o));
const periode = (valeur) => (PERIODES.includes(valeur) ? valeur : 'all_day');
const commentaire = (bloc) => texteBrut(bloc?.comment);

// Bulletin d'un massif dans le fichier d'un service ; null s'il n'y est pas
export function lireBulletin(json, id) {
  const bulletins = Array.isArray(json?.bulletins) ? json.bulletins : [];
  const bulletin = bulletins.find((b) => Array.isArray(b?.regions) && b.regions.some((r) => r?.regionID === id));
  if (!bulletin) return null;
  const niveaux = (bulletin.dangerRatings ?? [])
    .map((n) => ({ niveau: NIVEAUX[n?.mainValue] ?? 0, periode: periode(n?.validTimePeriod), ...tranche(n?.elevation), orientations: orientations(n?.aspects) }))
    .filter(({ niveau }) => niveau > 0)
    .sort((a, b) => PERIODES.indexOf(a.periode) - PERIODES.indexOf(b.periode) || (a.min ?? -1) - (b.min ?? -1));
  const problemes = (bulletin.avalancheProblems ?? [])
    .filter((p) => PROBLEMES.includes(p?.problemType))
    .map((p) => ({
      type: p.problemType,
      periode: periode(p.validTimePeriod),
      ...tranche(p.elevation),
      orientations: orientations(p.aspects),
      taille: Number.isFinite(p.avalancheSize) ? p.avalancheSize : null,
      commentaire: commentaire(p),
    }));
  // Orientations à risque : celles que Météo-France donne à part, sinon celles des problèmes et des niveaux
  const meteoFrance = orientations(bulletin.customData?.MeteoFrance?.avalancheProneLocation?.aspects);
  const toutes = meteoFrance.length ? meteoFrance : orientations([...problemes, ...niveaux].flatMap((x) => x.orientations));
  const tendance = Array.isArray(bulletin.tendency) ? bulletin.tendency[0] : bulletin.tendency;
  return {
    region: bulletin.regions.find((r) => r.regionID === id)?.name ?? null,
    publication: bulletin.publicationTime ?? null,
    debut: bulletin.validTime?.startTime ?? null,
    fin: bulletin.validTime?.endTime ?? null,
    fournisseur: bulletin.source?.provider?.name ?? bulletin.source?.person?.name ?? null,
    site: /^https:\/\//.test(bulletin.source?.provider?.website ?? '') ? bulletin.source.provider.website : null,
    niveaux,
    max: Math.max(0, ...niveaux.map(({ niveau }) => niveau)),
    problemes,
    orientations: toutes,
    titre: texteBrut(bulletin.highlights ?? tendance?.highlights).join(' '),
    activite: commentaire(bulletin.avalancheActivity),
    manteau: commentaire(bulletin.snowpackStructure),
    meteo: commentaire(bulletin.weatherForecast),
    tendance: { type: ['decreasing', 'steady', 'increasing'].includes(tendance?.tendencyType) ? tendance.tendencyType : null, texte: commentaire(tendance) },
  };
}

// ---------- Neige récente ----------
// Cumuls de neige fraîche (cm) sur 24, 48 et 72 h avant `maintenant`, d'après les chutes horaires
// d'Open-Meteo (`hourly.time` en heure UTC sans fuseau, `hourly.snowfall` en cm)
export function cumulsNeige(heures, maintenant = Date.now()) {
  const temps = heures?.time ?? [];
  const chutes = heures?.snowfall ?? [];
  const cumuls = { h24: 0, h48: 0, h72: 0 };
  let vues = 0;
  temps.forEach((heure, i) => {
    const instant = Date.parse(`${heure}Z`);
    const ecart = (maintenant - instant) / 3_600_000;
    const valeur = Number(chutes[i]);
    if (!Number.isFinite(instant) || !Number.isFinite(valeur) || ecart < 0 || ecart >= 72) return;
    vues += 1;
    if (ecart < 24) cumuls.h24 += valeur;
    if (ecart < 48) cumuls.h48 += valeur;
    cumuls.h72 += valeur;
  });
  if (!vues) return null;
  return Object.fromEntries(Object.entries(cumuls).map(([cle, v]) => [cle, Math.round(v)]));
}
