-- ════════════════════════════════════════════════════════════════════════
-- V2.0 — Lotes/Series/Vencimientos, Multi-Almacén, Conteos ABC,
--         Conciliación Bancaria
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. LOTES / SERIES / VENCIMIENTOS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    lot_number TEXT NOT NULL,
    serial_number TEXT,
    manufacture_date DATE,
    expiration_date DATE,
    quantity_received NUMERIC(12,2) NOT NULL CHECK (quantity_received > 0),
    quantity_remaining NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
    unit_cost NUMERIC(12,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'depleted', 'quarantine')),
    supplier TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_lots_store_product ON public.product_lots(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_lots_expiration ON public.product_lots(store_id, expiration_date) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_lots_store_product_lot ON public.product_lots(store_id, product_id, lot_number);

-- Tabla para rastrear qué lote se vendió en cada transaction_item
CREATE TABLE IF NOT EXISTS public.transaction_item_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_item_id UUID NOT NULL REFERENCES public.transaction_items(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.product_lots(id) ON DELETE SET NULL,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tx_item_lots_tx ON public.transaction_item_lots(transaction_item_id);
CREATE INDEX IF NOT EXISTS idx_tx_item_lots_lot ON public.transaction_item_lots(lot_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. MULTI-ALMACÉN (sub-almacenes dentro de una tienda)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_store ON public.warehouses(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_store_name ON public.warehouses(store_id, name);

-- Stock por almacén (reemplaza stock_current del producto cuando hay multi-almacén)
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_stock NUMERIC(12,2) DEFAULT 0,
    max_stock NUMERIC(12,2),
    last_count_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_warehouse_stock UNIQUE (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wh_stock_store_product ON public.warehouse_stock(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_warehouse ON public.warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wh_stock_low ON public.warehouse_stock(warehouse_id, quantity, min_stock) WHERE quantity <= min_stock;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. CLASIFICACIÓN ABC
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.abc_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    classification TEXT NOT NULL CHECK (classification IN ('A', 'B', 'C')),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    annual_consumption_value NUMERIC(14,2) DEFAULT 0,
    cumulative_percentage NUMERIC(5,2) DEFAULT 0,
    total_quantity_sold NUMERIC(12,2) DEFAULT 0,
    total_revenue NUMERIC(14,2) DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_abc_store_product_period UNIQUE (store_id, product_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_abc_store_period ON public.abc_classifications(store_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_abc_store_class ON public.abc_classifications(store_id, classification);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. CONCILIACIÓN BANCARIA
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    statement_date DATE NOT NULL,
    bank_account TEXT,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_credits NUMERIC(14,2) DEFAULT 0,
    total_debits NUMERIC(14,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled', 'discrepancy')),
    notes TEXT,
    reconciled_by UUID REFERENCES public.profiles(id),
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_stmt_store_date ON public.bank_statements(store_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS public.bank_statement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_id UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    description TEXT,
    reference TEXT,
    amount NUMERIC(14,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    matched_transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
    is_matched BOOLEAN DEFAULT false,
    is_reconciled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_items_stmt ON public.bank_statement_items(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_items_matched ON public.bank_statement_items(matched_transaction_id) WHERE matched_transaction_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS PARA TODAS LAS NUEVAS TABLAS
-- ──────────────────────────────────────────────────────────────────────────

-- Product Lots
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY lots_select ON public.product_lots FOR SELECT TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY lots_insert ON public.product_lots FOR INSERT TO authenticated WITH CHECK (public.has_store_access(store_id));
CREATE POLICY lots_update ON public.product_lots FOR UPDATE TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY lots_delete ON public.product_lots FOR DELETE TO authenticated USING (public.has_store_access(store_id));

-- Transaction Item Lots
ALTER TABLE public.transaction_item_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tx_lots_select ON public.transaction_item_lots FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.transaction_items ti JOIN public.transactions t ON t.id = ti.transaction_id WHERE ti.id = transaction_item_id AND public.has_store_access(t.store_id)));

-- Warehouses
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY wh_select ON public.warehouses FOR SELECT TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY wh_insert ON public.warehouses FOR INSERT TO authenticated WITH CHECK (public.has_store_access(store_id));
CREATE POLICY wh_update ON public.warehouses FOR UPDATE TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY wh_delete ON public.warehouses FOR DELETE TO authenticated USING (public.has_store_access(store_id));

-- Warehouse Stock
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY whs_select ON public.warehouse_stock FOR SELECT TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY whs_insert ON public.warehouse_stock FOR INSERT TO authenticated WITH CHECK (public.has_store_access(store_id));
CREATE POLICY whs_update ON public.warehouse_stock FOR UPDATE TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY whs_delete ON public.warehouse_stock FOR DELETE TO authenticated USING (public.has_store_access(store_id));

-- ABC Classifications
ALTER TABLE public.abc_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY abc_select ON public.abc_classifications FOR SELECT TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY abc_insert ON public.abc_classifications FOR INSERT TO authenticated WITH CHECK (public.has_store_access(store_id));
CREATE POLICY abc_delete ON public.abc_classifications FOR DELETE TO authenticated USING (public.has_store_access(store_id));

-- Bank Statements
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY bs_select ON public.bank_statements FOR SELECT TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY bs_insert ON public.bank_statements FOR INSERT TO authenticated WITH CHECK (public.has_store_access(store_id));
CREATE POLICY bs_update ON public.bank_statements FOR UPDATE TO authenticated USING (public.has_store_access(store_id));
CREATE POLICY bs_delete ON public.bank_statements FOR DELETE TO authenticated USING (public.has_store_access(store_id));

-- Bank Statement Items
ALTER TABLE public.bank_statement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bsi_select ON public.bank_statement_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = bank_statement_id AND public.has_store_access(bs.store_id)));
CREATE POLICY bsi_insert ON public.bank_statement_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = bank_statement_id AND public.has_store_access(bs.store_id)));
CREATE POLICY bsi_update ON public.bank_statement_items FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = bank_statement_id AND public.has_store_access(bs.store_id)));

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: calculate_abc — clasificación ABC automática
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_abc(
    p_store_id UUID,
    p_year INTEGER,
    p_month INTEGER,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := COALESCE(p_user_id, auth.uid());
    v_total_revenue NUMERIC := 0;
    v_cumulative NUMERIC := 0;
    v_class TEXT;
    v_count INTEGER := 0;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    -- Borrar clasificación previa del periodo
    DELETE FROM public.abc_classifications
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    -- Calcular revenue total del periodo
    SELECT COALESCE(SUM(ti.price_at_sale_cup * ti.quantity), 0) INTO v_total_revenue
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month;

    -- Insertar productos vendidos ordenados por revenue descendente
    INSERT INTO public.abc_classifications (store_id, product_id, classification, period_year, period_month, total_quantity_sold, total_revenue, annual_consumption_value, cumulative_percentage, calculated_at)
    SELECT
        p_store_id,
        ti.product_id,
        CASE
            WHEN v_total_revenue > 0 AND (
                SUM(ti.price_at_sale_cup * ti.quantity) OVER (ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC) / v_total_revenue * 100
            ) <= 80 THEN 'A'
            WHEN v_total_revenue > 0 AND (
                SUM(ti.price_at_sale_cup * ti.quantity) OVER (ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC) / v_total_revenue * 100
            ) <= 95 THEN 'B'
            ELSE 'C'
        END,
        p_year,
        p_month,
        SUM(ti.quantity),
        SUM(ti.price_at_sale_cup * ti.quantity),
        SUM(ti.price_at_sale_cup * ti.quantity),
        CASE WHEN v_total_revenue > 0
            THEN SUM(ti.price_at_sale_cup * ti.quantity) OVER (ORDER BY SUM(ti.price_at_sale_cup * ti.quantity) DESC) / v_total_revenue * 100
            ELSE 0
        END,
        now()
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.store_id = p_store_id AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at) = p_year
      AND EXTRACT(MONTH FROM t.created_at) = p_month
    GROUP BY ti.product_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object('status', 'success', 'products_classified', v_count, 'total_revenue', v_total_revenue);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_abc TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_abc TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: mark_expired_lots — marca lotes vencidos automáticamente
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_expired_lots(p_store_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.mark_expired_lots TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expired_lots TO service_role;

-- Ejecutar marcado inicial
SELECT public.mark_expired_lots() AS lots_expired;
