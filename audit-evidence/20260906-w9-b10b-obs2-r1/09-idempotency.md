# W9.5 — B-10b-OBS-2-R1 · 09-idempotency.md
# §22 TEST DE IDEMPOTENCIA REAL — PASS

## Segunda ejecución con el mismo repair_batch_id

```text
comando:    node b10b_query.js scripts/r1_execute.sql raw/r1_idempotency_second_run.json
resultado:  RECHAZADA — HTTP 400, exit 1
error:      ERROR: P0001: ERR_RECON_ALREADY_APPLIED: opening already present (98)
punto:      Fase B (DO block $r1_pre$, línea 8) — ANTES de cualquier mutación
```

La barrera B1 (prefijo-constante sobre `stock_movements.reference_doc`) detectó las 98
filas de la apertura y abortó la transacción entera. Ninguna escritura se intentó ni
ocurrió (el DO block corre antes de la Fase C).

## Estado tras el intento (cero efectos adicionales)

```text
additional movements:   0   (family rows sigue en 98)
additional inventory:   0   (98 filas)
additional stock:       0   (Σ tienda sigue en 6.553)
additional value:       0   (value exacto sigue en 9.932.216,938816005)
audit rows:             1   (sin duplicado)
```

La propiedad formal del diseño (11-idempotency.md): «El estado de la DB es idéntico tras
N intentos fallidos» — demostrada con ejecución real, no solo simulación.

## Nota sobre B4

El diseño define la búsqueda del batch en `metadata->>'batch_id'` (11-idempotency.md B4)
pero su propia plantilla INSERT (12-atomicity.md) lo escribe en `new_data.batch_id`. La
ejecución siguió la plantilla de atomicidad (batch_id en new_data); la verificación
busca en ambas columnas (`COALESCE(metadata->>'batch_id', new_data->>'batch_id')`).
Inconsistencia documental del diseño resuelta en ejecución sin ambigüedad operativa.
