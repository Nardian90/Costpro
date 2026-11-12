# Expediente — CORRECCIÓN FUNCIONAL: Catálogo Maestro de la organización (2026-11-12)

**Rama:** `feat/catalogo-maestro-identidad-completa-20261112`
**Migración:** `supabase/migrations/20261112120000_cp_catalogo_sku_inmutable.sql`
**Alcance:** Inventario → pestaña «Catálogo» + diálogo «Catálogo de la organización» + panel de gobernanza (Sistema → Organizaciones → Catálogo).

## 1. Problema (brief del propietario)

1. La pestaña **Catálogo** de Inventario permitía crear productos, pero el diálogo **Catálogo de la organización** NO ofrecía creación.
2. La administración del Catálogo Maestro solo permitía modificar **imagen y descripción** compartidas: faltaba el **nombre**, parte de la identidad compartida de la organización.
3. El SKU debía ser **compartido e inmutable tras la creación** en cualquier interfaz y vía cualquier operación autorizada del backend (la regla anterior de 20261111120000 solo lo bloqueaba con movimientos históricos).

## 2. Auditoría previa (sin suposiciones — estado real verificado)

| Pieza | Estado ANTES | Fuente |
| --- | --- | --- |
| Creación desde Inventario | `CreateProductModal` → `findMasterBySku` dedup → RPC `create_master_product` (maestro + fila local atómica) | `src/components/modals/CreateProductModal.tsx` |
| Creación desde diálogo organización | **NO EXISTÍA** | `src/components/modals/MasterCatalogModal.tsx` |
| Nombre compartido | EditProductModal lo tenía **disabled** para vinculados; gobernanza sí lo editaba | `EditProductModal.tsx` / `CatalogGovernanceSection.tsx` |
| SKU | Editable si no había movimientos (gobernanza y ficha local); maestro: bloqueado solo con movimientos | `20261111120000` |
| Imagen compartida | Editable, pero la política de storage rechazaba los nombres `master-<id>-…` para usuarios no admin (**defecto latente**: la subida de `MasterIdentityEditModal` fallaba para gobernadores no admin) | `pg_policies` verificado en la BD aislada |
| Lecturas v2 | nombre = COALESCE(local, maestro) con coerción de escritura; imagen = master-first; descripción = override local | `20261101130000` |

## 3. Solución implementada

### 3.1 Backend — migración `20261112120000` (fail-closed, punto único)

1. **`fn_master_apply_identity_changes`**: cualquier objeto de cambios con la clave `sku` → `ERR_SKU_IMMUTABLE` (cubre `update_master_product` Y las propuestas aprobadas por `review_master_proposal`). `'sku'` sale del conjunto editable; se retira la lógica muerta (unicidad del nuevo SKU, guardas por movimientos y colisión local). **Se conservan íntegros**: nombre editable + validación de no-vacío, imagen compartida + propagación, auditoría por campo en `master_change_log`, propagación SKU/nombre a filas locales (re-coerción defensiva del SKU canónico).
2. **`propose_master_change`**: `'sku'` deja de ser proponible → `ERR_SKU_IMMUTABLE` **al encolar** (no se admiten propuestas que la aprobación rechazaría igualmente).
3. **`trg_products_sku_immutable_guard`** (reemplaza a `trg_products_sku_movement_guard`): cualquier cambio **real** de `products.sku` en filas sin maestro → `ERR_SKU_IMMUTABLE` (antes: solo con movimientos). Filas vinculadas: fuera (su SKU proviene del maestro; coerción del `trg_products_master_identity_guard`).
4. **Políticas de storage** `product-images` (insert/update/delete): nueva rama para objetos `master-{masterId}-{uuid}.{ext}` cuando el maestro pertenece a un tenant con alguna tienda **conectada** accesible (`substring(name,8,36) = master_products.id` por PK + `catalog_store_links` + `has_store_access`). Corrige el defecto latente de imagen para no-admins y habilita imagen al crear desde el diálogo. Aislamiento por tenant intacto.
5. **Verificación fail-closed post-migración** (bloque DO) + idempotencia (`DROP ... IF EXISTS`, incluido el trigger nuevo).

