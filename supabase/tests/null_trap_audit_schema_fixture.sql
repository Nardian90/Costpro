-- ============================================================================
-- FIXTURE DE ESQUEMA (BD aislada de pruebas) — nulabilidad IDÉNTICA a la BD
-- viva (information_schema consultado el 2026-10-21, read-only).
-- Cubre las tablas/objetos que tocan las 4 funciones auditadas + las 6
-- fórmulas de caja. Funciones auxiliares como STUBS controlables por test.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;
-- Roles de Supabase (para que los GRANT/REVOKE de la migración apliquen)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TYPE public.payment_method_enum AS ENUM ('cash','card','transfer','wallet','other','mixed','zelle');
CREATE TYPE public.transfer_status AS ENUM ('PENDIENTE','CONFIRMADA','CANCELADA','REVERSADA');
CREATE TYPE public.transaction_status AS ENUM ('pending','completed','failed','compensated','cancelled','refunded','voided','reversed');
CREATE TYPE public.discount_type_enum AS ENUM ('fixed','percentage');

-- Stubs de autorización (controlables por test vía set_config)
CREATE OR REPLACE FUNCTION public.has_store_access_as(p_user uuid, p_store uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.has_access', true), ''), '1')::boolean $$;
CREATE OR REPLACE FUNCTION public.has_store_access(p_store uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.has_access', true), ''), '1')::boolean $$;
CREATE OR REPLACE FUNCTION public.has_store_role_as(p_user uuid, p_store uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.has_role', true), ''), '1')::boolean $$;
CREATE OR REPLACE FUNCTION public.has_management_access_as(p_user uuid, p_store uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('test.has_mgmt', true), ''), '1')::boolean $$;
CREATE OR REPLACE FUNCTION public.validate_operation_date(p_date timestamptz, p_store uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE OR REPLACE FUNCTION public.next_document_number(p_store uuid, p_kind text, p_user uuid) RETURNS text
LANGUAGE plpgsql AS $$ DECLARE v_n int; BEGIN SELECT COALESCE(max((doc_number)[3]::int),0)+1 INTO v_n FROM test_doc_counter WHERE store_id=p_store; INSERT INTO test_doc_counter(store_id, doc_number) VALUES (p_store, ARRAY['IE', to_char(now(),'YYYY'), v_n::text]); RETURN 'IE-'||lpad(v_n::text,6,'0')||'-'||to_char(now(),'YYYY'); END $$;
CREATE TABLE test_doc_counter (store_id uuid, doc_number text[]);

-- validate_store_can_be_modified: STUB configurable por test (devuelve lo que
-- se ponga en test.validate_result; si NULL → devuelve fila canónica true)
CREATE OR REPLACE FUNCTION public.validate_store_can_be_modified(p_store uuid, p_check text)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE v jsonb := NULLIF(current_setting('test.validate_result', true), '')::jsonb;
BEGIN
  RETURN COALESCE(v, jsonb_build_object('can_modify', true, 'blockers', '[]'::jsonb));
END $$;

-- Stub de supplier payment / receive output (no se ejercitan en la batería)
CREATE OR REPLACE FUNCTION public.register_supplier_payment(p_store_id uuid, p_ref_type text, p_ref_id uuid, p_amount numeric, p_payment_method text, p_paid_by uuid, p_currency text, p_exchange_rate numeric, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
CREATE OR REPLACE FUNCTION public.receive_production_output(p_order_id uuid, p_product_id uuid, p_quantity numeric, p_store_id uuid, p_user_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN jsonb_build_object('status','success'); END $$;

-- ── Tablas (columnas y nulabilidad según information_schema VIVO) ──
CREATE TABLE public.stores (
  id uuid PRIMARY KEY, name text, tenant_id uuid
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY, role text, active_store_id uuid
);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  seller_id uuid,
  total_amount numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  payment_method payment_method_enum DEFAULT 'cash',          -- NULLABLE (vivo)
  status transaction_status NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  customer_name text, customer_phone text, customer_ci text, customer_address text,
  sale_currency text NOT NULL DEFAULT 'CUP',
  sale_exchange_rate numeric NOT NULL DEFAULT 1.0,
  cash_amount numeric DEFAULT 0,                               -- NULLABLE (vivo)
  transfer_amount numeric DEFAULT 0,                           -- NULLABLE (vivo)
  zelle_amount numeric DEFAULT 0,                              -- NULLABLE (vivo)
  discount_type discount_type_enum,
  discount_value numeric,
  updated_at timestamptz
);

CREATE TABLE public.transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  product_id uuid,
  variant_id uuid,
  quantity numeric NOT NULL,
  price_at_sale numeric NOT NULL,
  price_currency text NOT NULL DEFAULT 'CUP',
  price_at_sale_cup numeric NOT NULL DEFAULT 0,
  cost_at_sale numeric                                          -- NULLABLE (vivo)
);

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  ref_type text NOT NULL,
  ref_id uuid,
  transaction_id uuid,                                          -- NULLABLE (vivo)
  amount numeric NOT NULL,
  amount_cup numeric GENERATED ALWAYS AS (CASE currency WHEN 'CUP' THEN amount ELSE amount * exchange_rate END) STORED,
  payment_method text NOT NULL,
  currency text NOT NULL DEFAULT 'CUP',
  exchange_rate numeric NOT NULL DEFAULT 1.0,
  payment_date timestamptz NOT NULL DEFAULT now(),
  direction text NOT NULL DEFAULT 'in',
  notes text,
  paid_by uuid,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  order_number text,
  order_type text NOT NULL DEFAULT 'service',
  status text NOT NULL DEFAULT 'draft',
  budget_total numeric NOT NULL DEFAULT 0,
  transaction_id uuid,
  payment_status text,
  completion_date date,
  closed_at timestamptz,
  customer_name text, customer_phone text, customer_ci text, customer_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.production_order_items (id uuid PRIMARY KEY, order_id uuid, product_id uuid, quantity numeric, unit_price numeric);

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_store_id uuid NOT NULL,
  destination_store_id uuid NOT NULL,
  status transfer_status DEFAULT 'PENDIENTE',                  -- NULLABLE (vivo)
  requires_approval boolean DEFAULT false,                     -- NULLABLE (vivo)
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.transfer_items (id uuid PRIMARY KEY, transfer_id uuid, product_id uuid, quantity numeric);
CREATE TABLE public.transfer_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,                                               -- NULLABLE por diseño (regla global)
  tenant_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  approver_roles text[] NOT NULL
);

CREATE TABLE public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  payment_method payment_method_enum,
  paid_at timestamptz,
  final_amount numeric,
  amount_cup numeric,
  currency text DEFAULT 'CUP'
);

CREATE TABLE public.cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendiente',
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NOT NULL DEFAULT now(),
  opening_balance numeric DEFAULT 0,                           -- NULLABLE (vivo)
  session_reference text,                                      -- NULLABLE (vivo — eje del R4)
  declared_cash numeric, declared_vouchers numeric, declared_total numeric,
  system_expected_total numeric, difference numeric, notes text
);

