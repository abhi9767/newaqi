'use client';

import dynamic from 'next/dynamic';
import { afforestationNeed, estimateEmissions, METHODS, NEPAL_PER_CAPITA_SOURCES, SEQUESTRATION_SCENARIOS } from '@/lib/emissions';
import { fmt, fmtInt } from '@/lib/format';
import { Card, Tag } from './Badge';
import type { Place } from './PlaceSearch';

const OffsetChart = dynamic(() => import('./OffsetChart'), { ssr: false, loading: () => <p className="text-sm text-slate-600">Loading chart…</p> });

export interface EmissionInputs {
  population: string;
  source: string; // source id or 'custom'
  customPerCapita: string;
  offsetPct: number;
  scenario: 'conservative' | 'typical' | 'optimistic';
  survivalPct: number;
  treesPerHa: number;
}

export const DEFAULT_INPUTS: EmissionInputs = { population: '', source: 'edgar', customPerCapita: '', offsetPct: 10, scenario: 'typical', survivalPct: 80, treesPerHa: 800 };

export function perCapitaOf(i: EmissionInputs): number {
  if (i.source === 'custom') return Number(i.customPerCapita);
  return NEPAL_PER_CAPITA_SOURCES.find((s) => s.id === i.source)?.tco2PerPerson ?? NaN;
}

export function computeAll(i: EmissionInputs) {
  const est = estimateEmissions({ population: Number(i.population), tco2PerPerson: perCapitaOf(i) });
  const sc = SEQUESTRATION_SCENARIOS.find((s) => s.id === i.scenario)!;
  const need = est
    ? afforestationNeed({ annualTco2: est.annualTco2, offsetShare: i.offsetPct / 100, kgCo2PerTreePerYear: sc.kgCo2PerTreePerYear, survival: i.survivalPct / 100, treesPerHectare: i.treesPerHa })
    : null;
  return { est, need, sc };
}

interface Props {
  place: Place;
  inputs: EmissionInputs;
  set: (patch: Partial<EmissionInputs>) => void;
  presetNote: string | null;
  areaKm2: number | null;
}

