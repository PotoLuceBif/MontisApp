import { THEMES, ACCENTS, themeChoisi, accentChoisi, definirTheme, definirAccent } from './apparence.js';
import { retourAZero } from './reglages.js';
import { applicationInstallee, installationPossible, installerApplication, surInstallationChangee } from './hors-ligne.js';
import { choixUniteVent, definirSysteme, definirUniteVent, surPreferences, systemeUnites } from './preferences.js';

function groupe(titre, id) {
  const section = document.createElement('section');
  section.className = 'params-groupe';
  section.dataset.section = id;
  const h = document.createElement('h3');
  h.textContent = titre;
  section.appendChild(h);
  return section;
}

function ligne(libelle) {
  const l = document.createElement('div');
  l.className = 'params-ligne';
  const t = document.createElement('span');
  t.textContent = libelle;
  l.appendChild(t);
  return l;
}

function aide(texte) {
  const p = document.createElement('p');
  p.className = 'params-aide';
  p.textContent = texte;
  return p;
}

// Contrôle segmenté : `options` = [{ id, nom }], `actif()` donne l'id choisi
function segmente(options, actif, choisir, libelle) {
  const segments = document.createElement('div');
  segments.className = 'segments';
  segments.setAttribute('role', 'group');
  if (libelle) segments.setAttribute('aria-label', libelle);
  const boutons = options.map((option) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = option.nom;
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
      <button type="button" class="params-retour" aria-label="Retour au menu">←</button>
      <strong>Paramètres</strong>
    </div>
    <div class="params-corps"></div>
  `;
  page.querySelector('.params-retour').addEventListener('click', retour);
  const corps = page.querySelector('.params-corps');

  // ---------- Thème ----------
  const theme = groupe('Thème', 'theme');
  const ligneTheme = ligne('Thème');
  const choixTheme = segmente(THEMES, themeChoisi, definirTheme, 'Thème');
  ligneTheme.appendChild(choixTheme.element);
  theme.appendChild(ligneTheme);

  const ligneAccent = ligne('Couleur d’accent');
  const pastilles = document.createElement('div');
  pastilles.className = 'pastilles';
  const boutonsAccent = ACCENTS.map((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pastille';
    b.title = a.nom;
    b.setAttribute('aria-label', a.nom);
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
  const unites = groupe('Unités', 'unites');
  const ligneSysteme = ligne('Système');
  const choixSysteme = segmente(
    [{ id: 'metrique', nom: 'Métrique' }, { id: 'imperial', nom: 'Impérial' }],
    systemeUnites,
    definirSysteme,
    'Système d’unités'
  );
  ligneSysteme.appendChild(choixSysteme.element);
  const aideSysteme = aide('');
  const majAideSysteme = () => {
    aideSysteme.textContent = systemeUnites() === 'imperial'
      ? 'Milles, pieds, mph et °F. Les traces GPX restent enregistrées en mètres.'
      : 'Kilomètres, mètres, km/h et °C.';
  };
  majAideSysteme();
  ligneSysteme.appendChild(aideSysteme);
  unites.appendChild(ligneSysteme);

  // Option avancée : en vol, on garde souvent km/h ou nœuds quel que soit le système
  const avance = document.createElement('details');
  avance.className = 'params-avance';
  avance.innerHTML = '<summary>Options avancées</summary>';
  const ligneVent = ligne('Vitesse du vent');
  const choixVent = segmente(
    [
      { id: 'auto', nom: 'Auto' },
      { id: 'kmh', nom: 'km/h' },
      { id: 'ms', nom: 'm/s' },
      { id: 'kt', nom: 'nœuds' },
      { id: 'mph', nom: 'mph' },
    ],
    choixUniteVent,
    definirUniteVent,
    'Unité de vitesse du vent'
  );
  ligneVent.append(choixVent.element, aide('Auto suit le système choisi. Utile en parapente, où l’on garde souvent km/h ou nœuds.'));
  avance.appendChild(ligneVent);
  unites.appendChild(avance);
  corps.appendChild(unites);

  // Une restauration de sauvegarde peut tout changer d'un coup
  surPreferences(() => {
    choixSysteme.maj();
    choixVent.maj();
    majAideSysteme();
    choixTheme.maj();
    majAccent();
  });

  // ---------- Application ----------
  const application = groupe('Application', 'application');
  const aideInstallation = aide('');
  const installer = document.createElement('button');
  installer.type = 'button';
  installer.className = 'btn-secondaire';
  installer.textContent = 'Installer Montis';
  installer.addEventListener('click', () => void installerApplication());
  function majInstallation() {
    installer.hidden = !installationPossible();
    if (applicationInstallee()) {
      aideInstallation.textContent = 'Montis est installée sur cet appareil et s’ouvre sans réseau.';
    } else if (installationPossible()) {
      aideInstallation.textContent = 'Installez Montis pour l’ouvrir depuis l’écran d’accueil, même sans réseau.';
    } else {
      aideInstallation.textContent = 'Pour installer Montis, utilisez « Ajouter à l’écran d’accueil » dans le menu du navigateur (Partager sur iPhone).';
    }
  }
  surInstallationChangee(majInstallation);
  majInstallation();
  application.append(aideInstallation, installer);

  const aideReset = aide('Remet les réglages de la carte à zéro et recentre l’application sur votre position. Le thème, les unités et la langue sont conservés.');
  aideReset.classList.add('params-aide-espace');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn-secondaire btn-danger';
  reset.textContent = '↺ Retour à zéro';
  reset.addEventListener('click', () => {
    if (confirm('Tout remettre à zéro et recentrer la carte sur votre position ?')) retourAZero();
  });
  application.append(aideReset, reset);
  corps.appendChild(application);

  return page;
}
