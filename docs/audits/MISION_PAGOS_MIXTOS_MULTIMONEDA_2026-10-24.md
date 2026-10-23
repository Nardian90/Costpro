# MISIÓN PAGOS MIXTOS MULTIMONEDA — Diagnóstico, regla formal e implementación

**Fecha:** 2026-10-24 · **Versión:** v2.25.0 · **Rama:** `feat/mision-pagos-mixtos-multimoneda-v2-25` · **Prioridad:** Alta

**Ámbito:** COSTPRO 4 Multitienda — `Inicio → OPERACIÓN → Ventas → Vender` y `Inicio → OPERACIÓN → Ventas → Reporte Entrega`.

---

## 1. Diagnóstico del comportamiento anterior y causa raíz

### 1.1 Síntoma

Una venta pagada con componentes en dos monedas (p. ej. 5 USD efectivo + 15 000 CUP, tasa 1 USD = 1 000 CUP, total 20 000 CUP) aparecía íntegramente como cobro **CUP canónico** en el Reporte Entrega: el componente de 5 USD era invisible en el reporte USD y quedaba enterrado dentro del efectivo CUP. La distribución de unidades por moneda no seguía ninguna regla de moneda predominante: se repartía por línea de forma proporcional.

### 1.2 Causas raíz (cadena completa, auditada)

| # | Causa | Archivo / función | Detalle |
|---|-------|-------------------|---------|
| RC1 | **Corrupción de los campos legacy por ítem** | `src/store/cart.ts` → `syncLegacyFields()` (L348–399 pre-fix) | Cuando un método tenía filas de pago en varias monedas, el campo legacy guardaba la **suma nominal** de importes de monedas distintas (`5 + 15000 = 15005`) con la moneda de la **última fila** (¡orden-dependiente!). Ese dato corrupto viajaba al servidor y se persistía en `transaction_items.cash_paid`/`cash_currency`. |
| RC2 | **Colapso del ledger autoritativo a CUP canónico** | `create_sale_v2` §17 (migración `20261023230000` L1883–1928) | Las filas de `payment_transactions` para cash/transfer se insertaban SIEMPRE con `currency='CUP', exchange_rate=1.0, amount=<pool canónico>`. El desglose real por moneda **se perdía en el registro transaccional autoritativo** (solo Zelle conservaba USD + tasa). |
| RC3 | **Clasificación del reporte por reconstrucción heurística** | `src/lib/cash-report/collection-currency.ts` → `reconstructTxCollections()` | El Reporte Entrega reconstruía la moneda de cobro desde `transaction_items` (datos corruptos per RC1) + pools canónicos. Para un pago mixto cash USD+CUP: la fila explícita corrupta (15 005 «CUP») + residual 4 995 → todo caía al bucket CUP. Resultado: 20 000 CUP, cero USD. |
| RC4 | **`sale_currency` no clasifica** | `usePOSCheckout.ts` L286–287 | `sale_currency='USD'` SOLO cuando hay Zelle; toda venta sin Zelle nacía `'CUP'` con `sale_exchange_rate=1.0`. No existía el concepto de moneda predominante de la operación. |
| RC5 | **Tasa de la operación no persistida en cobros mixtos** | `create_sale_v2` §10 | La tasa servidor (jerarquía tienda → BCC → elToque) solo se resolvía/persistía para ventas `sale_currency != 'CUP'` (Zelle) y para la liquidación D6. Un cobro mixto CUP+USD quedaba sin tasa persistida en el ledger. |
| RC6 | **Unidades repartidas por línea, no por venta** | `collection-currency.ts` → `attributeQuantity()` (reparto proporcional 2026-10-19) | La cantidad física de una venta con cobro mixto se repartía proporcionalmente entre ambos reportes; la misión exige clasificación **de la venta completa** por peso económico. |

### 1.3 Dónde se persistía cada dato (auditoría §5.2)

- **Importe total**: `transactions.total_amount` (CUP canónico, recálculo server-side) ✓ correcto.
- **Pools por método**: `transactions.cash_amount/transfer_amount/zelle_amount` (CUP canónico) — correcto como pool, pero **sin desglose por moneda**.
- **Moneda del cobro**: SOLO por línea (`transaction_items.cash_paid + cash_currency`, corrupto per RC1) y en el ledger (colapsado per RC2).
- **Tasa**: `transaction_items.exchange_rate` (tasa del ítem, client-sent), `transactions.sale_exchange_rate` (solo Zelle), `payment_transactions.exchange_rate` (solo Zelle/D6). **El cobro mixto no tenía tasa persistida.**
- **Construcción del reporte**: desde `transactions` + `transaction_items` (reconstrucción) + `payment_transactions` (reembolsos, ajustes, caja) — nunca desde el ledger de cobros de la venta (que estaba colapsado).

