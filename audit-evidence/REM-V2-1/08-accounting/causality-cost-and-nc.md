# REM-V2-1 — 08/09 ACCOUNTING & INVENTORY — causalidad cost_at_sale=0 (gate §8.4 y §16)

## Pregunta del gate: ¿quién causa `cost_at_sale = 0`? (496 movimientos, 514/633 ítems)

### Cadena del costo (verificada por lectura de código)

1. **Carrito**: `src/store/cart.ts:663` — `cost = product?.cost_price ?? product?.cost_average ?? 0`.
   Si `cost_price` está definido en 0 ⇒ manda 0 (no nullish). Si ambos NULL ⇒ 0.
2. **V1** `create_sale`: `v_cost := COALESCE(v_item->>'cost_at_sale', v_item->>'cost', 0)` (20260803000004:119) — **confía en el cliente**.
3. **V2** `create_sale_v2`: expresión idéntica (pr4_4e:195 y :288) — **confía en el cliente**.
4. `register_stock_movement` escribe `unit_cost = COALESCE(p_unit_cost,0)` y solo recalcula
   `cost_average` cuando entra stock con costo > 0 (20260626000005:54-66).

### Clasificación de causalidad (taxonomy del gate §16)

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| V2 causa el problema | **NO** — el mecanismo es idéntico en V1 y V2 (COALESCE client-cost) | pr4_4e:195 vs 20260803000004:119 |
| V2 hereda costo 0 del stock inicial | **SÍ (parcial)** — productos legacy con `cost_average=0`/`cost_price=0` (seed sin costo, `wac_change_log` sin evento `initial`, F-03 REM-INV-1) | findings REM-INV-1 F-03 |
| V1 dejó residuos históricos | **SÍ** — 496 movimientos históricos fueron registrados por caminos pre-hardening | F-03 |
| Camino activo que continúa generando costo 0 | **SÍ — existe en AMBOS**: vender un producto con cost 0 en catálogo (V1 vía SalesCatalogView o V2 vía POS) sigue grabando unit_cost=0. No es un bug de V2: es una decisión de diseño (cost_at_sale lo aporta el cliente) no cubierta por política contable | cart.ts:663 + ambas defs |
| ¿Contablemente aceptable? | **NO como política silenciosa** — margen/ROI/kardex vacíos para esos ítems. Requiere decisión contable (política de costo base — F-03 REMEDIATION pendiente de decisión humana) | findings F-03 |

**CONCLUSIÓN**: la causalidad es **DATA LEGACY + DISEÑO COMPARTIDO V1/V2**. V2 NO es culpable ni
está exenta: la migración V2-only NO agrava NI corrige este hallazgo. Corresponde al eje
REM-INV-1 (política de costo base), NO a este gate (§16: no mezclar ejes).

## NC fantasma (F-02) — ¿reproducible actualmente por V1?

- Causa raíz documentada: overload v1[0] de `create_devolution` sin movimientos (ya service_role-only).
- Camino activo hoy: `/api/devolutions` con flag OFF llama `create_devolution`; el caller es
  server-side (service_role). ¿Crea docs sin movimientos HOY? La def v1[0] histórica hacía
  UPDATE products + kardex directo (sin stock_movements) — el defecto de "sin ledger" era de esa
  variante; con los cleanup posteriores los docs quedaron sin huella (F-02, datos). La variante
  v2 SÍ escribe movimientos. Clasificación: **V1 HISTORICAL + V1 ACTIVE-legacy si flag OFF**
  (mitigado: service_role-only + decisión pendiente sobre los 13 docs).
- `reverse_devolution` modernizada (B-10b) usa register_stock_movement — OK.

## Inventario (09)

- V1 y V2 deducen/devuelven stock por el mismo single-writer (`register_stock_movement`) o por
  caminos endurecidos con fn_recalc_wac. Las divergencias estructurales de capas paralelas
  (inventory vs products.stock_current vs kardex) fueron scope de REM-INV-1 (Modelo A) y NO
  se reproducen aquí (§27: no convertir en refactor).
- `reverse_receipt` V1 es la única reversión del dominio que **no escribe stock_movements** ni
  WAC — argumento adicional para el retiro.
