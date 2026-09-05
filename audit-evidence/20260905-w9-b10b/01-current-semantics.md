# W9.5 — B-10b · 01-current-semantics.md
# GATE 2 — Reconstrucción forense de la semántica actual de reverse_devolution
# fecha: 2026-09-06 · baseline: c892b055 · fuente: DB live wthkddeleylijmonclxg (raw-gate1-live.json, raw-gate1b.json)

## 1. Identidad de la función live (PRE)

| Campo | Valor |
|---|---|
| OID | 136657 |
| owner | postgres |
| SECURITY DEFINER | true |
| search_path | `public` (proconfig `["search_path=public"]`) |
| firma | `reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL) RETURNS jsonb` |
| ACL | `postgres=X/postgres`, `service_role=X/postgres` (patrón F06; SIN EXECUTE para authenticated/PUBLIC) |
| SHA256(definición) | ver 02-function-pre.md |

## 2. Qué hace HOY la reversión (cuerpo live, post B-10)

```
1. SELECT * FROM devolutions WHERE id=... FOR UPDATE          (lock ✓, B-10)
2. ERR_DEVOLUTION_NOT_FOUND / ERR_ALREADY_REVERSED            (idempotencia por estado)
3. Guard de estado: solo 'completed' reversible (B-10 GATE G)
4. has_store_access_as(uid, store) + can_reverse_document(uid, store,'devolution') (B-10, política C congelada)
5. POR ITEM (devolution_items):
   5a. UPDATE products SET stock_current = GREATEST(0, stock_current - qty)   ← ✗ DIRECTO
   5b. INSERT kardex_entries (movement_type='out', unit_cost=0, total_value=0,
       balance_* leídos de products)                                          ← ✗ DIRECTO
6. UPDATE devolutions SET status='reversed', reversed_at/by, reversal_reason  (✓)
7. INSERT audit_logs 'REVERSE_DEVOLUTION' + metadata.operation ADMIN_REVERSE_DEVOLUTION (✓, B-10 GATE J)
8. RETURN {status:'success', items_reversed, devolution_id}
```

## 3. Semántica de la DEVOLUCIÓN ORIGINAL (create_devolution_v2, live)

- Inserta `devolutions` (status='completed') + `devolution_items`.
- Por item: `register_stock_movement(p_quantity:=+qty, p_movement_type:='return',
  p_sale_id:=devolution_id, p_unit_cost:=cost_at_sale→cost_average→0, p_skip_access_check:=TRUE)`.
- Pipeline resultante de esa llamada:
  - `stock_movements` fila (+qty, 'return', reference_id=devolution_id::text, unit_cost=uc)
  - trigger `fn_sync_inventory_on_movement` (BEFORE INSERT): `inventory.quantity += qty`,
    `balance_after := nuevo valor`; sin fila de inventario y delta<0 → ERR_INSUFFICIENT_STOCK
  - trigger `auto_kardex_on_stock_movement` (AFTER INSERT): kardex `devolution_in`, qty=|Δ|, unit_cost=uc
  - trigger `sync_product_stock` (AFTER INSERT): `products.stock_current := último balance_after`
  - `register_stock_movement` además re-fija `products.stock_current = balance_after`
