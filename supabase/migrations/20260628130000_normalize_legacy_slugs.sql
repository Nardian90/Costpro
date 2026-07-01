-- Migration: 20260628130000_normalize_legacy_slugs.sql
-- Objetivo: Normalizar slugs legacy que contienen underscores a guiones.
--
-- FIX-AUDIT: Algunos slugs fueron creados antes de la centralización de slugify()
-- y contienen underscores (ej: "tienda_central_costpro"). El storefront /tienda/[slug]
-- espera slugs con guiones (que es lo que produce slugify() ahora). Esta migración
-- normaliza los slugs existentes para que coincidan con el formato esperado.
--
-- Seguridad:
--   1. Verifica colisiones antes de actualizar (ROLLBACK si hay duplicados)
--   2. Solo actualiza slugs que contienen underscores
--   3. Idempotente — seguro de ejecutar múltiples veces

-- 1. Verificar que no habrá colisiones tras la normalización
DO $$
DECLARE
  collision_count INTEGER;
BEGIN
  -- Simular la normalización y contar colisiones potenciales
  WITH normalized AS (
    SELECT REPLACE(slug, '_', '-') AS new_slug
    FROM public.stores
    WHERE slug IS NOT NULL AND position('_' in slug) > 0
  ),
  existing AS (
    SELECT slug FROM public.stores WHERE slug IS NOT NULL
  )
  SELECT COUNT(*) INTO collision_count
  FROM normalized n
  JOIN existing e ON n.new_slug = e.slug;

  IF collision_count > 0 THEN
    RAISE EXCEPTION 'Collision detected: % slug(s) would collide after normalization. Resolve manually before retrying.', collision_count;
  END IF;
END $$;

-- 2. Normalizar slugs: reemplazar underscores con guiones
UPDATE public.stores
SET slug = REPLACE(slug, '_', '-')
WHERE slug IS NOT NULL
  AND position('_' in slug) > 0;

-- 3. Verificar que no quedan slugs con underscores
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.stores
  WHERE slug IS NOT NULL AND position('_' in slug) > 0;

  IF remaining > 0 THEN
    RAISE WARNING '% slug(s) still contain underscores after migration.', remaining;
  END IF;
END $$;

-- 4. Comentario
COMMENT ON SCHEMA public IS 'Includes slug normalization migration 20260628130000';
