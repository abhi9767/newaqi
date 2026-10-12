'use client';

import { useState } from 'react';
import { isValidCoord } from '@/lib/geo';
import type { ApiEnvelope, GeocodeResult } from '@/lib/types';

export interface Place {
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  population: number | null;
}

export default function PlaceSearch({ onPick }: { onPick: (p: Place) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [coordErr, setCoordErr] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
      const body = (await res.json()) as ApiEnvelope<GeocodeResult[]>;
      if (!res.ok || !body.data) throw new Error(body.error ?? 'Search service unavailable');
      setResults(body.data);
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2" role="search">
        <label htmlFor="place" className="sr-only">Search a city or town</label>
        <input id="place" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search another city (e.g. Pokhara, Delhi)" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" autoComplete="off" />
        <button type="submit" disabled={busy || q.trim().length < 2} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-700">Place search unavailable: {error}. You can enter coordinates instead.</p>}
      {results && results.length === 0 && <p className="text-sm text-slate-600">No places found for “{q}”.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm" aria-label="Search results">
          {results.map((r) => {
            const sub = [r.admin2, r.admin1, r.country].filter(Boolean).join(', ');
            return (
              <li key={r.id}>
                <button type="button" className="w-full px-3 py-2 text-left hover:bg-emerald-50" onClick={() => { onPick({ name: r.name, lat: r.latitude, lng: r.longitude, countryCode: r.countryCode, population: r.population }); setResults(null); }}>
                  <span className="font-medium">{r.name}</span>
                  {sub && <span className="text-slate-600"> · {sub}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const a = Number(lat), b = Number(lng);
          if (!lat.trim() || !lng.trim() || !isValidCoord(a, b)) { setCoordErr('Enter a valid latitude (-90..90) and longitude (-180..180).'); return; }
          setCoordErr(null);
          onPick({ name: `${a.toFixed(4)}, ${b.toFixed(4)}`, lat: a, lng: b, countryCode: null, population: null });
        }}
      >
        <div><label htmlFor="lat" className="block text-xs text-slate-600">Latitude</label><input id="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
        <div><label htmlFor="lng" className="block text-xs text-slate-600">Longitude</label><input id="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
        <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Use coordinates</button>
        {coordErr && <p role="alert" className="basis-full text-sm text-red-700">{coordErr}</p>}
      </form>
    </div>
  );
}
