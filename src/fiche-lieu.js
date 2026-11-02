// La fiche d'un lieu (station, bike park), en bas de la carte : infos, favori, recherche d'un autre
// lieu, puis la visite 3D sur demande. Chaque activité n'apporte que ses textes et son contenu.
import { lire, ecrire } from './reglages.js';

const ZOOM_POSITION = 14;
const ZOOM_FICHE = 12.5;
const ICONE_RECHERCHE = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>';
const ICONE_LOCALISER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
const ICONE_VISITER = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 19.5 6.5-13 4 7.5 2-3 5.5 8.5H3Z"/><path d="m7.3 11 2.2 1.6 1.8-1.6"/></svg>';
const ICONE_FAVORI = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.6Z"/></svg>';
const NIVEAUX = [
  ['verte', 'Vertes'],
  ['bleue', 'Bleues'],
  ['rouge', 'Rouges'],
  ['noire', 'Noires'],
  ['inconnu', 'Non cotées'],
];

export function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte != null) e.textContent = texte;
  return e;
}

export const km = (valeur) =>
  `${valeur.toLocaleString('fr-FR', { maximumFractionDigits: valeur < 10 ? 1 : 0 })} km`;
const surTelephone = () => window.matchMedia('(max-width: 640px)').matches;
const fermerMenu = () => document.getElementById('menu-fermer')?.click();

export function stat(valeur, libelle) {
  const s = el('div', 'rando-stat');
  s.append(el('strong', null, valeur), el('span', null, libelle));
  return s;
}

export function creerNiveaux(niveaux) {
  const presents = NIVEAUX.filter(([couleur]) => niveaux[couleur] > 0);
  const total = presents.reduce((somme, [couleur]) => somme + niveaux[couleur], 0);
  const bloc = el('div', 'ski-niveaux');
  const barre = el('div', 'ski-niveaux-barre');
  barre.setAttribute('aria-hidden', 'true');
  const legende = el('div', 'ski-niveaux-legende');
  for (const [couleur, libelle] of presents) {
    const segment = el('span', `ski-niveau-${couleur}`);
    segment.style.flexGrow = String(niveaux[couleur] / total);
    barre.append(segment);
    const entree = el('span', 'ski-niveaux-entree');
    entree.append(el('i', `ski-niveau-${couleur}`), `${libelle} ${km(niveaux[couleur])}`);
    legende.append(entree);
  }
  bloc.append(barre, legende);
  return bloc;
}

export function creerPosition(map, [lng, lat]) {
  const texte = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const bloc = el('div', 'ski-position');
  const icone = el('span', 'ski-position-icone');
  icone.innerHTML = ICONE_LOCALISER;
  const textes = el('div', 'ski-position-textes');
  textes.append(el('span', null, 'Position GPS'), el('strong', null, texte));
  const copier = el('button', 'fiche-copier', 'Copier');
  copier.type = 'button';
  copier.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texte);
      copier.textContent = 'Copié ✓';
    } catch {
      copier.textContent = 'Indisponible';
    }
  });
  const zoomer = el('button', 'fiche-copier', 'Zoomer');
  zoomer.type = 'button';
  zoomer.addEventListener('click', () => {
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), ZOOM_POSITION), offset: [0, -70], duration: 900, essential: true });
  });
  bloc.append(icone, textes, copier, zoomer);
  return bloc;
}

