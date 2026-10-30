import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { afficherRefuges } from './lieux.js';
import {
  niveau,
  distance,
  chercher,
  dansLaZone,
  detailsItineraire,
  extraireTrace,
  echantillonner,
  NOMS_SAC,
} from './rando-api.js';
import {
  altitudesDuTrace,
  lisser,
  denivele,
  dureeEstimee,
  formaterDuree,
  creerProfil,
  telechargerGpx,
} from './rando-profil.js';

const ZOOM_MIN_ZONE = 9;
const COULEUR_TRACE = '#e8590c';
const TAILLE_MAX_GPX = 10 * 1024 * 1024;
const LATITUDE_MAX_MERCATOR = 85.05112878;

const vide = () => ({ type: 'FeatureCollection', features: [] });

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

const titreDe = (r) => {
  const ref = r.ref || '';
  const nom = r.name || '';
  if (ref && nom && !nom.includes(ref)) return `${ref} · ${nom}`;
  return nom || ref || 'Itinéraire sans nom';
};

function lienWikipedia(tag) {
  if (!tag) return null;
  const i = tag.indexOf(':');
  const langue = i > 0 ? tag.slice(0, i) : 'fr';
  const titre = i > 0 ? tag.slice(i + 1) : tag;
  if (!/^[a-z-]{2,10}$/i.test(langue)) return null;
  return `https://${langue}.wikipedia.org/wiki/${encodeURIComponent(titre.replace(/ /g, '_'))}`;
}

