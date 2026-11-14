# RECT004 — RUNBOOK DE PRODUCCIÓN — RECTIFICACIÓN CONTROLADA DE SKU 111/112
## CP-FIN-VALUATION-RECTIFICATION-RELEASE-GATE-004 · FAC-VITALLCONS-001

**Estado:** PREPARADO, DEMOSTRADO (E2E aislado TODO_PASS) Y **NO EJECUTADO**.
**⚠️ NO EJECUTAR SIN AUTORIZACIÓN EXPRESA Y POSTERIOR DEL PROPIETARIO (DP-6).**
Ejecutar **UNA sola vez** (regla de oro 11g) y registrar la aplicación al final de este documento.
Este runbook reemplaza al de la misión 003 (`RUNBOOK_PRODUCCION_RECTIFICACION.md`), que se conserva
intacto como histórico. **Novedad RECT004:** RECT-1 y RECT-2 son transacciones SEPARABLES e
independientemente reversibles (demostrado en m050e), con pre-flight DENTRO de la transacción.

**Constantes:**
| Elemento | Valor |
|---|---|
| Recepción | `fd9d6c88-5db8-49ea-b185-8bc96cc93e63` (FAC-VITALLCONS-001 · ENERVIDA-VITALLCONS) |
| Asiento original | `93bb5da9-0afd-4325-baad-a275710062c5` (RECEPCION/reconocimiento, posted) |
| SKU 111 / 112 | `4afef9a7-28b7-4a5e-b134-13a9e0ffea16` / `14aeb370-7e00-4889-b29b-ef2bc778f4c4` |
| Líneas de recepción | SKU111 `80a1767b-…` · SKU112 `9c9e6010-…` (ids exactos en el respaldo del paso 1) |
| RECT-1 | 151.299.851,00 CUP · D `PAS_CXP_PROV` / C `ACT_INVENTARIO` · `reversal_of=93bb5da9` |
| RECT-2 | 24,00 CUP · D `GAS_VALES` 6 + D `GAS_PERDIDA_INV` 18 / C `ACT_INVENTARIO` 24 |

---

## 0. PRECONDICIONES (todas obligatorias — si falta UNA, ABORTAR)

- [ ] **Autorización expresa y posterior del propietario** de los importes finales 40.739.585,00 ·
      −151.299.851,00 · 24,00 y de este procedimiento completo (la aprobación de la tasa 680 para las líneas
      USD auténticas NO autoriza esta rectificación).
- [ ] Ventana acordada con el propietario; documento fd9d6c88 **congelado** (sin recepciones/ediciones
      concurrentes; notificar al personal operativo).
- [ ] Operador con acceso service_role por Management API `/database/query` (pooler o API).
- [ ] Escape hatch M021 disponible (`SET LOCAL app.allow_receipt_item_edit='on'`).
- [ ] BD E2E aislada disponible: re-ejecutar `node scripts/m050e-rect004-e2e-prototipo.mjs` →
      `TODO_PASS` (verificación previa opcional pero recomendada).
- [ ] Este runbook impreso/abierto; el SQL de verificación `RECT004_READONLY_SQL.sql` a mano.

## 1. SNAPSHOT INMEDIATAMENTE ANTERIOR A LA EJECUCIÓN (read-only, obligatorio)

Ejecutar las secciones **A, B, C, D, F** de `RECT004_READONLY_SQL.sql` y guardar la salida con
fecha/hora UTC. Registrar:

| Campo | Valor esperado (si difiere → ver §ABORTO) |
|---|---|
| `receipts.total_cost` FVC | 192.039.436,00 · `unpaid` · `paid_amount` 0 · `status` active |
| Líneas 111/112 | 2.500/1.000 USD @680 (49 u / 100 u) |
| Pagos FVC/proveedor (B.1–B.3) | **0 filas** — deuda 100% pendiente |
| Duplicados del proveedor (B.4) | 0 filas |
| Mayor PAS_CXP_PROV neto (B.7) | 207.255.150,57 (menos actividad viva posterior si la hubiera) |
| Kardex 111/112 (D.1) | 21 movimientos · saldos 10/20 · stocks 10/20 |
| Asientos de la FVC (D.3) | exactamente 1 (93bb5da9) |
| Salidas uc=0 (C.5) | 7 filas / 26 unidades |
| COGS motor (C.6) | 7 CUP en 5 asientos |
| Asientos de la tienda nuevos (F.2) | revisar y ANOTAR los posteriores al corte 004 (actividad viva) |

