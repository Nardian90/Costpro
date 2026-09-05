-- Re-freshen: los tx 'fresh' envejecen; la ventana 30s exige frescura al evaluar
UPDATE public.transactions SET created_at = now() WHERE id::text LIKE 'b8cd0000%' AND status='completed' AND void_reason IS NULL AND created_at > now() - interval '2 hours' AND id::text !~ 'b001|c002';

-- W9.5-B8 MODELO C · p01 — Matriz de helpers (evaluación directa, sin mutación)
CREATE TEMP TABLE b8c_m(op text, actor text, target text, result boolean, expected text);
INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_fresh_own_clerk(a004)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000a004', v.uid::uuid), v.exp
FROM (VALUES
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','DENY(ownership-not-his)'),
  ('managerA','b8cb0000-0000-4000-8000-000000000002','DENY(no-own)'),
  ('encargadoA','b8cb0000-0000-4000-8000-000000000003','DENY(no-own)'),
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','ALLOW(own)'),
  ('warehouseA','b8cb0000-0000-4000-8000-000000000005','DENY(role+no-own)'),
  ('usuarioA','b8cb0000-0000-4000-8000-000000000006','DENY(role+no-own)'),
  ('costoA','b8cb0000-0000-4000-8000-000000000007','DENY(role+no-own)'),
  ('adminMemberA','b8cb0000-0000-4000-8000-000000000008','DENY(no-own)'),
  ('sellerX','b8cb0000-0000-4000-8000-000000000009','DENY(not-owner)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_aged_own_clerk(b001)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000b001', v.uid::uuid), v.exp
FROM (VALUES
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','DENY(window)'),
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','DENY(window)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_fresh_other_sellerX(b002)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000b002', v.uid::uuid), v.exp
FROM (VALUES
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','DENY(ownership)'),
  ('managerA','b8cb0000-0000-4000-8000-000000000002','DENY(ownership-POS)'),
  ('encargadoA','b8cb0000-0000-4000-8000-000000000003','DENY(ownership-POS)'),
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','DENY(ownership)'),
  ('sellerX','b8cb0000-0000-4000-8000-000000000009','ALLOW(own-fresh)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_fresh_own_warehouse(a005)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000a005', v.uid::uuid), v.exp
FROM (VALUES
  ('warehouseA','b8cb0000-0000-4000-8000-000000000005','DENY(role)'),
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','DENY(ownership)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_fresh_own_costo(a007)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000a007', v.uid::uuid), v.exp
FROM (VALUES
  ('costoA','b8cb0000-0000-4000-8000-000000000007','DENY(role)'),
  ('usuarioA','b8cb0000-0000-4000-8000-000000000006','DENY(role+no-own)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_fresh_own_adminMember(a008)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000a008', v.uid::uuid), v.exp
FROM (VALUES
  ('adminMemberA','b8cb0000-0000-4000-8000-000000000008','ALLOW(membership-admin-own)'),
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','DENY(ownership)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'pos_undo', v.actor, 'tx_storeB_own_clerkB(a009)', public.can_pos_undo_transaction('b8cd0000-0000-4000-8000-00000000a009', v.uid::uuid), v.exp
FROM (VALUES
  ('clerkB','b8cb0000-0000-4000-8000-00000000000a','ALLOW(own-storeB)'),
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','DENY(cross-store-ownership)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'admin_reverse', v.actor, 'store_A', public.can_admin_reverse_transaction(v.uid::uuid, 'b8ca0000-0000-4000-8000-0000000000a1'::uuid), v.exp
FROM (VALUES
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','ALLOW(transversal)'),
  ('managerA','b8cb0000-0000-4000-8000-000000000002','ALLOW'),
  ('encargadoA','b8cb0000-0000-4000-8000-000000000003','ALLOW'),
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','DENY(role)'),
  ('warehouseA','b8cb0000-0000-4000-8000-000000000005','DENY(role)'),
  ('usuarioA','b8cb0000-0000-4000-8000-000000000006','DENY(role)'),
  ('costoA','b8cb0000-0000-4000-8000-000000000007','DENY(role)'),
  ('adminMemberA','b8cb0000-0000-4000-8000-000000000008','ALLOW(membership-admin)'),
  ('sellerX','b8cb0000-0000-4000-8000-000000000009','ALLOW(encargado)')
) v(actor, uid, exp);

INSERT INTO b8c_m
SELECT 'admin_reverse', v.actor, 'store_B', public.can_admin_reverse_transaction(v.uid::uuid, 'b8ca0000-0000-4000-8000-0000000000b2'::uuid), v.exp
FROM (VALUES
  ('adminGlobal','b8cb0000-0000-4000-8000-000000000001','ALLOW(transversal)'),
  ('managerA','b8cb0000-0000-4000-8000-000000000002','DENY(cross-store)'),
  ('encargadoA','b8cb0000-0000-4000-8000-000000000003','DENY(cross-store)'),
  ('clerkA','b8cb0000-0000-4000-8000-000000000004','DENY(role+cross)'),
  ('clerkB','b8cb0000-0000-4000-8000-00000000000a','DENY(role)')
) v(actor, uid, exp);

INSERT INTO b8c_m VALUES('admin_reverse','NULL_actor','store_A', public.can_admin_reverse_transaction(NULL::uuid, 'b8ca0000-0000-4000-8000-0000000000a1'::uuid), 'DENY(null)');
INSERT INTO b8c_m VALUES('pos_undo','clerkA','NULL_tx', public.can_pos_undo_transaction(NULL::uuid, 'b8cb0000-0000-4000-8000-000000000004'::uuid), 'DENY(null)');

SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY op, actor), '[]'::jsonb) AS matrix FROM b8c_m t;
