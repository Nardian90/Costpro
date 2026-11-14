# PROPUESTA TÉCNICA — Semántica contable de las ventas en divisa (USD)

**Rama:** `fix/semantica-ventas-usd-20261114` (base `main`) · **Fecha:** 2026-11-14
**Estado:** PROPUESTA validada en BD E2E aislada. **NO aplicar a producción sin
autorización expresa del propietario.** Ninguna función CP-FIN de producción ha
sido modificada; ninguna migración aplicada a producción.

---

## 1. Qué representa cada campo de una venta (semántica actual, verificada)

| Campo (tabla) | Qué representa | Moneda | Evidencia |
|---|---|---|---|
| `transactions.sale_currency` | Moneda en que están **expresados los precios** de la venta (etiqueta documental) | — | 131 docs USD ENERVIDA |
| `transactions.sale_exchange_rate` | Tasa del **documento** vigente al vender (680…930) | CUP/USD | tasas por doc |
| `transactions.total_amount` | **Equivalente CUP del importe total de la venta** = Σ `price_at_sale_cup` de los ítems | **CUP-equivalente (SIEMPRE)** | 115 docs: `pagoUSD×tasa == total_amount` exacto; 16 mixtos: `Σamount_cup == total_amount` exacto; ítems verificados (ej. `dbff3625`: 1×2.200 USD → `price_at_sale_cup`=1.496.000 = `total_amount`); código vivo: `src/lib/currency/sale-currency.ts` (`balance = total_amount − Σ pagos.amountCUP`) |
| `transaction_items.price_at_sale` | Precio **nominal** del ítem (en `price_currency`) | divisa ítem | ítems USD |
| `transaction_items.price_at_sale_cup` | Precio del ítem **convertido** (nominal × tasa) | CUP | `create_sale_v2` |
| `transaction_items.cost_at_sale` | Costo unitario al vender (para COGS) | CUP | motor VENTA |
| `payment_transactions.amount` | Importe **nominal del pago** en su moneda | moneda del pago | PT |
| `payment_transactions.currency` | Moneda en que **se recibió** el pago | — | PT |
| `payment_transactions.exchange_rate` | Tasa aplicada a **ese pago** | CUP/moneda | PT |
| `payment_transactions.amount_cup` | Equivalente CUP del pago (`amount × tasa`; columna GENERADA) | CUP | esquema BD |
| legacy `cash_amount`/`transfer_amount`/`zelle_amount` | Cobros en CUP **pre-ledger** (fallback) | CUP | 165 ventas |

**La moneda de `total_amount` es CUP-equivalente en TODAS las ventas** (CUP y
USD). El dato en USD nominal de una venta vive en sus **ítems** (`price_at_sale`
+ `price_currency`) y en sus **pagos** (`amount` + `currency`).

## 2. Distribución de los cobros (cómo llegan al asiento)

`fin_compute_metrics('VENTA')` agrega `payment_transactions` por
(método × moneda) en CUP: `cob_cash_cup`, `cob_cash_usd_cup`,
`cob_transfer_cup`, `cob_transfer_usd_cup`, `cob_zelle_usd_cup`. La regla activa
v1 los debita así:

| Cobro (moneda real recibida) | Cuenta debitada | Importe |
|---|---|---|
| Efectivo CUP | `ACT_EFECTIVO_CUP` | `amount_cup` |
| Efectivo USD | `ACT_EFECTIVO_USD` | `amount_cup` |
| Transferencia CUP/USD (banco) | `ACT_BANCOS` | `amount_cup` |
| Zelle USD | `ACT_BANCOS` | `amount_cup` |

El asiento queda en **CUP como moneda de registro** con
`currency_origin` = moneda del documento, y la **traza** conserva el nominal y
la tasa. Así el mayor es moneda única (CUP) y la divisa queda documentada por
movimiento — sin sumar jamás CUP+USD.

## 3. Reconocimiento del ingreso (regla vigente, confirmada)

```
D  ACT_* (cobros por método/moneda, amount_cup)   Σ = total_amount
C  ING_VENTAS            ← total_cup = total_amount (CUP-equivalente)
D  GAS_COSTO_VENTAS      ← costo_productos_cup (si > 0)
C  ACT_INVENTARIO        ← costo_productos_cup (si > 0)
```
La corrección de esta rama: `total_cup := total_amount` (**sin ×tasa**).
Con esto, D=Σcobros=C=ingreso y el asiento equilibra solo cuando la venta está
cobrada íntegramente (la venta a crédito requiere política §6).

## 4. Venta mixta (documento USD o CUP cobrado en varias monedas)

Cada pago genera su débito en SU cuenta (efectivo CUP / efectivo USD / banco /
zelle) por su `amount_cup`; el ingreso único por `total_amount`. Ejemplo real
validado (C4): total 500.000 CUP-eq → `D ACT_BANCOS 340.000 (zelle 500 USD×680)
+ D ACT_EFECTIVO_CUP 160.000 / C ING_VENTAS 500.000`. La venta «mixta de
documento CUP cobrada en USD» (112 casos reales en ENERVIDA, 21.043,50 USD)
funciona igual porque para doc CUP no hay conversión alguna.

## 5. Devoluciones y reversos

- **Devolución:** `D ING_DEVOLUCIONES (total devolución) / C ACT_EFECTIVO_CUP
  (reembolso)` + par COGS si hay ítems con costo (`D ACT_INVENTARIO /
  C GAS_COSTO_VENTAS`). Los reembolsos se leen de `payment_transactions` con
  `direction='refund'`.
