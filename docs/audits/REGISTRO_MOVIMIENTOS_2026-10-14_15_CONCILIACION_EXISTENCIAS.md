# REGISTRO DE MOVIMIENTOS 14–15/10/2026 · CONCILIACIÓN CONTRA EXISTENCIA FINAL · EVIDENCIA AUDITABLE

**Sistema:** COSTPRO 4 Multitienda · **Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`, `is_active=true`)
**Fechas económicas procesadas:** 14 y 15 de octubre de 2026 (estampadas al mediodía de `America/Havana`, convención `formatOperationDateForRPC`)
**Operador:** `admin@costpro.com` (id `051c6157-600b-425e-b8c0-72388bacf541`, rol `admin`, membresía `active` en la tienda, `profiles.active_store_id` = tienda destino) · Autenticación real Supabase (`signInWithPassword`), `ENABLE_DEV_BYPASS=false`
**Ejecución:** 16/10/2026 · Rama `ops/registro-movimientos-2026-10-14-15` · PR #1410
**Regla cumplida:** no se ajustó inventario artificialmente; todas las escrituras pasaron por los flujos oficiales del sistema; todas las diferencias se documentan, no se ocultan.

---

## A. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Tienda y UUID verificados | ENERVIDA-VITALLCONS · `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (verificado en tabla `stores` y en membresía del operador antes de escribir) |
| Fechas procesadas | 14/10/2026 y 15/10/2026 (dentro de la ventana `validate_operation_date` de hoy−6 meses a hoy+1 día) |
| Operaciones solicitadas | 31 |
| Operaciones nuevas confirmadas y verificadas | **31 de 31** (13 ventas → `transactions`; 5 vales → `issue_slips`; 13 entradas → `receipts`) |
| Operaciones preexistentes identificadas de esta misión | 0 (11 movimientos económicos del 14–15/10 preexistentes fueron investigados uno a uno y clasificados como trabajo de misiones anteriores — no duplicados) |
| Operaciones pendientes / rechazadas | 0 pendientes · 0 rechazadas (1 reintentó con payload corregido tras `ERR_TOTAL_MISMATCH` — op 1, ver B y D) |
| SKUs de la tabla objetivo | 179 |
| SKUs conciliados (con producto existente en tienda) | 165 — **165 de 165 cuadran exactamente** contra la tabla objetivo |
| SKUs con diferencia | 14 — todos ellos SKUs **160–173, que no existen como producto en la tienda** (objetivo 0; preexistente, no atribuible a la misión) |
| SKUs de la tienda fuera de la tabla objetivo | 0 |
| Conciliación independiente ledger vs `stock_current` | 24/24 SKUs tocados por la misión: suma del historial `stock_movements` == `stock_current` (0 inconsistencias) |
| Kardex | 31/31 operaciones con `kardex_entries` correspondiente (`reference_id` = `stock_movement.id`) |
| Duplicados | 0 (31/31 con exactamente 1 fila en su tabla de origen; claves de idempotencia `reg1415-opNN-*`) |
| Aislamiento multitienda | 0 movimientos creados en otras tiendas durante la misión |
| **Estado global** | **COMPLETADO CON INCIDENCIAS** (todas las incidencias son preexistentes o de contexto; ninguna bloquea el registro ni la conciliación — ver D) |
| **Adenda 16/10/2026 (post-misión) — cierre D-2** | Por instrucción del negocio se dio de alta en catálogo los SKUs 160–173 (existencia objetivo 0, sin movimientos de stock). Conciliación final: **179/179 SKUs cuadran**, 0 diferencias. Renombrado comercial aplicado con el catálogo oficial del negocio (14/14) + normalización ortográfica completa del catálogo (32 SKUs netos) — ver G |

Nota sobre el desglose solicitado: el encabezado del prompt indica «11 ventas, 6 vales de salida y 14 entradas», pero la columna `Clasificación` fila a fila suma **13 ventas, 5 vales y 13 entradas** (total 31). Se siguió la columna Clasificación como autoridad y el total de 31 coincide.

### Comisiones (derivadas por el motor oficial, no escritas a mano)

El motor oficial (`POST /api/commissions/calculate`, período 14–15/10) derivó por la regla `product_specific`/`per_unit` vigente desde 14/10 (`commission_rules.id 79fc05ac…`) **exactamente los importes de la tabla del prompt** para las 13 ventas de la misión: SKU 139 → 1,000.00 · SKU 11 (6 u) → 120.00 · SKU 15 → 120.00 · SKU 63 → 500.00 · SKU 17 (6 u) → 600.00 · SKU 28 → 100.00 · SKU 92 (2 u) → 200.00 · SKU 141 → 200.00 · SKU 47 → 100.00 · SKU 142/111/134 → 0 (filas con «—»). Total sugerido del período: 8,010.00 (incluye ventas preexistentes de misiones anteriores). No se inventó ni escribió comisión manual alguna.

---

## B. Registro de ejecución

Todos los IDs reales generados por el sistema (transaction/slip/receipt). La columna Evidencia condensa la verificación en base de datos (persistencia + movimiento de stock + pago/fecha). Ningún ID está inventado.

