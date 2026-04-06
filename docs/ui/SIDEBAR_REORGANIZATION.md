# Reorganización del Menú y Modo Focus (v9.1)

Este documento detalla los cambios realizados en la estructura de navegación de CostPro para mejorar el enfoque operativo y reducir la carga cognitiva del usuario.

## 📊 Comparativa: Antes vs Después

| Módulo Original | Nueva Ubicación / Nombre | Estado de Accesos |
| :--- | :--- | :--- |
| **ESTRATÉGICO** | **COSTOS** | ✅ Mantenido (Solo Fichas de Costo) |
| Dashboard KPI | **MULTI-TIENDA** (Ítem Directo) | ✅ Mantenido |
| Pick 3 Intelligence | **OTROS** (Grupo Nuevo) | ✅ Mantenido |
| Billetera Digital | **OTROS** (Grupo Nuevo) | ✅ Mantenido |
| Fichas de Costo | **COSTOS** | ✅ Mantenido |
| **OPERACIONES TIENDA** | **MULTI-TIENDA** | ✅ Mantenido (Renombrado) |
| Punto de Venta | Multi-Tienda > Punto de Venta | ✅ Mantenido |
| Gestión Inventario | Multi-Tienda > Gestión Inventario | ✅ Mantenido |
| Logística | Multi-Tienda > Logística | ✅ Mantenido |
| **IPV BUILDER** | **IPV BUILDER** | ✅ Mantenido (Sin cambios) |
| **CONFIGURACIÓN** | **CONFIGURACIÓN** | ✅ Mantenido (Sin cambios) |
| **MÁS RECURSOS** | **MÁS RECURSOS** | ✅ Mantenido (Sin cambios) |

---

## 🎯 Nuevas Funcionalidades

### 1. Modo Focus
Al hacer clic en cualquier módulo de nivel superior (ej. MULTI-TIENDA), el sistema entra en modo enfocada:
- **Ocultamiento Inteligente**: Se ocultan todos los demás módulos para evitar distracciones.
- **Botón "Atrás"**: Reemplaza temporalmente el logo en la cabecera para maximizar el espacio de navegación. Permite volver al menú global.
- **Breadcrumb Visual**: Indica la ruta actual (INICIO > Módulo Seleccionado) con una animación suave.
- **Animaciones**: Implementación de *fade out* de otros módulos y *zoom in* del seleccionado usando `framer-motion`.

### 2. Atajos de Teclado (Alt + N)
Para acelerar la navegación entre módulos, se han añadido los siguientes atajos globales:
- **Alt + 1**: Entra en modo Focus de **COSTOS**.
- **Alt + 2**: Entra en modo Focus de **MULTI-TIENDA**.
- **Alt + 3**: Entra en modo Focus de **IPV BUILDER**.
- **Alt + 4**: Entra en modo Focus de **OTROS**.
- **Alt + 5**: Entra en modo Focus de **CONFIGURACIÓN**.
- **Alt + 6**: Entra en modo Focus de **MÁS RECURSOS**.
- **ESC**: Sale del modo Focus o cierra el sidebar si está abierto.

---

## 🔒 Garantía de Integridad
Se ha verificado meticulosamente que **ninguna opción de acceso se ha perdido**. Todos los submenús y elementos finales (items) siguen existiendo y son funcionales tanto en la vista normal como en el modo Focus. La búsqueda global (`Ctrl+K` o input de búsqueda) sigue explorando la totalidad de la estructura, independientemente del modo activo.

## 🛠️ Detalles Técnicos
- **Persistencia**: El módulo enfocado se guarda en `localStorage` (`costpro.sidebar.focus`), permitiendo que la vista se mantenga tras recargar la página.
- **Componentes**:
  - `SidebarFocusMode.tsx`: Encapsula la lógica de visualización enfocada.
  - `Sidebar.tsx`: Gestiona el estado global y los atajos de teclado.
- **Build**: Verificado exitosamente con **Turbopack** (`next build`).
