-- ════════════════════════════════════════════════════════════════════════
-- V2.12.37: Fix 3 bugs identificados en hot test E2E
--
-- Bug #1: Trigger update_payment_status no recalcula paid_amount en DELETE
--         Causa: usa NEW.ref_type/NEW.ref_id que son NULL en DELETE
--         Fix: usar COALESCE(NEW.*, OLD.*) para soportar DELETE
--
-- Bug #2: closed → voided no permitido (falta flujo de reversión)
--         Fix: añadir 'voided' a transiciones desde 'closed' + crear RPC
--         void_closed_production_order que revierte stock + venta
--
-- Bug #3: Cash report no incluye pagos con payment_date histórica
--         Fix: añadir parámetro p_include_all_dates para ignorar filtro de fecha
-- ════════════════════════════════════════════════════════════════════════

-- ── Bug #1: Fix trigger update_payment_status para soportar DELETE ────
CREATE OR REPLACE FUNCTION public.update_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_ref_type TEXT;
  v_ref_id UUID;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
BEGIN
  -- V2.12.37: usar OLD cuando es DELETE (NEW es NULL en DELETE)
  v_ref_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_type ELSE NEW.ref_type END;
  v_ref_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_id ELSE NEW.ref_id END;

  IF v_ref_type = 'receipt' THEN
    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'receipt' AND ref_id = v_ref_id
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type = 'service' AND ref_id = v_ref_id
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id;

    v_status := CASE
      WHEN v_paid >= v_total THEN 'paid'
      WHEN v_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions
       WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id
       ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET
      paid_amount = v_paid,
      payment_status = v_status,
      payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ── Bug #2: Añadir 'voided' a transiciones desde 'closed' ─────────────
-- Recrear fn_validate_document_transition con closed → voided permitido
CREATE OR REPLACE FUNCTION public.fn_validate_document_transition(p_table_name TEXT)
RETURNS VOID AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
  v_valid_transitions JSONB;
BEGIN
  -- V2.12.37: obtener estados de TG_OP (soporta UPDATE)
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_status := NULL;
    v_new_status := NEW.status;
  ELSE
    RETURN; -- DELETE no valida
  END IF;

  -- Solo validar si el status cambió
  IF v_old_status IS NOT NULL AND v_old_status = v_new_status THEN
    RETURN;
  END IF;

  v_valid_transitions := jsonb_build_object(
    'production_orders', jsonb_build_object(
      'draft',       '["approved","in_progress","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["paused","completed","voided","reversed"]'::jsonb,
      'paused',      '["in_progress","voided","reversed"]'::jsonb,
      'completed',   '["closed","reversed","voided"]'::jsonb,
      'closed',      '["reversed","voided"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'transactions', jsonb_build_object(
      'pending',     '["completed","voided"]'::jsonb,
      'completed',   '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'draft',       '["confirmed","voided"]'::jsonb,
      'confirmed',   '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'received_services', jsonb_build_object(
      'draft',       '["confirmed","voided"]'::jsonb,
      'confirmed',   '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'commission_payments', jsonb_build_object(
      'pending',     '["approved","voided"]'::jsonb,
      'approved',    '["paid","voided"]'::jsonb,
      'paid',        '["voided","reversed"]'::jsonb,
      'voided',      '[]'::jsonb,
      'reversed',    '[]'::jsonb
    ),
    'purchase_orders', jsonb_build_object(
      'draft',       '["approved","voided"]'::jsonb,
      'approved',    '["in_progress","voided"]'::jsonb,
      'in_progress', '["completed","voided"]'::jsonb,
      'completed',   '["closed","voided"]'::jsonb,
      'closed',      '["voided"]'::jsonb,
      'voided',      '[]'::jsonb
    )
  );

  IF v_old_status IS NULL THEN
    -- INSERT: solo validar que el status inicial sea válido
    IF NOT (v_valid_transitions ? p_table_name) THEN RETURN; END IF;
    RETURN;
  END IF;

  IF NOT (
    v_valid_transitions->p_table_name ? v_old_status
    AND (v_valid_transitions->p_table_name->v_old_status) ? v_new_status
  ) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      p_table_name, v_old_status, v_new_status;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── Bug #2b: RPC para anular OT cerrada (reversa stock + venta) ──────