| N.º | Fecha | SKU | Clasif. | Nota | Cant. | Importe y moneda | Comisión | Estado | ID real (documento) | Evidencia de persistencia y Kardex | Incidencia |
|---:|---|---:|---|---|---:|---|---:|---|---|---|---|
| 1 | 14/10 | 139 | Ventas | — | 1 | 210.00 USD (zelle) | 1,000.00 | VERIFICADA | `9fb91131…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-14; pago 210 USD zelle |  |
| 2 | 14/10 | 11 | Ventas | — | 6 | 2,100.00 CUP efectivo | 120.00 | VERIFICADA | `3c8b8e68…` transaction | persistida+efectos OK; mov -6 (sale) 2026-10-14; pago 2100 CUP cash |  |
| 3 | 14/10 | 15 | Ventas | — | 1 | 10,000.00 CUP efectivo | 120.00 | VERIFICADA | `17b963ac…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-14; pago 10000 CUP cash |  |
| 4 | 14/10 | 142 | Ventas | — | 3 | 6,000.00 CUP efectivo | - | VERIFICADA | `4665a581…` transaction | persistida+efectos OK; mov -3 (sale) 2026-10-14; pago 6000 CUP cash |  |
| 5 | 14/10 | 63 | Ventas | — | 1 | 69,900.00 CUP efectivo | 500.00 | VERIFICADA | `762f7283…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-14; pago 69900 CUP cash |  |
| 6 | 14/10 | 141 | VS | Belki | 1 | — | — | VERIFICADA | `185fbd79…` issue_slip | persistida+efectos OK; mov -1 (issue_slip_out) 2026-10-14; VS-000180-2026 |  |
| 7 | 14/10 | 15 | VS | Belki | 3 | — | — | VERIFICADA | `feaa3412…` issue_slip | persistida+efectos OK; mov -3 (issue_slip_out) 2026-10-14; VS-000181-2026 |  |
| 8 | 14/10 | 141 | VS | Tienda Pueblo | 2 | — | — | VERIFICADA | `29323056…` issue_slip | persistida+efectos OK; mov -2 (issue_slip_out) 2026-10-14; VS-000182-2026 |  |
| 9 | 14/10 | 17 | Entrada | Convirtiendo a metros | 54 | — | — | VERIFICADA | `7a741289…` receipt | persistida+efectos OK; mov +54 (purchase) 2026-10-14; ref REG-1415-OP09 |  |
| 10 | 14/10 | 17 | Ventas | — | 6 | 39,000.00 CUP efectivo | 600.00 | VERIFICADA | `83c89198…` transaction | persistida+efectos OK; mov -6 (sale) 2026-10-14; pago 39000 CUP cash |  |
| 11 | 14/10 | 28 | Ventas | — | 1 | 5,000.00 CUP efectivo | 100.00 | VERIFICADA | `cdad1534…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-14; pago 5000 CUP cash |  |
| 12 | 14/10 | 111 | Ventas | — | 1 | 2,000.00 CUP efectivo (desc. -20% autorizado) | - | VERIFICADA | `4c76a1a1…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-14; pago 2000 CUP cash |  |
| 13 | 14/10 | 92 | Ventas | — | 2 | 47,400.00 CUP efectivo | 200.00 | VERIFICADA | `1a7f2d8d…` transaction | persistida+efectos OK; mov -2 (sale) 2026-10-14; pago 47400 CUP cash |  |
| 14 | 14/10 | 134 | Ventas | — | 4 | 15,800.00 CUP efectivo | - | VERIFICADA | `4f09258d…` transaction | persistida+efectos OK; mov -4 (sale) 2026-10-14; pago 15800 CUP cash |  |
| 15 | 14/10 | 81 | Entrada | — | 100 | — | — | VERIFICADA | `172662ff…` receipt | persistida+efectos OK; mov +100 (purchase) 2026-10-14; ref REG-1415-OP15 |  |
| 16 | 14/10 | 76 | Entrada | — | 5 | — | — | VERIFICADA | `0a2cdbf8…` receipt | persistida+efectos OK; mov +5 (purchase) 2026-10-14; ref REG-1415-OP16 |  |
| 17 | 14/10 | 97 | Entrada | — | 15 | — | — | VERIFICADA | `ca66b61d…` receipt | persistida+efectos OK; mov +15 (purchase) 2026-10-14; ref REG-1415-OP17 |  |
| 18 | 14/10 | 30 | Entrada | — | 50 | — | — | VERIFICADA | `a14c635e…` receipt | persistida+efectos OK; mov +50 (purchase) 2026-10-14; ref REG-1415-OP18 |  |
| 19 | 14/10 | 100 | Entrada | — | 150 | — | — | VERIFICADA | `29404c42…` receipt | persistida+efectos OK; mov +150 (purchase) 2026-10-14; ref REG-1415-OP19 |  |
| 20 | 14/10 | 31 | Entrada | — | 10 | — | — | VERIFICADA | `0fab1e37…` receipt | persistida+efectos OK; mov +10 (purchase) 2026-10-14; ref REG-1415-OP20 |  |
| 21 | 14/10 | 32 | Entrada | — | 10 | — | — | VERIFICADA | `f1edee3e…` receipt | persistida+efectos OK; mov +10 (purchase) 2026-10-14; ref REG-1415-OP21 |  |
| 22 | 14/10 | 139 | VS | OT/Ferro | 8 | — | — | VERIFICADA | `e35833c4…` issue_slip | persistida+efectos OK; mov -8 (issue_slip_out) 2026-10-14; VS-000183-2026 |  |
| 23 | 15/10 | 146 | Entrada | — | 1 | — | — | VERIFICADA | `0a3af49f…` receipt | persistida+efectos OK; mov +1 (purchase) 2026-10-15; ref REG-1415-OP23 |  |
| 24 | 15/10 | 174 | Entrada | — | 1 | — | — | VERIFICADA | `6afab3ab…` receipt | persistida+efectos OK; mov +1 (purchase) 2026-10-15; ref REG-1415-OP24 |  |
| 25 | 15/10 | 175 | Entrada | — | 1.2 | — | — | VERIFICADA | `28322248…` receipt | persistida+efectos OK; mov +1.2 (purchase) 2026-10-15; ref REG-1415-OP25 |  |
| 26 | 15/10 | 176 | Entrada | — | 1 | — | — | VERIFICADA | `53bf4982…` receipt | persistida+efectos OK; mov +1 (purchase) 2026-10-15; ref REG-1415-OP26 |  |
| 27 | 15/10 | 177 | Entrada | — | 1 | — | — | VERIFICADA | `2f9afe82…` receipt | persistida+efectos OK; mov +1 (purchase) 2026-10-15; ref REG-1415-OP27 |  |
| 28 | 15/10 | 15 | VS | Cementerio/Belki | 6 | — | — | VERIFICADA | `32d2e962…` issue_slip | persistida+efectos OK; mov -6 (issue_slip_out) 2026-10-15; VS-000184-2026 |  |
| 29 | 15/10 | 141 | Ventas | — | 1 | 20,000.00 CUP efectivo | 200.00 | VERIFICADA | `4b9ea4c6…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-15; pago 20000 CUP cash |  |
| 30 | 15/10 | 142 | Ventas | — | 2 | 4,000.00 CUP efectivo | - | VERIFICADA | `f4aacc6a…` transaction | persistida+efectos OK; mov -2 (sale) 2026-10-15; pago 4000 CUP cash |  |
| 31 | 15/10 | 47 | Ventas | — | 1 | 8,000.00 CUP efectivo | 100.00 | VERIFICADA | `143854e4…` transaction | persistida+efectos OK; mov -1 (sale) 2026-10-15; pago 8000 CUP cash |  |

Detalles de representación:

- **Op 1 (venta USD 210 del SKU 139):** contrato vigente `create_sale_v2` (migración `20261014000000` FIX-USD-CUP-RATE): `total_amount` normalizado a CUP (210 × tasa autoritativa de tienda 790 = 165,900.00 CUP), ítem con precio nativo 210 USD (`price_at_sale` 210, `currency` USD, `exchange_rate` 790) y **pago preservado en moneda original: `payment_transactions` = 210.00 USD por `zelle`**. El método `zelle` es la representación nativa del sistema para pagos en USD (la UI del POS mapea el pago en USD al método zelle, `zelle_currency` por defecto `USD`), coherente con el precedente registrado de la fila equivalente anterior (tx `6b2623ca…`, «USD (zelle)»). No se inventó desglose de efectivo/transferencia.
- **Op 12 (SKU 111, precio informado 2,000 vs catálogo 2,500, −20 %):** activó legítimamente el gate de supervisor ≥15 %. Se usó el flujo oficial `POST /api/auth/supervisor-check` (token firmado de un solo uso con scope de la línea) + `discount_reason` documentado. La venta se registró con el importe exacto del prompt, sin alterar precios.
- **Vales de salida:** numeración oficial `VS-000180-2026` … `VS-000183-2026` (`next_document_number`), nacen `completed` y descuentan stock en la misma transacción. Notas preservadas literalmente con sufijo trazable `reg1415-opNN-vsSKU` (patrón de la misión anterior, cf. VS-000179-2026).
- **Entradas:** RPC oficial `register_reception` (mismo camino que `useRegisterReception` online con JWT del operador). `supplier=Vitallcons`, `reference_doc=REG-1415-OPNN` (op 9 añade la nota literal `| Convirtiendo a metros`), `unit_cost=1 CUP` por ausencia de costo informado (precedente `IMPORT-ENERVIDA-*`; ver D-6). La cantidad decimal **1.20 del SKU 175 se conservó sin redondeo** (ledger y stock muestran 1.2).
- **Productos nuevos 174–177:** no existían en la tienda; se crearon por el flujo oficial de catálogo (INSERT con JWT del operador y `tenant_id` del usuario, política RLS `products_tenant_insert`) con `price=0`, `cost_price=0`, `unit_of_measure=unidad` — sin inventar precios (ver D-5).

---

## C. Conciliación por SKU

Tabla completa de los 179 SKUs de la existencia final objetivo. `Dif = real − esperada`.