Guardar hash SHA-256 de la salida del snapshot (respaldo lógico pre-flight).

## 2. CONTROLES DE DEUDA DEL PROVEEDOR (dentro de la MISMA transacción de RECT-1)

La condición de aprobación DP-2 se verifica **EN la transacción**, cerrando la ventana TOCTOU:

```sql
-- PRE-FLIGHT RECT-1 (dentro de BEGIN, con advisory lock ya tomado):
-- (a) deuda 100% pendiente:
SELECT payment_status, paid_amount, paid_at, status INTO v_chk
  FROM receipts WHERE id = 'fd9d6c88-…';
-- ABORTAR si v_chk.payment_status <> 'unpaid' OR v_chk.paid_amount > 0
--      OR v_chk.status IN ('voided','reversed') (deuda cambiada → §ABORTO-1)
-- (b) el exceso sigue íntegro (líneas no tocadas):
SELECT count(*) INTO v_n FROM receipt_items
  WHERE receipt_id='fd9d6c88-…' AND product_id IN ('4afef9a7-…','14aeb370-…')
    AND (unit_cost IN (2500,1000) AND moneda_recepcion='USD' AND tasa_cambio_recepcion=680);
-- ABORTAR si v_n <> 2 (movimiento nuevo o edición → §ABORTO-2)
-- (c) no existe RECT previa:
SELECT count(*) INTO v_r FROM fin_entries
  WHERE document_id='fd9d6c88-…' AND event='ajuste_manual';
-- ABORTAR si v_r > 0 (ya aplicada → idempotencia; verificar estado)
-- (d) importe ≤ resto pendiente del original (la BD NO valida importes — m050d T6):
--      151.299.851 ≤ 192.039.436 − reversiones previas del asiento (esperado 0) ✓
```

## 3. VERIFICACIÓN DE SALDOS Y EXISTENCIAS (pre-aplicación, read-only)

- Mayor `ACT_INVENTARIO` y `PAS_CXP_PROV` globales actuales (consulta F.3/B.7) — **anotar los valores
  exactos del momento** (`X_act`, `X_cxp`): el "después" esperado es `X_act − 151.299.851 − 24` y
  `X_cxp − 151.299.851`.
- Existencias 111/112: 10/20 u (consulta D.1). WAC: 1/1.

## 4. DOCUMENTOS QUE COMPONEN LOS 24 CUP DE RECT-2 (recordatorio verificable)

| Documento | SKU | Unidades | Cuenta | Verificación de ausencia de asiento |
|---|---:|---:|---|---|
| VS-000037-2026 (Orden/47) | 112 | 4 | `GAS_VALES` | C.2/C.3 — 0 fin_entries |
| VS-000138-2026 (ENERVIDA) | 112 | 1 | `GAS_VALES` | ídem |
| VS-000139-2026 (ENERVIDA) | 111 | 1 | `GAS_VALES` | ídem |
| Cuadre importación Δ−1 (2026-08-18) | 111 | 1 | `GAS_PERDIDA_INV` | C.4 — sin inventory_adjustments ni asiento |
| Cuadre importación Δ−17 (2026-08-18) | 112 | 17 | `GAS_PERDIDA_INV` | ídem |
| **TOTAL** | | **24** | D 6+18 / C 24 | VS-000223 (par neto 0) NO se contabiliza |

**Prohibido:** debitar `GAS_COSTO_VENTAS` (el motor ya reconoció 7 CUP — doble contabilización).

## 5. EJECUCIÓN — RECT-1 (transacción independiente e idempotente)

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEPCION:'||'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'));
SET LOCAL app.allow_receipt_item_edit = 'on';

