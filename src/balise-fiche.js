// Fiche d'une balise : état, vent actuel, rose des vents et évolution sur 3 à 24 h.
import { lire, ecrire } from './reglages.js';
import { creerPanneauCarte } from './panneau-carte.js';
import { estHorsLigne } from './hors-ligne.js';
import { altitude as altitudeRelief, preparerTuiles } from './portee.js';
import { creerGraphiqueBalise } from './balise-graphique.js';
import { dateComplete, etatStation, reseauDe, texteAge } from './balises-sources.js';
import { cadranVent, couleurInterface, heureCourte, texteProvenance } from './vent-cadran.js';
import { formatAltitude, formatTemp, libelleVent, valeurVent } from './unites.js';
import { surPreferences } from './preferences.js';
import { t, ta, ti, tt, poser } from './i18n.js';

const PERIODES = [3, 6, 12, 24];
const DUREE_CACHE_HISTORIQUE = 5 * 60 * 1000;
const COUVERTURE_TOLEREE = 15 * 60 * 1000; // en dessous, on ne signale pas de manque
const ZOOM_RELIEF = 12;
const LIBELLES_ETAT = { actif: 'bf.direct', ancien: 'bf.ancien', hs: 'bf.hs' };

const kmh = (valeur) => (Number.isFinite(valeur) ? valeurVent(valeur) : '—');

