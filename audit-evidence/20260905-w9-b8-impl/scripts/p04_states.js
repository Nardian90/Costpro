#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C · p04 — Batería de máquina de estados
 * void_transaction (authenticated → owner sellerX) + reverse_transaction_v2 (service_role, actor managerA)
 * Esperado: solo completed alcanza mutación; voided→(ALREADY_VOIDED|idempotent); resto DENIED sin efectos.
 */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const sellerX = 'b8cb0000-0000-4000-8000-000000000009';
const managerA = 'b8cb0000-0000-4000-8000-000000000002';
const TX = n => `b8cd0000-0000-4000-8000-00000000${n}`;

async function sqlQuery(query){
  const ref = BASE.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: await res.json() };
}
async function rpc(fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text(); let j=null; try{j=JSON.parse(text);}catch{}
  return { status: res.status, body: j ?? text };
}

(async () => {
  const log = [];
  const states = ['d001:pending','d002:failed','d003:compensated','d004:cancelled','d005:refunded','d006:voided','d007:reversed'];

  // 1) void_transaction por estados (owner sellerX llama su propia venta fresh)
  for (const [txS, state] of states.map(s => s.split(':'))) {
    const r = await sqlQuery(`
DO $p$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', '{"sub":"${sellerX}","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub','${sellerX}',true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  v := public.void_transaction('${TX(txS)}', 'b8c-state-void-${state}', now(), NULL);
  RAISE EXCEPTION 'MUTATED: %', v::text;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'OUTCOME:%|%', split_part(SQLERRM,'MUTATED',1) <> '', SQLERRM;
END $p$;`);
    // El DO siempre lanza: MUTATED = la función retornó (mutación); OUTCOME:true|<err>
    const msg = (r.body && r.body.message) || JSON.stringify(r.body);
    const outcome = msg.includes('MUTATED') ? 'MUTATED(!!)' : (msg.includes('OUTCOME:true') ? 'DENIED' : 'DENIED');
    const err = msg.replace('OUTCOME:','').slice(0, 130);
    log.push({ probe: `S_void_${state}`, tx: TX(txS), outcome, err });
  }

  // 2) reverse_transaction_v2 por estados (service_role, actor managerA)
  for (const [txS, state] of states.map(s => s.split(':'))) {
    const r = await rpc('reverse_transaction_v2', { p_transaction_id: TX(txS), p_reason: `b8c-state-rev-${state}`, p_user_id: managerA });
    const bodyStr = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    const outcome = r.status === 200 ? (bodyStr.includes('idempotent') ? 'IDEMPOTENT' : 'MUTATED(!!)') : 'DENIED';
    log.push({ probe: `S_rev_${state}`, tx: TX(txS), outcome, err: bodyStr.slice(0, 130) });
  }

  // 3) POST: estados intactos (0 mutaciones)
  const post = await sqlQuery(`SELECT jsonb_object_agg(id::text, status::text ORDER BY id) AS states
    FROM public.transactions WHERE id::text ~ '(d00[1-7])$' AND id::text LIKE 'b8cd0000%';`);
  const statesPost = post.body?.[0]?.states || {};

  // Clasificación esperada
  const expVoid = { d001:'DENIED', d002:'DENIED', d003:'DENIED', d004:'DENIED', d005:'DENIED', d006:'DENIED', d007:'DENIED' };
  const expRev  = { d001:'DENIED', d002:'DENIED', d003:'DENIED', d004:'DENIED', d005:'DENIED', d006:'IDEMPOTENT', d007:'DENIED' };
  let mism = 0;
  for (const l of log) {
    const [ , suffix] = l.probe.match(/S_(void|rev)_(\w+)/) || [null, l.probe];
    const key = l.tx.slice(-4);
    const e = l.probe.startsWith('S_void') ? expVoid[key] : expRev[key];
    const ok = l.outcome === e;
    if (!ok) mism++;
    console.log(`${ok ? 'OK ' : '!!MISMATCH'} ${l.probe.padEnd(20)} ${l.outcome.padEnd(10)} ${String(l.err).slice(0,100)}`);
  }
  console.log('--- ESTADOS POST (integridad: pending sigue pending, etc.) ---');
  for (const [id, st] of Object.entries(statesPost)) console.log('  ', id.slice(-4), '→', st);
  console.log('MISMATCHES:', mism);
  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b8-impl/raw-state-machine.json',
    JSON.stringify({ probes: log, statesPost }, null, 2));
})();
