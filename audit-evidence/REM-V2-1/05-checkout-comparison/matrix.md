# REM-V2-1 — 05 COMPARACIÓN CHECKOUT V1 vs V2 (matriz con evidencia)

Cada celda cita evidencia de código. UNKNOWN = no demostrable sin entorno mutativo seguro.

| Control | V1 `create_sale` | V2 `create_sale_v2` | Superior |
|---|---|---|---|
| auth.uid enforcement | `v_uid` auth-pinned (20260803000004:65) | mismo patrón (pr4_4e:122) | IGUAL |
| store isolation | `has_store_access_as` no-null (:75) | ídem (pr4_4e:158) | IGUAL |
| role enforcement | ninguna (cualquier miembro de tienda vende) | ninguna para vender; **+ supervisor para descuento ≥15%** (pr4_4e:244-246) | **V2** |
| input validation | confía en totales/descuento/tax del payload | **recalcula subtotal/desc/tax server-side; ERR_TOTAL_MISMATCH** (pr4_4e:236-239) | **V2** |
| transaction atomicity | 1 RPC = 1 transacción | ídem | IGUAL |
| inventory integrity | sin validación ni lock propios (delega en register_stock_movement + constraints) | **`inventory.quantity FOR UPDATE` + ERR_INSUFFICIENT_STOCK + skip servicios** (pr4_4e:184-189) | **V2** |
| WAC integrity | unit_cost = costo del cliente | ídem (ver 08-accounting) | IGUAL (ver causalidad F-03) |
| idempotency | SELECT + partial UNIQUE INDEX `transactions.idempotency_key` (20260803000003, backstop DB) | mismo mecanismo compartido | IGUAL (invariante de DB real) |
| concurrency | sin locks propios; unicidad por índice; oversell bloqueado por constraints (con error poco claro) | FOR UPDATE explícito + validación temprana | **V2** |
| duplicate protection | índice único (DB) | índice único (DB) | IGUAL |
| rollback/reversal | par reverse Nivel 1/2 (void_transaction / reverse_transaction_v2) endurecidos B-8 | mismo par (independiente del flag) | IGUAL |
| audit trail | audit_logs CREATE_SALE | audit_logs + payment_transactions ledger | **V2** |
| error handling | errores genéricos; UI de catálogo documenta hack de stock (mensaje "fix-insufficient-stock.sql") | contrato de errores tipado en `/api/pos/checkout` (ERR_* → HTTP 4xx) | **V2** |
| closed-document protection | `trg_validate_tx_transition` (DB) | ídem | IGUAL |
| payment consistency | **sin cuadre** (cash/transfer/zelle libres) | **ERR_PAYMENT_MISMATCH + INSERT payment_transactions** (pr4_4e:250; pr4_4i:304+) | **V2** |
| multi-store protection | has_store_access_as + RLS | ídem | IGUAL |
| tests | aserciones de texto (iteration-*) | contract tests de seguridad + integración + sync offline | **V2** |
| API usage | RPC directo del navegador (sin CSRF/rate-limit del API) | `/api/pos/checkout`: withAuth+CSRF+rateLimit 30/min+Zod | **V2** |
| comportamiento ante retries | idempotency_key generada 1 vez por intento (usePOSCheckout:170-222) | ídem + errores tipados 409/422 | V2 (ligero) |
| estados inválidos | validate_operation_date (forward-only) | ídem + ventana 2 meses/futuro+1d (PR-4.4E) | V2 (ligero) |

**RESULTADO CHECKOUT**: V2 ≥ V1 en todo; V2 > V1 en role (supervisor), input validation, inventory (lock+validación), concurrency, audit, error handling, payment consistency, API boundary, tests. Funcionalidad V1 (venta POS con variants/conversion_factor, multi-pago, backdate validado) **cubierto por V2** (mismas features + extras PR-4.4E/I: servicios sin stock, ledger de pagos, cliente persistido atómicamente — v1 requiere UPDATE post-venta, usePOSCheckout:258).

Único caller V1 vivo: `SalesCatalogView` — funcionalmente equivalente al POS principal (venta desde catálogo), migrable a `/api/pos/checkout`.