CREATE OR REPLACE FUNCTION public.void_closed_production_order(
  p_order_id uuid,
  p_reason text DEFAULT 'Anulación',
  p_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item RECORD;
  v_transaction_id UUID;
BEGIN
  -- 1. Cargar la orden PRIMERO (antes del check de autorización)
  SELECT * INTO v_order FROM public.production_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- 2. Ahora sí verificar autorización (v_order.store_id ya está disponible)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Solo permitir anular OTs cerradas
  IF v_order.status != 'closed' THEN
    RAISE EXCEPTION 'Solo se pueden anular OTs cerradas (status actual: %)', v_order.status;
  END IF;

  -- 4. Si tiene transaction_id (venta creada por close_service_order_as_sale),
  --    revertir la venta: marcar como voided
  IF v_order.transaction_id IS NOT NULL THEN
    UPDATE public.transactions
      SET status = 'voided'
      WHERE id = v_order.transaction_id AND status = 'completed';
  END IF;

  -- 5. Reabastecer insumos: items con actual_qty > 0
  FOR v_item IN
    SELECT poi.*, p.store_id as p_store_id
    FROM public.production_order_items poi
    JOIN public.products p ON p.id = poi.product_id
    WHERE poi.order_id = p_order_id AND poi.actual_qty > 0
  LOOP
    -- Devolver stock
    UPDATE public.products
      SET stock_current = stock_current + v_item.actual_qty
      WHERE id = v_item.product_id;

    -- Registrar movimiento de kardex (si la tabla existe)
    BEGIN
      INSERT INTO public.kardex_entries (
        store_id, product_id, movement_type, quantity, reference_type,
        reference_id, user_id, reason, created_at
      ) VALUES (
        v_order.store_id, v_item.product_id, 'devolution_in',
        v_item.actual_qty, 'reversal', p_order_id, v_caller_uid,
        'Anulación OT ' || v_order.order_number, now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; -- si no existe la tabla o columna, ignorar
    END;
  END LOOP;

  -- 6. Descontar output product (solo production orders con output)
  IF v_order.order_type = 'production'
     AND v_order.output_product_id IS NOT NULL
     AND v_order.output_quantity > 0 THEN
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_order.output_quantity)
      WHERE id = v_order.output_product_id;

    BEGIN
      INSERT INTO public.kardex_entries (
        store_id, product_id, movement_type, quantity, reference_type,
        reference_id, user_id, reason, created_at
      ) VALUES (
        v_order.store_id, v_order.output_product_id, 'out',
        v_order.output_quantity, 'reversal', p_order_id, v_caller_uid,
        'Anulación OT ' || v_order.order_number, now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 7. Marcar OT como voided
  UPDATE public.production_orders
    SET status = 'voided',
        reversed_at = now(),
        reversed_by = v_caller_uid,
        reversal_reason = p_reason
    WHERE id = p_order_id;

  RETURN TRUE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.void_closed_production_order(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_closed_production_order(uuid, text, uuid) TO service_role;

-- ── Bug #3: Cash report con opción de incluir todas las fechas ───────
-- Añadir parámetro p_include_all_dates para ignorar el filtro de fecha
-- (útil para ver todos los pagos de OT sin importar payment_date)
DROP FUNCTION IF EXISTS public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_cash_report(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '1 day',
  p_end_date TIMESTAMPTZ DEFAULT now(),
  p_include_all_dates BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
  v_sales JSON;
  v_payments JSON;
  v_commissions JSON;
  v_production JSON;
  v_totals JSON;
  v_sales_total_cup NUMERIC := 0;
  v_payments_total_cup NUMERIC := 0;
  v_commissions_total_cup NUMERIC := 0;
  v_production_total_cup NUMERIC := 0;
  v_date_filter TEXT := '';
BEGIN
  -- V2.12.37: si p_include_all_dates es TRUE, no filtrar por fecha
  IF NOT p_include_all_dates THEN
    v_date_filter := 'AND payment_date >= ''' || p_start_date || ''' AND payment_date <= ''' || p_end_date || '''';
  END IF;

  -- Ventas por método y moneda (siempre filtradas por fecha)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_sales
  FROM (
    SELECT payment_method, sale_currency AS currency, COUNT(*) AS transaction_count,
      SUM(total_amount) AS total,
      SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END) AS total_cup
    FROM transactions
    WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided'
    GROUP BY payment_method, sale_currency ORDER BY payment_method, sale_currency
  ) t;

  -- Pagos a Proveedores
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_payments
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count, SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('receipt', 'service')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Comisiones
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_commissions
  FROM (
    SELECT payment_method, currency, COUNT(*) AS commission_count, SUM(final_amount) AS total, SUM(amount_cup) AS total_cup
    FROM commission_payments
    WHERE store_id = p_store_id AND status = 'paid'
      AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date))
      AND payment_method IS NOT NULL
    GROUP BY payment_method, currency ORDER BY payment_method, currency
  ) t;

  -- Órdenes de Producción/Servicios
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_production
  FROM (
    SELECT payment_method, currency, ref_type, COUNT(*) AS payment_count,
           SUM(amount) AS total, SUM(amount_cup) AS total_cup
    FROM payment_transactions
    WHERE store_id = p_store_id
      AND ref_type IN ('production_order', 'work')
      AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date))
    GROUP BY payment_method, currency, ref_type ORDER BY payment_method, currency, ref_type
  ) t;

  -- Totales
  SELECT COALESCE(SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END), 0)
  INTO v_sales_total_cup FROM transactions
  WHERE store_id = p_store_id AND created_at >= p_start_date AND created_at <= p_end_date AND status != 'voided';

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_payments_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('receipt', 'service')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_commissions_total_cup
  FROM commission_payments WHERE store_id = p_store_id AND status = 'paid'
  AND (p_include_all_dates OR (paid_at >= p_start_date AND paid_at <= p_end_date));

  SELECT COALESCE(SUM(amount_cup), 0) INTO v_production_total_cup
  FROM payment_transactions WHERE store_id = p_store_id
  AND ref_type IN ('production_order', 'work')
  AND (p_include_all_dates OR (payment_date >= p_start_date AND payment_date <= p_end_date));

  SELECT json_build_object(
    'sales_total_cup', v_sales_total_cup,
    'payments_total_cup', v_payments_total_cup,
    'commissions_total_cup', v_commissions_total_cup,
    'production_total_cup', v_production_total_cup,
    'balance_cup', v_sales_total_cup + v_production_total_cup - v_payments_total_cup - v_commissions_total_cup
  ) INTO v_totals;

  v_result := json_build_object(
    'sales', v_sales, 'payments', v_payments, 'commissions', v_commissions,
    'production', v_production, 'totals', v_totals,
    'start_date', p_start_date, 'end_date', p_end_date,
    'include_all_dates', p_include_all_dates
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_report(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;
