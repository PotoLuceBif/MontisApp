import { THEMES, ACCENTS, themeChoisi, accentChoisi, definirTheme, definirAccent } from './apparence.js';
import { retourAZero } from './reglages.js';

function groupe(titre) {
  const section = document.createElement('section');
  section.className = 'params-groupe';
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

  // ---------- Apparence ----------
  const apparence = groupe('Apparence');

  const ligneTheme = ligne('Thème');
  const segments = document.createElement('div');
  segments.className = 'segments';
  segments.setAttribute('role', 'group');
  const boutonsTheme = THEMES.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.nom;
    b.addEventListener('click', () => {
      definirTheme(t.id);
      majTheme();
    });
    segments.appendChild(b);
    return { id: t.id, b };
  });
  const majTheme = () =>
    boutonsTheme.forEach(({ id, b }) => b.classList.toggle('actif', id === themeChoisi()));
  majTheme();
  ligneTheme.appendChild(segments);
  apparence.appendChild(ligneTheme);

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
  apparence.appendChild(ligneAccent);

  corps.appendChild(apparence);

  // ---------- Données ----------
  const donnees = groupe('Données');
  const aide = document.createElement('p');
  aide.className = 'params-aide';
  aide.textContent =
    'Remet les réglages de la carte à zéro et recentre l’application sur votre position. Le thème est conservé.';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn-secondaire btn-danger';
  reset.textContent = '↺ Retour à zéro';
  reset.addEventListener('click', () => {
    if (confirm('Tout remettre à zéro et recentrer la carte sur votre position ?')) retourAZero();
  });
  donnees.append(aide, reset);
  corps.appendChild(donnees);

  return page;
}