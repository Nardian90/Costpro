# PROPUESTA DE RECTIFICACIÓN INTEGRAL — CP-FIN y WAC
## FAC-VITALLCONS-001 · SKU 111 y SKU 112 · CP-FIN-VALUATION-CORRECTION-002
**Estado:** PROPUESTA (no ejecutada). Requiere revisión del propietario de los importes finales y
del procedimiento completo antes de la aplicación en producción.

---

## 1. Principios rectores

1. **Trazabilidad completa, historia no destructiva:** el asiento original de reconocimiento
   (93bb5da9, 192.039.436 CUP) NO se modifica ni se elimina. La rectificación es un **asiento
   compensatorio enlazado** (`reversal_of`) + corrección gobernada de los datos fuente, con
   auditoría por fila (patrón GATE16 / TRACEABILITY_BACKFILL de las misiones precedentes).
2. **Partida doble estricta:** ninguna escritura fuera de transacción atómica; cada asiento
   balanceado D=C; contrapartida económica real (pasivo con el proveedor), **sin cuentas de
   patrimonio como ajuste ficticio**.
3. **Escape hatch gobernado:** el trigger M021 de inmutabilidad exige
   `SET LOCAL app.allow_receipt_item_edit='on'` (sesión de corrección autorizada y trazada).
4. **Idempotencia y reversibilidad:** cada paso con guarda de no-cambio; respaldo lógico previo
   (JSON con valores anterior/propuesto); rollback restaurable byte a byte (demostrado en E2E).
5. **Aislamiento:** validación previa exclusivamente en BD E2E (hecho); aplicación en producción
   UNA SOLA VEZ, documentada (cuándo, qué, SHA) en el expediente.

---

## 2. Estado inicial (producción, verificado 2026-11-15)

| Elemento | Valor actual |
|---|---|
| `receipts.total_cost` (fd9d6c88) | 192.039.436,00 CUP |
| Línea SKU 111 (80a1767b) | 49 u × 2.500 USD × 680 = 83.300.000 CUP |
| Línea SKU 112 (9c9e6010) | 100 u × 1.000 USD × 680 = 68.000.000 CUP |
| Movimiento compra SKU 111 (8552e290-... clase) | uc 1.700.000 CUP |
| Movimiento compra SKU 112 | uc 680.000 CUP |
| Asiento reconocimiento (93bb5da9) | D ACT_INVENTARIO 192.039.436 / C PAS_CXP_PROV 192.039.436 |
| WAC / existencias | SKU 111: WAC 1, 10 u · SKU 112: WAC 1, 20 u (YA correctos) |
| COGS motor (7 ventas) | 7 CUP a costo real (YA correcto) |
| Kardex de salidas | 26 unidades con uc=0 (2 ventas + 24 vales/ajustes) |

---

## 3. Procedimiento canónico (7 pasos, una transacción)

### PASO 0 — Respaldo lógico pre-flight (fuera de la transacción)
Extracción read-only de todas las filas afectadas (2 `receipt_items`, cabecera, 21
`stock_movements`, asiento + movimientos contables, productos, wac_change_log) con valores
anterior/propuesto en JSON + hashes SHA-256. Generación de `restore.sql` (BEGIN/COMMIT) con los
valores originales.

### PASO 1 — Corrección de las líneas de recepción (datos fuente)
```sql
BEGIN;
SET LOCAL app.allow_receipt_item_edit = 'on';  -- escape hatch gobernado (M021)
UPDATE receipt_items SET unit_cost = 1, moneda_recepcion = 'CUP', tasa_cambio_recepcion = 1, updated_at = now()
WHERE receipt_id = 'fd9d6c88-...' AND product_id IN ('4afef9a7-...', '14aeb370-...')
  AND (unit_cost <> 1 OR moneda_recepcion <> 'CUP' OR tasa_cambio_recepcion <> 1)
RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes, tasa_cambio_recepcion AS tasa_antes;
-- esperado: 2 filas · SKU 111: 2500 USD@680 → 1 CUP@1 · SKU 112: 1000 USD@680 → 1 CUP@1
```

### PASO 2 — Recálculo de la cabecera
```sql
UPDATE receipts SET total_cost = 40739585.00, updated_at = now()   -- Σ(q·uc·tasa) de las 101 líneas corregidas
WHERE id = 'fd9d6c88-...' AND total_cost <> 40739585.00 RETURNING total_cost AS antes;
```
(En la réplica E2E de 2 líneas el equivalente es 149 CUP — misma mecánica.)

