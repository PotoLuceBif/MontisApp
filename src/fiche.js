import * as maplibregl from 'maplibre-gl';
import { formatAltitude } from './unites.js';
import { surPreferences } from './preferences.js';
import { poserAttribut, t as tr } from './i18n.js';
import { interroger } from './overpass.js';
import { DECALAGE_PIN, creerPinSeul, imagePin } from './pins.js';

// Quelle couche de la carte correspond à quel genre d'élément
const GENRE_PAR_COUCHE = {
  sommets: 'sommet',
  'lieux-refuges': 'refuge',
  'lieux-villes': 'lieu',
  'lieux-bourgs': 'lieu',
  'lieux-villages': 'lieu',
  'lieux-hameaux': 'lieu',
  'nature-rivieres': 'riviere',
  'nature-rivieres-noms': 'riviere',
  'nature-lacs': 'lac',
  'nature-lacs-noms-ligne': 'lac',
  'nature-lacs-noms-point': 'lac',
  'nature-glaciers': 'glacier',
  'nature-glaciers-motif': 'glacier',
  'nature-glaciers-bord': 'glacier',
  'nature-forets': 'foret',
  'nature-forets-motif': 'foret',
  'nature-forets-bord': 'foret',
  'nature-parcs': 'parc',
  'nature-parcs-halo': 'parc',
  'nature-parcs-bord': 'parc',
  'nature-parcs-noms-nationaux': 'parc',
  'nature-parcs-noms': 'parc',
};

// Quand plusieurs éléments se superposent : le plus précis gagne
const PRIORITE = ['sommet', 'refuge', 'lieu', 'riviere', 'lac', 'glacier', 'foret', 'parc'];

const NOMS_LIEUX = { city: 'fiche.ville', town: 'fiche.ville', village: 'fiche.village', hamlet: 'fiche.hameau' };
const NOMS_COURS = { river: 'fiche.riviere', stream: 'fiche.ruisseau', canal: 'fiche.canal' };
const NOMS_EAUX = { lake: 'fiche.lac', ocean: 'fiche.mer', river: 'fiche.cours-eau', pond: 'fiche.etang' };
const NOMS_PARCS = { national_park: 'fiche.parc-national', nature_reserve: 'fiche.reserve', protected_area: 'fiche.zone-protegee' };

const humaniser = (c) => c.replace(/_/g, ' ').replace(/^./, (m) => m.toUpperCase());

// Reconnaissance des objets OpenStreetMap renvoyés par Overpass
const estParc = (t) =>
  t.boundary === 'national_park' || t.boundary === 'protected_area' || t.leisure === 'nature_reserve';
const rangParc = (e) => (e.tags.boundary === 'national_park' ? 0 : e.tags.leisure === 'nature_reserve' ? 1 : 2);
const FILTRES = {
  foret: (t) => t.natural === 'wood' || t.landuse === 'forest',
  glacier: (t) => t.natural === 'glacier',
  lac: (t) => t.natural === 'water' || t.landuse === 'reservoir',
};

let bloque = false;
// À appeler avec true pendant qu'un outil utilise le clic sur la carte (ex. choix d'un point de départ)
export function bloquerFiches(valeur) {
  bloque = !!valeur;
}

function decrire(f, genre) {
  const p = f.properties || {};
  const nom = p.name || '';
  switch (genre) {
    case 'sommet': return { icone: '⛰️', type: tr('fiche.sommet'), nom, ele: p.ele };
    case 'refuge':
      return {
        icone: '🛖',
        // OpenStreetMap ne dit ni si le refuge est gardé, ni à quelle saison
        type: tr(p.genre === 'libre' ? 'fiche.cabane' : 'fiche.refuge'),
        nom,
        ele: p.ele || undefined,
      };
    case 'lieu': return { icone: '🏘️', type: tr(NOMS_LIEUX[p.class] || 'fiche.lieu'), nom };
    case 'riviere': return { icone: '🌊', type: tr(NOMS_COURS[p.class] || 'fiche.cours-eau'), nom };
    case 'lac': return { icone: '💧', type: tr(NOMS_EAUX[p.class] || 'fiche.plan-eau'), nom };
    case 'glacier': return { icone: '🧊', type: tr('fiche.glacier'), nom };
    case 'foret': return { icone: '🌲', type: tr('fiche.foret'), nom };
    default:
      return { icone: '🌿', type: NOMS_PARCS[p.class] ? tr(NOMS_PARCS[p.class]) : p.class ? humaniser(p.class) : tr('fiche.zone-protegee'), nom };
  }
}