CREATE TABLE public.cash_flow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  document_number text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('ingreso','egreso')),
  concept text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('CUP','USD')),
  exchange_rate numeric NOT NULL,
  amount_cup numeric GENERATED ALWAYS AS (CASE currency WHEN 'CUP' THEN amount ELSE amount * exchange_rate END) STORED,
  payment_method text NOT NULL DEFAULT 'cash',
  operation_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','anulado')),
  closure_id uuid,
  responsible_user_id uuid,
  counterparty text, justification text NOT NULL, notes text,
  related_document_id uuid,
  payment_transaction_id uuid,
  annulled_at timestamptz, annulled_by uuid, annulment_reason text,
  annulment_payment_transaction_id uuid,
  created_by uuid, confirmed_by uuid, idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.idempotency_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  record_id uuid,
  param_hash text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, operation)
);

CREATE TABLE public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL, doc_type text NOT NULL, period text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  UNIQUE (store_id, doc_type, period)
);

CREATE TABLE public.store_exchange_rates (id uuid PRIMARY KEY, store_id uuid, currency text, rate numeric, updated_at timestamptz DEFAULT now());
CREATE TABLE public.exchange_rates (id uuid PRIMARY KEY, currency text, source text, segment text, rate numeric, rate_date date, captured_at timestamptz DEFAULT now());

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, store_id uuid,
  action text NOT NULL, table_name text, record_id uuid,
  old_data jsonb, new_data jsonb, metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.devolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  devolution_number text,
  status text NOT NULL DEFAULT 'completed',
  total_amount numeric NOT NULL DEFAULT 0,
  original_transaction_id uuid,
  payment_method text DEFAULT 'cash',
  customer_id uuid, customer_name text,
  reason text, notes text,
  reversed_at timestamptz, reversed_by uuid, reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.devolution_items (id uuid PRIMARY KEY, devolution_id uuid, product_id uuid, quantity numeric, unit_price numeric, total numeric, reason text);
