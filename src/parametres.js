import { THEMES, ACCENTS, themeChoisi, accentChoisi, definirTheme, definirAccent } from './apparence.js';
import { retourAZero } from './reglages.js';
import { applicationInstallee, installationPossible, installerApplication, surInstallationChangee } from './hors-ligne.js';
import { choixUniteVent, definirLangue, definirSysteme, definirUniteVent, langue, surPreferences, systemeUnites } from './preferences.js';
import { poser, poserAttribut, t, ta, ti } from './i18n.js';
import { creerSectionHorsLigne } from './parametres-hors-ligne.js';
import { creerSectionSauvegarde } from './parametres-sauvegarde.js';

// Icônes des sections (refonte du 25 novembre 2026) : encadrées comme les logos de l'appli
const ICONES = {
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>',
  unites: '<path d="M3 17 17 3l4 4L7 21Z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  langue: '<path d="M4 6h10M9 4v2M6 6c1 4 4 7 8 8M12 6c-1 4-4 7-8 8"/><path d="m13 20 4-9 4 9M14.5 17h5"/>',
  'hors-ligne': '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  sauvegarde: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  application: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
};
function groupe(cle, id) {
  const section = document.createElement('section');
  section.className = 'params-groupe';
  section.dataset.section = id;
  const tete = document.createElement('div');
  tete.className = 'params-groupe-tete';
  tete.innerHTML = `<span class="bande-icone params-icone"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[id] ?? ''}</svg></span>`;
  tete.appendChild(poser(document.createElement('h3'), cle));
  section.appendChild(tete);
  return section;
}

// Thèmes en vignettes : chacune montre ses couleurs (fond, panneau, accent)
const APERCUS = {
  cyberpunk: ['#0b1128', '#151d3e', '#a494ff'],
  clair: ['#eef1f6', '#ffffff', '#2f6b57'],
  sombre: ['#15191c', '#1c2125', '#5fb59a'],
  auto: ['linear-gradient(135deg, #eef1f6 50%, #15191c 50%)', 'linear-gradient(135deg, #ffffff 50%, #1c2125 50%)', '#5fb59a'],
};
function vignettesTheme(themes, actif, choisir, accent) {
  const grille = document.createElement('div');
  grille.className = 'params-themes';
  grille.setAttribute('role', 'group');
  poserAttribut(grille, 'aria-label', 'params.theme');
  const boutons = themes.map((theme) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'params-theme';
    const [fond, panneau] = APERCUS[theme.id] ?? APERCUS.sombre;
    b.innerHTML = `<span class="params-theme-apercu" style="background:${fond}"><i style="background:${panneau}"></i><b></b></span><span class="params-theme-nom"></span>`;
    poser(b.querySelector('.params-theme-nom'), theme.cle);
    b.addEventListener('click', () => {
      choisir(theme.id);
      maj();
    });
    grille.appendChild(b);
    return { id: theme.id, b };
  });
  function maj() {
    const couleurs = accent();
    boutons.forEach(({ id, b }) => {
      b.classList.toggle('actif', id === actif());
      b.setAttribute('aria-pressed', String(id === actif()));
      b.querySelector('.params-theme-apercu b').style.background = id === 'clair' ? couleurs.clair : couleurs.sombre;
    });
  }
  maj();
  return { element: grille, maj };
}

function ligne(cle) {
  const l = document.createElement('div');
  l.className = 'params-ligne';
  l.appendChild(poser(document.createElement('span'), cle));
  return l;
}

function aide(cle) {
  const p = document.createElement('p');
  p.className = 'params-aide';
  if (cle) poser(p, cle);
  return p;
}

// Contrôle segmenté : `options` = [{ id, cle }] (ou { id, nom } pour un texte fixe)
function segmente(options, actif, choisir, cleLibelle) {
  const segments = document.createElement('div');
  segments.className = 'segments';
  segments.setAttribute('role', 'group');
  if (cleLibelle) poserAttribut(segments, 'aria-label', cleLibelle);
  const boutons = options.map((option) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (option.cle) poser(b, option.cle);
    else b.textContent = option.nom;
    b.addEventListener('click', () => {
      choisir(option.id);
      maj();
    });
    segments.appendChild(b);
    return { id: option.id, b };
  });
  function maj() {
    boutons.forEach(({ id, b }) => {
      b.classList.toggle('actif', id === actif());
      b.setAttribute('aria-pressed', String(id === actif()));
    });
  }
  maj();
  return { element: segments, maj };
}

