import { MercatorCoordinate } from 'maplibre-gl';
import { depuisComposantes, lireChamp } from './vent-calcul.js';

const ESPACEMENT_MIN = 84; // px entre deux flèches, jamais plus du double
const MAX_FLECHES = 500;
const DUREE_IMAGE = 33; // environ 30 images par seconde, pour ménager la batterie
const POINTS_TRACE = 18;
const DUREE_IMAGE_LENTE = 120; // ms
const IMAGES_LENTES_MAX = 24; // à la suite : l'appareil ne suit pas, on coupe les traînées

// Longueur en pixels : même échelle pour la carte et la légende
export const longueurFleche = (vitesse) => Math.min(80, 24 + vitesse);

const vitesseParticule = (vitesse) => 8 + vitesse; // px/s, indépendant du zoom

// Flèches et traînées dessinées au-dessus de la carte. Elles sont rééchantillonnées
// depuis le champ de vent : zoomer ou déplacer la carte ne demande aucune donnée.
export function creerCoucheVent(map, { couleur, halo, onFleches = () => {} }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'vent-couche';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)');
  let champ = null;
  let visible = false;
  let animable = true;
  let fleches = [];
  let particules = [];
  let frame = null;
  let dernierTemps = 0;
  let largeur = 0;
  let hauteur = 0;
  let boiteVue = null;
  let imagesLentes = 0;
  let tropLent = false;

  const echelleMercator = () => 512 * 2 ** map.getZoom();

  function monter() {
    if (canvas.parentElement) return;
    const fond = map.getCanvas();
    fond.parentElement.insertBefore(canvas, fond.nextSibling);
  }

  function redimensionner() {
    const fond = map.getCanvas();
    largeur = fond.clientWidth;
    hauteur = fond.clientHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(largeur * ratio);
    canvas.height = Math.round(hauteur * ratio);
    canvas.style.width = `${largeur}px`;
    canvas.style.height = `${hauteur}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // La grille vit dans l'espace Mercator de la carte, en mailles qui se divisent
  // par deux : au zoom, les flèches en place restent et d'autres s'intercalent.
  function calculerFleches() {
    fleches = [];
    boiteVue = null;
    if (!champ || !largeur) return;
    const echelle = echelleMercator();
    let cellule = 2 ** -Math.floor(Math.log2(echelle / ESPACEMENT_MIN));
    const limites = map.getBounds();
    const nordOuest = MercatorCoordinate.fromLngLat([
      Math.max(limites.getWest(), champ.ouest),
      Math.min(limites.getNorth(), champ.sud + (champ.ny - 1) * champ.pasLat),
    ]);
    const sudEst = MercatorCoordinate.fromLngLat([
      Math.min(limites.getEast(), champ.ouest + (champ.nx - 1) * champ.pasLng),
      Math.max(limites.getSouth(), champ.sud),
    ]);
    if (sudEst.x <= nordOuest.x || sudEst.y <= nordOuest.y) return;
    boiteVue = { x: nordOuest.x, y: nordOuest.y, largeur: sudEst.x - nordOuest.x, hauteur: sudEst.y - nordOuest.y };
    while (((sudEst.x - nordOuest.x) * (sudEst.y - nordOuest.y)) / cellule ** 2 > MAX_FLECHES) cellule *= 2;

    const pas = 16 / echelle; // petit déplacement pour lire le cap à l'écran
    for (let iy = Math.ceil(nordOuest.y / cellule); iy * cellule <= sudEst.y; iy += 1) {
      for (let ix = Math.ceil(nordOuest.x / cellule); ix * cellule <= sudEst.x; ix += 1) {
        const mx = ix * cellule;
        const my = iy * cellule;
        const { lng, lat } = new MercatorCoordinate(mx, my).toLngLat();
        const composantes = lireChamp(champ, lng, lat);
        if (!composantes) continue;
        const { vitesse, flux, provenance } = depuisComposantes(composantes.u, composantes.v);
        const a = map.project([lng, lat]);
        if (a.x < -40 || a.y < -40 || a.x > largeur + 40 || a.y > hauteur + 40) continue;
        const radians = (flux * Math.PI) / 180;
        // Projeter un second point donne le vrai cap à l'écran, carte tournée ou inclinée
        const b = map.project(
          new MercatorCoordinate(mx + Math.sin(radians) * pas, my - Math.cos(radians) * pas).toLngLat()
        );
        const norme = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        fleches.push({
          lng, lat, vitesse, flux, provenance,
          x: a.x, y: a.y,
          dx: (b.x - a.x) / norme, dy: (b.y - a.y) / norme,
          longueur: longueurFleche(vitesse),
        });
      }
    }
  }

  function dessinerFleches() {
    const tracer = (fleche) => {
      const { x, y, dx, dy, longueur } = fleche;
      const pointeX = x + dx * longueur / 2;
      const pointeY = y + dy * longueur / 2;
      const baseX = pointeX - dx * 8;
      const baseY = pointeY - dy * 8;
      const chemin = new Path2D();
      chemin.moveTo(x - dx * longueur / 2, y - dy * longueur / 2);
      chemin.lineTo(baseX, baseY);
      const pointe = new Path2D();
      pointe.moveTo(pointeX, pointeY);
      pointe.lineTo(baseX - dy * 4, baseY + dx * 4);
      pointe.lineTo(baseX + dy * 4, baseY - dx * 4);
      pointe.closePath();
      return { chemin, pointe };
    };
    const couleurHalo = halo();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const traces = fleches.map(tracer);
    ctx.strokeStyle = couleurHalo;
    ctx.lineWidth = 3.6;
    traces.forEach(({ chemin, pointe }) => {
      ctx.stroke(chemin);
      ctx.stroke(pointe);
    });
    ctx.lineWidth = 2;
    traces.forEach(({ chemin, pointe }, index) => {
      const teinte = couleur(fleches[index].vitesse);
      ctx.strokeStyle = teinte;
      ctx.fillStyle = teinte;
      ctx.stroke(chemin);
      ctx.fill(pointe);
    });
  }

  function creerParticule() {
    return { x: 0, y: 0, mx: 0, my: 0, age: 0, vie: 0, trace: [], active: false };
  }

  function placerParticule(particule, decalerAge = false) {
    particule.active = false;
    particule.trace = [];
    if (!boiteVue) return;
    // Tirage en Mercator : map.unproject relit des pixels au GPU quand le relief 3D est actif
    particule.mx = boiteVue.x + Math.random() * boiteVue.largeur;
    particule.my = boiteVue.y + Math.random() * boiteVue.hauteur;
    const lngLat = new MercatorCoordinate(particule.mx, particule.my).toLngLat();
    if (!lireChamp(champ, lngLat.lng, lngLat.lat)) return;
    particule.vie = 1.4 + Math.random() * 2.2;
    particule.age = decalerAge ? Math.random() * particule.vie : 0;
    particule.active = true;
    const pixel = map.project(lngLat);
    particule.trace.push(pixel.x, pixel.y);
  }

  function preparerParticules() {
    const nombre = champ ? Math.min(220, Math.round((largeur * hauteur) / 2400)) : 0;
    particules = Array.from({ length: nombre }, creerParticule);
    particules.forEach((particule) => placerParticule(particule, true));
  }

  // L'air est transporté en Mercator, projection conforme : le cap de la particule
  // est exactement celui de la flèche, quelle que soit l'orientation de la carte.
  function avancerParticules(dt) {
    const echelle = echelleMercator();
    for (const particule of particules) {
      if (!particule.active) {
        placerParticule(particule);
        continue;
      }
      particule.age += dt;
      if (particule.age > particule.vie) {
        // Fin de vie : la tête s'arrête et la queue la rattrape
        particule.trace.splice(0, 4);
        if (particule.trace.length < 4) placerParticule(particule);
        continue;
      }
      const { lng, lat } = new MercatorCoordinate(particule.mx, particule.my).toLngLat();
      const vent = lireChamp(champ, lng, lat);
      if (!vent) {
        particule.age = particule.vie;
        continue;
      }
      const vitesse = Math.hypot(vent.u, vent.v) || 1;
      const deplacement = (vitesseParticule(vitesse) * dt) / echelle;
      particule.mx += (vent.u / vitesse) * deplacement;
      particule.my -= (vent.v / vitesse) * deplacement;
      particule.vitesse = vitesse;
      const pixel = map.project(new MercatorCoordinate(particule.mx, particule.my).toLngLat());
      particule.trace.push(pixel.x, pixel.y);
      if (particule.trace.length > POINTS_TRACE * 2) particule.trace.splice(0, 2);
    }
  }

  // Traînée en trois tronçons, de plus en plus opaques vers la tête
  function dessinerParticules() {
    const lots = new Map();
    for (const { trace, vitesse, active } of particules) {
      if (!active || trace.length < 4 || !Number.isFinite(vitesse)) continue;
      const teinte = couleur(vitesse);
      if (!lots.has(teinte)) lots.set(teinte, [new Path2D(), new Path2D(), new Path2D()]);
      const chemins = lots.get(teinte);
      const nombre = trace.length / 2;
      for (let i = 0; i < nombre - 1; i += 1) {
        const chemin = chemins[Math.min(2, Math.floor((i / (nombre - 1)) * 3))];
        chemin.moveTo(trace[i * 2], trace[i * 2 + 1]);
        chemin.lineTo(trace[i * 2 + 2], trace[i * 2 + 3]);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.7;
    lots.forEach((chemins, teinte) => {
      ctx.strokeStyle = teinte;
      [0.2, 0.45, 0.85].forEach((opacite, index) => {
        ctx.globalAlpha = opacite;
        ctx.stroke(chemins[index]);
      });
    });
    ctx.globalAlpha = 1;
  }

  function dessiner() {
    ctx.clearRect(0, 0, largeur, hauteur);
    if (!champ || !visible) return;
    if (animationPermise()) dessinerParticules();
    dessinerFleches();
  }

  const animationPermise = () => animable && !tropLent && !mouvementReduit.matches && !document.hidden;

  function boucle(temps) {
    frame = null;
    if (!visible || !champ || !animationPermise()) return;
    if (temps - dernierTemps >= DUREE_IMAGE) {
      imagesLentes = temps - dernierTemps > DUREE_IMAGE_LENTE ? imagesLentes + 1 : 0;
      if (imagesLentes >= IMAGES_LENTES_MAX) {
        tropLent = true;
        dessiner(); // les flèches restent, sans les traînées
        return;
      }
      avancerParticules(Math.min(0.08, (temps - dernierTemps) / 1000));
      dernierTemps = temps;
      dessiner();
    }
    frame = requestAnimationFrame(boucle);
  }

  function relancer() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    dernierTemps = performance.now();
    dessiner();
    if (visible && champ && animationPermise()) frame = requestAnimationFrame(boucle);
  }

  function remettreALaVue() {
    if (!visible) return;
    calculerFleches();
    // Les traînées sont en pixels : on les repart de la position courante de chaque particule
    particules.forEach((particule) => {
      if (!particule.active) return;
      const pixel = map.project(new MercatorCoordinate(particule.mx, particule.my).toLngLat());
      particule.trace = [pixel.x, pixel.y];
    });
    dessiner();
  }

  map.on('move', remettreALaVue);
  map.on('moveend', () => {
    if (visible) onFleches(fleches);
  });
  map.on('resize', () => {
    if (!visible) return;
    redimensionner();
    calculerFleches();
    preparerParticules();
    relancer();
  });
  document.addEventListener('visibilitychange', relancer);
  mouvementReduit.addEventListener('change', relancer);

  return {
    definirChamp(nouveauChamp) {
      champ = nouveauChamp;
      if (!visible) return;
      calculerFleches();
      preparerParticules();
      onFleches(fleches);
      relancer();
    },
    definirVisible(valeur) {
      visible = valeur;
      monter();
      canvas.style.display = valeur ? '' : 'none';
      if (!valeur) {
        relancer();
        return;
      }
      redimensionner();
      calculerFleches();
      preparerParticules();
      onFleches(fleches);
      relancer();
    },
    // Le volume 3D n'a pas besoin de traînées derrière lui : ça économise la batterie
    definirAnimation(valeur) {
      animable = valeur;
      relancer();
    },
    redessiner: dessiner,
  };
}
