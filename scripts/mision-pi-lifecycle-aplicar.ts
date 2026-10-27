/**
 * MISIÓN CICLO DE VIDA — Aplicación de la migración 20261027150000.
 * Fase 1: DRY-RUN (BEGIN → ejecutar → ROLLBACK) para validar sintaxis.
 * Fase 2 (aplicación real) se ejecuta con --apply.
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
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const migration = readFileSync(
    resolve(__dirname, '../supabase/migrations/20261027150000_pi_lifecycle_ciclo_vida.sql'), 'utf8'
  );
  // Sin NOTIFY dentro de transacción (pgrst reload se emite aparte si aplica)
  const body = migration.replace(/NOTIFY pgrst[^;]*;/g, '');

  console.log(`══ MODO: ${apply ? 'APLICACIÓN REAL' : 'DRY-RUN (ROLLBACK)'} ══`);
  console.log(`══ Longitud SQL: ${body.length} caracteres ══`);

  await q('BEGIN');
  try {
    // Ejecutar la migración completa dentro de la transacción
    await q(body);
    // Verificaciones dentro de la transacción
    const fnDelete = await q(`SELECT proname FROM pg_proc WHERE proname='delete_physical_inventory'`);
    const fnUpdate = await q(`SELECT proname FROM pg_proc WHERE proname='update_physical_inventory'`);
    console.log('── Funciones nuevas presentes:', JSON.stringify([fnDelete, fnUpdate].flat().map((r: any) => r.proname)));
    if (!fnDelete.length || !fnUpdate.length) throw new Error('Las funciones nuevas no se crearon');

    const policies = await q(`
      SELECT policyname FROM pg_policies
      WHERE tablename IN ('physical_inventories','physical_inventory_items')
        AND policyname LIKE '%update%' OR policyname LIKE '%insert'
      ORDER BY 1
    `);
    console.log('── Políticas update/insert:', JSON.stringify(policies.map((p: any) => p.policyname)));

    if (apply) {
      await q('COMMIT');
      console.log('✅ COMMIT — migración aplicada');
      await q(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    } else {
      await q('ROLLBACK');
      console.log('↩️ ROLLBACK — dry-run exitoso (sin cambios)');
    }
  } catch (e) {
    await q('ROLLBACK').catch(() => {});
    console.error('❌ ERROR:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
