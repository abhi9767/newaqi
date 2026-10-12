'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { afforestationNeed, SEQUESTRATION_SCENARIOS } from '@/lib/emissions';
import { fmtInt } from '@/lib/format';

const COLORS = { conservative: '#b45309', typical: '#047857', optimistic: '#2563eb' } as const;

export default function OffsetChart({ annualTco2, survival, treesPerHa }: { annualTco2: number; survival: number; treesPerHa: number }) {
  const rows = Array.from({ length: 11 }, (_, i) => {
    const share = i / 10;
    const row: Record<string, number> = { share: i * 10 };
    for (const s of SEQUESTRATION_SCENARIOS) {
      row[s.id] = afforestationNeed({ annualTco2, offsetShare: share, kgCo2PerTreePerYear: s.kgCo2PerTreePerYear, survival, treesPerHectare: treesPerHa })?.hectares ?? 0;
    }
    return row;
  });
  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="share" unit="%" tick={{ fontSize: 11 }} label={{ value: 'Share of annual emissions offset', position: 'insideBottom', offset: -8, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(v: number) => fmtInt(v)} unit=" ha" />
            <Tooltip formatter={(v) => `${fmtInt(Number(v))} ha`} labelFormatter={(l) => `${l}% offset`} />
            <Legend verticalAlign="top" height={28} />
            {SEQUESTRATION_SCENARIOS.map((s) => (
              <Line key={s.id} type="monotone" dataKey={s.id} name={`${s.label} (${s.kgCo2PerTreePerYear} kg/tree/yr)`} stroke={COLORS[s.id]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Hectares of planting needed by offset share and sequestration scenario</caption>
        <thead><tr><th>Offset %</th>{SEQUESTRATION_SCENARIOS.map((s) => <th key={s.id}>{s.label} (ha)</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.share}><td>{r.share}</td>{SEQUESTRATION_SCENARIOS.map((s) => <td key={s.id}>{Math.round(r[s.id])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
