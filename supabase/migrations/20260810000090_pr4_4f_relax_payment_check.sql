-- PR-4.4F — Relax chk_mixed_payment_consistency tolerance for historical imports
-- ANTES: CHECK (cash + transfer + zelle = total_amount) — exact equality
-- DESPUÉS: CHECK (ABS(cash + transfer + zelle - total_amount) <= 1.00) — 1 CUP tolerance
-- Esto permite importar ventas históricas donde price_at_sale * qty puede diferir
-- del total de pagos por pequeñas diferencias de redondeo.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS chk_mixed_payment_consistency;
ALTER TABLE public.transactions ADD CONSTRAINT chk_mixed_payment_consistency
  CHECK (
    payment_method <> 'mixed'
    OR ABS((cash_amount + transfer_amount + zelle_amount) - total_amount) <= 1.00
  );

COMMENT ON CONSTRAINT chk_mixed_payment_consistency ON public.transactions IS
'PR-4.4F: Para ventas mixed, ABS(cash + transfer + zelle - total) <= 1.00 CUP. Tolerancia de 1 CUP para permitir importación de ventas históricas con pequeñas diferencias de redondeo.';
