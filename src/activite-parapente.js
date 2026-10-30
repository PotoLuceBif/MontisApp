import { initParapente } from './parapente.js';
import { initPortee } from './portee.js';

export function creerActiviteParapente(map) {
  const panneau = document.createElement('div');
  panneau.className = 'parapente';
  panneau.innerHTML = `
    <section class="para-intro">
      <div class="para-intro-meta">
        <span>ACTIVITÉ MONTAGNE</span>
        <span class="para-badge">FFVL</span>
      </div>
      <h2>Parapente</h2>
      <p>Sites de vol, balises météo et outils pour préparer votre sortie.</p>
    </section>

    <section class="para-statut" data-etat="attente" aria-label="État des données FFVL">
      <div class="para-statut-entete">
        <div class="para-statut-titre">
          <span class="para-indicateur" aria-hidden="true"></span>
          <strong>Données FFVL</strong>
        </div>
        <button class="para-actualiser" type="button" aria-label="Actualiser les données FFVL">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg>
          Actualiser
        </button>
      </div>
      <p class="para-statut-message" role="status" aria-live="polite">
        Les données seront vérifiées à l’ouverture de l’activité.
      </p>
      <a class="para-lien-ffvl" href="https://federation.ffvl.fr/pages/opendata" target="_blank" rel="noopener noreferrer">
        Comprendre l’accès aux données <span aria-hidden="true">↗</span>
      </a>
    </section>

    <div class="para-indicateurs" aria-label="Données disponibles">
      <div><strong data-para-compteur-sites>—</strong><span>sites de vol</span></div>
      <div><strong data-para-compteur-balises>—</strong><span>balises météo</span></div>
      <div><strong data-para-compteur-perimees>—</strong><span>relevés anciens</span></div>
    </div>

    <section class="para-section" aria-labelledby="para-carte-titre">
      <div class="para-section-entete">
        <span>01</span>
        <h3 id="para-carte-titre">Carte de vol</h3>
      </div>
      <label class="para-option">
        <span class="para-option-icone" aria-hidden="true">↗</span>
        <span><strong>Balises de vent</strong><small>Vitesse, rafales et direction du vent</small></span>
        <input type="checkbox" data-para-layer-balises checked>
      </label>
      <label class="para-option">
        <span class="para-option-icone para-option-icone-site" aria-hidden="true">⌖</span>
        <span><strong>Sites de vol</strong><small>Décollages, atterrissages et noms</small></span>
        <input type="checkbox" data-para-layer-sites checked>
      </label>
      <div class="para-legende">
        <span><i class="para-point para-point-vert"></i> Décollage</span>
        <span><i class="para-point para-point-bleu"></i> Atterrissage</span>
        <span><i class="para-point para-point-gris"></i> Relevé ancien</span>
      </div>
    </section>

    <section class="para-section para-portee" aria-labelledby="para-portee-titre">
      <div class="para-section-entete">
        <span>02</span>
        <h3 id="para-portee-titre">Outil de portée</h3>
      </div>
      <p class="para-section-aide">Explorez une portée théorique à partir d’un point de départ.</p>
      <div data-para-portee></div>
    </section>

    <p class="para-securite">
      Les relevés et estimations sont indicatifs. Vérifiez les conditions auprès des sources officielles et
      des acteurs locaux ; cette carte ne remplace ni votre jugement ni les consignes de sécurité.
    </p>
  `;

  const etat = panneau.querySelector('.para-statut');
  const messageEtat = panneau.querySelector('.para-statut-message');
  const boutonActualiser = panneau.querySelector('.para-actualiser');
  const caseBalises = panneau.querySelector('[data-para-layer-balises]');
  const caseSites = panneau.querySelector('[data-para-layer-sites]');
  const compteurSites = panneau.querySelector('[data-para-compteur-sites]');
  const compteurBalises = panneau.querySelector('[data-para-compteur-balises]');
  const compteurPerimees = panneau.querySelector('[data-para-compteur-perimees]');
  const controles = panneau.querySelector('.para-indicateurs');

  const donnees = initParapente(map, {
    onEtat({ type, message }) {
      etat.dataset.etat = type;
      etat.setAttribute('aria-busy', String(type === 'chargement'));
      messageEtat.textContent = message;
      boutonActualiser.disabled = type === 'chargement';
      boutonActualiser.classList.toggle('en-chargement', type === 'chargement');
    },
    onStatistiques({ sites, balises, perimees }) {
      compteurSites.textContent = String(sites);
      compteurBalises.textContent = String(balises);
      compteurPerimees.textContent = String(perimees);
      controles.classList.add('para-indicateurs-actifs');
    },
  });
  const portee = initPortee(map, panneau.querySelector('[data-para-portee]'));

  caseBalises.addEventListener('change', () => donnees.setBalises(caseBalises.checked));
  caseSites.addEventListener('change', () => donnees.setSites(caseSites.checked));
  boutonActualiser.addEventListener('click', () => donnees.actualiser());

  return {
    id: 'parapente',
    label: 'Parapente',
    icone: 'parapente',
    panneau,
    activer() {
      donnees.setBalises(caseBalises.checked);
      donnees.setSites(caseSites.checked);
      donnees.demarrer();
    },
    desactiver() {
      donnees.arreter();
      donnees.setBalises(false);
      donnees.setSites(false);
      portee.reinitialiser();
    },
  };
}
