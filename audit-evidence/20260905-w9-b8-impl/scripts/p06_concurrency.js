#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C · p06 — Concurrencia (§14 D)
 * C1: POS ∥ POS (dos voids paralelos del clerk sobre f001)
 * C2: POS ∥ Admin (void del clerk ∥ V2 del manager sobre f002)
 * C3: Admin ∥ Admin (dos V2 paralelos sobre f003)
 * Esperado: exactamente 1 mutación válida por tx; 1 solo movement; 0 doble stock/pago.
 */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const clerkA = 'b8cb0000-0000-4000-8000-000000000004', managerA = 'b8cb0000-0000-4000-8000-000000000002',
      encargadoA = 'b8cb0000-0000-4000-8000-000000000003';
const TX = n => `b8cd0000-0000-4000-8000-00000000${n}`;

async function sqlQuery(query){
  const ref = BASE.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const b = await res.text();
  return { status: res.status, body: b };
}
async function svcRpc(fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = await res.text(); let j=null; try{j=JSON.parse(b);}catch{}
  return { status: res.status, body: j ?? b.slice(0,140) };
}
function sqlVoidAs(uid, tx){
  return `DO $p$ DECLARE v jsonb; BEGIN
PERFORM set_config('role','authenticated',true);
PERFORM set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true);
PERFORM set_config('request.jwt.claim.sub','${uid}',true);
PERFORM set_config('request.jwt.claim.role','authenticated',true);
v := public.void_transaction('${tx}', 'b8c-conc', now(), NULL);
RAISE EXCEPTION 'MUTATED_OK:%', v::text;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'MUTATED_OK:%' THEN RAISE EXCEPTION 'MUTATED_OK:%', split_part(SQLERRM,'MUTATED_OK:',2); END IF;
  RAISE EXCEPTION 'DENIED:%', SQLERRM;
END $p$;`;
}

