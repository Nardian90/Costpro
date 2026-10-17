# REGISTRO DE OPERACIONES 2026-10-16 — ENERVIDA-VITALLCONS

**Misión:** Registro de operaciones del 16/10/2026 y preparación de conciliación integral
**Tienda:** ENERVIDA-VITALLCONS (`5e6fe821-5465-48b1-b3f1-3aa3182edc38`)
**Usuario ejecutor:** Admin CostPro (`051c6157-600b-425e-b8c0-72388bacf541`, membresía `admin` activa en la tienda — permisos de venta, recepción y vales de salida)
**Fecha de ejecución real:** 17/10/2026 · **Fecha económica de las operaciones:** 16/10/2026 12:00 (America/Havana, convención de la app)
**Mecanismo:** RPCs oficiales de la aplicación (`create_sale_v2`, `create_vale_salida`) invocadas con el mismo contrato que la API del POS (`service_role` + `p_user_id` del ejecutor real), con `idempotency_key` determinista, validaciones íntegras, triggers, Kardex, auditoría y `validate_operation_date` activos. **No se ejecutó ningún INSERT/UPDATE directo sobre tablas de negocio ni se alteró stock manualmente.**

## 1. Preparación (Fase 1)

- Repositorio: `Nardian90/Costpro`, rama de misión sobre `main` (`295cae72e`, incluye PRs #1415/#1416 de la misión MISION-FLEX previa).
- Fecha máxima de operación de la tienda previa al registro: `2026-10-16T16:00:00+00:00` (12:00 HV del propio 16/10) → el registro con fecha económica 16/10/2026 es **legítimo** (lookback de 6 meses de `validate_operation_date`, sin `ERR_BACKDATED_DOCUMENT`). No se reabrieron jornadas ni se alteraron operaciones históricas.
- **Idempotencia:** se verificaron `transactions`, `transaction_items`, `issue_slips`, `receipt_items` y `stock_movements` del 16/10/2026 para los 14 SKU objetivo → **0 coincidencias**. Las 20 filas se clasificaron: 19 «No registrada y lista para procesar», 1 «Bloqueada por regla de negocio / pendiente de información» (fila 20).
- Snapshot de stock previo (canónico `inventory`): 15→39, 22→77, 48→37, 81→100, 84→31, 87→63, 88→63, 108→1, 113→122, 128→8, 139→0, 141→20, 157→83, 158→24.
- Precios de catálogo verificados contra importes de la fuente: coincidencia exacta en 158 (800), 48 (250×25=6,250), 15 (10,000), 141 (20,000; ×4=80,000), 113 (100), 84 (6,500), 157 (2,500) y 128 en USD (20 USD; ×2=40 USD). No se inventó ni alteró ningún precio.

## 2. Resultado por operación (Fase 2/3)

| N.º | Código | Tipo | Cant. | Estado | Referencia | Efecto en inventario verificado | Observaciones |
|---:|---|---|---:|---|---|---|---|

| 1 | 141 | VS | 1 | Registrada y verificada | VS-000185-2026 | Salida de 1 verificada en Kardex (issue_slip_out) | Nota conservada: Tienda Pueblo |
| 2 | 81 | VS | 100 | Registrada y verificada | VS-000186-2026 | Salida de 100 verificada en Kardex (issue_slip_out) | Nota conservada: OT/Ferro |
| 3 | 158 | Ventas | 1 | Registrada y verificada | fa1943c6… | Salida de 1 verificada en Kardex (sale) | Total 800.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 4 | 87 | VS | 63 | Registrada y verificada | VS-000187-2026 | Salida de 63 verificada en Kardex (issue_slip_out) | Nota conservada: OT/Ferro |
| 5 | 88 | VS | 63 | Registrada y verificada | VS-000188-2026 | Salida de 63 verificada en Kardex (issue_slip_out) | Nota conservada: OT/Ferro |
| 6 | 22 | VS | 10 | Registrada y verificada | VS-000189-2026 | Salida de 10 verificada en Kardex (issue_slip_out) | Nota conservada: OT/Ferro |
| 7 | 158 | Ventas | 1 | Registrada y verificada | 2e1b7f1d… | Salida de 1 verificada en Kardex (sale) | Total 800.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 8 | 158 | Ventas | 1 | Registrada y verificada | 725b0f96… | Salida de 1 verificada en Kardex (sale) | Total 800.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 9 | 48 | Ventas | 25 | Registrada y verificada | d5d188e0… | Salida de 25 verificada en Kardex (sale) | Total 6250.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 10 | 128 | Ventas | 2 | Registrada y verificada | d7c8ef72… | Salida de 2; total 31,600 CUP = 40 USD × tasa de tienda 790 | Pago en USD convertido por la tasa oficial de la tienda (store_exchange_rates).Comisión de origen 200.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 11 | 15 | VS | 2 | Registrada y verificada | VS-000190-2026 | Salida de 2 verificada en Kardex (issue_slip_out) | Nota conservada: Belki |
| 12 | 15 | Ventas | 1 | Registrada y verificada | be8ab140… | Salida de 1 verificada en Kardex (sale) | Total 10000.0 CUP = precio de catálogo × cantidad (sin diferencias).Comisión de origen 120.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 13 | 141 | Ventas | 4 | Registrada y verificada | a1622a80… | Salida de 4 verificada en Kardex (sale) | Total 80000.0 CUP = precio de catálogo × cantidad (sin diferencias).Comisión de origen 800.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 14 | 128 | Ventas | 1 | Registrada y verificada | 8ab7becf… | Salida de 1; total canónico 15,800 CUP (20 USD × tasa 790) | Sobrepago +200 CUP documentado con payment_incidents + auditoría SALE_PAYMENT_INCIDENT; nota automática en la venta.Comisión de origen 100.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 15 | 113 | Ventas | 1 | Registrada y verificada | f44d7775… | Salida de 1 verificada en Kardex (sale) | Total 100.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 16 | 84 | Ventas | 1 | Registrada y verificada | 89771be2… | Salida de 1 verificada en Kardex (sale) | Total 6500.0 CUP = precio de catálogo × cantidad (sin diferencias).Comisión de origen 50.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 17 | 108 | Ventas | 1 | Registrada y verificada | 1df5d727… | Salida de 1; total canónico 0 (precio de catálogo 0) | Sobrepago +12,000 CUP documentado; discrepancia de precio de catálogo remitida a decisión. |
| 18 | 141 | Ventas | 1 | Registrada y verificada | 9a678987… | Salida de 1 verificada en Kardex (sale) | Total 20000.0 CUP = precio de catálogo × cantidad (sin diferencias).Comisión de origen 200.00 (liquidación oficial diferida al módulo de comisiones por reglas/período; no existe flujo de comisión por venta individual). |
| 19 | 157 | Ventas | 1 | Registrada y verificada | a8621e02… | Salida de 1 verificada en Kardex (sale) | Total 2500.0 CUP = precio de catálogo × cantidad (sin diferencias). |
| 20 | 139 | Entrada | 2 | Pendiente de información | — | — (no ejecutada) | register_reception exige proveedor (ERR_SUPPLIER_REQUIRED) y unit_cost>0 (ERR_INVALID_UNIT_COST); la fuente no aporta ninguno de los dos. Pendiente de decisión del propietario. |

**Estados:** 19 «Registrada y verificada» (persistencia + Kardex + saldo verificados), 1 «Pendiente de información» (fila 20). Ninguna «Ya registrada previamente» (no hubo duplicados que omitir) ni «Fallida».

## 3. Evidencia de persistencia

- **Ventas (13):** `transactions.status='completed'`, `created_at = completed_at = 2026-10-16T16:00:00+00`, ítems en `transaction_items` con `price_at_sale` y `exchange_rate` por línea (SKU 87/88 en metros, SKU 128 con `currency='USD'`, `exchange_rate=790` de `store_exchange_rates`). Totales recalculados por el servidor (`calculated_total`) y `ERR_TOTAL_MISMATCH` como defensa.
- **Vales de salida (6):** `issue_slips.status='completed'`, numeración oficial `VS-000185-2026` … `VS-000190-2026`, nota de origen conservada (Tienda Pueblo / OT/Ferro / Belki), descuento de stock inmediato vía `register_stock_movement('issue_slip_out')` con costo server-side (`cost_average`).
- **Auditoría:** 2 eventos `SALE_PAYMENT_INCIDENT` (filas 14 y 17) con total, recibido, diferencia, incidencias JSON y usuario; evento por venta en la misma transacción (idempotente).
- **Kardex del día:** efectos brutos exactos por SKU: 15→−3, 22→−10, 48→−25, 81→−100, 84→−1, 87→−63, 88→−63, 108→−1, 113→−1, 128→−3, 141→−6, 157→−1, 158→−3 (139 sin movimiento). Sin movimientos duplicados (1 movimiento por venta/vale, 2-3 en SKU con múltiples operaciones).

## 4. Incidencias y hallazgos

1. **Fila 14 (SKU 128, 16,000 CUP por producto de 20 USD):** el total canónico a tasa de tienda (790) es 15,800 CUP; la fuente registra 16,000 CUP recibidos → **sobrepago +200 CUP** registrado con `payment_incidents` (política MISION-FLEX vigente), nota automática y evento de auditoría. Posible causa: redondeo del cajero o tasa 800 usada manualmente ese día; requiere decisión sobre vuelto/tratamiento.
2. **Fila 17 (SKU 108, efectivo 12,000 CUP con precio de catálogo 0):** la venta se registró al precio de catálogo (0) según la regla «no alterar el precio», y el importe recibido quedó documentado como **sobrepago +12,000 CUP**. El precio 0 del catálogo es casi con seguridad un error de carga (referencia interna del negocio sugiere 12,000); **no se corrigió** — pendiente de autorización del propietario.
3. **Comisiones (filas 10, 12, 13, 14, 16, 18: 200/120/800/100/50/200):** COSTPRO no registra comisión por venta individual; el mecanismo oficial es el módulo de comisiones (reglas por período sobre `workers`/`commission_rules` → `commission_payments`). Se documentan como dato de origen; **no se sumaron al precio ni se duplicaron**. La liquidación queda sujeta a ese módulo y a la atribución de worker que el propietario autorice.
4. **Fila 20 (entrada SKU 139 ×2):** `register_reception` exige `p_supplier` y `unit_cost > 0` (errores `ERR_SUPPLIER_REQUIRED` / `ERR_INVALID_UNIT_COST`); la fuente no aporta proveedor ni costo y la misión prohíbe inventarlos → **pendiente de información**. El inventario del SKU 139 permanece en 0 hasta tanto se autorice el dato faltante.
5. **Nota sobre transparencia de mecanismo:** las operaciones se ejecutaron vía las RPCs transaccionales oficiales (el mismo contrato que invoca `POST /api/pos/checkout` y `POST /api/vale-salida`), no mediante clics de UI ni SQL directo; todas las validaciones de negocio, locks, idempotencia, triggers de inventario/Kardex y auditoría se ejecutaron íntegras.

## 5. Estado del repositorio y despliegue

- Rama de misión: `docs/mision-registro-conciliacion-16-10-2026` (este informe + conciliación + XLSX/CSV de discrepancias). PR de protección abierto contra `main`.
- Migración `20261017000000_pos_payment_incidents_negative_guard` ya aplicada en producción (17/10/2026) — habilita las incidencias de pago utilizadas aquí.
- Servidor local reactivado con pm2 (`costpro`, `bun server.ts`, puerto 3000, `.env` restaurado).

