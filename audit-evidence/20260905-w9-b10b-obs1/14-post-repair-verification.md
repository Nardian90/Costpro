# W9.5 — B-10b-OBS-1 · 14-post-repair-verification.md
# GATES 14/15/16 — Invariantes post, no-drift global (sentinels) e integridad de código

## GATE 14 — Invariantes (§20)

| Invariante | Esperado | Observado | Resultado |
|---|---|---|---|
| products.stock_current == inventory.quantity | == para todo producto CON inventory | 0 mismatches sobre 141 productos (assertion A3) | ✓ |
| ledger_sum == inventory.quantity | donde existe ledger | 0 productos con movements sin fila de inventory; kardex == movements 1:1 (702=702) | ✓ |
| Kardex trazabilidad | coherente | 0 kardex huérfano referenciando devoluciones (assertion A5) | ✓ |
| WAC_PRE == WAC_POST | 11.919422583856775 | assertion A6 exacta | ✓ |
| payments_PRE == payments_POST | 0 refs a devoluciones | assertion A7 | ✓ |
| commissions_PRE == commissions_POST | intactas | period-based, sin vínculo a devoluciones (08-financial-analysis.csv) | ✓ |
| Devoluciones sin cambios (status/created_at/tx/qty/store) | intactas | assertion A8 (updated_at del producto intacto); devoluciones ni tocadas (0 escrituras) | ✓ |

## GATE 15 — No-drift global: sentinels PRE == POST (21/21)

`scripts/sentinels.sql` (los 21 sentinels de B-10b: 13 counts + 8 invariants) ejecutado
PRE (raw-sentinels-pre.json) y POST (raw-sentinels-post.json) de la fase.

- counts: devolutions=13, devolution_items=13, products=323, inventory=141,
  stock_movements=702, kardex_entries=702, audit_logs=7376, … **idénticos PRE/POST**.
- invariants: products_sum_stock, inventory_sum_qty, movements_sum_delta,
  devolutions_by_status (reversed:1, completed:12), devolutions_max_created… **idénticos PRE/POST**.

**Para métricas reparadas: POST == EXPECTED** — al ser 0 las mutaciones,
POST == PRE == estado matemáticamente esperado (el drift histórico fue eliminado
por la purga de tienda, evento externo documentado; el par neto sobre products = 0).

## GATE 16 — Integridad de código (0 drift de funciones)

| Función | PRE fase (raw-g5-functions-store.json) | POST fase (raw-g5-functions-post.json) | Estado |
|---|---|---|---|
| register_stock_movement | 0c4bf01b… | 0c4bf01b… | **IDÉNTICA** (congelada B-10b) |
| fn_recalc_wac | bd55147f… | bd55147f… | **IDÉNTICA** |
| fn_sync_inventory_on_movement | 422dd7a4… | 422dd7a4… | **IDÉNTICA** |
| sync_product_stock | ebef4685… | ebef4685… | **IDÉNTICA** |
| auto_kardex_on_stock_movement | 38f6e5b7… | 38f6e5b7… | **IDÉNTICA** (versión B-10b con rama devolution_reverse) |
| reverse_devolution | bb8f3c09… (OID 136657) | bb8f3c09… (OID 136657) | **IDÉNTICA** — versión B-10b canónica; el cuerpo histórico PRE-B-10b (767d6fe4…) ya no existe en producción |

No se modificaron ACL, SECURITY DEFINER, search_path, triggers ni RLS (la fase no
ejecutó DDL alguno).

## Veredicto de verificación

La fase OBS-1 concluye con **0 cambios en la base** y todos los invariantes del
mandato satisfechos; el único artefacto de código es el test permanente
`src/__tests__/integration/iteration-16-b10b-obs1-historical-repair.test.ts` (hermético,
read-only) y el pack de evidencia.
