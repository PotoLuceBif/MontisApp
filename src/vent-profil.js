// Onglet Profil de l'analyse du vent : grille heures × altitudes au-dessus d'un point (centre de la
// carte à l'ouverture), avec le vent à chaque altitude, les thermiques, les nuages, les rafales et la
// pluie. Calculs dans profil-calcul.js ; même modèle que la carte du vent (Météo-France).
import { Marker } from 'maplibre-gl';
import { VARIABLES_PROFIL, profilJour } from './profil-calcul.js';
import { VENT_TRES_FORT, cadranVent, couleurInterface, iconeVent, libellesPaliersVent, paletteInterface } from './vent-cadran.js';
import { DECALAGE_PIN, creerPinSeul } from './pins.js';
import { formatAltitude, formatPluie, formatVent, imperial, libelleVent, nombre, valeurAltitude, valeurVent } from './unites.js';
import { dateHorsLigne, estHorsLigne } from './hors-ligne.js';
import { erreurHttp, messageErreur, requete } from './requete.js';
import { nomJour, poser, t, ta, ti, tt } from './i18n.js';
import { lire, ecrire } from './reglages.js';
import { creerAide } from './aide.js';

const API = 'https://api.open-meteo.com/v1/forecast';
const DUREE_CACHE = 15 * 60 * 1000;
const ECART_RECHARGE_M = 3000; // au-delà, le profil n'est plus celui du centre de la carte
const LARGEUR_AXE = 46;
const LARGEUR_CASE = 26;
const HAUTEUR_CASE = 21;
const HAUTEUR_ENTETE = 18;
const HAUTEUR_PIED = 17;
const COULEURS_THERMIQUE = ['', 'rgba(255, 214, 64, 0.22)', 'rgba(255, 205, 40, 0.42)', 'rgba(255, 190, 20, 0.66)'];

const distanceM = (a, b) => {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lng - b.lng) * k, a.lat - b.lat) * 111320;
};

// Flèche vers le haut, tournée dans le sens du vent ; au-delà de 70 km/h, deux pointes
function fleche(x, y, vent) {
  if (!vent) return '';
  const l = 7 + Math.min(1, vent.vitesse / 40) * 3;
  const d = vent.vitesse >= VENT_TRES_FORT
    ? `M0 ${-l} L4.2 ${-l + 5} L1.4 ${-l + 4.2} L4.2 ${-l + 9} L1.4 ${-l + 8.2} L1.4 ${l} L-1.4 ${l} L-1.4 ${-l + 8.2} L-4.2 ${-l + 9} L-1.4 ${-l + 4.2} L-4.2 ${-l + 5} Z`
    : `M0 ${-l} L4.2 ${-l + 6} L1.4 ${-l + 5} L1.4 ${l} L-1.4 ${l} L-1.4 ${-l + 5} L-4.2 ${-l + 6} Z`;
  return `<path class="vent-profil-fleche" d="${d}" transform="translate(${x} ${y}) rotate(${vent.flux.toFixed(0)})" fill="${couleurInterface(vent.vitesse)}"/>`;
}

