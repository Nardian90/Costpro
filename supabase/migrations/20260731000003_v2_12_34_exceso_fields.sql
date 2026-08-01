-- V2.12.34: Añadir campos de exceso a production_order_items
-- para soportar facturación de exceso al cliente (toggle)
ALTER TABLE public.production_order_items
  ADD COLUMN IF NOT EXISTS exceso_qty NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceso_importe NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceso_moneda TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facturar_exceso BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.production_order_items.exceso_qty IS 'Cantidad de exceso (actual_qty - budgeted_qty) cuando real > presupuestado';
COMMENT ON COLUMN public.production_order_items.exceso_importe IS 'Importe monetario del exceso a facturar al cliente';
COMMENT ON COLUMN public.production_order_items.exceso_moneda IS 'Moneda del exceso (USD, EUR, CUP)';
COMMENT ON COLUMN public.production_order_items.facturar_exceso IS 'Toggle: si TRUE, el exceso se factura al cliente en el cierre de la OT';

-- Verificación
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns
WHERE table_name = 'production_order_items';
