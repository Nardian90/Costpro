# M018 — FASE III de la misión: MIGRACIÓN de los cobros legacy aplicada en producción

**ID misión:** CP-FIN-FINAL-EXECUTION-001 · **Fecha (UTC):** 2026-11-14 ~01:10 · **Canal:** Management API (transaccional, guard CP-INFRA-019 doble flag) · **Autorización:** §5 de la misión (FASE III, pasos 1–11).

## 1. Secuencia ejecutada (11 pasos de la FASE III)

1. **Población reconstruida en producción** (misma consulta del expediente + guards del SQL): 165 ventas / 161 migrables / 4 zelle+CUP — coincide con el expediente del 13/11. Importe de las 161: 3.128.769,9983 CUP (el expediente redondeó a 3.128.770,00).
2. **Importe legacy vs total_amount**: correspondencia EXACTA 165/165 (guard del SQL: |Σ legacy − total| ≤ 0,005).
3. **Sin pagos previos**: 0 filas de pago de cualquier referencia sobre la población (guard NOT EXISTS).
4. **Moneda/naturaleza de cada cobro**: CUP demostrado por los guards del SQL (sale_currency='CUP', ítems CUP, sin carve USD, sin liquidación).
5. **Sin devoluciones/store credit/liquidaciones incompatibles**: verificado 0/0/0.
6. **Claves de idempotencia**: `legacy-mig-v1-<id>[-método]` + `ON CONFLICT DO NOTHING` + `NOT EXISTS`.
7. **DRY-RUN antes de ejecutar**: 161 ventas / 170 filas / 3.128.769,998 CUP — coincide con el expediente → condición de ejecución cumplida.
8. **EJECUCIÓN transaccional v1**: archivo `docs/audits/2026-11-13-migracion-legacy-pagos/MIGRACION.sql` completo (SHA-256 `73fdcd9621dc87beda17cfaaf590de8fde91ec0e4e365fe5050b5adf90a6b5c0`) en UNA llamada → HTTP 201.
9. **Verificación fila a fila (corregida, ver §3)**: 170 filas, 161 ventas; P1 fechas históricas conservadas (payment_date = created_at, 0 desvíos); P2 métodos/monedas originales (cash/transfer, CUP, tasa 1); P5/P7 vinculación a la venta original (ref_type='sale', ref_id=transaction_id=id) 170/170; **Σ por venta == total_amount en 161/161**.
10. **Idempotencia**: re-ejecución del mismo SQL → HTTP 201 y 170 filas/161 ventas se mantienen (0 nuevas).
11. **Sin duplicación de ingreso/asientos**: fin_entries se mantuvo en 4 (0 nuevos — VENTA no tiene evento 'pago': los cobros se agregan al asiento de reconocimiento); fin_posting_errors = 0.

## 2. Resultado

| Concepto | Valor |
|---|---|
| Ventas cubiertas | **161** de 165 (cash 138 · transfer 14 · mixtas 9 → 170 filas) |
| Importe materializado | **3.128.769,9983 CUP** (170 filas, Σamount_cup verificado por venta) |
| 4 zelle+CUP | **SIN filas — bloqueadas** (PT005 intacto): `c5965c77` 15.300 · `cb3052c3` 4.760 · `119a4f5e` 4.760 · `1558287f` 9.520 → 34.340 CUP pendientes de decisión del propietario (opciones a/b/c del expediente #1617) |
| Campos legacy | **INTACTOS** (Σ legacy de completadas: 45.208.654,99 antes y después) — solo se AÑADIERON filas de pago |
| payment_transactions | 944 → **1.114** (+170 exactas) |
| Asientos / errores | 4 / 0 (sin cambios) |

## 3. Nota de transparencia (defecto del verificador, corregido)

La primera corrida de m018 ejecutó la migración correctamente (paso 8 OK) pero su chequeo por FILA comparaba cada componente de pago contra el total de la venta — falso negativo en las 9 ventas mixtas (2 componentes × 9 = 18 filas señaladas). El defecto era del verificador, no de los datos: la corrección verifica POR VENTA (Σ componentes == total) → 161/161 exactas. El chequeo corregido vive en el propio m018 (rama) y la verificación completa post-hoc se ejecutó de inmediato (script de verificación dedicado, salida archivada en `verificacion-produccion.txt`). La migración NO se re-ejecutó para «arreglar» nada: los datos estaban ya correctos y la re-ejecución del paso de idempotencia no insertó nada.

## 4. Efecto sobre la FASE VIII

Las 161 ventas legacy quedan ahora con Σcobros == total_amount → **aptas para el Lote E** (ventas CUP íntegramente cobradas) mediante el backfill histórico ENERVIDA. Las 4 zelle+CUP y las 3 inconsistentes permanecen BLOQUEADAS.
