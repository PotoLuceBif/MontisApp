// Ciel autour du globe (demande du propriétaire du 12 novembre 2026) : étoiles visibles à l'œil nu à leur vraie
// place et Lune avec sa phase, sur une toile posée derrière la carte (le globe les cache quand elles passent
// derrière lui). Seulement au dézoom, avec le globe jour et nuit. Base des constellations à venir.
// Voie lactée (15 novembre 2026, demande du propriétaire) : ciel sans pollution lumineuse, un peu exagéré,
// générée dans un travailleur à la première ouverture du ciel (`voie-lactee-calcul.js`).
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';
import { couleurEtoile, directionEtoile, eclatEtoile, lireCatalogue, opaciteCiel, projeterDirection, tempsSideral } from './ciel-calcul.js';
import { matriceCiel, peindreVoieLactee, projeterGalactique } from './voie-lactee-calcul.js';

const CATALOGUE = '/data/ciel/etoiles.json';
const ZOOM_MAX = 6;
const RAYON_LUNE = 10; // px : la Lune réelle (0,5°) n'aurait que quelques pixels à cette échelle
const VOIE_LACTEE = { largeur: 2048, hauteur: 1024, nombre: 45000 };
const PIXELS_VOIE_LACTEE = 110000; // taille du dessin, agrandi ensuite : la Voie lactée est diffuse
const AZIMUT = (azimuth) => ((azimuth % 360) + 360) % 360; // suncalc 2 : degrés depuis le nord

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

export function initCiel(map) {
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
        contexte.fillStyle = `rgba(232, 236, 255, ${(0.25 + 0.75 * (eclat / 8)).toFixed(2)})`;
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
  function dessinerSoleil(cam, { lng, lat }, maintenant) {
    const soleil = getPosition(maintenant, lat, lng);
    const point = projeterDirection({ azimut: AZIMUT(soleil.azimuth), hauteur: soleil.altitude }, cam);
    if (!point) return;
    const halo = contexte.createRadialGradient(point.x, point.y, 0, point.x, point.y, 60);
    halo.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
    halo.addColorStop(0.2, 'rgba(255, 220, 150, 0.35)');
    halo.addColorStop(1, 'rgba(255, 200, 120, 0)');
    contexte.fillStyle = halo;
    contexte.beginPath();
    contexte.arc(point.x, point.y, 60, 0, Math.PI * 2);
    contexte.fill();
    contexte.fillStyle = 'rgb(255, 250, 235)';
    contexte.beginPath();
    contexte.arc(point.x, point.y, 11, 0, Math.PI * 2);
    contexte.fill();
  }

  function dessinerLune(cam, { lng, lat }, maintenant) {
    const lune = getMoonPosition(maintenant, lat, lng);
    const point = projeterDirection({ azimut: AZIMUT(lune.azimuth), hauteur: lune.altitude }, cam);
    if (!point) return;
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

  function dessiner() {
    prevu = false;
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
          planifier();
        }
      });
    }
    const cam = camera();
    const centre = map.getCenter();
    const maintenant = new Date();
    const ts = tempsSideral(maintenant);
    contexte.globalAlpha = opacite;
    if (galaxie) {
      // Fondu d'apparition, une fois la carte prête
      const fondu = Math.min(1, (performance.now() - galaxie.debut) / 1200);
      contexte.globalAlpha = opacite * fondu;
      dessinerVoieLactee(cam, centre, ts, l, h);
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
    dessinerSoleil(cam, centre, maintenant);
    dessinerLune(cam, centre, maintenant);
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
  setInterval(() => {
    if (map.getZoom() < ZOOM_MAX) planifier(); // le ciel tourne lentement : une fois par minute
  }, 60000);
  planifier();
}
