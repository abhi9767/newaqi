import { NextResponse } from 'next/server';
import { isValidCoord } from '@/lib/geo';
import { fetchJson, UpstreamError } from '@/lib/http';
import { normalizeAir, summariseAir } from '@/lib/normalize';
import type { AirSummary, ApiEnvelope, SourceMeta } from '@/lib/types';

export const runtime = 'nodejs';
const BASE = process.env.OPEN_METEO_AIR_QUALITY_URL ?? 'https://air-quality-api.open-meteo.com/v1/air-quality';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  const src = (status: SourceMeta['status'], message?: string): SourceMeta => ({
    name: 'Open-Meteo Air Quality API (CAMS model)', url: 'https://open-meteo.com/en/docs/air-quality-api', status, fetchedAt: new Date().toISOString(), message,
  });
  if (!isValidCoord(lat, lng)) {
    return NextResponse.json({ sources: [src('unavailable', 'Invalid coordinates')], data: null, error: 'Invalid coordinates' }, { status: 400 });
  }
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lng.toFixed(4),
      current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,carbon_monoxide',
      hourly: 'us_aqi,pm2_5', past_days: '5', forecast_days: '1', timezone: 'auto',
    });
    const items = normalizeAir(await fetchJson(`${BASE}?${params}`, { revalidate: 1800 }));
    if (!items.length) throw new UpstreamError('Air-quality response contained no locations');
    return NextResponse.json({ sources: [src('ok')], data: summariseAir(items[0]) } satisfies ApiEnvelope<AirSummary>, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600' },
    });
  } catch (e) {
    const message = e instanceof UpstreamError ? e.message : 'Air-quality service returned an unexpected structure.';
    return NextResponse.json({ sources: [src('unavailable', message)], data: null, error: message }, { status: 502 });
  }
}
