# FASE E-SEC-R — 06 ROUNDING ANALYSIS (FASE 6 — redondeo y precisión)

## Fecha / HEAD
2026-09-26 · dd1e6fb9 · READ-ONLY + verificación numérica
(`/home/z/my-project/scripts/esecr-rounding-proof.js` → `esecr-rounding-proof.json`).

## Política matemática ACTUAL (de facto — sin decisión explícita)

| Etapa | Cliente | Servidor (create_sale_v2) |
|---|---|---|
| Precio unitario efectivo | `effectiveUnitPrice()`: pct → `base×(1−d/100)`; fixed → `(base×qty−d)/qty` — SIN redondeo | usa el `price_at_sale` recibido tal cual (numeric) |
| Descuento porcentual | `getDiscountAmount()`: `(subtotalCup×d/100).toFixed(2)` | `LEAST(subtotal×d/100, subtotal)` — sin redondear |
| Subtotal de línea | `getItemSubtotalCup` — sin redondear | `Σ price×qty` — sin redondear |
| Subtotal global | `getSubtotalCup()` → `.toFixed(2)` | `v_calculated_subtotal` — sin redondear |
| Impuestos | `getTaxAmount()` → `.toFixed(2)` | sobre `GREATEST(0, subtotal−descuento)` — sin redondear |
| Total | `getExpectedTotalCup()`/`getTotalCup()` → **redondeo ÚNICO** a 2 decimales al final | `subtotal − discount + tax` — sin redondear |
| Persistencia | — | numeric exacto (A16: persistió 490.999999) |
| Comparación server/client | — | tolerancia **0.01** (`ERR_TOTAL_MISMATCH :222-225`) e invariante de pagos **1.00** (mixed) / **0.01** (post-INSERT) |

## Verificación numérica (casos del mandato)

| Caso | Client (round final) | Server (exacto) | Δ | ¿Pasa? |
|---|---|---|---|---|
| A: 500×0.97 | 485.00 | 485 | 0 | ✓ |
| B: 500−15 fixed | 485.00 | 485 | 0 | ✓ (idéntico a A — la vía pct y la fixed son económicamente equivalentes) |
| C: 19.99×3 | 59.97 | 59.97 | 0 | ✓ |
| D: 33.33×3 fixed 10 | 89.99 | 89.99 | 0 | ✓ (pct efectivo 10.001%) |
| E: 99.95×2 pct 7 | 185.91 | 185.907 | 0.003 | ✓ |
| F: 490.999999 | 491.00 | 490.999999 | 0.000001 | ✓ |
| G: peor caso 5 líneas ×.005 | 50.03 | 50.025 | 0.005 | ✓ |
| H: 500→425 (15% justo) | 425.00 | 425 | 0 | ✓ (gate dispara en ≥15 exacto) |
| I: 500→424.99 (15.002%) | 424.99 | 424.99 | 0 | ✓ |
| J: dilución B (20% + 0%) | 1400.00 | 1400 | 0 | ✓ (pct agregado 6.67% — ver 03) |

## Pregunta crítica del mandato
> ¿Pueden cliente y servidor terminar con UI=96.99 / SERVER=97.00 por diferencias
> de precisión?

**NO en el dominio moneda única CUP.** El cliente redondea UNA sola vez al final
(`getExpectedTotalCup`: suma exacta → `.toFixed(2)`), así que el error máximo es el
de un único redondeo (±0.005, caso G), siempre estrictamente menor que la tolerancia
del servidor (0.01). El servidor no redondea y compara contra el valor exacto: no
existe acumulación de redondeos por línea en la comparación. Los casos con decimales
del mandato (19.99 / 33.33 / 99.95) y la equivalencia 500×0.97 ≡ 500−15 quedan
demostrados en `esecr-rounding-proof.json`.

Nota multi-moneda (observación, fuera de alcance): la comparación server asume ítems
homogéneos en la moneda de la venta; un carrito con monedas mezcladas por ítem y
tasas ≠ tasa de venta fallaría `ERR_TOTAL_MISMATCH` **fail-closed** (no genera datos
malos; es el comportamiento v2 vigente, preexistente).

## Interpretación
La política de facto es **coherente y fail-closed**: cálculo exacto server-side,
redondeo de presentación/payload en el cliente y tolerancia explícita. NO existe una
decisión comercial explícita sobre redondeo (¿se permite vender a 490.999999? — hoy
sí, caso F, y queda persistido tal cual). Por la regla de la fase: **no se cambia la
política matemática**; la decisión de endurecerla (p.ej. exigir 2 decimales en
`price_at_sale` o redondear el desvío) queda en `08-DECISIONS.md` como NO DECIDIDO.
