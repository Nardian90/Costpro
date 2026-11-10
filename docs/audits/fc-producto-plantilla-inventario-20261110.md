# Expediente — Auditoría y corrección: conexión Producto ↔ Ficha de Costo (Inventario)

**Fecha:** 2026-11-10 · **Rama:** `fix/fc-producto-plantilla-20261110` · **Misión:** permitir conectar cualquier producto del inventario con una Ficha de Costo disponible (plantillas guardadas del usuario en servidor), sin exigir plantilla predeterminada por tienda, y corregir el 404 de «Ir a ajustes de tienda».

---

## A. Diagnóstico

### A.1 Causa del mensaje «Sin plantilla configurada para esta tienda»

Ruta del usuario: Inicio → OPERACIÓN → Almacén → Inventario (`view: inventory` → `InventoryView.tsx`).

1. `InventoryView` usa `useProductFCStatus(products)` (`src/hooks/ui/useProductFCStatus.ts`), que consulta Supabase:
   - `product_cost_sheets` (FC activas de los productos de la tienda activa),
   - `store_cost_templates` (plantilla predeterminada de la tienda activa).
2. `resolveProductFC()` (`src/lib/integration/fc-automation.ts`) resuelve: FC existente → `existing`; sin FC pero con plantilla de tienda → `needs_calculation` (pendiente); sin FC y sin plantilla de tienda → `no_template` (sin_fc).
3. Con `fcStatus === 'sin_fc'`, el botón FC abre `FCPreviewModal` en modo `no_template`, que muestra el mensaje y un único botón «Ir a ajustes de tienda».
4. La API de generación `POST /api/product-cost-sheets/auto-generate` exige `store_cost_templates.is_active=true` y devuelve `needs_template` en caso contrario: el flujo está estructuralmente bloqueado para tiendas sin plantilla predeterminada, **aunque el usuario tenga plantillas guardadas en el servidor** (`cost_sheet_templates`, visibles en Costo → Fichas de Costo → Plantillas de Fichas → Mis Plantillas Guardadas en COSTPRO).

### A.2 Causa del error 404 de «Ir a ajustes de tienda»

- `FCPreviewModal.tsx` (línea ~365) renderizaba `<a href={`/settings/stores/${storeId}`}>`.
- La aplicación es una SPA de terminal (HomePageClient → TerminalShell) donde las vistas son estado de Zustand (`useUIStore.setCurrentView`); NO existen rutas Next.js de ajustes por tienda (`src/app/settings/` no existe).
- La configuración real y funcional de la plantilla predeterminada de la tienda existe: vista `management-hub` (OPERACIÓN → Gestión de Tiendas) → pestaña «Configuración» (por defecto) → `StoreSettingsView` → `StoreEditForm` (campos FC) → `useStoreEdit.editStoreWithFC` → `PUT /api/store-cost-templates` (implementado y operativo).
- Conclusión: **el apartado existe; solo el enlace apuntaba a una ruta inexistente**.

### A.3 Arquitectura encontrada

| Concepto | Estructura | Propiedad | Persistencia |
|---|---|---|---|
| Plantillas del usuario | `cost_sheet_templates` (type private/public, created_by, data JSONB completa) | Cuenta de usuario (RLS propietario, migración 20261110120000) | Servidor, multi-dispositivo |
| Plantilla predeterminada de tienda | `store_cost_templates` (uq store_id, template_id TEXT clave de sistema, template_data override, modalidad, pdf_format, is_active) | Tienda | Servidor |
| FC por producto | `product_cost_sheets` (uq activa por producto: índice parcial `WHERE deleted_at IS NULL`; template_id TEXT; calculated_data; cost_price; sync_status) + `products.cost_sheet_id` | Tienda (RLS por membresía) | Servidor |
| Plantillas de sistema | 13 plantillas en código (`TEMPLATE_REGISTRY`, `src/lib/data/*`) | Aplicación | Código |

Flujos de generación: `auto-generate` (route) y `recalculate-on-price-change` usaban **siempre** la plantilla de tienda; `generateFC()` solo resolvía plantillas del registro frontend (13 claves).

