# INFORME FINAL — MISIÓN CP-CAT-MAESTRO-003
## Aplicar migración pendiente, reauditar y certificar el Catálogo Maestro

**Fecha:** 2026-10-30 · **Ejecutada por:** agente autorizado · **Alcance:** migración `20261030120000_cp_catalogo_master_image_propagation.sql` y comprobaciones relacionadas.

---

## 1. SHA de `main` y del despliegue efectivo

| Referencia | Valor |
|---|---|
| SHA de `main` al inicio de la misión | `89abb063e` (merge PR #1524) |
| PR #1524 | **merged: true** → merge_commit `89abb063ee59a296dc45a5b8c2d2e71fb3e5de27` (vía API GitHub) |
| Despliegue de producción (Vercel) | Deployment `89abb063e`, environment Production, **status: success** (2026-10-30T12:30:59Z) |
| App en producción | `https://costpro4.vercel.app` — HTTP 200; `/api/health` → `{"status":"ok","timestamp":"2026-10-30T12:31:39.295Z"}` (arranque posterior al despliegue; la app no ejecuta una versión anterior) |
| Migración pendiente en `main` | `supabase/migrations/20261030120000_cp_catalogo_master_image_propagation.sql` (164 líneas, sha256 `cdd2f572a095…8907`) — exactamente la versión probada en el PR (el clon local está en el merge commit) |

## 2. Confirmación de aplicación de la migración

**APLICADA** el 2026-10-30 a producción (`wthkddeleylijmonclxg`) mediante el mecanismo oficial del repositorio (Management API `/v1/projects/{ref}/database/query`, como `scripts/apply-migration-mgmt.ts`) + `NOTIFY pgrst, 'reload schema'` (HTTP 201). Resultado vacío = DDL y guard ejecutados sin error.

**Pre-vuelo realizado (antes de ejecutar):**
1. SQL leído completo.
2. Dependencias verificadas en producción: `master_products.image_path`, `products.image_url`, `products.master_product_id`, `master_change_log` — todas presentes.
3. Definición vigente de `fn_master_apply_identity_changes` inspeccionada: **idéntica a su fuente versionada 20261028112100** (la deriva no existía en el cuerpo; el baseline registraba la divergencia pendiente de actualizar).
4. Atributos capturados ANTES (guardados en `audit-evidence/MAESTRO-003/fn_master_apply_identity_changes_ANTES.sql`): `SECURITY DEFINER=true`, `search_path=public`, volátil, owner `postgres`, ACL `{postgres=X, service_role=X}`.
5. La migración no altera permisos más allá de la paridad ya certificada (REVOKE PUBLIC/anon/authenticated + GRANT service_role = estado idéntico al previo) y no toca ninguna política RLS.
6. Mecanismo de prueba previa del repositorio: `src/__tests__/migrations/cp-catalogo-m002-image-propagation-migration.test.ts` → **9/9 OK**.
7. No se tocó la conciliación de las 471 migraciones históricas (fuera de alcance).

## 3. Evidencia de verificación antes y después

| Verificación | ANTES | DESPUÉS |
|---|---|---|
| ¿Cuerpo propaga `image_path`? | NO (3269 chars, sin bloque F2) | **SÍ** (3992 chars, bloque F2 presente) |
| Cuerpo vs objetivo de la migración | divergente | **IDÉNTICO** (diff normalizado vacío) |
| `SECURITY DEFINER` | true | **true** |
| `search_path` | `search_path=public` | **`search_path=public`** |
| Volatilidad / owner | volatile / postgres | **volatile / postgres** |
| ACL | `{postgres=X,service_role=X}` | **`{postgres=X,service_role=X}`** |
| `anon` EXECUTE (has_function_privilege) | false | **false** |
| `authenticated` EXECUTE | false | **false** |
| `service_role` EXECUTE | true | **true** |
| Probe REST anónima directa a la función | — | **HTTP 401 `42501 permission denied`** |

## 4. Estado de atributos, ACL, RLS y SECURITY DEFINER

- `fn_master_apply_identity_changes`: SECURITY DEFINER ✓ · search_path fijo ✓ · ACL solo service_role ✓ (probe anónima denegada 42501).
- RLS intacto: `master_products` (1 política select authenticated, RLS on), `products` (7 políticas, RLS on), `master_change_log` y `master_change_proposals` (RLS on) — la migración no define ni modifica políticas.
- Gates SQL re-ejecutados tras la aplicación (ver §6).

## 5. Resultado de propagación y conservación de imágenes

**Batería transaccional sintética con ROLLBACK completo** (`audit-evidence/MAESTRO-003/prueba-transaccional-propagacion.sql` + resultados en `resultado-prueba-transaccional.json`) — 5/5 casos:

| Caso | Resultado |
|---|---|
| A — reemplazo de imagen del maestro → ambas tiendas adoptan la nueva referencia | ✅ `A_propagacion_ok=true`, ambas filas con `product-images/v2-m003.png` |
| A — compartición por referencia (misma ruta, sin duplicación por tienda) | ✅ `A_misma_referencia_sin_duplicar=true` |
| A2 — datos comerciales intactos (precio 100.5/250, costo 80, stock 25/7) | ✅ `A2_comercial_intacto=true` |
| B — propagación de SKU sigue funcionando | ✅ `B_propagacion_sku_ok=true` |
| C — `master_change_log` registra imagen y SKU con old/new | ✅ 2 entradas con valores correctos |
| D — campo no-identidad (`price`) rechazado | ✅ `ERR_INVALID_CHANGES` |
| E — SKU duplicado rechazado | ✅ `ERR_MASTER_SKU_EXISTS` |
| Residuo tras ROLLBACK (tenant/tiendas/maestros/productos) | ✅ 0 filas |

**GC de `uploadProductImage`** (cliente): solo elimina el archivo anterior si `sharedCount === 0` tras contar referencias vivas en `products.image_url` **y** `master_products.image_path`; si la verificación falla conserva el archivo (fail-safe). Suite dedicada `catalog-image-gc-compartida.test.ts` → **7/7 OK**. Nunca elimina activos aún utilizados ✓.

## 6. Resultado de la conciliación de `contract-surface.sql`

- Regenerado con el generador oficial `scripts/export-contract-surface.cjs` desde la BD real: **165 funciones**, único delta `fn_master_apply_identity_changes` (bloque F2 + limpieza `v_log_row`), censo igual al anterior salvo esa función.
- Gates tras regenerar:
  - `security-contract-test.cjs` (LIVE): **165/165, 0 violaciones, PASS**.
  - `security-contract-test-static.cjs`: **CONTRATO OK**, 165/165 representadas en migraciones, 0 divergencias bloqueantes (2 warnings MEDIUM/LOW preexistentes de `cancel_transfer`/`reset_store_data`, idénticos antes y después del cambio).
  - `ci-gate-sql-checks.js` + `ci-gate-evaluate.js` contra producción (ejecutado sentencia a sentencia para que ningún hallazgo quede oculto por el último-resultset de la API): **104 hallazgos `secdef_no_auth`, 104 en allowlist, 0 no permitidos · 0 permisos públicos · 0 tablas sin RLS → TODO PASS**.

## 7. Estado del baseline temporal

- **RETIRADA** la entrada `BODY_DRIFT_FROM_MIGRATION` de `fn_master_apply_identity_changes/5` en `ci-gate-allowlist.json` (solo después de verificar la coincidencia real, §3/§6). La otra entrada vigente (`create_store_with_membership/17`) permanece: esa migración sigue pendiente de aplicación autorizada a producción y, además, el stream versionado contiene un defecto de tipo descubierto por esta misión (ver §14) que se corrige en el PR #1525; al aplicarse a producción se retirará esa entrada con el mismo procedimiento.

## 8. Resultados de la batería E2E completa (12 casos)

Infraestructura oficial: workflow `e2e-isolated.yml` (environment `e2e-isolated`) contra la base aislada **CostproE2E** (`lguovmvrozxgssupkwpf`). La base estaba desactualizada (sin modelo del catálogo); se puso al día con el apilador oficial `reset-remote-e2e-db.mjs --apply-replay` → **110/110 migraciones + fix 20261030130000 (= 111 en el manifiesto)**, centinela `e2e_is_isolated_db()=true`, guard final OK (dos residuos sintéticos que bloqueaban el backfill fueron limpiados con evidencia: `limpieza-residuos-e2e.json`).

Spec nuevo: `e2e/flows/master-catalog-full.spec.ts` (misión §7, pendiente desde PR #1524).

**Resultado final — run 41062266456 (workflow dispatch sobre la rama del PR): ✅ 12/12 PASSED (1.8m):**

| Caso | Prueba | Resultado |
|---|---|---|
| C01 | Conectar dos tiendas sintéticas (pilotos A/B del run) al catálogo de la organización | ✅ |
| C02 | Crear producto maestro desde la tienda A (maestro + fila local en una transacción) | ✅ |
| C03 | Consultarlo desde la tienda B (por SKU y por nombre) | ✅ |
| C04 | Activarlo en la tienda B con defaults (precio 0/CUP, min_stock 1, stock 0 — sin copiar de A) | ✅ |
| C05 | Identidad común: SKU y nombre idénticos en maestro y ambas filas | ✅ |
| C06 | Precios y costos independientes por tienda (150/90 vs 250/200) | ✅ |
| C07 | Imagen compartida: reemplazo se propaga a ambas tiendas, misma referencia, datos comerciales intactos (F2) | ✅ |
| C08 | Duplicado concurrente del SKU: exactamente 1 éxito + 1 `ERR_MASTER_SKU_EXISTS`; 1 solo maestro en BD | ✅ |
| C09 | Desconexión de B conserva filas/vínculos/imagen; reconexión reactiva | ✅ |
| C10 | Organización ajena: denegado con `ERR_*` y 0 maestros creados en la otra organización (verificado en BD) | ✅ |
| C11 | Usuario sin autorización (cajero): edición y conexión denegadas `ERR_UNAUTHORIZED`; identidad intacta | ✅ |
| C12 | Operaciones comerciales locales no se mezclan: ajuste +10 en A no altera B; precio local independiente; identidad compartida preservada | ✅ |

Historial de la batería (transparencia): corrida 1 falló en aprovisionamiento por el defecto de tipo del stream (§14.1); corrida 2: 9/12 (aserción C10 ajustada); corrida 3: 11/12 (`register_stock_movement` es helper interno EXECUTE-only service_role — se cambió a `perform_inventory_adjustment`, la ruta real de la UI); corrida 4: 11/12 (lectura de fila completa en C12); **corrida 5: 12/12 SUCCESS**.

## 9. Resultado de auditoría funcional

- RPCs gobernadas presentes en producción con firmas correctas: `create_master_product(11)`, `activate_master_product(3)`, `update_master_product(4)`, `propose_master_change(4)`, `review_master_proposal(4)`, `search_master_products(5)`, `connect_store_catalog`, `disconnect_store_catalog`, `is_catalog_governor`, `is_catalog_store_connected`.
- Gobernador = owner del tenant o concesión explícita en `catalog_governors` (verificado en la definición SQL).
- Producción: **0 maestros, 0 tiendas conectadas, 0 propuestas** — el catálogo está vacío y listo para el piloto (las tiendas reales NO se conectaron; las operaciones comerciales reales no se tocaron).
- Suites del catálogo en verde: hooks 12, wiring 9, GC 7, migraciones 300, replay e2e 7 → todo implementado/verificado sin regresiones tras la migración.
- Datos comerciales aislados por diseño (migraciones + batería E2E C06/C12).

## 10. Ruta de acceso al catálogo en la interfaz

1. **Consulta/activación desde tienda:** Menú → OPERACIÓN → **Catálogo** → botón **«Catálogo de la organización»** (superior derecha; `CatalogView.tsx:1071-1075`).
2. **Gobernanza:** Menú → **SISTEMA → Organizaciones** → **Ver detalle** → pestaña **«Catálogo»** (`OrganizationDetailModal.tsx`, `CatalogGovernanceSection.tsx`).
3. **Alta compartida:** Catálogo → Nuevo producto (tienda conectada integra el maestro automáticamente).

## 11. Documentación y ayuda integrada

- `docs/guides/CATALOGO_MAESTRO_PRODUCTOS.md` existe (13 secciones); §7.13 actualizada en el PR #1525: la propagación de imagen pasó a «operativo y probado» tras la aplicación autorizada.
- Ayuda integrada presente: `02-como-hacer/30-como-usar-catalogo-de-la-organizacion.md`, `03-referencia/10-catalogo-maestro-campos.md`, `04-explicacion/09-que-es-catalogo-maestro.md` + índice `search-keywords.json`.
- Búsquedas en vivo contra el API de ayuda (`/api/help-docs?search=…`): «catálogo maestro» → 3 documentos ✓ · «conectar tienda» → guía ✓ · «activar producto» → guía ✓.
- Rutas documentadas verificadas contra el código de la interfaz (botón y pestaña existen).

## 12. Plan detallado del piloto de ENERVIDA

Documento completo: `audit-evidence/MAESTRO-003/propuesta-piloto-enervida.md` (incluido en PR #1525). Resumen:

- **Categoría piloto propuesta: «Cables» (7 productos)** — SKU/nombre/barcode/imagen actuales de ENERVIDA como identidad inicial; alternativo: «Brekers» (14).
- **Mecanismo:** script administrativo versionado con dry-run obligatorio (INSERT maestro + UPDATE `products.master_product_id`; sin tocar precio/costo/stock) + conexión de ENERVIDA por el gobernador + verificación 7/7.
- **Nota técnica:** la vinculación de productos EXISTENTES no tiene RPC ni script hoy (`create_master_product` creará fila local nueva y rechaza SKU local duplicado por diseño) — el script del piloto es parte de lo que se autorizará.
- **Recuperación:** snapshot previo; rollback por producto (desvincular + borrar maestro + log) en segundos; datos comerciales jamás tocados ⇒ nada más que restaurar.
- **No incluye:** Puerto Padre, los otros 181 productos, fusiones por similitud, cambios de identificadores/stock.
- **Espera autorización expresa antes de ejecutar.**

## 13. PR adicional

- **PR #1525** `feat/catalogo-maestro-conciliacion-e2e-20261030` — https://github.com/Nardian90/Costpro/pull/1525
  - Conciliación: `contract-surface.sql` regenerado + retirada del baseline temporal de `fn_master_apply_identity_changes/5` (motivo documentado en el PR).
  - Batería E2E `e2e/flows/master-catalog-full.spec.ts` (12 casos) + evidencia `audit-evidence/MAESTRO-003/`.
  - Fix `20261030130000_cp_org_003_fix_cswm_record_id_type.sql` (defecto de tipo del stream, ver §14) + manifiesto 111 + test de determinismo actualizado.
  - Propuesta de piloto ENERVIDA.
  - **NO fusionado ni desplegado** — espera autorización (misión §10).

## 14. Riesgos y tareas pendientes

1. **Defecto del stream descubierto y corregido en PR (no aplicado a producción):** `create_store_with_membership` de `20261026210000` inserta `record_id::text` sobre columna uuid → 42883 en bases reconstruidas del stream (producción no está afectada: su cuerpo vivo es anterior y correcto). La migración de fix está en el PR #1525 **sin aplicar a producción** (requiere autorización); al aplicarse, retirar el baseline de `create_store_with_membership/17` y regenerar el contrato.
2. **`trigger_audit_store_changes` rompe DELETE duros de tiendas** (409): el trigger de auditoría inserta con el `store_id` de la fila eliminada dentro del mismo statement. La app solo hace soft-delete, así que no es alcanzable por la UI; hallazgo documentado para una misión futura.
3. **Migración `20261030120000` no registrada en la tabla/registro oficial de migraciones aplicadas** del proyecto (el registro histórico de 471 pendientes conserva su procedimiento e independencia, tal como ordena la misión).
4. **Conciliación de 471 migraciones históricas:** sigue pendiente con su propia autorización (no tocada).
5. Panel de concesión de gobernador: sigue sin existir (la capacidad se concede por SuperAdmin vía RPC).
6. La aplicación del fix `20261030130000` a producción y la futura retirada del baseline `create_store_with_membership/17`.
7. Ejecutar el piloto de ENERVIDA tras autorización (§12).

---

**CONDICIÓN DE CIERRE:** migración aplicada ✓ · contrato de seguridad reconciliado ✓ · propagación de imágenes verificada ✓ · flujo completo probado en entorno aislado ✓ (resultados en §8). Las tiendas reales NO están conectadas y los productos reales NO están compartidos — eso corresponde al piloto autorizado (§12).
