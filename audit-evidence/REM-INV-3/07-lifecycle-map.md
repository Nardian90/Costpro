# REM-INV-3 — FASE 4/6 — Reconstrucción de lifecycle y reconciliación documento→inventario

## 1. Estado del arte de la evidencia

La re-censura SELECT-only contra producción NO es ejecutable en esta sesión
(reset del workspace destruyó `Costpro/.env`; ver 00-baseline.txt). Este documento
reconstruye el lifecycle con la evidencia LIVE ya capturada y commiteada por los
gates previos (REM-INV-1 2026-09-12; w9-b10b-obs1 2026-09-05/06) más el código
canónico del árbol 29f9ef2e. Todo dato marcado REENUMERAR_EN_ACCESO requiere
re-verificación puntual cuando el operador re-suplante las credenciales.

## 2. Qué versión de la función creó los documentos (probado, no especulado)

Los 13 documentos de TIENDA CENTRAL COSTPRO (store d1c4ba0e-…) tienen
`audit_creation = DEVOLUTION_CREATED_V2` (captura LIVE obs1/03, 2026-09-05) y
numeración `NC-00000N-2026`, que SOLO produce
`next_document_number(store_id,'credit_note')` (mig v2_19_1/v2_19_4, commiteadas
2026-08-04T08:29Z). El v1 produce numeración `DEV-YYYY-NNNNNN` (epoch % 1000000).
CONCLUSIÓN: 12/13 creados por `create_devolution_v2` en su versión v2_19_4
(DEV-2026-828651, del 2026-08-04T07:30Z, es anterior al reemplazo v2_19_4
(08:29Z) y salió de la versión v2_17_2 con numeración DEV-).

Corrección material a la hipótesis de REM-INV-1 (root cause = overload v1): la
evidencia de audit + numeración demuestra que el creador fue el camino V2 de la
era, no el v1. El v1 sigue siendo un riesgo potencial de reintroducción del
patrón (ver 08-code-reachability.md §4), pero NO es el autor de estos documentos.

## 3. Lifecycle real de una NC bajo la versión creadora (v2_19_4, 2026-08-06)

```
UI (módulo DORMANT: sin entrada de navegación) / llamada directa RPC
  → POST /api/devolutions  (service role, flag USE_V2_REVERSE=true → create_devolution_v2)
  → create_devolution_v2 (SECURITY DEFINER, UNA transacción):
      next_document_number('credit_note')            → NC-00000N-YYYY
      INSERT devolutions (status='completed' fijo)
      INSERT devolution_items
      PERFORM register_stock_movement('return', +q)  → stock_movements
                                                     → inventory (trigger fn_sync_inventory_on_movement)
                                                     → products.stock_current (trigger sync_product_stock)
      INSERT kardex_entries('devolution_in')         (v2_19_4 lo hacía inline; el LIVE lo hace el trigger)
      UPDATE devolutions.total_amount
      INSERT audit_logs('DEVOLUTION_CREATED_V2')
  ── NO existía aún el contra-asiento financiero DF-03 (cash/payment_transactions/
     store_credit) — llegó con la consolidación W7 (2026-08-30) y se audita en w9 ──
```

## 4. Qué pasó después (cadena causa→estado actual, demostrada por obs1)

1. 2026-08-06 03:30→2026-08-07 00:58: hot-tests crean NC-000001..000012 sobre el
   producto da1c4090 (CAT-0002, precio 350) para demostrar bugs de la versión:
   sin venta original, cantidades libres (NC-000008 = 999 u), reversiones.
2. 2026-08-06 23:33:41Z: commit 7dfe8ce2 "fix(security): 5 bugs críticos en RPCs
   multi-tienda (v2.21.4-production)" — Bug #5 = create_devolution_v2 aceptaba
   qty > vendida (999 u); Bug #3 = original_transaction_id no exigido. La
   ventana test→fix es de 4 minutos: los documentos son la REPRODUCCIÓN del bug
   hecha por el propio hot-test antes del fix.
3. Entre 2026-08-07 y 2026-09-05: un `reset_store_data(store d1c4ba0e)`
   (versión jul-25, que NO borra devolutions ni audit_logs por diseño —
   "audit_logs y stores NUNCA se tocan") purgó el ledger de la tienda
   (stock_movements, inventory, products/stock, kardex de la era). Los
   documentos y su audit sobrevivieron. obs1 §16 documenta el evento externo y
   sus consecuencias (drift eliminado por purga; resets sin audit).
4. Estado actual (REM-INV-1, 2026-09-12): 13 documentos `completed`/`reversed`
   SIN movimientos/kardex/pagos asociados; inventario global CONSISTENTE
   (r01 PASS; products.stock_current == inventory).

## 5. Reconciliación documento → inventario (matriz EXPECTED/ACTUAL/DELTA)

Bajo el modelo creador (v2_19_4), una NC completada DEBÍA producir 1 movimiento
'return' +1 por ítem (+ kardex + products). Bajo el modelo VIVO (12-sep), la
creación produce lo mismo vía pipeline canónico Y el contra-asiento DF-03.

| Documento | EXPECTED_MOVEMENT (era creación) | ACTUAL_MOVEMENT (12-sep) | DELTA | Clasificación del delta |
|---|---|---|---|---|
| NC-000008-2026 | 1 × 'return' +999 | 0 | −999 (falta) | efectos purgados por reset — no fabricar |
| NC-000007-2026 | 'return' +1 y 'devolution_reverse' −1 (legacy: solo products) | 0 | −/+1 | purga por reset; drift Caso A ya eliminado |
| NC-000001..000006, 000009..000012, DEV-828651 | 1 × 'return' +1 c/u | 0 | −1 c/u | purga por reset |

