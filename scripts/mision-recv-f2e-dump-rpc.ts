/**
 * MISIÓN RECEPCIONES — F2e: código fuente completo de register_reception
 * y confirm_pending_reception (para diseñar la extensión transaccional).
 */
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  for (const fn of ['register_reception', 'confirm_pending_reception']) {
    const src = await q(`select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}';`);
    const def = src[0]?.def || '(no encontrada)';
    writeFileSync(resolve(__dirname, `mision-recv-${fn}.sql`), def);
    console.log(`== ${fn}: guardado en scripts/mision-recv-${fn}.sql (${def.split('\n').length} líneas) ==`);
  }
  console.log('OK');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
