-- ============================================================================
-- Fase 0.2 — Índices para Cuentas por Pagar
-- Creado: 2026-07-13
-- Descripción: Índices compuestos para optimizar las consultas de la vista
-- AccountsPayableView, que filtra por store_id + status + due_date.
--
-- Antes: la consulta traía todas las recepciones/servicios de la tienda
-- y filtraba en cliente. Con datos reales (10k+ recepciones), sería lenta.
-- Ahora: índices compuestos permiten respuesta en <50ms.
-- ============================================================================

-- ── 1. Índice compuesto para receipts ──
-- Consulta típica: WHERE store_id = ? AND status != 'voided'
--                  ORDER BY due_date ASC NULLS LAST
CREATE INDEX IF NOT EXISTS idx_receipts_store_status_due_date
  ON public.receipts (store_id, status, due_date)
  WHERE status != 'voided';

-- ── 2. Índice compuesto para received_services ──
CREATE INDEX IF NOT EXISTS idx_received_services_store_status_due_date
  ON public.received_services (store_id, status, due_date)
  WHERE status != 'voided';

-- ── 3. Índice para filtrar por payment_status (Cuentas por Pagar) ──
-- Consulta típica: WHERE store_id = ? AND payment_status != 'paid'
CREATE INDEX IF NOT EXISTS idx_receipts_store_payment_status
  ON public.receipts (store_id, payment_status, due_date)
  WHERE payment_status != 'paid' AND status != 'voided';

CREATE INDEX IF NOT EXISTS idx_received_services_store_payment_status
  ON public.received_services (store_id, payment_status, due_date)
  WHERE payment_status != 'paid' AND status != 'voided';

-- ── 4. Índice para commission_payments (Fase 3) ──
-- Consulta típica: WHERE store_id = ? AND status = 'approved'
CREATE INDEX IF NOT EXISTS idx_commission_payments_store_status
  ON public.commission_payments (store_id, status, period_end)
  WHERE status IN ('approved', 'paid');

-- ── 5. Índice adicional en payment_transactions para historial por documento ──
-- Ya existe idx_payment_txn_ref, pero añadimos uno compuesto con store_id
-- para que la policy RLS lo use eficientemente.
CREATE INDEX IF NOT EXISTS idx_payment_txn_store_ref_date
  ON public.payment_transactions (store_id, ref_type, ref_id, payment_date DESC);

-- ── 6. Comment ──
COMMENT ON INDEX public.idx_receipts_store_status_due_date IS
  'Índice parcial para vista Cuentas por Pagar: filtra voided, ordena por due_date.';
