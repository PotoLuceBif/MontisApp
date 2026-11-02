// Cartes hors ligne : cadrer une zone, estimer sa taille, la télécharger, la retrouver.
// Seuls le fond Montis et le relief se téléchargent : les autres fonds l'interdisent ou n'en
// disent rien. OpenFreeMap fixe ses limites : 3 000 tuiles ou 50 Mo, 4 requêtes en parallèle.
import { creerPanneauCarte } from './panneau-carte.js';
import { dateLisible, estHorsLigne } from './hors-ligne.js';

const CACHE_ZONES = 'montis-zones';
const CLE_ZONES = 'montis.zones';
const DESCRIPTION_FOND = 'https://tiles.openfreemap.org/planet';
const MODELE_RELIEF = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const POLICES = 'https://demotiles.maplibre.org/font/Open Sans Regular,Arial Unicode MS Regular';
const PLAGES_POLICES = ['0-255', '256-511', '8192-8447', '8448-8703'];
const MAX_TUILES_FOND = 3000;
const MAX_OCTETS_FOND = 50 * 1024 * 1024;
const REQUETES_PARALLELES = 4;
const ESSAIS = 3;
const ZOOM_MAX_FOND = 14;
const ZOOM_MAX_RELIEF = 13; // les courbes de niveau et les calculs n'utilisent pas plus fin
const ZOOMS_RELIEF_CALCUL = [11, 12]; // portée de vol : ces niveaux doivent toujours être présents
const ZOOMS_MIN = [6, 7, 8, 9, 10, 11, 12];
const ZOOMS_MAX = [10, 11, 12, 13, 14];
// Tailles mesurées en montagne (Mont-Blanc, Annecy, Jura, Beaufortain), en Ko
const KO_FOND = { 6: 300, 7: 320, 8: 320, 9: 255, 10: 130, 11: 85, 12: 70, 13: 50, 14: 115 };
const KO_RELIEF = { 6: 60, 7: 75, 8: 95, 9: 150, 10: 140, 11: 135, 12: 125, 13: 110 };
const MARGE_CADRE = 14;

