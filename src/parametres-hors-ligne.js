// Section « Données hors ligne » des Paramètres : branchée sur zones-hors-ligne.js et
// donnees-hors-ligne.js, sans dupliquer le téléchargement ni les caches.
import { dateLisible } from './hors-ligne.js';
import { demanderTelechargementZone, EVENEMENT_ZONES, listerZones, supprimerZone } from './zones-hors-ligne.js';
import { definirWifiUniquement, mesurerStockage, viderCache, wifiDetectable, wifiUniquement } from './donnees-hors-ligne.js';
import { poser, surLangue, t } from './i18n.js';
import { formatTaille } from './unites.js';

const ICONE_SUPPRIMER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg>';

const el = (balise, classe, cle) => {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (cle) poser(element, cle);
  return element;
};

export function creerSectionHorsLigne(section) {
  let mesure = null;
  let enCours = false;

  // ---------- Espace utilisé ----------
  const blocEspace = el('div', 'params-ligne');
  blocEspace.append(el('span', null, 'hl.espace'));
  const total = el('p', 'params-stockage-total');
  const jauge = el('div', 'params-jauge');
  jauge.setAttribute('aria-hidden', 'true');
  const remplissage = el('i');
  jauge.append(remplissage);
  const detail = el('dl', 'params-stockage');
  blocEspace.append(total, jauge, detail);

  // ---------- Zones téléchargées ----------
  const blocZones = el('div', 'params-ligne');
  blocZones.append(el('span', null, 'hl.zones'));
  const listeZones = el('div', 'zh-liste');
  const videZones = el('p', 'params-aide', 'hl.aucune-zone');
  const boutonTelecharger = el('button', 'btn-secondaire', 'hl.telecharger');
  boutonTelecharger.type = 'button';
  boutonTelecharger.addEventListener('click', demanderTelechargementZone);
  blocZones.append(listeZones, videZones, boutonTelecharger);

  // ---------- Wi-Fi uniquement ----------
  const blocWifi = el('div', 'params-ligne');
  if (wifiDetectable()) {
    const option = el('label', 'option-case params-option');
    const caseWifi = document.createElement('input');
    caseWifi.type = 'checkbox';
    caseWifi.checked = wifiUniquement();
    caseWifi.addEventListener('change', () => definirWifiUniquement(caseWifi.checked));
    option.append(caseWifi, ' ', el('span', null, 'hl.wifi'), el('small', null, 'hl.wifi-aide'));
    blocWifi.append(option);
  } else {
    blocWifi.append(el('span', null, 'hl.wifi'), el('p', 'params-aide', 'hl.wifi-impossible'));
  }

  // ---------- Vider le cache ----------
  const blocCache = el('div', 'params-ligne');
  const aideCache = el('p', 'params-aide', 'hl.vider-aide');
  const boutonVider = el('button', 'btn-secondaire btn-danger', 'hl.vider');
  boutonVider.type = 'button';
  const resultatVider = el('p', 'params-aide');
  resultatVider.setAttribute('role', 'status');
  boutonVider.addEventListener('click', async () => {
    if (!confirm(t('hl.vider-confirmer'))) return;
    boutonVider.disabled = true;
    try {
      await viderCache();
      poser(resultatVider, 'hl.vide');
    } catch (erreur) {
      console.warn('Vidage du cache :', erreur);
      poser(resultatVider, 'hl.vider-erreur');
    }
    boutonVider.disabled = false;
    void actualiser();
  });
  blocCache.append(aideCache, boutonVider, resultatVider);

  section.append(blocEspace, blocZones, blocWifi, blocCache);

  function rendreEspace() {
    if (!mesure) {
      poser(total, 'hl.calcul');
      detail.replaceChildren();
      remplissage.style.width = '0';
      return;
    }
    poser(total, mesure.quota ? 'hl.total-quota' : 'hl.total', { total: formatTaille(mesure.total), quota: formatTaille(mesure.quota) });
    remplissage.style.width = mesure.quota ? `${Math.min(100, Math.max(1, (mesure.total / mesure.quota) * 100))}%` : '0';
    jauge.hidden = !mesure.quota;
    const lignes = [
      ['hl.type-cartes', mesure.cartes, t('hl.type-cartes-detail', { zones: formatTaille(mesure.zones), tuiles: formatTaille(mesure.tuiles) })],
      ['hl.type-meteo', mesure.meteo, t('hl.type-meteo-detail')],
      ['hl.type-parcours', mesure.parcours, t('hl.type-parcours-detail', { n: mesure.nombreParcours })],
      ['hl.type-autres', mesure.autres, t('hl.type-autres-detail')],
      ['hl.type-app', mesure.app, t('hl.type-app-detail')],
    ];
    detail.replaceChildren(...lignes.flatMap(([cle, octets, precision]) => {
      const terme = el('dt');
      terme.append(el('span', null, cle), el('small', null));
      terme.querySelector('small').textContent = precision;
      const valeur = el('dd');
      valeur.textContent = formatTaille(octets);
      return [terme, valeur];
    }));
  }

  function rendreZones() {
    const zones = listerZones();
    videZones.hidden = zones.length > 0;
    listeZones.replaceChildren(...zones.map((zone) => {
      const ligne = el('div', 'zh-zone');
      const texte = el('div', 'zh-zone-texte');
      const nom = el('strong');
      nom.textContent = zone.nom;
      const info = el('small');
      poser(info, 'hl.zone-detail', { taille: formatTaille(zone.octets), date: dateLisible(zone.date) });
      texte.append(nom, info);
      if (zone.manquantes) {
        const alerte = el('small', 'zh-zone-alerte');
        poser(alerte, 'zh.incomplete', { n: zone.manquantes });
        texte.append(alerte);
      }
      const supprimer = el('button', 'zh-zone-bouton zh-zone-supprimer');
      supprimer.type = 'button';
      supprimer.innerHTML = ICONE_SUPPRIMER;
      supprimer.setAttribute('aria-label', t('zh.supprimer', { nom: zone.nom }));
      supprimer.title = supprimer.getAttribute('aria-label');
      supprimer.addEventListener('click', async () => {
        if (!confirm(t('zh.supprimer-confirmer', { nom: zone.nom }))) return;
        supprimer.disabled = true;
        await supprimerZone(zone.id);
      });
      ligne.append(texte, supprimer);
      return ligne;
    }));
  }

  async function actualiser() {
    rendreZones();
    if (enCours) return;
    enCours = true;
    try {
      mesure = await mesurerStockage();
    } catch (erreur) {
      console.warn('Mesure du stockage :', erreur);
      mesure = null;
    }
    enCours = false;
    rendreEspace();
  }

  window.addEventListener(EVENEMENT_ZONES, () => void actualiser());
  surLangue(() => {
    rendreZones();
    rendreEspace();
  });
  rendreEspace();
  rendreZones();

  // À l'ouverture des Paramètres : l'espace change sans arrêt quand on se promène sur la carte
  return { actualiser };
}
