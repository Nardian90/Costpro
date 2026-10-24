// ONE-SHOT: rebuild isolated certification DB "cajamision" (NUNCA producción).
// Base tables faithful to PRODUCTION (OpenAPI read-only 2026-10-24) + REAL final
// RPC bodies from the repo migrations + supporting objects.
import { createRequire } from 'node:module';
const require = createRequire('/home/z/my-project/pgtest/');
const { Client } = require('pg');
import { readFileSync } from 'node:fs';

const MIG = '/home/z/costpro/supabase/migrations';

const admin = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/postgres' });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS cajamision WITH (FORCE)`);
await admin.query(`CREATE DATABASE cajamision`);
await admin.end();

const c = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:5435/cajamision' });
await c.connect();
await c.query(`CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'service_role' $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);

// ── Base tables (columnas fieles a PRODUCCIÓN) ──
await c.query(`
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  is_active boolean DEFAULT true, tenant_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, full_name text, email text,
  role text, roles text[], is_active boolean DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rate_date date NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
  currency text NOT NULL, source text NOT NULL, rate numeric NOT NULL,
  segment text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.store_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id),
  currency text NOT NULL DEFAULT 'USD', rate numeric NOT NULL, source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true, valid_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  document_type text NOT NULL, year integer NOT NULL, last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, document_type, year));
CREATE TABLE public.idempotency_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL, operation text NOT NULL,
  record_id uuid NOT NULL, param_hash text NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_key_operation UNIQUE (idempotency_key, operation));
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, store_id uuid, action text,
  table_name text, record_id uuid, metadata jsonb, details jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, seller_id uuid NOT NULL,
  total_amount numeric NOT NULL, status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  payment_method text, cash_amount numeric, transfer_amount numeric, zelle_amount numeric,
  sale_currency text NOT NULL DEFAULT 'CUP', sale_exchange_rate numeric NOT NULL DEFAULT 1,
  invoice_number text, notes text, idempotency_key text, customer_name text,
  cash_received_cup numeric, cash_received_usd numeric, change_given_cup numeric, change_given_usd numeric,
  change_currency text, change_exchange_rate numeric, change_rate_source text);
CREATE TABLE public.transaction_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  quantity numeric NOT NULL, price_at_sale numeric NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  cash_paid numeric, transfer_paid numeric, price_currency text NOT NULL DEFAULT 'CUP',
  price_at_sale_cup numeric NOT NULL DEFAULT 0, zelle_paid numeric, currency text, exchange_rate numeric,
  cash_currency text, item_discount_value numeric NOT NULL DEFAULT 0, item_discount_pct numeric NOT NULL DEFAULT 0);
CREATE TABLE public.cash_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, store_id uuid NOT NULL,
  session_reference text, declared_cash numeric NOT NULL DEFAULT 0, declared_vouchers numeric NOT NULL DEFAULT 0,
  system_total numeric NOT NULL DEFAULT 0, notes text, closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), declared_total numeric, system_expected_total numeric,
  status text NOT NULL DEFAULT 'open', difference numeric, opening_balance numeric, cash_movements_total numeric,
  opening_balance_cup numeric, opening_balance_usd numeric, opening_difference_cup numeric, opening_difference_usd numeric,
  opening_difference_note text, declared_cash_usd numeric, system_expected_cash_usd numeric, difference_usd numeric);
CREATE TABLE public.commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, worker_id uuid NOT NULL,
  period_start date NOT NULL, period_end date NOT NULL, calculated_amount numeric NOT NULL,
  final_amount numeric NOT NULL, manual_adjustment_reason text, calculated_breakdown jsonb,
  rule_applied_id uuid, status text NOT NULL DEFAULT 'draft', approved_by uuid, approved_at timestamptz,
  paid_by uuid, paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, tenant_id uuid,
  payment_method text, currency text, exchange_rate numeric, amount_cup numeric, due_date date, payment_reference text);
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, ref_type text NOT NULL,
  ref_id uuid NOT NULL, amount numeric NOT NULL, payment_method text NOT NULL, currency text NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1, payment_date timestamptz NOT NULL DEFAULT now(),
  reference text, notes text, paid_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), idempotency_key text, transaction_id uuid,
  direction text NOT NULL,
  amount_cup numeric GENERATED ALWAYS AS (CASE WHEN currency = 'CUP' THEN amount ELSE round(amount * exchange_rate, 2) END) STORED,
  CONSTRAINT pt_ref_type CHECK (ref_type IN ('sale','production_order','work','receipt','service','cash_flow','devolution','adjustment','commission')));
CREATE TABLE public.cash_flow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL, document_number text NOT NULL,
  doc_type text NOT NULL, concept text NOT NULL, amount numeric NOT NULL, currency text NOT NULL,
  exchange_rate numeric NOT NULL DEFAULT 1,
  amount_cup numeric GENERATED ALWAYS AS (CASE WHEN currency = 'CUP' THEN amount WHEN currency = 'USD' THEN round(amount * exchange_rate, 2) ELSE NULL END) STORED,
  payment_method text NOT NULL DEFAULT 'cash', operation_date timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'confirmed', closure_id uuid, responsible_user_id uuid NOT NULL,
  counterparty text, justification text NOT NULL, notes text, related_document_id uuid,
  payment_transaction_id uuid, annulment_payment_transaction_id uuid, idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(), confirmed_by uuid NOT NULL,
  annulled_at timestamptz, annulled_by uuid, annulment_reason text,
  CONSTRAINT cfd_doc_type CHECK (doc_type IN ('ingreso','egreso')));
CREATE TYPE public.user_role AS ENUM ('superadmin','admin','manager','encargado','clerk','auditor','worker');
CREATE TYPE public.membership_status AS ENUM ('active','suspended','removed');
CREATE TABLE public.user_store_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'clerk', status membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, store_id));
`);

// ── Funciones auxiliares de autorización (finales del repo) ──
const roleFn = readFileSync(`${MIG}/20260807000002_v2_16_2_has_store_role_as.sql`, 'utf8');
const s1 = roleFn.indexOf('CREATE OR REPLACE FUNCTION public.has_store_role_as');
const e1 = roleFn.indexOf('$function$;', s1) + '$function$;'.length;
await c.query(roleFn.slice(s1, e1));
const accFn = readFileSync(`${MIG}/20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql`, 'utf8');
const s2 = accFn.indexOf('CREATE OR REPLACE FUNCTION public.has_store_access_as');
const e2 = accFn.indexOf('END;\n$$', s2) + 'END;\n$$'.length;
await c.query(accFn.slice(s2, e2));

// ── RPC reales finales del módulo Caja ──
const rpcs = readFileSync('/home/z/my-project/scripts/rpc_functions.sql', 'utf8');
await c.query(rpcs);
console.log('fixture cajamision lista (tablas fieles a producción + RPC reales)');
await c.end();
