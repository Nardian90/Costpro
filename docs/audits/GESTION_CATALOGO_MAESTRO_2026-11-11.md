# GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO — 2026-11-11

**Misión**: mejora de la gestión de los productos del Catálogo Maestro desde la
pestaña **Inicio → OPERACIÓN → Almacén → Inventario → «Catálogo»**.
**Rama**: `feat/gestion-catalogo-maestro-20261111`.

---

## 1. Limitaciones de la implementación anterior (auditoría previa)

La auditoría técnica se ejecutó ANTES de modificar (brief §5) sobre:

- `src/components/views/terminal/views/catalog/` (CatalogView, CatalogProductGrid,
  EditProductModal, ProductImageViewerModal).
- `src/components/modals/MasterCatalogModal.tsx` (modal «Catálogo de la organización»).
- Modelo de datos: `master_products`, `catalog_store_links`, `products.master_product_id`,
  triggers `trg_products_master_identity_guard`, `ensure_product_barcode`,
  `sync_product_has_movements`; RPCs certificadas (`activate_master_product`,
  `update_master_product`, `propose_master_change`, `review_master_proposal`,
  `search_master_products`); unicidades `products_store_sku_unique (store_id, sku)` y
  `master_products_tenant_sku_unique (tenant_id, sku)`.

Hallazgos:

1. **Sin activación en la pestaña «Catálogo»**: las filas solo-maestro
   (`source='master'`, sin fila local) tenían TODAS las operaciones bloqueadas por
   `bloquearOperacionLocal` — la activación exigía navegar al modal de la organización.
2. **Sin edición de imagen/descripción para filas solo-maestro**: la identidad
   compartida solo se editaba en el panel de gobernanza
   (Sistema → Organizaciones → Catálogo). Para vinculados, el flujo local de imagen
   fallaba DESPUÉS de subir el archivo a no-gobernadores, sin aviso previo de alcance.
3. **SKU sin bloqueo por movimientos**: `EditProductModal` permitía editar el SKU de
   productos locales con historial; `update_master_product` aceptaba cambios de SKU
   del maestro y los propagaba a TODAS las filas locales sin ninguna guardra de
   movimientos (riesgo de trazabilidad contable).
4. **Uploads huérfanos latentes**: `ProductImageViewerModal` sobre una fila
   solo-maestro usaba como `productId` el UUID del MAESTRO → el UPDATE de `products`
   afectaba 0 filas y el archivo subido quedaba huérfano en el bucket.
5. **Sin estados diferenciados visuales** entre «pendiente de activación» y «local
   vinculado al catálogo».

Dónde se almacenan imagen/descripción (verificado):

- **Imagen**: atributo COMPARTIDO del maestro (`master_products.image_path`),
  resuelta master-first en TODAS las lecturas (catálogo/POS) y propagada por
  `fn_master_apply_identity_changes` (20261030120000) → la edición pertenece al
  registro maestro (alcance global).
- **Descripción**: arquitectura híbrida — override POR TIENDA (`products.description`
  no-vacía gana en el listado; el maestro es fallback y semilla de nuevas
  activaciones) → existe mecanismo de personalización por tienda que se respeta;
  la descripción del registro maestro se edita como identidad compartida.

## 2. Solución adoptada y por qué

- **Activación en la pestaña** (opción preferida del brief §3): acción
  «Activar en esta tienda» en la propia fila (tabla y tarjetas) → RPC certificada
  existente `activate_master_product` (idempotente, permisos servidor, fila local con
  defaults de alta manual, existencia 0, sin movimientos, sin copiar datos de otras
  tiendas). Cero duplicados: el índice único `products_master_store_unique` y la
  idempotencia del RPC lo garantizan; otras tiendas no se ven afectadas.
