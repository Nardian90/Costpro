# PROPUESTA DE RECTIFICACIÓN CONTABLE DEFINITIVA — CP-FIN / WAC / COGS
## CP-FIN-VALUATION-RECTIFICATION-003 · FAC-VITALLCONS-001 · SKU 111 y SKU 112
**Estado:** PROPUESTA refinada con evidencia de liquidación verificada (2026-11-15). No ejecutada en producción.
**Precedente:** PROPUESTA_RECTIFICACION_CP_FIN_WAC.md (misión 002, rama chore/valuation-correction-20261115).
**Novedad de esta misión:** el diseño se corrige y precisa con la **situación real de liquidación del
proveedor y del COGS del motor**, verificadas en Fase I (exigencia §6: «no asumir la contrapartida
completa sin comprobar primero la situación real de liquidación»).

---

## 1. Verificaciones previas que condicionan el diseño (Fase I, producción read-only)

| # | Verificación exigida por la misión | Resultado verificado | Consecuencia en el diseño |
|---|---|---|---|
| V-L1 | ¿La obligación con el proveedor sigue pendiente o hay pagos? | `receipts.payment_status='unpaid'`, `paid_amount=0`, `paid_at=null`, vencida desde 2026-07-31; **0 filas en `payment_transactions`** con la FVC o el proveedor; vista `v_purchase_orders_cxp` sin filas de la tienda. Mayor PAS_CXP_PROV: solo créditos de reconocimiento (98 recepciones, 207.256.110,57) y 1 débito de anulación (960) — **no existe PAGO_PROVEEDOR en el mayor**. | La contrapartida **PAS_CXP_PROV es real y 100% pendiente**: reducir la deuda por el exceso es económicamente exacto. Ningún pago previo obliga a tocar caja ni gastos financieros. |
| V-L2 | ¿El COGS de las salidas posteriores ya está contabilizado? | El **motor CP-FIN ya contabilizó 7 CUP** de COGS por las 7 unidades vendidas (5 asientos: FAC-004479-2026 con GAS_COSTO_VENTAS 1,00; 4 POS v2 con 1/3/1/1) — el motor costea a `cost_average=1`, no al uc del kardex. Las 2 ventas con kardex uc=0 **ya tienen su COGS correcto en el mayor**. | **NO se debe debit GAS_COSTO_VENTAS adicional por las ventas**: duplicaría el COGS (7→9). La propuesta de la misión 002 («D GAS_COSTO_VENTAS 2») queda **descartada para producción** — era válida en la réplica E2E de la misión 002 porque su baseline modelaba el COGS contabilizado a valor kardex (5 CUP), no el del motor. |
| V-L3 | ¿Qué salidas posteriores NO están contabilizadas? | 3 vales sin asiento (VS-000037: 4 u; VS-000138: 1 u; VS-000139: 1 u = 6 u × 1 CUP) y 2 ajustes de cuadre sin asiento (18 u × 1 CUP). El vale VS-000223 (1 u salida + 1 u reingreso) no tiene asiento en ninguno de los dos sentidos: **se cancelan entre sí** (neto 0). | El «cierre de brechas documentales» de la rectificación es **24 CUP** (6 GAS_VALES + 18 GAS_PERDIDA_INV), no 26. |
| V-L4 | ¿Los vales contabilizados están a costo correcto? | Sí: GAS_VALES débito 88 CUP por los 6 vales con asiento (VS-148: 1; VS-157: 20; VS-158: 20; VS-165: 10; VS-208: 32 de estos SKU; VS-225: 5) — exactamente 1 CUP por unidad. | Sin ajuste en esos asientos. |
| V-L5 | ¿WAC requiere recálculo? | `cost_average=1` vigente en ambos SKU (fijado nominalmente por GATE16/TAREA-2B 2026-10-06/07, `wac_change_log` 0→1). Con el costo real 1 CUP: entradas a 1, salidas a 1 → WAC cronológico = **1 constante**. | WAC sin cambio material; se registra el evento `rectificacion` (capas revalorizadas). |
| V-L6 | ¿Convención de `cost_value_change`? | **0 en los 1.776/1.776 movimientos de la BD** (el sistema no puebla ese campo). | La rectificación **solo actualiza `unit_cost`**; no introduce la convención `cost_value_change=q×uc` que la misión 002 proponía (inconsistente con el sistema). |
| V-L7 | ¿Patrón de asiento compensatorio existente? | `anulacion` de recepción con `reversal_of` → asiento original: **D PAS_CXP_PROV / C ACT_INVENTARIO** (entrada 960 CUP anulada). | RECT-1 usa exactamente ese patrón canónico del propio sistema. |
| V-L8 | ¿Patrón de asiento de ajuste de inventario? | AJUSTE_INVENTARIO existente: **D GAS_PERDIDA_INV / C ACT_INVENTARIO** (1 CUP). | RECT-2 usa ese patrón para los 18 u de ajustes. |

