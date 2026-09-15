-- =====================================================================
-- SOURCE: REM-INV-6
-- OBJECT: canonical materialization of the certified LIVE function surface
--         (134 SECURITY DEFINER write functions; 53 statements)
-- LIVE EVIDENCE: audit-evidence/REM-INV-6/02-live-function-inventory.txt
--         (pg_get_functiondef captured read-only from production at baseline 5ded948e)
-- REASON: replay of supabase/migrations does not reproduce the certified LIVE
--         surface (out-of-band historical fixes, Gate J); this migration makes
--         the migration stream the source of truth. Bodies are VERBATIM LIVE
--         definitions → applying to production is a catalog no-op (idempotent).
-- EXPECTED SECURITY STATE: replay body md5 == LIVE md5 for 134/134;
--         prosecdef/search_path/owner identical; ACL handled by 20260916000002.
-- =====================================================================

-- adjust_total_amount/3
CREATE OR REPLACE FUNCTION public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_actor uuid; v_old_total numeric; v_store_id uuid; v_paid_total numeric; v_lock_key bigint;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013'; END IF;
  IF p_new_total IS NULL OR p_new_total < 0 THEN RAISE EXCEPTION 'ERR_INVALID_TOTAL' USING ERRCODE = 'PT012'; END IF;
  v_lock_key := hashtextextended(p_transaction_id::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);
  SELECT total_amount, store_id INTO v_old_total, v_store_id FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016'; END IF;
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total FROM public.payment_transactions WHERE transaction_id = p_transaction_id;
  IF v_paid_total > p_new_total + 0.01 THEN RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS' USING ERRCODE = 'PT002'; END IF;
  IF v_old_total = p_new_total THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
      jsonb_build_object('total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP', 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
    RETURN true;
  END IF;
  UPDATE public.transactions SET total_amount = p_new_total WHERE id = p_transaction_id;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
    jsonb_build_object('old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason, 'paid_total_at_time', v_paid_total, 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
  RETURN true;
END;
$function$
;

-- audit_backup_restore_protected_change/0
CREATE OR REPLACE FUNCTION public.audit_backup_restore_protected_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo auditar si cambió el flag
  IF OLD.backup_restore_protected IS DISTINCT FROM NEW.backup_restore_protected THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, metadata)
    VALUES (
      'backup_restore_protected_changed',
      'stores',
      NEW.id,
      NEW.id,
      jsonb_build_object(
        'old_value', OLD.backup_restore_protected,
        'new_value', NEW.backup_restore_protected,
        'changed_by', COALESCE(auth.uid(), NULL),
        'changed_at', NOW()
      )
    );
  END IF;
  RETURN NEW;
END;
$function$
;

-- audit_cash_closures_changes/0
CREATE OR REPLACE FUNCTION public.audit_cash_closures_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ DECLARE v_action text; v_record_id uuid; v_store_id uuid; v_user_id uuid; BEGIN v_user_id := auth.uid(); IF TG_OP = 'INSERT' THEN v_action := 'CASH_CLOSURE_CREATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'UPDATE' THEN v_action := 'CASH_CLOSURE_UPDATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'DELETE' THEN v_action := 'CASH_CLOSURE_DELETED'; v_record_id := OLD.id; v_store_id := OLD.store_id; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN RETURN NEW; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN RETURN NEW; END IF; INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata) VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id, jsonb_build_object('tg_op', TG_OP, 'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END, 'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END)); RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END; $function$
;

-- audit_commission_payments_changes/0
CREATE OR REPLACE FUNCTION public.audit_commission_payments_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'COMMISSION_PAYMENT_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip si el cambio viene del trigger de flag (ya tiene su propio audit)
    IF NEW.status = 'flagged_for_review' AND OLD.status IN ('approved', 'paid') THEN
      RETURN NEW;
    END IF;
    v_action := 'COMMISSION_PAYMENT_UPDATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'COMMISSION_PAYMENT_DELETED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'commission_payments',
    CASE WHEN TG_OP != 'DELETE' THEN NEW.id ELSE OLD.id END,
    CASE WHEN TG_OP != 'DELETE' THEN NEW.store_id ELSE OLD.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'worker_id', CASE WHEN TG_OP != 'DELETE' THEN NEW.worker_id ELSE OLD.worker_id END,
      'old_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
      'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END,
      'amount', CASE WHEN TG_OP != 'DELETE' THEN NEW.final_amount ELSE OLD.final_amount END
    ));

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$
;

-- audit_product_changes/0
CREATE OR REPLACE FUNCTION public.audit_product_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    BEGIN
        INSERT INTO public.audit_logs (
            user_id, action, table_name, record_id, old_data, new_data, store_id
        )
        VALUES (
            auth.uid(),
            'UPDATE_PRODUCT',
            'products',
            NEW.id,
            jsonb_build_object(
                'name', OLD.name,
                'price', OLD.price,
                'cost_price', OLD.cost_price,
                'sku', OLD.sku,
                'price_currency', OLD.price_currency
            ),
            jsonb_build_object(
                'name', NEW.name,
                'price', NEW.price,
                'cost_price', NEW.cost_price,
                'sku', NEW.sku,
                'price_currency', NEW.price_currency
            ),
            NEW.store_id
        );
        RETURN NEW;
    END;
    $function$
;

-- audit_profile_changes/0
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Log creation
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_USER',
            'profiles',
            NEW.id,
            jsonb_build_object('full_name', NEW.full_name, 'role', NEW.role, 'email', NEW.email),
            NULL
        );
    -- Log deletion
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_USER',
            'profiles',
            OLD.id,
            jsonb_build_object('full_name', OLD.full_name, 'role', OLD.role),
            NULL
        );
    -- Log updates
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Log active store change
        IF (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ACTIVE_STORE',
                'profiles',
                NEW.id,
                jsonb_build_object('active_store_id', OLD.active_store_id),
                jsonb_build_object('active_store_id', NEW.active_store_id),
                NEW.active_store_id
            );
        END IF;

        -- Log role change
        IF (OLD.role IS DISTINCT FROM NEW.role) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'CHANGE_ROLE',
                'profiles',
                NEW.id,
                jsonb_build_object('role', OLD.role),
                jsonb_build_object('role', NEW.role),
                NEW.active_store_id
            );
        END IF;

        -- Log name change
        IF (OLD.full_name IS DISTINCT FROM NEW.full_name) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_USER_NAME',
                'profiles',
                NEW.id,
                jsonb_build_object('full_name', OLD.full_name),
                jsonb_build_object('full_name', NEW.full_name),
                NEW.active_store_id
            );
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$
;

-- audit_role_changes/0
CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.user_audit_log (performed_by, action, new_values)
        VALUES (auth.uid(), 'CREATE_ROLE', row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values, new_values)
        VALUES (auth.uid(), 'UPDATE_ROLE_DEFINITION', row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.user_audit_log (performed_by, action, old_values)
        VALUES (auth.uid(), 'DELETE_ROLE', row_to_json(OLD)::jsonb);
    END IF;
    RETURN NEW;
END;
$function$
;

-- audit_store_access_changes/0
CREATE OR REPLACE FUNCTION public.audit_store_access_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
        VALUES (
            auth.uid(), 
            'ASSIGN_STORE', 
            'user_store_access', 
            NEW.id, 
            jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id)
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
        VALUES (
            auth.uid(), 
            'REMOVE_STORE_ACCESS', 
            'user_store_access', 
            OLD.id, 
            jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id)
        );
    END IF;
    RETURN NULL;
END;
$function$
;

-- audit_store_changes/0
CREATE OR REPLACE FUNCTION public.audit_store_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'CREATE_STORE',
            'stores',
            NEW.id,
            jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
            NEW.id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only log if something important changed
        IF (OLD.name IS DISTINCT FROM NEW.name OR OLD.address IS DISTINCT FROM NEW.address OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_STORE_CONFIG',
                'stores',
                NEW.id,
                jsonb_build_object('name', OLD.name, 'address', OLD.address, 'is_active', OLD.is_active),
                jsonb_build_object('name', NEW.name, 'address', NEW.address, 'is_active', NEW.is_active),
                NEW.id
            );
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'DELETE_STORE',
            'stores',
            OLD.id,
            jsonb_build_object('name', OLD.name, 'address', OLD.address),
            OLD.id
        );
    END IF;
    
    IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$
;

-- bulk_soft_delete_stores/5
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_validation JSONB;
  v_blockers JSONB;
  v_errors JSONB[] := '{}'::jsonb[];
  v_processed INTEGER := 0;
  v_token_valid BOOLEAN;
  v_has_protected BOOLEAN;
  v_override_valid BOOLEAN;
  v_confirmation_record RECORD;
  v_override_record RECORD;
  v_caller_role TEXT;
BEGIN
  -- ============================================================
  -- AUTH CHECK: Solo admin puede ejecutar esta función
  -- ============================================================
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar bulk_soft_delete_stores';
    END IF;
  END IF;
  -- Si auth.uid() IS NULL, es service_role — permitir

  -- ============================================================
  -- 1. VALIDATE confirmation_token
  -- ============================================================
  SELECT * INTO v_confirmation_record
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND action = 'delete'
    AND expires_at > NOW()
    AND consumed_at IS NULL
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_CONFIRMATION_TOKEN';
  END IF;

  IF v_confirmation_record.store_ids != p_store_ids THEN
    RAISE EXCEPTION 'ERR_STORE_IDS_MISMATCH';
  END IF;

  -- ============================================================
  -- 2. VALIDATE tiendas protegidas requieren override_token
  -- ============================================================
  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  IF v_has_protected THEN
    IF p_override_token IS NULL THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_REQUIRED';
    END IF;

    SELECT * INTO v_override_record
    FROM public.bulk_confirmation_tokens
    WHERE token = p_override_token
      AND is_override = true
      AND override_for = p_confirmation_token
      AND expires_at > NOW()
      AND consumed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_INVALID_OVERRIDE_TOKEN';
    END IF;

    IF v_override_record.store_ids != v_confirmation_record.store_ids THEN
      RAISE EXCEPTION 'ERR_OVERRIDE_STORE_IDS_MISMATCH';
    END IF;

    IF v_override_record.created_by = v_confirmation_record.created_by THEN
      RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
    END IF;

    UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
    WHERE token = p_override_token;
  END IF;

  UPDATE public.bulk_confirmation_tokens SET consumed_at = NOW()
  WHERE token = p_confirmation_token;

  -- ============================================================
  -- 3. VALIDATE todas las tiendas
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    IF NOT EXISTS(SELECT 1 FROM public.stores WHERE id = v_store_id AND is_active = true) THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'STORE_NOT_FOUND_OR_INACTIVE'
      ));
      CONTINUE;
    END IF;

    SELECT public.validate_store_can_be_modified(v_store_id, 'soft_delete') INTO v_validation;
    v_blockers := v_validation->'blockers';

    IF v_validation->>'can_modify' != 'true' THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'store_id', v_store_id, 'reason', 'HAS_BLOCKING_DEPENDENCIES', 'blockers', v_blockers
      ));
    END IF;
  END LOOP;

  IF array_length(v_errors, 1) IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'FAILED', 'processed', 0,
      'total_requested', array_length(p_store_ids, 1),
      'errors', to_jsonb(v_errors), 'reason', p_reason
    );
  END IF;

  -- ============================================================
  -- 4. EXECUTE
  -- ============================================================
  FOREACH v_store_id IN ARRAY p_store_ids LOOP
    PERFORM public.soft_delete_store(v_store_id, p_deleted_by);
    v_processed := v_processed + 1;
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_store_deleted', 'stores', NULL,
    jsonb_build_object(
      'store_ids', p_store_ids, 'deleted_by', p_deleted_by,
      'reason', p_reason, 'processed', v_processed,
      'had_protected_stores', v_has_protected,
      'override_used', p_override_token IS NOT NULL, 'deleted_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'COMPLETED', 'processed', v_processed,
    'total_requested', array_length(p_store_ids, 1),
    'errors', '[]'::jsonb, 'reason', p_reason
  );
END;
$function$
;

-- bulk_update_products/1
-- guarded drop: only fires when an incompatible (older) return type exists;
-- on the certified LIVE state this is a no-op (return type already matches).
DO $drop$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'bulk_update_products'
      AND pg_get_function_identity_arguments(p.oid) = '_products jsonb'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) IS DISTINCT FROM 'TABLE(updated_count integer, inserted_count integer, error_message text)'
  ) THEN
    DROP FUNCTION public.bulk_update_products(_products jsonb);
  END IF;
