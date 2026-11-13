# MISIÓN SKU 197 — Importación al Catálogo Maestro y eliminación de productos

**Fecha:** 2026-11-13 · **Caso:** CP-CAT-IMPORT-001 + CP-PROD-DEL-001 · **Rama:** `fix/import-master-eliminacion-20261113`
**Entorno:** producción `wthkddeleylijmonclxg` (auditoría/reparación) + BD aislada `CostproE2E` (suite conductual).

## 1. Estado real detectado (auditoría read-only, BD viva)

- Producto local SKU 197: `products.id = cbdac70a-38c5-4d86-8f4c-ce6330b5ed94`
  (ENERVIDA-VITALLCONS `5e6fe821-5465-48b1-b3f1-3aa3182edc38`, tenant `5364ccf8-e6cd-4c38-aea8-b167b3b5576f`).
- `master_products` sku=197: **0 filas** → el artículo no aparecía en el Catálogo Maestro.
- `products.master_product_id` de la fila local: **NULL** → sin vínculo.
- Tienda conectada: `catalog_store_links.status='connected'` (desde 2026-10-31); 4 tiendas conectadas en el tenant.
- Sin duplicados (1 fila) y sin dependencias (transaction_items, stock_movements, receipt_items,
  devolution_items, material_request_items, product_cost_sheets, inventory, purchase_order_items: 0).
- admin@demo.com: role **superadmin**, **sin membresía** en ENERVIDA (solo COSTPRO-Prueba y SHADDAI),
  es **owner del tenant** → `is_catalog_governor` = true por diseño.

## 2. Causa raíz A — importación sin Catálogo Maestro

`POST /api/catalog/bulk-import` hacía UPSERT directo en `products` y solo
**reutilizaba** maestros ya existentes (master-stamp best-effort); **jamás creaba**
`master_products` para SKU nuevos (comentario deliberado «fuera del alcance conservador
de esta ruta»). En una tienda conectada, cada SKU nuevo importado quedaba como fila
local huérfana, invisible para las demás tiendas. La alta manual conectada usa
`create_master_product` (maestro+fila atómicos) y las recepciones `register_reception`
— el importador era la única vía de alta masiva que evade el catálogo.

## 3. Causa raíz B — eliminación imposible (23514)

Dry-run con JWT emulado de admin@demo.com contra la RPC `managed_delete_product`
(SECURITY DEFINER): autorización OK (`is_admin` incluye superadmin desde 20261026120000 →
`has_store_access=true`), sin movimientos → pasa todos los checks, ejecuta los DELETE y
**falla al final en el INSERT de auditoría**:

```
23514: new row for relation "audit_logs" violates check constraint "audit_logs_store_id_check"
```

Constraint vivo: `CHECK (store_id IS NOT NULL OR table_name = ANY(ARRAY['profiles','stores',
'system','master_products','master_parties','fin_rule_versions']))` — `table_name='products'`
exige `store_id NOT NULL`; la RPC insertaba la tienda solo dentro de `old_data` (jsonb) →
23514 → **todo el DELETE se revierte** y la UI muestra el SQL crudo.
Mismo defecto en `managed_toggle_product_active`. La membresía NO era la causa
(aunque la verificación exigida quedó documentada: superadmin sin membresía pasa por
`is_admin`, y el owner es gobernador de catálogo).