**Sin cambios de esquema de datos** (columnas/tablas): solo funciones, trigger y políticas — justificación en el PR.

### 3.2 Frontend

| Interfaz | Cambio |
| --- | --- |
| `MasterIdentityEditModal` (ambas interfaces: fila del Catálogo + diálogo organización) | Campo **Nombre compartido** (editable, validado, ≤150, no vacío — el diálogo no se cierra ante error) + **SKU protegido** read-only con candado e indicación de inmutabilidad. Nombre/imagen/descripción viajan por `update_master_product` (gobernador) / `propose_master_change` (no gobernador). |
| `MasterCatalogModal` (diálogo «Catálogo de la organización») | Botón visible **«+ Crear producto»** (junto a la búsqueda, responsive) que abre `CreateMasterProductModal` sin cerrar el diálogo. |
| `CreateMasterProductModal` (nuevo) | Formulario **SKU + Nombre + Imagen + Descripción**. **Mismo servicio** que la pestaña Catálogo (`useCreateMasterProduct` → RPC `create_master_product`), dedup previo `findMasterBySku` con oferta de activación del existente; imagen (opcional) subida con prefijo `master-{id}-…` y aplicada vía RPC gobernada (gobernador aplica / no gobernador propone; limpieza del archivo si falla — sin huérfanos). Nota explícita de SKU inmutable ANTES de guardar. |
| `EditProductModal` + `CatalogView` (ficha habitual de Inventario) | **Nombre editable para vinculados** con aviso de alcance compartido y enrutado al maestro (gobernador aplica / no gobernador propone, con manejo de errores sin cerrar la ficha); payload local de vinculados **excluye nombre**; **SKU read-only permanente** (inmutable) con mensajes explicativos; guard de UI que rechaza cualquier mutación de SKU. |
| `CatalogGovernanceSection` (gobernanza) | Editor de identidad: **SKU protegido read-only** (candado + «inmutable tras la creación»); nombre/barcode/unidad/imagen/descripción siguen editables; `submit` ya no construye `changes.sku`. |
| `useMasterCatalog` | `MasterChanges` **excluye `sku` por tipo** (el compilador impide construir payloads de identidad con SKU). |

### 3.3 Consistencia multitienda (verificada en PostgreSQL real)

- El nombre y la imagen compartidos se actualizan en **todas** las tiendas vinculadas (propagación de `fn_master_apply`).
- La descripción se mantiene compartida conforme al modelo actual (base maestra + override local).
- **Precios, costos y existencias NO se propagan** (verificación 5.5 del script: S1 p=100/50 y S2 p=120/60 intactos tras cambiar identidad).
- El SKU no se modifica por ninguna interfaz ni operación autorizada del backend (verificaciones 4.1–4.9).
- Creación sin duplicados ni huérfanos (`ERR_MASTER_SKU_EXISTS` por SKU y `products_master_store_unique`); el nuevo producto queda vinculado a la tienda activa con defaults de alta manual (precio 0/CUP, min_stock 1, existencia 0 — verificación 6.2) y admite después sus datos comerciales desde el inventario.

## 4. Pruebas y evidencia