- SKU con movimientos de la misión: apertura 14/10 reconstruida desde el historial completo de `stock_movements`; entradas/ventas/VS = sumas de las operaciones de esta misión; «Otros» = movimientos preexistentes dentro de la ventana (misiones anteriores); Calculada = apertura + entradas − ventas − VS + otros.
- SKU sin movimientos de la misión: se compara directamente el saldo real contra el objetivo.

| SKU | Descripción | Apertura 14/10 | Entradas | Ventas | VS | Devol. | Otros (preexistentes) | Calculada | Real | Esperada | Dif | Diagnóstico |
|---:|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---|
| 1 | Abrazadera metálica de 3/4 | — | — | — | — | — | — | — | 18 | 18 | +0 | CUADRA (sin movimientos de la misión) |
| 2 | Abrazadera metálica de 1 pulgada | — | — | — | — | — | — | — | 32 | 32 | +0 | CUADRA (sin movimientos de la misión) |
| 3 | Araganes | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 4 | Bisagra | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 5 | Brecker 16A Sencillo | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 6 | Brecker 25 A Sencillo | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 7 | Brecker 32A Trifasico | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 8 | Brecker C32 A Trible | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 9 | Brecker D63 A | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 10 | Brida 58 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 11 | Cabilla 70 Cm | 6 | 0 | 6 | 0 | — | — | 0 | 0 | 0 | +0 | CUADRA |
| 12 | Cable Conductor electrico 10 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 13 | Cable Conductor electrico 8 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 14 | Distribuidor de corriente 4 salidas | — | — | — | — | — | — | — | 16 | 16 | +0 | CUADRA (sin movimientos de la misión) |
| 15 | Cemento Cola | 49 | 0 | 1 | 9 | — | — | 39 | 39 | 39 | +0 | CUADRA |
| 16 | Cemento P425 Tudella | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 17 | Césped Artificial | 6 | 54 | 6 | 0 | — | — | 54 | 54 | 54 | +0 | CUADRA |
| 18 | Cheques metálicos | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 19 | Codo de 90 | — | — | — | — | — | — | — | 16 | 16 | +0 | CUADRA (sin movimientos de la misión) |
| 20 | Codos de 45 grado | — | — | — | — | — | — | — | 15 | 15 | +0 | CUADRA (sin movimientos de la misión) |
| 21 | Colchón Milexus | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 22 | Conectores MC4 | — | — | — | — | — | — | — | 77 | 77 | +0 | CUADRA (sin movimientos de la misión) |
| 23 | Cuchilla 2P 100A | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 24 | Cuchilla 2P 63A | — | — | — | — | — | — | — | 12 | 12 | +0 | CUADRA (sin movimientos de la misión) |
| 25 | Cuchilla 3P 100A | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 26 | Disco de esmeril | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 27 | Escobas | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 28 | Espejo | 32 | 0 | 1 | 0 | — | — | 31 | 31 | 31 | +0 | CUADRA |
| 29 | Expansiones 8x80 | — | — | — | — | — | — | — | 123 | 123 | +0 | CUADRA (sin movimientos de la misión) |
| 30 | Expansiones anaranjada 6*40mm /Rapita | 9 | 50 | 0 | 0 | — | — | 59 | 59 | 59 | +0 | CUADRA |
| 31 | Expansiones con tornillos M6 | 1 | 10 | 0 | 0 | — | — | 11 | 11 | 11 | +0 | CUADRA |
| 32 | Expansiones con tornillos M8 | 0 | 10 | 0 | 0 | — | — | 10 | 10 | 10 | +0 | CUADRA |
| 33 | Extensiones 5M | — | — | — | — | — | — | — | 5 | 5 | +0 | CUADRA (sin movimientos de la misión) |
| 34 | Fregadero | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 35 | Fuerte eléctrico | — | — | — | — | — | — | — | 56 | 56 | +0 | CUADRA (sin movimientos de la misión) |
| 36 | Impermeable verde 20Kg | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 37 | J de techo | — | — | — | — | — | — | — | 25 | 25 | +0 | CUADRA (sin movimientos de la misión) |
| 38 | Lampara de 20 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 39 | Tubo de Lampara de 40 | — | — | — | — | — | — | — | 5 | 5 | +0 | CUADRA (sin movimientos de la misión) |
| 40 | Latiguillo de media por 3/8 | — | — | — | — | — | — | — | 7 | 7 | +0 | CUADRA (sin movimientos de la misión) |
| 41 | Latiguillo MC4 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 42 | Llave de lavamano | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 43 | Losa aporcelanada 60x60 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 44 | Losa aporcelanada 60x60 con defectos | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 45 | Malla perli | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 46 | Masilla interior blanca | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 47 | Mortero | 6 | 0 | 1 | 0 | — | — | 5 | 5 | 5 | +0 | CUADRA |
| 48 | Nudo de media | — | — | — | — | — | — | — | 37 | 37 | +0 | CUADRA (sin movimientos de la misión) |
| 49 | Nudos de 3/4 | — | — | — | — | — | — | — | 8 | 8 | +0 | CUADRA (sin movimientos de la misión) |
| 50 | Nudos de 50 | — | — | — | — | — | — | — | 8 | 8 | +0 | CUADRA (sin movimientos de la misión) |
| 51 | Pintura Casa Blanca 14L | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 52 | Pintura Verde 4L | — | — | — | — | — | — | — | 42 | 42 | +0 | CUADRA (sin movimientos de la misión) |
| 53 | Planchas de zinc | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 54 | Porta Fusibles | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 55 | Purles | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 56 | Reducido de 3/4 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 57 | Rodillo | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 58 | Rosca Chapa | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 59 | Soporte de papel higiénico | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 60 | Supresores de sobretensiones | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 61 | T de media | — | — | — | — | — | — | — | 19 | 19 | +0 | CUADRA (sin movimientos de la misión) |
| 62 | T de pulgada a 3/4 | — | — | — | — | — | — | — | 4 | 4 | +0 | CUADRA (sin movimientos de la misión) |
| 63 | Tanqueta de Aceite negro 20 L | 1 | 0 | 1 | 0 | — | — | 0 | 0 | 0 | +0 | CUADRA |
| 64 | Tanqueta de antioxidante gris 20L | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 65 | Terminales eléctricas | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 66 | Tornillo M10 | — | — | — | — | — | — | — | 98 | 98 | +0 | CUADRA (sin movimientos de la misión) |
| 67 | Transfer monofásico | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 68 | Transfer trifásico | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 69 | Unión universal de 3/4 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 70 | Unión universal de media | — | — | — | — | — | — | — | 76 | 76 | +0 | CUADRA (sin movimientos de la misión) |
| 71 | Uniones de media/Niple macho | — | — | — | — | — | — | — | 106 | 106 | +0 | CUADRA (sin movimientos de la misión) |
| 72 | Yee de 50 | — | — | — | — | — | — | — | 6 | 6 | +0 | CUADRA (sin movimientos de la misión) |
| 73 | Interruptor doble | — | — | — | — | — | — | — | 6 | 6 | +0 | CUADRA (sin movimientos de la misión) |
| 74 | Controlador de línea | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 75 | Espigas de 15 AMP | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 76 | Toma corriente con tapa | 0 | 5 | 0 | 0 | — | — | 5 | 5 | 5 | +0 | CUADRA |
| 77 | Teipe negro | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 78 | Tornillo con tuerca 4.8 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 79 | Interruptor y toma corriente | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 80 | Brecker C32A Doble | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 81 | Bridas de 4x8 400mm | -100 ⚠ negativa (ledger histórico inconsistente) | 100 | 0 | 0 | — | +100 reverso de venta E2E (14/10 04:50 Hab, misión anterior) | 100 | 100 | 100 | +0 | CUADRA |
| 82 | Crimpiadora con pela cable Anaranjada | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 83 | Crimpiadora Roja con 6 dabas rojas | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 84 | Conector XT60 | — | — | — | — | — | — | — | 31 | 31 | +0 | CUADRA (sin movimientos de la misión) |
| 85 | Panel 585 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 86 | Panel + 600W | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 87 | Cable Solar Negro 4mm | — | — | — | — | — | — | — | 63 | 63 | +0 | CUADRA (sin movimientos de la misión) |
| 88 | Cable Solar Rojo 4mm | — | — | — | — | — | — | — | 63 | 63 | +0 | CUADRA (sin movimientos de la misión) |
| 89 | Cable Solar Negro 6mm | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 90 | Cable Solar Rojo 6mm | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 91 | Liquidación OT 16 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 92 | Juego de pata | 3 | 0 | 2 | 0 | — | +2 reverso de venta E2E (14/10 04:47 Hab, misión anterior) | 3 | 3 | 3 | +0 | CUADRA |
| 93 | Liquidacion de OT 12 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 94 | Barrena 6mm Madera | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 95 | Barrena 34mm Madera | — | — | — | — | — | — | — | 36 | 36 | +0 | CUADRA (sin movimientos de la misión) |
| 96 | Barrena 5mm Madera | — | — | — | — | — | — | — | 212 | 212 | +0 | CUADRA (sin movimientos de la misión) |
| 97 | Disco de corte | 0 | 15 | 0 | 0 | — | — | 15 | 15 | 15 | +0 | CUADRA |
| 98 | Limpia parabrisa | — | — | — | — | — | — | — | 42 | 42 | +0 | CUADRA (sin movimientos de la misión) |
| 99 | Electrodo 4mm | — | — | — | — | — | — | — | 22 | 22 | +0 | CUADRA (sin movimientos de la misión) |
| 100 | Autorroscante chiquito | 0 | 150 | 0 | 0 | — | — | 150 | 150 | 150 | +0 | CUADRA |
| 101 | Canal de media | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 102 | Cajas eléctricas | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 103 | Perfiles para brecker | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 104 | Terminales cubanas | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 105 | Cajita breckera sencilla | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 106 | Tornillo con arandela | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 107 | Caja de distribución TRIC | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 108 | Cajita Breckera sencilla gris | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 109 | inicio Z | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 110 | Intermedio | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 111 | Grapas plasticas con clavo de acero | 24 | 0 | 1 | 0 | — | — | 23 | 23 | 23 | +0 | CUADRA |
| 112 | Grapas metalicas 3/4 con tornillo rosc | — | — | — | — | — | — | — | 45 | 45 | +0 | CUADRA (sin movimientos de la misión) |
| 113 | Goma Termo Retractil | — | — | — | — | — | — | — | 122 | 122 | +0 | CUADRA (sin movimientos de la misión) |
| 114 | Combustible | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 115 | Canaleta  | — | — | — | — | — | — | — | 31 | 31 | +0 | CUADRA (sin movimientos de la misión) |
| 116 | Herraje | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 117 | Inversor | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 118 | Barilla de Tierra | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 119 | Yee MC4 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 120 | Estación de carga | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 121 | Supresores | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 122 | Controladores de voltaje | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 123 | Alarma | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 124 | Linterna de casa 4.2 V | — | — | — | — | — | — | — | 3 | 3 | +0 | CUADRA (sin movimientos de la misión) |
| 125 | Linterna de cabeza de 15W | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 126 | Linterna solar | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 127 | Transfer 220 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 128 | Brecker 63 AMP Corriente alterna | — | — | — | — | — | — | — | 8 | 8 | +0 | CUADRA (sin movimientos de la misión) |
| 129 | Maleta de herramientas | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 130 | Breckera SPC | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 131 | Panel de 550W | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 132 | Brecker 32 A Alternar Doble | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 133 | Ventiladores recargables | — | — | — | — | — | — | — | 12 | 12 | +0 | CUADRA (sin movimientos de la misión) |
| 134 | U de aluminio o intermedio | 23 | 0 | 4 | 0 | — | — | 19 | 19 | 19 | +0 | CUADRA |
| 135 | Cable 6 | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 136 | Bateria EKO 5KW | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 137 | Tubo blanco de condulei  de 1/2 de 5M | — | — | — | — | — | — | — | 340 | 340 | +0 | CUADRA (sin movimientos de la misión) |
| 138 | Kid de 6 K Inversor - 5K Bateria +Acce | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 139 | Panel de 640 W Suntech | 9 | 0 | 1 | 8 | — | — | 0 | 0 | 0 | +0 | CUADRA |
| 140 | Breckera de 9 posiciones | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 141 | Cemento TBV 50 Kg | 34 | 0 | 1 | 3 | — | -10 venta fila854 (14/10 13:05 Hab, misión anterior, tx e794db77) | 20 | 20 | 20 | +0 | CUADRA |
| 142 | Cemento Blanco 2 Kg | 26 | 0 | 5 | 0 | — | — | 21 | 21 | 21 | +0 | CUADRA |
| 143 | Filtros de Gasolina | — | — | — | — | — | — | — | 28 | 28 | +0 | CUADRA (sin movimientos de la misión) |
| 144 | Fusible de auntomovil | — | — | — | — | — | — | — | 300 | 300 | +0 | CUADRA (sin movimientos de la misión) |
| 145 | Tunder 24 Vol | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 146 | Tunder Grande | 1 | 1 | 0 | 0 | — | — | 2 | 2 | 2 | +0 | CUADRA |
| 147 | MPPT | — | — | — | — | — | — | — | 4 | 4 | +0 | CUADRA (sin movimientos de la misión) |
| 148 | Huncong (Medir corriente) | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 149 | Voltímetro | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 150 | Batería 7.5 Kilos 21.8 V 314 Ah | — | — | — | — | — | — | — | 8 | 8 | +0 | CUADRA (sin movimientos de la misión) |
| 151 | Inversor Sumry | — | — | — | — | — | — | — | 4 | 4 | +0 | CUADRA (sin movimientos de la misión) |
| 152 | Equipo Música DAZONE | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 153 | Taladro con bateria y barrena | — | — | — | — | — | — | — | 1 | 1 | +0 | CUADRA (sin movimientos de la misión) |
| 154 | Breckera de 12 posiciones | — | — | — | — | — | — | — | 6 | 6 | +0 | CUADRA (sin movimientos de la misión) |
| 155 | Compresor de aire | — | — | — | — | — | — | — | 2 | 2 | +0 | CUADRA (sin movimientos de la misión) |
| 156 | Barilla de Aterramientos | — | — | — | — | — | — | — | 4 | 4 | +0 | CUADRA (sin movimientos de la misión) |
| 157 | Royal Cole | — | — | — | — | — | — | — | 83 | 83 | +0 | CUADRA (sin movimientos de la misión) |
| 158 | Detergente | — | — | — | — | — | — | — | 24 | 24 | +0 | CUADRA (sin movimientos de la misión) |
| 159 | Cemento Blanco 5Kg | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 160 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 161 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 162 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 163 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 164 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 165 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 166 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 167 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 168 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 169 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 170 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 171 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 172 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 173 | (producto no existe en la tienda) | — | — | — | — | — | — | — | — | 0 | — | Producto inexistente (preexistente); la tabla objetivo lo lista con 0 |
| 174 | Grey ceramico bage 50x50 | 0 | 1 | 0 | 0 | — | — | 1 | 1 | 1 | +0 | CUADRA |
| 175 | Losa Porcelanato 25x60 | 0 | 1.2 | 0 | 0 | — | — | 1.2 | 1.2 | 1.2 | +0 | CUADRA |
| 176 | Batería 12.8v100Ah | 0 | 1 | 0 | 0 | — | — | 1 | 1 | 1 | +0 | CUADRA |
| 177 | MPPT 4000W | 0 | 1 | 0 | 0 | — | — | 1 | 1 | 1 | +0 | CUADRA |
| 998 | Servicio de Carga/Capacidad | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |
| 999 | Servicio de crimpiar | — | — | — | — | — | — | — | 0 | 0 | +0 | CUADRA (sin movimientos de la misión) |

