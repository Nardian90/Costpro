# CP-CAT-MAESTRO · PR 3 — Etapa 1: modelo maestro, seguridad y RPCs (2026-10-28)

**Misión**: Catálogo Maestro por Organización — Etapa 1 (modelo de datos del informe, cap. 7, Alternativa D).
**Cadena de dependencias**: PR 1 (#1518) → PR 2 (#1519) → **este PR** (rama apilada sobre PR 2; tras cada fusión GitHub re-apunta la base).
**Estado**: implementado, migraciones aplicadas en producción, ciclo de vida verificado end-to-end y revertido. PR abierto para revisión/CI. NO fusionado.

## 1. Contenido (4 migraciones + contrato)

| Migración | Contenido |
|---|---|
| `20261028110000_cp_catalogo_master_model_schema.sql` | 5 tablas nuevas + `products.master_product_id` + 2 triggers + 3 helpers + RLS + grants + guard |
| `20261028112000_cp_catalogo_rpcs_gobernanza.sql` | `grant_catalog_governor`, `connect_store_catalog`, `disconnect_store_catalog`, `search_master_products` |
| `20261028112100_cp_catalogo_rpcs_ciclo_vida.sql` | helper interno `fn_master_apply_identity_changes`, `create_master_product`, `activate_master_product`, `update_master_product`, `propose_master_change`, `review_master_proposal` |
| `20261028112200_cp_catalogo_helpers_acl_hardening.sql` | REVOKE PUBLIC/anon + GRANT explícito de los helpers (patrón REM-INV-6) |

Superficie de contrato regenerada desde LIVE: **165 funciones** (156 + 9 nuevas).

## 2. Modelo de datos (informe cap. 7, Tabla 5)

- **`master_products`** — identidad canónica por organización: `sku`, `name`, `description`, `image_path`, `barcode(+type)`, `unit_of_measure`, `is_service`, `status (active|archived)`, `tenant_id`, `created_by`, timestamps. **Sin columnas comerciales** (probado por contrato). `UNIQUE (tenant_id, sku)` — SKU único DENTRO de la organización, no global; barcode con la misma semántica global parcial que `products_barcode_unique`.
- **`catalog_store_links`** — conexión por tienda: estado `connected|disconnected`, `connected_at`, `disconnected_at`, `reason`; `UNIQUE (store_id)`; coherencia tenant↔tienda por trigger `ERR_TENANT_MISMATCH`. Desconectar **no borra** productos ni vínculos.
- **`master_change_log`** — auditoría de cambios YA aplicados (campo, valor anterior/nuevo, actor, tienda de origen, propuesta vinculante).
- **`master_change_proposals`** — propuestas PENDIENTES (`pending|approved|rejected`, revisor, nota) — separación exigida por misión §4.4.
- **`catalog_governors`** — capacidad organizacional específica: **gobernador = propietario del tenant O concesión explícita** (`grant_catalog_governor`, solo superadmin). Los administradores de plataforma NO son gobernadores automáticos (misión §6).
- **`products.master_product_id`** — columna anulable (NULL = comportamiento actual intacto); `UNIQUE (master_product_id, store_id) WHERE NOT NULL` → máx. una fila local por maestro y tienda; índice propio.

**Triggers**:
- `trg_products_master_identity_guard` — BEFORE INSERT/UPDATE: para filas vinculadas, el servidor **coerciona** SKU y nombre al valor del maestro (ignora escrituras locales no autorizadas sobre la identidad compartida; misión §5); NULL = coste cero.
- `ensure_product_barcode` versionado — NO auto-genera código `INT…` en filas vinculadas (el código canónico vive en el maestro; evita códigos sintéticos divergentes por tienda y colisiones con el índice global al reutilizar el mismo maestro).

## 3. RPCs (patrones certificados del repo)

Todas: `SECURITY DEFINER` + `SET search_path`, anti-spoofing v2.12.9 (`v_caller_uid := service_role ? COALESCE(p_user_id, auth.uid()) : auth.uid()`), guard fail-closed, errores `ERR_*`, auditoría en `audit_logs`, `REVOKE PUBLIC, anon` + `GRANT authenticated, service_role`.

| RPC | Quién | Reglas clave |
|---|---|---|
| `grant_catalog_governor` | superadmin | valida pertenencia a la organización; concede/revoca capacidad |
| `connect_store_catalog` / `disconnect_store_catalog` | gobernador | desconexión preserva todo; reconexión restaura vínculos |
| `search_master_products` | miembro de tienda conectada | identidad disponible + flag `activated` + id local; **aislada por tenant** |
| `create_master_product` | tienda conectada con rol alta (admin/manager/encargado) o admin | **atómico maestro+fila local**; si el SKU existe → `ERR_MASTER_SKU_EXISTS` con **id del maestro ganador** (carrera 23505 traducida — misión §8.1); SKU local existente → `ERR_SKU_EXISTS_LOCAL` (vincular, no duplicar); barcode global único; valores comerciales los aporta la tienda (`p_local`), defaults de alta manual |
| `activate_master_product` | ídem | idempotente; fila local con **precio 0/CUP, costo 0, min_stock 1, existencia 0**; NUNCA copia precios/costos de otra tienda; sin recepciones/movimientos/kardex; archivado → `ERR_MASTER_ARCHIVED` |
| `update_master_product` | **solo gobernador** | aplica cambios campo a campo con `master_change_log`; propaga SKU/nombre a filas locales vinculadas (coherencia de negocio); la imagen NO se reescribe localmente (el catálogo la resuelve por lectura del maestro) |
| `propose_master_change` / `review_master_proposal` | tienda propone / gobernador revisa | aprobada → aplica con trazabilidad `proposal_id`; rechazada → registrada; revisada dos veces → `ERR_PROPOSAL_REVIEWED` |

**Evaluación de la propagación masiva (misión §5)**: los reportes del sistema resuelven nombre/SKU por JOIN vivo con la fila local (comportamiento documental vigente — informe cap. 3.4); propagar SKU/nombre mantiene la coherencia de las rutas de negocio (espejo de transferencias por SKU, matching de recepciones, búsqueda POS) y NO altera precios, costos, existencias ni identificadores. La imagen se propaga por lectura (PR de integración de consumidores).

## 4. Ejecución real (proceso versionado del repo)

Las 4 migraciones aplicadas en producción (Management API) con guard interno OK (5 tablas RLS / 5 políticas SELECT / columna / 2 triggers).

**Prueba de ciclo de vida end-to-end en producción** (`scripts/pr3-ciclo-vida-smoke.cjs`, fuera del repo; ruta certificada service_role + p_user_id) — **25/25 PASS** y revertida con manifiesto (producción sin artefactos de prueba):

1. Conexión de ENERVIDA por el propietario (gobernador por diseño) ✓; admin de plataforma NO gobernador rechazado ✓
2. Creación maestro+local atómica ✓; fila local con valores comerciales propios (100 CUP/costo 60/min 5) y **stock 0, sin inventario/movimientos/recepciones** ✓
3. Duplicado → `ERR_MASTER_SKU_EXISTS` con id del ganador ✓
4. Conexión de Puerto Padre + activación → defaults de alta manual (0 CUP), **sin copia de precios** ✓
5. Búsqueda compartida con flag `activated` en ambas tiendas ✓
6. Edición por gobernador → propagación de nombre, **precios intactos en ambas tiendas**, `master_change_log` completo ✓
7. Propuesta desde tienda + revisión del gobernador (no-gobernador rechazado; doble revisión rechazada) ✓
8. Desconexión conserva productos; tienda desconectada no lista maestros ✓; reconexión restaura correspondencia ✓
9. Archivado bloquea nuevas activaciones (`ERR_MASTER_ARCHIVED`) ✓
10. Limpieza con manifiesto: 2 productos de prueba, maestro, change_log, propuesta y 2 links eliminados ✓

Evidencia: `audit/catalogo-maestro/pr3-ciclo-vida-smoke.json` (fuera del repo).

## 5. Pruebas

- **Contrato estático de las 4 migraciones: 25 casos nuevos** (`cp-catalogo-pr3-modelo-maestro-migration.test.ts`) — incluye regresión de la ambigüedad 42702 (columnas calificadas con `RETURNS TABLE`).
- Carpeta `src/__tests__/migrations` completa: **286 pruebas verdes**.
- `security-contract-test-static.cjs`: **OK** (165/165 representadas, 0 divergencias — requiere la cadena de ramas PR1→PR2→PR3; en ramas aisladas de main el replay no incluye la migración del PR 1).
- `ci-gate-sql-checks.js`: exit 0. `tsc` focalizado: 0 errores.

## 6. Decisiones de diseño documentadas

1. **Helpers de capacidad** (`is_catalog_governor`, `is_catalog_store_connected`, `can_read_master_catalog`): STABLE/SECURITY DEFINER/search_path; ACL endurecida; sin atajo de rol de plataforma en el gobernador.
2. **Historial de conexiones**: el enlace es único por tienda (estado actual) y cada ciclo connect/disconnect queda en `audit_logs` (`CATALOG_STORE_CONNECT/DISCONNECT`) — consulta de historial vía auditoría (misión §13).
3. **Barcode en activación**: la fila local nueva deja `barcode NULL` (el canónico vive en el maestro); las búsquedas por código se resuelven por el vínculo en la integración de consumidores (PR 5). El índice global `products_barcode_unique` no se debilita.
4. **`RETURNS TABLE` y variables PL/pgSQL**: la colisión `id` (42702) se resolvió calificando todas las columnas; caso documentado con prueba de regresión.

## 7. Reversibilidad

La capa es aditiva: `DROP TABLE` de las 5 tablas nuevas, `ALTER TABLE products DROP COLUMN master_product_id`, DROP de triggers/helpers restaura el estado previo. Ningún dato existente fue reescrito por las migraciones (el ciclo de vida de prueba se revirtió con manifiesto).

## 8. Limitaciones

1. La verificación con sesión real (`authenticated` + RLS de usuario) requiere el entorno E2E aislado (guard CP-INFRA-011); la prueba en producción usa la ruta certificada service_role+p_user_id. Pendiente de corrida `e2e-isolated.yml` tras fusión.
2. La UI de gobernanza y los consumidores (catálogo, POS, recepciones) llegan en los PR 4-5; este PR entrega el modelo + RPCs + seguridad verificados.
