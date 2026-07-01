-- Migration: Enhance Audit Logs with Store Isolation and Normalized Queries
-- Date: 2026-01-27

BEGIN;

-- 1. Add store_id to audit_logs
ALTER TABLE IF EXISTS public.audit_logs
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);

-- 2. Update triggers and functions to populate store_id

-- 2.1 Profile changes trigger
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER AS $$
BEGIN
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
            NEW.store_id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2.2 User Store Memberships changes trigger
CREATE OR REPLACE FUNCTION public.audit_user_store_memberships_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data, store_id)
        VALUES (
            auth.uid(),
            'ASSIGN_STORE',
            'user_store_memberships',
            NEW.id,
            jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id, 'role', NEW.role),
            NEW.store_id
        );
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
        VALUES (
            auth.uid(),
            'REMOVE_STORE_ACCESS',
            'user_store_memberships',
            OLD.id,
            jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id, 'role', OLD.role),
            OLD.store_id
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.status IS DISTINCT FROM NEW.status) THEN
            INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
            VALUES (
                auth.uid(),
                'UPDATE_STORE_ACCESS',
                'user_store_memberships',
                NEW.id,
                jsonb_build_object('role', OLD.role, 'status', OLD.status),
                jsonb_build_object('role', NEW.role, 'status', NEW.status),
                NEW.store_id
            );
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_user_store_memberships_changes ON public.user_store_memberships;
CREATE TRIGGER trigger_audit_user_store_memberships_changes
AFTER INSERT OR UPDATE OR DELETE ON public.user_store_memberships
FOR EACH ROW EXECUTE FUNCTION public.audit_user_store_memberships_changes();

-- 2.3 Managed product functions
CREATE OR REPLACE FUNCTION public.managed_delete_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_movements boolean;
  v_product_name text;
  v_store_id uuid;
