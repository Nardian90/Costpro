-- ============================================================================
-- Fase 3.1 — Comisiones: due_date + campos de pago flexible
-- Creado: 2026-07-13
-- Descripción: Prepara commission_payments para integrarse con Cuentas por
-- Pagar. R2 confirmada: comisiones se pagan completo o no se pagan, solo
-- efectivo/transferencia/mixto, todo en CUP.
--
-- Cambios:
--   1. Añadir due_date (period_end + 7 días de gracia)
--   2. Añadir payment_method (cash/transfer/mixto)
--   3. Añadir payment_reference (para # de transferencia)
--   4. Extender CHECK de status para aceptar 'partial' (aunque R2 dice
--      completo o nada, dejamos el campo por flexibilidad futura)
-- ============================================================================

-- ── 1. Añadir due_date a commission_payments ──
-- El vencimiento del pago = period_end + 7 días de gracia
ALTER TABLE public.commission_payments
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill: due_date = period_end + 7 días para comisiones existentes
UPDATE public.commission_payments
SET due_date = period_end + INTERVAL '7 days'
WHERE due_date IS NULL;

-- ── 2. Añadir payment_method (cash/transfer/mixto) ──
-- R2: solo efectivo, transferencia, o mixto (ambos en CUP)
ALTER TABLE public.commission_payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'mixed'));

-- ── 3. Añadir payment_reference ──
-- Para guardar el # de transferencia si aplica
ALTER TABLE public.commission_payments
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- ── 4. Trigger para set_default_due_date en commission_payments ──
-- Cuando se crea una comisión (INSERT) o cambia period_end (UPDATE),
-- calcular due_date = period_end + 7 días automáticamente.
CREATE OR REPLACE FUNCTION public.set_default_due_date_commission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NULL AND NEW.period_end IS NOT NULL THEN
    NEW.due_date := NEW.period_end + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_default_due_date_commission ON public.commission_payments;
CREATE TRIGGER trg_set_default_due_date_commission
  BEFORE INSERT OR UPDATE OF period_end ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_default_due_date_commission();

-- ── 5. Índice para consulta de Cuentas por Pagar ──
-- Consulta típica: WHERE store_id = ? AND status IN ('approved', 'paid')
-- ORDER BY due_date
CREATE INDEX IF NOT EXISTS idx_commission_payments_store_status_due_date
  ON public.commission_payments (store_id, status, due_date)
  WHERE status IN ('approved', 'paid');

-- ── 6. Comment ──
COMMENT ON TABLE public.commission_payments IS
  'Pagos de comisiones a trabajadores. R2: pago completo en CUP (efectivo/transferencia/mixto). due_date = period_end + 7 días. Integrada con Cuentas por Pagar (status approved=pending, paid=paid).';
