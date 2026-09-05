#!/usr/bin/env node
/**
 * B-10b — Generador de fixture (fase B) + probes SQL parametrizados.
 * Genera: p00b_fixture_dynamic.sql, p01..p13 probes.
 * Placeholders: __STORE_A__, __P1__..__P6__, __D1__..__D7__, __L1__, __L2__,
 *               __U1__, __U2__, __U3__, __GA__
 */
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/b10b';

const ID = {
  STORE_A: 'b10b0000-0000-4000-8000-00000000000a',
  STORE_B: 'b10b0000-0000-4000-8000-00000000000b',
  U1: 'b10b0000-0000-4000-8000-0000000001a1',
  U2: 'b10b0000-0000-4000-8000-0000000001b2',
  U3: 'b10b0000-0000-4000-8000-0000000001d4',
  GA: 'b10b0000-0000-4000-8000-0000000001c3',
  P1: 'b10b0000-0000-4000-8000-0000000002a1',
  P2: 'b10b0000-0000-4000-8000-0000000002a2',
  P3: 'b10b0000-0000-4000-8000-0000000002a3',
  P4: 'b10b0000-0000-4000-8000-0000000002a4',
  P5: 'b10b0000-0000-4000-8000-0000000002a5',
  P6: 'b10b0000-0000-4000-8000-0000000002a6',
  D1: '__D1__', D2: '__D2__', D3: '__D3__', D4: 'b10b0000-0000-4000-8000-0000000003a4',
  D5: 'b10b0000-0000-4000-8000-0000000003a5', D6: '__D6__', D7: '__D7__',
  L1: 'b10b0000-0000-4000-8000-0000000003b1',
  L2: 'b10b0000-0000-4000-8000-0000000003b2',
};

// ── Fase B del fixture: llamadas canónicas + drenaje + mapa de IDs ─────────
const fixtureB = `
-- ═══ B-10b fixture fase B: devoluciones canónicas (create_devolution_v2) ═══
-- claims service_role para que p_user_id sea honorado (canal API real)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
CREATE TEMP TABLE b10b_ids(name text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO b10b_ids VALUES ('D1', (public.create_devolution_v2(
  p_store_id => '${ID.STORE_A}',
  p_items => '[{"product_id":"${ID.P1}","quantity":3,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D1 happy', p_user_id => '${ID.U1}',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c1')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D2', (public.create_devolution_v2(
  p_store_id => '${ID.STORE_A}',
  p_items => '[{"product_id":"${ID.P2}","quantity":2,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D2 zero', p_user_id => '${ID.U1}',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c2')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D3', (public.create_devolution_v2(
  p_store_id => '${ID.STORE_A}',
  p_items => '[{"product_id":"${ID.P3}","quantity":3,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D3 drain', p_user_id => '${ID.U1}',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c3')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D6', (public.create_devolution_v2(
  p_store_id => '${ID.STORE_A}',
  p_items => '[{"product_id":"${ID.P5}","quantity":1,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D6 ga', p_user_id => '${ID.U1}',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c4')->>'devolution_id')::uuid);
INSERT INTO b10b_ids VALUES ('D7', (public.create_devolution_v2(
  p_store_id => '${ID.STORE_A}',
  p_items => '[{"product_id":"${ID.P6}","quantity":2,"unit_price":10}]'::jsonb,
  p_reason => 'b10b D7 concurrency', p_user_id => '${ID.U1}',
  p_original_transaction_id => 'b10b0000-0000-4000-8000-0000000004c5')->>'devolution_id')::uuid);

-- Drenaje P3 (venta canónica: stock 7→0) para el caso stock insuficiente
DO $$ BEGIN
  PERFORM public.register_stock_movement(
    '${ID.P3}', '${ID.STORE_A}', -7, 'sale', 'b10b drain P3', '${ID.U1}',
    NULL, NULL, 0, 'b10b drain', NOW(), TRUE);
END $$;

SELECT jsonb_build_object(
  'ids', (SELECT jsonb_object_agg(name, id) FROM b10b_ids),
  'products', (SELECT jsonb_object_agg(id::text, jsonb_build_object('stock',stock_current,'wac',cost_average))
               FROM public.products WHERE id IN ('${ID.P1}','${ID.P2}','${ID.P3}','${ID.P4}','${ID.P5}','${ID.P6}')),
  'inventory', (SELECT jsonb_object_agg(product_id::text, quantity) FROM public.inventory
                WHERE product_id IN ('${ID.P1}','${ID.P2}','${ID.P3}','${ID.P4}','${ID.P5}','${ID.P6}')),
  'movs', (SELECT jsonb_object_agg(product_id::text, jsonb_build_object('n',n,'delta',d))
    FROM (SELECT product_id, count(*) n, SUM(quantity_change) d FROM public.stock_movements
          WHERE product_id IN ('${ID.P1}','${ID.P2}','${ID.P3}','${ID.P4}','${ID.P5}','${ID.P6}') GROUP BY product_id) x),
  'kardex', (SELECT jsonb_object_agg(product_id::text, n)
    FROM (SELECT product_id, count(*) n FROM public.kardex_entries
          WHERE product_id IN ('${ID.P1}','${ID.P2}','${ID.P3}','${ID.P4}','${ID.P5}','${ID.P6}') GROUP BY product_id) y)
) AS fixture_state;
`;

