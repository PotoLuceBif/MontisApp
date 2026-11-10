// Bloc « Avalanches ici » du ski de rando : niveau du bulletin pour le massif au centre de la carte,
// suivi au fil des déplacements. Massifs simplifiés dans /data/avalanches/massifs.json (EAWS).
import { chargerNiveauxDuJour, creerBlocRisque } from './ski-conditions.js';
import { massifAuPoint, nomMassif, risqueDuMassif } from './skirando-calcul.js';
import { messageErreur } from './requete.js';
import { langue, surPreferences } from './preferences.js';
import { poser, t } from './i18n.js';

const URL_MASSIFS = '/data/avalanches/massifs.json';
const ATTENTE_MS = 400;

let chargementMassifs = null;
function chargerMassifs() {
  chargementMassifs ??= fetch(new URL(URL_MASSIFS, window.location.origin).href)
    .then((reponse) => {
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    })
    .then((json) => json.massifs ?? [])
    .catch((erreur) => {
      chargementMassifs = null;
      throw erreur;
    });
  return chargementMassifs;
}

export function creerAvalanchesIci(map) {
  const section = document.createElement('section');
  section.className = 'skirando-avalanches';
  section.innerHTML = '<h3></h3><div class="skirando-avalanches-contenu"></div>';
  poser(section.querySelector('h3'), 'skirando.avalanches-ici');
  const contenu = section.querySelector('.skirando-avalanches-contenu');

  let actif = false;
  let minuteur = null;
  let numero = 0;
  let dernier = null; // { id, risque } du dernier rendu, pour ne pas redessiner à chaque déplacement

  function attente(cle) {
    const bloc = document.createElement('div');
    bloc.className = 'rando-attente';
    const roue = document.createElement('span');
    roue.className = 'rech-attente';
    bloc.append(roue, t(cle));
    contenu.replaceChildren(bloc);
  }

  function message(texte) {
    const bloc = document.createElement('div');
    bloc.className = 'rando-attente';
    bloc.textContent = texte;
    contenu.replaceChildren(bloc);
  }

  async function actualiser() {
    if (!actif) return;
    const ici = ++numero;
    if (!dernier) attente('skirando.avalanches-chargement');
    const { lng, lat } = map.getCenter();
    let massifs;
    let niveaux;
    try {
      [massifs, niveaux] = await Promise.all([chargerMassifs(), chargerNiveauxDuJour()]);
    } catch (erreur) {
      if (ici !== numero) return;
      console.warn('Avalanches ici :', erreur);
      dernier = null;
      message(t('skirando.avalanches-erreur', { raison: messageErreur(erreur) }));
      return;
    }
    if (ici !== numero || !actif) return;
    const massif = massifAuPoint(massifs, [lng, lat], niveaux);
    if (!massif) {
      if (dernier?.id === null) return;
      dernier = { id: null };
      message(t('skirando.avalanches-hors'));
      return;
    }
    const risque = risqueDuMassif(niveaux, massif.id);
    const cle = `${massif.id}/${JSON.stringify(risque)}/${langue()}`;
    if (dernier?.cle === cle) return;
    dernier = { id: massif.id, cle };
    contenu.replaceChildren(creerBlocRisque(risque.max ? risque : null, {
      massif: massif.id,
      massifNom: nomMassif(massif, langue()),
      pays: massif.id.slice(0, 2),
    }));
  }

  const programmer = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(actualiser, ATTENTE_MS);
  };
  map.on('moveend', programmer);
  surPreferences(() => {
    dernier = null;
    if (actif) void actualiser();
  });

  return {
    section,
    activer() {
      actif = true;
      void actualiser();
    },
    desactiver() {
      actif = false;
      numero += 1;
      clearTimeout(minuteur);
    },
  };
}
