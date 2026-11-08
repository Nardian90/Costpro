-- ═══════════════════════════════════════════════════════════════════════════
-- DATA-INTEGRITY-REMEDIATION-001 — PROBLEMA A: referencias suaves para las
-- tablas de snapshot histórico (72 versiones de reglas de comisión +
-- 10 posiciones de pedido) con marcador explícito de padre eliminado
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTEXTO FORENSE (evidencia: docs/audits/DATA-INTEGRITY-REMEDIATION-001/):
--   · commission_rule_versions es una tabla de SNAPSHOTS (columna jsonb
--     `snapshot`, trigger commission_rules_snapshot en cada INSERT/UPDATE de
--     regla). Las 72 filas huérfanas son versiones v1 legítimas de reglas
--     que existieron (ráfaga 2026-08-06 → 2026-10-05, 72 reglas distintas de
--     21 tiendas hoy inexistentes).
--   · purchase_order_items es snapshot comercial autónomo (product_name,
--     sku, unit_cost, quantity_*): sus 10 filas (100 % de la tabla) apuntan a
--     pedidos/productos eliminados sin dejar rastro de auditoría.
--   · Los padres fueron eliminados con triggers de FK desactivados
--     (patrón session_replication_role=replica de los scripts demo-reset),
--     por eso las constraints CASCADE no actuaron y las filas sobrevivieron.
--   · Cero dependencias financieras vivas de los padres muertos: el único
--     commission_payment existente referencia la regla VIVA; kardex,
--     stock_movements y transaction_items no referencian los productos
--     muertos (verificado sobre el dump fiel 20261108-0056).
--
-- TRATAMIENTO (R2 — conservación histórica, misión §4):
--   · NO se elimina historia: los snapshots se conservan íntegros.
--   · NO se recrean padres muertos (72 reglas + 21 tiendas + ~70 workers
--     resucitados serían datos ficticios operativos — prohibido §2.5).
--   · Las FK duras de las tablas de snapshot se convierten en REFERENCIAS
--     SUAVES: se conservan los UUID (trazabilidad del padre que existió) y
--     se añade parent_deleted_at como marcador explícito.
--   · Integridad de ESCRITURA preservada: triggers BEFORE validan que las
--     filas NUEVAS apunten a padres existentes (las FK solo dejan de
--     bloquear la ELIMINACIÓN de padres, que es lo que destruía historia).
--   · Triggers de marcado: al eliminar un padre, sus snapshots quedan
--     marcados parent_deleted_at=now() en lugar de ser destruidos por
--     CASCADE (comportamiento anterior: pérdida silenciosa de historial).
--
-- COMPATIBILIDAD:
--   · commission_rule_products conserva su FK CASCADE (join operativo sin
--     valor histórico) — solo las tablas de snapshot pasan a referencia suave.
--   · commission_payments.rule_applied_id conserva su FK ON DELETE SET NULL
--     (semántica correcta ya).
--   · La semántica cambia para managed_hard_delete_user: eliminar una cuenta
--     ya no necesita desvincular commission_rule_versions.changed_by (la
--     referencia es suave; el UUID sobrevive como proveniencia histórica).
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS ·
--   CREATE OR REPLACE · DROP TRIGGER IF EXISTS · backfills con filtro
--   IS NULL (segunda ejecución = cero cambios).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Marcadores de padre eliminado ──────────────────────────────────────
ALTER TABLE public.commission_rule_versions
  ADD COLUMN IF NOT EXISTS parent_deleted_at timestamptz;

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS parent_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS product_deleted_at timestamptz;

COMMENT ON COLUMN public.commission_rule_versions.parent_deleted_at IS
  'DATA-INTEGRITY-REMEDIATION-001: la regla padre fue eliminada en esta fecha (trigger trg_commission_rules_mark_versions). Para las 72 filas históricas consolidadas por el backfill de esta migración es la fecha de PRIMERA DETECCIÓN certificada (respaldo 20261108-0056), no la fecha real del borrado (indeterminable: la eliminación no dejó auditoría).';
COMMENT ON COLUMN public.purchase_order_items.parent_deleted_at IS
  'DATA-INTEGRITY-REMEDIATION-001: el pedido padre (po_id) fue eliminado en esta fecha (trigger trg_purchase_orders_mark_items). Backfill = fecha de primera detección.';
