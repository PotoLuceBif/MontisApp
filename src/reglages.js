// Mémoire des réglages (gardés après un rafraîchissement de la page)
const CLE = 'montis.reglages';

let donnees = {};
try {
  donnees = JSON.parse(localStorage.getItem(CLE)) ?? {};
} catch (e) {
  donnees = {};
}

export function lire(nom, defaut) {
  return nom in donnees ? donnees[nom] : defaut;
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
  try {
    action();
  } catch (e) {
    map.once('load', action);
  }
}

// Efface tous les réglages, puis recharge l'appli centrée sur la position de l'utilisateur
// (si la géolocalisation est refusée, l'appli repart de sa position par défaut)
export function retourAZero() {
  donnees = {};
  try {
    localStorage.removeItem(CLE);
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