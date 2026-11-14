# RUNBOOK DE PRODUCCIÓN — RECTIFICACIÓN CONTROLADA
## CP-FIN-VALUATION-RECTIFICATION-003 · FAC-VITALLCONS-001 · SKU 111 y SKU 112
**Estado:** PREPARADO Y DEMOSTRADO (E2E aislado, TODAS LAS PRUEBAS PASS). **NO EJECUTAR sin autorización
expresa del propietario** (DP-6). Ejecutar UNA sola vez (regla de oro 11g) y registrar la aplicación en
este mismo expediente (fecha/hora UTC, SQL, hashes del respaldo).

---

## 0. Precondiciones

- [ ] Autorización expresa del propietario de los importes finales: **40.739.585,00 · −151.299.851,00 ·
      24,00** (RECT-2) y del procedimiento completo (`PROPUESTA_RECTIFICACION_DEFINITIVA_CP_FIN.md`).
- [ ] Ventana acordada; documento fd9d6c88 congelado (sin recepciones/ediciones concurrentes).
- [ ] Operador con acceso service_role por Management API `/database/query` (pooler o API) y escape hatch
      M021 disponible (`SET LOCAL app.allow_receipt_item_edit='on'`).
- [ ] BD E2E aislada disponible para verificación previa opcional (re-ejecutar `m049` = TODAS PASS).

## 1. Valores ANTES (producción congelada, verificados 2026-11-15)

| Objeto | Valor actual exacto |
|---|---|
| `receipts` (fd9d6c88) | `total_cost = 192.039.436,00` · `payment_status='unpaid'` · `paid_amount=0` · `due_date=2026-07-31` |
| `receipt_items` SKU 111 (80a1767b…) | `quantity=49` · `unit_cost=2500` · `moneda_recepcion='USD'` · `tasa_cambio_recepcion=680` |
| `receipt_items` SKU 112 (9c9e6010…) | `quantity=100` · `unit_cost=1000` · `moneda_recepcion='USD'` · `tasa_cambio_recepcion=680` |
| `stock_movements` compra SKU 111 | `unit_cost = 1.700.000` (reference_id=fd9d6c88) |
| `stock_movements` compra SKU 112 | `unit_cost = 680.000` (reference_id=fd9d6c88) |
| Salidas uc=0 (26 u en 7 movimientos) | 2 ventas (2026-07-24, 2026-10-04) + VS-000037 (4) + VS-000138 (1) + VS-000139 (1) + 2 ajustes (Δ−1, Δ−17) |
| Asiento original `93bb5da9-0afd-4325-baad-a275710062c5` | posted · D ACT_INVENTARIO 192.039.436 / C PAS_CXP_PROV 192.039.436 (econ. 2026-07-01) |
| Mayor ACT_INVENTARIO (global) | 201.699.246,55 CUP (D 207.256.112,57 − C 5.556.866,02; sin saldo inicial) |
| Mayor PAS_CXP_PROV (global) | 207.255.150,57 CUP pendientes (C 207.256.110,57 − D 960; **0 pagos**) |
| COGS motor (7 ventas de estos SKU) | 7 CUP (5 asientos: 1+1+3+1+1) — YA CORRECTO |
| GAS_VALES de estos SKU | 88 CUP (6 vales con asiento) |
| Precios de venta | SKU 111: 2.000 CUP · SKU 112: 1.000 (USD maestro) |
| WAC / existencias | SKU 111: WAC 1, 10 u · SKU 112: WAC 1, 20 u |

## 2. Filas a modificar y documentos a crear (plan exacto)

**MODIFICACIONES (en UNA transacción, con escape hatch):**
| Tabla | Filas | Cambio |
|---|---|---|
| `receipt_items` | 2 | uc 2500/1000 USD@680 → **1 CUP@1** (moneda CUP, tasa 1) |
| `receipts` | 1 | `total_cost` 192.039.436 → **40.739.585,00** |
| `stock_movements` | 2 compras | uc 1.700.000/680.000 → **1** |
| `stock_movements` | 7 salidas (26 u) | uc 0 → **1** |

