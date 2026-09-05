#!/usr/bin/env node
/**
 * B-10b — R12: concurrencia. Dos reverses SIMULTÁNEOS de la misma devolución
 * vía PostgREST (service_role + p_user_id, el canal exacto de /api/reverse).
 * Esperado: 1 success + 1 ERR_ALREADY_REVERSED; 1 movimiento; 1 transición;
 * 1 audit primario.
 */
const fs = require('fs');
const REF = 'wthkddeleylijmonclxg';
// Secrets are read from environment (never hardcoded): SUPABASE_SECRET_KEY, SUPABASE_ACCESS_TOKEN
const SRK = process.env.SUPABASE_SECRET_KEY || '';
const PAT = process.env.SUPABASE_ACCESS_TOKEN || '';
if (!SRK || !PAT) { console.error('missing env SUPABASE_SECRET_KEY / SUPABASE_ACCESS_TOKEN'); process.exit(2); }
const D7 = process.argv[2];
const U1 = 'b10b0000-0000-4000-8000-0000000001a1';
const STORE_A = 'b10b0000-0000-4000-8000-00000000000a';
const P6 = 'b10b0000-0000-4000-8000-0000000002a6';

async function rpc() {
  const r = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/reverse_devolution`, {
    method: 'POST',
    headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_devolution_id: D7, p_reason: 'R12 concurrency', p_user_id: U1 }),
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 300) };
}

(async () => {
  // pre-estado
  const pre = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `SELECT jsonb_build_object('stock',(SELECT stock_current FROM public.products WHERE id='${P6}'),'inv',(SELECT quantity FROM public.inventory WHERE product_id='${P6}'),'movs',(SELECT count(*) FROM public.stock_movements WHERE reference_id='${D7}'),'audits',(SELECT count(*) FROM public.audit_logs WHERE action='REVERSE_DEVOLUTION' AND record_id='${D7}'),'status',(SELECT status FROM public.devolutions WHERE id='${D7}')) AS s` }),
  });
  const preState = (await pre.json())[0].s;

  // DOS llamadas simultáneas (el lock FOR UPDATE de la devolución decide)
  const [a, b] = await Promise.all([rpc(), rpc()]);

  // post-estado
  await new Promise(r => setTimeout(r, 500));
  const post = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `SELECT jsonb_build_object('stock',(SELECT stock_current FROM public.products WHERE id='${P6}'),'inv',(SELECT quantity FROM public.inventory WHERE product_id='${P6}'),'movs',(SELECT count(*) FROM public.stock_movements WHERE reference_id='${D7}'),'reverse_movs',(SELECT count(*) FROM public.stock_movements WHERE reference_id='${D7}' AND movement_type='devolution_reverse'),'audits',(SELECT count(*) FROM public.audit_logs WHERE action='REVERSE_DEVOLUTION' AND record_id='${D7}'),'status',(SELECT status FROM public.devolutions WHERE id='${D7}')) AS s` }),
  });
  const postState = (await post.json())[0].s;

  const out = { pre: preState, callA: a, callB: b, post: postState };
  fs.writeFileSync('/home/z/my-project/Costpro/audit-evidence/20260905-w9-b10b/raw/raw-concurrency.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
