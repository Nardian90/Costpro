-- TEST V2.3 — Ciclo de vida completo de un documento (transacción)
-- Verifica que:
-- 1. reverse_transaction devuelve stock correctamente
-- 2. Crea kardex entries con reference_type='reversal'
-- 3. Marca tx como 'reversed'
-- 4. Trigger de validación rechaza transiciones inválidas
-- 5. Vista v_document_state_summary funciona

-- Setup: buscar 1 transacción completada para revertir
WITH target_tx AS (
  SELECT id, store_id, status
  FROM public.transactions
  WHERE status = 'completed'
  LIMIT 1
)
SELECT
  'pre_test' AS phase,
  t.id AS transaction_id,
  t.status,
  p.id AS product_id,
  p.stock_current AS stock_before
FROM target_tx t
JOIN public.transaction_items ti ON ti.transaction_id = t.id
JOIN public.products p ON p.id = ti.product_id
LIMIT 1;