| Prueba | Resultado |
| --- | --- |
| TypeCheck (`bunx tsc --noEmit`) | ✅ 0 errores |
| Lint (`bun run lint`) | ✅ 0 errores (1517 warnings preexistentes de estilo, mismos patrones que el resto del repo) |
| Unit/Integration (`bun run test`) | ✅ 5879 passed + 95 skipped, 0 fallos tras la corrección del conteo del manifiesto (144→145) |
| Build (`next build`) | ✅ compile OK local (entorno de 4 GB: fase de type-check del build ejecutada aparte con `tsc --noEmit`; CI con más memoria ejecuta el build completo) |
| Contrato estático (`security-contract-test-static.cjs`) | ✅ OK con 2 excepciones `source_of_truth_baseline` **documentadas y con expiración** para las 2 funciones reescritas (patrón de la misión 2026-11-11: retirar tras desplegar + regenerar contract-surface) |
| Gates CI (check-writers / ci-gate-ts / destructive-guard / BOLA) | ✅ todos OK |
| **Verificación PostgreSQL real** (`scripts/e2e/verify-catalogo-identidad-pg.mjs`, BD aislada CostproE2E, guard fail-closed) | ✅ **36/36** — `docs/audits/CATALOGO-IDENTIDAD-20261112/verify-catalogo-identidad-pg.log` |

### Mapa de escenarios de aceptación (brief §8) → evidencia

| # | Escenario del brief | Evidencia |
| --- | --- | --- |
| 1 | Crear desde pestaña Catálogo | Flujo sin cambios (`CreateProductModal` + `create_master_product`); suite `create-product-operational-class` y wiring §5 |
| 2 | Crear desde diálogo organización | Script 6.1–6.5 + suite `create-master-product-modal.test.tsx` (8 tests) + wiring |
| 3 | Nombre desde Inventario → maestro y demás tiendas | Script 5.1–5.2 (propagación S1+S2) + `catalog-master-gestion-actions` (nombre editable vinculados) + wiring CatalogView |
| 4 | Nombre desde diálogo Catálogo Maestro | `master-identity-edit-modal.test.tsx` (nombre → update/propose) + script 5.1 |
| 5 | Imagen desde ambas interfaces | `MasterIdentityEditModal` (imagen compartida, sin cambios de flujo) + script 5.3 (propagación por referencia) + políticas master- (2.7) |
| 6 | Descripción desde ambas | `MasterIdentityEditModal` descripción (suites 13 tests) + script 5.1 (descripción incluida) |
| 7 | SKU no modificable en NINGUNA interfaz ni backend | Script 4.1–4.8 (todas las rutas) + UIs read-only (EditProductModal/identidad/gobernanza) + `MasterChanges` sin sku |
| 8 | Nombre/imagen sin tocar precios/costos/existencias | Script 5.5 (por fila, ambas tiendas) |
| 9 | Producto nuevo vinculado + datos comerciales después | Script 6.2/6.3 (defaults alta manual + vínculo) |
| 10 | Permisos, RLS, duplicados, aislamiento | RPCs SECURITY DEFINER con revalidación en servidor (sin cambios de ACL); script 6.4/6.5 (duplicados) + fixture 2 tiendas aisladas + políticas por tenant |

## 5. Despliegue (COMPLETADO — 2026-11-12)

1. **`20261112120000` APLICADA a producción** (canal Management API + NOTIFY pgrst, patrón CP-INFRA-019, doble
   flag, lote único): verificación POST 19/19, pruebas negativas sin escrituras, sonda de propagación multi-tienda
   con rollback forzado, simulación de la política de imagen para no-admin y delta 0. Expediente de aplicación:
   `docs/audits/APLICACION_MIGRACION_20261112120000_PRODUCCION.md` · evidencia: `m012-aplicacion-produccion.txt`
   (script versionado `scripts/m012-aplicar-migracion-20261112120000.mjs`).
2. **`contract-surface.sql` REGENERADO** (`scripts/export-contract-surface.cjs`): 190 funciones, sha256
   `f81ee44da087341825cb62655a1705c903f9fba6f88b53ddd5ba60fe0c8dc015` — contrato estático OK.
3. **2 excepciones `source_of_truth_baseline` RETIRADAS** de `ci-gate-allowlist.json` (migración desplegada y
   surface certificado; la entrada permanente de seguridad del helper permanece).
4. PR #1605 fusionado en `main` (merge `52904a2c78753a433fb8cde3488f7960cc2769bd`); el worklog del sandbox y el
   expediente de la ORDEN registran la cronología completa.
