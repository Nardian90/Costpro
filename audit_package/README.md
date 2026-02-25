# Audit Evidence Package

This package contains the findings and artifacts from the Technical Audit of the Commercial Flow.

## Contents
- `AUDIT_REPORT.md`: The main technical report with findings, risk matrix, and mitigation plans.
- `scripts/stress_sales.js`: A k6 script to simulate concurrent sales.
- `scripts/reconcile_inventory.sql`: SQL script to detect discrepancies between Kardex (stock_movements) and Inventory table.
- `scripts/idempotency_test.sh`: Shell script to validate idempotency in the `create_sale` RPC.

## How to use
1. **Stress Test:** Run `k6 run scripts/stress_sales.js` (requires k6 installed).
2. **Reconciliation:** Execute the content of `scripts/reconcile_inventory.sql` in the Supabase SQL Editor.
3. **Idempotency:** Run `./scripts/idempotency_test.sh <JWT> <URL> <STORE_ID> <PRODUCT_ID>`.
