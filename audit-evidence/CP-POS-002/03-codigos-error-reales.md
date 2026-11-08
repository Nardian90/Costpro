# CP-POS-002 — Catálogo de códigos de error REALES (D3)

Fuente: migraciones vigentes del repo (grep completo, 2026-11-08). Ningún código inventado; los que aparecen en la tabla clasificadora (`src/lib/sync/error-classification.ts`) provienen de esta lista.

## create_sale_v2 — vigente: `20261105140000_cp_clasificador_fase4_snapshots.sql` (35 params)

| Código | Línea | Categoría canónica | Estado | Reintento |
|---|---|---|---|---|
| ERR_UNAUTHORIZED | :167 | negocio (C) | conflict | No |
| ERR_SELLER_REQUIRED | :174 | negocio (C) | conflict | No |
| ERR_SELLER_MISMATCH | :177 | negocio (C) | conflict | No |
| ERR_IDEMPOTENCY_KEY_REUSE | :252,:270,:279 | **integridad (B)** | conflict | No |
| ERR_DISCOUNT_REASON_INVALID | :300 | negocio (C) | conflict | No |
| ERR_STORE_MISMATCH | :347,:990 | negocio (C) | conflict | No |
| ERR_PRODUCT_NOT_FOUND | :349,:992 | negocio (C) | conflict | No |
| ERR_PRODUCT_COST_UNAVAILABLE | :355 | negocio (C) | conflict | No |
| ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED | :360 | negocio (C) | conflict | No |
| ERR_INSUFFICIENT_STOCK | :367 | negocio (C) | conflict | No |
| ERR_INVALID_PRICE | :387 | negocio (C) | conflict | No |
| ERR_INVALID_DISCOUNT | :435 | negocio (C) | conflict | No |
| ERR_APPLIED_TAX_INVALID | :454-:470 | negocio (C) | conflict | No |
| ERR_EXCHANGE_RATE_UNAVAILABLE | :517,:735,:877 | negocio (C) | conflict | No |
| ERR_RATE_STALE | :520,:738 | negocio (C) | conflict | No |
| ERR_NEGATIVE_SALE | :534 | negocio (C) | conflict | No |
| ERR_RATE_REQUIRED_FOR_INCIDENT | :552 | negocio (C) | conflict | No |
| ERR_TOTAL_MISMATCH | :561 | negocio (C) | conflict | No |
| ERR_SUPERVISOR_REQUIRED | :578 | negocio (C) | conflict | No |
| ERR_DISCOUNT_REASON_REQUIRED | :581 | negocio (C) | conflict | No |
| ERR_SUPERVISOR_UNAUTHORIZED | :585-:588 | negocio (C) | conflict | No |
| ERR_SUPERVISOR_TOKEN_REQUIRED | :594 | negocio (C) | conflict | No |
| ERR_SUPERVISOR_TOKEN_REUSED | :602 | negocio (C) | conflict | No |
| ERR_SUPERVISOR_SCOPE_VIOLATION | :607-:626 | negocio (C) | conflict | No |
| ERR_PAYMENT_COMPONENTS_INVALID | :654-:707 | negocio (C) | conflict | No |
| ERR_PAYMENT_MISMATCH | :759 | negocio (C) | conflict | No |
| ERR_CASH_SETTLEMENT_INVALID | :844-:847 | negocio (C) | conflict | No |
| ERR_CASH_SETTLEMENT_NOT_APPLICABLE | :852 | negocio (C) | conflict | No |
| ERR_CASH_SETTLEMENT_MISMATCH | :883 | negocio (C) | conflict | No |
| ERR_OVERPAYMENT_UNREGISTERED_CHANGE | :901 | negocio (C) | conflict | No |
| ERR_ZELLE_REQUIRES_RATE (PT009) | :1062,:1107 | negocio (C) | conflict | No |
| ERR_INVALID_CURRENCY (PT004) | :1066,:1111 | negocio (C) | conflict | No |
| ERR_PAYMENT_INVARIANT_VIOLATED (PT011) | :1132 | negocio (C) | conflict | No |

## register_reception — vigente: `20261107120000_cp_catalogo_maestro_sync_register_reception.sql`

