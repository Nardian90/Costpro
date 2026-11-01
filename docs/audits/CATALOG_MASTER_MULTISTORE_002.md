# CATALOG_MASTER_MULTISTORE_002 — Visibilidad global del catálogo maestro, imágenes compartidas y gestión desde CATALOGO

**Misión:** COSTPRO-CATALOG-MASTER-002 · **Prioridad:** P1 · **Fecha:** 2026-11-01
**Tienda de referencia:** FERROCARRIL VITALLCONS (producción) · **Módulo:** Inicio → OPERACIÓN → Almacén → Inventario → CATALOGO
**Rama:** `fix/master-catalog-multistore-visibility` · **Estado:** resuelto en aislado, PR pendiente de revisión

---

## 1. Arquitectura encontrada

- **Modelo (PR 20261028110000):** `master_products` (identidad compartida por
  organización: sku, nombre, descripción, imagen, barcode, UM), `catalog_store_links`
  (conexión tienda↔catálogo, status connected/disconnected),
  `catalog_governors` (gobernador = owner o concesión explícita),
  `master_change_log`/`master_change_proposals` (trazabilidad),
  `products.master_product_id` (vínculo anulable fila local→maestro).
- **RPCs gobernadas:** `create_master_product`, `update_master_product` (solo
  gobernador; claves permitidas sku/name/description/image_path/barcode/
  barcode_type/unit_of_measure/is_service), `activate_master_product`
  (idempotente por (maestro, tienda), alta local en ceros),
  `connect_store_catalog`/`disconnect_store_catalog` (solo gobernador).
- **RLS:** `master_products_select` vía `can_read_master_catalog(tenant)` —
  admin, gobernador, o miembro activo de una tienda CONECTADA del tenant.
- **Imágenes:** `products.image_url` y `master_products.image_path` guardan el
  MISMO filename del bucket `product-images` (puntero compartido, sin copias
  físicas). `catalogService.uploadProductImage` ya tenía garbage collection con
  conteo de referencias compartidas.
- **El defecto:** la vista CATALOGO alimenta de `get_paginated_products_v2`,
  que paginaba `FROM products WHERE store_id = p_store_id`.

## 2. Arquitectura esperada

```text
                    CATÁLOGO MAESTRO (master_products, activos)
                           |  identidad + imagen globales
              ---------------------------
              |            |            |
        Tienda A      Tienda B     Tienda C        (catalog_store_links)
        products      products     (0 filas)       ← filas locales OPCIONALES
        stock A       stock B      —
        precio A      precio B     —
```

Una tienda conectada ve TODOS los maestros activos de su organización (con o sin
fila local); la fila local aporta SOLO lo operativo (stock/precio/costo/
categoría/flags). Las altas locales puras (sin maestro) nunca desaparecen.

## 3. Causa raíz del caso Ferricarril (datos reales, solo lectura)

Producción, tenant Vitallcons: `FERROCARRIL VITALLCONS` = **connected**,
**0 filas locales** (`products`), `ENERVIDA-VITALLCONS` = connected con 188
filas, `Puerto Padre VITALLCONS` = disconnected con 36. Maestros activos del
tenant: **188**. La RPC filtraba `p.store_id` sobre `products` → Ferricarril
veía **0 productos** pudiendo ver 188. No era un problema visual, ni de RLS
(`can_read_master_catalog` ya autorizaba), ni de sincronización: la fuente de
la consulta era la tabla equivocada.

## 4. Productos que no eran visibles y motivo

Los 188 maestros activos del tenant eran invisibles para Ferricarril: ninguno
tiene fila local en esa tienda (`products.master_product_id` vacío por ausencia
de incorporación, no por corrupción). Tras el fix son visibles los 188 como
filas `source='master'` (operativos en cero, `is_complete=false` honesto),
incorporables con `activate_master_product`. Sin duplicados, sin asociaciones
masivas: la incorporación es una acción explícita del usuario.

## 5. Verificación de la afirmación previa del propietario (imágenes)

La afirmación «111 productos con imagen propia, 111 URLs distintas, cada
producto guarda su propia copia; las 25 sin referencia son restos de tiendas
borradas/E2E» quedó **REFUTADA** con consultas read-only sobre producción
(`scripts/verify-imagen-afirmacion.mjs`):

- Los 111 productos con imagen están en ENERVIDA-VITALLCONS y **cada uno
  referencia EXACTAMENTE el archivo de SU maestro**
  (`products.image_url === master_products.image_path`, 111/111; 0 archivos
  distintos; HEAD 200 en el bucket). **No existen copias**: el modelo de imagen
  compartida ya funcionaba; lo que cambiaba por tienda era el puntero textual,
  no el archivo.
