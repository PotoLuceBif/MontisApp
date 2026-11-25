// Heure de la vue d'espace (demande du propriétaire du 23 novembre 2026) : d'ordinaire, le globe jour et nuit, son
// atmosphère et le ciel sont à l'heure réelle. Quand on règle la frise de Soleil et Lune en vue d'espace, ils
// passent tous à l'heure de la frise (mode frise de soleil-lune.js), puis reviennent à l'heure réelle en le quittant.
let instantFrise = null; // ms, ou null : heure réelle

// Instant affiché par le globe et le ciel
export const instantEspace = () => instantFrise ?? Date.now();
export const enModeFrise = () => instantFrise !== null;

// Plein jour (demande du propriétaire du 25 novembre 2026) : pendant les jeux, la Terre entière éclairée, sans nuit ni
// lumières des villes, pour bien voir les pays. Globe, calottes et atmosphère placent alors le soleil au zénith partout.
let jourComplet = false;
export const pleinJour = () => jourComplet;
export function fixerPleinJour(oui) {
  if (Boolean(oui) === jourComplet) return;
  jourComplet = Boolean(oui);
  window.dispatchEvent(new CustomEvent('montis:heure-espace', { detail: { instant: instantFrise } }));
}

// `instant` : ms, ou null pour revenir à l'heure réelle ; prévient globe, atmosphère et ciel
export function fixerInstantEspace(instant) {
  const nouveau = instant === null || instant === undefined ? null : Number(instant);
  if (nouveau === instantFrise) return;
  instantFrise = nouveau;
  window.dispatchEvent(new CustomEvent('montis:heure-espace', { detail: { instant: nouveau } }));
}
