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
// un document_id de VENTA
const vta = await q(`SELECT document_id::text, document_number FROM public.fin_entries WHERE document_type='VENTA' LIMIT 3`);
console.log('VENTA doc ids:', JSON.stringify(vta));
// ¿en qué tabla vive? probar candidatos
const tabs = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
const nombres = tabs.map(t => t.table_name);
console.log('\ntodas las tablas:', nombres.join(', '));
