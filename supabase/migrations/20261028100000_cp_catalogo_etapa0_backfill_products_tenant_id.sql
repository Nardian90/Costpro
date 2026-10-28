-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CATÁLOGO MAESTRO — PR 2 · ETAPA 0: REMEDIACIÓN DE INTEGRIDAD ORGANIZACIONAL
-- Backfill determinista de products.tenant_id a partir de la tienda propietaria
-- ═══════════════════════════════════════════════════════════════════════════
-- HALLAZGO (informe 28-10-2026, cap. 4 y Tabla 6; re-verificado en dry-run del
--   28-10-2026): 197 de 224 productos tienen tenant_id nulo (Puerto Padre
--   36/36; ENERVIDA 161/188). Sin remedición no hay RLS por organización
--   uniforme y el vínculo maestro heredaría el vacío.
-- MÉTODO (misión §7): derivación DETERMINISTA desde la tienda propietaria
--   (products.store_id → stores.tenant_id), que es la misma fuente que usa el
--   patrón resolveStoreTenantId del alta manual y del importador endurecido.
--   No se reasigna por coincidencia aproximada ni por nombre/SKU.
-- GARANTÍAS DE SEGURIDAD (todo dentro de la MISMA transacción; cualquier
--   verificación fallida ABORTA y revierte):
--   V1. Cada producto a remediar tiene tienda existente y activa con
--       organización válida (FK stores.tenant_id → tenants).
--   V2. Cero contradicciones: ningún producto ya etiquetado difiere del
--       tenant de su tienda (de haber uno, se aborta: caso no contemplado).
--   V3. Cero ambiguos: ninguna tienda con productos tiene tenant_id nulo.
--   V4. Cuantificación exacta antes/después: el número de filas actualizadas
--       debe igualar al contado en la verificación previa.
--   V5. Post-verificación: los únicos tenant_id nulos restantes (si los
--       hubiera) pertenecen a tiendas sin organización (hoy: 0).
-- EVIDENCIA: manifiesto completo (id, sku, tienda, tenant anterior/nuevo)
--   persistido en audit_logs (acción CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID)
--   antes y después del UPDATE; el manifiesto anterior queda en el metadata
--   del mismo registro para recuperación/auditoría.
-- REVERSIBILIDAD: UPDATE inverso posible con el manifiesto (tenant_id→NULL
--   para las filas listadas); el estado previo es trivialmente reconstruible
--   porque el único cambio es rellenar una columna derivable.
-- ALCANCE: SOLO columnas tenant_id de products. No toca precios, costos,
--   existencias, movimientos, identificadores ni ninguna otra tabla.
-- ═══════════════════════════════════════════════════════════════════════════

DO $etapa0$
DECLARE
  v_ambiguos            INTEGER;
  v_contradicciones     INTEGER;
  v_a_remediar          INTEGER;
  v_actualizadas        INTEGER := 0;
  v_nulos_restantes     INTEGER;
  v_nulos_tiendas_ok    INTEGER;
  v_manifest            JSONB;
  v_post_manifest       JSONB;
  v_sid                 UUID;
  v_filas_tienda        INTEGER;
  v_manifest_tienda     JSONB;
