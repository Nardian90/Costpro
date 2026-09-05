#!/usr/bin/env node
/**
 * W9.5-B10 · p02 — Batería de probes de autorización (ruta EXACTA de /api/reverse:
 * service_role + p_user_id). Solo fixture b10*. Concurrency con Promise.all.
 */
const fs = require('fs');
function loadEnv(p){const t=fs.readFileSync(p,'utf8');const o={};for(const l of t.split('\n')){const m=l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'');}return o;}
const env = loadEnv('/home/z/my-project/Costpro/.env');
const BASE = env.NEXT_PUBLIC_SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const A='b10a0000-0000-4000-8000-0000000000a1', B='b10a0000-0000-4000-8000-0000000000b2';
const U = {
  adminGlobal:'b10b0000-0000-4000-8000-000000000001', managerA:'b10b0000-0000-4000-8000-000000000002',
  encargadoA:'b10b0000-0000-4000-8000-000000000003', clerkA:'b10b0000-0000-4000-8000-000000000004',
  warehouseA:'b10b0000-0000-4000-8000-000000000005', usuarioA:'b10b0000-0000-4000-8000-000000000006',
  costoA:'b10b0000-0000-4000-8000-000000000007', whAB:'b10b0000-0000-4000-8000-000000000008',
  clerkB:'b10b0000-0000-4000-8000-000000000009', managerB:'b10b0000-0000-4000-8000-00000000000a',
  clerkAB:'b10b0000-0000-4000-8000-00000000000b',
};
const E = n => `b10d0000-0000-4000-8000-00000000${n}`;
const P = n => `b10c0000-0000-4000-8000-0000000000${n}`;