// Une ligne de résultat : le nom localise, les deux actions restent à portée du doigt
export function creerItemLieu({ feature, identifiant, sous, peutVisiter, descriptionVisiteImpossible, localiser, visiter }) {
  const { nom } = feature.properties;
  const action = (classe, icone, libelle, description, surClic) => {
    const bouton = el('button', `ski-item-action ${classe}`);
    bouton.type = 'button';
    bouton.innerHTML = icone;
    bouton.append(libelle);
    bouton.setAttribute('aria-label', description);
    bouton.title = description;
    bouton.addEventListener('click', surClic);
    return bouton;
  };
  const item = el('div', 'rando-item ski-item');
  item.id = identifiant;
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', 'false');
  const infos = el('button', 'ski-item-infos');
  infos.type = 'button';
  infos.append(el('span', 'rando-item-nom', nom));
  if (sous) infos.append(el('span', 'rando-item-sous', sous));
  infos.setAttribute('aria-label', `Localiser ${nom}`);
  infos.addEventListener('click', () => localiser(feature));
  const boutonLocaliser = action('ski-item-localiser', ICONE_LOCALISER, 'Localiser', `Localiser ${nom} sur la carte`, () => localiser(feature));
  const boutonVisiter = action(
    'ski-item-visiter', ICONE_VISITER, 'Visiter',
    peutVisiter ? `Visiter ${nom}` : descriptionVisiteImpossible,
    () => visiter(feature)
  );
  boutonVisiter.disabled = !peutVisiter;
  item.append(infos, boutonLocaliser, boutonVisiter);
  return item;
}

export function creerFavoris(cle) {
  let ids = lire(cle, []);
  return {
    contient: (id) => ids.includes(id),
    basculer(id) {
      ids = ids.includes(id) ? ids.filter((autre) => autre !== id) : [...ids, id];
      ecrire(cle, ids);
    },
    ids: () => ids,
  };
}

