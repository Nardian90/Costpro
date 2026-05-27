-- HARDENING MULTI-TENANT + VALIDACIÓN DE AISLAMIENTO REAL
-- Autor: Jules (AI)
-- Fecha: 2026-03-26

-- 1. Eliminación de superficies de fuga RLS (user_usage, pick3_user_plays)
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pick3_user_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own usage logs" ON public.user_usage;
CREATE POLICY "Users can manage their own usage logs"
ON public.user_usage
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own pick3 plays" ON public.pick3_user_plays;
CREATE POLICY "Users can manage their own pick3 plays"
ON public.pick3_user_plays
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Corrección de fuga en cost_sheets (Aislamiento real para rol 'costo')
DROP POLICY IF EXISTS "Admins and Costo role can view all cost sheets" ON public.cost_sheets;
CREATE POLICY "cost_sheets_selective_read"
ON public.cost_sheets
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p_me
    JOIN public.profiles p_creator ON p_me.tenant_id = p_creator.tenant_id
    WHERE p_me.id = auth.uid()
    AND p_creator.id = public.cost_sheets.created_by
    AND p_me.tenant_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS "Users can manage their own cost sheets" ON public.cost_sheets;
CREATE POLICY "cost_sheets_owner_manage"
ON public.cost_sheets
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- 3. Fortalecimiento de SECURITY DEFINER (Validación de identidad y acceso)

-- 3.1 Eliminar funciones de estrés peligrosas
DROP FUNCTION IF EXISTS public.stress_create_sale(uuid, uuid, text, numeric, numeric, text, numeric, jsonb, uuid);
DROP FUNCTION IF EXISTS public.stress_register_reception(uuid, text, date, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.stress_create_transfer(uuid, uuid, jsonb, text, uuid);

-- 3.2 Harden fn_process_receipt (Force identity check)
CREATE OR REPLACE FUNCTION public.fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_receipt_id uuid;
    v_item jsonb;
    v_prod_id uuid;
    v_qty int;
    v_cost numeric;
    v_current_stock int;
    v_current_avg_cost numeric;
    v_new_stock int;
    v_new_avg_cost numeric;
    v_total_receipt numeric := 0;
    v_new_details jsonb;
    v_sku text;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
    END IF;

    INSERT INTO public.receipts (user_id, status, reference_doc)
    VALUES (p_user_id, 'active', p_reference)
    RETURNING id INTO v_receipt_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'quantity')::int;
        v_cost := (v_item->>'unit_cost')::numeric;
        v_new_details := v_item->'new_product_details';

        IF v_sku IS NULL OR v_sku = '' THEN
            RAISE EXCEPTION 'SKU es obligatorio';
        END IF;

        IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser positiva'; END IF;

        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
            IF v_prod_id IS NULL THEN
                INSERT INTO public.products (name, sku, cost_price, price, stock_current, cost_average)
                VALUES (v_new_details->>'name', v_sku, v_cost, (v_new_details->>'price')::numeric, 0, 0)
                RETURNING id INTO v_prod_id;
            END IF;
        ELSE
             v_prod_id := (v_item->>'product_id')::uuid;
             IF v_prod_id IS NULL THEN SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku; END IF;
             IF v_prod_id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', v_sku; END IF;
        END IF;

        SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_prod_id FOR UPDATE;
        v_new_stock := COALESCE(v_current_stock, 0) + v_qty;
        v_new_avg_cost := CASE WHEN v_new_stock > 0 THEN ((COALESCE(v_current_stock,0) * COALESCE(v_current_avg_cost,0)) + (v_qty * v_cost)) / v_new_stock ELSE v_cost END;

        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost) VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);
        UPDATE public.products SET stock_current = v_new_stock, cost_average = v_new_avg_cost, cost_price = v_cost WHERE id = v_prod_id;
        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);
        v_total_receipt := v_total_receipt + (v_qty * v_cost);
    END LOOP;
    UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
    RETURN v_receipt_id;
END;
$function$;

-- 3.3 Harden managed_create_user (Identity & Store access)
CREATE OR REPLACE FUNCTION public.managed_create_user(p_email text, p_full_name text, p_role user_role, p_store_id uuid DEFAULT NULL::uuid, p_memberships jsonb DEFAULT NULL::jsonb, p_max_stores integer DEFAULT 0, p_max_users integer DEFAULT 0, p_target_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_role_id uuid;
    v_active_store_id uuid;
    m JSONB;
    v_creator_role user_role;
BEGIN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();
    IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado') THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
    END IF;

    v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);

    IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
        IF NOT public.has_store_access(v_active_store_id) THEN
            RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
        END IF;
    END IF;

    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(p_role::text) OR (name = 'Cajero' AND p_role = 'clerk') OR (name = 'Almacenero' AND p_role = 'warehouse') LIMIT 1;
    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());

    INSERT INTO public.profiles (id, email, full_name, role, role_id, active_store_id, is_active, created_by, max_stores_limit, max_users_limit, created_at, updated_at)
    VALUES (v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true, auth.uid(), p_max_stores, p_max_users, now(), now())
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, role_id = EXCLUDED.role_id, active_store_id = EXCLUDED.active_store_id, updated_at = now()
    RETURNING id INTO v_user_id;

    IF p_memberships IS NOT NULL THEN
        IF v_creator_role != 'admin' THEN
            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id AND store_id IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = auth.uid() AND role IN ('encargado', 'manager'));
        ELSE
            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
        END IF;
        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
                IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
                    INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
                END IF;
            END IF;
        END LOOP;
    ELSIF p_store_id IS NOT NULL THEN
        INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, p_store_id, p_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;
    RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
