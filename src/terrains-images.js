// Images des terrains FFVL dans le style de la carte : pins, pin de groupe et anneaux d'orientation.
// Les anneaux se dessinent à la demande, un par combinaison de secteurs (`codeAnneau`).
const ECHELLE = 4; // pixels d'image par pixel d'écran : net sur les écrans très denses
const PINS = ['terrain-decollage', 'terrain-atterrissage', 'terrain-pente-ecole', 'terrain-ferme'];
export const IMAGE_GROUPE = 'terrain-groupe';
export const IMAGE_AUTORISATION = 'terrain-autorisation';
const PREFIXE_ANNEAU = 'terrain-anneau-';
// Rayon intérieur et extérieur, en pixels d'écran : juste autour de la tête du pin (11,5 px avec son liseré)
const RAYON_INTERIEUR = 13.5;
const RAYON_EXTERIEUR = 17.5;
const COULEURS = { o: '#35d07f', n: '#ff4f5e', '-': 'rgba(176, 186, 206, 0.55)' };
// Pastille ronde des groupes, comme celle des stations et des randos (groupe-pastille.js, 24 novembre 2026)
const SVG_GROUPE = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="rgba(77,235,212,0.16)"/><circle cx="20" cy="20" r="16" fill="rgba(11,17,27,0.92)" stroke="#4debd4" stroke-width="2"/></svg>`;

export const nomAnneau = (code) => `${PREFIXE_ANNEAU}${code}`;

function versImage(image, largeur, hauteur) {
  const toile = document.createElement('canvas');
  toile.width = largeur * ECHELLE;
  toile.height = hauteur * ECHELLE;
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  return toile.getContext('2d').getImageData(0, 0, toile.width, toile.height);
}

async function charger(src, largeur, hauteur) {
  const image = new Image(largeur, hauteur);
  image.src = src;
  await image.decode();
  return versImage(image, largeur, hauteur);
}

let chargement = null;
// Toutes les images fixes, lues une fois pour toutes
export function chargerImagesTerrains() {
  if (!chargement) {
    const fichiers = PINS.flatMap((nom) => [[nom, `/pins/${nom}.svg`], [`${nom}-selected`, `/pins/${nom}-selected.svg`]]);
    chargement = Promise.all([
      ...fichiers.map(([nom, src]) => charger(src, 48, 48).then((donnees) => [nom, donnees])),
      charger(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG_GROUPE)}`, 40, 40).then((donnees) => [IMAGE_GROUPE, donnees]),
    ]).then((paires) => new Map(paires)).catch((erreur) => {
      chargement = null;
      throw erreur;
    });
  }
  return chargement;
}

// L'anneau est une image debout, ancrée comme le pin (en bas, même décalage) : il en suit la taille et la place
// quelle que soit l'inclinaison. Son centre est celui de la tête : 17 px au-dessus de la pointe, elle-même à
// 4,25 px du bas. Il ne tourne donc pas avec la carte : on le redessine tourné du cap (`orienterAnneaux`).
const LARGEUR_ANNEAU = Math.ceil(RAYON_EXTERIEUR * 2 + 2);
const HAUTEUR_ANNEAU = 40;
const CENTRE_ANNEAU_Y = HAUTEUR_ANNEAU - 4.25 - 17;
let capAnneaux = 0; // cap de la carte, en degrés, pour lequel les anneaux sont dessinés
const anneauxPoses = new Set();

// Huit secteurs depuis le nord, séparés d'un fin jour, cernés de sombre pour se lire sur un fond clair
function dessinerAnneau(code) {
  const toile = document.createElement('canvas');
  toile.width = LARGEUR_ANNEAU * ECHELLE;
  toile.height = HAUTEUR_ANNEAU * ECHELLE;
  const ctx = toile.getContext('2d');
  ctx.scale(ECHELLE, ECHELLE);
  const cx = LARGEUR_ANNEAU / 2;
  const ecart = (3 * Math.PI) / 180;
  [...code].forEach((etat, index) => {
    const debut = ((index * 45 - 22.5 - 90 - capAnneaux) * Math.PI) / 180 + ecart;
    const fin = ((index * 45 + 22.5 - 90 - capAnneaux) * Math.PI) / 180 - ecart;
    ctx.beginPath();
    ctx.arc(cx, CENTRE_ANNEAU_Y, RAYON_EXTERIEUR, debut, fin);
    ctx.arc(cx, CENTRE_ANNEAU_Y, RAYON_INTERIEUR, fin, debut, true);
    ctx.closePath();
    ctx.fillStyle = COULEURS[etat] ?? COULEURS['-'];
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(8, 13, 22, 0.75)';
    ctx.stroke();
  });
  return ctx.getImageData(0, 0, toile.width, toile.height);
}

// Pastille « ! » des terrains sur autorisation, à poser sur la tête du pin
function dessinerAutorisation() {
  const taille = 16;
  const toile = document.createElement('canvas');
  toile.width = taille * ECHELLE;
  toile.height = taille * ECHELLE;
  const ctx = toile.getContext('2d');
  ctx.scale(ECHELLE, ECHELLE);
  ctx.beginPath();
  ctx.arc(8, 8, 6.6, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#0a1020';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(7.1, 3.9, 1.8, 5.2);
  ctx.beginPath();
  ctx.arc(8, 11.3, 1.05, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, toile.width, toile.height);
}

// Ajoute ce qui manque au style (un changement de fond l'a vidé)
export function poserImagesTerrains(map, images) {
  images.forEach((donnees, nom) => {
    if (!map.hasImage(nom)) map.addImage(nom, donnees, { pixelRatio: ECHELLE });
  });
}

// Pour `setMissingStyleImageResolver` : dessine l'anneau demandé, ou repose un pin perdu
export function fournirImageTerrain(map, nom, images) {
  if (map.hasImage(nom)) return;
  if (nom === IMAGE_AUTORISATION) {
    map.addImage(nom, dessinerAutorisation(), { pixelRatio: ECHELLE });
  } else if (nom.startsWith(PREFIXE_ANNEAU)) {
    orienterAnneaux(map); // les anneaux déjà posés et le nouveau, au même cap
    map.addImage(nom, dessinerAnneau(nom.slice(PREFIXE_ANNEAU.length)), { pixelRatio: ECHELLE });
    anneauxPoses.add(nom);
  } else if (images?.has(nom)) {
    map.addImage(nom, images.get(nom), { pixelRatio: ECHELLE });
  }
}

// La carte a tourné : anneaux redessinés au nouveau cap, par pas de 2° (`updateImage` ne refait pas la mise en page)
export function orienterAnneaux(map) {
  const cap = Math.round(map.getBearing() / 2) * 2;
  if (cap === capAnneaux) return;
  capAnneaux = cap;
  for (const nom of anneauxPoses) {
    if (map.hasImage(nom)) map.updateImage(nom, dessinerAnneau(nom.slice(PREFIXE_ANNEAU.length)));
    else anneauxPoses.delete(nom);
  }
}
