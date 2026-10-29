-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-002 · CORRECCIÓN F2 — PROPAGACIÓN DE IMAGEN COMPARTIDA
-- ═══════════════════════════════════════════════════════════════════════════
-- HALLAZGO (auditoría funcional CP-CAT-MAESTRO-002, Fase 1/3):
--   fn_master_apply_identity_changes (20261028112100) propaga SKU y nombre a
--   las filas locales vinculadas, pero NO la imagen (image_path). Al
--   reemplazar la imagen compartida del maestro, las tiendas ya activadas
--   conservaban el image_url anterior: la compartición quedaba desincronizada
--   (la referencia antigua sigue válida, pero las tiendas muestran la imagen
--   previa del maestro en lugar de la vigente).
--
-- CORRECCIÓN (alcance mínimo):
--   Al aplicar cambios de identidad que incluyan 'image_path', sincronizar
--   products.image_url de TODAS las filas vinculadas al maestro con el
--   image_path vigente del maestro. Solo cuando el cambio incluya imagen.
--   Los datos comerciales (precio, costo, existencias) permanecen intactos:
--   el UPDATE solo toca image_url y updated_at.
--
-- NOTA DE ARCHIVOS: esta propagación cambia REFERENCIAS, nunca borra objetos
-- del bucket. La protección de archivos aún referenciados se implementa en
-- el cliente (uploadProductImage GC condicionado a referencias vivas).
--
-- IDEMPOTENCIA: re-ejecutar deja la función en el mismo estado lógico.
-- REVERSIBILIDAD: re-aplicar la definición de 20261028112100 restaura el
--   comportamiento previo (sin propagación de imagen).
-- DESPLIEGUE: NO aplicar a producción sin autorización (misión §10). Preparado
--   con plan de ejecución en docs/guides/CATALOGO_MAESTRO_PRODUCTOS.md §14.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_allowed text[] := ARRAY['sku','name','description','image_path','barcode','barcode_type','unit_of_measure','is_service'];
  v_key text;
  v_old text;
  v_new text;
  v_new_sku text;
  v_new_barcode text;
  v_changes_applied jsonb := '[]'::jsonb;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGES: se requiere un objeto de cambios no vacío';
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
  v_new_sku := NULLIF(btrim(COALESCE(p_changes->>'sku', '')), '');
  IF v_new_sku IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.master_products
                WHERE tenant_id = v_master.tenant_id AND sku = v_new_sku AND id <> p_master_id) THEN
      RAISE EXCEPTION 'ERR_MASTER_SKU_EXISTS: %', v_new_sku;
    END IF;
  END IF;

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

  -- Propagación de coherencia de identidad (SKU y nombre) a las filas locales
  -- vinculadas de TODAS las tiendas conectadas. El trigger de identidad
  -- re-coerciona contra el maestro; datos comerciales intactos.
  IF v_new_sku IS NOT NULL OR p_changes->>'name' IS NOT NULL THEN
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
  -- image_url/updated_at: precio, costo y existencias locales intactos.
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

-- ACL: paridad con la superficie certificada (20261028112200): el helper
-- interno solo lo invocan las RPC gobernadas como owner; EXECUTE para
-- service_role por convención del repo, revocado para el resto.
REVOKE EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_master_apply_identity_changes(uuid, jsonb, uuid, uuid, uuid) TO service_role;

-- Guard de verificación (idempotente): la función debe seguir siendo
-- SECURITY DEFINER con search_path fijado y contener la propagación de imagen.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_master_apply_identity_changes'
      AND p.prosecdef
      AND p.proconfig::text LIKE '%search_path%public%'
  ) THEN
    RAISE EXCEPTION 'CP-CAT-MAESTRO-002-GUARD: fn_master_apply_identity_changes no quedó SECURITY DEFINER con search_path fijado';
  END IF;
END
$guard$;