- **Edición de imagen y descripción**: nuevo `MasterIdentityEditModal` accesible
  (a) desde la propia fila del catálogo (incluido el clic en la imagen de filas
  solo-maestro), (b) desde el modal «Catálogo de la organización» (interfaz
  alternativa del brief). Gobernador → `update_master_product` (aplicación inmediata);
  no gobernador → `propose_master_change` (pendiente de aprobación del gobernador).
  Aviso de **alcance global antes de guardar** (brief §3) + validación y compresión de
  imagen con limpieza del archivo si la RPC falla. Sin campos duplicados ni
  relaciones paralelas: mismas tablas, mismo bucket, mismas RPCs certificadas.
- **SKU bloqueado por movimientos** (criterio del propietario — existencia real de
  movimientos, no antigüedad ni estado):
  - **Servidor (raíz, fail-closed)** — migración `20261111120000`:
    (a) `fn_master_apply_identity_changes`: cambio real de SKU del maestro bloqueado
    con `ERR_SKU_LOCKED_BY_MOVEMENTS` cuando ALGUNA fila local vinculada tiene
    movimientos (`has_movements` + verificación directa de `transaction_items`/
    `stock_movements`/`receipt_items`); punto único que cubre `update_master_product`
    Y las propuestas aprobadas por `review_master_proposal` (ninguna ruta esquiva la
    regla). (b) `ERR_MASTER_SKU_CONFLICT`: colisión controlada del SKU nuevo con
    filas locales no-vinculadas de las tiendas afectadas (antes del 23505 crudo).
    (c) `trg_products_sku_movement_guard` en `products`: UPDATE directo de SKU en
    filas SIN maestro bloqueado con movimientos (PostgREST directo incluido).
  - **UI (defensa en profundidad)**: `EditProductModal` deshabilita el SKU con
    mensaje explicativo cuando `has_movements`; guard en `handleSaveEdit`.
  - Si el SKU es compartido por el maestro: cualquier cambio permitido considera
    TODAS las vinculaciones (unicidad de maestro por tenant + colisión con locales
    + propagación atómica) — verificado en PostgreSQL real (§5).
- **Anti-huérfanos**: `ProductImageViewerModal` rechaza filas solo-maestro con guía
  hacia activación/identidad compartida; `CatalogView` enruta el clic en imagen de
  filas solo-maestro al modal de identidad.

## 3. Desde qué interfaces se activa y se edita

- Activar: **pestaña «Catálogo»** (fila solo-maestro, tabla y tarjetas) y
  **modal «Catálogo de la organización»** (como antes).
- Editar imagen/descripción compartidas: **pestaña «Catálogo»** (acción
  «Identidad compartida» / clic en imagen de filas solo-maestro) y
  **modal «Catálogo de la organización»** (botón «Editar» por fila).
- Datos comerciales locales (precios, categoría, existencia): flujo local existente
  (`EditProductModal`), con aviso de alcance global en la imagen de vinculados.

## 4. Cómo se determina si el SKU queda bloqueado

`has_movements` real de la fila (columna materializada mantenida por
`sync_product_has_movements` + verificación directa de las tres tablas de
movimientos). Nada de antigüedad ni estado de activación. Niveles:

| Caso | SKU |
| --- | --- |
| Local sin maestro, CON movimientos | bloqueado (trigger + UI) |
| Local sin maestro, SIN movimientos | editable (unicidad BD por tienda) |
| Local vinculado al maestro | gobernado por el maestro (coerción trigger) |
| Maestro con alguna fila vinculada con movimientos | cambio bloqueado (RPC, todas las rutas) |
| Maestro sin filas o sin movimientos | editable con validaciones (unicidad tenant + colisión) |

## 5. Cambios (DB, servicios, permisos, interfaz)

