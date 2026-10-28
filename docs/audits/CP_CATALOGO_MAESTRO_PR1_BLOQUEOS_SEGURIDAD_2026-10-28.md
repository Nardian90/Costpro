# CP-CAT-MAESTRO · PR 1 — Bloqueos de seguridad previos (2026-10-28)

**Misión**: Catálogo Maestro de Productos por Organización — etapa «remediación de datos y correcciones de seguridad previas» (misión §16, primer PR).
**Documento de diseño**: `COSTPRO_Informe_Catalogo_Maestro_Productos.pdf` (28-10-2026), Tabla 6 y decisión J.6.
**Estado**: implementado, migraciones aplicadas en producción con verificación, PR abierto para revisión/CI. NO fusionado.

## 1. Alcance del PR

| # | Cambio | Tipo | Archivo |
|---|--------|------|---------|
| 1 | Cierre del fallback cross-store en `create_sale_v2` (hallazgo CICLO 2 / E2E-POS-007) | Migración SQL | `supabase/migrations/20261028090000_cp_catalogo_cierre_fallback_create_sale_v2.sql` |
| 2 | Bucket `product-images` versionado + 4 políticas de storage | Migración SQL | `supabase/migrations/20261028091000_cp_catalogo_bucket_product_images_policies.sql` |
| 3 | Importación masiva: autorización por fila en el servidor + estampado de `tenant_id` | API route | `src/app/api/catalog/bulk-import/route.ts` |
| 4 | Nuevo código de error `STORE_TENANT_MISMATCH` (403) + i18n | Lib | `src/lib/api-errors.ts`, `src/messages/es.json` |
| 5 | Reactivación de E2E-POS-007 (eliminado el `test.skip(true)` del hallazgo) | E2E | `e2e/flows/pos-checkout.spec.ts` |
| 6 | Pruebas: contrato de migraciones (9 casos) + importador (15 casos, 6 nuevos) | Tests | `src/__tests__/migrations/cp-catalogo-pr1-bloqueos-seguridad-migration.test.ts`, `src/__tests__/api/catalog-bulk-import-validation.test.ts` |
| 7 | tsconfig focalizado de la misión | Config | `tsconfig.mision-catalogo-pr1.json` |

## 2. Migración 1 — create_sale_v2 (fallback cross-store)

**Defecto cerrado** (Tabla 6 del informe): el fallback legacy (origen `20260915000001`, copiado en cada redefinición; vigente en `20261027020000`) leía `stock_current/cost_average/price` por `id` **sin filtro de tienda** cuando la fila `(id, store_id)` no existía. Como `products.store_id` es NOT NULL, ese camino solo podía ejecutarse con un producto de OTRA tienda: una venta cross-store se aceptaba (hallazgo CICLO 2, corrida CI 39781104338; reproducido y documentado en el skip de E2E-POS-007).

**Corrección** (3 parches, defensa en profundidad):
1. Bloque de lock de stock: `ERR_STORE_MISMATCH` (producto ajeno) / `ERR_PRODUCT_NOT_FOUND` (inexistente), fail-closed.
2. Dos lecturas de precio `SELECT price ... WHERE id = v_pid` → `AND store_id = p_store_id`.
3. Segundo bucle de ítems: fallback de costo por id sin filtro eliminado con la misma semántica fail-closed.

**Método**: la definición /32 vigente se extrajo mecánicamente de `20261027020000` (script `scripts/gen_pr1_create_sale_fix.py`, fuera del repo) y el diff verificado es exactamente los 3 parches (+19/−10 líneas; el resto byte a byte idéntico). Firma, cláusulas (`SECURITY DEFINER`, `SET search_path TO 'public', 'pg_temp'`) y ACL intactas.

**Servicios**: ningún flujo legítimo dependía del fallback — todos los productos (incluidos servicios) tienen `store_id NOT NULL`; `register_stock_movement` ya validaba pertenencia y era la única ruta que la evitaba.

## 3. Migración 2 — bucket product-images versionado

**Hallazgo** (informe cap. 3.3): el bucket vivía fuera del control de versiones (a diferencia de `reports` y `stores`).

**Contenido**: declaración idempotente del bucket (público, estado real y documentado) + 4 políticas sobre `storage.objects`:
- `product_images_select_public` — lectura pública (anon + authenticated), coherente con bucket público (vitrina, Telegram, WhatsApp, PDF).
- `product_images_insert/update/delete_product_owner` — solo `authenticated`, y solo si el objeto referencia un producto real (`left(name,36)` = productId, formato vigente `{productId}-{uuid}.{ext}` de `catalogService.uploadProductImage`) cuyo `store_id` es accesible (`has_store_access`) o si es admin de plataforma.

