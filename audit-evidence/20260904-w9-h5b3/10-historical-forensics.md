# W9.4.9 — H5-B3 — GATE 11: HISTORICAL FORENSICS

Fecha: 2026-09-04 | Método: solo lectura sobre audit_logs, transactions, stock_movements,
kardex_entries, products, inventory, transaction_recovery_ledger (queries en
scripts/w9h5b3_q10_forensics.sql). Sin PII.

## Hallazgos

### 1. Inventario de eventos históricos de reversión/void (audit_logs)

| fecha | acción | filas | ¿tx existe hoy? |
|---|---|---|---|
| 2026-08-06 | VOID_SALE | 6 | NO (transacciones eliminadas posteriormente) |
| 2026-08-10 | REVERSE_TRANSACTION_V2 | 10 | NO (idem) |
| 2026-09-04 | REVERSE_TRANSACTION_V2 | 3 | SÍ, status=voided → **tests sintéticos de ESTA auditoría** |
| 2026-09-04 | VOID_SALE | 1 | SÍ, status=voided → **test sintético de ESTA auditoría** |

### 2. ¿Doble reversión histórica sobre una misma transacción?

```sql
SELECT record_id, COUNT(*) … FROM audit_logs
WHERE action IN ('REVERSE_TRANSACTION_V2','VOID_SALE')
GROUP BY record_id HAVING COUNT(*) > 1
```
→ **0 filas.** Ningún record_id acumula más de un evento de reversión/void.
**No existe evidencia de doble reversión Ni explotación de la ventana de carrera.**

### 3. Movimientos de stock de reversión históricos

- sale_reverse / sale_void / void / purchase_reverse / production_reverse / issue_slip_reverse:
  **solo los 4 sintéticos de hoy (3 sale_reverse + 1 sale_void). 0 históricos.**
- Interpretación: las reversiones de agosto-2026 se ejecutaron con versiones de la función que
  actualizaban stock directamente (sin stock_movements) o las filas desaparecieron junto con
  sus transacciones (reference_id es TEXT sin FK → no habría borrado en cascada; por tanto lo
  más probable es la era pre-register_stock_movement).

### 4. Integridad sintomática

- Transacciones con trazas de reversión (reversed_at/void_reason): solo las 3 sintéticas hoy.
- transaction_recovery_ledger: **1 fila** — corresponde a la restauración gobernada con
  snapshots de un checkpoint anterior (herramienta service_role-only con advisory lock);
  no es evidencia de explotación de carrera.
- products con stock_current < 0: **0**. inventory con quantity < 0: **0**.
- Ningún kardex de reversión duplicado; kardex total (702) == stock_movements total (702).

## Clasificación (exigida por el protocolo)

```text
NO EVIDENCE OF IMPACT
```

La ventana teórica de V1 existió (establecido históricamente en H5-B1), pero:
- no hay ningún par de eventos de reversión sobre la misma transacción;
- no hay stock negativo ni inconsistencias globales atribuibles a concurrencia;
- las transacciones afectadas por reversiones históricas fueron eliminadas posteriormente
  (ciclo de vida normal del entorno de prueba), sin huellas de doble impacto.

No se asume explotación solo porque existiera la ventana: la clasificación se basa en la
ausencia total de duplicados en la evidencia disponible.