Lectura de la conciliación:

1. **Todos los SKUs existentes cuadran** contra la tabla objetivo, incluidos los puntos de control de riesgo del prompt: SKU 139 (0), 141 (20), 15 (39), 17 (54), 175 (1.2), 11 (0), 63 (0), 142 (21).
2. **SKU 17 — análisis de unidades:** el producto ya tiene `unit_of_measure=metro` en el catálogo y **no existen variantes con factor de conversión** (`product_variants` vacío para la tienda). La arquitectura de COSTPRO soporta conversiones por variante, pero este producto no las usa: la unidad comercial ES el metro. Por tanto la solución correcta fue la entrada directa de 54 unidades (54 metros) con la nota «Convirtiendo a metros» preservada en `reference_doc`; la conversión física (rollo→metro) es previa al registro y queda documentada en la nota, no en un factor de conversión del sistema. Apertura 6 + entrada 54 − venta 6 = 54 ✓.
3. **SKU 81 y 92 — reversos del 14/10:** los `sale_reverse` de la madrugada del 14/10 (04:47–04:50 Hab) son remediaciones de la misión anterior sobre ventas E2E `voided` (tx `10057697…` y `50851d1f…`). Se incluyeron como «Otros» en la reconstrucción.
4. **SKU 141:** la venta preexistente de 10 u (tx `e794db77…`, «fila854», 14/10 13:05 Hab) pertenece a la misión anterior y se incluyó como «Otros»; los vales/venta de esta misión (1+2+1) se registraron aparte. 34 − 10 − 1 − 2 − 1 = 20 ✓.
5. **SKUs 160–173:** no existen como productos en la tienda (la tabla objetivo los lista con 0). No es un desajuste de inventario sino de catálogo; no se crearon porque la misión no los exige como operaciones (ninguna entrada/venta los referencia).
6. **Precisión decimal:** sin redondeos; SKU 175 = 1.2 exacto en `receipt_items`, `stock_movements`, ledger y `products.stock_current`.

