# W9.5 — B-10b-OBS-2-R2 · 17-repair-genealogy.md
# GATE 17 — REPAIR MOVEMENT SEPARATION · PASS

## El movimiento initial permanece históricamente identificable

```text
movement_type = 'initial'  (único tipo del batch — jsonb_agg(DISTINCT) = ['initial'])
reference_doc = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW'  (98/98)
reference_id  = id del propio stock_movement (98/98, patrón R1)
created_by    = 051c6157 (actor RECONCILIATION_EXECUTOR)
created_at    = 2026-09-06T20:26:26.416067Z (timestamp de ejecución R1, no retro-datado)
```

## Inmutabilidad bajo operación (P4b in-tx + POST)

Huellas `md5(id, qty, unit_cost, reference_doc, reference_id, created_at, created_by, movement_type)`:

```text
in-tx (tras 4 ventas + 4 void/reverse + 1 rechazo): P4b PASS — los initial de A/B/C idénticos
POST final (tras TODO el battery de R2): 98/98 fingerprints idénticos a PRE (r2_gate3_pre.json)
Ninguna venta posterior modificó ningún initial.                                   ✓
```

## Genealogía reconstruible — campos de enlace observados

```text
initial       : reference_doc = 'B10B-OBS2-RECON-OPENING:<batch>'   (identidad de la reparación)
sale          : reference_doc = 'Venta POS v2'   · reference_id = <tx_id>
sale_void     : reference_doc = 'Void de venta'  · notes        = <tx_id>
sale_reverse  : reference_doc = 'Reverso de venta' · reference_id = <tx_id>
```

Cadena demostrada end-to-end en el sandbox (Fixture A):

```text
initial (B10B-OBS2-RECON-OPENING, +19)
    ↓
sale    (Venta POS v2, −2, ref tx1)        → stock 17
    ↓
sale_void (Void de venta, +2, notes=tx1)   → stock 19 (tx1 compensada, netting 0)
    ↓
sale    (Venta POS v2, −1, ref tx2/zelle)  → stock 18
    ↓
sale_reverse (Reverso de venta, +1, ref tx2) → stock 19  ← posición inicial restaurada
```

Cada eslabón es distinguible por (movement_type, reference_doc, reference_id/notes) — la genealogía `initial → sale → void/reverse → restored` se reconstruye SIN ambigüedad y sin perder el origen de la reparación.

## Veredicto GATE 17

```text
PASS — initial separado e inmutable; genealogía completa reconstruible
```
