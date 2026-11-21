# CP-LOG-RECEPTIONS-SERVICES-POS-UNIFICATION-001 — Expediente

**Fecha:** 2026-11-21 · **Rama:** `feat/cp-log-unification-receptions-services-pos-20261121` · **Base:** main = 38be9328f (PR #1679 fusionado)

## 1. Misión

Unificación funcional y visual de **Recepciones**, **Servicios Recibidos** y **POS (Vender)**: ① carga real de productos en Recepciones y POS (ambas fallaban); ② componente compartido de liquidación Recepciones↔Servicios Recibidos (paridad ADN-008); ③ coherencia visual entre ambos módulos; ④ número de transferencia por pago en POS; ⑤ Nota general de la venta en POS. Integridad financiera: sin duplicidades, trazabilidad completa a Estados Financieros.

## 2. Diagnóstico inicial (FASE 1 — read-only + navegador real)

### 2.1 Causa raíz del fallo de carga de productos (verificada LIVE)

- Las RPC `get_products_for_pos` y `get_products_for_reception` leían **SOLO** la tabla local `products`.
- Tiendas **CONECTADAS al Catálogo Maestro** (`catalog_store_links.status='connected'`) **sin filas locales** (FERROCARRIL, SHADDAI: 0 products locales, 260 maestros activos del tenant) veían **0 productos** en Vender y Recepción Express.
- La unión maestra existía SOLO en `get_paginated_products_v2` (CATALOG-MASTER-002, migración 20261101130000) — nunca llegó a las RPC de POS/Recepciones.
- Evidencia reproducible: `scripts/test-rpc-as-user.mjs` + `scripts/repro-product-loading-pos-express.mjs` (FASE 1: FERROCARRIL/SHADDAI = 0 filas; post-fix en producción: 259 filas).

### 2.2 Recepciones — estado previo

- Liquidación SOLO post-documento (`ReceptionDetailsModal` → `POST /api/payments` `ref_type='receipt'` → loop **NO transaccional** `register_supplier_payment` con `idempotency_key` aleatoria por envío — un reintento duplicaba el pago). No existía «liquidar al confirmar».
- Proveedor/factura texto libre (sin selector); sin manejo visible de error RPC.

### 2.3 POS — estado previo

- Referencia de transferencia: **no existía en ningún nivel** (UI, payload, schema, RPC, INSERT). `payment_transactions.reference` ya existía en BD.
- Nota general de venta: backend completo (`sale_notes → p_notes → transactions.notes`); faltaba solo la UI del flujo Vender.
- `payment_components: [{method,currency,amount}]` → una fila de `payment_transactions` por componente.

### 2.4 Servicios Recibidos (referencia de la misión)

- `PaymentRowsEditor` (src/components/payments/) ya era el editor unificado CP-FIN-003 (medio × moneda × importe × tasa × referencia).
- RPC `register_supplier_payment_batch`: genérica, atómica, `FOR UPDATE`, replay fast-path, overpay fail-closed; **rama `receipt` ya existía** (receipts.total_cost, CUP, tasa 1).
- `/api/payments`: solo `ref_type='service'` iba por el batch; `receipt` por el loop no transaccional (deuda técnica documentada en ADN-008).

## 3. Componentes compartidos (nuevos/reutilizados) — «una sola implementación»

| Componente / mecanismo | Alcance compartido |
|---|---|
| `PaymentRowsEditor` (src/components/payments/) | Editor de lote de pagos (medio×moneda×importe×tasa×referencia) usado por Servicios Recibidos **y ahora** por Recepciones (manual y Express) en «Liquidar al confirmar» |
| `payRowsFingerprint` + `newPaymentRow` + `rowsCupTotal` + `rowsToPayload` + `rowsAreValid` (helpers extraídas al componente compartido) | Idempotencia estable por fingerprint del lote — Servicios Recibidos refactorizado para usar la MISMA implementación |
| `useReceptionCatalogSearch` → RPC `get_products_for_reception` | UNA búsqueda de productos para TODO el flujo de recepción (Express + modal manual); `get_paginated_products` queda intacta para sus 9 consumidores |
| RPC `register_supplier_payment_batch` (rama `receipt`) | Motor atómico de liquidación para receipt y service vía `/api/payments` |
| `/api/payments` | `ref_type='receipt'` migrado del loop no transaccional al batch (deuda técnica ADN-008 cerrada); loop histórico queda solo para `production_order`/`work` |
| Estados y trigger `trg_update_payment_status` | `payment_status` unpaid/partial/paid recalculado por el MISMO trigger para receipts y services |

## 4. Cambios por módulo

### 4.1 Migraciones (aplicadas a BD aislada CostproE2E y a producción — ver §7)

- **20261121200000** (renombrada desde 20261121130000; ver nota de orden más abajo) — unión maestra: `get_products_for_reception` y `get_products_for_pos` devuelven filas locales ∪ maestros activos del tenant sin fila local (`source='master'`, operativos en cero, stock 0, sin datos comerciales — el maestro solo porta identidad). `register_supplier_payment(_batch)`: estado de la receipt en el lock `FOR UPDATE` + gate `ERR_RECEIPT_NOT_PAYABLE` (voided/reversed no admiten pagos nuevos). Semántica ADN-009 conservada íntegra.
- **20261121200100** (renombrada desde 20261121130100) — `create_sale_v2`: `payment_components` acepta `reference` por componente (número de transferencia) y la persiste en `payment_transactions.reference` por PAGO; regla de duplicados agrupa por **(método, moneda, referencia)** — dos transferencias del mismo medio/moneda con referencias distintas son dos pagos legítimos; el duplicado real sigue rechazado.

### 4.2 Recepciones

- Modal manual → `useReceptionCatalogSearch` (misma RPC que Express).
- «Liquidar al confirmar» en manual y Express: checkbox + `PaymentRowsEditor` con prefill Efectivo + total exacto; parciales y combinados con `maxCupTotal = total`.
- El pago se registra SOLO tras el éxito de `register_reception` (canal atómico `/api/payments` → batch): si el pago falla, la recepción queda registrada con su obligación y se liquida desde el detalle — sin estados inconsistentes ni duplicidades (§3.1 de la misión).
- Activación de maestros solo-maestro al AGREGAR por el mismo camino del importador Excel (`resolve_reception_import_rows`, fila única); badge «Catálogo» + estado de activación; cantidad mínima de activación = 1 (`ERR_INVALID_QUANTITY`).
- `PaymentsTab` de recepciones: clave de idempotencia ESTABLE (antes `crypto.randomUUID()` por envío → reintento duplicaba el pago).

### 4.3 POS

- `PaymentRow.reference` en el carrito; input visible SOLO en filas transfer/Transf. Exterior; obligatorio al confirmar (validado en panel y en `usePOSCheckout`).
- `buildPaymentComponents`: filas de transferencia con referencia NUNCA se agregan — cada pago viaja como componente propio con SU referencia; `requiresPaymentComponents` extendida (transferencia con referencia → SIEMPRE por componentes, el pool legacy perdería la referencia).
- Textarea «Nota» en el modal de confirmación (multilínea, opcional, ≤1000) → `sale_notes` → `transactions.notes`.
- checkoutSchema: `reference` opcional (≤400) por componente.

### 4.4 Coherencia visual Recepciones ↔ Servicios Recibidos

- Mismo editor de pagos (`PaymentRowsEditor`), mismos estados de documento (draft→active→voided + `payment_status`), mismos indicadores de saldo, mismas validaciones de lote (mensaje de error compartido), patrón de confirmación idéntico («Liquidar al confirmar»). Se preservan las particularidades documentales/inventario/contables de cada módulo.

## 5. Pruebas y resultados

- **TypeScript:** 0 errores (`tsc --noEmit`).
- **ESLint:** 0 errores (15 warnings preexistentes de patrón UI).
- **Suite unitaria completa:** **6415 PASS / 0 FAIL** / 95 skipped (vitest). Incluye 51 tests nuevos/actualizados de la misión (contrato de migraciones, payment-components con referencias, ruta `/api/payments` receipt→batch + gate, panel POS referencia/nota, idempotencia estable).
- **Bug de tests descubierto y corregido en el camino:** los mocks legacy de `useAuthStore` devolvían un objeto nuevo por llamada → el `useEffect [refetch]` de `useStoreRates` (nuevo con la liquidación) entraba en bucle infinito → OOM del worker (137). Fix: mock selector-based estable + `QueryClientProvider` real. Solo entorno de test; en la app el store zustand es estable.
- **E2E de creación (BD aislada CostproE2E, cadenas reales sin mocks):** `e2e/creation/cp-log-unification-receptions-pos.spec.ts` — **10/10 PASSED**: A1/A2 unión maestra sin mezcla de inventarios; B1 activación de maestro + recepción real; B2 la fila local ocupa el lugar del maestro; C1 liquidación exacta → paid + saldo 0; C2 parcial por transferencia con referencia → partial + saldo correcto → completar → paid; C3 overpay → 400 ERR_BATCH_OVERPAY; C4 recepción anulada → 409 ERR_RECEIPT_NOT_PAYABLE; D1 venta con referencia + nota → `payment_transactions.reference` persistida + `transactions.notes`; D2 dos transferencias con referencias distintas → DOS filas con SUS referencias.
- **Data hygiene:** `data-hygiene-guard` **PASS — net delta = 0** (tras corregir el orden de limpieza del spec: `catalog_store_links` ANTES del hard-delete; la RPC de borrado no cubre esa tabla y el FK la bloqueaba con 409 — lección registrada con logs visibles en `hard-cleanup.ts`).
- **Verificación UI read-only (navegador real, producción):** `scripts/verificacion-ui-cp-log-unif-001.mjs` — **9/9 OK** + 4 capturas (`download/cp-log-unif-001/evidencia-ui/`).
- **Gates de CI:** TypeCheck/Lint/Unit/Build/E2E Aislado corren en el PR; el build local compila (✓ Compiled successfully ×3) y muere en el hook post-compilación por memoria del sandbox (4 GB) — limitación de entorno, no de código (ver §8).

### 4.5 Orden de replay (lección del CI Capa C, PR #1683)

La primera versión de las migraciones (13:00/13:01) quedaba ANTES de ADN-009 (20261121190000) en el orden lexicográfico: un replay fresco terminaba con el cuerpo de ADN-009 de `register_supplier_payment` SIN el gate `ERR_RECEIPT_NOT_PAYABLE`, divergiendo del LIVE. Renombradas a **20261121200000/20261121200100** para ser la ÚLTIMA definición de las funciones que reemiten (contenido idéntico). Re-aplicadas en producción bajo sus nombres canónicos (ledger con ambos registros históricos).

**Hallazgo heredado (no de esta misión):** `fin_generation_build/5` presenta divergencia producción↔replay — aplicada a producción con SHA `e1469184…` (2026-11-19) y el archivo editado después en main (múltiples commits CP-FIN-003). El surface re-certificado de esta misión restaura el bloque de main para no bloquear el PR; la divergencia queda documentada para decisión del propietario (re-aplicar el archivo actual a producción o congelar el archivo).

## 6. Aplicación en producción (una sola vez)

- `scripts/cp-log-unif-001-apply-prod.mjs` (runbook m055 / m-log-reception-apply): guard CP-INFRA-019 + doble flag, SHA-256 working-tree == blob del commit aprobado, pre-chequeo (libro, schema_migrations, prerrequisitos ADN-009), un único POST por migración, NOTIFY pgrst, registro en `production_migration_ledger`.
- **2026-11-21:** 20261121200000 + 20261121200100 (y su primera aplicación como 20261121130000/20261121130100) **aplicadas y verificadas** — post-marcas 5/5 = 1 (`docs/audits/CP-LOG-UNIFICATION-001/aplicacion-prod/`).
- **Verificación LIVE del fix (read-only, post-aplicación):** `scripts/test-rpc-as-user.mjs` — FERROCARRIL y SHADDAI pasan de **0 → 259 filas** en `get_products_for_pos` y `get_products_for_reception` (antes veían 0). ENERVIDA/PUERTO PADRE sin regresión (259/259). Los maestros sin fila local son vista del catálogo organizacional, NO vendibles en POS (guard + badge; el filtro por defecto de POS los oculta por diseño).
- Compatibilidad retroactiva: firmas intactas, columnas aditivas, `reference` opcional — los payloads históricos siguen válidos; el gate `ERR_RECEIPT_NOT_PAYABLE` solo cierra pagos sobre receipts voided/reversed (fail-closed protectorio).

## 7. Evidencias

- `docs/audits/CP-LOG-UNIFICATION-001/aplicacion-prod/` — respuestas del POST, registro del libro, post-estado de marcas.
- `download/cp-log-unif-001/evidencia-ui/` — 4 capturas + `resultados.json` (9/9).
- `test-results/report-unif4.json` — E2E 10/10 con net-zero.
- `scripts/cp-log-unif-001-cleanup.mjs` — limpiador re-ejecutable del run (guard aislado, idempotente).

## 8. Limitaciones y notas

1. **Build local:** compila (✓ ×3) y muere en `runAfterProductionCompile` por memoria del sandbox (4 GB, sin swap) — el gate Build oficial corre en CI del PR.
2. **Maestros en POS sin stock:** por diseño (sin datos comerciales en el maestro), la fila solo-maestro no es vendible; aparece como vistazo del catálogo y para recepción (donde el costo real se registra al recibir).
3. **La sonda `get_paginated_products_v2` del script de diagnóstico** reporta 404 por firma de parámetros del propio script (no afecta producto; RPC usada por el Catálogo con sus parámetros reales).
4. **Loop no transaccional** de `/api/payments` queda SOLO para `production_order`/`work` (fuera de alcance de esta misión).
5. El selector de variantes del modal manual de recepción sigue sin datos (preexistente, RPC no devuelve variantes) — fuera de alcance; documentado en FASE 1.
