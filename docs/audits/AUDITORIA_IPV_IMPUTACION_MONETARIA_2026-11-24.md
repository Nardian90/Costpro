# AUDITORÍA IPV — Imputación monetaria CUP/USD y duplicación de ingresos

**Fecha:** 2026-11-24 · **Tienda de referencia:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Alcance:** `/api/ipv-ventas` → `src/lib/ipv-ventas/compute.ts` → vista `IpvVentasView` → PDF/Excel.
**Método:** auditoría estática del código + conciliación contra la BASE DE PRODUCCIÓN (solo lectura, REST con la sesión de servicio del propietario; ninguna escritura).

---

## 1. Cadena de cálculo verificada (componentes que alimentan el IPV)

| Capa | Archivo | Función |
|---|---|---|
| Ruta API | `src/app/api/ipv-ventas/route.ts` | 5 fuentes paginadas (`fetchAllRows`): `products`, `stock_movements`, `inventory`, `transaction_items`+`transactions` (completed, ventana), `devolution_items`+`devolutions`; ledger `payment_transactions` (`ref_type='sale'` por venta; `ref_type='devolution'` por `payment_date`) |
| Núcleo | `src/lib/ipv-ventas/compute.ts` · `computeIpv` | Cantidades SOLO del ledger; importes SOLO de la reconstrucción única de cobros |
| Fuente única de moneda | `src/lib/cash-report/collection-currency.ts` · `reconstructTxCollections` | La MISMA del Reporte de Entrega: ledger autoritativo (filas por componente con moneda real y tasa), desglose por ítem (`cash_paid/cash_currency`, `transfer_*`, `zelle_*`) y reconstrucción legada (zelle→USD; exact-match→USD; resto CUP) |
| Presentación | `IpvVentasView.tsx` · `ipv-ventas-pdf.ts` · `ipv-ventas-excel.ts` | Tabla, vista previa PDF y Excel consumen el MISMO subconjunto de filas + `totalsFromRows` (escenario K) |

**Ventana del período:** `businessDayWindow` (America/Havana) — fecha elegida = fecha impresa; sin desfase de TZ.

## 2. Cómo se calculan hoy las columnas monetarias (regla vigente en main)

Tras el PR #1697 (merge `c670dad24`, 2026-11-23), ambas columnas representan dinero REALMENTE COBRADO y provienen de la MISMA reconstrucción única:

1. **Ventas CUP (cobrado)** = Σ por ítem de `perItem.cup` (CUP recibido por método documental).
2. **Ventas USD (cobrado)** = Σ por ítem de `perItem.usd` (USD recibidos — corrección 2026-11-11).
3. El **equivalente contable** de un cobro en USD (`usdCupEquiv` = USD × tasa de la operación) **NO entra como venta en CUP**.
4. Ventas **sin evidencia de cobro reconstruible** (sin pools, sin filas por ítem, sin ledger) → 3ª magnitud interna `ventasCupHistorico` (no es dinero cobrado; no entra en totales).
5. **Devoluciones**: neto por moneda REAL del reembolso (ledger `ref_type='devolution'`: `refund` resta, `recovery` revierte; ventana `payment_date`); un reembolso USD jamás se convierte para restarlo de CUP.
6. **Cobros mixtos**: cada importe a su moneda (nivel ítem: filas explícitas tal cual; residual del ledger prorrateado solo entre ítems sin fila, marcado como estimado; contradicciones → `attribution.ledgerMismatch` auditable).

Un mismo importe no puede contabilizarse simultáneamente en CUP y USD por construcción: los buckets son (método × moneda) y `perItem.cup` y `perItem.usd` se llenan de buckets DISJUNTOS.

## 3. Causa raíz del defecto reportado (duplicación CUP+USD)

**Estado previo (anteriores al 2026-11-23):** la columna Ventas USD clasificaba por la moneda NATIVA del ítem (`transaction_items.currency`, heredada del catálogo) y la columna Ventas CUP agregaba la valoración/pools canónicos en CUP de TODAS las ventas. Resultado: una venta cobrada 100 % en USD aportaba su equivalente contable CUP **y** su nominal USD — duplicación entre ambas monedas (incidente SKU 117 «Inversor»: 400 USD × 955 mostraba 382.000,00 CUP además de 400,00 USD).