// ── Plantilla de probe (una reversión con captura PRE/POST completa) ────────
function probe({ name, claims, target, pUserId, expect }) {
  return `-- B-10b probe: ${name} (esperado: ${expect})
SELECT set_config('request.jwt.claims', '${claims}', true);
CREATE TEMP TABLE b10b_probe(msg text, payload jsonb);
DO $probe$
DECLARE
  v_res jsonb; v_err text;
  v_pre jsonb; v_post jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '${claims}', true);
  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status
  ) INTO v_pre
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = '${ID[dP(target)]}'
  LEFT JOIN public.inventory i ON i.product_id = '${ID[dP(target)]}' AND i.store_id = d.store_id
  WHERE d.id = '${target}';

  BEGIN
    v_res := public.reverse_devolution('${target}', '${name}', ${pUserId ? `'${pUserId}'` : 'NULL'});
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  SELECT jsonb_build_object(
    'stock', p.stock_current, 'wac', p.cost_average,
    'inv', i.quantity, 'dev_status', d.status,
    'last_mov', (SELECT jsonb_build_object('type',m.movement_type,'delta',m.quantity_change,'uc',m.unit_cost,
                    'ref',m.reference_id,'doc',m.reference_doc,'bal',m.balance_after,'by',m.created_by)
                 FROM public.stock_movements m
                 WHERE m.product_id = '${ID[dP(target)]}'
                 ORDER BY m.created_at DESC, m.id DESC LIMIT 1),
    'movs_n', (SELECT count(*) FROM public.stock_movements WHERE product_id = '${ID[dP(target)]}'),
    'movs_dev', (SELECT count(*) FROM public.stock_movements WHERE reference_id = '${target}'),
    'kardex_last', (SELECT jsonb_build_object('type',k.movement_type,'qty',k.quantity,'uc',k.unit_cost,
                      'ref_type',k.reference_type,'ref_id',k.reference_id,'bal_qty',k.balance_quantity)
                 FROM public.kardex_entries k WHERE k.product_id = '${ID[dP(target)]}'
                 ORDER BY k.created_at DESC, k.id DESC LIMIT 1),
    'audits_dev', (SELECT count(*) FROM public.audit_logs WHERE action='REVERSE_DEVOLUTION' AND record_id='${target}'),
    'audit_last', (SELECT jsonb_build_object('user_id',a.user_id,'store',a.store_id,'meta',a.metadata)
                 FROM public.audit_logs a WHERE a.action='REVERSE_DEVOLUTION' AND a.record_id='${target}'
                 ORDER BY a.created_at DESC LIMIT 1),
    'wac_log', (SELECT COALESCE(jsonb_agg(jsonb_build_object('event',w.event,'qty',w.qty_in,'before',w.wac_before,'after',w.wac_after)),'[]'::jsonb)
                 FROM public.wac_change_log w WHERE w.product_id='${ID[dP(target)]}' AND w.event='devolution_reverse')
  ) INTO v_post
  FROM public.devolutions d
  LEFT JOIN public.products p ON p.id = '${ID[dP(target)]}'
  LEFT JOIN public.inventory i ON i.product_id = '${ID[dP(target)]}' AND i.store_id = d.store_id
  WHERE d.id = '${target}';

  INSERT INTO b10b_probe VALUES ('result', jsonb_build_object(
    'probe', '${name}', 'expected', '${expect}',
    'error', v_err, 'result', v_res, 'pre', v_pre, 'post', v_post));
END
$probe$;
SELECT payload FROM b10b_probe WHERE msg='result';
`;
}
// helper: target -> clave de producto principal del probe
function dP(t) {
  const map = { [ID.D1]: 'P1', [ID.D2]: 'P2', [ID.D3]: 'P3', [ID.D6]: 'P5', [ID.D7]: 'P6', [ID.L1]: 'P4', [ID.L2]: 'P4' };
  return map[t] || 'P1';
}
const IDT = ID; // alias

