-- ================================================================
-- RPC: register_reception
-- Descripción: Procesa una recepción de mercancía de forma atómica
-- 
-- CARACTERÍSTICAS:
-- ✓ SECURITY DEFINER - Evita bloqueos por RLS
-- ✓ Transacción ACID - Todo o nada
-- ✓ Validaciones completas
-- ✓ Auditoría completa (receipts + receipt_items + stock_movements)
--
-- PARÁMETROS:
--   p_store_id: UUID de la tienda
--   p_supplier: Nombre del proveedor (REQUERIDO)
--   p_reception_date: Fecha de recepción (REQUERIDO)
--   p_invoice_number: Número de factura (REQUERIDO)

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
    -- Obtener usuario autenticado (evita pasar user_id desde el cliente)
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    v_user_id := auth.uid()::UUID;
    -- ================================================================
    -- VALIDACIONES PREVIAS
    -- ================================================================
    
    -- Validar store_id existe y pertenece al usuario (profiles guarda la asociación tienda)
    v_user_store_id := public.current_user_store_id();
    IF v_user_store_id IS NULL THEN
        RAISE EXCEPTION 'User has no store assigned';
    END IF;
    IF v_user_store_id != p_store_id THEN
        RAISE EXCEPTION 'Invalid store_id for user';
    END IF;

    -- Validar proveedor
    IF p_supplier IS NULL OR TRIM(p_supplier) = '' THEN
        RAISE EXCEPTION 'Supplier is required';
    END IF;

    -- Validar fecha
    IF p_reception_date IS NULL THEN
        RAISE EXCEPTION 'Reception date is required';
    END IF;

    -- Validar fecha no es futura
    IF p_reception_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Reception date cannot be in the future';
    END IF;

    -- Validar número de factura
    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN
        RAISE EXCEPTION 'Invoice number is required';
    END IF;

    -- Validar que no exista duplicado de factura para este proveedor (comparamos reference_doc en receipts)
    IF EXISTS (
        SELECT 1 FROM receipts r
        JOIN public.profiles p ON p.id = r.user_id
        WHERE p.store_id = p_store_id
          AND r.reference_doc = FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number))
    ) THEN
        RAISE EXCEPTION 'Duplicate invoice for this supplier in this store';
    END IF;

    -- Validar items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Reception must contain at least one item';
    END IF;

    v_items_count := jsonb_array_length(p_items);

    -- ================================================================
    -- PASO 1: CREAR REGISTRO DE RECEPCIÓN (CABECERA)
    -- ================================================================
    
    -- Insertar en `receipts` usando `reference_doc` y `created_at` (schema estándar)
    INSERT INTO receipts (
        user_id,
        total_cost,
        reference_doc,
        notes,
        created_at,
        status
    ) VALUES (
        v_user_id,
        0,  -- Se actualizará luego
        FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)),
        NULL,
        p_reception_date,
        'active'
    )
    RETURNING id INTO v_reception_id;

    IF v_reception_id IS NULL THEN
        RAISE EXCEPTION 'Failed to create reception record';
    END IF;

    -- ================================================================
    -- PASO 2: PROCESAR CADA ITEM
    -- ================================================================
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Extraer valores del item
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;
        v_unit_cost := (v_item->>'unit_cost')::NUMERIC;

        -- Validaciones del item
        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'product_id is required for each item';
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'quantity must be greater than 0';
        END IF;

        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
            RAISE EXCEPTION 'unit_cost cannot be negative';
        END IF;

        -- Validar que el producto existe
        IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_product_id) THEN
            RAISE EXCEPTION 'Product % does not exist', v_product_id;
        END IF;

        -- ============================================================
        -- 2a: INSERTAR EN receipt_items (AUDITORÍA DETALLADA)
        -- ============================================================
        
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

        -- ============================================================
        -- 2b: ACTUALIZAR inventory (SUMA DE STOCK)
        -- ============================================================
        
        INSERT INTO inventory (
            store_id,
            product_id,
            quantity,
            low_stock_threshold,
            updated_at,
            created_at
        ) VALUES (
            p_store_id,
            v_product_id,
            v_quantity,
            10,  -- Umbral predeterminado
            NOW(),
            NOW()
        )
        ON CONFLICT (store_id, product_id) DO UPDATE SET
            quantity = inventory.quantity + v_quantity,
            updated_at = NOW();

        -- ============================================================
        -- 2c: REGISTRAR EN stock_movements (AUDITORÍA GENERAL)
        -- ============================================================
        
        INSERT INTO stock_movements (
            store_id,
            product_id,
            variant_id,
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
            NULL,
            v_quantity,
            'purchase'::public.movement_type,
            FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number)),
            v_reception_id::TEXT,
            p_reception_date,
            v_user_id,
            NOW()
        );

        -- Acumular total_cost
        v_total_cost := v_total_cost + (v_quantity * v_unit_cost);

    END LOOP;

    -- ================================================================
    -- PASO 3: ACTUALIZAR RECEPCIÓN CON TOTAL COST
    -- ================================================================
    
    UPDATE receipts SET
        total_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = v_reception_id;

    -- ================================================================
    -- PASO 4: REGISTRAR EN AUDITORÍA (OPCIONAL - SI EXISTE tabla)
    -- ================================================================
    
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'audit_logs'
    ) THEN
        INSERT INTO audit_logs (
            user_id,
            action,
            table_name,
            record_id,
            old_data,
            new_data,
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
            NOW()
        );
    END IF;

    -- ================================================================
    -- RETORNAR ID DE RECEPCIÓN
    -- ================================================================
    
    RETURN v_reception_id;

