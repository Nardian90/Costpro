# Auditoría Inicial: Exportación MVT - Módulo IPV

**Fecha:** 2026-03-26
**Autor:** Jules (Ingeniero de Software)
**Evaluación Actual:** 5/10

## Estado Actual de Funcionalidades

| Funcionalidad | Estado | Observaciones |
| :--- | :--- | :--- |
| **Generación de .MVT** | ✅ Funcional | Genera archivos basados en plantillas y transacciones. |
| **Vista Previa** | ✅ Funcional | Muestra el contenido generado en tiempo real. |
| **Edición de Campos** | ⚠️ Parcial | Permite editar key, source y value de campos existentes. |
| **Añadir Campo** | ❌ No implementado | El botón existe pero no tiene funcionalidad. |
| **Reordenar Campos** | ❌ No implementado | No hay controles para mover campos. |
| **Añadir Grupos (Secciones)** | ❌ No implementado | La estructura es fija (Documento, Ubicación, Movimiento). |
| **Reordenar Grupos** | ❌ No implementado | No hay controles para mover secciones completas. |

## Deficiencias Identificadas

1. **Falta de Flexibilidad:** El usuario no puede personalizar el orden de los datos en el archivo final sin modificar el código o editar manualmente el JSON de la plantilla (si tuviera acceso).
2. **Interfaz Estática:** La configuración de la estructura es rígida y no permite adaptarse a variaciones en los requisitos de sistemas ERP externos (Versat, etc.).
3. **Ausencia de Validación:** Al no haber un diálogo de configuración para nuevos campos, se corre el riesgo de introducir datos inconsistentes.

## Objetivos de la Mejora

- Implementar Drag & Drop para campos y secciones.
- Añadir botones de posicionamiento rápido (Primero, Último, Subir, Bajar).
- Crear diálogos de configuración para nuevos campos y grupos.
- Garantizar que la flexibilidad sea del 100% permitiendo cualquier estructura compatible con MVT.
