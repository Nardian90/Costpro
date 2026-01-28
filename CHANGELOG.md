# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.6.2] - 2026-02-15

### Added
- **Expansión del Sistema de Auditoría**: Implementación integral de logs para todas las mutaciones críticas del sistema.
- Nuevos disparadores (triggers) para auditar cambios en Productos (precios, costos, creación), Tiendas (configuración) y Perfiles de Usuario.
- Registro explícito en auditoría para Ventas, Ajustes Manuales de Stock y Ciclo de Vida de Transferencias.
- **Detalles Dinámicos**: Nuevo visualizador de diferencias (Diff Viewer) en la línea de tiempo de auditoría que muestra cambios "Antes -> Después" de forma legible.
- **Filtros Avanzados**: Incorporación de pre-ajustes de fecha (Hoy, Ayer, 7 días) en la vista de auditoría.

## [5.6.1] - 2026-02-13

### Changed
- **Technical Hardening (Transfers)**: Fortalecimiento de contratos de datos en el flujo de transferencias entre almacenes.
- Migración de `transfer-service.ts` a tipado estricto eliminando el uso de `any`.
- Implementación de validación Zod en la capa de servicio mediante `validateRPCResponse` y `validateRPCArrayResponse` para garantizar la integridad de los datos provenientes de Supabase.
- Centralización de `storeSchema` y definición de `transferWithDetailsSchema` en `src/validation/schemas.ts` para unificación de contratos.
- Refuerzo de interfaces en `src/types/index.ts` para reflejar con precisión la nulabilidad de los campos de la base de datos.

## [5.6.0] - 2026-02-13

### Added
- Nueva lógica funcional de **Cierre de Caja** conectada a Supabase.
- Flujo de trabajo en dos pasos: Declaración de Fondos por parte del cajero (Estado: Pendiente) y Validación Final por el Encargado (Estado: Cerrado).
- Cálculo automático de la diferencia de arqueo en tiempo real comparando la declaración con las ventas registradas en el sistema.
- Nueva función RPC `get_sales_since_last_closure` que garantiza un balance exacto basado en el último cierre finalizado o el inicio del día.
- Tabla histórica de cierres con indicadores visuales de estado y trazabilidad por operador.

## [5.5.6] - 2026-02-11

### Changed
- **Mobile Speed Optimization (TPV & Inventory)**: Optimización integral para operativa táctil rápida.
- Rediseño de controles de cantidad en TPV con targets de 44px para evitar errores táctiles.
- Implementación de selector de descuentos predefinidos (1-tap) para reducir uso de teclado.
- Migración de filtros de categoría a chips persistentes en Inventario, permitiendo filtrado en un solo toque.
- Mejora de ergonomía visual ocultando títulos redundantes en dispositivos móviles (≤768px).

## [5.5.5] - 2026-02-11

### Added
- Nueva vista de **Historial de Recepciones** con listado profesional y detalle expandible de productos.
- Acceso directo al Historial desde el menú lateral (INVENTARIO).
- Filtrado avanzado por rango de fechas, estado de recepción y proveedor.
- Soporte para imágenes de productos en el detalle de la recepción.
- Funcionalidad de exportación a CSV desde la vista de detalle de cada recepción.
- Acciones de edición y eliminación (con feedback visual de seguridad).

## [5.5.4] - 2026-02-11

### Added
- Nueva vista de **Transferencias entre Almacenes** que permite gestionar movimientos de stock entre tiendas del mismo Encargado.
- Flujo de solicitud (PENDIENTE) y confirmación (CONFIRMADA) con trazabilidad completa.
- Operación atómica de transferencia de stock mediante el RPC `confirm_transfer` que asegura consistencia entre almacenes origen y destino.
- Validación de permisos por rol para Almaceneros, Encargados y Administradores.

### Changed
- Registrada la vista de "Recepciones" en el orquestador principal de la terminal para habilitar el flujo de entrada de mercancía.

### Fixed
- Corregida la firma de la función `has_role` en las políticas RLS de Transferencias.
- Añadida sobrecarga de la función `has_role(uuid, user_role)` para soportar llamadas explícitas con ID de usuario, mejorando la compatibilidad con políticas de seguridad legacy.

## [5.5.3] - 2026-01-26

### Changed
- Hardened the inventory count process in the "Close Session" view. The system now requires an explicit count for every product, removing ambiguous fallbacks to the expected stock. This change strengthens data integrity by preventing unverified data from being submitted.
- **Instrucción de Relevo:** No changes to the user interface. No UX intervention is required.

## [5.5.2] - 2026-01-26

### Added
- Centralized `importService` (`src/services/import-service.ts`) for standardized CSV parsing using PapaParse and strict Zod validation.
- New `catalogImportRowSchema` and `receptionImportRowSchema` in `src/validation/schemas.ts` to enforce business rules at the entry point.

### Changed
- Hardened Catalog and Product Reception import flows by migrating from dispersed manual parsing to the centralized `importService`.
- Improved error feedback with precise row identification (index + 2) and Zod-driven error messages.

## [5.5.0] - 2026-01-26

### Added
- New "CostPro para Niños" section in Help view for visual onboarding using storytelling.
- Componentized Audit view with a visual, human-readable timeline.
- Enhanced Manager role permissions: now has access to Users and Stores management views.

### Changed
- Hardened Product Reception flow: mandatory store context selection is now enforced before searching or importing products.
- Improved audit log resilience: supports both UUID and Text record IDs.
- Optimized Audit Timeline performance with "Show More" pagination.

### Security
- Reinforced Row-Level Security (RLS) policies for audit log access.

## [5.4.0] - 2026-01-25

### Added
- Mobile-first TPV redesign with Drawer-based shopping cart.
- ActionMenu component with "Thumb Zone" (bottom) positioning support.
- Interactive mobile operational guide in Help section.

### Changed
- Unified inventory views using the atomic ProductCard component.
- Improved store selection UX in the multi-store header.

## [5.3.0] - 2026-01-24

### Added
- Multi-Store SKU isolation (Composite Key: store_id + sku).
- Mandatory SKU validation in Catalog and Reception services.
- New SVG diagram for SKU isolation in Help section.

## [5.2.0] - 2024-11-15

### Added
- Enterprise Multi-Store support.
- Dynamic role hierarchies and branch isolation using Supabase RLS.
