# W9.5 — B-10b · 03-register-stock-movement.md
# GATES 3+4 — Signo correcto, contrato de register_stock_movement y movement_type
# fecha: 2026-09-06 · baseline c892b055

## 1. GATE 4 — Contrato de `register_stock_movement` (live, SHA256 0c4bf01b…)

```
register_stock_movement(
  p_product_id uuid, p_store_id uuid, p_quantity numeric,
  p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid,
  p_sale_id uuid, p_unit_cost numeric, p_notes text,
  p_operation_date timestamptz, p_skip_access_check boolean) → jsonb
```

Efectos por invocación (orden real):
1. `has_store_access(store)` salvo `p_skip_access_check=TRUE` (el RPC reverse ya
   autorizó con `can_reverse_document` → se pasa TRUE, patrón de transfer/receipt).
2. `p_quantity = 0` → `{status:'skipped'}` (no-op explícito).
3. INSERT `stock_movements`:
   - `quantity_change = p_quantity` (SIGNO: tal cual)
   - `movement_type = LOWER(p_movement_type)::movement_type` (ENUM → el valor debe existir)
   - **`reference_id = p_sale_id::text`** ← mecanismo canónico de trazabilidad (§8 B-10b)
   - `reference_doc = p_reason`, `unit_cost = COALESCE(p_unit_cost,0)`, `notes = p_notes`
   - trigger BEFORE `fn_sync_inventory_on_movement`: `inventory.quantity += Δ`,
     `version+1`, `balance_after := resultado`; **ERR_INSUFFICIENT_STOCK si resultado<0**
     o si no existe fila de inventario y Δ<0; ERR_STORE_MISMATCH si store/product no
     coinciden.
   - trigger AFTER `auto_kardex_on_stock_movement`: kardex derivado (qty=|Δ|,
     unit_cost, balance desde products, reference_type='stock_movement',
     reference_id=id del movimiento).
   - trigger AFTER `sync_product_stock`: `products.stock_current := balance_after`.
4. UPDATE propio `products.stock_current = balance_after` (redundante y consistente
   con el trigger — misma fuente).
5. WAC: **ninguno** (hotfix A2 v2.22.0: quitado de RSM). El WAC lo escribe
   exclusivamente `fn_recalc_wac` con token (guard `w62_guard_wac_writer`).
6. business_events('stock_movement').

## 2. GATE 3 — Determinación del SIGNO (sin asumir)

```
devolución original  → register_stock_movement(+q, 'return', ...)  [create_devolution_v2 live]
                        → inventory += q, stock += q, kardex 'devolution_in'
reverso requerido    → register_stock_movement(-q, 'devolution_reverse', ...)
                        → inventory -= q, stock -= q, kardex complementario
```

- La devolución original INCREMENTA stock (entrada del cliente) → el reverse DEBE
  DECREMENTAR el mismo q (inversión exacta, sin clamp). El reverse actual ya
  decrementaba (`GREATEST(0, S-q)`) pero con clamp silencioso y sin pipeline.
- El signo se valida empíricamente con fixture en 07-stock-integrity.txt:
  `stock_after_reverse == stock_before` y `inventory_after_reverse == inventory_before`
  (GATE 12 del spec).
- Caso S<q (stock consumido tras la devolución): el pipeline canónico FALLA con
  ERR_INSUFFICIENT_STOCK (fn_sync_inventory_on_movement) — sustituye al clamp
  silencioso del modelo viejo; es la misma protección que tienen sales/receipts/
  transfers (detección sobre silencio, W7 D-01).

## 3. WAC — decisión (GATE 14)

- La devolución original tiene **efecto WAC = 0** (hotfix A2: cost_average no se toca
  en rutas de devoluciones; verificado: 0 triggers WAC en stock_movements,
  create_devolution_v2 sin fn_recalc_wac).
- ⇒ El reverse debe tener **efecto WAC = 0** (conservación exacta, §1).
- NO se usa la «inversa exacta» `fn_recalc_wac(-q, uc)`: invertiría un blend que
  NUNCA ocurrió → corrompería el WAC (ej.: S=10@5, dev +2@8 → S=12, WAC sigue 5;
  la «inversa» daría 4.4 — error).
- Se usa la rama invariante documentada de `fn_recalc_wac`:
  `fn_recalc_wac(store, product, 'devolution_reverse', 0, 0, ctx)` →
  «Salida pura / devolución A1 / evento neutro: WAC INVARIANTE».
  Beneficios: (a) lock FOR UPDATE del producto (serialización), (b) fila de
  wac_change_log con qty 0 y wac_before==wac_after (evidencia de invariancia),
  (c) uso del contrato frozen W7 D-01 en vez de un writer paralelo.
- Caso stock→0 (§14): la rama q=0 NO divide por cero ni exige S+q>0 → el reverse
  puede llevar el producto a cero sin WAC corrupto (a diferencia de la inversa
  exacta de receipts, cuyo dominio es distinto porque su ENTRADA sí mezcló WAC).

## 4. Movement type — decisión (GATE 7 del spec)

- `movement_type` es **ENUM** (`public.movement_type`) → migración segura:
  `ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'devolution_reverse'`
  (append al final, sin reordenar, sin tocar datos históricos — PG15 lo permite
  dentro de transacción; el valor no se usa en la misma transacción).
- Tipo elegido: **`devolution_reverse`** (preferido por el spec). NO se reutiliza
  `sale_reverse` (semántica de venta) ni se crea ambigüedad con `return`
  (que es la ENTRADA de la devolución).
- Kardex: `auto_kardex_on_stock_movement` recibe rama propia
  `WHEN 'devolution_reverse' THEN 'devolution_out'`. DECISIÓN CORREGIDA POR EVIDENCIA:
  la tabla kardex_entries tiene el CHECK `kardex_entries_movement_type_check`
  que YA sanciona el tipo 'devolution_out' (complemento canónico de
  'devolution_in' — el contrato lo anticipaba). Usarlo NO requiere tocar el
  CHECK; un kardex 'devolution_reverse' violaría la constraint. Simetría
  resultante: devolution_in (+q) ↔ devolution_out (−q).
- El ELSE→'adjustment' actual queda como fallback para valores desconocidos
  (sin cambio).

## 5. Reference ID — decisión (GATE 8 del spec)

- `reference_id = p_sale_id::text = devolutions.id` (columna TEXT, verificado) —
  relación estructurada movimiento→devolución, no dependiente de `notes`.
- `reference_doc = 'Reversión devolución ' || devolution_number` (legible).
- Kardex derivado: `reference_type='stock_movement'`, `reference_id=<id movimiento>`
  → cadena kardex → movimiento → devolución 100% navegable.
- Query canónica de trazabilidad:
  `SELECT * FROM stock_movements WHERE reference_id='<devolution_id>'::text
   AND movement_type IN ('return','devolution_reverse')` reproduce el ciclo de vida.

## 6. Unit cost del movimiento reverse (complementariedad)

- Si existe movimiento 'return' original (devoluciones post-pipeline):
  `uc := SUM(q·uc)/SUM(q)` de esos movimientos (complemento exacto del kardex).
- Si NO existe (13/13 devoluciones reales, pre-pipeline — módulo dormant):
  cadena de create_devolution_v2: `cost_at_sale` (transaction_items de la
  transacción original) → `products.cost_average` → `0`.
- En ambos casos el WAC real NO se modifica (invariante), el costo es solo
  atribución contable del kardex.
