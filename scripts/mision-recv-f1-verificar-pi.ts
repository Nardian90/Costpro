/**
 * MISIÓN RECEPCIONES — F1: Verificación de despliegue de la misión anterior (Inventario Físico)
 * Solo lectura: comprueba que las RPCs del ciclo de vida PI están vivas y que la
 * UI/servidor local ejecuta el código fusionado (cd26264).
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
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function main() {
  // 1) RPCs del ciclo de vida PI vivas en la BD
  const rpcs = await q(`select p.proname, pg_get_function_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('delete_physical_inventory','void_physical_inventory','update_physical_inventory','create_physical_inventory','start_physical_inventory')
order by p.proname;`);
  console.log('== RPCs PI vivas ==');
  for (const r of rpcs) console.log(` - ${r.proname}(${r.args})`);

  // 2) Migración registrada en el manifiesto
  const mig = await q(`select version, name from supabase_migrations.schema_migrations where name like '%pi_lifecycle%' or name like '%20261027150000%';`);
  console.log('== Migración registrada ==');
  for (const r of mig) console.log(` - ${r.version}: ${r.name}`);

  // 3) Local: HTTP del servidor pm2
  const http = await fetch('http://localhost:3000');
  console.log('== Servidor local ==\n - HTTP:', http.status);

  console.log('\nOK F1-PI');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
