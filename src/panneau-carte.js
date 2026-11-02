// Panneau posé sur la carte : à gauche sur ordinateur, en bas sur téléphone, où il se réduit
// en bandeau pour laisser voir la carte. Un seul à la fois, ils occupent la même place.
import { lire, ecrire } from './reglages.js';

const SEUIL_GESTE = 28; // px
const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

let panneauOuvert = null;

export function creerPanneauCarte({ cle, libelle, classe = '', onFermer = () => {}, onAgrandi = () => {} }) {
  const element = document.createElement('aside');
  element.className = `bf ${classe}`.trim();
  element.hidden = true;
  element.setAttribute('aria-label', libelle);
  element.innerHTML = `
    <button type="button" class="bf-poignee" aria-hidden="true" tabindex="-1"></button>
    <div class="bf-barre">
      <button type="button" class="bf-resume" aria-label="Agrandir : ${libelle}">
        <span class="bf-resume-rose"></span>
        <span class="bf-resume-texte"><strong></strong><small></small></span>
        <span class="bf-resume-vent"><b></b> <i></i></span>
        <svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <button type="button" class="bf-fermer" aria-label="Fermer : ${libelle}">${CROIX}</button>
    </div>
    <header class="bf-entete">
      <div class="bf-titres">
        <h3 class="bf-nom"></h3>
        <p class="bf-meta"></p>
      </div>
      <div class="bf-actions">
        <button type="button" class="bf-reduire" aria-label="Réduire : ${libelle}"><svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <button type="button" class="bf-fermer" aria-label="Fermer : ${libelle}">${CROIX}</button>
      </div>
    </header>
    <div class="bf-corps"></div>
  `;
  document.body.append(element); // hors de la carte : ses commandes ne doivent pas passer devant

  const $ = (selecteur) => element.querySelector(selecteur);
  let reduit = lire(cle, false) === true;
  let departGeste = null;
  let gesteFait = false;

  function appliquerReduction() {
    element.classList.toggle('bf-reduite', reduit);
    if (!element.hidden && !reduit) onAgrandi();
  }

  function basculer(valeur) {
    reduit = valeur;
    ecrire(cle, reduit);
    appliquerReduction();
  }

  element.querySelectorAll('.bf-fermer').forEach((bouton) => bouton.addEventListener('click', () => onFermer()));
  $('.bf-reduire').addEventListener('click', () => basculer(true));
  $('.bf-poignee').addEventListener('click', () => {
    if (!gesteFait) basculer(!reduit);
    gesteFait = false;
  });
  $('.bf-resume').addEventListener('click', () => {
    if (!gesteFait) basculer(false);
    gesteFait = false;
  });
  // Glisser le haut du panneau vers le bas le réduit, vers le haut l'agrandit
  element.addEventListener('pointerdown', (event) => {
    const prise = event.target.closest('.bf-poignee, .bf-barre, .bf-entete');
    departGeste = prise && !event.target.closest('.bf-fermer, .bf-reduire') ? event.clientY : null;
    gesteFait = false;
  });
  element.addEventListener('pointerup', (event) => {
    if (departGeste === null) return;
    const ecart = event.clientY - departGeste;
    departGeste = null;
    if (Math.abs(ecart) < SEUIL_GESTE || !window.matchMedia('(max-width: 640px)').matches) return;
    gesteFait = true;
    basculer(ecart > 0);
  });
  element.addEventListener('pointercancel', () => {
    departGeste = null;
  });

  const panneau = {
    element,
    titre: $('.bf-nom'),
    meta: $('.bf-meta'),
    corps: $('.bf-corps'),
    get ouvert() {
      return !element.hidden;
    },
    afficher() {
      if (panneauOuvert && panneauOuvert !== panneau) panneauOuvert.demanderFermeture();
      panneauOuvert = panneau;
      element.hidden = false;
      element.scrollTop = 0;
      element.classList.toggle('bf-reduite', reduit);
    },
    masquer() {
      element.hidden = true;
      if (panneauOuvert === panneau) panneauOuvert = null;
    },
    demanderFermeture: () => onFermer(),
    // Le contenu du bandeau réduit
    definirResume({ rose, nom, detail, valeur, unite }) {
      if (rose !== undefined) $('.bf-resume-rose').innerHTML = rose;
      if (nom !== undefined) $('.bf-resume-texte strong').textContent = nom;
      if (detail !== undefined) $('.bf-resume-texte small').textContent = detail;
      if (valeur !== undefined) $('.bf-resume-vent b').textContent = valeur;
      if (unite !== undefined) $('.bf-resume-vent i').textContent = unite;
    },
  };
  return panneau;
}