- Son 111 maestros DISTINTOS (relación 1:1) → «111 URLs distintas» = 111
  productos distintos, no duplicación.
- Cero tiendas huérfanas/archivadas/E2E con imagen. El conjunto «25» no existe
  como tal; lo real: 77 productos de ENERVIDA con maestro y SIN imagen (estado
  normal: aún sin fotografía).

## 6. Archivos y funciones modificados

| Archivo | Cambio |
| --- | --- |
| `supabase/migrations/20261101130000_cp_catalogo_visibilidad_maestro.sql` | **Nueva**: `get_paginated_products_v2` (rama conectada = maestros activos LEFT JOIN fila local ∪ altas locales sin vínculo; columnas nuevas `source`, `master_product_id`), `get_products_for_pos` (imagen master-first), índice único parcial `products(master_product_id, store_id)`, grants. |
| `src/validation/schemas.ts` | `paginatedProductSchema` acepta `source`/`master_product_id` (retro-compatible: default `'local'`); helper `isMasterCatalogRow`. |
| `src/types/index.ts` | `Product.source?`, `Product.master_product_id?` (aditivo). |
| `src/services/catalog-service.ts` | `uploadProductImage`: si la fila está vinculada, actualiza la imagen EN EL MAESTRO vía `update_master_product` (gobernador); sin permiso descarta el archivo y lanza error claro (misión §3.3). |
| `src/components/views/terminal/views/catalog/CatalogView.tsx` | Guardas: filas `source='master'` no participan en operaciones locales (editar/clonar/activar/borrar/selección masiva) con guía al usuario. |
| `src/components/views/terminal/views/catalog/CatalogProductGrid.tsx` + `src/components/ui/atomic/index.tsx` | Badge «Maestro» (tabla y tarjeta). |
| `e2e/master-catalog-multistore.spec.ts` | **Nueva**: suite de 8 casos (§11). |

## 7. Cambios de base de datos

1. **Índice único parcial** `products_master_store_unique ON products(master_product_id, store_id) WHERE master_product_id IS NOT NULL` — el invariante que `activate_master_product` ya aplicaba en su lógica pasa a ser ley. Verificado en producción antes: 188 pares (maestro, tienda), 0 duplicados. Idempotente (`IF NOT EXISTS`), reversible (`DROP INDEX IF EXISTS`).
2. **Funciones** recreadas (`CREATE OR REPLACE`; v2 con DROP previo por cambio de RETURNS). Sin migración de DATOS: la corrección es de lectura, no reescribe filas ni archivos.
3. **APLICACIÓN EN PRODUCCIÓN (autorizada por el propietario el 2026-11-01: «aplica 20261101130000»):**
   - **Cuándo:** 2026-11-01 ≈22:45 UTC. **Qué:** `supabase/migrations/20261101130000_cp_catalogo_visibilidad_maestro.sql` en su versión del commit **`4f0bfb4`** (rama conectada en UNION ALL). **Cómo:** Management API (`scripts/apply-migration-prod.mjs`, guard fail-closed ref=wthkddeleylijmonclxg, flag explícito `--aplicar-produccion`). **Resultado:** HTTP 201; índice creado; funciones recreadas con las columnas nuevas (`source`, `master_product_id` verificadas vía `pg_proc.proargnames`).
   - **Verificación post-aplicación (impersonación JWT read-only: SET LOCAL role authenticated + request.jwt.claims, ROLLBACK final):**

     | Tienda | Antes | Después |
     | --- | --- | --- |
     | FERROCARRIL VITALLCONS (connected) | 0 filas | **188 filas = los 188 maestros activos (188 solo-maestro, 0 locales)** |
     | ENERVIDA-VITALLCONS (connected) | 188 locales | **188 filas (188 locales, 0 solo-maestro) — intacta** |
     | Puerto Padre VITALLCONS (disconnected) | 36 locales | **36 filas, 0 solo-maestro — comportamiento idéntico al anterior** |

## 8. Modelo final de referencias de imágenes

- **Una sola fuente:** `master_products.image_path` (filename en bucket `product-images`).
- **Lectura master-first:** CATALOGO (tiendas conectadas) y POS resuelven la imagen del maestro para filas vinculadas; las filas locales sin maestro siguen usando su `image_url`.
- **Escritura gobernada:** cambiar la imagen de un producto vinculado actualiza el MAESTRO (RPC `update_master_product`, solo gobernador) → todas las tiendas conectadas lo reflejan sin copias.
- **Sin referencias rotas:** el GC existente conserva el archivo anterior mientras haya referencias vivas (`products.image_url` o `master_products.image_path`); fail-safe si no puede verificar.