COMMENT ON COLUMN public.purchase_order_items.product_deleted_at IS
  'DATA-INTEGRITY-REMEDIATION-001: el producto referenciado (product_id) fue eliminado en esta fecha (trigger trg_products_mark_po_items). El renglón conserva su snapshot comercial (product_name, sku, unit_cost, quantity_*). Backfill = fecha de primera detección.';

-- ── 2. Conversión a referencia suave (DROP FK) ────────────────────────────
-- El CASCADE de rule_id era el mecanismo que DESTRUIA el historial de
-- versiones al borrar una regla por la API; changed_by (NO ACTION) es
-- proveniencia del autor del cambio y debe sobrevivir a la eliminación de
-- la cuenta (los 17 perfiles referenciados ya no existen: sin FK, el UUID
-- queda como referencia suave verificable por check_data_integrity()).
ALTER TABLE public.commission_rule_versions
  DROP CONSTRAINT IF EXISTS commission_rule_versions_rule_id_fkey,
  DROP CONSTRAINT IF EXISTS commission_rule_versions_changed_by_fkey;

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_po_id_fkey,
  DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey;

-- ── 3. Backfill: marcar los huérfanos existentes ──────────────────────────
DO $$
DECLARE
  v_crv_rule int := 0;
  v_crv_changed int := 0;
  v_poi_po int := 0;
  v_poi_prod int := 0;
BEGIN
  UPDATE public.commission_rule_versions v
  SET parent_deleted_at = now()
  WHERE v.parent_deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.commission_rules r WHERE r.id = v.rule_id);
  GET DIAGNOSTICS v_crv_rule = ROW_COUNT;

  -- Conteo de referencias suaves changed_by (SELECT, no UPDATE: un UPDATE
  -- que toque changed_by dispararía la validación de escritura de esta misma
  -- migración — que rechazaría correctamente los 18 huérfanos históricos).
  SELECT count(*) INTO v_crv_changed
  FROM public.commission_rule_versions v
  WHERE v.changed_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.changed_by);

  UPDATE public.purchase_order_items i
  SET parent_deleted_at = now()
  WHERE i.parent_deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = i.po_id);
  GET DIAGNOSTICS v_poi_po = ROW_COUNT;

  UPDATE public.purchase_order_items i
  SET product_deleted_at = now()
  WHERE i.product_deleted_at IS NULL
    AND i.product_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = i.product_id);
  GET DIAGNOSTICS v_poi_prod = ROW_COUNT;

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, metadata)
  SELECT 'system', NULL, 'DATA-INTEGRITY-REMEDIATION-001',
         jsonb_build_object(
           'tabla', 'commission_rule_versions',
           'tratamiento', 'R2-conservacion-historica',
           'versiones_marcadas_regla_eliminada', v_crv_rule,
           'referencias_suaves_changed_by', v_crv_changed,
           'restricciones_retiradas', '[commission_rule_versions_rule_id_fkey, commission_rule_versions_changed_by_fkey]',
           'nota', 'Snapshots historicos conservados con referencia suave + parent_deleted_at; second run = 0 cambios'),
         jsonb_build_object('mission', 'DATA-INTEGRITY-REMEDIATION-001', 'fase', 'backfill-A')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.metadata ? 'mission'
      AND a.metadata->>'mission' = 'DATA-INTEGRITY-REMEDIATION-001'
      AND a.new_data->>'tabla' = 'commission_rule_versions');

  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, metadata)
  SELECT 'system', NULL, 'DATA-INTEGRITY-REMEDIATION-001',
         jsonb_build_object(
           'tabla', 'purchase_order_items',
           'tratamiento', 'R2-conservacion-historica',
           'renglones_marcados_pedido_eliminado', v_poi_po,
           'renglones_marcados_producto_eliminado', v_poi_prod,
           'restricciones_retiradas', '[purchase_order_items_po_id_fkey, purchase_order_items_product_id_fkey]',
           'nota', 'Snapshots comerciales conservados; tabla en uso activo (API pedidos + SC-2-01 + E2E)'),
         jsonb_build_object('mission', 'DATA-INTEGRITY-REMEDIATION-001', 'fase', 'backfill-A')
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.metadata ? 'mission'
      AND a.metadata->>'mission' = 'DATA-INTEGRITY-REMEDIATION-001'
      AND a.new_data->>'tabla' = 'purchase_order_items');

  RAISE NOTICE 'DATA-INTEGRITY-REMEDIATION-001/A: marcados % versiones (regla), % refs suaves changed_by, % items (po), % items (producto)',
    v_crv_rule, v_crv_changed, v_poi_po, v_poi_prod;
