# W9.5 — B-10b · 02-function-pre.md
# GATE 1 — Captura forense PRE de reverse_devolution y su entorno (hashes)
# fecha: 2026-09-06 · baseline c892b055 · fuente: raw-gate1-live.json (pg_get_functiondef live)

## 1. reverse_devolution (el sujeto de B-10b)

| Propiedad | Valor PRE |
|---|---|
| OID | **136657** |
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path | `public` |
| ACL | `{postgres=X/postgres, service_role=X/postgres}` — F06, sin EXECUTE a authenticated/PUBLIC |
| Args | `p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL` |
| Return | jsonb |
| **SHA256(definition)** | `767d6fe43c11df0b953ffd8c4236416869fa63d20c11d26e260ca8caca899919` |

Cuerpo completo PRE: ver raw-gate1-live.json → `.capture.reverse_devolution.definition`
(y espejo histórico en supabase/migrations/20260905000002_w9_b10_...sql §5).

## 2. Pipeline canónico de inventario (NO debe ser modificado por B-10b — solo reutilizado)

| Objeto | Papel | SHA256 PRE |
|---|---|---|
| `register_stock_movement` (1 sobrecarga) | Único entry-point de mutación de stock vía pipeline: INSERT stock_movements + sync products | `0c4bf01bd09e5a45ff93554e23129ed5f8d5d4f4b48721f6f1bb60c9770a7a0e` |
| `fn_sync_inventory_on_movement` (trigger BEFORE INSERT en stock_movements) | ÚNICO writer de `inventory` (aplica Δ, fija balance_after, bloquea negativos ERR_INSUFFICIENT_STOCK, valida store match) | `422dd7a4dd2024ef2049230c7992c94fd7c3d7355b3f869c406c2f202b574bf4` |
| `sync_product_stock` (trigger AFTER INSERT en stock_movements) | products.stock_current := último balance_after | `ebef4685f58464801a3307f4b1b2d8af2256a069547c4c0f902e6bb4cf9ef95b` |
| `auto_kardex_on_stock_movement` (trigger AFTER INSERT en stock_movements) | ÚNICO generador de kardex desde movimientos (CASE movement_type → tipo kardex) | `690fe63227197451e6e22c2873282513576031d99464d711e982b0620cbae2d1` |
| `fn_recalc_wac` | ÚNICO writer de `cost_average` (token app.wac_writer + wac_change_log) | `bd55147f943c4c58cd2f6e391806e73dccd494538286d028a706e5567a20c968` |
| `can_reverse_document` (B-10, NO se toca) | Autorización normativa | `959d8195483027ac98eb970c49decbffcb9118422c84bb91e082db332d31fc72` |

Triggers en la cadena (tgenabled='O' todos):
- `stock_movements.tr_sync_inventory_after_movement` → fn_sync_inventory_on_movement
- `stock_movements.trg_auto_kardex` → auto_kardex_on_stock_movement (def SHA256 `1eee1e500e5e736c944268efd790bbeb51e629134e3c1cec4c341b6058a49cc9`)
- `stock_movements.trg_sync_product_stock` → sync_product_stock
- `inventory.trg_prevent_negative_inventory` → prevent_negative_inventory
- `inventory.trg_sync_products_stock_current` → sync_products_stock_current
- `inventory.trigger_prevent_inventory_update` → prevent_direct_inventory_modification
- `products.trg_guard_wac_writer` → w62_guard_wac_writer (único escritor WAC)

## 3. Enum `public.movement_type` (PRE — 17 valores, SIN devolution_reverse)

```
sale, purchase, adjustment, return, initial, transfer, void, transfer_in,
transfer_out, sale_void, production_out, production_in, sale_reverse,
purchase_reverse, production_reverse, issue_slip_out, issue_slip_reverse
```

## 4. Observaciones de captura

- `fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)` existe SOLO en la DB live
  (no tiene migración de origen; diseño W7 D-01). Rama q=0 documentada en su propio
  cuerpo: «Salida pura / devolución A1 / evento neutro: WAC INVARIANTE».
- `register_stock_movement` live ≠ última versión en repo (hotfix A2 v2.22.0 aplicado
  en vivo: sin recálculo WAC interno). B-10b NO la modifica.
- `devolutions` NO está en el mapa de `fn_validate_document_transition` → rama NULL →
  transición permitida; el state machine real lo imponen los guards del RPC (B-10).
- B-10b introducirá EXACTAMENTE 3 cambios: (1) valor de enum `devolution_reverse`,
  (2) cuerpo de `reverse_devolution`, (3) una rama en el CASE de
  `auto_kardex_on_stock_movement`. Todo lo demás queda byte-idéntico (§22 no-drift).