### A.4 Problemas de diseño identificados

- **P1** Dead-end UX: tienda sin plantilla predeterminada → imposible conectar producto con FC pese a tener plantillas de usuario en servidor.
- **P2** Enlace roto 404: ruta URL inexistente en SPA de vistas.
- **P3** Dos ecosistemas de plantillas sin puente: `cost_sheet_templates` (usuario) no participaba en la generación de FC de productos.
- **P4** Regeneración/recálculo siempre con plantilla de tienda → sobrescribiría cualquier asociación explícita producto↔plantilla.
- **P5** `InventoryView` no pasaba `costSheetId` a `FCPreviewModal` → «Eliminar y Regenerar» permanentemente deshabilitado.
- **P6 (detectado durante la implementación)** El `PATCH /api/product-cost-sheets` (desconexión) borraba por ID con service role sin validar la tienda del cost sheet: un encargado de la tienda A podía desconectar FCs de la tienda B conociendo el ID.

## B. Solución implementada

**`product_cost_sheets` como estructura de asociación (sin tablas nuevas, sin migraciones).**

### B.1 Archivos modificados/creados

| Archivo | Cambio |
|---|---|
| `src/lib/integration/fc-generator-service.ts` | + `generateFCFromTemplateData()` (pipeline inject→build→validate→calculate con CostSheetData arbitraria); refactor del pipeline común a `runGenerationPipeline()`; `autoGenerateFC` acepta `directTemplate` (preserva asociación) |
| `src/lib/integration/fc-template-resolution.ts` | **NUEVO** — `resolveEffectiveTemplate()` (cadena producto>tienda), `isUuidTemplateId()`, `inferModalidadFromTemplate()`, `hasStoreMembership()`, `isTemplateVisibleToUser()`, `getVisibleUserTemplate()` (espejo manual de la RLS) |
| `src/app/api/product-cost-sheets/generate-from-template/route.ts` | **NUEVO** — POST: valida payload/CSRF/rate-limit, producto y pertenencia a tienda, membresía admin/manager/encargado/costo, visibilidad de plantilla; genera; upsert check-then-insert/update; link `products.cost_sheet_id`; invalida caché PDF; auditoría |
| `src/app/api/product-cost-sheets/auto-generate/route.ts` | Usa `resolveEffectiveTemplate`; preserva asociación explícita; invalida caché PDF tras regeneración |
| `src/lib/integration/recalculate-on-price-change.ts` | Usa `resolveEffectiveTemplate`; el recálculo ya no exige plantilla de tienda si el producto tiene asociación de usuario |
| `src/app/api/product-cost-sheets/route.ts` | PATCH endurecido: valida tienda del cost sheet + membresía antes de soft-delete (P6); idempotente |
| `src/validation/api-schemas.ts` | + `generateFromTemplateSchema` |
| `src/lib/api-errors.ts` | + `FC_TEMPLATE_NOT_FOUND`, `FC_TEMPLATE_INVALID`, `FC_PRODUCT_STORE_MISMATCH` |
| `src/hooks/api/useProductCostSheet.ts` | + `useFCTemplateOptions` (consulta RLS desde navegador), `useGenerateFCFromTemplate` |
| `src/components/ui/FCTemplatePicker.tsx` | **NUEVO** — panel selector con búsqueda, selección única, modalidad opcional, marca «Actual», estados de carga/error/vacío |
| `src/components/ui/FCPreviewModal.tsx` | sin_fc → selector embebido + CTAs (Plantillas de Fichas / Ajustes de tienda corregido); vigente → Cambiar Ficha + Desconectar (confirmación) + chip de nombre legible; pendiente → Generar FC o conectar plantilla; precedencia de vistas internas sobre error de PDF |
| `src/components/views/terminal/views/inventory/InventoryView.tsx` | pasa `costSheetId` + `currentTemplateId` al modal (P5) |
| `src/components/views/terminal/views/catalog/CatalogView.tsx` | pasa `currentTemplateId` |
| `scripts/verify-fc-user-template-flow.mjs` | **NUEVO** — verificación read-only repetible de esquema/RLS |
| tests (5 archivos) | 79 pruebas nuevas |

