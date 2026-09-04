# W9.4.9 — H5-B3 — GATES 8: WAC / INVENTORY SAFETY

Fecha: 2026-09-04 | Fuente: estado final tras la prueba concurrente real (query
`w9h5b3_q9_finalstate.sql` + agregados del TEST FINAL en `w9h5b3_race_output.txt`).

## Modelo de amenaza del protocolo

¿Puede la carrera concurrente producir:
- double stock movement,
- double WAC reversal,
- negative/incorrect stock?

## Estructura de locks que lo impide (ver 03-lock-analysis.md)

1. El movimiento de stock lo emite SOLO la sesión que posee el lock de la fila `transactions`
   (el FOR UPDATE precede a cualquier `register_stock_movement`).
2. Los movimientos concurrentes de producto IGUAL (transacciones distintas) serializan por el
   `UPDATE inventory SET quantity = quantity + Δ` del trigger `fn_sync_inventory_on_movement`
   (lock de fila de inventory, suma relativa → balance_after consistente).
3. La ruta de ventas (`sale_reverse`/`sale_void`) NO recalcula WAC: no invoca `fn_recalc_wac`;
   `cost_average` queda INVARIANTE (A2 hotfix v2.22.0). No existe "WAC inversion" en esta ruta.

## Verificación empírica (expected vs actual)

Fixture: producto sintético, stock inicial 0, inventory 0, 6 transacciones con 1 item × 5 u.

| tx | prueba | status final | movements (tipo, q) | esperado | OK |
|---|---|---|---|---|---|
| …0101 | CARRERA V2×2 | voided | 1 × sale_reverse +5 | 1 movimiento | ✔ |
| …0102 | B2 bloqueo (ya voided) | voided | 0 | 0 (perdedor sin efectos) | ✔ |
| …0103 | V2,V2,void secuencial | voided | 1 × sale_reverse +5 | 1 movimiento | ✔ |
| …0104 | void → V2 | voided | 1 × sale_void +5 | 1 movimiento | ✔ |
| …0105 | intentos NO autorizados | completed | 0 | 0 (intocada) | ✔ |
| …0106 | overlap (RPC ganó) | voided | 1 × sale_reverse +5 | 1 movimiento | ✔ |

Agregados del producto tras TODA la suite:

| métrica | valor | verificación |
|---|---|---|
| inventory.quantity | 20.0000 | 0 + 5×4 reversiones efectivas = 20 ✔ |
| products.stock_current | 20.0000 | coincide con inventory ✔ |
| products.cost_average | 400 | INVARIANTE (sin recálculo WAC en ruta ventas) ✔ |
| stock_movements del producto | 4 | 1:1 con reversiones efectivas ✔ |
| kardex_entries del producto | 4 | 1:1 con movimientos (trigger auto_kardex) ✔ |
| sale_reverse_count / sale_void_count | 3 / 1 | exactamente los 4 eventos efectivos ✔ |
| wac_change_log del producto | 0 | ninguna mutación de WAC ✔ |
| stock negativo (global) | 0 productos | no se produjo negative stock ✔ |

## Conclusión

No hay double stock movement, no hay double WAC reversal (la ruta ni siquiera toca WAC),
y el stock final coincide EXACTAMENTE con el esperado por reversión única. La carrera, si
existiera ventana, se cerraría aquí; la prueba demuestra que ni siquiera se abre.
