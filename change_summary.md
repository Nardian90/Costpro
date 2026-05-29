# Database changes for prices per UM and retail/company classification

## Table Changes
- **public.products**: Added `precio_empresa` (NUMERIC(12,2)) column for the base unit.
- **public.product_variants**: Added `precio_empresa` (NUMERIC(12,2)) column for additional units of measure.

## New Table: public.price_change_history
- Tracks price changes for products and variants.
- Includes `tenant_id` and `store_id` for multi-tenant isolation.
- Columns: `id`, `product_id`, `variant_id`, `store_id`, `tenant_id`, `field_changed`, `old_value`, `new_value`, `change_method`, `change_params`, `affected_count`, `changed_by`, `created_at`.

## Security (RLS)
- Enabled RLS on `price_change_history`.
- Policy "Users can read their store history" using `public.has_store_access(store_id)`.
- Policy "Users can insert their store history" using `public.has_store_access(store_id)`.

## Indices
- `idx_pch_product`, `idx_pch_store`, `idx_pch_tenant`, `idx_pch_created`.
