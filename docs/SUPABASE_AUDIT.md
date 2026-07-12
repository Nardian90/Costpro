# CostPro — Auditoría de Base de Datos Supabase
## Fecha: 2026-07-12

## 1. Estado General

- **Proyecto Supabase:** wthkddeleylijmonclxg
- **Tablas:** 103 en schema `public`
- **Funciones/RPCs:** 165
- **Migrations aplicadas:** 5 migrations de payment tracking + production orders

## 2. Tablas Críticas — Schema Verificado

### payment_transactions (tabla unificada de pagos)
| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| store_id | uuid | NOT NULL | |
| ref_type | text | NOT NULL | |
| ref_id | uuid | NOT NULL | |
| amount | numeric | NOT NULL | |
| payment_method | text | NOT NULL | |
| currency | text | NOT NULL | 'CUP' |
| exchange_rate | numeric | | 1.0 |
| amount_cup | numeric | | (generated) |
| payment_date | timestamptz | NOT NULL | now() |
| reference | text | NULL | |
| notes | text | NULL | |
| paid_by | uuid | NULL | |
| created_at | timestamptz | NOT NULL | now() |
| updated_at | timestamptz | NOT NULL | now() |

**Constraints:**
- `ref_type CHECK IN ('receipt', 'service', 'production_order', 'work')` ✅
- `payment_method CHECK IN ('cash', 'transfer', 'zelle')` ✅
- `amount CHECK > 0` ✅
- **RLS:** ✅ ENABLED (3 policies: select/insert/delete por store_id)

### production_orders
| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | gen_random_uuid() |
| store_id | uuid | NOT NULL | |
| order_number | text | NOT NULL | (auto-generated OP-YYYY-NNNN) |
| order_type | text | NOT NULL | 'service' |
| status | text | NOT NULL | 'draft' |
| customer_name | text | NULL | |
| customer_ci | text | NULL | |
| customer_phone | text | NULL | |
| customer_address | text | NULL | |
| budget_total | numeric | NOT NULL | 0 |
| budget_currency | text | NOT NULL | 'CUP' |
| advance_amount | numeric | NULL | 0 |
| advance_method | text | NULL | |
| advance_currency | text | NULL | 'CUP' |
| paid_amount | numeric | NULL | 0 |
| payment_status | text | NULL | 'unpaid' |
| output_product_id | uuid | NULL | |
| output_quantity | numeric | NULL | 0 |
| transaction_id | uuid | NULL | |
| order_date | date | NOT NULL | CURRENT_DATE |
| closed_at | timestamptz | NULL | |
| created_by | uuid | NULL | |
| created_at | timestamptz | NOT NULL | now() |

**Constraints:**
- `order_type CHECK IN ('production', 'service', 'work')` ✅
- `status CHECK IN ('draft', 'approved', 'in_progress', 'paused', 'completed', 'closed', 'voided')` ✅
- **RLS:** ✅ ENABLED

### receipts (con campos de pago añadidos)
| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | uuid_generate_v4() |
| store_id | uuid | NULL | |
| supplier | text | NULL | |
| total_cost | numeric | NULL | 0 |
| status | text | NULL | 'active' |
| reception_date | date | NULL | CURRENT_DATE |
| payment_status | text | NULL | 'unpaid' |
| payment_method | text | NULL | |
| paid_amount | numeric | NULL | 0 |
| due_date | date | NULL | |
| paid_at | timestamptz | NULL | |
| payment_terms_days | integer | NULL | 30 |

**RLS:** ✅ ENABLED

### received_services (con campos de pago añadidos)
Mismos campos de pago que receipts. **RLS:** ✅ ENABLED

### commission_payments (con método+moneda añadidos)
| Columna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NOT NULL | |
| store_id | uuid | NOT NULL | |
| worker_id | uuid | NOT NULL | |
| period_start | date | NOT NULL | |
| period_end | date | NOT NULL | |
| calculated_amount | numeric | NOT NULL | 0 |
| final_amount | numeric | NOT NULL | 0 |
| status | text | NOT NULL | 'draft' |
| approved_by | uuid | NULL | |
| approved_at | timestamptz | NULL | |
| paid_by | uuid | NULL | |
| paid_at | timestamptz | NULL | |
| payment_method | text | NULL | |
| currency | text | NULL | 'CUP' |
| exchange_rate | numeric | NULL | 1.0 |
| amount_cup | numeric | NULL | 0 |

**RLS:** ✅ ENABLED

## 3. RPCs Críticos — Signatures Verificadas

### register_reception(p_store_id, p_supplier, p_reception_date, p_invoice_number, p_items) → uuid
**IMPORTANTE:** NO acepta `p_seller_id` ni `p_notes`. Los items son jsonb con: `product_id, quantity, unit_cost, unit_of_measure, sale_price, sku, variant_id, moneda_recepcion, tasa_cambio_recepcion`.

### create_sale(p_store_id, p_seller_id, p_total_amount, p_items, p_subtotal, p_discount_type, p_discount_value, p_payment_method, p_tax_amount, p_applied_taxes, p_transaction_id, p_operation_date, p_cash_amount, p_transfer_amount, p_idempotency_key, p_sale_currency, p_sale_exchange_rate, p_zelle_amount) → jsonb

### register_supplier_payment(p_store_id, p_ref_type, p_ref_id, p_amount, p_payment_method, p_paid_by, p_currency, p_exchange_rate, p_reference, p_notes) → uuid

### get_cash_report(p_store_id, p_start_date, p_end_date) → JSON
Incluye: sales, payments, commissions, production, totals, cash_breakdown_cup

### withdraw_production_item(p_item_id, p_qty, p_unit_cost, p_store_id) → VOID
Usa `quantity_change` (no `quantity`) y `reference_id` (no `reference`) ✅

### receive_production_output(p_order_id, p_product_id, p_quantity, p_store_id) → VOID
Mismo fix de columnas ✅

### close_service_order_as_sale(p_order_id, p_store_id, p_seller_id, p_payment_method, p_currency, p_exchange_rate) → uuid

## 4. Enum movement_type
Valores válidos: `sale, purchase, adjustment, return, initial, transfer, void, transfer_in, transfer_out, sale_void, production_out, production_in` ✅

## 5. Triggers Verificados
- `update_payment_status()` — branches para receipt, service, production_order, work ✅
- `calculate_commission_amount_cup()` — siempre recalcula ✅
- `generate_production_order_number()` — OP-YYYY-NNNN ✅
- `set_default_due_date_receipt()` — fecha + 30 días ✅
- `set_default_due_date_service()` — fecha + 30 días ✅

## 6. Issues Encontrados

### Ninguno crítico
Todos los constraints, RLS, columnas, enums y RPCs están correctamente configurados.

### Notas
- `register_reception` no acepta `p_seller_id` ni `p_notes` — la API de Next.js las maneja
- `create_sale` retorna jsonb (no uuid directo) — contiene el sale_id
- RLS está activo en todas las tablas críticas — las inserciones directas a Supabase fallarán sin auth correcta
