# FASE 4 — CHECKOUT SMOKE

S-01 CASH, S-02 TRANSFER, S-03 ZELLE (con conversión USD/tasa), S-04 idempotencia replay, S-05 doble submit 6 concurrentes, S-06 stock insuficiente.

**Resultado: 6 PASS / 0 OBSERVATION / 0 FAIL**

| ID | Título | Verdict | Checks |
|---|---|---|---|
| S-01 | Checkout smoke CASH (ruta /api/pos/checkout → create_sale_v2) | PASS | ✓ rpc_ok, ✓ document_created, ✓ total_ok, ✓ item_persisted, ✓ cogs_persisted, ✓ payment_created, ✓ movement_created, ✓ stock_updated, ✓ wac_stable, ✓ audit_written |
| S-02 | Checkout smoke TRANSFER | PASS | ✓ document, ✓ method, ✓ payment_transfer, ✓ movement, ✓ stock, ✓ audit |
| S-03 | Checkout smoke ZELLE (USD, tasa 120) | PASS | ✓ document, ✓ method_zelle, ✓ zelle_amt_set, ✓ payment_zelle_usd, ✓ movement, ✓ stock, ✓ audit |
| S-04 | Idempotencia: replay exacto del mismo request | PASS | ✓ first_success, ✓ replay_idempotent, ✓ single_document, ✓ single_payment, ✓ single_movement, ✓ stock_once |
| S-05 | Doble submit: 6 requests simultáneos con misma idempotency_key | PASS | ✓ at_least_one_success, ✓ all_ok_or_idempotent, ✓ unique_tx_ids, ✓ stock_once |
| S-06 | Stock insuficiente: rechazo seguro sin efecto parcial | PASS | ✓ rejected_clean, ✓ stock_unchanged, ✓ no_negative_stock, ✓ no_document, ✓ no_movement |

Detalle completo (TEST/INPUT/EXPECTED/ACTUAL/DB DELTA/AUDIT DELTA/IMPACT/VERDICT): `results.jsonl`