export function creerProfilVertical(map, { onHeure = () => {}, onCharge = () => {} } = {}) {
  const element = document.createElement('section');
  element.className = 'vent-profil';
  element.innerHTML = `
    <div class="vent-profil-entete">
      <div class="vent-profil-titres">
        <strong ${ti('vent.profil-titre')}>${t('vent.profil-titre')}</strong>
        <span data-profil-lieu></span>
        <button type="button" class="vent-profil-haut" aria-pressed="false" ${ti('vent.profil-haut')}>${t('vent.profil-haut')}</button>
      </div>
      <div class="vent-profil-rose" data-profil-rose></div>
    </div>
    <div class="vent-profil-grille" role="img" ${ta('aria-label', 'vent.profil-aria')}></div>
    <p class="vent-profil-lecture" aria-live="polite"></p>
    <div class="vent-carte-legende vent-profil-vents" ${ta('aria-label', 'vent.intensite')}></div>
    <div class="vent-profil-legende">
      <span><i class="vent-profil-pastille" style="background: ${COULEURS_THERMIQUE[1]}"></i><i class="vent-profil-pastille" style="background: ${COULEURS_THERMIQUE[3]}"></i>${tt('vent.profil-thermiques')}</span>
      <span><i class="vent-profil-pastille vent-profil-pastille-nuage"></i>${tt('vent.profil-nuages')}</span>
      <span><i class="vent-profil-pastille vent-profil-pastille-base"></i>${tt('vent.profil-base')}</span>
    </div>
    <p class="vent-profil-statut" role="status" aria-live="polite"></p>
    <p class="note vent-profil-note" ${ti('vent.profil-note')}>${t('vent.profil-note')}</p>
  `;
  // « ? » à côté du titre, explication sous l'en-tête
  const aide = creerAide('vent-profil');
  element.querySelector('.vent-profil-titres strong').after(aide.bouton);
  element.querySelector('.vent-profil-entete').after(aide.bulle);
  const grille = element.querySelector('.vent-profil-grille');
  const lecture = element.querySelector('.vent-profil-lecture');
  const lieu = element.querySelector('[data-profil-lieu]');
  const statut = element.querySelector('.vent-profil-statut');
  // L'échelle des vents, rappelée sous la grille (unités et thème suivis par redessiner)
  const legendeVents = element.querySelector('.vent-profil-vents');
  // Rose fixe, nord en haut : les flèches de la grille se lisent comme sur une carte
  const rose = element.querySelector('[data-profil-rose]');
  function majLegendeVents() {
    rose.innerHTML = cadranVent(null, 0, '', true);
    const couleurs = paletteInterface();
    legendeVents.innerHTML = libellesPaliersVent().map((libelle, i) => `<span style="--vent-couleur: ${couleurs[i]}">${iconeVent(i)} <b>${libelle}</b></span>`).join('')
      + `<span>${libelleVent()}</span>`;
  }
  // Jusqu'à 4 000 m par défaut ; l'option monte jusqu'à 10 000 m (choix gardé)
  const boutonHaut = element.querySelector('.vent-profil-haut');
  let haut = Boolean(lire('vent-profil-haut', false));
  boutonHaut.setAttribute('aria-pressed', String(haut));
  boutonHaut.addEventListener('click', () => {
    haut = !haut;
    ecrire('vent-profil-haut', haut);
    boutonHaut.setAttribute('aria-pressed', String(haut));
    dessiner();
  });

  const cache = new Map();
  let point = null; // { lng, lat }
  let donnees = null; // réponse d'Open-Meteo pour `point`
  let recue = 0;
  let heureCible = null; // heure du curseur (AAAA-MM-JJTHH:MM)
  let colonneLue = null; // heure touchée dans la grille
  let controleur = null;
  let erreur = false;
  let pin = null;
  let visible = false;

  function poserPin() {
    pin?.remove();
    pin = null;
    if (!visible || !point) return;
    pin = new Marker({ element: creerPinSeul('meteo', 'selected').element, anchor: 'bottom', offset: DECALAGE_PIN })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
  }

  async function charger() {
    const centre = map.getCenter();
    point = { lng: centre.lng, lat: centre.lat };
    poserPin();
    const cle = `${point.lng.toFixed(3)},${point.lat.toFixed(3)}`;
    const enCache = cache.get(cle);
    if (enCache && Date.now() - enCache.recue < DUREE_CACHE) {
      donnees = enCache.donnees;
      recue = enCache.recue;
      erreur = false;
      dessiner();
      onCharge();
      return;
    }
    controleur?.abort();
    const ici = new AbortController();
    controleur = ici;
    erreur = false;
    statut.classList.remove('erreur');
    poser(statut, 'vent.profil-chargement');
    const params = new URLSearchParams({
      latitude: point.lat.toFixed(4),
      longitude: point.lng.toFixed(4),
      current: 'temperature_2m',
      hourly: VARIABLES_PROFIL.join(','),
      models: 'meteofrance_seamless',
      forecast_days: '3',
      timezone: 'auto',
      wind_speed_unit: 'kmh',
    });
    try {
      const reponse = await requete(`${API}?${params}`, { signal: ici.signal });
      if (!reponse.ok) throw erreurHttp(reponse);
      const json = await reponse.json();
      if (controleur !== ici) return;
      if (!Array.isArray(json?.hourly?.time)) throw new Error(t('vent.horaires-incompletes'));
      donnees = json;
      recue = dateHorsLigne(reponse) ?? Date.now();
      cache.set(cle, { donnees, recue });
      while (cache.size > 20) cache.delete(cache.keys().next().value);
      statut.textContent = '';
      delete statut.dataset.i18n;
      dessiner();
    } catch (e) {
      if (controleur !== ici) return;
      console.warn('Profil vertical :', e);
      erreur = true;
      donnees = null;
      grille.replaceChildren();
      lecture.textContent = '';
      statut.classList.add('erreur');
      if (estHorsLigne()) poser(statut, 'vent.profil-hors-ligne');
      else poser(statut, 'vent.profil-erreur', { message: messageErreur(e) });
    } finally {
      if (controleur === ici) {
        controleur = null;
        onCharge();
      }
    }
  }

  function texteLecture(colonne) {
    const { thermique: therm, rafales, pluie, cape, time } = colonne;
    const morceaux = [t('vent.profil-heure', { heure: `${Number(time.slice(11, 13))} h` })];
    if (therm) {
      morceaux.push(t('vent.profil-plafond', { altitude: formatAltitude(therm.plafond, { pas: 50 }) }));
      if (therm.base !== null) morceaux.push(t('vent.profil-base-lue', { altitude: formatAltitude(therm.base, { pas: 50 }) }));
      if (Number.isFinite(therm.gradient)) morceaux.push(t('vent.profil-gradient', { valeur: nombre(therm.gradient, 1) }));
    } else {
      morceaux.push(t('vent.profil-stable'));
    }
    if (Number.isFinite(rafales)) morceaux.push(t('vent.profil-rafales', { valeur: formatVent(rafales) }));
    if (pluie > 0) morceaux.push(formatPluie(pluie));
    if (cape >= 300) morceaux.push(t('vent.profil-cape', { valeur: Math.round(cape) }));
    return morceaux.join(' · ');
  }

  function dessiner() {
    majLegendeVents();
    if (!donnees) return;
    const heures = donnees.hourly.time;
    const cible = heureCible && heures.includes(heureCible) ? heureCible : heures.find((h) => h >= new Date().toISOString().slice(0, 13)) ?? heures[0];
    const jour = cible.slice(0, 10);
    const profil = profilJour(donnees, jour, { max: haut ? 10000 : 4000 });
    const n = profil.heures.length;
    lieu.textContent = t('vent.profil-lieu', {
      jour: nomJour(new Date(`${jour}T12:00`)),
      sol: formatAltitude(donnees.elevation),
    });
    if (!n) {
      grille.replaceChildren();
      lecture.textContent = '';
      poser(statut, 'vent.profil-nuit');
      return;
    }
    if (statut.dataset.i18n === 'vent.profil-nuit') statut.textContent = '';
    const lignes = profil.altitudes.length;
    const largeur = LARGEUR_AXE + n * LARGEUR_CASE;
    const hauteur = HAUTEUR_ENTETE + lignes * HAUTEUR_CASE + 2 * HAUTEUR_PIED + 4;
    const yLigne = (index) => HAUTEUR_ENTETE + (lignes - 1 - index) * HAUTEUR_CASE; // le sol en bas
    const xColonne = (j) => LARGEUR_AXE + j * LARGEUR_CASE;
    let svg = '';
    // Axe des altitudes : une étiquette sur deux, le sol toujours
    profil.altitudes.forEach((altitude, i) => {
      if (i !== 0 && i % 2 !== 0) return;
      const texte = i === 0 ? t('vent.profil-sol') : String(valeurAltitude(altitude));
      svg += `<text class="vent-profil-axe" x="${LARGEUR_AXE - 5}" y="${yLigne(i) + HAUTEUR_CASE / 2 + 3.5}" text-anchor="end">${texte}</text>`;
    });
    const colonneCible = profil.heures.findIndex((h) => h.time === (colonneLue ?? cible));
    profil.heures.forEach((colonne, j) => {
      const x = xColonne(j);
      svg += `<text class="vent-profil-heure" x="${x + LARGEUR_CASE / 2}" y="12" text-anchor="middle">${colonne.heure}</text>`;
      colonne.cellules.forEach((cellule, i) => {
        const y = yLigne(i);
        if (cellule.thermique) svg += `<rect x="${x}" y="${y}" width="${LARGEUR_CASE}" height="${HAUTEUR_CASE}" fill="${COULEURS_THERMIQUE[cellule.thermique]}"/>`;
        if (cellule.nuage > 0.15) svg += `<rect class="vent-profil-nuage" x="${x}" y="${y}" width="${LARGEUR_CASE}" height="${HAUTEUR_CASE}" fill-opacity="${(0.15 + cellule.nuage * 0.4).toFixed(2)}"/>`;
        svg += fleche(x + LARGEUR_CASE / 2, y + HAUTEUR_CASE / 2, cellule.vent);
      });
      // Base des cumulus : un trait à son altitude
      const base = colonne.thermique?.base;
      if (Number.isFinite(base)) {
        const k = profil.altitudes.findIndex((a) => a >= base);
        if (k > 0) {
          const bas = profil.altitudes[k - 1];
          const ratio = (base - bas) / (profil.altitudes[k] - bas);
          const y = yLigne(k - 1) + HAUTEUR_CASE / 2 - ratio * HAUTEUR_CASE;
          svg += `<line class="vent-profil-base" x1="${x + 2}" x2="${x + LARGEUR_CASE - 2}" y1="${y}" y2="${y}"/>`;
        }
      }
      const yPied = HAUTEUR_ENTETE + lignes * HAUTEUR_CASE + 4;
      if (Number.isFinite(colonne.rafales)) {
        svg += `<text class="vent-profil-pied" x="${x + LARGEUR_CASE / 2}" y="${yPied + 12}" text-anchor="middle" fill="${couleurInterface(colonne.rafales)}">${valeurVent(colonne.rafales)}</text>`;
      }
      if (colonne.pluie > 0) {
        svg += `<text class="vent-profil-pied vent-profil-pluie" x="${x + LARGEUR_CASE / 2}" y="${yPied + HAUTEUR_PIED + 12}" text-anchor="middle">${nombre(imperial() ? colonne.pluie / 25.4 : colonne.pluie, imperial() ? 2 : colonne.pluie < 1 ? 1 : 0)}</text>`;
      }
    });
    const yPied = HAUTEUR_ENTETE + lignes * HAUTEUR_CASE + 4;
    svg += `<text class="vent-profil-axe" x="${LARGEUR_AXE - 5}" y="${yPied + 12}" text-anchor="end">${t('vent.profil-rafales-court')}</text>`;
    svg += `<text class="vent-profil-axe" x="${LARGEUR_AXE - 5}" y="${yPied + HAUTEUR_PIED + 12}" text-anchor="end">${t('vent.profil-pluie-court', { unite: imperial() ? 'in' : 'mm' })}</text>`;
    if (colonneCible >= 0) {
      svg += `<rect class="vent-profil-cible" x="${xColonne(colonneCible) + 0.75}" y="1" width="${LARGEUR_CASE - 1.5}" height="${hauteur - 2}" rx="4"/>`;
    }
    // Zones de toucher : une par colonne
    profil.heures.forEach((colonne, j) => {
      svg += `<rect class="vent-profil-zone" data-heure="${colonne.time}" x="${xColonne(j)}" y="0" width="${LARGEUR_CASE}" height="${hauteur}"/>`;
    });
    grille.innerHTML = `<svg viewBox="0 0 ${largeur} ${hauteur}" preserveAspectRatio="xMinYMin meet">${svg}</svg>`;
    const lue = profil.heures[colonneCible >= 0 ? colonneCible : 0];
    lecture.textContent = texteLecture(lue);
  }

  grille.addEventListener('click', (event) => {
    const zone = event.target.closest('[data-heure]');
    if (!zone) return;
    colonneLue = zone.dataset.heure;
    dessiner();
    onHeure(colonneLue);
  });

  return {
    element,
    // Réponse au format de la carte du vent, pour le calcul de l'échéance commune
    reponses: () => (donnees ? [donnees] : null),
    enCours: () => !!controleur,
    afficher() {
      visible = true;
      if (!donnees && !controleur) void charger();
      else poserPin();
    },
    masquer() {
      visible = false;
      controleur?.abort();
      controleur = null;
      poserPin();
    },
    recharger() {
      cache.clear();
      void charger();
    },
    definirHeure(heure) {
      heureCible = heure;
      colonneLue = null;
      dessiner();
    },
    redessiner: dessiner,
    // Message de la bande « Actualiser » : carte déplacée, données trop vieilles ou échec
    raison(dureeValidite) {
      if (erreur) return t('vent.profil-echec');
      if (!point || !donnees) return '';
      if (distanceM(point, map.getCenter()) > ECART_RECHARGE_M) return t('vent.profil-deplace');
      return Date.now() - recue > dureeValidite ? t('vent.plus-heure') : '';
    },
  };
}
