#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
const env = {};
for (const l of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const TOKEN = env.SUPABASE_ACCESS_TOKEN;
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)[1];
async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(HTTP ${res.status}) ${text.slice(0, 300)}`);
  return JSON.parse(text || '[]');
}
const tabs = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'
  AND (table_name ILIKE '%sale%' OR table_name ILIKE '%vale%' OR table_name ILIKE '%devol%' OR table_name ILIKE '%issue%' OR table_name ILIKE '%slip%' OR table_name ILIKE '%return%')
  ORDER BY table_name`);
console.log('tablas candidatas:', tabs.map(t=>t.table_name).join(', '));
// para cada una, columnas + conteo
for (const t of tabs) {
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t.table_name}' ORDER BY ordinal_position`);
  const n = await q(`SELECT count(*)::int AS n FROM public.${t.table_name}`);
  console.log(`\n${t.table_name} (${n[0].n} filas): ${cols.map(c=>c.column_name).join(', ')}`);
}
