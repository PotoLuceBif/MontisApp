import * as maplibregl from 'maplibre-gl';

const URLS_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

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

const NOMS_LIEUX = { city: 'Ville', town: 'Ville', village: 'Village', hamlet: 'Hameau' };
const NOMS_COURS = { river: 'Rivière', stream: 'Ruisseau', canal: 'Canal' };
const NOMS_EAUX = { lake: 'Lac', ocean: 'Mer ou océan', river: 'Cours d’eau', pond: 'Étang' };
const NOMS_PARCS = { national_park: 'Parc national', nature_reserve: 'Réserve naturelle', protected_area: 'Zone protégée' };

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
    case 'sommet': return { icone: '⛰️', type: 'Sommet', nom, ele: p.ele };
    case 'refuge':
      return {
        icone: '🛖',
        type: p.genre === 'libre' ? 'Cabane ou abri non gardé' : 'Refuge gardé',
        nom,
        ele: p.ele || undefined,
      };
    case 'lieu': return { icone: '🏘️', type: NOMS_LIEUX[p.class] || 'Lieu', nom };
    case 'riviere': return { icone: '🌊', type: NOMS_COURS[p.class] || 'Cours d’eau', nom };
    case 'lac': return { icone: '💧', type: NOMS_EAUX[p.class] || 'Plan d’eau', nom };
    case 'glacier': return { icone: '🧊', type: 'Glacier', nom };
    case 'foret': return { icone: '🌲', type: 'Forêt', nom };
    default:
      return { icone: '🌿', type: NOMS_PARCS[p.class] || (p.class ? humaniser(p.class) : 'Zone protégée'), nom };
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

// ---------- Altitude lue dans les tuiles de relief (même source que la 3D) ----------
const ZOOM_DEM = 12;
const tuilesDem = new Map();

function chargerTuileDem(z, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      resolve(g.getImageData(0, 0, 256, 256).data);
    };
    img.onerror = () => reject(new Error('Tuile de relief indisponible'));
    img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  });
}

async function altitudeDem(lng, lat) {
  const n = 2 ** ZOOM_DEM;
  const xf = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  const cle = `${x}/${y}`;

  let donnees = tuilesDem.get(cle);
  if (!donnees) {
    donnees = await chargerTuileDem(ZOOM_DEM, x, y);
    tuilesDem.set(cle, donnees);
  }
  const px = Math.min(255, Math.floor((xf - x) * 256));
  const py = Math.min(255, Math.floor((yf - y) * 256));
  const i = (py * 256 + px) * 4;
  // Encodage « terrarium » : altitude = R × 256 + G + B / 256 − 32768
  return donnees[i] * 256 + donnees[i + 1] + donnees[i + 2] / 256 - 32768;
}

// Essaie chaque serveur Overpass à tour de rôle (le serveur principal est souvent saturé)
async function interroger(requete, signal) {
  let derniereErreur = null;
  for (const url of URLS_OVERPASS) {
    try {
      const rep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(requete),
        signal,
      });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const json = await rep.json();
      if (json.remark && /error|timeout/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      derniereErreur = e;
    }
  }
  throw derniereErreur;
}

