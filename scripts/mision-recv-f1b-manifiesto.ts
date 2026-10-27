/**
 * MISIÓN RECEPCIONES — F1b: verificación de manifiesto de migraciones y estado de PI.
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
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // ¿Tabla de manifiesto usada por el proyecto?
  const tables = await q(`select table_name from information_schema.tables where table_schema='public' and (table_name like '%migration%' or table_name like '%schema%') order by 1;`);
  console.log('== Tablas de manifiesto ==');
  for (const r of tables) console.log(' -', r.table_name);

  // Constraint UNIQUE compuesto pi_number (bug multitienda corregido en la misión anterior)
  const idx = await q(`select indexname, indexdef from pg_indexes where tablename='physical_inventories' and indexdef like '%pi_number%';`);
  console.log('== Índices pi_number ==');
  for (const r of idx) console.log(' -', r.indexname, '=>', r.indexdef);

  // Trigger de transiciones PI
  const trg = await q(`select tgname from pg_trigger where tgrelid='physical_inventories'::regclass and not tgisinternal;`);
  console.log('== Triggers physical_inventories ==');
  for (const r of trg) console.log(' -', r.tgname);

  console.log('\nOK F1-PIb');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
