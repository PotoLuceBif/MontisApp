// Ciel autour du globe (demande du propriétaire du 12 novembre 2026) : étoiles visibles à l'œil nu à leur vraie
// place et Lune avec sa phase, sur une toile posée derrière la carte (le globe les cache quand elles passent
// derrière lui). Seulement au dézoom, avec le globe jour et nuit. Base des constellations à venir.
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';
import { couleurEtoile, directionEtoile, eclatEtoile, lireCatalogue, lireVoieLactee, opaciteCiel, opaciteVoieLactee, projeterDirection, tempsSideral } from './ciel-calcul.js';

const CATALOGUE = '/data/ciel/etoiles.json';
const VOIE_LACTEE = '/data/ciel/voie-lactee.json';
const PAS_VOIE_LACTEE = 1.5; // ° entre deux points de la grille
const REDUCTION = 4; // la Voie lactée se dessine en quart de résolution puis s'agrandit : un flou doux et léger
const ZOOM_MAX = 6;
const RAYON_LUNE = 10; // px : la Lune réelle (0,5°) n'aurait que quelques pixels à cette échelle
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

let chargementVoieLactee = null;
const chargerVoieLactee = () => {
  chargementVoieLactee ??= fetch(VOIE_LACTEE)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .then(lireVoieLactee)
    .catch((erreur) => {
      chargementVoieLactee = null;
      console.warn('Ciel : Voie lactée indisponible', erreur);
      return [];
    });
  return chargementVoieLactee;
};

export function initCiel(map) {
  const toile = document.createElement('canvas');
  toile.className = 'ciel-etoiles';
  toile.setAttribute('aria-hidden', 'true');
  map.getContainer().insertBefore(toile, map.getCanvasContainer());
  const contexte = toile.getContext('2d');
  let etoiles = [];
  let voieLactee = [];
  let prevu = false;
  const brume = document.createElement('canvas');
  const contexteBrume = brume.getContext('2d');

  // Taches floues, du halo au cœur, sous les étoiles
  function dessinerVoieLactee(cam, centre, ts, l, h) {
    const largeur = Math.ceil(l / REDUCTION);
    const hauteur = Math.ceil(h / REDUCTION);
    if (brume.width !== largeur || brume.height !== hauteur) {
      brume.width = largeur;
      brume.height = hauteur;
    }
    contexteBrume.clearRect(0, 0, largeur, hauteur);
    // Taches à bord dégradé, deux fois plus larges que la grille : elles se fondent sans laisser voir de rond
    const rayon = (2 * PAS_VOIE_LACTEE * (h / cam.fov)) / REDUCTION;
    for (const { ra, dec, niveau } of voieLactee) {
      const point = projeterDirection(directionEtoile(ra, dec, centre.lat, centre.lng, ts), cam);
      if (!point) continue;
      const x = point.x / REDUCTION;
      const y = point.y / REDUCTION;
      if (x < -rayon || y < -rayon || x > largeur + rayon || y > hauteur + rayon) continue;
      const tache = contexteBrume.createRadialGradient(x, y, 0, x, y, rayon);
      tache.addColorStop(0, `rgba(196, 210, 255, ${opaciteVoieLactee(niveau)})`);
      tache.addColorStop(1, 'rgba(196, 210, 255, 0)');
      contexteBrume.fillStyle = tache;
      contexteBrume.fillRect(x - rayon, y - rayon, rayon * 2, rayon * 2);
    }
    contexte.imageSmoothingEnabled = true;
    contexte.imageSmoothingQuality = 'high';
    contexte.drawImage(brume, 0, 0, largeur * REDUCTION, hauteur * REDUCTION);
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
    if (!voieLactee.length) {
      chargerVoieLactee().then((liste) => {
        if (liste.length && !voieLactee.length) {
          voieLactee = liste;
          planifier();
        }
      });
    }
    if (!etoiles.length) {
      chargerEtoiles().then((liste) => {
        if (liste.length && !etoiles.length) {
          etoiles = liste;
          planifier();
        }
      });
    }
    const cam = camera();
    const centre = map.getCenter();
    const maintenant = new Date();
    const ts = tempsSideral(maintenant);
    contexte.globalAlpha = opacite;
    if (voieLactee.length) dessinerVoieLactee(cam, centre, ts, l, h);
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
