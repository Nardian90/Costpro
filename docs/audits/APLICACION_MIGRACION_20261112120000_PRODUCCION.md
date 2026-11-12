# APLICACIÓN EN PRODUCCIÓN — 20261112120000 (Catálogo Maestro: SKU inmutable + identidad compartida completa)

**Fecha:** 2026-11-12 · **Autorizada por:** ORDEN DE EJECUCIÓN del propietario («CIERRE DEL PR #1605», §5:
«Aplica la migración `20261112120000` en producción, exclusivamente mediante el canal canónico documentado por COSTPRO»).
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (patrón
`scripts/m002-aplicar-migracion-PRODUCCION.mjs` / `scripts/apply-migration-mgmt.ts`), doble flag del guard
CP-INFRA-019 (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`), lote único, sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.
**Script versionado:** `scripts/m012-aplicar-migracion-20261112120000.mjs` (declarado en `scripts/lib/writers.manifest.json`, guardProtected).
**Evidencia completa:** `docs/audits/CATALOGO-IDENTIDAD-20261112/m012-aplicacion-produccion.txt`.

---

## 1. Migración aplicada — `20261112120000_cp_catalogo_sku_inmutable.sql`

- **SHA-256 del archivo:** `43d1faee9578f07fd547f8f616bb9c5da2baf64d76edc686ef89442bca6af1f1` (idéntico al aplicado
  en la BD aislada por `verify-catalogo-identidad-pg.mjs`, 36/36).
- **Contenido (punto único de escritura de identidad):**
  1. `fn_master_apply_identity_changes/5` (CREATE OR REPLACE): cualquier objeto de cambios con la clave `sku` →
     `ERR_SKU_IMMUTABLE` (cubre `update_master_product` Y las propuestas aprobadas por `review_master_proposal`).
     Lógica de cambio de SKU retirada (`ERR_SKU_LOCKED_BY_MOVEMENTS`/`ERR_MASTER_SKU_CONFLICT` eliminados del cuerpo);
     nombre editable, propagación de nombre e imagen y auditoría por campo conservadas íntegras.
  2. `propose_master_change/4` (CREATE OR REPLACE): `'sku'` deja de ser proponible → `ERR_SKU_IMMUTABLE` al ENCOLAR.
  3. `trg_products_sku_immutable_guard` (BEFORE UPDATE OF sku en `products`, función SECURITY DEFINER): UPDATE
     directo de SKU en filas SIN maestro → `ERR_SKU_IMMUTABLE` para CUALQUIER cambio real. El trigger y la función
     anteriores (`trg_products_sku_movement_guard`/`fn_products_sku_movement_guard`) retirados.
  4. Políticas de storage `product-images` (insert/update/delete): rama `master-{masterId}-{uuid}.{ext}` cuando el
     maestro pertenece a un tenant con tienda CONECTADA accesible (validación por PK de `master_products` +
     `catalog_store_links` + `has_store_access`). Corrige el defecto latente de imagen para gobernadores no-admin.
  5. Guard de verificación fail-closed `CP-CATALOGO-IDENTIDAD-GUARD` (DO, ejecutado en la misma tanda).
- **Dependencias verificadas ANTES (read-only):** `master_products`, `master_change_log`,
  `master_change_proposals`, `catalog_store_links`, `products`, `has_store_access_as` — todas presentes.

### Estado ANTES (read-only, evidencia)

- `fn_master_apply_identity_changes/5`: SECURITY DEFINER, cuerpo = versión de 20261111120000
  (`ERR_SKU_LOCKED_BY_MOVEMENTS=true`, `ERR_MASTER_SKU_CONFLICT=true`, `ERR_SKU_IMMUTABLE=false`).
- `propose_master_change/4`: SIN la guardra de SKU (`ERR_SKU_IMMUTABLE=false`).
- Triggers: `trg_products_sku_movement_guard` = 1 · `trg_products_sku_immutable_guard` = 0.
- Políticas `product-images` con rama `master-`: 0 de 3.
- Migración NO aplicada previamente (verificación de reanudación 11f — aplicación única, sin duplicar).

### Aplicación

- HTTP **201** (Management API), resultado `[]` (solo DDL + guard DO).
- `NOTIFY pgrst, 'reload schema'` → HTTP **201** (procedimiento oficial post-DDL).
- Aplicación única, idempotente por diseño (CREATE OR REPLACE + DROP ... IF EXISTS).

### Verificación POST (read-only, fail-closed) — 19/19 ✓

| Comprobación | Resultado |
|---|---|
| `fn_master_apply_identity_changes` existe y SECURITY DEFINER | ✓ |
| Guardra `ERR_SKU_IMMUTABLE` (clave `sku` en `p_changes`) | ✓ |
| Lógica de cambio de SKU retirada (sin LOCKED_BY_MOVEMENTS / MASTER_SKU_CONFLICT) | ✓ |
| Propagación de nombre compartido (`name = m.name`) | ✓ |
| Propagación de imagen compartida (`image_url = m.image_path`) | ✓ |
| Sin datos comerciales en la RPC (precio/costo/existencia) | ✓ |
| `propose_master_change` rechaza `sku` al encolar | ✓ |
| `trg_products_sku_immutable_guard` presente (función SECURITY DEFINER) | ✓ |
| Trigger y función anteriores retirados | ✓ |
| ACL helper: EXECUTE solo `service_role` (+postgres owner) | ✓ |
| 3 políticas `product-images` con rama `master-` | ✓ |
| RLS activo en `master_products`, `products`, `master_change_log`, `master_change_proposals`, `tenants`, `stores`, `user_store_memberships`, `catalog_store_links` (con políticas) | ✓ (8 tablas) |

### Pruebas funcionales NEGATIVAS en producción (fail-closed, CERO escrituras)

- **(a)** Cambio de SKU del maestro `112` (filas vinculadas CON movimientos) vía `fn_master_apply_identity_changes` →
  **`ERR_SKU_IMMUTABLE`** (transacción abortada antes de escribir).
- **(b)** Reenvío del SKU idéntico (no-cambio) sobre maestro `QA-CM-20261030-01` (sin movimientos) →
  **`ERR_SKU_IMMUTABLE`** (regla MÁS ESTRICTA que 20261111120000: la clave `sku` ya no forma parte del contrato editable).
- **(c)** `propose_master_change` con `sku` → rechazada sin escritura (`ERR_UNAUTHENTICATED` en el canal Management API
  sin JWT — la guardra al encolar está verificada por cuerpo en la fase 3 y funcionalmente en la BD aislada, 36/36).
- **(d)** `UPDATE products SET sku=…` directo sobre la fila local `PROD-033` (sin maestro y SIN movimientos) →
  **`ERR_SKU_IMMUTABLE`** (trigger; antes de esta migración ese cambio estaba PERMITIDO).
- SKUs de las tres filas objetivo verificados **intactos** tras los abortos (rollback real, cero huella).

### SONDA de nombre compartido y PROPAGACIÓN entre tiendas (rollback forzado, cero huella)

- Fixture: maestro `112` («Grapas metálicas 3/4 con tornillo roscante») con **2 filas vinculadas en 2 tiendas**.
- Dentro de la transacción de la sonda (DO): `fn_master_apply_identity_changes({name})` aplicó el nombre de prueba
  y **propagó a 2/2 filas en 2 tiendas**; sumas de precio/costo/existencia de las filas vinculadas **idénticas** antes
  y después (datos comerciales intactos). Excepción final → rollback forzado → **cero huella**.
- Verificación read-only posterior: nombre del maestro intacto, 0 filas con el nombre de la sonda, conteos de
  `master_change_log` sin delta.

### Política de imagen `master-` para usuarios autorizados NO administradores globales (read-only)

- Roles vivos en `profiles`: tenant_admin×10, encargado×8, admin×4, usuario×4, costo×4, clerk×1, warehouse×1, superadmin×1.
- Candidato: perfil `encargado` con membresía activa en tienda conectada del tenant `5364ccf8-…`.
- Simulación del predicado exacto de la política (vía `has_store_access_as`): `store_access=true`,
  `policy_master_branch_admits=true` → **la política ADMITIRÍA la subida de imagen compartida** para ese usuario no-admin.
- Aislamiento: masters de OTROS tenants alcanzables por ese usuario = **0** → rama `master-` aislada por tenant intacta.
- Bucket `product-images` presente.

### Integridad de datos ANTES == DESPUÉS (delta 0)

`products` 295/295 · `master_products` 200/200 · `stock_movements` 1765/1765 · `transaction_items` 1076/1076 ·
`receipt_items` 308/308 · `master_change_log` 405/405 · `transactions` 1006/1006 · `master_change_proposals` 0/0 ·
`stores` 7/7 · `tenants` 3/3 · `user_store_memberships` 19/19. **Sin efectos colaterales sobre datos de tiendas,
productos, precios, costos o existencias.**

### ROLLBACK (si el propietario lo exigiera)

1. Re-aplicar los cuerpos de `fn_master_apply_identity_changes/5` y `propose_master_change/4` de
   `20261111120000`/`20261028112100` (versiones ANTES documentadas en este expediente y en el surface anterior,
   commit `52904a2c`).
2. `DROP TRIGGER trg_products_sku_immutable_guard ON public.products;` + re-crear `trg_products_sku_movement_guard`
   (definición de 20261111120000) + `DROP FUNCTION ... fn_products_sku_immutable_guard()`.
3. Re-aplicar las 3 políticas de `product-images` de 20261028091000 (sin rama `master-`).
4. `NOTIFY pgrst, 'reload schema'`. (No recomendido: revierte la regla aprobada del propietario.)

---

## 2. contract-surface REGENERADO (§7 de la ORDEN)

- **Comando (canónico):** `set -a; source .env; set +a; node scripts/export-contract-surface.cjs` (script
  documentado en el PR y en el propio archivo; consulta read-only contra la BD viva).
- **Resultado:** `supabase/security-contract/contract-surface.sql` — **190 funciones** (igual conteo: las funciones
  de trigger guard no contienen escrituras y no forman parte del surface, igual que la anterior), sha256
  `f81ee44da087341825cb62655a1705c903f9fba6f88b53ddd5ba60fe0c8dc015`.
- **Diff (única fuente = vivo):** cuerpos de `fn_master_apply_identity_changes/5` (guarda de SKU inmutable +
  retirada de la lógica de cambio) y `propose_master_change/4` (sku no proponible). Ningún cuerpo editado a mano.
- **Coherencia:** `node scripts/security-contract-test-static.cjs` → **CONTRATO OK, 190/190 representadas,
  0 divergencias bloqueantes, 0 excepciones source_of_truth activas** (los 2 warnings preexistentes no bloqueantes
  —`cancel_transfer/2`→`/3`, `reset_store_data/2`→`/3`— son idénticos a los del cierre anterior, migraciones de
  otros tramos fuera del alcance de esta ORDEN).

## 3. Excepciones del allowlist retiradas (§8 de la ORDEN)

`ci-gate-allowlist.json` → `source_of_truth_baseline`: **2 entradas retiradas** (sección vacía) — ya no son
necesarias porque la migración está desplegada en producción y el surface regenerado certifica los cuerpos vivos
(guardas `ERR_SKU_IMMUTABLE` presentes, verificado read-only):

| Excepción | Regla | Evidencia de obsolescencia (read-only, 2026-11-12) |
|---|---|---|
| `fn_master_apply_identity_changes/5` | BODY_DRIFT_FROM_MIGRATION | Migración `20261112120000` **aplicada hoy en producción** (§1 de este expediente); cuerpo vivo == stream; surface regenerada lo certifica |
| `propose_master_change/4` | BODY_DRIFT_FROM_MIGRATION | Ídem: guardra `ERR_SKU_IMMUTABLE` presente en vivo (fase 3) == stream |

La entrada permanente de `fn_master_apply_identity_changes` en `security_definer_without_auth_check`
(helper-interno, CP-CAT-MAESTRO PR 3) NO está relacionada con la deriva: **permanece** (clasificación vigente).

## 4. Controles posteriores (§9 de la ORDEN)

| Control | Resultado |
|---|---|
| TypeCheck (`bunx tsc --noEmit`, heap 3584 MB) | ✓ 0 errores |
| Lint (`bun run lint`) | ✓ 0 errores (1517 warnings preexistentes de estilo, mismos del expediente) |
| Unit & Integration (`bun run test`) | ✓ 5880 passed + 95 skipped, 0 fallos |
| Contrato estático (`security-contract-test-static.cjs`) | ✓ CONTRATO OK — 190/190, 0 divergencias bloqueantes, 0 excepciones activas |
| SQL Gate (`ci-gate-sql-checks.js` + tags estructurales) | ✓ checks generados e íntegros |
| Security Gate TS (`ci-gate-ts-checks.js`) | ✓ todos los checks PASSED |
| Destructive guard (`check-destructive-guard.cjs`) | ✓ 5 pasaron, 0 fallaron |
| BOLA (`bola-contract-test.cjs`) | ✓ todos los endpoints con guard explícito |
| Escritores (`check-writers.mjs`, con `m012` declarado) | ✓ 129 escritores declarados y verificados |
| E2E (suite smoke contra BD aislada CostproE2E, procedimiento de swap) | Ver registro en el expediente de la misión (§5 del EXPEDIENTE.md) |
| Salud del servicio (`GET /api/health`) | ✓ 200 tras restaurar el entorno principal |

## 5. Presupuesto de consumo de la operación (POLITICA_AGENTES_SUPABASE §6)

- Escrituras contra producción: **1** (la migración de este expediente, lote único) + 1 `NOTIFY pgrst` (procedimiento oficial).
- Consultas SQL read-only Management API: ~30 (pre-vuelo, verificación, sonda con rollback forzado, simulación de
  política, export del surface, integridad).
- Consultas Log Query (dashboard): **0**.
