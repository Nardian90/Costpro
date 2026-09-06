# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 14-financial-neutrality.md
# Neutralidad financiera (GATE 14)

## Principio

La apertura es exclusivamente **inventarial/contable de existencias**: materializa en el
ledger una posición física demostrada. NO crea operación comercial, NO toca caja, NO toca
ingresos, NO toca comisiones, NO altera el histórico de pagos.

## Verificación por dominio (diseño → verificación SQL de ejecución)

| Dominio | Tabla(s) | Efecto de la apertura | Verificación POST |
|---|---|---|---|
| Pagos | payment_transactions | **+0** | count(tienda vía transactions)=0 PRE=POST; count global idéntico |
| Ventas | transactions, transaction_items | **+0** | counts tienda PRE=POST (0) |
| Ingresos | (derivan de transactions) | **+0** — no existe tabla de ingresos tocada por el pipeline de stock | counts idénticos |
| Comisiones | commission_payments, commission_rules | **+0** (rules son config; 0 payments globales) | counts idénticos |
| Caja histórica | cash_movements, cash_sessions | **+0** — el pipeline de stock no escribe caja | counts idénticos |
| Compras | receipts, purchase_* | **+0** — la apertura NO es una compra (sin proveedor, sin receipt, sin costo marginal) | receipts tienda 0 PRE=POST |
| Devoluciones | devolutions, devolution_items | **+0** (13 filas sobrevivientes intactas) | counts idénticos |
| Traspasos | transfers | **+0** | counts idénticos |
| Transacciones inversionales | transactions | **+0** — movement_type='initial' NO genera transaction; solo stock_movements + business_events | counts idénticos |
| Z reports / cierres | z_reports, fiscal_closings | **+0** | counts idénticos |

Mecánica que lo garantiza: `register_stock_movement` escribe SOLO en stock_movements +
products(stock_current) + business_events; los triggers escriben SOLO inventory +
kardex_entries. Ningún path del pipeline toca tablas financieras (cuerpos congelados en
raw/g5_funcdefs.json, raw/g5_triggerfns.json).

## Separación valor de inventario vs impacto de caja

```text
VALOR DE INVENTARIO RECONOCIDO (ESTIMATED, base WAC):
   6.427 u × WAC vigente = 9.932.216,94        ← aparece en inventory/kardex (activos)
IMPACTO DE CAJA HISTÓRICO:
   0,00                                         ← la apertura no mueve un centavo
IMPACTO EN P&L DEL SISTEMA:
   0,00                                         ← sin venta/compra/gasto asociado
```

Nota contable: el stock ya estaba FÍSICA y ECONÓMICAMENTE en la tienda (comprado y
operado antes del purge; parte del valor fue pagado en compras previas fuera del
período visible). La apertura NO genera riqueza nueva: RECONOCE en libros una posición
preexistente. Por eso el valor se etiqueta ESTIMATED (base WAC del sistema, sin
cost_at_sale/purchase_cost verificable por unidad — limitación documentada en OBS-2
12-economic-impact.csv) y su consagración es una DECISIÓN CONTABLE firmada, no un
efecto automático del software.

## Doble valoración — verificación final

Antes: inventory=0 → valor de ledger = 0 (el 21,9 M «declarado» NO era valoración de
ledger; era stock_current sin respaldo de inventario). Después: ledger = 6.427 u →
9.932.216,94. No se suma Q×WAC sobre una base previa (la base era CERO): imposible el
doble conteo por construcción (demostrado también en 09-wac-model.md §2.3 y simulación).

## Chequeo rápido de ejecución (incluido en checklist PRE/POST)

```sql
-- PRE y POST idénticos:
SELECT (SELECT count(*) FROM payment_transactions) AS pay,
       (SELECT count(*) FROM transactions WHERE store_id='d1c4ba0e…') AS tx,
       (SELECT count(*) FROM commission_payments) AS comm,
       (SELECT count(*) FROM devolutions WHERE store_id='d1c4ba0e…') AS dev,
       (SELECT count(*) FROM receipts WHERE store_id='d1c4ba0e…') AS rec;
-- esperado: 366 / 0 / 0 / 13 / 0  (sin cambios)
```