---

## 2. Regla formal de distribución por moneda (documentada y probada)

### 2.1 Definiciones

- `importe_cup` = Σ importes efectivamente cobrados en CUP (por todos los métodos).
- `importe_usd` = Σ importes efectivamente cobrados en USD.
- `tasa` = **tasa de la operación**, resuelta server-side con la jerarquía autoritaria (`store_exchange_rates` → `exchange_rates` BCC seg. 3 → elToque, fail-closed, vencimiento 45 días) y **persistida por fila** del ledger (`payment_transactions.exchange_rate`).
- `equivalente_cup_usd = importe_usd × tasa`.

### 2.2 Clasificación (moneda predominante)

```
predomina USD  ⇔  equivalente_cup_usd > importe_cup + 0,01
predomina CUP  ⇔  importe_cup > equivalente_cup_usd + 0,01
EMPATE (±0,01) ⇒  CUP  (regla determinista: CUP es la moneda de cuenta interna
                    del sistema — migración 20260702000003; documentada y probada)
```

La comparación se hace sobre importes convertidos a base común (CUP) con la **tasa persistida de la operación** — nunca sobre cifras nominales sin convertir, y nunca con la tasa global del momento de consultar (misión §6: reproducibilidad histórica).

### 2.3 Distribución en el Reporte Entrega

- **Reporte de la moneda predominante**: registra **TODAS las unidades físicas** de la venta y el importe total histórico de la venta (`total_cup` — columna de valor histórico, nunca recalculado).
- **Reporte de la moneda secundaria**: refleja **únicamente su componente monetario efectivamente cobrado**, con **cantidad cero** (sin unidades).
- **Dinero por moneda** (`sales_split`, grupos `sales` por método×moneda): cada reporte muestra SU componente real — nunca se suman CUP + USD, nunca se duplica ingreso: `importe_cup + importe_usd × tasa = total liquidado` (±0,01).

### 2.4 Empates

Determinista y auditable: la clasificación expone `tie: true` en `sales_classification` (items-summary) y las unidades van al reporte CUP. Probado con estabilidad (25 ejecuciones → mismo resultado).

### 2.5 Devoluciones, anulaciones y correcciones (escenario F — comportamiento vigente documentado)

- **Anulación** (`reverse_transaction_v2`): marca `status='reversed'`, restaura stock y NO toca las filas del ledger de la venta → la consulta del Reporte Entrega (`status='completed'`) la excluye por completo; el ledger queda intacto y trazable. La venta NO aporta unidades ni importes al reporte (probado en F1).
- **Devolución** (`create_devolution_v2` con `p_refund_currency`): registra el reembolso como filas **separadas** del ledger (`ref_type='devolution'`, `direction='refund'`) con la moneda y tasa del reembolso. La clasificación de la venta original NO se recalcula (reproducibilidad histórica — probado en F2); el reporte resta los reembolsos en efectivo por su moneda real (`efectivoEsperado`).
- **Corrección de pago** (`adjust_sale_payment`): ajusta el pool de la venta ya emitida.
- **Decisión de negocio pendiente** (misión §3.F exige documentar antes de cambiar): la devolución hoy NO revierte **proporcionalmente** los componentes por moneda de la venta original — reembolsa en la moneda elegida al devolver. Implementar reversión proporcional automática (p. ej. devolver 5 USD + 15 000 CUP cuando la venta se cobró así) requiere aprobación del negocio; NO se modificó el modelo vigente.

---

## 3. Archivos, funciones, tablas y RPC afectados

