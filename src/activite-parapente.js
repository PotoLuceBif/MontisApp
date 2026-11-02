import { initParapente } from './parapente.js';
import { initPortee } from './portee.js';
import { lire, ecrire } from './reglages.js';
import { COULEUR_BALISE_INACTIVE, FFVL_ACTIVE, SOURCES_BALISES, texteAge } from './balises-sources.js';
import { PALETTE_CARTE, cadranVent, couleurInterface, libellesPaliersVent, texteProvenance } from './vent-cadran.js';
import { formatVent, libelleVent, valeurVent } from './unites.js';
import { surPreferences } from './preferences.js';
import { t, ta, ti, tt } from './i18n.js';

const BALISES_LISTEES = 6;

const puceManche = (couleur) => `<svg class="para-manche" viewBox="0 0 22 12" aria-hidden="true" style="--vent-couleur: ${couleur}"><path class="cerne" d="M1 1.5 21 3.8V8.2L1 10.5Z"/><path class="plein" d="M1 1.5 21 3.8V8.2L1 10.5Z"/><path class="bande" d="M8 2.3 14 3V9L8 9.7Z"/></svg>`;

export function creerActiviteParapente(map, { fermerMenu, ouvrirMenu, analyseVent } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'parapente';
  panneau.innerHTML = `
    <div class="rando-actions-principales" role="group" ${ta('aria-label', 'para.outils')}>
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="portee" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/></svg>
        ${tt('para.portee')}
      </button>
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="vent" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/></svg>
        ${tt('para.vent')}
      </button>
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="sites" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>
        ${tt('para.sites-balises')}
      </button>
    </div>

    <section class="para-vue" data-para-contenu="sites" ${ta('aria-label', 'para.sites-balises')} hidden>
      <div class="para-source">
        ${tt('para.source')}
        ${SOURCES_BALISES.length > 1
    ? `<select class="para-source-choix" ${ta('aria-label', 'para.source')}>${SOURCES_BALISES.map(({ id, libelle }) => `<option value="${id}">${libelle}</option>`).join('')}</select>`
    : `<a class="para-lien" href="${SOURCES_BALISES[0].lien}" target="_blank" rel="noopener noreferrer">${SOURCES_BALISES[0].libelle} ↗</a>`}
      </div>
      <p class="note para-etat" role="status" aria-live="polite"></p>
      <label class="option-case"><input type="checkbox" data-para-layer-balises> ${tt('para.balises')}
        <small ${ti('para.balises-detail')}>${t('para.balises-detail')}</small></label>
      <div class="para-legende" ${ta('aria-label', 'para.legende-aria')}>
        ${libellesPaliersVent().map((palier, index) => `<span>${puceManche(PALETTE_CARTE[index])} <b data-palier-libelle>${palier}</b></span>`).join('')}
        <span>${puceManche(COULEUR_BALISE_INACTIVE)} ${tt('para.plus-2h')}</span>
        <span><i class="para-hs">×</i> ${tt('para.hors-service')}</span>
      </div>
      <p class="note para-legende-note">${t('para.legende-note', { unite: libelleVent() })}</p>
      <div class="para-balises" hidden>
        <h3 ${ti('para.balises-zone')}>${t('para.balises-zone')}</h3>
        <div class="para-balises-liste"></div>
      </div>
      ${FFVL_ACTIVE
    ? `<label class="option-case"><input type="checkbox" data-para-layer-sites> ${tt('para.sites-ffvl')}
        <small ${ti('para.sites-ffvl-detail')}>${t('para.sites-ffvl-detail')}</small></label>
      <div class="para-legende">
        <span><i class="para-point para-point-vert"></i> ${tt('para.decollage')}</span>
        <span><i class="para-point para-point-bleu"></i> ${tt('para.atterrissage')}</span>
      </div>`
    : `<p class="note" ${ti('para.aucune-source')}>${t('para.aucune-source')}</p>`}
      <button type="button" class="para-bouton para-actualiser" ${ti('para.actualiser')}>${t('para.actualiser')}</button>
    </section>

    <details class="rando-outils">
      <summary ${ti('commun.a-propos')}>${t('commun.a-propos')}</summary>
      <div class="rando-outils-contenu">
        <p class="note" ${ti('para.a-propos-1')}>${t('para.a-propos-1')}</p>
        <p class="note" data-i18n-html="para.a-propos-2">${t('para.a-propos-2')}</p>
      </div>
    </details>
  `;

  const boutonsVue = [...panneau.querySelectorAll('[data-para-vue]')];
  const contenusVue = [...panneau.querySelectorAll('[data-para-contenu]')];
  const messageEtat = panneau.querySelector('.para-etat');
  const blocBalises = panneau.querySelector('.para-balises');
  const listeBalises = panneau.querySelector('.para-balises-liste');
  const choixSource = panneau.querySelector('.para-source-choix');
  const boutonActualiser = panneau.querySelector('.para-actualiser');
  const caseBalises = panneau.querySelector('[data-para-layer-balises]');
  const caseSites = panneau.querySelector('[data-para-layer-sites]');
  let actif = false;
  const vueLue = lire('para-vue', null);
  let vueActive = ['portee', 'vent', 'sites'].includes(vueLue) ? vueLue : null;

  const coche = (nom, defaut) => lire(nom, defaut) !== false;
  caseBalises.checked = coche('balises-visibles', true);
  if (caseSites) caseSites.checked = coche('sites-visibles', true);

  function rendreBalises() {
    if (!actif || vueActive !== 'sites') return;
    const stations = caseBalises.checked ? donnees.balisesProches(BALISES_LISTEES) : [];
    blocBalises.hidden = !caseBalises.checked;
    if (!stations.length) {
      const vide = document.createElement('p');
      vide.className = 'note';
      vide.textContent = t('para.aucun-releve');
      listeBalises.replaceChildren(vide);
      return;
    }
    listeBalises.replaceChildren(...stations.map((station) => {
      const ligne = document.createElement('button');
      ligne.type = 'button';
      ligne.className = 'para-balise';
      ligne.style.setProperty('--vent-couleur', couleurInterface(station.moyenne));
      ligne.insertAdjacentHTML('beforeend', cadranVent((station.direction + 180) % 360, 0, 'vent-cadran-petit'));
      const texte = document.createElement('span');
      texte.className = 'para-balise-texte';
      const nom = document.createElement('strong');
      nom.textContent = station.nom;
      const detail = document.createElement('small');
      detail.textContent = `${texteProvenance(station.direction)} · ${texteAge(station.date)}`;
      texte.append(nom, detail);
      const vitesse = document.createElement('span');
      vitesse.className = 'para-balise-vitesse';
      const moyenne = document.createElement('strong');
      moyenne.textContent = formatVent(station.moyenne);
      vitesse.append(moyenne);
      if (Number.isFinite(station.rafale)) {
        const rafale = document.createElement('small');
        rafale.className = 'para-balise-rafale';
        rafale.textContent = t('para.raf', { valeur: valeurVent(station.rafale) });
        vitesse.append(rafale);
      }
      ligne.append(texte, vitesse);
      ligne.addEventListener('click', () => {
        fermerMenu?.(); // sur téléphone, le menu cacherait la carte
        donnees.centrerSurBalise(station.id);
      });
      return ligne;
    }));
  }

  const donnees = initParapente(map, {
    onEtat({ type, message }) {
      messageEtat.textContent = message;
      messageEtat.classList.toggle('para-etat-erreur', type === 'erreur' || type === 'acces');
      boutonActualiser.disabled = type === 'chargement';
    },
    onDonnees: rendreBalises,
    // Pendant le choix du point de départ de la portée, un clic ne doit rien ouvrir d'autre
    peutOuvrirBalise: () => !portee.enAttente,
    onRetourFiche: ouvrirMenu,
  });
  const portee = initPortee(map, { onFermer: () => choisirVue(null), onRetour: ouvrirMenu });

  if (choixSource) {
    choixSource.value = donnees.sourceActive.id;
    choixSource.addEventListener('change', () => donnees.choisirSource(choixSource.value));
  }
  // Chaque onglet montre sa propre couche : balises et flèches de vent se gêneraient,
  // et un clic ouvrirait deux détails à la fois
  function synchroniserCarte() {
    const surOnglet = actif && vueActive === 'sites';
    donnees.setBalises(surOnglet && caseBalises.checked);
    donnees.setSites(surOnglet && Boolean(caseSites?.checked));
  }

  caseBalises.addEventListener('change', () => {
    ecrire('balises-visibles', caseBalises.checked);
    synchroniserCarte();
    rendreBalises();
  });
  caseSites?.addEventListener('change', () => {
    ecrire('sites-visibles', caseSites.checked);
    synchroniserCarte();
  });
  boutonActualiser.addEventListener('click', () => donnees.actualiser());
  surPreferences(() => {
    const paliers = libellesPaliersVent();
    panneau.querySelectorAll('[data-palier-libelle]').forEach((libelle, index) => {
      libelle.textContent = paliers[index];
    });
    panneau.querySelector('.para-legende-note').innerHTML = t('para.legende-note', { unite: libelleVent() });
    rendreBalises();
  });
  map.on('moveend', rendreBalises);

  function ouvrirOutil() {
    if (vueActive === 'vent') analyseVent.activer({ onFermer: () => choisirVue(null), onRetour: ouvrirMenu });
    else if (vueActive === 'portee') portee.ouvrir();
  }

  function afficherVue() {
    boutonsVue.forEach((bouton) => {
      bouton.setAttribute('aria-pressed', String(bouton.dataset.paraVue === vueActive));
    });
    contenusVue.forEach((contenu) => {
      contenu.hidden = contenu.dataset.paraContenu !== vueActive;
    });
  }

  // Portée et vent s'ouvrent sur la carte ; les balises gardent leur liste dans le menu.
  // `null` : aucun outil ouvert.
  function choisirVue(nom) {
    if (nom === vueActive) return;
    if (vueActive === 'vent') analyseVent.desactiver();
    if (vueActive === 'portee') portee.fermer();
    vueActive = nom;
    ecrire('para-vue', nom);
    afficherVue();
    synchroniserCarte();
    rendreBalises();
    if (!actif) return;
    ouvrirOutil();
    if (nom === 'vent' || nom === 'portee') fermerMenu?.();
  }

  afficherVue();

  boutonsVue.forEach((bouton) => {
    bouton.addEventListener('click', () => {
      const nom = bouton.dataset.paraVue;
      if (nom === vueActive) {
        choisirVue(null);
        return;
      }
      choisirVue(nom);
    });
  });

  return {
    id: 'parapente',
    labelCle: 'para.titre',
    icone: 'parapente',
    panneau,
    activer() {
      actif = true;
      synchroniserCarte();
      donnees.demarrer();
      rendreBalises();
      ouvrirOutil();
    },
    desactiver() {
      actif = false;
      donnees.arreter();
      synchroniserCarte();
      if (vueActive === 'vent') analyseVent.desactiver();
      if (vueActive === 'portee') portee.fermer();
    },
  };
}