-- S1: 2 líneas → costo real 1 CUP (esperado: exactamente 2 filas)
UPDATE receipt_items SET unit_cost=1, moneda_recepcion='CUP', tasa_cambio_recepcion=1, updated_at=now()
WHERE receipt_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND (unit_cost<>1 OR moneda_recepcion<>'CUP' OR tasa_cambio_recepcion<>1)
RETURNING id, unit_cost AS uc_antes, moneda_recepcion AS moneda_antes;

-- S2: cabecera → total corregido (esperado: 1 fila · 192.039.436 → 40.739.585,00)
UPDATE receipts SET total_cost=40739585.00, updated_at=now()
WHERE id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND total_cost<>40739585.00
RETURNING id, total_cost AS antes;

-- S3: capas de compra kardex → uc 1 (esperado: 2 filas · 1.700.000→1 · 680.000→1)
UPDATE stock_movements SET unit_cost=1
WHERE reference_id='fd9d6c88-5db8-49ea-b185-8bc96cc93e63' AND movement_type='purchase' AND unit_cost<>1
RETURNING id, unit_cost AS antes;

-- S4: wac_change_log (2 filas idempotentes, ids deterministas de la misión)
INSERT INTO wac_change_log (id, store_id, product_id, wac_before, wac_after, event, qty_in, uc_in, source_ref, created_at)
VALUES ('<id-wcl-rect1-a>','5e6fe821-…','4afef9a7-…',1,1,'rectificacion',10,1,
        '{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004","documento":"FAC-VITALLCONS-001","decision":"costo real 1 CUP/u","metodo":"governed_admin_write (escape hatch M021)"}'::jsonb, now()),
       ('<id-wcl-rect1-b>','5e6fe821-…','14aeb370-…',1,1,'rectificacion',20,1,
        '{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004","documento":"FAC-VITALLCONS-001","decision":"costo real 1 CUP/u","metodo":"governed_admin_write (escape hatch M021)"}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;

-- S5: ASIENTO RECT-1 (id determinista; document_id + reversal_of enlazados)
INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
  reversal_of, economic_date, posted_at, status, description, movements_snapshot)
VALUES ('<id-rect1>','5e6fe821-…','RECEPCION','fd9d6c88-…','FAC-VITALLCONS-001-RECT','ajuste_manual',
  '93bb5da9-0afd-4325-baad-a275710062c5','2026-07-01',now(),'posted',
  'Rectificación CP-FIN-VALUATION-RECTIFICATION-003/004: reversión del exceso de reconocimiento SKU 111/112 (precio de venta importado como costo USD; costo real 1 CUP/u)',
  '[{"traza":{"mision":"RECT003/004","regla":"rect-cxp-d"},"amount":151299851,"sentido":"debito","currency":"CUP","categoria":"PAS_CXP_PROV"},
    {"traza":{"mision":"RECT003/004","regla":"rect-inv-c"},"amount":151299851,"sentido":"credito","currency":"CUP","categoria":"ACT_INVENTARIO"}]'::jsonb)
ON CONFLICT (id) DO NOTHING RETURNING id;

INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
  exchange_rate, economic_date, description, traza)
