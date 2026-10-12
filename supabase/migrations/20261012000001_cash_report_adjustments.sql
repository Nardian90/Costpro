-- 20261012000001_cash_report_adjustments.sql
--
-- AUDITORÍA DEL REPORTE DE ENTREGA (§7 del brief): vía excepcional y controlada
-- para registrar diferencias de efectivo no clasificables con los tipos de
-- movimiento existentes.
--
-- DECISIÓN DE DISEÑO (reutilización sobre nueva tabla — justificación):
--   payment_transactions YA aporta todo lo que el ajuste exige: RLS por tienda,
--   idempotency_key, store_id, actor (paid_by), fecha (payment_date/created_at),
--   nota (notes) e importe con dirección (direction). Crear una tabla nueva
--   duplicaría esa infraestructura. El CHECK de ref_type se extiende con un
--   único valor nuevo, retrocompatible: TODAS las consultas existentes filtran
--   por ref_type IN (...) explícito, por lo que los ajustes quedan
--   automáticamente fuera del RPC get_cash_report (payments = receipt|service)
--   y de cualquier otro flujo.
--
-- Semántica del ajuste:
--   ref_type      = 'adjustment'
--   direction     = 'in'  → suma al efectivo esperado (sobrante autorizado)
--                   'out' → resta del efectivo esperado (faltante autorizado)
--   amount        = > 0 (el CHECK de la tabla ya lo exige); el signo lo da direction
--   payment_method = 'cash' + currency 'CUP' (por definición afecta al efectivo)
--   notes         = justificación OBLIGATORIA (la valida el endpoint)
--
-- No se tocan datos existentes. No se eliminan filas (el trigger PT007 ya
-- prohíbe DELETE). Anulado solo vía actualización de notes/estado por el
-- flujo del endpoint con permisos.

ALTER TABLE public.payment_transactions
  DROP CONSTRAINT IF EXISTS payment_transactions_ref_type_check;

ALTER TABLE public.payment_transactions
  ADD CONSTRAINT payment_transactions_ref_type_check
  CHECK (ref_type IN ('receipt', 'service', 'production_order', 'work', 'sale', 'commission', 'adjustment'));

COMMENT ON CONSTRAINT payment_transactions_ref_type_check ON public.payment_transactions IS
  'PR-4.4I + ajustes de reporte de entrega: receipt, service, production_order, work, sale, commission, adjustment (2026-10: ajuste extraordinario del reporte de caja; direction in/out da el signo; nota obligatoria vía endpoint /api/cash-report/adjustments).';

CREATE INDEX IF NOT EXISTS idx_payment_txn_adjustments
  ON public.payment_transactions(store_id, ref_type, payment_date)
  WHERE ref_type = 'adjustment';

COMMENT ON COLUMN public.payment_transactions.direction IS
  'Origen del flujo: in = entrada de efectivo (venta/anticipo/ajuste positivo), out = salida (pago/comisión/ajuste negativo). Para ref_type=adjustment: in suma al efectivo esperado del reporte, out resta.';