- **Efecto WAC de la devolución original: CERO.** El hotfix A2 (v2.22.0) eliminó la
  actualización de `cost_average` de `register_stock_movement` ("For other paths
  (transfers, devolutions, etc.), cost_average stays as-is"). No hay ningún trigger
  sobre stock_movements que toque cost_average (verificado: solo 3 triggers en la
  tabla, ninguno escribe WAC) y `create_devolution_v2` no llama a `fn_recalc_wac`.

### Efectos de la devolución original (Δ)

| Variable | Δ devolución |
|---|---|
| products.stock_current | +q |
| inventory.quantity | +q (pipeline) |
| stock_movements | +1 fila 'return' (+q, uc, ref=dev id) |
| kardex_entries | +1 fila 'devolution_in' (q, uc) |
| products.cost_average (WAC) | 0 (INVARIANTE — hotfix A2) |
| payment_transactions | 0 (no toca) |
| commissions | 0 (no toca) |
| cash | 0 (no toca) |
| audit_logs | DEVOLUTION_CREATED_V2 |

## 4. Delta matemático del reverse ACTUAL (por item)

```
Δstock(products)   = -q con clamp GREATEST(0, ·)   → puede CLAMPAR (deja de ser -q si S<q)
Δinventory         = 0                              ← ✗ DIVERGENCIA: inventory.quantity queda inflado +q para siempre
Δstock_movements   = 0                              ← ✗ la reversión NO deja movimiento (kardex huérfano del pipeline)
Δkardex            = +1 fila 'out' con unit_cost=0  ← ✗ costo ficticio 0, no complementario de 'devolution_in'
ΔWAC               = 0                              (✓ coincide con la invariancia de la original — por accidente)
Δpayments          = 0                              (✓ conservar)
Δcommissions       = 0                              (✓ conservar)
Δaudit             = REVERSE_DEVOLUTION             (✓ B-10)
```

### Divergencias concretas del reverse actual (motivo de B-10b)

1. **Writer paralelo de inventario**: `products.stock_current` se muta directo; `inventory.quantity`
   NUNCA se muta → tras la reversión `products.stock_current != inventory.quantity`
   (drift estructural; el guard `prevent_direct_inventory_modification` demuestra que
   la intención del sistema es inventario inmutable vía movimientos).
2. **Kardex directo con costo 0**: `auto_kardex_on_stock_movement` existe para derivar
   kardex de movimientos; el INSERT manual rompe la cadena kardex↔stock_movements
   (reference_type='reversal' apuntando a la devolución, sin movimiento que lo respalde).
3. **Clamp GREATEST(0,·)**: silencia salidas imposibles (S<q) en lugar de fallar;
   el pipeline canónico falla con ERR_INSUFFICIENT_STOCK (detección sobre silencio, W7 D-01).
4. **Sin fila en stock_movements**: la reversión no es trazable en el kardex/pipeline
   canónico; Σ(deltas) de stock_movements no reproduce el stock.
5. **Sin balance_after**: el kardex manual copia products.* a mano (balance inventado
   fuera de la única fuente).

## 5. Efecto económico ESPERADO del reverse (contrato a conservar — §1/§19)

```
Δstock(products)   = -q EXACTO (sin clamp) cuando S>=q; ERROR cuando S<q
Δinventory         = -q EXACTO (por pipeline)
Δstock_movements   = +1 fila 'devolution_reverse' (-q, uc_complementario, reference_id=dev id)
Δkardex            = +1 fila derivada por trigger, complementaria de 'devolution_in'
ΔWAC               = 0  (la original no movió WAC → el reverse tampoco; rama q=0 invariante de fn_recalc_wac)
Δpayments          = 0  (NO introducir reembolsos — §19)
Δcommissions       = 0  (§19)
Δcash              = 0  (§19)
estado devolution  = completed → reversed (única transición; terminal)
audit              = REVERSE_DEVOLUTION / ADMIN_REVERSE_DEVOLUTION (se conserva, se enriquece metadata)
```

## 6. Evidencia de estado real (PRE)

- devolutions: 13 (12 completed, 1 reversed @ 2026-08-06, pre-B-10).
- stock_movements con movement_type='return': **0** — NINGUNA devolución real pasó por
  el pipeline (módulo dormant; creación v2.17.2/PR-4 posterior a los datos).
- devolution_items sin movimiento asociado: **13/13** → el fallback de costo
  (cost_at_sale → cost_average → 0, misma cadena de create_devolution_v2) es la ruta
  NORMATIVA para las devoluciones existentes; se documenta como tal, no como excepción.
- stock_movements total: 702 = kardex_entries total: 702 (1:1 — el kardex real es
  100% derivado de movimientos; el INSERT manual del reverse rompería ese invariante).
- audit_logs total: 7376 (sentinelas PRE/POST en 12-pre-post.txt).

## 7. Firma del análisis

Cada afirmación de este documento es trazable a raw-gate1-live.json / raw-gate1b.json
(definiciones pg_get_functiondef capturadas en vivo) o a las migraciones del repo
(create_devolution_v2: 20260810000041_pr4_3_1_fixes.sql; reverse_devolution:
20260905000002_w9_b10_reverse_document_authorization.sql §5).