// R6/R6b usan L2 → P4.

const probes = [
  ['p01_happy_D1', probe({ name: 'R1 happy D1', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D1, expect: 'SUCCESS stock 13→10 inv 13→10 wac 5 kardex devolution_reverse uc5 ref=D1 audit U1' })],
  ['p02_zero_D2', probe({ name: 'R2 zero D2', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D2, expect: 'SUCCESS stock 2→0 inv 2→0 wac 3 SIN error (rama q=0)' })],
  ['p03_idempotent_D1', probe({ name: 'R3 idempotent D1(2nd)', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D1, expect: 'ERR_ALREADY_REVERSED, 0 cambios' })],
  ['p04a_pending_D4', probe({ name: 'R4a pending D4', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D4, expect: 'ERR_INVALID_STATUS' })],
  ['p04b_refunded_D5', probe({ name: 'R4b voided D5', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D5, expect: 'ERR_INVALID_STATUS' })],
  ['p05_insufficient_D3', probe({ name: 'R5 insufficient D3', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.D3, expect: 'ERR_INSUFFICIENT_STOCK, 0 cambios (rollback atómico)' })],
  ['p06_crossstore_L2', probe({ name: 'R6 cross-store U2→L2', claims: `{"role":"authenticated","sub":"${ID.U2}"}`, target: ID.L2, expect: 'ERR_UNAUTHORIZED' })],
  ['p06b_nomember_L2', probe({ name: 'R6b no-member U3→L2', claims: `{"role":"authenticated","sub":"${ID.U3}"}`, target: ID.L2, expect: 'ERR_UNAUTHORIZED' })],
  ['p07_forged_L1', probe({ name: 'R7 forged p_user_id=GA, claims U1 → L1', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.L1, pUserId: ID.GA, expect: 'SUCCESS como U1 (auth.uid()); audit.user_id=U1 ≠ GA; uc=4.5' })],
  ['p09_legacy_wac_L2', probe({ name: 'R9 legacy L2 (U1)', claims: `{"role":"authenticated","sub":"${ID.U1}"}`, target: ID.L2, expect: 'SUCCESS uc=7 (cost_average fallback) stock P4 -1' })],
  ['p10_global_admin_D6', probe({ name: 'R10 admin global GA→D6', claims: `{"role":"authenticated","sub":"${ID.GA}"}`, target: ID.D6, expect: 'SUCCESS (transversal) stock 3→2' })],
];

