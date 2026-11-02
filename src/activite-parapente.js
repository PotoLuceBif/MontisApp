import { initParapente } from './parapente.js';
import { initPortee } from './portee.js';

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

    <section class="para-vue" data-para-contenu="sites" aria-label="Sites et balises FFVL" hidden>
      <p class="note para-etat" role="status" aria-live="polite">Vérification des données FFVL…</p>
      <div class="para-donnees" hidden>
        <label class="option-case"><input type="checkbox" data-para-layer-sites checked> Décollages et atterrissages
          <small>Sites FFVL et noms sur la carte</small></label>
        <label class="option-case"><input type="checkbox" data-para-layer-balises checked> Balises météo
          <small>Observations en temps réel ; les relevés anciens sont signalés</small></label>
        <div class="para-legende">
          <span><i class="para-point para-point-vert"></i> Décollage</span>
          <span><i class="para-point para-point-bleu"></i> Atterrissage</span>
        </div>
      </div>
      <button type="button" class="para-bouton para-actualiser">Actualiser les données</button>
    </section>

    <details class="rando-outils">
      <summary>À propos</summary>
      <div class="rando-outils-contenu">
        <p class="note">Les relevés et estimations sont indicatifs. Vérifiez les conditions auprès des sources officielles et des acteurs locaux : cette carte ne remplace ni votre jugement ni les consignes de sécurité.</p>
        <p class="note">Sites et balises : FFVL. <a class="para-lien" href="https://federation.ffvl.fr/pages/opendata" target="_blank" rel="noopener noreferrer">Accès aux données ↗</a></p>
      </div>
    </details>
  `;

  const boutonsVue = [...panneau.querySelectorAll('[data-para-vue]')];
  const contenusVue = [...panneau.querySelectorAll('[data-para-contenu]')];
  const messageEtat = panneau.querySelector('.para-etat');
  const blocDonnees = panneau.querySelector('.para-donnees');
  const boutonActualiser = panneau.querySelector('.para-actualiser');
  const caseBalises = panneau.querySelector('[data-para-layer-balises]');
  const caseSites = panneau.querySelector('[data-para-layer-sites]');
  const hoteVent = panneau.querySelector('.para-analyse-vent');
  let actif = false;
  let vueActive = 'portee';

  const donnees = initParapente(map, {
    onEtat({ type, message }) {
      messageEtat.textContent = message;
      boutonActualiser.disabled = type === 'chargement';
    },
    onStatistiques() {
      blocDonnees.hidden = false; // les options n'ont de sens qu'une fois des données reçues
    },
  });
  const portee = initPortee(map, panneau.querySelector('[data-para-portee]'), { onChoisirPoint });

  caseBalises.addEventListener('change', () => donnees.setBalises(caseBalises.checked));
  caseSites.addEventListener('change', () => donnees.setSites(caseSites.checked));
  boutonActualiser.addEventListener('click', () => donnees.actualiser());

  function choisirVue(nom) {
    if (nom === vueActive) return;
    vueActive = nom;
    boutonsVue.forEach((bouton) => {
      bouton.setAttribute('aria-pressed', String(bouton.dataset.paraVue === nom));
    });
    contenusVue.forEach((contenu) => {
      contenu.hidden = contenu.dataset.paraContenu !== nom;
    });

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
      donnees.setBalises(caseBalises.checked);
      donnees.setSites(caseSites.checked);
      donnees.demarrer();
      if (vueActive === 'vent') {
        analyseVent.monterDans(hoteVent);
        analyseVent.activer();
      }
    },
    desactiver() {
      actif = false;
      donnees.arreter();
      donnees.setBalises(false);
      donnees.setSites(false);
      analyseVent.desactiver();
      analyseVent.retournerAuMenu();
      portee.reinitialiser();
    },
  };
}