END
$drop$;
CREATE OR REPLACE FUNCTION public.bulk_update_products(_products jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    DECLARE
        v_inserted_count int;
        v_updated_count int;
        v_row jsonb;
        v_sku text;
        v_store_id uuid;
        v_price numeric;
        v_cost numeric;
        v_currency text;
        v_name text;
        v_image_url text;
        v_category text;
        v_unit text;
        v_xmax text;
    BEGIN
        v_inserted_count := 0;
        v_updated_count := 0;

        FOR v_row IN SELECT * FROM jsonb_array_elements(_products)
        LOOP
            v_sku := v_row->>'sku';
            v_store_id := (v_row->>'store_id')::uuid;
            v_name := v_row->>'name';
            v_price := COALESCE((v_row->>'price')::numeric, 0);
            v_cost := COALESCE((v_row->>'cost_price')::numeric, 0);
            v_currency := COALESCE(UPPER(v_row->>'price_currency'), 'CUP');
            v_image_url := v_row->>'image_url';
            v_category := v_row->>'category';
            v_unit := v_row->>'unit_of_measure';

            IF v_sku IS NULL OR v_store_id IS NULL THEN
                CONTINUE;
            END IF;

            IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
                RETURN QUERY SELECT 0, 0, 'Moneda inválida: ' || v_currency || ' SKU ' || v_sku;
                RETURN;
            END IF;

            IF v_currency = 'CUP' AND v_price > 0 AND v_cost > 0 AND v_price < v_cost THEN
                RETURN QUERY SELECT 0, 0, 'Precio CUP menor que costo SKU ' || v_sku;
                RETURN;
            END IF;

            BEGIN
                WITH upserted AS (
                    INSERT INTO products (
                        store_id, sku, name, cost_price, price, price_currency,
                        image_url, category, unit_of_measure, updated_at
                    ) VALUES (
                        v_store_id, v_sku, v_name, v_cost, v_price, v_currency,
                        v_image_url, v_category, v_unit, NOW()
                    )
                    ON CONFLICT (sku, store_id) DO UPDATE SET
                        name = EXCLUDED.name,
                        price = EXCLUDED.price,
                        cost_price = EXCLUDED.cost_price,
                        price_currency = EXCLUDED.price_currency,
                        image_url = EXCLUDED.image_url,
                        category = EXCLUDED.category,
                        unit_of_measure = EXCLUDED.unit_of_measure,
                        updated_at = NOW()
                    RETURNING xmax::text AS xmax_text
                )
                SELECT xmax_text FROM upserted INTO v_xmax;

                IF v_xmax IS NOT NULL AND v_xmax::int > 0 THEN
                    v_updated_count := v_updated_count + 1;
                ELSE
                    v_inserted_count := v_inserted_count + 1;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN QUERY SELECT 0, 0, 'Error SKU ' || v_sku || ': ' || SQLERRM;
                RETURN;
            END;
        END LOOP;

        RETURN QUERY SELECT v_updated_count, v_inserted_count, NULL::text;
    END;
    $function$
;

-- cancel_reception/1
CREATE OR REPLACE FUNCTION public.cancel_reception(p_reception_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_item RECORD;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
BEGIN
    v_user_id := auth.uid()::UUID;
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;

    FOR v_item IN SELECT product_id, quantity, unit_cost FROM public.receipt_items WHERE receipt_id = p_reception_id
    LOOP
        SELECT stock_current INTO v_current_stock
        FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        v_new_stock := COALESCE(v_current_stock,0) - v_item.quantity;

        IF v_new_stock > 0 THEN
            -- DF-01: inversa exacta del blend de la entrada (q<0) vía escritor único.
            -- Antes: base cost_price (defecto) + espejo cp. Compat: stock 0 → WAC último conocido.
            PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_cancel',
                         -v_item.quantity, v_item.unit_cost,
                         jsonb_build_object('rpc','cancel_reception','receipt_id',p_reception_id));
        END IF;

        PERFORM public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_store_id,
            p_user_id := v_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'adjustment',
            p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost
        );
    END LOOP;

    UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
END $function$
;

-- check_idempotency/4
CREATE OR REPLACE FUNCTION public.check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_existing_result jsonb;
  v_existing_hash text;
  v_inserted_id uuid;
BEGIN
  IF p_key IS NULL THEN RETURN NULL; END IF;

  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
  VALUES (p_key, p_operation, p_record_id, p_param_hash, jsonb_build_object('status', 'pending'))
  ON CONFLICT (idempotency_key, operation) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT result, param_hash INTO v_existing_result, v_existing_hash
  FROM idempotency_registry
  WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;

  IF v_existing_hash != p_param_hash THEN
    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
  END IF;

  IF v_existing_result->>'status' = 'pending' THEN
    PERFORM pg_sleep(0.1);
    SELECT result INTO v_existing_result
    FROM idempotency_registry
    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    IF v_existing_result->>'status' = 'pending' THEN
      PERFORM pg_sleep(0.2);
      SELECT result INTO v_existing_result
      FROM idempotency_registry
      WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
    END IF;
  END IF;

  RETURN v_existing_result;
END;
$function$
;

-- close_cash_shift/5
CREATE OR REPLACE FUNCTION public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_zelle_sales numeric := 0;
  v_cash_payments numeric := 0;
  v_cash_commissions numeric := 0;
  v_system_cash numeric := 0;
  v_system_expected_total numeric := 0;
  v_difference numeric := 0;
  v_tax_total numeric := 0;
  v_devolutions_total numeric := 0;
  v_z_number text;
  v_z_id uuid;
  v_tx_count int := 0;
BEGIN
  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND'; END IF;
  IF v_closure.status <> 'pendiente' THEN RAISE EXCEPTION 'ERR_CLOSURE_NOT_PENDING: status=%', v_closure.status; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));

  SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_payments FROM public.payment_transactions WHERE store_id = v_closure.store_id AND payment_method = 'cash' AND (ref_type IS NULL OR ref_type <> 'sale') AND created_at > v_closure.created_at AND created_at <= NOW();
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_cash_commissions FROM public.commission_payments WHERE store_id = v_closure.store_id AND status = 'paid' AND paid_at > v_closure.created_at AND paid_at <= NOW();
  SELECT COUNT(*) INTO v_tx_count FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();

  v_system_cash := COALESCE(v_closure.opening_balance, 0) + v_cash_sales - v_cash_payments - v_cash_commissions;
  v_system_expected_total := v_system_cash + v_transfer_sales + v_zelle_sales;
  v_difference := (p_declared_cash + p_declared_vouchers) - v_system_expected_total;

  UPDATE public.cash_closures SET
    status = 'cerrado', closed_at = NOW(),
    declared_cash = p_declared_cash, declared_vouchers = p_declared_vouchers,
    declared_total = p_declared_cash + p_declared_vouchers,
    system_expected_total = v_system_expected_total, difference = v_difference,
    notes = p_notes
  WHERE id = p_closure_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('declared_cash', p_declared_cash, 'declared_vouchers', p_declared_vouchers,
      'system_expected_total', v_system_expected_total, 'difference', v_difference,
      'opening_balance', COALESCE(v_closure.opening_balance, 0),
      'cash_sales', v_cash_sales, 'transfer_sales', v_transfer_sales, 'zelle_sales', v_zelle_sales,
      'cash_payments', v_cash_payments, 'cash_commissions', v_cash_commissions, 'v2_close', true));

  BEGIN
    v_z_number := public.next_document_number(v_closure.store_id, 'z_report', v_caller_uid);

    SELECT COALESCE(SUM(tax_amount), 0) INTO v_tax_total
      FROM public.transactions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    SELECT COALESCE(SUM(total_amount), 0) INTO v_devolutions_total
      FROM public.devolutions
      WHERE store_id = v_closure.store_id AND status = 'completed'
        AND created_at > v_closure.created_at AND created_at <= NOW();

    INSERT INTO public.z_reports (
      cash_closure_id, store_id, z_report_number, report_date,
      total_sales, total_cash, total_transfer, total_zelle, total_tax,
      total_devolutions, total_commissions_paid, total_payments_suppliers,
      opening_balance, declared_cash, difference, metadata, generated_by
    ) VALUES (
      p_closure_id, v_closure.store_id, v_z_number, CURRENT_DATE,
      v_cash_sales + v_transfer_sales + v_zelle_sales,
      v_cash_sales, v_transfer_sales, v_zelle_sales, v_tax_total,
      v_devolutions_total, v_cash_commissions, v_cash_payments,
      COALESCE(v_closure.opening_balance, 0), p_declared_cash, v_difference,
      jsonb_build_object('transaction_count', v_tx_count, 'cash_closure_id', p_closure_id),
      v_caller_uid
    )
    RETURNING id INTO v_z_id;

    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('Z_REPORT_GENERATED', 'z_reports', v_z_id, v_closure.store_id, v_caller_uid,
      jsonb_build_object('z_report_number', v_z_number, 'cash_closure_id', p_closure_id,
        'total_sales', v_cash_sales + v_transfer_sales + v_zelle_sales, 'total_tax', v_tax_total));

  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ERR_Z_REPORT_GENERATION_FAILED: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', 'success', 'closure_id', p_closure_id,
    'system_expected_total', v_system_expected_total, 'difference', v_difference,
    'z_report_number', v_z_number, 'z_report_id', v_z_id
  );
END;

$function$
;

-- close_service_order_as_sale/7
-- guarded drop: only fires when an incompatible (older) return type exists;
-- on the certified LIVE state this is a no-op (return type already matches).
DO $drop$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'close_service_order_as_sale'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) IS DISTINCT FROM 'jsonb'
  ) THEN
    DROP FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid);
  END IF;
END
$drop$;
CREATE OR REPLACE FUNCTION public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_transaction_id uuid;
  v_order RECORD;
  v_amount_cup numeric;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_current_status text;
BEGIN
  -- ─── 1. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 3. Idempotencia: si ya está closed con transaction, retornar ───
  IF v_order.status = 'closed' AND v_order.transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_closed', 'transaction_id', v_order.transaction_id);
  END IF;

  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN v_order.budget_total
    ELSE v_order.budget_total * p_exchange_rate
  END;

  -- ─── 4. Calcular desglose de pagos ───
  SELECT
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
  INTO v_cash_amount, v_transfer_amount, v_zelle_amount
  FROM payment_transactions
  WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

  v_effective_method := p_payment_method;
  IF v_cash_amount > 0 AND (v_transfer_amount > 0 OR v_zelle_amount > 0) THEN
    v_effective_method := 'mixed';
  ELSIF v_transfer_amount > 0 AND v_zelle_amount > 0 THEN
    v_effective_method := 'mixed';
  ELSIF v_cash_amount > 0 THEN
    v_effective_method := 'cash';
  ELSIF v_transfer_amount > 0 THEN
    v_effective_method := 'transfer';
  ELSIF v_zelle_amount > 0 THEN
    v_effective_method := 'zelle';
  END IF;

  -- ─── 5. Crear venta ───
  INSERT INTO transactions (
    store_id, seller_id, total_amount, payment_method,
    sale_currency, sale_exchange_rate, status, created_at, completed_at,
    customer_name, customer_phone, customer_ci, customer_address,
    subtotal, cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    p_store_id, p_seller_id, v_order.budget_total,
    v_effective_method::public.payment_method_enum,
    p_currency, p_exchange_rate, 'completed', now(), now(),
    v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
    v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
  ) RETURNING id INTO v_transaction_id;

  -- ─── 6. Crear item de venta — cost_at_sale = 0 (regla congelada: servicios no tienen WAC) ───
  INSERT INTO transaction_items (
    transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
  ) VALUES (
    v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
  );

  -- ─── 7. Transición de estados (inline, no sub-LLamada) ───
  SELECT status INTO v_current_status FROM production_orders WHERE id = p_order_id;

  IF v_current_status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_current_status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET status = 'closed', closed_at = now(), transaction_id = v_transaction_id WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'PRODUCTION_CLOSED_AS_SALE', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'transaction_id', v_transaction_id,
      'budget_total', v_order.budget_total,
      'cost_at_sale', 0,
      'effective_method', v_effective_method
    )
  );

  RETURN jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id);
END;
$function$
;

-- confirm_pending_reception/3
CREATE OR REPLACE FUNCTION public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_store_id uuid;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_unit_cost_cup numeric;
  v_units_to_add numeric;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'pending' THEN RAISE EXCEPTION 'ERR_RECEIPT_ALREADY_CONFIRMED: status=%', v_receipt.status; END IF;

  v_store_id := v_receipt.store_id;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
    v_units_to_add := v_item.quantity;

    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
                    v_units_to_add, v_unit_cost_cup,
                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));

    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
  END LOOP;

  UPDATE receipts
  SET status = 'active', reception_date = v_effective_date,
      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
  WHERE id = p_receipt_id AND status = 'pending';
END $function$
;

