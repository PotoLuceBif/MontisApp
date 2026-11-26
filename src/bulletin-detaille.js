// Bulletin d'avalanche détaillé d'un massif : niveaux par altitude et moment de la journée,
// orientations à risque, problèmes d'avalanche, textes du service, neige récente (Open-Meteo).
// Source : bulletins de l'EAWS au format CAAML (static.avalanche.report), gardés par le service worker.
import { cumulsNeige, fichierDuMassif, fichiersDuJour, lireBulletin, ORIENTATIONS } from './bulletin-calcul.js';
import { requete } from './requete.js';
import { DUREE_AVALANCHES, gardee } from './reponses-gardees.js';
import { formatAltitude, formatNeige } from './unites.js';
import { formatDate, t } from './i18n.js';
import { creerAide } from './aide.js';

const URL_BULLETINS = 'https://static.avalanche.report/eaws_bulletins';
const API_PREVISIONS = 'https://api.open-meteo.com/v1/forecast';
const DUREE_CACHE_NEIGE_MS = 30 * 60 * 1000;

const dateLocale = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

async function lireJson(adresse) {
  const reponse = await requete(adresse);
  if (!reponse.ok) throw Object.assign(new Error(`HTTP ${reponse.status}`), { statut: reponse.status });
  return reponse.json();
}

const listes = new Map();
const fichiers = new Map();
function memoriser(cache, cle, charger) {
  if (!cache.has(cle)) {
    const promesse = charger();
    promesse.catch(() => cache.delete(cle));
    cache.set(cle, promesse);
  }
  return cache.get(cle);
}

// Bulletin du jour d'un massif, ou null si son service n'a rien publié
export async function chargerBulletin(massif, langue) {
  const date = dateLocale();
  const disponibles = await memoriser(listes, date, async () => new Set(await gardee(`bulletins:${date}`, DUREE_AVALANCHES, async () => {
    const reponse = await requete(`${URL_BULLETINS}/${date}/`);
    if (!reponse.ok) throw Object.assign(new Error(`HTTP ${reponse.status}`), { statut: reponse.status });
    return [...fichiersDuJour(await reponse.text(), date)];
  })));
  const fichier = fichierDuMassif(massif, disponibles, langue);
  if (!fichier) return null;
  const json = await memoriser(fichiers, `${date}/${fichier}`, () =>
    gardee(`bulletin:${date}/${fichier}`, DUREE_AVALANCHES, () => lireJson(`${URL_BULLETINS}/${date}/${date}-${fichier}.json`)));
  return lireBulletin(json, massif);
}

const neiges = new Map();
// Neige tombée ces trois derniers jours et hauteur au sol (modèle) au point donné
export async function chargerNeigeRecente([lng, lat]) {
  const cle = `${lng.toFixed(2)},${lat.toFixed(2)}`;
  const enCache = neiges.get(cle);
  if (enCache && Date.now() - enCache.heure < DUREE_CACHE_NEIGE_MS) return enCache.donnees;
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    hourly: 'snowfall,snow_depth',
    past_days: '3',
    forecast_days: '1',
    timezone: 'GMT',
  });
  const json = await lireJson(`${API_PREVISIONS}?${params}`);
  const cumuls = cumulsNeige(json.hourly);
  const heure = new Date().toISOString().slice(0, 13);
  const i = (json.hourly?.time ?? []).findIndex((h) => h.startsWith(heure));
  const sol = Number(json.hourly?.snow_depth?.[i]);
  const donnees = { cumuls, solCm: Number.isFinite(sol) ? Math.round(sol * 100) : null, altitude: Number.isFinite(json.elevation) ? Math.round(json.elevation) : null };
  neiges.set(cle, { heure: Date.now(), donnees });
  return donnees;
}

// ---------- Affichage ----------
// Les bulletins notent l'ouest W, les traductions de Montis O
const CLES_CARDINAUX = { W: 'O', SW: 'SO', NW: 'NO' };
const cardinal = (o) => t(`cardinal.${CLES_CARDINAUX[o] ?? o}`);
function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

