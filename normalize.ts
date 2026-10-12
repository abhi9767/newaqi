// Run with internet access:  npm run verify:apis
// Prints status + response structure of each real upstream so you can confirm lib/normalize.ts assumptions.
const shape = (v, d = 0) => Array.isArray(v) ? `[${v.length}] ${v.length ? shape(v[0], d + 1) : ''}` :
  v && typeof v === 'object' ? (d > 2 ? '{...}' : '{ ' + Object.entries(v).slice(0, 14).map(([k, x]) => `${k}: ${shape(x, d + 1)}`).join(', ') + ' }') : typeof v;
async function probe(name, url, init) {
  console.log(`\n=== ${name}`);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(40000), ...init });
    console.log('HTTP', r.status); console.log(shape(await r.json()));
  } catch (e) { console.log('FAILED:', e.message); }
}
const lat = 27.71, lng = 84.42; // approximate; check geocoder output for the real centre
await probe('Geocoding', 'https://geocoding-api.open-meteo.com/v1/search?name=Gaindakot&count=3');
await probe('Air quality, 2 coordinates (expects an ARRAY)', `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat},${lat + 0.1}&longitude=${lng},${lng}&current=us_aqi,pm2_5&timezone=auto`);
await probe('Air quality, 1 coordinate + hourly (expects an OBJECT)', `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10,nitrogen_dioxide,carbon_monoxide&hourly=us_aqi,pm2_5&past_days=5&forecast_days=1&timezone=auto`);
const end = new Date(Date.now() - 8 * 864e5), start = new Date(end - 30 * 864e5);
await probe('Archive wind', `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}&hourly=wind_speed_10m,wind_direction_10m&timezone=UTC`);
const q = `[out:json][timeout:25];way["landuse"~"^(grass|meadow|brownfield|greenfield)$"](around:5000,${lat},${lng});out tags geom 3;`;
await probe('Overpass (expects elements[].geometry[{lat,lon}])', 'https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
