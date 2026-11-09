// Mes traces : les sorties importées des montres et des varios, et les parcours enregistrés
// dans Randonnée et Vélo. Deux lignes du menu, chargées à leur première ouverture.
import { creerStockageParcours } from './parcours-stockage.js';
import { lire } from './reglages.js';
import { deposer } from './demandes.js';
import { erreurSortie, formatDuNom, lireSortie } from './sortie-lecture.js';
import {
  ajouterSortie, listerSorties, lireSortieComplete, modifierSortie, supprimerSortie,
} from './sorties-stockage.js';
import { formatDenivele, formatDistance } from './unites.js';
import { surPreferences } from './preferences.js';
import { t, ti, tt } from './i18n.js';
import { dateCourte, detailSortie, iconeType, nomSortie, svg, typeDe } from './traces-commun.js';
import { creerVueSortie } from './sortie-vue.js';

const TAILLE_MAX = 60 * 1024 * 1024;
const ACTIVITES_PARCOURS = ['rando', 'velo'];
const DESSINS = {
  importer: '<path d="M12 15V3m0 0L7.500 7.500M12 3l4.500 4.500"/><path d="M5 13v6h14v-6"/>',
  renommer: '<path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4"/>',
  supprimer: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
};

// Une ligne de liste : ouvrir, renommer, supprimer (même allure que Mes parcours)
function ligneListe({ icone, nom, detail, onOuvrir, onRenommer, onSupprimer }) {
  const ligne = document.createElement('div');
  ligne.className = 'parcours-parcours traces-ligne';
  const ouvrir = document.createElement('button');
  ouvrir.type = 'button';
  ouvrir.className = 'parcours-parcours-texte traces-ligne-texte';
  ouvrir.innerHTML = `${icone}<span><strong></strong><small></small></span>`;
  ouvrir.querySelector('strong').textContent = nom;
  ouvrir.querySelector('small').textContent = detail;
  ouvrir.addEventListener('click', onOuvrir);
  const renommer = document.createElement('button');
  renommer.type = 'button';
  renommer.className = 'zh-zone-bouton';
  renommer.setAttribute('aria-label', t('parcours.renommer', { nom }));
  renommer.innerHTML = svg(DESSINS.renommer);
  renommer.addEventListener('click', () => {
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.maxLength = 60;
    champ.value = nom;
    champ.className = 'parcours-parcours-champ';
    champ.setAttribute('aria-label', t('parcours.nouveau-nom'));
    let fait = false;
    const valider = () => {
      if (fait) return;
      fait = true;
      const valeur = champ.value.trim();
      onRenommer(valeur && valeur !== nom ? valeur : null);
    };
    champ.addEventListener('blur', valider);
    champ.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') champ.blur();
    });
    ouvrir.replaceWith(champ);
    champ.focus();
    champ.select();
  });
  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'zh-zone-bouton zh-zone-supprimer';
  supprimer.setAttribute('aria-label', t('parcours.supprimer', { nom }));
  supprimer.innerHTML = svg(DESSINS.supprimer);
  supprimer.addEventListener('click', onSupprimer);
  ligne.append(ouvrir, renommer, supprimer);
  return ligne;
}