### B.2 Funcionamiento de la conexión producto↔ficha

1. Inventario → botón FC del producto → `FCPreviewModal`.
2. Sin FC → selector de plantillas guardadas (privadas del usuario + públicas visibles; RLS del navegador como fuente de verdad). Búsqueda/filtrado; selección; confirmación.
3. Confirmación → `POST /api/product-cost-sheets/generate-from-template` → FC calculada con el cost-engine → fila en `product_cost_sheets` con `template_id = UUID` de la plantilla + `products.cost_sheet_id` enlazado (FK existente).
4. El modal pasa a vigente: vista previa PDF (quick-pdf funciona desde `calculated_data`), exportación, cambio de ficha (con aviso de reemplazo) y desconexión (confirmación + soft-delete).
5. La asociación persiste en el servidor: sobrevive recargas, sesiones y dispositivos. No se usa localStorage/sessionStorage para la relación.

### B.3 Funcionamiento de la plantilla predeterminada de tienda (intacta)

- `resolveEffectiveTemplate`: asociación del producto (UUID existente en `cost_sheet_templates`) > plantilla activa de `store_cost_templates`.
- Tiendas sin asociaciones de producto conservan el comportamiento histórico (auto-generate/recalculate con la plantilla de tienda).
- Si la plantilla de usuario asociada se elimina, la regeneración cae a la plantilla de tienda sin romperse.

## C. Seguridad

- **Sin cambios de RLS ni migraciones** — las políticas vigentes se respetan:
  - `cost_sheet_templates` (6 políticas, propietario — migración 20261110120000): el selector consulta con el cliente autenticado del navegador (RLS real); la API service-role replica la visibilidad manualmente (`getVisibleUserTemplate`): private → `created_by = usuario`; public → global o tienda con membresía activa; system → visible; admin/superadmin → todo. Test: plantilla privada ajena → 404.
  - `product_cost_sheets` (RLS por membresía de tienda): la nueva API escribe con service role tras validar manualmente producto/pertenencia/membresía (patrón FIX-FC-PERSIST-V3 del proyecto).
- **Aislamiento multitienda**: `FC_PRODUCT_STORE_MISMATCH` si el producto no pertenece a la tienda objetivo; FCs y productos por tienda; PATCH endurecido (P6) valida la tienda del cost sheet antes de desconectar (test: encargado de tienda B no puede desconectar FC de tienda A → 403).
- **Autorizaciones**: `withRole('encargado')` (membresías activas cuentan vía `hasRole`) + validación explícita de rol admin/manager/encargado/costo en la tienda. Clerk sin privilegio de costo → 403 (test). Membresías revocadas → 403 (test).
- **Plantillas intactas**: `generateFCFromTemplateData` opera sobre un clon; nunca escribe en `cost_sheet_templates` (test «no muta la plantilla guardada original»). Las adaptaciones por contexto (modalidad) viven en la FC, no en la plantilla.
- **Verificación de BD aislada** (read-only, repetible): `node scripts/verify-fc-user-template-flow.mjs` → PASS 5/5 (columnas de las 3 tablas + enlace products.cost_sheet_id + anon bloqueado).
- **RLS real verificado**: suite `fc-rls-database.test.ts` (57 tests) pasa contra la BD del entorno.

## D. Pruebas

### D.1 Escenarios (misión §9) y su cobertura

