'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { METHODS } from '@/lib/emissions';
import { fmt, fmtInt } from '@/lib/format';
import { compass } from '@/lib/geo';
import { allocatePlanting, aqiCategory, coverage, DEFAULT_SITING_CONFIG, rankSites } from '@/lib/siting';
import type { AirSummary, ApiEnvelope, LandData, SourceMeta, WindStats } from '@/lib/types';
import { Card, ErrorBox, Tag } from './Badge';
import type { Place } from './PlaceSearch';

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-600">Loading map…</div> });
const AirChart = dynamic(() => import('./AirChart'), { ssr: false, loading: () => <p className="text-sm text-slate-600">Loading chart…</p> });

interface Loaded<T> { state: 'idle' | 'loading' | 'ok' | 'error'; data: T | null; sources: SourceMeta[]; error: string | null }
const empty = <T,>(): Loaded<T> => ({ state: 'idle', data: null, sources: [], error: null });

async function load<T>(url: string, signal: AbortSignal): Promise<Loaded<T>> {
  try {
    const res = await fetch(url, { signal });
    const body = (await res.json()) as ApiEnvelope<T>;
    if (!res.ok || !body.data) return { state: 'error', data: null, sources: body.sources ?? [], error: body.error ?? `HTTP ${res.status}` };
    return { state: 'ok', data: body.data, sources: body.sources, error: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { state: 'error', data: null, sources: [], error: 'Could not reach the CarbonCanopy server.' };
  }
}

interface Props {
  place: Place;
  requiredHa: number | null;
  treesPerHa: number;
  onSources: (s: SourceMeta[]) => void;
}

export default function SitesSection({ place, requiredHa, treesPerHa, onSources }: Props) {
  const [radiusKm, setRadiusKm] = useState(15);
  const [minAreaHa, setMinAreaHa] = useState(1);
  const [air, setAir] = useState<Loaded<AirSummary>>(empty());
  const [wind, setWind] = useState<Loaded<WindStats>>(empty());
  const [land, setLand] = useState<Loaded<LandData>>(empty());
  const [run, setRun] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setAir((a) => ({ ...a, state: 'loading' }));
    setWind((w) => ({ ...w, state: 'loading' }));
    load<AirSummary>(`/api/air?lat=${place.lat}&lng=${place.lng}`, ac.signal).then(setAir).catch(() => undefined);
    load<WindStats>(`/api/wind?lat=${place.lat}&lng=${place.lng}`, ac.signal).then(setWind).catch(() => undefined);
    return () => ac.abort();
  }, [place.lat, place.lng, run]);

  useEffect(() => {
    const ac = new AbortController();
    setLand((l) => ({ ...l, state: 'loading' }));
    setSelected(null);
    load<LandData>(`/api/land?lat=${place.lat}&lng=${place.lng}&radiusKm=${radiusKm}&minAreaHa=${minAreaHa}`, ac.signal).then(setLand).catch(() => undefined);
    return () => ac.abort();
  }, [place.lat, place.lng, radiusKm, minAreaHa, run]);

  useEffect(() => {
    onSources([...air.sources, ...wind.sources, ...land.sources]);
  }, [air.sources, wind.sources, land.sources, onSources]);

  const ranked = useMemo(() => (land.data ? rankSites(land.data.sites, wind.data) : []), [land.data, wind.data]);
  const cov = useMemo(() => (requiredHa ? coverage(ranked, requiredHa) : null), [ranked, requiredHa]);
  const plan = useMemo(() => allocatePlanting(ranked, requiredHa, treesPerHa), [ranked, requiredHa, treesPerHa]);
  const allocMap = useMemo(() => Object.fromEntries(plan.allocations.map((a) => [a.siteId, a])), [plan]);
  const cfg = DEFAULT_SITING_CONFIG;
  const retry = useCallback(() => setRun((n) => n + 1), []);
  const a = air.data?.current;
  const cat = aqiCategory(a?.usAqi ?? null);
  const top = ranked.slice(0, Math.max(10, plan.allocations.length));

  return (
    <div className="space-y-4">
      <div role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-300">
        <strong>Screening tool, not a planting plan.</strong> Sites come from OpenStreetMap land-use polygons, which can be incomplete or outdated, especially in rural Nepal. Ownership, legal status, soil, water,
        existing ecology and community use must be checked on the ground before any planting.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Air quality at ${place.name}`} right={<Tag tone="sky">Model, not a monitor</Tag>}>
          {air.state === 'loading' && !air.data && <p className="text-sm text-slate-600">Loading air quality…</p>}
          {air.state === 'error' && <ErrorBox message={`Air-quality data is unavailable: ${air.error}`} onRetry={retry} />}
          {air.data && a && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-3xl font-bold">{a.usAqi !== null ? Math.round(a.usAqi) : '—'}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${cat.cls}`}>{cat.label}</span>
                <span className="text-sm text-slate-700">PM2.5 {fmt(a.pm25)} µg/m³ · NO₂ {fmt(a.no2)} µg/m³</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">Current model value{a.time ? ` (${a.time.replace('T', ' ')} local)` : ''}. US AQI scale.</p>
              <p className="mt-2 text-sm">
                Past 5 days: mean US AQI <strong>{fmt(air.data.meanUsAqi, 0)}</strong>, peak <strong>{fmt(air.data.maxUsAqi, 0)}</strong>,{' '}
                <strong>{air.data.shareHoursAbove100 !== null ? fmt(air.data.shareHoursAbove100 * 100, 0) : '—'}%</strong> of hours above 100 ({air.data.hoursWithData} hours of data).
              </p>
              {air.data.history.length > 0 ? <div className="mt-2"><AirChart history={air.data.history} /></div> : <p className="mt-2 text-sm text-slate-600">No hourly history returned.</p>}
              <p className="mt-1 text-xs text-slate-600">Data from the CAMS atmospheric model via Open-Meteo. Its grid is tens of kilometres wide in much of the world, so nearby sites often share the same value. It is not a ground-station reading.</p>
            </>
          )}
        </Card>

        <Card title="Prevailing wind (past year)" right={<Tag tone="sky">Reanalysis</Tag>}>
          {wind.state === 'loading' && !wind.data && <p className="text-sm text-slate-600">Loading wind…</p>}
          {wind.state === 'error' && <ErrorBox message={`Wind data is unavailable: ${wind.error}. Ranking continues without the wind factor.`} onRetry={retry} />}
          {wind.data && (
            wind.data.prevailingFromDeg !== null && wind.data.constancy !== null ? (
              <>
                <p className="text-2xl font-bold">from the {compass(wind.data.prevailingFromDeg)} <span className="text-base font-medium">({Math.round(wind.data.prevailingFromDeg)}°)</span></p>
                <p className="mt-1 text-sm">Directional steadiness {fmt(wind.data.constancy, 2)} (0 = no preferred direction, 1 = always the same). Mean speed {fmt(wind.data.meanSpeedKmh)} km/h.</p>
                <p className="mt-2 text-sm text-slate-700">
                  {wind.data.constancy >= cfg.minWindConstancy
                    ? 'The wind is steady enough to be used: sites lying upwind of the centre get a small bonus, because trees there can filter air before it reaches the city.'
                    : `The prevailing direction is weaker than ${cfg.minWindConstancy}, so the wind factor is switched off in the ranking.`}
                </p>
                <p className="mt-1 text-xs text-slate-600">Hourly 10 m wind, {wind.data.period.start} to {wind.data.period.end} ({wind.data.hoursUsed.toLocaleString('en-US')} hours). Annual average only; direction changes by season.</p>
              </>
            ) : <p className="text-sm font-medium">Insufficient wind data for a prevailing direction.</p>
          )}
        </Card>
      </div>

      <Card title="Candidate planting sites on the outskirts" right={<StatusTag s={land.state} />}>
        <div className="mb-3 flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col">Search radius: {radiusKm} km
            <input type="range" min={5} max={30} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} aria-label="Search radius in kilometres" />
          </label>
          <label className="flex flex-col">Minimum parcel size: {minAreaHa} ha
            <input type="range" min={0.5} max={10} step={0.5} value={minAreaHa} onChange={(e) => setMinAreaHa(Number(e.target.value))} aria-label="Minimum parcel size in hectares" />
          </label>
          <button onClick={retry} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Refresh data</button>
        </div>

        {land.state === 'error' && <ErrorBox message={`Land-use data is unavailable: ${land.error}. No sites can be suggested without it.`} onRetry={retry} />}
        {land.state === 'loading' && !land.data && <p className="text-sm text-slate-600">Searching land-use polygons (this can take up to 30 seconds)…</p>}

        {land.data && (
          <>
            <div className="relative h-[55vh] min-h-[320px] overflow-hidden rounded-lg border border-slate-200">
              <MapView centre={land.data.centre} radiusKm={land.data.radiusKm} band={cfg.idealBandKm} sites={ranked} highlight={10} allocation={allocMap} selectedId={selected} onSelect={setSelected} />
              <div className="absolute bottom-2 left-2 z-[1000] rounded-md bg-white/95 p-2 text-xs shadow ring-1 ring-slate-300" aria-label="Map legend">
                <p className="font-semibold">Legend</p>
                <p><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-600 align-middle" />City centre</p>
                <p><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-700 align-middle" />{plan.allocations.length ? 'Plant here (numbered by rank)' : 'Top 10 ranked sites'}</p>
                <p><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-300 align-middle" />Other open land, not needed</p>
                <p className="text-slate-600">Dashed rings: preferred {cfg.idealBandKm.min}-{cfg.idealBandKm.max} km band</p>
              </div>
            </div>

            {ranked.length === 0 ? (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">No qualifying open-land polygons found within {land.data.radiusKm} km at {land.data.minAreaHa} ha or larger. This may reflect sparse OpenStreetMap coverage rather than a lack of land. Try a larger radius or smaller minimum size.</p>
            ) : (
              <>
                {requiredHa !== null && cov ? (
                  <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">
                    Your offset target needs about <strong>{fmtInt(requiredHa)} ha</strong>. The {ranked.length} candidate parcels found total <strong>{fmtInt(cov.availableHa)} ha</strong>
                    {cov.sitesNeeded !== null ? <>; the top <strong>{cov.sitesNeeded}</strong> ranked sites would cover the requirement.</> : <>, which is <strong>not enough</strong> to meet the target. Lower the offset share on the first tab, or combine this with emission cuts and other methods.</>}
                  </p>
                ) : (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">Enter a population on the first tab to compare available land with your offset target.</p>
                )}

                {plan.allocations.length > 0 && (
                  <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
                    <p className="font-semibold">Planting plan: {plan.allocations.reduce((t, a) => t + a.trees, 0).toLocaleString('en-US')} trees on {fmt(plan.plannedHa)} ha across {plan.allocations.length} site{plan.allocations.length === 1 ? '' : 's'}</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                      {plan.allocations.map((a) => {
                        const s = ranked[a.rank - 1];
                        return (
                          <li key={a.siteId}>
                            <button className="underline decoration-dotted" onClick={() => setSelected(a.siteId)}>#{a.rank} {s.name ?? `Unnamed ${s.landClass}`}</button>
                            {': '}{a.trees.toLocaleString('en-US')} trees on {fmt(a.hectares)} ha, {fmt(s.distanceKm)} km {compass(s.bearingDeg)} of the centre ({s.lat.toFixed(4)}, {s.lng.toFixed(4)})
                          </li>
                        );
                      })}
                    </ol>
                    {plan.shortfallHa > 0 && <p className="mt-1 text-red-800">Shortfall: {fmt(plan.shortfallHa)} ha cannot be placed on the open land found. Lower the offset share or widen the search.</p>}
                  </div>
                )}

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <caption className="sr-only">Top ranked candidate planting sites</caption>
                    <thead className="border-b border-slate-200 text-xs text-slate-600">
                      <tr><th className="py-1 pr-2">#</th><th className="pr-2">Site</th><th className="pr-2">Score</th><th className="pr-2">Area</th><th className="pr-2">Distance</th><th className="pr-2">Direction</th><th className="pr-2">US AQI</th><th className="pr-2">Plant</th></tr>
                    </thead>
                    <tbody>
                      {top.map((s, i) => (
                        <tr key={s.id} className={`border-b border-slate-100 align-top ${s.id === selected ? 'bg-emerald-50' : ''}`}>
                          <td className="py-1.5 pr-2 font-semibold">{i + 1}</td>
                          <td className="pr-2">
                            <button className="text-left underline decoration-dotted" onClick={() => setSelected(s.id)}>{s.name ?? `Unnamed ${s.landClass}`}</button>
                            <details className="text-xs text-slate-700">
                              <summary className="cursor-pointer">Why this score</summary>
                              <ul className="mt-1 space-y-0.5">
                                {s.components.map((c) => <li key={c.id}>{c.label}: {(c.score * 100).toFixed(0)}% (weight {c.weight}) · {c.detail}</li>)}
                                {s.omitted.map((o) => <li key={o} className="text-amber-800">{o}</li>)}
                                <li>OSM class <em>{s.landClass}</em>. Suggested approach: {METHODS.filter((m) => m.landClasses.includes(s.landClass)).map((m) => m.title).join('; ') || 'site-specific assessment'}.</li>
                                <li><a className="text-emerald-800 underline" href={`https://www.openstreetmap.org/${s.id}`} target="_blank" rel="noopener noreferrer">View parcel on OpenStreetMap</a></li>
                              </ul>
                            </details>
                          </td>
                          <td className="pr-2 font-semibold tabular-nums">{s.score.toFixed(0)}</td>
                          <td className="pr-2 tabular-nums">{fmt(s.areaHa)} ha</td>
                          <td className="pr-2 tabular-nums">{fmt(s.distanceKm)} km</td>
                          <td className="pr-2">{compass(s.bearingDeg)}</td>
                          <td className="pr-2 tabular-nums">{s.usAqi !== null ? Math.round(s.usAqi) : '—'}</td>
                          <td className="pr-2 tabular-nums">{allocMap[s.id] ? `${allocMap[s.id].trees.toLocaleString('en-US')} trees` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="mt-3 text-xs text-slate-600">
              Coverage: {land.data.closedWaysUsed} closed land-use polygons read ({land.data.totalPolygonsSeen} returned); large multipolygon relations are not included, so big parcels may be missing.
              {land.data.truncatedTo !== null && ` Only the ${land.data.truncatedTo} largest qualifying parcels are ranked.`} Parcel areas are computed from OSM geometry. Score = weighted blend of land
              size ({cfg.weights.area}), outskirts position ({cfg.weights.distance}), upwind position ({cfg.weights.upwind}) and modelled air quality ({cfg.weights.airQuality}); unavailable factors are dropped and
              the rest re-weighted. Weights live in <code>lib/siting.ts</code>. Farmland is deliberately excluded to avoid competing with food production.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function StatusTag({ s }: { s: Loaded<unknown>['state'] }) {
  if (s === 'loading') return <Tag>Loading…</Tag>;
  if (s === 'error') return <Tag tone="red">Unavailable</Tag>;
  if (s === 'ok') return <Tag tone="emerald">Retrieved</Tag>;
  return null;
}