-- confirm_transfer/3
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_mov JSONB;
  v_movements JSONB[] := ARRAY[]::JSONB[];
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_stock_info JSONB;
  v_available NUMERIC;
  v_rows_affected INTEGER;
  v_ref_doc TEXT;
  v_new_wac NUMERIC;
  v_dest_before NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
    RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
  END IF;

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    SELECT * INTO v_stock_info FROM public.get_available_stock(v_transfer.origin_store_id, v_item.product_id);
    IF NOT (v_stock_info->>'found')::boolean THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_AT_CONFIRM: %', v_item.product_id;
    END IF;
    v_available := (v_stock_info->>'stock_available')::numeric;
    IF v_available < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, disponible=%, solicitado=%',
        v_item.product_id, v_available, v_item.quantity;
    END IF;
  END LOOP;

  -- DF-06: lock determinista de filas de producto (origen y destino) antes de mover valor
  FOR v_item IN
    SELECT product_id AS pid, origin_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    UNION
    SELECT destination_product_id AS pid, destination_store_id AS sid FROM public.transfer_items ti
      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
    ORDER BY sid, pid
  LOOP
    PERFORM 1 FROM public.products WHERE id = v_item.pid AND store_id = v_item.sid FOR UPDATE;
  END LOOP;

  UPDATE public.transfers
    SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
    WHERE id = p_transfer_id;

  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8));

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    UPDATE public.inventory_reservations
      SET status = 'CONSUMED', consumed_at = NOW()
      WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id
        AND product_id = v_item.product_id AND status = 'ACTIVE';
    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: transferencia % producto %', p_transfer_id, v_item.product_id;
    END IF;

    -- DF-06: blend D-01 en destino con uc_transfer congelado, ANTES del dest-in
    -- (kardex del destino lee ca_new). Semilla de destino nuevo = blend con S=0.
    SELECT stock_current INTO v_dest_before FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id;
    v_new_wac := public.fn_recalc_wac(
      v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_in',
      v_item.quantity, v_item.unit_cost,
      jsonb_build_object('rpc','confirm_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, NULL, p_operation_date, TRUE
    );
    v_movements := array_append(v_movements, v_mov);
  END LOOP;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
    jsonb_build_object('dest', v_transfer.destination_store_id,
      'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
      'reference_doc', v_ref_doc,
      'dest_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END $function$
;

-- create_devolution/10
CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_dev_number text;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    COALESCE(p_currency, 'CUP'), COALESCE(p_payment_method, 'cash'), 'completed', p_customer_id, p_customer_name, p_notes, v_caller_uid, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    -- DF-01: entrada de stock A1 NEUTRA — SIN blend WAC (antes: blend propio L75-85 = defecto)
    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'DEVOLUTION_CREATED', 'devolutions', v_devolution_id,
    jsonb_build_object('devolution_number', v_dev_number, 'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total, 'items_count', jsonb_array_length(p_items), 'wac_neutral_a1', true));

  RETURN jsonb_build_object('status','success','devolution_id',v_devolution_id,
    'devolution_number',v_dev_number,'total_amount',v_total);
END $function$
;

-- create_devolution_v2/10
CREATE OR REPLACE FUNCTION public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_devolution_id uuid := gen_random_uuid();
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_existing uuid;
  v_dev_number text;
  v_devolution_cost numeric;
  v_total numeric := 0;
  v_sold_qty numeric;
  v_devolved_qty numeric;
  v_locked_sale uuid;
  v_session_id uuid;
  v_pt_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','devolution_id',v_existing);
    END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- DF-07: LOCK venta original PRIMERO
  IF p_original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
  END IF;
  SELECT id INTO v_locked_sale FROM public.transactions
    WHERE id = p_original_transaction_id AND store_id = p_store_id
    FOR UPDATE;
  IF v_locked_sale IS NULL THEN
    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
  END IF;

  -- DF-07: tope por (venta, producto) DESPUÉS del lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
    END IF;

    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;

    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
    FROM public.devolution_items di
    JOIN public.devolutions d ON d.id = di.devolution_id
    WHERE d.original_transaction_id = p_original_transaction_id
      AND di.product_id = v_pid
      AND d.status IN ('pending','completed');

    IF v_devolved_qty + v_qty > v_sold_qty THEN
      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
        v_pid, v_sold_qty, v_devolved_qty, v_qty;
    END IF;
  END LOOP;

  -- Método permitido
  IF p_payment_method NOT IN ('cash','transfer','zelle','store_credit') THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_METHOD: %', p_payment_method;
  END IF;

  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);

  INSERT INTO public.devolutions (
    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
    currency, payment_method, status, customer_id, customer_name, notes, processed_by,
    idempotency_key, created_at
  ) VALUES (
    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
    'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes,
    v_caller_uid, p_idempotency_key, NOW()
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);

    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));

    v_total := v_total + (v_qty * v_price);

    v_devolution_cost := NULL;
    IF p_original_transaction_id IS NOT NULL THEN
      SELECT cost_at_sale INTO v_devolution_cost
      FROM public.transaction_items
      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
    END IF;
    IF v_devolution_cost IS NULL THEN
      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
    END IF;
    v_devolution_cost := COALESCE(v_devolution_cost, 0);

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
      p_quantity := v_qty, p_movement_type := 'return',
      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
      p_operation_date := NOW(), p_skip_access_check := TRUE
    );
  END LOOP;

  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;

  -- ═══ DF-03: CONTRA-ASIENTO FINANCIERO en la MISMA TX ═══
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'ERR_DEVOLUTION_AMOUNT_POSITIVE';
  END IF;

  IF p_payment_method IN ('cash','transfer','zelle') THEN
    -- sesión de caja abierta de la tienda (find-or-create para que el out nunca se pierda)
    SELECT id INTO v_session_id FROM public.cash_register_sessions
      WHERE store_id = p_store_id AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO public.cash_register_sessions (store_id, cashier_id, opening_cash, opened_at, status)
      VALUES (p_store_id, v_caller_uid, 0, NOW(), 'open')
      RETURNING id INTO v_session_id;
    END IF;

    -- contra-asiento de caja: out por el total devuelto
    INSERT INTO public.cash_movements (session_id, movement_type, method, amount, reason, store_id)
    VALUES (v_session_id, 'out', p_payment_method::payment_method_enum, v_total,
            'Devolución ' || v_dev_number || ': ' || COALESCE(p_reason,''), p_store_id);

    -- asiento financiero trazable: venta → devolución → reversión
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, direction, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
      v_total, p_payment_method, 'CUP', 1.0,
      NOW(), 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
    ) RETURNING id INTO v_pt_id;

  ELSIF p_payment_method = 'store_credit' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
    END IF;
    -- pasivo visible y auditable; la caja NO se toca (el dinero ya no sale)
    INSERT INTO public.store_credit_ledger
      (store_id, customer_id, amount, devolution_id, origin_transaction_id, idempotency_key, created_by)
    VALUES
      (p_store_id, p_customer_id, v_total, v_devolution_id, p_original_transaction_id,
       'dev-' || v_devolution_id::text || '-credit', v_caller_uid);
  END IF;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, p_store_id, 'DEVOLUTION_CREATED_V2', 'devolutions', v_devolution_id,
    jsonb_build_object(
      'devolution_number', v_dev_number,
      'original_transaction_id', p_original_transaction_id,
      'total_amount', v_total,
      'items_count', jsonb_array_length(p_items),
      'cap_lock_df07', true,
      'financial_contra_entry_df03',
        jsonb_build_object('method', p_payment_method, 'amount', v_total,
          'cash_out', (p_payment_method <> 'store_credit'),
          'idempotency_key', 'dev-' || v_devolution_id::text || '-refund')
    )
  );

  RETURN jsonb_build_object(
    'status','success',
    'devolution_id', v_devolution_id,
    'devolution_number', v_dev_number,
    'total_amount', v_total,
    'financial_effect', CASE WHEN p_payment_method = 'store_credit' THEN 'store_credit_ledger' ELSE 'cash_out_and_refund' END
  );
END $function$
;

-- create_vale_salida/6
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slip_id      uuid := gen_random_uuid();
  v_slip_number  text;
  v_caller_uid   uuid;
  v_product_id   uuid;
  v_variant_id   uuid;
  v_quantity     numeric;
  v_unit_cost    numeric;
  v_total_cost   numeric := 0;
  v_item         jsonb;
  v_po_item_id   uuid;
  v_po_product   uuid;
  v_po_variant   uuid;
  v_seen_po_items uuid[] := ARRAY[]::uuid[];
  v_existing_result JSONB;
  v_param_hash TEXT;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_store_id::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);

  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, total_cost, created_by)
  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, p_notes, 0, v_caller_uid);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
    v_quantity   := (v_item->>'quantity')::numeric;
    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

    IF p_production_order_id IS NOT NULL THEN
      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
      v_seen_po_items := v_seen_po_items || v_po_item_id;

      SELECT product_id, variant_id INTO v_po_product, v_po_variant
      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;

      -- DF-09: firma consolidada v3 — costo SIEMPRE server-side (sin p_unit_cost)
      PERFORM public.withdraw_production_item_v3(
        p_item_id := v_po_item_id, p_qty := v_quantity,
        p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_idempotency_key := NULL,
        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number
      );
      -- el costo usado por v3 (server-side) para el asiento del vale:
      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id;
    ELSE
      IF v_variant_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
        END IF;
      END IF;

      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;

      PERFORM register_stock_movement(
        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
        p_variant_id := v_variant_id, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);

    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
  END LOOP;

  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
      jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
  END IF;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
      'withdraw_signature', 'v3_server_side_df09'));

  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
END $function$
;

-- fn_log_system_health/1
CREATE OR REPLACE FUNCTION public.fn_log_system_health(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id uuid;
    v_status text;
    v_priority text;
BEGIN
    -- Validate required fields
    IF p_payload->>'view_name' IS NULL OR p_payload->>'view_name' = '' THEN
        RAISE EXCEPTION 'view_name is required';
    END IF;

    IF p_payload->>'description' IS NULL OR p_payload->>'description' = '' THEN
        RAISE EXCEPTION 'description is required';
    END IF;

    v_status := p_payload->>'status';
    IF v_status NOT IN ('ok', 'warning', 'error', 'critical') THEN
        RAISE EXCEPTION 'Invalid status: %', v_status;
    END IF;

    v_priority := p_payload->>'priority';
    IF v_priority NOT IN ('low', 'medium', 'high') THEN
        RAISE EXCEPTION 'Invalid priority: %', v_priority;
    END IF;

    -- Insert log
    INSERT INTO public.system_health_logs (
        view_name,
        tool_name,
        status,
        description,
        suggestion,
        screenshot_url,
        context,
        priority
    ) VALUES (
        p_payload->>'view_name',
        p_payload->>'tool_name',
        v_status,
        p_payload->>'description',
        p_payload->>'suggestion',
        p_payload->>'screenshot_url',
        COALESCE((p_payload->'context'), '{}'::jsonb),
        v_priority
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$
;

-- fn_process_receipt/4
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_store_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_cost numeric;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_stock numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_store uuid := p_store_id;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
    END IF;

    INSERT INTO public.receipts (user_id, store_id, status, reference_doc)
    VALUES (p_user_id, v_store, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::numeric;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
            VALUES (
                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
                v_new_details->>'image_url', 0, 0, v_store)
            RETURNING id INTO v_prod_id;
            v_current_stock := 0; v_current_avg_cost := 0;
        ELSE
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku AND store_id = v_store;
            IF v_prod_id IS NULL THEN
                SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
            END IF;
            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
            END IF;
            SELECT store_id INTO v_store FROM public.products WHERE id = v_prod_id;
            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
            FROM public.products WHERE id = v_prod_id FOR UPDATE;
        END IF;

        v_new_stock := COALESCE(v_current_stock,0) + v_qty;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);

        -- DF-01: mismo contrato que la 3-arg (WAC primero, movimiento canónico)
        PERFORM public.fn_recalc_wac(v_store, v_prod_id, 'direct_ingest', v_qty, v_cost,
                   jsonb_build_object('rpc','fn_process_receipt4','receipt_id',v_receipt_id));
        PERFORM public.register_stock_movement(
          p_product_id := v_prod_id, p_store_id := v_store, p_user_id := p_user_id,
          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
          p_operation_date := now(), p_skip_access_check := TRUE);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END $function$
;

-- fn_process_receipt/3
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty numeric;
    v_cost numeric;
    v_current_stock numeric;
    v_current_avg_cost numeric;
    v_new_stock numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_store_id uuid;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
    END IF;

    INSERT INTO public.receipts (user_id, status, reference_doc)
    VALUES (p_user_id, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::numeric;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            SELECT s.id INTO v_store_id FROM public.stores s ORDER BY s.created_at LIMIT 1;
            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
            VALUES (
                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
                v_new_details->>'image_url', 0, 0, v_store_id)
            RETURNING id INTO v_prod_id;
            v_current_stock := 0; v_current_avg_cost := 0;
        ELSE
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
            IF v_prod_id IS NULL THEN
                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
            END IF;
            SELECT store_id INTO v_store_id FROM public.products WHERE id = v_prod_id;
            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
            FROM public.products WHERE id = v_prod_id FOR UPDATE;
        END IF;

        v_new_stock := COALESCE(v_current_stock,0) + v_qty;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);

        -- DF-01: WAC primero (S_prev) vía escritor único; stock vía MOVIMIENTO canónico
        -- (corrige además el desync products↔inventory del legacy); SIN espejo cost_price (D-02)
        PERFORM public.fn_recalc_wac(v_store_id, v_prod_id, 'direct_ingest', v_qty, v_cost,
                   jsonb_build_object('rpc','fn_process_receipt','receipt_id',v_receipt_id));
        PERFORM public.register_stock_movement(
          p_product_id := v_prod_id, p_store_id := v_store_id, p_user_id := p_user_id,
          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
          p_operation_date := now(), p_skip_access_check := TRUE);

        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;

    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END $function$
;

-- fn_process_sale/3
CREATE OR REPLACE FUNCTION public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_sale_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty int;
    v_price numeric;
    v_current_stock int;
    v_cost_at_sale numeric;
    v_new_stock int;
    v_total_sale numeric := 0;
    v_store_id uuid;
    v_auth_user_id uuid := auth.uid();
BEGIN
    -- Security validation: Impersonation check
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_cashier_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
    END IF;

    -- Get cashier store
    SELECT store_id INTO v_store_id FROM public.profiles WHERE id = p_cashier_id;
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'El cajero no tiene una tienda asignada';
    END IF;

    INSERT INTO public.sales (cashier_id, payment_method)
    VALUES (p_cashier_id, p_payment_method)
    RETURNING id INTO v_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::uuid;
        v_qty := (v_item->>'quantity')::int;
        v_price := (v_item->>'unit_price')::numeric;

        -- Verify product belongs to the same store
        IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_prod_id AND store_id = v_store_id) THEN
            RAISE EXCEPTION 'Producto % no pertenece a la tienda del cajero', v_prod_id;
        END IF;

        SELECT stock_current, cost_average INTO v_current_stock, v_cost_at_sale
        FROM public.products WHERE id = v_prod_id FOR UPDATE;

        IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Stock insuficiente para producto %', v_prod_id;
        END IF;

        v_new_stock := v_current_stock - v_qty;

        INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price_sold, cost_at_sale)
        VALUES (v_sale_id, v_prod_id, v_qty, v_price, COALESCE(v_cost_at_sale, 0));

        UPDATE public.products SET stock_current = v_new_stock WHERE id = v_prod_id;

        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_prod_id, 'OUT_SALE', -v_qty, v_sale_id, p_cashier_id, v_new_stock);

        v_total_sale := v_total_sale + (v_qty * v_price);
    END LOOP;

    UPDATE public.sales SET total_amount = v_total_sale WHERE id = v_sale_id;

    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
    VALUES (p_cashier_id, 'INSERT_SALE', 'sales', v_sale_id, jsonb_build_object('total', v_total_sale), v_store_id);

    RETURN v_sale_id;
