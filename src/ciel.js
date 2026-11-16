// Ciel autour du globe (demande du propriétaire du 12 novembre 2026) : étoiles visibles à l'œil nu à leur vraie
// place et Lune avec sa phase, sur une toile posée derrière la carte (le globe les cache quand elles passent
// derrière lui). Seulement au dézoom, avec le globe jour et nuit. Base des constellations à venir.
// Voie lactée (15 novembre 2026, demande du propriétaire) : ciel sans pollution lumineuse, un peu exagéré,
// générée dans un travailleur à la première ouverture du ciel (`voie-lactee-calcul.js`).
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';
import { couleurEtoile, directionEtoile, eclatEtoile, lireCatalogue, opaciteCiel, projeterDirection, tempsSideral } from './ciel-calcul.js';
import { matriceCiel, peindreVoieLactee, projeterGalactique } from './voie-lactee-calcul.js';
import { GALAXIES, poseGalaxie } from './galaxies-calcul.js';

const CATALOGUE = '/data/ciel/etoiles.json';
const ZOOM_MAX = 6;
const RAYON_LUNE = 16; // px : la Lune réelle (0,5°) n'aurait que quelques pixels à cette échelle
const PIXELS_VRAIE_LUNE = 96;
// Mosaïque de la Lune (NASA, Moon Trek), plate carrée au niveau 0 : 2 tuiles de 256 px
const IMAGES_LUNE = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0';
async function chargerImageLune() {
  const toile = document.createElement('canvas');
  toile.width = 512;
  toile.height = 256;
  const contexte = toile.getContext('2d', { willReadFrequently: true });
  await Promise.all([0, 1].map(async (colonne) => {
    const reponse = await fetch(`${IMAGES_LUNE}/${colonne}.jpg`);
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    const image = await createImageBitmap(await reponse.blob());
    contexte.drawImage(image, colonne * 256, 0);
    image.close?.();
  }));
  return { image: contexte.getImageData(0, 0, 512, 256).data, largeur: 512, hauteur: 256 };
}
const VOIE_LACTEE = { largeur: 2048, hauteur: 1024, nombre: 25000 };
const PIXELS_VOIE_LACTEE = 90000; // taille du dessin, agrandi ensuite : la Voie lactée est diffuse
const AZIMUT = (azimuth) => ((azimuth % 360) + 360) % 360; // suncalc 2 : degrés depuis le nord

// Soleil du mode espace (demande du propriétaire du 16 novembre 2026 : plus qu'un rond jaune) : disque blanc
// assombri vers le bord, couronne, halo large et aigrettes de diffraction, comme sur une photo prise de l'espace.
// Commun au ciel de la Terre et à celui de la Lune (lune-visite.js).
export function dessinerSoleilEspace(contexte, x, y, rayon = 9) {
  const tache = (r, arrets) => {
    const degrade = contexte.createRadialGradient(x, y, 0, x, y, r);
    arrets.forEach(([position, couleur]) => degrade.addColorStop(position, couleur));
    contexte.fillStyle = degrade;
    contexte.beginPath();
    contexte.arc(x, y, r, 0, Math.PI * 2);
    contexte.fill();
  };
  // Halo large, puis couronne
  tache(rayon * 9, [[0, 'rgba(255, 236, 200, 0.32)'], [0.25, 'rgba(255, 214, 160, 0.12)'], [1, 'rgba(255, 190, 120, 0)']]);
  tache(rayon * 2.6, [[0, 'rgba(255, 252, 240, 0.95)'], [0.45, 'rgba(255, 238, 200, 0.55)'], [1, 'rgba(255, 220, 160, 0)']]);
  // Aigrettes : quatre longues, quatre courtes en diagonale, qui s'effacent vers leur pointe
  const aigrette = (angle, longueur, largeur, opacite) => {
    contexte.save();
    contexte.translate(x, y);
    contexte.rotate(angle);
    const degrade = contexte.createLinearGradient(0, 0, longueur, 0);
    degrade.addColorStop(0, `rgba(255, 248, 230, ${opacite})`);
    degrade.addColorStop(1, 'rgba(255, 236, 200, 0)');
    contexte.fillStyle = degrade;
    contexte.beginPath();
    contexte.moveTo(0, -largeur);
    contexte.lineTo(longueur, 0);
    contexte.lineTo(0, largeur);
    contexte.closePath();
    contexte.fill();
    contexte.restore();
  };
  for (let i = 0; i < 4; i++) {
    aigrette((i * Math.PI) / 2 + 0.26, rayon * 7, rayon * 0.16, 0.75);
    aigrette((i * Math.PI) / 2 + 0.26 + Math.PI / 4, rayon * 3.6, rayon * 0.1, 0.45);
  }
  // Disque : blanc au centre, légèrement doré et plus sombre au bord (assombrissement centre-bord)
  tache(rayon, [[0, 'rgb(255, 255, 252)'], [0.7, 'rgb(255, 248, 228)'], [0.92, 'rgb(255, 228, 176)'], [1, 'rgba(255, 214, 150, 0.9)']]);
}

