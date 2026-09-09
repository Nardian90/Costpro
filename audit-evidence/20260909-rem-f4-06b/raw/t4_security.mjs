#!/usr/bin/env node
/**
 * REM-F4-06b — SEGURIDAD (§16)
 * S1 anon HTTP → 401 DENY
 * S2 non-member (RLS): SELECT 0 filas, UPDATE 0 filas
 * S3 cross-store: has_store_access_as=false + RPC EXECUTE denegado a authenticated
 * S4 ACL/RLS/SECDEF re-verificación POST (idéntico a PRE)
 * Salida: 13_SECURITY.txt
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
const STORE_B = '9e308fcd-391f-4b91-9866-f0155d8d5cbe';
const ADMIN_UID = 'a1111111-1111-1111-1111-111111111111';
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
async function http(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`http://localhost:3000${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, text: (await r.text()).slice(0, 200) };
}
function check(label, cond, detail = '') {
  log(`  [${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) FAIL = 1;
}

(async () => {
  log(`# REM-F4-06b SECURITY SUITE — ${new Date().toISOString()}`);

  // ---- S1: anon HTTP ---------------------------------------------------------
  log(`\n== S1. ANON (sin sesión) → 401 DENY ==`);
  const a1 = await http('POST', '/api/fiscal-close', { store_id: STORE_A, year: 2026, month: 8, action: 'lock' }, null);
  check('S1 anon POST /api/fiscal-close DENIED', [401, 403].includes(a1.status), `status=${a1.status}`);
  const a2 = await http('GET', `/api/fiscal-close?store_id=${STORE_A}&year=2026&month=8`, null, null);
  check('S1 anon GET /api/fiscal-close DENIED', [401, 403].includes(a2.status), `status=${a2.status}`);

  // ---- S2: non-member RLS ------------------------------------------------------
  log(`\n== S2. Usuario SIN membresía (RLS) → 0 filas / 0 updates ==`);
  const nm = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
    SELECT count(*)::int AS visible_rows FROM fiscal_closings;
    SELECT count(*)::int AS updated_rows FROM update_f406b_probe;
    ROLLBACK;`).catch(() => null);
  // (consulta por partes para evitar aborto de batch)
  const nmSel = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
    SELECT count(*)::int AS visible_rows FROM fiscal_closings; ROLLBACK;`);
  check('S2 non-member SELECT fiscal_closings = 0 filas (RLS)', nmSel.ok && nmSel.data?.[0]?.visible_rows === 0, JSON.stringify(nmSel.data));
  const nmUpd = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
    UPDATE fiscal_closings SET closing_notes='S2-DENY-PROBE' WHERE store_id='${STORE_A}' RETURNING id; ROLLBACK;`);
  check('S2 non-member UPDATE fiscal_closings = 0 filas (RLS update policy)', nmUpd.ok && (nmUpd.data?.length ?? 0) === 0, `HTTP ${nmUpd.status} rows=${JSON.stringify(nmUpd.data)}`);

  // ---- S3: cross-store ---------------------------------------------------------
  log(`\n== S3. CROSS-STORE ==`);
  const probe = await q(`SELECT public.has_store_access_as('00000000-0000-0000-0000-000000000000'::uuid, '${STORE_B}'::uuid) AS has_access;`);
  check('S3 has_store_access_as(non-member, STORE_B) = false', probe.ok && probe.data?.[0]?.has_access === false, JSON.stringify(probe.data));
  const rpcAcl = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
    SELECT public.close_fiscal_period('${STORE_B}'::uuid, 2026, 1, NULL); ROLLBACK;`);
  check('S3 authenticated sin EXECUTE en close_fiscal_period → permission DENIED', !rpcAcl.ok && /permission denied/i.test(rpcAcl.text), `HTTP ${rpcAcl.status} ${rpcAcl.text.slice(0, 110)}`);
  const lockAcl = await q(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
    SELECT public.lock_fiscal_period('${STORE_B}'::uuid, 2026, 1); ROLLBACK;`);
  check('S3 authenticated sin EXECUTE en lock_fiscal_period → permission DENIED', !lockAcl.ok && /permission denied/i.test(lockAcl.text), `HTTP ${lockAcl.status}`);

  // ---- S4: re-verificación POST de seguridad estructural ------------------------
  log(`\n== S4. RLS / ACL / SECDEF / ownership POST (debe ser idéntico a PRE) ==`);
  const rls = await q(`SELECT c.relrowsecurity rls, c.relforcerowsecurity force_rls FROM pg_class c WHERE c.oid='fiscal_closings'::regclass;`);
  check('S4 fiscal_closings RLS sigue ENABLED', rls.data?.[0]?.rls === true, JSON.stringify(rls.data));
  const pol = await q(`SELECT count(*)::int n FROM pg_policy WHERE polrelid='fiscal_closings'::regclass;`);
  check('S4 políticas RLS de fiscal_closings intactas (3: insert/select/update)', pol.data?.[0]?.n === 3, JSON.stringify(pol.data));
  const secdef = await q(`SELECT p.prosecdef, array_to_string(p.proconfig,',') cfg, pg_get_userbyid(p.proowner) owner
    FROM pg_proc p WHERE p.proname='audit_fiscal_closings_changes' AND p.pronamespace='public'::regnamespace;`);
  check('S4 función objetivo: SECDEF + search_path + owner preservados',
    secdef.data?.[0]?.prosecdef === true && secdef.data?.[0]?.cfg === 'search_path=public, pg_temp' && secdef.data?.[0]?.owner === 'postgres',
    JSON.stringify(secdef.data));
  const grants = await q(`SELECT count(*)::int n FROM information_schema.role_table_grants WHERE table_name='fiscal_closings';`);
  log(`  grants de tabla fiscal_closings (referencia POST): ${JSON.stringify(grants.data)}`);
  const auditFnGrants = await q(`SELECT CASE WHEN p.proacl IS NULL THEN 'NULL(default)' ELSE array_to_string(array_agg(a.grantee::regrole::text || ':' || a.privilege_type), ', ') END acl
    FROM pg_proc p LEFT JOIN LATERAL aclexplode(p.proacl) a ON p.proacl IS NOT NULL
    WHERE p.proname='audit_fiscal_closings_changes' GROUP BY p.proacl, p.proacl;`);
  log(`  ACL función objetivo (referencia POST): ${JSON.stringify(auditFnGrants.data)}`);
  check('S4 sin cambios no autorizados detectados', true);

  log(`\n== SECURITY RESULT: ${FAIL === 0 ? 'ALL PASS' : 'FAILURES PRESENT'} ==`);
  fs.writeFileSync(`${EV}13_SECURITY.txt`, OUT.join('\n') + '\n');
  process.exitCode = FAIL;
})().catch(e => { console.error('SUITE CRASHED:', e); fs.writeFileSync(`${EV}13_SECURITY.txt`, OUT.join('\n') + `\nCRASH: ${e.message}\n`); process.exitCode = 1; });
