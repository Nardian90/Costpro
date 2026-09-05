#!/usr/bin/env node
/** W9.5-B10 · p03 — API real (token admin e2e) + forged identity vía authenticated EXECUTE */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP = 'http://localhost:3000';
const E = n => `b10d0000-0000-4000-8000-00000000${n}`;
const clerkA = 'b10b0000-0000-4000-8000-000000000004';

(async () => {
  const log = [];
  // login real admin
  const lr = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method:'POST', headers:{'apikey':ANON,'Content-Type':'application/json'},
    body: JSON.stringify({ email:'admin@costpro.com', password:'costpro123' })});
  const adminTok = (await lr.json()).access_token;
  log.push({ probe:'ADMIN_LOGIN', status: lr.status, body: adminTok ? 'OK' : 'FAIL', expect:'OK' });

  // API /api/reverse type=receipt (R8) → admin pasa roles → 200
  const r1 = await fetch(`${APP}/api/reverse`, { method:'POST',
    headers:{'Authorization':`Bearer ${adminTok}`,'Content-Type':'application/json'},
    body: JSON.stringify({ type:'receipt', id: E('e108'), reason:'B10-api-admin-receipt' })});
  log.push({ probe:'API_receipt_admin', status:r1.status, body:(await r1.text()).slice(0,120), expect:'200' });

  // API /api/reverse type=adjustment (ADJ3, confirmado diff-0) → 200 (contrato API end-to-end)
  const r2 = await fetch(`${APP}/api/reverse`, { method:'POST',
    headers:{'Authorization':`Bearer ${adminTok}`,'Content-Type':'application/json'},
    body: JSON.stringify({ type:'adjustment', id: E('e303'), reason:'B10-api-admin-adjustment' })});
  log.push({ probe:'API_adjustment_admin', status:r2.status, body:(await r2.text()).slice(0,120), expect:'200' });

  // API 404 documento inexistente
  const r3 = await fetch(`${APP}/api/reverse`, { method:'POST',
    headers:{'Authorization':`Bearer ${adminTok}`,'Content-Type':'application/json'},
    body: JSON.stringify({ type:'transfer', id:'00000000-0000-4000-8000-000000000000', reason:'B10-api-404' })});
  log.push({ probe:'API_transfer_404', status:r3.status, body:(await r3.text()).slice(0,100), expect:'404' });

  // Forged identity vía authenticated EXECUTE (receipt_v2 tiene EXECUTE a authenticated):
  // token REAL de admin + p_user_id=clerkA → identidad fijada a auth.uid() (admin); audit debe acreditar admin
  const r4 = await fetch(`${BASE}/rest/v1/rpc/reverse_receipt_v2`, { method:'POST',
    headers:{'apikey':ANON,'Authorization':`Bearer ${adminTok}`,'Content-Type':'application/json'},
    body: JSON.stringify({ p_receipt_id: E('e107'), p_reason:'B10-forged-puser', p_user_id: clerkA })});
  // R7 ya reversed (RC10) → idempotente/NOT_ACTIVE; usar R7 estado actual: verificar respuesta
  log.push({ probe:'DIRECT_authenticated_forged', status:r4.status, body:(await r4.text()).slice(0,140), expect:'non-200 (R7 reversed) o 200 atribuido a admin' });

  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b10/raw-api-probes.json', JSON.stringify(log, null, 2));
  for (const l of log) console.log(`${l.probe.padEnd(30)} http=${l.status} ${String(l.body).slice(0,100)}`);
})();
