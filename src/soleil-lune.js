// Rubrique Soleil et Lune (lot 4.7), sous Météo et Carte. En tête, la frise commune : jour, heure, course du
// soleil et de la Lune (soleil-reglage.js), et l'option « Dans le ciel » (3D) qui dessine les deux astres
// à leur place sans l'ombre. Puis la ligne Soleil (position et Ombre du soleil) et la ligne Lune (lune.js,
// chargée à sa première ouverture). Tout se calcule au centre de la carte.
// Le réglage et le dessin du ciel ne se chargent qu'à la première ouverture, ou au démarrage si l'ombre ou
// le ciel sont allumés : le code de démarrage reste léger.
import { creerOptionOmbres } from './ombres-panneau.js';
import { lire, ecrire } from './reglages.js';
import { creerPastilleCouche } from './couches-actives.js';
import { etat } from './options-carte.js';
import { tuilesAstre } from './astre-icones.js';
import { poser, surLangue, t } from './i18n.js';
import { opaciteCiel } from './ciel-calcul.js';
import { centreFrise } from './globe-nuit-calcul.js';
import { fixerInstantEspace } from './heure-espace.js';

// « Au sol » : les montagnes et l'arc du ciel, comme le bouton Horizon
const ICONE_SOL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20"/><path d="m4 20 5-8 3 4 3-5 5 9"/><path d="M5 7.5a10 10 0 0 1 14 0"/></svg>';
const ICONE_CIEL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9" cy="9" r="3.2"/><path d="M9 2.5v1.3M2.5 9h1.3M14.2 9h1.3M9 14.2v1.3M4.4 4.4l.9.9M12.7 5.3l.9-.9M4.4 13.6l.9-.9"/><path d="M21.5 17.2a4.6 4.6 0 1 1-5-5 3.7 3.7 0 0 0 5 5Z"/></svg>`;

// `astre` ('soleil' ou 'lune') : ouvert depuis « Informations » d'un astre du ciel, la frise ne montre que lui
export const ouvrirSoleilLune = (module = 'ombres', astre = null) =>
  window.dispatchEvent(new CustomEvent('montis:ouvrir-module', { detail: { categorie: 'ciel', module, astre } }));

