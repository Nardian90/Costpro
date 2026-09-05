# W9.5 — B-10b-OBS-1 · 01-baseline.md
# Reparación forense del drift histórico de reverse_devolution
fecha: 2026-09-06 · herramienta: obs1_query.js (Supabase Management API, solo lectura)

## GATE 0 — Baseline Git

| Verificación | Valor |
|---|---|
| HEAD | `031b0ced3e746f8f5e5e74faeaeab8ed0585cde1` |
| origin/main | `031b0ced3e746f8f5e5e74faeaeab8ed0585cde1` |
| worktree | clean (0 cambios) |
| commit | `feat(w9): B-10b — reverse_devolution migrated to canonical inventory pipeline` |

### Desviación documentada del hash esperado

El spec indica baseline `eb1bdc08`. Ese commit fue **amendado a `031b0ced`** antes del
push por exigencia de GitHub Push Protection (GH013): 2 secretos Supabase hardcodeados
en scripts del evidence pack B-10b fueron redactados a variables de entorno
(`REDACTION-NOTE.txt` en el pack B-10b documenta hashes before/after).

**Equivalencia demostrada** (`git diff eb1bdc08 031b0ced --stat`):

```
 audit-evidence/20260905-w9-b10b/REDACTION-NOTE.txt | 31 ++++++
 audit-evidence/20260905-w9-b10b/SHA256SUMS         |  5 +-
 .../20260905-w9-b10b/scripts/b10b_query.js         |  4 +-
 .../20260905-w9-b10b/scripts/p12_concurrency.js    |  9 +-
 4 files changed, 43 insertions(+), 6 deletions(-)
```

La diff contiene EXCLUSIVAMENTE los 4 archivos de redacción. El contenido funcional
(migración SQL, tests, documentos de evidencia) es byte-idéntico. La condición de STOP
del GATE 0 (HEAD != origin/main, worktree sucio) NO se cumple → **GATE 0: PASS**.

## Estado live de la base (captura raw-g1-inventory.json, 2026-09-05T23:23:45Z)

| Tabla | Filas |
|---|---:|
| products | 323 |
| inventory | 141 |
| stock_movements | 702 |
| kardex_entries | 702 |
| devolutions | 13 |
| devolution_items | 13 |
| audit_logs | 7.376 |

Distribución de devoluciones por status: `reversed: 1`, `completed: 12`.
Constraint `devolutions_status_check`: `status IN ('pending','completed','voided','reversed')`.

## Consistencia global (GATE 5, evidencia raw-g4-scope.json)

- **0 mismatch Caso A global**: los 141 productos CON fila de inventory cumplen
  `products.stock_current == inventory.quantity` exactamente.
- 0 productos con movimientos carecen de fila de inventory (pipeline consistente donde existe).
- El kardex live es proyección 1:1 de los movimientos supervivientes
  (451+251=702; por tienda, counts idénticos).

## Alcance del hallazgo

1 devolución en estado `reversed` (0b7213e9-344a-4aa0-876d-316be9c6ff2e, NC-000007-2026),
1 item (q=1), 1 producto (da1c4090-3e10-4120-a2bc-24da53cffe16 «Abrazade metálica de
1 pulgada»), 1 tienda (d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576).
El análisis demuestra que NO se puede asumir "solo una fila" sin evidencia: se auditaron
las 13 devoluciones completas, 133 eventos de audit relacionados, todo el kardex/movements
que referencia devoluciones (0 filas) y los mecanismos reset/restore.
