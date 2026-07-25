-- ════════════════════════════════════════════════════════════════════════
-- V1.2 — Devoluciones, Clientes CRM, Cotizaciones, Kardex Valorado,
--         Cierre Fiscal Mensual
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CLIENTES CRM
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    ci TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    total_purchases NUMERIC(12,2) DEFAULT 0,
    total_visits INTEGER DEFAULT 0,
    last_visit_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_customers_store ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_name ON public.customers(store_id, name);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. DEVOLUCIONES / NOTAS DE CRÉDITO
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    original_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    devolution_number TEXT NOT NULL,
    reason TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'CUP',
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'zelle', 'store_credit')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'voided')),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    notes TEXT,
    processed_by UUID REFERENCES public.profiles(id),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    voided_by UUID REFERENCES public.profiles(id),
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devolutions_number ON public.devolutions(store_id, devolution_number);
CREATE INDEX IF NOT EXISTS idx_devolutions_store_date ON public.devolutions(store_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_devolutions_transaction ON public.devolutions(original_transaction_id);

CREATE TABLE IF NOT EXISTS public.devolution_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    devolution_id UUID NOT NULL REFERENCES public.devolutions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devolution_items_dev ON public.devolution_items(devolution_id);
CREATE INDEX IF NOT EXISTS idx_devolution_items_prod ON public.devolution_items(product_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. COTIZACIONES / PEDIDOS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    quotation_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    customer_phone TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced')),
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'CUP',
    discount_type TEXT DEFAULT 'fixed',
    discount_value NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    valid_until DATE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    invoiced_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number ON public.quotations(store_id, quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_store_date ON public.quotations(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON public.quotations(store_id, status);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_sku TEXT,
    quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON public.quotation_items(quotation_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. KARDEX VALORADO (vista materializada para performance)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kardex_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment', 'transfer_in', 'transfer_out', 'devolution_in', 'devolution_out')),
    quantity NUMERIC(12,2) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    reference_type TEXT,
    reference_id UUID,
    reference_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_kardex_store_product_date ON public.kardex_entries(store_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_store_date ON public.kardex_entries(store_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. CIERRE FISCAL MENSUAL
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    total_sales NUMERIC(14,2) DEFAULT 0,
    total_devolutions NUMERIC(14,2) DEFAULT 0,
    total_purchases NUMERIC(14,2) DEFAULT 0,
    total_commissions NUMERIC(14,2) DEFAULT 0,
    total_cash_balance NUMERIC(14,2) DEFAULT 0,
    closing_notes TEXT,
    closed_by UUID REFERENCES public.profiles(id),
    closed_at TIMESTAMPTZ,
    locked_by UUID REFERENCES public.profiles(id),
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_fiscal_closings_store_period UNIQUE (store_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_closings_store_period ON public.fiscal_closings(store_id, period_year, period_month);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS PARA TODAS LAS NUEVAS TABLAS
-- ──────────────────────────────────────────────────────────────────────────

-- Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_select_own_store ON public.customers FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));
CREATE POLICY customers_insert_own_store ON public.customers FOR INSERT TO authenticated
    WITH CHECK (public.has_store_access(store_id));
CREATE POLICY customers_update_own_store ON public.customers FOR UPDATE TO authenticated
    USING (public.has_store_access(store_id)) WITH CHECK (public.has_store_access(store_id));
CREATE POLICY customers_delete_own_store ON public.customers FOR DELETE TO authenticated
    USING (public.has_store_access(store_id));

-- Devolutions
ALTER TABLE public.devolutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY devolutions_select_own_store ON public.devolutions FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));
CREATE POLICY devolutions_insert_own_store ON public.devolutions FOR INSERT TO authenticated
    WITH CHECK (public.has_store_access(store_id));
CREATE POLICY devolutions_update_own_store ON public.devolutions FOR UPDATE TO authenticated
    USING (public.has_store_access(store_id)) WITH CHECK (public.has_store_access(store_id));

-- Devolution Items
ALTER TABLE public.devolution_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY devolution_items_select ON public.devolution_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = devolution_id AND public.has_store_access(d.store_id)));
CREATE POLICY devolution_items_insert ON public.devolution_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.devolutions d WHERE d.id = devolution_id AND public.has_store_access(d.store_id)));

-- Quotations
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_select_own_store ON public.quotations FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));
CREATE POLICY quotations_insert_own_store ON public.quotations FOR INSERT TO authenticated
    WITH CHECK (public.has_store_access(store_id));
CREATE POLICY quotations_update_own_store ON public.quotations FOR UPDATE TO authenticated
    USING (public.has_store_access(store_id)) WITH CHECK (public.has_store_access(store_id));
CREATE POLICY quotations_delete_own_store ON public.quotations FOR DELETE TO authenticated
    USING (public.has_store_access(store_id));

-- Quotation Items
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotation_items_select ON public.quotation_items FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.has_store_access(q.store_id)));
CREATE POLICY quotation_items_insert ON public.quotation_items FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id AND public.has_store_access(q.store_id)));

