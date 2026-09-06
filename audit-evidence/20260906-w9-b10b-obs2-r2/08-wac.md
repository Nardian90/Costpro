# W9.5 — B-10b-OBS-2-R2 · 08-wac.md
# GATE 8 — WAC · PASS

## Semántica observada (con definiciones congeladas `raw/r2_fn_defs.json`)

1. `create_sale_v2` lee `cost_average` bajo `FOR UPDATE` (DF-02) y lo usa como `cost_at_sale` del movement, del transaction_item y del kardex.
2. `register_stock_movement` NO recalcula WAC (hotfix A2 v2.22.0: la actualización de WAC fue removida de esta función; el path de WAC pertenece a recepciones/Grupo B/C).
3. El trigger `trg_guard_wac_writer` (BEFORE UPDATE OF cost_average ON products) es el guard de escritura vigente; en R2 no se produjo ninguna escritura de WAC.
4. `wac_change_log` de la tienda: **0 filas antes == 0 filas después** de todas las operaciones (P4 y acta final).

## Comparación WAC before/after por fixture

| Fixture | WAC before (texto exacto) | WAC after todas las operaciones | Δ | OK |
|---|---|---|---|---|
| A `e47421ea` | `489.9999999999999700` | `489.9999999999999700` | **0 (bit a bit)** | ✓ |
| C `da1c4090` | `11.919422583856775` | `11.919422583856775` | **0 (bit a bit)** | ✓ |
| B `983e5726` / B2 `99885245` | 2835 / 2835 | 2835 / 2835 | 0 | ✓ |

Comparación por **texto decimal exacto** (la escala del numeric preserva ceros finales; la igualdad textual es bit-a-bit — ver detalle en P4 y P0 de `raw/r2_master_result.json`).

## Las cuatro prohibiciones del GATE 8 — demostradas

```text
a) la venta NO altera el WAC                → texto exacto idéntico; wac_change_log=0      ✓
b) NO duplica el valor del inventario       → una sola fila inventory (version n+1);        ✓
   kardex total_value = qty × unit_cost, sin doble asiento
c) NO mezcla el initial con una compra      → el movement 'initial' (reference_doc=batch)
   permanece bit a bit intacto (P4b fingerprints == PRE; 98/98 en POST); la venta es
   una fila NUEVA con movement_type='sale', reference_doc='Venta POS v2', reference_id=tx_id ✓
d) NO recalcula el WAC inesperadamente      → semantics doc: WAC solo cambia por
   recepciones (fuera de alcance R2); Σ cost_average de la tienda idéntico PRE/POST        ✓
```

## Veredicto GATE 8

```text
PASS — WAC preservado bit a bit; apertura 'initial' históricamente aislada de las ventas
```
