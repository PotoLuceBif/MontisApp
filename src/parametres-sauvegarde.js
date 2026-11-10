// Section « Sauvegarde » des Paramètres : export et import d'un fichier .json,
// avec aperçu et choix entre fusionner et remplacer.
import { appliquerSauvegarde, idsSortiesActuelles, lireSauvegarde, resumerSauvegarde, telechargerSauvegarde } from './sauvegarde.js';
import { dateEtHeure, poser, surLangue, t } from './i18n.js';
import { THEMES } from './apparence.js';

const el = (balise, classe, cle, variables) => {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (cle) poser(element, cle, variables);
  return element;
};

// Les sorties sont au féminin : leurs propres textes
const SORTIES = { remplacent: 'sauv.remplacent-sorties', tous: 'sauv.toutes-nouvelles', nouveauxCle: 'sauv.nouvelles', aucun: 'sauv.aucune-nouvelle' };

export function creerSectionSauvegarde(section) {
  let sauvegarde = null;
  let idsSorties = new Set();
  let mode = 'fusion';

  const ligne = el('div', 'params-ligne');
  const aide = el('p', 'params-aide', 'sauv.aide');
  const exclusion = el('p', 'params-aide params-note', 'sauv.exclusion');

  const boutons = el('div', 'params-boutons');
  const exporter = el('button', 'btn-secondaire', 'sauv.exporter');
  exporter.type = 'button';
  exporter.addEventListener('click', async () => {
    exporter.disabled = true;
    try {
      await telechargerSauvegarde();
    } finally {
      exporter.disabled = false;
    }
    poser(message, 'sauv.exportee');
    message.classList.remove('params-erreur');
  });
  const importer = el('label', 'btn-secondaire params-fichier');
  importer.append(el('span', null, 'sauv.importer'));
  const champ = document.createElement('input');
  champ.type = 'file';
  champ.accept = '.json,application/json';
  importer.append(champ);
  boutons.append(exporter, importer);

  const message = el('p', 'params-aide');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');

  // ---------- Aperçu ----------
  const apercu = el('div', 'params-apercu');
  apercu.hidden = true;
  const titreApercu = el('strong');
  const contenu = el('dl', 'params-stockage');
  const choix = el('div', 'segments');
  choix.setAttribute('role', 'group');
  const modes = [['fusion', 'sauv.fusionner'], ['remplacement', 'sauv.remplacer']].map(([id, cle]) => {
    const bouton = el('button', null, cle);
    bouton.type = 'button';
    bouton.addEventListener('click', () => {
      mode = id;
      rendreApercu();
    });
    choix.append(bouton);
    return { id, bouton };
  });
  const explication = el('p', 'params-aide');
  const actions = el('div', 'params-boutons');
  const annuler = el('button', 'btn-secondaire', 'sauv.annuler');
  annuler.type = 'button';
  annuler.addEventListener('click', () => fermerApercu());
  const confirmer = el('button', 'btn-secondaire btn-principal', 'sauv.confirmer');
  confirmer.type = 'button';
  confirmer.addEventListener('click', async () => {
    if (mode === 'remplacement' && !confirm(t('sauv.remplacer-confirmer'))) return;
    confirmer.disabled = true;
    const reussi = await appliquerSauvegarde(sauvegarde, mode);
    confirmer.disabled = false;
    if (!reussi) {
      afficherErreur('sauv.erreur-ecriture');
      return;
    }
    apercu.hidden = true;
    poser(message, 'sauv.importee');
    message.classList.remove('params-erreur');
    // Chaque panneau lit ses réglages au démarrage : un redémarrage les applique tous d'un coup
    setTimeout(() => location.reload(), 900);
  });
  actions.append(annuler, confirmer);
  apercu.append(titreApercu, contenu, choix, explication, actions);

  ligne.append(aide, exclusion, boutons, message, apercu);
  section.append(ligne);

  function afficherErreur(cle, variables) {
    poser(message, cle, variables);
    message.classList.add('params-erreur');
  }

  function fermerApercu() {
    sauvegarde = null;
    apercu.hidden = true;
    poser(message, 'sauv.vide');
  }

  const libelleTheme = (id) => {
    const theme = THEMES.find((autre) => autre.id === id);
    return theme ? t(theme.cle) : '—';
  };
  const libelleUnites = (id) => (id ? t(id === 'imperial' ? 'params.imperial' : 'params.metrique') : '—');
  const libelleLangue = (id) => ({ fr: 'Français', en: 'English' })[id] ?? '—';

  function precisionParcours(total, nouveaux, actuels, cles = {}) {
    const { remplacent = 'sauv.remplacent', tous = 'sauv.tous-nouveaux', nouveauxCle = 'sauv.nouveaux', aucun = 'sauv.aucun-nouveau' } = cles;
    if (mode !== 'fusion') return t(remplacent, { n: actuels });
    if (!total) return '';
    if (nouveaux === total) return t(tous, { n: nouveaux });
    return nouveaux ? t(nouveauxCle, { n: nouveaux }) : t(aucun);
  }

  function rendreApercu() {
    if (!sauvegarde) return;
    const resume = resumerSauvegarde(sauvegarde, idsSorties);
    titreApercu.textContent = resume.date ? t('sauv.du', { date: dateEtHeure(resume.date) }) : t('sauv.sans-date');
    const lignes = [
      [t('sauv.reglages'), t('sauv.reglages-detail', { theme: libelleTheme(resume.theme), unites: libelleUnites(resume.unites), langue: libelleLangue(resume.langue) }), String(resume.nombreReglages)],
      [t('sauv.parcours-rando'), precisionParcours(resume.rando, resume.nouveauxRando, resume.actuelsRando), String(resume.rando)],
      [t('sauv.parcours-velo'), precisionParcours(resume.velo, resume.nouveauxVelo, resume.actuelsVelo), String(resume.velo)],
      // Ligne absente tant qu'aucun parcours de ski de rando n'existe, ni ici ni dans le fichier
      ...(resume.skirando || resume.actuelsSkirando ? [[t('sauv.parcours-skirando'), precisionParcours(resume.skirando, resume.nouveauxSkirando, resume.actuelsSkirando), String(resume.skirando)]] : []),
      [t('sauv.sorties'), precisionParcours(resume.sorties, resume.nouvellesSorties, resume.actuellesSorties, SORTIES), String(resume.sorties)],
    ];
    contenu.replaceChildren(...lignes.flatMap(([titre, precision, valeur]) => {
      const terme = el('dt');
      const nom = el('span');
      nom.textContent = titre;
      const detail = el('small');
      detail.textContent = precision;
      terme.append(nom, detail);
      const dd = el('dd');
      dd.textContent = valeur;
      return [terme, dd];
    }));
    modes.forEach(({ id, bouton }) => {
      bouton.classList.toggle('actif', id === mode);
      bouton.setAttribute('aria-pressed', String(id === mode));
    });
    poser(explication, mode === 'fusion' ? 'sauv.fusion-aide' : 'sauv.remplacement-aide');
  }

  champ.addEventListener('change', async () => {
    const [fichier] = champ.files;
    champ.value = '';
    if (!fichier) return;
    apercu.hidden = true;
    poser(message, 'sauv.lecture');
    message.classList.remove('params-erreur');
    try {
      sauvegarde = await lireSauvegarde(fichier);
      idsSorties = await idsSortiesActuelles();
    } catch (probleme) {
      sauvegarde = null;
      afficherErreur(probleme.cle ?? 'sauv.erreur-json', probleme.variables);
      return;
    }
    mode = 'fusion';
    poser(message, 'sauv.verifiee');
    apercu.hidden = false;
    rendreApercu();
  });

  surLangue(rendreApercu);
}