export function initFiches(map) {
  const panneau = document.createElement('aside');
  panneau.id = 'fiche';
  panneau.setAttribute('role', 'dialog');
  panneau.setAttribute('aria-label', 'Informations sur l’élément');
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
    const nom = f.nom || (d && d.principal && d.principal.tags.name) || '';
    panneau.replaceChildren();

    // En-tête
    const entete = document.createElement('div');
    entete.className = 'fiche-entete';
    const icone = document.createElement('div');
    icone.className = 'fiche-icone';
    icone.textContent = f.icone;
    const titres = document.createElement('div');
    titres.className = 'fiche-titres';
    const titre = document.createElement('div');
    titre.className = 'fiche-nom';
    titre.textContent = nom || f.type;
    const sous = document.createElement('div');
    sous.className = 'fiche-type';
    sous.textContent = nom ? f.type : d ? 'Nom non renseigné dans OpenStreetMap' : '';
    titres.append(titre, sous);
    const fermerBtn = document.createElement('button');
    fermerBtn.type = 'button';
    fermerBtn.className = 'fiche-fermer';
    fermerBtn.setAttribute('aria-label', 'Fermer');
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
    copier.textContent = 'Copier';
    copier.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texteCoord);
        copier.textContent = 'Copié ✓';
      } catch (e) {
        copier.textContent = 'Indisponible';
      }
      setTimeout(() => (copier.textContent = 'Copier'), 1500);
    });
    pos.append(code, copier);
    corps.appendChild(ligne('Position', pos));

    const eleOsm = parseFloat(f.ele ?? (d && d.principal && d.principal.tags.ele));
    if (Number.isFinite(eleOsm)) {
      corps.appendChild(ligne('Altitude', `${Math.round(eleOsm).toLocaleString('fr-FR')} m`));
    } else if (Number.isFinite(f.eleDem)) {
      corps.appendChild(ligne('Altitude', `≈ ${Math.round(f.eleDem).toLocaleString('fr-FR')} m (relief)`));
    }

    if (d && d.localisation.length) corps.appendChild(ligne('Localisation', d.localisation.join(' · ')));
    if (d && f.genre !== 'parc' && d.parcs.length) {
      corps.appendChild(ligne('Zone protégée', d.parcs.slice(0, 3).map((p) => p.tags.name).join(' · ')));
    }
    if (d && d.principal && f.genre === 'refuge') {
      const t = d.principal.tags;
      const places = t.capacity || t.beds;
      if (places) corps.appendChild(ligne('Couchages', String(places)));
      const tel = t.phone || t['contact:phone'];
      if (tel) corps.appendChild(ligne('Téléphone', tel));
      if (t.opening_hours) corps.appendChild(ligne('Ouverture', t.opening_hours));
      const resa = { required: 'Obligatoire', recommended: 'Recommandée', yes: 'Possible', no: 'Non', members_only: 'Réservée aux membres' };
      if (t.reservation) corps.appendChild(ligne('Réservation', resa[t.reservation] || t.reservation));
    }
    if (f.details === 'chargement') {
      const att = document.createElement('div');
      att.className = 'fiche-attente-ligne';
      const spin = document.createElement('span');
      spin.className = 'rech-attente';
      att.append(spin, 'Recherche des détails…');
      corps.appendChild(att);
    } else if (f.details === 'erreur') {
      const err = document.createElement('div');
      err.className = 'fiche-attente-ligne';
      err.textContent = 'Détails indisponibles pour le moment.';
      corps.appendChild(err);
    }

    if (d && d.principal) {
      const t = d.principal.tags;
      const liens = document.createElement('div');
      liens.className = 'fiche-liens';
      const wiki = lienWikipedia(t.wikipedia);
      if (wiki) liens.appendChild(lien('Wikipédia', wiki));
      const site = t.website || t['contact:website'];
      if (site && /^https?:\/\//i.test(site)) liens.appendChild(lien('Site web', site));
      liens.appendChild(lien('OpenStreetMap', `https://www.openstreetmap.org/${d.principal.type}/${d.principal.id}`));
      corps.appendChild(ligne('Liens', liens));
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
  function poserAnneau(lngLat) {
    if (!anneau) {
      const el = document.createElement('div');
      el.className = 'fiche-point';
      anneau = new maplibregl.Marker({ element: el, anchor: 'center' });
    }
    anneau.setLngLat([lngLat.lng, lngLat.lat]).addTo(map);
  }

  function fermer() {
    if (controleur) controleur.abort();
    courant = null;
    panneau.hidden = true;
    if (anneau) anneau.remove();
  }

  function ouvrir(feature, genre, lngLat) {
    const d = decrire(feature, genre);
    courant = {
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
    rendre();
    chargerDetails(courant);

    // Altitude de repli, lue dans les données de relief
    const fiche = courant;
    altitudeDem(lngLat.lng, lngLat.lat)
      .then((v) => {
        if (courant === fiche && Number.isFinite(v)) {
          fiche.eleDem = v;
          rendre();
        }
      })
      .catch(() => {});
  }

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