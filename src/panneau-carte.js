// Panneau posé sur la carte : à gauche sur ordinateur, en bas sur téléphone, où il se réduit
// en bandeau pour laisser voir la carte. Un seul à la fois, ils occupent la même place.
// `libelle` : clé de traduction du nom du panneau (pour les lecteurs d'écran).
import { lire, ecrire } from './reglages.js';
import { surLangue, t, ta } from './i18n.js';

const SEUIL_GESTE = 28; // px
const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const FLECHE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';

let panneauOuvert = null;

export function creerPanneauCarte({ cle, libelle, classe = '', onFermer = () => {}, onAgrandi = () => {}, onRetour = null }) {
  const element = document.createElement('aside');
  element.className = `bf ${classe}`.trim();
  element.hidden = true;
  const nom = () => t(libelle);
  element.setAttribute('aria-label', nom());
  element.innerHTML = `
    <button type="button" class="bf-poignee" aria-hidden="true" tabindex="-1"></button>
    <div class="bf-barre">
      <button type="button" class="bf-retour" ${ta('aria-label', 'panneau.retour')} ${ta('title', 'panneau.retour')} hidden>${FLECHE}</button>
      <button type="button" class="bf-resume" data-libelle="panneau.agrandir">
        <span class="bf-resume-rose"></span>
        <span class="bf-resume-texte"><strong></strong><small></small></span>
        <span class="bf-resume-vent"><b></b> <i></i></span>
        <svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
      </button>
      <button type="button" class="bf-fermer" data-libelle="panneau.fermer">${CROIX}</button>
    </div>
    <header class="bf-entete">
      <button type="button" class="bf-retour" ${ta('aria-label', 'panneau.retour')} ${ta('title', 'panneau.retour')} hidden>${FLECHE}</button>
      <div class="bf-titres">
        <h3 class="bf-nom"></h3>
        <p class="bf-meta"></p>
      </div>
      <div class="bf-actions">
        <button type="button" class="bf-reduire" data-libelle="panneau.reduire"><svg class="bf-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <button type="button" class="bf-fermer" data-libelle="panneau.fermer">${CROIX}</button>
      </div>
    </header>
    <div class="bf-corps"></div>
  `;
  document.body.append(element); // hors de la carte : ses commandes ne doivent pas passer devant

  const $ = (selecteur) => element.querySelector(selecteur);
  const nommer = () => {
    element.setAttribute('aria-label', nom());
    element.querySelectorAll('[data-libelle]').forEach((bouton) => {
      bouton.setAttribute('aria-label', t(bouton.dataset.libelle, { nom: nom() }));
    });
  };
  nommer();
  surLangue(nommer);
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
    window.dispatchEvent(new Event('panneau-carte'));
  }

  element.querySelectorAll('.bf-fermer').forEach((bouton) => bouton.addEventListener('click', () => onFermer()));
  let retour = onRetour;
  const majRetour = () => element.querySelectorAll('.bf-retour').forEach((bouton) => {
    bouton.hidden = !retour;
  });
  element.querySelectorAll('.bf-retour').forEach((bouton) => bouton.addEventListener('click', () => retour?.()));
  majRetour();
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
    departGeste = prise && !event.target.closest('.bf-fermer, .bf-reduire, .bf-retour') ? event.clientY : null;
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
      window.dispatchEvent(new Event('panneau-carte'));
    },
    masquer() {
      element.hidden = true;
      if (panneauOuvert === panneau) panneauOuvert = null;
      window.dispatchEvent(new Event('panneau-carte'));
    },
    demanderFermeture: () => onFermer(),
    agrandir() {
      if (reduit) basculer(false);
    },
    definirRetour(nouveau) {
      retour = nouveau;
      majRetour();
    },
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
