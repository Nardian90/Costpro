# CP-FIN-NEGATIVE-WAC-REMEDIATION-013
## E2E_CORRECTION_EVIDENCE — Prototipo completo en BD aislada (CostproE2E)

| Campo | Valor |
|---|---|
| Misión | CP-FIN-NEGATIVE-WAC-REMEDIATION-013 |
| Base de datos | **CostproE2E** (`lguovmvrozxgssupkwpf`) — NUNCA producción |
| Script | `scripts/m092-negwac-e2e.mjs` (fases `setup` / `execute` / `verify` / `idem` / `rollback` / `cleanup`) |
| Canal | Management API — **1 llamada = 1 transacción atómica** (patrón m061/m075 validado) |
| Guard | `assert-not-production` (E2E pasa libre; producción fail-closed con doble flag) |
| Resultado consolidado | **16/16 veredictos PASS · 0 FAIL** (`scripts/out/m013/e2e-resultados.json`) |
| Ciclos ejecutados | 2 ciclos completos (setup→execute→verify) + prueba de rollback + reaplicación tras aborto + NET DELTA = 0 |

---

## 1. Fixture (estado espejo de producción)

- Tienda `E2E-013-NegWAC` + **6 productos**: P1..P5 replican SKU117/83/90/40/37 con su **WAC negativo exacto** de producción (−2.175.998,00 · −122.398,00 · −78.176,248120300752 · −665,857142857143 · −1,00) y sus existencias exactas (1/2/3/3/25 u); **P6 = control** (SKU31: WAC 1,00, 111 u, capas de otras recepciones).
- **Kardex completo replicado: 55 movimientos** (capas FVC a 1 CUP tras RECT-011, capa ajena de P3 de 100 u @ 1,00, salidas históricas a costo ≈0, reversas). El trigger `prevent_negative_inventory` (via sincronización de inventory) se deshabilitó SOLO durante la carga del fixture porque el kardex real atravesó saldos negativos intermedios (el drift mismo); re-habilitado tras la carga.
- **wac_change_log histórico** (14 filas: wac_correction, adjustment_plus, reception_in y las filas `rectificacion` de RECT-011 con wac_after negativo).
- **Asientos contables del fixture** con los importes REALES de producción para los 5 SKU: ORIG-like (D INV 14.018.950,00 / C CXP), RECT-011-like (D CXP 14.018.750,00 / C INV 2.657.375,00 + C COGS 2.422.216,00 + C VALES 4.587.161,00 + C PÉRDIDA 4.351.998,00), vales históricos 98,31, COGS histórico 19,55, recepción ajena P3 100,00, vale ajeno 70,68, recepciones y salidas del control.
- Saldo del fixture tras el setup: **ACT_INVENTARIO 11.361.597,46** · PAS_CXP_PROV −505,00 (ambos verificables al centavo).

## 2. Ejecución del prototipo RECT-013-A (1 llamada = 1 transacción)

```
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('m013:restauracion:<store>'));
DO $$ guard YA_APLICADO (conteo read-only de WAC<0; aborta si 0 o estado inesperado) $$;
-- LOTE A · WAC sellado → 1,00 (×5) + wac_change_log (rect013_restauracion) + auditoría SYSTEM_RECT013_WAC
CREATE TEMP TABLE m013_wac AS WITH datos(...) AS (VALUES 5 filas) SELECT * FROM datos;
SET LOCAL app.wac_writer = 'fn_recalc_wac';
UPDATE products SET cost_average = 1.00 ... WHERE cost_average <> 1.00;
SET LOCAL app.wac_writer = '';
-- LOTE B · asiento (AJUSTE_INVENTARIO / ajuste_manual / document_id NULL / economic_date = ejecución)
INSERT fin_entry RECT-013-A-NEGWAC + 4 movimientos:
  DR GAS_COSTO_VENTAS 566.546,45 · DR GAS_VALES 1.072.918,27 · DR GAS_PERDIDA_INV 1.017.914,60
  CR ACT_INVENTARIO 2.657.379,32   (ΣDR = ΣCR = 2.657.379,32)
INSERT auditoría SYSTEM_RECT013_ENTRY (trace RECT013-E2E);
COMMIT;
```