// Exploite la réponse d'Overpass : localisation, zones protégées, objet principal
function analyser(elements, genre, nom) {
  const nommes = elements.filter((e) => e.tags && e.tags.name);

  const admin = {};
  for (const e of nommes) {
    const niveau = String(e.tags.admin_level || '');
    if (e.tags.boundary === 'administrative' && ['8', '6', '4'].includes(niveau) && !admin[niveau]) {
      admin[niveau] = e.tags.name;
    }
  }
  const localisation = [admin['8'], admin['6'], admin['4']].filter(Boolean);

  const parcs = nommes.filter((e) => e.type !== 'node' && estParc(e.tags)).sort((a, b) => rangParc(a) - rangParc(b));

  let principal = null;
    if (genre === 'refuge') {
    const n = (nom || '').toLowerCase();
    principal =
      nommes.find(
        (e) => ['alpine_hut', 'wilderness_hut'].includes(e.tags.tourism) && e.tags.name.toLowerCase() === n
      ) || null;
  } else if (genre === 'sommet' || genre === 'lieu') {
    const n = (nom || '').toLowerCase();
    principal = nommes.find((e) => e.type === 'node' && e.tags.name.toLowerCase() === n) || null;
  } else if (genre === 'parc') {
    principal = parcs[0] || null;
  } else if (FILTRES[genre]) {
    principal = nommes.find((e) => e.type !== 'node' && FILTRES[genre](e.tags)) || null;
  }
  return { principal, parcs, localisation };
}

