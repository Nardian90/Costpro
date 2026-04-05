# Mapeo de Acciones CostPro IPV v6.0

Este documento detalla la reorganización de las acciones en el módulo de Costos según el estándar IPV v6.0.

## 1. Acceso Rápido (Quick Section)
Acciones destacadas en la parte superior para acceso inmediato sin colapsar secciones.

| Acción Original | Nueva Ubicación | Grupo / UI | Color |
|-----------------|-----------------|------------|-------|
| Tablero | Acceso Rápido | Navegar (Dropdown) | 🟢 Verde (Success) |
| Encabezado | Acceso Rápido | Navegar (Dropdown) | 🟢 Verde (Success) |
| Secciones | Acceso Rápido | Navegar (Dropdown) | 🟢 Verde (Success) |
| Anexo | Acceso Rápido | Navegar (Dropdown) | 🟢 Verde (Success) |
| Firmas | Acceso Rápido | Navegar (Dropdown) | 🟢 Verde (Success) |
| Completo | Acceso Rápido | Vistas (Dropdown) | 🟢 Verde (Success) |
| Asistido | Acceso Rápido | Vistas (Dropdown) | 🟢 Verde (Success) |
| Resumido | Acceso Rápido | Vistas (Dropdown) | 🟢 Verde (Success) |
| Vistazo | Acceso Rápido | Vistas (Dropdown) | 🟢 Verde (Success) |
| Audit | Acceso Rápido | Vistas (Dropdown) | 🟢 Verde (Success) |

## 2. Guardado Crítico
| Acción Original | Nueva Ubicación | UI | Color |
|-----------------|-----------------|----|-------|
| Guardar (JSON) | Cabecera del Panel | Botón Fijo (Sticky) | 🟢 Verde (Success) |

## 3. Generación Asistida
| Acción Original | Nueva Ubicación | Color |
|-----------------|-----------------|-------|
| Darian AI | Generación Asistida | 🟡 Amarillo (Warning) |
| Generar Rápida | Generación Asistida | 🟡 Amarillo (Warning) |
| Generar Experta | Generación Asistida | 🟡 Amarillo (Warning) |
| Generación Masiva | Generación Asistida | 🟡 Amarillo (Warning) + ⚠️ Confirmación |

## 4. Operaciones de Datos
| Acción Original | Nueva Ubicación | Color / Notas |
|-----------------|-----------------|---------------|
| Importar JSON | Operaciones de Datos | 🔴 Rojo (Danger) + ⚠️ Confirmación |
| Explorar Plantillas| Operaciones de Datos | ⚪ Esquema (Outline) |
| Cargar Ejemplo | Operaciones de Datos | 🔴 Rojo (Danger) + ⚠️ Confirmación |
| Exportar Excel | Operaciones de Datos | Consolidado en "Exportar Ficha" (Dropdown) + ⚠️ Confirmación |
| Exportar PDF | Operaciones de Datos | Consolidado en "Exportar Ficha" (Dropdown) + ⚠️ Confirmación |

## 5. Herramientas y Soporte
| Acción Original | Nueva Ubicación | Color |
|-----------------|-----------------|-------|
| Calculadora Pro | Herramientas y Soporte | 🔵 Azul (Info) |
| Calculadora Estructura | Herramientas y Soporte | 🔵 Azul (Info) |
| Ayuda de esta vista | Herramientas y Soporte | 🔵 Azul (Info) |
| Ayuda del sistema | Herramientas y Soporte | 🔵 Azul (Info) |
| Academia | Herramientas y Soporte | 🔵 Azul (Info) |

## 6. Sesión
| Acción Original | Nueva Ubicación | Color |
|-----------------|-----------------|-------|
| Cerrar Sesión | Pie del Panel | 🔴 Rojo (Destructive) |

---
*Nota: Se han mantenido todas las funcionalidades originales, optimizando su jerarquía y reduciendo la carga cognitiva mediante la consolidación de dropdowns y el uso de códigos de color.*

## 7. Integración en Menú Lateral (Izquierdo)
Se ha convertido el acceso a "Fichas de Costo" en un submenú desplegable para acceso directo a secciones críticas, alineado con el estándar IPV.

| Ítem en Menú Lateral | Acción / Destino |
|----------------------|------------------|
| **Fichas de Costo** | Submenú Principal |
| ∟ Principal | Vista general de la ficha |
| ∟ Tablero KPI | Sección de indicadores y rentabilidad |
| ∟ Encabezado | Editor de metadatos de la ficha |
| ∟ Secciones | Listado y navegación de secciones (Abre sidebar) |
| ∟ Anexos | Listado y navegación de anexos (Abre sidebar) |
| ∟ Firmas | Sección de firmas y aprobación |

---
*Esta integración permite una navegación bi-direccional fluida entre el panel de acciones derecho y el menú de navegación izquierdo.*