function tranche({ min, max }) {
  if (min != null && max != null) return t('bulletin.entre', { min: formatAltitude(min), max: formatAltitude(max) });
  if (min != null) return t('bulletin.dessus', { altitude: formatAltitude(min) });
  if (max != null) return t('bulletin.dessous', { altitude: formatAltitude(max) });
  return '';
}

const moment = (periode) => (periode === 'earlier' ? t('bulletin.matin') : periode === 'later' ? t('bulletin.apres-midi') : '');

// Rose des huit orientations, celles du bulletin en couleur
function rose(choisies, niveau) {
  const point = (angle, r) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  const secteurs = ORIENTATIONS.map((o, i) => {
    const debut = i * 45 - 22.5;
    return `<path d="M50 50 L${point(debut, 36)} A36 36 0 0 1 ${point(debut + 45, 36)} Z" class="${choisies.includes(o) ? `bulletin-rose-actif ski-risque-${niveau || 3}` : 'bulletin-rose-calme'}"/>`;
  }).join('');
  const lettres = ['N', 'E', 'S', 'W'].map((o) => {
    const [x, y] = point(ORIENTATIONS.indexOf(o) * 45, 45).split(' ');
    return `<text x="${x}" y="${y}">${cardinal(o)}</text>`;
  }).join('');
  return `<svg class="bulletin-rose" viewBox="0 0 100 100" role="img" aria-label="${t('bulletin.orientations-aria', { liste: choisies.map((o) => cardinal(o)).join(', ') })}">${secteurs}<circle cx="50" cy="50" r="8" class="bulletin-rose-centre"/>${lettres}</svg>`;
}

function section(titre, paragraphes) {
  if (!paragraphes?.length) return null;
  const bloc = el('section', 'bulletin-texte');
  // Les services écrivent leurs listes avec « * » ou « - », et leurs intertitres en finissant par « : »
  bloc.append(el('h4', null, titre), ...paragraphes.map((p) => {
    const puce = /^[*•-]\s+/.exec(p);
    if (puce) return el('p', 'bulletin-puce', p.slice(puce[0].length));
    return el('p', p.length < 70 && /:\s*$/.test(p) ? 'bulletin-intertitre' : null, p);
  }));
  return bloc;
}

