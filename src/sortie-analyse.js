// Analyse d'une sortie importée : vitesse, pente, mouvement et pauses, stats selon l'activité,
// points marquants, couleurs de la trace. Calculs purs (testés).
import { distanceMetres } from './sortie-lecture.js';
import { denivele, lisser } from './rando-profil.js';

// Sous cette vitesse (m/s), on est arrêté
const SEUIL_MOUVEMENT = { rando: 0.3, velo: 1, ski: 0.8, parapente: 1, autre: 0.3 };
const FENETRE_VITESSE = 10; // s de part et d'autre : en dessous, c'est le bruit du GPS qu'on mesure
const FENETRE_PENTE = 25; // m de part et d'autre du point
const PAUSE_MIN = 120; // s
const PAUSES_MAX = 8;
const SKI_HYSTERESIS = 30; // m : une descente plus courte n'en est pas une
const VOL_VITESSE_DECO = 4; // m/s : au-dessus, on vole (ou on court au décollage)
const FENETRE_VARIO = 10; // s de part et d'autre

export function distancesCumulees({ lng, lat }, coupures = []) {
  const sauts = new Set(coupures);
  const d = new Float64Array(lng.length);
  for (let i = 1; i < lng.length; i++) {
    d[i] = d[i - 1] + (sauts.has(i) ? 0 : distanceMetres([lng[i - 1], lat[i - 1]], [lng[i], lat[i]]));
  }
  return d;
}

// Vitesse lissée en chaque point (m/s) : distance parcourue sur une fenêtre de temps
export function vitessesLissees(t, d, fenetre = FENETRE_VITESSE) {
  const n = t.length;
  const v = new Float64Array(n);
  let debut = 0;
  let fin = 0;
  for (let i = 0; i < n; i++) {
    while (t[i] - t[debut] > fenetre * 1000) debut++;
    while (fin < n - 1 && t[fin + 1] - t[i] <= fenetre * 1000) fin++;
    const duree = (t[fin] - t[debut]) / 1000;
    v[i] = duree > 0 ? (d[fin] - d[debut]) / duree : 0;
  }
  return v;
}

// Pente en chaque point (%), sur l'altitude lissée et une fenêtre de distance
export function pentesLissees(alts, d, fenetre = FENETRE_PENTE) {
  const n = alts.length;
  const p = new Float64Array(n);
  let debut = 0;
  let fin = 0;
  for (let i = 0; i < n; i++) {
    while (d[i] - d[debut] > fenetre) debut++;
    while (fin < n - 1 && d[fin + 1] - d[i] <= fenetre) fin++;
    const distance = d[fin] - d[debut];
    p[i] = distance > 5 ? ((alts[fin] - alts[debut]) / distance) * 100 : 0;
  }
  return p;
}

// Altitudes sans trous (valeurs manquantes prises au voisin connu), lissées
function altitudesPleines(alt) {
  if (!alt) return null;
  const premiere = alt.find((a) => a != null);
  if (premiere == null) return null;
  let precedente = premiere;
  return lisser(alt.map((a) => (a == null ? precedente : (precedente = a))));
}

// Montées et descentes de ski : extrêmes alternés de l'altitude, avec une hystérésis
export function descentesSki(alts, seuil = SKI_HYSTERESIS) {
  const descentes = [];
  let haut = 0;
  let bas = 0;
  let sens = 0; // 1 : on monte, -1 : on descend
  for (let i = 1; i < alts.length; i++) {
    if (sens >= 0) {
      if (alts[i] > alts[haut]) haut = i;
      else if (alts[haut] - alts[i] >= seuil) {
        sens = -1;
        bas = i;
      }
    }
    if (sens === -1) {
      if (alts[i] < alts[bas]) bas = i;
      else if (alts[i] - alts[bas] >= seuil) {
        descentes.push({ debut: haut, fin: bas, chute: alts[haut] - alts[bas] });
        sens = 1;
        haut = i;
      }
    }
  }
  if (sens === -1 && alts[haut] - alts[bas] >= seuil) descentes.push({ debut: haut, fin: bas, chute: alts[haut] - alts[bas] });
  return descentes;
}

function moyenne(valeurs) {
  let somme = 0;
  let n = 0;
  for (const v of valeurs) {
    if (v != null && Number.isFinite(v)) {
      somme += v;
      n++;
    }
  }
  return n ? somme / n : null;
}

// Pas de Math.max(...) : une longue sortie dépasse la limite d'arguments
function maximum(valeurs) {
  let max = null;
  for (const v of valeurs) if (v != null && (max == null || v > max)) max = v;
  return max;
}

function indiceMax(valeurs, debut = 0, fin = valeurs.length - 1) {
  let meilleur = -1;
  for (let i = debut; i <= fin; i++) {
    if (valeurs[i] != null && (meilleur < 0 || valeurs[i] > valeurs[meilleur])) meilleur = i;
  }
  return meilleur;
}

