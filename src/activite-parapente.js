import { initParapente } from './parapente.js';
import { initPortee } from './portee.js';
import { lire, ecrire } from './reglages.js';
import { COULEUR_BALISE_INACTIVE, FFVL_ACTIVE, SOURCES_BALISES, texteAge } from './balises-sources.js';
import { PALETTE_CARTE, cadranVent, couleurInterface, texteProvenance } from './vent-cadran.js';

const BALISES_LISTEES = 6;
const PALIERS = ['0–9', '10–19', '20–29', '30–39', '40+'];

const puceManche = (couleur) => `<svg class="para-manche" viewBox="0 0 22 12" aria-hidden="true" style="--vent-couleur: ${couleur}"><path class="cerne" d="M1 1.5 21 3.8V8.2L1 10.5Z"/><path class="plein" d="M1 1.5 21 3.8V8.2L1 10.5Z"/><path class="bande" d="M8 2.3 14 3V9L8 9.7Z"/></svg>`;

export function creerActiviteParapente(map, { onChoisirPoint, analyseVent } = {}) {
  const panneau = document.createElement('div');
  panneau.className = 'parapente';
  panneau.innerHTML = `
    <div class="rando-actions-principales" role="group" aria-label="Outils parapente">
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="portee" aria-pressed="true">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/></svg>
        <span>Portée de vol</span>
      </button>
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="vent" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h16a3 3 0 1 1-3 3"/><path d="M4 16h6a3 3 0 1 1-3 3"/></svg>
        <span>Analyse du vent</span>
      </button>
      <button type="button" class="rando-action-principale para-vue-bouton" data-para-vue="sites" aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <span>Sites et balises</span>
      </button>
    </div>

    <section class="para-vue" data-para-contenu="portee" aria-label="Portée de vol">
      <div data-para-portee></div>
    </section>

    <section class="para-vue" data-para-contenu="vent" aria-label="Analyse du vent" hidden>
      <div class="para-analyse-vent"></div>
    </section>

    <section class="para-vue" data-para-contenu="sites" aria-label="Sites et balises" hidden>
      <div class="para-source">
        <span>Source des balises</span>
        ${SOURCES_BALISES.length > 1
    ? `<select class="para-source-choix" aria-label="Source des balises">${SOURCES_BALISES.map(({ id, libelle }) => `<option value="${id}">${libelle}</option>`).join('')}</select>`
    : `<a class="para-lien" href="${SOURCES_BALISES[0].lien}" target="_blank" rel="noopener noreferrer">${SOURCES_BALISES[0].libelle} ↗</a>`}
      </div>
      <p class="note para-etat" role="status" aria-live="polite"></p>
      <label class="option-case"><input type="checkbox" data-para-layer-balises> Balises de vent
        <small>Relevés en temps réel, touchez une balise pour ouvrir sa fiche</small></label>
      <div class="para-legende" aria-label="Vent moyen en kilomètres par heure">
        ${PALIERS.map((palier, index) => `<span>${puceManche(PALETTE_CARTE[index])} ${palier}</span>`).join('')}
        <span>${puceManche(COULEUR_BALISE_INACTIVE)} Plus de 2 h</span>
        <span><i class="para-hs">×</i> Hors service</span>
      </div>
      <p class="note para-legende-note">La manche pointe où va le vent, le chiffre donne le vent moyen en km/h.</p>
      <div class="para-balises" hidden>
        <h3>Balises de la zone</h3>
        <div class="para-balises-liste"></div>
      </div>
      ${FFVL_ACTIVE
    ? `<label class="option-case"><input type="checkbox" data-para-layer-sites> Décollages et atterrissages
        <small>Sites FFVL et noms sur la carte</small></label>
      <div class="para-legende">
        <span><i class="para-point para-point-vert"></i> Décollage</span>
        <span><i class="para-point para-point-bleu"></i> Atterrissage</span>
      </div>`
    : '<p class="note">Décollages et atterrissages : aucune source ouverte n’est disponible pour le moment.</p>'}
      <button type="button" class="para-bouton para-actualiser">Actualiser les relevés</button>
    </section>

    <details class="rando-outils">
      <summary>À propos</summary>
      <div class="rando-outils-contenu">
        <p class="note">Les relevés et estimations sont indicatifs. Vérifiez les conditions auprès des sources officielles et des acteurs locaux : cette carte ne remplace ni votre jugement ni les consignes de sécurité.</p>
        <p class="note">Vent © contributeurs du réseau <a class="para-lien" href="https://www.openwindmap.org" target="_blank" rel="noopener noreferrer">OpenWindMap ↗</a></p>
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
  const hoteVent = panneau.querySelector('.para-analyse-vent');
  let actif = false;
  let vueActive = 'portee';

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
      vide.textContent = 'Aucun relevé récent dans cette zone. Déplacez ou dézoomez la carte.';
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
      moyenne.textContent = `${Math.round(station.moyenne)} km/h`;
      vitesse.append(moyenne);
      if (Number.isFinite(station.rafale)) {
        const rafale = document.createElement('small');
        rafale.className = 'para-balise-rafale';
        rafale.textContent = `raf. ${Math.round(station.rafale)}`;
        vitesse.append(rafale);
      }
      ligne.append(texte, vitesse);
      ligne.addEventListener('click', () => {
        onChoisirPoint?.(); // sur téléphone, le panneau cacherait la carte
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
  });
  const portee = initPortee(map, panneau.querySelector('[data-para-portee]'), { onChoisirPoint });

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
  map.on('moveend', rendreBalises);

  function choisirVue(nom) {
    if (nom === vueActive) return;
    vueActive = nom;
    boutonsVue.forEach((bouton) => {
      bouton.setAttribute('aria-pressed', String(bouton.dataset.paraVue === nom));
    });
    contenusVue.forEach((contenu) => {
      contenu.hidden = contenu.dataset.paraContenu !== nom;
    });
    synchroniserCarte();
    rendreBalises();

    if (nom === 'vent') {
      analyseVent.monterDans(hoteVent);
      if (actif) analyseVent.activer();
    } else {
      analyseVent.desactiver();
      analyseVent.retournerAuMenu();
    }
  }

  boutonsVue.forEach((bouton) => {
    bouton.addEventListener('click', () => choisirVue(bouton.dataset.paraVue));
  });

  return {
    id: 'parapente',
    label: 'Parapente',
    icone: 'parapente',
    panneau,
    activer() {
      actif = true;
      synchroniserCarte();
      donnees.demarrer();
      rendreBalises();
      if (vueActive === 'vent') {
        analyseVent.monterDans(hoteVent);
        analyseVent.activer();
      }
    },
    desactiver() {
      actif = false;
      donnees.arreter();
      synchroniserCarte();
      analyseVent.desactiver();
      analyseVent.retournerAuMenu();
      portee.reinitialiser();
    },
  };
}
