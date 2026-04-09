# 🎯 Auditoría Técnica: Módulo de Gastos Indirectos (Ficha de Costo)

**Fecha:** 24 de Mayo de 2024
**Auditor:** Jules (Senior Software Engineer)
**Estado:** Crítico / Requiere Refactorización

---

## 1. Diagnóstico Técnico

### ❌ Causa Raíz de los Fallos
1. **Hardcoding de Estructura (UI Decoupled):** En `CostSheetSummary.tsx`, la selección de secciones está limitada manualmente a los IDs `['3', '4', '5', '6']`. Esto impide que el usuario "agregue" secciones afectadas si estas caen fuera de ese rango arbitrario.
2. **Base de Cálculo Inflexible:** El auto-cálculo del coeficiente está anclado a la Sección 2 (Salarios) sin posibilidad de cambio por el usuario en la interfaz.
3. **Falta de Feedback Visual:** El usuario activa configuraciones en el Dashboard que afectan la lógica de cálculo en la `InteractiveTable`, pero no hay ninguna indicación visual (badges, iconos) en la tabla principal que advierta sobre este impacto.
4. **Acoplamiento en el Hook de Cálculo:** El hook `useCostSheetCalculator.ts` intercepta las filas y altera sus fórmulas basándose en el `indirectConfig`. Aunque funcional, esta lógica es opaca para el usuario final.

---

## 2. Evaluación General
**Calificación: 4 / 10**

**Justificación:**
El módulo presenta una "ilusión de funcionalidad". Permite mover sliders y marcar checkboxes, pero la rigidez del código subyacente (IDs fijos) rompe la promesa de flexibilidad del sistema. La persistencia existe en el store, pero la UI está desconectada de la realidad del modelo de datos dinámico que el motor de costos (`cost-engine`) es capaz de procesar.

---

## 3. Análisis de Flujo

### 🟢 Flujo Esperado
1. El usuario entra al Dashboard → Gastos Indirectos.
2. Selecciona **cualquier** sección de la ficha (1-12).
3. Configura el modo (Coeficiente vs Monto Fijo).
4. El sistema persiste el `indirectConfig`.
5. El motor de cálculo detecta la configuración y aplica el ajuste.
6. La tabla principal muestra badges de "Ajuste Indirecto Aplicado".

### 🔴 Flujo Actual
1. El usuario entra al Dashboard.
2. Solo puede ver/marcar secciones 3 a 6.
3. El coeficiente solo se aplica multiplicando sobre la fórmula base.
4. No hay feedback en la tabla principal.
5. El auto-cálculo solo funciona contra la sección 2.

**Punto de Ruptura:** La validación `.filter(s => ['3', '4', '5', '6'].includes(s.id))` en el renderizado de la UI.

---

## 4. Diseño del Problema & Propuesta de Estructura

La interfaz `IndirectConfig` actual es insuficiente.

**Estructura Propuesta:**
```ts
export interface IndirectConfig {
  mode: 'coefficient' | 'fixed'; // Nuevo: Soporte para montos fijos
  selectedSections: string[];    // IDs de secciones (dinámico)
  baseSectionId: string;         // ID de la sección base para auto-cálculo
  coefficient: number;           // Valor del multiplicador
  fixedAmount?: number;          // Para Modo B
  isSimulation?: boolean;
}
```

---

## 5. Propuesta de Solución

1. **Refactor de UI (Stabilization):** Eliminar el filtro de IDs en `CostSheetSummary.tsx` y mapear todas las secciones disponibles en `data.sections`.
2. **Inyección de Metadatos en el Hook:** Actualizar `useCostSheetCalculator.ts` para que, además de aplicar el cálculo, inyecte un flag en los metadatos de la fila (`isIndirectAffected: true`).
3. **Componente de Visualización:** Modificar `CostSheetRow` dentro de la tabla para renderizar un Badge o Icono de "Indirecto" cuando detecte el flag en los metadatos.

---

## 6. Plan de Mejora por Fases

### Fase 1: Estabilización (Bug Fixing)
- Eliminar IDs hardcodeados (`3, 4, 5, 6`).
- Permitir multi-select dinámico de secciones.
- Corregir el guardado en el store para asegurar persistencia.

### Fase 2: Modelo de Datos
- Expandir `IndirectConfig` para incluir `baseSectionId`.
- Implementar toggle de "Modo de Operación" (Coeficiente vs Fijo).

### Fase 3: Persistencia & Integración
- Asegurar que el motor de cálculo (`calculateFicha`) reciba la configuración extendida.
- Refactorizar el mapping en el hook para soportar los nuevos modos.

### Fase 4: Reactividad & Feedback
- Implementar indicadores visuales en `CostSheetInteractiveTable`.
- Sincronizar cambios del simulador con los KPIs del Dashboard en tiempo real.

### Fase 5: UX / Robustez
- Añadir tooltips detallados que expliquen la fórmula resultante (ej: "Original * 1.15").
- Validaciones para evitar referencias circulares si se selecciona la sección base como afectada.
