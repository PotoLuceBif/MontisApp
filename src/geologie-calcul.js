// Calculs purs de la carte géologique : blanc rendu transparent, couverture d'un point, lecture du BRGM.

export const SEUIL_BLANC = 240; // au-dessus sur les trois canaux : papier ou hors couverture
export const COTE_MASQUE = 32; // couverture d'une tuile, mémorisée en 32 × 32 cases

// Rend transparents les pixels blancs (RGBA modifiés sur place) : hors de France, la tuile est blanche,
// et le blanc voilerait le fond voisin. Renvoie le masque de couverture (1 = carte présente).
export function blancTransparent(pixels, cote = 256) {
  const masque = new Uint8Array(COTE_MASQUE * COTE_MASQUE);
  const pas = cote / COTE_MASQUE;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] >= SEUIL_BLANC && pixels[i + 1] >= SEUIL_BLANC && pixels[i + 2] >= SEUIL_BLANC) {
      pixels[i + 3] = 0;
    } else if (pixels[i + 3] > 0) {
      const p = i / 4;
      masque[Math.floor(Math.floor(p / cote) / pas) * COTE_MASQUE + Math.floor((p % cote) / pas)] = 1;
    }
  }
  return masque;
}

// Tuile (Web Mercator) et position dans la tuile (0 à 1) d'un point
export function tuileDuPoint(lng, lat, z) {
  const n = 2 ** z;
  const latBornee = Math.max(-85.0511, Math.min(85.0511, lat));
  const fx = ((lng + 180) / 360) * n;
  const rad = (latBornee * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(fy)));
  return { z, x, y, u: fx - x, v: fy - y };
}

// Le point est-il couvert par la carte ? null si la tuile n'est pas encore connue
export function pointCouvert(masques, lng, lat, z) {
  const { x, y, u, v } = tuileDuPoint(lng, lat, z);
  const masque = masques.get(`${z}/${x}/${y}`);
  if (!masque) return null;
  const col = Math.min(COTE_MASQUE - 1, Math.floor(u * COTE_MASQUE));
  const lig = Math.min(COTE_MASQUE - 1, Math.floor(v * COTE_MASQUE));
  // Une case voisine suffit : au bord d'une feuille, le blanc du papier n'est pas « hors de France »
  for (let dl = -1; dl <= 1; dl += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const l = lig + dl;
      const c = col + dc;
      if (l >= 0 && c >= 0 && l < COTE_MASQUE && c < COTE_MASQUE && masque[l * COTE_MASQUE + c]) return true;
    }
  }
  return false;
}

// Réponse texte d'un GetFeatureInfo (MapServer) : une liste d'objets { attribut: valeur } par couche
export function lireInfoBrgm(texte) {
  const couches = {};
  let couche = null;
  let objet = null;
  for (const ligne of String(texte).split(/\r?\n/)) {
    const nomCouche = ligne.match(/^Layer '([^']+)'/);
    if (nomCouche) {
      couche = couches[nomCouche[1]] = [];
      objet = null;
      continue;
    }
    if (!couche) continue;
    if (/^\s*Feature \d+:/.test(ligne)) {
      objet = {};
      couche.push(objet);
      continue;
    }
    const attribut = ligne.match(/^\s+(\w+) = '(.*)'\s*$/);
    if (attribut && objet) objet[attribut[1]] = attribut[2];
  }
  return couches;
}

// Adresse d'un GetFeatureInfo au point, avec une emprise assez large pour rester dans l'échelle des couches
export function adresseInfoBrgm(base, couches, lng, lat, demiCote = 0.02) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: couches.join(','),
    QUERY_LAYERS: couches.join(','),
    STYLES: '',
    CRS: 'EPSG:4326',
    // WMS 1.3.0 en EPSG:4326 : latitude d'abord
    BBOX: [lat - demiCote, lng - demiCote, lat + demiCote, lng + demiCote].map((v) => v.toFixed(6)).join(','),
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'text/plain',
    FEATURE_COUNT: '1',
  });
  return `${base}?${params}`;
}