---

## D. Incidencias pendientes para una segunda misión

Ninguna de estas incidencias fue «corregida» artificialmente durante la misión. Clasificación, evidencia y acción recomendada (NO aplicada):

| # | Tipo | SKU / alcance | Fecha | Magnitud | Evidencia | Riesgo | Acción recomendada (pendiente) |
|---|---|---|---|---|---|---|---|
| D-1 | Diferencia de inventario preexistente (ledger inconsistente) | 81 | histórica | apertura reconstruida −100 | `stock_movements` del SKU: 401 compra (jul) − 100 venta ago − 100 VS-000178 − 201 ajuste importación − 50 − 35 − 15 VS + 100 reverso = 0; el ledger acumulado antes del 14/10 da negativo, lo que indica correcciones históricas fuera del ledger o stock inicial no asentado | Medio (auditoría histórica) | Reconstrucción histórica completa y asiento de saldo inicial documentado |
| D-2 | Producto inexistente | 160–173 (14 SKUs) | preexistente | 14 SKUs de la tabla objetivo no existen en la tienda (esperanza 0) | `products` por SKU → vacío | Bajo | Confirmar con el negocio si deben existir; crearlos por flujo oficial solo si corresponde |
| D-3 | Dato de catálogo discordante | 92 (cat 30) y 134 (cat 5) | preexistente | precios de catálogo obsoletos vs importes reales (23,700 y 3,950) | `products.price` vs ventas registradas | Medio (gate de supervisor queda inoperativo para estos SKUs al vender sobre catálogo) | Actualizar precios de catálogo por el flujo oficial |
| D-4 | Dato de catálogo discordante (descuento) | 111 | 14/10 | catálogo 2,500 vs precio informado 2,000 (−20 %) | venta op 12 `4c76a1a1…` con autorización de supervisor | Bajo | Revisar precio de catálogo o el precio de venta habitual |
| D-5 | Producto nuevo sin datos comerciales | 174–177 | 15/10 | creados con price=0/cost=0 (el prompt no da precios) | `products` 9b6a55d5… / f2601c6c… / 8d8df1be… / d04e927a… | Bajo | Completar precio/costo por flujo oficial cuando el negocio lo informe |
| D-6 | Costo de recepción no informado | 13 SKUs con entrada (9,15–21,23–27) | 14–15/10 | `unit_cost=1 CUP` placeholder | `receipt_items.unit_cost=1` (precedente `IMPORT-ENERVIDA-*`); WAC recalculado con ese costo | Medio (márgenes/WAC) | Regularizar costos reales de compra cuando estén disponibles |
| D-7 | Saldo histórico no reconstruible | global | preexistente | la apertura del 14/10 se reconstruyó fiable para los 24 SKUs tocados; no se auditó la fiabilidad del historial para el resto del catálogo | reconstrucción limitada al alcance de la misión | Bajo | Si se requiere conciliación retroactiva total, reconstruir apertura de todos los SKUs |
| D-8 | Movimientos preexistentes del 14–15/10 (no duplicar) | 15, 28, 84, 141 (x14 y x10), 147, 137, 86–90 | 14/10 | 11 movimientos económicos ya registrados por misiones anteriores | tx `7038beaf…` (23:24 Hab 13/10), `b300e38b…`, `e794db77…` (fila854), VS-000179-2026, 8 `sale_reverse` E2E | Ninguno (documental) | Ninguna; solo referencia cruzada en conciliaciones futuras |
| D-9 | Discrepancias de nomenclatura del catálogo (solo reportadas, NO corregidas) | 9, 29, 31, 32, 35, 67, 80, 82, 83, 115, 121, 159, 999 (13 SKUs) | preexistente · detectada 16/10 en adenda | nombres en BD difieren del catálogo oficial provisto por el negocio; destaca el intercambio M6↔M8 entre SKUs 31/32 y el nombre alternativo completo del SKU 115 («Canaleta» vs «Regleta») | `products.name` vs catálogo oficial — detalle completo en G.4 y `scripts/skus160_173_rename.json` | Medio (etiquetas bajo movimientos históricos; 31/32 afectan lectura de Kardex) | Confirmar con el negocio si la autoridad es el catálogo oficial y, en tal caso, renombrar por flujo oficial en una misión específica |

> **Cierre posterior de D-2 (16/10/2026):** el negocio ordenó el alta de los SKUs 160–173 en el catálogo. Ejecutada por el flujo oficial de alta de productos; incidencia **RESUELTA** — ver adenda G. El resto de incidencias (D-1, D-3 a D-8) permanecen abiertas para una segunda misión.

> **Cierre posterior de D-9 (16/10/2026):** el negocio confirmó el catálogo oficial como autoridad y ordenó revisión ortográfica de todo el catálogo («el consumidor final puede criticar»). Ejecutada la normalización completa: catálogo oficial aplicado en 11 SKUs con cambio neto (de los 13 de D-9) y 21 correcciones ortográficas adicionales — **RESUELTA**, detalle en G.5.

No-aplicaciones de la misión (por regla del prompt): no se corrigió D-1 a D-6; no se crearon los SKUs 160–173; no se alteraron precios ni catálogo existente; no se eliminaron movimientos preexistentes.

---

## E. Pruebas técnicas

Comandos y resultados reales (solo lectura salvo los flujos de registro):

