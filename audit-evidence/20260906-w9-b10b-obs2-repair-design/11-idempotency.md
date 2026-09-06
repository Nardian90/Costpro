# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 11-idempotency.md
# Barrera de idempotencia (GATE 11) — diseño, sin implementar

## Clave lógica única

```text
repair_batch_id := 'B10B-OBS2-RECON-OPENING:' || <UTC-timestamp> || '-' || <4 chars A-Z0-9>
Ejemplo:        'B10B-OBS2-RECON-OPENING:20260907T120000Z-K7QF'
```

La clave vive en `stock_movements.reference_doc` (columna text, indexable por prefijo),
viaja a `kardex_entries.reference_description` y a la metadata de `audit_logs` del lote.
No se usan las tablas idempotency_* (orientadas a requests HTTP); la barrera es de datos,
verificable con SQL puro y permanente en el ledger.

## Las 4 barreras (en orden de disparo)

### B1 — Barrera global de lote (rechaza SEGUNDA ejecución, cualquier batch_id)

```sql
-- Dentro de la transacción, ANTES del primer movimiento:
SELECT count(*) INTO v_opening_exists
FROM stock_movements
WHERE store_id = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576'
  AND reference_doc LIKE 'B10B-OBS2-RECON-OPENING:%';
IF v_opening_exists > 0 THEN
  RAISE EXCEPTION 'ERR_RECON_ALREADY_APPLIED: opening ya presente (%)', v_opening_exists;
END IF;
```

Esta barrera usa el PREFIJO constante, no el batch específico → un operador que genere
un batch_id nuevo por error igualmente es rechazado. La única forma legítima de volver a
abrir una segunda vez es una reversión formal (17-rollback-design.md, marcador
`B10B-OBS2-RECON-ROLLBACK:`) + nueva autorización humana con sufijo `-R2` documentado.

### B2 — Serialización por advisory lock (concurrencia)

```sql
SELECT pg_advisory_xact_lock(hashtextextended('b10b-obs2-recon:d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576', 0));
```

Dos ejecuciones concurrentes se serializan; la segunda encuentra B1 activo y aborta.
El lock es xact-scoped: se libera con COMMIT/ROLLBACK.

### B3 — Verificación de completitud del lote (post-inserción)

```sql
-- Esperado exactamente 98 filas con ESTE batch:
SELECT count(*) FROM stock_movements
WHERE store_id = '…' AND reference_doc = :repair_batch_id;   -- debe ser 98
-- Y ninguna otra con el mismo batch fuera del universo:
SELECT count(*) FROM stock_movements
WHERE reference_doc = :repair_batch_id
  AND product_id NOT IN (SELECT … 98 ids del pack);          -- debe ser 0
```

### B4 — Unicidad del registro de auditoría del lote

```sql
SELECT count(*) FROM audit_logs
WHERE action = 'STOCK_RECONCILIATION_OPENING'
  AND metadata->>'batch_id' = :repair_batch_id;              -- tras ejecución: exactamente 1
SELECT count(*) FROM audit_logs
WHERE action = 'STOCK_RECONCILIATION_OPENING';               -- PRE: 0 · tras N lotes legítimos: N
```

## Demostración de comportamiento (simulación, sin DB)

`scripts/simulate_repair.js` ejecuta el escenario completo dos veces:

```text
RUN1 → 98 movimientos aplicados; referenciaDoc set = {batch}
RUN2 → assertPreconditions() devuelve 'PRE_FAIL idempotency barrier:
        B10B-OBS2-RECON-OPENING:20260907T000000Z-SIM1 already applied'
        → segunda ejecución RECHAZADA ✓ (raw/simulation_result.json → idempotency)
```

## Propiedad formal

Primera ejecución: B1=0 → aplica → B3=98 → COMMIT.
Segunda ejecución (mismo u otro batch_id): B1>0 → EXCEPTION → (la transacción entera
aborta; cero mutaciones). El estado de la DB es idéntico tras N intentos fallidos.