- **Reverso/anulación:** `fin_post_document_annulment` genera asiento
  compensatorio enlazado (`reversal_of`) invirtiendo sentidos — nunca UPDATE
  del histórico.
- **Limitación documentada:** las devoluciones se crean hoy SIEMPRE con
  `currency='CUP'` (`create_devolution_v2`), y su `total_amount = Σ ítems`. Si
  en el futuro se permiten devoluciones en divisa, habrá que fijar su semántica
  (nominal vs CUP-eq) ANTES de contabilizarlas; este fix NO las toca y el
  validador demuestra que una devolución USD sintética termina en
  `fin_posting_errors` (no contamina estados).

## 6. Ventas a crédito y pagos parciales (política pendiente del propietario)

Hoy el motor equilibra D=Σcobros vs C=ingreso: una venta no cobrada íntegramente
no contabiliza (queda en `fin_posting_errors`). Las 165 ventas ENERVIDA «sin
pagos» ya demostramos que están **pagadas en campos legacy** (saldo 0) — su
solución es migrar esos cobros a `payment_transactions` (decisión aparte), no
CXC. Para crédito genuino (ej. las 3 parciales: 1 subpago de 8.100 CUP y 2
sobrepagos) hay dos políticas posibles, a decidir por el propietario:

- **P-A (devengo con CxC):** añadir a la regla VENTA un movimiento
  `D ACT_CXC_CLIENTES ← total_cup − Σcob` cuando 0 < Σcob < total. Reconoce el
  ingreso completo y el derecho de cobro (recomendada contablemente; requiere
  cuenta `ACT_CXC_CLIENTES` y decisión sobre clientes anónimos).
- **P-B (caja pura):** contabilizar solo lo cobrado y dejar el resto fuera
  hasta cobrar (posterga ingresos; subvalora resultados del periodo).

Ninguna de las dos se implementa en esta rama.

## 7. Cómo se evita duplicar la conversión (el núcleo del fix)

**Regla de oro:** un importe se convierte UNA vez, en el punto donde nace.
`total_amount` YA nace convertido (CUP-eq, desde los ítems); el motor lo toma
tal cual. Los pagos se convierten una vez en `amount_cup` (columna generada).
Ninguna fórmula del motor vuelve a multiplicar un importe ya expresado en CUP.
La prueba: con el fix, una venta USD de 550 USD @680 produce ingreso 374.000
CUP (no 254.320.000); sin el fix, el propio `ERR_UNBALANCED` del motor (D≠C) la
bloquea — el defecto nunca contamina estados, solo bloquea la contabilización.

## 8. Validación ejecutada (BD E2E aislada `lguovmvrozxgssupkwpf`)

`ALLOW_PROD=read-only node scripts/validar-semantica-ventas-usd.mjs`
→ **PASS TOTAL 23/23 + NET DELTA 0 + función restaurada (hash idéntico).**

| Caso | ANTES del fix | DESPUÉS del fix |
|---|---|---|
| C1 venta CUP·pago CUP | OK | OK (regresión) |
| C2 venta USD·pago zelle USD completo | **ERR_UNBALANCED (D=374.000 vs C=254.320.000)** | **OK: D ACT_BANCOS 374.000 / C ING_VENTAS 374.000, currency_origin=USD** |
| C3 venta USD·pago cash CUP completo | ERR_UNBALANCED | OK: D ACT_EFECTIVO_CUP 374.000 / C ING 374.000 |
| C4 venta USD·mixto zelle USD + cash CUP | ERR_UNBALANCED | OK: D BANCOS 340.000 + D EFECTIVO 160.000 / C ING 500.000 |
| C5 venta USD·pago parcial | ERR (política §6) | ERR (política §6 — deliberado) |
| C6 venta CUP·mixto CUP+USD | OK | OK (regresión) |
| C7 devolución USD (sintética) | ERR | ERR (semántica devoluciones fuera de alcance, documentado) |
| C8 venta CUP sin pagos (caso 165) | ERR | ERR (migración legacy/CXC pendiente) |
| C9 venta CUP con costo (COGS) | OK | OK (regresión) |
| Idempotencia del motor | — | re-publicar no duplica |

## 9. Alcance del cambio de código (mínimo)

- **1 archivo de migración** (`20261114120000_cp_fin_semantica_total_amount_cup.sql`):
  `fin_compute_metrics` — rama `VENTA`: `total_cup := total_amount`. Sin cambios
  de reglas, tablas o datos. Idempotente (`CREATE OR REPLACE`). Función tomada
  de `pg_get_functiondef` de producción (incluye fixes m015) con el único
  cambio descrito.
- **Sin cambios:** SERVICIO_RECIBIDO (semántica nominal correcta según §17.1/PR
  #1612: los pagos se acumulan en la moneda del documento), DEVOLUCION_VENTA
  (siempre CUP hoy), COMISION (recomendación futura: leer `amount_cup` como
  FLUJO_CAJA; sin docs en divisa).
- La versión de regla NO cambia: la plantilla es la misma; cambia el valor de
  la métrica `total_cup`.

## 10. Efecto esperado sobre el lote bloqueado (si se autoriza)

- Las **131 ventas USD** de ENERVIDA pasarían de `ERR_UNBALANCED` a
  contabilizadas con ingreso real **11.070.884,97 CUP** (≠ 7.578 millones de la
  fórmula vieja). El motor ya NO inflaría 7.566.770.544,63 CUP ficticios.
- Las **165 sin pagos** y las **3 parciales** seguirían en `fin_posting_errors`
  hasta las decisiones §6 (migración legacy / CxC) — correcto: no se fuerza
  ningún asiento.
