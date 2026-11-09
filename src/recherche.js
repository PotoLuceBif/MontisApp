import * as maplibregl from 'maplibre-gl';
import { lire, ecrire } from './reglages.js';
import { obtenirBarre } from './barre-haut.js';
import { DECALAGE_PIN, creerPinSeul } from './pins.js';
import { t, ta, poser } from './i18n.js';
import { langue } from './preferences.js';
import { requete as requeteReseau } from './requete.js';

const URL_PHOTON = 'https://photon.komoot.io/api/';
const DELAI_FRAPPE = 300; // attend la fin de la frappe avant d'interroger le service
const NB_RESULTATS_AFFICHES = 12;
const NB_RESULTATS_RECHERCHE = 30;
const NB_RECENTS = 6;
const CLE_RECENTS = 'recherches-recentes';

const ICONE_LOUPE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

// ---------- Types de lieux (nom, icône, zoom d'arrivée) ----------
const CATEGORIES = [
  { test: (k, v) => k === 'natural' && (v === 'peak' || v === 'volcano'), type: 'sommet', icone: '⛰️', zoom: 13 },
  { test: (k, v) => (k === 'leisure' && v === 'ski_resort') || (k === 'landuse' && v === 'winter_sports') || (k === 'site' && v === 'piste'), type: 'station', icone: '🎿', zoom: 12 },
  { test: (k, v) => k === 'place' && v === 'locality', type: 'lieu-dit', icone: '📍', zoom: 14 },
  { test: (k, v) => k === 'mountain_pass' || (k === 'natural' && v === 'saddle'), type: 'col', icone: '⛰️', zoom: 13 },
  { test: (k, v) => k === 'natural' && v === 'glacier', type: 'glacier', icone: '🧊', zoom: 12 },
  { test: (k, v) => k === 'natural' && (v === 'water' || v === 'lake'), type: 'lac', icone: '💧', zoom: 13 },
  { test: (k) => k === 'waterway', type: 'cours-eau', icone: '🌊', zoom: 12 },
  { test: (k, v) => k === 'natural' && v === 'valley', type: 'vallee', icone: '🏞️', zoom: 12 },
  { test: (k, v) => k === 'tourism' && (v === 'alpine_hut' || v === 'wilderness_hut'), type: 'refuge', icone: '🛖', zoom: 15 },
  { test: (k, v) => k === 'place' && (v === 'city' || v === 'town'), type: 'ville', icone: '🏙️', zoom: 12 },
  { test: (k, v) => k === 'place' && (v === 'village' || v === 'hamlet' || v === 'isolated_dwelling'), type: 'village', icone: '🏘️', zoom: 14 },
];

// Repli selon le type renvoyé par le service
const TYPES = {
  city: { type: 'ville', icone: '🏙️', zoom: 12 },
  state: { type: 'region', icone: '🗺️', zoom: 8 },
  county: { type: 'departement', icone: '🗺️', zoom: 9 },
  country: { type: 'pays', icone: '🌍', zoom: 5 },
  district: { type: 'quartier', icone: '🏘️', zoom: 14 },
  locality: { type: 'lieu-dit', icone: '📍', zoom: 14 },
  street: { type: 'rue', icone: '🛣️', zoom: 16 },
  house: { type: 'adresse', icone: '🏠', zoom: 17 },
  other: { type: 'lieu', icone: '📍', zoom: 13 },
};

function categorie(p) {
  return CATEGORIES.find((c) => c.test(p.osm_key, p.osm_value)) || TYPES[p.type] || TYPES.other;
}

function groupeRecherche(p, cat) {
  if (cat.type === 'station') return 'station';
  if (p.type === 'locality' || (p.osm_key === 'place' && p.osm_value === 'locality')) return 'lieu-dit';
  if (
    (p.osm_key === 'place' && ['village', 'hamlet'].includes(p.osm_value)) ||
    ['village', 'hamlet'].includes(p.type)
  ) return 'village';
  return null;
}

