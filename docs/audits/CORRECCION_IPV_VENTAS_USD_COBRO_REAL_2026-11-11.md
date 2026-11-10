# CORRECCIÓN IPV — VENTAS USD SOLO CUANDO SE HAYA COBRADO EN USD

**Expediente:** CORRECCION_IPV_VENTAS_USD_COBRO_REAL
**Fecha:** 2026-11-11 · **Rama:** `fix/ipv-ventas-usd-cobro-real-20261111` · **Tipo:** fix (root cause)

---

## 1. Incidente

Ruta: Inicio → OPERACIÓN → Ventas → **IPV — Ingresos por Ventas**.

Al generar el IPV del **10/11/2026** para **ENERVIDA-VITALLCONS**, el registro del SKU 88
("Cable Solar Rojo 4mm") mostraba:

| Código | Descripción | Cant. | Ventas (CUP) | Ventas USD |
|---|---|---:|---:|---:|
| 88 | Cable Solar Rojo 4mm | 7 | 29.295,00 | 31,50 |

La venta se cobró **íntegramente en CUP**. Los 31,50 USD eran el equivalente del
**precio de referencia en USD del catálogo** (4.50 × 7), no dinero recibido.

## 2. Causa raíz (verificada en código y en datos reales)

### Código

`src/lib/ipv-ventas/compute.ts` §3 clasificaba la columna **Ventas USD** por la
moneda **NATIVA del precio del ítem**:

```ts
if (((line.currency ?? line.price_currency) ?? '').toUpperCase() === 'USD') {
  salesUsd.set(pid, (salesUsd.get(pid) ?? 0) + round2(price * qty));
}
```

`transaction_items.currency` es la moneda del **precio del producto en el
catálogo** — NO la moneda del cobro. Un precio de referencia USD generaba ingreso
USD ficticio.

### Datos reales (auditoría read-only contra producción)

Venta `0f984d6f-aeff-435e-9fc5-9d8e50257f3f` (2026-11-10 18:19:32Z):

- `transactions`: payment_method `cash`, **sale_currency `CUP`**, cash_amount
  29295.00 CUP, total 29295.00 CUP.
- Ítem SKU 88: qty 7, price_at_sale 4.50 (USD nativo), price_at_sale_cup 4185
  (× tasa 930), `currency='USD'` (moneda del precio), `price_currency='CUP'`
  (moneda de la venta), **`cash_paid=29295, cash_currency='CUP'`**.
- `payment_transactions` (ledger de pagos): única fila **`cash | CUP | 29295`**.
- Control del día: **0 filas de pago en USD en TODAS las tiendas el 2026-11-10
  (día local)** → ningún USD fue recibido; los 31,50 USD eran ficticios.

### Antes de modificar (§5 de la misión) — respuestas

1. **Cálculo actual:** CUP = `computeLineTotalCup` (price_at_sale_cup × qty, tasa
   histórica de cada venta; sin cambios). USD = clasificación por moneda nativa
   del precio del ítem × qty (la causa del defecto).
2. **Fuentes usadas por el reporte:** solo `transaction_items` (precios) —
   **nunca** consultaba `payment_transactions` ni el desglose del cobro por ítem.
3. **Por qué 31,50 USD:** `currency='USD'` del ítem (catálogo) → `4.50 × 7`.
4. **El cálculo contable CUP no se toca:** `computeLineTotalCup` y la tasa
   histórica por venta quedan intactos (regla 3 de restricciones).
5. **Agregación y totales:** `totalsFromRows`/totales derivan de las mismas
   filas → pantalla, PDF y Excel comparten exactamente los mismos totales.

## 3. Corrección aplicada (causa raíz, no excepción por producto/fecha)

La moneda de cada importe ahora sale del **registro REAL de la venta y sus
pagos**, reutilizando la **fuente única** que ya usa el Reporte de Entrega
(`src/lib/cash-report/collection-currency.ts`, `reconstructTxCollections`):

1. **Ledger `payment_transactions` (ref_type='sale')**: una fila por componente
   de pago con su **moneda real** y la tasa de la operación (MISIÓN PAGOS MIXTOS
   v2.25.0, 2026-10-24). Ventas con componentes → clasificación LEDGER directa.
2. **Desglose del cobro por ítem** (`cash_paid/cash_currency`,
   `transfer_paid/transfer_currency`, `zelle_paid/zelle_currency`): verdad del
   pago en ventas V2 (este era el dato que ya existía y el IPV ignoraba).