-- Kardex
ALTER TABLE public.kardex_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY kardex_select_own_store ON public.kardex_entries FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));
CREATE POLICY kardex_insert_own_store ON public.kardex_entries FOR INSERT TO authenticated
    WITH CHECK (public.has_store_access(store_id));

-- Fiscal Closings
ALTER TABLE public.fiscal_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_closings_select ON public.fiscal_closings FOR SELECT TO authenticated
    USING (public.has_store_access(store_id));
CREATE POLICY fiscal_closings_insert ON public.fiscal_closings FOR INSERT TO authenticated
    WITH CHECK (public.has_store_access(store_id));
CREATE POLICY fiscal_closings_update ON public.fiscal_closings FOR UPDATE TO authenticated
    USING (public.has_store_access(store_id)) WITH CHECK (public.has_store_access(store_id));


-- Helper: has_store_access_as — accepts explicit user_id (for service-role calls)
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user_id UUID, p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role TEXT;
BEGIN
    IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
    IF v_role = 'admin' THEN RETURN true; END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_store_memberships
        WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_store_access_as(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_access_as(UUID, UUID) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: create_devolution — crea devolución + restaura stock + kardex
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_devolution(
    p_store_id UUID,
    p_items JSONB,
    p_reason TEXT,
    p_original_transaction_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_devolution_id UUID;
    v_dev_number TEXT;
    v_item JSONB;
    v_total NUMERIC := 0;
    v_pid UUID;
    v_qty NUMERIC;
    v_price NUMERIC;
    v_item_total NUMERIC;
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    -- Generate devolution number: DEV-YYYY-NNNNNN
    v_dev_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                    LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    -- Calculate total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;
        v_total := v_total + (v_qty * v_price);
    END LOOP;

    -- Insert devolution
    INSERT INTO public.devolutions (
        store_id, original_transaction_id, devolution_number, reason,
        total_amount, currency, payment_method, status,
        customer_id, customer_name, notes, processed_by
    ) VALUES (
        p_store_id, p_original_transaction_id, v_dev_number, p_reason,
        v_total, 'CUP', p_payment_method, 'completed',
        p_customer_id, p_customer_name, p_notes, auth.uid()
    ) RETURNING id INTO v_devolution_id;

    -- Insert items + restore stock + kardex
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;
        v_item_total := v_qty * v_price;

        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_item_total, v_item->>'reason');

        -- Restore stock
        UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_pid;

        -- Kardex entry (devolution_in)
        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
            balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_item_total,
            stock_current, cost_average, stock_current * cost_average,
            'devolution', v_devolution_id, 'Devolución ' || v_dev_number, auth.uid()
        FROM public.products WHERE id = v_pid;
    END LOOP;

    RETURN jsonb_build_object('status', 'success', 'devolution_id', v_devolution_id, 'devolution_number', v_dev_number, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_devolution TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_devolution TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: create_quotation — crea cotización con items
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_quotation(
    p_store_id UUID,
    p_items JSONB,
    p_customer_id UUID DEFAULT NULL,
    p_customer_name TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_discount_type TEXT DEFAULT 'fixed',
    p_discount_value NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_valid_until DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_quote_number := 'COT-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                      LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');

    INSERT INTO public.quotations (
        store_id, quotation_number, customer_id, customer_name, customer_phone,
        status, total_amount, currency, discount_type, discount_value, notes, valid_until, created_by
    ) VALUES (
        p_store_id, v_quote_number, p_customer_id, p_customer_name, p_customer_phone,
        'draft', 0, 'CUP', p_discount_type, p_discount_value, p_notes, p_valid_until, auth.uid()
    ) RETURNING id INTO v_quote_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_pid := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_price := (v_item->>'unit_price')::NUMERIC;

        SELECT name, sku INTO v_pname, v_psku FROM public.products WHERE id = v_pid;

        INSERT INTO public.quotation_items (quotation_id, product_id, product_name, product_sku, quantity, unit_price, total, notes)
        VALUES (v_quote_id, v_pid, COALESCE(v_pname, v_item->>'product_name'), v_psku, v_qty, v_price, v_qty * v_price, v_item->>'notes');

        v_total := v_total + (v_qty * v_price);
    END LOOP;

    -- Apply discount
    IF p_discount_type = 'percentage' THEN
        v_total := v_total - (v_total * p_discount_value / 100);
    ELSE
        v_total := v_total - p_discount_value;
    END IF;

    UPDATE public.quotations SET total_amount = v_total WHERE id = v_quote_id;

    RETURN jsonb_build_object('status', 'success', 'quotation_id', v_quote_id, 'quotation_number', v_quote_number, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quotation TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: close_fiscal_period — cierra un periodo mensual
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_fiscal_period(
    p_store_id UUID,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closing_id UUID;
    v_total_sales NUMERIC := 0;
    v_total_devolutions NUMERIC := 0;
    v_total_purchases NUMERIC := 0;
    v_total_commissions NUMERIC := 0;
    v_date_from TEXT;
    v_date_to TEXT;
BEGIN
    -- Only admin/manager/encargado can close
    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED';
    END IF;

    v_date_from := make_date(p_year, p_month, 1)::TEXT;
    v_date_to := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::TEXT;

    -- Check if already closed
    SELECT id INTO v_closing_id FROM public.fiscal_closings
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month;

    IF v_closing_id IS NOT NULL THEN
        -- Update existing
        UPDATE public.fiscal_closings SET status = 'closed', closed_by = auth.uid(), closed_at = now(), updated_at = now()
        WHERE id = v_closing_id AND status = 'open';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'ERR_PERIOD_LOCKED: El periodo ya está cerrado o bloqueado';
        END IF;
    ELSE
        -- Calculate totals
        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_sales
        FROM public.transactions
        WHERE store_id = p_store_id AND status = 'completed'
          AND created_at >= v_date_from AND created_at < v_date_to;

        SELECT COALESCE(SUM(total_amount), 0) INTO v_total_devolutions
        FROM public.devolutions
        WHERE store_id = p_store_id AND status = 'completed'
          AND processed_at >= v_date_from AND processed_at < v_date_to;

        SELECT COALESCE(SUM(total_cost), 0) INTO v_total_purchases
        FROM public.receipts
        WHERE store_id = p_store_id AND status = 'active'
          AND created_at >= v_date_from AND created_at < v_date_to;

        SELECT COALESCE(SUM(final_amount), 0) INTO v_total_commissions
        FROM public.commission_payments
        WHERE store_id = p_store_id AND status = 'paid'
          AND paid_at >= v_date_from AND paid_at < v_date_to;

        INSERT INTO public.fiscal_closings (
            store_id, period_year, period_month, status,
            total_sales, total_devolutions, total_purchases, total_commissions,
            total_cash_balance, closed_by, closed_at
        ) VALUES (
            p_store_id, p_year, p_month, 'closed',
            v_total_sales, v_total_devolutions, v_total_purchases, v_total_commissions,
            v_total_sales - v_total_devolutions - v_total_commissions,
            auth.uid(), now()
        ) RETURNING id INTO v_closing_id;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'closing_id', v_closing_id,
        'total_sales', v_total_sales, 'total_devolutions', v_total_devolutions,
        'total_purchases', v_total_purchases, 'total_commissions', v_total_commissions);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_fiscal_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_fiscal_period TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: lock_fiscal_period — bloquea un periodo (solo admin)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lock_fiscal_period(
    p_store_id UUID,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
    IF v_role != 'admin' THEN
        RAISE EXCEPTION 'ERR_ADMIN_ONLY: Solo admin puede bloquear periodos fiscales';
    END IF;

    UPDATE public.fiscal_closings
    SET status = 'locked', locked_by = auth.uid(), locked_at = now(), updated_at = now()
    WHERE store_id = p_store_id AND period_year = p_year AND period_month = p_month AND status = 'closed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_CLOSED: El periodo debe estar cerrado antes de bloquearse';
    END IF;

    RETURN jsonb_build_object('status', 'success', 'message', 'Periodo bloqueado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_fiscal_period TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_fiscal_period TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER: Auto-create kardex entry on stock_movement insert
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_kardex_on_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id UUID;
    v_movement_type TEXT;
    v_qty NUMERIC;
    v_unit_cost NUMERIC;
BEGIN
    -- Get store_id from the product
    SELECT store_id INTO v_store_id FROM public.products WHERE id = NEW.product_id;
    IF v_store_id IS NULL THEN RETURN NEW; END IF;

    -- Map movement type
    v_movement_type := CASE
        WHEN NEW.movement_type IN ('sale', 'withdrawal', 'adjustment_out') THEN 'out'
        WHEN NEW.movement_type IN ('reception', 'adjustment_in', 'initial') THEN 'in'
        WHEN NEW.movement_type = 'transfer_in' THEN 'transfer_in'
        WHEN NEW.movement_type = 'transfer_out' THEN 'transfer_out'
        ELSE 'adjustment'
    END;

    v_qty := ABS(NEW.quantity);
    v_unit_cost := COALESCE(NEW.unit_cost, 0);

    INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value,
        balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
    SELECT v_store_id, NEW.product_id, v_movement_type, v_qty, v_unit_cost, v_qty * v_unit_cost,
        p.stock_current, p.cost_average, p.stock_current * p.cost_average,
        'stock_movement', NEW.id, NEW.reason || ' (' || NEW.movement_type || ')', NEW.created_by
    FROM public.products p WHERE p.id = NEW.product_id;

    RETURN NEW;
END;
$$;

-- Drop old trigger if exists, create new
DROP TRIGGER IF EXISTS trg_auto_kardex ON public.stock_movements;
CREATE TRIGGER trg_auto_kardex
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_kardex_on_stock_movement();

-- ──────────────────────────────────────────────────────────────────────────
-- AUTO-CREATE fiscal_closings row when a new month starts (lazy)
-- Called on first transaction of the month
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_fiscal_period(p_store_id UUID, p_year INTEGER, p_month INTEGER)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.ensure_fiscal_period TO authenticated;