END $$;

-- ── 4. Triggers de marcado (eliminación futura de padres) ─────────────────
-- SECURITY DEFINER: el UPDATE de marcado debe funcionar invocado desde la
-- sesión del usuario que borra el padre sin tropezar con el RLS de las
-- tablas de snapshot. Función de trigger: no invocable directamente.
CREATE OR REPLACE FUNCTION public.mark_rule_versions_on_rule_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.commission_rule_versions v
  SET parent_deleted_at = now()
  WHERE v.rule_id = OLD.id
    AND v.parent_deleted_at IS NULL;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_commission_rules_mark_versions ON public.commission_rules;
CREATE TRIGGER trg_commission_rules_mark_versions
  AFTER DELETE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.mark_rule_versions_on_rule_delete();

CREATE OR REPLACE FUNCTION public.mark_po_items_on_po_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.purchase_order_items i
  SET parent_deleted_at = now()
  WHERE i.po_id = OLD.id
    AND i.parent_deleted_at IS NULL;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_purchase_orders_mark_items ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_mark_items
  AFTER DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.mark_po_items_on_po_delete();

CREATE OR REPLACE FUNCTION public.mark_po_items_on_product_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.purchase_order_items i
  SET product_deleted_at = now()
  WHERE i.product_id = OLD.id
    AND i.product_deleted_at IS NULL;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_products_mark_po_items ON public.products;
CREATE TRIGGER trg_products_mark_po_items
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.mark_po_items_on_product_delete();

-- ── 5. Validación de escritura (integridad de filas NUEVAS) ───────────────
-- Las FK duras se retiraron para no perder historia al borrar padres; estas
-- validaciones BEFORE restauran la garantía para INSERT/UPDATE: una fila
-- nueva no puede apuntar a un padre inexistente. No bloquean la eliminación
-- de padres (ese era el mecanismo destructivo original).
CREATE OR REPLACE FUNCTION public.validate_rule_versions_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.commission_rules r WHERE r.id = NEW.rule_id) THEN
    RAISE EXCEPTION 'ERR_INVALID_PARENT: commission_rule_versions.rule_id % no existe en commission_rules (validación de escritura DATA-INTEGRITY-REMEDIATION-001; los snapshots históricos se administran por migración, no por inserción directa)', NEW.rule_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.changed_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.changed_by) THEN
    RAISE EXCEPTION 'ERR_INVALID_CHANGED_BY: commission_rule_versions.changed_by % no existe en profiles', NEW.changed_by
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commission_rule_versions_validate_refs ON public.commission_rule_versions;
CREATE TRIGGER trg_commission_rule_versions_validate_refs
  BEFORE INSERT OR UPDATE OF rule_id, changed_by ON public.commission_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.validate_rule_versions_refs();

CREATE OR REPLACE FUNCTION public.validate_po_items_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders o WHERE o.id = NEW.po_id) THEN
    RAISE EXCEPTION 'ERR_INVALID_PARENT: purchase_order_items.po_id % no existe en purchase_orders (validación de escritura DATA-INTEGRITY-REMEDIATION-001)', NEW.po_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.product_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id) THEN
    RAISE EXCEPTION 'ERR_INVALID_PRODUCT: purchase_order_items.product_id % no existe en products', NEW.product_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_validate_refs ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_validate_refs
  BEFORE INSERT OR UPDATE OF po_id, product_id ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_po_items_refs();

-- ── 6. Verificación en línea (resumen de la migración) ────────────────────
SELECT 'migration_applied' AS status,
       (SELECT count(*) FROM public.commission_rule_versions
         WHERE parent_deleted_at IS NOT NULL) AS crv_marcadas,
       (SELECT count(*) FROM public.commission_rule_versions v
         WHERE v.changed_by IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.changed_by)) AS crv_changed_by_suaves,
       (SELECT count(*) FROM public.purchase_order_items
         WHERE parent_deleted_at IS NOT NULL) AS poi_po_marcados,
       (SELECT count(*) FROM public.purchase_order_items
         WHERE product_deleted_at IS NOT NULL) AS poi_prod_marcados;
