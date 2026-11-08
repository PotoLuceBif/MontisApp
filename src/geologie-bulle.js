// « Touche pour savoir », en vue détaillée de la géologie : un appui sur la carte ouvre une bulle avec la couleur
// sous le doigt, la famille de roche du secteur (carte au 1/1 000 000) et la feuille au 1/50 000 avec sa notice.
import { Popup } from 'maplibre-gl';
import { COUCHES_BRGM, WMS_BRGM, adresseInfoBrgm, couleurPixel, geologieDuPoint, lireInfoBrgm, tuileDuPoint } from './geologie-calcul.js';
import { familleDuCode } from './geologie-familles.js';
import { fichesBloquees } from './fiche.js';
import { estHorsLigne } from './hors-ligne.js';
import { surLangue, t } from './i18n.js';

const DELAI = 15000;
// Couches de la carte qui ne sont que du décor : un appui dessus reste un appui sur la géologie
const DECOR = /^(montis-|courbes|frontieres|geologie-|pentes-|ombre-|relief|ombrage|fond-)/;

function element(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function pastille(couleur) {
  const i = element('i', 'geol-bulle-pastille');
  i.style.background = couleur;
  return i;
}

// `adresseTuile(z, x, y)` : tuile de la carte détaillée, pour lire la couleur sous le doigt
export function creerBulleGeologie(map, { adresseTuile, zoomMax }) {
  let actif = false;
  let popup = null;
  let controleur = null;
  let affichee = null; // { contenu, etatBulle } de la bulle ouverte, redessinée si la langue change

  function fermer() {
    controleur?.abort();
    controleur = null;
    popup?.remove();
    popup = null;
    affichee = null;
  }
  surLangue(() => affichee && rendre(affichee.contenu, affichee.etatBulle));

  // Couleur de la carte détaillée au point : tuile relue (déjà en cache), pixel sous le doigt
  async function lireCouleur(lng, lat, signal) {
    const z = Math.min(zoomMax, Math.max(0, Math.ceil(map.getZoom()) + 1));
    const { x, y, u, v } = tuileDuPoint(lng, lat, z);
    const reponse = await fetch(adresseTuile(z, x, y), { signal });
    if (!reponse.ok) return null;
    const image = await createImageBitmap(await reponse.blob());
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const contexte = canvas.getContext('2d', { willReadFrequently: true });
    contexte.drawImage(image, 0, 0, 256, 256);
    image.close?.();
    const px = Math.min(255, Math.floor(u * 256));
    const py = Math.min(255, Math.floor(v * 256));
    // Moyenne de quelques pixels : un trait ou une lettre de la carte ne doit pas donner sa couleur
    return couleurPixel(contexte.getImageData(Math.max(0, px - 2), Math.max(0, py - 2), 5, 5).data);
  }

  async function lireRoche(lng, lat, signal) {
    const reponse = await fetch(adresseInfoBrgm(WMS_BRGM, COUCHES_BRGM, lng, lat), { signal });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    return geologieDuPoint(lireInfoBrgm(await reponse.text()));
  }

  function rendre(contenu, { couleur, geologie, etat }) {
    contenu.replaceChildren();
    const tete = element('div', 'geol-bulle-tete');
    if (couleur) tete.append(pastille(couleur));
    tete.append(element('span', '', t(couleur ? 'geologie.bulle-couleur' : 'geologie.bulle-titre')));
    contenu.append(tete);

    if (etat === 'chargement') {
      contenu.append(element('p', 'geol-bulle-attente', t('point.chargement')));
      return;
    }
    if (etat) {
      contenu.append(element('p', 'geol-bulle-indisponible', t(`point.geologie-${etat}`)));
      return;
    }

    const famille = familleDuCode(geologie.roche?.code);
    if (famille) {
      const nom = element('div', 'geol-bulle-famille');
      nom.append(pastille(famille.couleur), element('strong', '', t(`geologie.roche-${famille.cle}`)));
      const terrain = element('details', 'point-terrain');
      terrain.append(element('summary', '', t('point.geologie-terrain')), element('p', '', t(`geologie.terrain-${famille.cle}`)));
      contenu.append(
        nom,
        element('p', 'geol-bulle-resume', t(`geologie.resume-${famille.cle}`)),
        element('p', 'geol-bulle-note', t('geologie.bulle-secteur')),
        terrain
      );
    } else if (geologie.roche) {
      contenu.append(element('div', 'geol-bulle-famille', geologie.roche.description));
    }

    if (geologie.feuille) {
      contenu.append(element('p', 'geol-bulle-feuille', t('point.geologie-feuille', { numero: geologie.feuille.numero, nom: geologie.feuille.nom })));
      if (geologie.feuille.notice) {
        const lien = element('a', 'point-lien');
        lien.href = geologie.feuille.notice;
        lien.target = '_blank';
        lien.rel = 'noopener';
        lien.innerHTML = `
          <svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7c3-2 6 2 9 0s6-2 9 0M3 12c3-2 6 2 9 0s6-2 9 0M3 17c3-2 6 2 9 0s6-2 9 0"/></svg>
          <span></span>
          <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;
        lien.querySelector('span').textContent = t('point.geologie-notice');
        contenu.append(lien);
      }
    }
  }

  async function ouvrir({ lng, lat }) {
    fermer();
    controleur = new AbortController();
    const { signal } = controleur;
    const minuteur = setTimeout(() => controleur?.abort(), DELAI);
    const contenu = element('div', 'geol-bulle');
    const etatBulle = { couleur: null, geologie: null, etat: estHorsLigne() ? 'hors-ligne' : 'chargement' };
    rendre(contenu, etatBulle);
    affichee = { contenu, etatBulle };
    popup = new Popup({ closeButton: true, offset: 10, maxWidth: '300px', className: 'geol-popup' })
      .setLngLat([lng, lat])
      .setDOMContent(contenu)
      .addTo(map);
    popup.on('close', () => { if (popup && !popup.isOpen()) popup = null; });

    const maj = () => rendre(contenu, etatBulle);
    lireCouleur(lng, lat, signal)
      .then((couleur) => { etatBulle.couleur = couleur; maj(); })
      .catch(() => {});
    if (etatBulle.etat === 'hors-ligne') return clearTimeout(minuteur);
    try {
      const geologie = await lireRoche(lng, lat, signal);
      etatBulle.geologie = geologie;
      etatBulle.etat = geologie ? null : 'aucune';
    } catch (e) {
      if (signal.aborted && !popup) return; // bulle fermée
      etatBulle.etat = estHorsLigne() ? 'hors-ligne' : 'erreur';
    } finally {
      clearTimeout(minuteur);
    }
    rendre(contenu, etatBulle);
  }

  map.on('click', (e) => {
    if (!actif || fichesBloquees()) return;
    const cible = e.originalEvent?.target;
    if (cible?.closest?.('.maplibregl-marker, .maplibregl-popup, .maplibregl-ctrl')) return;
    // Un élément de la carte (sommet, refuge, balise…) a sa propre fiche : on le laisse faire
    const { x, y } = e.point;
    const objets = map.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]]).filter((f) => !DECOR.test(f.layer.id));
    if (objets.length) return;
    ouvrir(e.lngLat);
  });

  return {
    activer(oui) {
      actif = oui;
      map.getCanvasContainer().classList.toggle('geol-identifier', oui);
      if (!oui) fermer();
    },
  };
}