export function creerSoleilLune(map) {
  const abonnes = new Set();
  const entete = document.createElement('div');
  entete.className = 'ciel-entete';
  entete.innerHTML = `
    <div class="relief-bascule ciel-choix" role="group">
      <button type="button" class="ciel-bouton-ciel" aria-pressed="false">${ICONE_CIEL}<span data-i18n="ciel.dans-le-ciel"></span></button>
      <button type="button" class="ciel-bouton-sol" aria-pressed="false">${ICONE_SOL}<span data-i18n="ciel.au-sol-bouton"></span></button>
    </div>
    <p class="ciel-relief" hidden></p>
    <p class="note ciel-fuseau"></p>
  `;
  entete.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));
  const choixCiel = entete.querySelector('.ciel-choix');
  const boutonCiel = choixCiel.querySelector('.ciel-bouton-ciel');
  const boutonSol = choixCiel.querySelector('.ciel-bouton-sol');
  const fuseau = entete.querySelector('.ciel-fuseau');
  const ligneRelief = entete.querySelector('.ciel-relief');

  // Ligne Soleil, retouchée le 16 novembre 2026 (demande du propriétaire) : en tête, une carte avec le cadran et la
  // hauteur en grand ; puis lever, passage au plus haut et coucher en tuiles (aussi sur la frise), et la durée du jour
  const position = document.createElement('div');
  position.className = 'astre-carte ciel-position-soleil';
  position.setAttribute('role', 'status');
  const heuresSoleil = document.createElement('div');
  heuresSoleil.className = 'astre-heures';
  heuresSoleil.innerHTML = `${tuilesAstre({ lever: 'soleil-lever', haut: 'soleil-midi', coucher: 'soleil-coucher' })}<p class="astre-duree"></p>`;
  heuresSoleil.querySelectorAll('[data-i18n]').forEach((el) => poser(el, el.dataset.i18n));

  const visible = () => entete.offsetParent !== null;
  // Astre seul sur la frise (demande du propriétaire du 24 novembre 2026) : le temps de cette ouverture seulement
  let astreSeul = null;
  const montrerSeul = (astre) => {
    astreSeul = astre;
    reglage?.montrerSeul(astre);
  };
  window.addEventListener('montis:ciel-au-sol', (e) => {
    if (e.detail) basculerSol(true, undefined, e.detail);
  });
  window.addEventListener('montis:ouvrir-module', (e) => {
    if (e.detail?.categorie === 'ciel') montrerSeul(e.detail.astre ?? null);
  });
  // Panneau fermé (tête de rubrique cachée) : la frise montre de nouveau les deux astres
  // Panneau fermé : la vue au sol s'arrête aussi (elle n'a de sens qu'avec la frise)
  new ResizeObserver(() => {
    if (astreSeul && !visible()) montrerSeul(null);
    if (vueSol && panneau()?.hidden) basculerSol(false);
  }).observe(entete);
  let ombres = null;
  // « Voir dans le ciel » : soleil, Lune et leurs trajectoires du jour dans le ciel de la vue 3D, gardé dans les réglages.
  // « Au sol » (demande du propriétaire du 24 novembre 2026) : caméra posée au lieu de Soleil et Lune, comme Horizon,
  // avec trajectoires, crêtes et vrai lever derrière le relief (panorama.js, mode ciel) ; jamais rouverte au démarrage.
  // « Voir dans le ciel » d'avant (astres dans le ciel de la carte 3D) est retiré : la vue au sol prend ce nom
  // (décision du propriétaire du 25 novembre 2026)
  let cielActif = false;
  let vueSol = null; // { lieu } pendant la vue au sol
  let reglage = null;
  let m = null; // modules chargés : { r: réglage, s: soleil, l: Lune, c: ciel }
  let ciel = null;
  let lieu = null;
  let chargement = null;
  const charger = () => {
    chargement ??= Promise.all([
      import('./soleil-reglage.js'),
      import('./soleil.js'),
      import('./lune-calcul.js'),
      import('./soleil-ciel.js'),
      import('./ciel-lieu.js'),
      import('./vent-calcul.js'),
    ]).then(([r, s, l, c, lieuModule, v]) => {
      m = { r, s, l, v };
      reglage = r.creerReglageSoleil(map, {
        course: true,
        surChangement: (options) => {
          suivreFrise();
          maj(options);
        },
        actif: () => visible() || Boolean(ombres?.actif()) || cielActif,
      });
      reglage.montrerSeul(astreSeul);
      entete.prepend(reglage.element);
      // Le lieu, en petit sous le jour
      lieu = lieuModule.creerLieuCiel(map, { reglage, visible });
      reglage.element.querySelector('.ombres-jour').after(lieu.element);
      position.innerHTML = `${r.cadran('ombres-cadran astre-cadran')}<div class="astre-valeurs"><strong class="astre-grande"></strong><span class="astre-sous astre-horizon"></span><span class="astre-sous astre-direction"></span></div>`;
      ciel = c.creerSoleilCiel(map);
      maj();
      return reglage;
    });
    return chargement;
  };

  function majTextes() {
    reglage.majTextes();
    const cle = reglage.fuseauLieu() === null ? 'soleil.fuseau-appareil' : 'ciel.fuseau-lieu';
    fuseau.textContent = t(cle, { fuseau: m.s.nomDecalage(reglage.decalage()) });
    lieu.majTextes();
    const soleil = reglage.soleil();
    if (soleil) {
      const hauteur = Math.round(soleil.hauteur);
      position.querySelector('.astre-grande').textContent = `${hauteur}°`;
      position.querySelector('.astre-horizon').textContent = t(hauteur > 0 ? 'soleil.au-dessus' : 'soleil.sous-horizon');
      position.querySelector('.astre-direction').textContent = t('soleil.vers', {
        direction: `${Math.round(soleil.azimut)}° ${t(`cardinal.${m.v.codeCardinal(soleil.azimut)}`)}`,
      });
      position.classList.toggle('nuit', hauteur <= 0);
      m.r.tournerCadrans(position, soleil, map.getBearing());
    }
    const journee = reglage.journee();
    const heure = (date) => (date ? m.s.heureDuLieu(date, reglage.decalage()) : '–');
    heuresSoleil.querySelector('.soleil-lever').textContent = heure(journee?.lever);
    heuresSoleil.querySelector('.soleil-midi').textContent = heure(journee?.midiSolaire);
    heuresSoleil.querySelector('.soleil-coucher').textContent = heure(journee?.coucher);
    heuresSoleil.querySelector('.astre-duree').textContent = journee?.dureeMinutes
      ? t('soleil.duree-jour', { duree: m.s.formatDuree(journee.dureeMinutes) })
      : '';
  }

  // ---------- Soleil et Lune dans le ciel, en 3D ----------
  const luneIci = () => {
    const { lng, lat } = map.getCenter();
    const instant = reglage.instant();
    return { ...m.l.positionLune(instant, lat, lng), fraction: m.l.eclairementLune(instant).fraction };
  };
  // Une visite ou une sortie montre son propre soleil (visite-station.js, sortie-ombre.js)
  function majCiel() {
    if (!ciel) return;
    const voir = (cielActif || Boolean(vueSol) || Boolean(ombres?.actif())) && etat.mode3D && !etat.enVisite && !etat.ombreSortie;
    ciel.montrer(voir ? reglage.soleil() : null, voir ? luneIci() : null);
    ciel.montrerTrajets(voir && cielActif && !vueSol ? trajetsDuJour() : null);
  }

  // Trajectoires du jour de la frise au lieu des calculs, un point toutes les 10 min ; recalculées quand le jour ou le
  // lieu changent
  let trajets = null;
  function trajetsDuJour() {
    const { lng, lat } = reglage.lieu() ?? map.getCenter();
    const cle = `${reglage.jour()}/${reglage.decalage()}/${lng.toFixed(2)}/${lat.toFixed(2)}`;
    if (trajets?.cle !== cle) {
      const debut = m.s.midiLocal(reglage.jour(), reglage.decalage()).getTime() - 12 * 3600000;
      const points = (position) => Array.from({ length: 24 * 6 + 1 }, (_, i) => {
        const t = debut + i * 600000;
        return { t, ...position(t) };
      });
      trajets = {
        cle,
        soleil: points((t) => m.s.positionSoleil(t, lat, lng)),
        lune: points((t) => m.l.positionLune(t, lat, lng)),
        heure: (t) => m.s.heureDuLieu(t, reglage.decalage()),
      };
    }
    return { ...trajets, instant: reglage.instant() };
  }

  const pastille = creerPastilleCouche({
    ordre: 2,
    nom: () => (reglage ? t('ciel.pastille', { heure: m.s.heureDuLieu(reglage.instant(), reglage.decalage()) }) : t('menu.ciel')),
    legende: () => `<span class="mini-icone-ciel">${ICONE_CIEL}</span>`,
    rubrique: 'ciel',
    onOuvrir: () => ouvrirSoleilLune(),
    onRetirer: () => basculerCiel(false),
  });
  const majPastille = () => {
    // Plus de pastille pour les astres dans le ciel (demande du propriétaire du 25 novembre 2026)
    pastille.montrer(false);
    if (pastille.visible) pastille.maj();
  };

  function majChoix() {
    boutonCiel.classList.toggle('actif', cielActif);
    boutonCiel.setAttribute('aria-pressed', String(cielActif));
    boutonSol.classList.toggle('actif', Boolean(vueSol));
    boutonSol.setAttribute('aria-pressed', String(Boolean(vueSol)));
    // « Voir dans le ciel » sert en 3D seulement (règle des panneaux) ; « Au sol » passe en 3D de lui-même
    boutonCiel.hidden = true;
  }

  // Vrais levers et couchers derrière le relief, sous la frise, le temps de la vue au sol
  let levers = null;
  function majLigneRelief() {
    ligneRelief.hidden = !vueSol || !levers;
    if (ligneRelief.hidden) return;
    const heure = (t) => (t ? m.s.heureDuLieu(t, reglage.decalage()) : '–');
    const plage = (l) => (l?.lever || l?.coucher ? `${heure(l.lever)} – ${heure(l.coucher)}` : t('ciel.cache'));
    // La Lune avec sa part éclairée (demande du propriétaire du 25 novembre 2026)
    const eclairee = Math.round(m.l.eclairementLune(reglage.instant()).fraction * 100);
    ligneRelief.textContent = t('ciel.derriere-relief', { soleil: plage(levers.soleil), lune: `${plage(levers.lune)} (${eclairee} %)` });
  }

  const panneau = () => entete.closest('.outil-rapide-panneau');
  async function basculerCiel(oui) {
    cielActif = oui;
    ecrire('ciel-astres', oui);
    majChoix();
    if (oui) await charger();
    majCiel();
    majPastille();
  }

  // Vue au sol. `boussole` : la permission demandée à iOS pendant l'appui lui-même (sinon refusée)
  // `point` : l'endroit choisi sur la carte par « Changer d'endroit » de la vue au sol
  async function basculerSol(oui, boussole, point = null) {
    if (oui === Boolean(vueSol)) return;
    if (oui) {
      await charger();
      // Le lieu de la frise devient le point où l'on se tient : il ne suit plus la carte, qui tourne avec le regard
      const ici = { ...(point ?? reglage.lieu() ?? map.getCenter()) };
      // Choisir l'endroit sur la carte a pu refermer le panneau : la frise doit rester là
      window.dispatchEvent(new Event('montis:ouvrir-ciel'));
      vueSol = { lieu: ici };
      majChoix();
      reglage.figerLieu(ici);
      lieu.figer(true);
      panneau()?.classList.add('frise-seule');
      const jourCle = () => `${reglage.jour()}/${reglage.decalage()}/${ici.lng.toFixed(4)}/${ici.lat.toFixed(4)}`;
      import('./panorama.js')
        .then((module) => module.ouvrirPanorama(map, {
          point: ici,
          boussole,
          retour: () => basculerSol(false),
          ciel: {
            trajets: () => {
              const debut = m.s.midiLocal(reglage.jour(), reglage.decalage()).getTime() - 24 * 3600000;
              return {
                cle: jourCle(),
                debut,
                fin: debut + 48 * 3600000,
                soleil: (instant) => m.s.positionSoleil(instant, ici.lat, ici.lng),
                lune: (instant) => m.l.positionLune(instant, ici.lat, ici.lng),
              };
            },
            instant: () => reglage.instant(),
            heure: (instant) => m.s.heureDuLieu(instant, reglage.decalage()),
            abonner: partage.abonner,
            surLevers: (nouveaux) => {
              levers = nouveaux;
              majLigneRelief();
            },
          },
        }))
        .catch((err) => {
          console.warn('Vue au sol indisponible :', err);
          basculerSol(false);
        });
    } else {
      vueSol = null;
      majChoix();
      levers = null;
      majLigneRelief();
      panneau()?.classList.remove('frise-seule');
      reglage.figerLieu(null);
      lieu.figer(false);
      import('./panorama.js').then((module) => module.fermerPanorama());
    }
    majCiel();
    majPastille();
  }
  boutonCiel.addEventListener('click', () => basculerCiel(!cielActif));
  boutonSol.addEventListener('click', () => {
    if (vueSol) {
      basculerSol(false);
      return;
    }
    const boussole = window.DeviceOrientationEvent?.requestPermission?.().catch(() => 'denied');
    // Là où l'on est si la position est connue, sinon on demande où regarder (comme Horizon)
    import('./panorama.js').then((m) => m.ouvrirAuBonEndroit(map, (lieu) => basculerSol(true, boussole, lieu)));
  });
  requestAnimationFrame(() => {
    panneau()?.querySelector('.outil-rapide-entete')?.addEventListener('click', (event) => {
      if (!vueSol || event.target.closest('button') || panneau().classList.contains('reduit')) return;
      panneau().classList.toggle('frise-seule');
    });
  });

  // `attendre` : pendant un glissement du curseur, l'ombre portée attend que le doigt se pose
  function maj(options = {}) {
    if (!reglage) return;
    reglage.calculer();
    if (visible()) majTextes();
    majCiel();
    if (pastille.visible) pastille.maj();
    abonnes.forEach((f) => f(options));
  }

  // ---------- Mode frise de la vue d'espace (demande du propriétaire du 23 novembre 2026) ----------
  // En vue d'espace, régler la frise fait bouger les astres pour de vrai : globe jour et nuit, atmosphère et ciel
  // passent à l'heure de la frise (heure-espace.js), et la caméra suit le soleil : il reste fixe, la Terre tourne
  // dessous et la Lune avance sur son orbite. Lieu et fuseau de la frise restent figés le temps du mode (sinon les
  // heures sautaient d'un fuseau à l'autre). Retour à l'heure réelle : « Maintenant », panneau fermé, ou retour
  // sur la carte (globe effacé).
  const ZOOM_FIN_GLOBE = 8.5; // globe-nuit.js
  let frise = null; // { centre, instant } : départ de la rotation
  let rotation = false; // déplacement de la caméra par la frise, pas par l'utilisateur
  let veille = null;
  function tournerVers(instant) {
    fixerInstantEspace(instant);
    const centre = centreFrise(frise.centre, frise.instant, instant);
    rotation = true;
    map.jumpTo({ center: [centre.lng, centre.lat] });
    rotation = false;
  }
  function quitterFrise(revenir) {
    if (!frise) return;
    if (revenir) tournerVers(Date.now()); // « Maintenant » : la Terre revient à l'heure réelle, le soleil reste fixe
    frise = null;
    clearInterval(veille);
    fixerInstantEspace(null);
    reglage.figerLieu(null);
    lieu.figer(false);
  }
  function suivreFrise() {
    if (!reglage) return;
    if (!frise) {
      if (opaciteCiel(map.getZoom()) <= 0 || !visible() || reglage.maintenant()) return;
      frise = { centre: map.getCenter(), instant: Date.now() };
      reglage.figerLieu(frise.centre);
      lieu.figer(true);
      veille = setInterval(() => {
        if (!visible() || map.getZoom() >= ZOOM_FIN_GLOBE) quitterFrise(false);
      }, 500);
    }
    if (reglage.maintenant()) quitterFrise(true);
    else tournerVers(reglage.instant());
  }

  // Le soleil et la Lune se calculent au centre de la carte : un grand déplacement les change un peu
  map.on('moveend', () => {
    // En mode frise, l'utilisateur fait tourner la Terre lui-même : la rotation repart de là
    if (frise && !rotation) frise = { centre: map.getCenter(), instant: reglage.instant() };
    if (visible() || ombres?.actif() || cielActif) maj();
  });
  map.on('rotate', () => { if (reglage?.soleil()) m.r.tournerCadrans(position, reglage.soleil(), map.getBearing()); });
  window.addEventListener('mode3d', () => {
    majChoix();
    majCiel();
    majPastille();
  });
  surLangue(() => {
    if (reglage && visible()) majTextes();
    if (vueSol) majLigneRelief();
  });

  const partage = {
    // Promesse du réglage, chargé au premier besoin
    charger,
    // `f({ attendre })` à chaque changement de jour, d'heure ou de lieu ; renvoie de quoi se désabonner
    abonner(f) {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    // L'ombre s'allume ou s'éteint, une visite ou une sortie commence ou finit
    majCiel,
  };

  ombres = creerOptionOmbres(map, partage);
  // Une visite ou une sortie rappelle etat.majOmbres ; ombres.js la remplace (et rappelle majCiel) une fois chargé
  etat.majOmbres ??= majCiel;
  ombres.bloc.prepend(position, heuresSoleil);
  poserAttributCiel();
  majChoix();

  function poserAttributCiel() {
    choixCiel.setAttribute('aria-label', t('ciel.dans-le-ciel'));
    surLangue(() => choixCiel.setAttribute('aria-label', t('ciel.dans-le-ciel')));
  }

  return {
    partage,
    entete,
    // Le panneau s'ouvre : le centre de la carte a pu changer depuis
    surOuverture: () => charger().then(() => requestAnimationFrame(() => {
      maj();
      lieu.surOuverture();
    })),
    ombres: {
      id: 'ombres',
      labelCle: 'soleil.titre',
      icone: 'ombre',
      panneau: ombres.bloc,
      activer() {},
      desactiver() {},
    },
  };
}