END;
$function$
;

-- fn_recalc_wac/6
CREATE OR REPLACE FUNCTION public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb DEFAULT NULL::jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_S        numeric;
  v_ca_prev  numeric;
  v_ca_new   numeric;
BEGIN
  IF p_store_id IS NULL OR p_product_id IS NULL OR p_event IS NULL THEN
    RAISE EXCEPTION 'ERR_WAC_RECALC_ARGS: store/product/event obligatorios';
  END IF;

  SELECT stock_current, cost_average
  INTO v_S, v_ca_prev
  FROM products
  WHERE id = p_product_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: % store %', p_product_id, p_store_id;
  END IF;

  v_S := COALESCE(v_S, 0);
  v_ca_prev := COALESCE(v_ca_prev, 0);

  IF p_qty_in IS NULL OR p_qty_in = 0 THEN
    -- Salida pura / devolución A1 / evento neutro: WAC INVARIANTE
    v_ca_new := v_ca_prev;
  ELSIF p_qty_in > 0 THEN
    -- Entrada: blend canónico D-01: ca_new = (S·ca_prev + q·uc) / (S+q)
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  ELSE
    -- Reversa de entrada (q<0): inversa exacta del blend; exige S+q > 0
    IF v_S + p_qty_in <= 0 THEN
      RAISE EXCEPTION 'ERR_WAC_REVERSE_NEGATIVE_STOCK: S=% q=%', v_S, p_qty_in;
    END IF;
    v_ca_new := (v_S * v_ca_prev + p_qty_in * COALESCE(p_uc_in, 0)) / (v_S + p_qty_in);
  END IF;

  -- Token de escritor: válido SOLO durante este UPDATE (re-sellado tras él)
  SET LOCAL app.wac_writer = 'fn_recalc_wac';
  UPDATE products
     SET cost_average = v_ca_new, updated_at = now()
   WHERE id = p_product_id AND store_id = p_store_id;
  SET LOCAL app.wac_writer = '';

  INSERT INTO public.wac_change_log
    (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, changed_by)
  VALUES
    (p_store_id, p_product_id, v_ca_prev, v_ca_new, p_event, p_qty_in, p_uc_in,
     p_source_ref, auth.uid());

  RETURN v_ca_new;
END $function$
;

-- fn_void_receipt/2
CREATE OR REPLACE FUNCTION public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_rec record;
    v_item record;
    v_sale_after_count int;
    v_current_stock int;
    v_new_stock int;
BEGIN
    -- 1. Get Receipt
    SELECT * INTO v_rec FROM public.receipts WHERE id = p_receipt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recepción no encontrada'; END IF;
    IF v_rec.status = 'voided' THEN RAISE EXCEPTION 'Recepción ya anulada'; END IF;

    -- 2. Check for subsequent SALES for these products that might compromise stock
    -- Simple check: If any stock movement of type 'OUT_SALE' exists for these products AFTER receipt creation
    -- Ideally we should check if reversing this makes stock negative.
    
    FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id
    LOOP
        -- Check current stock
        SELECT stock_current INTO v_current_stock FROM public.products WHERE id = v_item.product_id FOR UPDATE;
        
        v_new_stock := v_current_stock - v_item.quantity;
        
        IF v_new_stock < 0 THEN
            RAISE EXCEPTION 'No se puede anular: El stock actual (%) es menor a la cantidad a revertir (%) para producto %', v_current_stock, v_item.quantity, v_item.product_id;
        END IF;

        -- Revert Stock
        UPDATE public.products SET stock_current = v_new_stock WHERE id = v_item.product_id;

        -- Log Reverse Movement
        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_item.product_id, 'VOID_RECEIPT', -v_item.quantity, p_receipt_id, p_user_id, v_new_stock);
    END LOOP;

    -- 3. Mark Void
    UPDATE public.receipts SET status = 'voided' WHERE id = p_receipt_id;

    -- 4. Audit
    INSERT INTO public.audit_logs (user_id, table_name, record_id, action, metadata)
    VALUES (p_user_id, 'receipts', p_receipt_id, 'VOID', jsonb_build_object('reason', 'User requested void'));

    RETURN true;
END;
$function$
;

-- generate_bulk_confirmation_token/3
CREATE OR REPLACE FUNCTION public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
  v_has_protected BOOLEAN;
  v_caller_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar tokens bulk';
    END IF;
    -- Verificar que p_user_id coincide con auth.uid()
    IF p_user_id != auth.uid() THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_user_id debe coincidir con el usuario autenticado';
    END IF;
  END IF;

  IF p_action NOT IN ('delete', 'archive') THEN
    RAISE EXCEPTION 'ERR_NON_DESTRUCTIVE_ACTION';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stores
    WHERE id = ANY(p_store_ids) AND backup_restore_protected = true
  ) INTO v_has_protected;

  v_token := 'bct_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at, metadata
  ) VALUES (
    v_token, p_store_ids, p_action, p_user_id,
    NOW() + INTERVAL '10 minutes',
    jsonb_build_object('has_protected_stores', v_has_protected)
  );

  RETURN v_token;
END;
$function$
;

-- generate_bulk_override_token/3
CREATE OR REPLACE FUNCTION public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original RECORD;
  v_override_token TEXT;
  v_override_user_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin, y debe ser auth.uid() == p_override_user_id
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != p_override_user_id THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: p_override_user_id debe coincidir con el usuario autenticado';
    END IF;

    SELECT role INTO v_override_user_role FROM public.profiles WHERE id = p_override_user_id;
    IF v_override_user_role IS NULL OR v_override_user_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede generar override';
    END IF;
  END IF;

  SELECT * INTO v_original
  FROM public.bulk_confirmation_tokens
  WHERE token = p_confirmation_token
    AND consumed_at IS NULL
    AND expires_at > NOW()
    AND is_override = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_INVALID_OR_EXPIRED_TOKEN';
  END IF;

  IF v_original.created_by = p_override_user_id THEN
    RAISE EXCEPTION 'ERR_SAME_USER_OVERRIDE';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.bulk_confirmation_tokens
    WHERE override_for = p_confirmation_token
      AND consumed_at IS NULL AND expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'ERR_OVERRIDE_ALREADY_EXISTS';
  END IF;

  v_override_token := 'bot_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.bulk_confirmation_tokens (
    token, store_ids, action, created_by, expires_at,
    is_override, override_for, metadata
  ) VALUES (
    v_override_token, v_original.store_ids, v_original.action, p_override_user_id,
    NOW() + INTERVAL '10 minutes', true, p_confirmation_token,
    jsonb_build_object('override_reason', p_reason,
      'original_created_by', v_original.created_by,
      'override_created_by', p_override_user_id)
  );

  INSERT INTO public.audit_logs (action, table_name, record_id, metadata)
  VALUES (
    'bulk_override_token_generated', 'stores', NULL,
    jsonb_build_object('confirmation_token', p_confirmation_token,
      'store_ids', v_original.store_ids,
      'override_by', p_override_user_id,
      'original_by', v_original.created_by, 'reason', p_reason)
  );

  RETURN v_override_token;
END;
$function$
;

-- generate_inventory_snapshot/1
CREATE OR REPLACE FUNCTION public.generate_inventory_snapshot(p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    INSERT INTO public.inventory_snapshots (store_id, product_id, quantity, snapshot_date)
    SELECT store_id, product_id, quantity, now() FROM public.inventory WHERE store_id = p_store_id;
END;
$function$
;

-- increment_user_usage/3
CREATE OR REPLACE FUNCTION public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check current count
    SELECT count INTO v_count
    FROM user_usage
    WHERE user_id = p_user_id
      AND action_type = p_action_type
      AND usage_date = CURRENT_DATE;

    IF v_count IS NULL THEN
        -- First action of the day
        INSERT INTO user_usage (user_id, action_type, usage_date, count)
        VALUES (p_user_id, p_action_type, CURRENT_DATE, 1);
        RETURN TRUE;
    ELSIF v_count < p_limit OR p_limit < 0 THEN
        -- Under limit or unlimited (-1)
        UPDATE user_usage
        SET count = count + 1,
            updated_at = NOW()
        WHERE user_id = p_user_id
          AND action_type = p_action_type
          AND usage_date = CURRENT_DATE;
        RETURN TRUE;
    ELSE
        -- Limit reached
        RETURN FALSE;
    END IF;
END;
$function$
;

-- log_audit_event/3
CREATE OR REPLACE FUNCTION public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_prev_hash TEXT;
    v_payload_hash TEXT;
    v_event_hash TEXT;
    v_event_id UUID;
    v_tenant_id UUID;
    v_role TEXT;
    v_timestamp TIMESTAMPTZ;
    v_ts_str TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock(20240325);
    v_timestamp := (now() AT TIME ZONE 'utc');
    v_ts_str := to_char(v_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    SELECT tenant_id, role::text INTO v_tenant_id, v_role FROM public.profiles WHERE id = auth.uid();
    -- Use seq_id for deterministic last record
    SELECT event_hash INTO v_prev_hash FROM public.audit_events ORDER BY seq_id DESC LIMIT 1;
    v_payload_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || v_ts_str, 'sha256'), 'hex');
    INSERT INTO public.audit_events (actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash, utc_timestamp)
    VALUES (auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash, v_timestamp)
    RETURNING id INTO v_event_id;
    RETURN v_event_id;
END;
$function$
;

-- log_transaction_changes/0
CREATE OR REPLACE FUNCTION public.log_transaction_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Handle different user column names
        IF TG_TABLE_NAME = 'transactions' THEN
            v_user_id := NEW.seller_id;
        ELSIF TG_TABLE_NAME = 'receipts' THEN
            v_user_id := NEW.user_id;
        END IF;

        INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
        VALUES (
            COALESCE(auth.uid(), v_user_id), 
            'UPDATE_STATUS', 
            TG_TABLE_NAME, 
            NEW.id, 
            jsonb_build_object('old', OLD.status), 
            jsonb_build_object('new', NEW.status),
            NEW.store_id
        );
    END IF;
    RETURN NEW;
END;
$function$
;

-- manage_user_memberships/2
CREATE OR REPLACE FUNCTION public.manage_user_memberships(p_user_id uuid, p_memberships jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    m JSONB;
    v_caller_role text;
BEGIN
    -- SECURITY CHECK: Use helper to get role safely
    v_caller_role := public.get_my_role();

    IF v_caller_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can manage user memberships.';
    END IF;

    -- Replacement logic
    IF v_caller_role = 'admin' THEN
        -- Admins can replace all memberships
        DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    ELSE
        -- Encargados can only replace memberships for stores they manage
        DELETE FROM public.user_store_memberships
        WHERE user_id = p_user_id
        AND store_id IN (
            SELECT store_id FROM public.user_store_memberships
            WHERE user_id = auth.uid()
              AND role IN ('encargado', 'manager')
              AND status = 'active'
        );
    END IF;

    -- Insert new/updated memberships
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
            -- Basic validation: Ensure store_id is not null/empty
            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
                -- If not admin, check if they are manager of this store
                IF v_caller_role = 'admin' OR public.is_store_manager((m->>'store_id')::UUID) THEN
                    INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
                    VALUES (
                        p_user_id,
                        (m->>'store_id')::UUID,
                        (m->>'role')::public.user_role,
                        COALESCE((m->>'status')::public.membership_status, 'active')
                    )
                    ON CONFLICT (user_id, store_id) DO UPDATE SET 
                        role = EXCLUDED.role,
                        status = EXCLUDED.status,
                        updated_at = now();
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Ensure active_store_id is still valid for the user
    UPDATE public.profiles
    SET active_store_id = (
        SELECT store_id FROM public.user_store_memberships
        WHERE user_id = p_user_id AND status = 'active' LIMIT 1
    )
    WHERE id = p_user_id
    AND (
        active_store_id NOT IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = p_user_id AND status = 'active')
        OR active_store_id IS NULL
    );
END;
$function$
;

