'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmtInt } from '@/lib/format';
import type { ApiEnvelope, GeocodeResult, SourceMeta } from '@/lib/types';
import { Card, ErrorBox, SourceLine } from './Badge';
import EmissionsSection, { computeAll, DEFAULT_INPUTS, type EmissionInputs } from './EmissionsSection';
import PlaceSearch, { type Place } from './PlaceSearch';
import SitesSection from './SitesSection';

/** Official figures for the preset city. Source: National Population and Housing Census 2021. */
const GAINDAKOT = { population: 79349, areaKm2: 159.93, note: 'Population 79,349 and area 159.93 km² (Nepal National Population and Housing Census 2021, as republished by edusanjal.com and citypopulation.de).' };

type Tab = 'emissions' | 'sites';

export default function Dashboard() {
  const [place, setPlace] = useState<Place | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<EmissionInputs>(DEFAULT_INPUTS);
  const [tab, setTab] = useState<Tab>('emissions');
  const [siteSources, setSiteSources] = useState<SourceMeta[]>([]);
  const [boot, setBoot] = useState(0);
  const [visitedSites, setVisitedSites] = useState(false);

  const isGaindakot = !!place && /gaindakot/i.test(place.name);

  const pick = useCallback((p: Place) => {
    setPlace(p);
    const preset = /gaindakot/i.test(p.name);
    setInputs((i) => ({ ...i, population: preset ? String(GAINDAKOT.population) : p.population ? String(p.population) : '' }));
  }, []);

  // Start with Gaindakot, located by the geocoder rather than hard-coded coordinates.
  useEffect(() => {
    const ac = new AbortController();
    setPlaceError(null);
    fetch('/api/geocode?q=Gaindakot', { signal: ac.signal })
      .then((r) => r.json() as Promise<ApiEnvelope<GeocodeResult[]>>)
      .then((b) => {
        const g = b.data?.find((r) => r.countryCode === 'NP') ?? null;
        if (!g) throw new Error(b.error ?? 'Gaindakot was not found by the place search.');
        pick({ name: 'Gaindakot', lat: g.latitude, lng: g.longitude, countryCode: 'NP', population: g.population });
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setPlaceError(e instanceof Error ? e.message : 'Place search failed');
      });
    return () => ac.abort();
  }, [boot, pick]);

  const patch = useCallback((p: Partial<EmissionInputs>) => setInputs((i) => ({ ...i, ...p })), []);
  const { need } = useMemo(() => computeAll(inputs), [inputs]);
  const onSources = useCallback((s: SourceMeta[]) => setSiteSources(s), []);
  const src = (name: string) => siteSources.find((s) => s.name.startsWith(name));

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <header className="rounded-xl bg-emerald-900 p-4 text-white">
        <h1 className="text-xl font-bold sm:text-2xl">CarbonCanopy</h1>
        <p className="mt-1 text-sm text-emerald-50">Estimate a place&apos;s carbon emissions, work out how much afforestation would offset them, and find where on the outskirts to plant, using air quality, wind and land-use data.</p>
        <p className="mt-2 text-xs text-emerald-100">Starting with Gaindakot, Nepal. Any city can be searched; Nepal figures are built in and other countries need their own per-person value.</p>
      </header>

      <Card title="Place">
        {place ? (
          <p className="mb-3 text-sm"><strong>{place.name}</strong> · {place.lat.toFixed(4)}, {place.lng.toFixed(4)}{isGaindakot && ' · Gaindakot, Nawalpur, Gandaki Province'}</p>
        ) : placeError ? (
          <div className="mb-3"><ErrorBox message={`Could not locate Gaindakot automatically: ${placeError}. Search a place or enter coordinates below.`} onRetry={() => setBoot((n) => n + 1)} /></div>
        ) : (
          <p className="mb-3 text-sm text-slate-600">Locating Gaindakot…</p>
        )}
        <PlaceSearch onPick={pick} />
      </Card>

      <div role="tablist" aria-label="Tools" className="flex gap-2">
        {([['emissions', '1. Carbon emissions'], ['sites', '2. Where to plant']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} id={`tab-${id}`} aria-controls={`panel-${id}`} onClick={() => { setTab(id); if (id === 'sites') setVisitedSites(true); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === id ? 'bg-emerald-700 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {place && (
        <>
          <div role="tabpanel" id="panel-emissions" aria-labelledby="tab-emissions" hidden={tab !== 'emissions'}>
            <EmissionsSection place={place} inputs={inputs} set={patch} presetNote={isGaindakot ? GAINDAKOT.note : place.population ? 'Population suggested by the place-search service; verify it.' : null} areaKm2={isGaindakot ? GAINDAKOT.areaKm2 : null} />
          </div>
          <div role="tabpanel" id="panel-sites" aria-labelledby="tab-sites" hidden={tab !== 'sites'}>
            {/* Mount only once opened so Overpass is not hit unless wanted. */}
            {visitedSites ? <SitesSection place={place} requiredHa={need?.hectares ?? null} treesPerHa={inputs.treesPerHa} onSources={onSources} /> : null}
          </div>
        </>
      )}

      <footer className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Data sources</h2>
        <ul className="space-y-1">
          <li>Population: Nepal Census 2021 (Gaindakot preset). Per-person CO₂: <a className="text-emerald-800 underline" href="https://ourworldindata.org/profile/co2/nepal" target="_blank" rel="noopener noreferrer">Our World in Data</a> and EDGAR/IEA (JRC) national figures, 2024.</li>
          <li>Tree uptake: published ranges (about 10-40 kg CO₂ per established tree per year); the conservative case follows University of Vienna / BOKU reforestation studies.</li>
          {siteSources.length > 0 && ['Open-Meteo Air', 'Open-Meteo Historical', 'OpenStreetMap'].map((n) => <SourceLine key={n} s={src(n)} />)}
          <li>Map: © OpenStreetMap contributors.</li>
        </ul>
        {need && <p className="mt-2 text-xs">Current requirement: {fmtInt(need.treesToPlant)} trees on about {fmtInt(need.hectares)} ha.</p>}
      </footer>
    </div>
  );
}
