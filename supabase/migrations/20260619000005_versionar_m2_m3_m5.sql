-- R2-3: Versionar M2+M3+M5 extraido de BD

-- M2: cash_sessions
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL, cashier_id UUID NOT NULL,
  opening_cash NUMERIC(12,2) DEFAULT 0, opening_at TIMESTAMPTZ DEFAULT NOW(),
  closing_at TIMESTAMPTZ, closing_cash_counted NUMERIC(12,2),
  closing_vouchers_counted NUMERIC(12,2), system_expected_cash NUMERIC(12,2),
  system_expected_vouchers NUMERIC(12,2), difference_cash NUMERIC(12,2) DEFAULT 0,
  difference_vouchers NUMERIC(12,2) DEFAULT 0, status TEXT DEFAULT 'open',
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

-- M3: RLS en tablas financieras
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_cost_templates ENABLE ROW LEVEL SECURITY;

-- M3: Policies extraidas de BD
-- Cash closures unified on cash_closures (ALL)
-- cash_closures_delete_rls on cash_closures (DELETE)
-- cash_closures_insert_rls on cash_closures (INSERT)
-- cash_closures_select_rls on cash_closures (SELECT)
-- cash_closures_update_rls on cash_closures (UPDATE)
-- Cash movements access on cash_movements (SELECT)
-- Cash movements insert on cash_movements (INSERT)
-- cash_movements_insert on cash_movements (INSERT)
-- cash_movements_select on cash_movements (SELECT)
-- cash_sessions_insert on cash_sessions (INSERT)
-- cash_sessions_select on cash_sessions (SELECT)
-- cash_sessions_update on cash_sessions (UPDATE)
-- Allow all access to own store data on inventory_adjustments (ALL)
-- inventory_adjustments_delete_rls on inventory_adjustments (DELETE)
-- inventory_adjustments_insert_rls on inventory_adjustments (INSERT)
-- inventory_adjustments_select_rls on inventory_adjustments (SELECT)
-- inventory_adjustments_update_rls on inventory_adjustments (UPDATE)
-- Admin/manager can delete ofertas on ofertas (DELETE)
-- Admin/manager/encargado can insert ofertas on ofertas (INSERT)
-- Admin/manager/encargado can update ofertas on ofertas (UPDATE)
-- Users can view ofertas from their stores on ofertas (SELECT)
-- ofertas_select_rls on ofertas (SELECT)
-- product_cost_sheets_delete_admin on product_cost_sheets (DELETE)
-- product_cost_sheets_insert_roles on product_cost_sheets (INSERT)
-- product_cost_sheets_select_authenticated on product_cost_sheets (SELECT)
-- product_cost_sheets_select_rls on product_cost_sheets (SELECT)
-- product_cost_sheets_update_roles on product_cost_sheets (UPDATE)
-- Productos públicos - lectura on products (SELECT)
-- products_delete_rls on products (DELETE)
-- products_delete_store_access on products (DELETE)
-- products_insert_rls on products (INSERT)
-- products_insert_store_access on products (INSERT)
-- products_select_rls on products (SELECT)
-- products_select_store_access on products (SELECT)
-- products_update_rls on products (UPDATE)
-- products_update_store_access on products (UPDATE)
-- Purchases unified on purchase_orders (ALL)
-- po_ins on purchase_orders (INSERT)
-- po_insert_authenticated on purchase_orders (INSERT)
-- po_sel on purchase_orders (SELECT)
-- po_select_authenticated on purchase_orders (SELECT)
-- po_upd on purchase_orders (UPDATE)
-- po_update_authenticated on purchase_orders (UPDATE)
-- purchase_orders_select_rls on purchase_orders (SELECT)
-- Receipts update status on receipts (UPDATE)
-- receipts_delete_rls on receipts (DELETE)
-- receipts_insert_rls on receipts (INSERT)
-- receipts_select_isolated on receipts (SELECT)
-- receipts_select_rls on receipts (SELECT)
-- receipts_update_rls on receipts (UPDATE)
-- Stock movements select on stock_movements (SELECT)
-- Warehouse can insert stock movements on stock_movements (INSERT)
-- stock_movements_delete_rls on stock_movements (DELETE)
-- stock_movements_insert_rls on stock_movements (INSERT)
-- stock_movements_select_rls on stock_movements (SELECT)
-- stock_movements_update_rls on stock_movements (UPDATE)
-- store_cost_templates_delete_admin on store_cost_templates (DELETE)
-- store_cost_templates_insert_roles on store_cost_templates (INSERT)
-- store_cost_templates_select_authenticated on store_cost_templates (SELECT)
-- store_cost_templates_select_rls on store_cost_templates (SELECT)
-- store_cost_templates_update_roles on store_cost_templates (UPDATE)
-- Transactions insert on transactions (INSERT)
-- Transactions select on transactions (SELECT)
-- Transactions update status on transactions (UPDATE)
-- transactions_delete_rls on transactions (DELETE)
-- transactions_insert_rls on transactions (INSERT)
-- transactions_select_rls on transactions (SELECT)
-- transactions_update_rls on transactions (UPDATE)
-- Transfers access on transfers (SELECT)
-- transfers_select_rls on transfers (SELECT)

-- M5: transfers.status ya existe en BD
-- Columnas: id, origin_store_id, destination_store_id, created_by, status, notes, created_at, updated_at, tenant_id