- **DB** (`supabase/migrations/20261111120000_cp_catalogo_master_gestion_tienda.sql`,
  idempotente + guard fail-closed): guardas de SKU en
  `fn_master_apply_identity_changes` (+`ERR_MASTER_SKU_CONFLICT`),
  `fn_products_sku_movement_guard` + `trg_products_sku_movement_guard`,
  verificación `CP-MASTER-GESTION-GUARD`. Sin cambios de datos; tablas
  históricas/financieras intactas (verificado). Manifiesto de replay E2E
  regenerado (143 migraciones incluidas).
- **Frontend**: `CatalogView` (cableado de activación/identidad/governor, gate del
  visor, guard de SKU al guardar), `CatalogProductGrid` (acciones por fila, badges
  diferenciados), `MasterIdentityEditModal` (nuevo), `EditProductModal` (bloqueo de
  SKU por movimientos + aviso de alcance de imagen), `MasterCatalogModal` (acción
  «Editar»), `ProductImageViewerModal` (guard anti-huérfanos),
  `useMasterCatalog.ts` (`useMasterProductIdentity`), `atomic/ProductCard`
  (botón de activación + badge «Vinculado»).
- **Permisos/RLS**: sin cambios — la escritura sigue EXCLUSIVAMENTE por RPC
  SECURITY DEFINER con guards de capacidad (`is_catalog_governor`,
  `has_store_access_as`/roles de tienda) y auditoría por campo
  (`master_change_log`, `audit_logs`). Aislamiento multitienda intacto
  (tenant_id + RLS + verificación del tenant del maestro en la RPC).

## 6. Pruebas ejecutadas y resultados

- **Vitest** (nuevo/actualizado): 25 tests nuevos
  (`cp-catalogo-master-gestion-tienda-migration.test.ts` 7,
  `master-identity-edit-modal.test.tsx` 8,
  `catalog-master-gestion-actions.test.tsx` 10) + contratos actualizados
  (`useMasterCatalog-catalogo.test.tsx`, manifiesto replay 143).
  Suite completa: **5848+ passed**; los únicos fallos restantes
  (`db-integration` superadmin memberships, `gate1-url-sync`) se reproducen
  IDÉNTICOS en `main` puro (worktree aislado) — preexistentes, no causados por
  esta misión (deriva de datos de la BD real y entorno).
- **PostgreSQL real (BD aislada CostproE2E)**:
  `node scripts/e2e/verify-master-gestion-pg.mjs` → **21/21 OK**
  (migración aplica sin errores; SKU bloqueado con movimientos en maestro y local;
  permitido sin movimientos; no-cambio idempotente; ERR_MASTER_SKU_CONFLICT y
  ERR_MASTER_SKU_EXISTS controlados; imagen/descripción/propagación intactas;
  otras tablas sin cambios; fixture sin residuos).
- **Higiene de la BD aislada**: `data-hygiene-guard.cjs` → **PASS — net delta = 0**.
- typecheck (0 errores) y eslint (0 errores; avisos preexistentes de patrón
  incremental).

## 7. Limitaciones arquitectónicas pendientes

- La **aprobación de propuestas** de no-gobernadores sigue gestionándose en el panel
  de gobernanza (Sistema → Organizaciones → Catálogo); el modal de identidad notifica
  claramente el flujo pendiente, pero no incluye la cola de revisión.
- La edición de SKU **sin movimientos** permanece en el panel de gobernanza
  (identidad global con validaciones de unicidad), no en la pestaña «Catálogo» —
  decisión deliberada para mantener la trazabilidad contable como criterio único
  de desbloqueo y concentrar la identidad global en la interfaz gobernada.
- E2E Playwright del flujo completo no ejecutado en esta misión (el workflow
  «E2E Aislado» del repo es manual-dispatch); la verificación PostgreSQL real + suite
  Vitest cubren el contrato. El manifiesto de replay quedó regenerado (143) para CI.
- `db-integration.test.ts` (superadmin memberships) falla por deriva de DATOS de la
  BD real (preexistente en `main`): la cuenta de plataforma tiene 2 membresías que
  el test no espera — requiere decisión del propietario (limpieza de datos o test).