## 4. Correcciones

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261113140000_cp_products_audit_store_id.sql` | Auditoría con `store_id` explícito en ambas RPCs (cuerpo vivo certificado verbatim) + pre-chequeos con mensajes comprensibles para FK RESTRICT/NO ACTION (devoluciones, solicitudes de material, ventas, compras, transferencias, vales, conteos físicos, producción). |
| `supabase/migrations/20261113140100_cp_catalogo_importador_maestro.sql` | RPC `managed_bulk_import_products`: garantiza maestro por (tenant, sku) en tiendas conectadas (reutiliza o crea), vincula la fila local, aislamiento por fila con compensación transaccional (cero huérfanos), idempotente, maestro solo con identidad, anti-spoofing + autorización idénticas a `create_master_product`, límite 500, errores por fila. |
| `src/app/api/catalog/bulk-import/route.ts` | Delega por tienda en la RPC (mismo servicio de dominio que alta manual/recepciones); respuesta con `results`/`errors` por fila, `masters_created`, `masters_reused`. |
| `src/components/views/terminal/views/catalog/CatalogImportDialog.tsx` | Mensajes con rechazos por fila y causa. |
| `src/components/views/terminal/views/catalog/CatalogView.tsx` | `getErrorMsg` traduce 23514/23503 y los mensajes nuevos de la RPC. |
| `supabase/migrations/20261113140200_cp_fin_acl_reconcile.sql` | Reconciliación ACL (Capa C) de las 9 RPCs `fin_*` del módulo FIN del mismo día (drift preexistente ajeno a esta misión, detectado por el gate). |
| `supabase/security-contract/contract-surface.sql` | Regenerado desde producción (207 funciones). |

## 5. Reparación del SKU 197 (producción, verificable y auditable)

1. **DRY-RUN** `incorporate_store_products_to_master(store, dry_run:=true)`:
   `candidates=1, would_create=1` — solo el 197, sin excepciones ni conflictos.
2. **APPLY** `dry_run:=false` (contexto service_role + `p_user_id` del owner, igual que
   el transporte real de la app): `created=1`.
   - **Maestro:** `6546fe9a-a1b2-41c7-be92-866f7c224c5f` (sku 197, name «Toma corriente
     de 15amp.», barcode 7500000489117, unidad, active).
   - **Local:** `cbdac70a-38c5-4d86-8f4c-ce6330b5ed94` (ID conservado) con
     `master_product_id` estampado; price 0, cost 0, min_stock 1, stock 0, category
     «Electricidad», operational_class «venta», is_active true — **datos locales intactos**.
   - `master_change_log`: 2 registros (sku, name) con actor/origen.
3. **Visibilidad cross-store:** `search_master_products` desde FERROCARRIL VITALLCONS
   lo encuentra (`activated=false` → «Activar en esta tienda» disponible; flujo probado
   en la suite E2E T6b).
4. **Borrado del 197:** DRY-RUN con JWT emulado post-fix: `rpc_result=OK`, producto
   eliminado dentro de la transacción (rollback) — el usuario ya puede eliminarlo desde
   la interfaz si lo desea; se deja reparado y activo.

## 6. Pruebas

- **Suite conductual E2E (BD aislada, transacción única con ROLLBACK → net-zero):**
  12 escenarios de la misión, **26/26 aserciones PASS** (import conectada/no conectada,
  maestro+vínculo, reimport sin duplicados, SKU preexistente, visibilidad y activación
  desde otra tienda, borrado sin dependencias, borrado local vinculado con maestro
  sobreviviente, protección del maestro por RLS, rechazo con historial, permisos/RLS
  3 casos, lote mixto con aislamiento por fila). Script: `scripts/e2e_behavioral_suite.sql`
  (fuera del repo, evidencia en `scripts/` del sandbox; replicable).
- **Unitarias/integración:** 34 tests nuevos/actualizados
  (`cp-products-audit-store-id-migration.test.ts`,
  `cp-catalogo-importador-maestro-migration.test.ts`,
  `catalog-bulk-import-validation.test.ts` — casos 16-20 nuevos).
- **Gates de CI:** typecheck (tsc --noEmit) OK · eslint 0 errores ·
  `check-destructive-guard` OK (guard `DESTRUCTIVE-OK: CP-PROD-DEL-001`) ·
  `security-contract-test-static` OK (0 bloqueantes tras la reconciliación ACL) ·
  vitest completo 6006 PASS.

## 7. Aplicación en producción (registrada)

- 20261113140000_cp_products_audit_store_id.sql — aplicada (Management API, SQL query).
- 20261113140100_cp_catalogo_importador_maestro.sql — aplicada.
- 20261113140200_cp_fin_acl_reconcile.sql — aplicada (no-op en producción: replica la ACL viva).
- Reparación SKU 197 vía RPC gobernada (dry-run → apply), auditada en audit_logs.
