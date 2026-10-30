// Mémoire des réglages (gardés après un rafraîchissement de la page)
const CLE = 'montis.reglages';

function lireDonnees() {
  try {
    const contenu = localStorage.getItem(CLE);
    if (!contenu) return {};

    const valeur = JSON.parse(contenu);
    if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
      console.warn('Réglages locaux invalides : les valeurs par défaut seront utilisées.');
      return {};
    }
    return valeur;
  } catch (e) {
    console.warn('Réglages locaux illisibles : les valeurs par défaut seront utilisées.', e);
    return {};
  }
}

let donnees = lireDonnees();

export function lire(nom, defaut) {
  return Object.prototype.hasOwnProperty.call(donnees, nom) ? donnees[nom] : defaut;
}

export function ecrire(nom, valeur) {
  donnees[nom] = valeur;
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  } catch (e) {
    // stockage indisponible : on ignore, l'appli marche quand même
  }
}

// Exécute une action dès que la carte est prête (tout de suite si elle l'est déjà)
export function quandPret(map, action) {
  if (map.isStyleLoaded()) {
    action();
    return;
  }
  map.once('load', action);
}

// Efface tous les réglages, puis recharge l'appli centrée sur la position de l'utilisateur
// (si la géolocalisation est refusée, l'appli repart de sa position par défaut)
export function retourAZero() {
    // On garde l'apparence : ce sont des préférences, pas des réglages de carte
  const gardes = {};
  for (const cle of ['theme', 'accent']) if (cle in donnees) gardes[cle] = donnees[cle];
  donnees = gardes;
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees));
  } catch (e) {}

  const recharger = () => location.reload();
  if (!('geolocation' in navigator)) {
    recharger();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      ecrire('vue', {
        lng: p.coords.longitude,
        lat: p.coords.latitude,
        zoom: 12,
        bearing: 0,
        pitch: 0,
      });
      recharger();
    },
    () => recharger(),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
  );
}