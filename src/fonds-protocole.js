// Tuiles d'une carte nationale découpées à la frontière de son pays (protocole montis-fond://<id>/z/x/y).
// Hors du pays, la tuile reste vide et n'est même pas demandée : le fond Montis complet prend le relais,
// sans que les deux cartes se recouvrent (beaucoup de cartes nationales débordent sur leurs voisins).
import { addProtocol } from 'maplibre-gl';
import { FONDS, zoneDe } from './fonds-catalogue.js';
import { anneauEnPixels, empriseMetres, geometrieZone, relationTuile } from './fonds-calcul.js';

export const PROTOCOLE_FOND = 'montis-fond';
// PNG transparent d'un pixel
const VIDE = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
const vide = () => ({ data: VIDE.slice().buffer });

// Contours des pays : chargés à la demande (première tuile nationale, ou panneau Fond ouvert)
let zones = null;
let chargement = null;
export const zonesChargees = () => zones;
export function chargerZones() {
  chargement ??= import('./fonds-zones.js').then((m) => {
    zones = m.ZONES_PAYS;
    return zones;
  });
  return chargement;
}

function toile(cote) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(cote, cote);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cote;
  return canvas;
}

let ajoute = false;
export function ajouterProtocoleFonds() {
  if (ajoute) return;
  ajoute = true;
  addProtocol(PROTOCOLE_FOND, async ({ url }, controleur) => {
    const [, id, ...zxy] = url.match(/^[\w-]+:\/\/([\w-]+)\/(\d+)\/(\d+)\/(\d+)/);
    const [z, x, y] = zxy.map(Number);
    const fond = FONDS.find((f) => f.id === id);
    const multi = geometrieZone(zoneDe(fond), await chargerZones());
    const relation = multi ? relationTuile(multi, z, x, y) : 'dedans';
    if (relation === 'dehors') return vide();

    const adresse = fond.source.tiles[0]
      .replace('{z}', z).replace('{x}', x).replace('{y}', y)
      .replace('{bbox-epsg-3857}', empriseMetres(z, x, y));
    const reponse = await fetch(adresse, { signal: controleur.signal });
    // Certains serveurs répondent 404 là où ils n'ont rien : une tuile vide, pas une panne
    if (reponse.status === 404) return vide();
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    if (relation === 'dedans') return { data: await reponse.arrayBuffer() };

    // Tuile à cheval sur la frontière : on ne garde que ce qui est dans le pays
    const image = await createImageBitmap(await reponse.blob());
    const cote = image.width;
    const surface = toile(cote);
    const contexte = surface.getContext('2d');
    contexte.beginPath();
    for (const [anneau] of multi) {
      anneauEnPixels(anneau, z, x, y, cote).forEach(([px, py], i) => (i ? contexte.lineTo(px, py) : contexte.moveTo(px, py)));
      contexte.closePath();
    }
    contexte.clip();
    contexte.drawImage(image, 0, 0);
    image.close?.();
    return { data: await createImageBitmap(surface) };
  });
}
