-- ============================================================================
-- Migration: 20260702000009_add_variant_id_receipt_items.sql
-- Fix G12: añadir variant_id a receipt_items para trazabilidad de variantes
-- ============================================================================

BEGIN;
ALTER TABLE public.receipt_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;
COMMIT;

CREATE INDEX IF NOT EXISTS idx_receipt_items_variant ON public.receipt_items(variant_id) WHERE variant_id IS NOT NULL;

COMMENT ON COLUMN public.receipt_items.variant_id IS 'Variante/unidad de medida usada en la recepción. NULL = unidad base.';

NOTIFY pgrst, 'reload schema';
