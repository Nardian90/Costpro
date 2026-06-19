-- Migration: Full-text search para products
-- CM-4.1: Añade columna tsvector con búsqueda full-text en español
-- sobre name, sku, barcode, description, category.
-- El RPC get_paginated_products usa plainto_tsquery + fallback ILIKE.

-- 1. Añadir columna tsvector generada (se actualiza automáticamente)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(name, '') || ' ' ||
      coalesce(sku, '') || ' ' ||
      coalesce(barcode, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
  ) STORED;

-- 2. Crear índice GIN para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_products_search_vector
  ON public.products USING GIN (search_vector);

-- 3. El RPC get_paginated_products fue modificado para usar:
--    p.search_vector @@ plainto_tsquery('spanish', p_search_term)
--    como método primario, con fallback a ILIKE para compatibilidad.