CREATE TABLE public.store_credit_ledger (id uuid PRIMARY KEY, store_id uuid, customer_id uuid, amount numeric, devolution_id uuid, origin_transaction_id uuid, idempotency_key text, created_by uuid);
CREATE TABLE public.cash_register_sessions (id uuid PRIMARY KEY, store_id uuid, cashier_id uuid, opening_cash numeric, opened_at timestamptz DEFAULT now(), status text DEFAULT 'open');
CREATE TABLE public.cash_movements (id uuid PRIMARY KEY, session_id uuid, movement_type text, method payment_method_enum, amount numeric, reason text, store_id uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.cash_sessions (id uuid PRIMARY KEY, store_id uuid, status text, created_at timestamptz DEFAULT now());

-- Tablas que reset_store_data toca (vacías — solo necesitan existir)
CREATE TABLE public.receipts (id uuid PRIMARY KEY, store_id uuid, status text);
CREATE TABLE public.receipt_items (id uuid PRIMARY KEY, receipt_id uuid);
CREATE TABLE public.quotations (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.quotation_items (id uuid PRIMARY KEY, quotation_id uuid);
CREATE TABLE public.customers (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.bank_statements (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.bank_statement_items (id uuid PRIMARY KEY, bank_statement_id uuid);
CREATE TABLE public.kardex_entries (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.physical_counts (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.physical_count_items (id uuid PRIMARY KEY, count_id uuid);
CREATE TABLE public.stock_movements (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.inventory_adjustments (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.inventory_adjustment_items (id uuid PRIMARY KEY, adjustment_id uuid);
CREATE TABLE public.purchase_orders (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.purchase_order_items (id uuid PRIMARY KEY, po_id uuid);
CREATE TABLE public.commission_rules (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.workers (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.sales_transactions (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.ofertas (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.products (id uuid PRIMARY KEY, store_id uuid, category_id uuid, stock_current numeric, cost_average numeric, is_service boolean DEFAULT false, updated_at timestamptz DEFAULT now());
CREATE TABLE public.product_variants (id uuid PRIMARY KEY, product_id uuid);
CREATE TABLE public.product_lots (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.product_cost_sheets (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.store_cost_templates (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.cost_sheet_templates (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.categories (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.suppliers (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.warehouses (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.warehouse_stock (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.inventory (id uuid PRIMARY KEY, store_id uuid, product_id uuid, quantity numeric);
CREATE TABLE public.inventory_batches (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.inventory_snapshots (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.abc_classifications (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.price_change_history (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.price_commit_log (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.tax_configurations (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.received_services (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.service_types (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.fiscal_closings (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.whatsapp_messages (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.whatsapp_invitations (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.whatsapp_contacts (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.whatsapp_risk_state (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.whatsapp_configs (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.telegram_messages (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.telegram_invitations (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.telegram_contacts (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.telegram_configs (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.store_notifications (id uuid PRIMARY KEY, store_id uuid);
CREATE TABLE public.store_reset_snapshots (id uuid PRIMARY KEY, store_id uuid);

-- Usuario actor de pruebas
INSERT INTO public.stores (id, name, tenant_id) VALUES ('11111111-1111-1111-1111-111111111111', 'TIENDA AUDITORIA', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.profiles (id, role) VALUES ('33333333-3333-3333-3333-333333333333', 'admin');
