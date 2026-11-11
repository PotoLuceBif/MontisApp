// Relais Vercel de la carte des plafonds : pour une heure (UTC), télécharge chez la NOAA l'épaisseur de la
// couche limite de GFS (0,25°, toute la Terre) et renvoie une maille par octet, compressée. L'appli y ajoute
// elle-même le relief fin.
// La réponse est gardée une heure par le réseau de Vercel : un seul téléchargement par heure, pour tous.
// Appel : /api/plafonds?t=AAAA-MM-JJTHH (heure de validité, UTC). En-tête X-Montis-Grille : la grille.
import { gzipSync } from 'node:zlib';
import { lireGrib2 } from './_lib/grib2.js';
import { encoderEpaisseurs } from '../src/plafonds-calcul.js';

const FILTRE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl';
const DELAI = 20000;
const ECHEANCE_MAX = 120; // heures : GFS est horaire jusque-là
const HEURE = 3600000;

const deux = (n) => String(n).padStart(2, '0');

async function telecharger(run, echeance) {
  const jour = `${run.getUTCFullYear()}${deux(run.getUTCMonth() + 1)}${deux(run.getUTCDate())}`;
  const heure = deux(run.getUTCHours());
  const params = new URLSearchParams({
    dir: `/gfs.${jour}/${heure}/atmos`,
    file: `gfs.t${heure}z.pgrb2.0p25.f${String(echeance).padStart(3, '0')}`,
    var_HPBL: 'on',
    lev_surface: 'on',
  });
  const reponse = await fetch(`${FILTRE}?${params}`, { signal: AbortSignal.timeout(DELAI), headers: { 'User-Agent': 'Montis (relais plafonds)' } });
  if (!reponse.ok) return null;
  const octets = new Uint8Array(await reponse.arrayBuffer());
  // Un calcul pas encore publié répond une page d'explication, pas un fichier GRIB
  if (octets.length < 4 || String.fromCharCode(...octets.subarray(0, 4)) !== 'GRIB') return null;
  return lireGrib2(octets);
}

export async function calculerPlafonds(valide, maintenant = Date.now()) {
  // Les calculs de 00, 06, 12 et 18 h UTC sont publiés environ 4 h après : le plus récent d'abord
  const dernier = Math.floor((maintenant - 3.5 * HEURE) / (6 * HEURE)) * 6 * HEURE;
  for (let essai = 0; essai < 3; essai += 1) {
    const run = new Date(dernier - essai * 6 * HEURE);
    const echeance = Math.round((valide - run.getTime()) / HEURE);
    if (echeance < 0 || echeance > ECHEANCE_MAX) continue;
    const messages = await telecharger(run, echeance);
    const couche = messages?.find((m) => m.categorie === 3 && m.numero === 196);
    if (!couche) continue;
    const { ni, nj, lat1, lon1, lat2, lon2 } = couche;
    return {
      grille: { ni, nj, lat1, lon1, lat2, lon2, run: run.toISOString(), valide: new Date(valide).toISOString(), source: 'GFS 0,25° (NOAA)' },
      codes: encoderEpaisseurs(couche.valeurs),
    };
  }
  return null;
}

// Signature classique (requête et réponse Node) : celle de Vercel et du serveur de développement
export default async function plafonds(req, res) {
  const t = new URL(req.url, 'http://montis').searchParams.get('t') ?? '';
  const lu = /^(\d{4})-(\d\d)-(\d\d)T(\d\d)$/.exec(t);
  const envoyerErreur = (statut, message) => {
    res.statusCode = statut;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.end(JSON.stringify({ erreur: message }));
  };
  if (!lu) return envoyerErreur(400, 'Paramètre t attendu : AAAA-MM-JJTHH (UTC).');
  const valide = Date.UTC(Number(lu[1]), Number(lu[2]) - 1, Number(lu[3]), Number(lu[4]));
  try {
    const resultat = await calculerPlafonds(valide);
    if (!resultat) return envoyerErreur(404, 'Pas de prévision GFS pour cette heure.');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('X-Montis-Grille', JSON.stringify(resultat.grille));
    res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400');
    res.end(gzipSync(resultat.codes));
  } catch (erreur) {
    console.error('Relais des plafonds :', erreur);
    envoyerErreur(502, 'La NOAA ne répond pas pour l’instant.');
  }
}
