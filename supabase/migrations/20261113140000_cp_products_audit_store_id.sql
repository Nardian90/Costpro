-- ═══════════════════════════════════════════════════════════════════════════
-- CP-PROD-DEL-001 (2026-11-13) — El borrado de productos falla con 23514
-- en audit_logs_store_id_check; añade pre-chequeos de dependencias con
-- mensajes comprensibles.
-- DESTRUCTIVE-OK: CP-PROD-DEL-001 (los DELETE que contiene son los del cuerpo
-- certificado vivo de managed_delete_product — fila por id y por tienda,
-- jamás tablas completas: inventory/product_variants/products de UN producto.
-- El guard los marca por su formato multi-línea, no por alcance).
-- ═══════════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (verificada contra BD viva con JWT emulado, dry-run):
--   managed_delete_product y managed_toggle_product_active insertan su
--   auditoría SIN la columna store_id (la tienda va embebida dentro de
--   old_data/new_data). El constraint VIVO audit_logs_store_id_check exige
--   store_id NOT NULL para table_name='products' (no está en la whitelist):
--     CHECK (store_id IS NOT NULL OR table_name = ANY (ARRAY['profiles',
--       'stores','system','master_products','master_parties','fin_rule_versions']))
--   → 23514 al final de la RPC → el DELETE completo se revierte → el usuario
--   no puede eliminar ni activar/desactivar el producto desde la interfaz y
--   recibe el error crudo de SQL (sin explicación).
--
-- CORRECCIÓN:
--   1. Ambas RPCs pasan store_id EXPLÍCITO en el INSERT de audit_logs
--      (semántica correcta del constraint: la acción es de tienda). El resto
--      del cuerpo vivo certificado se reproduce VERBATIM.
--   2. managed_delete_product añade pre-chequeos para las FK RESTRICT /
--      NO ACTION hacia products que hoy producen un 23503 crudo
--      (devoluciones, solicitudes de material, ventas legacy, movimientos de
--      inventario, compras, transferencias, vales de salida, conteos físicos
--      y producción), con mensajes en español que explican la causa real.
--      El mensaje histórico de movimientos (transaction_items /
--      stock_movements / receipt_items) se conserva exactamente.
--
-- NO CAMBIA: firmas, atributos (SECURITY DEFINER, search_path), la matriz de
--   autorización (has_store_access), ni la semántica multitienda: eliminar el
--   producto local de una tienda NO toca master_products ni filas de otras
--   tiendas (el maestro se conserva: activo compartido gobernado, su ciclo de
--   vida lo decide la gobernanza del catálogo; master_change_log mantiene la
--   trazabilidad de identidad).
--
-- Idempotente (CREATE OR REPLACE). Sin GRANT/REVOKE nuevos: conserva la ACL
--   certificada (authenticated + service_role, heredada del replay vigente).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- managed_delete_product/1 — cuerpo vivo (20260916000001) + fix de auditoría
-- + pre-chequeos de dependencias con mensajes comprensibles.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_delete_product(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_product_name text;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
  v_has_movements boolean;
BEGIN
  SELECT p.store_id, p.name, p.tenant_id, s.tenant_id
  INTO v_store_id, v_product_name, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p_product_id
    UNION ALL
    SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p_product_id
  ) INTO v_has_movements;

  IF v_has_movements THEN
    RAISE EXCEPTION 'No se puede eliminar un producto con movimientos. Desactivelo en su lugar.';
  END IF;

  -- CP-PROD-DEL-001: pre-chequeos de documentos con FK RESTRICT / NO ACTION
  -- hacia products (sin esto el borrado muere con un 23503 crudo y el usuario
  -- no entiende la causa). Mensajes explicativos por tipo de documento.
  IF EXISTS (SELECT 1 FROM public.sale_items si WHERE si.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto tiene ventas registradas. Desactívalo en su lugar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_movements im WHERE im.product_id = p_product_id)
     OR EXISTS (SELECT 1 FROM public.inventory_adjustment_items ia WHERE ia.product_id = p_product_id)
     OR EXISTS (SELECT 1 FROM public.inventory_batches ib WHERE ib.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto tiene movimientos de inventario registrados. Desactívalo en su lugar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_items pi WHERE pi.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto aparece en compras registradas. Desactívalo en su lugar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.devolution_items dv WHERE dv.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto tiene devoluciones registradas.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.material_request_items mr WHERE mr.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto aparece en solicitudes de material.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transfer_items tr WHERE tr.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto aparece en transferencias entre tiendas. Desactívalo en su lugar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.issue_slip_items isv WHERE isv.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto aparece en vales de salida. Desactívalo en su lugar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.physical_inventory_items phi WHERE phi.product_id = p_product_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto aparece en conteos físicos de inventario.';
  END IF;

  IF EXISTS (
      SELECT 1 FROM public.production_order_items poi WHERE poi.product_id = p_product_id
      UNION ALL
      SELECT 1 FROM public.production_orders po WHERE po.output_product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar: el producto participa en órdenes de producción. Desactívalo en su lugar.';
  END IF;

  DELETE FROM public.inventory
  WHERE product_id = p_product_id
    AND store_id = v_store_id;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id;

  DELETE FROM public.products
  WHERE id = p_product_id
    AND store_id = v_store_id;

  -- CP-PROD-DEL-001 (fix 23514): store_id EXPLÍCITO en la columna del
  -- constraint. La tienda ya no vive solo dentro de old_data.
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (
    auth.uid(),
    'DELETE_PRODUCT',
    'products',
    p_product_id,
    jsonb_build_object('name', v_product_name, 'store_id', v_store_id),
    v_store_id
  );
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────
-- managed_toggle_product_active/2 — cuerpo vivo (20260916000001) + fix de
-- auditoría (store_id explícito). Sin cambios de autorización ni semántica.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_store_id uuid;
  v_old_active boolean;
  v_product_tenant_id uuid;
  v_store_tenant_id uuid;
BEGIN
  SELECT p.store_id, p.is_active, p.tenant_id, s.tenant_id
  INTO v_store_id, v_old_active, v_product_tenant_id, v_store_tenant_id
  FROM public.products p
  LEFT JOIN public.stores s
    ON s.id = p.store_id
  WHERE p.id = p_product_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_tenant_id IS NOT NULL
     AND v_product_tenant_id IS DISTINCT FROM v_store_tenant_id THEN
    RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'Unauthorized product access' USING ERRCODE = '42501';
  END IF;

  UPDATE public.products
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_product_id
    AND store_id = v_store_id;

  -- CP-PROD-DEL-001 (fix 23514): store_id EXPLÍCITO en la columna.
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'ACTIVATE_PRODUCT' ELSE 'DEACTIVATE_PRODUCT' END,
    'products',
    p_product_id,
    jsonb_build_object('is_active', v_old_active, 'store_id', v_store_id),
    jsonb_build_object('is_active', p_is_active, 'store_id', v_store_id),
    v_store_id
  );
END;
$function$
;