async function sqlQuery(query){
  const ref = BASE.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method:'POST', headers:{'Authorization':`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body: JSON.stringify({ query })});
  return { status: res.status, body: await res.text() };
}
async function svc(fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method:'POST', headers:{'apikey':SRK,'Authorization':`Bearer ${SRK}`,'Content-Type':'application/json'},
    body: JSON.stringify(body)});
  const text = await res.text(); let j=null; try{j=JSON.parse(text);}catch{}
  return { status: res.status, body: j ?? text };
}
async function anon(fn, body){
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method:'POST', headers:{'apikey':ANON,'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const text = await res.text(); let j=null; try{j=JSON.parse(text);}catch{}
  return { status: res.status, body: j ?? text };
}

(async () => {
  const log = [];
  const probe = async (name, fn, params, actor, expected) => {
    const r = await svc(fn, { ...params, p_user_id: actor });
    const ok = (expected==='SUCCESS') ? r.status===200 : r.status!==200;
    log.push({ probe:name, outcome: r.status===200?'SUCCESS':'DENIED', expected, http:r.status,
      err: typeof r.body==='string'? r.body.slice(0,140) : JSON.stringify(r.body).slice(0,160) });
    return r;
  };
  const probeId = async (name, fn, params, p_user_id, expected) => {
    const r = await svc(fn, { ...params, p_user_id });
    const ok = (expected==='SUCCESS') ? r.status===200 : r.status!==200;
    log.push({ probe:name, outcome: r.status===200?'SUCCESS':'DENIED', expected, http:r.status,
      err: typeof r.body==='string'? r.body.slice(0,140) : JSON.stringify(r.body).slice(0,160) });
    return r;
  };

  // ═══ RECEIPT ═══
  await probe('RC01_allow_warehouse', 'reverse_receipt_v2', { p_receipt_id: E('e101'), p_reason:'B10-rc-wh' }, U.warehouseA, 'SUCCESS');
  await probe('RC02_allow_manager',   'reverse_receipt_v2', { p_receipt_id: E('e103'), p_reason:'B10-rc-mgr' }, U.managerA, 'SUCCESS');
  await probe('RC03_allow_encargado', 'reverse_receipt_v2', { p_receipt_id: E('e104'), p_reason:'B10-rc-enc' }, U.encargadoA, 'SUCCESS');
  await probe('RC04_allow_adminG',    'reverse_receipt_v2', { p_receipt_id: E('e105'), p_reason:'B10-rc-adm' }, U.adminGlobal, 'SUCCESS');
  await probe('RC05_deny_clerk',      'reverse_receipt_v2', { p_receipt_id: E('e106'), p_reason:'B10-rc-clk' }, U.clerkA, 'DENIED');
  await probe('RC06_deny_usuario',    'reverse_receipt_v2', { p_receipt_id: E('e106'), p_reason:'B10-rc-usr' }, U.usuarioA, 'DENIED');
  await probe('RC07_deny_costo',      'reverse_receipt_v2', { p_receipt_id: E('e106'), p_reason:'B10-rc-cst' }, U.costoA, 'DENIED');
  await probe('RC08_deny_cross_clerkB','reverse_receipt_v2',{ p_receipt_id: E('e106'), p_reason:'B10-rc-x' }, U.clerkB, 'DENIED');
  await probeId('RC09_identity_resolved_clerk', 'reverse_receipt_v2', { p_receipt_id: E('e106'), p_reason:'B10-rc-id' }, U.clerkA, 'DENIED');
  // atribución: warehouse con p_user_id=admin sobre R7 → SUCCESS pero audit=warehouse
  await probe('RC10_attribution_wh',  'reverse_receipt_v2', { p_receipt_id: E('e107'), p_reason:'B10-rc-attr' }, U.warehouseA, 'SUCCESS');
  // estado: R1 ya reversed → re-intento
  await probe('RC11_already_reversed','reverse_receipt_v2', { p_receipt_id: E('e101'), p_reason:'B10-rc-again' }, U.warehouseA, 'DENIED');

  // ═══ TRANSFER ═══
  await probe('TR01_allow_whAB_AtoB', 'reverse_transfer', { p_transfer_id: E('e201'), p_reason:'B10-tr-1' }, U.whAB, 'SUCCESS');
  await probe('TR02_allow_whAB_BtoA', 'reverse_transfer', { p_transfer_id: E('e202'), p_reason:'B10-tr-2' }, U.whAB, 'SUCCESS');
  await probe('TR03_deny_clerkAB_role','reverse_transfer', { p_transfer_id: E('e203'), p_reason:'B10-tr-3' }, U.clerkAB, 'DENIED'); // pasa ambos stores, falla ROL
  await probe('TR04_deny_managerA_dest','reverse_transfer',{ p_transfer_id: E('e203'), p_reason:'B10-tr-4' }, U.managerA, 'DENIED'); // sin acceso destino
  await probe('TR05_deny_cross_clerkB','reverse_transfer', { p_transfer_id: E('e201'), p_reason:'B10-tr-5' }, U.clerkB, 'DENIED'); // ya reversed
  await probe('TR06_already_reversed','reverse_transfer', { p_transfer_id: E('e201'), p_reason:'B10-tr-6' }, U.whAB, 'DENIED');

  // ═══ ADJUSTMENT (nueva función) ═══
  await probe('AD01_allow_manager',   'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e301'), p_reason:'B10-adj-mgr' }, U.managerA, 'SUCCESS');
  await probe('AD02_allow_encargado', 'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e304'), p_reason:'B10-adj-enc' }, U.encargadoA, 'SUCCESS');
  await probe('AD03_allow_adminG',    'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e305'), p_reason:'B10-adj-adm' }, U.adminGlobal, 'SUCCESS');
  await probe('AD04_deny_warehouse',  'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'B10-adj-wh' }, U.warehouseA, 'DENIED');
  await probe('AD05_deny_clerk',      'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'B10-adj-clk' }, U.clerkA, 'DENIED');
  await probe('AD06_deny_usuario',    'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'B10-adj-usr' }, U.usuarioA, 'DENIED');
  await probe('AD07_deny_costo',      'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'B10-adj-cst' }, U.costoA, 'DENIED');
  await probe('AD08_deny_cross_clerkB','reverse_inventory_adjustment_v2',{ p_adjustment_id: E('e303'), p_reason:'B10-adj-x' }, U.clerkB, 'DENIED');
  await probeId('AD09_identity_resolved_clerk', 'reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'B10-adj-id' }, U.clerkA, 'DENIED');
  await probe('AD10_already_reversed','reverse_inventory_adjustment_v2', { p_adjustment_id: E('e301'), p_reason:'B10-adj-again' }, U.managerA, 'DENIED');

  // ═══ DEVOLUTION (conservar: membresía) ═══
  await probe('DV01_allow_clerk',     'reverse_devolution', { p_devolution_id: E('e401'), p_reason:'B10-dv-clk' }, U.clerkA, 'SUCCESS');
  await probe('DV02_allow_warehouse', 'reverse_devolution', { p_devolution_id: E('e403'), p_reason:'B10-dv-wh' }, U.warehouseA, 'SUCCESS');
  await probe('DV03_allow_usuario',   'reverse_devolution', { p_devolution_id: E('e404'), p_reason:'B10-dv-usr' }, U.usuarioA, 'SUCCESS');
  await probe('DV04_allow_adminG',    'reverse_devolution', { p_devolution_id: E('e405'), p_reason:'B10-dv-adm' }, U.adminGlobal, 'SUCCESS');
  await probe('DV05_deny_cross_clerkB','reverse_devolution',{ p_devolution_id: E('e406'), p_reason:'B10-dv-x' }, U.clerkB, 'DENIED');
  await probe('DV06_state_pending',   'reverse_devolution', { p_devolution_id: E('e407'), p_reason:'B10-dv-pend' }, U.managerA, 'DENIED');
  await probe('DV07_already_reversed','reverse_devolution', { p_devolution_id: E('e401'), p_reason:'B10-dv-again' }, U.clerkA, 'DENIED');

  // ═══ PRODUCTION ORDER ═══
  await probe('PR01_allow_costo',     'reverse_production_order', { p_order_id: E('e501'), p_reason:'B10-po-cst' }, U.costoA, 'SUCCESS');
  await probe('PR02_allow_manager',   'reverse_production_order', { p_order_id: E('e503'), p_reason:'B10-po-mgr' }, U.managerA, 'SUCCESS');
  await probe('PR03_deny_encargado',  'reverse_production_order', { p_order_id: E('e504'), p_reason:'B10-po-enc' }, U.encargadoA, 'DENIED');
  await probe('PR04_deny_clerk',      'reverse_production_order', { p_order_id: E('e504'), p_reason:'B10-po-clk' }, U.clerkA, 'DENIED');
  await probe('PR05_deny_warehouse',  'reverse_production_order', { p_order_id: E('e504'), p_reason:'B10-po-wh' }, U.warehouseA, 'DENIED');
  await probe('PR06_deny_cross_clerkB','reverse_production_order',{ p_order_id: E('e504'), p_reason:'B10-po-x' }, U.clerkB, 'DENIED');
  await probe('PR07_state_in_progress','reverse_production_order',{ p_order_id: E('e505'), p_reason:'B10-po-wip' }, U.managerA, 'DENIED');
  await probe('PR08_already_reversed','reverse_production_order', { p_order_id: E('e501'), p_reason:'B10-po-again' }, U.costoA, 'DENIED');

  // ═══ CONCURRENCY (5 formas) ═══
  const conc = [];
  const [c1a,c1b] = await Promise.all([
    svc('reverse_receipt_v2', { p_receipt_id: E('e102'), p_reason:'B10-cc-1', p_user_id: U.warehouseA }),
    svc('reverse_receipt_v2', { p_receipt_id: E('e102'), p_reason:'B10-cc-2', p_user_id: U.warehouseA }),
  ]);
  conc.push({ probe:'CC1_receipt_vs_receipt', a:c1a.status, b:c1b.status });
  const [c2a,c2b] = await Promise.all([
    svc('reverse_inventory_adjustment_v2', { p_adjustment_id: E('e302'), p_reason:'B10-cc-1', p_user_id: U.managerA }),
    svc('reverse_inventory_adjustment_v2', { p_adjustment_id: E('e302'), p_reason:'B10-cc-2', p_user_id: U.encargadoA }),
  ]);
  conc.push({ probe:'CC2_adjustment_vs_adjustment', a:c2a.status, b:c2b.status });
  const [c3a,c3b] = await Promise.all([
    svc('reverse_devolution', { p_devolution_id: E('e402'), p_reason:'B10-cc-1', p_user_id: U.clerkA }),
    svc('reverse_devolution', { p_devolution_id: E('e402'), p_reason:'B10-cc-2', p_user_id: U.warehouseA }),
  ]);
  conc.push({ probe:'CC3_devolution_vs_devolution', a:c3a.status, b:c3b.status });
  const [c4a,c4b] = await Promise.all([
    svc('reverse_production_order', { p_order_id: E('e502'), p_reason:'B10-cc-1', p_user_id: U.costoA }),
    svc('reverse_production_order', { p_order_id: E('e502'), p_reason:'B10-cc-2', p_user_id: U.managerA }),
  ]);
  conc.push({ probe:'CC4_production_vs_production', a:c4a.status, b:c4b.status });
  const [c5a,c5b] = await Promise.all([
    svc('reverse_transfer', { p_transfer_id: E('e204'), p_reason:'B10-cc-1', p_user_id: U.whAB }),
    svc('reverse_transfer', { p_transfer_id: E('e204'), p_reason:'B10-cc-2', p_user_id: U.managerA }),
  ]);
  conc.push({ probe:'CC5_transfer_vs_transfer', a:c5a.status, b:c5b.status });
  log.push(...conc.map(c => ({ probe:c.probe, outcome:`${c.a}/${c.b}`, expected:'200/(400|409)' })));

  // ═══ ANON HTTP ═══
  const anonProbes = [];
  for (const [fn, params] of [
    ['reverse_receipt_v2', { p_receipt_id: E('e106'), p_reason:'anon' }],
    ['reverse_transfer', { p_transfer_id: E('e203'), p_reason:'anon' }],
    ['reverse_devolution', { p_devolution_id: E('e406'), p_reason:'anon' }],
    ['reverse_production_order', { p_order_id: E('e504'), p_reason:'anon' }],
    ['reverse_inventory_adjustment_v2', { p_adjustment_id: E('e303'), p_reason:'anon' }],
  ]) {
    const r = await anon(fn, params);
    anonProbes.push({ probe:`ANON_${fn}`, http:r.status, body: JSON.stringify(r.body).slice(0,100), expected:'non-200' });
  }
  log.push(...anonProbes.map(a => ({ probe:a.probe, outcome:`http=${a.http}`, expected:'non-200' })));

  // ═══ POST-STATE: stocks + audits ═══
  const post = await sqlQuery(`SELECT jsonb_build_object(
    'stocks', (SELECT jsonb_object_agg(id::text, stock_current ORDER BY id) FROM public.products WHERE id::text LIKE 'b10c0000%'),
    'receipt_statuses', (SELECT jsonb_object_agg(id::text, status ORDER BY id) FROM public.receipts WHERE id::text LIKE 'b10d0000%'),
    'transfer_statuses', (SELECT jsonb_object_agg(id::text, status ORDER BY id) FROM public.transfers WHERE id::text LIKE 'b10d0000%'),
    'adjustment_statuses', (SELECT jsonb_object_agg(id::text, status ORDER BY id) FROM public.inventory_adjustments WHERE id::text LIKE 'b10d0000%'),
    'counter_adjustments', (SELECT count(*)::int FROM public.inventory_adjustments WHERE id::text LIKE 'b10d0000%' AND status='confirmed' AND created_by::text LIKE 'b10b%'),
    'devolution_statuses', (SELECT jsonb_object_agg(id::text, status ORDER BY id) FROM public.devolutions WHERE id::text LIKE 'b10d0000%'),
    'prod_statuses', (SELECT jsonb_object_agg(id::text, status ORDER BY id) FROM public.production_orders WHERE id::text LIKE 'b10d0000%'),
    'audits', (SELECT jsonb_agg(jsonb_build_object('action', action, 'op', metadata->>'operation', 'user', user_id::text) ORDER BY created_at)
               FROM public.audit_logs WHERE store_id::text LIKE 'b10a0000%')
  ) AS post;`);
  let postJson = null; try { postJson = JSON.parse(post.body)[0].post; } catch {}

  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b10/raw-probes.json',
    JSON.stringify({ probes: log, concurrency: conc, post: postJson }, null, 2));
  let mism = 0;
  for (const l of log) {
    const ok = l.expected ? l.outcome===l.expected || l.expected==='non-200' : true;
    if (!ok) mism++;
    console.log(`${ok?'OK ':'!!MISMATCH'} ${l.probe.padEnd(30)} ${String(l.outcome).padEnd(12)} http=${l.http||''} ${String(l.err||'').slice(0,90)}`);
  }
  console.log('MISMATCHES:', mism);
  console.log('POST stocks:', JSON.stringify(postJson?.stocks));
})();
