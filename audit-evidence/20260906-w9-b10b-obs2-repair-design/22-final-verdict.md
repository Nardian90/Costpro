# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 22-final-verdict.md
# Veredicto final de la fase de diseño (GATE 25)

## FORMATO FINAL (§27 adaptado a fase de diseño)

```text
STATUS:              REPAIR DESIGN APPROVED — HUMAN SIGNATURE REQUIRED
ROOT CAUSE (base):   purge SQL directo store-scoped ≈ 2026-08-17 02:00–02:50Z fuera de
                     todo pipeline auditado (heredado y respetado de OBS-2; actor histórico
                     UNKNOWN, no inventado)
STORE:               d1c4ba0e-5767-4ba0-e576-7d1c4ba0e576 — TIENDA CENTRAL COSTPRO (activa)
AFFECTED PRODUCTS:   U=124 · 108 huérfanos vivos (6.553 u) · 16 stock-0
ORPHAN UNITS:        6.553 declaradas = 6.427 demostradas + 126 Test
LEDGER STATUS:       0/0/0/0 (inventory/movements/kardex/transactions) — re-verificado
INVENTORY STATUS:    0 filas en la tienda; apertura proyectada: +98 filas (0→Q)
KARDEX STATUS:       0 filas en la tienda; apertura proyectada: +98 filas 'in' 1:1
FINANCIAL IMPACT:    0 — sin pagos/ventas/ingresos/comisiones; cash histórico ±0
ECONOMIC VALUE:      9.932.216,94 ESTIMATED reconocibles (6.427 u × WAC congelado);
                     12.000.481,33 de valor Test inflado QUEDA FUERA de la apertura
RESET CONNECTION:    purge NO fue reset (OBS-2); BE journal y backup corroboran posición
GLOBAL SCOPE:        defecto puntual de d1c4ba0e; resto de tiendas consistentes
REPAIR REQUIRED:     SÍ — para operación de la tienda (catálogo no vendible hoy)
RECOMMENDED MODEL:   D = B (apertura formal auditada, 98 filas, register_stock_movement
                     'initial', unit_cost=WAC, fecha de ejecución) + C (10 Test
                     EXCLUDED_FROM_REPAIR)
DESIGN DETERMINISM:  SÍ — universo congelado (raw/frozen_universe.json), 98 filas con
                     cantidad y WAC exactos, mecanismo canónico sin ALTER ENUM, barreras
                     de idempotencia (B1–B4), transacción única con locks, invariantes
                     I1–I14, rollback por compensación, criterios de aborto A1–A17,
                     simulación íntegra reproducible (in-memory, PASS)
DATA MUTATED:        0 — 34/34 métricas PRE==POST con checksums idénticos
TEST:                src/__tests__/integration/iteration-18-b10b-obs2-repair-design.test.ts
                     (24 tests; congela universo, exclusión, matemática, WAC, idempotencia,
                     invariantes, simulación, neutralidad y SHA256 de la evidencia)
REGRESSION:          PASS — lint 0 errors · tsc 0 · vitest 2.029 tests 0 fail · build OK ·
                     PM2 3/3 · HTTP 200 (detalle en 21-regression.md)
GIT:                 commit 'audit(w9): design orphan inventory reconciliation'
PUSH:                origin/main == HEAD verificado tras push
FINAL VERDICT:       ver sección siguiente
```

## Veredicto

**REPAIR DESIGN APPROVED — HUMAN SIGNATURE REQUIRED.**

El diseño es completamente determinista y está íntegramente soportado por evidencia:

1. **Posición demostrada, no asumida**: las 6.427 unidades propuestas (98 productos) son
   exactamente `backup 08-02 (5.495) + deltas CONFIRMED por el journal business_events
   sobreviviente (+932, evento a evento, con último new_qty == stock actual en los 4
   productos Set B)` y simultáneamente `6.553 declaradas − 126 Test`. Cuadre exacto por
   cuatro identidades independientes (08-mathematical-reconciliation.md).
2. **Nueva evidencia de esta fase**: `business_events` sobrevivió al purge (425 eventos
   stock_movement: 109 import + 133 pre-backup + 183 post-backup). Convierte los 4
   deltas «no reconstruibles» de OBS-2 en **CONFIRMED**, y el journal es parcial de
   forma DOCUMENTADA (ventas directas sin BE; 24 productos cuyo último BE es el import
   — cubiertos por backup == current).
3. **Mecánica 100% canónica**: sin ALTER ENUM (`initial` existe), sin escritores
   paralelos, WAC invariante por doble blindaje (A2 + blend D-01), sin doble valoración
   (base 0→Q), kardex 1:1, sync absoluto de stock_current (la apertura reconoce, no
   reescribe: checksum de stock_current y cost_average debe permanecer idéntico).
4. **Seguridad de ejecución**: idempotencia de 4 barreras con prefijo-constante,
   atomicidad de transacción única con advisory lock y FOR UPDATE ordenado, invariantes
   exactas verificables por SQL, rollback por compensación append-only con asimetría
   honesta declarada, 17 criterios de aborto.
5. **Neutralidad financiera probada por diseño**: 0 pagos/ventas/ingresos/comisiones;
   la apertura separa valor de inventario (ESTIMATED) de impacto de caja (0).

**Por qué requiere firma (y no es ambigüedad de diseño):** lo pendiente no es una
cuestión técnica indeterminada, sino la DECISIÓN EMPRESARIAL/CONTABLE de consagrar la
posición (mandato §18/§25 OBS-2), la designación de la persona ejecutora (hoy sin
membership admin activa en la tienda; candidato único con acceso canónico: admin global
051c6157 admin@costpro.com) y la fecha de ejecución. El bloque de firma está en
16-repair-recommendation.md y el procedimiento completo en 18-execution-checklist.md.

**Residuo explícito post-reparación (visible, nunca oculto):** 126 u de 10 productos
Test (EXCLUDED_FROM_REPAIR; decisión de archivo futuro separada), 16 productos stock-0
(sin posición), y residuos colaterales en BACKLOG de OBS-2 (z_reports, reservations,
memberships revoked, warehouses sin warehouse_stock).

**NO se ejecutó ninguna mutación en esta fase** (20-zero-mutation.md). La filosofía del
mandato se cumple literalmente: no se reconstruyó la historia destruida; se diseñó el
reconocimiento formal, con evidencia, de la única posición que puede demostrarse.