-- managed_create_store/2
CREATE OR REPLACE FUNCTION public.managed_create_store(p_name text, p_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_store_id uuid;
    v_role user_role;
BEGIN
    -- 🛡️ RBAC Check: Only admins or specifically empowered roles can create stores.
    -- (The existing trigger enforce_encargado_store_limit might allow it, but let's be explicit here)
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    
    IF v_role IS NULL OR v_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Insufficient permissions to create a store.';
    END IF;

    INSERT INTO public.stores (name, address, created_by)
    VALUES (p_name, p_address, auth.uid())
    RETURNING id INTO v_store_id;

    RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'message', 'Store created');
END;
$function$
;

-- managed_create_user/9
CREATE OR REPLACE FUNCTION public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_role_id UUID;
    v_role_enum user_role;
    v_role_name TEXT;
    v_user_id UUID;
    v_active_store_id UUID;
    v_creator_role user_role;
    v_auth_uid uuid := auth.uid();
    m JSONB;
BEGIN
    -- 🛡️ identity Verification
    IF p_creator_id IS NOT NULL AND p_creator_id != v_auth_uid THEN
         RAISE EXCEPTION 'ERR_UNAUTHORIZED: Creator ID mismatch.';
    END IF;

    -- 🛡️ RBAC Check
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_auth_uid;
    IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    -- Normalize Role Name
    v_role_name := lower(p_role);
    IF v_role_name IN ('cajero', 'clerk') THEN v_role_enum := 'clerk'::user_role;
    ELSIF v_role_name IN ('almacenero', 'warehouse') THEN v_role_enum := 'warehouse'::user_role;
    ELSIF v_role_name IN ('encargado', 'manager') THEN v_role_enum := 'encargado'::user_role;
    ELSIF v_role_name IN ('admin') THEN v_role_enum := 'admin'::user_role;
    ELSE v_role_enum := 'costo'::user_role;
    END IF;

    -- 🛡️ ROLE HIERARCHY CHECK (CRITICAL FIX)
    IF v_role_enum = 'admin' AND v_creator_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can create other admins.';
    END IF;

    -- Get Role ID from table
    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(v_role_enum::text) LIMIT 1;
    
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'costo' LIMIT 1;
        v_role_enum := 'costo'::user_role;
    END IF;

    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    -- Determine initial active_store_id
    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
    ELSE
        v_active_store_id := p_store_id;
    END IF;

    -- Create or update profile
    INSERT INTO public.profiles (
        id, email, full_name, role, role_id, active_store_id, is_active, max_stores_limit, max_users_limit, created_by
    ) VALUES (
        v_user_id, p_email, p_full_name, v_role_enum, v_role_id, v_active_store_id, true, p_max_stores, p_max_users, v_auth_uid
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        role_id = EXCLUDED.role_id,
        active_store_id = EXCLUDED.active_store_id,
        is_active = EXCLUDED.is_active,
        max_stores_limit = EXCLUDED.max_stores_limit,
        max_users_limit = EXCLUDED.max_users_limit;

    -- Handle memberships
    IF p_memberships IS NOT NULL THEN
        DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
        LOOP
             -- Only allow adding memberships to stores the creator has access to
             IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
                INSERT INTO public.user_store_memberships (user_id, store_id, role)
                VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
             END IF;
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        IF v_creator_role = 'admin' OR public.has_store_access(p_store_id) THEN
            INSERT INTO public.user_store_memberships (user_id, store_id, role)
            VALUES (v_user_id, p_store_id, v_role_enum)
            ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$
;

-- managed_delete_product/1
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

  DELETE FROM public.inventory
  WHERE product_id = p_product_id
    AND store_id = v_store_id;

  DELETE FROM public.product_variants
  WHERE product_id = p_product_id;

  DELETE FROM public.products
  WHERE id = p_product_id
    AND store_id = v_store_id;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
  VALUES (
    auth.uid(),
    'DELETE_PRODUCT',
    'products',
    p_product_id,
    jsonb_build_object('name', v_product_name, 'store_id', v_store_id)
  );
END;
$function$
;

-- managed_toggle_product_active/2
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

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'ACTIVATE_PRODUCT' ELSE 'DEACTIVATE_PRODUCT' END,
    'products',
    p_product_id,
    jsonb_build_object('is_active', v_old_active, 'store_id', v_store_id),
    jsonb_build_object('is_active', p_is_active, 'store_id', v_store_id)
  );
END;
$function$
;

-- perform_inventory_adjustment/7
CREATE OR REPLACE FUNCTION public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric DEFAULT NULL::numeric, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_actual NUMERIC;
  v_costo_promedio_actual NUMERIC;
  v_nuevo_stock NUMERIC;
  v_costo_unitario_movimiento NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date);

  SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
    INTO v_stock_actual, v_costo_promedio_actual
  FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;

  IF v_stock_actual IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_IN_STORE';
  END IF;

  v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);
  v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);

  IF p_quantity_delta > 0 THEN
    -- DF-01: blend vía escritor único (antes: CASE dentro del UPDATE)
    PERFORM public.fn_recalc_wac(p_store_id, p_product_id, 'adjustment_plus',
                 p_quantity_delta, v_costo_unitario_movimiento,
                 jsonb_build_object('rpc','perform_inventory_adjustment','reason',p_reason));
  END IF;
  -- Δ<0: WAC invariante (correcto por diseño A1/salida pura)

  UPDATE public.products
    SET stock_current = v_nuevo_stock, updated_at = v_effective_date
  WHERE id = p_product_id AND store_id = p_store_id;

  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := p_quantity_delta,
    p_movement_type := 'adjustment',
    p_unit_cost := v_costo_unitario_movimiento,
    p_reason := p_reason,
    p_operation_date := v_effective_date,
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock,
    'new_cost_average', (SELECT cost_average FROM public.products WHERE id=p_product_id AND store_id=p_store_id));
END $function$
;

-- process_inventory_adjustment/4
CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adjustment_id UUID;
  v_item public.adjustment_item;
  v_difference NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
  -- Validación forward-only locking
  PERFORM public.validate_operation_date(p_operation_date, p_store_id);

  INSERT INTO public.inventory_adjustments (store_id, created_by, status, created_at)
  VALUES (p_store_id, p_cashier_id, 'PROCESSING', v_effective_date)
  RETURNING id INTO v_adjustment_id;

  FOREACH v_item IN ARRAY p_items
  LOOP
    v_difference := v_item.counted_quantity - v_item.expected_quantity;
    INSERT INTO public.inventory_adjustment_items (adjustment_id, product_id, expected_quantity, counted_quantity, created_at)
    VALUES (v_adjustment_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity, v_effective_date);

    PERFORM public.register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := p_store_id,
        p_user_id := p_cashier_id,
        p_quantity := v_difference,
        p_movement_type := 'adjustment',
        p_operation_date := v_effective_date
    );
  END LOOP;

  UPDATE public.inventory_adjustments SET status = 'COMPLETED', updated_at = v_effective_date
  WHERE id = v_adjustment_id;
  RETURN v_adjustment_id;
END;
$function$
;

-- process_pick3_transaction/7
CREATE OR REPLACE FUNCTION public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid DEFAULT NULL::uuid, p_reference_play_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS pick3_ledger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_current_balance bigint;
    v_new_balance bigint;
    v_ledger_entry public.pick3_ledger;
BEGIN
    -- Get or create profile and lock it for update
    INSERT INTO public.pick3_profiles (user_id, current_bankroll, initial_bankroll)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT current_bankroll INTO v_current_balance
    FROM public.pick3_profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Calculate new balance
    IF p_type IN ('initial_deposit', 'win', 'adjustment') THEN
        v_new_balance := v_current_balance + p_amount;
    ELSIF p_type IN ('bet', 'withdrawal') THEN
        v_new_balance := v_current_balance - p_amount;
    ELSE
        RAISE EXCEPTION 'Invalid transaction type: %', p_type;
    END IF;

    -- Update profile
    UPDATE public.pick3_profiles
    SET current_bankroll = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Insert ledger entry
    INSERT INTO public.pick3_ledger (
        user_id, type, amount, balance_before, balance_after, 
        reference_draw_id, reference_play_id, notes, metadata
    )
    VALUES (
        p_user_id, p_type, p_amount, v_current_balance, v_new_balance,
        p_reference_draw_id, p_reference_play_id, p_notes, p_metadata
    )
    RETURNING * INTO v_ledger_entry;

    RETURN v_ledger_entry;
END;
$function$
;

-- register_stock_movement/12
CREATE OR REPLACE FUNCTION public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid, p_unit_cost numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_skip_access_check boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_qty NUMERIC; v_new_version BIGINT;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_dist_costs NUMERIC := 0;
BEGIN
  IF NOT p_skip_access_check AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;
  IF p_quantity = 0 THEN RETURN jsonb_build_object('status','skipped'); END IF;

  INSERT INTO public.stock_movements (
    product_id, store_id, created_by, variant_id, quantity_change,
    movement_type, reference_id, reference_doc, unit_cost, notes, movement_date, created_at
  ) VALUES (
    p_product_id, p_store_id, p_user_id, p_variant_id, p_quantity,
    LOWER(p_movement_type)::public.movement_type, p_sale_id::text, p_reason,
    COALESCE(p_unit_cost,0), p_notes, v_eff, v_eff
  ) RETURNING balance_after INTO v_new_qty;

  SELECT version INTO v_new_version FROM public.inventory
  WHERE product_id = p_product_id AND store_id = p_store_id;

  UPDATE public.products SET stock_current = v_new_qty, updated_at = v_eff
  WHERE id = p_product_id AND store_id = p_store_id;

  -- FIX F4-01: PMP incluye costos asociados distribuidos
  IF COALESCE(p_unit_cost,0) > 0 AND p_quantity > 0 THEN
    SELECT COALESCE(SUM(scd.distribution_amount),0) INTO v_dist_costs
    FROM public.service_cost_distributions scd
    JOIN public.receipts r ON r.id = scd.receipt_id
    WHERE scd.product_id = p_product_id AND r.store_id = p_store_id AND r.status != 'voided';
    -- A2 WAC HOTFIX (v2.22.0): WAC update removed from register_stock_movement.
    -- The trigger trg_update_product_wac handles WAC for receipt_items.
    -- For other paths (transfers, devolutions, etc.), cost_average stays as-is
    -- until Grupo B/C adds WAC logic to those specific RPCs.
  END IF;

  INSERT INTO public.business_events (event_type, entity_id, payload, created_at) VALUES (
    'stock_movement', p_product_id,
    jsonb_build_object('store_id',p_store_id,'qty',p_quantity,'type',LOWER(p_movement_type),'new_qty',v_new_qty),
    v_eff
  );
  RETURN jsonb_build_object('status','ok','new_quantity',v_new_qty,'new_version',v_new_version);
END
$function$
;

-- release_expired_reservations/0
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_sample_id uuid;
  v_sample_store_id uuid;
BEGIN
  -- Capturar un sample antes del UPDATE para el audit log
  SELECT id, store_id INTO v_sample_id, v_sample_store_id
    FROM public.inventory_reservations
    WHERE status = 'ACTIVE' AND expires_at < now()
    LIMIT 1;
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- FIX: audit_logs.record_id es uuid, no text. Usar v_sample_id directo.
  -- Si v_count = 0, v_sample_id es NULL y el INSERT se skipnea (no hay rows).
  IF v_count > 0 AND v_sample_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('RESERVATION_EXPIRED', 'inventory_reservations', v_sample_id, v_sample_store_id, NULL,
      jsonb_build_object('count', v_count, 'reason', 'auto-release expired reservations'));
  END IF;
  RETURN v_count;
END;
$function$
;