// p13: integridad agregada (Σ deltas, complementariedad kardex, WAC, finanzas, audit)
const p13 = `-- B-10b p13: integridad agregada del fixture tras todos los probes
SELECT jsonb_build_object(
  'chain_p1', (SELECT jsonb_build_object(
    'movs', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'d',quantity_change,'uc',unit_cost,'ref',reference_id) ORDER BY created_at)
             FROM public.stock_movements WHERE product_id='${ID.P1}'),
    'kardex', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'q',quantity,'uc',unit_cost) ORDER BY created_at)
             FROM public.kardex_entries WHERE product_id='${ID.P1}'),
    'stock', (SELECT stock_current FROM public.products WHERE id='${ID.P1}'),
    'inv', (SELECT quantity FROM public.inventory WHERE product_id='${ID.P1}'),
    'sum_delta', (SELECT SUM(quantity_change) FROM public.stock_movements WHERE product_id='${ID.P1}'),
    'wac', (SELECT cost_average FROM public.products WHERE id='${ID.P1}'))),
  'chain_p2_zero', (SELECT jsonb_build_object(
    'movs', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'d',quantity_change,'uc',unit_cost) ORDER BY created_at)
             FROM public.stock_movements WHERE product_id='${ID.P2}'),
    'kardex', (SELECT jsonb_agg(jsonb_build_object('t',movement_type,'q',quantity,'uc',unit_cost) ORDER BY created_at)
             FROM public.kardex_entries WHERE product_id='${ID.P2}'),
    'stock', (SELECT stock_current FROM public.products WHERE id='${ID.P2}'),
    'inv', (SELECT quantity FROM public.inventory WHERE product_id='${ID.P2}'),
    'wac', (SELECT cost_average FROM public.products WHERE id='${ID.P2}'))),
  'sync_invariant_all', (SELECT jsonb_agg(jsonb_build_object('product',p.id::text,'stock',p.stock_current,'inv',i.quantity,
      'ok',(p.stock_current = COALESCE(i.quantity,-999))))
    FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id AND i.store_id=p.store_id
    WHERE p.id IN ('${ID.P1}','${ID.P2}','${ID.P5}','${ID.P6}','${ID.P4}')),
  'wac_invariant', (SELECT jsonb_agg(jsonb_build_object('product',product_id::text,'before',wac_before,'after',wac_after,'qty',qty_in))
    FROM public.wac_change_log WHERE store_id='${ID.STORE_A}' AND event='devolution_reverse'),
  'finance_untouched', jsonb_build_object(
    'payments_fixture', (SELECT count(*) FROM public.payment_transactions WHERE ref_id IN (SELECT id FROM public.devolutions WHERE id IN ('${ID.D1}','${ID.D2}','${ID.D6}','${ID.D7}','${ID.L1}','${ID.L2}'))),
    'commission_payments_fixture', (SELECT count(*) FROM public.commission_payments WHERE store_id='${ID.STORE_A}')),
  'audits_fixture', (SELECT jsonb_agg(jsonb_build_object('action',action,'user',user_id,'record',record_id,'op',metadata->>'operation','pipeline',metadata->>'pipeline') ORDER BY created_at)
    FROM public.audit_logs WHERE store_id='${ID.STORE_A}' AND action IN ('REVERSE_DEVOLUTION')),
  'devs_final', (SELECT jsonb_object_agg(id::text, jsonb_build_object('status',status,'by',reversed_by,'reason',reversal_reason))
    FROM public.devolutions WHERE id IN ('${ID.D1}','${ID.D2}','${ID.D6}','${ID.D7}','${ID.L1}','${ID.L2}','${ID.D3}','${ID.D4}','${ID.D5}')),
  'traceability_D1', (SELECT jsonb_build_object(
    'movs_by_ref', (SELECT count(*) FROM public.stock_movements WHERE reference_id='${ID.D1}'),
    'kardex_via_mov', (SELECT count(*) FROM public.kardex_entries k
      WHERE k.reference_type='stock_movement' AND k.reference_id IN
        (SELECT id::uuid FROM public.stock_movements WHERE reference_id='${ID.D1}'))))
) AS integrity;
`;

for (const [fname, content] of probes) {
  fs.writeFileSync(`${OUT}/${fname}.sql`, content);
}
fs.writeFileSync(`${OUT}/p13_integrity.sql`, p13);
fs.writeFileSync(`${OUT}/p00b_fixture_dynamic.sql`, fixtureB);
console.log('OK: fixture fase B +', probes.length + 1, 'probes generados en', OUT);
