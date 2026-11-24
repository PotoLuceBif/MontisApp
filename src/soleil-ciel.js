// Le soleil dessiné dans le ciel en 3D, quand l'ombre du soleil est allumée : on voit d'où vient l'ombre.
// Hors du champ, un petit soleil au bord de l'écran montre sa direction. Derrière une montagne, il pâlit.
// La Lune aussi, à sa place et avec sa phase (côté éclairé vers le soleil), seulement quand elle est à l'écran.
// Avec « Voir dans le ciel », leurs trajectoires du jour (demande du propriétaire du 24 novembre 2026) : trait plein
// jusqu'à l'heure de la frise, pointillés ensuite, une marque par heure.
import { placerSoleil, positionCamera, projeterSoleil } from './soleil-ciel-calcul.js';
import { dessinPhase } from './lune-calcul.js';
import { svgLune } from './lune-dessin.js';

// Dès que le ciel du globe s'efface (ciel.js, zoom 6) : plus de trou entre les deux au dézoom (demande du
// propriétaire du 16 novembre 2026)
const ZOOM_MIN = 6;
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
  const elementLune = document.createElement('div');
  elementLune.className = 'lune-ciel';
  elementLune.hidden = true;
  elementLune.setAttribute('aria-hidden', 'true');
  elementLune.innerHTML = `${svgLune({ contour: true })}<i class="lune-ciel-fleche"></i>`;
  // Trajectoires, sous les astres (mêmes styles que la vue au sol de panorama.js)
  const SVG = 'http://www.w3.org/2000/svg';
  const elementTrajets = document.createElementNS(SVG, 'svg');
  elementTrajets.setAttribute('class', 'soleil-ciel-trajets');
  elementTrajets.setAttribute('aria-hidden', 'true');
  const traces = {};
  for (const astre of ['soleil', 'lune']) {
    const groupe = document.createElementNS(SVG, 'g');
    groupe.setAttribute('class', `pano-astre pano-astre-${astre}`);
    groupe.innerHTML = '<path class="passe"/><path class="futur"/><g class="heures"></g>';
    elementTrajets.appendChild(groupe);
    traces[astre] = { passe: groupe.querySelector('.passe'), futur: groupe.querySelector('.futur'), heures: groupe.querySelector('.heures') };
  }
  map.getCanvasContainer().append(elementTrajets, element, elementLune);
  // Un appui sur la Lune propose ses informations ou sa visite, sur le soleil ses informations (lune-bulle.js)
  const toucher = (cible, astre) => cible.addEventListener('click', (event) => {
    event.stopPropagation();
    const cadre = map.getContainer().getBoundingClientRect();
    const disque = event.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('montis:astre-touche', {
      detail: { astre, x: disque.left + disque.width / 2 - cadre.left, y: disque.top + disque.height / 2 - cadre.top },
    }));
  });
  toucher(elementLune.querySelector('svg'), 'lune');
  toucher(element.querySelector('.soleil-ciel-disque'), 'soleil');
  const fleche = element.querySelector('.soleil-ciel-fleche');
  const phaseLune = elementLune.querySelector('.lune-phase-chemin');
  const flecheLune = elementLune.querySelector('.lune-ciel-fleche');

  let soleil = null; // { azimut, hauteur } ou null pour le cacher
  let lune = null; // { azimut, hauteur, fraction } ou null
  // { soleil, lune : [{ t, azimut, hauteur }] (un point toutes les 10 min depuis minuit), instant, heure(t) } ou null
  let trajets = null;

  // Le relief cache-t-il cet astre (le soleil par défaut), vu depuis la caméra ?
  function cacheParRelief(astre = soleil) {
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
    const az = (astre.azimut * Math.PI) / 180;
    const pente = Math.tan((astre.hauteur * Math.PI) / 180);
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
    // Pendant un déplacement, la place simple : chercher un coin libre lit la mise en page jusqu'à 48 fois par image
    // et faisait saccader la carte ; l'évitement se refait à l'arrêt (idle)
    if (map.isMoving()) return placerSoleil(projection, { largeur, hauteurEcran, marge, margeVisible: 8 });
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

  const camera = () => {
    const { clientWidth: largeur, clientHeight: hauteurEcran } = map.getContainer();
    return {
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      fov: map.getVerticalFieldOfView(),
      largeur,
      hauteurEcran,
      padding: map.getPadding(),
    };
  };
  const ciel3D = () => map.getPitch() > 1 && map.getZoom() >= ZOOM_MIN;

  // La Lune : à sa place, ou au bord de l'écran dans sa direction (plus petite), comme le soleil
  function placerLune() {
    const cam = camera();
    const voir = lune && lune.hauteur > 0 && ciel3D();
    elementLune.hidden = !voir;
    if (!voir) return;
    const projection = projeterSoleil(lune, cam);
    const place = placerAuLarge(projection, cam.largeur, cam.hauteurEcran);
    // Côté éclairé tourné vers le soleil : vers son point à l'écran, sinon vers sa direction
    let angle = 0;
    if (soleil) {
      const versSoleil = projeterSoleil(soleil, cam);
      angle = versSoleil.devant && place.dedans
        ? Math.atan2(versSoleil.y - place.y, versSoleil.x - place.x)
        : Math.atan2(versSoleil.dy - projection.dy, versSoleil.dx - projection.dx);
    }
    // Seule la partie éclairée tourne vers le soleil : le visage garde le nord en haut
    phaseLune.setAttribute('transform', `rotate(${((angle * 180) / Math.PI).toFixed(1)} 12 12)`);
    elementLune.classList.toggle('bord', !place.dedans);
    if (!place.dedans) flecheLune.style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
    elementLune.classList.toggle('derriere', place.dedans && cacheParRelief(lune));
    elementLune.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
  }

  // Trajectoires : seulement au-dessus de l'horizon et devant la caméra
  const POINTS_PAR_HEURE = 6;
  function placerTrajets() {
    const voir = trajets && ciel3D();
    elementTrajets.style.display = voir ? '' : 'none';
    if (!voir) return;
    const cam = camera();
    elementTrajets.setAttribute('viewBox', `0 0 ${cam.largeur} ${cam.hauteurEcran}`);
    const marge = Math.max(cam.largeur, cam.hauteurEcran);
    for (const astre of ['soleil', 'lune']) {
      const tr = traces[astre];
      let passe = '';
      let futur = '';
      let suite = { passe: false, futur: false };
      let heures = '';
      const points = trajets[astre];
      points.forEach((p, i) => {
        const q = p.hauteur > 0 ? projeterSoleil(p, cam) : null;
        const dedans = q?.devant && q.x > -marge && q.x < cam.largeur + marge && q.y > -marge && q.y < cam.hauteurEcran + marge;
        if (!dedans) {
          suite = { passe: false, futur: false };
          return;
        }
        const cote = p.t <= trajets.instant ? 'passe' : 'futur';
        const point = `${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
        if (cote === 'passe') passe += `${suite.passe ? 'L' : 'M'}${point}`;
        else futur += `${suite.futur ? 'L' : 'M'}${point}`;
        suite = { passe: cote === 'passe', futur: cote === 'futur' };
        if (i % POINTS_PAR_HEURE === 0 && i > 0 && i < points.length - 1) {
          heures += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="2.2"/><text x="${(q.x + 6).toFixed(1)}" y="${(q.y - 6).toFixed(1)}">${trajets.heure(p.t).replace(/h00$/, 'h')}</text>`;
        }
      });
      // Le trait plein rejoint l'astre, à l'heure de la frise
      const ici = astre === 'soleil' ? soleil : lune;
      if (ici && ici.hauteur > 0 && passe) {
        const q = projeterSoleil(ici, cam);
        if (q.devant) passe += `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
      }
      tr.passe.setAttribute('d', passe);
      tr.futur.setAttribute('d', futur);
      tr.heures.innerHTML = heures;
    }
  }

  function placer() {
    placerTrajets();
    placerLune();
    const voir = soleil && soleil.hauteur > 0 && ciel3D();
    element.hidden = !voir;
    if (!voir) return;
    const { largeur, hauteurEcran, ...reste } = camera();
    const projection = projeterSoleil(soleil, { largeur, hauteurEcran, ...reste });
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
    // `nouvelleLune` : { azimut, hauteur, fraction } ou rien
    montrer(nouveau, nouvelleLune = null) {
      soleil = nouveau;
      if (nouvelleLune && Math.round((nouvelleLune.fraction ?? 0) * 200) !== Math.round((lune?.fraction ?? -1) * 200)) {
        phaseLune.setAttribute('d', dessinPhase(nouvelleLune.fraction, true));
      }
      lune = nouvelleLune;
      placer();
    },
    // Trajectoires du jour (« Voir dans le ciel ») ; null les retire
    montrerTrajets(nouveaux) {
      trajets = nouveaux;
      placerTrajets();
    },
  };
}