**INSERCIONES (idempotentes, ids deterministas de la misión):**
| Tabla | Filas | Contenido |
|---|---|---|
| `fin_entries` | 1 | **RECT-1**: `FAC-VITALLCONS-001-RECT` · `ajuste_manual` · `reversal_of=93bb5da9-…` · econ. 2026-07-01 |
| `fin_movements` | 2 | D `PAS_CXP_PROV` 151.299.851,00 · C `ACT_INVENTARIO` 151.299.851,00 (CUP@1) |
| `fin_entries` | 1 | **RECT-2**: `FAC-VITALLCONS-001-RECT-SAL` · `ajuste_manual` · econ. 2026-11-15 |
| `fin_movements` | 3 | D `GAS_VALES` 6,00 · D `GAS_PERDIDA_INV` 18,00 · C `ACT_INVENTARIO` 24,00 |
| `wac_change_log` | 2 | evento `rectificacion` (WAC 1→1; source_ref con decisión/misión/método) |
| `audit_logs` | 14 explícitas | 2 VALUATION + 1 TOTAL + 2 MOV_UC + 7 MOV_SALIDA + 2 ENTRY (+1 nativa del trigger `trg_audit_receipt_changes`) |

**El asiento original 93bb5da9 NO se toca.** No se emiten documentos de recepción nuevos (la corrección
es in-place gobernada sobre las líneas + asientos compensatorios enlazados).

## 3. Asientos correctivos esperados (débitos y créditos exactos)

```
RECT-1 (reversión del exceso de reconocimiento — reversal_of → 93bb5da9)
  PAS_CXP_PROV      débito   151.299.851,00 CUP   (reducción de la deuda al proveedor)
  ACT_INVENTARIO    crédito  151.299.851,00 CUP   (eliminación del exceso del activo)

RECT-2 (reconocimiento de salidas nunca contabilizadas — cierre de brechas)
  GAS_VALES         débito           6,00 CUP     (VS-000037: 4 u · VS-000138: 1 u · VS-000139: 1 u)
  GAS_PERDIDA_INV   débito          18,00 CUP     (ajustes cuadre: Δ−1 y Δ−17)
  ACT_INVENTARIO    crédito         24,00 CUP
```

## 4. Impacto esperado (valores DESPUÉS)

| Elemento | Antes | Después | Δ |
|---|---|---|---|
| `receipts.total_cost` FVC | 192.039.436,00 | **40.739.585,00** | −151.299.851,00 |
| Líneas SKU 111/112 | 2.500/1.000 USD@680 | **1 CUP@1** | — |
| Capas compra kardex | uc 1.700.000/680.000 | **uc 1** | — |
| 26 salidas subvaluadas | uc 0 | **uc 1** | kardex +26 CUP de valor de salidas |
| **WAC** SKU 111/112 | 1 | **1** (evento `rectificacion` loggeado) | 0 |
| **COGS** (7 ventas) | 7 CUP (motor) | **7 CUP — INTACTO** | 0 |
| **GAS_VALES** (94 u netas) | 88 CUP | **94 CUP** | +6,00 |
| **GAS_PERDIDA_INV** (18 u) | 0 CUP | **18 CUP** | +18,00 |
| **ACT_INVENTARIO** mayor | 201.699.246,55 | **50.399.395,55** | −151.299.851,00 |
| **PAS_CXP_PROV** mayor | 207.255.150,57 | **55.955.299,57** | −151.299.851,00 |
| Deuda FVC en CXP | 192.039.436,00 | **40.739.585,00** (sigue unpaid hasta pago real) | −151.299.851,00 |
| Existencias / precios de venta | 10/20 u · 2.000/1.000 | **idénticos** | 0 |
| Identidad del subconjunto | — | neto ACT(111/112) = 149 − 7 − 94 − 18 = **30 = valor en libros** | — |

## 5. Procedimiento (orden exacto, UNA transacción)

```sql
BEGIN;
SET LOCAL app.allow_receipt_item_edit = 'on';

-- S1: líneas de recepción → costo real 1 CUP (2 filas)
UPDATE receipt_items SET unit_cost = 1, moneda_recepcion = 'CUP', tasa_cambio_recepcion = 1, updated_at = now()
WHERE receipt_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND (unit_cost <> 1 OR moneda_recepcion <> 'CUP' OR tasa_cambio_recepcion <> 1)
RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes, tasa_cambio_recepcion AS tasa_antes;
-- esperado: 2 filas

-- S2: cabecera → total corregido (1 fila)
UPDATE receipts SET total_cost = 40739585.00, updated_at = now()
WHERE id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND total_cost <> 40739585.00
RETURNING id, total_cost AS antes;   -- 192.039.436 → 40.739.585

-- S3: capas de compra → uc 1 (2 filas; cost_value_change INTACTO — convención del sistema)
UPDATE stock_movements SET unit_cost = 1
WHERE reference_id = 'fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND movement_type = 'purchase' AND unit_cost <> 1
RETURNING id, unit_cost AS antes;    -- 1.700.000→1 · 680.000→1

-- S4: 26 salidas subvaluadas → uc 1 (7 filas)
UPDATE stock_movements SET unit_cost = 1
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND quantity_change < 0 AND unit_cost = 0
RETURNING id, quantity_change, unit_cost AS antes;   -- 26 unidades en 7 filas

-- S5: wac_change_log (2 filas, ids deterministas rect003-wcl-1/2, ON CONFLICT DO NOTHING)
-- S6: fin_entries/fin_movements RECT-1 (reversal_of → 93bb5da9-0afd-4325-baad-a275710062c5)
-- S7: fin_entries/fin_movements RECT-2
-- S8: audit_logs por fila (old_data/new_data, metadata.mision, trace_id='RECT003')

COMMIT;
```
(S5-S8 con los INSERT exactos de `consultas_sql_independientes_RECTIFICACION-003.sql`.)