NOTA DE INTEGRIDAD: el "DELTA" NO se debe "corregir" creando movimientos
retroactivos: la purga fue un evento real y documentado; reconstruir huellas
fabricaría historial contable (misma doctrina que obs1: NO_DATA_REPAIR).

## 6. F-02 pregunta central de inventario

¿Hay hoy inventario fantasma por las 13 NC? NO según la evidencia disponible:
la creación sumó stock transitoriamente (products de la era), el reverse legacy
lo restó para NC-000007, y la purga por reset dejó el inventario en estado
reconstruido y consistente. REM-INV-1 r01 (global inv==mov) y obs1 A1..A8
(products==inventory 141/141, ledger==inventory) pasan en capturas LIVE
posteriores a los hechos. Re-verificación puntual: REENUMERAR_EN_ACCESO.

## 7. FASE 8 — Reconciliación documento → documento origen

| Verificación | NC-000008-2026 | NC-000007-2026 | Resto (11) |
|---|---|---|---|
| source exists | NO (original_transaction_id=NULL) | SÍ edb274bd… (era de la tienda) | mayormente SÍ (obs1/03; re-verificar) |
| same store | N/A (NULL) | SÍ | SÍ (obs1/03 store_id homogéneo) |
| qty <= source qty | N/A — patrón del Bug #5 (999 > 1) | 1 <= venta | 1 <= venta |
| source status permite reversión | N/A | SÍ (completada) | SÍ |
| duplicada sobre el mismo doc | NO (1 doc por patrón) | NO | NO evidenciado |
| creada sobre doc ya revertido | NO | NO | NO evidenciado |

Hallazgo F-02-scope: la creación SIN documento origen era legal en la versión
desplegada (v2_19_4: el cross-store check solo aplicaba `IF
p_original_transaction_id IS NOT NULL`). La exigencia total (ERR_
DEVOLUTION_NO_ORIGINAL) llegó con la consolidación W7/DF-07 y hoy es
irreproducible (staging 09/10).

## 8. FASE 11 — Código canónico VIVO (mapa completo, árbol 29f9ef2e)

```
UI  → DevolutionsView (módulo DORMANT: sin item de navegación en TerminalShell;
       ViewType 'devolutions' solo se referencia en la unión de tipos y el case)
    → useReverseDocument (reversión) / useDuplicateDocumentV2 (duplicado → /api/devolutions)
API → POST /api/devolutions  → FEATURES.USE_V2_REVERSE
        ├─ true  → rpc create_devolution_v2   (service_role; p_user_id = session.user.id)
        └─ false → rpc create_devolution (v1)  ← fallback fail-closed, MUERTO en prod config
    → POST /api/reverse → RPC_MAP_V2.devolution = reverse_devolution (B-10b)
DB  → create_devolution_v2 (LIVE 12-sep, SECURITY DEFINER, 1 transacción):
        idempotency_key (índice único parcial) → has_store_access_as
        → ERR_DEVOLUTION_NO_ORIGINAL si original NULL (DF-07)
        → SELECT … FOR UPDATE de la venta (lock) + ERR_CROSS_STORE
        → tope acumulado (ERR_DEVOLUTION_CAP_EXCEEDED) + ERR_INVALID_QUANTITY
        → whitelist de métodos (ERR_DEVOLUTION_INVALID_METHOD)
        → next_document_number('credit_note') = NC-NNNNNN-YYYY (secuencia por tienda/año)
        → INSERT devolutions('completed') + items
        → register_stock_movement('return', cost=cost_at_sale‖cost_average)
        → triggers: fn_sync_inventory_on_movement → inventory (ERR_INSUFFICIENT_STOCK)
                    auto_kardex_on_stock_movement → kardex 'devolution_in'
                    sync_product_stock → products.stock_current
        → total > 0 (ERR_DEVOLUTION_AMOUNT_POSITIVE)
        → DF-03: cash/transfer/zelle → cash_movements 'out' + payment_transactions
                 (refund, idempotency 'dev-{id}-refund', find-or-create sesión de caja)
                 | store_credit → store_credit_ledger (requiere customer)
        → audit_logs 'DEVOLUTION_CREATED_V2' (metadata DF-07/DF-03)
    → reverse_devolution (B-10b, OID 136657 preservado): FOR UPDATE + ERR_ALREADY_REVERSED
        + guard solo 'completed' + has_store_access_as + can_reverse_document('devolution')
        → mutación EXCLUSIVA vía register_stock_movement('devolution_reverse', −q)
        → fn_recalc_wac (evento neutro: WAC invariante) + audit 'REVERSE_DEVOLUTION'
ACL → create_devolution_v2: service_role ONLY (w9-F06-C2 20260902200923:
        REVOKE authenticated/anon/PUBLIC) · reverse_devolution: autenticados con
        membresía activa · create_devolution v1: grant authenticated+service_role
        vigente según migraciones (v2_12_13) — estado live exacto: REENUMERAR_EN_ACCESO
```

Múltiples caminos de creación: SÍ — 2 RPC (v1 residual + v2 canónico) y 1 ruta de
duplicado (useDuplicateDocumentV2 → /api/devolutions → v2). El camino activo en
producción (flag true) es UNO: create_devolution_v2.
