-- V2.11.1 — Fix: añadir 'voided' al CHECK constraint de inventory_adjustments
-- El trigger V2.3 ya permite pending→voided, pero el CHECK de la tabla no lo incluye

ALTER TABLE public.inventory_adjustments DROP CONSTRAINT IF EXISTS inventory_adjustments_status_check;
ALTER TABLE public.inventory_adjustments ADD CONSTRAINT inventory_adjustments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'reversed'::text, 'voided'::text]));

NOTIFY pgrst, 'reload schema';