BEGIN
  -- ── V3: ambiguos (tienda sin organización con productos) ────────────────
  SELECT count(*) INTO v_ambiguos
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.tenant_id IS NULL AND s.tenant_id IS NULL;
  IF v_ambiguos <> 0 THEN
    RAISE EXCEPTION 'ETAPA0-V3: % productos con tienda SIN organización; casos ambiguos no se tocan (abortado)', v_ambiguos;
  END IF;

  -- ── V2: contradicciones (producto etiquetado ≠ tenant de su tienda) ─────
  SELECT count(*) INTO v_contradicciones
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.tenant_id IS NOT NULL AND s.tenant_id IS NOT NULL AND p.tenant_id <> s.tenant_id;
  IF v_contradicciones <> 0 THEN
    RAISE EXCEPTION 'ETAPA0-V2: % contradicciones producto≠tienda detectadas; inconsistencia no contemplada (abortado)', v_contradicciones;
  END IF;

  -- ── Cuantificación previa + manifiesto ANTES ────────────────────────────
  SELECT count(*), jsonb_agg(jsonb_build_object(
           'id', p.id, 'sku', p.sku, 'store_id', p.store_id,
           'tenant_anterior', p.tenant_id, 'tenant_nuevo', s.tenant_id
         ) ORDER BY p.sku)
    INTO v_a_remediar, v_manifest
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.tenant_id IS NULL AND s.tenant_id IS NOT NULL;

  IF v_a_remediar = 0 THEN
    RAISE NOTICE 'ETAPA0: nada que remediar (0 filas con tenant nulo derivable); migración idempotente termina sin cambios';
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, store_id, user_id, metadata)
  VALUES ('CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID', 'system', NULL, NULL,
          jsonb_build_object(
            'fase', 'antes',
            'alcance', 'global',
            'filas_a_remediar', v_a_remediar,
            'ambiguos', v_ambiguos,
            'contradicciones', v_contradicciones,
            'manifiesto_completo', v_manifest));

  -- Evidencia por tienda (constraint audit_logs_store_id_check exige store_id
  -- para table_name ≠ profiles/stores/system): sub-manifiesto por tienda.
  FOR v_sid IN
    SELECT DISTINCT p.store_id
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
     WHERE p.tenant_id IS NULL AND s.tenant_id IS NOT NULL
  LOOP
    SELECT count(*), jsonb_agg(jsonb_build_object(
             'id', p.id, 'sku', p.sku, 'tenant_anterior', p.tenant_id, 'tenant_nuevo', s.tenant_id
           ) ORDER BY p.sku)
      INTO v_filas_tienda, v_manifest_tienda
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
     WHERE p.store_id = v_sid AND p.tenant_id IS NULL;

    INSERT INTO public.audit_logs (action, table_name, store_id, user_id, metadata)
    VALUES ('CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID', 'products', v_sid, NULL,
            jsonb_build_object(
              'fase', 'antes',
              'filas_a_remediar', v_filas_tienda,
              'manifiesto', v_manifest_tienda));
  END LOOP;

  -- ── UPDATE determinista (solo filas inequívocas) ────────────────────────
  WITH remediadas AS (
    UPDATE public.products p
       SET tenant_id = s.tenant_id,
           updated_at = timezone('utc', now())
      FROM public.stores s
     WHERE s.id = p.store_id
       AND p.tenant_id IS NULL
       AND s.tenant_id IS NOT NULL
    RETURNING p.id, p.sku, p.store_id, s.tenant_id
  )
  SELECT count(*), jsonb_agg(jsonb_build_object(
           'id', r.id, 'sku', r.sku, 'store_id', r.store_id, 'tenant_nuevo', r.tenant_id
         ) ORDER BY r.sku)
    INTO v_actualizadas, v_post_manifest
  FROM remediadas r;

  -- ── V4: la cantidad actualizada debe igualar a la cuantificada ──────────
  IF v_actualizadas <> v_a_remediar THEN
    RAISE EXCEPTION 'ETAPA0-V4: se cuantificaron % filas pero se actualizaron %; abortado y revertido', v_a_remediar, v_actualizadas;
  END IF;

  -- ── V5: post-verificación de nulos restantes ────────────────────────────
  SELECT count(*) INTO v_nulos_restantes FROM public.products WHERE tenant_id IS NULL;
  SELECT count(*) INTO v_nulos_tiendas_ok
    FROM public.products p JOIN public.stores s ON s.id = p.store_id
   WHERE p.tenant_id IS NULL AND s.tenant_id IS NULL;
  IF v_nulos_restantes <> v_nulos_tiendas_ok THEN
    RAISE EXCEPTION 'ETAPA0-V5: % nulos restantes no justificados por tiendas sin organización (abortado)', v_nulos_restantes;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, store_id, user_id, metadata)
  VALUES ('CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID', 'system', NULL, NULL,
          jsonb_build_object(
            'fase', 'despues',
            'alcance', 'global',
            'filas_actualizadas', v_actualizadas,
            'nulos_restantes', v_nulos_restantes,
            'nulos_justificados_por_tienda_sin_tenant', v_nulos_tiendas_ok,
            'manifiesto_completo', v_post_manifest));

  FOR v_sid IN
    SELECT DISTINCT p.store_id
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
     WHERE s.tenant_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.audit_logs al
          WHERE al.action = 'CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID'
            AND al.store_id = p.store_id
            AND al.metadata->>'fase' = 'antes')
  LOOP
    -- Resumen por tienda del estado final (solo tiendas con manifiesto 'antes')
    SELECT count(*), jsonb_agg(jsonb_build_object(
             'id', p.id, 'sku', p.sku, 'tenant_nuevo', s.tenant_id) ORDER BY p.sku)
      INTO v_filas_tienda, v_manifest_tienda
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
     WHERE p.store_id = v_sid AND p.tenant_id IS NOT NULL;

    INSERT INTO public.audit_logs (action, table_name, store_id, user_id, metadata)
    VALUES ('CP_CATALOGO_ETAPA0_BACKFILL_TENANT_ID', 'products', v_sid, NULL,
            jsonb_build_object(
              'fase', 'despues',
              'filas_con_organizacion', v_filas_tienda,
              'manifiesto', v_manifest_tienda));
  END LOOP;

  RAISE NOTICE 'ETAPA0 OK: % productos remediados (tenant derivado de su tienda); nulos restantes: %', v_actualizadas, v_nulos_restantes;
END
$etapa0$;