-- reset_store_data/3
CREATE OR REPLACE FUNCTION public.reset_store_data(target_store_id uuid, p_keep_catalog boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$

DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_validation JSONB;
  v_blockers TEXT;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- SECURITY H2: require management role (admin/manager/encargado) for destructive ops
  IF NOT public.has_management_access_as(v_caller_uid, target_store_id) THEN
    RAISE EXCEPTION 'ERR_MANAGEMENT_ACCESS_REQUIRED: reset requires admin/manager/encargado role';
  END IF;

  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');
  IF NOT (v_validation->>'can_modify')::boolean THEN
    SELECT string_agg(blocker->>'message', '; ')
    INTO v_blockers
    FROM jsonb_array_elements(v_validation->'blockers') AS blocker
    WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');
    IF v_blockers IS NOT NULL AND v_blockers != '' THEN
      RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', v_blockers;
    END IF;
  END IF;

  -- Enable restore_mode locally so that triggers with bypass pattern allow DELETEs.
  -- This is the canonical pattern for maintenance RPCs (see restore_transaction_snapshot).
  -- The setting is LOCAL to this transaction and does NOT affect other sessions.
  PERFORM set_config('app.restore_mode', 'true', true);

  -- ── 1. Borrar TODAS las tablas operacionales ──

  -- FIX: payment_transactions FIRST (FK ON DELETE RESTRICT to transactions)
  DELETE FROM payment_transactions WHERE store_id = target_store_id;

  -- Hijas de transactions (now safe — payment_transactions already deleted)
  DELETE FROM transaction_items WHERE transaction_id IN (
    SELECT id FROM transactions WHERE store_id = target_store_id
  );
  DELETE FROM transactions WHERE store_id = target_store_id;

  -- Hijas de receipts
  DELETE FROM receipt_items WHERE receipt_id IN (
    SELECT id FROM receipts WHERE store_id = target_store_id
  );
  DELETE FROM receipts WHERE store_id = target_store_id;

  -- Devoluciones
  DELETE FROM devolution_items WHERE devolution_id IN (
    SELECT id FROM devolutions WHERE store_id = target_store_id
  );
  DELETE FROM devolutions WHERE store_id = target_store_id;

  -- Cotizaciones
  DELETE FROM quotation_items WHERE quotation_id IN (
    SELECT id FROM quotations WHERE store_id = target_store_id
  );
  DELETE FROM quotations WHERE store_id = target_store_id;

  -- Clientes
  DELETE FROM customers WHERE store_id = target_store_id;

  -- Bancos
  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
    SELECT id FROM bank_statements WHERE store_id = target_store_id
  );
  DELETE FROM bank_statements WHERE store_id = target_store_id;

  -- Kardex
  DELETE FROM kardex_entries WHERE store_id = target_store_id;

  -- Conteos físicos
  DELETE FROM physical_count_items WHERE count_id IN (
    SELECT id FROM physical_counts WHERE store_id = target_store_id
  );
  DELETE FROM physical_counts WHERE store_id = target_store_id;

  -- Stock movements
  DELETE FROM stock_movements WHERE store_id = target_store_id;

  -- Cash
  DELETE FROM cash_closures WHERE store_id = target_store_id;
  DELETE FROM cash_sessions WHERE store_id = target_store_id;
  DELETE FROM cash_movements WHERE store_id = target_store_id;
  DELETE FROM cash_register_sessions WHERE store_id = target_store_id;

  -- Inventory adjustments
  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
  );
  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;

  -- Transfers
  DELETE FROM transfer_items WHERE transfer_id IN (
    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
  );
  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
  DELETE FROM transfer_approval_rules WHERE store_id = target_store_id;

  -- Purchase orders
  DELETE FROM purchase_order_items WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE store_id = target_store_id
  );
  DELETE FROM purchase_orders WHERE store_id = target_store_id;

  -- Production orders
  DELETE FROM production_order_items WHERE order_id IN (
    SELECT id FROM production_orders WHERE store_id = target_store_id
  );
  DELETE FROM production_orders WHERE store_id = target_store_id;

  -- Workers + commissions
  DELETE FROM commission_payments WHERE store_id = target_store_id;
  DELETE FROM commission_rules WHERE store_id = target_store_id;
  DELETE FROM workers WHERE store_id = target_store_id;

  -- Sales transactions (legacy table if exists)
  DELETE FROM sales_transactions WHERE store_id = target_store_id;

  -- Ofertas
  DELETE FROM ofertas WHERE store_id = target_store_id;

  -- Exchange rates
  DELETE FROM store_exchange_rates WHERE store_id = target_store_id;

  -- V4-2 fix: NULLificar category_id antes de borrar categories
  UPDATE products SET category_id = NULL WHERE store_id = target_store_id;
  DELETE FROM suppliers WHERE store_id = target_store_id;
  DELETE FROM categories WHERE store_id = target_store_id;

  -- Warehouse
  DELETE FROM warehouse_stock WHERE store_id = target_store_id;
  DELETE FROM warehouses WHERE store_id = target_store_id;

  -- Inventory
  DELETE FROM inventory WHERE store_id = target_store_id;
  DELETE FROM inventory_batches WHERE store_id = target_store_id;
  DELETE FROM inventory_snapshots WHERE store_id = target_store_id;

  -- Analytics
  DELETE FROM abc_classifications WHERE store_id = target_store_id;
  DELETE FROM price_change_history WHERE store_id = target_store_id;
  DELETE FROM price_commit_log WHERE store_id = target_store_id;
  DELETE FROM tax_configurations WHERE store_id = target_store_id;

  -- Services
  DELETE FROM received_services WHERE store_id = target_store_id;
  DELETE FROM service_types WHERE store_id = target_store_id;

  -- Fiscal
  DELETE FROM fiscal_closings WHERE store_id = target_store_id;

  -- Catalog (conditional)
  IF p_keep_catalog THEN
    UPDATE products SET stock_current = 0, cost_average = 0, updated_at = NOW() WHERE store_id = target_store_id;
    DELETE FROM product_lots WHERE store_id = target_store_id;
  ELSE
    DELETE FROM product_lots WHERE store_id = target_store_id;
    DELETE FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE store_id = target_store_id);
    DELETE FROM product_cost_sheets WHERE store_id = target_store_id;
    DELETE FROM store_cost_templates WHERE store_id = target_store_id;
    DELETE FROM cost_sheet_templates WHERE store_id = target_store_id;
    DELETE FROM products WHERE store_id = target_store_id;
  END IF;

  -- Messaging
  DELETE FROM whatsapp_messages WHERE store_id = target_store_id;
  DELETE FROM whatsapp_invitations WHERE store_id = target_store_id;
  DELETE FROM whatsapp_contacts WHERE store_id = target_store_id;
  DELETE FROM whatsapp_risk_state WHERE store_id = target_store_id;
  DELETE FROM whatsapp_configs WHERE store_id = target_store_id;
  DELETE FROM telegram_messages WHERE store_id = target_store_id;
  DELETE FROM telegram_invitations WHERE store_id = target_store_id;
  DELETE FROM telegram_contacts WHERE store_id = target_store_id;
  DELETE FROM telegram_configs WHERE store_id = target_store_id;

  -- Notifications + snapshots
  DELETE FROM store_notifications WHERE store_id = target_store_id;
  DELETE FROM store_reset_snapshots WHERE store_id = target_store_id;

  -- Audit
  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES ('store_reset_completed', 'stores', target_store_id, target_store_id,
    jsonb_build_object('reset_by', v_caller_uid, 'reset_at', now(), 'keep_catalog', p_keep_catalog));
END;

$function$
;

-- restore_store_backup/4
CREATE OR REPLACE FUNCTION public.restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text DEFAULT 'preview'::text, p_confirmation_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session_id UUID;
  v_store_exists BOOLEAN;
  v_backup_format TEXT;
  v_backup_store_id TEXT;
  v_backup_version TEXT;
  v_tables_in_backup TEXT[];
  v_active_registry_tables TEXT[];
  v_table_count INTEGER;
  v_missing_tables TEXT[];
  v_extra_tables TEXT[];
  v_tier_violations JSONB;
  v_source_of_truth_violations JSONB;
  v_total_rows INTEGER := 0;
  v_table_stats JSONB := '{}'::jsonb;
  v_fk_integrity JSONB;
  v_preview_passed BOOLEAN;
  v_initiator UUID;
  rec RECORD;
  v_rows JSONB;
  v_row_count INTEGER;
  v_lock_token TEXT;
  v_pre_restore_snapshot JSONB;
  v_post_restore_validation JSONB;
  v_tables_processed INTEGER := 0;
  v_tables_failed INTEGER := 0;
  v_existing_session_id UUID;
  v_filter_strategy TEXT;
  v_parent_table TEXT;
  v_parent_fk TEXT;
  v_writable_cols TEXT[];
  v_cols_sql TEXT;
  v_insert_sql TEXT;
  v_rows_inserted BIGINT;
  v_inv_row JSONB;
  v_sync_count INTEGER;
  v_tier_ordered_tables TEXT[];
  v_cols_only TEXT;
  v_caller_role TEXT;
  v_token_session_id UUID;
BEGIN
  -- ============================================================
  -- SECURITY CHECK: Only admin can call this function
  -- ============================================================
  -- When called with user JWT (not service role), auth.uid() returns the user's ID
  -- We check their role in profiles
  v_initiator := auth.uid();
  IF v_initiator IS NOT NULL AND v_initiator != '00000000-0000-0000-0000-000000000000'::UUID THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_initiator;
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar restore_store_backup (rol actual: %)', COALESCE(v_caller_role, 'NULL');
    END IF;
  END IF;
  -- If auth.uid() is NULL, it's the service role — allow

  v_initiator := COALESCE(v_initiator, '00000000-0000-0000-0000-000000000000'::UUID);

  SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
  IF NOT v_store_exists THEN
    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
  END IF;

  v_backup_format := p_backup_payload->'meta'->>'format';
  IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT';
  END IF;

  v_backup_store_id := p_backup_payload->'meta'->>'storeId';
  IF v_backup_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID';
  END IF;

  v_backup_version := p_backup_payload->'meta'->>'version';

  INSERT INTO public.restore_sessions (
    store_id, initiated_by, status, mode, backup_payload
  ) VALUES (
    p_store_id, v_initiator, 'PREPARING', p_mode, p_backup_payload
  ) RETURNING id INTO v_session_id;

  SELECT array_agg(key) INTO v_tables_in_backup
  FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) k;

  v_table_count := COALESCE(array_length(v_tables_in_backup, 1), 0);

  SELECT array_agg(table_name ORDER BY tier, table_name) INTO v_active_registry_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE;

  SELECT array_agg(t) INTO v_missing_tables
  FROM unnest(v_tables_in_backup) AS t
  WHERE NOT (t = ANY(v_active_registry_tables));

  SELECT array_agg(t) INTO v_extra_tables
  FROM unnest(v_active_registry_tables) AS t
  WHERE NOT (t = ANY(v_tables_in_backup));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table_name', table_name, 'expected', expected_sot, 'actual', source_of_truth
  )), '[]'::jsonb) INTO v_source_of_truth_violations
  FROM (VALUES
    ('inventory', 'primary'), ('stock_movements', 'audit'),
    ('kardex_entries', 'audit'), ('products', 'primary')
  ) AS v(table_name, expected_sot)
  JOIN public.backup_table_registry r USING (table_name)
  WHERE r.source_of_truth != v.expected_sot;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'child_table', r.table_name, 'parent_table', r.parent_table,
    'issue', 'parent not found before child'
  )), '[]'::jsonb) INTO v_tier_violations
  FROM public.backup_table_registry r
  WHERE r.excluded_from_restore = FALSE AND r.parent_table IS NOT NULL
    AND r.table_name = ANY(v_tables_in_backup)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
      WHERE o.t = r.parent_table AND o.ord < (
        SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
        WHERE o2.t = r.table_name
      )
    );

  FOR rec IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
    v_rows := p_backup_payload->'tables'->rec.table_name;
    v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
                        THEN jsonb_array_length(v_rows) ELSE 0 END;
    v_total_rows := v_total_rows + v_row_count;
    v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name], to_jsonb(v_row_count));
  END LOOP;

  SELECT public.validate_pre_restore_fk_integrity(p_store_id) INTO v_fk_integrity;

  v_preview_passed := TRUE;
  IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
    PERFORM 1 FROM unnest(v_missing_tables) AS mt
    WHERE NOT EXISTS (SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = mt);
    IF FOUND THEN v_preview_passed := FALSE; END IF;
  END IF;
  IF v_tier_violations != '[]'::jsonb THEN v_preview_passed := FALSE; END IF;
  IF v_source_of_truth_violations != '[]'::jsonb THEN v_preview_passed := FALSE; END IF;

  UPDATE public.restore_sessions
  SET status = 'DRY_RUN',
      post_restore_validation = jsonb_build_object(
        'mode', p_mode, 'backup_store_id', v_backup_store_id,
        'backup_version', v_backup_version, 'target_store_id', p_store_id,
        'table_count_in_backup', v_table_count,
        'active_tables_in_registry', array_length(v_active_registry_tables, 1),
        'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
        'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
        'tier_violations', v_tier_violations,
        'source_of_truth_violations', v_source_of_truth_violations,
        'total_rows_in_backup', v_total_rows, 'table_stats', v_table_stats,
        'fk_integrity', v_fk_integrity
      ),
      fk_integrity_check = v_fk_integrity, preview_passed = v_preview_passed
  WHERE id = v_session_id;

  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'session_id', v_session_id, 'mode', 'preview',
      'target_store_id', p_store_id, 'backup_store_id', v_backup_store_id,
      'backup_version', v_backup_version,
      'table_count_in_backup', v_table_count,
      'active_tables_in_registry', array_length(v_active_registry_tables, 1),
      'missing_tables_in_registry', COALESCE(v_missing_tables, ARRAY[]::TEXT[]),
      'extra_tables_in_registry', COALESCE(v_extra_tables, ARRAY[]::TEXT[]),
      'tier_violations', v_tier_violations,
      'source_of_truth_violations', v_source_of_truth_violations,
      'total_rows_in_backup', v_total_rows, 'table_stats', v_table_stats,
      'fk_integrity', v_fk_integrity, 'preview_passed', v_preview_passed,
      'next_step', CASE WHEN v_preview_passed THEN 'Preview OK. Get token, then execute.'
                        ELSE 'Preview FAILED.' END
    );
  END IF;

  IF p_mode != 'execute' THEN RAISE EXCEPTION 'ERR_INVALID_MODE'; END IF;
  IF NOT v_preview_passed THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Preview failed', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_PREVIEW_FAILED';
  END IF;

  -- ============================================================
  -- TOKEN VALIDATION: Find the DRY_RUN session with this token
  -- ============================================================
  IF p_confirmation_token IS NULL OR p_confirmation_token = '' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Missing token', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_MISSING_TOKEN';
  END IF;

  SELECT id INTO v_token_session_id
  FROM public.restore_sessions
  WHERE store_id = p_store_id
    AND confirmation_token = p_confirmation_token
    AND status = 'DRY_RUN'
    AND preview_passed = TRUE
  ORDER BY initiated_at DESC
  LIMIT 1;

  IF v_token_session_id IS NULL THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Invalid token', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_INVALID_TOKEN';
  END IF;

  -- ============================================================
  -- INVALIDATE TOKEN: Mark the preview session as EXECUTING
  -- so it cannot be reused. The current session (v_session_id)
  -- will be the one that completes.
  -- ============================================================
  UPDATE public.restore_sessions
  SET status = 'EXECUTING',
      confirmation_token = NULL  -- clear token so it can't be reused
  WHERE id = v_token_session_id;

  IF (v_fk_integrity->>'can_proceed') != 'true' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='FK blockers', failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_FK_BLOCKERS';
  END IF;

  v_lock_token := 'restore_store_' || p_store_id::text;
  PERFORM pg_advisory_xact_lock(hashtext(v_lock_token));

  UPDATE public.restore_sessions SET lock_acquired=TRUE, lock_token=v_lock_token, status='EXECUTING' WHERE id=v_session_id;

  SELECT public.create_pre_restore_snapshot(p_store_id) INTO v_pre_restore_snapshot;
  UPDATE public.restore_sessions SET pre_restore_snapshot=v_pre_restore_snapshot WHERE id=v_session_id;

  SET LOCAL app.restore_mode = 'true';

  -- DELETE (tier DESC = children before parents)
  SELECT array_agg(table_name ORDER BY tier DESC, table_name DESC)
  INTO v_tier_ordered_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE
    AND table_name = ANY(v_active_registry_tables)
    AND table_name != 'stores';

  FOR rec IN SELECT unnest(v_tier_ordered_tables) AS table_name LOOP
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    SELECT filter_strategy, parent_table, parent_foreign_key
    INTO v_filter_strategy, v_parent_table, v_parent_fk
    FROM public.backup_table_registry
    WHERE table_name = rec.table_name;

    BEGIN
      IF v_filter_strategy = 'via_origin_dest' THEN
        EXECUTE format('DELETE FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'via_entity_id' THEN
        EXECUTE format('DELETE FROM public.%I WHERE entity_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'store_id' THEN
        EXECUTE format('DELETE FROM public.%I WHERE store_id = $1', rec.table_name) USING p_store_id;
      ELSIF v_filter_strategy = 'via_parent' AND v_parent_table IS NOT NULL AND v_parent_fk IS NOT NULL THEN
        BEGIN
          EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE store_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
        EXCEPTION WHEN undefined_column THEN
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
          EXCEPTION WHEN undefined_column THEN
            BEGIN
              EXECUTE format('DELETE FROM public.%I WHERE %I IN (SELECT id FROM public.%I WHERE entity_id = $1)', rec.table_name, v_parent_fk, v_parent_table) USING p_store_id;
            EXCEPTION WHEN OTHERS THEN
              RAISE NOTICE 'Could not delete from % - skipping', rec.table_name;
            END;
          END;
        END;
      END IF;
      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_delete_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_DELETE_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- INSERT (tier ASC = parents before children)
  SELECT array_agg(table_name ORDER BY tier ASC, table_name ASC)
  INTO v_tier_ordered_tables
  FROM public.backup_table_registry
  WHERE excluded_from_restore = FALSE
    AND table_name = ANY(v_active_registry_tables);

  FOR rec IN SELECT unnest(v_tier_ordered_tables) AS table_name LOOP
    CONTINUE WHEN rec.table_name IN ('profiles', 'user_store_memberships', 'tenants');

    v_rows := p_backup_payload->'tables'->rec.table_name;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) != 'array' OR jsonb_array_length(v_rows) = 0 THEN
      CONTINUE;
    END IF;

    BEGIN
      IF rec.table_name = 'stores' THEN
        IF jsonb_array_length(v_rows) > 0 THEN
          v_inv_row := v_rows->0;
          UPDATE public.stores SET
            name = v_inv_row->>'name', slug = v_inv_row->>'slug',
            address = v_inv_row->>'address', phone = v_inv_row->>'phone',
            email = v_inv_row->>'email', reeup = v_inv_row->>'reeup',
            nit = v_inv_row->>'nit', bank_account = v_inv_row->>'bank_account'
          WHERE id = p_store_id;
        END IF;
      ELSE
        SELECT public.get_table_writable_columns(rec.table_name) INTO v_writable_cols;
        IF v_writable_cols IS NULL OR array_length(v_writable_cols, 1) IS NULL THEN
          RAISE EXCEPTION 'No writable columns for %', rec.table_name;
        END IF;

        SELECT string_agg(
          column_name || ' ' ||
          CASE WHEN data_type = 'USER-DEFINED' THEN udt_name
               WHEN data_type = 'ARRAY' THEN udt_name
               ELSE data_type
          END,
          ', ' ORDER BY ordinal_position
        )
        INTO v_cols_sql
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = rec.table_name
          AND column_name = ANY(v_writable_cols);

        v_cols_only := array_to_string(v_writable_cols, ', ');

        v_insert_sql := format(
          'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_to_recordset($1) AS x(%s)',
          rec.table_name, v_cols_only, v_cols_only, v_cols_sql
        );

        EXECUTE v_insert_sql USING v_rows;
        GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
        v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_inserted'], to_jsonb(v_rows_inserted));
      END IF;
      v_tables_processed := v_tables_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_tables_failed := v_tables_failed + 1;
      v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name || '_insert_error'], to_jsonb(SQLERRM));
      RAISE EXCEPTION 'ERR_INSERT_FAILED: % - %', rec.table_name, SQLERRM;
    END;
  END LOOP;

  -- SYNC products.stock_current from inventory
  UPDATE public.products p SET stock_current = i.quantity, updated_at = NOW()
  FROM public.inventory i
  WHERE i.product_id = p.id AND i.store_id = p.store_id AND p.store_id = p_store_id;
  GET DIAGNOSTICS v_sync_count = ROW_COUNT;
  v_table_stats := jsonb_set(v_table_stats, ARRAY['products_stock_current_synced'], to_jsonb(v_sync_count));

  SET LOCAL app.restore_mode = 'false';

  SELECT public.validate_post_restore(p_store_id, p_backup_payload) INTO v_post_restore_validation;

  IF (v_post_restore_validation->>'overall_status') != 'PASS' THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason='Validation failed',
      post_restore_validation=v_post_restore_validation,
      tables_processed=v_tables_processed, tables_failed=v_tables_failed,
      total_rows_processed=v_total_rows, failed_at=NOW() WHERE id=v_session_id;
    RAISE EXCEPTION 'ERR_POST_RESTORE_VALIDATION_FAILED: %', v_post_restore_validation;
  END IF;

  -- ============================================================
  -- MARK BOTH SESSIONS AS COMPLETED
  -- The preview session (v_token_session_id) is marked COMPLETED too
  -- so its token is fully invalidated
  -- ============================================================
  UPDATE public.restore_sessions SET status='COMPLETED',
    post_restore_validation=v_post_restore_validation,
    tables_processed=v_tables_processed, tables_failed=v_tables_failed,
    total_rows_processed=v_total_rows, completed_at=NOW()
  WHERE id = v_session_id;

  UPDATE public.restore_sessions SET status='COMPLETED',
    completed_at=NOW(),
    failure_reason='Token consumed by session ' || v_session_id::text
  WHERE id = v_token_session_id;

  RETURN jsonb_build_object(
    'session_id', v_session_id, 'mode', 'execute',
    'target_store_id', p_store_id, 'backup_store_id', v_backup_store_id,
    'status', 'COMPLETED',
    'tables_processed', v_tables_processed, 'tables_failed', v_tables_failed,
    'total_rows_processed', v_total_rows,
    'products_stock_current_synced', v_sync_count,
    'validation', v_post_restore_validation
  );

EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.restore_sessions SET status='FAILED', failure_reason=SQLERRM,
      tables_processed=v_tables_processed, tables_failed=v_tables_failed,
      total_rows_processed=v_total_rows, failed_at=NOW() WHERE id=v_session_id;
    -- Also mark the token session as failed if it exists
    IF v_token_session_id IS NOT NULL THEN
      UPDATE public.restore_sessions SET status='FAILED',
        failure_reason='Token session failed: ' || SQLERRM,
        failed_at=NOW()
      WHERE id = v_token_session_id AND status = 'EXECUTING';
    END IF;
    RAISE;
END;
$function$
;

-- restore_transaction_snapshot/2
CREATE OR REPLACE FUNCTION public.restore_transaction_snapshot(p_migration_id text, p_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_xid xid;
  v_store_id uuid;
  v_snapshot_count int;
  v_snap_tx jsonb;
  v_snap_items jsonb;
  v_snap_pay jsonb;
  v_snap_sm_target jsonb;
  v_snap_product jsonb;
  v_tx_writable_cols text[];
  v_ti_writable_cols text[];
  v_pt_writable_cols text[];
  v_sm_writable_cols text[];
  v_tx_col_list text;
  v_ti_col_list text;
  v_pt_col_list text;
  v_sm_col_list text;
  v_actual_stock numeric;
  v_tgenabled_before text;
  v_tgenabled_after text;
  v_restored_count int := 0;
  v_updated_bal_count int := 0;
  v_updated_stock_count int := 0;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: restore_transaction_snapshot requires service_role'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT data INTO v_snap_tx FROM public.migration_history_snapshots
    WHERE migration_id = p_migration_id AND table_name = 'transactions' LIMIT 1;
  IF v_snap_tx IS NULL THEN RAISE EXCEPTION 'ERR_SNAPSHOT_MISSING: transactions'; END IF;
  IF (v_snap_tx->>'id')::uuid IS DISTINCT FROM p_tx_id THEN
    RAISE EXCEPTION 'ERR_SNAPSHOT_TX_ID_MISMATCH: snapshot % != p_tx_id %', v_snap_tx->>'id', p_tx_id;
  END IF;
  v_store_id := (v_snap_tx->>'store_id')::uuid;
  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));
  v_xid := pg_current_xact_id();
  BEGIN
    INSERT INTO public.transaction_recovery_ledger (migration_id, transaction_id, recovered_by, rpc_session_xid)
    VALUES (p_migration_id, p_tx_id, NULL, v_xid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ERR_RECOVERY_ALREADY_EXECUTED: ledger already has (migration_id=%, tx_id=%)',
      p_migration_id, p_tx_id USING ERRCODE = 'P0001';
  END;
  SELECT COUNT(*) INTO v_snapshot_count FROM public.migration_history_snapshots WHERE migration_id = p_migration_id;
  IF v_snapshot_count != 18 THEN RAISE EXCEPTION 'ERR_SNAPSHOT_COUNT: expected 18, found %', v_snapshot_count USING ERRCODE = 'P0001'; END IF;
  SELECT data INTO v_snap_items FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'transaction_items' LIMIT 1;
  SELECT data INTO v_snap_pay FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'payment_transactions' LIMIT 1;
  SELECT data INTO v_snap_sm_target FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'stock_movements' LIMIT 1;
  SELECT data INTO v_snap_product FROM public.migration_history_snapshots WHERE migration_id = p_migration_id AND table_name = 'products' LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: transactions row still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE id = (v_snap_sm_target->>'id')::uuid) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: target stock_movement still exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = (v_snap_product->>'id')::uuid) THEN
    RAISE EXCEPTION 'ERR_PRECONDITION: product not found';
  END IF;
  SELECT tgenabled INTO v_tgenabled_before FROM pg_trigger WHERE tgname = 'trg_validate_payment_invariants' AND tgrelid = 'public.payment_transactions'::regclass;
  SET LOCAL app.restore_mode = 'true';
  v_tx_writable_cols := public.get_table_writable_columns('transactions');
  v_ti_writable_cols := public.get_table_writable_columns('transaction_items');
  v_pt_writable_cols := public.get_table_writable_columns('payment_transactions');
  v_sm_writable_cols := public.get_table_writable_columns('stock_movements');
  IF 'amount_cup' = ANY(v_pt_writable_cols) THEN RAISE EXCEPTION 'ERR_GENERATED_NOT_EXCLUDED'; END IF;
  SELECT string_agg(format('%I', col), ', ') INTO v_tx_col_list FROM unnest(v_tx_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_ti_col_list FROM unnest(v_ti_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_pt_col_list FROM unnest(v_pt_writable_cols) AS col;
  SELECT string_agg(format('%I', col), ', ') INTO v_sm_col_list FROM unnest(v_sm_writable_cols) AS col;
  EXECUTE format('INSERT INTO public.transactions (%s) SELECT %s FROM jsonb_populate_record(NULL::public.transactions, $1)', v_tx_col_list, v_tx_col_list) USING v_snap_tx;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_TX: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.payment_transactions (%s) SELECT %s FROM jsonb_populate_record(NULL::public.payment_transactions, $1)', v_pt_col_list, v_pt_col_list) USING v_snap_pay;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_PAY: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.transaction_items (%s) SELECT %s FROM jsonb_populate_record(NULL::public.transaction_items, $1)', v_ti_col_list, v_ti_col_list) USING v_snap_items;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_ITEMS: %', v_restored_count; END IF;
  EXECUTE format('INSERT INTO public.stock_movements (%s) SELECT %s FROM jsonb_populate_record(NULL::public.stock_movements, $1)', v_sm_col_list, v_sm_col_list) USING v_snap_sm_target;
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;
  IF v_restored_count != 1 THEN RAISE EXCEPTION 'ERR_INSERT_SM_TARGET: %', v_restored_count; END IF;
  UPDATE public.stock_movements sm SET balance_after = (mhs.data->>'balance_after')::numeric FROM public.migration_history_snapshots mhs WHERE mhs.migration_id = p_migration_id AND mhs.table_name = 'stock_movements_subsequent' AND sm.id::text = mhs.row_id AND sm.balance_after = (mhs.data->>'balance_after')::numeric + 29;
  GET DIAGNOSTICS v_updated_bal_count = ROW_COUNT;
  IF v_updated_bal_count != 13 THEN RAISE EXCEPTION 'ERR_ANTI_DRIFT_MOVEMENTS: % drifted', 13 - v_updated_bal_count USING ERRCODE = 'P0001'; END IF;
  UPDATE public.products SET stock_current = (v_snap_product->>'stock_current')::numeric WHERE id = (v_snap_product->>'id')::uuid AND stock_current = (v_snap_product->>'stock_current')::numeric + 29;
  GET DIAGNOSTICS v_updated_stock_count = ROW_COUNT;
  IF v_updated_stock_count != 1 THEN RAISE EXCEPTION 'ERR_ANTI_DRIFT_STOCK: % rows', v_updated_stock_count USING ERRCODE = 'P0001'; END IF;
  SET LOCAL app.restore_mode = 'false';
  SELECT tgenabled INTO v_tgenabled_after FROM pg_trigger WHERE tgname = 'trg_validate_payment_invariants' AND tgrelid = 'public.payment_transactions'::regclass;
  IF v_tgenabled_after IS DISTINCT FROM v_tgenabled_before THEN RAISE EXCEPTION 'ERR_POSTCONDITION_TRIGGER'; END IF;
  IF current_setting('app.restore_mode', true) = 'true' THEN RAISE EXCEPTION 'ERR_POSTCONDITION_GUC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_tx_id) THEN RAISE EXCEPTION 'ERR_POSTCONDITION_TX'; END IF;
  SELECT stock_current INTO v_actual_stock FROM public.products WHERE id = (v_snap_product->>'id')::uuid;
  IF v_actual_stock IS DISTINCT FROM (v_snap_product->>'stock_current')::numeric THEN RAISE EXCEPTION 'ERR_POSTCONDITION_STOCK'; END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'HISTORICAL_DELETE_RECOVERY', 'transactions', p_tx_id, v_store_id, NULL,
    jsonb_build_object('migration_id_recovered', p_migration_id, 'recovery_timestamp', NOW(), 'recovery_method', 'restore_transaction_snapshot RPC v2.3.8+lock', 'ledger_xid', v_xid::text, 'advisory_lock', 'pg_advisory_xact_lock(hashtext(store_id))', 'rpc_version', 'v2.3.8+lock')
  );
  v_result := jsonb_build_object('status', 'success', 'migration_id', p_migration_id, 'transaction_id', p_tx_id, 'ledger_xid', v_xid::text, 'advisory_lock_acquired', true, 'store_id', v_store_id, 'rows_restored', jsonb_build_object('transactions', 1, 'transaction_items', 1, 'payment_transactions', 1, 'stock_movements_target', 1), 'rows_updated', jsonb_build_object('stock_movements_subsequent', v_updated_bal_count, 'products', v_updated_stock_count), 'rpc_version', 'v2.3.8+lock');
  RETURN v_result;
