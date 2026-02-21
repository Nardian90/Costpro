# Auditoría de Temas - Costpro

## Estado Actual
El sistema cuenta con 5 configuraciones de tema: `light`, `dark`, `fast-light`, `fast-dark` y `auto`.

### Hallazgos Principales

1. **Inconsistencia en Fast-Dark (Calificación: 4/10)**
   - **Problema:** Los componentes que utilizan variantes de Tailwind `dark:` no se renderizan correctamente cuando el tema `fast-dark` está activo.
   - **Causa:** Tailwind está configurado para detectar la clase `.dark`. `next-themes` aplica la clase `fast-dark` al elemento HTML, lo que provoca que las variantes `dark:` se ignoren, revirtiendo el componente a su estado "light".
   - **Impacto:** Secciones como Telemetría KPI se ven blancas/claras en un entorno supuestamente oscuro.

2. **Colores Inadecuados en Modo Dark (Calificación: 6/10)**
   - **Problema:** Uso de `currentColor` en lugar de `text-primary` en componentes críticos (Estado de Salud, Telemetría).
   - **Impacto:** En modo oscuro, el texto o elementos que deberían ser verde corporativo se muestran blancos, perdiendo la identidad de marca y el contraste semántico.
   - **Ejemplo:** `HealthBattery` y `CostSheetMasterRing` utilizan `dark:text-[currentColor]`.

3. **Uso de Colores Hardcoded (Calificación: 7/10)**
   - **Problema:** Dependencia de `slate-50`, `slate-900`, etc., en lugar de variables semánticas como `bg-background`, `bg-card` o `text-muted-foreground`.
   - **Impacto:** Menor flexibilidad para futuros ajustes de tema y posibles discrepancias visuales en temas "Fast".

## Evaluación Inicial: 6/10
El sistema es funcional y los temas básicos (`light`, `dark`) funcionan bien, pero la optimización de rendimiento (`fast-dark`) está rota visualmente y se ha perdido consistencia en la paleta de colores corporativa en entornos oscuros.

---

## Plan de Optimización
1. **Configuración Global:** Ajustar `tailwind.config.ts` para reconocer tanto `.dark` como `.fast-dark` como disparadores del modo oscuro.
2. **Corrección de Componentes:**
   - Reemplazar `dark:text-[currentColor]` por `text-primary` en `HealthBattery`, `CostSheetMasterRing` y `CostSheetTelemetry`.
   - Asegurar que el "Estado de Salud" use la paleta primaria.
3. **Estandarización de Fondos:** Cambiar backgrounds de `slate-50`/`slate-900` a variables de tema.
