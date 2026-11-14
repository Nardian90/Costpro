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
const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='wac_change_log' ORDER BY ordinal_position`);
console.log('wac_change_log columnas:', cols.map(c=>c.column_name).join(', '));
const n = await q(`SELECT * FROM public.wac_change_log ORDER BY 1 DESC LIMIT 3`);
console.log(JSON.stringify(n, null, 1).slice(0, 1200));
