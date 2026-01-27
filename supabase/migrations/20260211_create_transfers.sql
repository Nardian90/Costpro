-- Create Transfers and Transfer Items tables
-- Migration: 20260211_create_transfers.sql

DO $$ BEGIN
    CREATE TYPE public.transfer_status AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_store_id UUID NOT NULL,
    destination_store_id UUID NOT NULL,
    created_by UUID NOT NULL,
    status public.transfer_status DEFAULT 'PENDIENTE',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    CONSTRAINT transfers_origin_store_id_fkey FOREIGN KEY (origin_store_id) REFERENCES public.stores(id),
    CONSTRAINT transfers_destination_store_id_fkey FOREIGN KEY (destination_store_id) REFERENCES public.stores(id),
    CONSTRAINT transfers_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
    CONSTRAINT stores_must_be_different CHECK (origin_store_id != destination_store_id)
);

CREATE TABLE IF NOT EXISTS public.transfer_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL CONSTRAINT transfer_items_transfer_id_fkey REFERENCES public.transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL CONSTRAINT transfer_items_product_id_fkey REFERENCES public.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

-- Policies for transfers
-- Users can see transfers if they belong to either origin or destination store
DROP POLICY IF EXISTS "transfers_view_policy" ON public.transfers;
CREATE POLICY "transfers_view_policy" ON public.transfers
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.user_store_memberships WHERE user_id = auth.uid() AND store_id IN (origin_store_id, destination_store_id))
        OR public.has_role('admin')
    );

DROP POLICY IF EXISTS "transfers_insert_policy" ON public.transfers;
CREATE POLICY "transfers_insert_policy" ON public.transfers
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_store_memberships WHERE user_id = auth.uid() AND store_id = origin_store_id)
        OR public.has_role('admin')
    );

-- Policies for transfer items
DROP POLICY IF EXISTS "transfer_items_view_policy" ON public.transfer_items;
CREATE POLICY "transfer_items_view_policy" ON public.transfer_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id)
    );

DROP POLICY IF EXISTS "transfer_items_insert_policy" ON public.transfer_items;
CREATE POLICY "transfer_items_insert_policy" ON public.transfer_items
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id AND t.created_by = auth.uid())
        OR public.has_role('admin')
    );

-- RPC: Get transferable stores (same encargado/manager)
CREATE OR REPLACE FUNCTION public.get_transferable_stores(p_user_id UUID, p_current_store_id UUID)
RETURNS SETOF public.stores
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT s.*
    FROM public.stores s
    WHERE s.id IN (
        -- Tiendas que comparten al menos un encargado/manager con la tienda actual
        SELECT DISTINCT usm2.store_id
        FROM public.user_store_memberships usm1
        JOIN public.user_store_memberships usm2 ON usm1.user_id = usm2.user_id
        WHERE usm1.store_id = p_current_store_id
        AND usm1.role IN ('encargado', 'manager', 'admin')
        AND usm2.role IN ('encargado', 'manager', 'admin')
    )
    AND s.id != p_current_store_id
    AND s.is_active = true;
END;
$$;

-- RPC: Create transfer (atomic)
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
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INTEGER, unit_cost INTEGER)
    LOOP
        INSERT INTO public.transfer_items (transfer_id, product_id, quantity, unit_cost)
        VALUES (v_transfer_id, v_item.product_id, v_item.quantity, v_item.unit_cost);
    END LOOP;

    RETURN v_transfer_id;
END;
$$;

-- RPC: Confirm transfer (atomic stock movement)
CREATE OR REPLACE FUNCTION public.confirm_transfer(p_transfer_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_item RECORD;
    v_dest_product_id UUID;
    v_res_out JSONB;
    v_res_in JSONB;
BEGIN
    -- 1. Obtener transferencia
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
            p_movement_type := 'TRANSFER_OUT',
            p_reason := 'Transferencia ' || v_transfer.id || ' a ' || v_transfer.destination_store_id,
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_out->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_out->>'message');
        END IF;

        -- ENTRADA al destino (buscando producto por SKU en el destino)
        SELECT id INTO v_dest_product_id FROM public.products
        WHERE sku = (SELECT sku FROM public.products WHERE id = v_item.product_id)
        AND store_id = v_transfer.destination_store_id;

        IF v_dest_product_id IS NULL THEN
            RAISE EXCEPTION 'El producto con SKU % no existe en el almacén destino',
                (SELECT sku FROM public.products WHERE id = v_item.product_id);
        END IF;

        v_res_in := public.register_stock_movement(
            p_product_id := v_dest_product_id,
            p_store_id := v_transfer.destination_store_id,
            p_user_id := p_user_id,
            p_quantity := v_item.quantity,
            p_movement_type := 'TRANSFER_IN',
            p_reason := 'Transferencia ' || v_transfer.id || ' desde ' || v_transfer.origin_store_id,
            p_sale_id := NULL,
            p_unit_cost := v_item.unit_cost,
            p_notes := 'Transferencia confirmada'
        );

        IF (v_res_in->>'status') = 'error' THEN
            RAISE EXCEPTION '%', (v_res_in->>'message');
        END IF;
    END LOOP;

    -- 4. Actualizar estado
    UPDATE public.transfers
    SET status = 'CONFIRMADA', updated_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object('status', 'success', 'message', 'Transferencia confirmada correctamente');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;
