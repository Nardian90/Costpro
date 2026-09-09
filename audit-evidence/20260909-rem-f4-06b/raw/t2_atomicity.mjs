#!/usr/bin/env node
/**
 * REM-F4-06b — ATOMICIDAD (§13)
 * 5a) Fallo FORZADO después de que la auditoría se genere (trigger anexo
 *     transitorio zzz_f406b_force_fail, se dispara DESPUÉS del trigger de
 *     auditoría por orden alfabético). Todo dentro de UNA transacción: si el
 *     INSERT falla, el aborto revierte TAMBIÉN el DDL transitorio (auto-clean).
 * 5b) Caso de éxito: negocio + auditoría persistidos (ya probado en P1-P3,
 *     re-verificado aquí con conteos).
 * 5c) Operación de negocio fallida (unique violation) → 0 auditoría.
 * Salida: 10_ATOMICITY.txt
 */
import fs from 'node:fs';

const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const env = {};
for (const l of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/); if (m) env[m[1]] = m[2];
}
const MGMT_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const STORE_A = 'f91b0e17-ac23-42ba-b08e-8159a6b57d83';
const ADMIN_UID = 'a1111111-1111-1111-1111-111111111111';
const F2 = 'a2592dd4-e39f-4616-996a-172a9fa4c922';
const EV = '/home/z/my-project/Costpro/audit-evidence/20260909-rem-f4-06b/';
const OUT = [];
let FAIL = 0;
const log = (s) => { OUT.push(s); console.log(s); };

async function q(sql) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { }
  return { status: r.status, data, text, ok: r.status === 201 };
}
function check(label, cond, detail = '') {
  log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL = 1;
}

(async () => {
  log(`# REM-F4-06b ATOMICITY SUITE — ${new Date().toISOString()}`);

  // estado previo de auditoría
  const pre = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings';`);
  const preCount = pre.data[0].n;
  log(`  audit rows pre: ${preCount}`);

  // ---- 5a: fallo forzado POST-auditoría -----------------------------------
  log(`\n== 5a. Fallo forzado tras generar auditoría (txn única con DDL transitorio) ==`);
  const crash = await q(`BEGIN;
CREATE OR REPLACE FUNCTION public.f406b_force_fail() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'F4-06B-ATOMICITY-PROBE: forced failure AFTER audit trigger'; END;
$fn$;
CREATE TRIGGER zzz_f406b_force_fail
  AFTER INSERT ON public.fiscal_closings
  FOR EACH ROW EXECUTE FUNCTION public.f406b_force_fail();
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"${ADMIN_UID}","role":"authenticated"}';
INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, closing_notes)
VALUES ('${STORE_A}', 2026, 3, 'open', 'F4-06b atomicity probe');
DROP TRIGGER IF EXISTS zzz_f406b_force_fail ON public.fiscal_closings;
DROP FUNCTION IF EXISTS public.f406b_force_fail();
COMMIT;`);
  log(`  resultado del lote: HTTP ${crash.status}`);
  log(`  ${crash.text.slice(0, 240).replace(/\n/g, ' ')}`);
  check('5a INSERT abortado por el fallo forzado', !crash.ok, `HTTP ${crash.status}`);

  // verificación post-aborto: 0 persistencia de negocio y auditoría + DDL limpio
  const post = await q(`SELECT
    (SELECT count(*)::int FROM audit_logs WHERE table_name='fiscal_closings') AS audit_n,
    (SELECT count(*)::int FROM fiscal_closings WHERE period_year=2026 AND period_month=3 AND store_id='${STORE_A}') AS fiscal_n,
    (SELECT count(*)::int FROM pg_trigger WHERE tgname='zzz_f406b_force_fail') AS trigger_leftover,
    (SELECT count(*)::int FROM pg_proc WHERE proname='f406b_force_fail') AS fn_leftover;`);
  const v = post.data[0];
  log(`  post-aborto: audit=${v.audit_n} fiscal_period_2026_03=${v.fiscal_n} trigger_leftover=${v.trigger_leftover} fn_leftover=${v.fn_leftover}`);
  check('5a fiscal_closing = NOT PERSISTED', v.fiscal_n === 0);
  check('5a audit_log = NOT PERSISTED (count inalterado)', Number(v.audit_n) === preCount, `${preCount} → ${v.audit_n}`);
  check('5a 0 residuo de DDL transitorio (trigger+fn eliminados por rollback)', v.trigger_leftover === 0 && v.fn_leftover === 0);

  // ---- 5b: caso de éxito ----------------------------------------------------
  log(`\n== 5b. Caso de éxito: negocio + auditoría persistidos ==`);
  const succ = await q(`SELECT
    (SELECT count(*)::int FROM fiscal_closings WHERE id='${F2}') AS fiscal_n,
    (SELECT count(*)::int FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F2}') AS audit_n;`);
  check('5b fiscal_closing = persisted', succ.data[0].fiscal_n === 1, JSON.stringify(succ.data[0]));
  check('5b audit_log = persisted (CREATED+UPDATED)', succ.data[0].audit_n === 2, JSON.stringify(succ.data[0]));

  // ---- 5c: operación de negocio fallida → 0 auditoría -----------------------
  log(`\n== 5c. INSERT duplicado (uq_fiscal_closings_store_period) → sin auditoría ==`);
  const dup = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${ADMIN_UID}","role":"authenticated"}';
    INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status)
    VALUES ('${STORE_A}', 2026, 8, 'open'); COMMIT;`, );
  check('5c duplicate rechazado (23505)', !dup.ok && /23505|unique/.test(dup.text), `HTTP ${dup.status}`);
  const post2 = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings';`);
  check('5c 0 auditoría generada por operación fallida', Number(post2.data[0].n) === preCount, `${preCount} → ${post2.data[0].n}`);

  log(`\n== ATOMICITY RESULT: ${FAIL === 0 ? 'ALL PASS' : 'FAILURES PRESENT'} ==`);
  fs.writeFileSync(`${EV}10_ATOMICITY.txt`, OUT.join('\n') + '\n');
  process.exitCode = FAIL;
})().catch(e => { console.error('SUITE CRASHED:', e); fs.writeFileSync(`${EV}10_ATOMICITY.txt`, OUT.join('\n') + `\nCRASH: ${e.message}\n`); process.exitCode = 1; });