export function creerPageParametres({ retour }) {
  const page = document.createElement('div');
  page.className = 'params';
  page.innerHTML = `
    <div class="params-entete">
      <button type="button" class="params-retour" ${ta('aria-label', 'params.retour')}>←</button>
      <strong ${ti('params.titre')}>${t('params.titre')}</strong>
    </div>
    <div class="params-corps">
      <div class="params-accueil">
        <img src="/logos/montis-icon-fullbleed.svg" alt="" width="56" height="56" />
        <div>
          <strong>Montis</strong>
          <small ${ti('params.accroche')}>${t('params.accroche')}</small>
          <small class="params-accueil-version"></small>
          <button type="button" class="params-bienvenue" ${ti('bienvenue.revoir')}>${t('bienvenue.revoir')}</button>
        </div>
      </div>
    </div>
  `;
  page.querySelector('.params-retour').addEventListener('click', retour);
  page.querySelector('.params-bienvenue').addEventListener('click', () => window.dispatchEvent(new Event('montis:bienvenue')));
  const corps = page.querySelector('.params-corps');

  // ---------- Thème ----------
  poser(page.querySelector('.params-accueil-version'), 'params.version', { version: __VERSION_MONTIS__ });
  const theme = groupe('params.theme', 'theme');
  const accentActuel = () => ACCENTS.find((a) => a.id === accentChoisi()) ?? ACCENTS[0];
  const choixTheme = vignettesTheme(THEMES, themeChoisi, definirTheme, accentActuel);
  theme.appendChild(choixTheme.element);

  const ligneAccent = ligne('params.accent');
  const pastilles = document.createElement('div');
  pastilles.className = 'pastilles';
  const boutonsAccent = ACCENTS.map((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pastille';
    poserAttribut(b, 'title', a.cle);
    poserAttribut(b, 'aria-label', a.cle);
    b.style.setProperty('--c-clair', a.clair);
    b.style.setProperty('--c-sombre', a.sombre);
    b.addEventListener('click', () => {
      definirAccent(a.id);
      majAccent();
    });
    pastilles.appendChild(b);
    return { id: a.id, b };
  });
  const majAccent = () => {
    boutonsAccent.forEach(({ id, b }) => b.classList.toggle('actif', id === accentChoisi()));
    choixTheme.maj();
  };
  majAccent();
  ligneAccent.appendChild(pastilles);
  theme.appendChild(ligneAccent);
  corps.appendChild(theme);

  // ---------- Unités ----------
  const unites = groupe('params.unites', 'unites');
  const ligneSysteme = ligne('params.systeme');
  const choixSysteme = segmente(
    [{ id: 'metrique', cle: 'params.metrique' }, { id: 'imperial', cle: 'params.imperial' }],
    systemeUnites,
    definirSysteme,
    'params.systeme-aria'
  );
  ligneSysteme.appendChild(choixSysteme.element);
  const aideSysteme = aide();
  const majAideSysteme = () => poser(aideSysteme, systemeUnites() === 'imperial' ? 'params.aide-imperial' : 'params.aide-metrique');
  majAideSysteme();
  ligneSysteme.appendChild(aideSysteme);
  unites.appendChild(ligneSysteme);

  // Option avancée : en vol, on garde souvent km/h ou nœuds quel que soit le système
  const avance = document.createElement('details');
  avance.className = 'params-avance';
  avance.innerHTML = `<summary ${ti('params.avance')}>${t('params.avance')}</summary>`;
  const ligneVent = ligne('params.vent');
  const choixVent = segmente(
    [
      { id: 'auto', cle: 'params.vent-auto' },
      { id: 'kmh', nom: 'km/h' },
      { id: 'ms', nom: 'm/s' },
      { id: 'kt', cle: 'params.vent-noeuds' },
      { id: 'mph', nom: 'mph' },
    ],
    choixUniteVent,
    definirUniteVent,
    'params.vent-aria'
  );
  ligneVent.append(choixVent.element, aide('params.aide-vent'));
  avance.appendChild(ligneVent);
  unites.appendChild(avance);
  corps.appendChild(unites);

  // ---------- Langue ----------
  const sectionLangue = groupe('params.langue', 'langue');
  const ligneLangue = ligne('params.langue-interface');
  // Chaque langue s'écrit dans sa propre langue, pour qu'on la retrouve quoi qu'il arrive
  const choixLangue = segmente(
    [{ id: 'fr', nom: 'Français' }, { id: 'en', nom: 'English' }],
    langue,
    definirLangue,
    'params.langue'
  );
  ligneLangue.append(choixLangue.element, aide('params.aide-langue'));
  sectionLangue.appendChild(ligneLangue);
  corps.appendChild(sectionLangue);

  // ---------- Données hors ligne ----------
  const sectionHorsLigne = groupe('params.hors-ligne', 'hors-ligne');
  const horsLigne = creerSectionHorsLigne(sectionHorsLigne);
  corps.appendChild(sectionHorsLigne);

  // ---------- Sauvegarde ----------
  const sectionSauvegarde = groupe('params.sauvegarde', 'sauvegarde');
  creerSectionSauvegarde(sectionSauvegarde);
  corps.appendChild(sectionSauvegarde);

  // Une restauration de sauvegarde peut tout changer d'un coup
  surPreferences(() => {
    choixSysteme.maj();
    choixVent.maj();
    choixLangue.maj();
    majAideSysteme();
    choixTheme.maj();
    majAccent();
  });

  // ---------- Application ----------
  const application = groupe('params.application', 'application');
  const aideInstallation = aide();
  const installer = document.createElement('button');
  installer.type = 'button';
  installer.className = 'btn-secondaire';
  poser(installer, 'params.installer');
  installer.addEventListener('click', () => void installerApplication());
  function majInstallation() {
    installer.hidden = !installationPossible();
    if (applicationInstallee()) poser(aideInstallation, 'params.installee');
    else if (installationPossible()) poser(aideInstallation, 'params.installable');
    else poser(aideInstallation, 'params.installer-manuel');
  }
  surInstallationChangee(majInstallation);
  majInstallation();
  application.append(aideInstallation, installer);

  const aideReset = aide('params.aide-reset');
  aideReset.classList.add('params-aide-espace');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn-secondaire btn-danger';
  poser(reset, 'params.reset');
  reset.addEventListener('click', () => {
    if (confirm(t('params.reset-confirmer'))) retourAZero();
  });
  application.append(aideReset, reset);
  const version = aide();
  version.classList.add('params-aide-espace');
  poser(version, 'params.version', { version: __VERSION_MONTIS__ });
  application.append(version);
  corps.appendChild(application);

  // Appelé à chaque ouverture : l'espace utilisé change en se promenant sur la carte
  page.surOuverture = () => void horsLigne.actualiser();
  return page;
}
