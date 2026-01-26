# Changelog - CostPro

## [v5.5.0] - UX-HARDENING - 2026-01-26

### Added
- **Contexto Obligatorio de Tienda:** Implementación de guardas visuales y funcionales en `ProductReceptionView` para prevenir registros de mercancía sin una tienda activa seleccionada. Esto protege la integridad de los datos para usuarios con rol `admin`.
- **Banner de Advertencia:** Nuevo componente de alerta en el flujo de recepción para guiar al usuario hacia la selección de tienda.

### Changed
- **Localización Integral (100% Español):** Traducción completa de etiquetas, placeholders, mensajes de estado y diálogos en el flujo de Recepción de Productos.
- **Normalización de Exportación:** Sincronización de nombres de columnas entre la importación y exportación de productos para evitar confusión operativa.
- **Mejora en Mensajería de Error:** Los errores de parsing de CSV ahora son más descriptivos y están totalmente localizados.

### Fixed
- Inconsistencia de idioma en el resumen de recepción y lista de productos a importar.
- Ambigüedad en la búsqueda de productos cuando el `storeId` no estaba definido.

---

## [v5.4.1] - 2026-01-26

### Fixed
- Resilience for `null` or missing profile fields in `TerminalView`.
- Table consistency for `created_at` and `updated_at` in audit tables.

---

## [v5.4.0] - MOBILE-FIRST - 2026-01-25

### Added
- Rediseño de TPV con carrito tipo Drawer para operativa móvil.
- Implementación de ActionMenu con posición inferior (Thumb Zone).
- Micro-guía interactiva de operativa móvil en sección de Ayuda.

### Changed
- Unificación de vistas de Inventario con ProductCard atómica.
- Nuevo Selector de Tienda Activa en cabecera multi-sucursal.