export function creerFicheBalise(map, { onFermer = () => {}, onRetour = null, onApercu = () => {} } = {}) {
  const panneau = creerPanneauCarte({
    cle: 'balise-fiche-reduite',
    libelle: 'panneau.balise',
    onFermer: () => fermer(),
    onRetour,
    onAgrandi: () => {
      if (station) garderBaliseVisible();
    },
  });
  const fiche = panneau.element;
  panneau.meta.innerHTML = '<span class="bf-etat"></span><span class="bf-altitude"></span><span class="bf-temperature"></span><span class="bf-age"></span>';
  panneau.corps.innerHTML = `
    <section class="bf-maintenant" ${ta('aria-label', 'bf.actuel')}>
      <div class="bf-rose">
        <div class="bf-rose-dessin"></div>
        <small class="bf-provenance"></small>
      </div>
      <div class="bf-valeurs">
        <div class="bf-valeur bf-valeur-principale">${tt('bf.moyen')}<strong><b data-bf-moyen></b> <i data-unite-vent>km/h</i></strong></div>
        <div class="bf-valeur bf-valeur-rafale">${tt('bf.rafale')}<strong><b data-bf-rafale></b> <i data-unite-vent>km/h</i></strong></div>
        <div class="bf-valeur bf-valeur-minimum">${tt('bf.minimum')}<strong><b data-bf-minimum></b> <i data-unite-vent>km/h</i></strong></div>
      </div>
      <p class="bf-absence" hidden></p>
    </section>
    <section class="bf-historique" ${ta('aria-label', 'bf.evolution')}>
      <div class="bf-periodes" role="group" ${ta('aria-label', 'bf.periode')}>
        ${PERIODES.map((heures) => `<button type="button" data-bf-periode="${heures}" aria-pressed="false">${t('bf.h', { n: heures })}</button>`).join('')}
      </div>
      <div class="bf-lecture">
        <div class="bf-legende">
          <span><i class="bf-trait bf-trait-moyen"></i>${tt('bf.legende-moyen')}</span>
          <span><i class="bf-trait bf-trait-rafale"></i>${tt('bf.legende-rafales')}</span>
          <span><i class="bf-trait bf-trait-minimum"></i>${tt('bf.minimum')}</span>
        </div>
        <div class="bf-curseur" hidden>
          <strong data-bf-c-heure></strong>
          <span>${tt('bf.moy')} <b data-bf-c-moyen></b></span>
          <span>${tt('bf.raf')} <b class="bf-c-rafale" data-bf-c-rafale></b></span>
          <span>${tt('bf.min')} <b class="bf-c-minimum" data-bf-c-minimum></b></span>
          <span class="bf-c-direction"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 15 13.5 13V21H10.5V13L5 15Z"/></svg><b data-bf-c-direction></b></span>
        </div>
      </div>
      <canvas class="bf-graphique" tabindex="0" role="img" ${ta('aria-label', 'bf.graphique-aria')}></canvas>
      <p class="bf-note"></p>
    </section>
    <p class="bf-note bf-sans-historique" ${ti('bf.sans-historique')} hidden>${t('bf.sans-historique')}</p>
    <p class="bf-description" hidden></p>
    <p class="bf-voisine" hidden></p>
    <p class="bf-source"></p>
  `;

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
      // La manche de la carte rejoue le relevé lu sur le graphique
      onApercu(point && station ? { id: station.id, ...point } : null);
      if (!point) return;
      $('[data-bf-c-heure]').textContent = heureCourte(point.date);
      $('[data-bf-c-moyen]').textContent = kmh(point.moyenne);
      $('[data-bf-c-moyen]').style.color = couleurInterface(point.moyenne);
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
      ? (etat === 'hs' ? t('bf.dernier', { date: dateComplete(station.date) }) : t('bf.mis-a-jour', { age: texteAge(station.date) }))
      : t('bf.aucun-releve');
  }

  function rendreMaintenant() {
    const etat = etatStation(station);
    fiche.dataset.etat = etat;
    fiche.style.setProperty('--vent-couleur', etat === 'actif' ? couleurInterface(station.moyenne) : 'var(--texte-2)');
    $('.bf-nom').textContent = station.nom;
    // Sans réseau, un relevé récent n'est plus du direct, quel que soit son âge
    poser($('.bf-etat'), etat === 'actif' && estHorsLigne() ? 'bf.enregistre' : LIBELLES_ETAT[etat]);
    const avecCap = Number.isFinite(station.direction);
    $('.bf-rose-dessin').innerHTML = cadranVent(avecCap ? (station.direction + 180) % 360 : null, 0, '', true);
    $('.bf-provenance').textContent = avecCap ? texteProvenance(station.direction) : t('bf.direction-inconnue');
    $('[data-bf-moyen]').textContent = kmh(station.moyenne);
    $('[data-bf-rafale]').textContent = kmh(station.rafale);
    $('[data-bf-minimum]').textContent = kmh(station.minimum);
    panneau.corps.querySelectorAll('[data-unite-vent]').forEach((unite) => {
      unite.textContent = libelleVent();
    });
    panneau.definirResume({
      rose: cadranVent(avecCap && etat !== 'hs' ? (station.direction + 180) % 360 : null, 0, 'vent-cadran-petit'),
      nom: station.nom,
      detail: etat === 'hs'
        ? t(LIBELLES_ETAT.hs)
        : `${etat === 'ancien' ? `${t(LIBELLES_ETAT.ancien)} · ` : ''}${texteProvenance(station.direction)}`,
      valeur: etat === 'hs' ? '—' : kmh(station.moyenne),
      unite: libelleVent(),
    });
    const absence = $('.bf-absence');
    absence.hidden = etat === 'actif';
    absence.textContent = etat === 'ancien'
      ? t('bf.datent', { heure: heureCourte(station.date) })
      : t('bf.ne-transmet');
    rendreAge();
    const description = $('.bf-description');
    description.textContent = [station.maintenance ? t('bf.maintenance') : '', station.description].filter(Boolean).join(' ');
    description.hidden = !description.textContent;
    $('.bf-temperature').textContent = Number.isFinite(station.temperature) && etat !== 'hs' ? formatTemp(station.temperature) : '';
    const voisine = $('.bf-voisine');
    voisine.hidden = !station.voisine;
    if (station.voisine) poser(voisine, 'bf.voisine', { nom: station.voisine.nom, reseau: station.voisine.reseau === 'ffvl' ? 'FFVL' : 'OpenWindMap' });
    const lien = document.createElement('a');
    lien.href = station.lien || source.lien;
    lien.target = '_blank';
    lien.rel = 'noopener noreferrer';
    lien.textContent = `${source.libelle} ↗`;
    $('.bf-source').replaceChildren(t('bf.indicatifs'), lien);
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
      poser(note, 'bf.aucun-24h');
      note.hidden = false;
      return;
    }
    const visibles = graphique.definir(historique, periode);
    const debut = Date.now() - periode * 60 * 60 * 1000;
    if (!visibles.length) {
      poser(note, 'bf.aucun-periode', { n: periode });
    } else if (visibles[0].date - debut > COUVERTURE_TOLEREE) {
      poser(note, 'bf.pas-avant', { heure: heureCourte(visibles[0].date) });
    } else {
      note.textContent = '';
    }
    note.hidden = !note.textContent;
  }

  async function chargerHistorique() {
    controleur?.abort();
    historique = [];
    blocHistorique.hidden = !source.historique;
    $('.bf-sans-historique').hidden = Boolean(source.historique);
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
    poser(note, 'bf.chargement');
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
      note.textContent = estHorsLigne()
        ? t('bf.hors-ligne')
        : t('bf.indisponible');
      note.hidden = false;
    }
  }

  // Le relief donne une altitude quand la source n'en fournit pas
  async function afficherAltitude() {
    const champ = $('.bf-altitude');
    if (Number.isFinite(station.altitude)) {
      champ.textContent = formatAltitude(station.altitude);
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
      champ.textContent = `≈ ${formatAltitude(valeur)}`;
      champ.title = t('bf.altitude-relief');
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
    if (!panneau.ouvert) return;
    panneau.masquer();
    onApercu(null);
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') fermer();
  });
  surPreferences(() => {
    if (!station) return;
    rendreMaintenant();
    rendreGraphique();
    void afficherAltitude();
  });

  return {
    get idOuverte() {
      return station?.id ?? null;
    },
    // `retour` : où mène la flèche retour (le terrain d'où l'on vient), sinon au menu.
    // `periode` : la durée montrée cette fois-ci, sans changer le choix enregistré.
    ouvrir(nouvelleStation, nouvelleSource, { retour = null, periode: periodeDemandee = null } = {}) {
      station = nouvelleStation;
      source = nouvelleSource;
      panneau.definirRetour(retour ?? onRetour);
      if (PERIODES.includes(periodeDemandee)) periode = periodeDemandee;
      panneau.afficher();
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
      source = reseauDe(station);
      rendreMaintenant();
      cacheHistorique.delete(`${source.id}/${station.id}`);
      void chargerHistorique();
    },
    fermer,
  };
}
