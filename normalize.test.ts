import { NextResponse } from 'next/server';
import { fetchJson, UpstreamError } from '@/lib/http';
import { normalizeGeocode } from '@/lib/normalize';
import type { ApiEnvelope, GeocodeResult, SourceMeta } from '@/lib/types';

export const runtime = 'nodejs';
const BASE = process.env.OPEN_METEO_GEOCODING_URL ?? 'https://geocoding-api.open-meteo.com/v1/search';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  const src = (status: SourceMeta['status'], message?: string): SourceMeta => ({
    name: 'Open-Meteo Geocoding API', url: 'https://open-meteo.com/en/docs/geocoding-api', status, fetchedAt: new Date().toISOString(), message,
  });
  if (q.length < 2) return NextResponse.json({ sources: [src('skipped')], data: [] } satisfies ApiEnvelope<GeocodeResult[]>);
  try {
    const params = new URLSearchParams({ name: q, count: '10', language: 'en', format: 'json' });
    const data = normalizeGeocode(await fetchJson(`${BASE}?${params}`, { revalidate: 86400 }));
    return NextResponse.json({ sources: [src('ok')], data } satisfies ApiEnvelope<GeocodeResult[]>);
  } catch (e) {
    const message = e instanceof UpstreamError ? e.message : 'Geocoder returned an unexpected structure.';
    return NextResponse.json({ sources: [src('unavailable', message)], data: null, error: message }, { status: 502 });
  }
}
