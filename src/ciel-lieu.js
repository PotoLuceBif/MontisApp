// Lieu de Soleil et Lune (lot 4.7), en petit sous le jour : le nom du lieu calculé (centre de la carte) et
// l'heure qu'il y est. Un appui ouvre une recherche (Photon) : la carte va au lieu choisi, et les heures de la
// frise passent au fuseau du lieu (Open-Meteo, `utc_offset_seconds`). Sans réseau : « Centre de la carte »
// et l'heure de l'appareil. Chargé avec le réglage de la rubrique (soleil-lune.js).
import { erreurHttp, messageErreur, requete } from './requete.js';
import { heureDuLieu } from './soleil.js';
import { estHorsLigne } from './hors-ligne.js';
import { langue } from './preferences.js';
import { poser, t, ta } from './i18n.js';

const API_RECHERCHE = 'https://photon.komoot.io/api/';
const API_INVERSE = 'https://photon.komoot.io/reverse';
const API_FUSEAU = 'https://api.open-meteo.com/v1/forecast';
const MINUTE = 60000;

const ICONE_LIEU = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>';
const ICONE_LOUPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';

export function creerLieuCiel(map, { reglage, visible }) {
  const element = document.createElement('div');
  element.className = 'ciel-lieu';
  element.innerHTML = `
    <button type="button" class="ciel-lieu-bouton" aria-expanded="false">
      ${ICONE_LIEU}<span class="ciel-lieu-nom"></span><span class="ciel-lieu-heure"></span>${ICONE_LOUPE}
    </button>
    <div class="ciel-lieu-recherche" hidden>
      <input type="text" class="ciel-lieu-champ" autocomplete="off" enterkeyhint="search" spellcheck="false" ${ta('placeholder', 'ciel.lieu-chercher')} ${ta('aria-label', 'ciel.lieu-chercher')}>
      <div class="ciel-lieu-liste rando-liste" role="listbox" hidden></div>
    </div>
  `;
  const bouton = element.querySelector('.ciel-lieu-bouton');
  const nom = element.querySelector('.ciel-lieu-nom');
  const heure = element.querySelector('.ciel-lieu-heure');
  const recherche = element.querySelector('.ciel-lieu-recherche');
  const champ = element.querySelector('.ciel-lieu-champ');
  const liste = element.querySelector('.ciel-lieu-liste');

  let nomLieu = null; // null : « Centre de la carte »
  let choisi = false; // lieu choisi dans la recherche : son nom tient jusqu'au prochain déplacement de l'utilisateur
  let controleur = null;
  let dernierFuseau = null; // { lng, lat } de la dernière demande de fuseau
  let minuteur = null;
  let fige = false; // mode frise de l'espace : la carte tourne sous le lieu, qui ne change pas

  function majTextes() {
    if (nomLieu) nom.textContent = nomLieu;
    else poser(nom, 'ciel.lieu-centre');
    heure.textContent = `· ${t('ciel.lieu-heure', { heure: heureDuLieu(Date.now(), reglage.decalage()) })}`;
  }

  // Nom et fuseau du centre de la carte (un seul appel à la fois, après le déplacement)
  async function identifier() {
    if (estHorsLigne()) {
      nomLieu = null;
      reglage.changerFuseau(null);
      majTextes();
      return;
    }
    controleur?.abort();
    const requeteCourante = new AbortController();
    controleur = requeteCourante;
    const { lng, lat } = map.getCenter();
    const taches = [];
    if (!choisi) {
      const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lng.toFixed(4), lang: langue() === 'en' ? 'en' : 'fr' });
      taches.push(requete(`${API_INVERSE}?${params}`, { signal: requeteCourante.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(erreurHttp(r))))
        .then((donnees) => {
          const p = donnees?.features?.[0]?.properties ?? {};
          nomLieu = p.city ?? p.town ?? p.village ?? p.name ?? null;
        }));
    }
    // Le fuseau change rarement : on ne le redemande qu'après un vrai déplacement
    if (!dernierFuseau || Math.abs(dernierFuseau.lng - lng) > 0.5 || Math.abs(dernierFuseau.lat - lat) > 0.5) {
      const params = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lng.toFixed(3), timezone: 'auto', forecast_days: '1' });
      taches.push(requete(`${API_FUSEAU}?${params}`, { signal: requeteCourante.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(erreurHttp(r))))
        .then((donnees) => {
          if (!Number.isFinite(donnees?.utc_offset_seconds)) return;
          dernierFuseau = { lng, lat };
          reglage.changerFuseau(donnees.utc_offset_seconds / 60);
        }));
    }
    const resultats = await Promise.allSettled(taches);
    if (controleur !== requeteCourante) return;
    resultats.filter((r) => r.status === 'rejected' && r.reason?.name !== 'AbortError')
      .forEach((r) => console.warn('Lieu de Soleil et Lune :', r.reason));
    majTextes();
  }

  // ---------- Recherche ----------
  function ouvrirRecherche(oui) {
    recherche.hidden = !oui;
    bouton.setAttribute('aria-expanded', String(oui));
    if (oui) champ.focus();
    else {
      champ.value = '';
      liste.hidden = true;
      liste.replaceChildren();
    }
  }
  bouton.addEventListener('click', () => ouvrirRecherche(recherche.hidden));

  function message(texte) {
    const bloc = document.createElement('div');
    bloc.className = 'rando-attente';
    bloc.textContent = texte;
    liste.replaceChildren(bloc);
    liste.hidden = false;
  }

  function choisir(feature) {
    const [lng, lat] = feature.geometry.coordinates;
    nomLieu = feature.properties.name;
    choisi = true;
    ouvrirRecherche(false);
    majTextes();
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10), duration: estHorsLigne() ? 0 : 1200, essential: true });
  }

  let resultats = [];
  async function chercher(texte) {
    controleur?.abort();
    const requeteCourante = new AbortController();
    controleur = requeteCourante;
    message(t('meteo.recherche-attente'));
    const centre = map.getCenter();
    const params = new URLSearchParams({
      q: texte, limit: '6', lang: langue() === 'en' ? 'en' : 'fr', lat: centre.lat.toFixed(3), lon: centre.lng.toFixed(3), osm_tag: 'place',
    });
    try {
      const reponse = await requete(`${API_RECHERCHE}?${params}`, { signal: requeteCourante.signal });
      if (!reponse.ok) throw erreurHttp(reponse);
      const donnees = await reponse.json();
      if (controleur !== requeteCourante) return;
      resultats = (donnees?.features ?? []).filter((f) => f?.properties?.name && f.geometry?.coordinates?.length === 2);
      if (!resultats.length) {
        message(t('meteo.recherche-vide'));
        return;
      }
      liste.replaceChildren(...resultats.map((feature) => {
        const p = feature.properties;
        const ligne = document.createElement('div');
        ligne.className = 'rando-item';
        ligne.setAttribute('role', 'option');
        ligne.innerHTML = '<div class="rando-item-textes"><div class="rando-item-nom"></div><div class="rando-item-sous"></div></div>';
        ligne.querySelector('.rando-item-nom').textContent = p.name;
        ligne.querySelector('.rando-item-sous').textContent = [p.county ?? p.state, p.country].filter(Boolean).join(' · ');
        ligne.addEventListener('click', () => choisir(feature));
        return ligne;
      }));
      liste.hidden = false;
    } catch (erreur) {
      if (controleur !== requeteCourante || erreur?.name === 'AbortError') return;
      message(t('meteo.recherche-erreur', { message: messageErreur(erreur) }));
    }
  }

  let minuteurRecherche = null;
  champ.addEventListener('input', () => {
    clearTimeout(minuteurRecherche);
    const texte = champ.value.trim();
    if (texte.length < 2) {
      liste.hidden = true;
      return;
    }
    minuteurRecherche = setTimeout(() => void chercher(texte), 350);
  });
  champ.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && resultats.length) {
      event.preventDefault();
      choisir(resultats[0]);
    } else if (event.key === 'Escape') ouvrirRecherche(false);
  });

  // ---------- Carte ----------
  // Un déplacement de l'utilisateur rend la main au centre de la carte ; celui de la recherche garde le nom
  map.on('movestart', (event) => { if (event.originalEvent) choisi = false; });
  map.on('moveend', () => {
    clearTimeout(minuteur);
    if (!visible() || fige) return;
    minuteur = setTimeout(() => void identifier(), 700);
  });
  // L'heure sur place avance
  setInterval(() => { if (visible()) majTextes(); }, MINUTE);

  majTextes();
  return {
    element,
    majTextes,
    // Le panneau s'ouvre : le lieu a pu changer depuis
    surOuverture: () => void identifier(),
    figer: (oui) => {
      fige = oui;
      if (oui) clearTimeout(minuteur);
    },
  };
}