## 6. Verificación post-aplicación (criterios de PARADA)

Todo debe devolver exactamente estos valores; si algo diverge → NO continuar, ejecutar rollback:

1. `receipts.total_cost` = **40.739.585,00** · líneas 111/112 uc=1 CUP@1 (2 filas).
2. Kardex: compras uc=1 (2); salidas uc=0 restantes = **0 filas**; 21 movimientos totales.
3. Asientos: RECT-1 y RECT-2 presentes y **D=C** por asiento; `reversal_of` de RECT-1 = 93bb5da9.
4. Mayor: ACT_INVENTARIO = 201.699.246,55 − 151.299.851 = **50.399.395,55** (+ actividad viva posterior);
   PAS_CXP_PROV = 207.255.150,57 − 151.299.851 = **55.955.299,57**.
5. Subconjunto: neto ACT de estos SKU = 30 = 10×1 + 20×1 = kardex valorizado = valor en libros.
6. COGS motor de las 5 ventas = **7 CUP intacto** (sin GAS_COSTO_VENTAS nuevo).
7. Idempotencia re-verificada: re-ejecutar S1-S4 en transacción de prueba → 0 filas afectadas.

## 7. Procedimiento de ROLLBACK (demostrado en E2E byte a byte)

```sql
BEGIN;
SET LOCAL app.allow_receipt_item_edit = 'on';
-- 1) restaurar líneas desde el respaldo del PASO 0 (valores exactos ANTES):
UPDATE receipt_items SET unit_cost=2500, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id='<id línea 111>';
UPDATE receipt_items SET unit_cost=1000, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id='<id línea 112>';
-- 2) restaurar cabecera:
UPDATE receipts SET total_cost=192039436.00 WHERE id='fd9d6c88-…';
-- 3) restaurar kardex:
UPDATE stock_movements SET unit_cost=1700000 WHERE reference_id='fd9d6c88-…' AND movement_type='purchase' AND product_id='<111>';
UPDATE stock_movements SET unit_cost=680000  WHERE reference_id='fd9d6c88-…' AND movement_type='purchase' AND product_id='<112>';
UPDATE stock_movements SET unit_cost=0 WHERE id IN (<ids de las 7 salidas revalorizadas>);
-- 4) anular asientos de rectificación:
DELETE FROM fin_movements WHERE entry_id IN ('<RECT-1>','<RECT-2>');
DELETE FROM fin_entries WHERE id IN ('<RECT-1>','<RECT-2>');
-- 5) retirar eventos y auditoría de la misión:
DELETE FROM wac_change_log WHERE id IN ('<wcl rect003-1>','<wcl rect003-2>');
DELETE FROM audit_logs WHERE trace_id='RECT003';
-- 6) asiento testigo del rollback (opcional, recomendado):
INSERT INTO fin_entries (…, document_number='FAC-VITALLCONS-001-ROLLBACK', event='ajuste_manual', …);
COMMIT;
```
(Usar los valores exactos del respaldo lógico del PASO 0; en emergencia, alternativa canónica: asiento
compensatorio INVERSO de RECT-1/RECT-2 en lugar del DELETE, conservando toda la historia.)

## 8. Registro de la aplicación (completar al ejecutar)

| Campo | Valor |
|---|---|
| Fecha/hora UTC de ejecución | ____ |
| Operador / actor | ____ |
| Hash del respaldo pre-flight | ____ |
| Resultado de verificación post-aplicación (1-7) | ____ |
| Idempotencia re-verificada | ____ |
| PR / commit del expediente | ____ |