BEGIN
  SELECT name, store_id INTO v_product_name, v_store_id FROM public.products WHERE id = p_product_id;

  -- Check movements
  SELECT EXISTS (
        SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p_product_id
        UNION ALL
        SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p_product_id
        UNION ALL
        SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p_product_id
  ) INTO v_has_movements;

  IF v_has_movements THEN
    RAISE EXCEPTION 'No se puede eliminar un producto con movimientos. Desactívelo en su lugar.';
  END IF;

  -- Delete associated inventory entries first
  DELETE FROM public.inventory WHERE product_id = p_product_id;
  -- Delete variants
  DELETE FROM public.product_variants WHERE product_id = p_product_id;
  -- Delete product
  DELETE FROM public.products WHERE id = p_product_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, store_id)
  VALUES (auth.uid(), 'DELETE_PRODUCT', 'products', p_product_id, jsonb_build_object('name', v_product_name), v_store_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.managed_toggle_product_active(p_product_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_active boolean;
  v_store_id uuid;
BEGIN
  SELECT is_active, store_id INTO v_old_active, v_store_id FROM public.products WHERE id = p_product_id;

  UPDATE public.products SET is_active = p_is_active, updated_at = now() WHERE id = p_product_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
  VALUES (
    auth.uid(),
    CASE WHEN p_is_active THEN 'ACTIVATE_PRODUCT' ELSE 'DEACTIVATE_PRODUCT' END,
    'products',
    p_product_id,
    jsonb_build_object('is_active', v_old_active),
    jsonb_build_object('is_active', p_is_active),
    v_store_id
  );
END;
$$;

-- 2.4 Update register_reception
CREATE OR REPLACE FUNCTION register_reception(
    p_store_id UUID,
    p_supplier TEXT,
    p_reception_date DATE,
    p_invoice_number TEXT,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reception_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_unit_cost NUMERIC;
    v_total_cost NUMERIC := 0;
    v_items_count INT := 0;
    v_user_id UUID;
    v_user_store_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    v_user_id := auth.uid()::UUID;

    v_user_store_id := public.current_user_store_id();
    IF v_user_store_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'User has no store assigned';
    END IF;

    IF NOT public.is_admin() AND v_user_store_id != p_store_id THEN
        RAISE EXCEPTION 'Invalid store_id for user';
    END IF;

    IF p_supplier IS NULL OR TRIM(p_supplier) = '' THEN
        RAISE EXCEPTION 'Supplier is required';
    END IF;

    IF p_reception_date IS NULL THEN
        RAISE EXCEPTION 'Reception date is required';
    END IF;

    IF p_reception_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Reception date cannot be in the future';
    END IF;

    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Invoice number is required';
    END IF;

    IF EXISTS (
        SELECT 1 FROM receipts r
        WHERE r.store_id = p_store_id
          AND r.reference_doc = FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number))
    ) THEN
        RAISE EXCEPTION 'Duplicate invoice for this supplier in this store';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Reception must contain at least one item';
    END IF;

    v_items_count := jsonb_array_length(p_items);

    INSERT INTO receipts (
        user_id,
        store_id,
        total_cost,
        reference_doc,
        notes,
        created_at,
        status
    ) VALUES (
        v_user_id,
        p_store_id,
        0,
        FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)),
        NULL,
        p_reception_date,
        'active'
    )
    RETURNING id INTO v_reception_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        INSERT INTO receipt_items (
            receipt_id,
            product_id,
            quantity,
            unit_cost,
            created_at
        ) VALUES (
            v_reception_id,
            v_product_id,
            v_quantity,
            v_unit_cost,
            NOW()
        );

        INSERT INTO inventory (
            store_id,
            product_id,
            quantity,
            updated_at
        ) VALUES (
            p_store_id,
            v_product_id,
            v_quantity,
            NOW()
        )
        ON CONFLICT (store_id, product_id) DO UPDATE SET
            quantity = inventory.quantity + v_quantity,
            updated_at = NOW();

        INSERT INTO stock_movements (
            store_id,
            product_id,
            quantity_change,
            movement_type,
            reference_doc,
            reference_id,
            movement_date,
            created_by,
            created_at
        ) VALUES (
            p_store_id,
            v_product_id,
            v_quantity,
            'purchase'::public.movement_type,
            FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)),
            v_reception_id::TEXT,
            p_reception_date,
            v_user_id,
            NOW()
        );

        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
    END LOOP;

    UPDATE receipts SET
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = v_reception_id;

    INSERT INTO audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        store_id,
        created_at
    ) VALUES (
        v_user_id,
        'CREATE',
        'receipts',
        v_reception_id::TEXT,
        NULL,
        jsonb_build_object(
            'supplier', p_supplier,
            'invoice_number', p_invoice_number,
            'items_count', v_items_count,
            'total_cost', v_total_cost
        ),
        p_store_id,
        NOW()
    );

    RETURN v_reception_id;
END;
$$;

-- 3. Update RLS on audit_logs
DROP POLICY IF EXISTS "Allow admins, managers and encargados to read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow admins to read all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow managers and encargados to read their store audit logs" ON public.audit_logs;

CREATE POLICY "Allow admins to read all audit logs" ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Allow managers and encargados to read their store audit logs" ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  (public.has_role('manager') OR public.has_role('encargado'))
  AND (
    store_id IS NULL
    OR public.has_store_access(store_id)
  )
);

-- 4. RPC for normalized audit log queries
DROP FUNCTION IF EXISTS public.get_audit_logs(uuid, text, timestamp, timestamp, integer);
CREATE OR REPLACE FUNCTION public.get_audit_logs(
    p_store_id uuid DEFAULT NULL,
    p_search_term text DEFAULT NULL,
    p_date_from timestamp DEFAULT NULL,
    p_date_to timestamp DEFAULT NULL,
    p_limit integer DEFAULT 1000
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    user_id uuid,
    action text,
    table_name text,
    record_id text,
    old_data jsonb,
    new_data jsonb,
    metadata jsonb,
    store_id uuid,
    store_name text,
    profile jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.created_at,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
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
        (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR al.action ILIKE ('%' || p_search_term || '%')
            OR al.table_name ILIKE ('%' || p_search_term || '%')
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = al.user_id
                AND p.full_name ILIKE ('%' || p_search_term || '%')
            )
        )
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;

COMMIT;