| Código | Línea | Categoría | Estado | Reintento |
|---|---|---|---|---|
| (sin prefijo) 'Unauthorized store access' | :96 | negocio (C) — mapeado a ERR_UNAUTHORIZED | conflict | No |
| ERR_SUPPLIER_REQUIRED | :101 | negocio (C) | conflict | No |
| ERR_EMPTY_ITEMS | :106 | negocio (C) | conflict | No |
| ERR_INVOICE_DUPLICATE | :118 | negocio (C) | conflict | No |
| ERR_INVALID_UNIT_COST | :142 | negocio (C) | conflict | No |
| ERR_AMBIGUOUS_ITEM | :152 | negocio (C) | conflict | No |
| ERR_NEW_PRODUCT_INVALID | :157-:160 | negocio (C) | conflict | No |
| ERR_SKU_DUPLICATE_PAYLOAD | :163 | negocio (C) | conflict | No |
| ERR_SKU_EXISTS | :172 | negocio (C) | conflict | No |
| ERR_STORE_NOT_FOUND | :178 | negocio (C) | conflict | No |
| ERR_INVALID_EXCHANGE_RATE | :388 | negocio (C) | conflict | No |
| ERR_PRODUCT_NOT_IN_STORE | :417 | negocio (C) | conflict | No |

## create_transfer — `20261020000001_services_item_type_model.sql`

ERR_UNAUTHORIZED (:874,:877) · ERR_ORIGIN_STORE_INACTIVE (:882) · ERR_DEST_STORE_INACTIVE (:883) · ERR_SAME_STORE (:886) · ERR_PRODUCT_NOT_FOUND (:923) · ERR_SERVICE_NOT_TRANSFERABLE (:929) · ERR_INSUFFICIENT_STOCK (:934) — todas negocio (C), conflict, sin reintento.

## perform_inventory_adjustment — `20261004120002`

ERR_UNAUTHORIZED (:34) · ERR_PRODUCT_NOT_IN_STORE (:44) — negocio (C).

## Auxiliares de la cadena

| Código | Función/Archivo | Categoría |
|---|---|---|
| ERR_BACKDATED_DOCUMENT | validate_operation_date (`20261018000000:46`) | negocio (C) |
| ERR_FUTURE_DATED_DOCUMENT | validate_operation_date (:53) | negocio (C) — equivalente RPC de ERR_FUTURE_OPERATION_DATE |
| ERR_WAC_RECALC_ARGS / ERR_PRODUCT_NOT_FOUND / ERR_WAC_REVERSE_NEGATIVE_STOCK | fn_recalc_wac (`20260916000001:1768-1793`) | negocio (C) |

## Códigos de NIVEL RUTA (TypeScript, no RPC)

| Código | Ruta | Nota |
|---|---|---|
| ERR_FUTURE_OPERATION_DATE | `/api/sync/batch` (checkNotFutureOperationDate) + rutas online (422) | El batch lo emite con `errorCode` desde antes de esta misión; ahora también clasifica |
| ERR_F21_TASA_INVALIDA | `/api/sync/batch` + recepciones online | En `results[].error` viajaba como texto `F-21: …` / «Tasa de cambio inválida»; ahora `errorCode` canónico |

## Restricciones UNIQUE con semántica conocida (23505)

| Restricción | Semántica | Categoría asignada |
|---|---|---|
| `idx_receipts_store_reference_doc` (20260807000014:10) | factura de proveedor duplicada | negocio → ERR_INVOICE_DUPLICATE |
| `products_sku_store_unique` | SKU duplicado en tienda | negocio → ERR_SKU_EXISTS |
| `transactions_idempotency_key_store_idx` (20260803000003:24-26) | llave de idempotencia repetida | **integridad (B)** — sin evidencia de correspondencia llave↔contenido NO se asume éxito |
| `uq_idempotency_key_operation` (registry) | idem | **integridad (B)** |

## Códigos HTTP de /api/sync/batch (nivel lote)

401 (sin sesión, conAuth) · 403 INVALID_ORIGIN · 403 STORE_ACCESS_DENIED (aborta lote — preexistente) · 429 RATE_LIMITED · 400 INVALID_DATA · 500 INTERNAL_ERROR · 200 `{results:[…]}` por operación. Los 403/429 del nivel lote se clasifican en el cliente por status HTTP (429→transitorio, 403→negocio/unknown según cuerpo).

## Semántica de estados del contrato (compatibilidad)

- `status: 'ok' | 'conflict' | 'error'` — SIN CAMBIOS (el frontend desplegado los consume).
- NUEVOS opcionales por operación: `category`, `conflictType`, `errorCode`, `retryable`, `message` (ES, sin internos), `idempotencyOutcome` ('executed' | 'idempotent').
- Mapeo canónico→legado: negocio/integridad → `conflict`; transitorio/auth/unknown → `error` (la distinción reintento/no-reintento la hace el motor con `retryable`/categoría).
