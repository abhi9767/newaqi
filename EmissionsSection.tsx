'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AirHistoryPoint } from '@/lib/types';

export default function AirChart({ history }: { history: AirHistoryPoint[] }) {
  const rows = history.map((h) => ({ t: h.time, label: h.time.slice(5, 13).replace('T', ' '), aqi: h.usAqi }));
  return (
    <div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={48} />
            <YAxis tick={{ fontSize: 11 }} width={40} />
            <Tooltip labelFormatter={(l) => `${l}h local`} formatter={(v) => [typeof v === 'number' ? Math.round(v) : 'no data', 'US AQI (modelled)']} />
            <ReferenceLine y={100} stroke="#ea580c" strokeDasharray="4 4" label={{ value: '100: unhealthy for sensitive groups', fontSize: 10, fill: '#9a3412', position: 'insideTopLeft' }} />
            <Line type="monotone" dataKey="aqi" stroke="#047857" dot={false} strokeWidth={2} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Hourly modelled US AQI, past 5 days</caption>
        <thead><tr><th>Time</th><th>US AQI</th></tr></thead>
        <tbody>{rows.filter((_, i) => i % 6 === 0).map((r) => <tr key={r.t}><td>{r.t}</td><td>{r.aqi ?? 'no data'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
