-- Migration: Fix transfers logic, enum values, and WAC consistency
-- Date: 2026-02-14

BEGIN;

-- 1. Ensure 'transfer_in' and 'transfer_out' are in the movement_type enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'movement_type' AND e.enumlabel = 'transfer_in') THEN
        ALTER TYPE public.movement_type ADD VALUE 'transfer_in';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'movement_type' AND e.enumlabel = 'transfer_out') THEN
        ALTER TYPE public.movement_type ADD VALUE 'transfer_out';
    END IF;
EXCEPTION
    WHEN others THEN NULL; -- In case of concurrent modification or other issues
END $$;

-- 2. Update transfer_items to use NUMERIC for unit_cost for precision consistency
ALTER TABLE public.transfer_items ALTER COLUMN unit_cost TYPE NUMERIC USING unit_cost::NUMERIC;

-- 3. Update create_transfer RPC to handle numeric unit cost
CREATE OR REPLACE FUNCTION public.create_transfer(
    p_origin_store_id UUID,
    p_destination_store_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer_id UUID;
    v_item RECORD;
BEGIN
    -- 1. Insertar cabecera
    INSERT INTO public.transfers (origin_store_id, destination_store_id, created_by, notes)
    VALUES (p_origin_store_id, p_destination_store_id, auth.uid(), p_notes)
    RETURNING id INTO v_transfer_id;

    -- 2. Insertar items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, unit_cost NUMERIC)
    LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost);
    END LOOP;

    RETURN v_transfer_id;
END;
$$;

-- 4. Update confirm_transfer RPC with WAC logic and correct movement types
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product RECORD;
    v_res_out JSONB;
    v_res_in JSONB;
    v_stock_actual_dest INTEGER;
    v_costo_promedio_actual_dest NUMERIC;
    v_costo_total_actual_dest NUMERIC;
    v_nuevo_stock_dest INTEGER;
    v_nuevo_costo_total_dest NUMERIC;
    v_nuevo_costo_unitario_dest NUMERIC;
BEGIN
    -- 1. Obtener transferencia con bloqueo
    SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Transferencia no encontrada');
    END IF;

    -- 2. Validar que la transferencia esté PENDIENTE
    IF v_transfer.status != 'PENDIENTE' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'La transferencia ya ha sido procesada');
    END IF;

    -- 3. Procesar cada item
    FOR v_item IN (SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id) LOOP
        -- SALIDA del origen
        v_res_out := public.register_stock_movement(
            p_product_id := v_item.product_id,
            p_store_id := v_transfer.origin_store_id,
            p_user_id := p_user_id,
            p_quantity := -v_item.quantity,
            p_movement_type := 'transfer_out',
            p_reason := 'Transferencia ' || substring(v_transfer.id::text from 1 for 8) || ' a tienda destino',
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_out->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_out->>'message');
        END IF;

        -- ENTRADA al destino (buscando producto por SKU en el destino)
        SELECT * INTO v_dest_product FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id;

        IF v_dest_product.id IS NULL THEN
            RAISE EXCEPTION 'El producto con SKU % no existe en el almacén destino',
                (SELECT sku FROM public.products WHERE id = v_item.product_id);
        END IF;

        -- WAC LOGIC para el destino
        -- Obtener stock actual en destino
        SELECT COALESCE(quantity, 0) INTO v_stock_actual_dest
        FROM public.inventory
        WHERE store_id = v_transfer.destination_store_id AND product_id = v_dest_product.id;

        v_costo_promedio_actual_dest := COALESCE(v_dest_product.cost_average, v_dest_product.cost_price, 0);
        v_costo_total_actual_dest := v_stock_actual_dest * v_costo_promedio_actual_dest;

        -- Calcular nuevos valores
        v_nuevo_stock_dest := v_stock_actual_dest + v_item.quantity;
        v_nuevo_costo_total_dest := v_costo_total_actual_dest + (v_item.quantity * v_item.unit_cost);

        IF v_nuevo_stock_dest > 0 THEN
            v_nuevo_costo_unitario_dest := v_nuevo_costo_total_dest / v_nuevo_stock_dest;
        ELSE
            v_nuevo_costo_unitario_dest := 0;
        END IF;

        -- Registrar ENTRADA
        v_res_in := public.register_stock_movement(
            p_product_id := v_dest_product.id,
            p_store_id := v_transfer.destination_store_id,
            p_user_id := p_user_id,
            p_quantity := v_item.quantity,
            p_movement_type := 'transfer_in',
            p_reason := 'Transferencia ' || substring(v_transfer.id::text from 1 for 8) || ' desde tienda origen',
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_in->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_in->>'message');
        END IF;

        -- Actualizar Costo Promedio en el producto del destino
        UPDATE public.products
        SET cost_average = v_nuevo_costo_unitario_dest,
            updated_at = now()
        WHERE id = v_dest_product.id;

    END LOOP;

    -- 4. Actualizar estado de la transferencia
    UPDATE public.transfers
    SET status = 'CONFIRMADA', updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('status', 'success', 'message', 'Transferencia confirmada y stock actualizado correctamente');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMIT;
