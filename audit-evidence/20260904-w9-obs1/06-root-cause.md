# 06 — ROOT CAUSE (GATE 4)

## Punto exacto de la segunda conversión

**Escenario 4 (arquitectura propia) — conversión duplicada dentro del propio SQL del RPC**, entre el ledger ya normalizado y el JSON de salida:

```
create_sale_v2 / frontend (getExpectedTotalCup, base_price_cup)
      ↓  ÚNICA conversión USD→CUP en escritura
transactions.total_amount = CUP (contrato PR-4.4I, invariante SUM(amount_cup)==total_amount)
      ↓
get_cash_report  ← AQUÍ: re-convierte total_amount × sale_exchange_rate  (SEGUNDA conversión — defecto)
      ↓  (API /api/cash-report y frontend NO reconvierten — verificado para T11)
totals.sales_total_cup / balance_cup / sales[].total_cup inflados ×680 en filas USD
```

## Ubicación exacta (líneas de la definición en vivo)

1. Bloque `-- Ventas por método y moneda`, expresión de `total_cup`:
   `SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END) AS total_cup`
2. Bloque `-- Totales`, expresión de `v_sales_total_cup`:
   `SELECT COALESCE(SUM(CASE WHEN sale_currency = 'CUP' THEN total_amount ELSE total_amount * COALESCE(sale_exchange_rate, 1) END), 0) INTO v_sales_total_cup ...`

Las secciones `payments`, `commissions` y `production` NO tienen el defecto (usan `amount_cup` ya normalizado).

## Por qué existía (arqueología)

| Fecha | Migración | Hecho |
|---|---|---|
| 2026-07-02 | 20260702000003_multi_currency_sales | Se añaden sale_currency/sale_exchange_rate; diseño inicial: precio nativo + `price_at_sale_cup = price × rate` |
| 2026-07-02 | 20260702000006 | create_sale original inserta `total_amount = p_total_amount` sin convertir (semántica ambigua) |
| 2026-07-12 | 20260712000001_payment_tracking | Nace get_cash_report YA con el CASE ×rate (asume total_amount nativo); nace `payment_transactions.amount_cup` GENERATED |
| 2026-07-12→08-01 | ×4 reescrituras + v2_12_37 | El CASE se copia intacto en cada reescritura |
| 2026-08-12 | 20260812000001/2 (PR-4.4I) | **Contrato endurecido**: COMMENT "total_amount: CONTRATO CONTABLE: SIEMPRE CUP", trigger de inmutabilidad, invariante `SUM(amount_cup)==total_amount` en create_sale_v2; frontend ya enviaba CUP (`getExpectedTotalCup`, `base_price_cup` "evita que conversiones múltiples corrompan el valor") |

**ROOT CAUSE**: deriva semántica. El contrato de `total_amount` pasó de "importe de venta (moneda ambigua)" a "SIEMPRE CUP" (frontend + PR-4.4I), pero `get_cash_report` conservó la re-conversión de la era ambigua en sus 6 definiciones sucesivas. La tasa volvió a aplicarse sobre un importe ya convertido ⇒ `total_amount × (rate − 1)` de error por fila USD.

## Escenarios evaluados (GATE 4)

- Escenario 1 (ledger→conversion→RPC→reconversion): PARCIALMENTE el observado, pero la 2ª conversión está dentro del propio RPC.
- Escenario 2 (RPC→API→frontend→reconversion): DESCARTADO — route.ts y CashReportModal no reconvertir.
- Escenario 3 (helper A→conversion→RPC→conversion): DESCARTADO — no hay helper intermedio.
- **Escenario 4 (otra arquitectura — el real)**: doble conversión intrínseca al SQL del RPC sobre datos ya normalizados por el contrato de escritura.

## Impacto financiero (medido, agosto-2026, tienda 5e6fe821)

- `sales_total_cup`: 926,861,999.9994 vs 6,463,919.9994 real → **+920,398,080 CUP fantasma (×143.4)**
- `balance_cup` inflado en idéntica magnitud (único componente con USD en el período: ventas)
- Filas USD: inflación ×680 exacta; filas CUP: sin impacto
- Reports de cierre de caja y PDFs exportados basados en `totals` desde el 2026-08-11 (primera venta USD) están sobrestimados.
