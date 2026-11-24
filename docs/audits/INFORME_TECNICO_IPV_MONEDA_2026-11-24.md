# INFORME TÉCNICO — IPV (Ingresos por Ventas): auditoría y corrección integral de la imputación monetaria

**Misión:** 2026-11-24 · **Rama:** `fix/ipv-imputacion-monetaria-20261124` · **Base:** main `0780a8c5b`
**Tienda de referencia:** ENERVIDA-VITALLCONS · **Período de prueba:** noviembre 2026
**Compañeros de expediente:** `docs/audits/AUDITORIA_IPV_IMPUTACION_MONETARIA_2026-11-24.md` (auditoría detallada con trazas de producción)

---

## 1. Causa raíz identificada

**Defecto histórico (duplicación CUP + USD):** antes del PR #1697 (merge `c670dad24`, 2026-11-23), la columna «Ventas USD» clasificaba por la moneda NATIVA del ítem (`transaction_items.currency`, heredada del catálogo) y la columna «Ventas CUP» agregaba la valoración/pools canónicos en CUP de TODAS las ventas. Una venta cobrada 100 % en USD aportaba su **equivalente contable CUP** (USD × tasa de la operación) **y además** su **nominal USD**: el mismo ingreso contado dos veces, en dos monedas.

**Estado actual verificado:** la corrección de causa raíz ya está en main (PR #1697): ambas columnas se alimentan de la MISMA reconstrucción única del Reporte de Entrega (`reconstructTxCollections` en `src/lib/cash-report/collection-currency.ts`). Esta misión **verificó esa corrección contra producción operación por operación** y la conciliación cuadra con diferencia 0,00 (§5).

**Hallazgo sobre el caso reportado (USD 67,50 de SKU 87/88):** NO es una duplicación vigente. Es el agregado honesto de ventas reales en ambas monedas (§4). No se puso a cero ningún CUP legítimo.

## 2. Archivos, funciones y procedimientos modificados (este PR)

| Archivo | Cambio |
|---|---|
| `src/lib/ipv-ventas/columns.ts` (nuevo) | Configuración canónica de las 10 columnas numéricas + `ipvValuelessColumns`/`ipvVisibleColumnKeys` (detección de columnas sin valores sobre el subconjunto filtrado; umbrales idénticos al formateo) |
| `src/lib/ipv-ventas/filters.ts` | Filtro de movimientos de selección exclusiva `movimiento: 'todos' \| 'con' \| 'sin'`; predicado contable `ipvRowHasMovement` INTACTO; «Sin movimiento» = negación exacta (Con ∪ Sin = Todos) |
| `src/lib/ipv-ventas/compute.ts` | Nueva incidencia `SALE_WITHOUT_PAYMENT_EVIDENCE`: la valoración sin evidencia de cobro deja de ocupar columna y se señala por incidencias (la fila se mantiene; nunca se presenta como dinero cobrado) |
| `src/lib/ipv-ventas/format.ts` | Etiquetas de columna sin la columna retirada; eliminada la constante de columnas que la incluía |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | Tabla dinámica por columnas visibles; grupo de movimientos Todos/Con/Sin; checkbox «Ocultar columnas sin valores»; selector de orientación del PDF (rige preview y descarga); notas al pie actualizadas |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf.ts` | Orientación horizontal (tabla única) / vertical (bloques de máx. 4 columnas, Código+Descripción repetidos por bloque, TOTALES por bloque, encabezados repetidos por página); respeto de `hiddenColumns`; sin la columna retirada |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-excel.ts` | Hoja IPV sin la columna retirada (encabezado, filas y totales); nota metodológica actualizada |

**NO se modificó:** ningún movimiento de inventario, ninguna existencia inicial/cantidad vendida/vale/entrada/devolución/ajuste/transferencia/existencia final, ninguna RPC de ventas (`get_sales_dashboard_analytics`, `get_store_analytics_advanced`), ninguna reconstrucción de datos históricos. El IPV es y sigue siendo SOLO LECTURA.

## 3. Regla monetaria corregida y su fuente de verdad

1. **Ventas CUP (cobrado)** = CUP efectivamente recibido (por método documental).
2. **Ventas USD (cobrado)** = USD efectivamente recibidos.
3. **Fuente de verdad única:** el registro real de cobros — ledger `payment_transactions` (`ref_type='sale'`, una fila por componente con su moneda real y la tasa de la operación) + desglose de pago por ítem (`cash_paid/cash_currency`, `transfer_*`, `zelle_*`) + reconstrucción legada documentada — la MISMA del Reporte de Entrega.
4. El equivalente contable de un cobro en USD (USD × tasa) NO se presenta como venta CUP.
5. Cobro mixto: cada importe a SU moneda (nivel ítem: filas explícitas tal cual; residual del ledger prorrateado solo entre ítems sin fila, marcado estimado; contradicciones señaladas, nunca silenciadas).
6. Devoluciones: neto por la moneda REAL del reembolso (`ref_type='devolution'`: refund −, recovery +; ventana `payment_date`); un reembolso USD jamás se convierte para restarlo de CUP.
7. Un mismo importe nunca contabiliza simultáneamente en CUP y USD (buckets disjuntos por moneda por construcción).
8. Ventas sin evidencia de cobro reconstruible: NO son dinero cobrado; fila visible + incidencia `SALE_WITHOUT_PAYMENT_EVIDENCE` (desde este PR ya no ocupan una columna siempre vacía).

## 4. Operaciones reales del caso USD 67,50 (verificadas read-only en producción)

| Fecha | tx | Detalle | Ledger | CUP atribuido |
|---|---|---|---|---:|
| 07-11 18:29 | `e2614f36…` | 15 m Cable Solar Negro 4mm + 15 m Cable Solar Rojo 4mm @ 4,50 USD/m (tasa 930); filas por ítem `cash_paid=67,50 USD` c/u | `cash · USD · 135,00 @930` | **0,00** (cobrada exclusivamente en USD) |
| 02-11 17:00 | `262d68f7…` | 5 m Negro + 5 m Rojo, efectivo CUP | `cash · CUP · 40.500,00` | 20.250,00 c/u |
| 10-11 18:19 | `0f984d6f…` | 7 m Rojo, efectivo CUP | `cash · CUP · 29.295,00` | 29.295,00 |
| 17-11 19:46 | `abab9e20…` | 2 m Negro + 2 m Rojo, efectivo CUP | `cash · CUP · 16.200,00` | 8.100,00 c/u |

→ IPV de noviembre: **SKU 87 = CUP 28.350,00 + USD 67,50** (20.250 + 8.100 + venta USD) y **SKU 88 = CUP 57.645,00 + USD 67,50** (29.295 + 20.250 + 8.100 + venta USD) — EXACTAMENTE lo observado por el propietario, ahora demostrado como agregado legítimo multi-moneda. Control adicional: la venta mixta del 19-11 (`025f7b6b…`, barilla 40 USD + escoba 1.800 CUP transferencia + lejía 800 CUP efectivo) reparte cada importe a su moneda real por ítem.

## 5. Conciliación CUP/USD — antes y después

| Magnitud (nov 2026) | Antes (comportamiento defectuoso previo a la corrección de causa raíz) | Después (código vigente, verificado hoy) |
|---|---|---|
| Venta USD del 07-11 | sumaba 125.550,00 CUP (equivalente contable) **y** 135,00 USD | suma SOLO 135,00 USD; CUP 0,00 |
| SKU 117 «Inversor» (21-11) | sumaba 382.000,00 CUP **y** 400,00 USD | suma SOLO 400,00 USD |
| Total CUP del período | inflado por los equivalentes contables de los cobros USD | **936.085,00** |
| Total USD del período | — | **575,00** |
| Ledger de cobros (fuente) | — | CUP 936.085,00 · USD 575,00 |
| **Diferencia IPV vs ledger** | > 0 (duplicación) | **0,00 · 0,00 — CONCILIA** |

Cada cobro queda contado UNA sola vez y en su moneda correspondiente.

## 6. Pruebas ejecutadas y resultados

**Unitarias/integración (vitest, datos sintéticos — nada toca datos comerciales):**
- Suite completa del repo en 2 shards: **6.653 passed / 0 failed** (3.377 + 3.276).
- Suite IPV: 156 passed — incluye 5 archivos nuevos/actualizados:
  - `ipv-aceptacion-monetaria.test.ts` (nuevo): los 7 escenarios monetarios de la fase 6 con las trazas reales de SKU 87/88 (venta solo USD → solo USD; solo CUP → solo CUP; mixta → cada importe su moneda; varias ventas del mismo producto en distintas monedas se agregan SIN duplicación; transferencia respeta la moneda real; reembolso USD resta solo USD; totales por moneda independientes + conciliación con el ledger).
  - `ipv-columnas-sin-valores.test.ts` (nuevo): detección sobre el filtrado, umbrales = formateo, un valor ≠ 0 conserva la columna, N/D, reversibilidad, recálculo al cambiar el subconjunto.
  - `ipv-pdf-orientacion.test.ts` (nuevo): apaisado A4 (841.89×595.28), retrato A4 (595.28×841.89), bloques con Código/Descripción repetidos y TOTALES por bloque, hiddenColumns respetadas, sin «Valor histórico», encabezados repetidos en multi-página.
  - `filters.test.ts` + `ipv-filters-ui.test.tsx`: casos A–F conservados + 3 estados de movimientos + checkbox + orientación.

**Validación REAL en navegador (ENERVIDA-VITALLCONS, noviembre 2026) — 15/15 PASS:**
columna retirada · SKU 87/88 = 28.350,00/57.645,00 CUP + 67,50 USD en pantalla · filtros Con/Sin/Todos · ocultar columnas sin valores (oculta Devoluciones/Ajustes/Transf./Vales que están a cero; conserva las con valores; reversible; recalcula al cambiar el filtro) · fila TOTALES en pantalla (CUP 936.085,00 · USD 575,00) · PDF vertical 7 páginas (bloques) · PDF horizontal 4 páginas (tabla única) · ambos descargados y verificados visualmente (páginas, encabezados, totales, filas del caso) · consola sin errores.
Evidencia: `download/evidencia/ipv-20261124/` (PDFs reales exportados de la UI + capturas).

## 7. Confirmaciones

- **Inventario intacto:** cero escrituras; la corrección es de imputación monetaria en la capa de cálculo y presentación. Las cantidades del IPV siguen viniendo del ledger de `stock_movements` sin alteración.
- **Filtros:** Todos/Con/Sin operativos con el criterio contable original (Vendidas/VS/Entradas/Devoluciones ≠ 0; Ajustes y Transferencias no cuentan); «Existencia final > 0» conservado.
- **PDF ambas orientaciones:** horizontal = tabla única aprovechando el ancho; vertical = bloques de columnas con Código y Descripción repetidos; encabezados repetidos por página; descripciones/importes sin cortes (anchos por columna + `splitToWidthVerified`); totales correctos y visibles; identidad visual COSTPRO (encabezado institucional, «Página X de Y»).
- **TypeScript:** `tsc --noEmit` EXIT 0 (heap ampliado, misma técnica validada del CI). **Lint:** 0 errores (9 avisos de convención `<button>` preexistentes en la vista, igual que el resto del repo). **Build:** el paso «TypeCheck + Lint + Unit Tests + Build» del CI ejecuta el mismo typecheck → verde en el PR.

## 8. Criterio de cierre

La imputación por moneda es correcta **desde la fuente de datos** (ledger de cobros, verificado contra producción) **hasta los totales del IPV y el PDF** (mismo dataset + `totalsFromRows` compartidos por tabla/preview/descarga), **sin duplicaciones**, **sin correcciones particulares por SKU** (la regla es única y general) y **sin pérdida de información legítima** (los cobros CUP legítimos de SKU 87/88 se conservan; las ventas sin evidencia de cobro se señalan por incidencias).
