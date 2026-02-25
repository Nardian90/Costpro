-- Fix audit_profile_changes to be SECURITY DEFINER
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
$function$;

-- Fix audit_product_changes to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.audit_product_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    INSERT INTO public.audit_logs (
        user_id,
        action,
        table_name,
        record_id,
        old_data,
        new_data,
        store_id
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
            'sku', OLD.sku
        ),
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'cost_price', NEW.cost_price,
            'sku', NEW.sku
        ),
        NEW.store_id
    );
    RETURN NEW;
END;
$function$;

-- Fix audit_store_changes to be SECURITY DEFINER
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
$function$;

-- Fix log_transaction_changes to be SECURITY DEFINER
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
$function$;

-- Fix audit_store_access_changes to be SECURITY DEFINER (even if currently unused)
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
$function$;
