#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C · p03 — Probes de REVERSIÓN ADMINISTRATIVA vía PostgREST
 * HTTP con service_role + p_user_id (RUTA EXACTA de /api/reverse).
 * Solo fixture b8c*. Registra outcome + estado post por probe.
 */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK  = env.SUPABASE_SERVICE_ROLE_KEY;

const A = 'b8ca0000-0000-4000-8000-0000000000a1';
const adminGlobal='b8cb0000-0000-4000-8000-000000000001', managerA='b8cb0000-0000-4000-8000-000000000002',
      encargadoA='b8cb0000-0000-4000-8000-000000000003', clerkA='b8cb0000-0000-4000-8000-000000000004',
      warehouseA='b8cb0000-0000-4000-8000-000000000005', usuarioA='b8cb0000-0000-4000-8000-000000000006',
      costoA='b8cb0000-0000-4000-8000-000000000007', adminMemberA='b8cb0000-0000-4000-8000-000000000008';
const TX = n => `b8cd0000-0000-4000-8000-00000000${n}`;

async function sql(query){
  const res = await fetch(`${BASE.replace('supabase.co','supabase.co')}/../query`.replace('/../','') , {}).catch(()=>null);
  return null;
}

async function rpc(fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json ?? text };
}

async function sqlQuery(query){
  const ref = BASE.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return { status: res.status, body: await res.json() };
}

(async () => {
  const log = [];
  // Re-freshen dedicados V2 + fixture-state fix para e001 (doble aplicación del trigger en fixture)
  await sqlQuery(`UPDATE public.transactions SET created_at = CASE WHEN id::text LIKE '%c002' THEN now() - interval '2 days' ELSE now() END
    WHERE id::text ~ '(b00[3-9a]|c002|b013|b014|e001)$' AND status='completed';
    UPDATE public.products SET stock_current = 5 WHERE id='b8cc0000-0000-4000-8000-000000000003';
    UPDATE public.inventory SET quantity = 5 WHERE store_id='${A}' AND product_id='b8cc0000-0000-4000-8000-000000000003';`);

  const probes = [
    // [name, fn, tx, actor, expected]
    ['R01_manager_other',       'reverse_transaction_v2', TX('b003'), managerA,     'SUCCESS'],
    ['R02_encargado_other',     'reverse_transaction_v2', TX('b004'), encargadoA,   'SUCCESS'],
    ['R03_adminMember_other',   'reverse_transaction_v2', TX('b005'), adminMemberA, 'SUCCESS'],
    ['R04_adminGlobal_other',   'reverse_transaction_v2', TX('b006'), adminGlobal,  'SUCCESS'],
    ['R05_clerk_denied',        'reverse_transaction_v2', TX('b007'), clerkA,       'DENIED'],
    ['R06_warehouse_denied',    'reverse_transaction_v2', TX('b008'), warehouseA,   'DENIED'],
    ['R07_usuario_denied',      'reverse_transaction_v2', TX('b009'), usuarioA,     'DENIED'],
    ['R08_costo_denied',        'reverse_transaction_v2', TX('b00a'), costoA,       'DENIED'],
    ['R09_managerA_cross_store','reverse_transaction_v2', TX('c001'), managerA,     'DENIED'],
    ['R10_manager_aged2d',      'reverse_transaction_v2', TX('c002'), managerA,     'SUCCESS'],
    ['R11_clerk_forge_admin',   'reverse_transaction_v2', TX('b013'), clerkA,       'DENIED'],
  ];

  for (const [name, fn, tx, actor, expected] of probes) {
    const r = await rpc(fn, { p_transaction_id: tx, p_reason: 'b8c-probe-' + name, p_user_id: actor });
    const ok = (expected === 'SUCCESS') ? (r.status === 200) : (r.status !== 200);
    log.push({ probe: name, outcome: r.status === 200 ? 'SUCCESS' : 'DENIED', expected,
      http: r.status, detail: typeof r.body === 'string' ? r.body.slice(0, 160) : JSON.stringify(r.body).slice(0, 200) });
  }

  // R12: integridad financiera exacta (e001: stock 5 → 10, movements sale+sale_reverse)
  const r12 = await rpc('reverse_transaction_v2', { p_transaction_id: TX('e001'), p_reason: 'b8c-probe-R12-stock', p_user_id: managerA });
  log.push({ probe: 'R12_e001_stock_check', outcome: r12.status === 200 ? 'SUCCESS' : 'DENIED', expected: 'SUCCESS', http: r12.status, detail: JSON.stringify(r12.body).slice(0, 200) });

  // R13: V2 sobre tx ya voided → idempotente (200 con status=idempotent)
  const r13 = await rpc('reverse_transaction_v2', { p_transaction_id: TX('a004'), p_reason: 'b8c-probe-R13-idempotent', p_user_id: managerA });
  log.push({ probe: 'R13_v2_on_voided_idempotent', outcome: r13.status === 200 ? 'SUCCESS' : 'DENIED', expected: 'SUCCESS', http: r13.status, detail: JSON.stringify(r13.body).slice(0, 200) });

  // POST-STATE financiero
  const post = await sqlQuery(`SELECT jsonb_build_object(
    'p3_stock', (SELECT stock_current FROM public.products WHERE id='b8cc0000-0000-4000-8000-000000000003'),
    'p3_inv',   (SELECT quantity FROM public.inventory WHERE store_id='${A}' AND product_id='b8cc0000-0000-4000-8000-000000000003'),
    'p3_movs',  (SELECT jsonb_agg(movement_type::text ORDER BY created_at) FROM public.stock_movements WHERE notes='${TX('e001')}'),
    'a004_movs',(SELECT count(*)::int FROM public.stock_movements WHERE notes='${TX('a004')}'),
    'audit_e001',(SELECT jsonb_build_object('user_id', a.user_id, 'operation', a.metadata->>'operation', 'units', a.metadata->>'units_restored', 'old', a.metadata->>'old_status', 'new', a.metadata->>'new_status')
                  FROM public.audit_logs a WHERE a.record_id='${TX('e001')}' AND a.action='REVERSE_TRANSACTION_V2' ORDER BY a.created_at DESC LIMIT 1)) AS post;`);
  log.push({ probe: 'POST_STATE', outcome: 'STATE', detail: JSON.stringify(post.body?.[0]?.post) });

  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b8-impl/raw-admin-reverse-probes.json',
    JSON.stringify({ probes: log }, null, 2));
  let mism = 0;
  for (const l of log) {
    if (l.outcome === 'STATE') { console.log('   ', l.probe, JSON.stringify(l.detail)); continue; }
    const ok = l.outcome === l.expected;
    if (!ok) mism++;
    console.log(`${ok ? 'OK ' : '!!MISMATCH'} ${l.probe.padEnd(28)} ${l.outcome} http=${l.http} ${String(l.detail).slice(0, 110)}`);
  }
  console.log('MISMATCHES:', mism);
})();