VALUES ('<id-fm-r1a>','<id-rect1>','5e6fe821-…','PAS_CXP_PROV','debito',151299851.00,'CUP',1,'2026-07-01',
  'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)','{"mision":"RECT003/004","regla":"rect-cxp-d"}'::jsonb),
       ('<id-fm-r1b>','<id-rect1>','5e6fe821-…','ACT_INVENTARIO','credito',151299851.00,'CUP',1,'2026-07-01',
  'Rectificación FAC-VITALLCONS-001: exceso 151.299.851 (SKU 111/112)','{"mision":"RECT003/004","regla":"rect-inv-c"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- S6: auditoría por fila (5 filas: 2 VALUATION + 1 TOTAL + 1 MOV_UC_COMPRA + 1 ENTRY;
--     ids deterministas; trace_id 'RECT-PROD'; + la nativa del trigger de receipts)
INSERT INTO audit_logs (id, created_at, table_name, record_id, action, old_data, new_data, metadata, store_id, trace_id) VALUES
 ('<id-aud-1>',now(),'receipt_items','<id-línea-111>','SYSTEM_RECT_VALUATION','{"uc":2500,"moneda":"USD","tasa":680}','{"uc":1,"moneda":"CUP","tasa":1}','{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004","motivo":"costo real 1 CUP/u (decisión propietario)"}','5e6fe821-…','RECT-PROD'),
 ('<id-aud-2>',now(),'receipt_items','<id-línea-112>','SYSTEM_RECT_VALUATION','{"uc":1000,"moneda":"USD","tasa":680}','{"uc":1,"moneda":"CUP","tasa":1}','{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004"}','5e6fe821-…','RECT-PROD'),
 ('<id-aud-3>',now(),'receipts','fd9d6c88-…','SYSTEM_RECT_TOTAL','{"total_cost":192039436}','{"total_cost":40739585}','{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004"}','5e6fe821-…','RECT-PROD'),
 ('<id-aud-4>',now(),'stock_movements','<id-mov-compra>','SYSTEM_RECT_MOV_UC','{"uc":1700000/680000}','{"uc":1}','{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004"}','5e6fe821-…','RECT-PROD'),
 ('<id-aud-5>',now(),'fin_entries','<id-rect1>','SYSTEM_RECT_ENTRY','{"asiento":"93bb5da9","importe":192039436}','{"asiento":"RECT-1","reversal_of":"93bb5da9","debito":{"PAS_CXP_PROV":151299851},"credito":{"ACT_INVENTARIO":151299851}}','{"mision":"CP-FIN-VALUATION-RECTIFICATION-003/004","documento":"FAC-VITALLCONS-001-RECT"}','5e6fe821-…','RECT-PROD')
ON CONFLICT (id) DO NOTHING;

-- VERIFICACIÓN DENTRO DE LA TRANSACCIÓN (antes de COMMIT):
--  · D=C de RECT-1: SELECT sum(CASE WHEN sense='debito' THEN amount ELSE -amount END) FROM fin_movements WHERE entry_id='<id-rect1>';  → 0.00
COMMIT;
-- Si cualquier verificación falla → ROLLBACK (estado queda EXACTAMENTE como antes: demostrado m050e P12)
```

## 6. EJECUCIÓN — RECT-2 (transacción SEPARADA; puede ejecutarse después o reanudarse)

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('fin:RECEP2:'||'fd9d6c88-5db8-49ea-b185-8bc96cc93e63'));

-- T1: las 26 salidas subvaluadas → uc 1 (esperado: exactamente 7 filas / 26 unidades;
--     los ids exactos constan en el respaldo del paso 1 — consulta C.5)
UPDATE stock_movements SET unit_cost=1
WHERE store_id='5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND product_id IN ('4afef9a7-28b7-4a5e-b134-13a9e0ffea16','14aeb370-7e00-4889-b29b-ef2bc778f4c4')
  AND quantity_change<0 AND unit_cost=0
RETURNING id, quantity_change, unit_cost AS antes;

-- T2: ASIENTO RECT-2 (id determinista)
INSERT INTO fin_entries (id, store_id, document_type, document_id, document_number, event,
  economic_date, posted_at, status, description, movements_snapshot)
VALUES ('<id-rect2>','5e6fe821-…','AJUSTE_INVENTARIO','fd9d6c88-…','FAC-VITALLCONS-001-RECT-SAL','ajuste_manual',
  '2026-11-15',now(),'posted',
  'Rectificación CP-FIN-VALUATION-RECTIFICATION-003/004: reconocimiento de salidas nunca contabilizadas (6 u vales VS-37/138/139 + 18 u ajustes cuadre × 1 CUP)',
  '[{"traza":{"mision":"RECT003/004","regla":"rect-vales-d"},"amount":6,"sentido":"debito","currency":"CUP","categoria":"GAS_VALES"},
    {"traza":{"mision":"RECT003/004","regla":"rect-perdida-d"},"amount":18,"sentido":"debito","currency":"CUP","categoria":"GAS_PERDIDA_INV"},
    {"traza":{"mision":"RECT003/004","regla":"rect-inv-c"},"amount":24,"sentido":"credito","currency":"CUP","categoria":"ACT_INVENTARIO"}]'::jsonb)
ON CONFLICT (id) DO NOTHING RETURNING id;

INSERT INTO fin_movements (id, entry_id, store_id, category_code, sense, amount, currency,
  exchange_rate, economic_date, description, traza) VALUES
 ('<id-fm-r2a>','<id-rect2>','5e6fe821-…','GAS_VALES','debito',6.00,'CUP',1,'2026-11-15',
  'Vales sin asiento: VS-000037 (4 u) + VS-000138 (1 u) + VS-000139 (1 u)','{"mision":"RECT003/004","regla":"rect-vales-d"}'::jsonb),
 ('<id-fm-r2b>','<id-rect2>','5e6fe821-…','GAS_PERDIDA_INV','debito',18.00,'CUP',1,'2026-11-15',
  'Ajustes de cuadre importación: sku=111 Δ−1 + sku=112 Δ−17','{"mision":"RECT003/004","regla":"rect-perdida-d"}'::jsonb),
 ('<id-fm-r2c>','<id-rect2>','5e6fe821-…','ACT_INVENTARIO','credito',24.00,'CUP',1,'2026-11-15',
  'Salidas SKU 111/112 (24 u × 1 CUP)','{"mision":"RECT003/004","regla":"rect-inv-c"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- T3: auditoría (7 filas MOV_SALIDA + 1 ENTRY; trace_id 'RECT-PROD'; ids deterministas)

-- VERIFICACIÓN DENTRO DE LA TRANSACCIÓN: D=C de RECT-2 = 0.00
COMMIT;
```