**Regla de oro del diseño:** cada importe del asiento procede de una fila verificable de producción
(Fase I, hashes en el expediente), no de supuestos.

---

## 2. Importes exactos determinados (§4 de la misión)

| Determinación | Importe exacto | Evidencia |
|---|---|---|
| Reducción de **ACT_INVENTARIO** | **151.299.851,00 CUP** | El exceso jamás fluyó a COGS/vales (salidas costeadas a 0-1 CUP): permanece íntegro en el saldo del mayor. Reversión del asiento original 93bb5da9. |
| Reducción de **PAS_CXP_PROV** | **151.299.851,00 CUP** | Deuda 100% pendiente (V-L1): 151.300.000 reconocidos por las 2 líneas → costo real conjunto 149 CUP. |
| Impacto en **COGS (motor)** | **0 CUP** | Ya correcto: 7 CUP (V-L2). Prohibido debit adicional. |
| Impacto en **GAS_VALES** | **+6,00 CUP** (débito) | VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u), nunca contabilizadas (V-L3). |
| Impacto en **GAS_PERDIDA_INV** | **+18,00 CUP** (débito) | Ajustes de cuadre 18 u sin asiento (V-L3). Patrón V-L8. |
| Impacto en **WAC** | **0 CUP** (evento `rectificacion` registrado) | WAC cronológico = 1 constante (V-L5). |
| Impacto en **kardex** | 26 movimientos de salida con uc=0 → uc=1; 2 capas de compra 1.700.000/680.000 → 1 | Subvaluación de kardex 26 CUP (2 ventas + 6 vales + 18 ajustes unidades). Solo `unit_cost` (V-L6). |
| Impacto en **precio de venta** | **NINGUNO** | 2.000 CUP (111) y 1.000 USD (112) del maestro se conservan intactos. |
| Cuentas de patrimonio usadas | **NINGUNA** | La contrapartida es el pasivo real con el proveedor + cuentas de gasto reales por salidas nunca reconocidas. |

**Asiento RECT-1 — rectificación del reconocimiento** (enlazado, no destructivo):

| Cuenta | Sentido | Importe |
|---|---|---|
| PAS_CXP_PROV | débito | 151.299.851,00 CUP |
| ACT_INVENTARIO | crédito | 151.299.851,00 CUP |

`reversal_of = 93bb5da9-0afd-4325-baad-a275710062c5` (asiento original INTACTO — se conserva el
historial). Documento: `FAC-VITALLCONS-001-RECT` · event `ajuste_manual` · economic_date 2026-07-01.

**Asiento RECT-2 — reconocimiento de salidas nunca contabilizadas** (cierre de brechas documentales):

| Cuenta | Sentido | Importe | Motivo |
|---|---|---|---|
| GAS_VALES | débito | 6,00 CUP | VS-000037 (4 u), VS-000138 (1 u), VS-000139 (1 u) — vales completados sin asiento |
| GAS_PERDIDA_INV | débito | 18,00 CUP | Cuadre importación legacy: sku=111 Δ−1 (1 u), sku=112 Δ−17 (17 u) |
| ACT_INVENTARIO | crédito | 24,00 CUP | Consumo de inventario a costo real 1 CUP/u |

