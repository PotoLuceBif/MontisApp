import { describe, expect, it } from 'vitest';
import {
  altitudesProfil, baseNuages, colonneAir, densiteNuage, forceThermique, interpoler, profilJour, thermique, ventAltitude,
} from '../src/profil-calcul.js';

const HAUTEURS = { 1000: 100, 950: 550, 925: 780, 900: 1000, 850: 1450, 800: 1950, 750: 2470, 700: 3010, 650: 3580, 600: 4200, 550: 4850, 500: 5570 };
// Air qui se refroidit de 6,5 °C par km au-dessus de 550 m
const temperatureAir = (altitude) => 17 - 0.0065 * (altitude - 550);

function heures(times, { sol = 20, rosee = 0, vent = 20 } = {}) {
  const hourly = { time: times };
  const remplir = (cle, valeur) => { hourly[cle] = times.map(() => valeur); };
  remplir('temperature_2m', sol);
  remplir('dew_point_2m', rosee);
  remplir('wind_speed_10m', 10);
  remplir('wind_direction_10m', 270);
  remplir('wind_gusts_10m', 25);
  remplir('precipitation', 0);
  remplir('cape', 120);
  for (const [p, h] of Object.entries(HAUTEURS)) {
    remplir(`geopotential_height_${p}hPa`, h);
    remplir(`temperature_${p}hPa`, temperatureAir(h));
    remplir(`relative_humidity_${p}hPa`, h > 3000 ? 97 : 60);
    remplir(`wind_speed_${p}hPa`, vent);
    remplir(`wind_direction_${p}hPa`, 270);
  }
  return hourly;
}

describe('colonne d’air', () => {
  it('commence au sol et écarte les niveaux sous le relief', () => {
    const colonne = colonneAir(heures(['2026-11-11T12:00']), 0, 500);
    expect(colonne[0]).toMatchObject({ altitude: 500, temperature: 20 });
    expect(colonne.some((n) => n.altitude === 100)).toBe(false);
    expect(colonne.map((n) => n.altitude)).toEqual([...colonne.map((n) => n.altitude)].sort((a, b) => a - b));
  });

  it('interpole température et vent entre deux niveaux', () => {
    const colonne = colonneAir(heures(['2026-11-11T12:00']), 0, 500);
    expect(interpoler(colonne, 1225, 'temperature')).toBeCloseTo(temperatureAir(1225), 6);
    const vent = ventAltitude(colonne, 2000);
    expect(vent.vitesse).toBeCloseTo(20, 6);
    expect(vent.provenance).toBeCloseTo(270, 6);
    expect(interpoler(colonne, 9000, 'temperature')).toBeNull();
  });
});

describe('thermiques', () => {
  it('sans condensation, le plafond est là où la particule rejoint l’air', () => {
    const colonne = colonneAir(heures(['2026-11-11T13:00']), 0, 500);
    const t = thermique(colonne, 0);
    // 20 + 1 °C de déclenchement − 9,8 °C/km depuis 500 m rejoint 17 − 6,5 °C/km depuis 550 m vers 1 610 m
    expect(t.plafond).toBeGreaterThan(1550);
    expect(t.plafond).toBeLessThan(1650);
    expect(t.base).toBeNull();
    expect(t.gradient).toBeGreaterThan(0.6);
  });

  it('avec un air humide, les thermiques s’arrêtent à la base des cumulus', () => {
    const colonne = colonneAir(heures(['2026-11-11T13:00'], { rosee: 16 }), 0, 500);
    const t = thermique(colonne, 16);
    expect(t.base).toBe(1000);
    expect(t.plafond).toBe(1000);
    expect(t.sommet).toBeGreaterThan(1000);
  });

  it('un sol plus froid que l’air au-dessus ne donne aucun thermique', () => {
    const colonne = colonneAir(heures(['2026-11-11T07:00'], { sol: 10 }), 0, 500);
    expect(thermique(colonne, 0)).toBeNull();
  });

  it('sans soleil, pas de thermique', () => {
    const colonne = colonneAir(heures(['2026-11-11T13:00']), 0, 500);
    expect(thermique(colonne, 0, 20)).toBeNull();
    expect(thermique(colonne, 0, 400)).not.toBeNull();
  });

  it('part du premier niveau ramené au sol quand la température à 2 m est trop fraîche', () => {
    // Couche brassée : 20 °C à 750 m, soit 22,45 °C ramenés à 500 m, contre 21 °C mesurés à 2 m
    const colonne = [
      { altitude: 500, temperature: 21, humidite: null, u: 0, v: 0 },
      { altitude: 750, temperature: 20, humidite: 50, u: 0, v: 0 },
      { altitude: 2000, temperature: 8, humidite: 50, u: 0, v: 0 },
    ];
    expect(thermique(colonne, 0).plafond).toBeGreaterThan(1400);
  });

  it('classe la force selon l’écart de température', () => {
    expect([-1, 0.5, 2, 4, NaN].map(forceThermique)).toEqual([0, 1, 2, 3, 0]);
  });

  it('estime la base des nuages à 125 m par degré d’écart', () => {
    expect(baseNuages(500, 20, 12)).toBe(1500);
    expect(baseNuages(500, 20, null)).toBeNull();
  });
});

describe('profil d’une journée', () => {
  it('garde les heures de jour du jour demandé, du sol au plafond affiché', () => {
    const donnees = { elevation: 500, hourly: heures(['2026-11-11T06:00', '2026-11-11T12:00', '2026-11-11T21:00', '2026-11-12T12:00']) };
    const profil = profilJour(donnees, '2026-11-11');
    expect(profil.heures.map((h) => h.heure)).toEqual([12]);
    expect(profil.altitudes[0]).toBe(500);
    expect(profil.altitudes.at(-1)).toBe(4000);
    const [midi] = profil.heures;
    expect(midi.cellules[0].thermique).toBeGreaterThan(0);
    expect(midi.cellules.at(-1).thermique).toBe(0);
    expect(midi.cellules.find((c) => c.altitude === 3500).nuage).toBeGreaterThan(0.7);
    expect(midi.rafales).toBe(25);
  });

  it('pose les lignes d’altitude au-dessus du sol', () => {
    expect(altitudesProfil(494).slice(0, 3)).toEqual([494, 750, 1000]);
    expect(densiteNuage(80)).toBe(0);
    expect(densiteNuage(100)).toBe(1);
  });
});