// `carte` : { actif, basculer() } pour le bouton « Voir sur la carte » des pentes concernées ;
// `noteNeige` : la clé qui dit où la neige est estimée
export function creerBulletinDetaille(bulletin, neige, carte = null, { noteNeige = 'bulletin.neige-note' } = {}) {
  const bloc = el('div', 'bulletin-detaille');

  const entete = el('p', 'bulletin-date');
  entete.hidden = !bulletin.fournisseur && !bulletin.publication && !bulletin.fin;
  const date = (iso) => formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  entete.textContent = [
    bulletin.fournisseur,
    bulletin.publication ? t('bulletin.publie', { date: date(bulletin.publication) }) : '',
    bulletin.fin ? t('bulletin.valable', { date: date(bulletin.fin) }) : '',
  ].filter(Boolean).join(' · ');
  bloc.append(entete);
  if (bulletin.titre) bloc.append(el('p', 'bulletin-titre', bulletin.titre));

  // Niveaux : une ligne par altitude ou par moment de la journée
  if (bulletin.niveaux.length) {
    const niveaux = el('div', 'bulletin-niveaux');
    for (const n of bulletin.niveaux) {
      const ligne = el('div', 'bulletin-niveau');
      const pastille = el('span', `ski-risque-niveau ski-risque-${n.niveau}`, String(n.niveau));
      pastille.setAttribute('aria-hidden', 'true');
      const textes = el('span', 'bulletin-niveau-textes');
      textes.append(el('strong', null, `${t(`risque.${n.niveau}`)} (${n.niveau}/5)`));
      const ou = [moment(n.periode), tranche(n) || (bulletin.niveaux.length > 1 ? '' : t('bulletin.partout'))].filter(Boolean).join(' · ');
      if (ou) textes.append(el('span', null, ou));
      ligne.append(pastille, textes);
      niveaux.append(ligne);
    }
    bloc.append(niveaux);
  }

  // Orientations à risque
  if (bulletin.orientations.length) {
    const orientations = el('div', 'bulletin-orientations');
    orientations.innerHTML = rose(bulletin.orientations, bulletin.max);
    const texte = el('div', 'bulletin-orientations-textes');
    // « ? » à côté du titre de la rose, explication sous la rose
    const aide = creerAide('bulletin-rose');
    const titreRose = el('strong', 'aide-titre', t('bulletin.orientations'));
    titreRose.append(aide.bouton);
    texte.append(titreRose, el('span', null, bulletin.orientations.map((o) => cardinal(o)).join(', ')));
    if (carte) {
      const bouton = el('button', 'bulletin-carte', t(carte.actif ? 'bulletin.carte-masquer' : 'bulletin.carte-voir'));
      bouton.type = 'button';
      bouton.setAttribute('aria-pressed', String(carte.actif));
      bouton.addEventListener('click', carte.basculer);
      texte.append(bouton);
    }
    orientations.append(texte);
    bloc.append(orientations, aide.bulle);
  }

  // Problèmes d'avalanche
  if (bulletin.problemes.length) {
    const problemes = el('div', 'bulletin-problemes');
    problemes.append(el('h4', null, t('bulletin.problemes')));
    for (const p of bulletin.problemes) {
      const carte = el('div', 'bulletin-probleme');
      carte.append(el('strong', null, t(`bulletin.probleme-${p.type}`)));
      const ou = [
        moment(p.periode),
        tranche(p),
        p.orientations.length ? p.orientations.map((o) => cardinal(o)).join(', ') : '',
        p.taille ? t('bulletin.taille', { n: p.taille }) : '',
      ].filter(Boolean).join(' · ');
      if (ou) carte.append(el('span', null, ou));
      p.commentaire.forEach((ligne) => carte.append(el('p', null, ligne)));
      problemes.append(carte);
    }
    bloc.append(problemes);
  }

  // Neige récente
  if (neige?.cumuls || neige?.solCm != null) {
    const bloc2 = el('div', 'bulletin-neige');
    bloc2.append(el('h4', null, t('bulletin.neige')));
    const chiffres = el('div', 'bulletin-neige-chiffres');
    if (neige.cumuls) {
      for (const [cle, valeur] of Object.entries(neige.cumuls)) {
        const case_ = el('div', 'bulletin-neige-case');
        case_.append(el('strong', null, formatNeige(valeur)), el('span', null, t(`bulletin.neige-${cle}`)));
        chiffres.append(case_);
      }
    }
    if (neige.solCm != null) {
      const case_ = el('div', 'bulletin-neige-case');
      case_.append(el('strong', null, formatNeige(neige.solCm)), el('span', null, t('bulletin.neige-sol')));
      chiffres.append(case_);
    }
    bloc2.append(chiffres);
    bloc2.append(el('p', 'ski-conditions-note', t(noteNeige, { altitude: neige.altitude != null ? formatAltitude(neige.altitude) : '—' })));
    bloc.append(bloc2);
  }

  // Textes du service, dans sa langue
  const { type, texte } = bulletin.tendance;
  const titreTendance = type ? t('bulletin.tendance-type', { type: t(`bulletin.tendance-${type}`) }) : t('bulletin.tendance');
  bloc.append(...[
    section(t('bulletin.activite'), bulletin.activite),
    section(t('bulletin.manteau'), bulletin.manteau),
    section(t('bulletin.meteo'), bulletin.meteo),
    // Une tendance sans texte tient en une ligne
    texte.length ? section(titreTendance, texte) : type ? el('p', 'bulletin-tendance-seule', titreTendance) : null,
  ].filter(Boolean));

  const pied = el('p', 'ski-conditions-note');
  pied.append(t('bulletin.pied'));
  if (bulletin.site) {
    const lien = el('a', null, t('bulletin.lire-officiel'));
    lien.href = bulletin.site;
    lien.target = '_blank';
    lien.rel = 'noopener noreferrer';
    pied.append(' ', lien, '.');
  }
  bloc.append(pied);
  return bloc;
}
