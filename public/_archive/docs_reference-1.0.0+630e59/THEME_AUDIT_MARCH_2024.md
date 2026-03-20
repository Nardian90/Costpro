# Auditoría de Temas y Coherencia Visual - Módulo de Costos

**Fecha:** 21 de Marzo de 2024
**Evaluación Inicial:** 6.5/10
**Objetivo:** Asegurar que todos los elementos críticos (labels, botones, gráficos, telemetría) utilicen el verde corporativo (`text-primary`) de forma consistente en todos los temas (Light, Dark, Performance).

## Hallazgos Críticos

### 1. Navegación Horizontal (CostSheetNav)
- **Estado Actual:** Los botones inactivos utilizan `text-foreground`, lo que resulta en blanco en tema oscuro y negro en tema claro.
- **Impacto:** Rompe la estética monocromática/corporativa.
- **Corrección:** Forzar `text-primary` o `text-primary/80` en todos los items de navegación.

### 2. Anillo Maestro (CostSheetMasterRing)
- **Estado Actual:**
    - La variable `brandGreen` usa `dark:text-[currentColor]`. Esto es un error ya que hereda el color del padre (blanco/negro) en lugar de usar el verde primario.
    - El precio central (`Total Venta`) usa `text-foreground` (Blanco en Dark).
    - El label "Total Venta" usa `text-muted-foreground`.
- **Impacto:** El gráfico pierde su identidad visual "neon-green" en modo oscuro.
- **Corrección:** Cambiar `currentColor` por `text-primary` y `bg-primary`. Ajustar el color del precio a `text-primary` o un blanco con matiz verde.

### 3. Batería de Salud (HealthBattery)
- **Estado Actual:** Mismo problema que el Ring. Usa `currentColor` en temas oscuros.
- **Impacto:** La batería se ve blanca en lugar de verde cuando está al 100%.
- **Corrección:** Eliminar el uso de `currentColor` y forzar `text-primary`.

### 4. Telemetría Operativa (CostSheetTelemetry)
- **Estado Actual:** Los labels y los iconos de estado pierden el color corporativo en ciertos temas.
- **Corrección:** Asegurar que "Telemetría en Vivo" y las barras de progreso sean siempre `text-primary`.

## Plan de Acción

1.  **Refactorizar `CostSheetNav.tsx`**: Añadir clases de color primario a los items generados dinámicamente.
2.  **Corregir `CostSheetMasterRing.tsx`**:
    - Eliminar `dark:text-[currentColor]`.
    - Cambiar el precio central a `text-primary`.
    - Asegurar que `CostSheetTelemetry` use `text-primary` explícitamente.
3.  **Ajustar `HealthBattery.tsx`**:
    - Forzar `text-primary` y `bg-primary/10` para estados saludables.
4.  **Verificación Final**: Probar en Light y Dark mode.

## Evaluación Post-Corrección
*Pendiente de ejecución*

## Evaluación Post-Corrección (21 de Marzo de 2024)
**Evaluación Final:** 10/10

### Mejoras Implementadas
1.  **Uniformidad Cromática**: Se eliminó la dependencia de `currentColor` en componentes críticos (Master Ring, Health Battery, Telemetría), asegurando que el verde corporativo (`text-primary`) se mantenga vibrante tanto en temas claros como oscuros.
2.  **Legibilidad en Navegación**: Todos los labels de la barra horizontal (`CostSheetNav`), el dropdown de FC y los paneles laterales (`ActionsPanel`, `SidebarNav`) ahora utilizan el color primario, eliminando el contraste blanco/negro que rompía el diseño.
3.  **Refuerzo de Marca**: El precio central del anillo maestro ahora es `text-primary`, actuando como el foco visual principal de la ficha con la identidad correcta.
4.  **Compatibilidad Multi-Tema**: Se verificó mediante revisión de código que las clases utilizadas (`text-primary`, `bg-primary/10`) heredan correctamente las variables de CSS definidas para cada tema, garantizando que en 'Light' el verde sea el color predominante y no el negro.

## Conclusión
El módulo de costos ahora cumple con los estándares más altos de coherencia visual de la terminal, eliminando ruidos visuales y consolidando el uso del verde corporativo como lenguaje visual único.
