# FASE E-SEC-R — 01 BASELINE

## Fecha / HEAD
2026-09-26 (UTC) · ventana ~19:00–20:00Z.

## Comando
```bash
git status --short | wc -l
git rev-parse HEAD
git rev-parse origin/main
git diff --check
git log -4 --oneline
```

## Resultado
```text
HEAD        = dd1e6fb9332abfe387dec461f2c4748ed2c16d0d
origin/main = dd1e6fb9332abfe387dec461f2c4748ed2c16d0d
HEAD == origin/main == dd1e6fb9  (EXACTAMENTE el baseline esperado por el mandato E-SEC-R — sin divergencia)
worktree    = 0 archivos modificados/untracked; git diff --check vacío

dd1e6fb9 docs(audit): E-SEC CI verification (baseline-vs-fix comparison) + final verdict CONDITIONAL
6022ae85 docs(audit): certify E-SEC evidence — integridad y autorización del precio de venta
9fe62254 test(pos): cover editable price authorization — R-SEC-1 (FASE E-SEC)
3e5758bd fix(pos): enforce server-side sale price integrity — R-SEC-1 (FASE E-SEC)
```

## Estado heredado
FASE E-SEC cerró R-SEC-1 técnicamente (veredicto CONDITIONAL) y dejó declaradas
5 DECISIONES DE NEGOCIO PENDIENTES (`13-final-verdict.md`, sección homónima):
umbral por línea vs agregado, motivo de descuento, token single-use, snapshot
`catalog_price_at_sale` por línea y política de redondeo. E-SEC-R parte de esa
implementación como **existente y estable — no se reescribe ni refactoriza**.

## Entorno
- Servidor dev PM2 app `costpro` (bun server.ts) en :3000 — HTTP 200 verificado.
- Supabase LIVE (mismo proyecto `wthkddeleylijmonclxg`).

## Tiendas protegidas (READ ONLY ABSOLUTO — regla de la fase)
```text
ENERVIDA-VITALLCONS      = 5e6fe821-5465-48b1-b3f1-3aa3182edc38
Puerto Padre VITALLCONS  = 43a4dabc-b8b4-4b66-82b3-0c75335ca5d1
TIENDA CENTRAL COSTPRO   = d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576
```
Zero-touch verificado PRE y POST de esta fase (última actividad ≤ 2026-09-06;
ver `esecr-cleanup-log.json` → `zero_touch`): ninguna mutación de E-SEC-R las toca.
Todas las pruebas mutativas se ejecutaron sobre la tienda sintética
`ESEC TEST ESEC0926014201` (205ed126-e976-40cc-985b-cb8d6e44e1ab, heredada del
fixture E-SEC), reactivando memberships/productos del sandbox con tag propio
`ESECR0926191737` y stock vía el RPC sancionado `register_stock_movement`.

## Interpretación
Baseline sin divergencia. La fase procede en modo READ-ONLY → análisis → decisión →
(solo si existe decisión explícita) implementación.