Documento: `FAC-VITALLCONS-001-RECT-SAL` · event `ajuste_manual` · economic_date 2026-11-15.
El par VS-000223 (salida 1 u / reingreso 1 u, ambos sin asiento) **no se contabiliza**: su neto es 0.

---

## 3. Procedimiento canónico (8 pasos, UNA transacción atómica)

> Escape hatch gobernado: `SET LOCAL app.allow_receipt_item_edit='on'` (trigger M021 de inmutabilidad).
> Idempotencia: cada UPDATE con guarda `<> objetivo`; INSERT con id determinista + `ON CONFLICT DO NOTHING`.

### PASO 0 — Respaldo lógico pre-flight (fuera de la transacción)
Extracción read-only de TODAS las filas afectadas con valores anterior/propuesto + SHA-256
(`restore.sql` BEGIN/COMMIT con valores originales): 2 `receipt_items`, cabecera, 21+1
`stock_movements`, asiento 93bb5da9 + 2 movimientos, 2 productos, `wac_change_log`, mayor previo.

### PASO 1 — Corrección de las 2 líneas de recepción
```sql
UPDATE receipt_items SET unit_cost = 1, moneda_recepcion = 'CUP', tasa_cambio_recepcion = 1, updated_at = now()
WHERE receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND (unit_cost <> 1 OR moneda_recepcion <> 'CUP' OR tasa_cambio_recepcion <> 1)
RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes, tasa_cambio_recepcion AS tasa_antes;
-- esperado: 2 filas · SKU 111: 2500 USD@680 → 1 CUP@1 · SKU 112: 1000 USD@680 → 1 CUP@1
```

### PASO 2 — Recálculo de la cabecera
```sql
UPDATE receipts SET total_cost = 40739585.00, updated_at = now()
WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND total_cost <> 40739585.00
RETURNING id, total_cost AS antes;   -- esperado: 1 fila · 192.039.436 → 40.739.585
```

### PASO 3 — Revalorización de las capas de compra (kardex)
```sql
UPDATE stock_movements SET unit_cost = 1
WHERE reference_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND movement_type = 'purchase' AND unit_cost <> 1
RETURNING id, unit_cost AS antes;   -- esperado: 2 filas · 1.700.000→1 · 680.000→1
```
`cost_value_change` NO se toca (V-L6: 0 en 1.776/1.776 filas del sistema).

### PASO 4 — Revalorización de las 26 salidas subvaluadas (kardex)
```sql
UPDATE stock_movements SET unit_cost = 1
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND quantity_change < 0 AND unit_cost = 0
RETURNING id, quantity_change, unit_cost AS antes;  -- esperado: 7 filas · 26 unidades
```
Efecto contable: NINGUNO directo (el mayor se corrige con RECT-2; el COGS del motor ya es correcto).
Efecto kardex: las salidas pasan a costearse a 1 CUP → el kardex cuadra con el mayor.

### PASO 5 — WAC cronológico + `wac_change_log` (evento `rectificacion`, 2 filas)
WAC 1 constante (entradas y salidas a 1 CUP; existencia inicial 0). Insert idempotente con
`source_ref` = decisión del propietario, documento, misión y método (`governed_admin_write`).

### PASO 6 — Asiento RECT-1 (reversión del exceso) — ver §2.
### PASO 7 — Asiento RECT-2 (salidas nunca contabilizadas) — ver §2.
### PASO 8 — Auditoría por fila (valores anteriores/nuevos, actor, fecha, motivo, trace_id)
Una fila `audit_logs` por objeto modificado (`SYSTEM_RECT_VALUATION`, `SYSTEM_RECT_TOTAL`,
`SYSTEM_RECT_MOV_UC`, `SYSTEM_RECT_MOV_SALIDA`, `SYSTEM_RECT_ENTRY`) con `old_data`/`new_data`,
`metadata.mision='CP-FIN-VALUATION-RECTIFICATION-003'`, `metadata.documento='FAC-VITALLCONS-001'`.
`COMMIT`.

---

## 4. Estado final esperado (producción) — antes/después