// Transforme un résultat du service en objet simple, réutilisable (et mémorisable)
function normaliser(f) {
  const p = f.properties || {};
  const [lng, lat] = f.geometry.coordinates;
  const cat = categorie(p);
  const nom = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || t('rech.sans-nom');
  const lieux = [p.district, p.city, p.county, p.state, p.country].filter(
    (x, i, t) => x && x !== nom && t.indexOf(x) === i
  );
  const e = p.extent; // [ouest, nord, est, sud]
  const grandeZone = e && ['city', 'state', 'county', 'country', 'district'].includes(p.type);
  return {
    nom,
    // Le type se traduit à l'affichage ; les noms de lieux restent ceux du service
    type: cat.type,
    lieux: lieux.slice(0, 3).join(', '),
    icone: cat.icone,
    lng,
    lat,
    zoom: cat.zoom,
    bounds: grandeZone ? [[e[0], e[3]], [e[2], e[1]]] : null,
    cle: `${p.osm_type || ''}${p.osm_id || ''}`,
    groupe: groupeRecherche(p, cat),
  };
}

// Les recherches récentes d'avant cette version n'ont qu'un sous-titre déjà écrit
const sousTitre = (r) =>
  r.type ? [t(`rech.type.${r.type}`), r.lieux].filter(Boolean).join(' · ') : r.sous ?? '';

function equilibrerResultats(items) {
  const groupes = ['village', 'station', 'lieu-dit'];
  const prioritaires = groupes
    .map((groupe) => items.find((item) => item.groupe === groupe))
    .filter(Boolean);
  const selectionnes = new Set(prioritaires);
  return [...prioritaires, ...items.filter((item) => !selectionnes.has(item))];
}

