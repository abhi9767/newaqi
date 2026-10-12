import { describe, expect, it } from 'vitest';
import { angleDiffDeg, bearingDeg, compass, haversineKm, polygonAreaCentroid } from '@/lib/geo';
import { airScore, areaScore, coverage, DEFAULT_SITING_CONFIG as C, distanceScore, rankSites, upwindScore } from '@/lib/siting';
import type { CandidateSite, WindStats } from '@/lib/types';
import { prevailingWind } from '@/lib/wind';

const P = { start: '2025-01-01', end: '2025-12-31' };

describe('geo', () => {
  it('bearing and angle helpers', () => {
    expect(Math.round(bearingDeg(0, 0, 1, 0))).toBe(0);
    expect(Math.round(bearingDeg(0, 0, 0, 1))).toBe(90);
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(compass(225)).toBe('SW');
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
  it('computes polygon area for a ~1 km x 1 km square (100 ha) and its centroid', () => {
    const d = 1 / 111.195; // degrees of latitude per km
    const lat0 = 0;
    const sq: [number, number][] = [[lat0, 0], [lat0, d], [lat0 + d, d], [lat0 + d, 0], [lat0, 0]];
    const r = polygonAreaCentroid(sq)!;
    expect(r.areaHa).toBeGreaterThan(99);
    expect(r.areaHa).toBeLessThan(101);
    expect(r.lat).toBeCloseTo(d / 2, 5);
    expect(r.lng).toBeCloseTo(d / 2, 5);
  });
  it('rejects open or degenerate rings', () => {
    expect(polygonAreaCentroid([[0, 0], [0, 1], [1, 1], [1, 0]])).toBeNull();
    expect(polygonAreaCentroid([[0, 0], [0, 1], [0, 0]])).toBeNull();
    expect(polygonAreaCentroid([[0, 0], [0, 1], [0, 2], [0, 0]])).toBeNull();
  });
});

describe('prevailingWind', () => {
  it('finds a steady westerly (wind FROM 270)', () => {
    const w = prevailingWind([10, 12, 8], [270, 270, 270], P);
    expect(Math.round(w.prevailingFromDeg!)).toBe(270);
    expect(w.constancy).toBeCloseTo(1);
  });
  it('opposite winds cancel, giving low constancy', () => {
    const w = prevailingWind([10, 10], [90, 270], P);
    expect(w.constancy!).toBeLessThan(0.01);
  });
  it('handles wrap-around at north (350 and 10 average to ~0)', () => {
    const w = prevailingWind([5, 5], [350, 10], P);
    const d = w.prevailingFromDeg!;
    expect(Math.min(d, 360 - d)).toBeLessThan(1);
  });
  it('ignores nulls and returns nulls with no usable data', () => {
    const w = prevailingWind([null, 5], [90, null], P);
    expect(w.prevailingFromDeg).toBeNull();
    expect(w.hoursUsed).toBe(0);
  });
});

const site = (over: Partial<CandidateSite>): CandidateSite => ({
  id: 'way/1', name: null, landClass: 'greenfield', areaHa: 20, lat: 0, lng: 0, distanceKm: 8, bearingDeg: 270, polygon: [], usAqi: 100, pm25: 30, ...over,
});
const wind: WindStats = { prevailingFromDeg: 270, constancy: 0.6, meanSpeedKmh: 8, hoursUsed: 8000, period: P };

describe('siting scores', () => {
  it('area score saturates at the target', () => {
    expect(areaScore(10, C)).toBe(0.5);
    expect(areaScore(100, C)).toBe(1);
  });
  it('distance prefers the outskirts band and penalises the core and far sites', () => {
    expect(distanceScore(8, C)).toBe(1);
    expect(distanceScore(1, C)).toBeCloseTo(1 / 3);
    expect(distanceScore(30, C)).toBe(0);
    expect(distanceScore(22.5, C)).toBeCloseTo(0.5);
  });
  it('upwind: 1 directly upwind, 0 directly downwind, null if wind is variable or missing', () => {
    expect(upwindScore(270, wind, C)).toBeCloseTo(1);
    expect(upwindScore(90, wind, C)).toBeCloseTo(0);
    expect(upwindScore(0, { ...wind, constancy: 0.05 }, C)).toBeNull();
    expect(upwindScore(0, null, C)).toBeNull();
  });
  it('air score is null without AQI', () => {
    expect(airScore(null, C)).toBeNull();
    expect(airScore(75, C)).toBeCloseTo(0.5);
  });
});

describe('rankSites / coverage', () => {
  it('ranks a big outskirts upwind site above a tiny city-core downwind one', () => {
    const good = site({ id: 'way/1' });
    const bad = site({ id: 'way/2', areaHa: 1, distanceKm: 0.5, bearingDeg: 90 });
    const r = rankSites([bad, good], wind);
    expect(r[0].id).toBe('way/1');
    expect(r[0].score).toBeGreaterThan(r[1].score);
  });
  it('drops unavailable factors and says so, instead of inventing values', () => {
    const r = rankSites([site({ usAqi: null })], null)[0];
    expect(r.components.map((c) => c.id)).toEqual(['area', 'distance']);
    expect(r.omitted).toHaveLength(2);
    expect(r.score).toBeGreaterThan(0);
  });
  it('reports how many top sites are needed, or null if land is insufficient', () => {
    const r = rankSites([site({ id: 'a', areaHa: 30 }), site({ id: 'b', areaHa: 30 })], wind);
    expect(coverage(r, 40).sitesNeeded).toBe(2);
    expect(coverage(r, 500).sitesNeeded).toBeNull();
    expect(coverage(r, 500).availableHa).toBe(60);
  });
});

import { allocatePlanting } from '@/lib/siting';
describe('allocatePlanting', () => {
  const ranked = rankSites([site({ id: 'a', areaHa: 30 }), site({ id: 'b', areaHa: 30 }), site({ id: 'c', areaHa: 30 })], wind);
  it('fills the best sites first and splits the last one', () => {
    const p = allocatePlanting(ranked, 45, 800);
    expect(p.allocations).toHaveLength(2);
    expect(p.allocations[0].hectares).toBe(30);
    expect(p.allocations[1].hectares).toBe(15);
    expect(p.allocations[1].trees).toBe(12000);
    expect(p.shortfallHa).toBe(0);
  });
  it('reports a shortfall when land is insufficient', () => {
    const p = allocatePlanting(ranked, 100, 800);
    expect(p.allocations).toHaveLength(3);
    expect(p.shortfallHa).toBeCloseTo(10);
  });
  it('returns no plan without a requirement', () => {
    expect(allocatePlanting(ranked, null, 800).allocations).toEqual([]);
  });
});
