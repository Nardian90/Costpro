/**
 * MISIÓN RECEPCIONES — Aplicación de la migración 20261027180000.
 * Fase 1: DRY-RUN (BEGIN → ejecutar → verificaciones → ROLLBACK).
 * Fase 2 (aplicación real) con --apply.
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
    resolve(__dirname, '../supabase/migrations/20261027180000_recepciones_borradores_transaccional.sql'), 'utf8'
  );
  const body = migration.replace(/NOTIFY pgrst[^;]*;/g, '');

  console.log(`══ MODO: ${apply ? 'APLICACIÓN REAL' : 'DRY-RUN (ROLLBACK)'} ══`);
  console.log(`══ Longitud SQL: ${body.length} caracteres ══`);

  await q('BEGIN');
  try {
    await q(body);

    // Verificaciones dentro de la transacción
    const fnDel = await q(`SELECT proname FROM pg_proc WHERE proname='delete_pending_reception'`);
    console.log('── delete_pending_reception creada:', JSON.stringify(fnDel.map((r: any) => r.proname)));

    const sig = await q(`SELECT pg_get_function_arguments(p.oid) AS args FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_reception'`);
    console.log('── firmas register_reception:', JSON.stringify(sig.map((r: any) => r.args)));

    const invoiceChk = await q(`SELECT pg_get_functiondef(p.oid) LIKE '%ERR_INVOICE_DUPLICATE%' AS has_inv_chk,
      pg_get_functiondef(p.oid) LIKE '%ERR_SKU_EXISTS%' AS has_sku_chk,
      pg_get_functiondef(p.oid) LIKE '%new_product%' AS has_new_product
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='register_reception'`);
    console.log('── register_reception checks:', JSON.stringify(invoiceChk));

    const pol = await q(`SELECT policyname, qual FROM pg_policies WHERE tablename='receipts' AND policyname='receipts_delete_rls'`);
    console.log('── política delete:', JSON.stringify(pol.map((p: any) => ({ name: p.policyname, qual: String(p.qual).slice(0, 200) }))));

    const grants = await q(`SELECT p.proname, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='delete_pending_reception'`);
    console.log('── ACL delete_pending_reception:', JSON.stringify(grants.map((g: any) => g.proacl)));

    if (apply) {
      await q('COMMIT');
      console.log('✅ COMMIT — migración aplicada');
      await q(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    } else {
      await q('ROLLBACK');
      console.log('✅ ROLLBACK — dry-run completado sin errores');
    }
  } catch (e) {
    await q('ROLLBACK').catch(() => {});
    console.error('❌ ERROR (revertido):', e);
    process.exit(1);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
