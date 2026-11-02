// Visiter un bike park : la visite 3D des stations, en décor d'été et avec les pistes de descente.
// La liste vient de scripts/extraire-bike-parks.mjs : des secteurs de pistes balisées dans
// OpenStreetMap, pas un annuaire officiel. Ni l'ouverture ni les horaires n'y figurent.
import { creerPanneauCarte } from './panneau-carte.js';
import { creerVisiteStation } from './visite-station.js';

const URL_LISTE = '/data/bike-parks.json';
const NIVEAUX = [
  ['verte', 'Verte', '#1f9d55'],
  ['bleue', 'Bleue', '#1f6fd6'],
  ['rouge', 'Rouge', '#d92b2f'],
  ['noire', 'Noire', '#15181d'],
  ['inconnu', 'Non cotée', '#6f7884'],
];
const ICONE = '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3.500"/><circle cx="18" cy="17" r="3.500"/><path d="M6 17 10 9h6l2 8M3 6l6 3M21 4l-5 5"/></svg>';

const km = (valeur) => `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: valeur < 10 ? 1 : 0 })} km`;
const sansAccent = (texte) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function creerBikeParks(map, { conteneur, fermerMenu = () => {} }) {
  const visite = creerVisiteStation(map, {
    ete: true,
    dossier: '/data/bike-parks',
    attribution: 'Pistes VTT et remontées : © contributeurs OpenStreetMap (ODbL), OpenSkiData',
  });
  let parks = null;
  let enVisite = false;
  let jeton = 0;

  const panneau = creerPanneauCarte({
    cle: 'bikepark-panneau-reduit',
    libelle: 'visite du bike park',
    classe: 'bf-outil bf-bikepark',
    onFermer: () => quitter(),
  });
  panneau.corps.innerHTML = `
    <div class="velo-stats velo-stats-park">
      <div class="velo-stat"><span>Pistes</span><strong data-bp="pistes"></strong></div>
      <div class="velo-stat"><span>Longueur</span><strong data-bp="km"></strong></div>
      <div class="velo-stat"><span>Remontées</span><strong data-bp="remontees"></strong></div>
    </div>
    <div class="velo-repartition"><div class="velo-barre" data-bp="barre"></div><div class="velo-legende" data-bp="legende"></div></div>
    <p class="velo-etat">Touchez une piste pour lire son nom et sa longueur.</p>
    <details class="rando-outils">
      <summary>À savoir</summary>
      <div class="rando-outils-contenu">
        <p class="note">Secteur repéré dans OpenStreetMap, sans liste officielle : certaines pistes peuvent manquer ou être fermées. Les remontées sont celles de la station, sans indication d’ouverture l’été. Vérifiez auprès de la station avant de venir.</p>
      </div>
    </details>
  `;
  const champ = (id) => panneau.corps.querySelector(`[data-bp="${id}"]`);

  conteneur.innerHTML = `
    <input type="text" class="rando-champ velo-park-recherche" placeholder="Chercher un bike park…" autocomplete="off" spellcheck="false" inputmode="search" aria-label="Chercher un bike park">
    <p class="note velo-park-message" role="status" aria-live="polite" hidden></p>
    <div class="rando-liste velo-park-liste"></div>
  `;
  const recherche = conteneur.querySelector('.velo-park-recherche');
  const message = conteneur.querySelector('.velo-park-message');
  const liste = conteneur.querySelector('.velo-park-liste');

  function afficherMessage(texte) {
    message.textContent = texte;
    message.hidden = !texte;
  }

  function quitter() {
    jeton += 1;
    panneau.masquer();
    if (enVisite) {
      enVisite = false;
      visite.quitter();
    }
  }

  async function visiter(park) {
    jeton += 1;
    const demande = jeton;
    afficherMessage(`Préparation de ${park.nom}…`);
    try {
      const donnees = await visite.charger(park.id);
      if (demande !== jeton) return;
      afficherMessage('');
      fermerMenu();
      panneau.titre.textContent = park.nom;
      panneau.meta.textContent = park.lieu;
      champ('pistes').textContent = String(park.pistes);
      champ('km').textContent = km(park.km);
      champ('remontees').textContent = String(park.remontees);
      const presents = NIVEAUX.filter(([id]) => park.niveaux[id]);
      champ('barre').innerHTML = presents.map(([id, , couleur]) => `<i style="width: ${(park.niveaux[id] / park.km) * 100}%; background: ${couleur}"></i>`).join('');
      champ('legende').innerHTML = presents.map(([id, libelle, couleur]) => `<span><i style="background: ${couleur}"></i>${libelle} ${km(park.niveaux[id])}</span>`).join('');
      panneau.definirResume({ rose: ICONE, nom: park.nom, detail: `${park.pistes} pistes · ${km(park.km)}`, valeur: '', unite: '' });
      panneau.afficher();
      const cadre = panneau.element.getBoundingClientRect();
      const toutLaLargeur = cadre.width >= window.innerWidth - 4;
      visite.demarrer(donnees, toutLaLargeur ? { bottom: window.innerHeight - cadre.top + 20 } : { left: cadre.right + 30 });
      enVisite = true;
    } catch (erreur) {
      if (demande !== jeton) return;
      console.warn('Visite du bike park :', erreur);
      afficherMessage('Ce bike park n’a pas pu être chargé. Réessayez avec du réseau.');
    }
  }

  function rendre() {
    if (!parks) return;
    const texte = sansAccent(recherche.value.trim());
    const { lng, lat } = map.getCenter();
    const kLng = Math.cos((lat * Math.PI) / 180);
    const ecart = (park) => Math.hypot((park.lng - lng) * kLng, park.lat - lat);
    // Le plus proche de la carte d'abord : c'est sans doute celui qu'on regarde
    const trouves = parks
      .filter((park) => !texte || sansAccent(`${park.nom} ${park.lieu}`).includes(texte))
      .sort((a, b) => ecart(a) - ecart(b));
    afficherMessage(trouves.length ? '' : 'Aucun bike park à ce nom.');
    liste.replaceChildren(...trouves.map((park) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'rando-item velo-item';
      const textes = document.createElement('span');
      textes.className = 'rando-item-textes';
      const nom = document.createElement('span');
      nom.className = 'rando-item-nom';
      nom.textContent = park.nom;
      const sous = document.createElement('span');
      sous.className = 'rando-item-sous';
      sous.textContent = `${park.pistes} pistes · ${km(park.km)}${park.lieu ? ` · ${park.lieu}` : ''}`;
      textes.append(nom, sous);
      item.append(textes);
      item.addEventListener('click', () => void visiter(park));
      return item;
    }));
  }

  async function charger() {
    if (parks) {
      rendre();
      return;
    }
    afficherMessage('Chargement de la liste…');
    try {
      const reponse = await fetch(new URL(URL_LISTE, window.location.origin).href);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      parks = await reponse.json();
      rendre();
    } catch (erreur) {
      console.warn('Liste des bike parks :', erreur);
      afficherMessage('Liste indisponible pour le moment.');
    }
  }

  recherche.addEventListener('input', rendre);

  return { charger, quitter };
}
