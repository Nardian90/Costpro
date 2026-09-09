#!/usr/bin/env node
/**
 * REM-F4-06b — SUITE FUNCIONAL POST-FIX (§11, §12, §13-caso éxito)
 * P1 INSERT (BD, ctx authenticated) → audit row + record_id uuid
 * P2 UPDATE open→closed (BD, ctx authenticated) → audit row OLD/NEW
 * P3 UPDATE lock (op exacta de lock_fiscal_period sobre F1) → audit row
 * P4 UUID integrity sweep (join + pg_typeof)
 * Persiste fixtures F2 para suites siguientes. Salida: 09_FUNCTIONAL.txt
 */
import fs from 'node:fs';

const SUPABASE_URL = 'https://wthkddeleylijmonclxg.supabase.co';
const ANON_KEY = 'sb_publishable__wm5ULYU2FT_Cwq663dP5g_Ycg8AlXr';
const MGMT_URL = 'https://api.supabase.com/v1/projects/wthkddeleylijmonclxg/database/query';
const env = {};
for (const l of fs.readFileSync('/home/z/my-project/Costpro/.env', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/); if (m) env[m[1]] = m[2];
}
const MGMT_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const STORE_A = 'f91b0e17-ac23-42ba-b08e-8159a6b57d83';
const ADMIN_UID = 'a1111111-1111-1111-1111-111111111111';
const F1 = '17558101-2d1e-498b-b995-542717735e93'; // fixture PRE (status closed)
const CLAIMS = `SET LOCAL request.jwt.claims = '{"sub":"${ADMIN_UID}","role":"authenticated"}';`;
const EV = '/home/z/my-project/Costpro/audit-evidence/20260909-rem-f4-06b/';
const OUT = [];
let FAIL = 0;
const log = (s) => { OUT.push(s); console.log(s); };