export default function EmissionsSection({ place, inputs, set, presetNote, areaKm2 }: Props) {
  const { est, need, sc } = computeAll(inputs);
  const nonNepal = place.countryCode !== null && place.countryCode !== 'NP';
  const areaShare = need && areaKm2 ? (need.hectares / 100 / areaKm2) * 100 : null;

  return (
    <div className="space-y-4">
      <div role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-300">
        <strong>This is an estimate, not a measurement.</strong> No official city-level CO₂ inventory exists for {place.name}. The figure below multiplies population by a
        national per-person average, so it ignores local traffic, industry, brick kilns, biomass burning, non-CO₂ gases and land-use emissions.
      </div>

      <Card title={`1. Estimated annual CO₂ of ${place.name}`} right={<Tag tone="amber">Top-down estimate</Tag>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="pop" className="block text-sm font-medium">Population</label>
            <input id="pop" inputMode="numeric" value={inputs.population} onChange={(e) => set({ population: e.target.value.replace(/[^\d]/g, '') })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Enter population" />
            <p className="mt-1 text-xs text-slate-600">{presetNote ?? 'Enter the population of the area you are analysing.'}</p>
          </div>
          <div>
            <label htmlFor="src" className="block text-sm font-medium">CO₂ per person per year</label>
            <select id="src" value={inputs.source} onChange={(e) => set({ source: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {NEPAL_PER_CAPITA_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.tco2PerPerson} t · Nepal, {s.label}</option>)}
              <option value="custom">Custom value</option>
            </select>
            {inputs.source === 'custom' && (
              <input aria-label="Custom tonnes CO2 per person per year" inputMode="decimal" value={inputs.customPerCapita} onChange={(e) => set({ customPerCapita: e.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="t CO₂ per person per year" />
            )}
            {nonNepal && <p className="mt-1 text-xs text-red-700">The listed values are for Nepal. Choose “Custom” and enter your country&apos;s per-person figure.</p>}
          </div>
        </div>

        {est ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-700">Estimated annual fossil CO₂</p>
            <p className="text-3xl font-bold text-slate-900">{fmtInt(est.annualTco2)} <span className="text-lg font-medium">tonnes / year</span></p>
            <p className="mt-1 text-xs text-slate-600">{est.basis}</p>
            {inputs.source !== 'custom' && (
              <p className="mt-1 text-xs text-slate-600">
                Source: <a className="underline" href={NEPAL_PER_CAPITA_SOURCES.find((s) => s.id === inputs.source)?.url} target="_blank" rel="noopener noreferrer">{NEPAL_PER_CAPITA_SOURCES.find((s) => s.id === inputs.source)?.label}</a>. The two published Nepal figures differ (0.50 vs 0.63 t), which shows the uncertainty.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-medium">Insufficient data for an estimate: enter a population and a per-person value above 0.</p>
        )}
      </Card>

      <Card title="2. How much afforestation would offset it?" right={<Tag tone="amber">Planning estimate</Tag>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="off" className="block text-sm font-medium">Share of annual emissions to offset: {inputs.offsetPct}%</label>
            <input id="off" type="range" min={1} max={100} value={inputs.offsetPct} onChange={(e) => set({ offsetPct: Number(e.target.value) })} className="w-full" />
          </div>
          <div>
            <label htmlFor="scn" className="block text-sm font-medium">Tree CO₂ uptake assumption</label>
            <select id="scn" value={inputs.scenario} onChange={(e) => set({ scenario: e.target.value as EmissionInputs['scenario'] })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {SEQUESTRATION_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}: {s.kgCo2PerTreePerYear} kg CO₂/tree/year</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-600">{sc.basis}</p>
          </div>
          <div>
            <label htmlFor="surv" className="block text-sm font-medium">Expected survival of planted trees: {inputs.survivalPct}%</label>
            <input id="surv" type="range" min={30} max={100} value={inputs.survivalPct} onChange={(e) => set({ survivalPct: Number(e.target.value) })} className="w-full" />
            <p className="text-xs text-slate-600">Your assumption, not a measured value. Adjust to local conditions.</p>
          </div>
          <div>
            <label htmlFor="den" className="block text-sm font-medium">Planting density: {inputs.treesPerHa} trees/ha</label>
            <input id="den" type="range" min={400} max={1600} step={100} value={inputs.treesPerHa} onChange={(e) => set({ treesPerHa: Number(e.target.value) })} className="w-full" />
            <p className="text-xs text-slate-600">800/ha matches the reforestation study cited above; about 1,100/ha is a 3 m x 3 m grid.</p>
          </div>
        </div>

        {need ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-900">CO₂ to offset per year</p><p className="text-xl font-bold">{fmtInt(need.tco2ToOffsetPerYear)} t</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-900">Trees to plant</p><p className="text-xl font-bold">{fmtInt(need.treesToPlant)}</p></div>
            <div className="rounded-lg bg-emerald-50 p-3"><p className="text-xs text-emerald-900">Land needed</p><p className="text-xl font-bold">{fmtInt(need.hectares)} ha</p><p className="text-xs text-emerald-900">{fmt(need.hectares / 100)} km²{areaShare !== null ? ` · ${fmt(areaShare)}% of the municipality's area` : ''}</p></div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-medium">Insufficient data for an afforestation requirement.</p>
        )}
        <p className="mt-3 text-xs text-slate-600">
          Uptake figures apply to <em>established</em> trees; young saplings absorb far less in their first years, so real offsetting is slower. Trees also store carbon rather than erase it, and
          only if they are protected for decades. Afforestation complements, and does not replace, cutting emissions.
        </p>

        {est && <div className="mt-4"><h3 className="mb-1 text-sm font-semibold">Land needed vs share offset (all three uptake assumptions)</h3><OffsetChart annualTco2={est.annualTco2} survival={inputs.survivalPct / 100} treesPerHa={inputs.treesPerHa} /></div>}
      </Card>

      <Card title="3. Afforestation methods to combine">
        <ul className="grid gap-3 md:grid-cols-2">
          {METHODS.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{m.title}</p>
              <p className="mt-1 text-slate-700">{m.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-600">General practice guidance only. No method-specific carbon rates are claimed. Switch to the “Where to plant” tab to see which methods suit real land parcels nearby.</p>
      </Card>
    </div>
  );
}
