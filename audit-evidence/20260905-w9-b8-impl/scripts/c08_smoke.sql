WITH admin AS (SELECT id FROM public.profiles WHERE role='admin' LIMIT 1),
     clerk_m AS (SELECT m.user_id, m.store_id FROM public.user_store_memberships m WHERE m.role='clerk' AND m.status='active' LIMIT 1),
     enc_m AS (SELECT m.user_id, m.store_id FROM public.user_store_memberships m WHERE m.role='encargado' AND m.status='active' LIMIT 1),
     wh AS (SELECT m.user_id, m.store_id FROM public.user_store_memberships m WHERE m.role='warehouse' AND m.status='active' LIMIT 1)
SELECT
  (SELECT public.can_admin_reverse_transaction(admin.id, (SELECT id FROM public.stores LIMIT 1)) FROM admin) AS admin_global_any_store,
  (SELECT public.can_admin_reverse_transaction(clerk_m.user_id, clerk_m.store_id) FROM clerk_m) AS clerk_same_store_false,
  (SELECT public.can_admin_reverse_transaction(enc_m.user_id, enc_m.store_id) FROM enc_m) AS encargado_same_store_true,
  (SELECT public.can_admin_reverse_transaction(wh.user_id, wh.store_id) FROM wh) AS warehouse_same_store_false,
  (SELECT public.can_pos_undo_transaction((SELECT id FROM public.transactions WHERE status='completed' ORDER BY created_at DESC LIMIT 1), (SELECT id FROM admin)) FROM admin) AS admin_undo_old_tx_false;
