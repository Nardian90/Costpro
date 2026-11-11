# APLICACIÓN EN PRODUCCIÓN — 20261111120000 + normalización de ACL + regeneración de contract-surface

**Fecha:** 2026-11-11 · **Autorizada por:** ORDEN DE EJECUCIÓN del propietario («CIERRE TOTAL DE
PENDIENTES Y ESTABILIZACIÓN DE MAIN», §1: «Aplica efectivamente la migración en producción mediante
el canal habitual y autorizado del proyecto»).
**Canal:** Management API `/database/query` + `NOTIFY pgrst, 'reload schema'` (patrón
`scripts/m002-aplicar-migracion-PRODUCCION.mjs` / `scripts/apply-migration-mgmt.ts`), doble flag del
guard CP-INFRA-019 (`ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND`), lote único, sin reintentos.
**Producción:** CostproBD — ref `wthkddeleylijmonclxg`.

---

## 1. Migración aplicada — `20261111120000_cp_catalogo_master_gestion_tienda.sql`

- **SHA-256 del archivo:** `0826952331a8cecfaba8e4fc935b0451a8e0dd0db9b0597d4e9e8731aa88c4cb`.
- **Contenido:** guardas de integridad de SKU ante movimientos históricos para el Catálogo Maestro
  (brief §4 de la misión GESTIÓN-CATALOGO-MAESTRO):
  1. `fn_master_apply_identity_changes/5` (CREATE OR REPLACE): `ERR_SKU_LOCKED_BY_MOVEMENTS` cuando
     el cambio real de SKU del maestro alcanza filas locales vinculadas con movimientos reales
     (`has_movements` + verificación directa de `transaction_items`/`stock_movements`/`receipt_items`)
     y `ERR_MASTER_SKU_CONFLICT` para colisión con SKU local no-vinculado en tiendas afectadas.
     Punto único: cubre `update_master_product` y las propuestas aprobadas por `review_master_proposal`.
  2. `trg_products_sku_movement_guard` (BEFORE UPDATE OF sku en `products`): UPDATE directo de SKU en
     filas SIN maestro con movimientos → bloqueado (fail-closed para PostgREST directo).
  3. Guard de verificación fail-closed `CP-MASTER-GESTION-GUARD` (ya ejecutado en la misma tanda).
- **Dependencias verificadas ANTES (read-only):** `master_products`, `master_change_log`,
  `products.has_movements`, `trg_products_master_identity_guard`, tablas de movimientos — todas
  presentes. Coexistencia de triggers verificada (mismo patrón ya probado en la BD aislada 21/21 por
  `scripts/e2e/verify-master-gestion-pg.mjs`).

### Estado ANTES (read-only, evidencia)

- `fn_master_apply_identity_changes/5`: SECURITY DEFINER, cuerpo = **20261028112100 original**
  (verificado byte a byte contra la migración de origen, solo formato): SIN guardas de SKU y **sin la
  propagación de imagen** de 20261030120000 (esa migración también estaba pendiente en producción
  para esta función — hallazgo de esta aplicación).
- `trg_products_sku_movement_guard`: **ausente** (0 filas).
- 184 maestros con filas vinculadas con movimientos (afectados por la regla — información).
- ACL del helper: `{postgres, service_role}` (paridad con 20261028112200).

### Aplicación

