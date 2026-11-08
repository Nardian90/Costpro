# T3 — Secuencia de integridad aplicada en PRODUCCIÓN (2026-11-08)

Aplicación controlada vía pooler aws-1 (transacción por migración, abort fail-closed).
Respaldo previo verificado: costprobd_pre_cycle_close_2026-11-08.dump
sha256 52543e635cd02877ac9e6bd81231e6ec3e4f69dcdfbbbb7a0c5cbbc18368a9fa.

| Migración | SHA-256 | Resultado |
|---|---|---|
| 20261108140000_data_integrity_remediation_001_soft_refs.sql | eeede162afbc281130bcdefd986d01a9d8b2514d785dcd994688b8b907a872ef | APLICADA [MEDIDO] |
| 20261108140100_data_integrity_remediation_001_storage_reconcile.sql | 41b848c147bb241df4d24c9a090cca66962528e1eaae21278c936b7abfa9abd1 | APLICADA [MEDIDO] |
| 20261108140200_data_integrity_remediation_001_prevention.sql | 9db12859cd4b659dbcb64ffe63d562b46a0eeda73af6408eaefa94a58166b74b | APLICADA [MEDIDO] |
| 20261108140300_data_integrity_remediation_001_rpc_permissions.sql (NUEVA, T1) | cd35f370eb637880d65f8fd326792a4d30c169e1aa5eff94c1b0a6964022aff3 | APLICADA [MEDIDO] |

## Verificación por catálogo [MEDIDO, 2026-11-08 17:58 UTC]

- FKs retiradas: las 4 FKs duras (commission_rule_versions_rule_id_fkey, _changed_by_fkey, purchase_order_items_po_id_fkey, _product_id_fkey) NO existen. ✓
- Columnas: parent_deleted_at (commission_rule_versions) + parent_deleted_at/product_deleted_at (purchase_order_items) = 3/3. ✓
- Triggers instalados (6/6): trg_commission_rules_mark_versions, trg_purchase_orders_mark_items, trg_products_mark_po_items, trg_stores_mark_orphan_versions, trg_commission_rule_versions_validate_refs, trg_purchase_order_items_validate_refs. ✓
- RPC endurecidas: SECURITY DEFINER + has_function_privilege(service_role)=true, authenticated=false, anon=false (ambas). ✓
- check_data_integrity() ejecutable: hard_orphans = {rule_versions_without_rule: 72, po_items_without_po: 10, po_items_without_product: 10}; soft_marked = {rule_versions_parent_deleted: 72, po_items_parent_deleted: 10, po_items_product_deleted: 10} — coincide con las referencias históricas de la misión (72 versiones + 10 posiciones). ✓
- Aislamiento verificado en CostproE2E (replay 134/134 + secuencia): anon → 401 42501 ERR_PERMISSION_DENIED; usuario authenticated ordinario → 403 42501; service_role → 200. ✓

## Diferencias con los números de referencia de la misión
Ninguna: 72/10/10 exactos.

## scripts/reconcile-storage.mjs
Sigue invocando reconcile_storage_metadata() con SUPABASE_SERVICE_ROLE_KEY → acceso legítimo conservado (service_role). El hardening no rompe el caller.