| # | Escenario | Evidencia |
|---|---|---|
| 1 | Usuario con plantilla conecta producto | API test «crea product_cost_sheets con template_id = UUID…» (201, insert con UUID, link) |
| 2 | Varias plantillas, selecciona una específica | Componente: selector lista 2 plantillas; unit: inferModalidad/picker filtrado |
| 3 | Sin plantillas → instrucciones | Componente: estado vacío del picker + botón «Ir a Plantillas de Fichas» (navegación verificada) |
| 4 | Producto con ficha asociada la consulta | Componente: vigente → vista previa + nombre legible de plantilla; quick-pdf usa calculated_data |
| 5 | Cambia la ficha vinculada | Componente: «Cambiar Ficha» abre selector con aviso de reemplazo; API: upsert update-path (no duplica) |
| 6 | Desconecta con permiso | PATCH endurecido: 200 con membresía; confirmación en UI |
| 7-8 | Persistencia tras recarga/relogin | Asociación en BD (`product_cost_sheets` + `products.cost_sheet_id`); sin localStorage (inspección de código: hooks invalidan y reconsultan desde el servidor) |
| 9 | Plantilla de usuario en otra tienda autorizada | API test «admin global…» + diseño: plantilla privada consultable en cualquier tienda con permiso de FC |
| 10 | Sin permisos no modifica | API tests 403 (sin membresía / rol clerk) |
| 11 | No asocia productos de otra tienda | API test FC_PRODUCT_STORE_MISMATCH 403 |
| 12 | Ajustes de Tienda sin 404 | Componente: sin `<a href="/settings/stores">`; navega a `management-hub` (spy verificado) |
| 13 | Plantilla predeterminada sigue funcionando | Unit: «sin directTemplate usa la plantilla de tienda» + «atajo idempotente»; auto-generate reescrito con fallback |
| 14 | Plantilla no se modifica al usarla | Unit: «no muta la plantilla guardada original» |

### D.2 Resultados

- **vitest (suite completa):** 5764 pass / 1 fail — el fallo (`db-integration.test.ts`, superadmin memberships) es **preexistente en main puro** (verificado con worktree en 5c43fcd6b: mismo fallo; drift de datos de producción, fuera de alcance).
- **Nuevos tests:** 79 (fc-generator-service 27, fc-template-resolution 17, fc-generate-from-template API 18, fc-disconnect-hardening 7, fc-preview-modal componente 10).
- **TypeScript:** `tsc --noEmit` → 0 errores.
- **Lint:** 0 errores (1509 warnings preexistentes del proyecto; 2 avisos nuevos de estilo `<Button>` en listbox-option/mock).
- **Build de producción:** compilación selectiva de las rutas afectadas (página principal + rutas API FC) ✓ «Compiled successfully» (51s). El build completo no cabe en el sandbox (4.1GB RAM → OOM; limitación documentada por el propio repo en docs/audits/COSTPRO-PERFORMANCE-AUDIT.md §4.2); el type-check embebido del build muere por OOM silencioso (reproducido con heap reducido; con heap 6GB pasa). **CI de GitHub ejecutará el build real en el PR.**
- **Smoke en vivo (dev server):** `POST /api/product-cost-sheets/generate-from-template` sin sesión → 401; `GET /` → 200.

## E. Integración

- Rama: `fix/fc-producto-plantilla-20261110` (desde main 5c43fcd6b), commits por fase:
  1. `c76522c5a` docs: expediente de auditoría.
  2. `7532d2a3c` feat: API generate-from-template + preservación de asociación.
  3. `10983f600` feat: selector de Fichas de Costo en Inventario + corrección 404.
  4. `6a7f1a8a9` fix: endurecimiento del PATCH de desconexión + verificación de BD.
  5. `45edeae01` fix: errores de tipo detectados por CI + script solo-GET (check-writers).
- **PR #1598**: https://github.com/Nardian90/Costpro/pull/1598
- **CI 100% verde en 45edeae01**: CI (TypeCheck + Lint + Unit Tests + **Build de producción**) ✓ · Test Coverage ✓ · Security CI Gate ✓ · E2E Aislado (CostproE2E) ✓.
- Nota de proceso: la primera pasada de CI detectó 17 errores de tipo (unión no discriminada + fixtures sin tipar) que los `tsc` locales habían enmascarado por OOM silencioso del sandbox; corregidos y verificados con `tsc --noEmit` EXIT 0 real y con la segunda pasada de CI (que incluye el build completo en runners de GitHub).
- Sin migraciones → nada que aplicar a producción.
