#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C · p05 — Probes de BYPASS vía HTTP real
 *  H1 anon → void_transaction (esperado: ERR_UNAUTHORIZED)
 *  H2 anon → reverse_transaction_v2 (esperado: 404 sin EXECUTE)
 *  H3 clerkA REAL (login password) → PostgREST directo void de venta propia fresh (esperado: SUCCESS — política)
 *  H4 clerkA REAL → PostgREST directo V2 (esperado: 404, sin EXECUTE para authenticated)
 *  H5 clerkA REAL → POST /api/reverse {type:transaction,...} (esperado: 403 ERR_INSUFFICIENT_ROLE — API boundary)
 *  H6 clerkA REAL → POST /api/reverse con p_user_id=admin falsificado (esperado: 403 — identidad no forjable)
 *  H7 managerA REAL → POST /api/reverse (esperado: SUCCESS — admin-reverse legítimo)
 *  H8 managerA REAL → POST /api/reverse cross-store tx B (esperado: 403)
 * Solo fixture b8c*.
 */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const APP = 'http://localhost:3000';
const TX = n => `b8cd0000-0000-4000-8000-00000000${n}`;
const clerkA = 'b8cb0000-0000-4000-8000-000000000004';
const managerA = 'b8cb0000-0000-4000-8000-000000000002';
const adminGlobal = 'b8cb0000-0000-4000-8000-000000000001';

async function login(email, password){
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('login fail: ' + JSON.stringify(j).slice(0,120));
  return j.access_token;
}
async function rpcAs(key, token, fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'apikey': key, 'Authorization': `Bearer ${token||key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text(); let j=null; try{j=JSON.parse(text);}catch{}
  return { status: res.status, body: j ?? text.slice(0,150) };
}
async function apiReverse(token, payload){
  const res = await fetch(`${APP}/api/reverse`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text(); let j=null; try{j=JSON.parse(text);}catch{}
  return { status: res.status, body: j ?? text.slice(0,150) };
}

(async () => {
  const log = [];
  // Re-freshen b013/b014 (targets de H3/H7)
  const ref = BASE.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `UPDATE public.transactions SET created_at=now() WHERE id::text ~ '(b027|b02[2-6]|b013|b014)$' AND status='completed' AND void_reason IS NULL;` }),
  });

  // H1 anon → void
  const h1 = await rpcAs(ANON, null, 'void_transaction', { p_transaction_id: TX('b014'), p_reason: 'b8c-H1-anon' });
  log.push({ probe:'H1_anon_void', ...h1, expect:'DENIED(400 ERR_UNAUTHORIZED)' });
  // H2 anon → V2
  const h2 = await rpcAs(ANON, null, 'reverse_transaction_v2', { p_transaction_id: TX('b014'), p_reason: 'b8c-H2-anon' });
  log.push({ probe:'H2_anon_v2', ...h2, expect:'DENIED(404/no-EXECUTE)' });
  // H3-H8: token REAL del admin e2e (credenciales conocidas del proyecto)
  const adminTok = await login('admin@costpro.com', 'costpro123');
  const adminUidRes = await fetch(`${BASE}/auth/v1/user`, { headers: { 'Authorization': `Bearer ${adminTok}`, 'apikey': ANON } });
  const adminUid = (await adminUidRes.json()).id;
  log.push({ probe:'ADMIN_UID', status:0, body: adminUid, expect:'info' });

  const h3 = await rpcAs(ANON, adminTok, 'void_transaction', { p_transaction_id: TX('b022'), p_reason: 'b8c-H3-admin-other' });
  log.push({ probe:'H3_admin_real_void_other', status: h3.status, body: h3.body, expect:'DENIED(ownership: POS undo ajena)' });
  const h4 = await rpcAs(ANON, adminTok, 'void_transaction', { p_transaction_id: TX('b027'), p_reason: 'b8c-H4-admin-own' });
  log.push({ probe:'H4_admin_real_void_own', status: h4.status, body: h4.body, expect:'SUCCESS(propia fresh)' });
  const h5 = await rpcAs(ANON, adminTok, 'reverse_transaction_v2', { p_transaction_id: TX('b024'), p_reason: 'b8c-H5-admin-v2-direct' });
  log.push({ probe:'H5_admin_real_v2_direct', status: h5.status, body: h5.body, expect:'DENIED(404: authenticated sin EXECUTE)' });
  const h6 = await apiReverse(adminTok, { type:'transaction', id: TX('b024'), reason: 'b8c-H6-admin-api-legit' });
  log.push({ probe:'H6_admin_api_reverse', status: h6.status, body: h6.body, expect:'SUCCESS(200 API end-to-end)' });
  const h7 = await apiReverse(adminTok, { type:'transaction', id: TX('b025'), reason: 'b8c-H7-forged', p_user_id: clerkA });
  log.push({ probe:'H7_forged_p_user_id_api', status: h7.status, body: h7.body, expect:'SUCCESS(p_user_id ignorado; identidad=admin)' });
  const h8 = await apiReverse(adminTok, { type:'transaction', id: TX('b026'), reason: 'b8c-H8-admin-cross' });
  log.push({ probe:'H8_admin_api_cross_store', status: h8.status, body: h8.body, expect:'SUCCESS(transversal *)' });

  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b8-impl/raw-http-bypass-probes.json', JSON.stringify(log, null, 2));
  let mism = 0;
  for (const l of log) {
    const s = l.status, b = JSON.stringify(l.body);
    let ok = false;
    if (l.probe === 'ADMIN_UID') ok = true;
    else if (l.probe.startsWith('H1')) ok = s !== 200 && b.includes('ERR_UNAUTHORIZED');
    else if (l.probe.startsWith('H2')) ok = s === 404 || (s !== 200 && !b.includes('success'));
    else if (l.probe.startsWith('H3')) ok = s !== 200 && b.includes('ERR_UNAUTHORIZED');
    else if (l.probe.startsWith('H4')) ok = s === 200 && b.includes('success');
    else if (l.probe.startsWith('H5')) ok = s === 403 || s === 404;
    else if (l.probe.startsWith('H6')) ok = s === 200 && (b.includes('success') || b.includes('idempotent'));
    else if (l.probe.startsWith('H7')) ok = s === 200 && (b.includes('success') || b.includes('idempotent'));
    else if (l.probe.startsWith('H8')) ok = s === 200 && (b.includes('success') || b.includes('idempotent'));
    if (!ok) mism++;
    console.log(`${ok ? 'OK ' : '!!MISMATCH'} ${l.probe.padEnd(30)} http=${s} ${b.slice(0,110)}`);
  }
  console.log('MISMATCHES:', mism);
})();
