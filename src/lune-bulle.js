// La Lune et le soleil se touchent (lot 4.10, demandes du propriétaire du 16 novembre 2026) : dans le ciel du
// globe au dézoom (ciel.js) et dans le ciel en 3D (soleil-ciel.js, événement `montis:astre-touche`). Une petite
// bulle propose, pour la Lune, « Informations » (Soleil et Lune › Lune) et « Visiter la Lune » ; pour le
// soleil, « Informations » (Soleil et Lune › Soleil), sans visite.
import { ouvrirSoleilLune } from './soleil-lune.js';
import { poser, t } from './i18n.js';
import { svgLune } from './lune-dessin.js';
import { getMoonPosition } from 'suncalc';
import { opaciteCiel } from './ciel-calcul.js';
import { placerSoleil, projeterSoleil } from './soleil-ciel-calcul.js';

const MARGE = 14; // px autour du disque : les astres sont petits, le doigt ne l'est pas

export const visiterLaLune = (map, options) => import('./lune-visite.js').then((m) => m.visiterLune(map, options));

export function initBulleLune(map, ciel) {
  if (import.meta.env.DEV) window.cielMontis = ciel; // captures : position des astres à toucher
  const bulle = document.createElement('div');
  bulle.className = 'lune-bulle';
  bulle.hidden = true;
  bulle.innerHTML = `
    <button type="button" data-action="infos"><span data-i18n="lune-visite.informations"></span></button>
    <button type="button" data-action="visiter" class="principal"><span data-i18n="lune-visite.visiter"></span></button>
  `;
  bulle.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  document.body.append(bulle);
  let astre = 'lune';

  const fermer = () => { bulle.hidden = true; };
  function ouvrir(x, y, quoi) {
    astre = quoi;
    bulle.classList.toggle('soleil', quoi === 'soleil');
    bulle.querySelector('[data-action="visiter"]').hidden = quoi === 'soleil';
    const cadre = map.getContainer().getBoundingClientRect();
    bulle.hidden = false;
    const largeur = bulle.offsetWidth;
    const gauche = Math.min(window.innerWidth - largeur - 8, Math.max(8, cadre.left + x - largeur / 2));
    // Sous l'astre, sauf s'il est trop bas
    const sous = cadre.top + y + 22;
    const haut = sous + bulle.offsetHeight > window.innerHeight - 8 ? cadre.top + y - 22 - bulle.offsetHeight : sous;
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${Math.max(8, haut)}px`;
  }

  bulle.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    fermer();
    if (action === 'infos') ouvrirSoleilLune(astre === 'soleil' ? 'ombres' : 'lune');
    else visiterLaLune(map);
  });

  // Au dézoom : un appui sur un astre du ciel, si le globe ne le cache pas à cet endroit
  map.on('click', (event) => {
    const { x, y } = event.point;
    const proche = (point) => point && Math.hypot(x - point.x, y - point.y) <= point.rayon + MARGE;
    const lune = ciel?.pointLune();
    const soleil = ciel?.pointSoleil();
    const quoi = proche(lune) ? 'lune' : proche(soleil) ? 'soleil' : null;
    if (!quoi) {
      fermer();
      return;
    }
    // Hors du globe, MapLibre ramène le point sur son bord : le chemin aller-retour ne retombe pas au même pixel
    const retour = map.project(map.unproject(event.point));
    if (Math.hypot(retour.x - x, retour.y - y) < 3) {
      fermer();
      return;
    }
    const point = quoi === 'lune' ? lune : soleil;
    // Après le clic : le menu ferme ses panneaux au même clic (menu.js)
    setTimeout(() => ouvrir(point.x, point.y, quoi));
  });
  window.addEventListener('montis:astre-touche', ({ detail }) => setTimeout(() => ouvrir(detail.x, detail.y, detail.astre)));
  map.on('movestart', (event) => { if (event.originalEvent) fermer(); });

  // ---------- Flèche de la Lune en mode espace (demande du propriétaire du 16 novembre 2026) ----------
  // Comme la flèche de la Terre sur la Lune : quand le ciel est là mais qu'on ne voit pas la Lune (derrière le
  // globe ou derrière la caméra), une petite Lune au bord de l'écran montre de quel côté elle est ; un appui va à
  // une vue nord en haut où elle dépasse au-dessus de la Terre.
  const indice = document.createElement('button');
  indice.type = 'button';
  indice.className = 'astre-indice';
  indice.hidden = true;
  // La Lune dessinée des menus (blanche avec ses mers grises, lune-dessin.js), demande du propriétaire du 16 novembre 2026
  indice.innerHTML = `<span class="astre-indice-lune">${svgLune({ fraction: 1, classe: 'lune-icone' })}</span><i class="astre-indice-fleche"></i>`;
  map.getContainer().append(indice);
  const nommerIndice = () => {
    indice.setAttribute('aria-label', t('lune-visite.montrer-lune'));
    indice.title = t('lune-visite.montrer-lune');
  };
  nommerIndice();
  const ZOOM_INDICE = 1.8; // flèche de la Lune : seulement très dézoomé
  const MARGE_INDICE = { haut: 86, bas: 44, gauche: 18, droite: 72 };
  function placerIndice() {
    const { clientWidth: l, clientHeight: h } = map.getContainer();
    // Seulement très dézoomé, la Terre vue en entier (demande du propriétaire du 17 novembre 2026 : dès l'apparition
    // des étoiles, elle venait trop tôt)
    if (map.getZoom() > ZOOM_INDICE || opaciteCiel(map.getZoom()) < 0.5) {
      indice.hidden = true;
      return;
    }
    const lune = ciel?.pointLune();
    const dansLecran = lune && lune.x > 0 && lune.x < l && lune.y > 0 && lune.y < h;
    let visible = false;
    if (dansLecran) {
      const retour = map.project(map.unproject([lune.x, lune.y]));
      visible = Math.hypot(retour.x - lune.x, retour.y - lune.y) >= 3; // hors du globe : on la voit
    }
    indice.hidden = visible;
    if (visible) return;
    // Direction de la Lune par la vraie projection de la caméra, inclinaison comprise (avec la seule boussole, une vue
    // inclinée montrait le haut pour une Lune qui était en bas), ramenée au bord libre de l'écran
    const { lng, lat } = map.getCenter();
    const lune2 = getMoonPosition(new Date(), lat, lng);
    const cam = {
      bearing: map.getBearing(), pitch: map.getPitch(), fov: map.getVerticalFieldOfView(), largeur: l, hauteurEcran: h, padding: map.getPadding(),
    };
    const projection = projeterSoleil({ azimut: ((lune2.azimuth % 360) + 360) % 360, hauteur: lune2.altitude }, cam);
    const place = placerSoleil(projection, { largeur: l, hauteurEcran: h, marge: MARGE_INDICE, margeVisible: Math.max(l, h) });
    indice.style.transform = `translate(${place.x.toFixed(1)}px, ${place.y.toFixed(1)}px)`;
    indice.querySelector('.astre-indice-fleche').style.transform = `rotate(${place.angle.toFixed(1)}deg)`;
  }
  // La Lune du ciel est redessinée à l'image suivante : la flèche suit après elle
  map.on('move', () => requestAnimationFrame(placerIndice));
  map.on('resize', placerIndice);
  map.on('idle', placerIndice);
  indice.addEventListener('click', (event) => {
    event.stopPropagation();
    import('./terre-vue-calcul.js').then(({ pointSousLune, vueLuneAuNord }) => {
      const instant = new Date();
      const vue = vueLuneAuNord(pointSousLune(instant));
      map.flyTo({ center: [vue.lng, vue.lat], zoom: Math.min(map.getZoom(), 1.4), bearing: 0, pitch: 0, duration: 2200 });
    });
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') fermer(); });
}
