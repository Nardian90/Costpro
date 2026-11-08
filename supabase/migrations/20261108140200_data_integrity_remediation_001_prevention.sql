-- ═══════════════════════════════════════════════════════════════════════════
-- DATA-INTEGRITY-REMEDIATION-001 — FASE IV: PREVENCIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJETIVO: que ninguna de las dos clases de inconsistencia pueda reaparecer
-- sin ser detectada, y que los mecanismos de borrado del propio sistema no
-- generen nuevos huérfanos.
--
-- 1) check_data_integrity(): RPC read-only que devuelve el inventario de
--    inconsistencias referenciales conocidas (huérfanos por tabla, snapshots
--    con padre eliminado sin marcar, referencias suaves). Es el detector
--    uniforme para producción, E2E y la operación (misión §6: consultas de
--    detección de huérfanos integradas al sistema, sin procesos duplicados).
--
-- 2) Triggers de marcado en stores: el CASCADE stores→commission_rules ya no
--    destruye versiones (migración A marca por regla), pero el borrado de
--    tienda también debe marcar los renglones de pedido (la FK de
--    purchase_orders a stores no tiene CASCADE, este es un belt-and-suspenders
--    para los caminos que borren pedidos en cascada de tienda).
--    NOTA: la FK purchase_orders_store_id_fkey es NO ACTION: Postgres ya
--    bloquea borrar una tienda con pedidos; el trigger es defensa adicional
--    para rutas que borren pedidos explícitamente.
--
-- 3) reconcile_storage_metadata(): RPC que reporta el estado de
--    reconciliación entre storage.objects (bucket stores) y las referencias
--    de la tabla stores — la detección temprana de fantasmas que la misión
--    de respaldo hizo manual queda automatizada (misión §6 Storage:
--    verificación de existencia física, reconciliación metadatos↔archivos).
--    READ-ONLY: reporta; la corrección sigue siendo migración deliberada.
--
-- IDEMPOTENTE: CREATE OR REPLACE · DROP TRIGGER IF EXISTS · sin DML de datos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Detector uniforme de huérfanos ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_data_integrity()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() NOT IN ('service_role') AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: check_data_integrity requiere sesión autenticada o service_role';
  END IF;

  SELECT jsonb_build_object(
    'checked_at', now(),
    -- huérfanos de referencia dura (deben ser 0; si aparece alguno, fue
    -- introducido con triggers desactivados — investigar sesión/origen)
    'orphans', jsonb_build_object(
      'commission_payments_rule_applied', (SELECT count(*) FROM public.commission_payments p
        WHERE p.rule_applied_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.commission_rules r WHERE r.id = p.rule_applied_id)),
      'commission_payments_worker', (SELECT count(*) FROM public.commission_payments p
        WHERE NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.id = p.worker_id))
    ),
    -- snapshots con referencia suave (estado esperado y trazable)
    'soft_refs', jsonb_build_object(
      'commission_rule_versions_total', (SELECT count(*) FROM public.commission_rule_versions),
      'commission_rule_versions_parent_deleted_marked', (SELECT count(*) FROM public.commission_rule_versions
        WHERE parent_deleted_at IS NOT NULL),
      'commission_rule_versions_parent_deleted_UNMARKED', (SELECT count(*) FROM public.commission_rule_versions v
        WHERE parent_deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.commission_rules r WHERE r.id = v.rule_id)),
      'commission_rule_versions_changed_by_missing_profile', (SELECT count(*) FROM public.commission_rule_versions v
        WHERE v.changed_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.changed_by)),
      'purchase_order_items_total', (SELECT count(*) FROM public.purchase_order_items),
      'purchase_order_items_po_deleted_UNMARKED', (SELECT count(*) FROM public.purchase_order_items i
        WHERE i.parent_deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = i.po_id)),
      'purchase_order_items_product_deleted_UNMARKED', (SELECT count(*) FROM public.purchase_order_items i
        WHERE i.product_deleted_at IS NULL AND i.product_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = i.product_id))
    ),
    -- salud del inventario de referenciales críticos
    'fk_constraints_present', (SELECT count(*) FROM pg_constraint
      WHERE contype='f' AND conrelid IN (
        'public.commission_rules'::regclass, 'public.purchase_orders'::regclass,
        'public.products'::regclass, 'public.commission_payments'::regclass))
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_data_integrity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_data_integrity() TO authenticated, service_role;

