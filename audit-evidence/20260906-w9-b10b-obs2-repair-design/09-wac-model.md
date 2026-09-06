# W9.5 — B-10b-OBS-2 · REPAIR DESIGN · 09-wac-model.md
# Modelo WAC de la apertura (GATE 4 + GATE 6) — CRÍTICO

## 1. Fuentes de WAC disponibles (GATE 4.1–4.5)

| Pregunta del mandato | Respuesta | Evidencia |
|---|---|---|
| 1. WAC del snapshot 08-02 | **NO DISPONIBLE** — el payload no trae campo de costo por producto (per_product: id/sku/name/b_inv/b_upd/b_stock/t_stock/flags) | OBS-2 raw/g10_payload.json, F3.3 |
| 2. WAC actual | `products.cost_average` por producto (frozen pre-purge; última escritura ≤ 2026-08-16T22:01Z) | raw/g2_universe.json |
| 3. ¿Confiable? | **SÍ** — escritor único forzado (`trg_guard_wac_writer` BEFORE UPDATE OF cost_average exige token `app.wac_writer='fn_recalc_wac'`), y `wac_change_log` de la tienda = **0 filas** históricas | raw/g5_triggerdefs.json, g21_pre |
| 4. ¿Recuperable del backup? | **NO** (no existe en el payload) — se documenta como limitación, no se inventa | F3.3 |
| 5. ¿Calculable por movimientos post-backup? | **NO** — stock_movements purgados; BE no trae unit_cost; kardex purgado | F5, F2.1 |
| 6. ¿Algún producto sin WAC confiable? | **NO en el universo de reparación**: 98/98 con cost_average finito > 0 → `WAC_CONFIRMED`; WAC_UNKNOWN = 0 (V5, V8) | 06-wac-analysis.csv |

Clasificación final: **WAC_CONFIRMED × 98 · WAC_DERIVABLE × 0 · WAC_UNKNOWN × 0.**
Si alguna fila hubiera resultado WAC_UNKNOWN, quedaría EXCLUIDA de la apertura
(tratamiento separado, decisión humana) — regla registrada aquí aunque no se activa.

## 2. Tratamiento de WAC en la apertura (GATE 6)

### 2.1 Decisión

```text
opening_unit_cost(p) := products.cost_average(p)   -- exacto, por producto, con assert
```

La apertura NO recalcula WAC y NO diluye costos:

- `register_stock_movement` **no** invoca `fn_recalc_wac` (hotfix A2 v2.22.0: «WAC update
  removed from register_stock_movement») → `cost_average` queda intacto tras el RPC. 
  [raw/g5_funcdefs.json]
- El guard `trg_guard_wac_writer` solo se dispara con `UPDATE OF cost_average`; el UPDATE
  de stock_current del RPC no lo activa. [raw/g5_triggerdefs.json]

### 2.2 Prueba de invariancia del blend D-01 (doble blindaje)

Aunque algún writer futuro invocara `fn_recalc_wac` con los parámetros de la apertura,
el blend canónico `ca_new = (S·ca_prev + q·uc)/(S+q)` con `uc := ca_prev` es algebraicamente
invariante para CUALQUIER S (incluido el S huérfano que fn_recalc_wac leería de
products.stock_current):

```text
ca_new = (S·ca + q·ca) / (S + q) = ca·(S+q)/(S+q) = ca
```

Demostración numérica (raw/simulation_result.json → wac_blend_invariance_proof):

```text
CAT-0001: S=19,    ca=489.99999999999997, q=19,    uc=ca → ca_new=489.99999999999997 ✓
CAT-0002: S=966,   ca=11.919422583856775, q=966,   uc=ca → ca_new=11.919422583856775 ✓
CAT-0003: (tercera muestra) invariante ✓
```

### 2.3 Prevención de doble valoración (casos del mandato)

Simulación exacta de la semántica congelada (scripts/simulate_repair.js; fuente de las
reglas: raw/g5_funcdefs.json + raw/g5_triggerfns.json):

| Caso | Comportamiento demostrado |
|---|---|
| inventory inexistente | `fn_sync_inventory_on_movement`: INSERT inventory(quantity=+Q); balance_after=Q. La base valorada pasa de **0 → Q·WAC** (una sola vez) |
| products.stock_current > 0 (huérfano S=Q) | El RPC hace `stock_current := balance_after = Q` (ABSOLUTO, no incremental) y `trg_sync_product_stock` escribe el mismo valor absoluto → stock_current **no cambia** (Q→Q); NUNCA queda S+Q |
| apertura +Q | 1 movimiento 'initial', 1 fila inventory (0→Q), 1 kardex 'in' (qty=Q, uc=WAC, total=Q·WAC, balance_quantity=Q, balance_unit_cost=WAC, balance_total_value=Q·WAC), 1 business_event |
| WAC esperado | cost_average sin cambios (bit a bit) en los 98; wac_change_log +0 |
| kardex | trg_auto_kardex mapea 'initial'→'in'; 1:1 con movimientos; reference_description = reference_doc (batch) |
| inventory.balance_after | = Q = inventory.quantity = stock_current = Σ movements |

**Resultado:** valoración post-apertura = 6.427 × WAC = 9.932.216,94 ESTIMATED — sin doble
conteo (el valor declarado huérfano nunca fue valoración de ledger: inventory era 0).

### 2.4 Guardas de costo registradas en el diseño

- G1: `p_unit_cost` DEBE ser exactamente `cost_average` del producto (assert por fila
  dentro de la transacción; desviación → ABORT, GATE 19).
- G2: producto con cost_average NULL/≤0 → NO reparable automáticamente (ninguno hoy).
- G3: prohibido pasar unit_cost=0 (crearía kardex con valor 0 y, ante cualquier recálculo
  futuro, diluiría el WAC a 0).
- G4: post-apertura, cualquier cambio de WAC legítimo seguirá el camino canónico único
  (fn_recalc_wac vía receipt_items/ventas), quedando trazado en wac_change_log.
