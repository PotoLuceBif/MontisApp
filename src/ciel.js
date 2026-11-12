// Ciel autour du globe (demande du propriétaire du 12 novembre 2026) : étoiles visibles à l'œil nu à leur vraie
// place et Lune avec sa phase, sur une toile posée derrière la carte (le globe les cache quand elles passent
// derrière lui). Seulement au dézoom, avec le globe jour et nuit. Base des constellations à venir.
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';
import { couleurEtoile, directionEtoile, eclatEtoile, lireCatalogue, opaciteCiel, projeterDirection, tempsSideral } from './ciel-calcul.js';

const CATALOGUE = '/data/ciel/etoiles.json';
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

export function initCiel(map) {
  const toile = document.createElement('canvas');
  toile.className = 'ciel-etoiles';
  toile.setAttribute('aria-hidden', 'true');
  map.getContainer().insertBefore(toile, map.getCanvasContainer());
  const contexte = toile.getContext('2d');
  let etoiles = [];
  let prevu = false;

  function camera() {
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    return { bearing: map.getBearing(), pitch: map.getPitch(), fov: map.getVerticalFieldOfView(), largeur, hauteurEcran, padding: map.getPadding() };
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
    const cam = camera();
    const centre = map.getCenter();
    const maintenant = new Date();
    const ts = tempsSideral(maintenant);
    contexte.globalAlpha = opacite;
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
