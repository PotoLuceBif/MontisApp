// Description et pictogramme d'un code météo (WMO) d'Open-Meteo
import { t } from './i18n.js';

const CODES_METEO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

export function descriptionMeteo(code) {
  return t(CODES_METEO.includes(code) ? `meteo.code.${code}` : 'meteo.code.variable');
}

export function typeMeteo(code) {
  if (!Number.isFinite(code)) return 'inconnu';
  if (code >= 95) return 'orage';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'neige';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'pluie';
  if (code === 45 || code === 48) return 'brouillard';
  if (code === 0) return 'soleil';
  if (code === 1 || code === 2) return 'eclaircies';
  return 'nuage';
}

export function creerIconeMeteo(code) {
  const type = typeMeteo(code);
  const dessins = {
    soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    eclaircies: '<circle cx="8" cy="8" r="3"/><path d="M8 1v2m0 10v2M1 8h2m10 0h2M3.05 3.05l1.42 1.42m7.06 7.06 1.42 1.42"/><path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/>',
    nuage: '<path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/>',
    brouillard: '<path d="M7 13h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 5.5 4 4 0 0 0 7 13Z"/><path d="M4 17h16m-13 4h10"/>',
    pluie: '<path d="M7 14h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 6.5 4 4 0 0 0 7 14Z"/><path d="m8 17-1 3m6-3-1 3m6-3-1 3"/>',
    neige: '<path d="M7 13h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 5.5 4 4 0 0 0 7 13Z"/><path d="M8 17v4m-2-2h4m5-2v4m-2-2h4"/>',
    orage: '<path d="M7 14h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 6.5 4 4 0 0 0 7 14Z"/><path d="m13 15-3 4h3l-1 4 4-6h-3l1-2"/>',
    inconnu: '<path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 11.5 4 4 0 0 0 7 19Z"/><path d="M12 14v.01m-2-4a2 2 0 1 1 3.4 1.4c-.8.8-1.4 1-1.4 2"/>',
  };
  const icone = document.createElement('span');
  icone.className = `meteo-icone meteo-icone-${type}`;
  icone.setAttribute('role', 'img');
  icone.setAttribute('aria-label', descriptionMeteo(code));
  icone.title = descriptionMeteo(code);
  icone.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${dessins[type]}</svg>`;
  return icone;
}