function lienExterne(texte, url) {
  const a = el('a', null, texte);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

const km = (m) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
const metres = (m) => `${Math.round(m).toLocaleString('fr-FR')} m`;

function echantillonnerLignes(lignes) {
  const segments = lignes
    .map((points) => {
      const cumuls = [0];
      for (let i = 1; i < points.length; i++) {
        cumuls.push(cumuls[i - 1] + distance(points[i - 1], points[i]));
      }
      return { points, cumuls, longueur: cumuls[cumuls.length - 1] };
    })
    .filter((segment) => segment.longueur > 0);
  const total = segments.reduce((somme, segment) => somme + segment.longueur, 0);
  if (!(total > 0)) return { points: [], total: 0 };

  const n = Math.min(500, Math.max(20, Math.round(total / 40)));
  const points = [];
  let segmentIndex = 0;
  let pointIndex = 1;
  let distanceSegment = 0;
  for (let i = 0; i < n; i++) {
    const cible = (total * i) / (n - 1);
    while (
      segmentIndex < segments.length - 1 &&
      cible > distanceSegment + segments[segmentIndex].longueur
    ) {
      distanceSegment += segments[segmentIndex].longueur;
      segmentIndex++;
      pointIndex = 1;
    }

    const segment = segments[segmentIndex];
    const locale = cible - distanceSegment;
    while (pointIndex < segment.cumuls.length - 1 && segment.cumuls[pointIndex] < locale) {
      pointIndex++;
    }
    const avant = segment.cumuls[pointIndex - 1];
    const apres = segment.cumuls[pointIndex];
    const t = apres > avant ? (locale - avant) / (apres - avant) : 0;
    const a = segment.points[pointIndex - 1];
    const b = segment.points[pointIndex];
    points.push({
      lng: a[0] + (b[0] - a[0]) * t,
      lat: a[1] + (b[1] - a[1]) * t,
      d: cible,
    });
  }
  return { points, total };
}

function lireGpx(contenu, nomFichier) {
  const documentXml = new DOMParser().parseFromString(contenu, 'application/xml');
  if (
    documentXml.getElementsByTagName('parsererror').length ||
    documentXml.documentElement.localName !== 'gpx'
  ) {
    throw new Error('Le fichier ne contient pas un GPX valide.');
  }

  const lirePoints = (element, nomPoint) => {
    const points = [];
    for (const point of element.getElementsByTagNameNS('*', nomPoint)) {
      const longitude = point.getAttribute('lon');
      const latitude = point.getAttribute('lat');
      if (longitude == null || !longitude.trim() || latitude == null || !latitude.trim()) continue;
      const lng = Number(longitude);
      const lat = Number(latitude);
      if (
        !Number.isFinite(lng) || lng < -180 || lng > 180 ||
        !Number.isFinite(lat) || lat < -LATITUDE_MAX_MERCATOR || lat > LATITUDE_MAX_MERCATOR
      ) continue;
      points.push([lng, lat]);
    }
    return points;
  };

  const lignesTrace = [];
  for (const segment of documentXml.getElementsByTagNameNS('*', 'trkseg')) {
    const points = lirePoints(segment, 'trkpt');
    if (points.length > 1) lignesTrace.push(points);
  }
  if (!lignesTrace.length) {
    for (const route of documentXml.getElementsByTagNameNS('*', 'rte')) {
      const points = lirePoints(route, 'rtept');
      if (points.length > 1) lignesTrace.push(points);
    }
  }
  if (!lignesTrace.length) {
    throw new Error('Aucun tracé valide trouvé (il faut au moins deux points GPS).');
  }

  const chaine = lignesTrace.flat();
  const longueur = lignesTrace.reduce((total, ligne) => {
    for (let i = 1; i < ligne.length; i++) total += distance(ligne[i - 1], ligne[i]);
    return total;
  }, 0);
  if (longueur <= 0) throw new Error('Le tracé ne contient pas de distance exploitable.');

  const metadata = documentXml.getElementsByTagNameNS('*', 'metadata')[0];
  const nomGpx =
    metadata?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() ||
    documentXml.getElementsByTagNameNS('*', 'trk')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() ||
    documentXml.getElementsByTagNameNS('*', 'rte')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim();
  const nom = nomGpx || nomFichier.replace(/\.gpx$/i, '') || 'Parcours importé';
  return { nom, trace: { lignes: lignesTrace, chaine }, longueur };
}

export function creerActiviteRandonnee(map) {
  let actif = false;
  let onglet = lire('rando-onglet', 'grandes');
  if (onglet !== 'grandes' && onglet !== 'locales') onglet = 'grandes';
  let recherche = '';
  let etatRech = 'vide'; // vide | attente | ok | erreur
  let etatZone = 'loin'; // loin | chargement | ok | erreur
  let resultatsRecherche = [];
  let resultatsZone = [];
  let minuteurZone = null;
  let minuteurRech = null;
  let ctrlZone = null;
  let ctrlRech = null;
  let selection = 0;
  let fiche = null;
  let curseurCarte = null;
  let ecouteurPose = false;

  // ---------- Panneau du menu ----------
  const panneau = el('div', 'rando');
  panneau.innerHTML = `
    <label class="rando-importer">
      <span>Importer un fichier GPX</span>
      <span class="rando-import-action">Choisir un fichier</span>
      <input type="file" class="rando-fichier" accept=".gpx,application/gpx+xml,application/xml,text/xml">
    </label>
    <p class="note rando-import-message" role="status" aria-live="polite"></p>
    <input type="text" class="rando-champ" placeholder="Rechercher : GR 5, Tour du Mont-Blanc…"
      autocomplete="off" spellcheck="false" inputmode="search" aria-label="Rechercher un itinéraire">
    <div class="segments rando-onglets" role="group">
      <button type="button" data-onglet="grandes">Grandes randos</button>
      <button type="button" data-onglet="locales">Randos locales</button>
    </div>
    <p class="note rando-aide"></p>
    <div class="rando-liste"></div>
    <div class="rando-options">
      <label class="option-case"><input type="checkbox" id="rando-refuges"> Refuges
        <small>Même réglage que dans Éléments de la carte</small></label>
      <label class="option-case"><input type="checkbox" id="rando-apercu"> Aperçu des sentiers
        <small>Superpose tous les sentiers balisés (Waymarked Trails)</small></label>
    </div>
    <p class="note">Itinéraires : © contributeurs OpenStreetMap · Waymarked Trails</p>
  `;
  const champFichier = panneau.querySelector('.rando-fichier');
  const messageImport = panneau.querySelector('.rando-import-message');
  const champ = panneau.querySelector('.rando-champ');
  const ongletsEl = panneau.querySelector('.rando-onglets');
  const boutonsOnglets = ongletsEl.querySelectorAll('button');
  const aide = panneau.querySelector('.rando-aide');
  const liste = panneau.querySelector('.rando-liste');
  const caseRefuges = panneau.querySelector('#rando-refuges');
  const caseApercu = panneau.querySelector('#rando-apercu');
  caseRefuges.checked = !!lire('refuges', false);
  caseApercu.checked = !!lire('rando-apercu', false);

  // ---------- Fiche d'itinéraire (en bas de la carte) ----------
  const carte = el('aside');
  carte.id = 'rando-fiche';
  carte.hidden = true;
  document.body.appendChild(carte);

  // ---------- Tracé sur la carte ----------
  function assurerCouches() {
    if (map.getSource('rando-trace')) return;
    map.addSource('rando-trace', { type: 'geojson', data: vide() });
    map.addSource('rando-points', { type: 'geojson', data: vide() });
    const lissage = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({
      id: 'rando-trace-contour',
      type: 'line',
      source: 'rando-trace',
      layout: lissage,
      paint: {
        'line-color': '#ffffff',
        'line-opacity': 0.95,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 9],
      },
    });
    map.addLayer({
      id: 'rando-trace',
      type: 'line',
      source: 'rando-trace',
      layout: lissage,
      paint: {
        'line-color': COULEUR_TRACE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 14, 5],
      },
    });
    map.addLayer({
      id: 'rando-points',
      type: 'circle',
      source: 'rando-points',
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'role'], 'depart', '#2e9e5b', '#c0392b'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
      },
    });
  }

  function dessinerTrace(trace) {
    assurerCouches();
    map.getSource('rando-trace').setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: trace.lignes } }],
    });
    const points = [];
    const c = trace.chaine;
    if (c.length > 1) {
      points.push({ type: 'Feature', properties: { role: 'depart' }, geometry: { type: 'Point', coordinates: c[0] } });
      if (distance(c[0], c[c.length - 1]) > 200) {
        points.push({
          type: 'Feature',
          properties: { role: 'arrivee' },
          geometry: { type: 'Point', coordinates: c[c.length - 1] },
        });
      }
    }
    map.getSource('rando-points').setData({ type: 'FeatureCollection', features: points });
  }

  function effacerTrace() {
    if (!map.getSource('rando-trace')) return;
    map.getSource('rando-trace').setData(vide());
    map.getSource('rando-points').setData(vide());
  }

  function cadrer(trace) {
    let ouest = 180;
    let sud = 90;
    let est = -180;
    let nord = -90;
    for (const ligne of trace.lignes) {
      for (const [lng, lat] of ligne) {
        if (lng < ouest) ouest = lng;
        if (lng > est) est = lng;
        if (lat < sud) sud = lat;
        if (lat > nord) nord = lat;
      }
    }
    const h = map.getContainer().clientHeight;
    const l = map.getContainer().clientWidth;
    map.fitBounds(
      [[ouest, sud], [est, nord]],
      {
        padding: {
          top: Math.min(90, Math.round(h * 0.15)),
          bottom: Math.min(300, Math.round(h * 0.4)),
          left: Math.min(60, Math.round(l * 0.1)),
          right: Math.min(60, Math.round(l * 0.1)),
        },
        maxZoom: 15,
        duration: 1200,
      }
    );
  }

  // Point qui suit le survol du profil
  function surSurvol(p) {
    if (!p) {
      if (curseurCarte) curseurCarte.remove();
      return;
    }
    if (!curseurCarte) {
      curseurCarte = new maplibregl.Marker({ element: el('div', 'rando-curseur'), anchor: 'center' });
    }
    curseurCarte.setLngLat([p.lng, p.lat]).addTo(map);
  }

  // ---------- Aperçu de tous les sentiers (couche optionnelle) ----------
  function appliquerApercu() {
    const veut = actif && caseApercu.checked;
    if (veut) {
      if (!map.getSource('rando-apercu')) {
        map.addSource('rando-apercu', {
          type: 'raster',
          tiles: ['https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Sentiers : © Waymarked Trails (CC BY-SA), © contributeurs OpenStreetMap',
        });
      }
      if (!map.getLayer('rando-apercu')) {
        map.addLayer(
          { id: 'rando-apercu', type: 'raster', source: 'rando-apercu', paint: { 'raster-opacity': 0.8 } },
          map.getLayer('rando-trace-contour') ? 'rando-trace-contour' : undefined
        );
      }
    }
    if (map.getLayer('rando-apercu')) {
      map.setLayoutProperty('rando-apercu', 'visibility', veut ? 'visible' : 'none');
    }
  }

  // ---------- Fiche : affichage ----------
  const message = (t) => el('div', 'rando-attente', t);
  function attente(t) {
    const d = el('div', 'rando-attente');
    d.append(el('span', 'rech-attente'), t);
    return d;
  }
  function stat(valeur, libelle) {
    const s = el('div', 'rando-stat');
    s.append(el('strong', null, valeur), el('span', null, libelle));
    return s;
  }

  function rendreFiche() {
    carte.replaceChildren();
    if (!fiche) {
      carte.hidden = true;
      return;
    }
    carte.hidden = false;

    if (fiche.type === 'gpx') {
      const entete = el('div', 'rando-entete');
      const badge = el('span', 'rando-badge', 'GPX');
      badge.style.background = COULEUR_TRACE;
      const titres = el('div', 'rando-titres');
      titres.append(el('div', 'rando-nom', fiche.nom));
      entete.append(badge, titres);
      const fermer = el('button', 'fiche-fermer', '✕');
      fermer.type = 'button';
      fermer.setAttribute('aria-label', 'Fermer le tracé importé');
      fermer.addEventListener('click', fermerFiche);
      entete.append(fermer);
      const stats = el('div', 'rando-stats');
      stats.append(stat(km(fiche.longueur), 'Distance'));
      stats.append(stat(String(fiche.trace.lignes.length), 'Segments'));
      const profil = fiche.profil && typeof fiche.profil === 'object' ? fiche.profil : null;
      if (profil) {
        stats.append(stat(`+${Math.round(profil.plus).toLocaleString('fr-FR')} m`, 'Dénivelé +'));
        stats.append(stat(`−${Math.round(profil.moins).toLocaleString('fr-FR')} m`, 'Dénivelé −'));
        stats.append(stat(metres(profil.max), 'Altitude max'));
        stats.append(stat(metres(profil.min), 'Altitude min'));
        stats.append(stat(`≈ ${formaterDuree(dureeEstimee(fiche.longueur, profil.plus, profil.moins))}`, 'Durée estimée'));
      }
      carte.append(entete, stats);
      if (profil) carte.append(creerProfil(profil, surSurvol));
      else if (fiche.profil === 'calcul') carte.append(attente('Calcul du profil d’altitude…'));
      else if (fiche.profil === 'erreur') carte.append(message('Profil d’altitude indisponible (données de relief injoignables).'));
      return;
    }

    const { r, d, trace, profil, etat } = fiche;
    const tags = (d && d.tags) || {};
    const n = niveau((d && d.group) || r.group);
    const nom = titreDe({ ref: tags.ref || r.ref, name: (d && d.name) || r.name });

    // En-tête
    const entete = el('div', 'rando-entete');
    const badge = el('span', 'rando-badge', n.court);
    badge.style.background = n.couleur;
    const titres = el('div', 'rando-titres');
    titres.append(el('div', 'rando-nom', nom));
    const etapes = (d && d.itinerary) || r.itinerary;
    if (etapes && etapes.length) titres.append(el('div', 'rando-sous', etapes.join(' → ')));
    const fermer = el('button', 'fiche-fermer', '✕');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.addEventListener('click', fermerFiche);
    entete.append(badge, titres, fermer);
    carte.append(entete);

    if (etat === 'chargement') {
      carte.append(attente('Chargement de l’itinéraire…'));
      return;
    }
    if (etat === 'erreur') {
      carte.append(message('Itinéraire indisponible pour le moment. Réessayez dans un instant.'));
      return;
    }
    if (etat === 'sans-trace') {
      carte.append(message('Cet itinéraire n’a pas de tracé propre dans les données.'));
      const sous = d && Array.isArray(d.subroutes) ? d.subroutes.filter((s) => s && s.id != null) : [];
      if (sous.length) {
        const bloc = el('div', 'rando-actions');
        bloc.append(el('span', null, 'Composé de :'));
        for (const s of sous.slice(0, 12)) {
          const b = el('button', 'fiche-copier', titreDe(s));
          b.type = 'button';
          b.addEventListener('click', () => ouvrirItineraire(s));
          bloc.append(b);
        }
        carte.append(bloc);
      }
      return;
    }

    // Statistiques
    const p = profil && typeof profil === 'object' ? profil : null;
    const longueur = (d && d.route && d.route.length) || (p && p.total) || null;
    const stats = el('div', 'rando-stats');
    if (longueur) stats.append(stat(km(longueur), 'Distance'));
    if (p) {
      stats.append(stat(`+${Math.round(p.plus).toLocaleString('fr-FR')} m`, 'Dénivelé +'));
      stats.append(stat(`−${Math.round(p.moins).toLocaleString('fr-FR')} m`, 'Dénivelé −'));
      stats.append(stat(metres(p.max), 'Altitude max'));
      stats.append(stat(metres(p.min), 'Altitude min'));
      stats.append(stat(`≈ ${formaterDuree(dureeEstimee(longueur || p.total, p.plus, p.moins))}`, 'Durée estimée'));
    } else if (profil === 'calcul') {
      stats.append(stat('…', 'Dénivelé et altitudes'));
    }
    carte.append(stats);
    if (trace.sac != null) {
      carte.append(el('div', 'rando-diff', `Difficulté maximale (échelle SAC) : ${NOMS_SAC[trace.sac]}`));
    }

    // Profil d'altitude
    if (p) carte.append(creerProfil(p, surSurvol));
    else if (profil === 'calcul') carte.append(attente('Calcul du profil d’altitude…'));
    else if (profil === 'non-lineaire')
      carte.append(message('Itinéraire non linéaire (boucles ou variantes) : profil non calculé.'));
    else if (profil === 'erreur')
      carte.append(message('Profil d’altitude indisponible (données de relief injoignables).'));

    // Actions et liens
    const actions = el('div', 'rando-actions');
    const gpx = el('button', 'fiche-copier', 'Télécharger le GPX');
    gpx.type = 'button';
    gpx.disabled = !p;
    gpx.title = p ? '' : 'Disponible quand le profil est calculé';
    if (p) gpx.addEventListener('click', () => telechargerGpx(nom, p.points, p.altsBrutes));
    actions.append(gpx);

    const liens = el('span', 'fiche-liens');
    const wiki = lienWikipedia(tags.wikipedia);
    if (wiki) liens.append(lienExterne('Wikipédia', wiki));
    const site = tags.website || tags.url;
    if (site && /^https?:\/\//i.test(site)) liens.append(lienExterne('Site web', site));
    liens.append(lienExterne('OpenStreetMap', `https://www.openstreetmap.org/relation/${r.id}`));
    actions.append(liens);
    carte.append(actions);
  }

  function fermerFiche() {
    selection++;
    fiche = null;
    effacerTrace();
    surSurvol(null);
    rendreFiche();
  }

  // ---------- Ouverture d'un itinéraire ----------
  async function ouvrirItineraire(r) {
    const jeton = ++selection;
    fiche = { r, d: null, trace: null, profil: null, etat: 'chargement' };
    effacerTrace();
    surSurvol(null);
    rendreFiche();

    try {
      const d = await detailsItineraire(r.id);
      if (jeton !== selection) return;
      const trace = extraireTrace(d);
      fiche.d = d;
      fiche.trace = trace;

      if (!trace.lignes.length) {
        fiche.etat = 'sans-trace';
        rendreFiche();
        return;
      }

      fiche.etat = 'pret';
      dessinerTrace(trace);
      cadrer(trace);

      const lineaire = d.linear !== 'no' && trace.chaine.length > 1;
      fiche.profil = lineaire ? 'calcul' : 'non-lineaire';
      rendreFiche();
      if (lineaire) await calculerProfil(jeton);
    } catch (e) {
      if (jeton !== selection) return;
      fiche.etat = 'erreur';
      rendreFiche();
      console.warn('Itinéraire :', e);
    }
  }

  champFichier.addEventListener('change', async () => {
    const fichier = champFichier.files[0];
    messageImport.textContent = '';
    if (!fichier) return;
    champFichier.value = '';

    if (fichier.size > TAILLE_MAX_GPX) {
      messageImport.textContent = 'Le fichier est trop volumineux (maximum 10 Mo).';
      return;
    }

    const jeton = ++selection;
    messageImport.textContent = 'Lecture du fichier GPX…';
    try {
      const resultat = lireGpx(await fichier.text(), fichier.name);
      if (jeton !== selection) return;
      fiche = { type: 'gpx', ...resultat };
      fiche.profil = 'calcul';
      effacerTrace();
      surSurvol(null);
      dessinerTrace(fiche.trace);
      cadrer(fiche.trace);
      rendreFiche();
      messageImport.textContent = `Parcours importé : ${fiche.nom}`;
      await calculerProfil(jeton);
    } catch (e) {
      if (jeton !== selection) return;
      messageImport.textContent = e instanceof Error ? e.message : 'Impossible de lire ce fichier GPX.';
      console.warn('Import GPX :', e);
    }
  });

  async function calculerProfil(jeton) {
    const f = fiche;
    try {
      const { points, total } = f.type === 'gpx'
        ? echantillonnerLignes(f.trace.lignes)
        : echantillonner(f.trace.chaine);
      if (points.length < 2) throw new Error('Tracé trop court');
      const brutes = await altitudesDuTrace(points, total);
      if (jeton !== selection) return;
      const lisses = lisser(brutes, 2);
      const { plus, moins } = denivele(lisses, 3);
      f.profil = {
        points,
        altsBrutes: brutes,
        alts: lisses,
        total,
        plus,
        moins,
        min: Math.min(...lisses),
        max: Math.max(...lisses),
      };
    } catch (e) {
      if (jeton !== selection) return;
      f.profil = 'erreur';
      console.warn('Profil d’altitude :', e);
    }
    rendreFiche();
  }

  // ---------- Liste des itinéraires ----------
  function creerItem(r) {
    const n = niveau(r.group);
    const item = el('div', 'rando-item');
    const badge = el('span', 'rando-badge', n.court);
    badge.style.background = n.couleur;
    const textes = el('div', 'rando-item-textes');
    textes.append(el('div', 'rando-item-nom', titreDe(r)));
    const sous = r.itinerary && r.itinerary.length ? r.itinerary.join(' → ') : r.local_name || '';
    if (sous) textes.append(el('div', 'rando-item-sous', sous));
    item.append(badge, textes);
    item.addEventListener('click', () => ouvrirItineraire(r));
    return item;
  }

  function rendreListe() {
    const enRecherche = recherche.length >= 2;
    ongletsEl.hidden = enRecherche;
    liste.replaceChildren();

    const grandes = resultatsZone.filter((r) => niveau(r.group).grand);
    const locales = resultatsZone.filter((r) => !niveau(r.group).grand);
    boutonsOnglets.forEach((b) => {
      const g = b.dataset.onglet === 'grandes';
      const nb = etatZone === 'ok' ? (g ? grandes.length : locales.length) : 0;
      b.textContent = (g ? 'Grandes randos' : 'Randos locales') + (nb ? ` · ${nb}` : '');
      b.classList.toggle('actif', b.dataset.onglet === onglet);
    });

    let items = [];
    let texte = '';
    let titreAide = '';

    if (enRecherche) {
      if (etatRech === 'attente') texte = 'Recherche…';
      else if (etatRech === 'erreur') texte = 'Recherche indisponible pour le moment.';
      else {
        items = resultatsRecherche;
        if (!items.length) texte = `Aucun itinéraire pour « ${recherche} »`;
        else titreAide = `${items.length} résultat${items.length > 1 ? 's' : ''}`;
      }
    } else if (etatZone === 'loin') {
      texte = 'Zoomez (niveau 9 ou plus) pour lister les itinéraires de la zone visible.';
    } else if (etatZone === 'chargement') {
      texte = 'Chargement des itinéraires de la zone…';
    } else if (etatZone === 'erreur') {
      texte = 'Service d’itinéraires indisponible. Réessayez dans un instant.';
    } else {
      items = onglet === 'grandes' ? grandes : locales;
      if (!items.length) texte = 'Aucun itinéraire de ce type dans la zone visible.';
      else titreAide = 'Dans la zone visible, les plus importants d’abord';
    }

    aide.textContent = titreAide;
    aide.hidden = !titreAide;
    items.forEach((r) => liste.appendChild(creerItem(r)));
    if (texte) liste.appendChild(el('div', 'rando-message', texte));
  }

  // ---------- Itinéraires de la zone visible ----------
  async function majZone() {
    if (!actif || recherche.length >= 2) return;
    if (map.getZoom() < ZOOM_MIN_ZONE) {
      etatZone = 'loin';
      rendreListe();
      return;
    }
    if (ctrlZone) ctrlZone.abort();
    ctrlZone = new AbortController();
    etatZone = 'chargement';
    rendreListe();
    try {
      resultatsZone = await dansLaZone(map.getBounds(), ctrlZone.signal);
      etatZone = 'ok';
    } catch (e) {
      if (e.name === 'AbortError') return;
      etatZone = 'erreur';
      console.warn('Itinéraires de la zone :', e);
    }
    rendreListe();
  }

  function planifierZone() {
    clearTimeout(minuteurZone);
    minuteurZone = setTimeout(majZone, 700);
  }

  // ---------- Recherche ----------
  async function lancerRecherche(q) {
    if (ctrlRech) ctrlRech.abort();
    ctrlRech = new AbortController();
    etatRech = 'attente';
    rendreListe();
    try {
      resultatsRecherche = await chercher(q, ctrlRech.signal);
      if (q !== recherche) return;
      etatRech = 'ok';
    } catch (e) {
      if (e.name === 'AbortError') return;
      etatRech = 'erreur';
      console.warn('Recherche d’itinéraires :', e);
    }
    rendreListe();
  }

  champ.addEventListener('input', () => {
    recherche = champ.value.trim();
    clearTimeout(minuteurRech);
    if (recherche.length < 2) {
      if (ctrlRech) ctrlRech.abort();
      etatRech = 'vide';
      rendreListe();
      majZone();
      return;
    }
    etatRech = 'attente';
    rendreListe();
    minuteurRech = setTimeout(() => lancerRecherche(recherche), 350);
  });

  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && recherche.length >= 2) {
      clearTimeout(minuteurRech);
      lancerRecherche(recherche);
    }
  });

  boutonsOnglets.forEach((b) =>
    b.addEventListener('click', () => {
      onglet = b.dataset.onglet;
      ecrire('rando-onglet', onglet);
      rendreListe();
    })
  );

  // ---------- Options : refuges (partagé avec Éléments de la carte) et aperçu ----------
  caseRefuges.addEventListener('change', () => {
    afficherRefuges(map, caseRefuges.checked);
    ecrire('refuges', caseRefuges.checked);
    window.dispatchEvent(new CustomEvent('calque', { detail: { cle: 'refuges', actif: caseRefuges.checked } }));
  });
  window.addEventListener('calque', (e) => {
    if (e.detail.cle === 'refuges') caseRefuges.checked = e.detail.actif;
  });

  caseApercu.addEventListener('change', () => {
    ecrire('rando-apercu', caseApercu.checked);
    appliquerApercu();
  });

  rendreListe();

  // ---------- Cycle de vie de l'activité ----------
  function activer() {
    actif = true;
    if (!ecouteurPose) {
      map.on('moveend', planifierZone);
      ecouteurPose = true;
    }
    appliquerApercu();
    rendreListe();
    majZone();
  }

  function desactiver() {
    actif = false;
    clearTimeout(minuteurZone);
    clearTimeout(minuteurRech);
    if (ctrlZone) ctrlZone.abort();
    if (ctrlRech) ctrlRech.abort();
    fermerFiche();
    appliquerApercu();
  }

  return { id: 'rando', label: 'Randonnée', icone: 'rando', panneau, activer, desactiver };
}