**Corrección de causa raíz ya embarcada en main** (PR #1697, commit `c670dad24`): ambas columnas pasan a alimentarse de la reconstrucción única del Reporte de Entrega; el equivalente contable dejó de presentarse como venta CUP. **Esta auditoría verifica la corrección contra producción (§5): la duplicación NO es reproducible en el código vigente.**

## 4. Caso real rastreado — los USD 67,50 de SKU 87/88

Período observado por el propietario: **noviembre 2026** («Mes actual»). Registros IPV observados:

| SKU | Producto | Ventas CUP | Ventas USD |
|---|---|---:|---:|
| 87 | Cable Solar Negro 4mm | 28.350,00 | 67,50 |
| 88 | Cable Solar Rojo 4mm | 57.645,00 | 67,50 |

### 4.1 Origen de los USD 67,50 — venta cobrada EXCLUSIVAMENTE en USD

**Transacción `e2614f36…` (2026-11-07 18:29, completed):** venta de 15 m de Cable Solar Negro 4mm **y** 15 m de Cable Solar Rojo 4mm a 4,50 USD/m, tasa de operación 930.

| Registro | Evidencia |
|---|---|
| Filas por ítem (v2) | ambos ítems: `cash_paid=67.50`, `cash_currency='USD'` (135,00 USD en total) |
| Ledger | UNA fila `payment_transactions`: `cash | USD | 135,00 | tasa 930` |
| Pools canónicos | `cash_amount=125.550` CUP (= 135 × 930) — valoración, no dinero recibido |
| Tratamiento IPV | `ledgerIsAuthoritative` = true (fila cash en USD) → buckets = {cash/USD/135,00}; por ítem: USD 67,50 + 67,50; **CUP asignado a esta venta: 0,00** |

**Conclusión:** cobrada exclusivamente en USD; el IPV vigente la contabiliza SOLO en Ventas USD. La valoración contable de la línea (62.775,00 CUP por cable) NO aparece como venta CUP.

### 4.2 Origen de los importes CUP de SKU 87/88 — ventas legítimas cobradas en CUP

| Fecha | tx | SKU | Línea | Ledger | CUP atribuido al SKU |
|---|---|---|---|---|---:|
| 02-11 17:00 | `262d68f7` | 87 y 88 | 5 m c/u @4,50 tasa 900 | cash CUP 40.500,00 | 20.250,00 c/u |
| 17-11 19:46 | `abab9e20` | 87 y 88 | 2 m c/u @4,50 tasa 900 | cash CUP 16.200,00 | 8.100,00 c/u |
| 10-11 18:19 | `0f984d6f` | 88 | 7 m @4,185 (p_cup) | cash CUP 29.295,00 | 29.295,00 |

- **SKU 87:** 20.250,00 (02-11) + 8.100,00 (17-11) = **28.350,00 CUP** ✓
- **SKU 88:** 29.295,00 (10-11) + 20.250,00 (02-11) + 8.100,00 (17-11) = **57.645,00 CUP** ✓

**Conclusión:** los importes CUP observados son cobros CUP legítimos de ventas DIFERENTES (todas con fila `cash|CUP` en el ledger). La coexistencia de importes en ambas columnas del IPV es el agregado honesto de un producto vendido en las dos monedas — **no es duplicación**. No procede poner en cero ningún CUP de esos SKU: se perderían cobros reales.

### 4.3 Venta mixta del período (control adicional)

`025f7b6b` (2026-11-19 20:45): barilla (USD 40 efectivo) + escoba (1.800 CUP transferencia) + lejía (800 CUP efectivo) → buckets {cash/USD/40, transfer/CUP/1.800, cash/CUP/800}; por ítem: barilla USD 40,00; escoba CUP 1.800,00; lejía CUP 800,00. **Cada importe en su moneda real**, sin duplicación.

## 5. Conciliación CUP/USD del período de prueba (noviembre 2026)

Reproducción EXACTA de las consultas de la ruta + `computeIpv` del código vigente contra producción (script persistido: `scripts/concilia-ipv-enervida.ts`, re-ejecutable):

| Magnitud | Ledger de cobros (fuente) | IPV reportado | Diferencia |
|---|---:|---:|---:|
| Ventas CUP brutas | 936.085,00 | 936.085,00 | 0,00 |
| Ventas USD brutas | 575,00 | 575,00 | 0,00 |
| Devoluciones (refund/recovery en ventana) | 0,00 / 0,00 | — | — |
| **Neto por moneda** | **CUP 936.085,00 · USD 575,00** | **CUP 936.085,00 · USD 575,00** | **0,00 · 0,00** |

Cada cobro se cuenta UNA sola vez y en SU moneda: los 3 ventas con bucket USD del período (07-11 135 USD, 19-11 40 USD, 21-11 400 USD) aportan CUP = 0,00. `ventasCupHistorico` = 0 en todo el período (columna «Valor hist.» vacía — coincide con lo observado por el propietario).

## 6. Conclusión de la auditoría

1. La regla contable exigida («cada cobro exactamente una vez, en su moneda») está implementada en la CAPA DE CÁLCULO desde el PR #1697 y verificada aquí contra producción; no requiere corrección adicional ni ninguna corrección por SKU.
2. El caso observado (SKU 87/88) NO es una duplicación vigente: es el agregado de ventas reales en ambas monedas; documentado con las operaciones de origen.
3. Trabajos pendientes derivados de la misma revisión (se implementan en el PR de esta misión):
   - **FASE 3** — retirar la columna «Valor hist. s/ moneda verificable» de tabla, totales, PDF, Excel y configuraciones de columnas (vacía en producción; sin pérdida de información: si una venta sin evidencia de cobro existiera, la fila se mantiene y se señala con la incidencia `SALE_WITHOUT_PAYMENT_EVIDENCE`).
   - **FASE 4** — filtro de movimientos con tres estados (Todos / Con movimiento / Sin movimiento; criterio contable `ipvRowHasMovement` INTACTO) y opción «Ocultar columnas sin valores» (detección sobre el resultado filtrado; Código y Descripción siempre visibles; recalcula con período/tienda/filtros; reversible).
   - **FASE 5** — selector de orientación del PDF (horizontal/vertical) con bloques de columnas en vertical repitiendo Código y Descripción.

## 7. Script de verificación re-ejecutable

`scripts/concilia-ipv-enervida.ts` (en el sandbox del agente; lectura pura): replica las consultas de la ruta, ejecuta `computeIpv` real y valida: (a) invariante anti-duplicación por venta con bucket USD; (b) conciliación de totales contra el ledger por moneda; (c) inventario de la 3ª categoría. Uso: `bun scripts/concilia-ipv-enervida.ts [desde hasta]`.