END;
$function$
;

-- save_ai_api_key/3
CREATE OR REPLACE FUNCTION public.save_ai_api_key(p_provider text, p_api_key text, p_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vault_key text;
  v_key_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT value INTO v_vault_key FROM public.system_config WHERE key = 'vault_key';
  INSERT INTO public.ai_api_keys (user_id, provider, api_key_encrypted, label, is_active, updated_at)
  VALUES (auth.uid(), p_provider, extensions.pgp_sym_encrypt(p_api_key, v_vault_key), p_label, true, now())
  ON CONFLICT (id) DO UPDATE SET api_key_encrypted = EXCLUDED.api_key_encrypted, updated_at = now()
  RETURNING id INTO v_key_id;
  RETURN v_key_id;
END;
$function$
;

-- soft_delete_store/2
CREATE OR REPLACE FUNCTION public.soft_delete_store(p_store_id uuid, p_deleted_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_caller_role TEXT;
BEGIN
  -- AUTH CHECK: Solo admin
  IF auth.uid() IS NOT NULL THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede soft-delete stores';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
  END IF;

  UPDATE stores SET is_active = false WHERE id = p_store_id;
  UPDATE user_store_memberships SET status = 'revoked' WHERE store_id = p_store_id AND status = 'active';
  UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
  VALUES (
    'store_soft_deleted', 'stores', p_store_id, p_store_id,
    jsonb_build_object('deleted_by', p_deleted_by, 'deleted_at', now())
  );

  SELECT jsonb_build_object(
    'store_id', p_store_id, 'is_active', false,
    'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
    'profiles_cleared', (SELECT count(*) FROM profiles WHERE active_store_id IS NULL AND id IN (
      SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
    ))
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

-- sync_inventory_from_products/1
CREATE OR REPLACE FUNCTION public.sync_inventory_from_products(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sync_product_id uuid, product_name text, action text, old_qty numeric, new_qty numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_max_version bigint;
BEGIN
  -- Para cada producto activo (de la tienda o todas si p_store_id es null)
  RETURN QUERY
  WITH target_products AS (
    SELECT id, name, store_id, stock_current
    FROM public.products
    WHERE is_active = true
      AND (p_store_id IS NULL OR store_id = p_store_id)
  ),
  existing_inv AS (
    SELECT product_id, store_id, quantity, version
    FROM public.inventory
  ),
  actions AS (
    SELECT
      tp.id as pid,
      tp.name as product_name,
      CASE
        -- No existe en inventory → INSERT
        WHEN ei.quantity IS NULL THEN 'INSERT'
        -- Existe pero cantidad diferente → UPDATE
        WHEN ABS(tp.stock_current - ei.quantity) > 0.001 THEN 'UPDATE'
        ELSE 'SKIP'
      END as action,
      ei.quantity as old_qty,
      tp.stock_current as new_qty,
      ei.version as old_version,
      tp.store_id
    FROM target_products tp
    LEFT JOIN existing_inv ei ON ei.product_id = tp.id AND ei.store_id = tp.store_id
    WHERE ei.quantity IS NULL OR ABS(tp.stock_current - ei.quantity) > 0.001
  )
  SELECT
    a.pid as sync_product_id,
    a.product_name,
    a.action,
    a.old_qty,
    a.new_qty
  FROM actions a;

  -- Ejecutar INSERTs (repetimos la CTE porque RETURN QUERY consume el contexto)
  INSERT INTO public.inventory (product_id, store_id, quantity, version, updated_at)
  SELECT
    tp.id,
    tp.store_id,
    tp.stock_current,
    1,
    now()
  FROM public.products tp
  WHERE tp.is_active = true
    AND (p_store_id IS NULL OR tp.store_id = p_store_id)
    AND tp.stock_current > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory inv
      WHERE inv.product_id = tp.id AND inv.store_id = tp.store_id
    )
  ON CONFLICT (product_id, store_id) DO NOTHING;

  -- Ejecutar UPDATEs (solo si quantity difiere)
  UPDATE public.inventory inv
  SET
    quantity = tp.stock_current,
    version = inv.version + 1,
    updated_at = now()
  FROM public.products tp
  WHERE inv.product_id = tp.id
    AND inv.store_id = tp.store_id
    AND tp.is_active = true
    AND (p_store_id IS NULL OR tp.store_id = p_store_id)
    AND ABS(inv.quantity - tp.stock_current) > 0.001;

END;
$function$
;

-- update_transaction_taxes/4
CREATE OR REPLACE FUNCTION public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                                                                                                                                                                                                                                                                                                                                                                                                                        DECLARE
                                                                                                                                                                                                                                                                                                                                                                                                                            v_old_tax_amount numeric;
                                                                                                                                                                                                                                                                                                                                                                                                                                v_store_id uuid;
                                                                                                                                                                                                                                                                                                                                                                                                                                BEGIN
                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Check permissions (only manager or admin)
                                                                                                                                                                                                                                                                                                                                                                                                                                        IF NOT (public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')) THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                RAISE EXCEPTION 'Unauthorized: Only managers can update taxes of confirmed sales';
                                                                                                                                                                                                                                                                                                                                                                                                                                                    END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                        SELECT tax_amount, store_id INTO v_old_tax_amount, v_store_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM public.transactions
                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE id = p_transaction_id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                    IF NOT FOUND THEN
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            RAISE EXCEPTION 'Transaction not found';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END IF;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Update transaction
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        UPDATE public.transactions
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            SET
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    applied_taxes = p_applied_taxes,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            tax_amount = p_tax_amount,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    total_amount = p_total_amount,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            updated_at = now()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE id = p_transaction_id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Audit Log
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            VALUES (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    auth.uid(),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'UPDATE_TRANSACTION_TAXES',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'transactions',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            p_transaction_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    jsonb_build_object('tax_amount', v_old_tax_amount),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            jsonb_build_object('tax_amount', p_tax_amount, 'total_amount', p_total_amount, 'applied_taxes', p_applied_taxes),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    v_store_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            RETURN true;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            $function$
;

-- void_closed_production_order/3
-- guarded drop: only fires when an incompatible (older) return type exists;
-- on the certified LIVE state this is a no-op (return type already matches).
DO $drop$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'void_closed_production_order'
      AND pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid, p_reason text, p_user_id uuid'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_function_result(p.oid) IS DISTINCT FROM 'jsonb'
  ) THEN
    DROP FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid);
  END IF;
END
$drop$;
CREATE OR REPLACE FUNCTION public.void_closed_production_order(p_order_id uuid, p_reason text DEFAULT 'Anulación'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_output_stock NUMERIC;
  v_output_wac NUMERIC;
  v_new_stock NUMERIC;
  v_new_wac NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'closed' THEN RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSED'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_VOID'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_void',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','void_closed_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Void orden cerrada: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='voided', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_VOIDED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$
;

-- void_reception_with_reversal/4
CREATE OR REPLACE FUNCTION public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_old_stock NUMERIC;
  v_new_stock NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
BEGIN
  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status NOT IN ('active') THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: %', v_receipt.status; END IF;

  FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_old_stock FROM products WHERE id = v_item.product_id AND store_id = v_receipt.store_id FOR UPDATE;
    v_new_stock := GREATEST(0, COALESCE(v_old_stock,0) - v_item.quantity);

    IF v_new_stock > 0 THEN
      PERFORM public.fn_recalc_wac(v_receipt.store_id, v_item.product_id, 'reception_void',
                     -v_item.quantity, v_unit_cost_cup,
                     jsonb_build_object('rpc','void_reception_with_reversal','receipt_id',p_receipt_id));
    END IF;

    UPDATE products SET stock_current = v_new_stock, updated_at = v_effective_date
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
    VALUES (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type, -v_item.quantity, v_unit_cost_cup, 'Void recepción: ' || COALESCE(p_reason,''), v_effective_date, p_user_id, v_effective_date);
  END LOOP;

  UPDATE receipts SET status='voided', reversed_at=v_effective_date, reversed_by=p_user_id, reversal_reason=p_reason WHERE id=p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (p_user_id, v_receipt.store_id, 'RECEIPT_VOIDED_WITH_REVERSAL', 'receipts', p_receipt_id,
          jsonb_build_object('reason', p_reason));
END $function$
;

-- withdraw_production_item_deprecated_9arg/9
CREATE OR REPLACE FUNCTION public.withdraw_production_item_deprecated_9arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text, p_server_side_cost boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
BEGIN
  -- C-01: Identity from auth.uid() only
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,'') || '|' || p_server_side_cost::text);
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  -- V-01: SELECT FOR UPDATE reads AND locks budgeted_qty + actual_qty
  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- V-01: Overconsumption check using locked values
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %',
      v_actual, p_qty, v_budgeted;
  END IF;

  -- C-03 + C-04: Server-side cost without fallback
  IF p_server_side_cost THEN
    SELECT cost_average INTO v_real_unit_cost
    FROM products WHERE id = v_product_id AND store_id = v_order_store_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
    END IF;
    IF v_real_unit_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
    END IF;
  ELSE
    v_real_unit_cost := p_unit_cost;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- No integer truncation (fix #3): use p_qty directly
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'server_side_cost', p_server_side_cost,
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$
;

-- withdraw_production_item_v3/7
CREATE OR REPLACE FUNCTION public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid, p_reference_doc text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID;
  v_real_unit_cost NUMERIC;
  v_budgeted NUMERIC; v_actual NUMERIC;
  v_zero_flagged boolean;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_store_id::text || '|' || COALESCE(p_reference_id::text,'') || '|' || COALESCE(p_reference_doc,''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id, budgeted_qty, actual_qty
  INTO v_order_id, v_product_id, v_variant_id, v_budgeted, v_actual
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  -- Overconsumption check con valores bloqueados
  IF v_actual + p_qty > v_budgeted THEN
    RAISE EXCEPTION 'ERR_OVERCONSUMPTION: actual_qty % + qty % > budgeted_qty %', v_actual, p_qty, v_budgeted;
  END IF;

  -- DF-05: costo SIEMPRE server-side — WAC_prev del material bajo FOR UPDATE, sin fallback a 0
  SELECT cost_average
  INTO v_real_unit_cost
  FROM products WHERE id = v_product_id AND store_id = v_order_store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id;
  END IF;
  IF v_real_unit_cost IS NULL THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id;
  END IF;
  IF v_real_unit_cost = 0 THEN
    SELECT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                   WHERE store_id = v_order_store_id AND product_id = v_product_id
                     AND scope = 'approve_zero_cost_material')
    INTO v_zero_flagged;
    IF NOT v_zero_flagged THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_product_id;
    END IF;
  END IF;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  -- D-11: qty numérica sin truncamiento
  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty,
    actual_unit_cost = v_real_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(
    p_product_id := v_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -p_qty,
    p_movement_type := 'production_out',
    p_reason := COALESCE(p_reference_doc, 'Salida para orden ' || v_order_id::text),
    p_sale_id := p_reference_id,
    p_unit_cost := v_real_unit_cost,
    p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id,
    p_skip_access_check := TRUE
  );

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'unit_cost_used', v_real_unit_cost);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw_v3', p_item_id, v_param_hash, v_existing_result);
  END IF;

  -- INV-15: audit_logs SIEMPRE (procedencia del costo server-side registrada)
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost_used', v_real_unit_cost, 'cost_authority', 'server_side_wac_v3',
      'reference_id', p_reference_id, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END $function$
;