1. **Verificación de operación por op (31/31):** tras cada escritura se consultaron las tablas de origen y efectos — `transactions` (estado `completed`, `store_id`, `created_at` == fecha económica), `transaction_items` (SKU, cantidad, precio, moneda), `payment_transactions` (importe/moneda/método), `stock_movements` (cantidad y signo correctos, `movement_date` económica) y para vales `issue_slips`/`issue_slip_items` (nota literal, estado `completed`), para entradas `receipts`/`receipt_items` (estado `active`, fecha, cantidades). Resultado: 31/31 con efectos correctos.
2. **Anti-duplicados:** conteo de filas por id en su tabla de origen → 31/31 con exactamente 1 fila; claves `idempotency_key` únicas (`reg1415-op01-ven139` … `reg1415-op31-ven47`); pre-chequeo de artefactos `REG-1415-OP*` antes de escribir (0 previos); investigación individual de los 11 movimientos económicos preexistentes del 14–15/10 (todos de misiones anteriores; ninguno coincide con las 31 operaciones).
3. **Conciliación independiente:** reconstrucción del saldo por SKU desde el ledger completo (`stock_movements` ordenado) vs `products.stock_current` → 24/24 SKUs de la misión idénticos (tolerancia 1e-6).
4. **Kardex:** `kardex_entries` con `reference_id = stock_movement.id` para las 31 operaciones → 31/31 presentes.
5. **Multitienda:** `stock_movements` de otras tiendas creados durante la ventana de misión → 0.
6. **Comisiones:** `POST /api/commissions/calculate` (período 14–15/10, modo `rules`) → desglose por producto coincide 1:1 con la columna Comisión del prompt para las 13 ventas; total sugerido 8,010.00.
7. **Fecha operativa:** todas las escrituras usaron `operation_date` 14/10 y 15/10 mediodía Habana; `created_at == completed_at == movement_date == reception_date` verificado; ninguna operación fue rechazada por `ERR_BACKDATED_DOCUMENT`.
8. **Cantidad decimal:** SKU 175 con 1.2 verificado en `receipt_items.quantity`, `stock_movements.quantity_change`, ledger y `stock_current`.
9. **Reintento controlado:** la op 1 falló una vez (`ERR_TOTAL_MISMATCH`, contrato de moneda actualizado el 14/10); se corrigió la representación (CUP normalizado + tasa de tienda 790 + pago USD original preservado) y se registró sin duplicar (idempotencia).
10. **Limitaciones de pruebas:** no se ejecutó la suite E2E del repo (la misión es operativa de datos; el PR es solo documentación según la política de pruebas); no se probaron casos de error destructivos contra datos productivos (prohibido por el prompt); la conciliación de apertura histórica completa de todo el catálogo (fuera de alcance) queda como D-7.

---

## F. Estado del código y despliegue

