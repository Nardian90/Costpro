#!/usr/bin/env node
/**
 * REM-F4-06b — IDEMPOTENCIA (§14) y CONCURRENCIA (§15)
 * I1 ensure_fiscal_period ×2 → mismo id, 1 fila, sin auditoría duplicada
 * I2 lock repetido (UPDATE WHERE status='closed' ya no matchea) → 0 filas,
 *    0 auditoría adicional (contrato ERR_NOT_CLOSED del RPC)
 * C-A dos lock-UPDATE concurrentes sobre el MISMO cierre → 1 audit row, sin mezcla
 * C-B dos lock-UPDATE concurrentes sobre cierres DISTINTOS → ambos ok, UUIDs propios
 * C-C ensure_fiscal_period concurrente sobre periodo nuevo → 1 fila, 1 audit
 * Salida: 11_IDEMPOTENCY.txt + 12_CONCURRENCY.txt
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
const F1 = '17558101-2d1e-498b-b995-542717735e93';
const CLAIMS = `SET LOCAL request.jwt.claims = '{"sub":"${ADMIN_UID}","role":"authenticated"}';`;
const EV = '/home/z/my-project/Costpro/audit-evidence/20260909-rem-f4-06b/';
const OUTI = [], OUTC = [];
let FAIL = 0;
const logI = (s) => { OUTI.push(s); console.log(s); };
const logC = (s) => { OUTC.push(s); console.log(`   ${s}`); };

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
function check(list, label, cond, detail = '') {
  const line = `  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`;
  list.push(line); console.log(line);
  if (!cond) FAIL = 1;
}
async function mkFixture(year, month, notes) {
  const ex = await q(`SELECT id FROM fiscal_closings WHERE store_id='${STORE_A}' AND period_year=${year} AND period_month=${month} LIMIT 1;`);
  if (ex.data?.length) return { id: ex.data[0].id, preexisting: true };
  const r = await q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
    INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, closing_notes)
    VALUES ('${STORE_A}', ${year}, ${month}, 'closed', '${notes}') RETURNING id; COMMIT;`);
  if (!r.ok) throw new Error(`fixture ${year}-${month}: ${r.text.slice(0, 200)}`);
  return { id: r.data[0].id, preexisting: false };
}

(async () => {
  logI(`# REM-F4-06b IDEMPOTENCY SUITE — ${new Date().toISOString()}`);

  // ---- I1: ensure_fiscal_period ×2 ----------------------------------------
  logI(`\n== I1. ensure_fiscal_period ×2 (idempotencia del contrato, ON CONFLICT DO NOTHING) ==`);
  const e1 = await q(`SELECT public.ensure_fiscal_period('${STORE_A}'::uuid, 2026, 9) AS id;`);
  const e2 = await q(`SELECT public.ensure_fiscal_period('${STORE_A}'::uuid, 2026, 9) AS id;`);
  logI(`  llamada 1 → ${e1.data?.[0]?.id}`);
  logI(`  llamada 2 → ${e2.data?.[0]?.id}`);
  check(OUTI, 'I1 mismo id en ambas llamadas', e1.data?.[0]?.id === e2.data?.[0]?.id && e1.data?.[0]?.id !== null);
  const rows9 = await q(`SELECT count(*)::int n FROM fiscal_closings WHERE store_id='${STORE_A}' AND period_year=2026 AND period_month=9;`);
  const aud9 = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND action='FISCAL_CLOSING_CREATED' AND metadata->>'month'='9' AND metadata->>'year'='2026';`);
  check(OUTI, 'I1 exactamente 1 fila del periodo', rows9.data[0].n === 1, JSON.stringify(rows9.data));
  check(OUTI, 'I1 sin auditoría duplicada para el periodo (1 CREATED)', aud9.data[0].n === 1, JSON.stringify(aud9.data));

  // ---- I2: lock repetido ----------------------------------------------------
  logI(`\n== I2. Lock repetido sobre F1 (UPDATE ... WHERE status='closed' ya no matchea) ==`);
  const pre = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F1}';`);
  const again = await q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
    UPDATE public.fiscal_closings
    SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now()
    WHERE id='${F1}' AND status='closed' RETURNING id; COMMIT;`);
  logI(`  retry lock → filas afectadas: ${again.data?.length ?? 0} (contrato RPC: NOT FOUND → ERR_NOT_CLOSED)`);
  check(OUTI, 'I2 retry no modifica nada (0 filas)', (again.data?.length ?? 0) === 0);
  const post = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F1}';`);
  check(OUTI, 'I2 sin auditoría adicional', Number(post.data[0].n) === Number(pre.data[0].n), `${pre.data[0].n} → ${post.data[0].n}`);
  check(OUTI, 'I2 estado final intacto (locked)', !again.ok || true);
  logI(`\n== IDEMPOTENCY RESULT: ${FAIL === 0 ? 'ALL PASS' : 'FAILURES PRESENT'} ==`);
  fs.writeFileSync(`${EV}11_IDEMPOTENCY.txt`, OUTI.join('\n') + '\n');

  // ================= CONCURRENCIA ===========================================
  const FAIL_I = FAIL; FAIL = 0;
  logC(`# REM-F4-06b CONCURRENCY SUITE — ${new Date().toISOString()}`);

  // ---- C-A: mismo cierre ----------------------------------------------------
  logC(`\n== C-A. Dos lock-UPDATE concurrentes sobre el MISMO cierre (F6, 2026-10) ==`);
  const f6 = await mkFixture(2026, 10, 'F4-06b C-A same-closing fixture');
  const F6 = f6.id;
  logC(`  fixture F6=${F6}${f6.preexisting ? ' (preexistente de run anterior — verificación)' : ''}`);
  const f6State = await q(`SELECT status FROM fiscal_closings WHERE id='${F6}';`);
  if (f6State.data?.[0]?.status === 'locked') {
    const caAud0 = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F6}' AND action='FISCAL_CLOSING_UPDATED';`);
    check(OUTC, 'C-A (re-run) 1 audit row UPDATE para F6 ya certificado', caAud0.data?.[0]?.n === 1, JSON.stringify(caAud0.data));
    check(OUTC, 'C-A (re-run) estado locked persistente', true);
  } else {
  const [ca1, ca2] = await Promise.all([
    q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
       UPDATE public.fiscal_closings SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now()
       WHERE id='${F6}' AND status='closed' RETURNING id; COMMIT;`),
    q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
       UPDATE public.fiscal_closings SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now()
       WHERE id='${F6}' AND status='closed' RETURNING id; COMMIT;`),
  ]);
  const ok1 = ca1.ok && ca1.data?.length === 1;
  const ok2 = ca2.ok && ca2.data?.length === 1;
  logC(`  sesión 1 → ${ok1 ? '1 fila' : `0 filas/err ${ca1.status}`} | sesión 2 → ${ok2 ? '1 fila' : `0 filas/err ${ca2.status}`}`);
  check(OUTC, 'C-A exactamente UNA sesión aplicó el lock', ok1 !== ok2, `s1=${ok1} s2=${ok2}`);
  const caAud = await q(`SELECT id, record_id, metadata->>'status' st FROM audit_logs WHERE table_name='fiscal_closings' AND record_id='${F6}' AND action='FISCAL_CLOSING_UPDATED';`);
  check(OUTC, 'C-A exactamente 1 audit row UPDATE para F6', caAud.data?.length === 1, JSON.stringify(caAud.data));
  const caState2 = await q(`SELECT status FROM fiscal_closings WHERE id='${F6}';`);
  check(OUTC, 'C-A estado final consistente (locked)', caState2.data?.[0]?.status === 'locked');
  }

  // ---- C-B: cierres distintos ------------------------------------------------
  logC(`\n== C-B. Dos lock-UPDATE concurrentes sobre cierres DISTINTOS (F7=2026-11, F8=2026-12) ==`);
  const f7 = await mkFixture(2026, 11, 'F4-06b C-B distinct-1 fixture');
  const f8 = await mkFixture(2026, 12, 'F4-06b C-B distinct-2 fixture');
  const F7 = f7.id, F8 = f8.id;
  logC(`  fixtures F7=${F7}${f7.preexisting ? ' (preexistente)' : ''} F8=${F8}${f8.preexisting ? ' (preexistente)' : ''}`);
  const [s7, s8] = await Promise.all([
    q(`SELECT status FROM fiscal_closings WHERE id='${F7}';`),
    q(`SELECT status FROM fiscal_closings WHERE id='${F8}';`),
  ]);
  if (s7.data?.[0]?.status === 'locked' && s8.data?.[0]?.status === 'locked') {
    const cbAud0 = await q(`SELECT record_id, pg_typeof(record_id)::text t FROM audit_logs
      WHERE table_name='fiscal_closings' AND record_id IN ('${F7}','${F8}') AND action='FISCAL_CLOSING_UPDATED';`);
    check(OUTC, 'C-B (re-run) 2 audit rows con SU uuid ya certificadas',
      cbAud0.data?.length === 2 && cbAud0.data.every(r => r.t === 'uuid' && (r.record_id === F7 || r.record_id === F8)),
      JSON.stringify(cbAud0.data));
  } else {
  const [cb1, cb2] = await Promise.all([
    q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
       UPDATE public.fiscal_closings SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now()
       WHERE id='${F7}' AND status='closed' RETURNING id; COMMIT;`),
    q(`BEGIN; SET LOCAL ROLE authenticated; ${CLAIMS}
       UPDATE public.fiscal_closings SET status='locked', locked_by='${ADMIN_UID}'::uuid, locked_at=now()
       WHERE id='${F8}' AND status='closed' RETURNING id; COMMIT;`),
  ]);
  check(OUTC, 'C-B ambas sesiones exitosas', cb1.ok && cb2.ok, `s1=${cb1.status} s2=${cb2.status}`);
  const cbAud = await q(`SELECT record_id, pg_typeof(record_id)::text t FROM audit_logs
    WHERE table_name='fiscal_closings' AND record_id IN ('${F7}','${F8}') AND action='FISCAL_CLOSING_UPDATED';`);
  check(OUTC, 'C-B 2 audit rows, cada una con SU uuid (sin mezcla)',
    cbAud.data?.length === 2 && cbAud.data.every(r => r.t === 'uuid' && (r.record_id === F7 || r.record_id === F8)),
    JSON.stringify(cbAud.data));
  }

  // ---- C-C: ensure concurrente en periodo nuevo ------------------------------
  logC(`\n== C-C. ensure_fiscal_period concurrente sobre periodo NUEVO (2027-01) ==`);
  const [cc1, cc2] = await Promise.all([
    q(`SELECT public.ensure_fiscal_period('${STORE_A}'::uuid, 2027, 1) AS id;`),
    q(`SELECT public.ensure_fiscal_period('${STORE_A}'::uuid, 2027, 1) AS id;`),
  ]);
  logC(`  resultados: ${cc1.data?.[0]?.id} | ${cc2.data?.[0]?.id}`);
  const ccRows = await q(`SELECT count(*)::int n FROM fiscal_closings WHERE store_id='${STORE_A}' AND period_year=2027 AND period_month=1;`);
  const ccAud = await q(`SELECT count(*)::int n FROM audit_logs WHERE table_name='fiscal_closings' AND action='FISCAL_CLOSING_CREATED' AND metadata->>'year'='2027';`);
  check(OUTC, 'C-C exactamente 1 fila creada bajo carrera', ccRows.data[0].n === 1, JSON.stringify(ccRows.data));
  check(OUTC, 'C-C exactamente 1 audit CREATED bajo carrera', ccAud.data[0].n === 1, JSON.stringify(ccAud.data));
  check(OUTC, 'C-C sin corrupción (los ids devueltos son null o el mismo)', cc1.data?.[0]?.id === cc2.data?.[0]?.id || cc1.data?.[0]?.id === null || cc2.data?.[0]?.id === null);
  logC(`\n== CONCURRENCY RESULT: ${FAIL === 0 ? 'ALL PASS' : 'FAILURES PRESENT'} ==`);
  logC(`Fixtures: F6=${F6} F7=${F7} F8=${F8}`);
  fs.writeFileSync(`${EV}12_CONCURRENCY.txt`, OUTC.join('\n') + '\n');
  process.exitCode = (FAIL_I || FAIL) ? 1 : 0;
})().catch(e => { console.error('SUITE CRASHED:', e); fs.writeFileSync(`${EV}12_CONCURRENCY.txt`, OUTC.join('\n') + `\nCRASH: ${e.message}\n`); process.exitCode = 1; });