// `textes` : visiter, fermer, chercher, detail. `decrire(feature)` : { badge: { court, couleur }, situation }.
// `rendreCorps(carte, feature)` ajoute le contenu ; `rendreActions(actions, contenu)` complète le pied.
// `creerRecherche` construit la recherche d'un autre lieu. `surChoix` et `surChangement` préviennent
// l'activité (conditions à charger, repères à redessiner).
export function creerFicheLieu(map, { id, visite, textes, decrire, peutVisiter, favoris, rendreCorps, rendreActions = () => {}, creerRecherche, surChoix = () => {}, surChangement = () => {}, surFavori = () => {} }) {
  let actif = false;
  let ecouteurPose = false;
  let choisi = null;
  let reduite = false;
  let etatVisite = 'repos'; // repos | chargement | erreur | active
  let numeroVisite = 0;
  let enChargement = null;
  let erreurChangement = false;

  const carte = el('aside');
  carte.id = id;
  carte.hidden = true;
  document.body.appendChild(carte);

  const zoneRecherche = el('div', 'ski-fiche-recherche');
  zoneRecherche.hidden = true;
  zoneRecherche.innerHTML = `
    <input type="text" placeholder="${textes.chercher}"
      autocomplete="off" spellcheck="false" inputmode="search" aria-label="${textes.chercher}"
      role="combobox" aria-autocomplete="list" aria-controls="${id}-liste" aria-expanded="false">
    <div class="rando-liste" id="${id}-liste" role="listbox" aria-label="Résultats" hidden></div>
  `;
  document.body.appendChild(zoneRecherche);
  const champRecherche = zoneRecherche.querySelector('input');
  const recherche = creerRecherche({
    champ: champRecherche,
    liste: zoneRecherche.querySelector('.rando-liste'),
    prefixe: `${id}-suggestion`,
    surEchap: fermerRecherche,
  });

  function placerRecherche() {
    if (zoneRecherche.hidden || carte.hidden) return;
    const bas = window.innerHeight - carte.getBoundingClientRect().top + 8;
    zoneRecherche.style.setProperty('--ski-recherche-bas', `${bas}px`);
  }

  function majBoutonRecherche() {
    carte.querySelector('.ski-fiche-chercher')?.setAttribute('aria-expanded', String(!zoneRecherche.hidden));
  }

  function ouvrirRecherche() {
    erreurChangement = false;
    zoneRecherche.hidden = false;
    placerRecherche();
    majBoutonRecherche();
    champRecherche.focus();
  }

  function fermerRecherche() {
    if (zoneRecherche.hidden) return;
    zoneRecherche.hidden = true;
    recherche.effacer();
    majBoutonRecherche();
  }

  function majReduction() {
    carte.classList.toggle('fiche-reduite', reduite);
    const bouton = carte.querySelector('.rando-fiche-reduire:not(.ski-fiche-chercher):not(.ski-fiche-favori)');
    if (!bouton) return;
    bouton.classList.toggle('ouverte', !reduite);
    bouton.setAttribute('aria-expanded', String(!reduite));
    bouton.setAttribute('aria-label', reduite ? textes.detail : 'Réduire la fiche');
    placerRecherche();
  }

  function reduire(valeur) {
    reduite = valeur;
    majReduction();
  }

  // Sur mobile, la fiche s'efface dès qu'on manipule la carte pour ne pas masquer la vue
  function reduireSiMobile(event) {
    if (!event.originalEvent) return;
    fermerRecherche();
    if (!choisi || reduite) return;
    if (surTelephone()) reduire(true);
  }

  function rendre() {
    carte.replaceChildren();
    carte.hidden = !choisi;
    if (!choisi) return;

    const { badge: type, situation } = decrire(choisi);
    const entete = el('div', 'rando-entete');
    const badge = el('span', 'rando-badge', type.court);
    badge.style.background = type.couleur;
    const titres = el('div', 'rando-titres');
    let titre = choisi.properties.nom;
    if (enChargement && etatVisite === 'active') titre = `Préparation : ${enChargement.properties.nom}…`;
    else if (erreurChangement) titre = 'Visite indisponible, réessayez';
    titres.append(el('div', 'rando-nom', titre));
    if (situation) titres.append(el('div', 'rando-sous', situation));
    const boutonReduire = el('button', 'rando-fiche-reduire');
    boutonReduire.type = 'button';
    boutonReduire.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    boutonReduire.addEventListener('click', () => reduire(!reduite));
    const chercher = el('button', 'rando-fiche-reduire ouverte ski-fiche-chercher');
    chercher.type = 'button';
    chercher.innerHTML = ICONE_RECHERCHE;
    chercher.setAttribute('aria-label', textes.chercher);
    chercher.setAttribute('aria-expanded', String(!zoneRecherche.hidden));
    chercher.addEventListener('click', () => {
      if (zoneRecherche.hidden) ouvrirRecherche();
      else fermerRecherche();
    });
    entete.append(badge, titres);
    const idLieu = choisi.properties.id;
    if (idLieu) {
      const favori = favoris.contient(idLieu);
      const etoile = el('button', `rando-fiche-reduire ouverte ski-fiche-favori${favori ? ' actif' : ''}`);
      etoile.type = 'button';
      etoile.innerHTML = ICONE_FAVORI;
      etoile.setAttribute('aria-pressed', String(favori));
      etoile.setAttribute('aria-label', favori ? 'Retirer des favoris' : 'Ajouter aux favoris');
      etoile.title = etoile.getAttribute('aria-label');
      etoile.addEventListener('click', () => {
        favoris.basculer(idLieu);
        rendre();
        surFavori();
      });
      entete.append(etoile);
    }
    entete.append(chercher, boutonReduire);
    if (etatVisite === 'active') {
      const quitter = el('button', 'fiche-copier ski-visite-quitter', 'Quitter');
      quitter.type = 'button';
      quitter.setAttribute('aria-label', 'Quitter la visite');
      quitter.addEventListener('click', quitterVisite);
      entete.append(quitter);
    } else {
      const fermer = el('button', 'fiche-fermer', '✕');
      fermer.type = 'button';
      fermer.setAttribute('aria-label', textes.fermer);
      fermer.addEventListener('click', fermerFiche);
      entete.append(fermer);
    }
    carte.append(entete);
    // Toujours visibles pendant la visite, même fiche réduite
    if (etatVisite === 'active') carte.append(visite.creerOptions({ surChangement: placerRecherche }));
    majReduction();

    const contenu = rendreCorps(carte, choisi);

    const actions = el('div', 'rando-actions');
    if (peutVisiter(choisi) && etatVisite !== 'active') {
      const visiterBouton = el('button', 'fiche-copier ski-visiter');
      visiterBouton.type = 'button';
      visiterBouton.innerHTML = ICONE_VISITER;
      visiterBouton.append(etatVisite === 'chargement' ? 'Préparation de la visite…' : textes.visiter);
      visiterBouton.disabled = etatVisite === 'chargement';
      visiterBouton.addEventListener('click', () => lancerVisite(choisi));
      actions.append(visiterBouton);
      if (etatVisite === 'erreur') {
        actions.append(el('span', 'ski-visite-erreur', 'Visite indisponible. Vérifiez votre connexion et réessayez.'));
      }
    }
    rendreActions(actions, contenu, choisi);
    if (actions.children.length) carte.append(actions);
  }

  // Depuis une visite en cours, le lieu affiché ne change qu'une fois ses pistes chargées
  async function lancerVisite(feature) {
    if (!peutVisiter(feature)) return;
    if (etatVisite === 'chargement' && enChargement === feature) return;
    numeroVisite += 1;
    const numero = numeroVisite;
    const changement = etatVisite === 'active';
    enChargement = feature;
    erreurChangement = false;
    if (!changement) etatVisite = 'chargement';
    rendre();
    try {
      const donnees = await visite.charger(feature.properties.id);
      if (numero !== numeroVisite || !actif) return;
      choisi = feature;
      enChargement = null;
      etatVisite = 'active';
      reduite = true;
      visite.demarrer(donnees);
      surChoix(feature);
      rendre();
      surChangement();
      fermerMenu();
    } catch (erreur) {
      if (numero !== numeroVisite || !actif) return;
      enChargement = null;
      if (changement) erreurChangement = true;
      else etatVisite = 'erreur';
      console.warn('Visite :', erreur);
      rendre();
    }
  }

  function arreterVisite(restaurer) {
    numeroVisite += 1;
    etatVisite = 'repos';
    enChargement = null;
    erreurChangement = false;
    visite.quitter({ restaurer });
  }

  function quitterVisite() {
    fermerRecherche();
    arreterVisite(true);
    reduite = false;
    rendre();
    surChangement();
  }

  function ouvrir(feature, deplacer) {
    arreterVisite(false);
    choisi = feature;
    reduite = false;
    surChoix(feature);
    rendre();
    surChangement();
    if (deplacer) {
      map.flyTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(map.getZoom(), ZOOM_FICHE),
        offset: [0, -70], // garde le repère au-dessus de la fiche
        duration: 900,
      });
    }
  }

  function fermerFiche() {
    fermerRecherche();
    arreterVisite(false);
    choisi = null;
    reduite = false;
    rendre();
    surChangement();
  }

  window.addEventListener('resize', placerRecherche);

  return {
    rendre,
    ouvrir,
    fermer: fermerFiche,
    quitterVisite,
    placerRecherche,
    localiser(feature) {
      fermerRecherche();
      ouvrir(feature, true);
      if (surTelephone()) fermerMenu();
    },
    visiter(feature) {
      fermerRecherche();
      if (etatVisite !== 'active') {
        choisi = feature;
        reduite = false;
        surChoix(feature);
      }
      void lancerVisite(feature);
    },
    get choisi() {
      return choisi;
    },
    get enVisite() {
      return etatVisite === 'active';
    },
    activer() {
      actif = true;
      if (ecouteurPose) return;
      map.on('dragstart', reduireSiMobile);
      map.on('zoomstart', reduireSiMobile);
      map.on('click', fermerRecherche);
      ecouteurPose = true;
    },
    desactiver() {
      actif = false;
      arreterVisite(true);
      reduite = false;
      fermerRecherche();
      choisi = null;
      rendre();
    },
  };
}
