import { describe, expect, it } from 'vitest';
import { ajouterPoint, chaineTrace, gpxTrace, lireTraceSauvee, nouvelleTrace, resumeTrace } from '../src/guidage-trace-calcul.js';

// 0,0001° de latitude ≈ 11 m
const pos = (t, i, altitude = null, precision = 5) => ({ t: t * 1000, lng: 7, lat: 46 + i * 0.0001, altitude, precision });

describe('ajouterPoint', () => {
  it('garde les points espacés, écarte les flous et les trop proches', () => {
    const trace = nouvelleTrace({ nom: 'Test', debut: 0 });
    expect(ajouterPoint(trace, pos(0, 0))).toBe(true);
    expect(ajouterPoint(trace, pos(5, 0.1))).toBe(false); // 1 m
    expect(ajouterPoint(trace, pos(10, 1, null, 80))).toBe(false); // flou
    expect(ajouterPoint(trace, pos(10, 1))).toBe(true);
    expect(ajouterPoint(trace, pos(45, 1))).toBe(true); // immobile mais 30 s passées
    expect(trace.segments).toHaveLength(1);
    expect(trace.segments[0]).toHaveLength(3);
  });
  it('ouvre un segment après un trou ou une coupure', () => {
    const trace = nouvelleTrace({ nom: 'Test', debut: 0 });
    ajouterPoint(trace, pos(0, 0));
    ajouterPoint(trace, pos(10, 1));
    ajouterPoint(trace, pos(200, 5)); // 190 s sans point
    ajouterPoint(trace, pos(210, 6), { coupure: true });
    expect(trace.segments.map((s) => s.length)).toEqual([2, 1, 1]);
  });
});

describe('resumeTrace', () => {
  it('compte la distance dans les segments, pas à travers les trous', () => {
    const trace = nouvelleTrace({ nom: 'Test', debut: 0 });
    ajouterPoint(trace, pos(0, 0, 1000));
    ajouterPoint(trace, pos(10, 10, 1020));
    ajouterPoint(trace, pos(300, 100, 1030));
    ajouterPoint(trace, pos(310, 110, 1050));
    const resume = resumeTrace(trace);
    expect(resume.distance).toBeGreaterThan(215);
    expect(resume.distance).toBeLessThan(230);
    expect(resume.duree).toBe(310);
    expect(resume.plus).toBe(40);
    expect(resume.trous).toBe(1);
  });
  it('pas de D+ sans altitude', () => {
    const trace = nouvelleTrace({ nom: 'Test', debut: 0 });
    ajouterPoint(trace, pos(0, 0));
    ajouterPoint(trace, pos(10, 10));
    expect(resumeTrace(trace).plus).toBeNull();
  });
});

describe('gpxTrace et chaineTrace', () => {
  it('écrit un trkseg par segment, avec l’heure', () => {
    const trace = nouvelleTrace({ nom: 'Col & lac', debut: 0 });
    ajouterPoint(trace, pos(0, 0, 1000));
    ajouterPoint(trace, pos(10, 1));
    ajouterPoint(trace, pos(300, 5));
    const gpx = gpxTrace(trace);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain('Col &amp; lac');
    expect(gpx).toContain('<ele>1000</ele><time>1970-01-01T00:00:00.000Z</time>');
    expect(chaineTrace(trace)).toHaveLength(3);
  });
});

describe('lireTraceSauvee', () => {
  it('écarte les points abîmés', () => {
    const trace = lireTraceSauvee({ nom: 'x', debut: 5, segments: [[[1, 7, 46, null], ['a', 7, 46]], 'rien', []] });
    expect(trace.segments).toEqual([[[1, 7, 46, null]]]);
    expect(lireTraceSauvee(null)).toBeNull();
  });
});
