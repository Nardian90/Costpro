-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 1 (bloqueos de seguridad previos) · PARTE 2/2
-- Configuración versionada del bucket product-images y sus políticas
-- ═══════════════════════════════════════════════════════════════════════════
-- HALLAZGO (informe 28-10-2026, cap. 3.3 y Tabla 6): el bucket product-images
--   se creó fuera del control de versiones: sin migración que lo declare y
--   sin políticas de almacenamiento reproducibles. Cualquier activo compartido
--   del futuro catálogo maestro dependería de configuración no versionada.
-- CORRECCIÓN:
--   1. El bucket se declara en migración (idempotente) con estado público,
--      que es el estado real y documentado (URLs públicas construidas por
--      getSupabaseUrl / vitrina / Telegram / WhatsApp).
--   2. Políticas por operación sobre storage.objects:
--      · SELECT  público (anon + authenticated): refleja el bucket público.
--      · INSERT/UPDATE/DELETE para authenticated SOLO si el nombre del objeto
--        referencia un producto real cuyo prefijo (36 primeros caracteres,
--        formato vigente «{productId}-{uuid}.{ext}», ver
--        catalogService.uploadProductImage) pertenece a una tienda a la que el
--        usuario tiene acceso (has_store_access) o si es admin de plataforma.
--   Esto cierra la subida/eliminación arbitraria de objetos sin abrir
--   permisos amplios (la lectura pública se mantiene porque el bucket ya es
--   público y así lo consumen vitrina, botánica de reportes y publicadores).
-- COMPATIBILIDAD:
--   · Reemplazo de imagen: borra el archivo anterior del MISMO producto → el
--     prefijo coincide → permitido.
--   · Limpieza futura de huérfanos (40 archivos): se ejecutará con
--     service_role (bypassa RLS) o como admin, con manifiesto recuperable.
--   · Ningún flujo existente sube objetos con prefijo ajeno a un producto.
-- REVERSIBILIDAD: DROP de las políticas restaura el estado «sin políticas».
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Declaración versionada del bucket (estado público, idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Lectura pública coherente con bucket público
DROP POLICY IF EXISTS "product_images_select_public" ON storage.objects;
CREATE POLICY "product_images_select_public" ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

-- 3) Escrituras condicionadas a pertenencia del objeto a un producto accesible
--    Nombre vigente: «{productId}-{uuid}.{ext}» → productId = left(name, 36).

DROP POLICY IF EXISTS "product_images_insert_product_owner" ON storage.objects;
CREATE POLICY "product_images_insert_product_owner" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id::text = left(name, 36)
          AND public.has_store_access(p.store_id)
      )
    )
  );

DROP POLICY IF EXISTS "product_images_update_product_owner" ON storage.objects;
CREATE POLICY "product_images_update_product_owner" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id::text = left(name, 36)
          AND public.has_store_access(p.store_id)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id::text = left(name, 36)
          AND public.has_store_access(p.store_id)
      )
    )
  );

DROP POLICY IF EXISTS "product_images_delete_product_owner" ON storage.objects;
CREATE POLICY "product_images_delete_product_owner" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id::text = left(name, 36)
          AND public.has_store_access(p.store_id)
      )
    )
  );

-- 4) Verificación post-migración documentada
DO $verification$
DECLARE
  v_bucket BOOLEAN;
  v_policies INTEGER;
BEGIN
  SELECT public INTO v_bucket FROM storage.buckets WHERE id = 'product-images';
  SELECT count(*) INTO v_policies
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'product_images_%';
  IF v_bucket IS NOT TRUE THEN
    RAISE EXCEPTION 'GUARD product-images: el bucket no quedó público (estado: %)', v_bucket;
  END IF;
  IF v_policies <> 4 THEN
    RAISE EXCEPTION 'GUARD product-images: se esperaban 4 políticas, hay %', v_policies;
  END IF;
  RAISE NOTICE 'product-images versionado OK: bucket público + % políticas', v_policies;
END
$verification$;