## 3. Verificación post-ejecución (V1–V10 · 9 veredictos PASS)

| # | Veredicto | Resultado |
|---|---|---|
| V1 | `wac_no_negativos` | **0 WAC negativos** tras la ejecución; los 6 productos a 1,00 |
| V2 | `existencias_intactas` | stock_current idéntico al pre-misión para los 6 productos |
| V3 | `movs_conteo` | 55 movimientos sin cambios (hash `id|qty|uc` = `43d36842…`) |
| V5 | `act_inventario_delta` | **Δ ACT_INVENTARIO = −2.657.379,32 exacto** (11.361.597,46 → 8.704.218,14) |
| V6 | `cxp_intacta` | PAS_CXP_PROV sin cambios (−505,00): economía de la recepción intacta |
| V7 | `gastos_según_propuesta` | COGS +566.546,45 · VALES +1.072.918,27 · PÉRDIDA +1.017.914,60 (deshace parte del ingreso fantasma) |
| V8 | `asiento_unico_balanceado` | 1 entrada AJUSTE_INVENTARIO/ajuste_manual · D−C = 0,00 |
| V9 | `trazabilidad` | wac_change_log +5 (`rect013_restauracion`) · auditoría +5 SYSTEM_RECT013_WAC + 1 SYSTEM_RECT013_ENTRY |
| V10 | `capas_ajenas_intactas` | capa ajena de P3 (100 u @ 1,00) y capas del control intactas |

## 4. Idempotencia, rollback y reaplicación (5 veredictos PASS adicionales)

- **`idem_reejecucion_0_cambios` PASS**: re-ejecución del bloque → guard `YA_APLICADO` (conteo read-only de WAC<0 = 0) aborta sin cambios; snapshot de estado (7 métricas: conteos de 6 tablas + saldo INV + Σwac) **idéntico pre/post por hash**.
- **`rollback_aborto_sin_persistencia` PASS**: transacción que aplica lote A + intenta insertar entrada y luego `RAISE EXCEPTION 'ABORTO_DELIBERADO_DE_PRUEBA'` → **ROLLBACK atómico completo**; snapshot hash-idéntico (0 filas nuevas, 0 cambios).
- **`reapply_tras_aborto_exitosa` PASS**: tras el aborto deliberado, la reaplicación completa el lote A (0 negativos) — camino de reanudación seguro (el mismo escenario de la 1ª pasada de RECT-011).
- **Ciclo completo de reaplicación desde cero**: cleanup certificado → setup → execute → verify → cleanup, ejecutado íntegramente dos veces con el mismo resultado (16/16 PASS).
- **`cleanup_net_delta_cero` PASS**: NET DELTA = 0 en products/inventory/stock_movements/fin_entries/fin_movements/wac_change_log/audit_logs (verificación por IDs deterministas del fixture `0e13…` y trace RECT013-E2E).

## 5. Descubrimiento adicional del E2E: el guard WAC resiste

- El intento de reset del fixture SIN token (`UPDATE products SET cost_average = …` a secas) fue **rechazado por el guard `w62_guard_wac_writer`** (`ERR_WAC_SINGLE_WRITER_VIOLATION`) — prueba directa en la BD aislada de que ninguna escritura de WAC sin el token sellado es posible, incluidas las correctivas.

## 6. Conclusión E2E

El prototipo RECT-013-A es **idempotente, atómico, reversible y re-ejecutable**, conserva existencias, capas ajenas, recepción (CXP) y movimientos, corrige la valoración de los 5 productos a 1,00 CUP/u con un asiento único y balanceado de 2.657.379,32 CUP, y deja trazabilidad completa (wac_change_log + audit_logs + movements_snapshot). El procedimiento exacto queda preparado para su ejecución gobernada en producción **cuando el propietario lo autorice** (esta misión no escribe en producción).