const Ko = 1024;
const tailleLisible = (octets) => {
  if (octets < Ko * Ko) return `${Math.max(1, Math.round(octets / Ko))} Ko`;
  if (octets < Ko * Ko * Ko) return `${Math.round(octets / (Ko * Ko)).toLocaleString('fr-FR')} Mo`;
  return `${(octets / (Ko * Ko * Ko)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
};

// À garder identique à cleTuile() dans sw-modele.js
function cleTuile(adresse) {
  const url = new URL(adresse);
  if (url.hostname === 'tiles.openfreemap.org') {
    return `${url.origin}${url.pathname.replace(/^\/planet\/[^/]+\//, '/planet/')}`;
  }
  if (url.hostname === 'demotiles.maplibre.org') return decodeURIComponent(url.href);
  return url.href;
}

function lireZones() {
  try {
    const zones = JSON.parse(localStorage.getItem(CLE_ZONES));
    return Array.isArray(zones) ? zones : [];
  } catch {
    return [];
  }
}

function ecrireZones(zones) {
  try {
    localStorage.setItem(CLE_ZONES, JSON.stringify(zones));
  } catch {
    /* stockage plein : la zone reste utilisable mais ne sera plus listée */
  }
}

function tuileDe(lng, lat, z) {
  const n = 2 ** z;
  const sinus = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: Math.max(0, Math.min(n - 1, Math.floor(((lng + 180) / 360) * n))),
    y: Math.max(0, Math.min(n - 1, Math.floor((0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * n))),
  };
}

function tuilesAuZoom({ ouest, sud, est, nord }, z) {
  const a = tuileDe(ouest, nord, z);
  const b = tuileDe(est, sud, z);
  const tuiles = [];
  for (let x = a.x; x <= b.x; x += 1) {
    for (let y = a.y; y <= b.y; y += 1) tuiles.push({ z, x, y });
  }
  return tuiles;
}

function zoomsRelief(zMin, zMax) {
  const zooms = new Set();
  for (let z = zMin; z <= Math.min(zMax, ZOOM_MAX_RELIEF); z += 1) zooms.add(z);
  ZOOMS_RELIEF_CALCUL.forEach((z) => zooms.add(z));
  return [...zooms];
}

function tuilesDeZone({ bornes, zMin, zMax }) {
  const fond = [];
  for (let z = zMin; z <= Math.min(zMax, ZOOM_MAX_FOND); z += 1) fond.push(...tuilesAuZoom(bornes, z));
  const relief = zoomsRelief(zMin, zMax).flatMap((z) => tuilesAuZoom(bornes, z));
  return { fond, relief };
}

function estimer(zone) {
  const { fond, relief } = tuilesDeZone(zone);
  const octetsFond = fond.reduce((total, { z }) => total + KO_FOND[z] * Ko, 0);
  const octetsRelief = relief.reduce((total, { z }) => total + KO_RELIEF[z] * Ko, 0);
  return { tuiles: fond.length + relief.length, tuilesFond: fond.length, octetsFond, octets: octetsFond + octetsRelief };
}

const remplir = (modele, { z, x, y }) => modele.replace('{z}', z).replace('{x}', x).replace('{y}', y);

async function urlsDeZone(zone) {
  const { tiles } = await (await fetch(DESCRIPTION_FOND)).json();
  const { fond, relief } = tuilesDeZone(zone);
  return [
    ...fond.map((tuile) => ({ url: remplir(tiles[0], tuile), genre: 'fond' })),
    ...relief.map((tuile) => ({ url: remplir(MODELE_RELIEF, tuile), genre: 'relief' })),
    ...PLAGES_POLICES.map((plage) => ({ url: `${POLICES}/${plage}.pbf`, genre: 'police' })),
  ];
}

// Sert aussi à la suppression : les URL se déduisent de la zone, sans version du fond
function clesDeZone(zone) {
  const { fond, relief } = tuilesDeZone(zone);
  return [
    ...fond.map(({ z, x, y }) => `https://tiles.openfreemap.org/planet/${z}/${x}/${y}.pbf`),
    ...relief.map((tuile) => remplir(MODELE_RELIEF, tuile)),
  ];
}

async function telecharger(zone, { signal, onProgres }) {
  const cache = await caches.open(CACHE_ZONES);
  const taches = await urlsDeZone(zone);
  let suivante = 0;
  let faites = 0;
  let manquantes = 0;
  let octets = 0;
  let octetsFond = 0;

  async function telechargerUne({ url, genre }) {
    const cle = cleTuile(url);
    const existante = await cache.match(cle);
    if (existante) {
      octets += (await existante.blob()).size;
      return;
    }
    for (let essai = 1; essai <= ESSAIS; essai += 1) {
      if (signal.aborted) return;
      try {
        const reponse = await fetch(url, { signal, cache: 'reload' });
        if (reponse.ok) {
          const taille = (await reponse.clone().blob()).size;
          await cache.put(cle, reponse);
          octets += taille;
          if (genre === 'fond') octetsFond += taille;
          return;
        }
        // Une tuile absente de la source n'y sera pas davantage au prochain essai
        if (reponse.status === 404) return;
      } catch (erreur) {
        if (signal.aborted) return;
        if (erreur?.name === 'QuotaExceededError') throw erreur;
      }
    }
    manquantes += 1;
  }

  async function ouvrier() {
    while (suivante < taches.length && !signal.aborted) {
      // La limite d'OpenFreeMap porte sur les octets réels, pas sur notre estimation
      if (octetsFond > MAX_OCTETS_FOND) {
        manquantes += taches.length - suivante;
        suivante = taches.length;
        return;
      }
      const tache = taches[suivante];
      suivante += 1;
      await telechargerUne(tache);
      faites += 1;
      onProgres({ faites, total: taches.length, octets });
    }
  }

  await Promise.all(Array.from({ length: REQUETES_PARALLELES }, ouvrier));
  return { octets, manquantes, tuiles: taches.length };
}

// Une tuile partagée avec une autre zone doit rester
async function supprimerTuiles(zone, autres) {
  const cache = await caches.open(CACHE_ZONES);
  const gardees = new Set(autres.flatMap(clesDeZone));
  await Promise.all(clesDeZone(zone).filter((cle) => !gardees.has(cle)).map((cle) => cache.delete(cle)));
}

export function creerCartesHorsLigne(map, { fermerMenu = () => {}, ouvrirMenu = () => {} } = {}) {
  let zones = lireZones();
  let controleur = null;
  let bornesCadre = null;

  // ---------- Dans le menu ----------
  const blocMenu = document.createElement('div');
  blocMenu.className = 'zh';
  blocMenu.innerHTML = `
    <p class="note zh-intro">Enregistrez le fond Montis et le relief d’une zone pour les consulter sans réseau.</p>
    <button type="button" class="para-bouton para-bouton-principal zh-nouvelle">Télécharger une zone</button>
    <div class="zh-liste"></div>
    <p class="note zh-stockage"></p>
  `;
  const liste = blocMenu.querySelector('.zh-liste');
  const stockage = blocMenu.querySelector('.zh-stockage');

  async function rendreStockage() {
    if (!navigator.storage?.estimate) {
      stockage.textContent = '';
      return;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    stockage.textContent = `Espace utilisé par Montis : ${tailleLisible(usage)}${quota ? `, sur ${tailleLisible(quota)} disponibles` : ''}.`;
  }

  function rendreListe() {
    liste.replaceChildren(...zones.map((zone) => {
      const ligne = document.createElement('div');
      ligne.className = 'zh-zone';
      const texte = document.createElement('div');
      texte.className = 'zh-zone-texte';
      const nom = document.createElement('strong');
      nom.textContent = zone.nom;
      const detail = document.createElement('small');
      detail.textContent = `${tailleLisible(zone.octets)} · zooms ${zone.zMin} à ${zone.zMax} · du ${dateLisible(zone.date)}`;
      texte.append(nom, detail);
      if (zone.manquantes) {
        const alerte = document.createElement('small');
        alerte.className = 'zh-zone-alerte';
        alerte.textContent = `Incomplète : ${zone.manquantes} tuiles manquantes`;
        texte.append(alerte);
      }
      const voir = document.createElement('button');
      voir.type = 'button';
      voir.className = 'zh-zone-bouton';
      voir.textContent = 'Voir';
      voir.addEventListener('click', () => {
        fermerMenu();
        const { ouest, sud, est, nord } = zone.bornes;
        map.fitBounds([[ouest, sud], [est, nord]], { padding: 40, duration: estHorsLigne() ? 0 : 800 });
      });
      const supprimer = document.createElement('button');
      supprimer.type = 'button';
      supprimer.className = 'zh-zone-bouton zh-zone-supprimer';
      supprimer.setAttribute('aria-label', `Supprimer ${zone.nom}`);
      supprimer.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';
      supprimer.addEventListener('click', async () => {
        if (!confirm(`Supprimer « ${zone.nom} » ? Elle ne sera plus disponible sans réseau.`)) return;
        supprimer.disabled = true;
        const restantes = zones.filter((autre) => autre.id !== zone.id);
        await supprimerTuiles(zone, restantes);
        zones = restantes;
        ecrireZones(zones);
        rendreListe();
      });
      ligne.append(texte, voir, supprimer);
      return ligne;
    }));
    void rendreStockage();
  }

  // ---------- Sur la carte ----------
  const panneau = creerPanneauCarte({
    cle: 'zones-panneau-reduit',
    libelle: 'téléchargement de zone',
    classe: 'bf-outil',
    onFermer: () => quitter(),
    onAgrandi: () => majCadre(),
    onRetour: () => ouvrirMenu(),
  });
  panneau.titre.textContent = 'Télécharger une zone';
  panneau.corps.innerHTML = `
    <div class="zh-reglages">
      <p class="note">Cadrez la carte : le rectangle pointillé sera téléchargé.</p>
      <label class="zh-champ"><span>Nom</span><input class="zh-nom" type="text" maxlength="40" placeholder="Ma zone"></label>
      <div class="zh-zooms">
        <label class="zh-champ"><span>Vue d’ensemble</span><select class="zh-zmin">
          ${ZOOMS_MIN.map((z) => `<option value="${z}">Zoom ${z}</option>`).join('')}
        </select></label>
        <label class="zh-champ"><span>Détail maximal</span><select class="zh-zmax">
          ${ZOOMS_MAX.map((z) => `<option value="${z}">Zoom ${z}</option>`).join('')}
        </select></label>
      </div>
      <p class="zh-estimation" role="status" aria-live="polite"></p>
      <button type="button" class="para-bouton para-bouton-principal zh-lancer">Télécharger</button>
    </div>
    <div class="zh-progression" hidden>
      <div class="zh-barre"><i></i></div>
      <p class="zh-progres" role="status" aria-live="polite"></p>
      <button type="button" class="para-bouton zh-annuler">Annuler</button>
    </div>
  `;
  panneau.definirResume({
    rose: '<svg class="pt-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></svg>',
    nom: 'Télécharger une zone',
    detail: '',
    valeur: '',
    unite: '',
  });
  const $ = (selecteur) => panneau.corps.querySelector(selecteur);
  const champNom = $('.zh-nom');
  const champMin = $('.zh-zmin');
  const champMax = $('.zh-zmax');
  const estimation = $('.zh-estimation');
  const boutonLancer = $('.zh-lancer');
  const reglages = $('.zh-reglages');
  const progression = $('.zh-progression');
  const barre = $('.zh-barre i');
  const progres = $('.zh-progres');
  champMin.value = '8';
  champMax.value = '14';

  const cadre = document.createElement('div');
  cadre.className = 'zh-cadre';
  cadre.hidden = true;
  document.body.append(cadre);

  const zoneDemandee = () => ({
    bornes: bornesCadre,
    zMin: Number(champMin.value),
    zMax: Number(champMax.value),
  });

  function majEstimation() {
    if (!bornesCadre) return;
    const zone = zoneDemandee();
    if (zone.zMin > zone.zMax) {
      estimation.textContent = 'La vue d’ensemble doit être moins détaillée que le détail maximal.';
      estimation.classList.add('zh-trop');
      boutonLancer.disabled = true;
      return;
    }
    const { tuiles, tuilesFond, octetsFond, octets } = estimer(zone);
    const tropGrande = tuilesFond > MAX_TUILES_FOND || octetsFond > MAX_OCTETS_FOND;
    estimation.classList.toggle('zh-trop', tropGrande);
    estimation.textContent = tropGrande
      ? `Zone trop grande (≈ ${tailleLisible(octets)}) : le fond de carte limite chaque téléchargement à 50 Mo. Zoomez sur la carte ou baissez le détail maximal.`
      : `≈ ${tailleLisible(octets)} · ${tuiles.toLocaleString('fr-FR')} tuiles`;
    boutonLancer.disabled = tropGrande;
    panneau.definirResume({ detail: estimation.textContent });
  }

  // Le rectangle occupe ce qui reste visible de la carte autour du panneau et des boutons
  function majCadre() {
    if (cadre.hidden) return;
    const zoneCarte = map.getContainer().getBoundingClientRect();
    const bordPanneau = panneau.element.getBoundingClientRect();
    const toutLaLargeur = bordPanneau.width >= zoneCarte.width - 4;
    const haut = zoneCarte.top + 74;
    const bas = (toutLaLargeur ? bordPanneau.top : zoneCarte.bottom) - MARGE_CADRE;
    const gauche = (toutLaLargeur ? zoneCarte.left : bordPanneau.right) + MARGE_CADRE;
    const droite = zoneCarte.right - (toutLaLargeur ? MARGE_CADRE : 70);
    Object.assign(cadre.style, {
      top: `${haut}px`,
      left: `${gauche}px`,
      width: `${Math.max(40, droite - gauche)}px`,
      height: `${Math.max(40, bas - haut)}px`,
    });
    const coins = [[gauche, haut], [droite, haut], [droite, bas], [gauche, bas]]
      .map(([x, y]) => map.unproject([x - zoneCarte.left, y - zoneCarte.top]));
    bornesCadre = {
      ouest: Math.min(...coins.map(({ lng }) => lng)),
      est: Math.max(...coins.map(({ lng }) => lng)),
      sud: Math.min(...coins.map(({ lat }) => lat)),
      nord: Math.max(...coins.map(({ lat }) => lat)),
    };
    majEstimation();
  }

  function montrerReglages() {
    reglages.hidden = false;
    progression.hidden = true;
    cadre.hidden = false;
    majCadre();
  }

  function ouvrirPanneau() {
    fermerMenu();
    champNom.value = '';
    panneau.afficher();
    montrerReglages();
  }

  function quitter() {
    if (controleur) {
      if (!confirm('Annuler le téléchargement en cours ?')) return;
      controleur.abort();
    }
    cadre.hidden = true;
    panneau.masquer();
  }

  async function lancer() {
    const demande = zoneDemandee();
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      if (quota && estimer(demande).octets > quota - usage) {
        estimation.textContent = 'Pas assez d’espace disponible sur cet appareil pour cette zone.';
        estimation.classList.add('zh-trop');
        return;
      }
    }
    // Sans cela, le système peut effacer les cartes quand l'espace vient à manquer
    void navigator.storage?.persist?.();
    const zone = {
      ...demande,
      id: String(Date.now()),
      nom: champNom.value.trim() || `Zone du ${dateLisible(Date.now()).split(' à ')[0]}`,
      date: Date.now(),
      octets: 0,
      manquantes: 0,
    };
    controleur = new AbortController();
    reglages.hidden = true;
    progression.hidden = false;
    cadre.hidden = true;
    barre.style.width = '0';
    progres.textContent = 'Préparation…';
    try {
      const resultat = await telecharger(zone, {
        signal: controleur.signal,
        onProgres({ faites, total, octets }) {
          const pourcentage = Math.round((faites / total) * 100);
          barre.style.width = `${pourcentage}%`;
          progres.textContent = `${pourcentage} % · ${tailleLisible(octets)} · ${faites} / ${total} tuiles`;
          panneau.definirResume({ detail: `${tailleLisible(octets)} téléchargés`, valeur: String(pourcentage), unite: '%' });
        },
      });
      const annule = controleur.signal.aborted;
      controleur = null;
      if (annule) {
        await supprimerTuiles(zone, zones);
        panneau.definirResume({ valeur: '', unite: '' });
        return;
      }
      zones = [...zones, { ...zone, octets: resultat.octets, manquantes: resultat.manquantes }];
      ecrireZones(zones);
      rendreListe();
      panneau.definirResume({ detail: 'Terminé', valeur: '', unite: '' });
      progres.textContent = resultat.manquantes
        ? `Terminé avec ${resultat.manquantes} tuiles manquantes (${tailleLisible(resultat.octets)}). Relancez sur une meilleure connexion pour compléter.`
        : `« ${zone.nom} » est disponible sans réseau (${tailleLisible(resultat.octets)}).`;
      barre.style.width = '100%';
      $('.zh-annuler').textContent = 'Fermer';
    } catch (erreur) {
      console.warn('Téléchargement de zone :', erreur);
      controleur = null;
      await supprimerTuiles(zone, zones).catch(() => {});
      progres.textContent = erreur?.name === 'QuotaExceededError'
        ? 'Espace de stockage plein : téléchargement interrompu.'
        : 'Téléchargement impossible. Vérifiez la connexion puis réessayez.';
      $('.zh-annuler').textContent = 'Fermer';
    }
  }

  blocMenu.querySelector('.zh-nouvelle').addEventListener('click', ouvrirPanneau);
  boutonLancer.addEventListener('click', () => void lancer());
  $('.zh-annuler').addEventListener('click', () => {
    if (controleur) controleur.abort();
    else {
      $('.zh-annuler').textContent = 'Annuler';
      cadre.hidden = true;
      panneau.masquer();
    }
  });
  champMin.addEventListener('change', majEstimation);
  champMax.addEventListener('change', majEstimation);
  map.on('moveend', majCadre);
  map.on('resize', majCadre);
  new ResizeObserver(majCadre).observe(panneau.element);

  rendreListe();

  return {
    id: 'hors-ligne',
    label: 'Cartes hors ligne',
    icone: 'hors-ligne',
    panneau: blocMenu,
    activer() {
      rendreListe();
    },
    desactiver() {},
  };
}