| Elemento | Antes (verificado 2026-11-15) | Después (esperado) |
|---|---|---|
| `receipts.total_cost` (FVC) | 192.039.436,00 | **40.739.585,00** (preliminar §5) |
| Línea SKU 111 / SKU 112 | 2.500 / 1.000 USD @680 | **1 CUP @1** |
| Capas de compra (kardex) | uc 1.700.000 / 680.000 | **uc 1** |
| 26 salidas subvaluadas | uc 0 | **uc 1** |
| WAC SKU 111/112 | 1 | **1** (evento `rectificacion` en `wac_change_log`) |
| Existencias | 10 / 20 u | 10 / 20 u (intactas) |
| Valor en libros (30 u × 1) | 30 CUP | **30 CUP** |
| COGS motor (7 u vendidas) | 7 CUP | **7 CUP** (intacto — V-L2) |
| GAS_VALES (89 u netas vales) | 88 CUP contabilizados | **94 CUP** (+6 brecha VS-37/138/139) |
| GAS_PERDIDA_INV (18 u ajustes) | 0 CUP contabilizados | **18 CUP** |
| Mayor ACT_INVENTARIO global | 201.699.246,55 | **50.399.395,55** (−151.299.851) |
| Mayor PAS_CXP_PROV global | 207.255.150,57 | **55.955.299,57** (−151.299.851) |
| PAS_CXP_PROV de la FVC | 192.039.436,00 | **40.739.585,00** (deuda real documentable) |
| `payment_status` FVC | unpaid | unpaid (la deuda restante sigue pendiente de pago real) |
| Asientos nuevos | — | RECT-1 + RECT-2 (idempotentes, reversibles) |
| Precios de venta 111/112 | 2.000 CUP / 1.000 USD | **INTACTOS** |

**Identidad final del subconjunto (demostrada en E2E §Fase V):**
`ACT_INVENTARIO neto (SKU 111/112) = 149 (reconocimiento neto) − 7 (COGS) − 94 (vales netos) − 18 (ajustes) = 30 CUP = valor en libros del kardex (30 u × 1).` Cada asiento D=C; cero duplicación; idempotente; reversible byte a byte.

---

## 5. Nota sobre la provisionalidad del total corregido

El total 40.739.585,00 CUP es **PRELIMINAR** (decisión §2 del propietario): subsisten las 71 líneas
no verificables (exposición contingente 24.510.805 CUP) y las 4 discrepancias de moneda. La presente
rectificación **solo** toca las 2 líneas confirmadas. Si el propietario amplía el defecto a más
líneas, el mismo procedimiento canónico se re-ejecuta con los nuevos importes (DP-3).

## 6. Restricciones de ejecución (§9 de la misión)

1. La rectificación de producción requiere **autorización expresa posterior del propietario**
   (revisión de importes finales y del presente procedimiento) — esta misión NO la ejecuta.
2. Ejecución UNA sola vez, en ventana acordada, con el documento fd9d6c88 congelado.
3. Validación post-aplicación con el SQL de verificación del expediente
   (`consultas_sql_independientes_RECTIFICACION-003.sql`, sección «verificación post-rectificación»).
4. Registro de la aplicación (fecha/hora UTC, SQL, hashes del respaldo, idempotencia re-verificada)
   en el expediente `docs/audits/valuation-rectification-003-20261115/`.

## 7. Qué NO cubre esta rectificación (deliberadamente)

- Las 71 líneas no verificables (DP-3) y las 4 de moneda (DP-4) — requieren decisión del propietario.
- La devolución de mercancía vs. pago al proveedor: la deuda restante de 40.739.585 CUP solo se
  cancelará con pagos reales (futuros asientos PAGO_PROVEEDOR con contrapartida de efectivo/banco).
- El residual global de ACT_INVENTARIO (154.137.921,67 CUP por salidas por debajo del costo —
  Fase VII de CP-INVENTORY-TRACEABILITY-RECONCILIATION-001): su tratamiento es conteo físico +
  decisión del propietario.
- El defecto latente de `sync_product_stock()` (ORDER BY con empates no deterministas) — backlog.