3. **Reconstrucción legada documentada** (ventas históricas sin filas de pago
   por ítem): pools CUP canónico; Zelle → USD (riel USD); cash/transfer con
   conversión exacta del RPC → USD legado; resto CUP. Misma heurística del
   Reporte de Entrega — consistencia entre reportes.
4. **Sin evidencia de pago en USD → 0** (nunca se inventa ingreso en dólares).

La columna **Ventas (CUP) no cambia** (contable, tasa histórica por venta);
tampoco cambian cantidades, existencias, vales, ajustes, transferencias ni la
estructura visual del IPV.

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/ipv-ventas/compute.ts` | Columna USD por reconstrucción de moneda real de cobro (reutiliza `reconstructTxCollections`); `IpvSalesLineRow` ampliado (transaction_id, desglose por ítem, pools de la venta); nuevo `IpvSalePaymentRow` e input `salesPayments`. |
| `src/app/api/ipv-ventas/route.ts` | Select ampliado (payment split por ítem + pools/pools de cabecera embebidos y aplanados); trae `payment_transactions` vía `fetchSalePaymentsByTx` (mismo contrato que `/api/cash-report/items-summary`, degradación limpia). |
| `src/components/views/terminal/views/ipv_ventas/IpvVentasView.tsx` | Leyenda: «CUP contable · USD efectivamente cobrado». |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-pdf.ts` | Leyenda de moneda del PDF actualizada al nuevo significado. |
| `src/components/views/terminal/views/ipv_ventas/ipv-ventas-excel.ts` | Notas «Monedas»/«Fuente de importes» actualizadas. |
| `src/__tests__/ipv-ventas/mision-ipv-usd-cobro-real.test.ts` | NUEVO: los 6 escenarios de aceptación de la misión + caso real ENERVIDA. |
| `src/__tests__/ipv-ventas/ipv-real-enervida-2026-11-10.test.ts` | NUEVO: verificación read-only sobre fixture real de producción (skip en CI; activable con `IPV_REAL_FIXTURE`). |
| `src/__tests__/ipv-ventas/compute.test.ts` | Escenario H actualizado a la semántica de cobro real (+ caso precio-referencia-USD cobrado en CUP → 0 USD). |
| `src/__tests__/ipv-ventas/mision-multimoneda-vuelto-cup.test.ts` | Misión multimoneda: USD por evidencia de pago (cash_paid USD); fallback V1 documentado vía heurística legada. |

## 5. Pruebas ejecutadas

- **`bunx vitest run src/__tests__/ipv-ventas/`** → 95 passed (incluidos los 6
  escenarios de aceptación: CUP puro con precio USD de catálogo, USD puro por
  Zelle y por efectivo-USD con componentes, mixto CUP+USD, multi-producto,
  mismo producto en monedas distintas, totales ↔ pagos reales).
- **Verificación con DATOS REALES (read-only):** fixture del día de negocio
  2026-11-10 de ENERVIDA (misma 6 fuentes y misma forma que la ruta; generado
  por `scripts/ipv-usd-fetch-fixture.mjs` en el sandbox):
  - Código corregido: SKU 88 → **29.295,00 CUP / 0,00 USD**; total USD del día
    0,00 = Σ filas de pago USD (0); ninguna fila con USD sin pago USD; CUP
    cuadra por línea. **4/4 PASS.**
  - Código ANTERIOR sobre el mismo fixture: SKU 88 → **31,50 USD** (ficticio)
    y total USD 31,50 ≠ 0 → **falla las 3 aserciones nuevas** (prueba de que
    la corrección cambia el resultado real del incidente).
- **Suite completa:** `bunx vitest run` → 5820 passed, 1 preexistente fallida
  (`db-integration` superadmin memberships: consulta a BD viva, **falla igual
  en main sin esta rama** — deriva de datos de producción, no relacionada).
- **`bunx tsc --noEmit`** → sin errores. **`bun run lint`** → 0 errores
  (advertencias preexistentes).

## 6. Restricciones respetadas

- Sin escrituras en producción (toda la auditoría fue SELECT read-only).
- Sin cambios en datos históricos, inventario, cantidades, tasa histórica ni
  importes contables CUP.
- Sin conversiones/redondeos nuevos: se reutilizan las fórmulas vigentes
  (`round2` del IPV; reconstrucción ya revisada del Reporte de Entrega).
- Estructura visual del IPV intacta; el 0,00 USD se muestra con el formato
  uniforme existente («—» vía `formatIpvMoney`).
- Aislamiento por tienda y seguridad intactos: la ruta sigue `withAuth` +
  `canViewStore` + cliente de sesión (RLS); `payment_transactions` se consulta
  con el mismo patrón que `/api/cash-report/items-summary`.
