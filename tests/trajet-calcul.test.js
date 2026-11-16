import { describe, expect, it } from 'vitest';
import { adresseTrajet, plateformeDe } from '../src/trajet-calcul.js';

describe('plateformeDe', () => {
  it('reconnaît Android, iPhone et iPad', () => {
    expect(plateformeDe('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36')).toBe('android');
    expect(plateformeDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios');
    expect(plateformeDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios');
  });
  it('un ordinateur reste « autre »', () => {
    expect(plateformeDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('autre');
    expect(plateformeDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131')).toBe('autre');
    expect(plateformeDe()).toBe('autre');
  });
});

describe('adresseTrajet', () => {
  const depart = { lng: 6.8652345678, lat: 45.9237123456 };
  it('Android : lien geo: pour laisser le choix de l’appli', () => {
    expect(adresseTrajet(depart, 'android')).toBe('geo:45.923712,6.865235?q=45.923712,6.865235');
  });
  it('iPhone : trajet vers le point', () => {
    expect(adresseTrajet(depart, 'ios')).toBe('https://maps.apple.com/?daddr=45.923712,6.865235');
  });
  it('ordinateur : itinéraire Google Maps', () => {
    expect(adresseTrajet(depart, 'autre')).toBe('https://www.google.com/maps/dir/?api=1&destination=45.923712,6.865235');
  });
  it('sans point valable, pas d’adresse', () => {
    expect(adresseTrajet({ lng: NaN, lat: 45 }, 'autre')).toBeNull();
  });
});
