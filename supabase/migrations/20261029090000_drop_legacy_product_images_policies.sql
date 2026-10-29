-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-001 (cierre integral) · R1 — CORRECCIÓN DE STORAGE
-- Eliminación de las políticas legacy peligrosas del bucket product-images
-- ═══════════════════════════════════════════════════════════════════════════
-- HALLAZGO F1 (informe de auditoría y estabilización 2026-10-29, cap. 9 y
-- tabla 6, severidad ALTA): la migración 20261028091000 creó correctamente
-- las cuatro políticas product_images_* con verificación de pertenencia del
-- objeto a un producto de una tienda accesible, pero el bucket product-images
-- conservaba COEXISTIENDO las cuatro políticas antiguas de la era pre-maestro.
--
-- Como las políticas PERMISSIVE de PostgreSQL/Supabase se combinan en
-- disyunción (OR), cualquier usuario autenticado podía seguir subiendo,
-- modificando o borrando CUALQUIER objeto del bucket por la vía de las
-- políticas antiguas, aunque las nuevas fueran correctas. El endurecimiento
-- del PR #1518 estaba instalado pero sin efecto real.
--
-- CORRECCIÓN (alcance mínimo, reversibilidad por re-CREATE):
--   1. DROP de las TRES políticas legacy de ESCRITURA, únicas responsables
--      del acceso excesivo:
--        · "Authenticated users can upload product images"  (INSERT)
--        · "Authenticated users can update product images"  (UPDATE)
--        · "Authenticated users can delete product images"  (DELETE)
--   2. Se CONSERVA la política legacy de lectura pública
--      "Public Access to Product Images" (SELECT): la lectura pública es el
--      diseño vigente del catálogo (bucket público, URLs públicas consumidas
--      por vitrina/reportes/publicadores) y no constituye acceso excesivo.
--   3. Se CONSERVAN íntegras las cuatro políticas product_images_* del PR
--      #1518 (una SELECT pública para anon+authenticated y tres de escritura
--      owner-scoped para authenticated).
--   4. GUARD ESTRICTO fail-closed que ya no se fía de un contador: verifica
--      (a) bucket público, (b) las 4 políticas esperadas presentes,
--      (c) al menos una política de lectura pública activa, y (d) que NO
--      exista NINGUNA política de escritura (INSERT/UPDATE/DELETE) sobre
--      storage.objects que referencie el bucket product-images fuera de la
--      lista blanca de las tres owner-scoped — detectando así tanto las
--      políticas esperadas como cualquier política heredada peligrosa que
--      reaparezca en el futuro.
--
-- IDIMPOTENCIA: todos los DROP usan IF EXISTS; la re-aplicación es segura.
-- REVERSIBILIDAD: re-CREATE de las tres políticas eliminadas (definiciones
--   documentadas en el encabezado de 20261028091000 y en el historial de la
--   organización). Ninguna fila de datos ni objeto del bucket se ve afectado:
--   la operación solo modifica metadatos de control de acceso.
-- COMPATIBILIDAD: la subida/actualización/eliminación de imágenes de productos
--   propios sigue funcionando por las políticas owner-scoped; las operaciones
--   sobre objetos ajenos quedan rechazadas (verificación E2E aislada
--   correspondiente a la batería CP-CAT-MAESTRO-001 §7).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) DROP de las tres políticas legacy de escritura (responsables del acceso excesivo)
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete product images" ON storage.objects;

-- 2) GUARD ESTRICTO fail-closed (detección por operación, no por contador)
DO $guard$
DECLARE
  v_bucket              BOOLEAN;
  v_owner_scoped        INTEGER;
  v_select_publicas     INTEGER;
  v_peligrosas          RECORD;
  v_lista_peligrosas    TEXT;
BEGIN
  -- (a) El bucket debe seguir público (diseño vigente del catálogo)
  SELECT public INTO v_bucket FROM storage.buckets WHERE id = 'product-images';
  IF v_bucket IS NOT TRUE THEN
    RAISE EXCEPTION 'GUARD product-images: el bucket no está público (estado: %)', v_bucket;
  END IF;

  -- (b) Las cuatro políticas esperadas del modelo owner-scoped deben existir
  SELECT count(*) INTO v_owner_scoped
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'product_images_select_public',
        'product_images_insert_product_owner',
        'product_images_update_product_owner',
        'product_images_delete_product_owner'
      );
  IF v_owner_scoped <> 4 THEN
    RAISE EXCEPTION 'GUARD product-images: se esperaban las 4 políticas product_images_*, hay %', v_owner_scoped;
  END IF;

  -- (c) La lectura pública debe conservarse (SELECT activa para el bucket)
  SELECT count(*) INTO v_select_publicas
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND (qual ILIKE '%product-images%' OR policyname = 'product_images_select_public'
           OR policyname = 'Public Access to Product Images');
  IF v_select_publicas < 1 THEN
    RAISE EXCEPTION 'GUARD product-images: no queda ninguna política de lectura pública';
  END IF;

  -- (d) CERO políticas de escritura no autorizadas que referencien el bucket.
  --     Detecta políticas heredadas peligrosas por OPERACIÓN, no por nombre:
  --     cualquier INSERT/UPDATE/DELETE sobre storage.objects cuyo filtro
  --     referencie product-images y no esté en la lista blanca owner-scoped
  --     es una vía de escritura arbitraria y aborta la migración.
  v_lista_peligrosas := '';
  FOR v_peligrosas IN
    SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
        AND (qual ILIKE '%product-images%' OR with_check ILIKE '%product-images%')
        AND policyname NOT IN (
          'product_images_insert_product_owner',
          'product_images_update_product_owner',
          'product_images_delete_product_owner'
        )
  LOOP
    v_lista_peligrosas := v_lista_peligrosas || format('%s (%s); ', v_peligrosas.policyname, v_peligrosas.cmd);
  END LOOP;

  IF v_lista_peligrosas <> '' THEN
    RAISE EXCEPTION 'GUARD product-images: políticas de escritura NO autorizadas activas sobre el bucket: %', v_lista_peligrosas;
  END IF;

  RAISE NOTICE 'product-images endurecido OK: 3 políticas legacy de escritura eliminadas, 4 owner-scoped activas, lectura pública conservada';
END
$guard$;