## 9-10. Pruebas de sincronización, atributos locales y seguridad (resumen E2E)

Ver resultados completos en §11: sincronización (E2E-5: ambas tiendas ven el cambio), atributos locales (E2E-6: nombre global propagado, precio/costo/mínimo intactos), seguridad (E2E-7: tienda no conectada sin maestros, no-gobernador rechazado, cross-tenant `ERR_STORE_MISMATCH`, payload con `store_id/tenant_id` → `ERR_INVALID_CHANGES`, identidad intacta tras los intentos).

## 11. Resultados E2E (BD aislada CostproE2E, centinela true, guard fail-closed)

Suite: `e2e/master-catalog-multistore.spec.ts` (proyecto core, serial, sin reintentos; pilotos A/B del run como tiendas conectadas + tienda C no conectada + tenant ajeno sintético).

| Corrida | Resultado |
| --- | --- |
| **Pre-fix** (funciones antiguas) | E2E-1 pasa (conexión+RLS); **E2E-2 FALLA**: `maestro e5c9a9aa… invisible desde B (ausencia de fila local no debe ocultarlo)` — reprodución exacta del defecto; E2E-3..8 bloqueados (serial) |
| **Post-fix** | **8/8 passed (4.8 m)**: conexión y RLS, visibilidad completa paginada, solo-maestro sin stock/precio falso, incorporación idempotente (sin duplicados ni copia de imagen), imágenes compartidas con cambio propagado, atributos locales intactos, negativas de seguridad, altas locales puras visibles |

Limpieza: guardrail **net-zero PASS** tras ambas corridas (los residuos de runs
fallidos se saneaaron con `hard-cleanup` canónico; el afterAll del spec quedó
blindado: links por store y por creador, change-logs por actor, masters, stores
y tenant ajeno por ID).

## 12. Resultado de regresión

- **Humo CI** (mismo filtro de `e2e-isolated.yml`): health-api + centinela + auth + data-hygiene-probe + isolation-proof + inventory + pos-checkout + inventory-integrity → **45/45 passed (3.0 m)**, guardrail net-zero PASS — POS, inventario, ajustes y ventas sin regresiones.
- **ESLint** de los 6 ficheros tocados: 0 errores (warnings preexistentes de estilo `<button>`).
- Tiendas NO conectadas: rama de la RPC idéntica a la versión anterior (comportamiento preservado por construcción y verificado en E2E-7a).

## 13. Riesgos residuales

1. ~~Producción aún sin aplicar~~ → **APLICADA en producción el 2026-11-01** (ver §7.3, autorización explícita del propietario, verificación incluida). Reversibilidad: restaurar las definiciones de 20261028120000 + `DROP INDEX IF EXISTS products_master_store_unique`.
2. **Filtrado por categoría**: los maestros no tienen categoría (atributo local) — con filtro de categoría activo las filas solo-maestro se ocultan. Documentado como comportamiento, no defecto.
3. **POS sigue vendiendo solo filas locales**: la visibilidad global es de CATALOGO (misión §2.2 distingue visibilidad vs operatividad comercial); incorporar a inventario sigue siendo explícito (`activate_master_product`).
4. **Badge/guardas UI**: hasta que el PR #1540 se integre, el frontend desplegado (main) renderiza las filas solo-maestro como filas normales (sin badge, operativos en cero, badge «Incompleto») — compatible por diseño (zod descarta `source`/`master_product_id`). Con el PR: badge «Maestro» y guardas locales.
5. **Caché**: la invalidación de react-query (`catalog-products-v2`) ya existía; no se añadieron capas de caché nuevas.
6. **Ferricarril sin membresías**: la tienda FERROCARRIL VITALLCONS no tiene `user_store_memberships` en producción — está conectada al catálogo pero ningún usuario pertenece formalmente a ella. La visibilidad se verificó impersonando al owner del tenant. Cuando se den de alta usuarios en la tienda, verán el catálogo completo sin pasos adicionales.

## 14. SHA y enlace al PR

- Corrección (fase 1): **`7d349e8`** · pruebas e informe: **`06a0d92`** ·
  versión final de la migración (UNION ALL) + merge de main + manifiesto a 118
  + CI verde: **`4f0bfb4`** (rama `fix/master-catalog-multistore-visibility`).
- PR: **https://github.com/Nardian90/Costpro/pull/1540** — CI completo en verde
  (TypeCheck + Lint + Unit Tests + Build ✅ · Unit & Integration Tests ✅).
  Sin auto-merge; el propietario revisa antes de integrar.
- Evidencia de la verificación de imágenes: `scripts/verify-imagen-afirmacion.mjs` (solo lectura, reproducible).