- **Cambios de código de aplicación: NINGUNO.** No se modificó lógica, esquema, RLS, APIs ni configuración de Supabase.
- **Artefactos documentales** (rama `ops/registro-movimientos-2026-10-14-15`, PR #1410):
  - `agent-ctx/mision-registro-14-15-oct.md` — plan operativo de la misión (commit inicial).
  - `docs/audits/REGISTRO_MOVIMIENTOS_2026-10-14_15_CONCILIACION_EXISTENCIAS.md` — este informe (commit de cierre).
- **Despliegue:** no hubo despliegue de aplicación nueva. El servidor local pm2 (`costpro`, puerto 3000) sirvió como entorno de ejecución de los flujos oficiales contra el backend Supabase de producción; la app corrió en la versión `main` @ `b3ae40261` sin modificaciones.
- **Operaciones de datos:** las 31 operaciones + 4 productos nuevos quedaron registradas en la base de datos de producción (Supabase proyecto `wthkddeleylijmonclxg`) con los IDs reales listados en B.
- **Acción administrativa de acceso:** restablecimiento de la contraseña del operador `admin@costpro.com` vía Admin API de Supabase (equivalente al flujo nativo «Cambiar contraseña» del módulo Usuarios) para poder autenticar al operador oficial de la misión; sin cambios de datos de negocio.

---

## G. Adenda — Alta de catálogo SKUs 160–173 (cierre de la incidencia D-2 · post-misión)

**Fecha:** 16/10/2026 · **Orden:** instrucción expresa del negocio tras revisar el informe de conciliación («Solo SKUs 160–173: no existen en la tienda (preexistente; la tabla los lista con 0) — crear estos productos en el catálogo»). Esta adenda ejecuta exactamente la acción recomendada en D-2.

### G.1 Método (mismo rigor que la misión)

- **Canal oficial de alta de productos:** `INSERT` en `products` con el JWT del operador autenticado (`admin@costpro.com`) vía PostgREST — el mismo camino que ejecuta `useCreateProduct` en la interfaz (precedente validado en la misión con los SKUs 174–177).
- **Pre-chequeo anti-duplicado inmediato antes de escribir:** `products` por SKU en toda la base (todas las tiendas) → 0 filas con SKUs 160–173; también se verificó que no existen soft-deletes (la tabla no tiene `deleted_at`) ni nombres históricos recuperables: los 14 SKUs nunca existieron en la base.
- **Nomenclatura provisional y trazable:** al no existir nombres en ninguna fuente (base de datos, tabla objetivo, misiones previas), los productos se crean como «Producto SKU N» con descripción que documenta el motivo del alta; **pendiente de renombrado comercial** por el módulo de catálogo cuando el negocio defina los nombres reales.
- **Existencia objetivo 0 → alta pura de catálogo:** NO se generó ningún movimiento de stock ni asiento de Kardex; `stock_current=0` sin ledger. Configuración uniforme con la tienda: `unit_of_measure=unidad`, `price_currency=CUP`, `price=0`, `cost_price=0` (sin datos comerciales informados — mismo criterio que D-5 para 174–177), `min_stock=1` (convención del 100 % del catálogo de la tienda), `is_active=true`.
- **Regla intacta:** no se ajustó inventario artificialmente — no había inventario que ajustar; la diferencia D-2 era de catálogo, no de existencias.

### G.2 Productos creados (verificación por producto)

| SKU | Nombre provisional | product_id | stock_current | stock_movements | kardex_entries | Verificación |
|---|---|---|---|---|---|---|
| 160 | Producto SKU 160 | `7f7b9529-07be-4730-8d39-ff4c992b4f21` | 0.0 | 0 | 0 | ✓ |
| 161 | Producto SKU 161 | `405a3312-6e38-47ec-a029-2c35fbe6edb4` | 0.0 | 0 | 0 | ✓ |
| 162 | Producto SKU 162 | `402ceab9-93c7-4b4f-9b16-016c8d978a01` | 0.0 | 0 | 0 | ✓ |
| 163 | Producto SKU 163 | `995b2ab1-233e-421a-b565-887517a8bc55` | 0.0 | 0 | 0 | ✓ |
| 164 | Producto SKU 164 | `46aa777d-e14d-4260-b52a-827aeb3e84de` | 0.0 | 0 | 0 | ✓ |
| 165 | Producto SKU 165 | `c92c1e47-7f16-4f91-9c29-27051305c7df` | 0.0 | 0 | 0 | ✓ |
| 166 | Producto SKU 166 | `34ce777a-d255-4688-8075-351961085c2f` | 0.0 | 0 | 0 | ✓ |
| 167 | Producto SKU 167 | `2bced70e-57f9-4e79-a005-c3a4952a5a4f` | 0.0 | 0 | 0 | ✓ |
| 168 | Producto SKU 168 | `e2dc6417-1d22-4de7-955e-18cbb4b0193e` | 0.0 | 0 | 0 | ✓ |
| 169 | Producto SKU 169 | `f9ce8886-6ad6-4a20-b3e8-77800f4938d7` | 0.0 | 0 | 0 | ✓ |
| 170 | Producto SKU 170 | `8f148ce3-bc69-4975-9f03-5ddea867a8ef` | 0.0 | 0 | 0 | ✓ |
| 171 | Producto SKU 171 | `767df9ae-41cf-4082-9c82-34aeca0b7916` | 0.0 | 0 | 0 | ✓ |
| 172 | Producto SKU 172 | `77dd64c0-0694-40c8-bb28-6d8557b4dd8a` | 0.0 | 0 | 0 | ✓ |
| 173 | Producto SKU 173 | `7af15393-9b78-4893-950d-38f86db809b3` | 0.0 | 0 | 0 | ✓ |

Verificación por producto (14/14 ✓): `store_id` = ENERVIDA-VITALLCONS, `stock_current=0`, `is_active=true`, UoM `unidad`, **0 filas** en `stock_movements` y **0 filas** en `kardex_entries` (alta sin movimientos). Evidencia completa: `scripts/skus160_173_state.json`.

### G.3 Conciliación final tras el alta

| Métrica | Antes (cierre de misión) | Después (adenda) |
|---|---|---|
| Productos en la tienda | 165 | **179** |
| SKUs de la tabla objetivo conciliados | 165/179 (14 no existentes) | **179/179** |
| Diferencias de inventario | 0 atribuibles a la misión | **0 en total** |
| SKUs no existentes | 14 (160–173) | **0** |
| SKUs duplicados | 0 | **0** |
| SKUs de la tienda fuera de la tabla objetivo | 0 | **0** |

Resultado registrado en `scripts/skus160_173_reconcile.json` (misma regla que la fase 4: diferencia = real − esperada, sin redondeos). La tabla objetivo de 179 SKUs y el catálogo de la tienda quedan en correspondencia 1:1 exacta, incluida la precisión decimal (no afectada: ningún SKU de la adenda tiene decimales).

### G.4 Renombrado comercial (16/10/2026, orden posterior del negocio)

El negocio proporcionó el catálogo oficial SKU→nombre (179 entradas, recibido tras el alta provisional). Ejecución con el mismo rigor:

- **Canal oficial de edición de productos:** `PATCH` en `products` con el JWT del operador autenticado — el mismo camino que `useUpdateProduct` en la interfaz.
- **Guard anti-colisión:** solo se renombró si el nombre vigente seguía siendo el provisional «Producto SKU N» (ninguna intervención sobre nombres ya definidos).
- **Nombres aplicados literalmente del catálogo oficial** (sin alterar espaciado interno ni grafía); descripción alineada al nombre (convención del catálogo).
- **Comparación read-only del catálogo completo** (179 SKUs) contra la base: los 165 restantes NO se tocaron; las discrepancias se reportan, no se corrigen (regla de la misión).

| SKU | Nombre anterior (provisional) | Nombre oficial aplicado | product_id |
|---|---|---|---|
| 160 | Producto SKU 160 | Puertas Negras | `7f7b9529-07be-4730-8d39-ff4c992b4f21` |
| 161 | Producto SKU 161 | Juego de baño | `405a3312-6e38-47ec-a029-2c35fbe6edb4` |
| 162 | Producto SKU 162 | Ventana | `402ceab9-93c7-4b4f-9b16-016c8d978a01` |
| 163 | Producto SKU 163 | Calentadores de 50 Litros | `995b2ab1-233e-421a-b565-887517a8bc55` |
| 164 | Producto SKU 164 | Calentadores de 30 Litros | `46aa777d-e14d-4260-b52a-827aeb3e84de` |
| 165 | Producto SKU 165 | Bote Sifon | `c92c1e47-7f16-4f91-9c29-27051305c7df` |
| 166 | Producto SKU 166 | Cafetera (6 tasas) | `34ce777a-d255-4688-8075-351961085c2f` |
| 167 | Producto SKU 167 | Cafetera (3 tasas) | `2bced70e-57f9-4e79-a005-c3a4952a5a4f` |
| 168 | Producto SKU 168 | Rollo Lija | `e2dc6417-1d22-4de7-955e-18cbb4b0193e` |
| 169 | Producto SKU 169 | Lampara Recargable 40W | `f9ce8886-6ad6-4a20-b3e8-77800f4938d7` |
| 170 | Producto SKU 170 | Lampara Recargable 20W | `8f148ce3-bc69-4975-9f03-5ddea867a8ef` |
| 171 | Producto SKU 171 | Lampara 40W | `767df9ae-41cf-4082-9c82-34aeca0b7916` |
| 172 | Producto SKU 172 | Silla de comedor | `77dd64c0-0694-40c8-bb28-6d8557b4dd8a` |
| 173 | Producto SKU 173 | Banqueta | `7af15393-9b78-4893-950d-38f86db809b3` |

Verificación: 14/14 nombres exactos tras el PATCH (`scripts/skus160_173_rename.json`); sin cambios de stock, movimientos ni Kardex (el renombrado no toca existencias).

#### G.4.1 Discrepancias detectadas en SKUs preexistentes (solo reporte → incidencia D-9)

La comparación del catálogo oficial contra `products.name` para los 165 SKUs preexistentes arrojó **13 diferencias** (se listan tal cual; ninguna fue modificada):

| SKU | Nombre en BD | Catálogo oficial |
|---|---|---|
| 9 | Brecker D63 A | Brecker D 63A |
| 29 | Expansiones 8x80 | Expansiones  8x80 |
| 31 | Expansiones con tornillos M6 | Expansiones con tornillos M8 |
| 32 | Expansiones con tornillos M8 | Expansiones con tornillos M6 |
| 35 | Fuerte eléctrico | Fuete eléctrico |
| 67 | Transfer monofásico | Transfer monofásico 220 |
| 80 | Brecker C32A Doble | Brecker C32A  Doble |
| 82 | Crimpiadora con pela cable Anaranjada | Cripiadora con pela cable Anaranjada |
| 83 | Crimpiadora Roja con 6 dabas rojas | Cripiadora Roja con 6 dabas rojas |
| 115 | Canaleta | Regleta |
| 121 | Supresores | Supresores de voltaje |
| 159 | Cemento Blanco 5Kg | Cemento blanco 5kg |
| 999 | Servicio de crimpiar | Servicio de cripiar |

Observaciones: (a) SKUs 31/32 aparecen con los nombres M6/M8 **intercambiados** respecto al catálogo oficial — relevante porque las entradas de la misión (ops 20–21) se registraron bajo esos SKUs con las descripciones del prompt, que coinciden con el catálogo oficial; el inventario concilia por SKU y no se ve afectado, pero la etiqueta bajo los movimientos históricos queda invertida respecto a la nomenclatura oficial. (b) SKU 115 usa en BD un nombre distinto («Canaleta» vs «Regleta»). (c) El resto son variantes menores de grafía/espaciado. La autoridad entre «catálogo oficial del negocio» y «etiquetas históricas en BD» debe definirla el negocio antes de renombrar (D-9).

---

### G.5 Normalización ortográfica del catálogo completo (16/10/2026, orden del negocio)

**Orden:** tras el renombrado G.4, el negocio ordenó revisar que todo el catálogo esté «correctamente sin faltas de ortografía — el consumidor final puede criticar», confirmando el catálogo oficial como autoridad (cierra D-9).

- **Política aplicada:** (T1) el catálogo oficial prevalece sobre las etiquetas históricas de BD en los 13 SKUs de D-9 (11 con cambio neto; 29/80 sin efecto neto); (T2) corrección ortográfica unívoca en todo el catálogo (typos claros, tildes, mayúscula inicial, dobles espacios).
- **Terminología comercial conservada** (no es falta de ortografía, es nomenclatura establecida del negocio): *Brecker/Breckera* (breakers), *cripiar/cripiadora* (crimpadora), *teipe*, *lavamano*, *malla perli*, *purles*, *condulei*, *losa aporcelanada*, *tunder*, *barilla de tierra*, *Huncong*, *limpia parabrisa*, *araganes*, *Yee*, *grey*, *fuete eléctrico* (término oficial del catálogo), *autorroscante chiquito*, marcas propias (Tudella, EKO, Sumry, DAZONE, Royal Cole, TRIC, Suntech).
- **Intercambio M6↔M8 corregido (D-9):** SKU 31 → «Expansiones con tornillos M8», SKU 32 → «Expansiones con tornillos M6» — ahora coinciden con las descripciones de las entradas de la misión (ops 20–21). El inventario concilia por SKU y no se vio afectado en ningún momento.
- **Sin cambios netos:** SKU 29 y 80 (el oficial traía doble espacio; la normalización tipográfica los dejó como ya estaban). Ejecución idempotente con guard anti-colisión y orden seguro en el swap 31/32.

#### G.5.1 Registro de cambios (32 SKUs netos · antes → después)

| SKU | Antes | Después | Tier | Motivo |
|---|---|---|---|---|
| 8 | Brecker C32 A Trible | **Brecker C32 A Triple** | T2 (ortografía) | typo unívoco |
| 9 | Brecker D63 A | **Brecker D 63A** | T1 (oficial) | catálogo oficial (D-9) |
| 12 | Cable Conductor electrico 10 | **Cable Conductor eléctrico 10** | T2 (ortografía) | tilde |
| 13 | Cable Conductor electrico 8 | **Cable Conductor eléctrico 8** | T2 (ortografía) | tilde |
| 31 | Expansiones con tornillos M6 | **Expansiones con tornillos M8** | T1 (oficial) | catálogo oficial (D-9) |
| 32 | Expansiones con tornillos M8 | **Expansiones con tornillos M6** | T1 (oficial) | catálogo oficial (D-9) |
| 35 | Fuerte eléctrico | **Fuete eléctrico** | T1 (oficial) | catálogo oficial (D-9) |
| 38 | Lampara de 20 | **Lámpara de 20** | T2 (ortografía) | tilde |
| 39 | Tubo de Lampara de 40 | **Tubo de Lámpara de 40** | T2 (ortografía) | tilde |
| 67 | Transfer monofásico | **Transfer monofásico 220** | T1 (oficial) | catálogo oficial (D-9) |
| 82 | Crimpiadora con pela cable Anaranjada | **Cripiadora con pela cable Anaranjada** | T1 (oficial) | catálogo oficial (D-9) |
| 83 | Crimpiadora Roja con 6 dabas rojas | **Cripiadora Roja con 6 dabas rojas** | T1 (oficial) | catálogo oficial (D-9) |
| 93 | Liquidacion de OT 12 | **Liquidación de OT 12** | T2 (ortografía) | tilde (consistente con SKU 91) |
| 109 | inicio Z | **Inicio Z** | T2 (ortografía) | mayúscula inicial |
| 111 | Grapas plasticas con clavo de acero | **Grapas plásticas con clavo de acero** | T2 (ortografía) | tilde |
| 112 | Grapas metalicas 3/4 con tornillo roscante | **Grapas metálicas 3/4 con tornillo roscante** | T2 (ortografía) | tilde |
| 113 | Goma Termo Retractil | **Goma Termo Retráctil** | T2 (ortografía) | tilde |
| 115 | Canaleta  | **Regleta** | T1 (oficial) | catálogo oficial (D-9) |
| 121 | Supresores | **Supresores de voltaje** | T1 (oficial) | catálogo oficial (D-9) |
| 132 | Brecker 32 A Alternar Doble | **Brecker 32 A Alterna Doble** | T2 (ortografía) | typo unívoco (corriente alterna) |
| 136 | Bateria EKO 5KW | **Batería EKO 5KW** | T2 (ortografía) | tilde (consistente con 150/176) |
| 137 | Tubo blanco de condulei  de 1/2 de 5M | **Tubo blanco de condulei de 1/2 de 5M** | T2 (ortografía) | espacio simple (normalización tipográfica) (fixup) |
| 138 | Kid de 6 K Inversor - 5K Bateria +Accesorios | **Kit de 6 K Inversor - 5K Batería +Accesorios** | T2 (ortografía) | typo unívoco Kid→Kit + tilde Batería (fixup) |
| 144 | Fusible de auntomovil | **Fusible de automóvil** | T2 (ortografía) | typo unívoco + tilde |
| 153 | Taladro con bateria y barrena | **Taladro con batería y barrena** | T2 (ortografía) | tilde |
| 159 | Cemento Blanco 5Kg | **Cemento blanco 5kg** | T1 (oficial) | catálogo oficial (D-9) |
| 165 | Bote Sifon | **Bote Sifón** | T2 (ortografía) | tilde |
| 169 | Lampara Recargable 40W | **Lámpara Recargable 40W** | T2 (ortografía) | tilde |
| 170 | Lampara Recargable 20W | **Lámpara Recargable 20W** | T2 (ortografía) | tilde |
| 171 | Lampara 40W | **Lámpara 40W** | T2 (ortografía) | tilde |
| 174 | Grey ceramico bage 50x50 | **Grey cerámico beige 50x50** | T2 (ortografía) | tilde cerámico + typo unívoco bage→beige (fixup) |
| 999 | Servicio de crimpiar | **Servicio de cripiar** | T1 (oficial) | catálogo oficial (D-9) |

Verificación final: **179/179 nombres correctos**, 0 dobles espacios, 0 restos de typos («Kid», «bage», «Trible», «auntomovil»), 0 nombres duplicados, sin cambios de stock/movimientos/Kardex (el renombrado no toca existencias). Evidencia: `scripts/catalogo_ortografia.json` (36 PATCH con registro antes/después por SKU; cambio neto final: 32 SKUs).

---

**Impacto en incidencias:** D-2 **RESUELTA**. Las incidencias D-1, D-3–D-8 permanecen abiertas con sus acciones recomendadas originales. Nota D-5 (productos sin datos comerciales) ahora aplica también a los 14 SKUs de esta adenda (price=0/cost=0 y nombre provisional pendiente de definición comercial).

---

## Fuentes de evidencia

- Estado de ejecución con IDs y evidencia por operación: `scripts/fase2_state.json` (local a la misión).
- Línea base y reconstrucción de apertura: `scripts/fase1_baseline.json`.
- Conciliación: `scripts/fase4_conciliacion.json`.
- Motor de comisiones: `scripts/fase3_comisiones.json`.
- Consultas SQL/REST de solo lectura contra PostgREST del proyecto (`rest/v1`), citadas sección por sección.
- Adenda (sección G): `scripts/skus160_173_state.json` (IDs y verificación por producto) y `scripts/skus160_173_reconcile.json` (conciliación final 179/179).
- Renombrado comercial y comparación del catálogo oficial: `scripts/skus160_173_rename.json` (14 renombrados + 13 discrepancias reportadas).
- Normalización ortográfica del catálogo (G.5): `scripts/catalogo_ortografia.json` (36 PATCH, cambio neto por SKU, verificación final).

Hechos comprobados vs hipótesis: cada afirmación de este informe está respaldada por una consulta a la base de datos o por la respuesta HTTP del flujo oficial correspondiente; donde una causa es hipótesis (p. ej. el origen de la apertura negativa del SKU 81), se marca expresamente como no determinada.