**Interrupción entre RECT-1 y RECT-2:** el estado intermedio es VÁLIDO y VERIFICABLE (demostrado m050e
P3/P4): RECT-1 presente, RECT-2 ausente. Reanudar = ejecutar solo RECT-2. No ejecutar RECT-1 dos veces
(idempotente de todos modos: 0 cambios).

## 7. VALIDACIONES INMEDIATAMENTE POSTERIORES (criterios de PARADA — todo debe cuadrar)

Ejecutar la sección **G** de `RECT004_READONLY_SQL.sql` + verificaciones del informe:

1. `receipts.total_cost` = **40.739.585,00** · líneas 111/112 uc=1 CUP@1 (2 filas).
2. Kardex: compras uc=1 (2); salidas uc=0 restantes = **0 filas**; 21 movimientos.
3. Asientos de la FVC = **3**: original 93bb5da9 (INTACTO, posted) + RECT-1 (`reversal_of`=93bb5da9) +
   RECT-2 — **D=C en cada uno** (balance_debe = 0.00).
4. Mayores: `ACT_INVENTARIO` = X_act − 151.299.851 − 24 · `PAS_CXP_PROV` = X_cxp − 151.299.851
   (X anotados en el paso 3 de pre-condiciones; + actividad viva posterior si la hubiera).
5. Subconjunto: neto ACT de 111/112 = **30 = 10×1 + 20×1** = kardex valorizado = valor en libros.
6. COGS motor de las 5 ventas = **7 CUP intacto** (sin GAS_COSTO_VENTAS nuevo).
7. GAS_VALES porción 111/112 = **94** · GAS_PERDIDA_INV = **18**.
8. **Idempotencia re-verificada**: re-ejecutar S1–S3/T1 en una transacción de prueba → **0 filas** → ROLLBACK.
9. Existencias/precios: 10/20 u · 2.000 CUP / 1.000 USD · WAC 1/1.
10. `payment_status` = **unpaid** (la deuda restante 40.739.585 sigue pendiente de pagos reales).

Si CUALQUIERA diverge → **NO continuar** → §rollback y reportar al propietario.

