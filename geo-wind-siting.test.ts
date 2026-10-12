import { NextResponse } from 'next/server';
import { isValidCoord } from '@/lib/geo';
import { cacheGet, cacheSet, fetchJson, overpassTimeoutMs, UpstreamError } from '@/lib/http';
import { normalizeAir, normalizeOverpass } from '@/lib/normalize';
import type { ApiEnvelope, LandData, SourceMeta } from '@/lib/types';

export const runtime = 'nodejs';
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const AIR = process.env.OPEN_METEO_AIR_QUALITY_URL ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';
const MAX_SITES = 60;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const radiusKm = Math.max(3, Math.min(30, Number(sp.get('radiusKm')) || 15));
  const minAreaHa = Math.max(0.1, Math.min(50, Number(sp.get('minAreaHa')) || 0.5));
  const now = new Date().toISOString();
  const osm = (status: SourceMeta['status'], message?: string): SourceMeta => ({
    name: 'OpenStreetMap via Overpass API (land-use polygons, ODbL)', url: 'https://www.openstreetmap.org/copyright', status, fetchedAt: now, message,
  });
  const aq = (status: SourceMeta['status'], message?: string): SourceMeta => ({
    name: 'Open-Meteo Air Quality API (CAMS model), per-site', url: 'https://open-meteo.com/en/docs/air-quality-api', status, fetchedAt: now, message,
  });
  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ sources: [osm('unavailable', 'Invalid coordinates')], data: null, error: 'Invalid coordinates' }, { status: 400 });
  }

  const query = `[out:json][timeout:25];(way["landuse"~"^(grass|meadow|brownfield|greenfield)$"](around:${radiusKm * 1000},${lat.toFixed(5)},${lng.toFixed(5)});way["natural"~"^(scrub|grassland|heath)$"](around:${radiusKm * 1000},${lat.toFixed(5)},${lng.toFixed(5)}););out tags geom 3000;`;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)},${radiusKm}`;

  let raw = cacheGet<unknown>(key, 30 * 60 * 1000);
  try {
    if (!raw) {
      raw = await fetchJson(OVERPASS, {
        method: 'POST', body: `data=${encodeURIComponent(query)}`, contentType: 'application/x-www-form-urlencoded', timeout: overpassTimeoutMs(),
      });
      cacheSet(key, raw);
    }
  } catch (e) {
    const message = e instanceof UpstreamError ? e.message : 'Overpass failed';
    return NextResponse.json({ sources: [osm('unavailable', message), aq('skipped')], data: null, error: message }, { status: 502 });
  }

  let n;
  try {
    n = normalizeOverpass(raw, { lat, lng }, { minAreaHa, max: MAX_SITES });
  } catch {
    const message = 'Overpass returned data in an unexpected structure.';
    return NextResponse.json({ sources: [osm('unavailable', message), aq('skipped')], data: null, error: message }, { status: 502 });
  }

  // Per-site modelled air quality (one batched request). Failure here is non-fatal.
  let aqSource = aq('skipped', 'No candidate sites');
  if (n.sites.length) {
    try {
      const params = new URLSearchParams({
        latitude: n.sites.map((s) => s.lat.toFixed(4)).join(','),
        longitude: n.sites.map((s) => s.lng.toFixed(4)).join(','),
        current: 'us_aqi,pm2_5', timezone: 'auto',
      });
      const pts = normalizeAir(await fetchJson(`${AIR}?${params}`, { revalidate: 1800, timeout: 20000 }));
      if (pts.length === n.sites.length) {
        n.sites.forEach((s, i) => {
          s.usAqi = pts[i].point.usAqi;
          s.pm25 = pts[i].point.pm25;
        });
        aqSource = aq('ok');
      } else {
        aqSource = aq('unavailable', `Expected ${n.sites.length} locations, received ${pts.length}`);
      }
    } catch (e) {
      aqSource = aq('unavailable', e instanceof UpstreamError ? e.message : 'Unexpected air-quality structure');
    }
  }

  const data: LandData = {
    centre: { lat, lng }, radiusKm, minAreaHa, sites: n.sites,
    totalPolygonsSeen: n.totalWays, closedWaysUsed: n.closedUsed, skippedRelations: true,
    truncatedTo: n.truncated ? MAX_SITES : null,
  };
  return NextResponse.json({ sources: [osm('ok'), aqSource], data } satisfies ApiEnvelope<LandData>, {
    headers: { 'Cache-Control': 'public, s-maxage=1800' },
  });
}