END;
$function$;

-- 3.4 Harden confirm_transfer (Identity & Access)
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_stock_actual_dest INTEGER;
    v_nuevo_stock_dest INTEGER;
    v_nuevo_costo_unitario_dest NUMERIC;
    v_auth_user_id uuid := auth.uid();
BEGIN
    IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch'; END IF;
    IF NOT (public.is_admin() OR public.has_role('warehouse') OR public.has_role('manager')) THEN RETURN jsonb_build_object('status', 'error', 'message', 'Permisos insuficientes'); END IF;
    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'error', 'message', 'Transferencia no encontrada'); END IF;
    IF NOT public.has_store_access(v_transfer.destination_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to destination store'; END IF;
    IF v_transfer.status != 'PENDIENTE' THEN RETURN jsonb_build_object('status', 'error', 'message', 'Ya procesada'); END IF;

    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id ORDER BY product_id) LOOP
        SELECT * INTO v_dest_product FROM public.products WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id) AND store_id = v_transfer.destination_store_id FOR UPDATE;
        IF v_dest_product.id IS NULL THEN RAISE EXCEPTION 'SKU no existe en destino'; END IF;
        SELECT quantity INTO v_stock_actual_dest FROM public.inventory WHERE store_id = v_transfer.destination_store_id AND product_id = v_dest_product.id FOR UPDATE;
        v_nuevo_stock_dest := COALESCE(v_stock_actual_dest, 0) + v_item.quantity;
        v_nuevo_costo_unitario_dest := CASE WHEN v_nuevo_stock_dest > 0 THEN ((COALESCE(v_stock_actual_dest,0) * COALESCE(v_dest_product.cost_average,0)) + (v_item.quantity * v_item.unit_cost)) / v_nuevo_stock_dest ELSE 0 END;

        PERFORM public.register_stock_movement(p_product_id := v_item.product_id, p_store_id := v_transfer.origin_store_id, p_user_id := p_user_id, p_quantity := -v_item.quantity, p_movement_type := 'transfer_out', p_reason := 'Transferencia ' || v_transfer.id, p_unit_cost := v_item.unit_cost);
        PERFORM public.register_stock_movement(p_product_id := v_dest_product.id, p_store_id := v_transfer.destination_store_id, p_user_id := p_user_id, p_quantity := v_item.quantity, p_movement_type := 'transfer_in', p_reason := 'Transferencia ' || v_transfer.id, p_unit_cost := v_item.unit_cost);
        UPDATE public.products SET cost_average = v_nuevo_costo_unitario_dest, updated_at = now() WHERE id = v_dest_product.id;
    END LOOP;
    UPDATE public.transfers SET status = 'CONFIRMADA', updated_at = now() WHERE id = p_transfer_id;
    RETURN jsonb_build_object('status', 'ok');
END;
$function$;

-- 4. Endurecimiento de Tablas de Sistema (pick3_history, tenants, system_config)
DROP POLICY IF EXISTS "pick3_history_admin_manage" ON public.pick3_history;
CREATE POLICY "pick3_history_admin_manage" ON public.pick3_history FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "tenants_admin_manage" ON public.tenants;
CREATE POLICY "tenants_admin_manage" ON public.tenants FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "system_config_admin_manage" ON public.system_config;
CREATE POLICY "system_config_admin_manage" ON public.system_config FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 5. Endurecimiento de Visibilidad de Ventas y Movimientos
DROP POLICY IF EXISTS "sales_selective_read" ON public.sales;
CREATE POLICY "sales_selective_read" ON public.sales FOR SELECT TO authenticated
USING (is_admin() OR cashier_id = auth.uid() OR EXISTS (SELECT 1 FROM public.sale_items si JOIN public.products p ON si.product_id = p.id WHERE si.sale_id = public.sales.id AND has_store_access(p.store_id)));

DROP POLICY IF EXISTS "inventory_movements_selective_read" ON public.inventory_movements;
CREATE POLICY "inventory_movements_selective_read" ON public.inventory_movements FOR SELECT TO authenticated
USING (is_admin() OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = public.inventory_movements.product_id AND has_store_access(p.store_id)));

DROP POLICY IF EXISTS "sale_items_selective_read" ON public.sale_items;
CREATE POLICY "sale_items_selective_read" ON public.sale_items FOR SELECT TO authenticated
USING (is_admin() OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = public.sale_items.sale_id AND (s.cashier_id = auth.uid())) OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = public.sale_items.product_id AND has_store_access(p.store_id)));
