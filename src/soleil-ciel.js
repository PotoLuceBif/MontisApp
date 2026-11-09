// Le soleil dessiné dans le ciel en 3D, quand l'ombre du soleil est allumée : on voit d'où vient l'ombre.
// Hors du champ, un petit soleil au bord de l'écran montre sa direction. Derrière une montagne, il pâlit.
import { placerSoleil, positionCamera, projeterSoleil } from './soleil-ciel-calcul.js';

const ZOOM_MIN = 9; // en dessous, projection globe (main.js)
// Au bord, le petit soleil s'écarte ensuite des boutons et panneaux qui le couvriraient (`placerAuLarge`)
const MARGE_BORD = { haut: 30, bas: 30, gauche: 30, droite: 30 };
const METRES_PAR_DEGRE = 111_320;
// Distances (horizontales) où l'on regarde si le relief cache le soleil
const PAS_RELIEF = [150, 300, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000, 9500, 13000, 17000, 22000, 30000];

export function creerSoleilCiel(map) {
  const element = document.createElement('div');
  element.className = 'soleil-ciel';
  element.hidden = true;
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<i class="soleil-ciel-halo"></i><i class="soleil-ciel-disque"></i><i class="soleil-ciel-fleche"></i>';
  map.getCanvasContainer().append(element);
  const fleche = element.querySelector('.soleil-ciel-fleche');

  let soleil = null; // { azimut, hauteur } ou null pour le cacher

  // Le relief cache-t-il le soleil, vu depuis la caméra ?
  function cacheParRelief() {
    if (!map.getTerrain()) return false;
    const centre = map.getCenter();
    const { lng, lat, altitude } = positionCamera({
      lng: centre.lng,
      lat: centre.lat,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      fov: map.getVerticalFieldOfView(),
      hauteurEcran: map.getContainer().clientHeight,
      altitudeCentre: map.getCenterElevation(),
    });
    const az = (soleil.azimut * Math.PI) / 180;
    const pente = Math.tan((soleil.hauteur * Math.PI) / 180);
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
    return PAS_RELIEF.some((d) => {
      const sol = map.queryTerrainElevation([
        lng + (d * Math.sin(az)) / (METRES_PAR_DEGRE * cosLat),
        lat + (d * Math.cos(az)) / METRES_PAR_DEGRE,
      ]);
      return sol != null && sol > altitude + d * pente;
    });
  }

  // Au bord, le petit soleil s'écarte d'un panneau qui le couvrirait (fiche de la visite, panneau Carte…)
  const libre = (x, y) => {
    const cadre = map.getContainer().getBoundingClientRect();
    const dessus = document.elementFromPoint(cadre.left + x, cadre.top + y);
    return !dessus || map.getCanvasContainer().contains(dessus) || dessus === map.getCanvas();
  };
  function placerAuLarge(projection, largeur, hauteurEcran) {
    const marge = { ...MARGE_BORD };
    for (let essai = 0; ; essai += 1) {
      const place = placerSoleil(projection, { largeur, hauteurEcran, marge, margeVisible: 8 });
      if (place.dedans || essai >= 24) return place;
      // La flèche dépasse du soleil, vers l'extérieur : elle doit rester visible aussi
      const a = (place.angle * Math.PI) / 180;
      if (libre(place.x, place.y) && libre(place.x + 24 * Math.sin(a), place.y - 24 * Math.cos(a))) return place;
      // Le côté où il est posé recule : il se glisse au-dessus ou à côté du panneau
      const cote = place.y >= hauteurEcran - marge.bas - 1 ? 'bas'
        : place.y <= marge.haut + 1 ? 'haut'
          : place.x <= marge.gauche + 1 ? 'gauche' : 'droite';
      const limite = (cote === 'bas' || cote === 'haut' ? hauteurEcran : largeur) * 0.45;
      if (marge[cote] + 24 > limite) return place;
      marge[cote] += 24;
    }
  }

  function placer() {
    const voir = soleil && soleil.hauteur > 0 && map.getPitch() > 1 && map.getZoom() >= ZOOM_MIN;
    element.hidden = !voir;
    if (!voir) return;
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    const projection = projeterSoleil(soleil, {
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      fov: map.getVerticalFieldOfView(),
      largeur,
      hauteurEcran,
      padding: map.getPadding(),
    });
    const place = placerAuLarge(projection, largeur, hauteurEcran);
    element.classList.toggle('bord', !place.dedans);
    element.classList.toggle('derriere', place.dedans && cacheParRelief());
    element.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
    if (!place.dedans) fleche.style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
  }

  map.on('move', placer);
  map.on('resize', placer);
  map.on('idle', placer); // le relief a pu arriver entre-temps

  return {
    montrer(nouveau) {
      soleil = nouveau;
      placer();
    },
  };
}