EXCEPTION WHEN OTHERS THEN
    -- Rollback automático por error en plpgsql
    RAISE EXCEPTION 'Reception registration failed: %', SQLERRM;

END;
$$;

-- ================================================================
-- PERMISOS Y ACCESO
-- ================================================================

-- Garantizar que usuarios no puedan ejecutar la RPC directamente
REVOKE EXECUTE ON FUNCTION register_reception FROM public;
GRANT EXECUTE ON FUNCTION register_reception TO authenticated;

-- ================================================================
-- Row Level Security (RLS) para tabla receptions
-- ================================================================

-- Si RLS no existe, crear
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios solo ven recepciones de su tienda (comparando store via profiles)
DROP POLICY IF EXISTS receipts_store_isolation ON receipts;
CREATE POLICY receipts_store_isolation ON receipts
    USING (
        (SELECT store_id FROM public.profiles WHERE id = receipts.user_id)
        =
        (SELECT store_id FROM public.profiles WHERE id = auth.uid())
    );

-- Política: Usuarios solo pueden insertar en su tienda (RPC maneja esto)
DROP POLICY IF EXISTS receipts_insert_policy ON receipts;
CREATE POLICY receipts_insert_policy ON receipts
    WITH CHECK (
        (SELECT store_id FROM public.profiles WHERE id = receipts.user_id)
        =
        (SELECT store_id FROM public.profiles WHERE id = auth.uid())
    );

-- ================================================================
-- RLS para tabla reception_items
-- ================================================================

ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receipt_items_access ON receipt_items;
CREATE POLICY receipt_items_access ON receipt_items
    USING (
        (
            SELECT store_id FROM public.profiles WHERE id = (
                SELECT user_id FROM receipts WHERE id = receipt_items.receipt_id
            )
        ) = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
    );

-- ================================================================
-- FUNCIÓN AUXILIAR: Obtener recepciones recientes
-- ================================================================

CREATE OR REPLACE FUNCTION get_recent_receptions(
    p_store_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    supplier TEXT,
    invoice_number TEXT,
    reception_date DATE,
    total_cost NUMERIC,
    item_count INT,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.reference_doc,
        r.created_at,
        r.total_cost,
        COUNT(ri.id)::INT as item_count,
        r.created_at
    FROM receipts r
    LEFT JOIN receipt_items ri ON r.id = ri.receipt_id
    WHERE (SELECT store_id FROM public.profiles WHERE id = r.user_id) = p_store_id
    GROUP BY r.id, r.reference_doc, r.total_cost, r.created_at
    ORDER BY r.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION get_recent_receptions TO authenticated;

-- ================================================================
-- FUNCIÓN AUXILIAR: Anular Recepción (Soft Delete)
-- ================================================================

CREATE OR REPLACE FUNCTION cancel_reception(
    p_reception_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    v_user_id := auth.uid()::UUID;

    -- Validar que recepción existe y pertenece al usuario (obtener store desde profiles)
    SELECT p.store_id INTO v_store_id
    FROM receipts r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.id = p_reception_id;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'Reception not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_user_id AND store_id = v_store_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Revertir cambios de inventario
    WITH items AS (
        SELECT product_id, quantity
        FROM receipt_items
        WHERE receipt_id = p_reception_id
    )
    UPDATE inventory SET
        quantity = quantity - items.quantity,
        updated_at = NOW()
    FROM items
    WHERE inventory.store_id = v_store_id
    AND inventory.product_id = items.product_id;

    -- Marcar recepción como cancelada
    UPDATE receipts SET
        status = 'voided',
        updated_at = NOW()
    WHERE id = p_reception_id;

    -- Registrar en auditoría
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
    ) SELECT
        v_store_id,
        product_id,
        -quantity,
        'return'::public.movement_type,
        'Recepción cancelada: ' || p_reception_id::TEXT,
        p_reception_id::TEXT,
        CURRENT_DATE,
        v_user_id,
        NOW()
    FROM receipt_items
    WHERE receipt_id = p_reception_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cancel_reception TO authenticated;

-- ================================================================
-- ÍNDICES PARA PERFORMANCE
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_receipts_user_date 
    ON receipts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_user_reference 
    ON receipts(user_id, reference_doc);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt 
    ON receipt_items(receipt_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference 
    ON stock_movements(reference_id, movement_type);

-- ================================================================
-- FIN DEL SCRIPT
-- ================================================================
