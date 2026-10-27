/**
 * Consulta rápida al esquema vivo (Management API) — columnas de audit_logs
 * y conteo de PIs por estado (para diseñar la migración del ciclo de vida).
 */
import { readFileSync } from 'fs';
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
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function main() {
  console.log('── audit_logs columnas:');
  console.log(JSON.stringify(await q(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_logs' ORDER BY ordinal_position
  `), null, 1));

  console.log('── FKs hacia physical_inventories:');
  console.log(JSON.stringify(await q(`
    SELECT conname, conrelid::regclass AS tabla, confdeltype AS on_delete
    FROM pg_constraint
    WHERE confrelid = 'public.physical_inventories'::regclass
  `), null, 1));

  console.log('── PIs por estado (histórico real):');
  console.log(JSON.stringify(await q(`
    SELECT status, COUNT(*) FROM public.physical_inventories GROUP BY status ORDER BY 2 DESC
  `), null, 1));

  console.log('── audit_logs PIs existentes:');
  console.log(JSON.stringify(await q(`
    SELECT action, COUNT(*) FROM public.audit_logs
    WHERE table_name='physical_inventories' GROUP BY action
  `), null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