let chargement = null;
const chargerEtoiles = () => {
  chargement ??= fetch(CATALOGUE)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .then(lireCatalogue)
    .catch((erreur) => {
      chargement = null; // un échec (hors ligne) sera retenté au prochain dézoom
      console.warn('Ciel : étoiles indisponibles', erreur);
      return [];
    });
  return chargement;
};

let voieLactee = null;
const genererVoieLactee = () => {
  voieLactee ??= new Promise((resolve) => {
    try {
      const travailleur = new Worker(new URL('./voie-lactee-travail.js', import.meta.url), { type: 'module' });
      travailleur.onmessage = ({ data }) => {
        resolve(data);
        travailleur.terminate();
      };
      travailleur.onerror = (erreur) => {
        console.warn('Ciel : Voie lactée indisponible', erreur);
        resolve(null);
        travailleur.terminate();
      };
      travailleur.postMessage(VOIE_LACTEE);
    } catch (erreur) {
      console.warn('Ciel : Voie lactée indisponible', erreur);
      resolve(null);
    }
  });
  return voieLactee;
};

// `astres` : dessin propre des astres à la place du soleil et de la Lune (la visite de la Lune y pose la Terre),
// appelé avec { contexte, centre, maintenant, projeter(direction) }
// `instant` : moment du ciel (celui de Soleil et Lune quand on y règle l'heure), sinon maintenant
export function initCiel(map, { astres = null, instant = null } = {}) {
  const toile = document.createElement('canvas');
  toile.className = 'ciel-etoiles';
  toile.setAttribute('aria-hidden', 'true');
  map.getContainer().insertBefore(toile, map.getCanvasContainer());
  const contexte = toile.getContext('2d');
  let etoiles = [];
  let galaxie = null;
  let prevu = false;
  const tampon = document.createElement('canvas');
  const contexteTampon = tampon.getContext('2d');
  let image = null;

  // Voie lactée dessinée en basse définition, puis agrandie (lissée) sur toute la toile ; ensuite son grain d'étoiles
  function dessinerVoieLactee(cam, centre, ts, l, h) {
    const ciel = matriceCiel(cam, centre.lat, centre.lng, ts);
    const pas = Math.max(2, Math.sqrt((l * h) / PIXELS_VOIE_LACTEE));
    const tl = Math.ceil(l / pas);
    const th = Math.ceil(h / pas);
    if (tampon.width !== tl || tampon.height !== th || !image) {
      tampon.width = tl;
      tampon.height = th;
      image = contexteTampon.createImageData(tl, th);
    }
    peindreVoieLactee(image.data, tl, th, pas, ciel, galaxie.texture, galaxie.largeur, galaxie.hauteur);
    contexteTampon.putImageData(image, 0, 0);
    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = 'high';
    contexte.drawImage(tampon, 0, 0, tl * pas, th * pas);
    const semis = galaxie.etoiles;
    let niveau = -1;
    for (let k = 0; k < semis.length; k += 4) {
      const point = projeterGalactique(semis[k], semis[k + 1], semis[k + 2], ciel);
      if (!point || point.x < 0 || point.y < 0 || point.x > l || point.y > h) continue;
      const eclat = Math.round(semis[k + 3] * 8);
      if (eclat !== niveau) {
        niveau = eclat;
        contexte.fillStyle = `rgba(236, 232, 238, ${(0.2 + 0.6 * (eclat / 8)).toFixed(2)})`;
      }
      const taille = 0.7 + 0.6 * (eclat / 8);
      contexte.fillRect(point.x - taille / 2, point.y - taille / 2, taille, taille);
    }
  }

  function camera() {
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    return { bearing: map.getBearing(), pitch: map.getPitch(), fov: map.getVerticalFieldOfView(), largeur, hauteurEcran, padding: map.getPadding() };
  }

  // Soleil à sa vraie direction : disque blanc chaud et halo (agrandi comme la Lune)
  // Galaxies voisines : leur image posée à leur place, dans leur angle sur le ciel
  function dessinerGalaxies(cam, centre, ts, l, h, ratio, alpha) {
    const DELTA = 0.5;
    const ecran = (ra, dec) => projeterDirection(directionEtoile(ra, dec, centre.lat, centre.lng, ts), cam);
    for (const { modele, image } of galaxie.images) {
      const point = ecran(modele.ra, modele.dec);
      if (!point) continue;
      const nord = ecran(modele.ra, modele.dec + DELTA);
      const est = ecran(modele.ra + DELTA / Math.cos((modele.dec * Math.PI) / 180), modele.dec);
      if (!nord || !est) continue;
      const rayon = Math.hypot(nord.x - point.x, nord.y - point.y) / DELTA * modele.grand;
      const etirement = Math.hypot(est.x - point.x, est.y - point.y) / DELTA * modele.grand;
      // Presque à angle droit de la visée, la perspective l'agrandit sans limite : elle couvrait tout le ciel
      if (Math.max(rayon, etirement) > Math.max(l, h)) continue;
      if (point.x < -rayon || point.y < -rayon || point.x > l + rayon || point.y > h + rayon) continue;
      const [a, b, c, d, e, f] = poseGalaxie(modele, point, nord, est, DELTA);
      contexte.setTransform(ratio * a, ratio * b, ratio * c, ratio * d, ratio * e, ratio * f);
      contexte.globalAlpha = alpha * modele.eclat;
      contexte.drawImage(image, 0, 0);
    }
    contexte.setTransform(ratio, 0, 0, ratio, 0, 0);
    contexte.globalAlpha = alpha;
  }

  let pointSoleil = null;
  function dessinerSoleil(cam, { lng, lat }, maintenant) {
    const soleil = getPosition(maintenant, lat, lng);
    const point = projeterDirection({ azimut: AZIMUT(soleil.azimuth), hauteur: soleil.altitude }, cam);
    pointSoleil = point && { x: point.x, y: point.y, rayon: 11 };
    if (!point) return;
    dessinerSoleilEspace(contexte, point.x, point.y);
  }

  // La vraie Lune (lune-vue-calcul.js) : images de la NASA chargées à la première apparition du ciel, repeinte
  // quand la phase a pu changer (toutes les 10 minutes d'écart) ; en attendant, ou hors ligne, la Lune dessinée
  let vraieLune = null; // { image, instant }
  let moduleLune = null;
  let calculLune = null; // lune-vue-calcul.js, une fois chargé
  const chargerVraieLune = () => {
    moduleLune ??= Promise.all([import('./lune-vue-calcul.js'), chargerImageLune()])
      .then(([m, texture]) => {
        calculLune = m;
        return { m, texture };
      })
      .catch((erreur) => {
        moduleLune = null; // nouvel essai au prochain dézoom
        console.warn('Ciel : images de la Lune indisponibles', erreur);
        return null;
      });
    return moduleLune;
  };
  function imageVraieLune(maintenant) {
    if (vraieLune && Math.abs(vraieLune.instant - maintenant.getTime()) < 10 * 60000) return vraieLune.image;
    chargerVraieLune().then((charge) => {
      if (!charge || (vraieLune && Math.abs(vraieLune.instant - maintenant.getTime()) < 10 * 60000)) return;
      const taille = PIXELS_VRAIE_LUNE;
      const image = vraieLune?.image ?? document.createElement('canvas');
      image.width = taille;
      image.height = taille;
      const pixels = charge.m.peindreLune({ ...charge.texture, date: maintenant, taille });
      image.getContext('2d').putImageData(new ImageData(pixels, taille, taille), 0, 0);
      vraieLune = { image, instant: maintenant.getTime() };
      planifier();
    });
    return vraieLune?.image ?? null;
  }

  // Position de la Lune à l'écran, pour qu'un appui la touche (lune-bulle.js)
  let pointLune = null;
  function dessinerLune(cam, { lng, lat }, maintenant, ts) {
    const lune = getMoonPosition(maintenant, lat, lng);
    const point = projeterDirection({ azimut: AZIMUT(lune.azimuth), hauteur: lune.altitude }, cam);
    pointLune = point && { x: point.x, y: point.y, rayon: RAYON_LUNE };
    if (!point) return;
    const image = imageVraieLune(maintenant);
    if (image && calculLune) {
      // Tournée comme dans le ciel : son nord vers le nord céleste à cet endroit de l'écran
      const { ra, dec } = calculLune.coordonneesLune(maintenant);
      const nord = projeterDirection(directionEtoile(ra, dec + 0.5, lat, lng, ts), cam);
      const angle = nord ? Math.atan2(nord.x - point.x, -(nord.y - point.y)) : 0;
      const halo = contexte.createRadialGradient(point.x, point.y, RAYON_LUNE * 0.95, point.x, point.y, RAYON_LUNE * 1.7);
      halo.addColorStop(0, 'rgba(235, 240, 255, 0.28)');
      halo.addColorStop(1, 'rgba(235, 240, 255, 0)');
      contexte.fillStyle = halo;
      contexte.beginPath();
      contexte.arc(point.x, point.y, RAYON_LUNE * 1.7, 0, Math.PI * 2);
      contexte.fill();
      contexte.save();
      contexte.translate(point.x, point.y);
      contexte.rotate(angle);
      contexte.drawImage(image, -RAYON_LUNE, -RAYON_LUNE, 2 * RAYON_LUNE, 2 * RAYON_LUNE);
      contexte.restore();
      return;
    }
    const soleil = getPosition(maintenant, lat, lng);
    const versSoleil = projeterDirection({ azimut: AZIMUT(soleil.azimuth), hauteur: soleil.altitude }, cam);
    // Côté éclairé tourné vers le soleil ; derrière la caméra, on garde sa direction approximative
    const angle = versSoleil ? Math.atan2(versSoleil.y - point.y, versSoleil.x - point.x) : 0;
    const { fraction } = getMoonIllumination(maintenant);
    const r = RAYON_LUNE;
    contexte.save();
    contexte.translate(point.x, point.y);
    contexte.rotate(angle);
    contexte.shadowColor = 'rgba(235, 240, 255, 0.55)';
    contexte.shadowBlur = 14 * fraction + 3;
    contexte.fillStyle = 'rgb(46, 50, 62)'; // face sombre, à peine visible (lumière cendrée)
    contexte.beginPath();
    contexte.arc(0, 0, r, 0, Math.PI * 2);
    contexte.fill();
    contexte.shadowBlur = 0;
    // Moitié tournée vers le soleil, puis l'ellipse du terminateur qui l'agrandit ou la réduit
    const claire = 'rgb(236, 238, 244)';
    contexte.fillStyle = claire;
    contexte.beginPath();
    contexte.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    contexte.fill();
    contexte.fillStyle = fraction > 0.5 ? claire : 'rgb(46, 50, 62)';
    contexte.beginPath();
    contexte.ellipse(0, 0, r * Math.abs(1 - 2 * fraction), r, 0, -Math.PI / 2, Math.PI / 2, fraction > 0.5);
    contexte.fill();
    contexte.restore();
  }

  let retiree = false;
  function dessiner() {
    prevu = false;
    if (retiree) return;
    const zoom = map.getZoom();
    const opacite = opaciteCiel(zoom);
    const { clientWidth: l, clientHeight: h } = map.getContainer();
    const ratio = window.devicePixelRatio || 1;
    if (toile.width !== Math.round(l * ratio) || toile.height !== Math.round(h * ratio)) {
      toile.width = Math.round(l * ratio);
      toile.height = Math.round(h * ratio);
    }
    contexte.setTransform(ratio, 0, 0, ratio, 0, 0);
    contexte.clearRect(0, 0, l, h);
    toile.hidden = opacite <= 0;
    pointLune = null;
    pointSoleil = null;
    if (opacite <= 0) return;
    if (!etoiles.length) {
      chargerEtoiles().then((liste) => {
        if (liste.length && !etoiles.length) {
          etoiles = liste;
          planifier();
        }
      });
    }
    if (!galaxie) {
      genererVoieLactee().then((donnees) => {
        if (donnees && !galaxie) {
          galaxie = donnees;
          galaxie.debut = performance.now();
          toile.dataset.voieLactee = 'prete'; // attendu par les captures
          galaxie.images = donnees.galaxies.map(({ id, pixels }) => {
            const modele = GALAXIES.find((g) => g.id === id);
            const image = document.createElement('canvas');
            image.width = modele.taille;
            image.height = modele.taille;
            image.getContext('2d').putImageData(new ImageData(pixels, modele.taille, modele.taille), 0, 0);
            return { modele, image };
          });
          planifier();
        }
      });
    }
    const cam = camera();
    const centre = map.getCenter();
    const maintenant = new Date(instant?.() ?? Date.now());
    const ts = tempsSideral(maintenant);
    contexte.globalAlpha = opacite;
    if (galaxie) {
      // Fondu d'apparition, une fois la carte prête
      const fondu = Math.min(1, (performance.now() - galaxie.debut) / 1200);
      contexte.globalAlpha = opacite * fondu;
      dessinerVoieLactee(cam, centre, ts, l, h);
      dessinerGalaxies(cam, centre, ts, l, h, ratio, opacite * fondu);
      contexte.globalAlpha = opacite;
      if (fondu < 1) requestAnimationFrame(planifier);
    }
    for (const etoile of etoiles) {
      const point = projeterDirection(directionEtoile(etoile.ra, etoile.dec, centre.lat, centre.lng, ts), cam);
      if (!point || point.x < -4 || point.y < -4 || point.x > l + 4 || point.y > h + 4) continue;
      const { rayon, opacite: eclat } = eclatEtoile(etoile.mag);
      const [r, v, b] = couleurEtoile(etoile.bv);
      contexte.fillStyle = `rgba(${r}, ${v}, ${b}, ${eclat})`;
      contexte.beginPath();
      contexte.arc(point.x, point.y, rayon, 0, Math.PI * 2);
      contexte.fill();
    }
    if (astres) {
      astres({ contexte, centre, maintenant, projeter: (direction) => projeterDirection(direction, cam) });
    } else {
      dessinerSoleil(cam, centre, maintenant);
      dessinerLune(cam, centre, maintenant, ts);
    }
    contexte.globalAlpha = 1;
  }

  function planifier() {
    if (prevu) return;
    prevu = true;
    requestAnimationFrame(dessiner);
  }

  map.on('move', () => {
    if (map.getZoom() < ZOOM_MAX || !toile.hidden) planifier();
  });
  map.on('resize', planifier);
  const minute = setInterval(() => {
    if (map.getZoom() < ZOOM_MAX) planifier(); // le ciel tourne lentement : une fois par minute
  }, 60000);
  // Carte de la Lune, retirée en quittant : plus rien à dessiner
  map.on('remove', () => {
    clearInterval(minute);
    retiree = true;
  });
  planifier();
  return {
    // Lune visible à l'écran : { x, y, rayon } en px CSS, sinon null
    pointLune: () => (toile.hidden ? null : pointLune),
    pointSoleil: () => (toile.hidden ? null : pointSoleil),
    redessiner: planifier,
  };
}