-- ── 2. Marcado al borrar la tienda (defensa en profundidad) ───────────────
CREATE OR REPLACE FUNCTION public.mark_store_children_on_store_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  -- las versiones de reglas de la tienda quedan marcadas (sus reglas caen
  -- por CASCADE y trg_commission_rules_mark_versions las marca una a una;
  -- este marcado directo por store_id cubre el caso de reglas ya borradas
  -- cuyas versiones quedaron sin marcar por caminos históricos)
  UPDATE public.commission_rule_versions v
  SET parent_deleted_at = now()
  WHERE v.parent_deleted_at IS NULL
    AND v.snapshot->>'store_id' = OLD.id::text
    AND NOT EXISTS (SELECT 1 FROM public.commission_rules r
                     WHERE r.id = v.rule_id AND r.store_id = OLD.id);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_stores_mark_orphan_versions ON public.stores;
CREATE TRIGGER trg_stores_mark_orphan_versions
  AFTER DELETE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.mark_store_children_on_store_delete();

-- ── 3. Reconciliación Storage ↔ referencias (detector de fantasmas) ───────
-- Reporta por objeto del bucket stores: si tiene fila en storage.objects,
-- si alguna tienda lo referencia y (vía API externa no posible desde SQL)
-- deja el hook de verificación física a scripts/reconcile-storage.mjs.
-- Desde SQL se verifica la mitad referencial: filas sin referencia viva
-- (candidatas a limpieza) y referencias vivas sin fila (ya inconsistentes).
CREATE OR REPLACE FUNCTION public.reconcile_storage_metadata()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() NOT IN ('service_role') AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ERR_PERMISSION_DENIED: reconcile_storage_metadata requiere sesión autenticada o service_role';
  END IF;

  SELECT jsonb_build_object(
    'checked_at', now(),
    'stores_bucket_rows', (SELECT count(*) FROM storage.objects WHERE bucket_id='stores'),
    'rows_with_live_reference', (SELECT count(*) FROM storage.objects o
      WHERE o.bucket_id='stores' AND (
        EXISTS (SELECT 1 FROM public.stores s
                 WHERE s.logo_url LIKE '%'||o.name||'%'
                    OR s.banner_url LIKE '%'||o.name||'%'
                    OR s.signature_url LIKE '%'||o.name||'%'
                    OR s.stamp_url LIKE '%'||o.name||'%'
                    OR s.promo_images::text LIKE '%'||o.name||'%'))),
    'rows_without_reference', (SELECT coalesce(jsonb_agg(o.name ORDER BY o.name), '[]'::jsonb)
      FROM storage.objects o
      WHERE o.bucket_id='stores' AND NOT (
        EXISTS (SELECT 1 FROM public.stores s
                 WHERE s.logo_url LIKE '%'||o.name||'%'
                    OR s.banner_url LIKE '%'||o.name||'%'
                    OR s.signature_url LIKE '%'||o.name||'%'
                    OR s.stamp_url LIKE '%'||o.name||'%'
                    OR s.promo_images::text LIKE '%'||o.name||'%'))),
    'live_refs_missing_row', (SELECT coalesce(jsonb_agg(distinct ref.path ORDER BY ref.path), '[]'::jsonb)
      FROM public.stores s
      CROSS JOIN LATERAL (VALUES
        (split_part(replace(coalesce(s.logo_url,''), '/object/public/stores/', ''), '?', 1)),
        (split_part(replace(coalesce(s.banner_url,''), '/object/public/stores/', ''), '?', 1)),
        (split_part(replace(coalesce(s.signature_url,''), '/object/public/stores/', ''), '?', 1)),
        (split_part(replace(coalesce(s.stamp_url,''), '/object/public/stores/', ''), '?', 1))
      ) AS ref(path)
      WHERE ref.path <> ''
        AND NOT EXISTS (SELECT 1 FROM storage.objects o
                         WHERE o.bucket_id='stores' AND o.name = ref.path))
  ) INTO v_result;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.reconcile_storage_metadata() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_storage_metadata() TO authenticated, service_role;

-- ── 4. Verificación en línea ──────────────────────────────────────────────
SELECT 'migration_applied' AS status,
       (SELECT count(*) FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public'
           AND t.tgname IN ('trg_commission_rules_mark_versions',
                            'trg_purchase_orders_mark_items',
                            'trg_products_mark_po_items',
                            'trg_commission_rule_versions_validate_refs',
                            'trg_purchase_order_items_validate_refs',
                            'trg_stores_mark_orphan_versions')) AS triggers_prevencion,
       (SELECT count(*) FROM pg_proc WHERE proname IN
          ('check_data_integrity', 'reconcile_storage_metadata')) AS rpcs_prevencion;