**Compatibilidad verificada**: reemplazo de imagen borra el archivo del MISMO producto (prefijo coincide) → permitido; limpieza futura de los 40 huérfanos usará `service_role` (bypassa RLS) con manifiesto; no existe flujo que suba objetos con prefijo ajeno a un producto. Guard post-migración fail-closed (bucket público + 4 políticas).

## 4. Importación masiva (`/api/catalog/bulk-import`)

**Hallazgo** (Tabla 6): el administrador no revalidaba la organización fila a fila; con `service_role` todas las filas entraban con `tenant_id NULL` (sin trigger que lo derive en BD) y el admin global bypaseaba membresías sin límite de organización.

**Corrección** (autorización en el servidor, el service_role es solo transporte):
1. Lectura servidor de `stores` para cada `store_id` de las filas: inexistente → 400; `tenant_id` nulo → 403 fail-closed (no se generan filas huérfanas).
2. Lectura servidor del perfil del llamante (`profiles.tenant_id`).
3. Matriz: superadmin = alcance de plataforma; admin = global según Decisión B.1 y **limitado a su organización cuando `USE_TENANT_RLS=true`**; no-admin = membresía activa (FIX-SEC-H2 preservado) + misma organización (defensa en profundidad).
4. **Estampado de `tenant_id` desde `stores.tenant_id`** en cada fila del upsert (patrón `resolveStoreTenantId` / CP-CAT-004, ahora server-side). El contrato Zod `.strict()` ya impedía que el cliente lo enviara.

## 5. Pruebas y verificación (resultados reales)

| Verificación | Resultado |
|---|---|
| `vitest run src/__tests__/api src/__tests__/migrations` | **75 archivos / 759 pruebas — todas verdes** (incluye 9 casos nuevos de contrato de migraciones y 15 del importador: 9 previos actualizados al nuevo contrato de estampado + 6 nuevos de aislamiento) |
| `tsc -p tsconfig.mision-catalogo-pr1.json` (focalizado) | 0 errores (el `tsc` completo no cabe en la RAM local de 3,9 GB — CI lo ejecuta completo con `bunx tsc`) |
| `eslint` (archivos del PR) | 0 errores |
| `node scripts/ci-gate-sql-checks.js` | exit 0 (canario + allowlist sin cambios) |
| `node scripts/security-contract-test-static.cjs` | OK — 156/156 funciones representadas, 0 divergencias bloqueantes, tras regenerar `supabase/security-contract/contract-surface.sql` desde LIVE (proceso oficial tras cambiar una función certificada; sha256 3791352f…) |
| Migración 20261028090000 aplicada en producción | ✅ (Management API; verificación: `prosrc` contiene ambos guards) |
| Migración 20261028091000 aplicada en producción | ✅ (guard interno: bucket público + 4 políticas; `pg_policies` = 4) |
| Prueba controlada RPC cross-store (equivalente E2E-POS-007, sin escritura) | **PASS** — venta de producto de ENERVIDA contra Puerto Padre → `ERR_STORE_MISMATCH: el producto fb5f945c-274c-439f-9535-541a32b7987f pertenece a otra tienda`; stock intacto (0→0), 0 transacciones con la clave de prueba. Evidencia: `audit/catalogo-maestro/pr1-e2e-pos007-probe.json` (fuera del repo) |
| E2E-POS-007 (Playwright) | **Reactivada (skip eliminado)**; el harness E2E tiene guard fail-closed que impide apuntar a producción (CP-INFRA-011) — su ejecución real corresponde al workflow aislado `e2e-isolated.yml` (manual). No se declara verde: estado = reactivada + equivalencia RPC demostrada en producción + pendiente de corrida aislada |

## 6. Reversibilidad

- Migración 1: re-aplicar la definición de `20261027020000` restaura el estado previo (no toca datos).
- Migración 2: `DROP POLICY` de las 4 políticas; el bucket permanece (estado previo = sin políticas versionadas).
- Ruta API: revertir el commit restaura el comportamiento anterior (las filas dejarían de llevar `tenant_id` estampado).

## 7. Limitaciones declaradas

1. La corrida E2E-POS-007 real requiere el proyecto E2E aislado (guard CP-INFRA-011 impide producción); el PR deja la prueba reactiva y el workflow `e2e-isolated.yml` es la vía documentada.
2. `tsc --noEmit` completo no ejecutable localmente por RAM (3,9 GB); se valida en CI (job quality) y con tsconfig focalizado local.
3. La política DELETE de storage no limpia retroactivamente los 40 huérfanos existentes: su remoción se planifica con manifiesto recuperable en el PR de imágenes compartidas (misión §12).
4. El estampado de `tenant_id` aplica a filas NUEVAS del importador; los 197 registros existentes con `tenant_id` nulo se remedian en el PR 2 (etapa 0, migración versionada con dry-run).
