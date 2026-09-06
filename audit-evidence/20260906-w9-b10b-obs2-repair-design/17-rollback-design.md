# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 17-rollback-design.md
# Diseño de reversión (GATE 17) — sin borrar historia arbitrariamente

## Principios

1. **Append-only**: la reversión NUNCA hace DELETE/UPDATE de las filas de la apertura ni
   de ninguna otra. Todo rollback es MOVIMIENTO COMPENSATORIO canónico.
2. **Trazabilidad simétrica**: cada rollback lleva batch propio enlazado al batch original.
3. **El ledger es la única vía**: mismas garantías de pipeline (inventory, kardex, sync,
   business_events) que la apertura.

## Claves de trazabilidad

```text
repair_batch_id (original):  'B10B-OBS2-RECON-OPENING:<ts>-<rand>'
rollback_batch_id:           'B10B-OBS2-RECON-ROLLBACK:<ts>-<rand>:ref=<repair_batch_id>'
```

## Procedimiento de reversión (diseño)

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('b10b-obs2-recon:…', 0));

-- Validar que el batch a revertir existe y está íntegro:
--   98 movements con reference_doc = 'B10B-OBS2-RECON-OPENING:<batch>'
--   inventory.quantity == opening_qty por producto (nadie vendió después)
--   SI alguien operó después del batch → ROLLBACK PARCIAL PROHIBIDO → ABORT
--   (la reversión de un estado derivado requeriría diseño nuevo y firma nueva)

-- Compensación por producto (98 veces), SOLO si inventory sigue en Q:
SELECT register_stock_movement(
  p_product_id   => :product_id,
  p_store_id     => 'd1c4ba0e…',
  p_quantity     => -:opening_qty,            -- compensación exacta −Q
  p_movement_type=> 'adjustment',             -- enum existente; kardex 'adjustment'
  p_reason       => 'B10B-OBS2-RECON-ROLLBACK:<ts>-<rand>:ref=<repair_batch>',
  p_user_id      => :signer_user_id,
  p_unit_cost    => :cost_average,            -- invariancia WAC (blend con q<0 exige S+q>0:
                                              -- S=Q, q=−Q ⇒ S+q=0 … ver nota WAC abajo)
  p_operation_date=> now(),
  p_skip_access_check => false
);

-- audit del lote de rollback (action='STOCK_RECONCILIATION_ROLLBACK')
COMMIT;
```

### Nota WAC de la reversión (crítica y documentada)

- `register_stock_movement` no recalcula WAC → `cost_average` permanece (invariante I3
  se mantiene también en rollback).
- `fn_recalc_wac` con q<0 exige S+q>0; una reversión total lleva S+q=0, por lo que la
  reversión total NO DEBE invocar recálculo (y no lo hace: el escritor elegido no toca
  WAC). Queda registrado por si un diseño futuro quisiera «invertir» el blend.
- Tras compensación: inventory.quantity = 0 (permitido; ≥0), stock_current = 0,
  kardex 'adjustment' −Q, business_event por movimiento.

## Efecto exacto del rollback y asimetría honesta

```text
El ledger VUELVE al estado pre-apertura:  movements/inventory/kardex en cantidades netas 0
PERO (append-only):
  - las filas de la apertura SIGUEN EXISTIENDO (+98 movements, +98 kardex, +98 BE)
  - inventory: las 98 filas EXISTEN con quantity=0 (pre-apertura: no existían)
  - products.stock_current: 0  ← NO restaura el 6.553/6.427 huérfano declarado
```

**Asimetría declarada**: el rollback es *ledger-accurate* pero *position-destructive*:
stock_current termina en 0, no en el valor huérfano previo. Recuperar la posición solo
es posible mediante una NUEVA apertura formal (nuevo batch, nueva firma) apoyada en este
pack (`raw/frozen_universe.json` + `07-proposed-opening.csv`), que es exactamente el
reparo correcto: nunca se restaurará stock «por debajo del pipeline».

## ¿Soporta el pipeline un «reverse opening movement»?

No existe un RPC de reversión genérica de movimientos (los reverse_* están acotados a
receipts/devoluciones/sales y están CONGELADOS — lista prohibida del mandato). El diseño
usa compensación por 'adjustment' con el RPC canónico: mismo pipeline, misma auditabilidad,
cero toques a funciones congeladas.

## Ejercicio de idempotencia del rollback

- Barrera: si ya existen movements con reference_doc LIKE 'B10B-OBS2-RECON-ROLLBACK:%:ref=<batch>'
  → segunda reversión del mismo batch → RECHAZADA.
- La re-apertura tras rollback exige batch '-R2' y firma nueva (11-idempotency.md §B1).
