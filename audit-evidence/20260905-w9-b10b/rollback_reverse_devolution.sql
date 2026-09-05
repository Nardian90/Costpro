-- W9.5 B-10b — ROLLBACK de modernización reverse_devolution
-- Restaura los cuerpos PRE capturados en raw-gate1-live.json (hashes en
-- 02-function-pre.md). Ejecutar SOLO si se decide revertir B-10b.
--
-- NOTA ENUM: PostgreSQL no permite eliminar un valor de enum de forma segura.
-- El valor 'devolution_reverse' permanece en public.movement_type tras el
-- rollback (queda SIN USO: la función restaurada no lo referencia). No altera
-- datos ni comportamiento; su presencia es inerte y documentada.
--
-- Tras ejecutar: reverse_devolution vuelve a UPDATE directo de stock +
-- INSERT directo kardex (divergencia pre-B-10b). No ejecutar salvo rollback
-- completo de la fase.

-- 1) reverse_devolution (cuerpo PRE, OID/owner/secdef/search_path preservados)
CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  -- W9.5 B-10: guard de estado explicito (GATE G) — solo completed reversible.
  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa (fuente unica). Politica congelada (C conservar):
  -- cualquier membresia ACTIVA en la tienda, simetrica a la creacion de
  -- devoluciones (modulo dormant, sin puerta de navegacion).
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_dev.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_devolution_id, 'Reversión de devolución', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito (antes: cero rastro
  -- en audit_logs; solo reversed_by/reversal_reason en la fila).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$

;

-- 2) auto_kardex_on_stock_movement (cuerpo PRE sin la rama devolution_reverse)
CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_store_id UUID; v_movement_type TEXT; v_qty NUMERIC; v_unit_cost NUMERIC;
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
  IF v_store_id IS NULL THEN RETURN NEW; END IF;
  v_movement_type := CASE
    WHEN NEW.movement_type IN ('sale', 'void', 'sale_void', 'issue_slip_out') THEN 'out'
    WHEN NEW.movement_type IN ('purchase', 'initial') THEN 'in'
    WHEN NEW.movement_type = 'adjustment' THEN 'adjustment'
    WHEN NEW.movement_type = 'return' THEN 'devolution_in'
    WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
    WHEN NEW.movement_type IN ('transfer', 'transfer_out') THEN 'transfer_out'
    WHEN NEW.movement_type IN ('production_in', 'production_out') THEN 'adjustment'
    WHEN NEW.movement_type = 'purchase_reverse' THEN 'purchase_reverse'
    WHEN NEW.movement_type = 'sale_reverse' THEN 'sale_reverse'
    WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'
    WHEN NEW.movement_type = 'issue_slip_reverse' THEN 'in'
    ELSE 'adjustment'
  END;
  v_qty := ABS(NEW.quantity_change);
  v_unit_cost := COALESCE(NEW.unit_cost, 0);
  INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
  SELECT v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
    p.stock_current, p.cost_average, p.stock_current * p.cost_average,
    'stock_movement', NEW.id, COALESCE(NEW.reference_doc, NEW.movement_type::text), NEW.created_by
  FROM public.products p WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$function$

;