// ---------- Ligne « Sorties » ----------
export function creerSorties(map, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'traces';
  panneau.innerHTML = `
    <div class="rando-actions-principales">
      <label class="rando-importer rando-action-principale traces-importer">${svg(DESSINS.importer)}${tt('traces.importer')}
        <input type="file" class="rando-fichier" multiple accept=".gpx,.fit,.tcx,.igc,.gz,application/gpx+xml,application/vnd.ant.fit,application/octet-stream">
      </label>
    </div>
    <p class="note traces-aide" ${ti('traces.importer-aide')}>${t('traces.importer-aide')}</p>
    <p class="note traces-message" role="status" aria-live="polite" hidden></p>
    <div class="traces-liste"></div>
    <p class="note traces-vide" hidden ${ti('traces.aucune-sortie')}>${t('traces.aucune-sortie')}</p>
  `;
  const $ = (selecteur) => panneau.querySelector(selecteur);
  const champ = $('input[type="file"]');
  const message = $('.traces-message');
  const liste = $('.traces-liste');
  const vide = $('.traces-vide');

  const vue = creerVueSortie(map, { ouvrirMenu, onModifiee: () => void rendre() });

  // 	exte : une fonction, pour que le message suive un changement de langue
  let messageCourant = () => '';
  function afficherMessage(texte, erreur = false) {
    messageCourant = typeof texte === 'function' ? texte : () => texte;
    texte = messageCourant();
    message.textContent = texte;
    message.hidden = !texte;
    message.classList.toggle('traces-erreur', erreur);
  }

  async function ouvrirSortie(id) {
    try {
      const complete = await lireSortieComplete(id);
      if (!complete) throw new Error('sortie-absente');
      fermerMenu();
      vue.ouvrir(complete);
    } catch (erreur) {
      console.warn('Ouverture de la sortie :', erreur);
      afficherMessage(() => t('traces.erreur-lecture'), true);
    }
  }

  async function rendre() {
    let sorties;
    try {
      sorties = await listerSorties();
    } catch (erreur) {
      console.warn('Mes traces :', erreur);
      liste.replaceChildren();
      vide.hidden = true;
      afficherMessage(() => t('traces.stockage-indisponible'), true);
      champ.disabled = true;
      return;
    }
    vide.hidden = sorties.length > 0;
    liste.replaceChildren(...sorties.map((sortie) => ligneListe({
      icone: iconeType(sortie.type),
      nom: nomSortie(sortie),
      detail: detailSortie(sortie),
      onOuvrir: () => void ouvrirSortie(sortie.id),
      async onRenommer(nom) {
        if (nom) await modifierSortie(sortie.id, { nom }).catch((erreur) => console.warn(erreur));
        void rendre();
      },
      async onSupprimer() {
        if (!confirm(t('traces.supprimer-confirmer', { nom: nomSortie(sortie) }))) return;
        await supprimerSortie(sortie.id).catch((erreur) => console.warn(erreur));
        if (vue.id === sortie.id) vue.fermer();
        void rendre();
      },
    })));
  }

  async function contenuFichier(fichier, format) {
    let source = fichier;
    if (/\.gz$/i.test(fichier.name)) {
      if (!('DecompressionStream' in window)) throw erreurSortie('gz');
      source = new Response(fichier.stream().pipeThrough(new DecompressionStream('gzip')));
    }
    return format === 'fit' ? source.arrayBuffer() : source.text();
  }

  async function importer(fichiers) {
    if (!fichiers.length) return;
    afficherMessage(() => t('traces.lecture'));
    const typeParDefaut = typeDe(lire('menu-activite', null))?.id ?? null;
    const echecs = [];
    let ajoutees = 0;
    let doublons = 0;
    let derniere = null;
    for (const fichier of fichiers) {
      try {
        const format = formatDuNom(fichier.name);
        if (!format) throw erreurSortie('format');
        if (fichier.size > TAILLE_MAX) throw erreurSortie('lourd');
        const lue = lireSortie(format, await contenuFichier(fichier, format));
        lue.type ??= typeParDefaut;
        lue.fichier = fichier.name.replace(/(\.[a-z]+)+$/i, '');
        if (!lue.nom && !lue.debut) lue.nom = lue.fichier;
        const resultat = await ajouterSortie(lue);
        if (resultat.doublon) {
          doublons++;
          derniere = resultat.doublon.id;
        } else {
          ajoutees++;
          derniere = resultat.id;
        }
      } catch (erreur) {
        console.warn(`Import de ${fichier.name} :`, erreur);
        const code = erreur.code ?? (erreur.name === 'QuotaExceededError' ? 'plein' : 'invalide');
        echecs.push(() => t(`traces.erreur-${code}`, { nom: fichier.name }));
      }
    }
    await rendre();
    const bilan = [
      ajoutees && fichiers.length > 1 ? () => t('traces.ajoutees', { n: ajoutees }) : null,
      doublons ? () => t('traces.doublons', { n: doublons }) : null,
      ...echecs,
    ].filter(Boolean);
    afficherMessage(() => bilan.map((morceau) => morceau()).join(' '), echecs.length > 0);
    // Un seul fichier : on le montre tout de suite
    if (fichiers.length === 1 && derniere) void ouvrirSortie(derniere);
  }

  champ.addEventListener('change', () => {
    const fichiers = [...champ.files];
    champ.value = '';
    void importer(fichiers);
  });

  surPreferences(() => {
    void rendre();
    if (!message.hidden) afficherMessage(messageCourant, message.classList.contains('traces-erreur'));
  });

  return {
    id: 'sorties',
    labelCle: 'traces.sorties',
    icone: 'sorties',
    panneau,
    activer() {
      afficherMessage('');
      void rendre();
    },
    desactiver() {},
  };
}

// ---------- Ligne « Parcours » ----------
export function creerParcoursTraces(map, { fermerMenu = () => {} } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'traces';
  panneau.innerHTML = `
    <p class="note traces-aide" ${ti('traces.parcours-aide')}>${t('traces.parcours-aide')}</p>
    <div class="traces-liste"></div>
    <p class="note traces-vide" hidden ${ti('traces.aucun-parcours')}>${t('traces.aucun-parcours')}</p>
  `;
  const liste = panneau.querySelector('.traces-liste');
  const vide = panneau.querySelector('.traces-vide');
  const stockages = Object.fromEntries(ACTIVITES_PARCOURS.map((id) => [id, creerStockageParcours(id)]));
  const modifies = () => window.dispatchEvent(new CustomEvent('montis:parcours-modifies'));

  function rendre() {
    const tous = ACTIVITES_PARCOURS
      .flatMap((activite) => stockages[activite].lister().map((parcours) => ({ ...parcours, activite })))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    vide.hidden = tous.length > 0;
    liste.replaceChildren(...tous.map((parcours) => ligneListe({
      icone: iconeType(parcours.activite),
      nom: parcours.nom,
      detail: [
        Number.isFinite(parcours.total) ? formatDistance(parcours.total) : null,
        Number.isFinite(parcours.plus) ? `D+ ${formatDenivele(parcours.plus)}` : null,
        parcours.date ? dateCourte(parcours.date) : null,
      ].filter(Boolean).join(' · '),
      onOuvrir() {
        // Le parcours s'ouvre dans son activité, comme depuis sa liste Mes parcours
        fermerMenu();
        deposer(`ouvrir-parcours-${parcours.activite}`, parcours.id);
        window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'activites', module: parcours.activite } }));
      },
      onRenommer(nom) {
        if (nom) {
          stockages[parcours.activite].renommer(parcours.id, nom);
          modifies();
        }
        rendre();
      },
      onSupprimer() {
        if (!confirm(t('parcours.supprimer-confirmer', { nom: parcours.nom }))) return;
        stockages[parcours.activite].supprimer(parcours.id);
        modifies();
        rendre();
      },
    })));
  }

  window.addEventListener('montis:parcours-modifies', rendre);
  surPreferences(rendre);

  return {
    id: 'parcours',
    labelCle: 'traces.parcours',
    icone: 'parcours',
    panneau,
    activer: rendre,
    desactiver() {},
  };
}
