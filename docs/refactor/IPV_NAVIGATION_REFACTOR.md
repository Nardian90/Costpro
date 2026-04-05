# Refactor de Arquitectura de Navegación IPV

## Contexto
El módulo IPV contaba originalmente con una estructura de navegación plana de ~18 ítems, lo que generaba alta carga cognitiva y baja eficiencia operativa. Se ha implementado una nueva jerarquía empresarial organizada en 5 Tiers lógicos.

## Estructura de Navegación (Tiers)

### 1. Reporting (📊 Reportes & Extractos)
Centraliza todas las salidas de datos y consultas de estados bancarios.
- **Dashboard Institucional** (antes: Dashboard)
- **Reportes IPV** (antes: Reportes)
- **Recibos SC-3-01** (Nuevo en Sidebar)
- **Transferencias** (Nuevo en Sidebar)
- **Pagos QR** (Nuevo en Sidebar)
- **Extracto** (antes: Ingestión)
- **Consolidado** (antes: Pivot)

### 2. Operaciones (⚙️ Operaciones)
Accesos frecuentes para el día a día operativo.
- **Panel de Control** (antes: Flujo)
- **Transacciones** (Sin cambios)

### 3. Datos (👥 Catálogos)
Gestión de entidades maestras.
- **Catálogo** (Sin cambios)
- **Clientes** (Sin cambios)

### 4. Procesamiento (🔄 Procesamiento)
Herramientas de automatización y análisis técnico.
- **Reglas** (Sin cambios)
- **Simulación** (Sin cambios)
- **Recepciones Inteligentes** (antes: Recepciones)
- **Desglose** (Sin cambios)

### 5. Avanzado (⚡ Avanzado)
Herramientas de auditoría, soporte y exportación contable.
- **Auditoría** (Sin cambios)
- **Trazabilidad** (antes: Movimientos)
- **Planeación** (Sin cambios)
- **Errores** (Sin cambios)
- **Mapeo** (antes: Mapeo Reglas)
- **Exportación** (antes: Exportación MVT)
- **Transacciones Mipyme** (Nuevo en Sidebar)

## Normalización Semántica

| Término Anterior | Término Nuevo | Justificación |
| --- | --- | --- |
| Flujo | Panel de Control | Mayor claridad operativa. |
| Dashboard | Dashboard Institucional | Diferenciación de otros cuadros de mando. |
| Recepciones | Recepciones Inteligentes | Enfoque funcional sobre el proceso. |
| Movimientos | Trazabilidad | Enfoque en auditoría y seguimiento. |
| Ingestión | Extracto | Lenguaje contable estándar. |

## Mejoras de UX
- **Shortcut Bar**: Acceso directo a Dashboard, Matching, Reglas y Sincronizar desde la parte superior de la vista.
- **Badges Dinámicos**: Indicadores visuales en 'Errores' y 'Extracto' para alertar sobre fallos o acciones pendientes sin navegar.
- **Navegación Remota**: El Sidebar lateral ahora actúa como control directo del `activeTab` del módulo IPV, reduciendo clics innecesarios.

## Validación Técnica
- Todos los IDs internos se mantienen (`analytics`, `reports`, `ingestion`, etc.).
- Compatibilidad total con el sistema de roles.
- Implementación de `useMemo` y `lazy loading` para mantener el rendimiento.
