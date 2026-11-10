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

- `FCPreviewModal.tsx` (línea ~365) renderiza `<a href={`/settings/stores/${storeId}`}>`.
- La aplicación es una SPA de terminal (HomePageClient → TerminalShell) donde las vistas son estado de Zustand (`useUIStore.setCurrentView`); NO existen rutas Next.js de ajustes por tienda (`src/app/settings/` no existe).
- La configuración real y funcional de la plantilla predeterminada de la tienda existe: vista `management-hub` (OPERACIÓN → Gestión de Tiendas) → pestaña «Configuración» (por defecto) → `StoreSettingsView` → `StoreEditForm` (campos FC) → `useStoreEdit.editStoreWithFC` → `PUT /api/store-cost-templates` (implementado y operativo).
- Conclusión: **el apartado existe; solo el enlace apunta a una ruta inexistente**.

### A.3 Arquitectura encontrada

| Concepto | Estructura | Propiedad | Persistencia |
|---|---|---|---|
| Plantillas del usuario | `cost_sheet_templates` (type private/public, created_by, data JSONB completa) | Cuenta de usuario (RLS propietario, migración 20261110120000) | Servidor, multi-dispositivo |
| Plantilla predeterminada de tienda | `store_cost_templates` (uq store_id, template_id TEXT clave de sistema, template_data override, modalidad, pdf_format, is_active) | Tienda | Servidor |
| FC por producto | `product_cost_sheets` (uq activa por producto: índice parcial `WHERE deleted_at IS NULL`; template_id TEXT; calculated_data; cost_price; sync_status) + `products.cost_sheet_id` | Tienda (RLS por membresía) | Servidor |
| Plantillas de sistema | 13 plantillas en código (`TEMPLATE_REGISTRY`, `src/lib/data/*`) | Aplicación | Código |

Flujos de generación: `auto-generate` (route) y `recalculate-on-price-change` usan **siempre** la plantilla de tienda; `generateFC()` solo resuelve plantillas del registro frontend (13 claves).

### A.4 Problemas de diseño identificados

- **P1** Dead-end UX: tienda sin plantilla predeterminada → imposible conectar producto con FC pese a tener plantillas de usuario en servidor.
- **P2** Enlace roto 404: ruta URL inexistente en SPA de vistas.
- **P3** Dos ecosistemas de plantillas sin puente: `cost_sheet_templates` (usuario) no participa en la generación de FC de productos.
- **P4** Regeneración/recálculo siempre con plantilla de tienda → sobrescribiría cualquier asociación explícita producto↔plantilla.
- **P5** `InventoryView` no pasa `costSheetId` a `FCPreviewModal` → «Eliminar y Regenerar» permanentemente deshabilitado.

## B. Solución (decisiones)

**Reutilizar `product_cost_sheets` como estructura de asociación producto↔FC (sin tablas nuevas).**

1. Conectar producto con plantilla guardada = generar FC desde `cost_sheet_templates.data` y persistirla en `product_cost_sheets` con `template_id = UUID de la plantilla`; `products.cost_sheet_id` enlaza (FK existente). Modalidad: opcional en la petición, inferida de `data.header.destination`, default `produccion`.
2. Nueva capacidad de generación: `generateFCFromTemplateData()` (mismo pipeline inject→build→validate→calculate).
3. Nueva API `POST /api/product-cost-sheets/generate-from-template` con autorización manual espejo de RLS (service-role):
   - producto existe y pertenece a la tienda indicada;
   - caller con membresía activa admin/manager/encargado/costo en esa tienda (o admin global);
   - plantilla visible para el usuario: private → `created_by = usuario`; public → `store_id IS NULL` o acceso a esa tienda;
   - upsert check-then-insert/update + link + audit + invalidación de caché PDF.
4. Preservación de asociación (P4): resolución de «plantilla efectiva» — si la FC existente tiene `template_id` UUID presente en `cost_sheet_templates`, regenerar con esa; si no, plantilla de tienda (comportamiento actual intacto). Aplicado a `auto-generate` y `recalculate-on-price-change`.
5. Selector en `FCPreviewModal`: estados `no_template` (selector de plantillas del usuario + CTA a Plantillas de Fichas si no hay ninguna + acceso a ajustes de tienda corregido) y `vigente` (consultar PDF, cambiar plantilla con confirmación, desconectar con confirmación).
6. Corrección 404: navegación real a `setCurrentView('management-hub')` (hub Gestión de Tiendas, tab Configuración por defecto) conservando el contexto de tienda activa.

## C. Seguridad (verificación previa)

- RLS vigente en `cost_sheet_templates` (6 políticas, propietario), `store_cost_templates` (7), `product_cost_sheets` (6) — sin cambios.
- Las API de FC usan service-role con autorización manual en ruta (patrón existente FIX-FC-PERSIST-V3); la nueva ruta replica y amplía las validaciones (pertenencia de producto a tienda, visibilidad de plantilla).
- Aislamiento multitienda: FC y productos por tienda; plantilla de usuario compartible entre tiendas autorizadas **sin** compartir datos operativos (la plantilla solo se lee; las adaptaciones viven en `calculated_data` de cada FC).

## D. Pruebas (plan)

- Unit: `generateFCFromTemplateData` (pipeline puro con plantilla de fixture).
- Integración API: validación de permisos, pertenencia de producto, visibilidad de plantilla (private ajena → 404/403), upsert idempotente.
- Componente: `FCPreviewModal` estados del selector.
- Regresión: `resolveProductFC` intacto; auto-generate con plantilla de tienda intacto.
- Suite: `bun run test` (vitest), `bun run lint`, `bunx tsc --noEmit`, `bun run build`.

## E. Integración

- Rama: `fix/fc-producto-plantilla-20261110` desde `main` (SHA base: 5c43fcd6b).
- Commits por fase (diagnóstico → backend → frontend → pruebas → informe).
- PR objetivo: Nardian90/Costpro, título y cuerpo en español con evidencia.
