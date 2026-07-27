-- V2.12.1 — Extender tabla categories existente con store_id
-- La tabla ya existe pero sin store_id. Añadimos la columna + migración.

-- 1. Añadir store_id (nullable primero para no romper datos existentes)
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE;

-- 2. Añadir is_active y updated_at
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Migrar categorías existentes: asignar a la primera tienda (o crear entries por tienda)
-- Como las categorías existentes no tienen store_id, las duplicamos para cada tienda
-- que tenga productos con esa categoría
INSERT INTO public.categories (store_id, name, is_active)
SELECT DISTINCT p.store_id, p.category, true
FROM public.products p
WHERE p.category IS NOT NULL AND p.category != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.name = p.category AND c.store_id = p.store_id
  )
ON CONFLICT DO NOTHING;

-- 4. Actualizar categorías existentes (sin store_id) asignándolas a la tienda
-- que más productos tiene con esa categoría
UPDATE public.categories c
SET store_id = (
  SELECT p.store_id FROM public.products p
  WHERE p.category = c.name
  GROUP BY p.store_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE c.store_id IS NULL;

-- 5. Constraint unique (store_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_store_name ON public.categories(store_id, name) WHERE store_id IS NOT NULL;

-- 6. RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_store_access" ON public.categories;
CREATE POLICY "categories_store_access" ON public.categories
  FOR ALL TO authenticated
  USING (store_id IS NULL OR public.has_store_access(store_id));

CREATE INDEX IF NOT EXISTS idx_categories_store ON public.categories(store_id);

NOTIFY pgrst, 'reload schema';
