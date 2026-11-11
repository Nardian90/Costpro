-- ═══════════════════════════════════════════════════════════════════════════
-- CORRECCIÓN FUNCIONAL — CATÁLOGO MAESTRO DE LA ORGANIZACIÓN (2026-11-12)
-- Identidad compartida completa + SKU inmutable tras la creación.
-- ═══════════════════════════════════════════════════════════════════════════
-- REGLA NUEVA DEL PROPIETARIO (brief §2, tabla de identidad compartida):
--   · SKU       → compartido e INMUTABLE: no modificable después de la
--                 creación (sustituye a la regla anterior «bloqueado solo
--                 con movimientos» de 20261111120000 — el bloqueo por
--                 movimientos queda cubierto por la inmutabilidad total).
--   · Nombre    → compartido y editable (se añade a la edición de identidad).
--   · Imagen    → compartida y editable (modelo vigente).
--   · Descripción → compartida como base; override local vigente (modelo
--                 actual, brief §6: «conforme al modelo actual»).
--
-- ALCANCE DE ESTA MIGRACIÓN (punto único de escritura de identidad):
--   1) fn_master_apply_identity_changes: cualquier objeto de cambios que
--      incluya la clave 'sku' → ERR_SKU_IMMUTABLE (fail-closed; cubre
--      update_master_product Y las propuestas aprobadas por
--      review_master_proposal — ninguna ruta esquiva la regla). Se retira
--      'sku' del conjunto de campos editables y toda la lógica asociada
--      (unicidad del nuevo SKU, guardra de movimientos, colisión local),
--      que queda inalcanzable por diseño. El NOMBRE editable y la
--      propagación SKU/nombre/imagen se conservan íntegros.
--   2) propose_master_change: 'sku' deja de ser campo proponible →
--      ERR_SKU_IMMUTABLE en la creación de la propuesta (no encolar
--      propuestas que jamás podrán aplicarse).
--   3) trg_products_sku_immutable_guard (reemplaza a
--      trg_products_sku_movement_guard): UPDATE directo de products.sku en
--      filas SIN maestro → ERR_SKU_IMMUTABLE para CUALQUIER cambio real
--      (antes: solo con movimientos). Las filas VINCULADAS no se tocan aquí:
--      su SKU proviene siempre del maestro (trg_products_master_identity_
--      guard coerciona; la guardra (1) cubre la propagación del maestro).
--   4) Políticas de storage del bucket product-images: además del patrón
--      vigente «{productId}-{uuid}.{ext}» (producto de tienda accesible),
--      se admite el patrón «master-{masterId}-{uuid}.{ext}» cuando el
--      maestro pertenece a un tenant con alguna tienda CONECTADA accesible
--      para el usuario. Justificación: la subida de imagen compartida desde
--      MasterIdentityEditModal usa ese prefijo y la política vigente la
--      rechazaba para usuarios no administradores (defecto latente de
--      20261111120000: rompía «imagen editable» para gobernadores no
--      admin); además permite adjuntar imagen al crear desde el diálogo
--      «Catálogo de la organización» (la fila local y el maestro nacen
--      juntos). Sin objeto nuevo: solo se añade una rama al WITH CHECK/USING.
--      Seguridad: el prefijo se valida contra master_products por PK y la
--      tienda conectada por has_store_access — aislamiento por tenant
--      intacto.
--   5) Verificación fail-closed post-migración (patrón del repo).
--
-- PRESERVACIÓN: no se reescriben movimientos, documentos, inventarios ni
--   ventas; no cambian datos comerciales por tienda (la RPC de identidad
--   jamás los toca); unicidades vigentes intactas
--   (products_store_sku_unique, master_products_tenant_sku_unique).
-- IDEMPOTENCIA: CREATE OR REPLACE + DROP ... IF EXISTS (re-ejecutable sin
--   daño).
-- REVERSIBILIDAD: re-aplicar 20261030120000/20261111120000 (funciones y
--   trigger) y las políticas de 20261028091000 restaura el estado previo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) fn_master_apply_identity_changes — identidad editable SIN SKU
--    (SKU compartido e inmutable tras la creación — brief 2026-11-12 §2)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_master_apply_identity_changes(
  p_master_id uuid,
  p_changes jsonb,
  p_actor uuid,
  p_origin_store_id uuid DEFAULT NULL,
  p_proposal_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_master record;
  v_allowed text[] := ARRAY['name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
  v_old text;
  v_new text;
  v_new_barcode text;
  v_changes_applied jsonb := '[]'::jsonb;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
  END IF;

  -- CATÁLOGO-IDENTIDAD (2026-11-12) §2: el SKU es compartido e INMUTABLE
  -- tras la creación del producto. Cualquier intento (directo, propuesta
  -- aprobada u otra vía) se rechaza en este punto único de escritura con
  -- un error controlado específico — incluido un reenvío del SKU vigente
  -- (no-cambio): el contrato de identidad editable ya no contempla la
  -- clave 'sku' en absoluto.
  IF p_changes ? 'sku' THEN
    RAISE EXCEPTION 'ERR_SKU_IMMUTABLE: el SKU del producto (%) es compartido e inmutable; no puede modificarse después de su creación', p_master_id;
  END IF;

  SELECT * INTO v_master FROM public.master_products WHERE id = p_master_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ERR_INVALID_CHANGES: campo % no es identidad compartida editable', v_key;
    END IF;
  END LOOP;

  -- Validaciones de unicidad sobre los valores NUEVOS
  v_new_barcode := NULLIF(btrim(COALESCE(p_changes->>'barcode', '')), '');
  IF v_new_barcode IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE barcode = v_new_barcode AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_BARCODE_EXISTS: %', v_new_barcode;
    END IF;
  END IF;

  IF p_changes->>'name' IS NOT NULL AND btrim(p_changes->>'name') = '' THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: el nombre no puede quedar vacío';
  END IF;

  -- Aplicar campo a campo con registro de auditoría por campo.
  -- v_master es la instantánea previa (bajo lock FOR UPDATE): los old_value
  -- reflejan el estado original aunque se cambien varios campos a la vez.
  FOR v_key, v_new IN
    SELECT k, p_changes ->> k FROM jsonb_each(p_changes) AS t(k, v)
  LOOP
    v_old := to_jsonb(v_master) ->> v_key;

    EXECUTE format('UPDATE public.master_products SET %I = %L, updated_at = now() WHERE id = %L',
                   v_key, v_new, p_master_id);

    INSERT INTO public.master_change_log
      (master_product_id, tenant_id, field, old_value, new_value, actor_id, origin_store_id, proposal_id)
    VALUES
      (p_master_id, v_master.tenant_id, v_key, v_old, v_new, p_actor, p_origin_store_id, p_proposal_id);

    v_changes_applied := v_changes_applied || jsonb_build_object('field', v_key, 'old', v_old, 'new', v_new);
  END LOOP;

  -- Propagación de coherencia de identidad a las filas locales vinculadas
  -- de TODAS las tiendas conectadas. El SKU del maestro es inmutable, por lo
  -- que la asignación de SKU es idéntica al valor local (re-coerción
  -- defensiva frente a derivas; el trigger de identidad re-coerciona
  -- igualmente) y el NOMBRE nuevo es el cambio que se propaga. El trigger de
  -- identidad garantiza SKU/nombre = maestro; datos comerciales intactos.
  IF p_changes->>'name' IS NOT NULL THEN
    UPDATE public.products pr
       SET sku = m.sku,
           name = m.name,
           updated_at = now()
      FROM public.master_products m
     WHERE m.id = pr.master_product_id
       AND pr.master_product_id = p_master_id;
  END IF;

  -- CP-CAT-MAESTRO-002 (F2): propagación de la imagen compartida. Cuando el
  -- cambio de identidad incluye image_path, las filas locales vinculadas
  -- adoptan la referencia vigente del maestro (compartición por referencia;
  -- el objeto del bucket es el mismo y no se duplica). Solo se toca
  -- image_url/updated_at: los datos comerciales locales quedan intactos.
  IF p_changes->>'image_path' IS NOT NULL THEN
    UPDATE public.products pr
       SET image_url = m.image_path,
           updated_at = now()
      FROM public.master_products m
     WHERE m.id = pr.master_product_id
       AND pr.master_product_id = p_master_id
       AND m.image_path IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'master_product_id', p_master_id,
    'changes_applied', v_changes_applied
  );
END;
$function$;

-- ACL: paridad con la superficie certificada (20261030120000): el helper
-- interno solo lo invocan las RPC gobernadas como owner; EXECUTE para
-- service_role por convención del repo, revocado para el resto.
REVOKE EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) propose_master_change — 'sku' deja de ser proponible (ERR_SKU_IMMUTABLE
--    al ENCOLAR: no se admiten propuestas que nunca podrán aplicarse)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propose_master_change(
  p_master_id uuid,
  p_changes jsonb,
  p_origin_store_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_tenant uuid;
  v_proposal_id uuid;
  v_allowed text[] := ARRAY['name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
BEGIN
  IF v_caller_uid IS NULL OR p_origin_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
  END IF;

  -- CATÁLOGO-IDENTIDAD (2026-11-12) §2: el SKU es inmutable tras la creación;
  -- las propuestas que lo incluyan se rechazan al ENCOLAR (la aprobación las
  -- rechazaría igualmente en fn_master_apply_identity_changes).
  IF p_changes ? 'sku' THEN
    RAISE EXCEPTION 'ERR_SKU_IMMUTABLE: el SKU del producto (%) es compartido e inmutable; no puede proponerse su modificación', p_master_id;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_changes) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ERR_INVALID_CHANGES: campo % no es identidad compartida proponible', v_key;
    END IF;
  END LOOP;

  SELECT tenant_id INTO v_tenant FROM public.master_products WHERE id = p_master_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_MASTER_NOT_FOUND: %', p_master_id;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  INSERT INTO public.master_change_proposals
    (master_product_id, tenant_id, proposed_by, origin_store_id, changes, status)
  VALUES
    (p_master_id, v_tenant, v_caller_uid, p_origin_store_id, p_changes, 'pending')
  RETURNING id INTO v_proposal_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('PROPOSE_MASTER_CHANGE', 'master_change_proposals', v_proposal_id, p_origin_store_id, v_caller_uid,
          jsonb_build_object('master_product_id', p_master_id, 'changes', p_changes));

  RETURN jsonb_build_object('status','success','proposal_id', v_proposal_id, 'master_product_id', p_master_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.propose_master_change(uuid, jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_master_change(uuid, jsonb, uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Guardra de SKU para filas locales SIN maestro (PostgREST directo):
--    INMUTABLE tras la creación para CUALQUIER cambio real (brief §2/§8.7).
--    Las filas vinculadas quedan fuera: su SKU proviene siempre del maestro
--    (trg_products_master_identity_guard) y la regla del maestro vive en
--    fn_master_apply_identity_changes (punto único de la escritura).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_products_sku_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Filas gestionadas por el catálogo maestro: SKU gobernado arriba.
  IF NEW.master_product_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sin cambio real de SKU → coste cero (re-envíos idénticos, upserts que
  -- reescriben la columna con el mismo valor de la llave de conflicto).
  IF NEW.sku IS NOT DISTINCT FROM OLD.sku THEN
    RETURN NEW;
  END IF;

  -- CATÁLOGO-IDENTIDAD (2026-11-12) §2: el SKU es inmutable después de la
  -- creación del producto (identidad y trazabilidad; la regla anterior de
  -- bloqueo solo con movimientos queda subsumida por la inmutabilidad).
  RAISE EXCEPTION 'ERR_SKU_IMMUTABLE: el SKU del producto (%) es inmutable tras su creación; no puede modificarse', OLD.sku;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_sku_movement_guard ON public.products;
DROP FUNCTION IF EXISTS public.fn_products_sku_movement_guard();
CREATE TRIGGER trg_products_sku_immutable_guard
  BEFORE UPDATE OF sku ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_products_sku_immutable_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Políticas de storage — product-images: admitir además objetos
--    «master-{masterId}-{uuid}.{ext}» (imagen compartida del catálogo)
--    cuando el maestro pertenece a un tenant con alguna tienda CONECTADA
--    accesible para el usuario. Corrige el defecto latente de
--    20261111120000 (MasterIdentityEditModal usaba ese prefijo y la
--    política lo rechazaba para no administradores) y habilita la imagen
--    al crear desde el diálogo «Catálogo de la organización».
--    La validación es por PK de master_products (substring del nombre) —
--    sin barridos — y mantiene el aislamiento por tenant vía
--    catalog_store_links + has_store_access.
-- ─────────────────────────────────────────────────────────────────────────
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
      OR (
        name LIKE 'master-%'
        AND EXISTS (
          SELECT 1 FROM public.master_products mp
          WHERE mp.id::text = substring(name from 8 for 36)
            AND EXISTS (
              SELECT 1 FROM public.catalog_store_links csl
              WHERE csl.tenant_id = mp.tenant_id
                AND csl.status = 'connected'
                AND public.has_store_access(csl.store_id)
            )
        )
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
      OR (
        name LIKE 'master-%'
        AND EXISTS (
          SELECT 1 FROM public.master_products mp
          WHERE mp.id::text = substring(name from 8 for 36)
            AND EXISTS (
              SELECT 1 FROM public.catalog_store_links csl
              WHERE csl.tenant_id = mp.tenant_id
                AND csl.status = 'connected'
                AND public.has_store_access(csl.store_id)
            )
        )
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
      OR (
        name LIKE 'master-%'
        AND EXISTS (
          SELECT 1 FROM public.master_products mp
          WHERE mp.id::text = substring(name from 8 for 36)
            AND EXISTS (
              SELECT 1 FROM public.catalog_store_links csl
              WHERE csl.tenant_id = mp.tenant_id
                AND csl.status = 'connected'
                AND public.has_store_access(csl.store_id)
            )
        )
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
      OR (
        name LIKE 'master-%'
        AND EXISTS (
          SELECT 1 FROM public.master_products mp
          WHERE mp.id::text = substring(name from 8 for 36)
            AND EXISTS (
              SELECT 1 FROM public.catalog_store_links csl
              WHERE csl.tenant_id = mp.tenant_id
                AND csl.status = 'connected'
                AND public.has_store_access(csl.store_id)
            )
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Verificación post-migración fail-closed (patrón del repo)
-- ─────────────────────────────────────────────────────────────────────────
DO $CP_CATALOGO_IDENTIDAD_GUARD$
DECLARE
  v_fn text;
  v_fn_prop text;
  v_secdef boolean;
  v_trg integer;
  v_trg_secdef boolean;
  v_old_trg integer;
  v_master_branch integer;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef INTO v_fn, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_master_apply_identity_changes';

  IF v_fn IS NULL OR NOT v_secdef THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: fn_master_apply_identity_changes ausente o sin SECURITY DEFINER';
  END IF;
  IF v_fn NOT LIKE '%ERR_SKU_IMMUTABLE%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: falta la inmutabilidad de SKU en fn_master_apply_identity_changes';
  END IF;
  IF v_fn NOT LIKE '%p_changes ? ''sku''%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: falta la guardra explícita sobre la clave sku';
  END IF;
  IF v_fn LIKE '%ERR_SKU_LOCKED_BY_MOVEMENTS%' OR v_fn LIKE '%ERR_MASTER_SKU_CONFLICT%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: la lógica de cambio de SKU del maestro debe haber desaparecido (SKU inmutable)';
  END IF;
  IF v_fn NOT LIKE '%SET image_url = m.image_path%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: la propagación de imagen compartida debe conservarse';
  END IF;
  IF v_fn NOT LIKE '%SET sku = m.sku,%' OR v_fn NOT LIKE '%name = m.name%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: la propagación de nombre compartido debe conservarse';
  END IF;
  IF v_fn ILIKE '%price%' OR v_fn ILIKE '%cost_price%' OR v_fn ILIKE '%stock_current%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: la RPC no debe tocar datos comerciales de las tiendas';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_fn_prop
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'propose_master_change';
  IF v_fn_prop IS NULL OR v_fn_prop NOT LIKE '%ERR_SKU_IMMUTABLE%' THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: propose_master_change debe rechazar la clave sku al encolar';
  END IF;

  SELECT count(*), COALESCE(bool_or(p.prosecdef), false) INTO v_trg, v_trg_secdef
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND t.tgname = 'trg_products_sku_immutable_guard'
     AND NOT t.tgisinternal;
  IF v_trg <> 1 OR NOT v_trg_secdef THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: el trigger trg_products_sku_immutable_guard debe existir (y su función ser SECURITY DEFINER)';
  END IF;

  SELECT count(*) INTO v_old_trg
    FROM pg_trigger
   WHERE tgname = 'trg_products_sku_movement_guard' AND NOT tgisinternal;
  IF v_old_trg <> 0 THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: el trigger anterior de SKU por movimientos debe haber sido retirado';
  END IF;

  SELECT count(*) INTO v_master_branch
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('product_images_insert_product_owner',
                       'product_images_update_product_owner',
                       'product_images_delete_product_owner')
     AND (COALESCE(qual, '') ILIKE '%master_products%' OR COALESCE(with_check, '') ILIKE '%master_products%');
  IF v_master_branch <> 3 THEN
    RAISE EXCEPTION 'CP-CATALOGO-IDENTIDAD-GUARD: las 3 políticas de product-images deben incluir la rama master- (imagen compartida)';
  END IF;

  RAISE NOTICE 'CP-CATALOGO-IDENTIDAD-GUARD OK: SKU inmutable (maestro + filas sin vínculo), nombre editable compartido, imagen con política master- activa';
END
$CP_CATALOGO_IDENTIDAD_GUARD$;
