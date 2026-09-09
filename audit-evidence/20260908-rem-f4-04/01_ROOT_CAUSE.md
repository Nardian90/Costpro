# 01 — ROOT CAUSE (F4-04)

**Clasificación original:** F4-04 CONFIRMED P1 (RECON 04d4f062, veredicto RECON COMPLETE)

## Defecto observable

El camino real de recepción de mercancía (HTTP) incrementa stock pero nunca
actualiza el costo promedio ponderado (WAC / `products.cost_average`):

```
POST /api/inventory/receptions → HTTP 201
  → register_reception (RPC SECURITY DEFINER)
    → receipts INSERT (status='active')
    → receipt_items INSERT
    → register_stock_movement → stock incrementa, kardex creado
    → products.cost_average SIN CAMBIOS   ← DEFECTO (stock 0→10, WAC 0→0)
```

Evidencia RECON sobre fixture AUDIT F4E1 STORE A (producto Arena, vía HTTP real):
`stock: 0 → 10, WAC: 0 → 0`.

## Causa raíz — delegación mutuamente rota (smoking gun v2.22.0)

La definición viva de `register_reception` (preservada en
`evidence/register_reception_live.sql`) contenía el comentario:

```
-- A1 WAC HOTFIX (v2.22.0): Path 3 eliminado.
-- El WAC lo calcula register_stock_movement (Path 2, corregido en A2)
-- y el trigger trg_update_product_wac (Path 1).
```

Ambos mecanismos de delegación están muertos en la BD viva:

1. **Path 1 — trigger `trg_update_product_wac`: AUSENTE.** Verificado en
   `pg_trigger` (evidence/remf404-db-inspection.txt §A4): en `products` solo
   existen `trg_ensure_product_barcode`, `trg_guard_wac_writer`,
   `trg_maintain_product_completeness`, `trigger_audit_product_changes`;
   en `receipt_items` solo `trg_check_reception_cost_variation` y
   `trg_sync_has_movements_receipt`. El trigger es referenciado por ≥6
   migraciones históricas del repo pero nunca quedó creado en la BD viva.
2. **Path 2 — `register_stock_movement`: NO ESCRIBE WAC.** Su propio cuerpo
   declara: *"A2 WAC HOTFIX (v2.22.0): WAC update removed from
   register_stock_movement. The trigger trg_update_product_wac handles WAC
   for receipt_items."* (evidence/register_stock_movement_live.sql).

Resultado: cada mecanismo delega en el otro; el WAC nunca se escribe por el
camino de recepción. El defecto es de **flujo**, no de fórmula: el escritor
canónico `fn_recalc_wac` existe y funciona (el camino canónico
`confirm_pending_reception` produce WAC 800 → 802 exacto, ver RECON).

## Escritores de `products.cost_average` en la BD viva (census §A7)

Censo forense de funciones cuyo código toca `cost_average`
(evidence/remf404-writer-census.txt y -raw.json):

- **Único escritor directo de WAC:** `fn_recalc_wac` (HYBRID, escribe
  `SET cost_average = v_ca_new, updated_at = now()`), protegido por el guard
  `trg_guard_wac_writer` + `w62_guard_wac_writer()`.
- **Delegadores legítimos** (invocan `fn_recalc_wac`): `fn_process_receipt`,
  `perform_inventory_adjustment`, `receive_production_output`,
  `reverse_devolution`, `reverse_production_order`, `reverse_receipt_v2`,
  `void_closed_production_order`, `w62_guard_wac_writer`.
- **Caso especial documentado:** `reset_store_data` hace reset total
  (`stock_current = 0, cost_average = 0`) — no es un cálculo de WAC.
- **Lectores sin escritura:** el resto del censo (16 funciones más).

Conclusión: la remediación correcta NO crea una segunda autoridad matemática;
conecta el camino roto al escritor canónico existente.
