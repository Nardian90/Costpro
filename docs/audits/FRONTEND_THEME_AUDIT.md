# Auditoría de Sistema de Diseño y Paleta de Colores - CostPro

## 1. Estado Actual (Legacy Indigo/Blue)

Actualmente, la aplicación utiliza una paleta basada en **Indigo (Indigo 500/600)** para los elementos primarios y varios tonos de **Blue** para elementos informativos, botones secundarios y diagramas de ayuda. Esto crea una inconsistencia visual con el logo de la marca, que es predominantemente verde.

### Colores Identificados (Actual):
- **Primary:** `#6366f1` (Indigo 500)
- **Primary Dark:** `#818cf8` (Indigo 400)
- **Informational/Sales:** Hardcoded `blue-500`, `blue-600`
- **Success:** `#10b981` (Emerald 500) - *Irónicamente el color de éxito ya coincide con la marca, pero no se usa como primario.*

### Inconsistencias:
- Los botones principales son azules/índigo mientras que el logo es verde.
- Los diagramas de ayuda usan azul para representar flujos que deberían ser coherentes con la identidad visual.
- La "acción principal" (Primary) compite visualmente con el color de "éxito" (Success).

---

## 2. Propuesta "God Level" (Green Enterprise Optimization)

Para elevar la aplicación a un estándar internacional y coherencia total con la marca, se propone una transición hacia una paleta **Emerald/Green** premium.

### Paleta de Marca (Extraída del Logo):
- **Start Gradient:** `#22c55e` (Green 500)
- **End Gradient:** `#10b981` (Emerald 500)

### Nueva Estructura de Tokens (CSS Variables):

| Token | Light Mode | Dark Mode | Propósito |
|-------|------------|-----------|-----------|
| `--primary` | `#16a34a` (Green 600) | `#22c55e` (Green 500) | Color de marca principal |
| `--primary-light` | `#22c55e` | `#4ade80` | Hover y degradados |
| `--primary-dark` | `#15803d` | `#16a34a` | Estados activos |
| `--accent` | `#f0fdf4` | `#064e3b` | Fondos sutiles |
| `--ring` | `rgba(22, 163, 74, 0.5)` | `rgba(34, 197, 94, 0.5)` | Focus rings |

### Estrategia de Success vs Primary:
Para evitar confusión entre el color de la marca (Verde) y el estado de éxito (Verde), utilizaremos:
- **Primary:** Green 600/500 (Tono más corporativo/profesional).
- **Success:** Emerald 500 (Tono más vibrante, asociado a validación).
- **Secondary:** Slate/Zinc (Neutrales para equilibrio).

---

## 3. Plan de Acción de Implementación

1. **Refactorización de `globals.css`**: Actualizar las variables `:root` y `.dark` con la nueva paleta.
2. **Actualización de Botones Neumórficos**: El `neu-btn-primary` ahora usará el gradiente exacto del logo para un acabado premium.
3. **Limpieza de Hardcoded Blues**:
   - Reemplazar `blue-500` por `emerald-600` o `green-600` en diagramas.
   - Reemplazar `blue-600` por `green-700` en textos informativos de ventas.
4. **Optimización de Sombras Neumórficas**: Ajustar los tintes de las sombras para que tengan una ligera temperatura basada en el nuevo color de fondo (más neutro/limpio).

---

## 4. Estándares Internacionales Cumplidos
- **Accesibilidad (WCAG 2.1)**: Asegurar contraste de al menos 4.5:1 en todos los botones primarios.
- **Psicología del Color**: El verde transmite crecimiento, estabilidad y éxito financiero (ideal para una herramienta de costos).
- **Coherencia de Marca**: Alineación 1:1 con el logo vectorial existente.