// Reconnaît des coordonnées tapées à la main : « 45.88, 6.87 »
function lireCoordonnees(texte) {
  const m = texte.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const resultatGps = ({ lat, lng }) => ({
  nom: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  type: 'gps',
  lieux: '',
  icone: '🎯',
  lng,
  lat,
  zoom: 14,
  bounds: null,
  cle: 'gps',
});

export function initRecherche(map) {
  const racine = document.createElement('div');
  racine.id = 'recherche';
  racine.innerHTML = `
    <div class="rech-champ">
      <button type="button" class="rech-loupe" ${ta('aria-label', 'rech.rechercher')}>${ICONE_LOUPE}</button>
      <input type="text" id="rech-saisie" ${ta('placeholder', 'rech.rechercher')}
        autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"
        role="combobox" aria-expanded="false" aria-controls="rech-liste" aria-autocomplete="list">
      <span class="rech-attente" hidden></span>
      <button type="button" class="rech-effacer" ${ta('aria-label', 'rech.effacer')} hidden>✕</button>
    </div>
    <div class="rech-liste" id="rech-liste" role="listbox" hidden></div>
  `;
  obtenirBarre().appendChild(racine);

  const saisie = racine.querySelector('#rech-saisie');
  const loupe = racine.querySelector('.rech-loupe');
  const effacer = racine.querySelector('.rech-effacer');
  const attente = racine.querySelector('.rech-attente');
  const liste = racine.querySelector('#rech-liste');

  const mobile = () => window.matchMedia('(max-width: 640px)').matches;

  let resultats = [];
  let actif = -1;
  let requeteAffichee = '';
  let repere = null;
  let minuteur = null;
  let controleur = null;

  // ---------- Liste déroulante ----------
  function fermerListe() {
    liste.hidden = true;
    saisie.setAttribute('aria-expanded', 'false');
    saisie.removeAttribute('aria-activedescendant');
    actif = -1;
  }

  function ouvrirListe() {
    liste.hidden = false;
    saisie.setAttribute('aria-expanded', 'true');
  }

  function surligner(i) {
    liste.querySelectorAll('.rech-item').forEach((el, n) => el.classList.toggle('actif', n === i));
    actif = i;
    const el = liste.querySelector(`#rech-opt-${i}`);
    if (el) {
      saisie.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function creerLigne(r, i) {
    const ligne = document.createElement('div');
    ligne.className = 'rech-item';
    ligne.id = `rech-opt-${i}`;
    ligne.setAttribute('role', 'option');

    const icone = document.createElement('span');
    icone.className = 'rech-icone';
    icone.textContent = r.icone;

    const textes = document.createElement('div');
    textes.className = 'rech-textes';
    const nom = document.createElement('div');
    nom.className = 'rech-nom';
    nom.textContent = r.nom;
    const sous = document.createElement('div');
    sous.className = 'rech-sous';
    sous.textContent = sousTitre(r);
    textes.append(nom, sous);

    ligne.append(icone, textes);
    ligne.addEventListener('click', () => choisir(r));
    ligne.addEventListener('mousemove', () => {
      if (actif !== i) surligner(i);
    });
    return ligne;
  }

  function creerCredit() {
    const credit = document.createElement('div');
    credit.className = 'rech-credit';
    poser(credit, 'rech.credit');
    return credit;
  }

  function dessiner(items, { titre, action, credit } = {}) {
    resultats = items;
    actif = -1;
    liste.replaceChildren();

    if (titre) {
      const entete = document.createElement('div');
      entete.className = 'rech-titre';
      const libelle = document.createElement('span');
      libelle.textContent = titre;
      entete.appendChild(libelle);
      if (action) {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.textContent = action.libelle;
        bouton.addEventListener('click', action.fn);
        entete.appendChild(bouton);
      }
      liste.appendChild(entete);
    }

    items.forEach((r, i) => liste.appendChild(creerLigne(r, i)));
    if (credit) liste.appendChild(creerCredit());
    ouvrirListe();
  }

  function afficherMessage(texte) {
    resultats = [];
    actif = -1;
    liste.replaceChildren();
    const m = document.createElement('div');
    m.className = 'rech-message';
    m.textContent = texte;
    liste.append(m, creerCredit());
    ouvrirListe();
  }

  // ---------- Recherches récentes ----------
  const lireRecents = () => {
    const r = lire(CLE_RECENTS, []);
    return Array.isArray(r) ? r : [];
  };

  function memoriser(r) {
    const anciens = lireRecents().filter((x) => !(x.cle === r.cle && x.nom === r.nom));
    anciens.unshift(r);
    ecrire(CLE_RECENTS, anciens.slice(0, NB_RECENTS));
  }

  function afficherRecents() {
    const recents = lireRecents();
    if (!recents.length) {
      fermerListe();
      return;
    }
    dessiner(recents, {
      titre: t('rech.recentes'),
      action: {
        libelle: t('rech.effacer'),
        fn: () => {
          ecrire(CLE_RECENTS, []);
          fermerListe();
        },
      },
    });
  }

  // ---------- Appel au service de recherche ----------
  async function chercher(q) {
    if (controleur) controleur.abort();
    controleur = new AbortController();
    attente.hidden = false;

    const c = map.getCenter();
    const url =
      `${URL_PHOTON}?q=${encodeURIComponent(q)}&limit=${NB_RESULTATS_RECHERCHE}&lang=${langue()}` +
      `&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}`;

    try {
      const rep = await requeteReseau(url, { signal: controleur.signal });
      if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
      const donnees = await rep.json();

      const vus = new Set();
      const items = (donnees.features || [])
        .filter((f) => f.geometry && f.geometry.coordinates)
        .map(normaliser)
        .filter((r) => {
          const cle = `${r.cle}|${r.nom}`;
          if (vus.has(cle)) return false;
          vus.add(cle);
          return true;
        });

      attente.hidden = true;
      requeteAffichee = q;
      if (items.length) {
        dessiner(equilibrerResultats(items).slice(0, NB_RESULTATS_AFFICHES), { credit: true });
      }
      else afficherMessage(t('rech.aucun', { q }));
    } catch (e) {
      if (e.name === 'AbortError') return;
      attente.hidden = true;
      afficherMessage(t('lieu.recherche-erreur'));
      console.warn('Recherche :', e);
    }
  }

  // ---------- Repère sur la carte ----------
  function creerContenuPopup(r) {
    const boite = document.createElement('div');
    boite.className = 'rech-popup';

    const nom = document.createElement('strong');
    nom.textContent = r.nom;
    const sous = document.createElement('div');
    sous.className = 'rech-popup-sous';
    sous.textContent = sousTitre(r);
    const coord = document.createElement('div');
    coord.className = 'rech-popup-coord';
    const texteCoord = `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`;
    coord.textContent = texteCoord;

    const actions = document.createElement('div');
    actions.className = 'rech-popup-actions';
    const copier = document.createElement('button');
    copier.type = 'button';
    poser(copier, 'lieu.copier');
    copier.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texteCoord);
        poser(copier, 'lieu.copie');
      } catch (e) {
        poser(copier, 'lieu.indisponible');
      }
      setTimeout(() => (poser(copier, 'lieu.copier')), 1500);
    });
    const retirer = document.createElement('button');
    retirer.type = 'button';
    poser(retirer, 'rech.retirer');
    retirer.addEventListener('click', effacerTout);
    actions.append(copier, retirer);

    boite.append(nom, sous, coord, actions);
    return boite;
  }

  function retirerRepere() {
    if (repere) {
      repere.remove();
      repere = null;
    }
  }

  function poserRepere(r) {
    retirerRepere();
    const pin = creerPinSeul('recherche');
    pin.element.classList.add('rech-repere');
    const popup = new maplibregl.Popup({ offset: 34, closeButton: false, maxWidth: '260px' }).setDOMContent(
      creerContenuPopup(r)
    );
    // Sélectionné tant que sa fiche est ouverte
    popup.on('open', () => pin.changerEtat('selected'));
    popup.on('close', () => pin.changerEtat());
    repere = new maplibregl.Marker({ element: pin.element, anchor: 'bottom', offset: DECALAGE_PIN })
      .setLngLat([r.lng, r.lat])
      .setPopup(popup)
      .addTo(map);
    repere.togglePopup();
  }

  function aller(r) {
    if (r.bounds) {
      map.fitBounds(r.bounds, { padding: 60, maxZoom: 14, duration: 1800 });
    } else {
      map.flyTo({ center: [r.lng, r.lat], zoom: r.zoom ?? 13, duration: 1800, essential: true });
    }
  }

  // ---------- Actions ----------
  function majEffacer() {
    effacer.hidden = !(saisie.value || repere);
  }

  function choisir(r) {
    clearTimeout(minuteur);
    if (controleur) controleur.abort();
    attente.hidden = true;
    fermerListe();

    saisie.value = r.nom;
    memoriser(r);
    poserRepere(r);
    aller(r);
    majEffacer();

    saisie.blur();
    if (mobile()) racine.classList.remove('ouverte');
  }

  function effacerTout() {
    clearTimeout(minuteur);
    if (controleur) controleur.abort();
    attente.hidden = true;
    retirerRepere();
    saisie.value = '';
    majEffacer();
    fermerListe();
  }

  // ---------- Événements ----------
  saisie.addEventListener('input', () => {
    clearTimeout(minuteur);
    const q = saisie.value.trim();
    majEffacer();

    if (!q) {
      if (controleur) controleur.abort();
      attente.hidden = true;
      afficherRecents();
      return;
    }

    const gps = lireCoordonnees(q);
    if (gps) {
      if (controleur) controleur.abort();
      attente.hidden = true;
      requeteAffichee = q;
      dessiner([resultatGps(gps)]);
      return;
    }

    if (q.length < 2) {
      fermerListe();
      return;
    }
    minuteur = setTimeout(() => chercher(q), DELAI_FRAPPE);
  });

  saisie.addEventListener('focus', () => {
    if (!saisie.value.trim()) afficherRecents();
    else if (resultats.length) ouvrirListe();
  });

  saisie.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (liste.hidden || !resultats.length) return;
      e.preventDefault();
      const n = resultats.length;
      surligner(e.key === 'ArrowDown' ? (actif + 1) % n : (actif - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = saisie.value.trim();
      if (!q) {
        if (actif >= 0 && resultats[actif]) choisir(resultats[actif]);
        return;
      }
      if (resultats.length && requeteAffichee === q) {
        choisir(resultats[actif >= 0 ? actif : 0]);
      } else if (q.length >= 2) {
        clearTimeout(minuteur);
        chercher(q);
      }
    } else if (e.key === 'Escape') {
      if (!liste.hidden) fermerListe();
      else saisie.blur();
    }
  });

  saisie.addEventListener('blur', () => {
    setTimeout(() => {
      if (mobile() && !saisie.value && !racine.contains(document.activeElement)) {
        racine.classList.remove('ouverte');
      }
    }, 150);
  });

  loupe.addEventListener('click', () => {
    if (mobile()) racine.classList.add('ouverte');
    saisie.focus();
  });

  effacer.addEventListener('click', () => {
    effacerTout();
    saisie.focus();
  });

  // Le clic dans la liste ne doit pas retirer le focus de la saisie
  liste.addEventListener('mousedown', (e) => e.preventDefault());

  // Clic en dehors : on ferme la liste
  document.addEventListener('pointerdown', (e) => {
    if (!racine.contains(e.target)) {
      fermerListe();
      if (mobile() && !saisie.value) racine.classList.remove('ouverte');
    }
  });

  // Raccourci : « / » place le curseur dans la barre
  document.addEventListener('keydown', (e) => {
    const cible = e.target;
    const enSaisie = cible instanceof HTMLElement && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable);
    if (e.key === '/' && !enSaisie) {
      e.preventDefault();
      loupe.click();
    }
  });
}