export function analyserSortie(sortie) {
  const { points, coupures = [] } = sortie;
  const type = SEUIL_MOUVEMENT[sortie.type] ? sortie.type : 'autre';
  const n = points.lng.length;
  const d = distancesCumulees(points, coupures);
  const t = points.t ?? null;
  const alts = altitudesPleines(points.alt);
  const sauts = new Set(coupures);

  // La vitesse de la montre est plus juste que celle tirée des positions, mais un peu bruitée
  let vitesse = null;
  if (t) {
    vitesse = vitessesLissees(t, d);
    if (points.vitesse?.filter((v) => v != null).length > n / 2) {
      const brute = points.vitesse;
      vitesse = vitesse.map((v, i) => {
        const voisins = [brute[i - 1], brute[i], brute[i + 1]].filter((x) => x != null);
        return voisins.length ? moyenne(voisins) : v;
      });
    }
  }
  const pente = alts ? pentesLissees(alts, d) : null;

  // Mouvement : segment par segment, sa vitesse moyenne contre le seuil de l'activité
  const enMouvement = new Uint8Array(n);
  let tempsMouvement = null;
  const pauses = [];
  if (t) {
    tempsMouvement = 0;
    let debutArret = null;
    let dureeArret = 0;
    const finirArret = (fin) => {
      if (debutArret != null && dureeArret >= PAUSE_MIN) pauses.push({ debut: debutArret, fin, duree: dureeArret });
      debutArret = null;
      dureeArret = 0;
    };
    for (let i = 1; i < n; i++) {
      const dt = (t[i] - t[i - 1]) / 1000;
      if (dt <= 0) continue;
      const bouge = !sauts.has(i) && (d[i] - d[i - 1]) / dt >= SEUIL_MOUVEMENT[type] && vitesse[i] >= SEUIL_MOUVEMENT[type] * 0.5;
      enMouvement[i] = bouge ? 1 : 0;
      if (bouge) {
        tempsMouvement += dt;
        finirArret(i - 1);
      } else {
        debutArret ??= i - 1;
        dureeArret += dt;
      }
    }
    finirArret(n - 1);
  }

  const { plus, moins } = alts ? denivele(alts) : { plus: null, moins: null };
  const duree = t ? (t[n - 1] - t[0]) / 1000 : null;
  const iHaut = alts ? indiceMax(alts) : -1;
  const iVitesse = vitesse ? indiceMax(vitesse) : -1;

  // Montée : altitude gagnée pendant les segments où l'on monte et bouge
  let tempsMontee = 0;
  let gainMontee = 0;
  if (t && alts) {
    for (let i = 1; i < n; i++) {
      const gain = alts[i] - alts[i - 1];
      if (enMouvement[i] && gain > 0 && pente[i] > 2) {
        tempsMontee += (t[i] - t[i - 1]) / 1000;
        gainMontee += gain;
      }
    }
  }

  const stats = {
    distance: d[n - 1],
    duree,
    tempsMouvement,
    tempsPause: duree != null ? duree - tempsMouvement : null,
    plus,
    moins,
    altMax: iHaut >= 0 ? alts[iHaut] : null,
    altMin: alts ? alts.reduce((a, b) => Math.min(a, b)) : null,
    vitesseMoyenne: tempsMouvement ? d[n - 1] / tempsMouvement : null,
    vitesseMax: iVitesse >= 0 ? vitesse[iVitesse] : null,
    // m/h, seulement sur une vraie montée : sur le plat, le chiffre ne veut rien dire
    vitesseMontee: tempsMontee > 300 && gainMontee >= 100 ? (gainMontee / tempsMontee) * 3600 : null,
    fcMoyenne: points.fc ? moyenne(points.fc) : null,
    fcMax: points.fc ? maximum(points.fc) : null,
    cadenceMoyenne: points.cadence ? moyenne(points.cadence.filter((x) => x)) : null,
    puissanceMoyenne: points.puissance ? moyenne(points.puissance) : null,
    puissanceMax: points.puissance ? maximum(points.puissance) : null,
    temperature: points.temperature ? moyenne(points.temperature) : null,
    pauses: pauses.length,
  };

  const marquants = [];
  if (iHaut >= 0) marquants.push({ type: 'haut', index: iHaut, valeur: alts[iHaut] });
  if (iVitesse >= 0 && stats.vitesseMax > SEUIL_MOUVEMENT[type] * 2) marquants.push({ type: 'vitesse', index: iVitesse, valeur: stats.vitesseMax });
  [...pauses].sort((a, b) => b.duree - a.duree).slice(0, PAUSES_MAX)
    .forEach((pause) => marquants.push({ type: 'pause', index: Math.round((pause.debut + pause.fin) / 2), valeur: pause.duree }));

  if (type === 'ski' && alts) {
    const descentes = descentesSki(alts);
    stats.descentes = descentes.length;
    stats.deniveleDescendu = descentes.reduce((somme, { chute }) => somme + chute, 0);
    stats.plusLongueDescente = descentes.reduce((max, { chute }) => Math.max(max, chute), 0) || null;
    if (vitesse && descentes.length) {
      const maxi = descentes.map(({ debut, fin }) => indiceMax(vitesse, debut, fin)).filter((i) => i >= 0);
      const meilleur = maxi.reduce((a, b) => (vitesse[b] > vitesse[a] ? b : a), maxi[0]);
      stats.vitesseMaxDescente = vitesse[meilleur];
    }
  }

  if (type === 'parapente' && t && vitesse) {
    const deco = vitesse.findIndex((v) => v >= VOL_VITESSE_DECO);
    let atterro = -1;
    for (let i = n - 1; i >= 0; i--) if (vitesse[i] >= VOL_VITESSE_DECO) { atterro = i; break; }
    if (deco >= 0 && atterro > deco) {
      stats.dureeVol = (t[atterro] - t[deco]) / 1000;
      if (alts) {
        stats.altDeco = alts[deco];
        stats.gainMax = Math.max(0, alts[indiceMax(alts, deco, atterro)] - alts[deco]);
        // Vario : vitesse verticale sur une fenêtre de temps
        let debut = deco;
        let fin = deco;
        let montee = -Infinity;
        let descente = Infinity;
        for (let i = deco; i <= atterro; i++) {
          while (t[i] - t[debut] > FENETRE_VARIO * 1000) debut++;
          while (fin < atterro && t[fin + 1] - t[i] <= FENETRE_VARIO * 1000) fin++;
          const dt = (t[fin] - t[debut]) / 1000;
          if (dt <= 0) continue;
          const vz = (alts[fin] - alts[debut]) / dt;
          montee = Math.max(montee, vz);
          descente = Math.min(descente, vz);
        }
        stats.varioMax = Number.isFinite(montee) ? montee : null;
        stats.varioMin = Number.isFinite(descente) ? descente : null;
      }
      let loin = 0;
      for (let i = deco; i <= atterro; i++) {
        loin = Math.max(loin, distanceMetres([points.lng[deco], points.lat[deco]], [points.lng[i], points.lat[i]]));
      }
      stats.distanceMaxDeco = loin;
      marquants.push({ type: 'deco', index: deco, valeur: stats.altDeco ?? null });
    }
  }

  return { type, n, distance: d, temps: t, alts, vitesse, pente, enMouvement, pauses, stats, marquants };
}

