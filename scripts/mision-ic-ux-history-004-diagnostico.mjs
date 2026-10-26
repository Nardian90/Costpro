// DIAGNÓSTICO READ-ONLY — MISIÓN IC-UX-HISTORY-004
// Verifica el estado real de la serie informal en producción (Supabase)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Cargar env.local
const env = readFileSync('.env', 'utf-8');
const envMap = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) envMap[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = envMap.NEXT_PUBLIC_SUPABASE_URL;
const key = envMap.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('FALTAN CREDS'); process.exit(1); }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

console.log('=== 1. Serie informal USD por fuente — rango y conteo ===');
const { data: informal, error: e1 } = await admin.from('exchange_rates')
  .select('rate_date, rate, source, capture_method, segment, captured_at')
  .eq('currency', 'USD')
  .in('source', ['elToque', 'Diviza'])
  .order('rate_date', { ascending: true });
if (e1) { console.error('ERROR:', e1.message); process.exit(1); }

const bySource = {};
for (const r of informal) {
  if (!bySource[r.source]) bySource[r.source] = { count: 0, min: r.rate_date, max: r.rate_date, methods: {} };
  const s = bySource[r.source];
  s.count++;
  if (r.rate_date < s.min) s.min = r.rate_date;
  if (r.rate_date > s.max) s.max = r.rate_date;
  s.methods[r.capture_method] = (s.methods[r.capture_method] || 0) + 1;
}
console.log(JSON.stringify(bySource, null, 2));

console.log('\n=== 2. Fechas duplicadas intra-fuente (USD informal) ===');
const byDate = {};
for (const r of informal) {
  const k = `${r.source}|${r.rate_date}`;
  byDate[k] = (byDate[k] || 0) + 1;
}
const dups = Object.entries(byDate).filter(([k, n]) => n > 1);
console.log('duplicados intra-fuente:', dups.length, dups.slice(0, 5));

console.log('\n=== 3. Fechas con AMBAS fuentes (solapamiento elToque/Diviza) ===');
const elDates = new Set(informal.filter(r => r.source === 'elToque').map(r => r.rate_date));
const dvDates = new Set(informal.filter(r => r.source === 'Diviza').map(r => r.rate_date));
const overlap = [...elDates].filter(d => dvDates.has(d));
console.log('fechas solapadas:', overlap.length, overlap.slice(0, 10));

console.log('\n=== 4. Días distintos con informal (cualquier fuente) ===');
const allDates = new Set(informal.map(r => r.rate_date));
console.log('total días informales:', allDates.size, '| primero:', [...allDates][0], '| último:', [...allDates].at(-1));

console.log('\n=== 5. Segmentos de las filas informales ===');
const segs = {};
for (const r of informal) { segs[r.segment] = (segs[r.segment] || 0) + 1; }
console.log(segs);

console.log('\n=== 6. Filas futuras (rate_date > hoy operativo Cuba) ===');
// hoy operativo Cuba 2026-10-26 (EDT UTC-4)
const future = informal.filter(r => r.rate_date > '2026-10-26');
console.log('filas futuras:', future.length, future.slice(0, 5).map(r => ({ d: r.rate_date, s: r.source, r: r.rate })));

console.log('\n=== 7. BCC USD seg3 — rango ===');
const { data: bcc } = await admin.from('exchange_rates')
  .select('rate_date, rate, source, capture_method')
  .eq('currency', 'USD').eq('source', 'BCC').eq('segment', '3')
  .order('rate_date', { ascending: true }).limit(100000);
const bccDates = bcc ? [...new Set(bcc.map(r => r.rate_date))] : [];
console.log('BCC USD seg3 filas:', bcc?.length, '| días:', bccDates.length, '| primero:', bccDates[0], '| último:', bccDates.at(-1));
