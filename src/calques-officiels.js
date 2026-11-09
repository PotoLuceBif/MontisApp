// Calques officiels superposés au fond (pentes de l'IGN, itinéraires de swisstopo…) : couches, opacité, pastilles.
// Le panneau Fond de carte les allume ; chacun garde sa pastille tant qu'il est sur la carte.
import { lire, ecrire } from './reglages.js';
import { t } from './i18n.js';
import { CALQUES, empriseDe, zoneDe } from './fonds-catalogue.js';
import { zoneCouvre } from './fonds-calcul.js';
import { creerPastilleCouche, ouvrirReglage } from './couches-actives.js';
import { REPERE_CALQUES } from './style-montis.js';

// Au-dessus des fonds, comme les pentes et la géologie (sous les routes du fond Montis)
const AVANT = REPERE_CALQUES;
const coucheDe = (c) => `calque-${c.id}`;
const MINI_CALQUE = `<svg class="mini-icone" viewBox="0 0 24 24" aria-hidden="true">
  <path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>`;

// `zones()` : contours des pays s'ils sont chargés ; `surChangement()` : prévient le panneau
export function initCalquesOfficiels(map, { zones, surChangement }) {
  const actifs = new Set(CALQUES.filter((c) => lire(`calque-${c.id}`, false)).map((c) => c.id));
  const pastilles = new Map();

  const couvreCentre = (c) => {
    const { lng, lat } = map.getCenter();
    return zoneCouvre(zoneDe(c), lng, lat, { zones: zones(), emprise: empriseDe(c) });
  };

  CALQUES.forEach((c, rang) => {
    pastilles.set(c.id, creerPastilleCouche({
      ordre: 40 + rang,
      nom: () => (couvreCentre(c) ? t(c.court) : t('calque.hors-zone', { nom: t(c.court) })),
      legende: () => MINI_CALQUE,
      onOuvrir: () => ouvrirReglage('fond'),
      onRetirer: () => basculer(c.id, false),
    }));
  });

  function ajouter(c) {
    if (map.getLayer(coucheDe(c))) return;
    map.addSource(coucheDe(c), { type: 'raster', tileSize: 256, bounds: empriseDe(c) ?? undefined, ...c.source });
    map.addLayer(
      {
        id: coucheDe(c),
        type: 'raster',
        source: coucheDe(c),
        paint: { 'raster-opacity': lire(`calque-${c.id}-opacite`, c.opacite), 'raster-fade-duration': 150 },
      },
      map.getLayer(AVANT) ? AVANT : undefined
    );
  }

  function appliquer(c) {
    const oui = actifs.has(c.id);
    if (oui) ajouter(c);
    if (map.getLayer(coucheDe(c))) map.setLayoutProperty(coucheDe(c), 'visibility', oui ? 'visible' : 'none');
    pastilles.get(c.id).montrer(oui);
  }

  function basculer(id, oui) {
    const c = CALQUES.find((x) => x.id === id);
    if (!c) return;
    if (oui) actifs.add(id);
    else actifs.delete(id);
    ecrire(`calque-${id}`, oui);
    appliquer(c);
    surChangement();
  }

  // Hors de sa zone, la pastille le dit
  map.on('moveend', () => {
    for (const id of actifs) pastilles.get(id).maj();
  });

  // Créé une fois la carte chargée (menu.js) : les calques allumés reviennent tout de suite
  CALQUES.forEach(appliquer);

  return {
    actif: (id) => actifs.has(id),
    basculer,
    opacite(id, valeur) {
      ecrire(`calque-${id}-opacite`, valeur);
      if (map.getLayer(`calque-${id}`)) map.setPaintProperty(`calque-${id}`, 'raster-opacity', valeur);
    },
    lireOpacite: (id) => lire(`calque-${id}-opacite`, CALQUES.find((c) => c.id === id)?.opacite ?? 0.7),
    rafraichir: () => actifs.forEach((id) => pastilles.get(id).maj()),
  };
}
