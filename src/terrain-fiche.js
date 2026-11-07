// Fiche d'un terrain de vol libre de la FFVL : statut, orientations, vent à la balise la plus
// proche, consignes. Les textes viennent tels quels de la FFVL.
import { creerPanneauCarte } from './panneau-carte.js';
import { ecrire } from './reglages.js';
import { etatStation, texteAge } from './balises-sources.js';
import { SECTEURS, accordVent, baliseSurPlace } from './terrains-calcul.js';
import { couleurInterface, texteProvenance } from './vent-cadran.js';
import { formatAltitude, formatDistance, formatVent } from './unites.js';
import { surPreferences } from './preferences.js';
import { formatDate, t, poser } from './i18n.js';

const LIEN_TERRAINS = 'https://www.data.gouv.fr/fr/datasets/terrains-de-pratique-de-la-ffvl-federation-francaise-de-vol-libre/';
const CLE_LIEU_METEO = 'meteo-position';
const RAYON_BALISE = 15000; // m : plus loin, la balise ne dit plus grand-chose du décollage

// Rose des huit secteurs : vert dans l'axe, rouge à éviter, flèche du vent mesuré
function roseOrientations(terrain, direction, classe = '') {
  const secteurs = SECTEURS.map((secteur, index) => {
    const etat = terrain.favorables.includes(secteur) ? 'ok' : terrain.defavorables.includes(secteur) ? 'non' : 'neutre';
    const a = ((index * 45 - 22.5 - 90) * Math.PI) / 180;
    const b = ((index * 45 + 22.5 - 90) * Math.PI) / 180;
    const r = 30;
    const p = (angle, rayon) => `${(32 + rayon * Math.cos(angle)).toFixed(2)} ${(32 + rayon * Math.sin(angle)).toFixed(2)}`;
    return `<path class="tf-secteur tf-secteur-${etat}" d="M${p(a, 9)} L${p(a, r)} A${r} ${r} 0 0 1 ${p(b, r)} L${p(b, 9)} A9 9 0 0 0 ${p(a, 9)}Z"/>`;
  }).join('');
  const lettres = ['N', 'E', 'S', 'O'].map((lettre, index) => {
    const angle = ((index * 90 - 90) * Math.PI) / 180;
    return `<text x="${(32 + 38 * Math.cos(angle)).toFixed(1)}" y="${(32 + 38 * Math.sin(angle)).toFixed(1)}">${t(`cardinal.${lettre}`)}</text>`;
  }).join('');
  // La flèche part du côté d'où vient le vent et pointe vers le centre
  const fleche = Number.isFinite(direction)
    ? `<g class="tf-fleche" transform="rotate(${direction} 32 32)"><path d="M32 4V22"/><path d="M27 16 32 23 37 16"/></g>`
    : '';
  return `<svg class="tf-rose ${classe}" viewBox="-10 -10 84 84" aria-hidden="true">${secteurs}${classe ? '' : lettres}${fleche}</svg>`;
}