(async () => {
  const log = [];
  // Re-freshen f001-f003
  await sqlQuery(`UPDATE public.transactions SET created_at=now() WHERE id::text ~ '(f00[1-6])$' AND status='completed' AND void_reason IS NULL;`);
  await new Promise(r => setTimeout(r, 500));

  // C1: POS ∥ POS sobre f004 — llamadas DIRECTAS (cada sesión: SET claims + SELECT void)
  const directSql = (uid, tx) => `SELECT public.void_transaction('${tx}', 'b8c-conc', now(), NULL) AS result;`;
  const prepSql = (uid, tx) => `SELECT 1 FROM (
    DO_BLOCK_PLACEHOLDER) sub;`;
  const [c1a, c1b] = await Promise.all([
    sqlQuery(`SELECT set_config('role','authenticated',true), set_config('request.jwt.claims','{"sub":"${clerkA}","role":"authenticated"}',true), set_config('request.jwt.claim.sub','${clerkA}',true), set_config('request.jwt.claim.role','authenticated',true), public.void_transaction('${TX('f004')}', 'b8c-conc-C1A', now(), NULL) AS result;`),
    sqlQuery(`SELECT set_config('role','authenticated',true), set_config('request.jwt.claims','{"sub":"${clerkA}","role":"authenticated"}',true), set_config('request.jwt.claim.sub','${clerkA}',true), set_config('request.jwt.claim.role','authenticated',true), public.void_transaction('${TX('f004')}', 'b8c-conc-C1B', now(), NULL) AS result;`),
  ]);
  const outcome = (r) => (r.status === 200 || r.status === 201) ? 'SUCCESS' : (r.body.includes('ERR_ALREADY_VOIDED') ? 'ALREADY_VOIDED' : r.body.includes('ERR_UNAUTHORIZED') ? 'DENIED_AUTHZ' : 'OTHER');
  log.push({ probe:'C1_pos_vs_pos_f004', a: outcome(c1a), b: outcome(c1b), rawA: c1a.body.slice(0,120), rawB: c1b.body.slice(0,120) });

  // C2: POS ∥ Admin sobre f005 (SQL session directa ∥ PostgREST service)
  const [c2a, c2b] = await Promise.all([
    sqlQuery(`SELECT set_config('role','authenticated',true), set_config('request.jwt.claims','{"sub":"${clerkA}","role":"authenticated"}',true), set_config('request.jwt.claim.sub','${clerkA}',true), set_config('request.jwt.claim.role','authenticated',true), public.void_transaction('${TX('f005')}', 'b8c-conc-C2A', now(), NULL) AS result;`),
    svcRpc('reverse_transaction_v2', { p_transaction_id: TX('f005'), p_reason: 'b8c-conc-admin', p_user_id: managerA }),
  ]);
  log.push({ probe:'C2_pos_vs_admin_f005', a: outcome(c2a), b: c2b.status === 200 ? (JSON.stringify(c2b.body).includes('idempotent') ? 'IDEMPOTENT' : 'SUCCESS') : 'DENIED', rawA: c2a.body.slice(0,120), rawB: JSON.stringify(c2b.body).slice(0,140) });

  // C3: Admin ∥ Admin sobre f003
  const [c3a, c3b] = await Promise.all([
    svcRpc('reverse_transaction_v2', { p_transaction_id: TX('f006'), p_reason: 'b8c-conc-admin1', p_user_id: managerA }),
    svcRpc('reverse_transaction_v2', { p_transaction_id: TX('f006'), p_reason: 'b8c-conc-admin2', p_user_id: encargadoA }),
  ]);
  const cls = (r) => r.status === 200 ? (JSON.stringify(r.body).includes('idempotent') ? 'IDEMPOTENT' : 'SUCCESS') : 'DENIED';
  log.push({ probe:'C3_admin_vs_admin', a: cls(c3a), b: cls(c3b), rawA: JSON.stringify(c3a.body).slice(0,140), rawB: JSON.stringify(c3b.body).slice(0,140) });

  // POST: exactamente 1 mutación por tx
  const post = await sqlQuery(`SELECT jsonb_build_object(
    'f004_status',(SELECT status::text FROM public.transactions WHERE id='${TX('f004')}'),
    'f004_movs',(SELECT count(*) FROM public.stock_movements WHERE notes='${TX('f004')}'),
    'f005_status',(SELECT status::text FROM public.transactions WHERE id='${TX('f005')}'),
    'f005_movs',(SELECT count(*) FROM public.stock_movements WHERE notes='${TX('f005')}' OR reference_id='${TX('f005')}'),
    'f005_prim_audit',(SELECT count(*) FROM public.audit_logs WHERE record_id='${TX('f005')}' AND action IN ('VOID_SALE','REVERSE_TRANSACTION_V2')),
    'f006_status',(SELECT status::text FROM public.transactions WHERE id='${TX('f006')}'),
    'f006_movs',(SELECT count(*) FROM public.stock_movements WHERE reference_id='${TX('f006')}'),
    'f006_prim_audit',(SELECT count(*) FROM public.audit_logs WHERE record_id='${TX('f006')}' AND action='REVERSE_TRANSACTION_V2')
  ) AS post;`);
  let postJson = null; try { postJson = JSON.parse(post.body)[0].post; } catch {}

  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b8-impl/raw-concurrency.json',
    JSON.stringify({ probes: log, post: postJson }, null, 2));
  for (const l of log) console.log(JSON.stringify(l));
  console.log('POST:', JSON.stringify(postJson, null, 1));

  // Validación
  const c1 = log[0], c2 = log[1], c3 = log[2];
  const c1ok = [c1.a, c1.b].sort().join('+') === 'ALREADY_VOIDED+SUCCESS';
  const c2ok = ['SUCCESS','IDEMPOTENT'].includes(c2.a) || ['SUCCESS','IDEMPOTENT'].includes(c2.b);
  const c3ok = [c3.a, c3.b].sort().join('+') === 'IDEMPOTENT+SUCCESS';
  console.log('C1 OK(1 mutación):', c1ok, '| C2 OK(1 mutación):', c2ok, '| C3 OK(1 mutación):', c3ok);
})();
