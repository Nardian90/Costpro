-- ════════════════════════════════════════════════════════════════════
-- FIX (2026-07-15): permitir uploads al folder 'store-banners' dentro del bucket 'stores'
-- ════════════════════════════════════════════════════════════════════
-- Problema: StorefrontConfigPanel.tsx llama uploadStoreImage(file, 'stores', 'store-banners')
-- lo que ejecuta supabase.storage.from('stores').upload('store-banners/...', file).
-- Pero las policies INSERT existentes solo permiten 'store-logos', 'store-signatures',
-- 'store-stamps' — no 'store-banners'. Resultado: 403 "new row violates row-level
-- security policy".
--
-- Esta migración añade las 3 policies faltantes (SELECT/INSERT/UPDATE/DELETE)
-- para el folder 'store-banners' dentro del bucket 'stores', con los mismos
-- criterios que las policies existentes (authenticated + admin/manager role).
-- ════════════════════════════════════════════════════════════════════

-- ── 1. INSERT: admin o manager pueden subir banners ──
DROP POLICY IF EXISTS "store_banners_insert_admin_manager" ON storage.objects;
CREATE POLICY "store_banners_insert_admin_manager" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'stores'
    AND (storage.foldername(name))[1] = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- ── 2. SELECT: el bucket 'stores' es público, pero para consistencia añadimos policy ──
-- (los banners deben ser legibles por cualquier visitante de la vitrina)
DROP POLICY IF EXISTS "store_banners_select_public" ON storage.objects;
CREATE POLICY "store_banners_select_public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'stores'
    AND (storage.foldername(name))[1] = 'store-banners'
  );

-- ── 3. UPDATE: admin o manager pueden reemplazar banners ──
DROP POLICY IF EXISTS "store_banners_update_admin_manager" ON storage.objects;
CREATE POLICY "store_banners_update_admin_manager" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'stores'
    AND (storage.foldername(name))[1] = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    bucket_id = 'stores'
    AND (storage.foldername(name))[1] = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- ── 4. DELETE: admin o manager pueden borrar banners ──
DROP POLICY IF EXISTS "store_banners_delete_admin_manager" ON storage.objects;
CREATE POLICY "store_banners_delete_admin_manager" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'stores'
    AND (storage.foldername(name))[1] = 'store-banners'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'manager')
    )
  );

-- ── Verificación ──
SELECT 'banners_policies_created' AS status,
       (SELECT count(*) FROM pg_policy
        WHERE polrelid = 'storage.objects'::regclass
          AND polname LIKE 'store_banners_%') AS banner_policies_count;