### 3.1 Migración SQL (nueva)

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20261024150000_mision_pagos_mixtos_multimoneda_v2_25_0.sql` | `create_sale_v2` v2.25.0: nuevo parámetro `p_payment_components jsonb DEFAULT NULL` `[{method, currency, amount}]`; §13.7 validación estructural + resolución de tasa USD de la operación (jerarquía §6.1, fail-closed, staleness 45 días) + **derivación server-side de los pools**; §14 los pools derivados son autoridad; §17 **una fila de `payment_transactions` por componente** (moneda real + `exchange_rate` = tasa de la operación); `param_hash` incluye componentes; audit log ampliado (`payment_components`, `usd_operation_rate`, fuente); ACL con la firma nueva. **Sin componentes: flujo byte-idéntico al previo** (compatibilidad total con `/api/sync/batch` y clientes legados). |

**Tablas**: NO se crean ni eliminan tablas; NO se modifican datos existentes. `payment_transactions` se usa con su esquema vigente (`amount`, `currency`, `exchange_rate`, `amount_cup` GENERATED — ya soportaba filas multimoneda desde 20260712000001; el flujo anterior simplemente no las creaba para cash/transfer).

### 3.2 Cliente (Vender)

| Archivo | Cambio |
|---------|--------|
| `src/lib/pos/payment-components.ts` | **NUEVO** — `buildPaymentComponents()` (desglose real por moneda desde las filas `payments[]`, importes ORIGINALES, fusión/redondeo/orden determinista) y `requiresPaymentComponents()` (regla de envío: solo cuando hay componente USD de cash/transfer). |
| `src/store/cart.ts` | `syncLegacyFields(item, rates?)` — multi-moneda por método ⇒ suma **canónica CUP** + moneda `'CUP'` (antes: suma nominal + moneda de la última fila — RC1). Moneda única por método: comportamiento previo. 12 call sites actualizados pasando `state.globalRates`. |
| `src/components/views/terminal/views/pos/usePOSCheckout.ts` | Construye `paymentComponents` y los envía como `payment_components` en el POST `/api/pos/checkout` (solo cuando `requiresPaymentComponents`). |
| `src/validation/schemas.ts` | `createSaleParamsSchema` + `p_payment_components` (queue offline). |

### 3.3 API

| Archivo | Cambio |
|---------|--------|
| `src/app/api/pos/checkout/route.ts` | Zod `payment_components` (método/moneda/importe positivos, máx 20) → `p_payment_components` al RPC; mapa `ERR_PAYMENT_COMPONENTS_INVALID` → 422. |
| `src/app/api/sync/batch/route.ts` | Passthrough `p_payment_components` en el replay offline. |
| `src/app/api/cash-report/route.ts` | Fetch de `payment_transactions` (ref_type='sale') por venta (chunks 150) → `reconstructTxCollections(tx, items, payments)`; ventas sin ítems con ledger también se reconstruyen. |
| `src/app/api/cash-report/items-summary/route.ts` | Igual + expone `sales_classification` (clasificación por venta: predominante, componentes, tasa, empate, fuente). |
| `src/app/api/cash-report/payment-totals/route.ts` | Igual — el split por moneda real ahora también lee el ledger. |

### 3.4 Lib del Reporte Entrega

| Archivo | Cambio |
|---------|--------|
| `src/lib/cash-report/collection-currency.ts` | + `LedgerPayment`, `ledgerIsAuthoritative()` (marcadores: fila cash/transfer USD — imposible en el flujo previo — o venta zelle pura); `reconstructTxCollections(tx, items, payments?)` — camino **ledger-directo** (buckets con moneda real y `amountCup` a la tasa persistida; reparto por ítem proporcional al valor de línea) con fallback íntegro a la heurística previa para ventas históricas; **`resolvePredominantCurrency()`** (regla §2.2); `buildItemsSummary()` — unidades por **moneda predominante de la VENTA** (reemplaza el reparto por línea de la auditoría 2026-10-19), incidencia a nivel venta + ítem, y `sales_classification` para evidencia. `source: 'ledger' | 'reconstruction'` en el resultado. |
| `src/lib/cash-report/fetch-sale-payments.ts` | **NUEVO** — consulta chunked de las filas del ledger por venta (degradación limpia). |

### 3.5 Consumidores que heredan sin cambios

`computeDailySummary`/`efectivoEsperado` (summary.ts — la fórmula única consume `sales_split`/grupos ya corregidos), vista `CashReportView.tsx`, PDF (`cash-report-pdf.ts` — hoja CUP usa `qty_cup`, hoja USD `qty_usd`), Excel, `get_cash_report` (RPC legacy — sus grupos se sobreescriben con la reconstrucción), `get_cash_currency_summary` (libro físico por moneda — D6 + carve legacy, coherente con el ledger nuevo: las filas USD de cash ahora también alimentan la trazabilidad).

### 3.6 Pruebas (nuevas)

| Archivo | Cobertura |
|---------|-----------|
| `src/__tests__/lib/cash-report-mixed-payments-predominant.test.ts` | **Escenarios A–F de la misión** + multi-producto/multi-componente + tasas históricas por operación + redondeo/precisión + pago parcial con incidencia + convivencia ledger/heurística + aislamiento por tienda + invariantes globales (21 tests). |
| `src/__tests__/lib/pos-payment-components.test.ts` | Builder de componentes: escenario A, fusión, multi-ítem/método, fallback legado, filas en cero, redondeo/orden, regla de envío (10 tests). |
| `src/__tests__/store/cart-mixed-payment-legacy-fields.test.ts` | `syncLegacyFields` multi-moneda: canónico 20 000 CUP (antes 15 005), independencia del orden, moneda única intacta, multi-método (5 tests). |

**Suite completa: 3 671 tests ✓ (239 archivos) — 0 fallos.** Las 34 pruebas preexistentes del módulo (`cash-report-collection-currency`, `cash-report-qty-per-currency`) pasan SIN cambios: la regla de predominante coincide con la atribución anterior en todas las ventas cobradas en una sola moneda (los fixtures reales del 16/10).

---

## 4. Tabla de resultados esperados vs obtenidos (escenarios A–F)

Producto X: 10 USD/u × 2 u = 20 USD = 20 000 CUP; tasa 1 USD = 1 000 CUP persistida.

| Escenario | Pago | Esperado (misión) | Obtenido (tests ✓) |
|-----------|------|-------------------|--------------------|
| **A** — CUP predominante | 5 USD + 15 000 CUP | CUP: 2 u + venta clasificada CUP · USD: 5 USD, 0 u | ✓ `qty_cup=2, qty_usd=0`; `cash_cup=15000`, `cash_usd=5`; `usdCollectedCup=5000`; clasificación CUP; sin duplicación (2 u, 20 000 CUP) |
| **B** — 8 USD + 12 000 CUP | 8 000 CUP equiv < 12 000 CUP → CUP | CUP: 2 u + total · USD: 8 USD, 0 u | ✓ clasificación CUP (12 000 > 8 000 — no se fuerza); `qty_cup=2`; `cash_usd=8` visible |
| **C** — USD predominante | 8 USD + 2 000 CUP (literal misión: cubre 10 000 de 20 000) | USD: unidades · CUP: componente 2 000, 0 u | ✓ C1: clasificación USD (8 000 > 2 000) con **incidencia de pago documentada** (faltante 10 000, MISIÓN-FLEX); C2 (18 USD + 2 000 = pago completo): USD, `qty_usd=2`, `cash_cup=2000`, sin incidencia. **NOTA:** los importes literales del enunciado suman 10 000 CUP ≠ total 20 000 — se documenta y cubre ambas variantes sin forzar la moneda. |
| **D** — 100 % una moneda | 20 USD / 20 000 CUP | Sin componente secundario ficticio | ✓ D1 USD puro: `usd_total=20`, `cash_cup=0`; D2 CUP puro (fila explícita V2): `cash_cup=20000`, `cash_usd=0` |
| **E** — Empate | 10 USD + 10 000 CUP | Desempate determinista documentado | ✓ `tie=true` → CUP (moneda de cuenta interna); estable en 25 ejecuciones; componentes conservados |
| **F** — Devoluciones/anulaciones | — | Reversión sin duplicar/pierder cobros | ✓ Anulación: excluida del reporte (`status='completed'`), ledger intacto; devolución: reembolso en filas separadas por moneda real, venta original inmutable. Reversión proporcional por componentes = decisión pendiente (§2.5) |

### 4.1 Invariantes verificadas (misión §7) — evidencia de cuadre

- `qty_cup + qty_usd = total_quantity` en TODOS los escenarios (M1).
- `importe_cup + importe_usd × tasa = total liquidado` (±0,01) en todos los pagos completos (A, B, C2, D, E, M1).
- La suma de importes distribuidos entre monedas **no supera** el valor de la venta (M1).
- Ventas históricas reproducibles: dos ventas del mismo producto con tasas 790 y 1 000 usan CADA una su tasa persistida (H1) — nunca la tasa global actual.
- Sin doble contabilización: la venta existe una sola vez; los componentes son filas consultables individualmente (`payment_transactions` por (método, moneda)).
- Caja: el libro por moneda (`get_cash_currency_summary`) refleja el movimiento físico real — para ventas con liquidación D6, `recibido − vuelto` por moneda; el ledger nuevo es coherente con ese libro (las filas USD de cash documentan el mismo billete físico que el carve legacy intentaba inferir).
- Idempotencia: `param_hash` incluye componentes (misma clave + mismos componentes ⇒ misma venta; distinta ⇒ conflicto limpio); claves de fila `pay-<method>-<currency>-<tx>` únicas por venta; PT011 (Σ `amount_cup` = total) preservado exacto porque pools y filas derivan de los MISMOS componentes a la MISMA tasa.

---

## 5. Diseño: por qué el ledger y no columnas nuevas

- `payment_transactions` **ya tenía** la estructura necesaria (`amount`, `currency`, `exchange_rate`, `amount_cup` GENERATED) desde 20260712000001 — el flujo anterior simplemente no la usaba para cash/transfer. Cero cambios de esquema → cero riesgo para datos productivos (misión §9).
- La tasa persistida **por fila de componente** es más precisa que una tasa por venta: cada componente lleva su referencia inequívoca (misión §6) y el reporte la lee sin recalcular.
- La clasificación por moneda predominante se calcula **en tiempo de reporte desde el ledger persistido** (determinista, reproducible históricamente) en lugar de congelarse en una columna de la venta — una venta consultada mañana se clasifica igual que hoy.
- Compatibilidad estricta hacia atrás: `p_payment_components NULL` ⇒ comportamiento previo byte-idéntico (replays offline, clientes no migrados, ventas históricas).

## 6. Riesgos residuales y decisiones de negocio pendientes

1. **Divergencia tasa cliente vs servidor en cobros mixtos** (baja probabilidad, fail-closed): los pools se derivan de los componentes a la tasa SERVIDOR; si la tasa hidratada del POS difiriera de la del servidor más allá de la tolerancia (±1 CUP), la venta se rechaza con `ERR_PAYMENT_MISMATCH`/`ERR_PAYMENT_INVARIANT_VIOLATED` — nunca se persiste inconsistente. Ambas tasas provienen de `store_exchange_rates` (misma fuente) → divergencia solo en la ventana mínima entre hidratación y cobro.
2. **Devolución proporcional por componentes** (§2.5): pendiente de aprobación del negocio — hoy el reembolso usa la moneda elegida al devolver.
3. **Ventas históricas con pago mixto mismo-método** (pre-v2.25.0): su desglose por moneda real es irrecuperable (nunca se persistió — RC2); permanecen clasificadas por la heurística vigente (conservador, CUP canónico, sin duplicar). Solo las ventas NUEVAS (con componentes) obtienen la trazabilidad completa.
4. **`get_cash_report` RPC legacy**: sus grupos `sales` se sobreescriben en la API con la reconstrucción; si algún consumidor externo llama el RPC directo, verá la clasificación legacy por `sale_currency` (documento vivo, sin cambios en este PR — el reporte canónico es la API).
5. **Catálogo de ventas (`useSalesCatalog`)**: su flujo de pago no produce componentes multi-moneda mismo-método (pools simples), por lo que no requiere `payment_components`; el passthrough en `/api/sync/batch` queda listo para cuando el flujo offline lo necesite.

## 7. Pasos de revisión sugeridos

1. Migración: revisar §13.7/§14/§17 del SQL — validaciones fail-closed, derivación de pools, filas por componente, PT011.
2. `collection-currency.ts`: camino ledger-directo, marcadores de autoridad, regla de predominante + empate, unidades por venta.
3. Tests: ejecutar `npx vitest run src/__tests__/lib/cash-report-mixed-payments-predominant.test.ts src/__tests__/lib/pos-payment-components.test.ts src/__tests__/store/cart-mixed-payment-legacy-fields.test.ts` y la suite completa.
4. E2E manual (tras merge): venta mixta 5 USD + 15 000 CUP en Vender → verificar Reporte Entrega (hoja CUP con 2 u, hoja USD con 5 USD y 0 u) y Auditoría (metadatos `payment_components` + `usd_operation_rate`).
