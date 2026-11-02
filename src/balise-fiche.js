// Fiche d'une balise : état, vent actuel, rose des vents et évolution sur 3 à 24 h.
import { lire, ecrire } from './reglages.js';
import { altitude as altitudeRelief, preparerTuiles } from './portee.js';
import { creerGraphiqueBalise } from './balise-graphique.js';
import { couleurBalise, dateComplete, etatStation, heureCourte, roseVent, texteAge } from './balises-sources.js';
import { texteProvenance } from './vent-cadran.js';

const PERIODES = [3, 6, 12, 24];
const DUREE_CACHE_HISTORIQUE = 5 * 60 * 1000;
const COUVERTURE_TOLEREE = 15 * 60 * 1000; // en dessous, on ne signale pas de manque
const ZOOM_RELIEF = 12;
const LIBELLES_ETAT = { actif: 'En direct', ancien: 'Relevé ancien', hs: 'Hors service' };

const kmh = (valeur) => (Number.isFinite(valeur) ? String(Math.round(valeur)) : '—');

export function creerFicheBalise(map, { onFermer = () => {} } = {}) {
  const fiche = document.createElement('aside');
  fiche.className = 'bf';
  fiche.hidden = true;
  fiche.setAttribute('aria-label', 'Fiche de la balise');
  fiche.innerHTML = `
    <header class="bf-entete">
      <div class="bf-titres">
        <h3 class="bf-nom"></h3>
        <p class="bf-meta"><span class="bf-etat"></span><span class="bf-altitude"></span><span class="bf-age"></span></p>
      </div>
      <button type="button" class="bf-fermer" aria-label="Fermer la fiche"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <section class="bf-maintenant" aria-label="Vent actuel">
      <div class="bf-rose">
        <div class="bf-rose-dessin"></div>
        <small class="bf-provenance"></small>
      </div>
      <div class="bf-valeurs">
        <div class="bf-valeur bf-valeur-principale"><span>Vent moyen</span><strong><b data-bf-moyen></b> <i>km/h</i></strong></div>
        <div class="bf-valeur"><span>Rafale</span><strong><b data-bf-rafale></b> <i>km/h</i></strong></div>
        <div class="bf-valeur"><span>Minimum</span><strong><b data-bf-minimum></b> <i>km/h</i></strong></div>
      </div>
      <p class="bf-absence" hidden></p>
    </section>
    <section class="bf-historique" aria-label="Évolution du vent">
      <div class="bf-periodes" role="group" aria-label="Période affichée">
        ${PERIODES.map((heures) => `<button type="button" data-bf-periode="${heures}" aria-pressed="false">${heures} h</button>`).join('')}
      </div>
      <div class="bf-lecture">
        <div class="bf-legende">
          <span><i class="bf-trait bf-trait-moyen"></i>Moyen</span>
          <span><i class="bf-trait bf-trait-rafale"></i>Rafales</span>
          <span><i class="bf-trait bf-trait-minimum"></i>Minimum</span>
        </div>
        <div class="bf-curseur" hidden>
          <strong data-bf-c-heure></strong>
          <span>Moy. <b data-bf-c-moyen></b></span>
          <span>Raf. <b data-bf-c-rafale></b></span>
          <span>Min. <b data-bf-c-minimum></b></span>
          <span class="bf-c-direction"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 15 13.5 13V21H10.5V13L5 15Z"/></svg><b data-bf-c-direction></b></span>
        </div>
      </div>
      <canvas class="bf-graphique" tabindex="0" role="img" aria-label="Évolution du vent. Glisser ou utiliser les flèches du clavier pour lire une heure précise."></canvas>
      <p class="bf-note"></p>
    </section>
    <p class="bf-description" hidden></p>
    <p class="bf-source"></p>
  `;
  document.body.append(fiche); // hors de la carte : ses commandes ne doivent pas passer devant

  const $ = (selecteur) => fiche.querySelector(selecteur);
  const boutonsPeriode = [...fiche.querySelectorAll('[data-bf-periode]')];
  const blocHistorique = $('.bf-historique');
  const canvas = $('.bf-graphique');
  const note = $('.bf-note');
  const legende = $('.bf-legende');
  const lecture = $('.bf-curseur');
  const flecheCurseur = $('.bf-c-direction svg');

  let station = null;
  let source = null;
  let historique = [];
  let controleur = null;
  let minuteurAge = null;
  let jetonAltitude = 0;
  const cacheHistorique = new Map();
  const cacheAltitude = new Map();
  let periode = PERIODES.includes(Number(lire('balise-periode', 6))) ? Number(lire('balise-periode', 6)) : 6;

  const graphique = creerGraphiqueBalise(canvas, {
    onCurseur(point) {
      legende.hidden = Boolean(point);
      lecture.hidden = !point;
      if (!point) return;
      $('[data-bf-c-heure]').textContent = heureCourte(point.date);
      $('[data-bf-c-moyen]').textContent = kmh(point.moyenne);
      $('[data-bf-c-rafale]').textContent = kmh(point.rafale);
      $('[data-bf-c-minimum]').textContent = kmh(point.minimum);
      const avecCap = Number.isFinite(point.direction);
      flecheCurseur.style.visibility = avecCap ? '' : 'hidden';
      flecheCurseur.style.transform = avecCap ? `rotate(${(point.direction + 180) % 360}deg)` : '';
      $('[data-bf-c-direction]').textContent = avecCap ? texteProvenance(point.direction) : '—';
    },
  });

  function rendreAge() {
    if (!station) return;
    const etat = etatStation(station);
    $('.bf-age').textContent = Number.isFinite(station.date)
      ? (etat === 'hs' ? `Dernier relevé ${dateComplete(station.date)}` : `Mis à jour ${texteAge(station.date)}`)
      : 'Aucun relevé connu';
  }

  function rendreMaintenant() {
    const etat = etatStation(station);
    fiche.dataset.etat = etat;
    fiche.style.setProperty('--vent-couleur', etat === 'actif' ? couleurBalise(station.moyenne) : 'var(--texte-2)');
    $('.bf-nom').textContent = station.nom;
    $('.bf-etat').textContent = LIBELLES_ETAT[etat];
    const avecCap = Number.isFinite(station.direction);
    $('.bf-rose-dessin').innerHTML = roseVent(avecCap ? (station.direction + 180) % 360 : null);
    $('.bf-provenance').textContent = avecCap ? texteProvenance(station.direction) : 'Direction inconnue';
    $('[data-bf-moyen]').textContent = kmh(station.moyenne);
    $('[data-bf-rafale]').textContent = kmh(station.rafale);
    $('[data-bf-minimum]').textContent = kmh(station.minimum);
    const absence = $('.bf-absence');
    absence.hidden = etat === 'actif';
    absence.textContent = etat === 'ancien'
      ? `Ces valeurs datent de ${heureCourte(station.date)} : la balise n’a rien transmis depuis.`
      : 'Cette balise ne transmet plus de mesures de vent.';
    rendreAge();
    const description = $('.bf-description');
    description.textContent = station.description;
    description.hidden = !station.description;
    const lien = document.createElement('a');
    lien.href = station.lien || source.lien;
    lien.target = '_blank';
    lien.rel = 'noopener noreferrer';
    lien.textContent = `${source.libelle} ↗`;
    $('.bf-source').replaceChildren('Relevés indicatifs · ', lien);
  }

  function rendreGraphique() {
    boutonsPeriode.forEach((bouton) => {
      bouton.setAttribute('aria-pressed', String(Number(bouton.dataset.bfPeriode) === periode));
    });
    // Sans aucun relevé sur 24 h, une grille vide n'apprendrait rien
    const rien = !historique.length;
    [canvas, $('.bf-periodes'), $('.bf-lecture')].forEach((element) => {
      element.hidden = rien;
    });
    if (rien) {
      note.textContent = 'Aucun relevé sur les dernières 24 h.';
      note.hidden = false;
      return;
    }
    const visibles = graphique.definir(historique, periode);
    const debut = Date.now() - periode * 60 * 60 * 1000;
    if (!visibles.length) {
      note.textContent = `Aucun relevé sur les ${periode} dernières heures.`;
    } else if (visibles[0].date - debut > COUVERTURE_TOLEREE) {
      note.textContent = `Pas de relevé avant ${heureCourte(visibles[0].date)} sur cette période.`;
    } else {
      note.textContent = '';
    }
    note.hidden = !note.textContent;
  }

  async function chargerHistorique() {
    controleur?.abort();
    historique = [];
    blocHistorique.hidden = !source.historique;
    if (!source.historique) return;
    const demandee = station.id;
    const memoire = cacheHistorique.get(`${source.id}/${demandee}`);
    if (memoire && Date.now() - memoire.recu < DUREE_CACHE_HISTORIQUE) {
      historique = memoire.points;
      rendreGraphique();
      return;
    }
    const requete = new AbortController();
    controleur = requete;
    [canvas, $('.bf-periodes'), $('.bf-lecture')].forEach((element) => {
      element.hidden = false;
    });
    graphique.definir([], periode);
    note.textContent = 'Chargement de l’évolution…';
    note.hidden = false;
    try {
      const points = await source.historique(demandee, requete.signal);
      if (requete.signal.aborted || station?.id !== demandee) return;
      cacheHistorique.set(`${source.id}/${demandee}`, { points, recu: Date.now() });
      historique = points;
      rendreGraphique();
    } catch (erreur) {
      if (requete.signal.aborted) return;
      console.warn('Historique de balise :', erreur);
      [canvas, $('.bf-periodes'), $('.bf-lecture')].forEach((element) => {
        element.hidden = true;
      });
      note.textContent = 'Évolution momentanément indisponible.';
      note.hidden = false;
    }
  }

  // Le relief donne une altitude quand la source n'en fournit pas
  async function afficherAltitude() {
    const champ = $('.bf-altitude');
    if (Number.isFinite(station.altitude)) {
      champ.textContent = `${Math.round(station.altitude).toLocaleString('fr-FR')} m`;
      return;
    }
    champ.textContent = '';
    const { id, lon, lat } = station;
    jetonAltitude += 1;
    const jeton = jetonAltitude;
    let valeur = cacheAltitude.get(id);
    if (valeur === undefined) {
      try {
        await preparerTuiles(lon, lat, 50, ZOOM_RELIEF);
        valeur = altitudeRelief(lon, lat, ZOOM_RELIEF);
        if (Number.isFinite(valeur)) cacheAltitude.set(id, valeur);
      } catch (erreur) {
        console.warn('Altitude de balise :', erreur);
        return;
      }
    }
    if (jeton === jetonAltitude && Number.isFinite(valeur)) {
      champ.textContent = `≈ ${Math.round(valeur).toLocaleString('fr-FR')} m`;
      champ.title = 'Altitude du terrain, lue sur le relief';
    }
  }

  // Sur téléphone la fiche couvre le bas de la carte, sur ordinateur sa gauche
  function garderBaliseVisible() {
    const point = map.project([station.lon, station.lat]);
    const cadre = fiche.getBoundingClientRect();
    const zone = map.getContainer().getBoundingClientRect();
    const haut = cadre.top - zone.top;
    const droite = cadre.right - zone.left;
    if (cadre.width >= zone.width - 4) {
      if (point.y > haut - 50) map.panBy([0, point.y - Math.max(90, haut / 2)]);
    } else if (point.x < droite + 40 && point.y > haut - 30) {
      map.panBy([point.x - (droite + 60), 0]);
    }
  }

  function fermer() {
    if (fiche.hidden) return;
    fiche.hidden = true;
    station = null;
    jetonAltitude += 1;
    controleur?.abort();
    clearInterval(minuteurAge);
    onFermer();
  }

  boutonsPeriode.forEach((bouton) => {
    bouton.addEventListener('click', () => {
      periode = Number(bouton.dataset.bfPeriode);
      ecrire('balise-periode', periode);
      rendreGraphique();
    });
  });
  $('.bf-fermer').addEventListener('click', fermer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fermer();
  });

  return {
    get idOuverte() {
      return station?.id ?? null;
    },
    ouvrir(nouvelleStation, nouvelleSource) {
      station = nouvelleStation;
      source = nouvelleSource;
      fiche.hidden = false;
      fiche.scrollTop = 0;
      rendreMaintenant();
      void afficherAltitude();
      void chargerHistorique();
      garderBaliseVisible();
      clearInterval(minuteurAge);
      minuteurAge = setInterval(rendreAge, 30000);
    },
    // Nouveaux relevés pendant que la fiche est ouverte
    actualiser(nouvelleStation) {
      if (!station || nouvelleStation.id !== station.id) return;
      station = nouvelleStation;
      rendreMaintenant();
      cacheHistorique.delete(`${source.id}/${station.id}`);
      void chargerHistorique();
    },
    fermer,
  };
}
