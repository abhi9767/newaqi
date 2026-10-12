import { NextResponse } from 'next/server';
import { isValidCoord } from '@/lib/geo';
import { fetchJson, UpstreamError } from '@/lib/http';
import { normalizeWind } from '@/lib/normalize';
import type { ApiEnvelope, SourceMeta, WindStats } from '@/lib/types';

export const runtime = 'nodejs';
const BASE = process.env.OPEN_METEO_ARCHIVE_URL ?? 'https://archive-api.open-meteo.com/v1/archive';
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const src = (status: SourceMeta['status'], message?: string): SourceMeta => ({
    name: 'Open-Meteo Historical Weather API (reanalysis)', url: 'https://open-meteo.com/en/docs/historical-weather-api', status, fetchedAt: new Date().toISOString(), message,
  });
  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ sources: [src('unavailable', 'Invalid coordinates')], data: null, error: 'Invalid coordinates' }, { status: 400 });
  }
  // The archive lags real time by several days: use the 365 days ending 8 days ago.
  const end = new Date(Date.now() - 8 * 864e5);
  const start = new Date(end.getTime() - 364 * 864e5);
  const period = { start: day(start), end: day(end) };
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lng.toFixed(4), start_date: period.start, end_date: period.end,
      hourly: 'wind_speed_10m,wind_direction_10m', timezone: 'UTC',
    });
    const data = normalizeWind(await fetchJson(`${BASE}?${params}`, { revalidate: 86400, timeout: 25000 }), period);
    return NextResponse.json({ sources: [src('ok')], data } satisfies ApiEnvelope<WindStats>, {
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    });
  } catch (e) {
    const message = e instanceof UpstreamError ? e.message : 'Wind service returned an unexpected structure.';
    return NextResponse.json({ sources: [src('unavailable', message)], data: null, error: message }, { status: 502 });
  }
}