### PASO 3 — Revalorización de las capas de compra (WAC)
```sql
UPDATE stock_movements SET unit_cost = 1, cost_value_change = quantity_change * 1
WHERE reference_id = 'fd9d6c88-...' AND movement_type = 'purchase' AND unit_cost <> 1
RETURNING id, unit_cost AS antes;   -- esperado: 2 filas (1.700.000→1 · 680.000→1)
```
**WAC resultante: 1 CUP constante** (existencia inicial 0; entradas a 1; salidas a 1). El
`cost_average` vigente YA es 1 → **sin cambio material**; se registra el evento:
```sql
INSERT INTO wac_change_log (store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES (..., P111, 1, 1, 'rectificacion', 10, 1,
  '{"mision":"CP-FIN-VALUATION-CORRECTION-002","documento":"FAC-VITALLCONS-001",
    "decision":"Costo real 1 CUP/u declarado por propietario; capas revalorizadas 1.700.000/680.000 → 1",
    "metodo":"governed_admin_write"}', now()), (... P112 ...);
```

### PASO 4 — Revalorización de salidas subvaluadas (COGS/vales con uc=0)
```sql
UPDATE stock_movements SET unit_cost = 1, cost_value_change = quantity_change * 1
WHERE store_id = '5e6fe821-...' AND product_id IN (P111, P112)
  AND quantity_change < 0 AND unit_cost = 0
RETURNING id, quantity_change;   -- esperado: 7 filas · 26 unidades (2 ventas + 24 vales/ajustes)
```
Efecto: el COGS de 2 ventas pasa de 0 a 1 CUP/u; 24 unidades de vales/ajustes pasan de 0 a 1 CUP/u.

### PASO 5 — Asiento compensatorio: rectificación del reconocimiento
```sql
INSERT INTO fin_entries (store_id, document_type, document_id, document_number, event,
  reversal_of, economic_date, posted_at, status, description, movements_snapshot)
VALUES (STORE, 'RECEPCION', 'fd9d6c88-...', 'FAC-VITALLCONS-001-RECT', 'ajuste_manual',
  '93bb5da9-0afd-4325-baad-a275710062c5',        -- reversal_of → asiento ORIGINAL
  '2026-07-01', now(), 'posted',
  'Rectificación CP-FIN-VALUATION-CORRECTION-002: reversión del exceso de reconocimiento de SKU 111/112 (precio de venta importado como costo USD; costo real 1 CUP)',
  '[{...debito PAS_CXP_PROV 151.299.851...},{...credito ACT_INVENTARIO 151.299.851...}]');
INSERT INTO fin_movements (entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, description, traza) VALUES
  (..., 'PAS_CXP_PROV',    'debito',  151299851.00, 'CUP', 1, '2026-07-01', 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)', '{"regla":"rect002","metrica":"exceso_reconocimiento","template":"rect-cxp-d"}'),
  (..., 'ACT_INVENTARIO',  'credito', 151299851.00, 'CUP', 1, '2026-07-01', 'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)', '{"regla":"rect002","metrica":"exceso_reconocimiento","template":"rect-inv-c"}');
```
**Por qué esta contrapartida:** la deuda con Vitallcons por estas dos líneas se reconoció en
151.300.000 CUP cuando el costo real conjunto es 149 CUP. El exceso nunca fluyó a COGS ni a gastos
(las salidas se costearon a 0-1 CUP): permanece íntegro en el saldo de ACT_INVENTARIO. La
contrapartida correcta es la anulación del exceso del pasivo real — no patrimonio, no resultado.

### PASO 6 — Asiento de revalorización de salidas subvaluadas
```sql
INSERT INTO fin_entries (..., document_number, event, economic_date, ...) VALUES
  (..., 'FAC-VITALLCONS-001-RECT-SAL', 'ajuste_manual', '2026-11-15', ...,
   'Revalorización de salidas subvaluadas (uc=0→1) de SKU 111/112: 26 unidades × 1 CUP');
INSERT INTO fin_movements (...) VALUES
  (..., 'GAS_COSTO_VENTAS', 'debito',      2.00, 'CUP', 1, '2026-11-15', 'COGS subvaluado 2 CUP (2 ventas uc=0)',   '{"regla":"rect002","metrica":"cogs_subvaluado","template":"rect-cogs-d"}'),
  (..., 'GAS_VALES',        'debito',     24.00, 'CUP', 1, '2026-11-15', 'Vales/ajustes subvaluados 24 CUP',        '{"regla":"rect002","metrica":"vales_subvaluado","template":"rect-vales-d"}'),
  (..., 'ACT_INVENTARIO',   'credito',    26.00, 'CUP', 1, '2026-11-15', 'Revalorización salidas SKU 111/112',      '{"regla":"rect002","metrica":"salidas_subvaluadas","template":"rect-inv-c"}');
```