export function creerFicheTerrain(map, { onOuvrir = () => {}, onFermer = () => {}, onRetour = null, baliseProche = () => null, ouvrirBalise = () => {}, analyserVent = null } = {}) {
  const panneau = creerPanneauCarte({
    cle: 'terrain-fiche-reduite',
    libelle: 'panneau.terrain',
    classe: 'tf',
    onFermer: () => fermer(),
    onRetour,
    onAgrandi: () => {
      if (terrain) garderVisible();
    },
  });
  const fiche = panneau.element;
  let terrain = null;

  const ligne = (cle, valeur) => {
    if (!valeur) return null;
    const bloc = document.createElement('div');
    bloc.className = 'tf-texte';
    const titre = document.createElement('h4');
    poser(titre, cle);
    const texte = document.createElement('p');
    texte.textContent = valeur;
    bloc.append(titre, texte);
    return bloc;
  };

  function blocStatut() {
    const cles = { interdit: 'tf.statut-interdit', ferme: 'tf.statut-ferme', autorisation: 'tf.statut-autorisation' };
    const messages = [];
    if (cles[terrain.statut]) {
      const statut = document.createElement('p');
      statut.className = `tf-alerte tf-alerte-${terrain.statut === 'autorisation' ? 'orange' : 'rouge'}`;
      poser(statut, cles[terrain.statut]);
      messages.push(statut);
    }
    if (terrain.alerte) {
      const alerte = document.createElement('p');
      alerte.className = 'tf-alerte tf-alerte-orange';
      alerte.textContent = terrain.alerte;
      messages.push(alerte);
    }
    return messages;
  }

  function blocVent() {
    const bloc = document.createElement('section');
    bloc.className = 'tf-vent';
    const proche = baliseProche(terrain.lon, terrain.lat, RAYON_BALISE);
    const station = proche?.station;
    const mesure = station && etatStation(station) !== 'hs' ? station : null;
    bloc.insertAdjacentHTML('beforeend', roseOrientations(terrain, mesure?.direction));
    const texte = document.createElement('div');
    texte.className = 'tf-vent-texte';
    const orientations = document.createElement('p');
    orientations.className = 'tf-orientations';
    const nomme = (liste) => liste.map((secteur) => t(`cardinal.${secteur}`)).join(', ');
    if (terrain.favorables.length) {
      const ok = document.createElement('span');
      ok.className = 'tf-ok';
      poser(ok, 'tf.favorables', { liste: nomme(terrain.favorables) });
      orientations.append(ok);
    }
    if (terrain.defavorables.length) {
      const non = document.createElement('span');
      non.className = 'tf-non';
      poser(non, 'tf.defavorables', { liste: nomme(terrain.defavorables) });
      orientations.append(non);
    }
    if (!orientations.childElementCount) poser(orientations, 'tf.orientation-inconnue');
    texte.append(orientations);

    if (mesure) {
      const lien = document.createElement('button');
      lien.type = 'button';
      lien.className = 'tf-balise';
      lien.style.setProperty('--vent-couleur', couleurInterface(mesure.moyenne));
      const nom = document.createElement('small');
      nom.textContent = t('tf.balise', { nom: mesure.nom, distance: formatDistance(proche.distance) });
      const valeur = document.createElement('strong');
      valeur.textContent = `${texteProvenance(mesure.direction)} · ${formatVent(mesure.moyenne)}`;
      const age = document.createElement('small');
      age.textContent = texteAge(mesure.date);
      lien.append(nom, valeur, age);
      const accord = accordVent(mesure.direction, terrain);
      if (terrain.genre === 'decollage' && accord !== 'inconnu') {
        const verdict = document.createElement('span');
        verdict.className = `tf-accord tf-accord-${accord}`;
        poser(verdict, accord === 'favorable' ? 'tf.dans-axe' : 'tf.hors-axe');
        lien.append(verdict);
      }
      const voir = document.createElement('span');
      voir.className = 'tf-balise-voir';
      poser(voir, 'tf.voir-balise');
      lien.append(voir);
      const ici = terrain;
      lien.addEventListener('click', () => ouvrirBalise(mesure.id, () => revenir(ici)));
      texte.append(lien);
    } else {
      const aucune = document.createElement('p');
      aucune.className = 'tf-note';
      poser(aucune, 'tf.sans-balise');
      texte.append(aucune);
    }
    bloc.append(texte);
    return bloc;
  }

  // Sans balise sur le terrain même, le vent prévu par Montis à cet endroit (pas pour un terrain fermé)
  function boutonAnalyseVent() {
    const proche = baliseProche(terrain.lon, terrain.lat, RAYON_BALISE);
    if (!analyserVent || terrain.statut === 'interdit' || terrain.statut === 'ferme') return null;
    if (proche && baliseSurPlace(proche.distance, terrain.altitude, proche.station.altitude)) return null;
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'point-lien';
    bouton.innerHTML = `
      <svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg>
      <span></span>
      <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
    poser(bouton.querySelector('span'), 'tf.analyser-vent');
    const ici = terrain;
    bouton.addEventListener('click', () => {
      fermer();
      analyserVent(ici, () => revenir(ici));
    });
    return bouton;
  }

  function boutonPrevisions() {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'point-lien';
    bouton.innerHTML = `
      <svg class="point-lien-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>
      <span></span>
      <svg class="point-lien-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;
    poser(bouton.querySelector('span'), 'point.previsions');
    const ici = terrain;
    bouton.addEventListener('click', () => {
      const lieu = { longitude: ici.lon, latitude: ici.lat };
      ecrire(CLE_LIEU_METEO, lieu);
      window.dispatchEvent(new CustomEvent('montis:meteo-ici', { detail: lieu }));
      fermer();
      // La croix de Météo ramène à cette fiche
      window.dispatchEvent(new CustomEvent('montis:ouvrir-module', {
        detail: { categorie: 'meteo', module: 'meteo-locale', retour: () => ouvrir(ici) },
      }));
    });
    return bouton;
  }

  function rendre() {
    const genre = t(terrain.genre === 'decollage' ? 'para.decollage' : 'para.atterrissage');
    panneau.titre.textContent = terrain.nom;
    fiche.dataset.statut = terrain.statut;
    const meta = [genre, Number.isFinite(terrain.altitude) ? formatAltitude(terrain.altitude) : '', terrain.commune]
      .filter(Boolean).map((morceau) => {
        const span = document.createElement('span');
        span.textContent = morceau;
        return span;
      });
    panneau.meta.replaceChildren(...meta);
    panneau.definirResume({
      rose: roseOrientations(terrain, null, 'tf-rose-petite'),
      nom: terrain.nom,
      detail: terrain.statut === 'ok' ? genre : `${genre} · ${t(`tf.court-${terrain.statut}`)}`,
      valeur: Number.isFinite(terrain.altitude) ? formatAltitude(terrain.altitude) : '',
      unite: '',
    });

    const infos = document.createElement('p');
    infos.className = 'tf-infos';
    const fonctions = terrain.fonctions.map((fonction) => t(`tf.fonction-${fonction.normalize('NFD').replace(/[̀-ͯ]/g, '')}`));
    const morceaux = [
      fonctions.join(', '),
      terrain.pratiques.map((pratique) => t(`tf.pratique-${pratique}`)).join(', '),
      terrain.niveau ? t('tf.niveau', { n: terrain.niveau }) : '',
      terrain.marche ? t('tf.marche', { n: terrain.marche }) : '',
    ].filter(Boolean);
    infos.textContent = morceaux.join(' · ');

    const textes = [
      ligne('tf.consignes', terrain.consignes),
      ligne('tf.restrictions', terrain.restrictions),
      ligne('tf.regles', terrain.regles),
      ligne('tf.conditions', terrain.conditions),
    ].filter(Boolean);
    const plus = [ligne('tf.description', terrain.description), ligne('tf.acces', terrain.acces)].filter(Boolean);
    let details = null;
    if (plus.length) {
      details = document.createElement('details');
      details.className = 'tf-plus';
      const resume = document.createElement('summary');
      poser(resume, 'tf.plus');
      details.append(resume, ...plus);
    }

    const source = document.createElement('p');
    source.className = 'bf-source';
    const lien = document.createElement('a');
    lien.href = LIEN_TERRAINS;
    lien.target = '_blank';
    lien.rel = 'noopener noreferrer';
    lien.textContent = 'FFVL ↗';
    source.append(
      terrain.modification ? t('tf.source-date', { date: formatDate(terrain.modification, { day: 'numeric', month: 'long', year: 'numeric' }) }) : t('tf.source'),
      ' ',
      lien,
    );
    const prudence = document.createElement('p');
    prudence.className = 'point-prudence';
    poser(prudence, 'tf.prudence');

    panneau.corps.replaceChildren(
      ...blocStatut(),
      blocVent(),
      infos,
      ...textes,
      ...(details ? [details] : []),
      ...[boutonAnalyseVent()].filter(Boolean),
      boutonPrevisions(),
      source,
      prudence,
    );
  }

  function garderVisible() {
    const point = map.project([terrain.lon, terrain.lat]);
    const cadre = fiche.getBoundingClientRect();
    const zone = map.getContainer().getBoundingClientRect();
    const haut = cadre.top - zone.top;
    const droite = cadre.right - zone.left;
    if (cadre.width >= zone.width - 4) {
      if (point.y > haut - 50) map.panBy([0, point.y - Math.max(90, haut / 2)]);
    } else if (point.x < droite + 40 && point.y > haut - 30) {
      map.panBy([point.x - (droite + 60), 0]);
    }
  }

  function ouvrir(nouveau) {
    terrain = nouveau;
    panneau.afficher();
    rendre();
    garderVisible();
    onOuvrir(terrain);
  }

  // Retour depuis la fiche d'une balise : la carte revient sur le terrain s'il est sorti de la vue
  function revenir(ancien) {
    if (map.getBounds().contains([ancien.lon, ancien.lat])) {
      ouvrir(ancien);
      return;
    }
    map.once('moveend', () => ouvrir(ancien));
    map.easeTo({ center: [ancien.lon, ancien.lat], duration: 600 });
  }

  function fermer() {
    if (!panneau.ouvert) return;
    panneau.masquer();
    terrain = null;
    onFermer();
  }

  surPreferences(() => {
    if (terrain) rendre();
  });

  return {
    get idOuvert() {
      return terrain?.id ?? null;
    },
    ouvrir,
    fermer,
    // Nouveaux relevés : le vent de la balise voisine change
    actualiser() {
      if (terrain) rendre();
    },
  };
}