- HTTP **201** (Management API), resultado vacío (solo DDL + guard DO).
- `NOTIFY pgrst, 'reload schema'` → HTTP 201 (procedimiento oficial post-DDL).
- Aplicación única, idempotente por diseño (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

### Verificación POST (read-only, fail-closed)

| Comprobación | Resultado |
|---|---|
| `fn_master_apply_identity_changes/5` existe y SECURITY DEFINER | ✓ |
| Guarda `ERR_SKU_LOCKED_BY_MOVEMENTS` en el cuerpo | ✓ |
| Guarda `ERR_MASTER_SKU_CONFLICT` en el cuerpo | ✓ |
| Propagación de imagen compartida (`image_path`) conservada | ✓ |
| Sin datos comerciales en la RPC (precio/costo/existencias) | ✓ |
| `trg_products_sku_movement_guard` presente, función SECURITY DEFINER | ✓ |
| ACL helper: EXECUTE solo `service_role` | ✓ |

### Pruebas funcionales NEGATIVAS en producción (fail-closed, CERO escrituras)

- **(a)** Cambio de SKU del maestro `112` (`3bf620a7-1dd1-46ed-ae0f-7a0a7b09f7eb`, filas vinculadas con
  movimientos reales) vía `fn_master_apply_identity_changes` → **`ERR_SKU_LOCKED_BY_MOVEMENTS`**
  (transacción abortada antes de escribir).
- **(b)** `UPDATE products SET sku=…` directo sobre la fila local `PROD-028`
  (`42b16a5f-dea8-45bf-a72c-6d8101f8a1cc`, sin maestro, con movimientos) → **`ERR_SKU_LOCKED_BY_MOVEMENTS`**
  (trigger, transacción abortada).
- SKUs de ambas filas objetivo verificados **intactos** después de ambos abortos (rollback real, cero huella).

### Integridad de datos ANTES == DESPUÉS (delta 0)

`products` 295/295 · `master_products` 200/200 · `stock_movements` 1764/1764 ·
`transaction_items` 1075/1075 · `receipt_items` 308/308 · `master_change_log` 404/404 ·
`transactions` 1005/1005. **Sin efectos colaterales sobre datos existentes.**

### ROLLBACK (si el propietario lo exigiera)

1. Re-aplicar la definición de `fn_master_apply_identity_changes/5` de `20261028112100` (cuerpo ANTES
   verificado byte a byte — archived en `/tmp/fn-before.sql` durante la operación) + el bloque ACL de
   `20261028112200`.
2. `DROP TRIGGER trg_products_sku_movement_guard ON public.products;`
3. `NOTIFY pgrst, 'reload schema'`.
   (No recomendido: revierte la regla contable aprobada del propietario.)

---

## 2. Migración coherencia — `20261111130000_cp_data_integrity_trigger_acl_normalization.sql`

**Motivo (requisito de coherencia de la regeneración ordenada §2):** los 4 helpers de trigger de
DATA-INTEGRITY-REMEDIATION-001 (`mark_po_items_on_po_delete`, `mark_po_items_on_product_delete`,
`mark_rule_versions_on_rule_delete`, `mark_store_children_on_store_delete`) se crearon en
producción (out-of-band, 2026-11-08) SIN ACL en sus migraciones de origen; los default privileges del
owner de Supabase les concedieron EXECUTE a `anon`/`authenticated` (verificado ANTES: los 4 con
`{anon:true, authenticated:true, service_role:true, public:true}`). El replay del stream solo
materializa `PUBLIC` → divergencia `UNEXPECTED_ACL_DRIFT` (CRITICAL) en la Capa C del contrato al
regenerar el surface. La convención vigente del repo para funciones de trigger SECURITY DEFINER
(CP-SEC-026 §D1.5, `fn_master_apply` en 20261028112200): **EXECUTE solo `service_role`**.

- **SHA-256:** `244d9313203ea45fd5f039a1df1cdfdbcc886e8217ec5dc21e2cf06d73d5b6f5`.
- **Contenido:** 4 bloques `DO $acl$` privilege-guarded (idempotentes, patrón
  `20260916000002_rem_inv_6_reconcile_function_acl.sql`): `REVOKE EXECUTE … FROM PUBLIC, anon,
  authenticated` + `GRANT EXECUTE … TO service_role` + guard fail-closed `CP-ACL-TRIGGER-GUARD`.
  **Endurecimiento exclusivo** (retira EXECUTE de anon/authenticated sobre funciones SECURITY DEFINER
  con escrituras — la Capa A del contrato deja de reportar `ANON_EXECUTE_GRANTED` para las 4).
- **Aplicación:** HTTP 201 + `NOTIFY pgrst` HTTP 201, mismo canal y guard (doble flag).
- **Verificación POST:** los 4 helpers con `anon=false authenticated=false service_role=true
  public=false` (leído de `has_function_privilege` en vivo).
- **Rollback:** `GRANT EXECUTE … TO PUBLIC, anon, authenticated` (contradice la convención de
  seguridad del repo; no recomendido).

---

## 3. Excepción del allowlist retirada (§2)

`ci-gate-allowlist.json` → `source_of_truth_baseline`: **4 entradas retiradas** (quedó la sección
vacía) — la nombrada por la ORDEN más las 3 verificadas obsoletas relacionadas (mismo mecanismo de
deriva por despliegue):

| Excepción | Regla | Evidencia de obsolescencia (read-only, 2026-11-11) |
|---|---|---|
| `fn_master_apply_identity_changes/5` | BODY_DRIFT_FROM_MIGRATION | Migración `20261111120000` **aplicada hoy en producción** (§1 de este expediente); el cuerpo vivo == stream; surface regenerada certifica el cuerpo con guardas |
| `next_document_number` | BODY_DRIFT_FROM_MIGRATION | Cuerpo vivo YA contiene el tipo documental `'entrada'` (migración `20261108201000` desplegada); surface regenerada == stream |
| `create_master_product/11` | LIVE_FUNCTION_NOT_REPRESENTED | Firma viva = **/12** con `p_operational_class` (migración `20261108150000` desplegada); la /11 ya no existe en vivo |
| `activate_master_product/3` | LIVE_FUNCTION_NOT_REPRESENTED | Firma viva = **/4** con `p_operational_class` (ídem) |

La entrada permanente de `fn_master_apply_identity_changes` en
`security_definer_without_auth_check` (helper-interno, CP-CAT-MAESTRO PR 3) **NO** está relacionada
con la deriva: permanece (clasificación de seguridad vigente, no obsoleta).

## 4. contract-surface regenerado (§2.4, instrucciones del PR)

- **Comando (canónico):** `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_ACCESS_TOKEN=… node
  scripts/export-contract-surface.cjs` (script documentado en el PR y en el propio archivo).
- **Resultado:** `supabase/security-contract/contract-surface.sql` — **190 funciones** (antes 185;
  nuevas en vivo: los 4 helpers `mark_*` + `reconcile_store_catalog_shared_data`), sha256
  `6ac1b8b5b88585172ac6386ad3f75b9a92a0d1b35c0300c8b2e4eebda0f6766a`.
- **Coherencia verificada:** `node scripts/security-contract-test-static.cjs` → **CONTRATO OK,
  190/190 representadas, 0 divergencias bloqueantes, 0 excepciones source_of_truth activas**
  (los 2 warnings preexistentes no bloqueantes —`cancel_transfer/2`→`/3`, `reset_store_data/2`→`/3`—
  corresponden a migraciones de otros tramos aún pendientes en producción, fuera del alcance de esta
  ORDEN; idénticos warnings antes de la regeneración).
- **Sin modificaciones ajenas al objetivo:** el diff del surface proviene íntegramente del vivo
  (exporter canónico); ningún cuerpo fue editado a mano.

## 5. Cola de aprobación del panel de gobernanza (§5 de la ORDEN)

`public.master_change_proposals` (panel Sistema → Organizaciones → Catálogo): **0 filas en total**
(aggregate by status → vacío; 0 `pending`). No existe ninguna propuesta pendiente de revisión: la
cola está procesada por vacío verificado (read-only). No hay decisiones humanas bloqueadas por
propuestas técnicas.

## 6. Presupuesto de consumo de la operación (POLITICA_AGENTES_SUPABASE §6)

- Escrituras contra producción: **2** (las 2 migraciones de este expediente, lote único cada una).
- Consultas SQL read-only Management API: ~15 (pre-vuelo, verificaciones, export del surface,
  cola de gobernanza, auditoría de membresías).
- Consultas Log Query (dashboard): **0**.

## 7. Scripts de aplicación versionados (auditabilidad)

- `scripts/m010-aplicar-migracion-20261111120000.mjs` — aplica + verifica 20261111120000.
- `scripts/m011-aplicar-migracion-20261111130000.mjs` — aplica + verifica la normalización de ACL.
- Ambos declarados en `scripts/lib/writers.manifest.json` (`guardProtected`, guard compartido con el
  destino REAL) y verificados por `node scripts/lib/check-writers.mjs`.
