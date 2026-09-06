# W9.5 — B-10b-OBS-2-R1 · 14-rollback-plan.md
# §26 ROLLBACK DRY-RUN — verificado read-only (NADA ejecutado)

Resultado completo: `raw/r1_rollback_dryrun.json` · script: `scripts/r1_rollback_dryrun.sql`.

## Integridad del lote a revertir (verificada en el dry-run)

```text
batch_movements:                     98
batch_units:                         6427
batch_value_exact:                   9,932,216.938816005
products con inventory == Σ movements: 98/98  (nadie operó después del batch)
movements post-batch fuera del batch:  0      (estado derivado intacto)
rollback markers pre-existentes:       0
```

## Plan de reversión (diseño 17-rollback-design.md — append-only)

```text
rollback_batch_id: 'B10B-OBS2-RECON-ROLLBACK:<ts>-<rand>:ref=B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'
mecanismo:         98 × register_stock_movement(p_quantity => -Q,
                     p_movement_type => 'adjustment',
                     p_reason => rollback_batch_id,
                     p_unit_cost => cost_average,
                     p_skip_access_check => false)   — pipeline canónico completo
total:             −6,427 u · −9,932,216.938816005 (exacto)
muestra:           da1c4090 −966 @11.919422583856775 · c4870c06 −4 @2240 · e47421ea −19 @489.99999999999994 (…)
barrera:           segunda reversión del mismo batch → RECHAZADA (prefijo ROLLBACK:%)
```

## Efecto declarado del rollback (asimetría honesta)

```text
inventory:   las 98 filas PERMANECEN con quantity=0 (append-only)
movements:   98 apertura + 98 compensación (historial NUNCA borrado; neto 0)
kardex:      +98 'in' + 98 'adjustment' (historial intacto)
stock_current: 0 para los 98  ← POSITION-DESTRUCTIVE (recuperar la posición exige
               NUEVA apertura formal -R2 con nueva firma humana)
wac:         cost_average preservado (sin recálculo; caso S+q=0 documentado)
audit:       nueva fila action='STOCK_RECONCILIATION_ROLLBACK'; nada se borra
```

**EJECUTADO AQUÍ: false** — el dry-run es 100% read-only; la reversión real solo
procedería con nueva autorización humana y plan formal (19-abort-criteria §POST).