## 8. MECANISMO DE IDEMPOTENCIA (qué impide duplicar)

| Capa | Mecanismo |
|---|---|
| BD | `uq_fin_entries_doc_event`: la tupla (RECEPCION, fd9d6c88, ajuste_manual, payment_ref-0) es ÚNICA |
| BD | Ids deterministas + `ON CONFLICT (id) DO NOTHING` en asientos/movimientos/auditoría |
| SQL | Guards `WHERE ... <> objetivo` en cada UPDATE (re-ejecución → 0 filas) |
| Sesión | Advisory lock `pg_advisory_xact_lock` por documento (concurrencia serializada) |
| Procedimiento | Pre-flight (c) del §2: existencia de RECT previa → ABORTAR |

## 9. MECANISMO DE RECUPERACIÓN (reanudación tras interrupción)

1. Consultar estado: `SELECT ... FROM fin_entries WHERE document_id='fd9d6c88-…'` (D.3).
2. Solo está el original → ejecutar §5 (RECT-1) y luego §6 (RECT-2).
3. Está original + RECT-1 → verificar RECT-1 (§7 ítems 1-3 para RECT-1) → ejecutar §6.
4. Están los tres → ejecutar SOLO las verificaciones §7 (nada pendiente).
5. Una transacción abortada NO deja estado ambiguo (BEGIN/COMMIT atómico; demostrado m050e T8/P12).

## 10. ROLLBACK

**Individual RECT-2** (vuelve al estado post-RECT-1):
```sql
BEGIN;
SET LOCAL app.allow_receipt_item_edit='on';
UPDATE stock_movements SET unit_cost=0 WHERE id IN (<los 7 ids del respaldo — consulta C.5>);
DELETE FROM fin_movements WHERE entry_id='<id-rect2>';
DELETE FROM fin_entries WHERE id='<id-rect2>';
DELETE FROM audit_logs WHERE trace_id='RECT-PROD' AND record_id='<id-rect2>';
COMMIT;
```
**Individual RECT-1** (requiere que RECT-2 esté revertido antes):
```sql
BEGIN;
SET LOCAL app.allow_receipt_item_edit='on';
UPDATE receipt_items SET unit_cost=2500, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id='<id-línea-111>';
UPDATE receipt_items SET unit_cost=1000, moneda_recepcion='USD', tasa_cambio_recepcion=680 WHERE id='<id-línea-112>';
UPDATE receipts SET total_cost=192039436.00 WHERE id='fd9d6c88-…';
UPDATE stock_movements SET unit_cost=1700000 WHERE reference_id='fd9d6c88-…' AND movement_type='purchase' AND product_id='4afef9a7-…';
UPDATE stock_movements SET unit_cost=680000  WHERE reference_id='fd9d6c88-…' AND movement_type='purchase' AND product_id='14aeb370-…';
DELETE FROM fin_movements WHERE entry_id='<id-rect1>';
DELETE FROM fin_entries WHERE id='<id-rect1>';
DELETE FROM wac_change_log WHERE id IN ('<id-wcl-rect1-a>','<id-wcl-rect1-b>');
DELETE FROM audit_logs WHERE trace_id='RECT-PROD' AND record_id IN ('<id-línea-111>','<id-línea-112>','fd9d6c88-…','<id-rect1>');
COMMIT;
```
**Total** = rollback RECT-2 → rollback RECT-1 (restauración byte a byte demostrada m050e P12).
**Alternativa canónica NO destructiva** (conserva historia): asientos compensatorios INVERSOS de RECT-1/RECT-2
(documento `FAC-VITALLCONS-001-ROLLBACK`, `reversal_of` → RECT-1/RECT-2) en lugar de DELETE —
usarla si se prefiere mantener toda la trazabilidad en el mayor.
En emergencia, los valores exactos ANTES constan en el respaldo del paso 1 (hash guardado).

## 11. CRITERIOS DE ABORTO (evaluar en cada fase; ante la duda, ABORTAR y documentar)