function lienWikipedia(tag) {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const langue = i > 0 ? tag.slice(0, i) : 'fr';
  const titre = i > 0 ? tag.slice(i + 1) : tag;
  if (!/^[a-z-]{2,10}$/i.test(langue)) return null;
  return `https://${langue}.wikipedia.org/wiki/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
}

export function initFiches(map) {
  const panneau = document.createElement('aside');
  panneau.id = 'fiche';
  panneau.setAttribute('role', 'dialog');
  poserAttribut(panneau, 'aria-label', 'fiche.aria');
  panneau.hidden = true;
  document.body.appendChild(panneau);

  let courant = null;
  let controleur = null;
  let anneau = null;
  let curseurMain = false;
  const cache = new Map();

  // ---------- Affichage de la fiche ----------
  function ligne(etiquette, contenu) {
    const l = document.createElement('div');
    l.className = 'fiche-ligne';
    const e = document.createElement('div');
    e.className = 'fiche-etiquette';
    e.textContent = etiquette;
    const v = document.createElement('div');
    v.className = 'fiche-valeur';
    if (typeof contenu === 'string') v.textContent = contenu;
    else v.appendChild(contenu);
    l.append(e, v);
    return l;
  }

  function lien(texte, url) {
    const a = document.createElement('a');
    a.textContent = texte;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function rendre() {
    if (!courant) return;
    const f = courant;
    const d = f.details && typeof f.details === 'object' ? f.details : null;
    const nom = f.point ? f.point.titre() : f.nom || (d && d.principal && d.principal.tags.name) || '';
    f.type = f.point ? f.point.sousTitre() : decrire(f.source, f.genre).type; // suit la langue choisie
    panneau.replaceChildren();

    // En-tête
    const entete = document.createElement('div');
    entete.className = 'fiche-entete';
    const icone = document.createElement('div');
    icone.className = 'fiche-icone';
    if (f.point) icone.append(imagePin(f.point.pin));
    else icone.textContent = f.icone;
    const titres = document.createElement('div');
    titres.className = 'fiche-titres';
    const titre = document.createElement('div');
    titre.className = 'fiche-nom';
    titre.textContent = nom || f.type;
    const sous = document.createElement('div');
    sous.className = 'fiche-type';
    sous.textContent = nom ? f.type : d ? tr('fiche.sans-nom') : '';
    titres.append(titre, sous);
    const fermerBtn = document.createElement('button');
    fermerBtn.type = 'button';
    fermerBtn.className = 'fiche-fermer';
    fermerBtn.setAttribute('aria-label', tr('fiche.fermer'));
    fermerBtn.textContent = '✕';
    fermerBtn.addEventListener('click', fermer);
    entete.append(icone, titres, fermerBtn);
    panneau.appendChild(entete);

    // Corps
    const corps = document.createElement('div');
    corps.className = 'fiche-corps';

    const texteCoord = `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}`;
    const pos = document.createElement('div');
    pos.className = 'fiche-position';
    const code = document.createElement('span');
    code.className = 'fiche-coord';
    code.textContent = texteCoord;
    const copier = document.createElement('button');
    copier.type = 'button';
    copier.className = 'fiche-copier';
    copier.textContent = tr('lieu.copier');
    copier.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texteCoord);
        copier.textContent = tr('lieu.copie');
      } catch (e) {
        copier.textContent = tr('lieu.indisponible');
      }
      setTimeout(() => (copier.textContent = tr('lieu.copier')), 1500);
    });
    pos.append(code, copier);
    corps.appendChild(ligne(tr('fiche.position'), pos));

    if (f.point) {
      f.point.rendre(corps, ligne);
      panneau.appendChild(corps);
      return;
    }

    const eleOsm = parseFloat(f.ele ?? (d && d.principal && d.principal.tags.ele));
    if (Number.isFinite(eleOsm)) {
      corps.appendChild(ligne(tr('fiche.altitude'), formatAltitude(eleOsm)));
    } else if (Number.isFinite(f.eleDem)) {
      corps.appendChild(ligne(tr('fiche.altitude'), tr('fiche.altitude-relief', { valeur: formatAltitude(f.eleDem) })));
    }

    if (d && d.localisation.length) corps.appendChild(ligne(tr('fiche.localisation'), d.localisation.join(' · ')));
    if (d && f.genre !== 'parc' && d.parcs.length) {
      corps.appendChild(ligne(tr('fiche.zone-protegee'), d.parcs.slice(0, 3).map((p) => p.tags.name).join(' · ')));
    }
    if (d && d.principal && f.genre === 'refuge') {
      const t = d.principal.tags;
      const places = t.capacity || t.beds;
      if (places) corps.appendChild(ligne(tr('fiche.couchages'), String(places)));
      const tel = t.phone || t['contact:phone'];
      if (tel) corps.appendChild(ligne(tr('fiche.telephone'), tel));
      if (t.opening_hours) corps.appendChild(ligne(tr('fiche.ouverture'), t.opening_hours));
      const resa = { required: 'fiche.resa-obligatoire', recommended: 'fiche.resa-recommandee', yes: 'fiche.resa-possible', no: 'fiche.resa-non', members_only: 'fiche.resa-membres' };
      if (t.reservation) corps.appendChild(ligne(tr('fiche.reservation'), resa[t.reservation] ? tr(resa[t.reservation]) : t.reservation));
    }
    if (f.genre === 'refuge') {
      const avis = document.createElement('div');
      avis.className = 'fiche-attente-ligne';
      avis.textContent = tr('fiche.verifiez');
      corps.appendChild(avis);
    }
    if (f.details === 'chargement') {
      const att = document.createElement('div');
      att.className = 'fiche-attente-ligne';
      const spin = document.createElement('span');
      spin.className = 'rech-attente';
      att.append(spin, tr('fiche.recherche'));
      corps.appendChild(att);
    } else if (f.details === 'erreur') {
      const err = document.createElement('div');
      err.className = 'fiche-attente-ligne';
      err.textContent = tr('fiche.indisponibles');
      corps.appendChild(err);
    }

    if (d && d.principal) {
      const t = d.principal.tags;
      const liens = document.createElement('div');
      liens.className = 'fiche-liens';
      const wiki = lienWikipedia(t.wikipedia);
      if (wiki) liens.appendChild(lien(tr('fiche.wikipedia'), wiki));
      const site = t.website || t['contact:website'];
      if (site && /^https?:\/\//i.test(site)) liens.appendChild(lien(tr('fiche.site'), site));
      liens.appendChild(lien('OpenStreetMap', `https://www.openstreetmap.org/${d.principal.type}/${d.principal.id}`));
      corps.appendChild(ligne(tr('fiche.liens'), liens));
    }

    panneau.appendChild(corps);
  }

  // ---------- Chargement des détails (Overpass) ----------
  async function chargerDetails(fiche) {
    const cle = `${fiche.lat.toFixed(4)},${fiche.lng.toFixed(4)}`;
    if (cache.has(cle)) {
      fiche.details = analyser(cache.get(cle), fiche.genre, fiche.nom);
      rendre();
      return;
    }

    fiche.details = 'chargement';
    rendre();

    if (controleur) controleur.abort();
    controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), 25000);

    const lat = fiche.lat.toFixed(6);
    const lng = fiche.lng.toFixed(6);
    const requete =
      `[out:json][timeout:15];is_in(${lat},${lng})->.a;(wr(pivot.a);` +
      `node(around:80,${lat},${lng})["name"]["natural"~"^(peak|volcano|saddle)$"];` +
      `nwr(around:80,${lat},${lng})["name"]["tourism"~"^(alpine_hut|wilderness_hut)$"];` +
      `node(around:150,${lat},${lng})["name"]["place"];);out tags;`;

    try {
        
      const json = await interroger(requete, controleur.signal);
      const elements = json.elements || [];
      cache.set(cle, elements);
      if (courant !== fiche) return;
      fiche.details = analyser(elements, fiche.genre, fiche.nom);
    } catch (e) {
      if (courant !== fiche) return;
      fiche.details = 'erreur';
      console.warn('Détails de la fiche :', e);
    } finally {
      clearTimeout(delai);
    }
    rendre();
  }

  // ---------- Ouverture et fermeture ----------
  // Un point quelconque reçoit le pin de la recherche, qui tombe en place ; un objet, un anneau
  let repere = null;
  function poserPin(lngLat, nom) {
    if (anneau) anneau.remove();
    if (repere) repere.remove();
    const pin = creerPinSeul(nom);
    pin.element.classList.add('point-pin');
    repere = new maplibregl.Marker({ element: pin.element, anchor: 'bottom', offset: DECALAGE_PIN })
      .setLngLat([lngLat.lng, lngLat.lat])
      .addTo(map);
  }

  function poserAnneau(lngLat) {
    if (repere) repere.remove();
    repere = null;
    if (!anneau) {
      const el = document.createElement('div');
      el.className = 'fiche-point';
      anneau = new maplibregl.Marker({ element: el, anchor: 'center' });
    }
    anneau.setLngLat([lngLat.lng, lngLat.lat]).addTo(map);
  }

  surPreferences(() => {
    if (courant && !panneau.hidden) rendre();
  });

  function fermer() {
    if (controleur) controleur.abort();
    courant?.point?.arreter();
    courant = null;
    panneau.hidden = true;
    if (anneau) anneau.remove();
    if (repere) repere.remove();
    repere = null;
  }

  function ouvrir(feature, genre, lngLat) {
    if (controleur) controleur.abort();
    courant?.point?.arreter();
    const d = decrire(feature, genre);
    courant = {
      source: feature,
      genre,
      icone: d.icone,
      type: d.type,
      nom: d.nom,
      ele: d.ele,
      lng: lngLat.lng,
      lat: lngLat.lat,
      details: null,
    };
    poserAnneau(lngLat);
    panneau.hidden = false;
    window.dispatchEvent(new Event('fiche-ouverte'));
    rendre();
    chargerDetails(courant);

    // Altitude de repli, lue dans les données de relief
    const fiche = courant;
    import('./relief-donnees.js')
      .then(({ altitudeRelief }) => altitudeRelief(lngLat.lng, lngLat.lat))
      .then((v) => {
        if (courant === fiche && Number.isFinite(v)) {
          fiche.eleDem = v;
          rendre();
        }
      })
      .catch(() => {});
  }

  // ---------- Fiche d'un point quelconque (appui long, clic droit) ----------
  let numeroPoint = 0;
  async function ouvrirPoint(lngLat) {
    if (controleur) controleur.abort();
    courant?.point?.arreter();
    const numero = ++numeroPoint;
    const { creerFichePoint } = await import('./fiche-point.js');
    if (numero !== numeroPoint) return; // un autre appui long entre-temps
    const fiche = { lng: lngLat.lng, lat: lngLat.lat };
    fiche.point = creerFichePoint({
      lng: fiche.lng,
      lat: fiche.lat,
      maj: () => courant === fiche && rendre(),
      fermer: () => courant === fiche && fermer(),
    });
    courant = fiche;
    poserPin(lngLat, fiche.point.pin);
    panneau.hidden = false;
    panneau.scrollTop = 0;
    window.dispatchEvent(new Event('fiche-ouverte'));
    rendre();
  }

  const DUREE_APPUI = 500;
  const TOLERANCE_APPUI = 10;
  const conteneur = map.getCanvasContainer();
  let appui = null;
  let derniereTouche = 0;
  let absorberClicJusqua = 0;
  let appuiDeclenche = false;
  let clicDroit = null;

  const annulerAppui = () => {
    if (appui) clearTimeout(appui.minuteur);
    appui = null;
  };
  const versCarte = (x, y) => {
    const cadre = conteneur.getBoundingClientRect();
    return map.unproject([x - cadre.left, y - cadre.top]);
  };
  const surLaCarte = (cible) => cible === map.getCanvas();

  conteneur.addEventListener('touchstart', (e) => {
    derniereTouche = Date.now();
    annulerAppui();
    if (e.touches.length !== 1 || bloque || !surLaCarte(e.target)) return;
    const { clientX: x, clientY: y } = e.touches[0];
    appui = {
      x,
      y,
      minuteur: setTimeout(() => {
        appui = null;
        if (bloque) return;
        // Le doigt se relève après l'appui : ce « clic » ne doit rien ouvrir d'autre
        appuiDeclenche = true;
        absorberClicJusqua = Infinity;
        navigator.vibrate?.(15);
        ouvrirPoint(versCarte(x, y));
      }, DUREE_APPUI),
    };
  }, { passive: true });
  conteneur.addEventListener('touchmove', (e) => {
    if (!appui) return;
    const { clientX, clientY } = e.touches[0];
    if (e.touches.length > 1 || Math.hypot(clientX - appui.x, clientY - appui.y) > TOLERANCE_APPUI) annulerAppui();
  }, { passive: true });
  conteneur.addEventListener('touchend', () => {
    derniereTouche = Date.now();
    annulerAppui();
    if (appuiDeclenche) absorberClicJusqua = Date.now() + 400;
    appuiDeclenche = false;
  }, { passive: true });
  conteneur.addEventListener('touchcancel', () => {
    annulerAppui();
    if (appuiDeclenche) absorberClicJusqua = Date.now() + 400;
    appuiDeclenche = false;
  }, { passive: true });
  map.on('movestart', (e) => {
    // Un déplacement par le doigt annule l'appui ; un recentrage programmé, non
    if (e.originalEvent) annulerAppui();
  });

  // Souris : clic droit sans déplacement (un clic droit glissé fait tourner la carte)
  conteneur.addEventListener('mousedown', (e) => {
    clicDroit = e.button === 2 && surLaCarte(e.target) ? { x: e.clientX, y: e.clientY } : null;
  });
  conteneur.addEventListener('mouseup', (e) => {
    const depart = clicDroit;
    clicDroit = null;
    if (e.button !== 2 || !depart || bloque || Date.now() - derniereTouche < 1500) return;
    if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 4) return;
    ouvrirPoint(versCarte(e.clientX, e.clientY));
  });
  // Ni menu du navigateur, ni « enregistrer l'image » sur la carte
  conteneur.addEventListener('contextmenu', (e) => {
    if (surLaCarte(e.target)) e.preventDefault();
  });
  // Absorbe le clic qui suit un appui long, avant que MapLibre et les autres outils ne le voient
  map.getContainer().addEventListener('click', (e) => {
    if (Date.now() > absorberClicJusqua) return;
    absorberClicJusqua = 0;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ---------- Interaction avec la carte ----------
  const couchesActives = () => Object.keys(GENRE_PAR_COUCHE).filter((id) => map.getLayer(id));
  const rang = (f) => PRIORITE.indexOf(GENRE_PAR_COUCHE[f.layer.id]);

  function chercher(point, tolerance) {
    const ids = couchesActives();
    if (!ids.length) return [];
    const boite = [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance],
    ];
    return map.queryRenderedFeatures(boite, { layers: ids });
  }

  map.on('click', (e) => {
    if (bloque) return;
    const cible = e.originalEvent && e.originalEvent.target;
    if (cible && cible.closest && cible.closest('.maplibregl-marker, .maplibregl-popup, .maplibregl-ctrl')) return;

    const trouves = chercher(e.point, 8);
    if (!trouves.length) {
      fermer();
      return;
    }

    trouves.sort((a, b) => rang(a) - rang(b) || (b.properties && b.properties.name ? 1 : 0) - (a.properties && a.properties.name ? 1 : 0));
    const f = trouves[0];
    const genre = GENRE_PAR_COUCHE[f.layer.id];
    const lngLat =
      f.geometry && f.geometry.type === 'Point'
        ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
        : e.lngLat;
    ouvrir(f, genre, lngLat);
  });

  // Curseur « main » au survol d'un élément cliquable
  let enAttente = false;
  map.on('mousemove', (e) => {
    if (enAttente || bloque) return;
    enAttente = true;
    requestAnimationFrame(() => {
      enAttente = false;
      const sur = chercher(e.point, 6).length > 0;
      if (sur && !curseurMain) {
        map.getCanvas().style.cursor = 'pointer';
        curseurMain = true;
      } else if (!sur && curseurMain) {
        map.getCanvas().style.cursor = '';
        curseurMain = false;
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panneau.hidden) fermer();
  });
}