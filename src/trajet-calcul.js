// « S'y rendre » : adresse qui confie le trajet jusqu'à un point à l'appli de trajet du téléphone.
// Android : le lien geo: laisse le système proposer ses applis (Google Maps, Waze…).
// iPhone : iOS n'offre pas de choix, son lien de trajet ouvre l'appli de cartes du système.
// Ailleurs : l'itinéraire de Google Maps dans le navigateur.

export function plateformeDe(agent = '', pointsTactiles = 0) {
  if (/Android/i.test(agent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(agent)) return 'ios';
  // iPadOS se présente comme un Mac, mais tactile
  if (/Macintosh/i.test(agent) && pointsTactiles > 1) return 'ios';
  return 'autre';
}

export function adresseTrajet({ lng, lat }, plateforme) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const position = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  if (plateforme === 'android') return `geo:${position}?q=${position}`;
  if (plateforme === 'ios') return `https://maps.apple.com/?daddr=${position}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${position}`;
}