// --- Couleurs de la trace ---

export const MODES_COULEUR = ['vitesse', 'altitude', 'pente', 'cardio'];

// Les modes que permettent les données de la sortie
export function modesPossibles(analyse, points) {
  return MODES_COULEUR.filter((mode) => {
    if (mode === 'vitesse') return !!analyse.vitesse;
    if (mode === 'altitude' || mode === 'pente') return !!analyse.alts;
    if (mode === 'cardio') return !!points.fc;
    return false;
  });
}

// Du lent au rapide, du bas au haut : bleu, vert, jaune, orange, rouge, lisible sur les fonds clairs et sombres
export const DEGRADE = ['#3b6fe0', '#2bb5c8', '#4fc96a', '#e7d23c', '#f08a2c', '#e2412f'];

function versRvb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function couleurDegrade(fraction, degrade = DEGRADE) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0)) * (degrade.length - 1);
  const i = Math.min(degrade.length - 2, Math.floor(f));
  const a = versRvb(degrade[i]);
  const b = versRvb(degrade[i + 1]);
  const m = f - i;
  return `#${a.map((c, k) => Math.round(c + (b[k] - c) * m).toString(16).padStart(2, '0')).join('')}`;
}

// Bornes robustes : 5e et 95e centiles, pour qu'un point aberrant n'écrase pas l'échelle
export function bornes(valeurs) {
  const tries = valeurs.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!tries.length) return null;
  const centile = (p) => tries[Math.min(tries.length - 1, Math.max(0, Math.round(p * (tries.length - 1))))];
  const [min, max] = [centile(0.05), centile(0.95)];
  return { min, max: max > min ? max : min + 1 };
}

// Valeur en chaque point pour un mode
export function valeursMode(mode, analyse, points) {
  if (mode === 'vitesse') return analyse.vitesse ? [...analyse.vitesse] : null;
  if (mode === 'altitude') return analyse.alts;
  if (mode === 'pente') return analyse.pente ? [...analyse.pente] : null;
  if (mode === 'cardio') {
    if (!points.fc) return null;
    let precedente = points.fc.find((x) => x != null);
    return points.fc.map((x) => (x == null ? precedente : (precedente = x)));
  }
  return null;
}

// Morceaux de trace d'une même couleur : `couleurDe(i)` donne la couleur du segment qui finit au point i
export function morceaux({ lng, lat }, coupures, couleurDe) {
  const sauts = new Set(coupures);
  const features = [];
  let courant = null;
  for (let i = 1; i < lng.length; i++) {
    if (sauts.has(i)) {
      courant = null;
      continue;
    }
    const couleur = couleurDe(i);
    if (!courant || courant.properties.couleur !== couleur) {
      courant = { type: 'Feature', properties: { couleur }, geometry: { type: 'LineString', coordinates: [[lng[i - 1], lat[i - 1]]] } };
      features.push(courant);
    }
    courant.geometry.coordinates.push([lng[i], lat[i]]);
  }
  return features;
}