### PASO 7 — Auditoría de valores anteriores y corregidos (por fila)
Una fila `audit_logs` por objeto modificado, con `old_data`/`new_data` JSON, `metadata.mision`,
`metadata.documento='FAC-VITALLCONS-001'` y `trace_id` de la misión (acciones
`SYSTEM_RECT_VALUATION`, `SYSTEM_RECT_TOTAL`, `SYSTEM_RECT_MOV_UC`, `SYSTEM_RECT_MOV_SALIDA`).
Finalmente `COMMIT`.

---

## 4. Estado final esperado (producción, tras la rectificación)

| Elemento | Antes | Después |
|---|---|---|
| `receipts.total_cost` | 192.039.436,00 | **40.739.585,00** |
| Líneas SKU 111/112 | 2.500/1.000 USD@680 | **1 CUP@1** |
| Movimientos de compra | uc 1.700.000 / 680.000 | **uc 1** |
| WAC de ambos SKU | 1 CUP | 1 CUP (sin cambio material; evento `rectificacion` registrado) |
| Salidas subvaluadas | 26 u a 0 CUP | 26 u a 1 CUP |
| ACT_INVENTARIO (neto de estos SKU) | 151.299.907 de exceso + flujo histórico | **30 CUP = valor en libros** (10 u + 20 u × 1) |
| PAS_CXP_PROV (neto de la FVC) | 192.039.436 | **40.739.585** (costo real documentado) |
| COGS ventas 111/112 | 7 CUP (motor) | 7 CUP (+2 CUP kardex corregidos) |
| Precios de venta | 2.000 CUP / 1.000 (maestro) | **INTACTOS** |

Conciliación final demostrada en E2E: neto ACT_INVENTARIO (30) = kardex valorizado (30) = valor
en libros del maestro (30); cada asiento D=C; cero duplicación; idempotente; reversible.

---

## 5. Guardas de idempotencia y reversión

- Cada UPDATE solo actúa si el valor difiere del objetivo (`WHERE ... <> objetivo`).
- Los asientos se insertan con `ON CONFLICT (id) DO NOTHING` (id determinista de la misión) y
  guarda adicional por `reversal_of` ya existente.
- `wac_change_log` con id determinista + `ON CONFLICT DO NOTHING`.
- **Rollback:** `restore.sql` generado del respaldo del PASO 0 restaura líneas, cabecera y
  movimientos; los asientos de rectificación se anulan con asiento compensatorio inverso (o
  borrado gobernado en el entorno de emergencia) + asiento testigo `...-ROLLBACK`. Demostrado en
  E2E: restauración byte a byte y re-aplicación posterior correcta.

## 6. Orden de ejecución y responsables

1. **Revisión del propietario** de importes finales (40.739.585,00 · 151.299.851,00 · 26,00) y
   del presente procedimiento.
2. Ejecución en ventana acordada, con producción congelada para el documento fd9d6c88.
3. Validación post-aplicación con las consultas de `consultas_sql_independientes_RECTIFICACION.sql`
   (sección «verificación post-rectificación»).
4. Registro en el expediente (docs/audits/valuation-correction-20261115/): fecha, hora UTC, SQL
   ejecutado, hashes del respaldo, idempotencia re-verificada.

## 7. Aspectos que esta rectificación NO cubre (deliberadamente)

- Las **71 líneas no verificables** (uc == precio de venta): solo el propietario puede declarar
  cuáles son precios importados como costos (exposición contingente 24.510.805 CUP; ver
  DECISIONES_PROPETARIO_PENDIENTES.md).
- Las **4 líneas con moneda posiblemente incorrecta** (SKU 90, 92, 999, 120).
- La regularización del **residual global** de ACT_INVENTARIO (154.137.921,67 CUP por salidas
  contabilizadas por debajo del costo de adquisición — Fase VII de la misión anterior): su
  tratamiento depende de conteo físico y decisiones del propietario.
- El defecto latente de `sync_product_stock()` (ORDER BY con empates no deterministas) —
  recomendado para backlog de ingeniería.