async function q(sql, { expectFail = false } = {}) {
  const r = await fetch(MGMT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { }
  const ok = r.status === 201;
  if (!ok && !expectFail) throw new Error(`mgmt ${r.status}: ${text.slice(0, 400)}`);
  return { status: r.status, data, text, ok };
}
function check(label, cond, detail = '') {
  log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL = 1;
}

(async () => {
  log(`# REM-F4-06b POST-FIX FUNCTIONAL SUITE — ${new Date().toISOString()}`);

  // ---- P1 INSERT (idempotente: reutiliza fixture si ya existe) ------------
  log(`\n== P1. INSERT fiscal_closings (BD, ctx authenticated fixture, trigger ACTIVO) ==`);
  const existingF2 = await q(`SELECT id, status FROM fiscal_closings WHERE store_id='${STORE_A}' AND period_year=2026 AND period_month=9 LIMIT 1;`);
  let F2;
  if (existingF2.data?.length) {
    F2 = existingF2.data[0].id;
    log(`  fixture F2 preexistente (re-run) = ${F2} — INSERT original ya certificado`);
  } else {
    const ins = await q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
      INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, closing_notes)
      VALUES ('${STORE_A}', 2026, 9, 'open', 'REM-F4-06b fixture F2 — post-fix INSERT test')
      RETURNING id; COMMIT;`);
    F2 = ins.data?.[0]?.id;
    log(`  fixture F2 = ${F2}`);
    check('P1 INSERT HTTP 2xx con trigger activo (PRE: 42804/42703)', ins.ok, `status=${ins.status}`);
    check('P1 row id devuelto (uuid)', !!F2 && /^[0-9a-f-]{36}$/.test(F2), F2);
  }
  const a1 = await q(`SELECT id, action, record_id, store_id, user_id, metadata, pg_typeof(record_id) AS rid_type
    FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F2}' AND action='FISCAL_CLOSING_CREATED';`);
  check('P1 audit row FISCAL_CLOSING_CREATED creada', a1.data?.length === 1, JSON.stringify(a1.data));
  if (a1.data?.length === 1) {
    const a = a1.data[0];
    check('P1 audit.record_id = fiscal_closings.id', a.record_id === F2, `${a.record_id}`);
    check('P1 pg_typeof(record_id) = uuid', a.rid_type === 'uuid', a.rid_type);
    check('P1 audit.store_id = STORE_A', a.store_id === STORE_A, a.store_id);
    check('P1 audit.user_id = fixture uid (auth.uid())', a.user_id === ADMIN_UID, String(a.user_id));
    check('P1 metadata tg_op=INSERT year=2026 month=9 status=open',
      a.metadata?.tg_op === 'INSERT' && a.metadata?.year === 2026 && a.metadata?.month === 9 && a.metadata?.status === 'open',
      JSON.stringify(a.metadata));
  }

  // ---- P2 UPDATE open→closed (idempotente) --------------------------------
  log(`\n== P2. UPDATE F2 open→closed (BD, ctx authenticated) ==`);
  const existingA2 = await q(`SELECT id, action, record_id, metadata, pg_typeof(record_id) AS rid_type
    FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F2}' AND action='FISCAL_CLOSING_UPDATED';`);
  let a2;
  if (existingA2.data?.length) {
    a2 = existingA2;
    log(`  audit UPDATE de F2 preexistente (re-run) — UPDATE original ya certificado`);
  } else {
    const upd = await q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
      UPDATE public.fiscal_closings SET status='closed', closing_notes='F4-06b UPDATE test closed'
      WHERE id='${F2}' RETURNING id, status; COMMIT;`);
    check('P2 UPDATE HTTP 2xx (PRE: 42703/42804)', upd.ok && upd.data?.[0]?.status === 'closed', JSON.stringify(upd.data));
    a2 = await q(`SELECT id, action, record_id, metadata, pg_typeof(record_id) AS rid_type
      FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F2}' AND action='FISCAL_CLOSING_UPDATED';`);
  }
  check('P2 audit row FISCAL_CLOSING_UPDATED creada', a2.data?.length === 1, JSON.stringify(a2.data));
  if (a2.data?.length === 1) {
    const a = a2.data[0];
    check('P2 audit.record_id = F2.id (uuid→uuid)', a.record_id === F2 && a.rid_type === 'uuid', `${a.record_id} / ${a.rid_type}`);
    check('P2 metadata tg_op=UPDATE status(closed) year=2026 month=9',
      a.metadata?.tg_op === 'UPDATE' && a.metadata?.status === 'closed' && a.metadata?.year === 2026 && a.metadata?.month === 9,
      JSON.stringify(a.metadata));
  }

  // ---- P3 UPDATE lock path sobre F1 (idempotente) -------------------------
  log(`\n== P3. UPDATE F1 closed→locked (operación EXACTA de lock_fiscal_period, BD) ==`);
  const existingA3 = await q(`SELECT id, action, record_id, metadata, pg_typeof(record_id) AS rid_type, user_id
    FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F1}' AND action='FISCAL_CLOSING_UPDATED';`);
  let a3;
  if (existingA3.data?.length) {
    a3 = existingA3;
    log(`  audit UPDATE de F1 preexistente (re-run) — lock original ya certificado`);
  } else {
    const lock = await q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
      UPDATE public.fiscal_closings
      SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now(), updated_at=now()
      WHERE id='${F1}' AND status='closed'
      RETURNING id, status; COMMIT;`);
    check('P3 lock-UPDATE HTTP 2xx (1 fila afectada)', lock.ok && lock.data?.[0]?.status === 'locked', JSON.stringify(lock.data));
    a3 = await q(`SELECT id, action, record_id, metadata, pg_typeof(record_id) AS rid_type, user_id
      FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F1}' AND action='FISCAL_CLOSING_UPDATED';`);
  }
  check('P3 audit row FISCAL_CLOSING_UPDATED para F1', a3.data?.length === 1, JSON.stringify(a3.data));
  if (a3.data?.length === 1) {
    const a = a3.data[0];
    check('P3 audit.record_id = F1.id (uuid→uuid)', a.record_id === F1 && a.rid_type === 'uuid', `${a.record_id} / ${a.rid_type}`);
    check('P3 metadata status=locked year=2026 month=8',
      a.metadata?.status === 'locked' && a.metadata?.year === 2026 && a.metadata?.month === 8, JSON.stringify(a.metadata));
  }

  // ---- P4 UUID INTEGRITY SWEEP --------------------------------------------
  log(`\n== P4. Integridad UUID global (§12): toda fila fiscal de auditoría ==`);
  const sweep = await q(`
    SELECT al.id, al.action, al.record_id, fc.id AS fc_id, (al.record_id = fc.id) AS ids_equal,
           pg_typeof(al.record_id)::text AS rid_type
    FROM audit_logs al
    JOIN fiscal_closings fc ON fc.id = al.record_id
    WHERE al.table_name='fiscal_closings'
    ORDER BY al.id;`);
  const rows = sweep.data || [];
  log(`  filas de auditoría fiscal totales: ${rows.length} (pre-gate: 0)`);
  check('P4 todas las filas con record_id = fiscal_closings.id', rows.length >= 3 && rows.every(r => r.ids_equal === true));
  check('P4 pg_typeof(record_id) = uuid en TODAS', rows.every(r => r.rid_type === 'uuid'));
  // Anti-mezcla real: cada audit row debe corresponder al periodo del cierre
  // que la generó (metadata.year/month == period_year/period_month del join).
  const mix = await q(`
    SELECT al.id, al.metadata->>'year' AS m_year, al.metadata->>'month' AS m_month,
           fc.period_year, fc.period_month
    FROM audit_logs al JOIN fiscal_closings fc ON fc.id = al.record_id
    WHERE al.table_name='fiscal_closings';`);
  const mism = (mix.data || []).filter(r => Number(r.m_year) !== r.period_year || Number(r.m_month) !== r.period_month);
  check('P4 sin UUID cruzados (metadata de cada audit row == periodo del cierre unido)', mism.length === 0, `mismatches=${mism.length}`);
  const orphan = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND record_id NOT IN (SELECT id FROM fiscal_closings);`);
  check('P4 0 huérfanos (record_id sin fila de negocio)', orphan.data?.[0]?.n === 0, JSON.stringify(orphan.data));

  // ---- resumen -------------------------------------------------------------
  log(`\n== P1-P4 RESULT: ${FAIL === 0 ? 'ALL PASS' : 'FAILURES PRESENT'} ==`);
  log(`Fixtures: F1=${F1} (locked) F2=${F2} (closed)`);
  fs.writeFileSync(`${EV}09_FUNCTIONAL.txt`, OUT.join('\n') + '\n');
  fs.writeFileSync('/home/z/my-project/gate-f406b/.f406b_fixtures', JSON.stringify({ F1, F2 }));
  process.exitCode = FAIL;
})().catch(e => { console.error('SUITE CRASHED:', e); fs.writeFileSync(`${EV}09_FUNCTIONAL.txt`, OUT.join('\n') + `\nCRASH: ${e.message}\n`); process.exitCode = 1; });