| # | Condición | Acción |
|---|---|---|
| A-1 | La deuda cambió: `payment_status<>'unpaid'` o `paid_amount>0` o la FVC anulada/reversada | ABORTAR §5 — recalcular tratamiento con el propietario (§misión 5) |
| A-2 | Las líneas 111/112 ya no están en 2.500/1.000 USD@680 (edición o movimiento nuevo) | ABORTAR — re-auditar |
| A-3 | Existe ya un `ajuste_manual` de la FVC | NO re-ejecutar — verificar qué se aplicó (§9) |
| A-4 | Aparece un movimiento nuevo de SKU 111/112 posterior al snapshot | ABORTAR — re-auditar la cronología de salidas (puede cambiar RECT-2) |
| A-5 | Conteo de filas afectadas ≠ esperado (2/1/2 en RECT-1; 7 en RECT-2) | ROLLBACK inmediato de ESA transacción — no continuar |
| A-6 | Verificación intra-transacción D=C ≠ 0.00 | ROLLBACK inmediato |
| A-7 | Fallo de inserción/conexión en mitad de una transacción | La transacción queda abortada (atómica) → §9 reanudación |
| A-8 | Interrupción del operador entre RECT-1 y RECT-2 | Estado válido — reanudar §9; JAMÁS re-ejecutar RECT-1 sin verificar D.3 |
| A-9 | Verificación post-aplicación §7 diverge | ROLLBACK total (§10) + reporte al propietario |
| A-10 | Aparecen pagos al proveedor entre el snapshot y la ejecución | ABORTAR §5 — la contrapartida debe recalcularse (posible caja/gastos financieros) |

## 12. OPERACIONES PERMITIDAS Y PROHIBIDAS (tabla explícita)

**PERMITIDAS (solo en la ventana autorizada):**
| Operación | Ámbito |
|---|---|
| SELECT de verificación (RECT004_READONLY_SQL.sql) | Producción, read-only, siempre |
| Las transacciones RECT-1 (§5) y RECT-2 (§6), UNA vez, con pre-flight | Producción, ventana autorizada |
| INSERT de wac_change_log/audit_logs de la misión (ids deterministas) | Ídem |
| UPDATE de las 2 líneas + cabecera + 2 capas + 26 salidas (con hatch M021) | Ídem |
| ROLLBACK documentado (§10) | Ídem, con autorización |
| Re-ejecución de m049/m050d/m050e en la BD aislada | CostproE2E, siempre |

**PROHIBIDAS (antes, durante y después):**
| Operación | Motivo |
|---|---|
| Cualquier escritura fuera de las transacciones §5/§6 | Alcance estricto |
| Editar/eliminar el asiento 93bb5da9 o cualquier asiento histórico | Historial intocable (partida doble) |
| Debitar GAS_COSTO_VENTAS adicional | Duplicaría el COGS del motor (7 CUP ya correctos) |
| Re-ejecutar el backfill CP-FIN de la FVC | Duplicaría el reconocimiento |
| Tocar las 71 líneas no verificables / 4 discrepancias / 18 legítimas / 6 sin problema | Fuera de alcance (§10 misión) |
| Usar cuentas de patrimonio | Prohibido por diseño (§4 misión 003) |
| Anular la recepción FVC (status voided/reversed) tras RECT-1 | TRAMPA T12: el motor NO compensaría el residual 40.739.585 — exige asiento manual |
| Aplicar la rectificación durante la misión 004 o sin la autorización DP-6 | Restricción §2 de la misión |

## 13. REGISTRO DE LA APLICACIÓN (completar al ejecutar — NO durante la misión 004)

| Campo | Valor |
|---|---|
| Fecha/hora UTC de ejecución RECT-1 / RECT-2 | ____ / ____ |
| Operador / actor | ____ |
| Hash del snapshot pre-flight | ____ |
| X_act / X_cxp anotados | ____ / ____ |
| Resultado de la verificación post-aplicación (1-10) | ____ |
| Idempotencia re-verificada (0 filas) | ____ |
| PR / commit del expediente | ____ |
