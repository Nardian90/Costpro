> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/64-consumer-remediation-map.md` (citado en otros docs como «doc 63» — deriva de numeración del original, preservada tal cual)
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 64 — Mapa deremediación de consumidores (SIN tocar código ahora)

Origen: `../W1-DATAFLOW/10-code-map-wac.json` (368 hitos) y defs verbatim. Este mapa es el checklist de implementación de W7/W9; su ejecución queda prohibida hasta ratificación (doc 63). Cada ítem referencia la regla violada.

## A. Fallbacks cruzados a eliminar (R-1 / D-02)

| Archivo | Línea(s) | Hoy | Debe quedar |
|---|---|---|---|
| `src/store/cart.ts` | 663 | `cost_price ?? cost_average` para costo del carrito | eliminar campo enviado al server; display opcional WAC-only |
| POSView.tsx | 228, 247, 218, 254 | `cost_price \|\| 0` (costo + warning margen) | margen paramétrico CP explícito NO persistido; sin envío |
| InventoryKPIs.tsx | 42,51,228 (+ABCAnalysisModal 1) | `ca \|\| cp` | solo `ca` |
| CostAnalyticsView | (4 usos) | effectiveCost ca??cp «WAC» | solo `ca`; renombrar etiqueta según D-01 |
| get_transactions_with_profit (SQL) | 52 | `COALESCE(NULLIF(cost_at_sale,0), pr.cost_price,0)` | cost_at_sale puro post-T; pre-T flag LEGACY (62 §3) |
| product-completeness.ts | 50,69+ | cp como requisito financiero | mantenido SOLO como paramétrico-catálogo con texto «referencia» |
| bulk-import / CreateProduct / EditProduct modales | varios | escriben cp | permanecen escritores legítimos de CATÁLOGO (D-02); dejar de presentarlos como «costo real» |

## B. Escritores a unificar (PR-1) y parámetros deprecados

| Objeto | Cambio canónico |
|---|---|
| trigger `trg_update_product_wac` (receipt_items AFTER) | ELIMINAR/guard pasivo → único motor `fn_recalc_wac` llamado por RPCs |
| `create_sale_v2` L112/L214 | ignorar cliente; computar snapshot server-side (D-03) |
| `withdraw_production_item` p_server_side_cost/p_unit_cost | forzar server-side true; false ⇒ error |
| `receive_production_output` COALESCE(uc,0) | rechazo cero sin bandera admin (D-07); acumulación ponderada parciales |
| `reverse_receipt_v2` vs `void_reception_with_reversal` uc 0-vs-real | unificar doctrina compensatoria (D-09) |
| `perform_inventory_adjustment` | requerir u_adj>0 en Δ>0; quitar GREATEST floor (D-06/R-3) |
| transfer destino | blend destino (D-08) — RPC confirm-transfer aún no recalcula |

## C. Pantallas/contratos afectados por dejar de espejar cp=ca

- Recibir producción espeja hoy (única ruta sincronizada): tras canon, POS mostrará margen paramétrico (cp catálogo) ≠ margen económico (ca) — decidir presentación única «margen económico = precio vs COGS real del período» en reportes; warning precio<cp catálogo se conserva como aviso de reposición.
- `is_complete` exige cp>0: pasa a advertencia de catálogo, no bloqueo financiero [D-02].

## D. Infra de idempotencia (D-10)

- RPCs ya con clave: create_sale_v2/UNIQUE, create_devolution_v2, receive_production_output(param_hash), withdraw, vale-salida. Pendientes de estandarizar sobre registry común: register_reception(+confirm), transfers confirm, adjustment reverse paths.
