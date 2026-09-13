-- REM-INV-4 LIVE function definitions (pg_get_functiondef verbatim)
-- captured 2026-09-13T05:43:22.611Z
-- count: 484

-- ===== oid=25491 public.check_active_user() =====
CREATE OR REPLACE FUNCTION public.check_active_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- FIX: Use NEW.seller_id instead of NEW.user_id
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.seller_id AND p.is_active) THEN
    RAISE EXCEPTION 'Usuario inactivo no puede crear transacción';
  END IF;
  RETURN NEW;
END; 
$function$


-- ===== oid=25493 public.check_cash_session_open() =====
CREATE OR REPLACE FUNCTION public.check_cash_session_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.status='closed' AND OLD.status='closed' THEN
    RAISE EXCEPTION 'La sesión ya estaba cerrada';
  END IF;
  RETURN NEW;
END; $function$


-- ===== oid=25497 public.alert_low_stock() =====
CREATE OR REPLACE FUNCTION public.alert_low_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity <= COALESCE(NEW.low_stock_threshold, 10) THEN
    INSERT INTO public.business_events(event_type, entity_id, payload, created_at)
    VALUES (
      'low_stock_alert',
      NEW.product_id,
      jsonb_build_object(
        'store_id', NEW.store_id,
        'quantity', NEW.quantity,
        'threshold', NEW.low_stock_threshold
      ),
      timezone('utc', now())
    );
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=25555 public.apply_fifo_on_sale() =====
CREATE OR REPLACE FUNCTION public.apply_fifo_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  remaining_qty numeric := NEW.quantity;
  batch_record RECORD;
BEGIN
  FOR batch_record IN
    SELECT * FROM public.inventory_batches
    WHERE store_id = (SELECT store_id FROM public.transactions WHERE id = NEW.transaction_id)
      AND product_id = NEW.product_id
      AND quantity > 0
    ORDER BY received_at ASC
  LOOP
    IF remaining_qty <= 0 THEN
      EXIT;
    END IF;

    IF batch_record.quantity >= remaining_qty THEN
      UPDATE public.inventory_batches
      SET quantity = quantity - remaining_qty
      WHERE id = batch_record.id;
      NEW.cost_at_sale := remaining_qty * batch_record.unit_cost / remaining_qty;
      remaining_qty := 0;
    ELSE
      UPDATE public.inventory_batches
      SET quantity = 0
      WHERE id = batch_record.id;
      IF NEW.cost_at_sale IS NULL THEN
        NEW.cost_at_sale := batch_record.quantity * batch_record.unit_cost / batch_record.quantity;
      ELSE
        NEW.cost_at_sale := NEW.cost_at_sale + batch_record.quantity * batch_record.unit_cost / batch_record.quantity;
      END IF;
      remaining_qty := remaining_qty - batch_record.quantity;
    END IF;
  END LOOP;

  IF remaining_qty > 0 THEN
    RAISE EXCEPTION 'No hay suficiente inventario para product_id=%', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$function$


-- ===== oid=28123 public.can_void_receipt(p_receipt_id uuid) =====
CREATE OR REPLACE FUNCTION public.can_void_receipt(p_receipt_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 FROM stock_movements sm_receipt JOIN stock_movements sm_sale ON sm_receipt.product_id = sm_sale.product_id
        WHERE sm_receipt.id = p_receipt_id AND sm_receipt.movement_type = 'in' AND sm_sale.movement_type = 'sale' AND sm_sale.created_at > sm_receipt.created_at
    );
END;
$function$


-- ===== oid=34760 public.cancel_reception(p_reception_id uuid) =====
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


-- ===== oid=38096 public.audit_profile_changes() =====
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


-- ===== oid=38098 public.audit_store_access_changes() =====
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


-- ===== oid=38671 public.auto_assign_store_to_creator() =====
CREATE OR REPLACE FUNCTION public.auto_assign_store_to_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        -- Insert into memberships
        INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
        VALUES (NEW.created_by, NEW.id, 'admin', 'active')
        ON CONFLICT (user_id, store_id) DO NOTHING;

        -- Also keep user_store_access updated for legacy compatibility if it exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_store_access') THEN
            INSERT INTO public.user_store_access (user_id, store_id, assigned_by)
            VALUES (NEW.created_by, NEW.id, NEW.created_by)
            ON CONFLICT (user_id, store_id) DO NOTHING;
        END IF;

        -- If the creator has no active store, set this as active
        UPDATE public.profiles
        SET active_store_id = NEW.id
        WHERE id = NEW.created_by AND active_store_id IS NULL;
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=52507 public.audit_product_changes() =====
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


-- ===== oid=52509 public.audit_store_changes() =====
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


-- ===== oid=70045 public.audit_role_changes() =====
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


-- ===== oid=70047 public.can_create_user_with_role(p_creator_id uuid, p_role_name text) =====
CREATE OR REPLACE FUNCTION public.can_create_user_with_role(p_creator_id uuid, p_role_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_creator_role TEXT;
BEGIN
    -- Get creator's role
    SELECT r.name INTO v_creator_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = p_creator_id;

    -- Service role or Admin can create anything
    IF p_creator_id = '00000000-0000-0000-0000-000000000000'::UUID OR v_creator_role = 'Admin' THEN
        RETURN TRUE;
    END IF;

    IF v_creator_role = 'Encargado' THEN
        RETURN p_role_name IN ('Cajero', 'Almacenero', 'clerk', 'warehouse');
    END IF;

    RETURN FALSE;
END;
$function$


-- ===== oid=79082 public.can_safely_delete_user(p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.can_safely_delete_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_has_records BOOLEAN;
BEGIN
    -- Check Sales (as cashier)
    SELECT EXISTS (SELECT 1 FROM public.sales WHERE cashier_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Receipts/Receptions
    SELECT EXISTS (SELECT 1 FROM public.receipts WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Transfers
    SELECT EXISTS (SELECT 1 FROM public.transfers WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Adjustments
    SELECT EXISTS (SELECT 1 FROM public.inventory_adjustments WHERE created_by = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Cash Closures
    SELECT EXISTS (SELECT 1 FROM public.cash_closures WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    -- Check Inventory Movements
    SELECT EXISTS (SELECT 1 FROM public.inventory_movements WHERE user_id = p_user_id) INTO v_has_records;
    IF v_has_records THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$function$


-- ===== oid=130873 public.cancel_transfer(p_transfer_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND';
  END IF;
  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden cancelar transferencias PENDIENTE (estado actual: %)', v_transfer.status;
  END IF;

  -- V2.5 H3: autorización — caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.transfers
    SET status = 'CANCELADA', updated_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'new_status', 'CANCELADA'
  );
END;
$function$


-- ===== oid=132722 public.calculate_service_distribution(p_service_id uuid) =====
CREATE OR REPLACE FUNCTION public.calculate_service_distribution(p_service_id uuid)
 RETURNS TABLE(receipt_item_id uuid, product_id uuid, distribution_amount numeric, distribution_percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_service received_services%ROWTYPE;
  v_method TEXT;
  v_total_amount NUMERIC;
  v_total_value NUMERIC DEFAULT 0;
  v_total_qty NUMERIC DEFAULT 0;
  v_link service_reception_links%ROWTYPE;
  v_receipt_id UUID;
  v_item receipt_items%ROWTYPE;
  v_allocated NUMERIC;
BEGIN
  SELECT * INTO v_service FROM received_services WHERE id = p_service_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  v_method := v_service.distribution_method;
  v_total_amount := v_service.total_amount;

  -- Para cada recepción vinculada
  FOR v_link IN SELECT * FROM service_reception_links WHERE service_id = p_service_id AND allocated_amount > 0 LOOP
    v_receipt_id := v_link.receipt_id;
    v_allocated := v_link.allocated_amount;

    -- Calcular base de distribución según método
    IF v_method = 'amount' THEN
      SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total_value
      FROM receipt_items WHERE receipt_id = v_receipt_id;
      
      IF v_total_value > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_receipt_id LOOP
          distribution_amount := v_allocated * (v_item.quantity * v_item.unit_cost / v_total_value);
          distribution_percentage := (v_item.quantity * v_item.unit_cost / v_total_value) * 100;
          receipt_item_id := v_item.id;
          product_id := v_item.product_id;
          RETURN NEXT;
        END LOOP;
      END IF;

    ELSIF v_method = 'quantity' THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
      FROM receipt_items WHERE receipt_id = v_receipt_id;
      
      IF v_total_qty > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_receipt_id LOOP
          distribution_amount := v_allocated * (v_item.quantity / v_total_qty);
          distribution_percentage := (v_item.quantity / v_total_qty) * 100;
          receipt_item_id := v_item.id;
          product_id := v_item.product_id;
          RETURN NEXT;
        END LOOP;
      END IF;

    ELSIF v_method = 'manual' THEN
      -- En manual, la distribución se guarda directamente desde el cliente
      RETURN;
    END IF;
  END LOOP;
END;
$function$


-- ===== oid=134247 public.calculate_commission_amount_cup() =====
CREATE OR REPLACE FUNCTION public.calculate_commission_amount_cup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.currency = 'CUP' OR NEW.currency IS NULL THEN
      NEW.amount_cup := NEW.final_amount;
    ELSE
      NEW.amount_cup := NEW.final_amount * COALESCE(NEW.exchange_rate, 1.0);
    END IF;
  ELSE
    NEW.amount_cup := 0;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=134479 public.cash_dist(money, money) =====
CREATE OR REPLACE FUNCTION public.cash_dist(money, money)
 RETURNS money
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$cash_dist$function$


-- ===== oid=136257 public.auto_kardex_on_stock_movement() =====
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
    WHEN NEW.movement_type = 'devolution_reverse' THEN 'devolution_out'
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


-- ===== oid=136484 public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.calculate_abc(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
    v_total_revenue NUMERIC := 0;
    v_count INTEGER := 0;
    v_product_id UUID;
    v_qty NUMERIC;
    v_revenue NUMERIC;
    v_cumulative NUMERIC := 0;
    v_pct NUMERIC;
    v_class TEXT;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    DELETE FROM public.abc_classifications
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    -- Get total revenue
    SELECT COALESCE(SUM(ti.price_at_sale_cup * ti.quantity), 0) INTO v_total_revenue
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month;

    -- Loop through products sorted by revenue desc
    FOR v_product_id, v_qty, v_revenue IN
        SELECT ti.product_id, SUM(ti.quantity), SUM(ti.price_at_sale_cup * ti.quantity)
        FROM public.transaction_items ti
        JOIN public.transactions t ON t.id = ti.transaction_id
        WHERE t.store_id = p_store_id AND t.status = 'completed'
          AND EXTRACT(YEAR FROM t.created_at) = p_year
          AND EXTRACT(MONTH FROM t.created_at) = p_month
        GROUP BY ti.product_id
        ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC
    LOOP
        v_cumulative := v_cumulative + v_revenue;
        v_pct := CASE WHEN v_total_revenue > 0 THEN v_cumulative / v_total_revenue * 100 ELSE 0 END;
        v_class := CASE WHEN v_pct <= 80 THEN 'A' WHEN v_pct <= 95 THEN 'B' ELSE 'C' END;

        INSERT INTO public.abc_classifications (store_id, product_id, classification, period_year, period_month, total_quantity_sold, total_revenue, annual_consumption_value, cumulative_percentage, calculated_at)
        VALUES (p_store_id, v_product_id, v_class, p_year, p_month, v_qty, v_revenue, v_revenue, v_pct, now());
    END LOOP;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('status', 'success', 'products_classified', v_count, 'total_revenue', v_total_revenue);
END;
$function$


-- ===== oid=136514 public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.auto_match_bank_items(p_statement_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_store_id uuid;
  v_item RECORD;
  v_matched_count integer := 0;
  v_unmatched_count integer := 0;
BEGIN
  -- Get store_id from statement
  SELECT store_id INTO v_store_id FROM public.bank_statements WHERE id = p_statement_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STATEMENT_NOT_FOUND';
  END IF;

  IF NOT public.has_store_access_as(v_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Match items: for each unmatched bank_item, find a transaction with same amount (±1) and date (±3 days)
  FOR v_item IN
    SELECT id, amount, type, transaction_date
    FROM public.bank_statement_items
    WHERE bank_statement_id = p_statement_id AND is_matched = false
  LOOP
    IF v_item.type = 'credit' THEN
      -- Match with cash/transfer sales
      UPDATE public.bank_statement_items bsi
      SET matched_transaction_id = t.id, is_matched = true, is_reconciled = true
      FROM public.transactions t
      WHERE bsi.id = v_item.id
        AND t.store_id = v_store_id
        AND t.status = 'completed'
        AND ABS(t.total_amount - v_item.amount) < 1
        AND ABS(t.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transaction_id = t.id AND other.id != bsi.id
        );
    ELSE
      -- Match with receipts (purchases)
      UPDATE public.bank_statement_items bsi
      SET matched_transfer_id = r.id, is_matched = true, is_reconciled = true
      FROM public.receipts r
      WHERE bsi.id = v_item.id
        AND r.store_id = v_store_id
        AND r.status = 'active'
        AND ABS(r.total_cost - v_item.amount) < 1
        AND ABS(r.created_at::date - v_item.transaction_date) <= 3
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_statement_items other
          WHERE other.matched_transfer_id = r.id AND other.id != bsi.id
        );
    END IF;

    IF FOUND THEN
      v_matched_count := v_matched_count + 1;
    ELSE
      v_unmatched_count := v_unmatched_count + 1;
    END IF;
  END LOOP;

  -- Update statement status
  IF v_unmatched_count = 0 THEN
    UPDATE public.bank_statements SET status = 'reconciled', reconciled_by = v_uid, reconciled_at = now(), updated_at = now()
    WHERE id = p_statement_id;
  ELSE
    UPDATE public.bank_statements SET status = 'discrepancy', updated_at = now()
    WHERE id = p_statement_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'matched', v_matched_count,
    'unmatched', v_unmatched_count,
    'statement_status', CASE WHEN v_unmatched_count = 0 THEN 'reconciled' ELSE 'discrepancy' END
  );
END;
$function$


-- ===== oid=136803 public.apply_physical_count(p_count_id uuid, p_user_id uuid, p_apply_zero_diffs boolean) =====
CREATE OR REPLACE FUNCTION public.apply_physical_count(p_count_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_apply_zero_diffs boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_applied INTEGER := 0;
  v_discrepancies INTEGER := 0;
  v_total_value NUMERIC := 0;
BEGIN
  SELECT * INTO v_count FROM public.physical_counts WHERE id = p_count_id FOR UPDATE;
  IF v_count IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;
  IF v_count.status != 'counted' AND v_count.status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATE: solo se pueden aplicar conteos en estado counted o in_progress';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_count.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item con diferencia
  FOR v_item IN
    SELECT * FROM public.physical_count_items
    WHERE count_id = p_count_id
      AND counted_quantity IS NOT NULL
      AND (p_apply_zero_diffs OR difference != 0)
  LOOP
    -- Actualizar stock del producto
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_count.store_id;

    -- Registrar movimiento de stock
    -- V2.9: skip_access_check=TRUE porque ya validamos con has_store_access_as arriba
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_count.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.difference,
      p_movement_type := 'adjustment',
      p_unit_cost := v_item.unit_cost,
      p_reason := 'Conteo físico ' || v_count.count_number,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_applied := v_applied + 1;
    IF v_item.difference != 0 THEN
      v_discrepancies := v_discrepancies + 1;
      v_total_value := v_total_value + v_item.value_discrepancy;
    END IF;
  END LOOP;

  -- Marcar como aplicado
  UPDATE public.physical_counts
    SET status = 'applied',
        applied_at = NOW(),
        applied_by = v_caller_uid,
        total_discrepancies = v_discrepancies,
        total_value_discrepancy = v_total_value
    WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'count_id', p_count_id,
    'items_applied', v_applied,
    'discrepancies', v_discrepancies,
    'total_value_discrepancy', v_total_value
  );
END;
$function$


-- ===== oid=136851 public.approve_transfer(p_transfer_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.approve_transfer(p_transfer_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_rule RECORD;
  v_tenant_id UUID;
  v_has_approver_role BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;

  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden aprobar transferencias PENDIENTE';
  END IF;

  IF NOT v_transfer.requires_approval THEN
    RAISE EXCEPTION 'ERR_NO_APPROVAL_REQUIRED';
  END IF;

  IF v_transfer.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'ERR_ALREADY_APPROVED';
  END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el caller tiene rol de aprobador
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
    SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = v_transfer.origin_store_id;

    SELECT * INTO v_rule FROM public.transfer_approval_rules
    WHERE is_active = true
      AND (
        (store_id = v_transfer.origin_store_id) OR
        (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
      )
      ORDER BY store_id NULLS LAST
      LIMIT 1;

    IF v_rule.id IS NOT NULL THEN
      v_has_approver_role := v_user_role = ANY(v_rule.approver_roles) OR v_user_role = 'admin';
      IF NOT v_has_approver_role THEN
        RAISE EXCEPTION 'ERR_NOT_APPROVER: tu rol (%) no está autorizado para aprobar (requerido: %)', v_user_role, v_rule.approver_roles;
      END IF;
    END IF;
  END IF;

  -- Marcar como aprobada
  UPDATE public.transfers
    SET approved_by = v_caller_uid,
        approved_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'approved_by', v_caller_uid,
    'approved_at', NOW()
  );
END;
$function$


-- ===== oid=137060 public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid, p_payment_method text, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_items_price_adjustments jsonb, p_discount_type text, p_discount_value numeric, p_reason text) =====
CREATE OR REPLACE FUNCTION public.adjust_sale_payment(p_transaction_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_cash_amount numeric DEFAULT NULL::numeric, p_transfer_amount numeric DEFAULT NULL::numeric, p_zelle_amount numeric DEFAULT NULL::numeric, p_sale_currency text DEFAULT NULL::text, p_sale_exchange_rate numeric DEFAULT NULL::numeric, p_items_price_adjustments jsonb DEFAULT NULL::jsonb, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_old_data JSONB;
  v_new_data JSONB;
  v_old_items JSONB;
  v_new_items JSONB;
  v_items_changed BOOLEAN := FALSE;
  v_payment_changed BOOLEAN := FALSE;
  v_new_subtotal NUMERIC := 0;
  v_new_total NUMERIC := 0;
  v_price_adj JSONB;
  v_adj_product_id UUID;
  v_adj_price NUMERIC;
  v_adj_price_cup NUMERIC;
  v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- V2.12.9 anti-spoofing
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar transacción
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  -- Verificar acceso a la store
  IF NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- No permitir ajustar ventas ya anuladas o reversadas
  IF v_tx.status IN ('voided', 'reversed', 'cancelled') THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_ADJUSTABLE: status=%', v_tx.status;
  END IF;

  -- Snapshot BEFORE (transacción + items)
  SELECT jsonb_build_object(
    'total_amount', v_tx.total_amount,
    'subtotal', v_tx.subtotal,
    'payment_method', v_tx.payment_method,
    'cash_amount', v_tx.cash_amount,
    'transfer_amount', v_tx.transfer_amount,
    'zelle_amount', v_tx.zelle_amount,
    'sale_currency', v_tx.sale_currency,
    'sale_exchange_rate', v_tx.sale_exchange_rate,
    'discount_type', v_tx.discount_type,
    'discount_value', v_tx.discount_value
  ) INTO v_old_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_old_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_old_data := v_old_data || jsonb_build_object('items', v_old_items);

  -- 1. Ajustar payment_method si se proporciona
  IF p_payment_method IS NOT NULL AND p_payment_method <> v_tx.payment_method::text THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'payment_method');
  END IF;

  -- 2. Ajustar montos de pago
  IF p_cash_amount IS NOT NULL AND p_cash_amount <> COALESCE(v_tx.cash_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'cash_amount');
  END IF;
  IF p_transfer_amount IS NOT NULL AND p_transfer_amount <> COALESCE(v_tx.transfer_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'transfer_amount');
  END IF;
  IF p_zelle_amount IS NOT NULL AND p_zelle_amount <> COALESCE(v_tx.zelle_amount, 0) THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'zelle_amount');
  END IF;
  IF p_sale_currency IS NOT NULL AND p_sale_currency <> v_tx.sale_currency THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_currency');
  END IF;
  IF p_sale_exchange_rate IS NOT NULL AND p_sale_exchange_rate <> v_tx.sale_exchange_rate THEN
    v_payment_changed := TRUE;
    v_changes := array_append(v_changes, 'sale_exchange_rate');
  END IF;
  IF p_discount_type IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_type');
  END IF;
  IF p_discount_value IS NOT NULL THEN
    v_changes := array_append(v_changes, 'discount_value');
  END IF;

  -- 3. Ajustar precios de items (price_at_sale)
  IF p_items_price_adjustments IS NOT NULL THEN
    FOR v_price_adj IN SELECT * FROM jsonb_array_elements(p_items_price_adjustments)
    LOOP
      v_adj_product_id := (v_price_adj->>'product_id')::UUID;
      v_adj_price := (v_price_adj->>'price_at_sale')::NUMERIC;

      -- Validar: NO permitir cambiar quantity o cost_at_sale
      IF (v_price_adj ? 'quantity') OR (v_price_adj ? 'cost_at_sale') THEN
        RAISE EXCEPTION 'ERR_IMMUTABLE_FIELD: quantity y cost_at_sale no son ajustables (NIC 2)';
      END IF;

      -- Cargar item actual para validar que existe y obtener currency
      SELECT * INTO v_item FROM public.transaction_items
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: product_id=% no está en la transacción', v_adj_product_id;
      END IF;

      IF v_adj_price < 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_PRICE: price_at_sale no puede ser negativo';
      END IF;

      -- Recalcular price_at_sale_cup basado en sale_currency/exchange_rate
      v_adj_price_cup := CASE
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = v_item.price_currency THEN v_adj_price
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'CUP' AND v_item.price_currency = 'USD' THEN v_adj_price * COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        WHEN COALESCE(p_sale_currency, v_tx.sale_currency) = 'USD' AND v_item.price_currency = 'CUP' THEN v_adj_price / COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate)
        ELSE v_adj_price
      END;

      UPDATE public.transaction_items
        SET price_at_sale = v_adj_price,
            price_at_sale_cup = v_adj_price_cup
        WHERE transaction_id = p_transaction_id AND product_id = v_adj_product_id;

      v_items_changed := TRUE;
      v_changes := array_append(v_changes, 'item_price:' || v_adj_product_id);
    END LOOP;
  END IF;

  -- 4. Recalcular subtotal y total_amount desde items (si se ajustaron precios)
  IF v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    SELECT COALESCE(SUM(price_at_sale_cup * quantity), 0) INTO v_new_subtotal
      FROM public.transaction_items WHERE transaction_id = p_transaction_id;

    -- Aplicar descuento
    DECLARE
      v_disc_type TEXT := COALESCE(p_discount_type, v_tx.discount_type::text, 'fixed');
      v_disc_val NUMERIC := COALESCE(p_discount_value, v_tx.discount_value, 0);
    BEGIN
      IF v_disc_type = 'percentage' THEN
        v_new_total := v_new_subtotal * (1 - (v_disc_val / 100.0));
      ELSE
        v_new_total := v_new_subtotal - v_disc_val;
      END IF;
      v_new_total := GREATEST(v_new_total, 0);
    END;
  ELSE
    v_new_subtotal := v_tx.subtotal;
    v_new_total := v_tx.total_amount;
  END IF;

  -- 5. Aplicar cambios de payment (si hay)
  IF v_payment_changed OR v_items_changed OR p_discount_type IS NOT NULL OR p_discount_value IS NOT NULL THEN
    UPDATE public.transactions
      SET
        payment_method = COALESCE(p_payment_method::public.payment_method_enum, payment_method),
        cash_amount = COALESCE(p_cash_amount, cash_amount),
        transfer_amount = COALESCE(p_transfer_amount, transfer_amount),
        zelle_amount = COALESCE(p_zelle_amount, zelle_amount),
        sale_currency = COALESCE(p_sale_currency, sale_currency),
        sale_exchange_rate = COALESCE(p_sale_exchange_rate, sale_exchange_rate),
        discount_type = COALESCE(p_discount_type::public.discount_type_enum, discount_type),
        discount_value = COALESCE(p_discount_value, discount_value),
        subtotal = v_new_subtotal,
        total_amount = v_new_total,
        updated_at = NOW()
      WHERE id = p_transaction_id;
  END IF;

  -- 6. Snapshot AFTER
  SELECT jsonb_build_object(
    'total_amount', v_new_total,
    'subtotal', v_new_subtotal,
    'payment_method', COALESCE(p_payment_method, v_tx.payment_method::text),
    'cash_amount', COALESCE(p_cash_amount, v_tx.cash_amount),
    'transfer_amount', COALESCE(p_transfer_amount, v_tx.transfer_amount),
    'zelle_amount', COALESCE(p_zelle_amount, v_tx.zelle_amount),
    'sale_currency', COALESCE(p_sale_currency, v_tx.sale_currency),
    'sale_exchange_rate', COALESCE(p_sale_exchange_rate, v_tx.sale_exchange_rate),
    'discount_type', COALESCE(p_discount_type, v_tx.discount_type::text),
    'discount_value', COALESCE(p_discount_value, v_tx.discount_value)
  ) INTO v_new_data;

  SELECT jsonb_agg(jsonb_build_object(
    'product_id', ti.product_id,
    'quantity', ti.quantity,
    'price_at_sale', ti.price_at_sale,
    'price_currency', ti.price_currency,
    'price_at_sale_cup', ti.price_at_sale_cup,
    'cost_at_sale', ti.cost_at_sale
  )) INTO v_new_items
  FROM public.transaction_items ti WHERE ti.transaction_id = p_transaction_id;

  v_new_data := v_new_data || jsonb_build_object('items', v_new_items);

  -- 7. Audit log (V2.12.17 — trazabilidad NIIF 15 + IAS 8)
  INSERT INTO public.audit_logs (
    action, table_name, record_id, store_id, user_id,
    old_data, new_data, metadata
  )
  VALUES (
    CASE WHEN v_items_changed THEN 'SALE_PRICE_ADJUST' ELSE 'SALE_PAYMENT_ADJUST' END,
    'transactions',
    p_transaction_id,
    v_tx.store_id,
    v_caller_uid,
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'changes', to_jsonb(v_changes),
      'reason', p_reason,
      'items_changed', v_items_changed,
      'payment_changed', v_payment_changed,
      'adjustment_timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'old_total', v_tx.total_amount,
    'new_total', v_new_total,
    'changes', to_jsonb(v_changes),
    'audit_logged', TRUE
  );
END;
$function$


-- ===== oid=137483 public.cancel_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.cancel_transfer(p_transfer_id uuid, p_reason text DEFAULT 'Cancelada'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;

  -- Autorización: caller debe tener acceso al origen
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Actualizar estado
  UPDATE public.transfers
    SET status = 'CANCELADA', notes = COALESCE(notes, '') || ' [CANCELADA: ' || p_reason || ']'
    WHERE id = p_transfer_id;

  -- Liberar reservas ACTIVE
  UPDATE public.inventory_reservations
    SET status = 'RELEASED', released_at = NOW()
    WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id AND status = 'ACTIVE';

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_cancelled', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'reservations_released',
      (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'RELEASED')));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
END;
$function$


-- ===== oid=137780 public.audit_backup_restore_protected_change() =====
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


-- ===== oid=137814 public.bulk_soft_delete_stores(p_store_ids uuid[], p_deleted_by uuid, p_confirmation_token text, p_override_token text, p_reason text) =====
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


-- ===== oid=137816 public.check_bulk_ops_hourly_limit(p_user_id uuid, p_plan text) =====
CREATE OR REPLACE FUNCTION public.check_bulk_ops_hourly_limit(p_user_id uuid, p_plan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_limit := CASE p_plan
    WHEN 'free' THEN 1
    WHEN 'pro' THEN 20
    WHEN 'enterprise' THEN 999999
    ELSE 1
  END;

  SELECT COUNT(*) INTO v_used
  FROM public.bulk_ops_log
  WHERE user_id = p_user_id
    AND initiated_at > NOW() - INTERVAL '1 hour';

  RETURN jsonb_build_object(
    'allowed', v_used < v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_used)
  );
END;
$function$


-- ===== oid=138112 public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb) =====
CREATE OR REPLACE FUNCTION public.bulk_assign_memberships(p_user_id uuid, p_assignments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_assignment jsonb;
  v_affected int := 0;
  v_failed int := 0;
  v_store_id uuid;
  v_role public.user_role;
  v_status text;
  v_caller_uid uuid := auth.uid();
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    BEGIN
      v_store_id := (v_assignment->>'store_id')::uuid;
      v_role := (v_assignment->>'role')::public.user_role;
      v_status := COALESCE(v_assignment->>'status', 'active');

      -- Validar caller tiene acceso al store
      IF NOT public.is_admin() AND NOT public.has_store_role(v_store_id, ARRAY['admin', 'manager']) THEN
        v_failed := v_failed + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
      VALUES (p_user_id, v_store_id, v_role, v_status)
      ON CONFLICT (user_id, store_id) DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = now();

      v_changes := v_changes || jsonb_build_object(jsonb_build_object(
        'store_id', v_store_id,
        'role', v_role::text,
        'status', v_status
      ));

      v_affected := v_affected + 1;
    EXCEPTION
      WHEN foreign_key_violation THEN
        v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Audit log atómico (solo si hubo cambios)
  IF v_affected > 0 THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'MEMBERSHIPS_BULK_ASSIGNED',
      jsonb_build_object('assignments', v_changes),
      jsonb_build_object('affected', v_affected, 'failed', v_failed)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected', v_affected,
    'failed', v_failed,
    'user_id', p_user_id
  );
END;
$function$


-- ===== oid=138218 public.audit_cash_closures_changes() =====
CREATE OR REPLACE FUNCTION public.audit_cash_closures_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ DECLARE v_action text; v_record_id uuid; v_store_id uuid; v_user_id uuid; BEGIN v_user_id := auth.uid(); IF TG_OP = 'INSERT' THEN v_action := 'CASH_CLOSURE_CREATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'UPDATE' THEN v_action := 'CASH_CLOSURE_UPDATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'DELETE' THEN v_action := 'CASH_CLOSURE_DELETED'; v_record_id := OLD.id; v_store_id := OLD.store_id; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN RETURN NEW; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN RETURN NEW; END IF; INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata) VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id, jsonb_build_object('tg_op', TG_OP, 'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END, 'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END)); RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END; $function$


-- ===== oid=138220 public.audit_commission_payments_changes() =====
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


-- ===== oid=138222 public.audit_fiscal_closings_changes() =====
CREATE OR REPLACE FUNCTION public.audit_fiscal_closings_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'FISCAL_CLOSING_CREATED';
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'FISCAL_CLOSING_UPDATED';
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (v_action, 'fiscal_closings',
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.store_id ELSE NEW.store_id END,
    auth.uid(),
    jsonb_build_object(
      'tg_op', TG_OP,
      'year', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_year ELSE NULL END,
      'month', CASE WHEN TG_OP != 'DELETE' THEN NEW.period_month ELSE NULL END,
      'status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
    ));

  RETURN NEW;
END;
$function$


-- ===== oid=138224 public.audit_payment_transactions_changes() =====
CREATE OR REPLACE FUNCTION public.audit_payment_transactions_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'SUPPLIER_PAYMENT_REGISTERED' ELSE 'PAYMENT_TRANSACTION_UPDATED' END,
    'payment_transactions',
    NEW.id,
    NEW.store_id,
    NEW.paid_by,
    jsonb_build_object(
      'tg_op', TG_OP,
      'ref_type', NEW.ref_type,
      'ref_id', NEW.ref_id,
      'amount', NEW.amount,
      'amount_cup', NEW.amount_cup,
      'payment_method', NEW.payment_method,
      'currency', NEW.currency
    )
  );
  RETURN NEW;
END;
$function$


-- ===== oid=138689 public.check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text) =====
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


-- ===== oid=138783 public.calculate_receipt_total_cup(p_receipt_id uuid) =====
CREATE OR REPLACE FUNCTION public.calculate_receipt_total_cup(p_receipt_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total numeric;
  v_invalid_count integer;
BEGIN
  -- Verificar que todos los items tengan datos coherentes
  SELECT COUNT(*) INTO v_invalid_count
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id
    AND (
      -- Moneda NULL o no soportada
      ri.moneda_recepcion IS NULL
      OR ri.moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
      -- CUP con tasa != 1
      OR (ri.moneda_recepcion = 'CUP' AND ri.tasa_cambio_recepcion IS DISTINCT FROM 1.0)
      -- FX con tasa NULL o <= 1.5
      OR (ri.moneda_recepcion IN ('USD', 'EUR', 'MLC') AND (
        ri.tasa_cambio_recepcion IS NULL
        OR ri.tasa_cambio_recepcion <= 1.5
      ))
      -- cantidad inválida
      OR ri.quantity IS NULL OR ri.quantity <= 0
      -- unit_cost inválido
      OR ri.unit_cost IS NULL OR ri.unit_cost < 0
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_RECEIPT_DATA: % items con datos inválidos para receipt %',
      v_invalid_count, p_receipt_id;
  END IF;

  SELECT COALESCE(SUM(ri.quantity * ri.unit_cost * ri.tasa_cambio_recepcion), 0)
    INTO v_total
  FROM public.receipt_items ri
  WHERE ri.receipt_id = p_receipt_id;

  RETURN v_total;
END;
$function$


-- ===== oid=142121 public.adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text) =====
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


-- ===== oid=142629 public.bulk_update_products(_products jsonb) =====
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


-- ===== oid=143447 public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado'), false);
END;
$function$


-- ===== oid=143448 public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid) =====
CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_transaction_id IS NULL OR p_actor IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_tx.status <> 'completed' THEN RETURN false; END IF;

  IF v_tx.seller_id IS NULL OR v_tx.seller_id <> p_actor THEN RETURN false; END IF;

  IF v_tx.created_at IS NULL OR v_tx.created_at < now() - INTERVAL '30 seconds' THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = v_tx.store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado','clerk'), false);
END;
$function$


-- ===== oid=143547 public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text) =====
CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;
  IF v_membership_role IS NULL THEN RETURN false; END IF;
  IF v_membership_role = 'admin' THEN RETURN true; END IF;

  CASE p_operation
    WHEN 'receipt' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'transfer' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'adjustment' THEN
      RETURN v_membership_role IN ('manager','encargado');
    WHEN 'devolution' THEN
      RETURN true; -- cualquier membresía activa (simétrica a la creación; módulo dormant)
    WHEN 'production_order' THEN
      RETURN v_membership_role IN ('manager','costo');
    ELSE
      RETURN false;
  END CASE;
END;
$function$


-- ===== oid=21750 public.current_user_store_id() =====
CREATE OR REPLACE FUNCTION public.current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN (SELECT active_store_id FROM public.profiles WHERE id = auth.uid());
END;
$function$


-- ===== oid=21756 public.cleanup_expired_idempotency_keys() =====
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    DELETE FROM public.idempotency_keys
    WHERE expires_at < now();
END;
$function$


-- ===== oid=25489 public.close_cash_session(p_session_id uuid, p_counted_cash numeric) =====
CREATE OR REPLACE FUNCTION public.close_cash_session(p_session_id uuid, p_counted_cash numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_expected_cash numeric;
BEGIN
  SELECT
    s.opening_cash
    + COALESCE(SUM(t.total_amount) FILTER (WHERE t.payment_method='cash'),0)
    + COALESCE(SUM(m.amount) FILTER (WHERE m.method='cash' AND m.movement_type='in'),0)
    - COALESCE(SUM(m.amount) FILTER (WHERE m.method='cash' AND m.movement_type='out'),0)
  INTO v_expected_cash
  FROM public.cash_register_sessions s
  LEFT JOIN public.transactions t ON t.user_id = s.cashier_id AND t.created_at >= s.opened_at
  LEFT JOIN public.cash_movements m ON m.session_id = s.id
  WHERE s.id = p_session_id
  GROUP BY s.opening_cash;

  UPDATE public.cash_register_sessions
  SET status='closed'
  WHERE id = p_session_id;

  INSERT INTO public.business_events(event_type, entity_id, payload, created_at)
  VALUES (
    'cash_session_closed',
    p_session_id,
    jsonb_build_object(
      'expected_cash', v_expected_cash,
      'counted_cash', p_counted_cash,
      'difference', p_counted_cash - v_expected_cash
    ),
    timezone('utc', now())
  );
END;
$function$


-- ===== oid=38667 public.enforce_encargado_store_limit() =====
CREATE OR REPLACE FUNCTION public.enforce_encargado_store_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_creator_role user_role;
    v_limit integer;
    v_current_count integer;
BEGIN
    IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

    SELECT role, max_stores_limit INTO v_creator_role, v_limit 
    FROM public.profiles WHERE id = NEW.created_by;

    IF v_creator_role = 'encargado' THEN
        SELECT COUNT(*) INTO v_current_count FROM public.stores WHERE created_by = NEW.created_by;
        IF v_current_count >= v_limit THEN
            RAISE EXCEPTION 'ERR_STORE_LIMIT_EXCEEDED: Maximum number of stores reached for this manager (%/%)', v_current_count, v_limit;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=38669 public.enforce_encargado_user_limit() =====
CREATE OR REPLACE FUNCTION public.enforce_encargado_user_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_creator_role user_role;
    v_limit integer;
    v_current_count integer;
BEGIN
    IF NEW.created_by IS NULL THEN RETURN NEW; END IF;

    SELECT role, max_users_limit INTO v_creator_role, v_limit 
    FROM public.profiles WHERE id = NEW.created_by;

    IF v_creator_role = 'encargado' THEN
        SELECT COUNT(*) INTO v_current_count FROM public.profiles WHERE created_by = NEW.created_by;
        IF v_current_count >= v_limit THEN
            RAISE EXCEPTION 'ERR_USER_LIMIT_EXCEEDED: Maximum number of users reached for this manager (%/%)', v_current_count, v_limit;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=63381 public.check_reception_cost_variation() =====
CREATE OR REPLACE FUNCTION public.check_reception_cost_variation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_avg_cost NUMERIC;
BEGIN
    SELECT COALESCE(cost_price, 0) INTO v_avg_cost FROM public.products WHERE id = NEW.product_id;
    
    IF v_avg_cost > 0 AND (NEW.unit_cost > v_avg_cost * 2.0 OR NEW.unit_cost < v_avg_cost * 0.2) THEN
        -- For now we just log a warning in the DB console or metadata
        -- Future: INSERT INTO audit_logs
        RAISE NOTICE 'Critical cost variation for product %: % vs average %', NEW.product_id, NEW.unit_cost, v_avg_cost;
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=131395 public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric) =====
CREATE OR REPLACE FUNCTION public.deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- hint: auth.uid()
  PERFORM public.register_stock_movement(p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(), p_quantity := -p_quantity, p_movement_type := 'adjustment', p_reason := 'Direct deduction', p_unit_cost := 0);
END;
$function$


-- ===== oid=132926 public.cleanup_old_aggregates(p_days integer) =====
CREATE OR REPLACE FUNCTION public.cleanup_old_aggregates(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.usage_aggregates WHERE bucket_start < now() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$


-- ===== oid=133208 public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) =====
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


-- ===== oid=133213 public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid, p_po_number text, p_notes text, p_expected_date date, p_created_by uuid, p_items jsonb) =====
CREATE OR REPLACE FUNCTION public.create_purchase_order(p_store_id uuid, p_supplier_name text, p_supplier_id uuid DEFAULT NULL::uuid, p_po_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_expected_date date DEFAULT NULL::date, p_created_by uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_po_id       uuid;
  v_total       numeric := 0;
  v_item        jsonb;
  v_item_count  integer := 0;
  v_product_id  uuid;
  v_count       integer;
  v_po_number   text;
BEGIN
  -- ─── 1. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 2. Validar supplier_name (parity B2 register_reception) ───
  IF p_supplier_name IS NULL OR p_supplier_name = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  -- ─── 3. Validar supplier_id si se provee (Medio #10) ───
  IF p_supplier_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM public.suppliers
    WHERE id = p_supplier_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SUPPLIER_NOT_FOUND: supplier % not in store % or inactive',
        p_supplier_id, p_store_id;
    END IF;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Auto-generar po_number si no viene (Alto #7 complemento) ───
  IF p_po_number IS NULL OR p_po_number = '' THEN
    -- Formato: PO-{store_id_short}-{YYYYMMDD}-{random6}
    SELECT 'PO-' || substr(p_store_id::text, 1, 8) || '-' ||
           to_char(now(), 'YYYYMMDD') || '-' ||
           substr(md5(random()::text), 1, 6)
      INTO v_po_number;
  ELSE
    v_po_number := p_po_number;
    -- Verificar UNIQUE (store_id, po_number) — race-safe vía UNIQUE INDEX
    SELECT COUNT(*) INTO v_count
    FROM public.purchase_orders
    WHERE store_id = p_store_id AND po_number = v_po_number;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'ERR_PO_NUMBER_DUPLICATE: % already exists in store %',
        v_po_number, p_store_id;
    END IF;
  END IF;

  -- ─── 6. Calcular total + validar items ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_count := v_item_count + 1;

    -- Validar campos obligatorios del item
    IF (v_item->>'product_name') IS NULL OR (v_item->>'product_name') = '' THEN
      RAISE EXCEPTION 'ERR_ITEM_PRODUCT_NAME_REQUIRED: item %', v_item_count;
    END IF;

    -- Condición #1: product_id REQUIRED (no NULL)
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_count;
    END IF;

    -- Validar quantity_ordered > 0
    IF COALESCE((v_item->>'quantity_ordered')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_QTY_INVALID: item % quantity_ordered must be > 0', v_item_count;
    END IF;

    -- Condición #1: unit_cost > 0 (no >= 0)
    -- register_reception B4 rechaza unit_cost <= 0; si permitimos 0 aquí,
    -- la PO no sería recepcionable.
    IF COALESCE((v_item->>'unit_cost')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'ERR_ITEM_UNIT_COST_INVALID: item % unit_cost must be > 0 (B4 parity)', v_item_count;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, p_store_id;
    END IF;

    v_total := v_total + ((v_item->>'quantity_ordered')::numeric) * ((v_item->>'unit_cost')::numeric);
  END LOOP;

  -- ─── 7. Insertar OC (usa columnas nuevas de G1) ───
  INSERT INTO public.purchase_orders (
    store_id, supplier, supplier_name, supplier_id, po_number,
    status, total_amount, notes, expected_date, created_by
  ) VALUES (
    p_store_id, p_supplier_name, p_supplier_name, p_supplier_id, v_po_number,
    'draft'::public.purchase_status_enum, v_total, p_notes, p_expected_date, p_created_by
  ) RETURNING id INTO v_po_id;

  -- ─── 8. Insertar items ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.purchase_order_items (
      po_id, product_id, product_name, sku,
      quantity_ordered, quantity_received, unit_cost, unit_of_measure
    ) VALUES (
      v_po_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      NULLIF(v_item->>'sku', ''),
      (v_item->>'quantity_ordered')::numeric,
      0,
      (v_item->>'unit_cost')::numeric,
      COALESCE(v_item->>'unit_of_measure', 'unidad')
    );
  END LOOP;

  -- ─── 9. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_created_by, p_store_id, 'po_created', 'purchase_orders', v_po_id,
    jsonb_build_object(
      'supplier', p_supplier_name,
      'supplier_id', p_supplier_id,
      'po_number', v_po_number,
      'total', v_total,
      'items', v_item_count
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_id', v_po_id,
    'po_number', v_po_number,
    'total_amount', v_total
  );
END;
$function$


-- ===== oid=134481 public.date_dist(date, date) =====
CREATE OR REPLACE FUNCTION public.date_dist(date, date)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$date_dist$function$


-- ===== oid=136269 public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text) =====
CREATE OR REPLACE FUNCTION public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid DEFAULT NULL::uuid, p_original_transaction_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT 'cash'::text, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_devolution_id UUID; v_dev_number TEXT; v_item JSONB; v_total NUMERIC := 0;
    v_pid UUID; v_qty NUMERIC; v_price NUMERIC; v_item_total NUMERIC;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_dev_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::NUMERIC; v_price := (v_item->>'unit_price')::NUMERIC;
        v_total := v_total + (v_qty * v_price);
    END LOOP;
    INSERT INTO public.devolutions (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, payment_method, status, customer_id, customer_name, notes, processed_by)
    VALUES (p_store_id, p_original_transaction_id, v_dev_number, p_reason, v_total, 'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes, v_uid)
    RETURNING id INTO v_devolution_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID; v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC; v_item_total := v_qty * v_price;
        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_item_total, v_item->>'reason');
        UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_pid;
        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_item_total, stock_current, cost_average, stock_current * cost_average, 'devolution', v_devolution_id, 'Devolucion ' || v_dev_number, v_uid
        FROM public.products WHERE id = v_pid;
    END LOOP;
    RETURN jsonb_build_object('status', 'success', 'devolution_id', v_devolution_id, 'devolution_number', v_dev_number, 'total', v_total);
END;
$function$


-- ===== oid=136270 public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_discount_type text, p_discount_value numeric, p_notes text, p_valid_until date) =====
CREATE OR REPLACE FUNCTION public.create_quotation(p_store_id uuid, p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_valid_until date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_quote_id UUID;
    v_quote_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_pname TEXT;
    v_psku TEXT;
    v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- V2.10.2 FIX: v_uid no estaba declarado — usaba auth.uid() directamente
    IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_quote_number := 'COT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                      LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    INSERT INTO public.quotations (
        store_id, quotation_number, customer_id, customer_name, customer_phone,
        status, total_amount, currency, discount_type, discount_value, notes, valid_until, created_by
    ) VALUES (
        p_store_id, v_quote_number, p_customer_id, p_customer_name, p_customer_phone,
        'draft', 0, 'CUP', p_discount_type, p_discount_value, p_notes, p_valid_until, v_caller_uid
    ) RETURNING id INTO v_quote_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;

        -- V2.10.2 FIX: filtrar por store_id para evitar BOLA
        SELECT name, sku INTO v_pname, v_psku
        FROM public.products
        WHERE id = v_pid AND store_id = p_store_id;

        INSERT INTO public.quotation_items (quotation_id, product_id, product_name, product_sku, quantity, unit_price, total, notes)
        VALUES (v_quote_id, v_pid, COALESCE(v_pname, v_item->>'product_name'), v_psku, v_qty, v_price, v_qty * v_price, v_item->>'notes');

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    -- Aplicar descuento
    IF p_discount_type = 'percentage' AND p_discount_value > 0 THEN
        v_total := v_total - (v_total * p_discount_value / 100);
    ELSIF p_discount_type = 'fixed' AND p_discount_value > 0 THEN
        v_total := v_total - p_discount_value;
    END IF;

    UPDATE public.quotations SET total_amount = v_total WHERE id = v_quote_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'quotation_id', v_quote_id,
        'quotation_number', v_quote_number,
        'total_amount', v_total
    );
END;
$function$


-- ===== oid=136508 public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric, p_discount_type text, p_discount_value numeric, p_payment_method text, p_tax_amount numeric, p_applied_taxes jsonb, p_transaction_id uuid, p_operation_date timestamp with time zone, p_cash_amount numeric, p_transfer_amount numeric, p_idempotency_key text, p_sale_currency text, p_sale_exchange_rate numeric, p_zelle_amount numeric, p_warehouse_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.create_sale(p_store_id uuid, p_seller_id uuid, p_total_amount numeric, p_items jsonb, p_subtotal numeric DEFAULT 0, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_tax_amount numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_idempotency_key text DEFAULT NULL::text, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_zelle_amount numeric DEFAULT 0, p_warehouse_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := COALESCE(p_transaction_id, gen_random_uuid());
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_item jsonb; v_pid uuid; v_qty numeric; v_price numeric; v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units_to_deduct numeric;
  v_existing uuid;
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing); END IF;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- FIX H-2 (Iteración 11.1): Validar operation_date (forward-only locking).
  -- validate_operation_date usa pg_advisory_xact_lock(hashtext(store_id))
  -- para serializar la validación por tienda. Si p_operation_date es anterior
  -- al MAX(created_at) de la tienda, lanza ERR_BACKDATED_DOCUMENT.
  -- Solo validar si p_operation_date fue proporcionado explícitamente.
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;

  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, p_total_amount, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, p_discount_value, p_subtotal, p_tax_amount, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    p_cash_amount, p_transfer_amount, p_zelle_amount
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_deduct := v_qty * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
      p_quantity := -v_units_to_deduct, p_movement_type := 'sale', p_reason := 'Venta POS',
      p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
      p_operation_date := v_eff, p_skip_access_check := TRUE
    );

    INSERT INTO public.transaction_items (transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff);
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object('total_amount', p_total_amount, 'payment_method', v_effective_method,
      'cash_amount', p_cash_amount, 'transfer_amount', p_transfer_amount,
      'currency', p_sale_currency, 'exchange_rate', p_sale_exchange_rate,
      'item_count', jsonb_array_length(p_items)));

  RETURN jsonb_build_object('status','success','transaction_id',v_tx_id);
END;
$function$


-- ===== oid=136705 public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment(p_original_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_item RECORD;
  v_diff NUMERIC;
  v_new_stock NUMERIC;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  -- 1. Cargar ajuste original
  SELECT * INTO v_orig FROM public.inventory_adjustments WHERE id = p_original_id;
  IF v_orig IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;

  -- 2. Autorización (si v_uid es NULL → service_role bypass)
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_orig.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. Crear nuevo ajuste (mismo reason, notes indicando duplicación)
  INSERT INTO public.inventory_adjustments (store_id, created_by, status, reason, notes)
  VALUES (
    v_orig.store_id,
    v_uid,
    'confirmed',
    v_orig.reason,
    COALESCE('Duplicada de ' || LEFT(p_original_id::text, 8) || ' — ' || COALESCE(v_orig.notes, ''), '')
  )
  RETURNING id INTO v_new_id;

  -- 4. Copiar items + aplicar stock atómicamente
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_original_id
  LOOP
    v_diff := v_item.counted_quantity - v_item.expected_quantity;

    -- Insert item (difference es GENERATED, no se especifica)
    INSERT INTO public.inventory_adjustment_items
      (adjustment_id, product_id, expected_quantity, counted_quantity)
    VALUES (v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity);

    -- Actualizar stock ATÓMICAMENTE (UPDATE stock_current = stock_current + diff)
    -- Esto evita race conditions: la DB garantiza serialización del UPDATE
    UPDATE public.products
      SET stock_current = stock_current + v_diff,
          updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_orig.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Kardex entry
    INSERT INTO public.kardex_entries (
      store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value,
      reference_type, reference_id, reference_description, created_by
    )
    SELECT
      v_orig.store_id, v_item.product_id, 'adjustment', ABS(v_diff),
      COALESCE(p.cost_average, 0), ABS(v_diff) * COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0), COALESCE(p.cost_average, 0),
      COALESCE(v_new_stock, 0) * COALESCE(p.cost_average, 0),
      'adjustment', v_new_id,
      'Ajuste duplicado de ' || LEFT(p_original_id::text, 8), v_uid
    FROM public.products p
    WHERE p.id = v_item.product_id AND p.store_id = v_orig.store_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', v_new_id,
    'adjustment_number', LEFT(v_new_id::text, 8),
    'items_duplicated', v_count
  );
END;
$function$


-- ===== oid=136713 public.confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone) =====
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


-- ===== oid=136719 public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.compensate_inventory_error(p_store_id uuid, p_original_movement_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_quantity numeric;
BEGIN
  -- V2.7: autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Cargar movimiento original
  SELECT * INTO v_orig FROM public.stock_movements
  WHERE id = p_original_movement_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MOVEMENT_NOT_FOUND';
  END IF;

  -- Compensación: invertir el quantity_change
  v_new_quantity := -v_orig.quantity_change;

  -- Registrar movimiento compensatorio
  PERFORM public.register_stock_movement(
    p_product_id := v_orig.product_id,
    p_store_id := p_store_id,
    p_user_id := v_caller_uid,
    p_quantity := v_new_quantity,
    p_movement_type := 'adjustment',
    p_unit_cost := v_orig.unit_cost,
    p_reason := 'COMPENSATION: ' || COALESCE(p_reason, 'inventory error'),
    p_operation_date := NOW(),
    p_skip_access_check := (v_caller_uid IS NULL)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'original_movement_id', p_original_movement_id,
    'compensation_quantity', v_new_quantity,
    'product_id', v_orig.product_id
  );
END;
$function$


-- ===== oid=136801 public.create_physical_count(p_store_id uuid, p_user_id uuid, p_notes text) =====
CREATE OR REPLACE FUNCTION public.create_physical_count(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  -- Autorización
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Crear cabecera
  INSERT INTO public.physical_counts (
    store_id, status, started_at, started_by, notes
  ) VALUES (
    p_store_id, 'in_progress', NOW(), v_caller_uid, p_notes
  ) RETURNING id INTO v_count_id;

  -- Cargar todos los productos activos de la tienda con su stock actual
  INSERT INTO public.physical_count_items (count_id, product_id, expected_quantity, unit_cost)
  SELECT
    v_count_id,
    p.id,
    COALESCE(p.stock_current, 0),
    COALESCE(p.cost_average, 0)
  FROM public.products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true;

  -- Actualizar total_items
  UPDATE public.physical_counts
    SET total_items = (SELECT COUNT(*) FROM physical_count_items WHERE count_id = v_count_id)
    WHERE id = v_count_id;

  RETURN v_count_id;
END;
$function$


-- ===== oid=136899 public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.confirm_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_new_stock NUMERIC;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden confirmar ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Aplicar cada item: actualizar stock + kardex
  FOR v_item IN
    SELECT product_id, expected_quantity, counted_quantity
    FROM public.inventory_adjustment_items
    WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Actualizar stock del producto (atómico)
    UPDATE public.products
      SET stock_current = v_item.counted_quantity,
          updated_at = NOW()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id
      RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento en kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_adj.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_item.counted_quantity - v_item.expected_quantity,
      p_movement_type := 'adjustment',
      p_unit_cost := 0,
      p_reason := 'Ajuste documental confirmado',
      p_operation_date := NOW(),
      p_skip_access_check := TRUE  -- ya validamos con has_store_access_as
    );

    v_count := v_count + 1;
  END LOOP;

  -- Marcar como confirmed
  UPDATE public.inventory_adjustments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = v_caller_uid
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'items_applied', v_count
  );
END;
$function$


-- ===== oid=136967 public.create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_currency text, p_exchange_rate numeric) =====
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


-- ===== oid=137073 public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text, p_transaction_id uuid, p_operation_date timestamp with time zone, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.create_transfer(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text, p_transaction_id uuid DEFAULT NULL::uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer_id UUID := COALESCE(p_transaction_id, gen_random_uuid());
  v_item JSONB;
  v_pid UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_cost NUMERIC := 0;
  v_count INTEGER := 0;
  v_dest_product UUID;
  v_origin_product RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_origin_store RECORD;
  v_dest_store RECORD;
BEGIN
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT * INTO v_origin_store FROM public.stores WHERE id = p_origin_store_id;
  SELECT * INTO v_dest_store FROM public.stores WHERE id = p_destination_store_id;
  IF NOT v_origin_store.is_active THEN RAISE EXCEPTION 'ERR_ORIGIN_STORE_INACTIVE'; END IF;
  IF NOT v_dest_store.is_active THEN RAISE EXCEPTION 'ERR_DEST_STORE_INACTIVE'; END IF;

  IF p_origin_store_id = p_destination_store_id THEN
    RAISE EXCEPTION 'ERR_SAME_STORE';
  END IF;

  INSERT INTO public.transfers (
    id, origin_store_id, destination_store_id, status, notes, total_cost,
    created_by, created_at
  ) VALUES (
    v_transfer_id, p_origin_store_id, p_destination_store_id, 'PENDIENTE', p_notes, 0,
    v_caller_uid, v_effective_date
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pid := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    PERFORM pg_advisory_xact_lock(hashtext('product:' || v_pid::text));

    SELECT p.id, p.stock_current, p.cost_average, p.sku, p.name, p.unit_of_measure,
           p.description, p.category, p.price, p.price_currency,
           p.stock_current - COALESCE(
             (SELECT SUM(r.quantity) FROM public.inventory_reservations r
              WHERE r.product_id = p.id AND r.store_id = p.store_id AND r.status = 'ACTIVE'),
             0
           ) AS stock_avail
    INTO v_origin_product
    FROM public.products p
    WHERE p.id = v_pid AND p.store_id = p_origin_store_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_pid; END IF;

    IF v_origin_product.stock_avail < v_qty THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: producto %, disponible %, solicitado %',
        v_origin_product.name, v_origin_product.stock_avail, v_qty;
    END IF;

    v_unit_cost := v_origin_product.cost_average;
    v_line_total := v_qty * v_unit_cost;
    v_total_cost := v_total_cost + v_line_total;
    v_count := v_count + 1;

    -- H-049: Buscar producto destino por SKU
    SELECT id INTO v_dest_product
    FROM public.products
    WHERE sku = v_origin_product.sku AND store_id = p_destination_store_id
    LIMIT 1;

    -- H-049: Si no existe, crear producto espejo con MÁS campos copiados
    IF v_dest_product IS NULL THEN
      INSERT INTO public.products (
        store_id, sku, name, description, unit_of_measure,
        stock_current, cost_average, cost_price, price, price_currency,
        is_active, category
      ) VALUES (
        p_destination_store_id,
        v_origin_product.sku,
        v_origin_product.name,
        COALESCE(v_origin_product.description, v_origin_product.name),  -- H-049: descripción real
        v_origin_product.unit_of_measure,
        0,
        v_unit_cost,
        v_unit_cost,
        COALESCE(v_origin_product.price, v_unit_cost),  -- H-049: precio del origen
        COALESCE(v_origin_product.price_currency, 'CUP'),  -- H-049: moneda del origen
        true,
        COALESCE(v_origin_product.category, 'General')  -- H-049: categoría del origen
      ) RETURNING id INTO v_dest_product;
    END IF;

    INSERT INTO public.transfer_items (transfer_id, product_id, destination_product_id, quantity, unit_cost, total)
    VALUES (v_transfer_id, v_pid, v_dest_product, v_qty, v_unit_cost, v_line_total);

    INSERT INTO public.inventory_reservations (
      store_id, product_id, reference_type, reference_id,
      quantity, status, created_by, metadata
    ) VALUES (
      p_origin_store_id, v_pid, 'TRANSFER', v_transfer_id,
      v_qty, 'ACTIVE', v_caller_uid,
      jsonb_build_object('destination_store_id', p_destination_store_id, 'dest_product_id', v_dest_product)
    );
  END LOOP;

  UPDATE public.transfers SET total_cost = v_total_cost WHERE id = v_transfer_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_TRANSFER', 'transfers', v_transfer_id, p_origin_store_id, v_caller_uid,
    jsonb_build_object('dest', p_destination_store_id, 'total_cost', v_total_cost, 'items_count', v_count,
      'reservations_created', v_count));

  RETURN jsonb_build_object('status', 'success', 'transfer_id', v_transfer_id, 'total_cost', v_total_cost);
END;
$function$


-- ===== oid=137076 public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.close_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_closing_id UUID; v_total_sales NUMERIC := 0; v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0; v_total_commissions NUMERIC := 0;
    v_date_from TIMESTAMPTZ; v_date_to TIMESTAMPTZ;
    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional (actor real en auditoría
    -- por trigger en la vía HTTP service_role). Aditivo; no altera lógica de negocio.
    IF v_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    END IF;
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
    v_date_from := make_date(p_year, p_month, 1);
    v_date_to := make_date(p_year, p_month, 1) + INTERVAL '1 month';
    SELECT id INTO v_closing_id FROM public.fiscal_closings WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;
    IF v_closing_id IS NOT NULL THEN
        UPDATE public.fiscal_closings SET status = 'closed', closed_by = v_uid, closed_at = now(), updated_at = now()
        WHERE id = v_closing_id AND status = 'open';
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PERIOD_LOCKED'; END IF;
    ELSE
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales FROM public.transactions WHERE store_id = p_store_id AND status = 'completed' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_devolutions FROM public.devolutions WHERE store_id = p_store_id AND status = 'completed' AND processed_at >= v_date_from AND processed_at < v_date_to;
        SELECT COALESCE(SUM(total_cost), 0) INTO v_total_purchases FROM public.receipts WHERE store_id = p_store_id AND status = 'active' AND created_at >= v_date_from AND created_at < v_date_to;
        SELECT COALESCE(SUM(final_amount), 0) INTO v_total_commissions FROM public.commission_payments WHERE store_id = p_store_id AND status = 'paid' AND paid_at >= v_date_from AND paid_at < v_date_to;
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status, total_sales, total_devolutions, total_purchases, total_commissions, total_cash_balance, closed_by, closed_at)
        VALUES (p_store_id, p_year, p_month, 'closed', v_total_sales, v_total_devolutions, v_total_purchases, v_total_commissions, v_total_sales - v_total_devolutions - v_total_commissions, v_uid, now())
        RETURNING id INTO v_closing_id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'closing_id', v_closing_id, 'total_sales', v_total_sales, 'total_devolutions', v_total_devolutions, 'total_purchases', v_total_purchases, 'total_commissions', v_total_commissions);
END;
$function$


-- ===== oid=137558 public.discover_backup_tables() =====
CREATE OR REPLACE FUNCTION public.discover_backup_tables()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'has_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'store_id'
    ),
    'has_origin_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'origin_store_id'
    ),
    'has_destination_store_id', EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'destination_store_id'
    ),
    'parent_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl2.relname)
      FROM pg_constraint con2
      JOIN pg_class cl2 ON con2.confrelid = cl2.oid
      WHERE con2.conrelid = t.table_id
        AND con2.contype = 'f'
    ), '[]'::jsonb),
    'child_tables', COALESCE((
      SELECT jsonb_agg(DISTINCT cl3.relname)
      FROM pg_constraint con3
      JOIN pg_class cl3 ON con3.conrelid = cl3.oid
      WHERE con3.confrelid = t.table_id
        AND con3.contype = 'f'
    ), '[]'::jsonb)
  ) ORDER BY t.table_name)
  FROM (
    SELECT
      c.relname AS table_name,
      c.oid AS table_id
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'  -- solo tablas reales (no vistas)
      AND c.relname NOT LIKE 'pg_%'
      AND c.relname NOT LIKE 'schema_%'
      AND c.relname NOT IN ('schema_migrations')
    ORDER BY c.relname
  ) t;
$function$


-- ===== oid=137570 public.create_pre_restore_snapshot(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.create_pre_restore_snapshot(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot JSONB;
  v_table_counts JSONB;
  v_inventory JSONB;
  v_products_stock JSONB;
  v_transfers JSONB;
  v_reservations JSONB;
  v_checksums JSONB;
  rec RECORD;
  v_count BIGINT;
  v_md5 TEXT;
BEGIN
  -- 1. Conteos por tabla (pg_stat_user_tables uses relname, not tablename)
  SELECT jsonb_object_agg(relname, n_live_tup) INTO v_table_counts
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND relname IN (
      SELECT table_name FROM public.backup_table_registry
      WHERE excluded_from_restore = FALSE
    );

  -- 2. Inventory completo
  SELECT jsonb_agg(to_jsonb(i) ORDER BY i.product_id) INTO v_inventory
  FROM public.inventory i
  WHERE i.store_id = p_store_id;

  -- 3. products.stock_current
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'sku', p.sku, 'stock_current', p.stock_current,
    'cost_average', p.cost_average, 'updated_at', p.updated_at
  ) ORDER BY p.id) INTO v_products_stock
  FROM public.products p
  WHERE p.store_id = p_store_id;

  -- 4. transfers pendientes
  SELECT jsonb_agg(to_jsonb(tr) ORDER BY tr.created_at) INTO v_transfers
  FROM public.transfers tr
  WHERE tr.origin_store_id = p_store_id OR tr.destination_store_id = p_store_id;

  -- 5. inventory_reservations activas
  SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.created_at) INTO v_reservations
  FROM public.inventory_reservations rv
  WHERE rv.store_id = p_store_id AND rv.status = 'ACTIVE';

  -- 6. Checksums de tablas críticas
  v_checksums := '{}'::jsonb;
  FOR rec IN
    SELECT table_name, filter_strategy FROM public.backup_table_registry
    WHERE source_of_truth IN ('primary', 'audit')
      AND excluded_from_restore = FALSE
    ORDER BY table_name
  LOOP
    BEGIN
      IF rec.filter_strategy = 'via_origin_dest' THEN
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
          rec.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
          rec.table_name
        ) INTO v_md5 USING p_store_id;
      ELSIF rec.filter_strategy = 'via_entity_id' THEN
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE entity_id = $1::text',
          rec.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE entity_id = $1::text',
          rec.table_name
        ) INTO v_md5 USING p_store_id;
      ELSE
        EXECUTE format(
          'SELECT count(*) FROM public.%I WHERE store_id = $1',
          rec.table_name
        ) INTO v_count USING p_store_id;
        EXECUTE format(
          'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE store_id = $1',
          rec.table_name
        ) INTO v_md5 USING p_store_id;
      END IF;
      v_checksums := jsonb_set(v_checksums, ARRAY[rec.table_name],
                               jsonb_build_object('count', v_count, 'checksum', v_md5));
    EXCEPTION WHEN OTHERS THEN
      v_checksums := jsonb_set(v_checksums, ARRAY[rec.table_name],
                               jsonb_build_object('count', v_count, 'checksum', NULL, 'error', SQLERRM));
    END;
  END LOOP;

  v_snapshot := jsonb_build_object(
    'snapshot_at', NOW(),
    'store_id', p_store_id,
    'snapshot_type', 'hybrid',
    'table_counts', COALESCE(v_table_counts, '{}'::jsonb),
    'inventory', COALESCE(v_inventory, '[]'::jsonb),
    'products_stock_current', COALESCE(v_products_stock, '[]'::jsonb),
    'transfers', COALESCE(v_transfers, '[]'::jsonb),
    'inventory_reservations_active', COALESCE(v_reservations, '[]'::jsonb),
    'checksums', v_checksums
  );

  RETURN v_snapshot;
END;
$function$


-- ===== oid=138109 public.detect_orphan_users() =====
CREATE OR REPLACE FUNCTION public.detect_orphan_users()
 RETURNS TABLE(auth_user_id uuid, email text, detected_at timestamp with time zone, log_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orphan RECORD;
BEGIN
  -- Solo admin puede ejecutar
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can detect orphan users.';
  END IF;

  -- Registrar nuevos huérfanos (idempotente por UNIQUE auth_user_id)
  FOR v_orphan IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.orphaned_users_log (auth_user_id, email)
    VALUES (v_orphan.id, v_orphan.email)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;

  -- Retornar huérfanos actuales con status del log
  RETURN QUERY
    SELECT
      o.auth_user_id,
      o.email,
      o.detected_at,
      o.status
    FROM public.orphaned_users_log o
    WHERE o.status IN ('pending', 'pending_deletion')
    ORDER BY o.detected_at DESC;
END;
$function$


-- ===== oid=138143 public.create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid) =====
CREATE OR REPLACE FUNCTION public.create_store_with_membership(p_name text, p_address text DEFAULT ''::text, p_created_by uuid DEFAULT NULL::uuid, p_max_stores integer DEFAULT 1, p_logo_url text DEFAULT NULL::text, p_reeup text DEFAULT NULL::text, p_nit text DEFAULT NULL::text, p_bank_account text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_plantilla text DEFAULT 'construccion'::text, p_signature_url text DEFAULT NULL::text, p_stamp_url text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_store_id uuid;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_active_count int;
  v_tenant uuid;
BEGIN
  -- Iteración 13: Resolver tenant_id del caller si no se pasa explícito
  v_tenant := COALESCE(p_tenant_id, (SELECT tenant_id FROM public.profiles WHERE id = v_caller_uid));

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'ERR_NO_TENANT: User has no tenant_id and p_tenant_id is NULL';
  END IF;

  -- Check store count per tenant (NO per user)
  SELECT COUNT(*) INTO v_active_count
    FROM public.stores
    WHERE tenant_id = v_tenant AND is_active = true;

  IF v_active_count >= p_max_stores THEN
    RAISE EXCEPTION 'ERR_STORE_LIMIT_REACHED: Tenant % has % active stores, limit is %', v_tenant, v_active_count, p_max_stores;
  END IF;

  -- INSERT store with tenant_id
  INSERT INTO public.stores (
    name, address, created_by, is_active, logo_url, reeup, nit, bank_account,
    phone, email, slug, plantilla, signature_url, stamp_url, latitude, longitude, tenant_id
  ) VALUES (
    p_name, p_address, v_caller_uid, true, p_logo_url, p_reeup, p_nit, p_bank_account,
    p_phone, p_email, p_slug, p_plantilla, p_signature_url, p_stamp_url, p_latitude, p_longitude, v_tenant
  )
  RETURNING id INTO v_store_id;

  -- Create admin membership for caller
  INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
  VALUES (v_caller_uid, v_store_id, 'admin', 'active')
  ON CONFLICT (user_id, store_id) DO NOTHING;

  -- Set active_store_id if NULL
  UPDATE public.profiles SET active_store_id = v_store_id
    WHERE id = v_caller_uid AND active_store_id IS NULL;

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('store_created', 'stores', v_store_id, v_store_id, v_caller_uid,
    jsonb_build_object('store_name', p_name, 'tenant_id', v_tenant));

  RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
END;

$function$


-- ===== oid=138145 public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t) =====
CREATE OR REPLACE FUNCTION public.check_tenant_store_quota(p_tenant_id uuid, p_plan plan_t DEFAULT NULL::plan_t)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan plan_t;
  v_limit int;
  v_current int;
  v_allowed boolean;
BEGIN
  -- Get plan from tenant if not passed
  IF p_plan IS NULL THEN
    SELECT plan INTO v_plan FROM public.tenants WHERE id = p_tenant_id;
  ELSE
    v_plan := p_plan;
  END IF;

  -- Plan limits (unified source of truth)
  v_limit := CASE v_plan
    WHEN 'free'::plan_t THEN 1
    WHEN 'pro'::plan_t THEN 3
    WHEN 'enterprise'::plan_t THEN 10
    ELSE 1
  END;

  -- Count active stores in tenant
  SELECT COUNT(*) INTO v_current
    FROM public.stores
    WHERE tenant_id = p_tenant_id AND is_active = true;

  v_allowed := v_current < v_limit;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current', v_current,
    'limit', v_limit,
    'plan', v_plan::text,
    'tenant_id', p_tenant_id
  );
END;
$function$


-- ===== oid=138285 public.close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid) =====
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


-- ===== oid=138372 public.current_user_tenant_id() =====
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$function$


-- ===== oid=138373 public.current_user_store_ids() =====
CREATE OR REPLACE FUNCTION public.current_user_store_ids()
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result uuid[];
BEGIN
  IF public.is_admin() THEN
    SELECT array_agg(id) INTO v_result
    FROM public.stores
    WHERE tenant_id = public.current_user_tenant_id()
      AND is_active = true;
  ELSE
    SELECT array_agg(store_id) INTO v_result
    FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND status = 'active';
  END IF;
  RETURN COALESCE(v_result, ARRAY[]::uuid[]);
END;
$function$


-- ===== oid=138592 public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid, p_service_type_name text, p_service_date date, p_currency text, p_exchange_rate numeric, p_payment_terms_days integer, p_distribution_method text, p_reference_doc text, p_observations text, p_receipt_ids jsonb, p_created_by uuid) =====
CREATE OR REPLACE FUNCTION public.create_received_service_v2(p_store_id uuid, p_supplier text, p_total_amount numeric, p_service_type_id uuid DEFAULT NULL::uuid, p_service_type_name text DEFAULT 'Otro'::text, p_service_date date DEFAULT NULL::date, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_payment_terms_days integer DEFAULT 30, p_distribution_method text DEFAULT 'amount'::text, p_reference_doc text DEFAULT NULL::text, p_observations text DEFAULT NULL::text, p_receipt_ids jsonb DEFAULT '[]'::jsonb, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_service_id uuid;
  v_service_number text;
  v_receipt_id uuid;
  v_count integer;
  v_allocated_per_receipt numeric;
  v_link_count integer;
  v_caller_uid uuid := COALESCE(p_created_by, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED';
  END IF;

  IF p_total_amount <= 0 THEN
    RAISE EXCEPTION 'ERR_INVALID_AMOUNT: total_amount must be > 0';
  END IF;

  IF p_exchange_rate < 0.01 OR p_exchange_rate > 10000 THEN
    RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: % out of range [0.01, 10000]', p_exchange_rate;
  END IF;

  IF p_payment_terms_days < 1 OR p_payment_terms_days > 365 THEN
    RAISE EXCEPTION 'ERR_INVALID_PAYMENT_TERMS: % out of range [1, 365]', p_payment_terms_days;
  END IF;

  IF p_distribution_method NOT IN ('amount', 'quantity', 'manual') THEN
    RAISE EXCEPTION 'ERR_INVALID_DISTRIBUTION_METHOD';
  END IF;

  IF p_service_type_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count FROM service_types
    WHERE id = p_service_type_id AND store_id = p_store_id AND is_active = true;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'ERR_SERVICE_TYPE_NOT_FOUND';
    END IF;
  END IF;

  PERFORM public.validate_operation_date(COALESCE(p_service_date, CURRENT_DATE)::timestamp with time zone, p_store_id);

  SELECT 'SRV-' || to_char(COALESCE(p_service_date, CURRENT_DATE), 'YYYYMMDD') || '-' ||
         LPAD(nextval('service_number_seq')::text, 5, '0')
  INTO v_service_number;

  INSERT INTO received_services (
    store_id, service_number, service_date, service_type_id, service_type_name,
    supplier, reference_doc, currency, exchange_rate, total_amount,
    observations, status, distribution_method, created_by,
    payment_terms_days, due_date
  ) VALUES (
    p_store_id, v_service_number, COALESCE(p_service_date, CURRENT_DATE),
    p_service_type_id, p_service_type_name, p_supplier, p_reference_doc,
    p_currency, p_exchange_rate, p_total_amount, p_observations,
    'draft', p_distribution_method, v_caller_uid,
    p_payment_terms_days, (COALESCE(p_service_date, CURRENT_DATE) + p_payment_terms_days)::date
  ) RETURNING id INTO v_service_id;

  v_link_count := jsonb_array_length(p_receipt_ids);
  IF v_link_count > 0 THEN
    v_allocated_per_receipt := p_total_amount / v_link_count;
    FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
      IF NOT EXISTS (SELECT 1 FROM receipts WHERE id = v_receipt_id AND store_id = p_store_id AND status = 'active') THEN
        RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
      END IF;
      INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
      VALUES (v_service_id, v_receipt_id, 100.0 / v_link_count, v_allocated_per_receipt);
    END LOOP;
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'SERVICE_CREATED', 'received_services', v_service_id,
    jsonb_build_object(
      'service_number', v_service_number, 'supplier', p_supplier,
      'total_amount', p_total_amount, 'currency', p_currency,
      'receipt_ids_linked', v_link_count
    ));

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', v_service_id,
    'service_number', v_service_number, 'link_count', v_link_count
  );
END;
$function$


-- ===== oid=138597 public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.distribute_service_cost_v2(p_service_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_total_amount numeric;
  v_service received_services%ROWTYPE;
  v_method text;
  v_link service_reception_links%ROWTYPE;
  v_item receipt_items%ROWTYPE;
  v_total_value numeric := 0;
  v_total_qty numeric := 0;
  v_allocated numeric;
  v_dist_count integer := 0;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT * INTO v_service FROM received_services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  v_store_id := v_service.store_id;
  v_status := v_service.status;
  v_total_amount := v_service.total_amount;
  v_method := v_service.distribution_method;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: status % is not active', v_status;
  END IF;

  IF v_method = 'manual' THEN
    RAISE EXCEPTION 'ERR_MANUAL_METHOD: use link_receipts_to_service for manual distribution';
  END IF;

  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;

  FOR v_link IN SELECT * FROM service_reception_links WHERE service_id = p_service_id AND allocated_amount > 0 ORDER BY receipt_id LOOP
    v_allocated := v_link.allocated_amount;

    IF v_method = 'amount' THEN
      SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO v_total_value
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_value > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity * v_item.unit_cost / v_total_value),
             (v_item.quantity * v_item.unit_cost / v_total_value) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;

    ELSIF v_method = 'quantity' THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
      FROM receipt_items WHERE receipt_id = v_link.receipt_id;
      IF v_total_qty > 0 THEN
        FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = v_link.receipt_id ORDER BY id LOOP
          INSERT INTO service_cost_distributions
            (service_id, receipt_id, receipt_item_id, product_id, distribution_amount, distribution_percentage)
          VALUES
            (p_service_id, v_link.receipt_id, v_item.id, v_item.product_id,
             v_allocated * (v_item.quantity / v_total_qty),
             (v_item.quantity / v_total_qty) * 100);
          v_dist_count := v_dist_count + 1;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- Forzar recalculo de WAC para cada producto afectado
  UPDATE receipt_items SET updated_at = NOW()
  WHERE product_id IN (SELECT DISTINCT product_id FROM service_cost_distributions WHERE service_id = p_service_id);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_DISTRIBUTED', 'received_services', p_service_id,
    jsonb_build_object('rows_distributed', v_dist_count, 'method', v_method, 'total_amount', v_total_amount));

  RETURN jsonb_build_object('status', 'success', 'distributed_rows', v_dist_count);
END;
$function$


-- ===== oid=138627 public.close_service_order_as_sale(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_payment_method text, p_currency text, p_exchange_rate numeric, p_user_id uuid) =====
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


-- ===== oid=138630 public.create_production_order_v2(p_store_id uuid, p_order_type text, p_customer_name text, p_customer_ci text, p_customer_phone text, p_customer_address text, p_budget_total numeric, p_budget_currency text, p_description text, p_notes text, p_items jsonb, p_advance_amount numeric, p_advance_method text, p_advance_currency text, p_created_by uuid, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.create_production_order_v2(p_store_id uuid, p_order_type text DEFAULT 'service'::text, p_customer_name text DEFAULT NULL::text, p_customer_ci text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text, p_budget_total numeric DEFAULT 0, p_budget_currency text DEFAULT 'CUP'::text, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_advance_amount numeric DEFAULT 0, p_advance_method text DEFAULT NULL::text, p_advance_currency text DEFAULT 'CUP'::text, p_created_by uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id uuid; v_order_number text; v_item jsonb; v_item_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_created_by, auth.uid()) ELSE auth.uid() END;
  v_existing_result jsonb; v_param_hash text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(
      p_store_id::text || '|' || p_order_type || '|' || COALESCE(p_customer_name, '') || '|' ||
      COALESCE(p_customer_ci, '') || '|' || COALESCE(p_customer_phone, '') || '|' ||
      COALESCE(p_customer_address, '') || '|' || p_budget_total::text || '|' ||
      p_budget_currency || '|' || COALESCE(p_description, '') || '|' || COALESCE(p_notes, '') || '|' ||
      COALESCE(p_items::text, '[]') || '|' || p_advance_amount::text || '|' ||
      COALESCE(p_advance_method, '') || '|' || p_advance_currency || '|' || COALESCE(p_created_by::text, '')
    );
    v_existing_result := public.check_idempotency(p_idempotency_key, 'create_po', p_store_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF p_order_type NOT IN ('production', 'service', 'work') THEN
    RAISE EXCEPTION 'ERR_INVALID_ORDER_TYPE';
  END IF;

  INSERT INTO production_orders (
    store_id, order_type, status, budget_total, budget_currency,
    customer_name, customer_ci, customer_phone, customer_address,
    description, notes, created_by, paid_amount, payment_status,
    idempotency_key, advance_amount, advance_method, advance_currency
  ) VALUES (
    p_store_id, p_order_type, 'draft', p_budget_total, p_budget_currency,
    p_customer_name, p_customer_ci, p_customer_phone, p_customer_address,
    p_description, p_notes, v_caller_uid, 0, 'unpaid',
    p_idempotency_key, p_advance_amount, p_advance_method, p_advance_currency
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF NOT EXISTS (SELECT 1 FROM products WHERE id = (v_item->>'product_id')::uuid AND store_id = p_store_id) THEN
        RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: %', v_item->>'product_id';
      END IF;
      INSERT INTO production_order_items (order_id, product_id, variant_id, budgeted_qty, budgeted_unit_cost, status)
      VALUES (v_order_id, (v_item->>'product_id')::uuid, NULLIF(v_item->>'variant_id', '')::uuid,
        (v_item->>'budgeted_qty')::numeric, (v_item->>'budgeted_unit_cost')::numeric, 'pending');
      v_item_count := v_item_count + 1;
    END LOOP;
  END IF;

  IF p_advance_amount > 0 AND p_advance_method IS NOT NULL THEN
    PERFORM register_supplier_payment(p_store_id := p_store_id,
      p_ref_type := CASE WHEN p_order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := v_order_id, p_amount := p_advance_amount, p_payment_method := p_advance_method,
      p_paid_by := v_caller_uid, p_currency := p_advance_currency,
      p_idempotency_key := 'advance-' || v_order_id::text);
  END IF;

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id, 'order_number', v_order_number, 'items_count', v_item_count);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'create_po', v_order_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, p_store_id, 'PRODUCTION_ORDER_CREATED', 'production_orders', v_order_id,
    jsonb_build_object('order_number', v_order_number, 'order_type', p_order_type,
      'budget_total', p_budget_total, 'items_count', v_item_count,
      'advance_amount', p_advance_amount, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$


-- ===== oid=138633 public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric, p_final_method text, p_final_currency text, p_exchange_rate numeric, p_output_product_id uuid, p_output_quantity numeric, p_user_id uuid, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.close_production_order_v2(p_order_id uuid, p_store_id uuid, p_seller_id uuid, p_final_amount numeric DEFAULT 0, p_final_method text DEFAULT NULL::text, p_final_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_output_product_id uuid DEFAULT NULL::uuid, p_output_quantity numeric DEFAULT NULL::numeric, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_transaction_id uuid;
  v_cash_amount numeric := 0;
  v_transfer_amount numeric := 0;
  v_zelle_amount numeric := 0;
  v_effective_method text;
  v_recv_result jsonb;
  v_existing_result jsonb;
  v_param_hash text;
  v_sum_payments numeric;
BEGIN
  -- ─── 0. Idempotencia — DF-08 FIX: record_id = p_order_id (uuid=uuid, sin ::text) ───
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || COALESCE(p_output_product_id::text, '') || COALESCE(p_output_quantity::text, '') || p_final_amount::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_ORDER_CLOSED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  -- ─── 1. SELECT FOR UPDATE ───
  SELECT * INTO v_order FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;

  -- ─── 2. Idempotencia de estado ───
  IF v_order.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'already_closed', 'order_id', p_order_id, 'transaction_id', v_order.transaction_id);
  END IF;

  -- ─── 3. Validar acceso ───
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 4. Validar que la orden está en progreso ───
  IF v_order.status NOT IN ('in_progress', 'approved', 'draft') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_CLOSABLE: status %', v_order.status;
  END IF;

  -- ─── 5. Transición a in_progress (si no lo está) ───
  IF v_order.status = 'draft' THEN
    UPDATE production_orders SET status = 'approved' WHERE id = p_order_id;
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  ELSIF v_order.status = 'approved' THEN
    UPDATE production_orders SET status = 'in_progress' WHERE id = p_order_id;
  END IF;

  -- ─── 6. Pago final (atómico) ───
  IF p_final_amount > 0 AND p_final_method IS NOT NULL THEN
    PERFORM register_supplier_payment(
      p_store_id := v_order.store_id,
      p_ref_type := CASE WHEN v_order.order_type = 'work' THEN 'work' ELSE 'production_order' END,
      p_ref_id := p_order_id,
      p_amount := p_final_amount,
      p_payment_method := p_final_method,
      p_paid_by := v_caller_uid,
      p_currency := p_final_currency,
      p_exchange_rate := p_exchange_rate,
      p_idempotency_key := 'close-' || p_order_id::text
    );
  END IF;

  -- PATH A: PRODUCCIÓN → receive consolidado (paquetes 01/03: server-side)
  IF v_order.order_type = 'production' THEN
    IF p_output_product_id IS NULL OR p_output_quantity IS NULL OR p_output_quantity <= 0 THEN
      RAISE EXCEPTION 'ERR_PRODUCTION_REQUIRES_OUTPUT: product_id y quantity > 0 son obligatorios';
    END IF;

    PERFORM public.receive_production_output(
      p_order_id := p_order_id,
      p_product_id := p_output_product_id,
      p_quantity := p_output_quantity,
      p_store_id := v_order.store_id,
      p_user_id := v_caller_uid,
      p_idempotency_key := 'recv-' || p_order_id::text
    );

  -- PATH B: SERVICIO
  ELSIF v_order.order_type = 'service' THEN
    SELECT
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN amount_cup ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN payment_method = 'zelle' THEN amount_cup ELSE 0 END), 0)
    INTO v_cash_amount, v_transfer_amount, v_zelle_amount
    FROM payment_transactions
    WHERE ref_type IN ('production_order', 'work') AND ref_id = p_order_id;

    v_effective_method := COALESCE(p_final_method, 'cash');
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

    INSERT INTO transactions (
      store_id, seller_id, total_amount, payment_method,
      sale_currency, sale_exchange_rate, status, created_at, completed_at,
      customer_name, customer_phone, customer_ci, customer_address,
      subtotal, cash_amount, transfer_amount, zelle_amount
    ) VALUES (
      v_order.store_id, p_seller_id, v_order.budget_total,
      v_effective_method::public.payment_method_enum,
      p_final_currency, p_exchange_rate, 'completed', now(), now(),
      v_order.customer_name, v_order.customer_phone, v_order.customer_ci, v_order.customer_address,
      v_order.budget_total, v_cash_amount, v_transfer_amount, v_zelle_amount
    ) RETURNING id INTO v_transaction_id;

    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale
    ) VALUES (
      v_transaction_id, NULL, NULL, 1, v_order.budget_total, 0
    );

    UPDATE public.payment_transactions
      SET transaction_id = v_transaction_id
      WHERE ref_type IN ('production_order', 'work')
        AND ref_id = p_order_id
        AND transaction_id IS NULL;

    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
    FROM public.payment_transactions WHERE transaction_id = v_transaction_id;

    IF v_sum_payments > v_order.budget_total + 0.01 THEN
      RAISE EXCEPTION 'ERR_OT_OVERPAID: payments=% > budget_total=%', v_sum_payments, v_order.budget_total;
    END IF;

    IF ABS(v_sum_payments - v_order.budget_total) > 0.01 THEN
      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'OT_SALDO_PENDING', 'transactions', v_transaction_id, v_order.store_id, v_caller_uid,
        jsonb_build_object('order_id', p_order_id, 'budget_total', v_order.budget_total,
          'sum_payments_cup', v_sum_payments, 'saldo', v_order.budget_total - v_sum_payments)
      );
    END IF;
  END IF;

  -- ─── 7. Transición a completed → closed ───
  UPDATE production_orders SET status = 'completed', completion_date = CURRENT_DATE WHERE id = p_order_id;
  UPDATE production_orders SET
    status = 'closed',
    closed_at = now(),
    transaction_id = COALESCE(v_transaction_id, v_order.transaction_id),
    payment_status = 'paid'
  WHERE id = p_order_id;

  -- ─── 8. Audit logs ───
  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_CLOSED', 'production_orders', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'order_type', v_order.order_type,
      'transaction_id', v_transaction_id,
      'final_amount', p_final_amount,
      'idempotency_key', p_idempotency_key,
      'param_hash', v_param_hash,
      'payment_transactions_associated', true,
      'result', jsonb_build_object('status', 'success', 'transaction_id', v_transaction_id),
      'df08_uuid_fix', true
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'order_id', p_order_id,
    'transaction_id', v_transaction_id
  );
END $function$


-- ===== oid=138865 public.create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text) =====
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


-- ===== oid=138870 public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.duplicate_inventory_adjustment_v2(p_original_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_new_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
BEGIN
  -- 1. SELECT FOR UPDATE original
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND';
  END IF;

  -- 2. Autorización (patrón canónico v2.12.12)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 3. INSERT new adjustment
  --    PR-4.3.1 Fix: usar 'reason' (enum) en vez de 'adjustment_type' (inexistente)
  --    No incluir 'updated_at' (no existe en inventory_adjustments)
  --    No incluir 'difference' (es GENERATED en inventory_adjustment_items)
  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_new_id, v_original.store_id, 'confirmed',
    v_original.reason,
    v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  -- 4. FOR each item: copy + register_stock_movement (NO INSERT directo a kardex)
  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_original_id
  LOOP
    -- PR-4.3.1 Fix: usar expected_quantity, counted_quantity (no expected_qty, counted_qty)
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);

    IF v_diff = 0 THEN
      CONTINUE;
    END IF;

    -- PR-4.3.1 Fix: no incluir difference en el INSERT (es GENERATED)
    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_new_id, v_item.product_id, v_item.expected_quantity, v_item.counted_quantity
    );

    -- register_stock_movement genera stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_new_id,
      p_unit_cost := 0,
      p_reason := 'Duplicación de ajuste'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
    -- El trigger auto_kardex_on_stock_movement genera la kardex con
    -- movement_type='adjustment'
  END LOOP;

  -- 5. Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('ADJUSTMENT_DUPLICATED_V2', 'inventory_adjustments', v_new_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('original_id', p_original_id, 'v2_reverse', true));

  RETURN jsonb_build_object('status','success','new_adjustment_id',v_new_id);
END;
$function$


-- ===== oid=141788 public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_discount_type text DEFAULT 'fixed'::text, p_discount_value numeric DEFAULT 0, p_applied_taxes jsonb DEFAULT '[]'::jsonb, p_tax_amount numeric DEFAULT 0, p_total_amount numeric DEFAULT 0, p_subtotal numeric DEFAULT 0, p_cash_amount numeric DEFAULT 0, p_transfer_amount numeric DEFAULT 0, p_zelle_amount numeric DEFAULT 0, p_sale_currency text DEFAULT 'CUP'::text, p_sale_exchange_rate numeric DEFAULT 1, p_customer_id uuid DEFAULT NULL::uuid, p_customer_name text DEFAULT NULL::text, p_supervisor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx_id uuid := gen_random_uuid();
  v_eff timestamp with time zone := COALESCE(p_operation_date, NOW());
  v_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_item jsonb;
  v_pid uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_variant_id uuid;
  v_conversion_factor integer := 1;
  v_units numeric;
  v_stock numeric;
  v_existing uuid;
  v_effective_method text := p_payment_method;
  v_product_price numeric;
  v_calculated_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_taxable_base numeric := 0;
  v_calculated_tax numeric := 0;
  v_calculated_total numeric := 0;
  v_tax jsonb;
  v_tax_value numeric;
  v_effective_discount_pct numeric := 0;
  v_cash_amt numeric := p_cash_amount;
  v_transfer_amt numeric := p_transfer_amount;
  v_zelle_amt numeric := p_zelle_amount;
  v_pt_id uuid;
  v_zelle_original_amount numeric;
  v_sum_payments numeric;
  v_wac_prev numeric;
BEGIN
  -- 1. Advisory lock por store (serializa ventas concurrentes)
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));

  -- 2. Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
      WHERE idempotency_key = p_idempotency_key AND store_id = p_store_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status','idempotent','transaction_id',v_existing);
    END IF;
  END IF;

  -- 3. Auth
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 4. Operation date validation
  IF p_operation_date IS NOT NULL THEN
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);
  END IF;

  -- 5. Auto-promote to mixed
  IF p_cash_amount > 0 AND p_transfer_amount > 0 AND p_payment_method <> 'mixed' THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_zelle_amount > 0 AND p_payment_method <> 'mixed' AND (p_cash_amount > 0 OR p_transfer_amount > 0) THEN
    v_effective_method := 'mixed';
  END IF;
  IF p_payment_method = 'zelle' AND p_zelle_amount = 0 AND p_cash_amount = 0 AND p_transfer_amount = 0 THEN
    v_zelle_amt := p_total_amount;
  END IF;

  -- 6. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    SELECT stock_current, cost_average INTO v_stock, v_wac_prev
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;

    IF v_stock IS NULL THEN
      -- fallback legacy: producto sin tienda (servicios globales)
      SELECT stock_current, cost_average INTO v_stock, v_wac_prev
        FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    v_stock := COALESCE(v_stock, 0);

    -- DF-02: costo SIEMPRE del servidor (WAC_prev bajo lock)
    IF v_wac_prev IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;
    IF v_wac_prev = 0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
                     WHERE store_id = p_store_id AND product_id = v_pid AND scope = 'sale') THEN
        RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_pid;
      END IF;
    END IF;

    -- Saltar validación de stock para servicios
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      IF v_stock < v_units THEN
        RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: product %, stock %, requested %', v_pid, v_stock, v_units;
      END IF;
    END IF;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- DF-02: claves cost_at_sale/cost del request IGNORADAS (no error)
    v_cost := v_wac_prev;

    v_calculated_subtotal := v_calculated_subtotal + (v_price * v_qty);
  END LOOP;

  -- 7. Recalcular descuento
  IF p_discount_type = 'percentage' THEN
    v_discount_amount := LEAST((v_calculated_subtotal * p_discount_value) / 100, v_calculated_subtotal);
  ELSE
    v_discount_amount := LEAST(p_discount_value, v_calculated_subtotal);
  END IF;

  -- 8. Recalcular tax
  v_taxable_base := GREATEST(0, v_calculated_subtotal - v_discount_amount);
  v_calculated_tax := 0;
  FOR v_tax IN SELECT * FROM jsonb_array_elements(p_applied_taxes) LOOP
    IF v_tax->>'type' = 'percentage' THEN
      v_tax_value := (v_taxable_base * COALESCE((v_tax->>'value')::numeric, 0)) / 100;
      IF v_tax ? 'min_exempt' THEN
        v_tax_value := GREATEST(0, v_taxable_base - COALESCE((v_tax->>'min_exempt')::numeric, 0)) * COALESCE((v_tax->>'value')::numeric, 0) / 100;
      END IF;
    ELSE
      v_tax_value := COALESCE((v_tax->>'value')::numeric, 0);
    END IF;
    v_calculated_tax := v_calculated_tax + v_tax_value;
  END LOOP;

  -- 9. Calcular total
  v_calculated_total := v_calculated_subtotal - v_discount_amount + v_calculated_tax;

  -- 10. Validar total vs cliente (tolerancia 0.01 CUP)
  IF abs(v_calculated_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'ERR_TOTAL_MISMATCH: calculated=%, client=%', v_calculated_total, p_total_amount;
  END IF;

  -- 11. Validar supervisor auth (si descuento >= 15%)
  IF v_calculated_subtotal > 0 THEN
    v_effective_discount_pct := (v_discount_amount / v_calculated_subtotal) * 100;
  END IF;

  IF v_effective_discount_pct >= 15 THEN
    IF p_supervisor_user_id IS NULL THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_REQUIRED: discount_pct=%', v_effective_discount_pct;
    END IF;
    IF NOT public.has_store_role_as(p_supervisor_user_id, p_store_id, ARRAY['admin', 'manager']) THEN
      RAISE EXCEPTION 'ERR_SUPERVISOR_UNAUTHORIZED';
    END IF;
  END IF;

  -- 12. Validar/setear payment split
  IF v_effective_method = 'mixed' THEN
    IF abs(v_cash_amt + v_transfer_amt + v_zelle_amt - v_calculated_total) > 1.00 THEN
      RAISE EXCEPTION 'ERR_PAYMENT_MISMATCH: cash=%, transfer=%, zelle=%, total=%',
        v_cash_amt, v_transfer_amt, v_zelle_amt, v_calculated_total;
    END IF;
  ELSIF v_effective_method = 'cash' THEN
    v_cash_amt := v_calculated_total;
  ELSIF v_effective_method = 'transfer' THEN
    v_transfer_amt := v_calculated_total;
  ELSIF v_effective_method = 'zelle' THEN
    v_zelle_amt := v_calculated_total;
  END IF;

  -- 13. INSERT transactions
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, status, payment_method,
    discount_type, discount_value, subtotal, tax_amount, applied_taxes,
    sale_currency, sale_exchange_rate, completed_at, idempotency_key, created_at,
    cash_amount, transfer_amount, zelle_amount,
    customer_id, customer_name
  ) VALUES (
    v_tx_id, p_store_id, p_seller_id, v_calculated_total, 'completed',
    v_effective_method::public.payment_method_enum,
    p_discount_type::public.discount_type_enum, v_discount_amount,
    v_calculated_subtotal, v_calculated_tax, p_applied_taxes,
    p_sale_currency, p_sale_exchange_rate, v_eff, p_idempotency_key, v_eff,
    v_cash_amt, v_transfer_amt, v_zelle_amt,
    p_customer_id, p_customer_name
  );

  -- 14. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id') LOOP
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;

    v_conversion_factor := 1;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;
    v_units := v_qty * v_conversion_factor;

    v_price := NULLIF(v_item->>'price_at_sale', '')::numeric;
    IF v_price IS NULL THEN
      v_price := NULLIF(v_item->>'price', '')::numeric;
    END IF;
    IF v_price IS NULL THEN
      SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
      v_price := COALESCE(v_product_price, 0);
    END IF;

    -- DF-02: re-lectura bajo FOR UPDATE (misma TX; sin ventana TOCTOU)
    SELECT cost_average INTO v_cost
      FROM public.products
      WHERE id = v_pid AND store_id = p_store_id
      FOR UPDATE;
    IF v_cost IS NULL THEN
      SELECT cost_average INTO v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
    END IF;
    IF v_cost IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
    END IF;

    -- Stock movement (solo si NO es servicio)
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
      PERFORM public.register_stock_movement(
        p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_uid,
        p_quantity := -v_units, p_movement_type := 'sale', p_reason := 'Venta POS v2',
        p_sale_id := v_tx_id, p_unit_cost := v_cost, p_notes := NULL,
        p_operation_date := v_eff, p_skip_access_check := TRUE
      );
    END IF;

    INSERT INTO public.transaction_items (
      transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
      cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
      cash_currency, transfer_currency, zelle_currency,
      cash_discount_type, cash_discount_value, cash_discount_currency,
      transfer_discount_type, transfer_discount_value, transfer_discount_currency,
      zelle_discount_type, zelle_discount_value, zelle_discount_currency,
      discount_type, discount_value, price_currency, price_at_sale_cup
    ) VALUES (
      v_tx_id, v_pid, v_variant_id, v_qty, v_price, v_cost, v_eff,
      COALESCE(NULLIF(v_item->>'cash_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'transfer_paid','')::numeric, NULL),
      COALESCE(NULLIF(v_item->>'zelle_paid','')::numeric, NULL),
      v_item->>'currency',
      COALESCE(NULLIF(v_item->>'exchange_rate','')::numeric, NULL),
      v_item->>'cash_currency',
      v_item->>'transfer_currency',
      v_item->>'zelle_currency',
      v_item->>'cash_discount_type',
      COALESCE(NULLIF(v_item->>'cash_discount_value','')::numeric, NULL),
      v_item->>'cash_discount_currency',
      v_item->>'transfer_discount_type',
      COALESCE(NULLIF(v_item->>'transfer_discount_value','')::numeric, NULL),
      v_item->>'transfer_discount_currency',
      v_item->>'zelle_discount_type',
      COALESCE(NULLIF(v_item->>'zelle_discount_value','')::numeric, NULL),
      v_item->>'zelle_discount_currency',
      p_discount_type::public.discount_type_enum,
      v_discount_amount,
      p_sale_currency,
      v_price * p_sale_exchange_rate
    );
  END LOOP;

  -- 15. payment_transactions (fuente autoritativa de pagos)
  IF v_cash_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_cash_amt, 'cash', 'CUP', 1.0,
      v_eff, v_uid, 'pay-cash-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_transfer_amt > 0 THEN
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_transfer_amt, 'transfer', 'CUP', 1.0,
      v_eff, v_uid, 'pay-transfer-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  IF v_zelle_amt > 0 THEN
    IF p_sale_currency = 'CUP' OR p_sale_exchange_rate IS NULL OR p_sale_exchange_rate <= 1 THEN
      RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and p_sale_exchange_rate > 1. Got: currency=%, rate=%',
        p_sale_currency, p_sale_exchange_rate USING ERRCODE = 'PT009';
    END IF;
    IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
      RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
        p_sale_currency USING ERRCODE = 'PT004';
    END IF;
    v_zelle_original_amount := v_zelle_amt / p_sale_exchange_rate;
    INSERT INTO public.payment_transactions (
      store_id, ref_type, ref_id, transaction_id,
      amount, payment_method, currency, exchange_rate,
      payment_date, paid_by, idempotency_key
    ) VALUES (
      p_store_id, 'sale', v_tx_id, v_tx_id,
      v_zelle_original_amount, 'zelle', p_sale_currency, p_sale_exchange_rate,
      v_eff, v_uid, 'pay-zelle-' || v_tx_id::text
    ) RETURNING id INTO v_pt_id;
  END IF;

  -- 16. Validación post-INSERT: I1b (POS exige pago completo)
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
  FROM public.payment_transactions WHERE transaction_id = v_tx_id;

  IF ABS(v_sum_payments - v_calculated_total) > 0.01 THEN
    RAISE EXCEPTION 'ERR_PAYMENT_INVARIANT_VIOLATED: SUM(amount_cup)=% != total_amount=% (POS requires full payment)',
      v_sum_payments, v_calculated_total USING ERRCODE = 'PT011';
  END IF;

  -- 17. Audit log completo
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CREATE_SALE_V2', 'transactions', v_tx_id, p_store_id, v_uid,
    jsonb_build_object(
      'total_amount', v_calculated_total,
      'subtotal', v_calculated_subtotal,
      'discount_amount', v_discount_amount,
      'discount_pct', v_effective_discount_pct,
      'tax_amount', v_calculated_tax,
      'payment_method', v_effective_method,
      'cash_amount', v_cash_amt, 'transfer_amount', v_transfer_amt, 'zelle_amount', v_zelle_amt,
      'customer_id', p_customer_id,
      'supervisor_id', p_supervisor_user_id,
      'item_count', jsonb_array_length(p_items),
      'v2_checkout', true,
      'payment_transactions_created', true,
      'cogs_authority', 'server_side_wac_df02'
    ));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', v_tx_id,
    'calculated_total', v_calculated_total,
    'calculated_subtotal', v_calculated_subtotal,
    'calculated_tax', v_calculated_tax,
    'discount_amount', v_discount_amount
  );
END $function$


-- ===== oid=142308 public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN public.create_vale_salida(p_store_id, p_items, p_production_order_id, p_notes, p_idempotency_key, NULL);
END $function$


-- ===== oid=142325 public.create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid) =====
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


-- ===== oid=20168 public.fn_update_inventory_on_movement() =====
CREATE OR REPLACE FUNCTION public.fn_update_inventory_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE v_new_quantity numeric;
BEGIN
    INSERT INTO public.inventory (store_id, product_id, quantity) VALUES (NEW.store_id, NEW.product_id, NEW.quantity_change)
    ON CONFLICT (store_id, product_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()
    RETURNING quantity INTO v_new_quantity;
    IF v_new_quantity < 0 THEN RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK'; END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=26677 public.fn_sync_inventory_on_movement() =====
CREATE OR REPLACE FUNCTION public.fn_sync_inventory_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_qty numeric;
  v_exists boolean;
  v_product_store_id uuid;
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- FIX H-01: Validar que el producto existe y su store_id coincide
  SELECT store_id INTO v_product_store_id FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: Producto % no existe', NEW.product_id;
  END IF;
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF v_product_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: products.store_id es NULL para el producto %', NEW.product_id;
  END IF;
  IF NEW.store_id IS DISTINCT FROM v_product_store_id THEN
    RAISE EXCEPTION 'ERR_STORE_MISMATCH: movement store_id % no coincide con product store_id % para el producto %',
      NEW.store_id, v_product_store_id, NEW.product_id;
  END IF;

  -- Check if inventory record exists for this product+store
  SELECT EXISTS(
    SELECT 1 FROM public.inventory
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
  ) INTO v_exists;

  IF NOT v_exists THEN
    -- inventory no existe → base = 0
    v_new_qty := NEW.quantity_change;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: No hay inventario para el producto % en tienda %. No se puede registrar una salida.', NEW.product_id, NEW.store_id;
    END IF;

    INSERT INTO public.inventory (store_id, product_id, quantity, version, updated_at)
    VALUES (NEW.store_id, NEW.product_id, v_new_qty, 1, now())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.inventory
    SET quantity = public.inventory.quantity + NEW.quantity_change,
        version = public.inventory.version + 1,
        updated_at = now()
    WHERE store_id = NEW.store_id AND product_id = NEW.product_id
    RETURNING quantity INTO v_new_qty;

    IF v_new_qty < 0 THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: El stock no puede ser negativo para el producto % (Resultado: %)', NEW.product_id, v_new_qty;
    END IF;
  END IF;

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$


-- ===== oid=26950 public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text) =====
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


-- ===== oid=26951 public.fn_process_sale(p_items jsonb, p_cashier_id uuid, p_payment_method text) =====
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


-- ===== oid=26952 public.fn_void_receipt(p_receipt_id uuid, p_user_id uuid) =====
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


-- ===== oid=130964 public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text) =====
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


-- ===== oid=130968 public.fn_maintain_product_completeness() =====
CREATE OR REPLACE FUNCTION public.fn_maintain_product_completeness()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Definimos que un producto está completo si tiene un precio definido y mayor a 0
  -- Se pueden añadir más condiciones aquí en el futuro (ej. descripción, imagen)
  IF NEW.price > 0 THEN
    NEW.is_complete := true;
  ELSE
    NEW.is_complete := false;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=131041 public.fn_log_system_health(p_payload jsonb) =====
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


-- ===== oid=134483 public.float4_dist(real, real) =====
CREATE OR REPLACE FUNCTION public.float4_dist(real, real)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$float4_dist$function$


-- ===== oid=134485 public.float8_dist(double precision, double precision) =====
CREATE OR REPLACE FUNCTION public.float8_dist(double precision, double precision)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$float8_dist$function$


-- ===== oid=134805 public.gbt_cash_consistent(internal, money, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_consistent(internal, money, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_consistent$function$


-- ===== oid=134807 public.gbt_cash_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_compress$function$


-- ===== oid=134855 public.gbt_bpchar_consistent(internal, character, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bpchar_consistent(internal, character, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bpchar_consistent$function$


-- ===== oid=134857 public.gbt_bpchar_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bpchar_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bpchar_compress$function$


-- ===== oid=134894 public.gbt_bytea_consistent(internal, bytea, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_consistent(internal, bytea, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_consistent$function$


-- ===== oid=134895 public.gbt_bytea_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_compress$function$


-- ===== oid=134896 public.gbt_bytea_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_penalty$function$


-- ===== oid=134897 public.gbt_bytea_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_picksplit$function$


-- ===== oid=134898 public.gbt_bytea_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_union$function$


-- ===== oid=134899 public.gbt_bytea_same(gbtreekey_var, gbtreekey_var, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bytea_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_same$function$


-- ===== oid=134938 public.gbt_bit_consistent(internal, bit, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_consistent(internal, bit, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_consistent$function$


-- ===== oid=134939 public.gbt_bit_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_compress$function$


-- ===== oid=134940 public.gbt_bit_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_penalty$function$


-- ===== oid=134941 public.gbt_bit_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_picksplit$function$


-- ===== oid=134942 public.gbt_bit_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_union$function$


-- ===== oid=134943 public.gbt_bit_same(gbtreekey_var, gbtreekey_var, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bit_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_same$function$


-- ===== oid=135085 public.gbt_bool_consistent(internal, boolean, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_consistent(internal, boolean, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_consistent$function$


-- ===== oid=135086 public.gbt_bool_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_compress$function$


-- ===== oid=135087 public.gbt_bool_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_fetch$function$


-- ===== oid=135088 public.gbt_bool_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_penalty$function$


-- ===== oid=135089 public.gbt_bool_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_picksplit$function$


-- ===== oid=135090 public.gbt_bool_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_union(internal, internal)
 RETURNS gbtreekey2
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_union$function$


-- ===== oid=135091 public.gbt_bool_same(gbtreekey2, gbtreekey2, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_bool_same(gbtreekey2, gbtreekey2, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_same$function$


-- ===== oid=136259 public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer) =====
CREATE OR REPLACE FUNCTION public.ensure_fiscal_period(p_store_id uuid, p_year integer, p_month integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.fiscal_closings
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    IF v_id IS NULL THEN
        INSERT INTO public.fiscal_closings (store_id, period_year, period_month, status)
        VALUES (p_store_id, p_year, p_month, 'open')
        ON CONFLICT (store_id, period_year, period_month) DO NOTHING
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$function$


-- ===== oid=136674 public.fn_validate_document_transition() =====
CREATE OR REPLACE FUNCTION public.fn_validate_document_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_table_name TEXT := TG_ARGV[0];
  v_old_status TEXT;
  v_new_status TEXT;
  v_valid_transitions JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    v_new_status := NEW.status;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_status := NULL;
    v_new_status := NEW.status;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_old_status IS NOT NULL AND v_old_status = v_new_status THEN
    RETURN NEW;
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
    'devolutions', jsonb_build_object(
      'pending',   '["completed","voided"]'::jsonb,
      'completed', '["reversed","voided"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    ),
    'receipts', jsonb_build_object(
      'pending',   '["confirmed","active","voided"]'::jsonb,
      'confirmed', '["active","reversed","voided"]'::jsonb,
      'active',    '["reversed","voided"]'::jsonb,
      'partial',   '["active","confirmed","reversed","voided"]'::jsonb,
      'reversed',  '[]'::jsonb,
      'voided',    '[]'::jsonb
    ),
    'transfers', jsonb_build_object(
      'PENDIENTE',  '["CONFIRMADA","CANCELADA"]'::jsonb,
      'CONFIRMADA', '["REVERSADA"]'::jsonb,
      'CANCELADA',  '[]'::jsonb,
      'REVERSADA',  '[]'::jsonb
    ),
    'inventory_adjustments', jsonb_build_object(
      'pending',   '["confirmed","reversed","voided"]'::jsonb,
      'confirmed', '["reversed"]'::jsonb,
      'voided',    '[]'::jsonb,
      'reversed',  '[]'::jsonb
    )
  );

  IF v_old_status IS NULL THEN
    RETURN NEW;
  END IF;

  IF (v_valid_transitions->v_table_name) IS NULL
     OR NOT COALESCE((v_valid_transitions->v_table_name) ? v_old_status, false)
     OR NOT COALESCE((v_valid_transitions->v_table_name->v_old_status) ? v_new_status, false) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % no puede pasar de % a %',
      v_table_name, v_old_status, v_new_status;
  END IF;

  RETURN NEW;
END;
$function$


-- ===== oid=136728 public.fn_sync_profile_role() =====
CREATE OR REPLACE FUNCTION public.fn_sync_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_role_enum text;
BEGIN
  -- Si role_id cambió, derivar role desde role_id
  IF NEW.role_id IS NOT NULL AND NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    SELECT public.role_name_to_enum(r.name) INTO v_role_enum
    FROM public.roles r WHERE r.id = NEW.role_id;
    NEW.role := v_role_enum::user_role;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=136799 public.fn_generate_physical_count_number() =====
CREATE OR REPLACE FUNCTION public.fn_generate_physical_count_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  IF NEW.count_number IS NULL THEN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.physical_counts
    WHERE store_id = NEW.store_id
      AND created_at >= date_trunc('year', NOW());
    NEW.count_number := 'PC-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(v_count::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=142220 public.enforce_ledger_append_only() =====
CREATE OR REPLACE FUNCTION public.enforce_ledger_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_LEDGER_APPEND_ONLY: transaction_recovery_ledger is append-only.' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END; $function$


-- ===== oid=142600 public.ensure_product_barcode() =====
CREATE OR REPLACE FUNCTION public.ensure_product_barcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    BEGIN
      -- If barcode is NULL or empty, generate an internal one
      IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
        NEW.barcode := public.generate_internal_barcode();
        NEW.barcode_type := 'INTERNAL';
      ELSE
        -- If barcode was provided, check if it looks like an internal one
        IF NEW.barcode LIKE 'INT%' THEN
          NEW.barcode_type := 'INTERNAL';
        ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
          -- User provided a commercial barcode without specifying type
          -- Default to EAN13 for commercial barcodes
          NEW.barcode_type := 'EAN13';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$


-- ===== oid=142906 public.fn_recalc_wac(p_store_id uuid, p_product_id uuid, p_event text, p_qty_in numeric, p_uc_in numeric, p_source_ref jsonb) =====
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


-- ===== oid=134507 public.gbt_decompress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_decompress$function$


-- ===== oid=134610 public.gbt_float4_consistent(internal, real, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_consistent(internal, real, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_consistent$function$


-- ===== oid=134611 public.gbt_float4_distance(internal, real, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_distance(internal, real, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_distance$function$


-- ===== oid=134612 public.gbt_float4_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_compress$function$


-- ===== oid=134613 public.gbt_float4_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_fetch$function$


-- ===== oid=134614 public.gbt_float4_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_penalty$function$


-- ===== oid=134615 public.gbt_float4_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_picksplit$function$


-- ===== oid=134616 public.gbt_float4_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_union$function$


-- ===== oid=134617 public.gbt_float4_same(gbtreekey8, gbtreekey8, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float4_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_same$function$


-- ===== oid=134636 public.gbt_float8_consistent(internal, double precision, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_consistent(internal, double precision, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_consistent$function$


-- ===== oid=134637 public.gbt_float8_distance(internal, double precision, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_distance(internal, double precision, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_distance$function$


-- ===== oid=134638 public.gbt_float8_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_compress$function$


-- ===== oid=134639 public.gbt_float8_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_fetch$function$


-- ===== oid=134640 public.gbt_float8_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_penalty$function$


-- ===== oid=134641 public.gbt_float8_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_picksplit$function$


-- ===== oid=134642 public.gbt_float8_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_union$function$


-- ===== oid=134643 public.gbt_float8_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_float8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_same$function$


-- ===== oid=134752 public.gbt_date_consistent(internal, date, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_consistent(internal, date, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_consistent$function$


-- ===== oid=134753 public.gbt_date_distance(internal, date, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_distance(internal, date, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_distance$function$


-- ===== oid=134754 public.gbt_date_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_compress$function$


-- ===== oid=134755 public.gbt_date_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_fetch$function$


-- ===== oid=134756 public.gbt_date_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_penalty$function$


-- ===== oid=134757 public.gbt_date_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_picksplit$function$


-- ===== oid=134758 public.gbt_date_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_union$function$


-- ===== oid=134759 public.gbt_date_same(gbtreekey8, gbtreekey8, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_date_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_same$function$


-- ===== oid=134806 public.gbt_cash_distance(internal, money, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_distance(internal, money, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_distance$function$


-- ===== oid=134808 public.gbt_cash_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_fetch$function$


-- ===== oid=134809 public.gbt_cash_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_penalty$function$


-- ===== oid=134810 public.gbt_cash_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_picksplit$function$


-- ===== oid=134811 public.gbt_cash_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_union$function$


-- ===== oid=134812 public.gbt_cash_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_cash_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_same$function$


-- ===== oid=134976 public.gbt_inet_consistent(internal, inet, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_consistent(internal, inet, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_consistent$function$


-- ===== oid=134977 public.gbt_inet_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_compress$function$


-- ===== oid=135058 public.gbt_enum_consistent(internal, anyenum, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_consistent(internal, anyenum, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_consistent$function$


-- ===== oid=135059 public.gbt_enum_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_compress$function$


-- ===== oid=135060 public.gbt_enum_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_fetch$function$


-- ===== oid=135061 public.gbt_enum_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_penalty$function$


-- ===== oid=135062 public.gbt_enum_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_picksplit$function$


-- ===== oid=135063 public.gbt_enum_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_union$function$


-- ===== oid=135064 public.gbt_enum_same(gbtreekey8, gbtreekey8, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_enum_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_same$function$


-- ===== oid=134532 public.gbt_int2_consistent(internal, smallint, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_consistent(internal, smallint, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_consistent$function$


-- ===== oid=134533 public.gbt_int2_distance(internal, smallint, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_distance(internal, smallint, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_distance$function$


-- ===== oid=134534 public.gbt_int2_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_compress$function$


-- ===== oid=134535 public.gbt_int2_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_fetch$function$


-- ===== oid=134536 public.gbt_int2_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_penalty$function$


-- ===== oid=134537 public.gbt_int2_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_picksplit$function$


-- ===== oid=134538 public.gbt_int2_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_union(internal, internal)
 RETURNS gbtreekey4
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_union$function$


-- ===== oid=134539 public.gbt_int2_same(gbtreekey4, gbtreekey4, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int2_same(gbtreekey4, gbtreekey4, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_same$function$


-- ===== oid=134558 public.gbt_int4_consistent(internal, integer, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_consistent(internal, integer, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_consistent$function$


-- ===== oid=134559 public.gbt_int4_distance(internal, integer, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_distance(internal, integer, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_distance$function$


-- ===== oid=134560 public.gbt_int4_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_compress$function$


-- ===== oid=134561 public.gbt_int4_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_fetch$function$


-- ===== oid=134562 public.gbt_int4_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_penalty$function$


-- ===== oid=134563 public.gbt_int4_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_picksplit$function$


-- ===== oid=134564 public.gbt_int4_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_union$function$


-- ===== oid=134565 public.gbt_int4_same(gbtreekey8, gbtreekey8, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int4_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_same$function$


-- ===== oid=134584 public.gbt_int8_consistent(internal, bigint, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_consistent(internal, bigint, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_consistent$function$


-- ===== oid=134585 public.gbt_int8_distance(internal, bigint, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_distance(internal, bigint, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_distance$function$


-- ===== oid=134586 public.gbt_int8_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_compress$function$


-- ===== oid=134587 public.gbt_int8_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_fetch$function$


-- ===== oid=134588 public.gbt_int8_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_penalty$function$


-- ===== oid=134589 public.gbt_int8_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_picksplit$function$


-- ===== oid=134590 public.gbt_int8_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_union$function$


-- ===== oid=134591 public.gbt_int8_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_int8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_same$function$


-- ===== oid=134778 public.gbt_intv_consistent(internal, interval, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_consistent(internal, interval, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_consistent$function$


-- ===== oid=134779 public.gbt_intv_distance(internal, interval, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_distance(internal, interval, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_distance$function$


-- ===== oid=134780 public.gbt_intv_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_compress$function$


-- ===== oid=134781 public.gbt_intv_decompress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_decompress$function$


-- ===== oid=134782 public.gbt_intv_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_fetch$function$


-- ===== oid=134783 public.gbt_intv_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_penalty$function$


-- ===== oid=134784 public.gbt_intv_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_picksplit$function$


-- ===== oid=134785 public.gbt_intv_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_union(internal, internal)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_union$function$


-- ===== oid=134786 public.gbt_intv_same(gbtreekey32, gbtreekey32, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_intv_same(gbtreekey32, gbtreekey32, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_same$function$


-- ===== oid=134978 public.gbt_inet_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_penalty$function$


-- ===== oid=134979 public.gbt_inet_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_picksplit$function$


-- ===== oid=134980 public.gbt_inet_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_union$function$


-- ===== oid=134981 public.gbt_inet_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_inet_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_same$function$


-- ===== oid=135035 public.gbt_macad8_consistent(internal, macaddr8, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_consistent(internal, macaddr8, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_consistent$function$


-- ===== oid=135036 public.gbt_macad8_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_compress$function$


-- ===== oid=135037 public.gbt_macad8_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_fetch$function$


-- ===== oid=134503 public.gbt_oid_consistent(internal, oid, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_consistent(internal, oid, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_consistent$function$


-- ===== oid=134504 public.gbt_oid_distance(internal, oid, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_distance(internal, oid, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_distance$function$


-- ===== oid=134505 public.gbt_oid_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_fetch$function$


-- ===== oid=134506 public.gbt_oid_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_compress$function$


-- ===== oid=134510 public.gbt_oid_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_penalty$function$


-- ===== oid=134511 public.gbt_oid_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_picksplit$function$


-- ===== oid=134512 public.gbt_oid_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_union$function$


-- ===== oid=134513 public.gbt_oid_same(gbtreekey8, gbtreekey8, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_oid_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_same$function$


-- ===== oid=134709 public.gbt_time_consistent(internal, time without time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_consistent(internal, time without time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_consistent$function$


-- ===== oid=134710 public.gbt_time_distance(internal, time without time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_distance(internal, time without time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_distance$function$


-- ===== oid=134712 public.gbt_time_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_compress$function$


-- ===== oid=134713 public.gbt_timetz_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_timetz_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_timetz_compress$function$


-- ===== oid=134714 public.gbt_time_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_fetch$function$


-- ===== oid=134715 public.gbt_time_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_penalty$function$


-- ===== oid=134716 public.gbt_time_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_picksplit$function$


-- ===== oid=134717 public.gbt_time_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_union$function$


-- ===== oid=134718 public.gbt_time_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_time_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_same$function$


-- ===== oid=134831 public.gbt_macad_consistent(internal, macaddr, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_consistent(internal, macaddr, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_consistent$function$


-- ===== oid=134832 public.gbt_macad_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_compress$function$


-- ===== oid=134833 public.gbt_macad_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_fetch$function$


-- ===== oid=134834 public.gbt_macad_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_penalty$function$


-- ===== oid=134835 public.gbt_macad_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_picksplit$function$


-- ===== oid=134836 public.gbt_macad_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_union$function$


-- ===== oid=134837 public.gbt_macad_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_same$function$


-- ===== oid=134854 public.gbt_text_consistent(internal, text, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_consistent$function$


-- ===== oid=134856 public.gbt_text_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_compress$function$


-- ===== oid=134858 public.gbt_text_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_penalty$function$


-- ===== oid=134859 public.gbt_text_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_picksplit$function$


-- ===== oid=134860 public.gbt_text_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_union$function$


-- ===== oid=134861 public.gbt_text_same(gbtreekey_var, gbtreekey_var, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_text_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_same$function$


-- ===== oid=134916 public.gbt_numeric_consistent(internal, numeric, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_consistent(internal, numeric, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_consistent$function$


-- ===== oid=134917 public.gbt_numeric_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_compress$function$


-- ===== oid=134918 public.gbt_numeric_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_penalty$function$


-- ===== oid=134919 public.gbt_numeric_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_picksplit$function$


-- ===== oid=134920 public.gbt_numeric_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_union$function$


-- ===== oid=134921 public.gbt_numeric_same(gbtreekey_var, gbtreekey_var, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_numeric_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_same$function$


-- ===== oid=135038 public.gbt_macad8_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_penalty$function$


-- ===== oid=135039 public.gbt_macad8_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_picksplit$function$


-- ===== oid=135040 public.gbt_macad8_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_union$function$


-- ===== oid=135041 public.gbt_macad8_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_macad8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_same$function$


-- ===== oid=20172 public.generate_inventory_snapshot(p_store_id uuid) =====
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


-- ===== oid=131405 public.get_ai_api_key(p_user_id uuid, p_provider text) =====
CREATE OR REPLACE FUNCTION public.get_ai_api_key(p_user_id uuid, p_provider text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vault_key text;
  v_decrypted_key text;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id != auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT value INTO v_vault_key FROM public.system_config WHERE key = 'vault_key';
  SELECT extensions.pgp_sym_decrypt(api_key_encrypted, v_vault_key) INTO v_decrypted_key
  FROM public.ai_api_keys WHERE (user_id = p_user_id OR (user_id IS NULL AND p_user_id IS NULL)) AND provider = p_provider AND is_active = true LIMIT 1;
  RETURN v_decrypted_key;
END;
$function$


-- ===== oid=134328 public.generate_production_order_number() =====
CREATE OR REPLACE FUNCTION public.generate_production_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year INT := EXTRACT(YEAR FROM now());
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'OP-' || v_year || '-' || LPAD(nextval('production_order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=134460 public.gbtreekey4_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey4_in(cstring)
 RETURNS gbtreekey4
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=134461 public.gbtreekey4_out(gbtreekey4) =====
CREATE OR REPLACE FUNCTION public.gbtreekey4_out(gbtreekey4)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=134464 public.gbtreekey8_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey8_in(cstring)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=134465 public.gbtreekey8_out(gbtreekey8) =====
CREATE OR REPLACE FUNCTION public.gbtreekey8_out(gbtreekey8)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=134468 public.gbtreekey16_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey16_in(cstring)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=134469 public.gbtreekey16_out(gbtreekey16) =====
CREATE OR REPLACE FUNCTION public.gbtreekey16_out(gbtreekey16)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=134472 public.gbtreekey32_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey32_in(cstring)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=134473 public.gbtreekey32_out(gbtreekey32) =====
CREATE OR REPLACE FUNCTION public.gbtreekey32_out(gbtreekey32)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=134476 public.gbtreekey_var_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey_var_in(cstring)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=134477 public.gbtreekey_var_out(gbtreekey_var) =====
CREATE OR REPLACE FUNCTION public.gbtreekey_var_out(gbtreekey_var)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=134508 public.gbt_var_decompress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_var_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_var_decompress$function$


-- ===== oid=134509 public.gbt_var_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_var_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_var_fetch$function$


-- ===== oid=134662 public.gbt_ts_consistent(internal, timestamp without time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_consistent(internal, timestamp without time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_consistent$function$


-- ===== oid=134663 public.gbt_ts_distance(internal, timestamp without time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_distance(internal, timestamp without time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_distance$function$


-- ===== oid=134664 public.gbt_tstz_consistent(internal, timestamp with time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_tstz_consistent(internal, timestamp with time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_consistent$function$


-- ===== oid=134665 public.gbt_tstz_distance(internal, timestamp with time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_tstz_distance(internal, timestamp with time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_distance$function$


-- ===== oid=134666 public.gbt_ts_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_compress$function$


-- ===== oid=134667 public.gbt_tstz_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_tstz_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_compress$function$


-- ===== oid=134668 public.gbt_ts_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_fetch$function$


-- ===== oid=134669 public.gbt_ts_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_penalty$function$


-- ===== oid=134670 public.gbt_ts_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_picksplit$function$


-- ===== oid=134671 public.gbt_ts_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_union$function$


-- ===== oid=134672 public.gbt_ts_same(gbtreekey16, gbtreekey16, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_ts_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_same$function$


-- ===== oid=134711 public.gbt_timetz_consistent(internal, time with time zone, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_timetz_consistent(internal, time with time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_timetz_consistent$function$


-- ===== oid=135012 public.gbt_uuid_consistent(internal, uuid, smallint, oid, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_consistent(internal, uuid, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_consistent$function$


-- ===== oid=135013 public.gbt_uuid_fetch(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_fetch$function$


-- ===== oid=135014 public.gbt_uuid_compress(internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_compress$function$


-- ===== oid=135015 public.gbt_uuid_penalty(internal, internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_penalty$function$


-- ===== oid=135016 public.gbt_uuid_picksplit(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_picksplit$function$


-- ===== oid=135017 public.gbt_uuid_union(internal, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_union(internal, internal)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_union$function$


-- ===== oid=135018 public.gbt_uuid_same(gbtreekey32, gbtreekey32, internal) =====
CREATE OR REPLACE FUNCTION public.gbt_uuid_same(gbtreekey32, gbtreekey32, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_same$function$


-- ===== oid=135082 public.gbtreekey2_in(cstring) =====
CREATE OR REPLACE FUNCTION public.gbtreekey2_in(cstring)
 RETURNS gbtreekey2
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$


-- ===== oid=135083 public.gbtreekey2_out(gbtreekey2) =====
CREATE OR REPLACE FUNCTION public.gbtreekey2_out(gbtreekey2)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$


-- ===== oid=137574 public.generate_confirmation_token(p_session_id uuid) =====
CREATE OR REPLACE FUNCTION public.generate_confirmation_token(p_session_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
  v_store_id UUID;
  v_preview_passed BOOLEAN;
BEGIN
  -- Verify session exists, is in DRY_RUN status, and preview passed
  SELECT store_id, preview_passed INTO v_store_id, v_preview_passed
  FROM public.restore_sessions
  WHERE id = p_session_id AND status = 'DRY_RUN';

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'ERR_SESSION_NOT_FOUND: Sesión % no existe o no está en estado DRY_RUN', p_session_id;
  END IF;

  IF NOT v_preview_passed THEN
    RAISE EXCEPTION 'ERR_PREVIEW_NOT_PASSED: Preview falló. Corrige los errores antes de generar el token.';
  END IF;

  -- Generate random token (using gen_random_uuid for cryptographic randomness)
  v_token := 'rst_' || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.restore_sessions
  SET confirmation_token = v_token
  WHERE id = p_session_id;

  RETURN v_token;
END;
$function$


-- ===== oid=137812 public.generate_bulk_confirmation_token(p_store_ids uuid[], p_action text, p_user_id uuid) =====
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


-- ===== oid=137813 public.generate_bulk_override_token(p_confirmation_token text, p_override_user_id uuid, p_reason text) =====
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


-- ===== oid=142598 public.generate_internal_barcode() =====
CREATE OR REPLACE FUNCTION public.generate_internal_barcode()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_barcode text;
  v_seq bigint;
BEGIN
  -- Generar barcode interno: formato "INT" + secuencial de 12 dígitos
  -- Esto NO es un EAN/UPC oficial, es un código interno único
  -- Formato: INT000000000001, INT000000000002, etc.
  SELECT nextval('public.internal_barcode_seq') INTO v_seq;
  v_barcode := 'INT' || lpad(v_seq::text, 12, '0');
  RETURN v_barcode;
END;
$function$


-- ===== oid=23014 public.get_my_sales(p_search_query text, p_status text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_my_sales(p_search_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_sort_column text DEFAULT 'created_at'::text, p_sort_direction text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, status text, total_amount numeric, total_count bigint, total_amount_sum numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH filtered_sales AS (
        SELECT 
            t.id as f_id, 
            t.created_at as f_created_at, 
            t.status as f_status, 
            t.total_amount as f_total_amount
        FROM public.transactions t
        WHERE t.user_id = auth.uid()
          AND (p_search_query IS NULL OR t.id::text ILIKE '%' || p_search_query || '%')
          AND (p_status IS NULL OR t.status::text = p_status)
          AND (p_date_from IS NULL OR t.created_at >= p_date_from)
          AND (p_date_to IS NULL OR t.created_at <= p_date_to)
          AND (p_min_amount IS NULL OR t.total_amount >= p_min_amount)
          AND (p_max_amount IS NULL OR t.total_amount <= p_max_amount)
    ),
    summary_stats AS (
        SELECT 
            COUNT(*) as s_total_count,
            COALESCE(SUM(fs_in.f_total_amount), 0) as s_total_amount_sum
        FROM filtered_sales fs_in
    )
    SELECT 
        fs.f_id, 
        fs.f_created_at, 
        fs.f_status::text, 
        fs.f_total_amount,
        ss.s_total_count,
        ss.s_total_amount_sum
    FROM filtered_sales fs, summary_stats ss
    ORDER BY 
        CASE WHEN p_sort_direction = 'asc' THEN
            CASE 
                WHEN p_sort_column = 'created_at' THEN fs.f_created_at::text
                WHEN p_sort_column = 'total_amount' THEN fs.f_total_amount::text
                ELSE fs.f_created_at::text
            END
        END ASC,
        CASE WHEN p_sort_direction = 'desc' THEN
            CASE 
                WHEN p_sort_column = 'created_at' THEN fs.f_created_at::text
                WHEN p_sort_column = 'total_amount' THEN fs.f_total_amount::text
                ELSE fs.f_created_at::text
            END
        END DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$


-- ===== oid=24207 public.get_product_variants_counts() =====
CREATE OR REPLACE FUNCTION public.get_product_variants_counts()
 RETURNS TABLE(product_id uuid, count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT product_id, COUNT(*)::BIGINT as count
  FROM product_variants
  GROUP BY product_id;
$function$


-- ===== oid=28149 public.get_inventory_report(p_from_date timestamp with time zone, p_to_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.get_inventory_report(p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(product_id uuid, product_name text, sku text, current_stock integer, total_inputs bigint, total_outputs bigint, sale_price numeric, cost_price numeric, total_sale_amount numeric, total_cost_amount numeric, profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH inputs_cte AS (
        SELECT m.product_id, SUM(m.quantity_change) as qty_in
        FROM public.inventory_movements m
        WHERE m.quantity_change > 0
          AND (p_from_date IS NULL OR m.created_at >= p_from_date)
          AND (p_to_date IS NULL OR m.created_at <= p_to_date)
        GROUP BY m.product_id
    ),
    sales_cte AS (
        SELECT si.product_id, SUM(si.quantity) as qty_out,
               SUM(si.quantity * si.unit_price_sold) as total_sales,
               SUM(si.quantity * si.cost_at_sale) as total_costs
        FROM public.sale_items si
        JOIN public.sales s ON si.sale_id = s.id
        WHERE s.status = 'completed'
          AND (p_from_date IS NULL OR s.created_at >= p_from_date)
          AND (p_to_date IS NULL OR s.created_at <= p_to_date)
        GROUP BY si.product_id
    )
    SELECT p.id, p.name::text, p.sku::text, COALESCE(p.stock_current, 0),
           COALESCE(ic.qty_in, 0)::bigint, COALESCE(sc.qty_out, 0)::bigint,
           COALESCE(p.price, 0)::numeric, COALESCE(p.cost_average, 0)::numeric,
           COALESCE(sc.total_sales, 0)::numeric, COALESCE(sc.total_costs, 0)::numeric,
           (COALESCE(sc.total_sales, 0) - COALESCE(sc.total_costs, 0))::numeric
    FROM public.products p
    LEFT JOIN inputs_cte ic ON p.id = ic.product_id
    LEFT JOIN sales_cte sc ON p.id = sc.product_id
    WHERE (ic.qty_in > 0 OR sc.qty_out > 0 OR p.stock_current != 0)
    ORDER BY p.name ASC;
END;
$function$


-- ===== oid=28152 public.get_inventory_with_costs(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_inventory_with_costs(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, sku text, category text, quantity numeric, cost_price numeric, selling_price numeric, total_cost numeric, profit_per_unit numeric, image_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id::UUID,
        p.name::TEXT,
        p.sku::TEXT,
        p.category::TEXT,
        COALESCE(i.quantity, 0)::NUMERIC as quantity,
        COALESCE(p.cost_price, 0)::NUMERIC as cost_price,
        COALESCE(p.price, 0)::NUMERIC as selling_price,
        (COALESCE(i.quantity, 0) * COALESCE(p.cost_price, 0))::NUMERIC as total_cost,
        (COALESCE(p.price, 0) - COALESCE(p.cost_price, 0))::NUMERIC as profit_per_unit,
        p.image_url::TEXT
    FROM public.products p
    LEFT JOIN public.inventory i ON p.id = i.product_id AND (p_store_id IS NULL OR i.store_id = p_store_id)
    ORDER BY p.name ASC;
END;
$function$


-- ===== oid=28159 public.get_my_sales(p_search_query text, p_status text, p_payment_method text, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_min_amount numeric, p_max_amount numeric, p_sort_column text, p_sort_direction text, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_my_sales(p_search_query text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_payment_method text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_min_amount numeric DEFAULT NULL::numeric, p_max_amount numeric DEFAULT NULL::numeric, p_sort_column text DEFAULT 'created_at'::text, p_sort_direction text DEFAULT 'desc'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, status text, payment_method text, total_amount numeric, total_count bigint, total_amount_sum numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH filtered_sales AS (
        SELECT 
            t.id as f_id, 
            t.created_at as f_created_at, 
            t.status::text as f_status, 
            t.payment_method::text as f_payment_method,
            t.total_amount as f_total_amount
        FROM public.transactions t
        WHERE t.seller_id = auth.uid()
          AND (p_search_query IS NULL OR t.id::text ILIKE '%' || p_search_query || '%')
          AND (p_status IS NULL OR t.status::text = p_status)
          AND (p_payment_method IS NULL OR t.payment_method::text = p_payment_method)
          AND (p_date_from IS NULL OR t.created_at >= p_date_from)
          AND (p_date_to IS NULL OR t.created_at <= p_date_to)
          AND (p_min_amount IS NULL OR t.total_amount >= p_min_amount)
          AND (p_max_amount IS NULL OR t.total_amount <= p_max_amount)
    ),
    summary_stats AS (
        SELECT 
            COUNT(*) as s_total_count,
            COALESCE(SUM(fs_in.f_total_amount), 0) as s_total_amount_sum
        FROM filtered_sales fs_in
    )
    SELECT 
        fs.f_id, 
        fs.f_created_at, 
        fs.f_status, 
        fs.f_payment_method,
        fs.f_total_amount,
        ss.s_total_count,
        ss.s_total_amount_sum
    FROM filtered_sales fs, summary_stats ss
    ORDER BY 
        CASE WHEN p_sort_direction = 'asc' THEN
            CASE 
                WHEN p_sort_column = 'created_at' THEN fs.f_created_at::text
                WHEN p_sort_column = 'total_amount' THEN fs.f_total_amount::text
                ELSE fs.f_created_at::text
            END
        END ASC,
        CASE WHEN p_sort_direction = 'desc' THEN
            CASE 
                WHEN p_sort_column = 'created_at' THEN fs.f_created_at::text
                WHEN p_sort_column = 'total_amount' THEN fs.f_total_amount::text
                ELSE fs.f_created_at::text
            END
        END DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$


-- ===== oid=28160 public.get_my_sales_summary(p_period text) =====
CREATE OR REPLACE FUNCTION public.get_my_sales_summary(p_period text)
 RETURNS TABLE(total_billed numeric, transaction_count bigint, average_ticket numeric, total_cash numeric, total_transfer numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_start_date timestamp with time zone;
    v_end_date timestamp with time zone;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    v_end_date := timezone('utc', now());
    
    CASE p_period
        WHEN 'day' THEN v_start_date := date_trunc('day', v_end_date);
        WHEN 'month' THEN v_start_date := date_trunc('month', v_end_date);
        WHEN 'year' THEN v_start_date := date_trunc('year', v_end_date);
        ELSE v_start_date := date_trunc('day', v_end_date);
    END CASE;

    RETURN QUERY
    SELECT
        COALESCE(SUM(t.total_amount), 0)::numeric as total_billed,
        COUNT(*)::bigint as transaction_count,
        COALESCE(AVG(t.total_amount), 0)::numeric as average_ticket,
        COALESCE(SUM(CASE WHEN t.payment_method = 'cash' THEN t.total_amount ELSE 0 END), 0)::numeric as total_cash,
        COALESCE(SUM(CASE WHEN t.payment_method = 'transfer' THEN t.total_amount ELSE 0 END), 0)::numeric as total_transfer
    FROM public.transactions t
    WHERE t.seller_id = v_user_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_date
        AND t.created_at <= v_end_date;
END;
$function$


-- ===== oid=28163 public.get_product_stock_ledger(p_product_id uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_product_stock_ledger(p_product_id uuid, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(created_at timestamp with time zone, movement_type text, reference_id text, quantity_change numeric, entry numeric, exit numeric, running_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH movements AS (
        SELECT 
            m.created_at,
            m.movement_type::TEXT as type,
            COALESCE(m.reference_id::TEXT, 'S/Ref') as ref,
            m.quantity_change::NUMERIC as q_change,
            CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
            CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
            SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC) as balance
        FROM public.stock_movements m
        WHERE m.product_id = p_product_id
          AND (p_store_id IS NULL OR m.store_id = p_store_id)
    )
    SELECT * FROM movements
    ORDER BY created_at DESC;
END;
$function$


-- ===== oid=28171 public.get_inventory_report(p_store_id uuid, p_from_date timestamp with time zone, p_to_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.get_inventory_report(p_store_id uuid DEFAULT NULL::uuid, p_from_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(product_id uuid, product_name text, sku text, current_stock numeric, total_inputs numeric, total_outputs numeric, sale_price numeric, cost_price numeric, total_sale_amount numeric, total_cost_amount numeric, profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    WITH inputs_cte AS (
        SELECT m.product_id, SUM(m.quantity_change)::numeric as qty_in
        FROM public.stock_movements m
        WHERE m.quantity_change > 0
          AND (p_store_id IS NULL OR m.store_id = p_store_id)
          AND (p_from_date IS NULL OR m.created_at >= p_from_date)
          AND (p_to_date IS NULL OR m.created_at <= p_to_date)
        GROUP BY m.product_id
    ),
    sales_cte AS (
        SELECT ti.product_id, SUM(ti.quantity)::numeric as qty_out,
               SUM(ti.quantity * ti.price_at_sale)::numeric as total_sales,
               SUM(ti.quantity * COALESCE(ti.cost_at_sale, 0))::numeric as total_costs
        FROM public.transaction_items ti
        JOIN public.transactions t ON ti.transaction_id = t.id
        WHERE t.status = 'completed'
          AND (p_store_id IS NULL OR t.store_id = p_store_id)
          AND (p_from_date IS NULL OR t.created_at >= p_from_date)
          AND (p_to_date IS NULL OR t.created_at <= p_to_date)
        GROUP BY ti.product_id
    )
    SELECT 
        p.id, 
        p.name::text, 
        p.sku::text, 
        COALESCE(i.quantity, 0)::numeric,
        COALESCE(ic.qty_in, 0)::numeric, 
        COALESCE(sc.qty_out, 0)::numeric,
        COALESCE(p.price, 0)::numeric, 
        COALESCE(p.cost_price, 0)::numeric,
        COALESCE(sc.total_sales, 0)::numeric, 
        COALESCE(sc.total_costs, 0)::numeric,
        (COALESCE(sc.total_sales, 0) - COALESCE(sc.total_costs, 0))::numeric
    FROM public.products p
    LEFT JOIN public.inventory i ON p.id = i.product_id AND (p_store_id IS NULL OR i.store_id = p_store_id)
    LEFT JOIN inputs_cte ic ON p.id = ic.product_id
    LEFT JOIN sales_cte sc ON p.id = sc.product_id
    WHERE (ic.qty_in > 0 OR sc.qty_out > 0 OR COALESCE(i.quantity, 0) != 0)
    ORDER BY p.name ASC;
END;
$function$


-- ===== oid=33592 public.get_current_user_store_id() =====
CREATE OR REPLACE FUNCTION public.get_current_user_store_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN public.current_user_store_id();
END;
$function$


-- ===== oid=47075 public.get_my_role() =====
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT 
    lower(COALESCE(r.name, p.role::text)) INTO v_role
  FROM public.profiles p
  LEFT JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = auth.uid();
  
  RETURN COALESCE(v_role, 'usuario');
END;
$function$


-- ===== oid=48498 public.get_audit_logs(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_audit_logs(p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_date_from timestamp without time zone DEFAULT NULL::timestamp without time zone, p_date_to timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 1000)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, user_id uuid, action text, table_name text, record_id text, old_data jsonb, new_data jsonb, metadata jsonb, store_id uuid, store_name text, profile jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                                                                                                                                                                                                                                                        DECLARE
                                                                                                                                                                                                                                                            v_user_id uuid;
                                                                                                                                                                                                                                                                v_is_admin boolean;
                                                                                                                                                                                                                                                                BEGIN
                                                                                                                                                                                                                                                                    v_user_id := auth.uid();
                                                                                                                                                                                                                                                                        v_is_admin := public.is_admin();

                                                                                                                                                                                                                                                                            IF p_limit IS NULL THEN
                                                                                                                                                                                                                                                                                    p_limit := 1000;
                                                                                                                                                                                                                                                                                        END IF;

                                                                                                                                                                                                                                                                                            RETURN QUERY
                                                                                                                                                                                                                                                                                                SELECT
                                                                                                                                                                                                                                                                                                        al.id,
                                                                                                                                                                                                                                                                                                                al.created_at,
                                                                                                                                                                                                                                                                                                                        al.user_id,
                                                                                                                                                                                                                                                                                                                                al.action,
                                                                                                                                                                                                                                                                                                                                        al.table_name,
                                                                                                                                                                                                                                                                                                                                                al.record_id::TEXT,
                                                                                                                                                                                                                                                                                                                                                        al.old_data,
                                                                                                                                                                                                                                                                                                                                                                al.new_data,
                                                                                                                                                                                                                                                                                                                                                                        al.metadata,
                                                                                                                                                                                                                                                                                                                                                                                al.store_id,
                                                                                                                                                                                                                                                                                                                                                                                        s.name as store_name,
                                                                                                                                                                                                                                                                                                                                                                                                (
                                                                                                                                                                                                                                                                                                                                                                                                            SELECT jsonb_build_object(
                                                                                                                                                                                                                                                                                                                                                                                                                            'full_name', p.full_name,
                                                                                                                                                                                                                                                                                                                                                                                                                                            'role', p.role
                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    FROM public.profiles p
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE p.id = al.user_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ) as profile
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM public.audit_logs al
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                LEFT JOIN public.stores s ON al.store_id = s.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    WHERE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            (v_is_admin OR al.store_id IS NULL OR public.has_store_access(al.store_id))
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    AND (p_store_id IS NULL OR al.store_id = p_store_id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            AND (p_date_from IS NULL OR al.created_at >= p_date_from)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    AND (p_date_to IS NULL OR al.created_at <= p_date_to)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            AND (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        p_search_term IS NULL OR p_search_term = ''
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    OR al.action ILIKE ('%' || p_search_term || '%')
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                OR al.table_name ILIKE ('%' || p_search_term || '%')
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            OR al.record_id::TEXT ILIKE ('%' || p_search_term || '%')
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ORDER BY al.created_at DESC
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            LIMIT p_limit;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            $function$


-- ===== oid=51374 public.get_dashboard_kpis(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(p_store_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total_sales numeric, total_cost numeric, total_profit numeric, transaction_count bigint, avg_ticket numeric, total_cash numeric, total_card numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_date_from timestamptz := COALESCE(p_date_from, date_trunc('day', now() AT TIME ZONE 'UTC'));
    v_date_to timestamptz := COALESCE(p_date_to, v_date_from + interval '1 day');
BEGIN
  RETURN QUERY
  WITH filtered_tx AS (
    SELECT id, total_amount, payment_method
    FROM public.transactions
    WHERE (p_store_id IS NULL OR store_id = p_store_id)
      AND status = 'completed'
      AND created_at >= v_date_from
      AND created_at < v_date_to
  ),
  tx_costs AS (
    SELECT
      ti.transaction_id,
      -- Fallback chain: recorded cost_at_sale -> current product cost_price -> 0
      SUM(ti.quantity * COALESCE(NULLIF(ti.cost_at_sale, 0), p.cost_price, 0)) as transaction_cost,
      -- Count as missing if neither historical nor current cost is available (> 0)
      COUNT(*) FILTER (WHERE COALESCE(NULLIF(ti.cost_at_sale, 0), p.cost_price, 0) = 0) as missing_costs
    FROM public.transaction_items ti
    JOIN public.products p ON ti.product_id = p.id
    WHERE ti.transaction_id IN (SELECT id FROM filtered_tx)
    GROUP BY ti.transaction_id
  )
  SELECT
    COALESCE(SUM(ft.total_amount), 0)::numeric AS total_sales,
    CASE 
      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL 
      ELSE SUM(tc.transaction_cost) 
    END::numeric AS total_cost,
    CASE 
      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL 
      ELSE SUM(ft.total_amount - COALESCE(tc.transaction_cost, 0)) 
    END::numeric AS total_profit,
    COUNT(ft.id)::bigint AS transaction_count,
    COALESCE(AVG(ft.total_amount), 0)::numeric AS avg_ticket,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'cash' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_cash,
    COALESCE(SUM(CASE WHEN ft.payment_method = 'transfer' THEN ft.total_amount ELSE 0 END), 0)::numeric AS total_card
  FROM filtered_tx ft
  LEFT JOIN tx_costs tc ON ft.id = tc.transaction_id;
END;
$function$


-- ===== oid=51380 public.get_sales_since_last_closure(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_sales_since_last_closure(p_store_id uuid)
 RETURNS TABLE(total_sales numeric, total_cash numeric, total_transfer numeric, last_closure_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                DECLARE
                    v_last_closure_at timestamptz;
                    BEGIN
                        -- Find the last CLOSED closure for this store, using closed_at as the period marker
                            SELECT closed_at INTO v_last_closure_at
                                FROM public.cash_closures
                                    WHERE store_id = p_store_id AND status = 'cerrado'
                                        ORDER BY closed_at DESC
                                            LIMIT 1;

                                                -- Fallback: If no closed closure exists, default to the beginning of time (1970-01-01)
                                                    -- instead of date_trunc('day', now()), so that it reflects the full balance.
                                                        IF v_last_closure_at IS NULL THEN
                                                                v_last_closure_at := '1970-01-01 00:00:00+00'::timestamptz;
                                                                    END IF;

                                                                        RETURN QUERY
                                                                            SELECT
                                                                                    COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
                                                                                            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
                                                                                                    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
                                                                                                            v_last_closure_at AS last_closure_at
                                                                                                                FROM public.transactions
                                                                                                                    WHERE store_id = p_store_id
                                                                                                                          AND status = 'completed'
                                                                                                                                AND created_at > v_last_closure_at;
                                                                                                                                END;
                                                                                                                                $function$


-- ===== oid=59843 public.get_product_stock_ledger_paginated(p_product_id uuid, p_store_id uuid, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_product_stock_ledger_paginated(p_product_id uuid, p_store_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(movement_id uuid, created_at timestamp with time zone, movement_type text, reference_id text, reference_doc text, quantity_change numeric, entry numeric, exit numeric, balance_after numeric, unit_cost numeric, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
                              BEGIN
                                RETURN QUERY
                                  WITH movements AS (
                                      SELECT
                                            m.id as movement_id,
                                                  m.created_at,
                                                        m.movement_type::TEXT as type,
                                                              COALESCE(m.reference_id::TEXT, 'S/Ref') as ref_id,
                                                                    COALESCE(m.reference_doc::TEXT, 'S/Doc') as ref_doc,
                                                                          m.quantity_change::NUMERIC as q_change,
                                                                                CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
                                                                                      CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
                                                                                            -- Use the calculated balance to ensure accuracy, but call it balance_after for UI compatibility
                                                                                                  SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC)::NUMERIC as balance,
                                                                                                        m.unit_cost::NUMERIC as u_cost,
                                                                                                              COUNT(*) OVER() as total_records
                                                                                                                  FROM public.stock_movements m
                                                                                                                      WHERE m.product_id = p_product_id
                                                                                                                            AND (p_store_id IS NULL OR m.store_id = p_store_id)
                                                                                                                              )
                                                                                                                                SELECT
                                                                                                                                    m.movement_id,
                                                                                                                                        m.created_at,
                                                                                                                                            m.type,
                                                                                                                                                m.ref_id,
                                                                                                                                                    m.ref_doc,
                                                                                                                                                        m.q_change,
                                                                                                                                                            m.q_entry,
                                                                                                                                                                m.q_exit,
                                                                                                                                                                    m.balance,
                                                                                                                                                                        m.u_cost,
                                                                                                                                                                            m.total_records
                                                                                                                                                                              FROM movements m
                                                                                                                                                                                ORDER BY m.created_at DESC
                                                                                                                                                                                  LIMIT p_limit
                                                                                                                                                                                    OFFSET p_offset;
                                                                                                                                                                                    END;
                                                                                                                                                                                    $function$


-- ===== oid=79124 public.get_new_academy_cards(p_user_id uuid, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_new_academy_cards(p_user_id uuid, p_limit integer)
 RETURNS SETOF learning_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT lc.*
  FROM public.learning_cards lc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_progress up
    WHERE up.card_id = lc.id AND up.user_id = p_user_id
  )
  LIMIT p_limit;
END;
$function$


-- ===== oid=130869 public.get_cash_closures(p_store_id uuid, p_date_from date, p_date_to date, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_cash_closures(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      cc.id,
      cc.user_id,
      cc.store_id,
      cc.session_reference,
      cc.declared_cash,
      cc.declared_vouchers,
      cc.system_total,
      cc.notes,
      cc.status,
      cc.closed_at,
      cc.created_at,
      cc.declared_total,
      cc.system_expected_total,
      cc.difference,
      p.full_name AS operator_name
    FROM cash_closures cc
    LEFT JOIN profiles p ON p.id = cc.user_id
    WHERE
      (p_store_id IS NULL OR cc.store_id = p_store_id)
      AND (p_date_from IS NULL OR cc.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR cc.created_at::date <= p_date_to)
      AND cc.status = 'cerrado'
    ORDER BY cc.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$


-- ===== oid=130870 public.get_profit_report(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_profit_report(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      s.id,
      s.created_at::date AS date,
      s.total_amount AS total_sales,
      COALESCE(SUM(si.quantity * si.cost_at_sale), 0) AS total_cost,
      s.total_amount - COALESCE(SUM(si.quantity * si.cost_at_sale), 0) AS profit,
      CASE
        WHEN s.total_amount = 0 THEN 0
        ELSE ROUND(
          ((s.total_amount - COALESCE(SUM(si.quantity * si.cost_at_sale), 0)) / s.total_amount) * 100,
          2
        )
      END AS margin_percentage
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE
      (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (p_date_from IS NULL OR s.created_at >= p_date_from)
      AND (p_date_to IS NULL OR s.created_at <= p_date_to)
      AND s.status = 'completed'
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$


-- ===== oid=130871 public.get_daily_income_aggregated(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_daily_income_aggregated(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      s.created_at::date AS date,
      COALESCE(SUM(s.total_amount), 0)::numeric(18,2) AS total_income
    FROM sales s
    WHERE
      (p_store_id IS NULL OR s.store_id = p_store_id)
      AND (p_date_from IS NULL OR s.created_at >= p_date_from)
      AND (p_date_to IS NULL OR s.created_at <= p_date_to)
      AND s.status = 'completed'
    GROUP BY s.created_at::date
    ORDER BY date DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$


-- ===== oid=130872 public.get_daily_expenses_aggregated(p_store_id uuid, p_date_from date, p_date_to date, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_daily_expenses_aggregated(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      r.created_at::date AS date,
      COALESCE(SUM(r.total_cost), 0)::numeric(18,2) AS total_expenses
    FROM receipts r
    WHERE
      (p_store_id IS NULL OR r.store_id = p_store_id)
      AND (p_date_from IS NULL OR r.created_at::date >= p_date_from)
      AND (p_date_to IS NULL OR r.created_at::date <= p_date_to)
    GROUP BY r.created_at::date
    ORDER BY date DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$


-- ===== oid=131903 public.get_batch_store_daily_kpis(p_store_ids uuid[], p_date date) =====
CREATE OR REPLACE FUNCTION public.get_batch_store_daily_kpis(p_store_ids uuid[], p_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(store_id uuid, today_sales numeric, today_transactions bigint, low_stock_count bigint, pending_transfers_out bigint, pending_receptions bigint, visible_products bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH
  -- Pre-aggregate today's sales per store (single scan with index)
  sales AS (
    SELECT
      tx.store_id,
      COALESCE(SUM(tx.total_amount), 0) AS total_sales,
      COUNT(DISTINCT tx.id)              AS tx_count
    FROM transactions tx
    WHERE tx.store_id = ANY(p_store_ids)
      AND tx.status = 'completed'
      AND tx.created_at >= p_date
      AND tx.created_at <  p_date + INTERVAL '1 day'
    GROUP BY tx.store_id
  ),

  -- Pre-aggregate low-stock product counts per store (single scan with index)
  low_stock AS (
    SELECT
      p.store_id,
      COUNT(*) AS low_count
    FROM products p
    WHERE p.store_id = ANY(p_store_ids)
      AND p.is_active = true
      AND p.stock_current <= p.min_stock
    GROUP BY p.store_id
  ),

  -- Count pending outgoing transfers per store (single scan with index)
  transfers_out AS (
    SELECT
      t.origin_store_id AS store_id,
      COUNT(*)           AS pending_count
    FROM transfers t
    WHERE t.origin_store_id = ANY(p_store_ids)
      AND t.status = 'PENDIENTE'
    GROUP BY t.origin_store_id
  ),

  -- Count active receipts (pending receptions) per store
  receipts_pending AS (
    SELECT
      r.store_id,
      COUNT(*) AS pending_count
    FROM receipts r
    WHERE r.store_id = ANY(p_store_ids)
      AND r.status = 'pending'
    GROUP BY r.store_id
  ),

  -- Count visible storefront products per store (single scan with index)
  visible AS (
    SELECT
      p.store_id,
      COUNT(*) AS visible_count
    FROM products p
    WHERE p.store_id = ANY(p_store_ids)
      AND p.is_active = true
      AND p.visible_en_tienda = true
    GROUP BY p.store_id
  )

  -- Final join: UNNEST input + LEFT JOIN each CTE (no correlated subqueries)
  SELECT
    s_id                                      AS store_id,
    COALESCE(sales.total_sales, 0)            AS today_sales,
    COALESCE(sales.tx_count, 0)               AS today_transactions,
    COALESCE(low_stock.low_count, 0)          AS low_stock_count,
    COALESCE(transfers_out.pending_count, 0)  AS pending_transfers_out,
    COALESCE(receipts_pending.pending_count, 0) AS pending_receptions,
    COALESCE(visible.visible_count, 0)        AS visible_products
  FROM UNNEST(p_store_ids) AS s_id
  LEFT JOIN sales             ON sales.store_id             = s_id
  LEFT JOIN low_stock         ON low_stock.store_id         = s_id
  LEFT JOIN transfers_out     ON transfers_out.store_id     = s_id
  LEFT JOIN receipts_pending  ON receipts_pending.store_id  = s_id
  LEFT JOIN visible           ON visible.store_id           = s_id;
END;
$function$


-- ===== oid=132041 public.get_or_create_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_pdf_format text) =====
CREATE OR REPLACE FUNCTION public.get_or_create_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text DEFAULT NULL::text, p_modalidad text DEFAULT NULL::text, p_pdf_format text DEFAULT 'res148'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cost_sheet_id UUID;
  v_template_id TEXT;
  v_modalidad TEXT;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para acceder a las fichas de costo de esta tienda';
  END IF;

  -- 1. Check if product already has a cost sheet
  SELECT cost_sheet_id INTO v_cost_sheet_id
  FROM products WHERE id = p_product_id;

  IF v_cost_sheet_id IS NOT NULL THEN
    -- Return existing cost sheet data
    SELECT jsonb_build_object(
      'id', id,
      'product_id', product_id,
      'store_id', store_id,
      'template_id', template_id,
      'modalidad', modalidad,
      'calculated_data', calculated_data,
      'cost_price', cost_price,
      'cost_price_updated_at', cost_price_updated_at,
      'sync_status', sync_status,
      'exists', true
    ) INTO v_result
    FROM product_cost_sheets
    WHERE id = v_cost_sheet_id AND deleted_at IS NULL;

    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- 2. Resolve template: explicit parameter > store default > error
  IF p_template_id IS NOT NULL THEN
    v_template_id := p_template_id;
    v_modalidad := COALESCE(p_modalidad, 'produccion');
  ELSE
    -- Get store's default template
    SELECT sct.template_id, sct.modalidad INTO v_template_id, v_modalidad
    FROM store_cost_templates sct
    WHERE sct.store_id = p_store_id AND sct.is_active = true;

    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'No hay plantilla de FC asignada a esta tienda. Configure una plantilla predeterminada primero.';
    END IF;
  END IF;

  -- 3. Return template info for client-side calculation
  -- (The actual calculation uses the TypeScript cost-engine on the API route)
  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'store_id', p_store_id,
    'template_id', v_template_id,
    'modalidad', v_modalidad,
    'pdf_format', COALESCE(p_pdf_format, 'res148'),
    'exists', false,
    'needs_calculation', true
  );
END;
$function$


-- ===== oid=132197 public.get_products_for_reception(p_store_id uuid, p_search_term text, p_page integer, p_page_size integer) =====
CREATE OR REPLACE FUNCTION public.get_products_for_reception(p_store_id uuid, p_search_term text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, sku text, barcode text, cost_price numeric, price numeric, unit_of_measure text, stock_current numeric, min_stock numeric, is_active boolean, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_offset INT;
  v_search TEXT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_search := LOWER(TRIM(COALESCE(p_search_term, '')));

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.cost_price,
    p.price,
    p.unit_of_measure,
    p.stock_current,
    p.min_stock,
    p.is_active,
    COUNT(*) OVER() AS total_count
  FROM products p
  WHERE p.store_id = p_store_id
    AND p.is_active = true
    AND (
      v_search = ''
      OR LOWER(p.name) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(p.sku, '')) LIKE '%' || v_search || '%'
      OR LOWER(COALESCE(p.barcode, '')) LIKE '%' || v_search || '%'
    )
  ORDER BY
    CASE WHEN v_search != '' AND LOWER(p.name) LIKE v_search || '%' THEN 0 ELSE 1 END,
    CASE WHEN v_search != '' AND LOWER(COALESCE(p.sku, '')) = v_search THEN 0 ELSE 1 END,
    p.name ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$function$


-- ===== oid=132401 public.get_store_analytics_advanced(p_store_id uuid, p_start_date date, p_end_date date, p_days integer) =====
CREATE OR REPLACE FUNCTION public.get_store_analytics_advanced(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Resolución de fechas:
  -- - Si p_start_date y p_end_date están dados → usar ese rango
  -- - Sino → usar p_days hacia atrás desde hoy
  v_end_date DATE := COALESCE(p_end_date, CURRENT_DATE);
  v_start_date DATE := COALESCE(p_start_date, v_end_date - (p_days || ' days')::INTERVAL);
  v_start_ts TIMESTAMPTZ := v_start_date::timestamp AT TIME ZONE 'UTC';
  v_end_ts TIMESTAMPTZ := (v_end_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'UTC';
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
  v_actual_days INT := GREATEST(1, v_end_date - v_start_date + 1);
  v_kpis JSONB;
  v_sales_series JSONB;
  v_top_products_revenue JSONB;
  v_top_products_quantity JSONB;
  v_payment_distribution JSONB;
  v_weekday_distribution JSONB;
  v_hour_distribution JSONB;
  v_low_stock JSONB;
  v_slow_movers JSONB;
  v_overstock JSONB;
  v_category_margins JSONB;
  v_product_velocity JSONB;
BEGIN
  -- ============================================================
  -- 1. KPIs principales (período + comparativa hoy)
  -- ============================================================
  -- ⚠️ BUG FIX: NO usar LEFT JOIN transaction_items aquí.
  -- El LEFT JOIN duplica cada transacción por cada item, haciendo que
  -- SUM(t.total_amount) cuente N veces la misma transacción.
  -- Solución: calcular ventas en una subquery sin JOIN, y costo/qty en otra.
  SELECT jsonb_build_object(
    'period_sales', COALESCE(sales_data.total_sales, 0),
    'period_cost', COALESCE(items_data.total_cost, 0),
    'period_transactions', COALESCE(sales_data.tx_count, 0),
    'period_items_sold', COALESCE(items_data.items_sold, 0),
    'today_sales', COALESCE(sales_data.today_sales, 0),
    'today_transactions', COALESCE(sales_data.today_tx_count, 0),
    'avg_ticket', CASE WHEN COALESCE(sales_data.tx_count, 0) > 0
                       THEN COALESCE(sales_data.total_sales, 0) / sales_data.tx_count
                       ELSE 0 END,
    'avg_items_per_sale', CASE WHEN COALESCE(sales_data.tx_count, 0) > 0
                                THEN COALESCE(items_data.items_sold, 0)::FLOAT / sales_data.tx_count
                                ELSE 0 END
  )
  INTO v_kpis
  FROM (
    -- Subquery 1: métricas a nivel transacción (sin JOIN, sin duplicación)
    SELECT
      SUM(t.total_amount) AS total_sales,
      COUNT(*) AS tx_count,
      SUM(CASE WHEN t.created_at >= v_today_start THEN t.total_amount ELSE 0 END) AS today_sales,
      SUM(CASE WHEN t.created_at >= v_today_start THEN 1 ELSE 0 END) AS today_tx_count
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
  ) AS sales_data
  CROSS JOIN (
    -- Subquery 2: métricas a nivel item (sumando solo items de transacciones completadas)
    SELECT
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS total_cost,
      COALESCE(SUM(ti.quantity), 0) AS items_sold
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
  ) AS items_data;

  -- ============================================================
  -- 2. Serie temporal de ventas por día
  -- ============================================================
  -- BUG FIX: misma duplicación que KPIs. Usar subqueries separadas.
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY day_date), '[]'::jsonb)
  INTO v_sales_series
  FROM (
    SELECT
      d::date AS day_date,
      d::text AS date,
      COALESCE(sales_by_day.sales, 0) AS sales,
      COALESCE(sales_by_day.transactions, 0) AS transactions,
      COALESCE(items_by_day.items_sold, 0) AS items_sold
    FROM generate_series(
      date_trunc('day', v_start_date),
      date_trunc('day', NOW()),
      '1 day'
    ) AS d
    LEFT JOIN (
      SELECT
        date_trunc('day', t.created_at) AS day,
        SUM(t.total_amount) AS sales,
        COUNT(*) AS transactions
      FROM transactions t
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY date_trunc('day', t.created_at)
    ) AS sales_by_day ON sales_by_day.day = d
    LEFT JOIN (
      SELECT
        date_trunc('day', t.created_at) AS day,
        SUM(ti.quantity) AS items_sold
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY date_trunc('day', t.created_at)
    ) AS items_by_day ON items_by_day.day = d
    ORDER BY d
  ) AS d;

  -- ============================================================
  -- 3. Top productos por ingreso (top 10)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_top_products_revenue
  FROM (
    SELECT
      ti.product_id,
      p.name,
      p.sku,
      p.category,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue,
      COALESCE(SUM(ti.quantity), 0) AS quantity,
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS cost,
      CASE WHEN SUM(ti.price_at_sale * ti.quantity) > 0
           THEN ROUND(
             ((SUM(ti.price_at_sale * ti.quantity) - SUM(ti.cost_at_sale * ti.quantity))
             / SUM(ti.price_at_sale * ti.quantity) * 100)::numeric, 2
           )
           ELSE 0 END AS margin_pct
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY ti.product_id, p.name, p.sku, p.category
    ORDER BY revenue DESC
    LIMIT 10
  ) AS q;

  -- ============================================================
  -- 4. Top productos por cantidad (top 10)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_top_products_quantity
  FROM (
    SELECT
      ti.product_id,
      p.name,
      p.sku,
      COALESCE(SUM(ti.quantity), 0) AS quantity,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY ti.product_id, p.name, p.sku
    ORDER BY quantity DESC
    LIMIT 10
  ) AS q;

  -- ============================================================
  -- 5. Distribución de métodos de pago
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q)), '[]'::jsonb)
  INTO v_payment_distribution
  FROM (
    SELECT
      -- Cast a TEXT para evitar issues con el enum payment_method_enum
      -- que no acepta 'unknown' como valor. Frontend mapeará 'other' → 'Otro'.
      CASE WHEN t.payment_method IS NULL THEN 'other'
           ELSE t.payment_method::TEXT END AS method,
      COUNT(*) AS count,
      COALESCE(SUM(t.total_amount), 0) AS total,
      CASE WHEN SUM(SUM(t.total_amount)) OVER () > 0
           THEN ROUND((SUM(t.total_amount) / SUM(SUM(t.total_amount)) OVER () * 100)::numeric, 2)
           ELSE 0 END AS pct
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY t.payment_method
    ORDER BY total DESC
  ) AS q;

  -- ============================================================
  -- 6. Distribución por día de semana (0=Domingo, 6=Sábado)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY weekday), '[]'::jsonb)
  INTO v_weekday_distribution
  FROM (
    SELECT
      EXTRACT(DOW FROM t.created_at)::INT AS weekday,
      TRIM(TO_CHAR(t.created_at, 'Day')) AS weekday_name,
      COALESCE(SUM(t.total_amount), 0) AS sales,
      COUNT(*) AS transactions
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY EXTRACT(DOW FROM t.created_at), TRIM(TO_CHAR(t.created_at, 'Day'))
  ) AS q;

  -- ============================================================
  -- 7. Distribución por hora del día (0-23)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY hour), '[]'::jsonb)
  INTO v_hour_distribution
  FROM (
    SELECT
      EXTRACT(HOUR FROM t.created_at)::INT AS hour,
      COALESCE(SUM(t.total_amount), 0) AS sales,
      COUNT(*) AS transactions
    FROM transactions t
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY EXTRACT(HOUR FROM t.created_at)
  ) AS q;

  -- ============================================================
  -- 8. Productos con stock bajo (<= min_stock)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY deficit DESC), '[]'::jsonb)
  INTO v_low_stock
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      p.min_stock,
      GREATEST(0, COALESCE(p.min_stock, 0) - COALESCE(p.stock_current, 0)) AS deficit
    FROM products p
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) <= COALESCE(p.min_stock, 0)
      AND COALESCE(p.min_stock, 0) > 0
  ) AS q;

  -- ============================================================
  -- 9. Productos con movimiento lento (sin ventas en 30 días)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY days_without_sales DESC), '[]'::jsonb)
  INTO v_slow_movers
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      EXTRACT(DAY FROM NOW() - COALESCE(last_sale.last_sale_date, p.created_at))::INT AS days_without_sales,
      last_sale.last_sale_date
    FROM products p
    LEFT JOIN (
      SELECT ti.product_id, MAX(t.created_at) AS last_sale_date
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id AND t.status = 'completed'
      GROUP BY ti.product_id
    ) last_sale ON last_sale.product_id = p.id
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) > 0
      AND (last_sale.last_sale_date IS NULL
           OR last_sale.last_sale_date < NOW() - INTERVAL '30 days')
    ORDER BY days_without_sales DESC
    LIMIT 20
  ) AS q;

  -- ============================================================
  -- 10. Productos con exceso de inventario (rotación < 1 mes)
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY days_of_stock DESC NULLS LAST), '[]'::jsonb)
  INTO v_overstock
  FROM (
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      p.stock_current,
      COALESCE(sales_stats.avg_daily, 0) AS avg_daily_sales,
      CASE WHEN COALESCE(sales_stats.avg_daily, 0) > 0
           THEN ROUND((COALESCE(p.stock_current, 0) / sales_stats.avg_daily)::numeric, 1)
           ELSE NULL END AS days_of_stock,
      COALESCE(p.stock_current, 0) * COALESCE(p.cost_price, 0) AS overstock_value
    FROM products p
    LEFT JOIN (
      SELECT ti.product_id,
             SUM(ti.quantity)::FLOAT / GREATEST(p_days, 1) AS avg_daily
      FROM transaction_items ti
      INNER JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.store_id = p_store_id
        AND t.status = 'completed'
        AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
      GROUP BY ti.product_id
    ) sales_stats ON sales_stats.product_id = p.id
    WHERE p.store_id = p_store_id
      AND p.is_active = true
      AND COALESCE(p.stock_current, 0) > 0
      AND (sales_stats.avg_daily IS NULL
           OR COALESCE(p.stock_current, 0) / NULLIF(sales_stats.avg_daily, 0) > 45)
    ORDER BY days_of_stock DESC NULLS LAST
    LIMIT 15
  ) AS q;

  -- ============================================================
  -- 11. Márgenes por categoría
  -- ============================================================
  SELECT COALESCE(jsonb_agg(row_to_json(q) ORDER BY revenue DESC), '[]'::jsonb)
  INTO v_category_margins
  FROM (
    SELECT
      COALESCE(p.category, 'Sin categoría') AS category,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) AS revenue,
      COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS cost,
      COALESCE(SUM(ti.price_at_sale * ti.quantity), 0) - COALESCE(SUM(ti.cost_at_sale * ti.quantity), 0) AS margin,
      CASE WHEN SUM(ti.price_at_sale * ti.quantity) > 0
           THEN ROUND(
             ((SUM(ti.price_at_sale * ti.quantity) - SUM(ti.cost_at_sale * ti.quantity))
             / SUM(ti.price_at_sale * ti.quantity) * 100)::numeric, 2
           )
           ELSE 0 END AS margin_pct,
      COALESCE(SUM(ti.quantity), 0) AS items_sold
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti.transaction_id
    INNER JOIN products p ON p.id = ti.product_id
    WHERE t.store_id = p_store_id
      AND t.status = 'completed'
      AND t.created_at >= v_start_ts
      AND t.created_at < v_end_ts
    GROUP BY p.category
  ) AS q;

  -- ============================================================
  -- 12. Respuesta final
  -- ============================================================
  RETURN jsonb_build_object(
    'period_days', v_actual_days,
    'start_date', v_start_date::text,
    'end_date', v_end_date::text,
    'kpis', v_kpis,
    'sales_series', v_sales_series,
    'top_products_revenue', v_top_products_revenue,
    'top_products_quantity', v_top_products_quantity,
    'payment_distribution', v_payment_distribution,
    'weekday_distribution', v_weekday_distribution,
    'hour_distribution', v_hour_distribution,
    'low_stock', v_low_stock,
    'slow_movers', v_slow_movers,
    'overstock', v_overstock,
    'category_margins', v_category_margins
  );
END;
$function$


-- ===== oid=132485 public.get_global_max_operation_date(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_global_max_operation_date(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT MAX(operation_date)
  FROM v_global_operation_dates
  WHERE p_store_id IS NULL OR store_id = p_store_id;
$function$


-- ===== oid=132723 public.get_product_cost_analysis(p_product_id uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_product_cost_analysis(p_product_id uuid, p_store_id uuid)
 RETURNS TABLE(receipt_id uuid, receipt_date timestamp with time zone, quantity integer, unit_cost double precision, service_type text, service_amount numeric, total_cost numeric, unit_cost_final numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT 
    ri.receipt_id,
    r.reception_date,
    ri.quantity,
    ri.unit_cost,
    st.name AS service_type,
    COALESCE(scd.distribution_amount, 0) AS service_amount,
    ri.unit_cost * ri.quantity + COALESCE(scd.distribution_amount, 0) AS total_cost,
    CASE WHEN ri.quantity > 0 
      THEN (ri.unit_cost * ri.quantity + COALESCE(scd.distribution_amount, 0)) / ri.quantity 
      ELSE 0 END AS unit_cost_final
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  LEFT JOIN service_cost_distributions scd ON scd.receipt_item_id = ri.id
  LEFT JOIN received_services rs ON rs.id = scd.service_id AND rs.status = 'active'
  LEFT JOIN service_types st ON st.id = rs.service_type_id
  WHERE ri.product_id = p_product_id
    AND r.store_id = p_store_id
    AND r.status = 'active'
  ORDER BY r.reception_date DESC;
$function$


-- ===== oid=133402 public.get_low_stock_count(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_low_stock_count(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::bigint
  FROM public.products
  WHERE
    (p_store_id IS NULL OR store_id = p_store_id)
    AND is_active = true
    AND stock_current > 0
    AND min_stock IS NOT NULL
    AND min_stock > 0
    AND stock_current <= min_stock;
$function$


-- ===== oid=133830 public.get_paginated_products(p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_paginated_products(p_store_id uuid, p_search_term text DEFAULT ''::text, p_category text DEFAULT ''::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, sku text, barcode text, barcode_type text, price numeric, precio_empresa numeric, cost_price numeric, image_url text, category text, unit_of_measure text, supplier text, created_at timestamp with time zone, updated_at timestamp with time zone, stock_current numeric, cost_average numeric, min_stock numeric, store_id uuid, is_active boolean, visible_en_tienda boolean, price_visible boolean, stock_visible boolean, on_promotion boolean, price_currency text, has_movements boolean, total bigint, is_complete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_total bigint; v_is_complete boolean;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category);

  v_is_complete := (p_limit + p_offset >= v_total);

  RETURN QUERY SELECT
    p.id::uuid, p.name::text, p.description::text, p.sku::text, p.barcode::text, p.barcode_type::text,
    p.price::numeric, p.precio_empresa::numeric, p.cost_price::numeric, p.image_url::text,
    p.category::text, p.unit_of_measure::text, p.supplier::text,
    p.created_at::timestamptz, p.updated_at::timestamptz,
    -- FIX: leer de inventory.quantity (fuente de verdad) en vez de p.stock_current (desincronizado)
    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
    p.cost_average::numeric, p.min_stock::numeric,
    p.store_id::uuid, p.is_active::boolean, p.visible_en_tienda::boolean,
    COALESCE(p.price_visible, true)::boolean, COALESCE(p.stock_visible, true)::boolean, COALESCE(p.on_promotion, false)::boolean, COALESCE(p.price_currency, 'CUP')::text,
    EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id)::boolean AS has_movements,
    v_total::bigint, v_is_complete::boolean
  FROM public.products p
  WHERE p.store_id = p_store_id AND p.is_active = true
  AND (COALESCE(p_search_term, '') = '' OR p.search_vector @@ plainto_tsquery('spanish', p_search_term) OR p.name ILIKE '%' || p_search_term || '%' OR p.sku ILIKE '%' || p_search_term || '%' OR COALESCE(p.barcode, '') ILIKE '%' || p_search_term || '%')
  AND (COALESCE(p_category, '') = '' OR p.category = p_category)
  ORDER BY p.name LIMIT p_limit OFFSET p_offset;
END;
$function$


-- ===== oid=136513 public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_reorder_suggestions(p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'product_name', p.name, 'sku', p.sku,
      'current_stock', p.stock_current,
      'suggested_quantity', CASE
        WHEN abc.classification = 'A' THEN GREATEST(50, 100 - p.stock_current)
        WHEN abc.classification = 'B' THEN GREATEST(20, 50 - p.stock_current)
        ELSE GREATEST(10, 20 - p.stock_current)
      END,
      'abc_class', COALESCE(abc.classification, 'C'),
      'priority', CASE
        WHEN COALESCE(abc.classification, 'C') = 'A' AND p.stock_current <= 5 THEN 'critical'
        WHEN COALESCE(abc.classification, 'C') = 'A' THEN 'high'
        WHEN COALESCE(abc.classification, 'C') = 'B' AND p.stock_current <= 0 THEN 'high'
        WHEN p.stock_current <= 0 THEN 'medium'
        ELSE 'low'
      END
    )), '[]'::jsonb)
    FROM public.products p
    LEFT JOIN LATERAL (
      SELECT classification FROM public.abc_classifications
      WHERE store_id = p.store_id AND product_id = p.id
        AND period_year = EXTRACT(YEAR FROM now())::int
        AND period_month = EXTRACT(MONTH FROM now())::int
      LIMIT 1
    ) abc ON true
    WHERE p.store_id = p_store_id AND p.is_active = true
      AND p.stock_current <= CASE
        WHEN abc.classification = 'A' THEN 10
        WHEN abc.classification = 'B' THEN 5
        ELSE 0
      END
  );
END;
$function$


-- ===== oid=137379 public.get_cash_report(p_store_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_include_all_dates boolean) =====
CREATE OR REPLACE FUNCTION public.get_cash_report(p_store_id uuid, p_start_date timestamp with time zone DEFAULT (now() - '1 day'::interval), p_end_date timestamp with time zone DEFAULT now(), p_include_all_dates boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
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
      SUM(total_amount) AS total_cup
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
  SELECT COALESCE(SUM(total_amount), 0)
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
$function$


-- ===== oid=137493 public.get_available_stock(p_store_id uuid, p_product_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_available_stock(p_store_id uuid, p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_current NUMERIC;
  v_reserved NUMERIC;
  v_available NUMERIC;
BEGIN
  SELECT stock_current INTO v_stock_current
  FROM public.products
  WHERE id = p_product_id AND store_id = p_store_id;

  IF v_stock_current IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_reserved
  FROM public.inventory_reservations
  WHERE store_id = p_store_id
    AND product_id = p_product_id
    AND status = 'ACTIVE';

  v_available := v_stock_current - v_reserved;

  RETURN jsonb_build_object(
    'found', true,
    'stock_current', v_stock_current,
    'stock_reserved', v_reserved,
    'stock_available', v_available
  );
END;
$function$


-- ===== oid=137559 public.get_backup_table_list(p_include_excluded boolean) =====
CREATE OR REPLACE FUNCTION public.get_backup_table_list(p_include_excluded boolean DEFAULT false)
 RETURNS TABLE(table_name text, tier integer, filter_strategy text, parent_table text, parent_foreign_key text, date_column text, excluded_from_restore boolean, exclude_reason text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    table_name,
    tier,
    filter_strategy,
    parent_table,
    parent_foreign_key,
    date_column,
    excluded_from_restore,
    exclude_reason
  FROM public.backup_table_registry
  WHERE (p_include_excluded OR excluded_from_restore = FALSE)
  ORDER BY tier ASC, table_name ASC;
$function$


-- ===== oid=137575 public.get_table_writable_columns(p_table_name text) =====
CREATE OR REPLACE FUNCTION public.get_table_writable_columns(p_table_name text)
 RETURNS text[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT array_agg(column_name ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table_name
    AND is_generated = 'NEVER'
    AND is_updatable = 'YES';
$function$


-- ===== oid=138146 public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.get_tenant_cash_report(p_tenant_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start timestamptz := COALESCE(p_start_date, date_trunc('day', now()) - interval '30 days');
  v_end timestamptz := COALESCE(p_end_date, now());
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() AND NOT EXISTS(
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only tenant owner or admin can view tenant reports';
  END IF;

  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'start_date', v_start,
    'end_date', v_end,
    'stores_count', (SELECT COUNT(*) FROM public.stores WHERE tenant_id = p_tenant_id AND is_active = true),
    'total_sales', COALESCE((
      SELECT SUM(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_cash', COALESCE((
      SELECT SUM(cash_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_transfer', COALESCE((
      SELECT SUM(transfer_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'total_zelle', COALESCE((
      SELECT SUM(zelle_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'transaction_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'voided_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'voided' AND created_at BETWEEN v_start AND v_end
    ), 0),
    'by_store', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'store_id', s.id, 'store_name', s.name,
        'sales', COALESCE(t.total, 0), 'count', COALESCE(t.cnt, 0)
      ))
      FROM public.stores s
      LEFT JOIN (
        SELECT store_id, SUM(total_amount) as total, COUNT(*) as cnt
        FROM public.transactions
        WHERE status = 'completed' AND created_at BETWEEN v_start AND v_end
        GROUP BY store_id
      ) t ON t.store_id = s.id
      WHERE s.tenant_id = p_tenant_id AND s.is_active = true
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$


-- ===== oid=138147 public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer) =====
CREATE OR REPLACE FUNCTION public.get_tenant_sales_summary(p_tenant_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL
     AND NOT public.is_admin()
     AND NOT EXISTS(
       SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND owner_id = v_uid
     ) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  SELECT jsonb_build_object(
    'tenant_id', p_tenant_id,
    'days', p_days,
    'total_sales', COALESCE((
      SELECT SUM(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0),
    'avg_daily', COALESCE((
      SELECT AVG(daily_total) FROM (
        SELECT SUM(total_amount) as daily_total
        FROM public.transactions
        WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
          AND status = 'completed'
          AND created_at >= now() - (p_days || ' days')::interval
        GROUP BY date_trunc('day', created_at)
      ) sub
    ), 0),
    'transaction_count', COALESCE((
      SELECT COUNT(*) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0),
    'avg_ticket', COALESCE((
      SELECT AVG(total_amount) FROM public.transactions
      WHERE store_id IN (SELECT id FROM public.stores WHERE tenant_id = p_tenant_id)
        AND status = 'completed'
        AND created_at >= now() - (p_days || ' days')::interval
    ), 0)
  ) INTO v_result;
  RETURN v_result;
END;
$function$


-- ===== oid=138305 public.get_sales_book(p_store_id uuid, p_year integer, p_month integer) =====
CREATE OR REPLACE FUNCTION public.get_sales_book(p_store_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(invoice_number text, transaction_date timestamp with time zone, customer_name text, total_amount numeric, taxable_base numeric, tax_amount numeric, payment_method text, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin() AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    t.invoice_number,
    t.created_at,
    COALESCE(t.customer_name, ''),
    t.total_amount,
    t.subtotal - t.discount_value,
    t.tax_amount,
    t.payment_method::text,
    t.status
  FROM public.transactions t
  WHERE t.store_id = p_store_id
    AND EXTRACT(YEAR FROM t.created_at)::int = p_year
    AND EXTRACT(MONTH FROM t.created_at)::int = p_month
    AND t.status IN ('completed', 'voided', 'reversed')
  ORDER BY t.created_at;
END;
$function$


-- ===== oid=138306 public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer) =====
CREATE OR REPLACE FUNCTION public.get_purchases_book(p_store_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(receipt_number text, receipt_date timestamp with time zone, supplier text, total_cost numeric, paid_amount numeric, payment_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin() AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(r.invoice_number, r.id::text),
    r.created_at,
    COALESCE(r.supplier, ''),
    COALESCE(r.total_cost, 0),
    COALESCE(r.paid_amount, 0),
    COALESCE(r.payment_status, '')
  FROM public.receipts r
  WHERE r.store_id = p_store_id
    AND EXTRACT(YEAR FROM r.created_at)::int = p_year
    AND EXTRACT(MONTH FROM r.created_at)::int = p_month
    AND r.status = 'active'
  ORDER BY r.created_at;
END;
$function$


-- ===== oid=138307 public.get_tax_report(p_store_id uuid, p_year integer, p_month integer) =====
CREATE OR REPLACE FUNCTION public.get_tax_report(p_store_id uuid, p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_sales numeric := 0;
  v_total_tax_collected numeric := 0;
  v_total_devolutions numeric := 0;
  v_total_tax_returned numeric := 0;
  v_total_purchases numeric := 0;
  v_net_tax_payable numeric := 0;
BEGIN
  IF NOT public.is_admin() AND NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(tax_amount), 0)
    INTO v_total_sales, v_total_tax_collected
    FROM public.transactions
    WHERE store_id = p_store_id AND status = 'completed'
      AND EXTRACT(YEAR FROM created_at)::int = p_year
      AND EXTRACT(MONTH FROM created_at)::int = p_month;

  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(total_amount * COALESCE(
    (SELECT tax_amount / NULLIF(total_amount, 0) FROM public.transactions t WHERE t.id = d.original_transaction_id LIMIT 1), 0
  )), 0)
    INTO v_total_devolutions, v_total_tax_returned
    FROM public.devolutions d
    WHERE d.store_id = p_store_id AND d.status = 'completed'
      AND EXTRACT(YEAR FROM d.created_at)::int = p_year
      AND EXTRACT(MONTH FROM d.created_at)::int = p_month;

  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_total_purchases
    FROM public.receipts
    WHERE store_id = p_store_id AND status = 'active'
      AND EXTRACT(YEAR FROM created_at)::int = p_year
      AND EXTRACT(MONTH FROM created_at)::int = p_month;

  v_net_tax_payable := v_total_tax_collected - v_total_tax_returned;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'year', p_year,
    'month', p_month,
    'total_sales', v_total_sales,
    'total_tax_collected', v_total_tax_collected,
    'total_devolutions', v_total_devolutions,
    'total_tax_returned', v_total_tax_returned,
    'total_purchases', v_total_purchases,
    'net_tax_payable', v_net_tax_payable
  );
END;
$function$


-- ===== oid=142035 public.get_transactions(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_transactions(p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_date_from timestamp without time zone DEFAULT NULL::timestamp without time zone, p_date_to timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 1000)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, total_amount numeric, status text, payment_method text, subtotal numeric, discount_value numeric, store_id uuid, seller_id uuid, seller_name text, cash_amount numeric, transfer_amount numeric, zelle_amount numeric, sale_currency text, sale_exchange_rate numeric, completed_at timestamp with time zone, customer_name text, invoice_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.created_at,
        t.total_amount,
        t.status::text,
        t.payment_method::text,
        t.subtotal,
        t.discount_value,
        t.store_id,
        t.seller_id,
        p.full_name as seller_name,
        t.cash_amount,
        t.transfer_amount,
        t.zelle_amount,
        t.sale_currency,
        t.sale_exchange_rate,
        t.completed_at,
        t.customer_name,
        t.invoice_number
    FROM public.transactions t
    LEFT JOIN public.profiles p ON t.seller_id = p.id
    WHERE
        (v_is_admin OR public.has_store_access(t.store_id))
        AND (p_store_id IS NULL OR t.store_id = p_store_id)
        AND (p_date_from IS NULL OR t.created_at >= p_date_from)
        AND (p_date_to IS NULL OR t.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR p.full_name ILIKE ('%' || p_search_term || '%')
            OR t.id::text ILIKE ('%' || p_search_term || '%')
        )
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$function$


-- ===== oid=142661 public.get_paginated_products_v2(p_limit integer, p_offset integer, p_store_id uuid, p_search_term text, p_category text, p_sort_key text, p_sort_dir text, p_stock_filter text, p_active_filter text) =====
CREATE OR REPLACE FUNCTION public.get_paginated_products_v2(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_sort_key text DEFAULT 'name'::text, p_sort_dir text DEFAULT 'asc'::text, p_stock_filter text DEFAULT 'all'::text, p_active_filter text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, name text, sku text, barcode text, barcode_type text, category text, price numeric, precio_empresa numeric, precio_empresa_currency text, price_currency text, cost_price numeric, min_stock numeric, image_url text, description text, unit_of_measure text, supplier text, stock_current numeric, cost_average numeric, store_id uuid, is_active boolean, has_movements boolean, visible_en_tienda boolean, price_visible boolean, stock_visible boolean, on_promotion boolean, created_at timestamp with time zone, updated_at timestamp with time zone, is_complete boolean, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
      END IF;
      IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
      END IF;

      RETURN QUERY
      SELECT
        p.id, p.name, p.sku, p.barcode, p.barcode_type,
        p.category, p.price, p.precio_empresa, p.precio_empresa_currency, COALESCE(p.price_currency, 'CUP'),
        p.cost_price, p.min_stock, p.image_url, p.description,
        p.unit_of_measure, p.supplier,
        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                  WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
        p.cost_average,
        p.store_id, p.is_active,
        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
        p.visible_en_tienda,
        COALESCE(p.price_visible, true),
        COALESCE(p.stock_visible, true),
        COALESCE(p.on_promotion, false),
        p.created_at, p.updated_at,
        (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
         AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
         AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
        COUNT(*) OVER()::bigint AS total_count
      FROM public.products p
      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
        AND public.has_store_access(p.store_id)
        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
             (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
        AND (p_search_term IS NULL OR p_search_term = '' OR
             p.name ILIKE ('%' || p_search_term || '%') OR
             p.sku ILIKE ('%' || p_search_term || '%') OR
             COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%'))
        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
        AND (p_active_filter = 'all' OR
             (p_active_filter = 'active' AND p.is_active = true) OR
             (p_active_filter = 'inactive' AND p.is_active = false))
        AND (p_stock_filter = 'all' OR
             (p_stock_filter = 'out' AND
              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= 0) OR
             (p_stock_filter = 'low' AND
              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > 0 AND
              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= COALESCE(p.min_stock, 0)) OR
             (p_stock_filter = 'ok' AND
              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > COALESCE(p.min_stock, 0)))
      ORDER BY
        CASE WHEN p_sort_dir = 'asc' THEN
          CASE p_sort_key
            WHEN 'name' THEN p.name
            WHEN 'sku' THEN COALESCE(p.sku, '')
            WHEN 'price' THEN LPAD(p.price::text, 20, '0')
            WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
            WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
            ELSE p.name
          END
        END ASC NULLS LAST,
        CASE WHEN p_sort_dir = 'desc' THEN
          CASE p_sort_key
            WHEN 'name' THEN p.name
            WHEN 'sku' THEN COALESCE(p.sku, '')
            WHEN 'price' THEN LPAD(p.price::text, 20, '0')
            WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
            WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
            ELSE p.name
          END
        END DESC NULLS LAST,
        p.id ASC
      LIMIT p_limit OFFSET p_offset;
    END;
    $function$


-- ===== oid=142663 public.get_products_for_pos(p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_products_for_pos(p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, sku text, price numeric, cost_price numeric, image_url text, category text, unit_of_measure text, supplier text, created_at timestamp with time zone, updated_at timestamp with time zone, stock_current numeric, cost_average numeric, min_stock integer, store_id uuid, is_active boolean, has_movements boolean, product_variants jsonb, price_currency text, barcode text, barcode_type text, visible_en_tienda boolean, precio_empresa numeric, precio_empresa_currency text, on_promotion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
        DECLARE
          v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
          v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
          v_search text := trim(coalesce(p_search_term, ''));
        BEGIN
          IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
          END IF;
          IF p_store_id IS NULL AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
          END IF;
          IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
            RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
          END IF;

          RETURN QUERY
          SELECT
            p.id, p.name, p.description, p.sku, p.price, p.cost_price, p.image_url,
            p.category, p.unit_of_measure, p.supplier, p.created_at, p.updated_at,
            COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
            p.cost_average, p.min_stock::integer, p.store_id, p.is_active,
            EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
                    UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
                    UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'conversion_factor', pv.conversion_factor)) FROM public.product_variants pv WHERE pv.product_id = p.id), '[]'::jsonb),
            COALESCE(p.price_currency, 'CUP'),
            p.barcode,
            p.barcode_type,
            p.visible_en_tienda,
            p.precio_empresa,
            p.precio_empresa_currency,
            COALESCE(p.on_promotion, false)
          FROM public.products p
          WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
            AND public.has_store_access(p.store_id)
            AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
            AND (
              v_search = ''
              OR p.name ILIKE ('%' || v_search || '%')
              OR p.sku ILIKE ('%' || v_search || '%')
              OR COALESCE(p.barcode, '') = v_search
            )
            AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
          ORDER BY p.name
          LIMIT v_limit OFFSET v_offset;
        END;
    $function$


-- ===== oid=17741 public.is_admin() =====
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
END;
$function$


-- ===== oid=21751 public.get_user_role() =====
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS user_role
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN v_role;
END;
$function$


-- ===== oid=21790 public.has_any_role(required_roles user_role[]) =====
CREATE OR REPLACE FUNCTION public.has_any_role(required_roles user_role[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_actual_role user_role;
    r user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = auth.uid();
    
    FOREACH r IN ARRAY required_roles
    LOOP
        IF v_actual_role = r THEN RETURN true; END IF;
        IF v_actual_role = 'encargado' AND r = 'manager' THEN RETURN true; END IF;
        IF v_actual_role = 'usuario' AND (r = 'clerk' OR r = 'warehouse') THEN RETURN true; END IF;
    END LOOP;
    
    RETURN false;
END;
$function$


-- ===== oid=28126 public.log_transaction_changes() =====
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


-- ===== oid=38675 public.has_store_access(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global tiene acceso a todo
  IF public.is_admin() THEN
    RETURN true;
  END IF;

  -- Verificar membership activa en la tienda
  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    JOIN public.stores s
      ON s.id = m.store_id
    JOIN public.profiles p
      ON p.id = m.user_id
    WHERE m.user_id = v_user_id
      AND m.store_id = p_store_id
      AND m.status::text = 'active'
      AND (
        p.tenant_id IS NULL
        OR s.tenant_id IS NULL
        OR p.tenant_id = s.tenant_id
      )
  );
END;
$function$


-- ===== oid=43261 public.manage_user_memberships(p_user_id uuid, p_memberships jsonb) =====
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


-- ===== oid=44368 public.get_users_for_encargado(p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_users_for_encargado(p_user_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT usa.user_id
    FROM user_store_access usa
    WHERE usa.store_id IN (
        SELECT store_id
        FROM user_store_access
        WHERE user_id = p_user_id
    );
END;
$function$


-- ===== oid=47064 public.is_manager_of_store(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_manager_of_store(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = auth.uid()
          AND store_id = p_store_id
          AND role IN ('encargado', 'manager')
          AND status = 'active'
    );
END;
$function$


-- ===== oid=47076 public.is_store_manager(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_store_manager(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE user_id = auth.uid()
      AND store_id = p_store_id
      AND role IN ('encargado', 'manager')
      AND status = 'active'
  );
END;
$function$


-- ===== oid=49875 public.get_transferable_stores(p_user_id uuid, p_current_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_transferable_stores(p_user_id uuid, p_current_store_id uuid)
 RETURNS SETOF stores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- 1. Obtener tenant_id de la tienda actual
  SELECT tenant_id INTO v_tenant_id
  FROM public.stores
  WHERE id = p_current_store_id AND is_active = true;

  -- 2. Devolver tiendas donde el caller tiene acceso (has_store_access_as)
  --    EXCLUYENDO la tienda actual
  --    Si tenant_id es NOT NULL, filtrar por mismo tenant.
  --    Si tenant_id es NULL (legacy), mostrar todas las que el caller tiene acceso.
  IF v_tenant_id IS NOT NULL THEN
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.tenant_id = v_tenant_id
      AND s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  ELSE
    -- Legacy: tiendas sin tenant_id — usar solo has_store_access_as
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.id != p_current_store_id
      AND s.is_active = true
      AND s.is_archived = false
      AND public.has_store_access_as(p_user_id, s.id)
    ORDER BY s.name;
  END IF;
END;
$function$


-- ===== oid=53941 public.is_user_creator(p_target_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_user_creator(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_target_user_id AND created_by = auth.uid()
  );
END;
$function$


-- ===== oid=53942 public.is_managed_user(p_target_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_managed_user(p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_store_memberships usm_target
    WHERE usm_target.user_id = p_target_user_id
      AND EXISTS (
        SELECT 1 FROM public.user_store_memberships usm_me
        WHERE usm_me.user_id = auth.uid()
          AND usm_me.store_id = usm_target.store_id
          AND usm_me.role IN ('encargado', 'manager')
          AND usm_me.status = 'active'
      )
  );
END;
$function$


-- ===== oid=54235 public.has_role(p_user_id uuid, p_required_role user_role) =====
CREATE OR REPLACE FUNCTION public.has_role(p_user_id uuid, p_required_role user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_actual_role public.user_role;
BEGIN
    SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;
    IF v_actual_role IS NULL THEN RETURN false; END IF;

    -- Role Hierarchy Logic
    IF v_actual_role = 'admin' THEN RETURN true; END IF;
    IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
    IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;

    RETURN v_actual_role = p_required_role;
END; $function$


-- ===== oid=54236 public.has_role(p_required_role user_role) =====
CREATE OR REPLACE FUNCTION public.has_role(p_required_role user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN public.has_role(auth.uid(), p_required_role);
END; $function$


-- ===== oid=59842 public.get_transactions_with_profit(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_transactions_with_profit(p_store_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text, p_date_from timestamp without time zone DEFAULT NULL::timestamp without time zone, p_date_to timestamp without time zone DEFAULT NULL::timestamp without time zone, p_limit integer DEFAULT 1000)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, total_amount numeric, status text, payment_method text, subtotal numeric, discount_value numeric, store_id uuid, seller_id uuid, seller_name text, total_cost numeric, profit numeric, margin_percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    WITH filtered_tx AS (
        SELECT
            t.id,
            t.created_at,
            t.total_amount,
            t.status::text,
            t.payment_method::text,
            t.subtotal,
            t.discount_value,
            t.store_id,
            t.seller_id,
            p.full_name as seller_name
        FROM public.transactions t
        LEFT JOIN public.profiles p ON t.seller_id = p.id
        WHERE
            (v_is_admin OR public.has_store_access(t.store_id))
            AND (p_store_id IS NULL OR t.store_id = p_store_id)
            AND (p_date_from IS NULL OR t.created_at >= p_date_from)
            AND (p_date_to IS NULL OR t.created_at <= p_date_to)
            AND (
                p_search_term IS NULL OR p_search_term = ''
                OR p.full_name ILIKE ('%' || p_search_term || '%')
                OR t.id::text ILIKE ('%' || p_search_term || '%')
            )
        ORDER BY t.created_at DESC
        LIMIT p_limit
    ),
    tx_costs AS (
        SELECT
            ti.transaction_id,
            SUM(ti.quantity * COALESCE(NULLIF(ti.cost_at_sale, 0), pr.cost_price, 0)) as transaction_cost
        FROM public.transaction_items ti
        JOIN public.products pr ON ti.product_id = pr.id
        WHERE ti.transaction_id IN (SELECT f.id FROM filtered_tx f)
        GROUP BY ti.transaction_id
    )
    SELECT
        ft.id,
        ft.created_at,
        ft.total_amount,
        ft.status,
        ft.payment_method,
        ft.subtotal,
        ft.discount_value,
        ft.store_id,
        ft.seller_id,
        ft.seller_name,
        COALESCE(tc.transaction_cost, 0)::numeric as total_cost,
        (ft.total_amount - COALESCE(tc.transaction_cost, 0))::numeric as profit,
        (CASE 
            WHEN ft.total_amount > 0 THEN ((ft.total_amount - COALESCE(tc.transaction_cost, 0)) / ft.total_amount) * 100
            ELSE 0 
        END)::numeric as margin_percentage
    FROM filtered_tx ft
    LEFT JOIN tx_costs tc ON ft.id = tc.transaction_id
    ORDER BY ft.created_at DESC;
END;
$function$


-- ===== oid=75761 public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_old_role user_role;
  v_old_role_id uuid;
BEGIN
  SELECT role, role_id INTO v_old_role, v_old_role_id
  FROM public.profiles
  WHERE id = p_user_id;
  
  RETURN (p_new_role IS NOT DISTINCT FROM v_old_role) 
     AND (p_new_role_id IS NOT DISTINCT FROM v_old_role_id);
END;
$function$


-- ===== oid=76874 public.is_admin_check(p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_admin_check(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = p_user_id 
    AND (role = 'admin' OR role_id = (SELECT id FROM public.roles WHERE name ILIKE 'admin' LIMIT 1))
  );
$function$


-- ===== oid=88135 public.log_audit_event(p_action text, p_payload jsonb, p_store_id uuid) =====
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


-- ===== oid=94972 public.increment_user_usage(p_user_id uuid, p_action_type text, p_limit integer) =====
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


-- ===== oid=130868 public.get_transfers(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone, p_status text, p_limit integer) =====
CREATE OR REPLACE FUNCTION public.get_transfers(p_store_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_results JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT
      t.id,
      t.origin_store_id,
      t.destination_store_id,
      t.created_by,
      t.status,
      t.notes,
      t.created_at,
      t.updated_at,
      os.name AS origin_store_name,
      ds.name AS destination_store_name,
      p.full_name AS creator_name,
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'product_id', ti.product_id,
          'product_name', pr.name,
          'sku', pr.sku,
          'quantity', ti.quantity,
          'unit_cost', ti.unit_cost
        ) ORDER BY ti.created_at
      ) FILTER (WHERE ti.id IS NOT NULL), '[]'::jsonb) AS items
    FROM transfers t
    LEFT JOIN stores os ON os.id = t.origin_store_id
    LEFT JOIN stores ds ON ds.id = t.destination_store_id
    LEFT JOIN profiles p ON p.id = t.created_by
    LEFT JOIN transfer_items ti ON ti.transfer_id = t.id
    LEFT JOIN products pr ON pr.id = ti.product_id
    WHERE
      (p_store_id IS NULL OR t.origin_store_id = p_store_id OR t.destination_store_id = p_store_id)
      AND (p_date_from IS NULL OR t.created_at >= p_date_from)
      AND (p_date_to IS NULL OR t.created_at <= p_date_to)
      AND (p_status IS NULL OR t.status = p_status)
    GROUP BY t.id, os.name, ds.name, p.full_name
    ORDER BY t.created_at DESC
    LIMIT p_limit
  ) t;
  RETURN v_results;
END;
$function$


-- ===== oid=131886 public.is_global_admin() =====
CREATE OR REPLACE FUNCTION public.is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$


-- ===== oid=131887 public.is_store_member(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_store_memberships
    WHERE store_id = p_store_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$function$


-- ===== oid=131888 public.has_store_role(p_store_id uuid, p_roles text[]) =====
CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.user_id = auth.uid()
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role::text = ANY(p_roles)
  );
END;
$function$


-- ===== oid=132924 public.get_usage_summary(p_hours integer) =====
CREATE OR REPLACE FUNCTION public.get_usage_summary(p_hours integer DEFAULT 24)
 RETURNS TABLE(metric_type text, service text, total_count bigint, total_sum double precision, bucket_count bigint, first_bucket timestamp with time zone, last_bucket timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ua.metric_type,
    ua.service,
    SUM(ua.count)::BIGINT AS total_count,
    SUM(ua.sum_value) AS total_sum,
    COUNT(*)::BIGINT AS bucket_count,
    MIN(ua.bucket_start) AS first_bucket,
    MAX(ua.bucket_start) AS last_bucket
  FROM public.usage_aggregates ua
  WHERE ua.bucket_start >= now() - (p_hours || ' hours')::INTERVAL
  GROUP BY ua.metric_type, ua.service
  ORDER BY ua.metric_type, ua.service;
END;
$function$


-- ===== oid=132940 public.get_usage_forecast() =====
CREATE OR REPLACE FUNCTION public.get_usage_forecast()
 RETURNS TABLE(o_metric_type text, o_service text, o_today_usage double precision, o_avg_daily_7d double precision, o_month_so_far double precision, o_projected_monthly double precision, o_monthly_limit double precision, o_projected_pct double precision, o_unit text, o_threshold_warning integer, o_threshold_risk integer, o_threshold_critical integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_day_of_month INTEGER := EXTRACT(DAY FROM now());
  v_days_in_month INTEGER := EXTRACT(DAY FROM (date_trunc('month', now()) + INTERVAL '1 month - 1 day'));
  v_days_remaining INTEGER;
BEGIN
  v_days_remaining := v_days_in_month - v_day_of_month;
  RETURN QUERY
  SELECT
    t.metric_type,
    t.service,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(today.sum_value, 0)
      ELSE COALESCE(today.sum_count, 0)
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(last7.avg_daily_value, 0)
      ELSE COALESCE(last7.avg_daily_count, 0)
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(month_so_far.sum_value, 0)
      ELSE COALESCE(month_so_far.sum_count, 0)
    END,
    CASE
      WHEN t.unit IN ('bytes', 'ms') THEN
        COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining
      ELSE
        COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining
    END,
    t.monthly_limit,
    CASE
      WHEN t.monthly_limit > 0 AND t.unit IN ('bytes', 'ms') THEN
        ROUND((COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining) / t.monthly_limit * 100, 2)
      WHEN t.monthly_limit > 0 THEN
        ROUND((COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining) / t.monthly_limit * 100, 2)
      ELSE 0
    END,
    t.unit,
    t.warning_pct,
    t.risk_pct,
    t.critical_pct
  FROM public.usage_thresholds t
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= date_trunc('day', now())
    GROUP BY metric_type
  ) today ON today.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION / 7.0 AS avg_daily_count,
      SUM(sum_value)::DOUBLE PRECISION / 7.0 AS avg_daily_value
    FROM public.usage_aggregates
    WHERE bucket_start >= now() - INTERVAL '7 days'
    GROUP BY metric_type
  ) last7 ON last7.metric_type = t.metric_type
  LEFT JOIN (
    SELECT metric_type,
      SUM(count)::DOUBLE PRECISION AS sum_count,
      SUM(sum_value)::DOUBLE PRECISION AS sum_value
    FROM public.usage_aggregates
    WHERE bucket_start >= v_month_start
    GROUP BY metric_type
  ) month_so_far ON month_so_far.metric_type = t.metric_type;
END;
$function$


-- ===== oid=133916 public.handle_updated_at() =====
CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=134487 public.int2_dist(smallint, smallint) =====
CREATE OR REPLACE FUNCTION public.int2_dist(smallint, smallint)
 RETURNS smallint
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int2_dist$function$


-- ===== oid=134489 public.int4_dist(integer, integer) =====
CREATE OR REPLACE FUNCTION public.int4_dist(integer, integer)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int4_dist$function$


-- ===== oid=134491 public.int8_dist(bigint, bigint) =====
CREATE OR REPLACE FUNCTION public.int8_dist(bigint, bigint)
 RETURNS bigint
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int8_dist$function$


-- ===== oid=134493 public.interval_dist(interval, interval) =====
CREATE OR REPLACE FUNCTION public.interval_dist(interval, interval)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$interval_dist$function$


-- ===== oid=135148 public.get_worker_commission_summary(p_store_id uuid, p_date_from date, p_date_to date) =====
CREATE OR REPLACE FUNCTION public.get_worker_commission_summary(p_store_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS TABLE(worker_id uuid, first_name text, last_name text, ci text, status text, sales_cash numeric, sales_transfer numeric, sales_total numeric, last_payment_date date, last_payment_amount numeric, active_rule_id uuid, active_rule_type text, active_rule_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_date_from DATE := COALESCE(p_date_from, date_trunc('month', now())::date);
  v_date_to DATE := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  RETURN QUERY
  SELECT
    w.id AS worker_id,
    w.first_name,
    w.last_name,
    w.ci,
    w.status,
    COALESCE(SUM(st.payment_cash), 0)::NUMERIC AS sales_cash,
    COALESCE(SUM(st.payment_transfer), 0)::NUMERIC AS sales_transfer,
    COALESCE(SUM(st.amount_total), 0)::NUMERIC AS sales_total,
    (SELECT cp.period_end FROM public.commission_payments cp
      WHERE cp.worker_id = w.id AND cp.status != 'cancelled'
      ORDER BY cp.period_end DESC LIMIT 1) AS last_payment_date,
    (SELECT cp.final_amount FROM public.commission_payments cp
      WHERE cp.worker_id = w.id AND cp.status != 'cancelled'
      ORDER BY cp.period_end DESC LIMIT 1) AS last_payment_amount,
    (SELECT cr.id FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_id,
    (SELECT cr.type FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_type,
    (SELECT COALESCE(cr.value_percent, cr.fixed_value, cr.salary_amount)
      FROM public.commission_rules cr
      WHERE cr.store_id = p_store_id
        AND (cr.worker_id = w.id OR cr.worker_id IS NULL)
        AND cr.valid_from <= v_date_to
        AND (cr.valid_to IS NULL OR cr.valid_to >= v_date_from)
      ORDER BY cr.priority DESC, cr.worker_id NULLS LAST, cr.valid_from DESC
      LIMIT 1) AS active_rule_value
  FROM public.workers w
  LEFT JOIN public.sales_transactions st
    ON st.worker_id = w.id AND st.sale_date BETWEEN v_date_from AND v_date_to
  WHERE w.store_id = p_store_id
  GROUP BY w.id, w.first_name, w.last_name, w.ci, w.status;
END;
$function$


-- ===== oid=136268 public.has_store_access_as(p_user_id uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
    
    -- Check if admin
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role = 'admin' THEN RETURN true; END IF;
    
    -- Check membership
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$function$


-- ===== oid=138111 public.get_user_audit_history(p_user_id uuid, p_limit integer, p_offset integer) =====
CREATE OR REPLACE FUNCTION public.get_user_audit_history(p_user_id uuid, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, performed_by uuid, performed_by_name text, action text, old_values jsonb, new_values jsonb, metadata jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    ual.id,
    ual.created_at,
    ual.performed_by,
    COALESCE(p.full_name, '[unknown]') as performed_by_name,
    ual.action,
    ual.old_values,
    ual.new_values,
    ual.metadata
  FROM public.user_audit_log ual
  LEFT JOIN public.profiles p ON p.id = ual.performed_by
  WHERE ual.target_user_id = p_user_id
  ORDER BY ual.created_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$


-- ===== oid=138149 public.has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[]) =====
CREATE OR REPLACE FUNCTION public.has_store_role_as(p_user_id uuid, p_store_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin global bypasses
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role IN ('admin', 'superadmin')) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_store_memberships m
    WHERE m.user_id = p_user_id
      AND m.store_id = p_store_id
      AND m.status = 'active'
      AND m.role::text = ANY(p_roles)
  );
END;
$function$


-- ===== oid=138374 public.is_admin_with_access(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_admin_with_access(p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_user_tenant uuid;
  v_store_tenant uuid;
BEGIN
  v_is_admin := public.is_admin();
  IF NOT v_is_admin THEN
    RETURN public.has_store_access(p_store_id);
  END IF;
  v_user_tenant := public.current_user_tenant_id();
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;
  RETURN v_store_tenant IS NULL OR v_store_tenant = v_user_tenant;
END;
$function$


-- ===== oid=138375 public.is_tenant_member(p_tenant_id uuid) =====
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_tenant_id IS NOT NULL
   AND p_tenant_id = public.current_user_tenant_id();
$function$


-- ===== oid=138598 public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.link_receipts_to_service(p_service_id uuid, p_receipt_ids jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_receipt_id uuid;
  v_count integer := 0;
  v_allocated_per_receipt numeric;
  v_total_receipts integer;
  v_service_total numeric;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, total_amount INTO v_store_id, v_status, v_service_total
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_ACTIVE: cannot link to % service', v_status;
  END IF;

  IF p_receipt_ids IS NULL OR jsonb_array_length(p_receipt_ids) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_RECEIPT_IDS';
  END IF;

  v_total_receipts := jsonb_array_length(p_receipt_ids);
  v_allocated_per_receipt := v_service_total / v_total_receipts;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM receipts
      WHERE id = v_receipt_id AND store_id = v_store_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'ERR_RECEIPT_INVALID: % no pertenece a la store o no esta activo', v_receipt_id;
    END IF;
  END LOOP;

  FOR v_receipt_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_receipt_ids) ORDER BY value LOOP
    INSERT INTO service_reception_links (service_id, receipt_id, allocation_percentage, allocated_amount)
    VALUES (p_service_id, v_receipt_id, 100.0 / v_total_receipts, v_allocated_per_receipt);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_LINKED', 'received_services', p_service_id,
    jsonb_build_object('receipt_ids_linked', v_count, 'receipt_ids', p_receipt_ids));

  RETURN jsonb_build_object('status', 'success', 'links_created', v_count);
END;
$function$


-- ===== oid=142421 public.has_management_access_as(p_user_id uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.has_management_access_as(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.role() = 'service_role' THEN true
    ELSE
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = p_user_id
        AND role IN ('admin', 'manager', 'encargado')
      )
      OR EXISTS (
        SELECT 1 FROM user_store_memberships
        WHERE user_id = p_user_id
        AND store_id = p_store_id
        AND status = 'active'
        AND role IN ('admin', 'manager')
      )
    END
$function$


-- ===== oid=142475 public.has_store_role(p_user_id uuid, p_store_id uuid, p_roles text[]) =====
CREATE OR REPLACE FUNCTION public.has_store_role(p_user_id uuid, p_store_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN auth.role() = 'service_role' THEN
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = p_user_id
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  ELSE
    EXISTS (
      SELECT 1 FROM public.user_store_memberships m
      WHERE m.user_id = auth.uid()
        AND m.store_id = p_store_id
        AND m.status = 'active'
        AND m.role::text = ANY(p_roles)
    )
  END
$function$


-- ===== oid=143995 public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.lock_fiscal_period(p_store_id uuid, p_year integer, p_month integer, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    -- Patrón canónico anti-spoofing v2_12_9: bajo service_role la identidad la
    -- provee el código servidor (route.ts ← sesión NextAuth); bajo authenticated,
    -- el JWT del propio usuario. Nunca confianza en identidad enviada por cliente.
    v_admin_id UUID := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
BEGIN
    -- REM-F4-06c (§19): puente de identidad transaccional para que la auditoría
    -- por trigger (audit_fiscal_closings_changes → auth.uid()) registre el ACTOR
    -- real también en la vía HTTP service_role (canónico del codebase:
    -- CREATE_SALE_V2 audit 100% con actor). Valor SOLO server-side; local a la txn.
    IF v_admin_id IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_admin_id;
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_ADMIN_ONLY: Solo admin puede bloquear periodos fiscales';
    END IF;

    UPDATE public.fiscal_closings
    SET status = 'locked', locked_by = v_admin_id, locked_at = now(), updated_at = now()
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month AND status = 'closed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_CLOSED: El periodo debe estar cerrado antes de bloquearse';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'message', 'Periodo bloqueado');
END;
$function$


-- ===== oid=21386 public.prevent_inventory_direct_write() =====
CREATE OR REPLACE FUNCTION public.prevent_inventory_direct_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RAISE EXCEPTION 'Direct writes to inventory are not allowed. Use stock_movements.';
END;
$function$


-- ===== oid=21754 public.prevent_direct_inventory_modification() =====
CREATE OR REPLACE FUNCTION public.prevent_direct_inventory_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 OR current_setting('role', true) = 'postgres' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ERR_DIRECT_INVENTORY_MODIFICATION: El inventario es inmutable. Registra un movimiento en stock_movements para cambiar las cantidades.';
END;
$function$


-- ===== oid=25495 public.prevent_negative_inventory() =====
CREATE OR REPLACE FUNCTION public.prevent_negative_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity < 0 THEN
    RAISE EXCEPTION 'Stock negativo no permitido | product_id=% | store_id=%', NEW.product_id, NEW.store_id;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=38673 public.managed_create_store(p_name text, p_address text) =====
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


-- ===== oid=45939 public.managed_delete_product(p_product_id uuid) =====
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


-- ===== oid=45940 public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean) =====
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


-- ===== oid=70049 public.on_auth_user_created() =====
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_role_id UUID;
  v_role_enum USER_ROLE;
  v_metadata_role TEXT;
  v_company_name TEXT;
  v_full_name TEXT;
  v_tenant_id UUID;
BEGIN
  -- Extract role from metadata if present
  v_metadata_role := NEW.raw_user_meta_data->>'role';

  -- Normalize and convert to enum
  IF v_metadata_role IS NOT NULL THEN
    BEGIN
      v_role_enum := v_metadata_role::USER_ROLE;
    EXCEPTION WHEN OTHERS THEN
      v_role_enum := 'tenant_admin'::USER_ROLE;
    END;
  ELSE
    -- Iteración 13: self-signup users are tenant_admin by default
    v_role_enum := 'tenant_admin'::USER_ROLE;
  END IF;

  -- Extract company_name and full_name from metadata
  v_company_name := NEW.raw_user_meta_data->>'company_name';
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Iteración 13: Create tenant for self-signup users
  -- If user was created by admin (via managed_create_user_v2), they may already
  -- have a tenant_id set via p_target_user_id. In that case, skip tenant creation.
  IF v_company_name IS NOT NULL THEN
    INSERT INTO public.tenants (name, owner_id, plan, subscription_status, trial_ends_at, is_active)
    VALUES (
      v_company_name,
      NEW.id,
      'free'::plan_t,
      'trial',
      now() + interval '14 days',
      true
    )
    RETURNING id INTO v_tenant_id;
  END IF;

  -- Get matching role_id from public.roles
  SELECT id INTO v_role_id FROM public.roles
    WHERE name = v_metadata_role OR lower(name) = lower(v_role_enum::text)
    LIMIT 1;

  -- Insert profile with tenant_id
  INSERT INTO public.profiles (id, email, full_name, role, role_id, is_active, tenant_id, plan, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role_enum,
    v_role_id,
    true,
    v_tenant_id,
    'free'::plan_t,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id),
    plan = EXCLUDED.plan,
    is_active = true,
    updated_at = now();

  -- Audit log
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    NEW.id, NEW.id, 'USER_REGISTERED_PUBLICLY',
    jsonb_build_object('email', NEW.email, 'role', v_role_enum::text, 'tenant_id', v_tenant_id),
    jsonb_build_object('company_name', v_company_name, 'source', 'self_signup')
  );

  RETURN NEW;
END;
$function$


-- ===== oid=79083 public.managed_delete_user(p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_delete_user(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Security Check: Allow if service role (auth.uid() is null) or if current user is admin
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Solo los administradores pueden eliminar usuarios.';
    END IF;

    -- Cannot delete self
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ERR_CANNOT_DELETE_SELF: No puedes eliminar tu propio usuario.';
    END IF;

    -- Safety Check
    IF NOT public.can_safely_delete_user(p_user_id) THEN
        RAISE EXCEPTION 'ERR_USER_HAS_RECORDS: El usuario tiene registros operativos y no puede ser eliminado por integridad de datos. Se recomienda desactivarlo.';
    END IF;

    -- Perform deletion (Cascades to memberships and other metadata)
    -- We explicitly delete memberships first just in case
    DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
    
    -- Deleting from profiles
    DELETE FROM public.profiles WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Perfil de usuario eliminado correctamente.');
END;
$function$


-- ===== oid=88184 public.managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb) =====
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


-- ===== oid=119652 public.process_pick3_transaction(p_user_id uuid, p_type text, p_amount bigint, p_reference_draw_id uuid, p_reference_play_id uuid, p_notes text, p_metadata jsonb) =====
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


-- ===== oid=119653 public.on_pick3_profile_initial_bankroll() =====
CREATE OR REPLACE FUNCTION public.on_pick3_profile_initial_bankroll()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- If initial_bankroll is set and it's the first time, or it changed from 0
    IF (TG_OP = 'INSERT' AND NEW.initial_bankroll > 0) OR 
       (TG_OP = 'UPDATE' AND (OLD IS NULL OR OLD.initial_bankroll = 0) AND NEW.initial_bankroll > 0) THEN
        
        -- We only do this if balance is 0 to avoid double counting
        IF NEW.current_bankroll = 0 THEN
             PERFORM public.process_pick3_transaction(
                NEW.user_id,
                'initial_deposit',
                NEW.initial_bankroll,
                NULL, NULL,
                'Configuración inicial de capital'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=131361 public.process_sale_transaction(p_store_id uuid, p_user_id uuid, p_items jsonb, p_total_amount numeric, p_subtotal numeric, p_payment_method text, p_discount_type text, p_discount_value numeric, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.process_sale_transaction(p_store_id uuid, p_user_id uuid, p_items jsonb, p_total_amount numeric, p_subtotal numeric, p_payment_method text, p_discount_type text, p_discount_value numeric, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_transaction_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_qty_to_deduct numeric;
    v_current_stock numeric;
BEGIN
    INSERT INTO public.transactions (store_id, seller_id, total_amount, status, subtotal, idempotency_key)
    VALUES (p_store_id, p_user_id, p_total_amount, 'completed', p_subtotal, p_idempotency_key)
    RETURNING id INTO v_transaction_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        v_quantity := (v_item->>'quantity')::numeric;
        v_qty_to_deduct := v_quantity * COALESCE((v_item->>'factor')::numeric, 1);

        SELECT quantity INTO v_current_stock FROM public.inventory WHERE product_id = v_product_id AND store_id = p_store_id FOR UPDATE;
        IF COALESCE(v_current_stock, 0) < v_qty_to_deduct THEN
            RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK';
        END IF;

        INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale)
        VALUES (v_transaction_id, v_product_id, v_quantity, (v_item->>'price')::numeric);

        PERFORM public.register_stock_movement(p_store_id := p_store_id, p_product_id := v_product_id, p_quantity := -v_qty_to_deduct, p_movement_type := 'sale', p_user_id := p_user_id, p_sale_id := v_transaction_id);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id);
END;
$function$


-- ===== oid=131362 public.process_initial_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_reference_doc text, p_movement_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.process_initial_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_reference_doc text DEFAULT 'Stock Inicial'::text, p_movement_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM public.register_stock_movement(
        p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(),
        p_quantity := p_quantity, p_movement_type := 'initial', p_reason := p_reference_doc
    );
    RETURN jsonb_build_object('success', true, 'new_quantity', p_quantity);
END;
$function$


-- ===== oid=131363 public.process_bulk_import(p_store_id uuid, p_user_id uuid, p_items jsonb) =====
CREATE OR REPLACE FUNCTION public.process_bulk_import(p_store_id uuid, p_user_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_item jsonb;
    v_product_id uuid;
    v_count integer := 0;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO public.products (name, sku, price, cost_price, store_id)
        VALUES (v_item->>'name', v_item->>'sku', (v_item->>'price')::numeric, (v_item->>'cost_price')::numeric, p_store_id)
        RETURNING id INTO v_product_id;

        IF (v_item->>'quantity')::numeric > 0 THEN
            PERFORM public.register_stock_movement(p_store_id := p_store_id, p_product_id := v_product_id, p_quantity := (v_item->>'quantity')::numeric, p_movement_type := 'initial', p_user_id := p_user_id);
        END IF;
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$function$


-- ===== oid=132503 public.process_inventory_adjustment(p_store_id uuid, p_cashier_id uuid, p_items adjustment_item[], p_operation_date timestamp with time zone) =====
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


-- ===== oid=132504 public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.process_stock_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
BEGIN
    -- Validación forward-only locking
    PERFORM public.validate_operation_date(p_operation_date, p_store_id);

    PERFORM public.register_stock_movement(
      p_product_id := p_product_id,
      p_store_id := p_store_id,
      p_user_id := p_user_id,
      p_quantity := p_quantity_delta,
      p_movement_type := 'adjustment',
      p_reason := p_reason,
      p_operation_date := v_effective_date
    );
    RETURN jsonb_build_object('success', true);
END;
$function$


-- ===== oid=134339 public.receive_production_output_deprecated_4arg(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.receive_production_output_deprecated_4arg(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.receive_production_output(p_order_id, p_product_id, p_quantity, p_store_id, NULL, NULL);
END $function$


-- ===== oid=134495 public.oid_dist(oid, oid) =====
CREATE OR REPLACE FUNCTION public.oid_dist(oid, oid)
 RETURNS oid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$oid_dist$function$


-- ===== oid=135446 public.purge_old_reset_snapshots(p_days integer) =====
CREATE OR REPLACE FUNCTION public.purge_old_reset_snapshots(p_days integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.store_reset_snapshots WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$


-- ===== oid=136485 public.mark_expired_lots(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.mark_expired_lots(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.product_lots
    SET status = 'expired', updated_at = now()
    WHERE expiration_date IS NOT NULL
      AND expiration_date < CURRENT_DATE
      AND status = 'active'
      AND (p_store_id IS NULL OR store_id = p_store_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$


-- ===== oid=136711 public.perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone) =====
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


-- ===== oid=137077 public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid, p_lot_number text, p_expiration_date date, p_user_id uuid, p_reason text) =====
CREATE OR REPLACE FUNCTION public.receive_to_warehouse(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_unit_cost numeric, p_warehouse_id uuid DEFAULT NULL::uuid, p_lot_number text DEFAULT NULL::text, p_expiration_date date DEFAULT NULL::date, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_movement_id UUID;
  v_new_stock NUMERIC;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT explícito
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Validar producto pertenece a la store
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND store_id = p_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND';
  END IF;

  -- Registrar movimiento
  v_movement_id := public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := v_uid,
    p_quantity := p_quantity,
    p_movement_type := 'purchase',
    p_reference_doc := NULL,
    p_unit_cost := p_unit_cost,
    p_reason := COALESCE(p_reason, 'Recepción a almacén'),
    p_operation_date := NOW(),
    p_skip_access_check := TRUE
  );

  -- Actualizar stock + WAC
  SELECT stock_current INTO v_new_stock FROM public.products WHERE id = p_product_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('RECEIVE_TO_WAREHOUSE', 'products', p_product_id, p_store_id, v_uid,
    jsonb_build_object('quantity', p_quantity, 'unit_cost', p_unit_cost, 'warehouse_id', p_warehouse_id, 'lot', p_lot_number));

  RETURN jsonb_build_object('status', 'success', 'movement_id', v_movement_id, 'new_stock', v_new_stock);
END;
$function$


-- ===== oid=138033 public.prevent_hard_delete_profile() =====
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_profile()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_HARD_DELETE_BLOCKED: Use managed_soft_delete_user RPC instead. Physical DELETE on profiles is forbidden by Iteración 12 (Q6) soft delete policy.';
END;
$function$


-- ===== oid=138098 public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t, p_store_id uuid, p_memberships jsonb, p_max_stores integer, p_max_users integer, p_target_user_id uuid, p_creator_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_create_user_v2(p_email text, p_full_name text, p_role user_role, p_plan plan_t DEFAULT 'free'::plan_t, p_store_id uuid DEFAULT NULL::uuid, p_memberships jsonb DEFAULT NULL::jsonb, p_max_stores integer DEFAULT 0, p_max_users integer DEFAULT 0, p_target_user_id uuid DEFAULT NULL::uuid, p_creator_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := COALESCE(p_target_user_id, gen_random_uuid());
  v_role_id uuid;
  v_active_store_id uuid;
  m JSONB;
  v_creator_role public.user_role;
  v_creator_uid uuid := COALESCE(p_creator_id, auth.uid());
BEGIN
  -- Validar caller es admin o encargado
  SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_creator_uid;
  IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
  END IF;

  -- Validar email único (entre perfiles activos)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = p_email AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ERR_EMAIL_ALREADY_EXISTS: %', p_email;
  END IF;

  v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);

  -- Encargado solo puede crear en tiendas que gestiona
  IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
    IF NOT public.has_store_access(v_active_store_id) THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
    END IF;
  END IF;

  -- Buscar role_id
  SELECT id INTO v_role_id FROM public.roles
    WHERE lower(name) = lower(p_role::text)
       OR (name = 'Cajero' AND p_role = 'clerk')
       OR (name = 'Almacenero' AND p_role = 'warehouse')
       OR (name = 'UserCosto' AND p_role = 'costo')
    LIMIT 1;

  -- INSERT profiles con plan
  INSERT INTO public.profiles (
    id, email, full_name, role, role_id, active_store_id, is_active,
    created_by, max_stores_limit, max_users_limit, plan, created_at, updated_at
  ) VALUES (
    v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true,
    v_creator_uid, p_max_stores, p_max_users, p_plan, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_id = EXCLUDED.role_id,
    active_store_id = EXCLUDED.active_store_id,
    plan = EXCLUDED.plan,
    is_active = true,
    deleted_at = NULL,
    deletion_reason = NULL,
    deleted_by = NULL,
    updated_at = now()
  RETURNING id INTO v_user_id;

  -- Procesar memberships
  IF p_memberships IS NOT NULL THEN
    IF v_creator_role != 'admin' AND v_creator_role != 'superadmin' THEN
      DELETE FROM public.user_store_memberships
        WHERE user_id = v_user_id
        AND store_id IN (
          SELECT store_id FROM public.user_store_memberships
          WHERE user_id = v_creator_uid AND role IN ('encargado', 'manager')
        );
    ELSE
      DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
    END IF;

    FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
      IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
        IF v_creator_role IN ('admin', 'superadmin') OR public.has_store_access((m->>'store_id')::UUID) THEN
          INSERT INTO public.user_store_memberships (user_id, store_id, role)
          VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::public.user_role)
          ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
        END IF;
      END IF;
    END LOOP;
  ELSIF p_store_id IS NOT NULL THEN
    INSERT INTO public.user_store_memberships (user_id, store_id, role)
    VALUES (v_user_id, p_store_id, p_role)
    ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  END IF;

  -- Audit log atómico (regresión C-2 restaurada)
  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, new_values, metadata)
  VALUES (
    v_creator_uid, v_user_id, 'USER_CREATED',
    jsonb_build_object(
      'email', p_email, 'full_name', p_full_name, 'role', p_role::text,
      'plan', p_plan::text, 'active_store_id', v_active_store_id,
      'max_stores', p_max_stores, 'max_users', p_max_users
    ),
    jsonb_build_object('memberships_count', CASE WHEN p_memberships IS NOT NULL THEN jsonb_array_length(p_memberships) ELSE 0 END)
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$


-- ===== oid=138103 public.managed_update_user(p_user_id uuid, p_full_name text, p_role user_role, p_role_id uuid, p_is_active boolean, p_max_stores_limit integer, p_max_users_limit integer, p_plan plan_t, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_update_user(p_user_id uuid, p_full_name text DEFAULT NULL::text, p_role user_role DEFAULT NULL::user_role, p_role_id uuid DEFAULT NULL::uuid, p_is_active boolean DEFAULT NULL::boolean, p_max_stores_limit integer DEFAULT NULL::integer, p_max_users_limit integer DEFAULT NULL::integer, p_plan plan_t DEFAULT NULL::plan_t, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing — service_role puede pasar p_caller_id explícito
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  -- Validar caller es admin (usa v_caller_uid que ahora NO es spoofable para authenticated)
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can update users.';
  END IF;

  SELECT * INTO v_old FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND: %', p_user_id;
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED: Cannot deactivate own account.';
  END IF;

  IF p_full_name IS NOT NULL AND p_full_name <> v_old.full_name THEN
    v_changes := v_changes || jsonb_build_object('full_name', jsonb_build_object('old', v_old.full_name, 'new', p_full_name));
    UPDATE public.profiles SET full_name = p_full_name, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_role_id IS NOT NULL AND (v_old.role_id IS NULL OR p_role_id <> v_old.role_id) THEN
    v_changes := v_changes || jsonb_build_object('role_id', jsonb_build_object('old', v_old.role_id, 'new', p_role_id));
    UPDATE public.profiles SET role_id = p_role_id, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_is_active IS NOT NULL AND p_is_active <> v_old.is_active THEN
    v_changes := v_changes || jsonb_build_object('is_active', jsonb_build_object('old', v_old.is_active, 'new', p_is_active));
    UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_stores_limit IS NOT NULL AND (v_old.max_stores_limit IS NULL OR p_max_stores_limit <> v_old.max_stores_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_stores_limit', jsonb_build_object('old', v_old.max_stores_limit, 'new', p_max_stores_limit));
    UPDATE public.profiles SET max_stores_limit = p_max_stores_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_max_users_limit IS NOT NULL AND (v_old.max_users_limit IS NULL OR p_max_users_limit <> v_old.max_users_limit) THEN
    v_changes := v_changes || jsonb_build_object('max_users_limit', jsonb_build_object('old', v_old.max_users_limit, 'new', p_max_users_limit));
    UPDATE public.profiles SET max_users_limit = p_max_users_limit, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF p_plan IS NOT NULL AND p_plan <> v_old.plan THEN
    v_changes := v_changes || jsonb_build_object('plan', jsonb_build_object('old', v_old.plan::text, 'new', p_plan::text));
    UPDATE public.profiles SET plan = p_plan, updated_at = now() WHERE id = p_user_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, p_user_id, 'USER_UPDATED',
      jsonb_build_object(
        'full_name', v_old.full_name, 'role', v_old.role::text,
        'is_active', v_old.is_active, 'plan', v_old.plan::text
      ),
      v_changes,
      jsonb_build_object('fields_changed', jsonb_object_keys(v_changes))
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'changes', v_changes);
END;
$function$


-- ===== oid=138104 public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_toggle_user_status(p_user_id uuid, p_is_active boolean, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin', 'encargado', 'manager') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_is_active = false AND p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DEACTIVATE_BLOCKED';
  END IF;

  SELECT id, is_active, full_name INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  IF v_old.is_active = p_is_active THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.profiles SET is_active = p_is_active, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values)
  VALUES (
    v_caller_uid, p_user_id,
    CASE WHEN p_is_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    jsonb_build_object('is_active', v_old.is_active),
    jsonb_build_object('is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'is_active', p_is_active);
END;
$function$


-- ===== oid=138105 public.managed_reset_password(p_user_id uuid, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_reset_password(p_user_id uuid, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_target_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_RESET_BLOCKED';
  END IF;

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND';
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'PASSWORD_RESET_REQUESTED',
    jsonb_build_object('email', v_target_email, 'method', 'recovery_link')
  );

  RETURN jsonb_build_object('success', true, 'email', v_target_email);
END;
$function$


-- ===== oid=138106 public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_soft_delete_user(p_user_id uuid, p_reason text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_caller_role public.user_role;
  v_active_memberships_count int;
  v_anon_email text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_user_id = v_caller_uid THEN
    RAISE EXCEPTION 'ERR_SELF_DELETE_BLOCKED';
  END IF;

  SELECT id, email, full_name, role, plan, is_active INTO v_old
    FROM public.profiles WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_USER_NOT_FOUND_OR_ALREADY_DELETED';
  END IF;

  SELECT COUNT(*) INTO v_active_memberships_count
    FROM public.user_store_memberships
    WHERE user_id = p_user_id AND status = 'active';
  IF v_active_memberships_count > 0 THEN
    RAISE EXCEPTION 'ERR_USER_HAS_ACTIVE_MEMBERSHIPS: % active. Revoke memberships first.', v_active_memberships_count;
  END IF;

  v_anon_email := 'deleted+' || substr(p_user_id::text, 1, 8) || '@anonymized.local';

  UPDATE public.profiles SET
    deleted_at = now(),
    deletion_reason = p_reason,
    deleted_by = v_caller_uid,
    is_active = false,
    full_name = '[deleted user]',
    email = v_anon_email,
    ai_api_key = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, p_user_id, 'USER_SOFT_DELETED',
    jsonb_build_object(
      'email', v_old.email, 'full_name', v_old.full_name,
      'role', v_old.role::text, 'plan', v_old.plan::text, 'is_active', v_old.is_active
    ),
    jsonb_build_object(
      'email', v_anon_email, 'full_name', '[deleted user]',
      'is_active', false, 'deleted_at', now()
    ),
    jsonb_build_object('reason', p_reason, 'memberships_revoked', v_active_memberships_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'status', 'soft_deleted',
    'note', 'auth.users preserved. API route should ban via auth.admin.updateUser.'
  );
END;
$function$


-- ===== oid=138107 public.managed_update_membership(p_membership_id uuid, p_role user_role, p_status text, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_update_membership(p_membership_id uuid, p_role user_role DEFAULT NULL::user_role, p_status text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  -- service_role (API route) pasa p_caller_id=session.user.id → verifica acceso de ese user
  -- authenticated pasa p_caller_id=NULL → v_caller_uid=auth.uid() → verifica su propio acceso
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin or manager of the store.';
  END IF;

  IF p_role IS NOT NULL AND p_role <> v_old.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('old', v_old.role::text, 'new', p_role::text));
    UPDATE public.user_store_memberships SET role = p_role, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> v_old.status::text THEN
    IF p_status NOT IN ('active', 'revoked') THEN
      RAISE EXCEPTION 'ERR_INVALID_STATUS: %', p_status;
    END IF;
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('old', v_old.status, 'new', p_status));
    UPDATE public.user_store_memberships SET status = p_status::membership_status, updated_at = now() WHERE id = p_membership_id;
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'MEMBERSHIP_UPDATED',
      jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
      v_changes,
      jsonb_build_object('store_id', v_old.store_id)
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'changes', v_changes);
END;
$function$


-- ===== oid=138108 public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_revoke_membership(p_membership_id uuid, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old RECORD;
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_remaining_active int;
BEGIN
  SELECT m.id, m.user_id, m.store_id, m.role, m.status
    INTO v_old
    FROM public.user_store_memberships m
    WHERE m.id = p_membership_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_MEMBERSHIP_NOT_FOUND';
  END IF;

  -- FIX H-7: Autorización usa nueva sobrecarga has_store_role(p_user_id, p_store_id, p_roles)
  IF NOT public.has_store_role(v_caller_uid, v_old.store_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only store admins can revoke memberships.';
  END IF;

  IF v_old.status = 'revoked' THEN
    RETURN jsonb_build_object('success', true, 'no_change', true);
  END IF;

  UPDATE public.user_store_memberships SET
    status = 'revoked',
    updated_at = now()
  WHERE id = p_membership_id;

  SELECT COUNT(*) INTO v_remaining_active
    FROM public.user_store_memberships
    WHERE user_id = v_old.user_id AND status = 'active';

  IF v_remaining_active = 0 THEN
    UPDATE public.profiles SET is_active = false, updated_at = now()
      WHERE id = v_old.user_id AND deleted_at IS NULL;

    INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
    VALUES (
      v_caller_uid, v_old.user_id, 'USER_AUTO_DEACTIVATED',
      jsonb_build_object('reason', 'No active memberships remaining after revoke')
    );
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, v_old.user_id, 'MEMBERSHIP_REVOKED',
    jsonb_build_object('membership_id', p_membership_id, 'store_id', v_old.store_id, 'role', v_old.role::text, 'status', v_old.status),
    jsonb_build_object('status', 'revoked'),
    jsonb_build_object('store_id', v_old.store_id, 'remaining_active_memberships', v_remaining_active)
  );

  RETURN jsonb_build_object('success', true, 'membership_id', p_membership_id, 'remaining_active_memberships', v_remaining_active);
END;
$function$


-- ===== oid=138144 public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.managed_update_tenant_plan(p_tenant_id uuid, p_plan plan_t, p_subscription_status text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing — service_role (Stripe webhook) puede pasar NULL caller_id
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_old_plan plan_t;
  v_old_status text;
  v_role public.user_role;
BEGIN
  -- Validación: si caller_uid es NULL (service_role anónimo para Stripe webhook), permitir
  -- Si caller_uid NO es NULL, debe ser admin/superadmin
  IF v_caller_uid IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_caller_uid;
    IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can change tenant plan';
    END IF;
  END IF;

  SELECT plan, subscription_status INTO v_old_plan, v_old_status
    FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TENANT_NOT_FOUND: %', p_tenant_id;
  END IF;

  UPDATE public.tenants SET
    plan = p_plan,
    subscription_status = COALESCE(p_subscription_status, subscription_status),
    updated_at = now()
  WHERE id = p_tenant_id;

  UPDATE public.profiles SET
    plan = p_plan,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, old_values, new_values, metadata)
  VALUES (
    v_caller_uid, NULL, 'TENANT_PLAN_UPDATED',
    jsonb_build_object('old_plan', v_old_plan::text, 'old_status', v_old_status),
    jsonb_build_object('new_plan', p_plan::text, 'new_status', COALESCE(p_subscription_status, v_old_status)),
    jsonb_build_object('tenant_id', p_tenant_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'old_plan', v_old_plan::text,
    'new_plan', p_plan::text
  );
END;
$function$


-- ===== oid=138201 public.prevent_cash_closure_edit() =====
CREATE OR REPLACE FUNCTION public.prevent_cash_closure_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'cerrado' AND COALESCE(current_setting('app.bypass_closure_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_CASH_CLOSURE_LOCKED: Cannot modify closed cash closure. Use reopen_cash_shift RPC.';
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=138245 public.next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.next_document_number(p_store_id uuid, p_document_type text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year integer := EXTRACT(YEAR FROM NOW())::int;
  v_last integer;
  v_next integer;
  v_prefix text;
  v_result text;
BEGIN
  IF p_document_type NOT IN ('invoice', 'credit_note', 'quotation', 'z_report', 'vale_salida') THEN
    RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;

  -- SELECT FOR UPDATE para atomicidad
  SELECT last_number INTO v_last
    FROM public.document_sequences
    WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
    FOR UPDATE;

  IF v_last IS NULL THEN
    -- Primera vez: INSERT
    INSERT INTO public.document_sequences (store_id, document_type, year, last_number)
    VALUES (p_store_id, p_document_type, v_year, 1)
    ON CONFLICT (store_id, document_type, year) DO NOTHING
    RETURNING last_number INTO v_next;

    -- Si ON CONFLICT disparó (race condition), re-select
    IF v_next IS NULL THEN
      SELECT last_number INTO v_last
        FROM public.document_sequences
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year
        FOR UPDATE;
      v_next := v_last + 1;
      UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
        WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
    END IF;
  ELSE
    -- Ya existe: incrementar
    v_next := v_last + 1;
    UPDATE public.document_sequences SET last_number = v_next, updated_at = now()
      WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year;
  END IF;

  v_prefix := CASE p_document_type
    WHEN 'invoice' THEN 'FAC'
    WHEN 'credit_note' THEN 'NC'
    WHEN 'quotation' THEN 'COT'
    WHEN 'z_report' THEN 'ZR'
    WHEN 'vale_salida' THEN 'VS'
  END;

  v_result := v_prefix || '-' || LPAD(v_next::text, 6, '0') || '-' || v_year::text;
  RETURN v_result;
END;
$function$


-- ===== oid=138283 public.prevent_z_report_edit() =====
CREATE OR REPLACE FUNCTION public.prevent_z_report_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ERR_Z_REPORT_LOCKED: Z Reports are immutable and cannot be modified.';
END;
$function$


-- ===== oid=138303 public.prevent_fiscal_closing_edit() =====
CREATE OR REPLACE FUNCTION public.prevent_fiscal_closing_edit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'locked' AND COALESCE(current_setting('app.bypass_fiscal_lock', true), 'false') <> 'true' THEN
    RAISE EXCEPTION 'ERR_FISCAL_CLOSING_LOCKED: Cannot modify locked fiscal closing.';
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=138544 public.receive_against_po(p_po_id uuid, p_received_items jsonb, p_user_id uuid, p_reception_date timestamp with time zone, p_invoice_number text) =====
CREATE OR REPLACE FUNCTION public.receive_against_po(p_po_id uuid, p_received_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id            uuid;
  v_supplier_name       text;
  v_po_status           public.purchase_status_enum;
  v_item                jsonb;
  v_item_id             uuid;
  v_qty                 numeric;
  v_qty_ordered         numeric;
  v_qty_received_before numeric;
  v_product_id          uuid;
  v_unit_cost           numeric;
  v_product_name        text;
  v_all_received        boolean;
  v_any_received        boolean;
  v_new_status          public.purchase_status_enum;
  v_receipt_id          uuid;
  v_reception_items     jsonb := '[]'::jsonb;
  v_count               integer := 0;
  v_po_number           text;
  v_invoice_to_pass     text;
  v_sorted_items        jsonb;
BEGIN
  -- ─── 1. Cargar OC con lock exclusivo ───
  SELECT po.store_id, po.supplier_name, po.status, po.po_number
    INTO v_store_id, v_supplier_name, v_po_status, v_po_number
  FROM public.purchase_orders po
  WHERE po.id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware via has_store_access) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Validar estado de la OC ───
  IF v_po_status = 'cancelled' THEN
    RAISE EXCEPTION 'ERR_PO_CANCELLED';
  END IF;
  -- Solo se puede recibir contra draft, sent o partial.
  IF v_po_status NOT IN ('draft', 'sent', 'partial') THEN
    RAISE EXCEPTION 'ERR_PO_NOT_RECEIVABLE: status % is terminal', v_po_status;
  END IF;

  -- ─── 4. Validar items no vacío (parity B3 register_reception) ───
  IF p_received_items IS NULL OR jsonb_array_length(p_received_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
  END IF;

  -- ─── 5. Condición #5 (anti-deadlock): Ordenar items por po_item_id ASC ───
  SELECT jsonb_agg(elem ORDER BY (elem->>'po_item_id'))
    INTO v_sorted_items
  FROM jsonb_array_elements(p_received_items) AS elem;

  -- ─── 6. Procesar cada item: VALIDAR antes de actualizar ───
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := COALESCE((v_item->>'quantity_received')::numeric, 0);

    -- Validar po_item_id presente
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'ERR_ITEM_ID_REQUIRED: missing po_item_id in received_items';
    END IF;

    -- Medio #6: qty > 0
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'ERR_NEGATIVE_QTY: qty % for item % must be > 0', v_qty, v_item_id;
    END IF;

    -- Cargar estado actual del item con lock FOR UPDATE
    SELECT product_id, quantity_ordered, quantity_received, unit_cost, product_name
      INTO v_product_id, v_qty_ordered, v_qty_received_before, v_unit_cost, v_product_name
    FROM public.purchase_order_items
    WHERE id = v_item_id AND po_id = p_po_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND: %', v_item_id;
    END IF;

    -- Alto #5: over-receive check
    IF (v_qty_received_before + v_qty) > v_qty_ordered THEN
      RAISE EXCEPTION 'ERR_OVER_RECEIVE: item % ordered %, already received %, attempting %',
        v_item_id, v_qty_ordered, v_qty_received_before, v_qty;
    END IF;

    -- Condición #1: todo item debe tener product_id NOT NULL
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_PRODUCT_ID_REQUIRED: item % has no product_id', v_item_id;
    END IF;

    -- Medio #9: producto debe existir en store
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_product_id AND p.store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % not in store %',
        v_product_id, v_store_id;
    END IF;

    -- Acumular para register_reception (formato esperado: product_id, quantity, unit_cost, moneda, tasa)
    v_reception_items := v_reception_items || jsonb_build_object(
      'product_id',   v_product_id,
      'product_name', v_product_name,
      'quantity',     v_qty,
      'unit_cost',    v_unit_cost,
      'moneda_recepcion', 'CUP',
      'tasa_cambio_recepcion', 1.0
    );
    v_count := v_count + 1;
  END LOOP;

  -- ─── 7. Condición #3: reference_doc NULL si no viene invoice_number ───
  -- Evita colisión con UNIQUE INDEX idx_receipts_store_reference_doc
  -- (store_id, reference_doc) en partial indexes.
  -- El vínculo real receipt↔PO es receipts.po_id (G6).
  IF p_invoice_number IS NULL OR p_invoice_number = '' THEN
    v_invoice_to_pass := NULL;
  ELSE
    v_invoice_to_pass := p_invoice_number;
  END IF;

  -- ─── 8. Crear receipt vinculado vía register_reception ───
  -- register_reception aplica las 8 validaciones B1-B5 + C1-C3 del v2.23.0
  -- (no se relajan). G6 añade p_po_id opcional.
  v_receipt_id := public.register_reception(
    p_store_id        := v_store_id,
    p_supplier        := v_supplier_name,
    p_reception_date  := p_reception_date,
    p_invoice_number  := v_invoice_to_pass,
    p_items           := v_reception_items,
    p_user_id         := p_user_id,
    p_po_id           := p_po_id
  );

  -- ─── 9. Actualizar quantity_received en purchase_order_items ───
  -- (SECURITY DEFINER bypasses RLS DENY UPDATE de G5)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sorted_items) LOOP
    v_item_id := NULLIF(v_item->>'po_item_id', '')::uuid;
    v_qty     := (v_item->>'quantity_received')::numeric;

    UPDATE public.purchase_order_items
    SET quantity_received = quantity_received + v_qty
    WHERE id = v_item_id AND po_id = p_po_id;
  END LOOP;

  -- ─── 10. Recalcular status global (cast EXPLÍCITO a enum) ───
  SELECT
    BOOL_AND(quantity_received >= quantity_ordered),
    BOOL_OR(quantity_received > 0)
  INTO v_all_received, v_any_received
  FROM public.purchase_order_items WHERE po_id = p_po_id;

  v_new_status :=
    CASE
      WHEN v_all_received THEN 'received'::public.purchase_status_enum
      WHEN v_any_received THEN 'partial'::public.purchase_status_enum
      ELSE 'sent'::public.purchase_status_enum
    END;

  -- ─── 11. Actualizar OC + vincular receipt en notas ───
  UPDATE public.purchase_orders
  SET status       = v_new_status,
      received_at  = CASE WHEN v_new_status = 'received' THEN NOW() ELSE received_at END,
      notes        = COALESCE(notes, '') ||
                     CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                     '[Receipt ' || v_receipt_id::text || ' linked at ' || NOW()::text || ']'
  WHERE id = p_po_id;

  -- ─── 12. CxP (Grupo 6): marcar receipt con payment_status='unpaid' ───
  -- Solo si aún no está seteado (no sobrescribir si register_reception ya lo puso).
  UPDATE public.receipts
  SET payment_status     = COALESCE(NULLIF(payment_status, ''), 'unpaid'),
      payment_terms_days = COALESCE(payment_terms_days, 30),
      due_date           = COALESCE(due_date, (p_reception_date::date + INTERVAL '30 days')::date)
  WHERE id = v_receipt_id;

  -- ─── 13. Auditoría ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    p_user_id, v_store_id, 'po_received', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'new_status', v_new_status::text,
      'items_received', v_count,
      'receipt_id', v_receipt_id,
      'po_number', v_po_number,
      'invoice_number', v_invoice_to_pass
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', v_new_status::text,
    'receipt_id', v_receipt_id,
    'items_received', v_count
  );
END;
$function$


-- ===== oid=138589 public.prevent_received_service_edit() =====
CREATE OR REPLACE FUNCTION public.prevent_received_service_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paid_amount NUMERIC;
  v_sum_distributions NUMERIC;
BEGIN
  -- 1. Bloquear edicion de servicio voided (excepto RPCs via set_config)
  IF OLD.status = 'voided' AND TG_OP = 'UPDATE' THEN
    IF current_setting('app.is_void_rpc', true) IS DISTINCT FROM 'true'
       AND current_setting('app.is_status_change_rpc', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'ERR_SERVICE_VOIDED: no se puede editar un servicio anulado';
    END IF;
  END IF;

  -- 2. service_number inmutable post-creacion
  IF NEW.service_number IS DISTINCT FROM OLD.service_number THEN
    RAISE EXCEPTION 'ERR_SERVICE_NUMBER_IMMUTABLE: service_number no puede cambiarse post-creacion';
  END IF;

  -- 3. store_id inmutable (cross-tenant protection)
  IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    RAISE EXCEPTION 'ERR_STORE_ID_IMMUTABLE: store_id no puede cambiarse';
  END IF;

  -- 4. total_amount no puede reducirse por debajo de paid_amount
  SELECT COALESCE(paid_amount, 0) INTO v_paid_amount
  FROM received_services WHERE id = OLD.id;
  IF NEW.total_amount < v_paid_amount THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAID: total_amount (%) no puede ser menor que paid_amount (%)',
      NEW.total_amount, v_paid_amount;
  END IF;

  -- 5. total_amount no puede reducirse por debajo de la suma de distribuciones
  SELECT COALESCE(SUM(distribution_amount), 0) INTO v_sum_distributions
  FROM service_cost_distributions WHERE service_id = OLD.id;
  IF NEW.total_amount < v_sum_distributions THEN
    RAISE EXCEPTION 'ERR_TOTAL_BELOW_DISTRIBUTIONS: total_amount (%) no puede ser menor que la suma de distribuciones (%)',
      NEW.total_amount, v_sum_distributions;
  END IF;

  -- 6. service_date no puede back-date fuera del periodo fiscal
  IF NEW.service_date IS DISTINCT FROM OLD.service_date THEN
    PERFORM public.validate_operation_date(NEW.service_date::timestamp with time zone, NEW.store_id);
  END IF;

  RETURN NEW;
END;
$function$


-- ===== oid=138613 public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_total_materials_cost NUMERIC := 0;
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost NUMERIC;
  v_unit_pt_cost NUMERIC;
  v_user_id UUID;
  v_order_status TEXT;
  v_order_store_id UUID;
  v_existing_result JSONB;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_param_hash TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_order_id::text || p_product_id::text || p_quantity::text || p_store_id::text);
    SELECT metadata->>'result' INTO v_existing_result
    FROM audit_logs
    WHERE action = 'PRODUCTION_OUTPUT_RECEIVED' AND record_id = p_order_id
      AND metadata->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_result IS NOT NULL THEN
      IF v_existing_result->>'param_hash' != v_param_hash THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE: key % was used with different parameters', p_idempotency_key;
      END IF;
      RETURN v_existing_result;
    END IF;
  END IF;

  SELECT status, store_id INTO v_order_status, v_order_store_id
  FROM production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_order_status != 'in_progress' THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_IN_PROGRESS: status % is not in_progress', v_order_status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND store_id = v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE';
  END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY: p_quantity must be > 0'; END IF;

  SELECT COALESCE(SUM(actual_qty * COALESCE(actual_unit_cost, 0)), 0)
    INTO v_total_materials_cost
  FROM production_order_items WHERE order_id = p_order_id AND actual_qty > 0;

  -- DF-05: PT nunca entra a 0 sin información válida (INV-06/E')
  IF v_total_materials_cost <= 0 THEN
    RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: sin materiales server-side validos para orden %', p_order_id;
  END IF;

  v_unit_pt_cost := v_total_materials_cost / p_quantity;

  SELECT stock_current, COALESCE(cost_average, 0)
    INTO v_current_stock, v_current_cost
  FROM products WHERE id = p_product_id AND store_id = v_order_store_id FOR UPDATE;

  v_new_stock := COALESCE(v_current_stock,0) + p_quantity;

  -- DF-01: WAC vía escritor único; SIN espejo cost_price (D-02)
  v_new_cost := public.fn_recalc_wac(v_order_store_id, p_product_id, 'production_in',
                   p_quantity, v_unit_pt_cost,
                   jsonb_build_object('rpc','receive_production_output','order_id',p_order_id));

  UPDATE production_orders SET
    output_product_id = p_product_id, output_quantity = p_quantity,
    output_total_cost = v_total_materials_cost,
    output_unit_cost = v_unit_pt_cost, updated_at = now()
  WHERE id = p_order_id;

  SELECT created_by INTO v_user_id FROM production_orders WHERE id = p_order_id;

  -- DF-05: qty numérica sin truncamiento (D-11)
  PERFORM register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := p_quantity,
    p_movement_type := 'production_in',
    p_reason := 'Entrada de producto terminado de orden ' || p_order_id::text,
    p_sale_id := NULL::uuid,
    p_unit_cost := v_unit_pt_cost,
    p_notes := 'production_order:' || p_order_id::text,
    p_variant_id := NULL::uuid,
    p_skip_access_check := TRUE
  );

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_order_store_id, 'PRODUCTION_OUTPUT_RECEIVED', 'production_orders', p_order_id,
    jsonb_build_object(
      'product_id', p_product_id, 'quantity', p_quantity,
      'total_materials_cost', v_total_materials_cost,
      'unit_cost', v_unit_pt_cost, 'previous_wac', v_current_cost, 'new_wac', v_new_cost,
      'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash,
      'result', jsonb_build_object('status', 'success', 'new_wac', v_new_cost, 'new_stock', v_new_stock)
    )
  );

  RETURN jsonb_build_object('status','success','new_wac',v_new_cost,'new_stock',v_new_stock,
    'total_materials_cost',v_total_materials_cost);
END $function$


-- ===== oid=142117 public.protect_transactions_total_amount() =====
CREATE OR REPLACE FUNCTION public.protect_transactions_total_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    IF current_user <> 'costpro_transaction_adjuster' THEN
      RAISE EXCEPTION 'ERR_TOTAL_AMOUNT_IMMUTABLE: transactions.total_amount cannot be modified directly (current_user=%). Use adjust_total_amount() RPC.',
        current_user
        USING ERRCODE = 'PT008';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=144056 public.prevent_self_privilege_escalation() =====
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.roles IS DISTINCT FROM OLD.roles
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.max_stores_limit IS DISTINCT FROM OLD.max_stores_limit
       OR NEW.max_users_limit IS DISTINCT FROM OLD.max_users_limit
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'ERR_SELF_PRIVILEGED_FIELD: role, roles, role_id, is_active, store ownership, tenant y limites solo pueden modificarse por la via administrativa autorizada (managed_update_user).';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=21401 public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text) =====
CREATE OR REPLACE FUNCTION public.record_sale_movement(p_store_id uuid, p_product_id uuid, p_variant_id uuid, p_quantity integer, p_reference text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.register_stock_movement(
    p_product_id := p_product_id,
    p_store_id := p_store_id,
    p_user_id := auth.uid(),
    p_quantity := -ABS(p_quantity),
    p_movement_type := 'sale',
    p_reason := p_reference,
    p_sale_id := NULL,
    p_unit_cost := 0
  );
END;
$function$


-- ===== oid=130958 public.stores_soft_delete_cleanup() =====
CREATE OR REPLACE FUNCTION public.stores_soft_delete_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.logo_url := NULL;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=131044 public.sync_product_has_movements() =====
CREATE OR REPLACE FUNCTION public.sync_product_has_movements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET has_movements = true
    WHERE id = NEW.product_id AND has_movements = false;

    RETURN NEW;
END;
$function$


-- ===== oid=131406 public.save_ai_api_key(p_provider text, p_api_key text, p_label text) =====
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


-- ===== oid=131719 public.sync_inventory_from_products(p_store_id uuid) =====
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


-- ===== oid=131945 public.soft_delete_store(p_store_id uuid, p_deleted_by uuid) =====
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


-- ===== oid=132042 public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric) =====
CREATE OR REPLACE FUNCTION public.save_product_cost_sheet(p_product_id uuid, p_store_id uuid, p_template_id text, p_modalidad text, p_calculated_data jsonb, p_cost_price numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cs_id UUID;
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado', 'costo'])) THEN
    RAISE EXCEPTION 'Sin permisos para guardar fichas de costo en esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida';
  END IF;

  -- Validate cost_price > 0 (REG-03: division by zero prevention)
  IF p_cost_price < 0 THEN
    RAISE EXCEPTION 'El costo unitario no puede ser negativo';
  END IF;

  -- Upsert the cost sheet
  INSERT INTO product_cost_sheets (product_id, store_id, template_id, modalidad, calculated_data, cost_price, sync_status)
  VALUES (p_product_id, p_store_id, p_template_id, p_modalidad, p_calculated_data, p_cost_price, 'synced')
  ON CONFLICT (product_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    modalidad = EXCLUDED.modalidad,
    calculated_data = EXCLUDED.calculated_data,
    cost_price = EXCLUDED.cost_price,
    cost_price_updated_at = now(),
    sync_status = 'synced',
    updated_at = now()
  RETURNING id INTO v_cs_id;

  -- Link product to cost sheet
  UPDATE products SET cost_sheet_id = v_cs_id WHERE id = p_product_id;

  -- Return confirmation
  SELECT jsonb_build_object(
    'id', id,
    'product_id', product_id,
    'cost_price', cost_price,
    'cost_price_updated_at', cost_price_updated_at,
    'sync_status', sync_status
  ) INTO v_result
  FROM product_cost_sheets WHERE id = v_cs_id;

  RETURN v_result;
END;
$function$


-- ===== oid=133149 public.snapshot_commission_rule() =====
CREATE OR REPLACE FUNCTION public.snapshot_commission_rule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.commission_rule_versions
  WHERE rule_id = NEW.id;

  INSERT INTO public.commission_rule_versions (rule_id, version, snapshot, changed_by)
  VALUES (
    NEW.id,
    v_next_version,
    jsonb_build_object(
      'type', NEW.type,
      'value_percent', NEW.value_percent,
      'fixed_value', NEW.fixed_value,
      'salary_amount', NEW.salary_amount,
      'base_calculation', NEW.base_calculation,
      'priority', NEW.priority,
      'valid_from', NEW.valid_from,
      'valid_to', NEW.valid_to,
      'worker_id', NEW.worker_id,
      'store_id', NEW.store_id,
      'min_price', NEW.min_price,
      'max_price', NEW.max_price,
      'product_commission_amount', NEW.product_commission_amount,
      'product_commission_mode', NEW.product_commission_mode,
      'snapshotted_at', now()
    ),
    NEW.created_by
  );

  RETURN NEW;
END;
$function$


-- ===== oid=133204 public.register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean) =====
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


-- ===== oid=134239 public.set_default_due_date_receipt() =====
CREATE OR REPLACE FUNCTION public.set_default_due_date_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.due_date IS NULL AND NEW.reception_date IS NOT NULL THEN
    NEW.due_date := (NEW.reception_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=134241 public.set_default_due_date_service() =====
CREATE OR REPLACE FUNCTION public.set_default_due_date_service()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.due_date IS NULL AND NEW.service_date IS NOT NULL THEN
    NEW.due_date := (NEW.service_date::date + COALESCE(NEW.payment_terms_days, 30))::date;
  ELSIF NEW.due_date IS NULL AND NEW.created_at IS NOT NULL THEN
    NEW.due_date := (NEW.created_at::date + COALESCE(NEW.payment_terms_days, 30))::date;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=134419 public.set_default_due_date_commission() =====
CREATE OR REPLACE FUNCTION public.set_default_due_date_commission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.due_date IS NULL AND NEW.period_end IS NOT NULL THEN
    NEW.due_date := NEW.period_end + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=136654 public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_receipt(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id;
  IF v_receipt IS NULL THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_receipt.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_receipt_id
  LOOP
    UPDATE public.products
      SET stock_current = GREATEST(0, stock_current - v_item.quantity), updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_receipt.store_id, v_item.product_id, 'out', v_item.quantity, 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_receipt_id, 'Reversión de recepción', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.receipts
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_receipt_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'receipt_id', p_receipt_id);
END;
$function$


-- ===== oid=136655 public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_ref_doc TEXT;
  v_mov JSONB;
  v_dest_stock NUMERIC;
  v_new_wac NUMERIC;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer IS NULL THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status = 'REVERSADA' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_transfer.status != 'CONFIRMADA' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: estado actual: %', v_transfer.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_ORIGIN';
  END IF;
  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  -- W9.5 B-10: capa normativa de rol resuelta en la tienda ORIGEN (duena del
  -- documento y del audit). El acceso al DESTINO sigue siendo requisito
  -- adicional (naturaleza bidireccional de la transferencia).
  IF NOT public.can_reverse_document(v_caller_uid, v_transfer.origin_store_id, 'transfer') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de transferencia requiere rol admin/manager/encargado/warehouse en la tienda de origen';
  END IF;

  v_ref_doc := 'REVERSIÓN ' || UPPER(left(v_transfer.id::text, 8)) || ' [' || left(p_reason, 50) || ']';

  FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
    IF v_item.destination_product_id IS NULL THEN
      RAISE EXCEPTION 'ERR_DEST_PRODUCT_NULL: item %', v_item.id;
    END IF;

    -- DF-06: reversa simétrica del blend destino (q<0 con uc congelado) ANTES de mover stock
    SELECT stock_current INTO v_dest_stock FROM public.products
      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id
      FOR UPDATE;
    IF COALESCE(v_dest_stock,0) - v_item.quantity > 0 THEN
      v_new_wac := public.fn_recalc_wac(
        v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_reverse',
        -v_item.quantity, v_item.unit_cost,
        jsonb_build_object('rpc','reverse_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));
    END IF;

    v_mov := public.register_stock_movement(
      v_item.product_id, v_transfer.origin_store_id, v_item.quantity,
      'transfer_in', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: devolución al origen', NOW(), TRUE
    );

    v_mov := public.register_stock_movement(
      v_item.destination_product_id, v_transfer.destination_store_id, -v_item.quantity,
      'transfer_out', v_ref_doc, v_caller_uid, NULL,
      p_transfer_id,
      v_item.unit_cost, 'Reversión: retiro del destino', NOW(), TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.transfers
    SET status = 'REVERSADA', reversed_at = now(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_transfer_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_reversed', 'transfers', p_transfer_id,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc,
      'old_status', v_transfer.status, 'new_status', 'REVERSADA',
      'operation', 'ADMIN_REVERSE_TRANSFER',
      'dest_reverse_blend_df06', true));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'transfer_id', p_transfer_id);
END $function$


-- ===== oid=136656 public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_adjustment(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- FIX V2.3.2: usar 'difference' (columna real) en vez de 'quantity_change'
  FOR v_item IN
    SELECT product_id, difference FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    -- Invertir el ajuste: si sumó X, ahora resta X (y viceversa)
    UPDATE public.products
      SET stock_current = stock_current - v_item.difference, updated_at = now()
      WHERE id = v_item.product_id AND store_id = v_adj.store_id;

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
      balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_adj.store_id, v_item.product_id, 'adjustment', ABS(v_item.difference), 0, 0,
      p.stock_current, p.cost_average, p.stock_current * p.cost_average,
      'reversal', p_adjustment_id, 'Reversión de ajuste', v_uid
    FROM public.products p WHERE p.id = v_item.product_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'adjustment_id', p_adjustment_id);
END;
$function$


-- ===== oid=136657 public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid) =====
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
  v_uc_dev NUMERIC;
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
  -- W9.5 B-10b: la autorizacion NO cambia; solo la mutacion.
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- ── W9.5 B-10b: mutacion EXCLUSIVAMENTE via pipeline canonico ──
  -- register_stock_movement -> stock_movements -> triggers (fn_sync_inventory_
  -- on_movement / auto_kardex / sync_product_stock) -> inventory + products.
  -- Quedan PROHIBIDOS (divergencia corregida):
  --   * UPDATE directo de products.stock_current (antes: GREATEST(0, stock-qty))
  --   * INSERT directo en kardex_entries (antes: 'out' con unit_cost=0)
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    -- (a) Costo complementario del kardex: del movimiento 'return' original
    --     (promedio ponderado si hay varios). Si no existe (devoluciones
    --     pre-pipeline — 13/13 en datos reales), cadena canonica de
    --     create_devolution_v2: cost_at_sale -> cost_average -> 0.
    --     Solo atribucion contable: el WAC real NO se toca (ver (b)).
    SELECT (SUM(sm.unit_cost * sm.quantity_change) / NULLIF(SUM(sm.quantity_change), 0))
      INTO v_uc_dev
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_devolution_id::text
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'return';
    IF v_uc_dev IS NULL THEN
      IF v_dev.original_transaction_id IS NOT NULL THEN
        SELECT ti.cost_at_sale INTO v_uc_dev
          FROM public.transaction_items ti
          WHERE ti.transaction_id = v_dev.original_transaction_id
            AND ti.product_id = v_item.product_id
          LIMIT 1;
      END IF;
      IF v_uc_dev IS NULL THEN
        SELECT cost_average INTO v_uc_dev FROM public.products WHERE id = v_item.product_id;
      END IF;
      v_uc_dev := COALESCE(v_uc_dev, 0);
    END IF;

    -- (b) WAC: la devolucion original NO altera cost_average (hotfix A2 v2.22.0,
    --     "for other paths (transfers, devolutions, etc.), cost_average stays
    --     as-is"). El reverse conserva esa invariancia via la rama q=0 de
    --     fn_recalc_wac ("Salida pura / devolucion A1 / evento neutro: WAC
    --     INVARIANTE"): lock del producto + wac_change_log (before==after).
    --     Permite llevar el stock a 0 sin division por cero ni WAC corrupto.
    PERFORM public.fn_recalc_wac(
      v_dev.store_id, v_item.product_id, 'devolution_reverse',
      0, 0,
      jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
        'qty_reversed', v_item.quantity));

    -- (c) Mutacion de stock SOLO via pipeline canonico. Signo (GATE 3): la
    --     devolucion original sumo (+q, 'return') -> el reverse resta (-q).
    --     Sin clamp: si el stock ya no alcanza, fn_sync_inventory_on_movement
    --     falla con ERR_INSUFFICIENT_STOCK (deteccion sobre silencio, W7 D-01).
    --     reference_id = devolutions.id (trazabilidad estructurada, GATE 8).
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_dev.store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'devolution_reverse',
      p_reason := ('Reversión devolución ' || COALESCE(v_dev.devolution_number, p_devolution_id::text))::text,
      p_user_id := v_uid,
      p_variant_id := NULL,
      p_sale_id := p_devolution_id,
      p_unit_cost := v_uc_dev,
      p_notes := COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito. B-10b mantiene
  -- action/operation congelados y enriquece metadata (aditivo).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$


-- ===== oid=136727 public.role_name_to_enum(p_role_name text) =====
CREATE OR REPLACE FUNCTION public.role_name_to_enum(p_role_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  RETURN CASE
    WHEN LOWER(p_role_name) = 'admin' THEN 'admin'
    WHEN LOWER(p_role_name) = 'encargado' THEN 'encargado'
    WHEN LOWER(p_role_name) = 'cajero' THEN 'clerk'
    WHEN LOWER(p_role_name) = 'almacenero' THEN 'warehouse'
    WHEN LOWER(p_role_name) = 'costo' THEN 'costo'
    WHEN LOWER(p_role_name) = 'manager' THEN 'manager'
    WHEN LOWER(p_role_name) = 'usuario' THEN 'usuario'
    ELSE 'usuario'  -- default seguro
  END;
END;
$function$


-- ===== oid=136802 public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid, p_notes text) =====
CREATE OR REPLACE FUNCTION public.record_counted_quantity(p_count_id uuid, p_product_id uuid, p_counted_quantity numeric, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_store_id UUID;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id INTO v_store_id FROM public.physical_counts WHERE id = p_count_id;
  IF v_store_id IS NULL THEN RAISE EXCEPTION 'ERR_COUNT_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.physical_count_items
    SET counted_quantity = p_counted_quantity,
        counted_at = NOW(),
        notes = COALESCE(p_notes, notes)
    WHERE count_id = p_count_id AND product_id = p_product_id;

  RETURN jsonb_build_object('status', 'success', 'count_id', p_count_id, 'product_id', p_product_id);
END;
$function$


-- ===== oid=136852 public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reject_transfer(p_transfer_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_transfer RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND'; END IF;
  IF v_transfer.status != 'PENDIENTE' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING';
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  UPDATE public.transfers
    SET status = 'CANCELADA',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', p_transfer_id,
    'new_status', 'CANCELADA'
  );
END;
$function$


-- ===== oid=137075 public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric, p_threshold_quantity numeric, p_approver_roles text[], p_is_active boolean, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.set_transfer_approval_rule(p_tenant_id uuid, p_store_id uuid, p_threshold_amount numeric DEFAULT NULL::numeric, p_threshold_quantity numeric DEFAULT NULL::numeric, p_approver_roles text[] DEFAULT ARRAY['admin'::text, 'manager'::text], p_is_active boolean DEFAULT true, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_user_role TEXT;
  v_existing UUID;
BEGIN
  -- V2.12.18: patrón IS NULL OR NOT (antes era IF v_caller_uid IS NOT NULL THEN ... END IF)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Verificar que el usuario sea admin o manager
  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_uid;
  IF v_user_role IS NULL OR (v_user_role <> 'admin' AND v_user_role <> 'superadmin' AND NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text])) THEN
    RAISE EXCEPTION 'ERR_INSUFFICIENT_ROLE';
  END IF;

  -- Upsert
  SELECT id INTO v_existing FROM public.transfer_approval_rules
    WHERE store_id = p_store_id AND tenant_id IS NOT DISTINCT FROM p_tenant_id
    FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.transfer_approval_rules
      SET threshold_amount = COALESCE(p_threshold_amount, threshold_amount),
          threshold_quantity = COALESCE(p_threshold_quantity, threshold_quantity),
          approver_roles = COALESCE(p_approver_roles, approver_roles),
          is_active = COALESCE(p_is_active, is_active),
          updated_at = NOW()
      WHERE id = v_existing;
  ELSE
    INSERT INTO public.transfer_approval_rules (tenant_id, store_id, threshold_amount, threshold_quantity, approver_roles, is_active, created_at, updated_at)
    VALUES (p_tenant_id, p_store_id, p_threshold_amount, p_threshold_quantity, p_approver_roles, p_is_active, NOW(), NOW())
    RETURNING id INTO v_existing;
  END IF;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('SET_TRANSFER_APPROVAL_RULE', 'transfer_approval_rules', v_existing, p_store_id, v_caller_uid,
    jsonb_build_object('threshold_amount', p_threshold_amount, 'threshold_quantity', p_threshold_quantity, 'is_active', p_is_active));

  RETURN jsonb_build_object('status', 'success', 'rule_id', v_existing);
END;
$function$


-- ===== oid=137078 public.reconcile_stock(p_store_id uuid, p_fix boolean, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reconcile_stock(p_store_id uuid DEFAULT NULL::uuid, p_fix boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_fixed INTEGER := 0;
  v_skipped_negative INTEGER := 0;
  v_truncated BOOLEAN := FALSE;
  v_discrepancies JSONB[] := ARRAY[]::JSONB[];
  v_rec RECORD;
  -- V2.12.19: anti-spoofing guard V2.12.9
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_expected NUMERIC;
  v_user_is_admin BOOLEAN;
  v_max_details INTEGER := 500;
  v_inspection_logged BOOLEAN := FALSE;
BEGIN
  -- V2.12.10 (preservado): admin check + has_store_role check
  -- V2.12.19: anti-spoofing guard aplicado a v_caller_uid
  v_user_is_admin := public.is_admin();

  IF p_store_id IS NULL THEN
    -- Reconciliar todas las tiendas → requiere admin global
    -- V2.12.19: IS NULL OR NOT (consistencia V2.12.12 + V2.12.18)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      RAISE EXCEPTION 'ERR_UNAUTHORIZED_GLOBAL_RECONCILE';
    END IF;
  ELSE
    -- Reconciliar una tienda → requiere admin global o admin/manager de la tienda
    -- V2.12.19: IS NULL OR NOT (consistencia)
    IF v_caller_uid IS NULL OR NOT v_user_is_admin THEN
      IF NOT public.has_store_role(p_store_id, ARRAY['admin'::text, 'manager'::text]) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
      END IF;
    END IF;
  END IF;

  -- Comparar products.stock_current vs SUM(stock_movements.quantity_change)
  FOR v_rec IN
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.store_id,
      p.stock_current AS current_stock,
      COALESCE(SUM(sm.quantity_change), 0) AS expected_stock,
      ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) AS diff
    FROM public.products p
    LEFT JOIN public.stock_movements sm ON sm.product_id = p.id AND sm.store_id = p.store_id
    WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
      AND p.is_active = true
    GROUP BY p.id, p.name, p.store_id, p.stock_current
    HAVING ABS(p.stock_current - COALESCE(SUM(sm.quantity_change), 0)) > 0.001
  LOOP
    v_count := v_count + 1;
    v_expected := v_rec.expected_stock;

    IF array_length(v_discrepancies, 1) IS NULL OR array_length(v_discrepancies, 1) < v_max_details THEN
      v_discrepancies := array_append(v_discrepancies, jsonb_build_object(
        'product_id', v_rec.product_id,
        'product_name', v_rec.product_name,
        'store_id', v_rec.store_id,
        'current_stock', v_rec.current_stock,
        'expected_stock', v_rec.expected_stock,
        'diff', v_rec.diff,
        'skipped', (v_expected < 0)
      ));
    ELSE
      v_truncated := TRUE;
    END IF;

    -- H7-4: NO silenciar corrupción negativa con GREATEST(0, v_expected).
    IF v_expected < 0 THEN
      v_skipped_negative := v_skipped_negative + 1;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES (
        'STOCK_RECONCILIATION_NEGATIVE',
        'products',
        v_rec.product_id,
        v_rec.store_id,
        v_caller_uid,
        jsonb_build_object(
          'current_stock', v_rec.current_stock,
          'expected_stock', v_rec.expected_stock,
          'diff', v_rec.diff,
          'fix_mode', p_fix,
          'reason', 'Negative expected stock — possible fraud or bug, manual review required'
        )
      );

      CONTINUE;
    END IF;

    IF p_fix THEN
      UPDATE public.products
        SET stock_current = v_expected, updated_at = NOW()
        WHERE id = v_rec.product_id;

      INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
      VALUES ('STOCK_RECONCILIATION', 'products', v_rec.product_id, v_rec.store_id, v_caller_uid,
        jsonb_build_object('old_stock', v_rec.current_stock, 'new_stock', v_expected, 'diff', v_rec.diff));

      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  -- H7-7: Audit log resumen en modo inspección (p_fix=false)
  IF NOT p_fix AND v_count > 0 THEN
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES (
      'STOCK_RECONCILIATION_INSPECT',
      'products',
      NULL,
      p_store_id,
      v_caller_uid,
      jsonb_build_object(
        'discrepancies_found', v_count,
        'discrepancies_skipped_negative', v_skipped_negative,
        'scope', CASE WHEN p_store_id IS NULL THEN 'all_stores' ELSE 'single_store' END,
        'reason', 'Stock reconciliation inspection — no fixes applied'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'discrepancies_found', v_count,
    'discrepancies_fixed', v_fixed,
    'discrepancies_skipped_negative', v_skipped_negative,
    'discrepancies_truncated', v_truncated,
    'fix_mode', p_fix,
    'details', to_jsonb(v_discrepancies)
  );
END;
$function$


-- ===== oid=137351 public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_reference text, p_notes text, p_idempotency_key text, p_payment_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text DEFAULT 'CUP'::text, p_exchange_rate numeric DEFAULT 1.0, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_payment_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_total numeric;
  v_paid numeric;
  v_amount_cup numeric;
  v_balance numeric;
  v_doc_store_id uuid;
  v_eff_payment_date timestamptz := COALESCE(p_payment_date, now());
BEGIN
  -- Idempotencia
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.payment_transactions
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- Validar documento y store ownership
  IF p_ref_type = 'receipt' THEN
    SELECT store_id, total_cost INTO v_doc_store_id, v_total
    FROM public.receipts WHERE id = p_ref_id;
  ELSIF p_ref_type = 'service' THEN
    SELECT store_id, total_amount INTO v_doc_store_id, v_total
    FROM public.received_services WHERE id = p_ref_id;
  ELSIF p_ref_type IN ('production_order', 'work') THEN
    SELECT store_id, budget_total INTO v_doc_store_id, v_total
    FROM public.production_orders WHERE id = p_ref_id;
  ELSE
    RAISE EXCEPTION 'ref_type no soportado: %', p_ref_type;
  END IF;

  IF v_doc_store_id IS NULL THEN
    RAISE EXCEPTION 'Documento no encontrado (ref_type=%, ref_id=%)', p_ref_type, p_ref_id;
  END IF;

  IF v_doc_store_id != p_store_id THEN
    RAISE EXCEPTION 'El documento no pertenece a la tienda especificada';
  END IF;

  -- Calcular monto en CUP
  v_amount_cup := CASE
    WHEN p_currency = 'CUP' THEN p_amount
    ELSE p_amount * p_exchange_rate
  END;

  -- R3: Validar overpay
  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
  FROM public.payment_transactions
  WHERE ref_type = p_ref_type AND ref_id = p_ref_id;

  v_balance := v_total - v_paid;
  IF v_amount_cup > v_balance THEN
    RAISE EXCEPTION
      'El pago (%) excede el saldo pendiente (%). Overpay no permitido.',
      v_amount_cup, v_balance;
  END IF;

  -- Insertar pago con payment_date personalizada (o now() por defecto)
  INSERT INTO public.payment_transactions (
    store_id, ref_type, ref_id, amount, payment_method,
    currency, exchange_rate, reference, notes, paid_by, idempotency_key,
    payment_date
  ) VALUES (
    p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method,
    p_currency, p_exchange_rate, p_reference, p_notes, p_paid_by, p_idempotency_key,
    v_eff_payment_date
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$


-- ===== oid=137399 public.reset_store_data(target_store_id uuid, p_keep_catalog boolean, p_user_id uuid) =====
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


-- ===== oid=137580 public.restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text) =====
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


-- ===== oid=137974 public.release_expired_reservations() =====
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


-- ===== oid=138110 public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid) =====
CREATE OR REPLACE FUNCTION public.reconcile_orphan_user(p_auth_user_id uuid, p_action text, p_reason text, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- FIX H-7: anti-spoofing
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
    THEN COALESCE(p_caller_id, auth.uid()) ELSE auth.uid() END;
  v_log RECORD;
  v_target_email text;
BEGIN
  -- Autorización usa is_admin() (internamente auth.uid()) → NO spoofable
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF p_action NOT IN ('create_profile', 'delete_auth_user', 'ignore') THEN
    RAISE EXCEPTION 'ERR_INVALID_ACTION: %', p_action;
  END IF;

  SELECT * INTO v_log FROM public.orphaned_users_log
    WHERE auth_user_id = p_auth_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_ORPHAN_NOT_FOUND: %', p_auth_user_id;
  END IF;

  IF v_log.status = 'resolved' THEN
    RAISE EXCEPTION 'ERR_ALREADY_RESOLVED';
  END IF;

  v_target_email := v_log.email;

  IF p_action = 'create_profile' THEN
    INSERT INTO public.profiles (id, email, full_name, role, plan, is_active, created_at, updated_at)
    VALUES (
      p_auth_user_id,
      v_target_email,
      COALESCE(split_part(v_target_email, '@', 1), 'User'),
      'usuario'::public.user_role,
      'free'::plan_t,
      true,
      now(), now()
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.orphaned_users_log SET
      status = 'resolved',
      resolution = 'Profile created with role=usuario, plan=free',
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'delete_auth_user' THEN
    UPDATE public.orphaned_users_log SET
      status = 'pending_deletion',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;

  ELSIF p_action = 'ignore' THEN
    UPDATE public.orphaned_users_log SET
      status = 'ignored',
      resolution = p_reason,
      resolved_at = now(),
      resolved_by = v_caller_uid
    WHERE auth_user_id = p_auth_user_id;
  END IF;

  INSERT INTO public.user_audit_log (performed_by, target_user_id, action, metadata)
  VALUES (
    v_caller_uid, p_auth_user_id,
    'ORPHAN_RECONCILED',
    jsonb_build_object(
      'action', p_action,
      'reason', p_reason,
      'email', v_target_email,
      'log_status', CASE
        WHEN p_action = 'create_profile' THEN 'resolved'
        WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
        WHEN p_action = 'ignore' THEN 'ignored'
      END
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'auth_user_id', p_auth_user_id,
    'action', p_action,
    'new_status', CASE
      WHEN p_action = 'create_profile' THEN 'resolved'
      WHEN p_action = 'delete_auth_user' THEN 'pending_deletion'
      WHEN p_action = 'ignore' THEN 'ignored'
    END
  );
END;
$function$


-- ===== oid=138188 public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_transaction_v2(p_transaction_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_units_to_restore numeric;
  v_total_restored numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND';
  END IF;

  IF v_tx.status = 'voided' THEN
    RETURN jsonb_build_object('status', 'idempotent', 'transaction_id', p_transaction_id);
  END IF;

  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only completed transactions can be reversed (status=%)', v_tx.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 2 Reversion administrativa): politica
  -- normativa UNICA can_admin_reverse_transaction: admin global
  -- (alcance transversal *) o membership activa con rol
  -- admin/manager/encargado en LA TIENDA de la transaccion.
  -- La membresia responde "puede operar en la tienda"; el ROL responde
  -- "puede realizar esta operacion administrativa". Ownership NO se
  -- exige (venta ajena permitida dentro del alcance); sin ventana
  -- temporal (doc vigente; la ventana 24h de la doc previa esta
  -- superseda). Todo lo demas de V2 se conserva intacto (GATE 14).
  IF NOT public.can_admin_reverse_transaction(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion administrativa requiere rol admin/manager/encargado en la tienda de la venta';
  END IF;

  FOR v_item IN
    SELECT ti.product_id, ti.quantity, ti.cost_at_sale
    FROM public.transaction_items ti
    WHERE ti.transaction_id = p_transaction_id AND ti.product_id IS NOT NULL
  LOOP
    v_units_to_restore := v_item.quantity;

    -- register_stock_movement genera el stock_movement → trigger genera kardex
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_reverse'::text,
      p_sale_id := p_transaction_id,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Reverso de venta'::text,
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO

    v_total_restored := v_total_restored + v_units_to_restore;
  END LOOP;

  UPDATE public.transactions
  SET status = 'voided',
      updated_at = NOW()
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_TRANSACTION_V2', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'ADMIN_REVERSE'));

  RETURN jsonb_build_object(
    'status', 'success',
    'transaction_id', p_transaction_id,
    'units_restored', v_total_restored
  );
END;
$function$


-- ===== oid=138196 public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_receipt_v2(p_receipt_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_item RECORD;
  -- R1/R6: real caller identity. service_role callers are server-side actors
  -- (/api/reverse injects session.user.id); every other role is pinned to
  -- auth.uid() so p_user_id cannot forge authorship.
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                            THEN COALESCE(p_user_id, auth.uid())
                            ELSE auth.uid() END;
  v_current_stock numeric;
  v_new_stock numeric;
  v_unit_cost_cup numeric;
  v_items_processed int := 0;
  v_reversed_payments int := 0;
BEGIN
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
  IF v_receipt.status <> 'active' THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: status=%', v_receipt.status;
  END IF;

  -- R1 [P1]: tenant/store isolation. Mirrors V1 model + PR-4 guard.
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol (fuente unica can_reverse_document).
  -- Politica congelada: operadores de recepciones (membership admin/manager/
  -- encargado/warehouse en la tienda del receipt) o admin global transversal.
  IF NOT public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de recepcion requiere rol admin/manager/encargado/warehouse en la tienda';
  END IF;

  FOR v_item IN SELECT * FROM public.receipt_items WHERE receipt_id = p_receipt_id LOOP
    v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);

    SELECT stock_current INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id
    FOR UPDATE;
    v_current_stock := COALESCE(v_current_stock, 0);

    -- R2: exact inverse. fn_recalc_wac raises ERR_WAC_REVERSE_NEGATIVE_STOCK
    -- when S + q <= 0 (detection over silence — W7 D-01 / PR-4 / B-12 contract).
    -- fn_recalc_wac locks the product row and updates cost_average with the
    -- app.wac_writer token (single writer).
    PERFORM public.fn_recalc_wac(
      v_receipt.store_id, v_item.product_id, 'reception_reverse',
      -v_item.quantity, v_unit_cost_cup,
      jsonb_build_object('rpc', 'reverse_receipt_v2', 'receipt_id', p_receipt_id));

    v_new_stock := v_current_stock - v_item.quantity;

    UPDATE public.products
    SET stock_current = v_new_stock, updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;

    INSERT INTO public.stock_movements
      (product_id, store_id, movement_type, quantity_change, unit_cost,
       reference_doc, created_at, created_by, movement_date)
    VALUES
      (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type,
       -v_item.quantity, v_unit_cost_cup,
       'Reversión recepción: ' || COALESCE(p_reason, ''), now(), v_caller_uid, now());

    v_items_processed := v_items_processed + 1;
  END LOOP;

  UPDATE public.receipts
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = v_caller_uid,
      reversal_reason = p_reason,
      -- R3: payment reset (PR-4 / void_pending_reception canonical pattern)
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL
  WHERE id = p_receipt_id;

  -- R3: mark related payment transactions (notes marker, canonical pattern)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by reverse_receipt_v2 '
              || p_receipt_id::text || ' at ' || now()::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- R4/R6: unified historical action string + real caller identity
  INSERT INTO public.audit_logs
    (user_id, store_id, action, table_name, record_id, metadata)
  VALUES
    (v_caller_uid, v_receipt.store_id, 'REVERSE_RECEIPT_V2', 'receipts', p_receipt_id,
     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'old_status', v_receipt.status, 'new_status', 'reversed',
                        'operation', 'ADMIN_REVERSE_RECEIPT',
                        'v2_reverse', true));

  RETURN jsonb_build_object('status', 'success',
                            'receipt_id', p_receipt_id,
                            'items_processed', v_items_processed,
                            'payments_reversed', v_reversed_payments);
END
$function$


-- ===== oid=138208 public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reopen_cash_shift(p_closure_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_closure RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'ERR_REASON_REQUIRED: reason must be at least 3 characters';
  END IF;

  SELECT * INTO v_closure FROM public.cash_closures WHERE id = p_closure_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_FOUND';
  END IF;

  IF v_closure.status <> 'cerrado' THEN
    RAISE EXCEPTION 'ERR_CLOSURE_NOT_CLOSED: status=%', v_closure.status;
  END IF;

  -- Auth: solo admin/manager del store
  IF v_caller_uid IS NULL OR NOT public.has_store_role_as(v_caller_uid, v_closure.store_id, ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins/managers can reopen cash closures';
  END IF;

  -- Bypass del trigger de inmutabilidad
  PERFORM set_config('app.bypass_closure_lock', 'true', false);

  UPDATE public.cash_closures SET
    status = 'pendiente',
    notes = COALESCE(notes, '') || E'\n[REOPENED ' || NOW()::text || E'] ' || p_reason
  WHERE id = p_closure_id;

  PERFORM set_config('app.bypass_closure_lock', 'false', false);

  -- Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('CASH_CLOSURE_REOPENED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', 'cerrado', 'reopened_at', NOW()));

  RETURN jsonb_build_object('status', 'success', 'closure_id', p_closure_id);
END;
$function$


-- ===== oid=138210 public.reverse_commissions_on_sale_void() =====
CREATE OR REPLACE FUNCTION public.reverse_commissions_on_sale_void()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment RECORD;
  v_flagged_count int := 0;
BEGIN
  -- Solo disparar cuando status cambia a voided o reversed
  IF NEW.status NOT IN ('voided', 'reversed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Buscar commission_payments cuyo período incluye la transacción
  FOR v_payment IN
    SELECT cp.*
    FROM public.commission_payments cp
    WHERE cp.store_id = NEW.store_id
      AND cp.status IN ('approved', 'paid')
      AND cp.period_start <= NEW.created_at
      AND cp.period_end >= NEW.created_at
  LOOP
    -- Opción A: marcar como flagged_for_review (NO cancelar)
    UPDATE public.commission_payments SET
      status = 'flagged_for_review',
      manual_adjustment_reason = COALESCE(manual_adjustment_reason, '') ||
        E'\n[FLAGGED] Contains sale ' || NEW.id || ' (' || NEW.status || '). Manual review required.',
      updated_at = NOW()
    WHERE id = v_payment.id;

    v_flagged_count := v_flagged_count + 1;

    -- Audit log
    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
    VALUES ('COMMISSION_FLAGGED_FOR_REVIEW', 'commission_payments', v_payment.id::text,
      v_payment.store_id, NEW.seller_id,
      jsonb_build_object(
        'original_payment_id', v_payment.id,
        'voided_sale_id', NEW.id,
        'sale_status', NEW.status,
        'original_amount', v_payment.final_amount,
        'original_status', v_payment.status,
        'reason', 'Sale voided/reversed — manual review required'
      ));
  END LOOP;

  -- Si no se flaggeó ninguna comisión, no es error (puede que no haya comisión para ese período)
  RETURN NEW;
END;
$function$


-- ===== oid=138340 public.set_audit_log_trace_id() =====
CREATE OR REPLACE FUNCTION public.set_audit_log_trace_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_trace_id text;
BEGIN
  v_trace_id := current_setting('app.trace_id', true);
  IF v_trace_id IS NOT NULL AND v_trace_id <> '' THEN
    NEW.trace_id := v_trace_id;
  END IF;
  RETURN NEW;
END;
$function$


-- ===== oid=138536 public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid) =====
CREATE OR REPLACE FUNCTION public.register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now(), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id UUID := gen_random_uuid();
  v_caller_uid UUID := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
  v_total_cost NUMERIC := 0;
  v_item JSONB;
  v_product_id UUID;
  v_quantity NUMERIC;
  v_unit_cost NUMERIC;
  v_moneda TEXT;
  v_tasa NUMERIC;
  v_unit_cost_cup NUMERIC;
  v_variant_id UUID;
  v_conversion_factor NUMERIC := 1;
  v_units_to_add NUMERIC;
  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
  v_uc_base NUMERIC;
BEGIN
  PERFORM public.validate_operation_date(p_reception_date, p_store_id);

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  -- B2 (v2.23.0): Supplier is required
  IF p_supplier IS NULL OR p_supplier = '' THEN
    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
  END IF;

  -- B3 (v2.23.0): Items array must not be empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
  END IF;

  INSERT INTO public.receipts (
    id, store_id, user_id, supplier, reception_date,
    reference_doc, total_cost, status, created_at, updated_at,
    po_id   -- ← nueva columna
  ) VALUES (
    v_receipt_id, p_store_id, v_user_id, p_supplier,
    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
    p_po_id   -- ← pasa NULL si no viene
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::NUMERIC;
    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);

    -- B4 (v2.23.0): Reject items with unit_cost <= 0
    IF v_unit_cost <= 0 THEN
      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
    END IF;
    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);

    -- C1 (v2.23.0): Validate exchange rate is within reasonable range
    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
    END IF;

    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_conversion_factor := 1.0;
    IF v_variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
    END IF;

    -- C2 (v2.23.0): Warning if product has expired lots (non-blocking)
    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id AND store_id = p_store_id
        AND expiration_date IS NOT NULL
        AND expiration_date < v_effective_date
        AND quantity_remaining > 0
    ) THEN
      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
    END IF;

    v_units_to_add := v_quantity * v_conversion_factor;
    v_unit_cost_cup := v_unit_cost * v_tasa;

    -- B5 (v2.23.0): Product must exist in store — RAISE EXCEPTION (not CONTINUE)
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
    END IF;

    INSERT INTO public.receipt_items (
      receipt_id, product_id, variant_id, quantity, unit_cost,
      moneda_recepcion, tasa_cambio_recepcion,
      created_at, updated_at
    ) VALUES (
      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
      v_moneda, v_tasa,
      v_effective_date, v_effective_date
    );

    -- REM-F4-04 (gate 20260908-rem-f4-04): el camino real de recepción termina
    -- en el escritor canónico. El trigger trg_update_product_wac (referenciado
    -- por el comentario A1 v2.22.0) NO existe en la BD viva y
    -- register_stock_movement ya no escribe WAC (A2 v2.22.0).
    -- Orden doctrina W62-01 §6 (idéntico a confirm_pending_reception):
    -- WAC primero → movimiento después (kardex ve ca_new).
    -- Costo por unidad BASE para el blend canónico:
    --   q·uc = units_to_add · (unit_cost_cup/factor) = unit_cost_cup · quantity
    v_uc_base := CASE WHEN COALESCE(v_conversion_factor, 1.0) > 0
                      THEN v_unit_cost_cup / COALESCE(v_conversion_factor, 1.0)
                      ELSE v_unit_cost_cup END;
    PERFORM public.fn_recalc_wac(
      p_store_id   := p_store_id,
      p_product_id := v_product_id,
      p_event      := 'reception_in',
      p_qty_in     := v_units_to_add,
      p_uc_in      := v_uc_base,
      p_source_ref := jsonb_build_object('rpc','register_reception','receipt_id',v_receipt_id)
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_product_id,
      p_store_id := p_store_id,
      p_quantity := v_units_to_add,
      p_movement_type := 'purchase',
      p_reason := 'Recepción de mercancía',
      p_user_id := v_caller_uid,
      p_variant_id := NULL,
      p_sale_id := NULL,
      p_unit_cost := v_unit_cost_cup,
      p_notes := v_receipt_id::text,
      p_operation_date := v_effective_date,
      p_skip_access_check := TRUE
    );


    v_total_cost := v_total_cost + (v_unit_cost_cup * v_quantity);
  END LOOP;

  UPDATE public.receipts SET total_cost = v_total_cost WHERE id = v_receipt_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REGISTER_RECEPTION', 'receipts', v_receipt_id, p_store_id, v_caller_uid,
    jsonb_build_object(
      'supplier', p_supplier,
      'total_cost', v_total_cost,
      'items_count', jsonb_array_length(p_items),
      'po_id', p_po_id
    ));

  RETURN v_receipt_id;
END
$function$


-- ===== oid=138551 public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid, p_reason text) =====
CREATE OR REPLACE FUNCTION public.set_purchase_order_status(p_po_id uuid, p_new_status purchase_status_enum, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id     uuid;
  v_current      public.purchase_status_enum;
  v_po_number    text;
  v_allowed      text[];
  v_is_allowed   boolean := false;
BEGIN
  -- ─── 1. Cargar PO con lock exclusivo ───
  SELECT store_id, status, po_number
    INTO v_store_id, v_current, v_po_number
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_PO_NOT_FOUND';
  END IF;

  -- ─── 2. Validar acceso (tenant-aware) ───
  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- ─── 3. Si no hay cambio, retornar success sin hacer nada ───
  IF v_current = p_new_status THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'po_status', v_current::text,
      'po_number', v_po_number
    );
  END IF;

  -- ─── 4. Definir transiciones permitidas (state machine) ───
  -- 'partial' y 'received' NUNCA son destino válido manualmente
  -- (solo vía receive_against_po).
  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['sent', 'cancelled']
    WHEN 'sent'    THEN ARRAY['cancelled']
    WHEN 'partial' THEN ARRAY['cancelled']
    ELSE ARRAY[]::text[]  -- received, cancelled: terminal, no transitions
  END;

  -- ─── 5. Verificar transición permitida ───
  SELECT EXISTS(SELECT 1 FROM unnest(v_allowed) a WHERE a = p_new_status::text)
    INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current::text, p_new_status::text,
      CASE WHEN array_length(v_allowed, 1) IS NULL THEN 'none' ELSE array_to_string(v_allowed, ', ') END;
  END IF;

  -- ─── 6. Aplicar transición ───
  UPDATE public.purchase_orders
  SET status      = p_new_status,
      received_at = CASE WHEN p_new_status = 'received' THEN NOW() ELSE received_at END
  WHERE id = p_po_id;

  -- ─── 7. Auditoría (action = PO_STATUS_CHANGED) ───
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END, v_store_id, 'PO_STATUS_CHANGED', 'purchase_orders', p_po_id,
    jsonb_build_object(
      'po_number', v_po_number,
      'from_status', v_current::text,
      'to_status', p_new_status::text,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'po_status', p_new_status::text,
    'po_number', v_po_number,
    'previous_status', v_current::text
  );
END;
$function$


-- ===== oid=138596 public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid, p_reason text) =====
CREATE OR REPLACE FUNCTION public.set_received_service_status(p_service_id uuid, p_new_status text, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_current text;
  v_service_number text;
  v_allowed text[];
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number
  INTO v_store_id, v_current, v_service_number
  FROM received_services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND'; END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_current = p_new_status THEN
    RETURN jsonb_build_object('status', 'no_change', 'service_status', v_current);
  END IF;

  v_allowed := CASE v_current
    WHEN 'draft'   THEN ARRAY['active', 'cancelled']::text[]
    WHEN 'active'  THEN ARRAY['voided']::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_new_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: % → % not allowed (allowed: %)',
      v_current, p_new_status, array_to_string(v_allowed, ', ');
  END IF;

  PERFORM set_config('app.is_status_change_rpc', 'true', true);

  UPDATE received_services SET status = p_new_status, updated_at = NOW()
  WHERE id = p_service_id;

  PERFORM set_config('app.is_status_change_rpc', 'false', true);

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_STATUS_CHANGED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'from_status', v_current, 'to_status', p_new_status, 'reason', p_reason
    ));

  RETURN jsonb_build_object('status', 'success', 'service_status', p_new_status, 'previous_status', v_current);
END;
$function$


-- ===== oid=138622 public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_production_order(p_order_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
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

  -- W9.5 B-10: capa normativa de rol. Politica congelada: puerta UI real del
  -- modulo (Costo: membership admin/manager/costo en la tienda de la orden) o
  -- admin global transversal. Observacion de producto registrada (02-policy).
  IF NOT public.can_reverse_document(v_caller_uid, v_order.store_id, 'production_order') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de orden de produccion requiere rol admin/manager/costo en la tienda';
  END IF;
  IF v_order.output_product_id IS NULL THEN RAISE EXCEPTION 'ERR_NO_OUTPUT_TO_REVERSE'; END IF;

  SELECT stock_current, COALESCE(cost_average, 0) INTO v_output_stock, v_output_wac
  FROM products WHERE id = v_order.output_product_id AND store_id = v_order.store_id FOR UPDATE;

  v_new_stock := COALESCE(v_output_stock,0) - COALESCE(v_order.output_quantity,0);
  v_unit_pt_cost := CASE WHEN COALESCE(v_order.output_quantity,0) > 0
                     THEN COALESCE(v_order.output_total_cost,0) / v_order.output_quantity ELSE 0 END;

  IF v_new_stock > 0 THEN
    v_new_wac := public.fn_recalc_wac(v_order.store_id, v_order.output_product_id, 'production_reverse',
                     -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
                     jsonb_build_object('rpc','reverse_production_order','order_id',p_order_id));
  ELSE
    v_new_wac := v_output_wac;
  END IF;

  UPDATE products SET stock_current = GREATEST(0, v_new_stock), updated_at = now()
  WHERE id = v_order.output_product_id AND store_id = v_order.store_id;

  INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
  VALUES (v_order.output_product_id, v_order.store_id, 'production_reverse'::movement_type,
          -COALESCE(v_order.output_quantity,0), v_unit_pt_cost,
          'Reversa producción: ' || COALESCE(p_reason,''), now(), v_caller_uid, now());

  UPDATE production_orders SET status='reversed', reversed_at=now(), reversed_by=v_caller_uid, reversal_reason=p_reason WHERE id=p_order_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order.store_id, 'PRODUCTION_ORDER_REVERSED', 'production_orders', p_order_id,
    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac,
      'old_status', v_order.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_PRODUCTION_ORDER'));

  RETURN jsonb_build_object('status','success','order_id',p_order_id,'wac_before',v_output_wac,'wac_after',v_new_wac);
END $function$


-- ===== oid=138690 public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb) =====
CREATE OR REPLACE FUNCTION public.register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF p_key IS NULL THEN RETURN; END IF;
  -- UPDATE el registro creado por check_idempotency (status='pending')
  UPDATE idempotency_registry
  SET result = p_result
  WHERE idempotency_key = p_key AND operation = p_operation AND param_hash = p_param_hash;
END;
$function$


-- ===== oid=142222 public.restore_transaction_snapshot(p_migration_id text, p_tx_id uuid) =====
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


-- ===== oid=142337 public.reverse_vale_salida(p_slip_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_vale_salida(p_slip_id uuid, p_reason text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_uid uuid;
  v_store_id uuid;
  v_slip_number text;
  v_production_order_id uuid;
  v_item RECORD;
BEGIN
  v_caller_uid := CASE WHEN auth.role() = 'service_role'
                        THEN COALESCE(p_user_id, auth.uid())
                        ELSE auth.uid() END;
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
  END IF;

  SELECT store_id INTO v_store_id FROM issue_slips WHERE id = p_slip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_store_id::text));

  IF NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- V-03 DEFENSE 1: status must be 'completed' (no double reversal)
  -- V-03 DEFENSE 2: slip must have at least one original movement (issue_slip_out or production_out)
  -- The second defense is redundant with the first but protects against data corruption
  -- and future modifications that might break the status check.
  IF NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id::text = p_slip_id::text
      AND movement_type IN ('issue_slip_out', 'production_out')
  ) THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: no original movement found (issue_slip_out or production_out)';
  END IF;

  UPDATE issue_slips
  SET status = 'reversed',
      voided_at = now(),
      voided_by = v_caller_uid,
      void_reason = p_reason
  WHERE id = p_slip_id
    AND status = 'completed'
  RETURNING slip_number, production_order_id INTO v_slip_number, v_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SLIP_NOT_REVERSIBLE: status must be completed';
  END IF;

  FOR v_item IN
    SELECT si.product_id, si.variant_id, si.production_order_item_id,
           si.quantity, si.unit_cost
    FROM issue_slip_items si
    WHERE si.slip_id = p_slip_id
    ORDER BY si.created_at
  LOOP
    DECLARE
      v_reverse_type text;
    BEGIN
      IF v_item.production_order_item_id IS NOT NULL THEN
        v_reverse_type := 'production_reverse';
        UPDATE production_order_items
        SET actual_qty = actual_qty - v_item.quantity,
            status = CASE
              WHEN actual_qty - v_item.quantity <= 0 THEN 'pending'
              ELSE 'partial'
            END,
            updated_at = now()
        WHERE id = v_item.production_order_item_id;
      ELSE
        v_reverse_type := 'issue_slip_reverse';
      END IF;

      PERFORM register_stock_movement(
        p_product_id := v_item.product_id,
        p_store_id := v_store_id,
        p_user_id := v_caller_uid,
        p_quantity := v_item.quantity,
        p_movement_type := v_reverse_type,
        p_sale_id := p_slip_id,
        p_unit_cost := v_item.unit_cost,
        p_reason := 'Reversion Vale de Salida ' || v_slip_number,
        p_notes := COALESCE(p_reason, 'Reversion'),
        p_variant_id := v_item.variant_id,
        p_skip_access_check := TRUE
      );
    END;
  END LOOP;

  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'REVERSE_VALE_SALIDA', 'issue_slips', p_slip_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'slip_number', v_slip_number,
      'reason', p_reason,
      'reversed_at', now(),
      'production_order_id', v_production_order_id
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'slip_id', p_slip_id,
    'slip_number', v_slip_number,
    'new_status', 'reversed'
  );
END;
$function$


-- ===== oid=142582 public.reset_store_data(p_store_id uuid, p_keep_catalog boolean) =====
CREATE OR REPLACE FUNCTION public.reset_store_data(p_store_id uuid, p_keep_catalog boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_store_id uuid := p_store_id;
BEGIN
  -- Validación de acceso
  IF NOT public.has_management_access_as(auth.uid(), target_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin, manager or encargado of the store.';
  END IF;

  -- Activar restore_mode para bypassear triggers de validación
  PERFORM set_config('app.restore_mode', 'true', true);

  BEGIN
    -- ── 1. Datos transaccionales ──
    DELETE FROM payment_transactions WHERE store_id = target_store_id;
    DELETE FROM transaction_items WHERE transaction_id IN (
      SELECT id FROM transactions WHERE store_id = target_store_id
    );
    DELETE FROM transactions WHERE store_id = target_store_id;
    DELETE FROM stock_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_movements WHERE store_id = target_store_id;
    DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
    DELETE FROM receipts WHERE store_id = target_store_id;
    DELETE FROM inventory WHERE store_id = target_store_id;
    DELETE FROM cash_closures WHERE store_id = target_store_id;

    -- ── 2. Catálogo de productos ──
    IF p_keep_catalog THEN
      UPDATE products
      SET
        stock_current = 0,
        cost_average = 0,
        updated_at = NOW()
      WHERE store_id = target_store_id;
    ELSE
      DELETE FROM product_variants WHERE product_id IN (
        SELECT id FROM products WHERE store_id = target_store_id
      );
      DELETE FROM products WHERE store_id = target_store_id;
    END IF;

    -- ── 3. Reconciliación post-restore ──
    -- Después de bypassear triggers, sincronizar products.stock_current
    -- con inventory.quantity. En este punto inventory fue borrado (step 1),
    -- así que todos los productos tendrán stock_current = 0 (correcto para
    -- un reset). La reconciliación es defensiva: si en el futuro se
    -- reconstruye inventory SIN disparar triggers (otro restore), este
    -- código asegura consistencia.
    UPDATE products p
    SET stock_current = COALESCE(
      (SELECT SUM(inv.quantity) FROM inventory inv
       WHERE inv.product_id = p.id AND inv.store_id = p.store_id),
      0
    )
    WHERE p.store_id = target_store_id;

    -- Desactivar restore_mode
    PERFORM set_config('app.restore_mode', 'false', true);

    RAISE NOTICE 'Store % reset completed. Keep catalog: %. Post-restore reconciliation done.', target_store_id, p_keep_catalog;
  EXCEPTION WHEN OTHERS THEN
    -- Asegurar que restore_mode se desactiva incluso si hay error
    PERFORM set_config('app.restore_mode', 'false', true);
    RAISE;
  END;
END;
$function$


-- ===== oid=143548 public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_counter_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_original.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_original.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo ajustes confirmed pueden revertirse (status=%)', v_original.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de ajuste requiere rol admin/manager/encargado en la tienda';
  END IF;

  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_counter_id, v_original.store_id, 'confirmed',
    v_original.reason, v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);
    IF v_diff = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_counter_id, v_item.product_id, v_item.counted_quantity, v_item.expected_quantity
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_counter_id,
      p_unit_cost := 0,
      p_reason := 'Reversión de ajuste: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_ADJUSTMENT_V2', 'inventory_adjustments', p_adjustment_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'counter_adjustment_id', v_counter_id,
      'items_reversed', v_count, 'old_status', v_original.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_ADJUSTMENT'));

  RETURN jsonb_build_object('status', 'success', 'adjustment_id', p_adjustment_id,
    'counter_adjustment_id', v_counter_id, 'items_reversed', v_count);
END;
$function$


-- ===== oid=25557 public.update_inventory_after_sale() =====
CREATE OR REPLACE FUNCTION public.update_inventory_after_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.transactions WHERE id = NEW.transaction_id;

  UPDATE public.inventory
  SET quantity = quantity - NEW.quantity,
      updated_at = timezone('utc', now())
  WHERE store_id = v_store_id
    AND product_id = NEW.product_id;

  -- Registrar movimiento
  INSERT INTO public.stock_movements(
    store_id,
    product_id,
    quantity_change,
    movement_type,
    reference_id,
    created_at
  ) VALUES (
    v_store_id,
    NEW.product_id,
    -NEW.quantity,
    'sale',
    NEW.transaction_id::text,
    timezone('utc', now())
  );

  RETURN NEW;
END;
$function$


-- ===== oid=33484 public.sync_products_stock_current() =====
CREATE OR REPLACE FUNCTION public.sync_products_stock_current()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Bypass durante restauración
  IF current_setting('app.restore_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
  SET stock_current = NEW.quantity
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$function$


-- ===== oid=38664 public.validate_active_store() =====
CREATE OR REPLACE FUNCTION public.validate_active_store()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_role user_role;
BEGIN
    v_role := NEW.role;

    -- Si role es 'costo' o 'admin' o 'superadmin', active_store_id es opcional
    IF v_role = 'costo'::user_role
       OR v_role = 'admin'::user_role
       OR v_role = 'superadmin'::user_role THEN
        -- Solo validar si active_store_id cambió o es INSERT
        IF TG_OP = 'INSERT' OR (OLD.active_store_id IS DISTINCT FROM NEW.active_store_id) THEN
            IF NEW.active_store_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_store_memberships
                    WHERE user_id = NEW.id
                      AND store_id = NEW.active_store_id
                      AND status = 'active'
                ) THEN
                    IF TG_OP = 'UPDATE' THEN
                        RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
                    END IF;
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Para roles operativos (encargado, clerk, warehouse, manager, usuario)
    IF TG_OP = 'INSERT' THEN
        -- En INSERT: ser permisivo. La función managed_create_user inserta
        -- memberships justo después. No validar nada aquí.
        RETURN NEW;
    ELSE
        -- UPDATE: solo validar si active_store_id cambió realmente
        -- (evita bloquear updates de otros campos en perfiles intermedios)
        IF OLD.active_store_id IS NOT DISTINCT FROM NEW.active_store_id THEN
            -- active_store_id no cambió → permitir el UPDATE sin validar
            RETURN NEW;
        END IF;

        -- active_store_id cambió → validar consistencia
        IF NEW.active_store_id IS NULL THEN
            IF v_role IN ('encargado'::user_role, 'clerk'::user_role, 'warehouse'::user_role) THEN
                RAISE EXCEPTION 'ERR_STORE_REQUIRED: El rol % requiere una tienda activa asignada.', v_role;
            END IF;
        ELSE
            IF NOT EXISTS (
                SELECT 1 FROM public.user_store_memberships
                WHERE user_id = NEW.id
                  AND store_id = NEW.active_store_id
                  AND status = 'active'
            ) THEN
                RAISE EXCEPTION 'ERR_INVALID_ACTIVE_STORE: El usuario no tiene membership activa en la tienda seleccionada.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$function$


-- ===== oid=43263 public.update_updated_at_column() =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=59867 public.update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric) =====
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


-- ===== oid=63379 public.validate_transfer_stores() =====
CREATE OR REPLACE FUNCTION public.validate_transfer_stores()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF NEW.origin_store_id = NEW.destination_store_id THEN
        RAISE EXCEPTION 'Origin and Destination stores must be different';
    END IF;
    RETURN NEW;
END;
$function$


-- ===== oid=88196 public.verify_audit_chain() =====
CREATE OR REPLACE FUNCTION public.verify_audit_chain()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_event RECORD;
    v_prev_hash TEXT := NULL;
    v_calculated_hash TEXT;
    v_errors JSONB := '[]'::jsonb;
    v_count INTEGER := 0;
    v_ts_str TEXT;
BEGIN
    FOR v_event IN SELECT * FROM public.audit_events ORDER BY seq_id ASC LOOP
        v_ts_str := to_char(v_event.utc_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
        v_calculated_hash := encode(extensions.digest(v_event.payload_hash || COALESCE(v_prev_hash, '') || v_ts_str, 'sha256'), 'hex');
        IF v_event.event_hash != v_calculated_hash THEN
            v_errors := v_errors || jsonb_build_object('event_id', v_event.id, 'seq', v_event.seq_id, 'error', 'Hash mismatch');
        END IF;
        IF v_event.previous_event_hash IS DISTINCT FROM v_prev_hash THEN
             v_errors := v_errors || jsonb_build_object('event_id', v_event.id, 'seq', v_event.seq_id, 'error', 'Chain broken');
        END IF;
        v_prev_hash := v_event.event_hash;
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('status', CASE WHEN jsonb_array_length(v_errors) > 0 THEN 'error' ELSE 'ok' END, 'verified_events', v_count, 'errors', v_errors);
END;
$function$


-- ===== oid=131067 public.sync_product_stock() =====
CREATE OR REPLACE FUNCTION public.sync_product_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Bypass durante restauración
    IF current_setting('app.restore_mode', true) = 'true' THEN
        RETURN NEW;
    END IF;

    UPDATE public.products
    SET stock_current = COALESCE(
        (SELECT sm.balance_after
         FROM public.stock_movements sm
         WHERE sm.product_id = NEW.product_id
         ORDER BY sm.movement_date DESC, sm.created_at DESC
         LIMIT 1),
        0
    )
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$function$


-- ===== oid=131996 public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text, p_created_by uuid) =====
CREATE OR REPLACE FUNCTION public.upsert_store_cost_template(p_store_id uuid, p_template_id text, p_template_data jsonb, p_modalidad text, p_pdf_format text DEFAULT 'res148'::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  -- Authorization check: caller must be a member of the target store
  IF NOT (public.is_global_admin() OR public.has_store_role(p_store_id, ARRAY['admin', 'manager', 'encargado'])) THEN
    RAISE EXCEPTION 'Sin permisos para modificar la plantilla de esta tienda';
  END IF;

  -- Validate modalidad
  IF p_modalidad NOT IN ('produccion', 'servicios', 'comercializacion') THEN
    RAISE EXCEPTION 'Modalidad inválida. Debe ser: produccion, servicios o comercializacion';
  END IF;

  -- Validate store exists
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
    RAISE EXCEPTION 'Tienda no encontrada o inactiva';
  END IF;

  INSERT INTO store_cost_templates (store_id, template_id, template_data, modalidad, pdf_format, created_by)
  VALUES (p_store_id, p_template_id, p_template_data, p_modalidad, p_pdf_format, p_created_by)
  ON CONFLICT (store_id)
  DO UPDATE SET
    template_id = EXCLUDED.template_id,
    template_data = EXCLUDED.template_data,
    modalidad = EXCLUDED.modalidad,
    pdf_format = EXCLUDED.pdf_format,
    is_active = true,
    updated_at = now()
  RETURNING jsonb_build_object(
    'id', id,
    'store_id', store_id,
    'template_id', template_id,
    'modalidad', modalidad,
    'pdf_format', pdf_format,
    'is_active', is_active,
    'updated_at', updated_at
  ) INTO v_result;

  RETURN v_result;
END;
$function$


-- ===== oid=132195 public.update_suppliers_updated_at() =====
CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=132229 public.update_purchase_orders_updated_at() =====
CREATE OR REPLACE FUNCTION public.update_purchase_orders_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $function$


-- ===== oid=132267 public.update_po_updated_at() =====
CREATE OR REPLACE FUNCTION public.update_po_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$


-- ===== oid=132487 public.validate_transfer_operation_date(p_new_date timestamp with time zone, p_origin_store_id uuid, p_destination_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.validate_transfer_operation_date(p_new_date timestamp with time zone, p_origin_store_id uuid, p_destination_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_origin TIMESTAMP WITH TIME ZONE;
  v_max_dest TIMESTAMP WITH TIME ZONE;
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_max_date_str TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- MAX de cada tienda involucrada
  SELECT public.get_global_max_operation_date(p_origin_store_id) INTO v_max_origin;
  SELECT public.get_global_max_operation_date(p_destination_store_id) INTO v_max_dest;

  -- El más restrictivo de los dos
  v_max_date := GREATEST(v_max_origin, v_max_dest);

  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    v_max_date_str := to_char(v_max_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI');
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior a la fecha mínima permitida (%). La transferencia afecta 2 tiendas y debe respetar el MAX de ambas.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI'),
      v_max_date_str
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$


-- ===== oid=132923 public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text, p_endpoint text, p_count integer, p_sum_value double precision) =====
CREATE OR REPLACE FUNCTION public.upsert_usage_aggregate(p_bucket_start timestamp with time zone, p_bucket_end timestamp with time zone, p_metric_type text, p_service text DEFAULT 'api'::text, p_endpoint text DEFAULT NULL::text, p_count integer DEFAULT 1, p_sum_value double precision DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.usage_aggregates
    (bucket_start, bucket_end, metric_type, service, endpoint, count, sum_value, created_at, updated_at)
  VALUES
    (p_bucket_start, p_bucket_end, p_metric_type, p_service, p_endpoint, p_count, p_sum_value, now(), now())
  ON CONFLICT (bucket_start, metric_type, service, COALESCE(endpoint, ''))
  DO UPDATE SET
    count = usage_aggregates.count + EXCLUDED.count,
    sum_value = usage_aggregates.sum_value + EXCLUDED.sum_value,
    updated_at = now();
END;
$function$


-- ===== oid=133144 public.touch_updated_at() =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=133215 public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.update_reception_items(p_receipt_id uuid, p_item_updates jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_deleted boolean;
  v_new_total numeric := 0;
  v_updated_count integer := 0;
  v_failed_count integer := 0;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT store_id, status INTO v_store_id, v_status
  FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;

  -- PR-2 C4: alinear auth con patrón v2.12.12 (has_store_access_as + v_caller_uid)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_item_updates) LOOP
    v_item_id := (v_item->>'id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_cost := (v_item->>'unit_cost')::numeric;
    v_deleted := COALESCE((v_item->>'deleted')::boolean, false);

    IF v_deleted THEN
      DELETE FROM public.receipt_items WHERE id = v_item_id AND receipt_id = p_receipt_id;
      v_updated_count := v_updated_count + 1;
    ELSE
      UPDATE public.receipt_items
      SET quantity = v_qty, unit_cost = v_cost
      WHERE id = v_item_id AND receipt_id = p_receipt_id;

      IF NOT FOUND THEN
        v_failed_count := v_failed_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- PR-2 C4: recalcular total_cost usando calculate_receipt_total_cup (con tasa)
  v_new_total := public.calculate_receipt_total_cup(p_receipt_id);

  UPDATE public.receipts SET total_cost = v_new_total, updated_at = NOW()
  WHERE id = p_receipt_id;

  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid, v_store_id, 'reception_items_updated', 'receipts', p_receipt_id,
    jsonb_build_object('updated', v_updated_count, 'failed', v_failed_count, 'new_total', v_new_total)
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'updated_count', v_updated_count,
    'failed_count', v_failed_count,
    'new_total', v_new_total
  );
END;
$function$


-- ===== oid=134235 public.update_payment_status() =====
CREATE OR REPLACE FUNCTION public.update_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ref_type TEXT;
  v_ref_id UUID;
  v_total NUMERIC;
  v_paid NUMERIC;
  v_method TEXT;
  v_status TEXT;
  v_doc_status TEXT;
BEGIN
  v_ref_type := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_type ELSE NEW.ref_type END;
  v_ref_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ref_id ELSE NEW.ref_id END;

  IF v_ref_type = 'receipt' THEN
    -- BUG #1 FIX: skip if receipt is voided
    SELECT status INTO v_doc_status FROM receipts WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT total_cost INTO v_total FROM receipts WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'receipt' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE receipts SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type = 'service' THEN
    -- BUG #1 FIX: skip if received_services is voided
    SELECT status INTO v_doc_status FROM received_services WHERE id = v_ref_id;
    IF v_doc_status = 'voided' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT total_amount INTO v_total FROM received_services WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type = 'service' AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE received_services SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;

  ELSIF v_ref_type IN ('production_order', 'work') THEN
    SELECT status INTO v_doc_status FROM production_orders WHERE id = v_ref_id;
    IF v_doc_status IN ('cancelled', 'voided') THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT budget_total INTO v_total FROM production_orders WHERE id = v_ref_id;
    SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid
    FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id;

    v_status := CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partial' ELSE 'unpaid' END;
    v_method := CASE WHEN v_status = 'paid' THEN
      (SELECT payment_method FROM payment_transactions WHERE ref_type IN ('production_order', 'work') AND ref_id = v_ref_id ORDER BY payment_date DESC LIMIT 1)
    ELSE NULL END;

    UPDATE production_orders SET paid_amount = v_paid, payment_status = v_status, payment_method = v_method,
      paid_at = CASE WHEN v_status = 'paid' THEN now() ELSE NULL END
    WHERE id = v_ref_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$


-- ===== oid=134497 public.time_dist(time without time zone, time without time zone) =====
CREATE OR REPLACE FUNCTION public.time_dist(time without time zone, time without time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$time_dist$function$


-- ===== oid=134499 public.ts_dist(timestamp without time zone, timestamp without time zone) =====
CREATE OR REPLACE FUNCTION public.ts_dist(timestamp without time zone, timestamp without time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$ts_dist$function$


-- ===== oid=134501 public.tstz_dist(timestamp with time zone, timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.tstz_dist(timestamp with time zone, timestamp with time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$tstz_dist$function$


-- ===== oid=136714 public.void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) =====
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


-- ===== oid=136850 public.transfer_requires_approval(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb) =====
CREATE OR REPLACE FUNCTION public.transfer_requires_approval(p_origin_store_id uuid, p_destination_store_id uuid, p_items jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_rule RECORD;
  v_total_amount NUMERIC := 0;
  v_total_quantity NUMERIC := 0;
  v_item RECORD;
BEGIN
  -- Obtener tenant_id
  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_origin_store_id;

  -- Buscar regla aplicable: primero por store, luego por tenant
  SELECT * INTO v_rule FROM public.transfer_approval_rules
  WHERE is_active = true
    AND (
      (store_id = p_origin_store_id) OR
      (store_id IS NULL AND tenant_id IS NOT DISTINCT FROM v_tenant_id)
    )
  ORDER BY store_id NULLS LAST
  LIMIT 1;

  IF v_rule.id IS NULL THEN
    RETURN FALSE;  -- no hay regla, no requiere aprobación
  END IF;

  -- Calcular totales
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC, unit_cost NUMERIC)
  LOOP
    v_total_quantity := v_total_quantity + v_item.quantity;
    v_total_amount := v_total_amount + (v_item.quantity * v_item.unit_cost);
  END LOOP;

  -- Verificar umbrales
  IF v_rule.threshold_amount IS NOT NULL AND v_total_amount >= v_rule.threshold_amount THEN
    RETURN TRUE;
  END IF;
  IF v_rule.threshold_quantity IS NOT NULL AND v_total_quantity >= v_rule.threshold_quantity THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$


-- ===== oid=136900 public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.void_inventory_adjustment(p_adjustment_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_adj RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF v_adj IS NULL THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_adj.status != 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden anular ajustes pendientes (estado actual: %)', v_adj.status;
  END IF;

  -- Autorización por tienda
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_adj.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- Marcar como voided (sin tocar stock — los pending no movieron stock)
  -- NOTA: el trigger fn_validate_document_transition permite pending → voided
  -- pero no existe 'voided' en el check de inventory_adjustments del trigger V2.3.
  -- Lo añadimos aquí con UPDATE directo (el trigger podría bloquear).
  -- El trigger V2.3 tiene: pending → confirmed/reversed. Falta voided.
  -- Solución: actualizar sin pasar por el trigger (usando SET session_replication_role)
  -- O mejor: añadir 'voided' al mapa de transiciones.

  UPDATE public.inventory_adjustments
    SET status = 'voided'
    WHERE id = p_adjustment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'id', p_adjustment_id,
    'new_status', 'voided'
  );
END;
$function$


-- ===== oid=137398 public.validate_store_can_be_modified(p_store_id uuid, p_check_type text) =====
CREATE OR REPLACE FUNCTION public.validate_store_can_be_modified(p_store_id uuid, p_check_type text DEFAULT 'soft_delete'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blockers JSONB[] := '{}'::jsonb[];
  v_pending_transfers_out INTEGER := 0;
  v_pending_transfers_in INTEGER := 0;
  v_open_ots INTEGER := 0;
  v_open_cash_sessions INTEGER := 0;
  v_pending_receipts INTEGER := 0;
  v_active_reservations INTEGER := 0;
  v_open_purchase_orders INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_pending_transfers_out
  FROM transfers
  WHERE origin_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');
  IF v_pending_transfers_out > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'OPEN_TRANSFERS_OUT', 'count', v_pending_transfers_out,
      'message', format('Hay %s transferencias salientes pendientes', v_pending_transfers_out)
    ));
  END IF;

  SELECT COUNT(*) INTO v_pending_transfers_in
  FROM transfers
  WHERE destination_store_id = p_store_id
    AND status IN ('PENDIENTE', 'CONFIRMADA');
  IF v_pending_transfers_in > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'OPEN_TRANSFERS_IN', 'count', v_pending_transfers_in,
      'message', format('Hay %s transferencias entrantes pendientes', v_pending_transfers_in)
    ));
  END IF;

  SELECT COUNT(*) INTO v_open_ots
  FROM production_orders
  WHERE store_id = p_store_id
    AND status IN ('draft', 'approved', 'in_progress', 'paused');
  IF v_open_ots > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'OPEN_PRODUCTION_ORDERS', 'count', v_open_ots,
      'message', format('Hay %s órdenes de producción abiertas', v_open_ots)
    ));
  END IF;

  SELECT COUNT(*) INTO v_open_cash_sessions
  FROM cash_sessions
  WHERE store_id = p_store_id
    AND status = 'open';
  IF v_open_cash_sessions > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'OPEN_CASH_SESSION', 'count', v_open_cash_sessions,
      'message', format('Hay %s sesiones de caja abiertas', v_open_cash_sessions)
    ));
  END IF;

  SELECT COUNT(*) INTO v_pending_receipts
  FROM receipts
  WHERE store_id = p_store_id
    AND status IN ('pending', 'active');
  IF v_pending_receipts > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'PENDING_RECEIPTS', 'count', v_pending_receipts,
      'message', format('Hay %s recepciones pendientes', v_pending_receipts)
    ));
  END IF;

  SELECT COUNT(*) INTO v_active_reservations
  FROM inventory_reservations
  WHERE store_id = p_store_id
    AND status = 'ACTIVE';
  IF v_active_reservations > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'ACTIVE_INVENTORY_RESERVATIONS', 'count', v_active_reservations,
      'message', format('Hay %s reservas de inventario activas', v_active_reservations)
    ));
  END IF;

  -- FIX: purchase_status_enum uses lowercase: draft, received, cancelled
  -- 'draft' is the only open state; 'received' and 'cancelled' are closed states
  SELECT COUNT(*) INTO v_open_purchase_orders
  FROM purchase_orders
  WHERE store_id = p_store_id
    AND status = 'draft';
  IF v_open_purchase_orders > 0 THEN
    v_blockers := array_append(v_blockers, jsonb_build_object(
      'store_id', p_store_id, 'type', 'OPEN_PURCHASE_ORDERS', 'count', v_open_purchase_orders,
      'message', format('Hay %s órdenes de compra en borrador', v_open_purchase_orders)
    ));
  END IF;

  RETURN jsonb_build_object(
    'can_delete', array_length(v_blockers, 1) IS NULL,
    'can_modify', array_length(v_blockers, 1) IS NULL,
    'blockers', COALESCE(array_to_json(v_blockers)::jsonb, '[]'::jsonb)
  );
END;
$function$


-- ===== oid=137560 public.validate_backup_registry_drift() =====
CREATE OR REPLACE FUNCTION public.validate_backup_registry_drift()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_discovered JSONB;
  v_registered TEXT[];
  v_in_db TEXT[];
  v_missing_in_registry TEXT[];
  v_missing_in_db TEXT[];
BEGIN
  -- Lista real desde information_schema
  SELECT jsonb_agg(t->>'table_name') INTO v_discovered
  FROM jsonb_array_elements(public.discover_backup_tables()) AS t;

  SELECT array_agg(value::text) INTO v_in_db
  FROM jsonb_array_elements_text(v_discovered);

  -- Lista registrada
  SELECT array_agg(table_name) INTO v_registered
  FROM public.backup_table_registry;

  -- Tablas en DB pero no en registry
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_registry
  FROM unnest(v_in_db) AS t
  WHERE NOT (t = ANY(v_registered));

  -- Tablas en registry pero no en DB
  SELECT COALESCE(array_agg(DISTINCT t), ARRAY[]::TEXT[]) INTO v_missing_in_db
  FROM unnest(v_registered) AS t
  WHERE NOT (t = ANY(v_in_db));

  RETURN jsonb_build_object(
    'tables_in_db', jsonb_build_array(v_in_db),
    'tables_in_registry', jsonb_build_array(v_registered),
    'missing_in_registry', to_jsonb(v_missing_in_registry),
    'missing_in_db', to_jsonb(v_missing_in_db),
    'drift_detected', jsonb_build_array(v_missing_in_registry) != '[]'::jsonb
                       OR jsonb_build_array(v_missing_in_db) != '[]'::jsonb
  );
END;
$function$


-- ===== oid=137561 public.validate_post_restore(p_store_id uuid, p_backup_payload jsonb) =====
CREATE OR REPLACE FUNCTION public.validate_post_restore(p_store_id uuid, p_backup_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_inventory_count INTEGER;
  v_movements_count INTEGER;
  v_products_count INTEGER;
  v_kardex_count INTEGER;
  v_inventory_mismatches INTEGER := 0;
  v_trigger_failures INTEGER := 0;
  v_legacy_discrepancies INTEGER := 0;
  v_backup_inventory_count INTEGER := 0;
  v_backup_products_count INTEGER := 0;
  v_inventory_backup_jsonb JSONB;
  v_product_id UUID;
  v_backup_qty NUMERIC;
  v_actual_qty NUMERIC;
  v_row JSONB;
BEGIN
  -- Conteos actuales post-restore
  SELECT COUNT(*) INTO v_inventory_count
  FROM public.inventory WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_movements_count
  FROM public.stock_movements WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_products_count
  FROM public.products WHERE store_id = p_store_id;

  SELECT COUNT(*) INTO v_kardex_count
  FROM public.kardex_entries WHERE store_id = p_store_id;

  -- Si se proporciona el backup, validar consistencia
  IF p_backup_payload IS NOT NULL THEN
    v_inventory_backup_jsonb := COALESCE(p_backup_payload->'tables'->'inventory', '[]'::jsonb);
    v_backup_inventory_count := jsonb_array_length(v_inventory_backup_jsonb);

    v_backup_products_count := jsonb_array_length(
      COALESCE(p_backup_payload->'tables'->'products', '[]'::jsonb)
    );

    -- CHECK 1 (CRÍTICO): inventory.quantity restaurado == backup
    -- Para cada fila en inventory, verificar que existe en el backup con la misma quantity
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_inventory_backup_jsonb) LOOP
      v_product_id := (v_row->>'product_id')::UUID;
      v_backup_qty := (v_row->>'quantity')::NUMERIC;

      SELECT quantity INTO v_actual_qty
      FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id;

      IF v_actual_qty IS NULL THEN
        -- Fila del backup no existe en inventory restaurado
        v_inventory_mismatches := v_inventory_mismatches + 1;
      ELSIF v_actual_qty != v_backup_qty THEN
        -- Cantidad no coincide
        v_inventory_mismatches := v_inventory_mismatches + 1;
      END IF;
    END LOOP;

    -- También verificar filas en inventory restaurado que NO están en el backup
    SELECT count(*) INTO v_inventory_mismatches
    FROM public.inventory i
    WHERE i.store_id = p_store_id
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_inventory_backup_jsonb) AS b
        WHERE (b->>'product_id')::UUID = i.product_id
          AND (b->>'quantity')::NUMERIC = i.quantity
      );

    -- CHECK 2 (HIGH): products.stock_current == inventory.quantity
    SELECT COUNT(*) INTO v_trigger_failures
    FROM public.products p
    JOIN public.inventory i ON i.product_id = p.id AND i.store_id = p.store_id
    WHERE p.store_id = p_store_id
      AND p.stock_current != i.quantity;

    -- CHECK 3 (WARN): inventory != SUM(stock_movements)
    -- Esperado para datos legacy (4 productos en Puerto Padre)
    SELECT COUNT(*) INTO v_legacy_discrepancies
    FROM (
      SELECT i.product_id, i.quantity as inv_qty,
             COALESCE(SUM(sm.quantity_change), 0) as mov_sum
      FROM public.inventory i
      LEFT JOIN public.stock_movements sm
        ON sm.product_id = i.product_id AND sm.store_id = i.store_id
      WHERE i.store_id = p_store_id
      GROUP BY i.product_id, i.quantity
    ) t
    WHERE inv_qty != mov_sum;
  END IF;

  v_result := jsonb_build_object(
    'validated_at', NOW(),
    'store_id', p_store_id,
    'counts', jsonb_build_object(
      'inventory', v_inventory_count,
      'stock_movements', v_movements_count,
      'products', v_products_count,
      'kardex_entries', v_kardex_count
    ),
    'backup_counts', jsonb_build_object(
      'inventory', v_backup_inventory_count,
      'products', v_backup_products_count
    ),
    'checks', jsonb_build_object(
      'inventory_matches_backup', jsonb_build_object(
        'status', CASE WHEN v_inventory_mismatches = 0 THEN 'PASS' ELSE 'FAIL' END,
        'mismatches', v_inventory_mismatches,
        'severity', 'CRITICAL',
        'description', 'inventory.quantity restaurado debe coincidir con el backup'
      ),
      'products_stock_current_consistency', jsonb_build_object(
        'status', CASE WHEN v_trigger_failures = 0 THEN 'PASS' ELSE 'FAIL' END,
        'failures', v_trigger_failures,
        'severity', 'HIGH',
        'description', 'products.stock_current debe ser igual a inventory.quantity'
      ),
      'inventory_movements_legacy_discrepancies', jsonb_build_object(
        'status', 'WARN',
        'discrepancies', v_legacy_discrepancies,
        'severity', 'INFO',
        'description', 'inventory.quantity != SUM(stock_movements) — esperado para datos legacy'
      )
    ),
    'overall_status', CASE
      WHEN v_inventory_mismatches > 0 THEN 'FAIL'
      WHEN v_trigger_failures > 0 THEN 'FAIL'
      ELSE 'PASS'
    END
  );

  RETURN v_result;
END;
$function$


-- ===== oid=137569 public.validate_pre_restore_fk_integrity(p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.validate_pre_restore_fk_integrity(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blockers JSONB := '[]'::jsonb;
  v_rec RECORD;
  v_row_count BIGINT;
  v_target_strategy TEXT;
BEGIN
  FOR v_rec IN
    SELECT
      cl2.relname AS target_table,
      cl.relname AS blocking_table,
      a.attname AS fk_column,
      con.conname AS fk_name,
      con.confdeltype AS delete_rule_code
    FROM pg_constraint con
    JOIN pg_class cl ON con.conrelid = cl.oid       -- blocking table (has FK)
    JOIN pg_class cl2 ON con.confrelid = cl2.oid    -- target table (referenced)
    JOIN pg_namespace n ON cl.relnamespace = n.oid
    JOIN pg_namespace n2 ON cl2.relnamespace = n2.oid
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE n.nspname = 'public'
      AND n2.nspname = 'public'
      AND con.contype = 'f'
      -- Solo NO ACTION (a) o RESTRICT (r) — CASCADE (c), SET NULL (n), SET DEFAULT (d) no bloquean
      AND con.confdeltype IN ('a', 'r')
      -- target_table debe ser una tabla store-scoped en el registry (no excluida)
      AND cl2.relname IN (
        SELECT table_name FROM public.backup_table_registry
        WHERE excluded_from_restore = FALSE
          AND filter_strategy IN ('store_id', 'via_origin_dest', 'via_entity_id')
      )
      -- blocking_table NO debe estar en el registry activo
      -- (si estuviera, también se DELETEaría y su cascade resolvería)
      AND cl.relname NOT IN (
        SELECT table_name FROM public.backup_table_registry
        WHERE excluded_from_restore = FALSE
      )
    ORDER BY cl2.relname, cl.relname
  LOOP
    -- Determinar la estrategia de filtro del target
    SELECT filter_strategy INTO v_target_strategy
    FROM public.backup_table_registry
    WHERE table_name = v_rec.target_table;

    -- Contar filas blocking que referencian filas store-scoped
    BEGIN
      IF v_target_strategy = 'via_origin_dest' THEN
        -- transfers: origin_store_id OR destination_store_id
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND (t.origin_store_id = $1 OR t.destination_store_id = $1))',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      ELSIF v_target_strategy = 'via_entity_id' THEN
        -- business_events: entity_id = store_id::text
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND t.entity_id = $1::text)',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      ELSE
        -- store_id filter (default)
        EXECUTE format(
          'SELECT count(*) FROM public.%I b WHERE EXISTS (SELECT 1 FROM public.%I t WHERE t.id = b.%I AND t.store_id = $1)',
          v_rec.blocking_table, v_rec.target_table, v_rec.fk_column
        ) INTO v_row_count USING p_store_id;
      END IF;

      IF v_row_count > 0 THEN
        v_blockers := v_blockers || jsonb_build_object(
          'target_table', v_rec.target_table,
          'blocking_table', v_rec.blocking_table,
          'fk_column', v_rec.fk_column,
          'fk_name', v_rec.fk_name,
          'delete_rule', CASE v_rec.delete_rule_code
                           WHEN 'a' THEN 'NO ACTION'
                           WHEN 'r' THEN 'RESTRICT'
                         END,
          'blocking_row_count', v_row_count
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Si la query falla (ej: la tabla no tiene la columna esperada),
      -- reportar como warning pero no fallar
      v_blockers := v_blockers || jsonb_build_object(
        'target_table', v_rec.target_table,
        'blocking_table', v_rec.blocking_table,
        'fk_column', v_rec.fk_column,
        'fk_name', v_rec.fk_name,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'checked_at', NOW(),
    'blockers', v_blockers,
    'blocker_count', jsonb_array_length(v_blockers),
    'can_proceed', jsonb_array_length(v_blockers) = 0
  );
END;
$function$


-- ===== oid=138000 public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.void_transaction(p_transaction_id uuid, p_reason text, p_operation_date timestamp with time zone DEFAULT now(), p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_tx RECORD;
  v_item RECORD;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_eff TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
  v_conversion_factor integer := 1;
  v_units_to_restore numeric;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TX_NOT_FOUND'; END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): guard de estado explicito
  -- (endurecimiento B-9a: rechaza estados distintos de completed/voided
  -- ANTES de tocar datos; el trigger trg_validate_tx_transition sigue
  -- siendo la segunda barrera).
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: void_transaction (POS undo) solo permite completed (status=%)', v_tx.status;
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): politica normativa UNICA
  -- can_pos_undo_transaction: venta propia + ventana server-side 30s
  -- + estado completed + rol operativo POS (membership por tienda o
  -- admin global). Identidad SIEMPRE auth.uid() para no-service_role;
  -- p_user_id del cliente no puede convertirse en actor.
  IF NOT public.can_pos_undo_transaction(p_transaction_id, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: POS undo requiere venta propia, dentro de la ventana de 30s y rol operativo POS en la tienda';
  END IF;

  UPDATE public.transactions
    SET status = 'voided', void_reason = p_reason, cancelled_at = v_eff, updated_at = NOW()
    WHERE id = p_transaction_id;

  -- FIX C-7: Restaurar stock considerando conversion_factor de variantes.
  -- Si transaction_items.variant_id está poblado, buscar conversion_factor.
  -- Si variant_id es NULL (ventas legacy), usar 1 (sin conversión) para
  -- mantener simetría con create_sale legacy.
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id LOOP
    v_conversion_factor := 1;
    IF v_item.variant_id IS NOT NULL THEN
      SELECT conversion_factor INTO v_conversion_factor
        FROM public.product_variants WHERE id = v_item.variant_id;
      v_conversion_factor := COALESCE(v_conversion_factor, 1);
    END IF;

    v_units_to_restore := v_item.quantity * v_conversion_factor;

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_tx.store_id,
      p_user_id := v_caller_uid,
      p_quantity := v_units_to_restore,
      p_movement_type := 'sale_void',
      p_notes := p_transaction_id::text,
      p_unit_cost := v_item.cost_at_sale,
      p_reason := 'Void de venta',
      p_operation_date := v_eff,
      p_skip_access_check := TRUE
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('VOID_SALE', 'transactions', p_transaction_id, v_tx.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'POS_UNDO'));

  RETURN jsonb_build_object('status', 'success', 'transaction_id', p_transaction_id);
END;

$function$


-- ===== oid=138055 public.update_orphaned_users_log_updated_at() =====
CREATE OR REPLACE FUNCTION public.update_orphaned_users_log_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=138088 public.update_user_invitations_updated_at() =====
CREATE OR REPLACE FUNCTION public.update_user_invitations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


-- ===== oid=138148 public.validate_tenant_access(p_user_id uuid, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.validate_tenant_access(p_user_id uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_tenant uuid;
  v_store_tenant uuid;
  v_user_role public.user_role;
BEGIN
  -- Global admin bypasses tenant check
  SELECT role, tenant_id INTO v_user_role, v_user_tenant
    FROM public.profiles WHERE id = p_user_id;

  IF v_user_role IN ('admin', 'superadmin') THEN
    RETURN true;
  END IF;

  -- Get store's tenant
  SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;

  IF v_store_tenant IS NULL THEN
    -- Legacy store without tenant — allow (backward compat)
    RETURN true;
  END IF;

  -- Check tenant match
  RETURN v_user_tenant = v_store_tenant;
END;
$function$


-- ===== oid=138292 public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid) =====
CREATE OR REPLACE FUNCTION public.validate_operation_date(p_new_date timestamp with time zone, p_store_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today_business DATE;
  v_min_date_business DATE;
  v_max_date_business DATE;
  v_new_date_business DATE;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN;
  END IF;

  -- PR-4.4E: comparar fechas de NEGOCIO (date-only) en timezone America/Havana
  v_today_business := (NOW() AT TIME ZONE 'America/Havana')::DATE;
  -- CAMBIO: 2 months → 6 months
  v_min_date_business := v_today_business - INTERVAL '6 months';
  v_max_date_business := v_today_business + INTERVAL '1 day';
  v_new_date_business := (p_new_date AT TIME ZONE 'America/Havana')::DATE;

  IF v_new_date_business < v_min_date_business THEN
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior al límite histórico permitido de 6 meses (mínimo: %). No se pueden registrar operaciones con más de 6 meses de antigüedad.',
      to_char(v_new_date_business, 'DD/MM/YYYY'),
      to_char(v_min_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new_date_business > v_max_date_business THEN
    RAISE EXCEPTION 'ERR_FUTURE_DATED_DOCUMENT: La fecha % es posterior al máximo permitido (hoy + 1 día). No se pueden registrar operaciones con fechas futuras.',
      to_char(v_new_date_business, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$


-- ===== oid=138343 public.test_trace_id_setting() =====
CREATE OR REPLACE FUNCTION public.test_trace_id_setting()
 RETURNS text
 LANGUAGE sql
AS $function$ SELECT current_setting('app.trace_id', true) $function$


-- ===== oid=138595 public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.void_received_service_with_reversal(p_service_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulacion con reversion'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_store_id uuid;
  v_status text;
  v_service_number text;
  v_payment_status text;
  v_paid_amount numeric;
  v_caller_uid uuid := COALESCE(p_user_id, auth.uid());
  v_eff_date timestamp with time zone := COALESCE(p_operation_date, NOW());
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_service_id::text));

  SELECT store_id, status, service_number, payment_status, paid_amount
  INTO v_store_id, v_status, v_service_number, v_payment_status, v_paid_amount
  FROM received_services
  WHERE id = p_service_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_SERVICE_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  IF NOT public.has_store_access(v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  PERFORM public.validate_operation_date(p_operation_date, v_store_id);

  PERFORM set_config('app.is_void_rpc', 'true', true);

  DELETE FROM service_reception_links WHERE service_id = p_service_id;
  DELETE FROM service_cost_distributions WHERE service_id = p_service_id;

  UPDATE received_services
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_service_id;

  UPDATE payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by service void ' || p_service_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'service' AND ref_id = p_service_id;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_store_id, 'SERVICE_VOIDED', 'received_services', p_service_id,
    jsonb_build_object(
      'service_number', v_service_number,
      'reason', p_reason,
      'before_status', v_status,
      'after_status', 'voided',
      'before_payment_status', v_payment_status,
      'before_paid_amount', v_paid_amount,
      'payment_transactions_reversed', (SELECT COUNT(*) FROM payment_transactions WHERE ref_type='service' AND ref_id=p_service_id)
    ));

  PERFORM set_config('app.is_void_rpc', 'false', true);

  RETURN jsonb_build_object(
    'status', 'success', 'service_id', p_service_id,
    'service_number', v_service_number, 'new_status', 'voided'
  );
END;
$function$


-- ===== oid=138619 public.void_closed_production_order(p_order_id uuid, p_reason text, p_user_id uuid) =====
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


-- ===== oid=138785 public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text, p_motivo text, p_user_id uuid) =====
CREATE OR REPLACE FUNCTION public.update_receipt_item_tasa(p_receipt_item_id uuid, p_new_tasa_cambio_recepcion numeric, p_new_moneda_recepcion text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_item RECORD;
  v_store_id uuid;
  v_receipt_id uuid;
  v_old_tasa numeric;
  v_old_moneda text;
  v_effective_moneda text;
  v_new_total numeric;
  v_caller_uid uuid := CASE
    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
    ELSE auth.uid()
  END;
BEGIN
  -- (1) Lock item + receipt
  SELECT
    ri.id AS item_id,
    ri.receipt_id,
    ri.quantity,
    ri.unit_cost,
    ri.moneda_recepcion,
    ri.tasa_cambio_recepcion,
    r.store_id,
    r.status AS receipt_status
  INTO v_item
  FROM public.receipt_items ri
  JOIN public.receipts r ON r.id = ri.receipt_id
  WHERE ri.id = p_receipt_item_id
  FOR UPDATE OF ri, r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_ITEM_NOT_FOUND';
  END IF;

  v_store_id := v_item.store_id;
  v_receipt_id := v_item.receipt_id;
  v_old_tasa := v_item.tasa_cambio_recepcion;
  v_old_moneda := v_item.moneda_recepcion;

  -- (2) Authorization
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- (3) Status guard
  IF v_item.receipt_status = 'voided' THEN
    RAISE EXCEPTION 'ERR_ALREADY_VOIDED';
  END IF;
  IF v_item.receipt_status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_NOT_EDITABLE: solo recepciones pendientes';
  END IF;

  -- (4) Validación coherencia moneda ↔ tasa
  IF p_new_moneda_recepcion IS NOT NULL
     AND p_new_moneda_recepcion NOT IN ('CUP', 'USD', 'EUR', 'MLC')
  THEN
    RAISE EXCEPTION 'ERR_UNSUPPORTED_CURRENCY: % no soportada', p_new_moneda_recepcion;
  END IF;

  v_effective_moneda := COALESCE(p_new_moneda_recepcion, v_old_moneda);

  -- CUP = tasa 1 (estricto)
  IF v_effective_moneda = 'CUP'
     AND p_new_tasa_cambio_recepcion IS DISTINCT FROM 1.0
  THEN
    RAISE EXCEPTION 'ERR_CUP_RATE_MUST_BE_1: moneda CUP requiere tasa=1, recibido %',
      p_new_tasa_cambio_recepcion;
  END IF;

  -- FX = tasa > 1.5
  IF v_effective_moneda <> 'CUP' THEN
    IF p_new_tasa_cambio_recepcion IS NULL OR p_new_tasa_cambio_recepcion <= 1.5 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: moneda % requiere tasa > 1.5, recibido %',
        v_effective_moneda, COALESCE(p_new_tasa_cambio_recepcion::text, 'NULL');
    END IF;
    IF p_new_tasa_cambio_recepcion < 0.01 OR p_new_tasa_cambio_recepcion > 10000 THEN
      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa % fuera de rango [0.01, 10000]',
        p_new_tasa_cambio_recepcion;
    END IF;
  END IF;

  -- (5) No-op guard
  IF v_old_tasa IS NOT DISTINCT FROM p_new_tasa_cambio_recepcion
     AND (p_new_moneda_recepcion IS NULL OR v_old_moneda = p_new_moneda_recepcion)
  THEN
    RETURN jsonb_build_object(
      'status', 'no_change',
      'receipt_item_id', p_receipt_item_id,
      'receipt_id', v_receipt_id
    );
  END IF;

  -- (6) Audit BEFORE mutating
  INSERT INTO public.receipt_tasa_audit (
    receipt_item_id, valor_anterior, valor_nuevo,
    moneda_anterior, moneda_nueva, modificado_por, modificado_at, motivo
  ) VALUES (
    p_receipt_item_id,
    v_old_tasa,
    p_new_tasa_cambio_recepcion,
    v_old_moneda,
    COALESCE(p_new_moneda_recepcion, v_old_moneda),
    v_caller_uid,
    NOW(),
    COALESCE(p_motivo, 'update_receipt_item_tasa RPC')
  );

  -- (7) Mutate receipt_items
  UPDATE public.receipt_items
    SET
      tasa_cambio_recepcion = p_new_tasa_cambio_recepcion,
      moneda_recepcion = COALESCE(p_new_moneda_recepcion, moneda_recepcion),
      updated_at = NOW()
    WHERE id = p_receipt_item_id;

  -- (8) Recalcular total_cost — UNA sola llamada
  v_new_total := public.calculate_receipt_total_cup(v_receipt_id);

  UPDATE public.receipts
    SET
      total_cost = v_new_total,
      updated_at = NOW()
    WHERE id = v_receipt_id;

  -- (9) Audit log
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES (
    'UPDATE_RECEIPT_ITEM_TASA', 'receipt_items', p_receipt_item_id, v_store_id, v_caller_uid,
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'valor_anterior', v_old_tasa,
      'valor_nuevo', p_new_tasa_cambio_recepcion,
      'moneda_anterior', v_old_moneda,
      'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
      'motivo', p_motivo
    )
  );

  -- (10) Return
  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_item_id', p_receipt_item_id,
    'receipt_id', v_receipt_id,
    'valor_anterior', v_old_tasa,
    'valor_nuevo', p_new_tasa_cambio_recepcion,
    'moneda_anterior', v_old_moneda,
    'moneda_nueva', COALESCE(p_new_moneda_recepcion, v_old_moneda),
    'new_total_cost', v_new_total
  );
END;
$function$


-- ===== oid=138819 public.void_pending_reception(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone) =====
CREATE OR REPLACE FUNCTION public.void_pending_reception(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Anulación de recepción pendiente'::text, p_operation_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role'
                       THEN COALESCE(p_user_id, auth.uid())
                       ELSE auth.uid() END;
  v_eff_date timestamptz := COALESCE(p_operation_date, NOW());
  v_reversed_payments integer;
BEGIN
  -- 1. Lock receipt (FOR UPDATE para concurrencia)
  SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND';
  END IF;

  -- 2. Idempotency: already voided → return success sin efectos
  IF v_receipt.status = 'voided' THEN
    RETURN jsonb_build_object(
      'status', 'idempotent',
      'receipt_id', p_receipt_id,
      'message', 'receipt already voided — no changes applied'
    );
  END IF;

  -- 3. Status guard: only pending can be voided here
  IF v_receipt.status <> 'pending' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: only pending receipts can be voided here (status=%)',
      v_receipt.status;
  END IF;

  -- 4. Authorization (patrón v2.12.12: OR no AND)
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- 5. Operation date validation (política forward-only)
  PERFORM public.validate_operation_date(p_operation_date, v_receipt.store_id);

  -- 6. Mark payment_transactions as REVERSED (if any exist)
  UPDATE public.payment_transactions
  SET notes = COALESCE(notes, '') || ' [REVERSED by void_pending_reception ' || p_receipt_id::text || ' at ' || v_eff_date::text || ']'
  WHERE ref_type = 'receipt' AND ref_id = p_receipt_id;
  GET DIAGNOSTICS v_reversed_payments = ROW_COUNT;

  -- 7. Update receipt: voided + reset payment fields. DO NOT DELETE items.
  UPDATE public.receipts
  SET status = 'voided',
      payment_status = 'unpaid',
      paid_amount = 0,
      paid_at = NULL,
      updated_at = v_eff_date
  WHERE id = p_receipt_id;

  -- 8. Audit log (atómico dentro de la transacción)
  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (
    v_caller_uid,
    v_receipt.store_id,
    'RECEPTION_VOIDED_PENDING',
    'receipts',
    p_receipt_id,
    jsonb_build_object(
      'reason', p_reason,
      'payments_reversed', v_reversed_payments,
      'items_preserved', (SELECT COUNT(*) FROM public.receipt_items WHERE receipt_id = p_receipt_id)
    )
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'receipt_id', p_receipt_id,
    'payments_reversed', v_reversed_payments
  );
END;
$function$


-- ===== oid=142115 public.validate_payment_transactions_invariants() =====
CREATE OR REPLACE FUNCTION public.validate_payment_transactions_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; /* DF-03: los refunds (direction='refund') son contra-asientos de trazabilidad — NO se suman como pago hacia el total del documento */ IF NEW.transaction_id IS NOT NULL AND NEW.direction <> 'refund' THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id AND direction <> 'refund'; IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id AND direction <> 'refund' LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END $function$


-- ===== oid=142883 public.upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date, p_source text, p_capture_method text, p_source_ip text) =====
CREATE OR REPLACE FUNCTION public.upsert_manual_exchange_rate_with_audit(p_actor_id uuid, p_currency text, p_rate numeric, p_rate_date date DEFAULT NULL::date, p_source text DEFAULT 'elToque'::text, p_capture_method text DEFAULT 'real'::text, p_source_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_role text;
  v_today date := COALESCE(p_rate_date, CURRENT_DATE);
  v_old_rate numeric;
  v_old_rate_date date;
  v_row_id uuid;
  v_audit_id uuid;
BEGIN
  -- ── 1) Autorización contra la fuente de verdad (BD) ─────────────────────
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: actor nulo'
      USING ERRCODE = '42501';
  END IF;

  SELECT role::text INTO v_actor_role
    FROM public.profiles
   WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ERR_FORBIDDEN_ACTOR_NOT_ADMIN: % no es admin global',
      COALESCE(p_actor_id::text,'NULL')
      USING ERRCODE = '42501';
  END IF;

  -- ── 2) Snapshot bloqueado del valor inmediatamente anterior (H1) ────────
  SELECT er.rate, er.rate_date INTO v_old_rate, v_old_rate_date
    FROM public.exchange_rates er
   WHERE er.currency = p_currency
     AND er.source = p_source
     AND er.segment = '3'
   ORDER BY er.rate_date DESC, er.captured_at DESC
   LIMIT 1
   FOR UPDATE;

  -- ── 3) Mutación de la tasa (mismo conflict-key que la ruta histórica) ───
  INSERT INTO public.exchange_rates
    (rate_date, captured_at, currency, source, segment, rate, capture_method)
  VALUES (
    v_today, now(), p_currency, p_source, '3', p_rate,
    CASE WHEN p_capture_method IN ('real','estimated') THEN p_capture_method ELSE 'real' END
  )
  ON CONFLICT (rate_date, currency, source, segment)
  DO UPDATE SET rate = EXCLUDED.rate, captured_at = EXCLUDED.captured_at
  RETURNING id INTO v_row_id;

  -- ── 4) Pista de auditoría — MISMA TRANSACCIÓN (¿quién, qué, cuándo,
--        entidad, old/new?) ────────────────────────────────────────────────
  INSERT INTO public.exchange_rate_audit
    (actor_id, action, currency, old_rate, old_rate_date, new_rate, rate_date, source_ip)
  VALUES (
    p_actor_id, 'manual_upsert', p_currency,
    v_old_rate, v_old_rate_date, p_rate, v_today, p_source_ip
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'row_id', v_row_id,
    'audit_id', v_audit_id,
    'currency', p_currency,
    'old_rate', v_old_rate,
    'old_rate_date', v_old_rate_date,
    'new_rate', p_rate,
    'rate_date', v_today,
    'actor_role', v_actor_role
  );
END;
$function$


-- ===== oid=142967 public.w62_df04_classify(p_receipt_ts timestamp with time zone, p_qty numeric, p_unit_cost numeric, p_has_doc boolean) =====
CREATE OR REPLACE FUNCTION public.w62_df04_classify(p_receipt_ts timestamp with time zone, p_qty numeric, p_unit_cost numeric, p_has_doc boolean)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_qty IS NULL OR p_qty <= 0
         THEN 'EXCLYE:QTY_CERO_NO_APORTA'
    WHEN p_receipt_ts >= COALESCE((SELECT NULLIF(value->>'placeholder','<owner_decision_W8>')::timestamptz FROM public.w62_df04_design_params WHERE param='T_canon'), (SELECT (value->>'value')::timestamptz FROM public.w62_df04_design_params WHERE param='T_canon_demo'), 'infinity'::timestamptz)
         THEN 'EXCLYE:POSTERIOR_A_T_CANON_FUERA_DE_VENTANA'
    WHEN p_unit_cost IS NULL
         THEN 'EXCLYE:CR-W6-6_COSTO_NULO_RECON_GAP'
    WHEN p_unit_cost = 0
         THEN 'EXCLYE:CR-W6-6_COSTO_CERO_RECON_GAP'
    WHEN NOT p_has_doc
         THEN 'EXCLYE:SKU_SIN_DOCUMENTACION_RECON_GAP'
    ELSE 'ENTRA'
  END
$function$


-- ===== oid=138616 public.withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text) =====
CREATE OR REPLACE FUNCTION public.withdraw_production_item_deprecated_6arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_order_id UUID; v_product_id UUID; v_variant_id UUID; v_user_id UUID;
  v_qty_int INTEGER; v_order_store_id UUID; v_order_status TEXT;
  v_existing_result JSONB; v_param_hash TEXT;
  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_param_hash := md5(p_item_id::text || '|' || p_qty::text || '|' || p_unit_cost::text || '|' || p_store_id::text || '|' || COALESCE(p_user_id::text, ''));
    v_existing_result := public.check_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash);
    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
  END IF;

  SELECT order_id, product_id, variant_id INTO v_order_id, v_product_id, v_variant_id
  FROM production_order_items WHERE id = p_item_id FOR UPDATE;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'ERR_ITEM_NOT_FOUND'; END IF;

  SELECT store_id, status INTO v_order_store_id, v_order_status
  FROM production_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF v_order_status NOT IN ('in_progress', 'approved') THEN
    RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: status % no permite withdraw', v_order_status;
  END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;

  v_qty_int := GREATEST(p_qty, 0)::integer;
  SELECT created_by INTO v_user_id FROM production_orders WHERE id = v_order_id;

  UPDATE production_order_items SET
    actual_qty = actual_qty + p_qty, actual_unit_cost = p_unit_cost,
    withdrawn_at = now(), updated_at = now(),
    status = CASE WHEN actual_qty + p_qty >= budgeted_qty THEN 'completed' ELSE 'partial' END
  WHERE id = p_item_id;

  PERFORM register_stock_movement(p_product_id := v_product_id, p_store_id := v_order_store_id,
    p_user_id := COALESCE(v_caller_uid, v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_quantity := -v_qty_int, p_movement_type := 'production_out',
    p_reason := 'Salida para orden ' || v_order_id::text, p_sale_id := NULL::uuid,
    p_unit_cost := p_unit_cost, p_notes := 'production_order:' || v_order_id::text,
    p_variant_id := v_variant_id, p_skip_access_check := TRUE);

  v_existing_result := jsonb_build_object('status', 'success', 'order_id', v_order_id);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.register_idempotency(p_idempotency_key, 'withdraw', p_item_id, v_param_hash, v_existing_result);
  END IF;

  INSERT INTO audit_logs (user_id, store_id, action, table_name, record_id, metadata)
  VALUES (v_caller_uid, v_order_store_id, 'PRODUCTION_ITEM_WITHDRAWN', 'production_order_items', p_item_id,
    jsonb_build_object('order_id', v_order_id, 'product_id', v_product_id, 'qty', p_qty,
      'unit_cost', p_unit_cost, 'idempotency_key', p_idempotency_key, 'param_hash', v_param_hash));

  RETURN v_existing_result;
END;
$function$


-- ===== oid=142306 public.withdraw_production_item_deprecated_9arg(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text, p_server_side_cost boolean) =====
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


-- ===== oid=142909 public.w62_guard_wac_writer() =====
CREATE OR REPLACE FUNCTION public.w62_guard_wac_writer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(current_setting('app.wac_writer', true), '') <> 'fn_recalc_wac' THEN
    RAISE EXCEPTION 'ERR_WAC_SINGLE_WRITER_VIOLATION: UPDATE cost_average sin token (OLD=% NEW=%). Unico escritor: fn_recalc_wac', OLD.cost_average, NEW.cost_average
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$


-- ===== oid=142921 public.withdraw_production_item_v3(p_item_id uuid, p_qty numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text, p_reference_id uuid, p_reference_doc text) =====
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

