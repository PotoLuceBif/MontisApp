import { THEMES, ACCENTS, themeChoisi, accentChoisi, definirTheme, definirAccent } from './apparence.js';
import { retourAZero } from './reglages.js';
import { applicationInstallee, installationPossible, installerApplication, surInstallationChangee } from './hors-ligne.js';
import { choixUniteVent, definirLangue, definirSysteme, definirUniteVent, langue, surPreferences, systemeUnites } from './preferences.js';
import { poser, poserAttribut, t, ta, ti } from './i18n.js';

function groupe(cle, id) {
  const section = document.createElement('section');
  section.className = 'params-groupe';
  section.dataset.section = id;
  const h = poser(document.createElement('h3'), cle);
  section.appendChild(h);
  return section;
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
    <div class="params-corps"></div>
  `;
  page.querySelector('.params-retour').addEventListener('click', retour);
  const corps = page.querySelector('.params-corps');

  // ---------- Thème ----------
  const theme = groupe('params.theme', 'theme');
  const ligneTheme = ligne('params.theme');
  const choixTheme = segmente(THEMES, themeChoisi, definirTheme, 'params.theme');
  ligneTheme.appendChild(choixTheme.element);
  theme.appendChild(ligneTheme);

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
  const majAccent = () =>
    boutonsAccent.forEach(({ id, b }) => b.classList.toggle('actif', id === accentChoisi()));
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
  corps.appendChild(application);

  return page;
}
