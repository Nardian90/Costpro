# CP-CI-006 — Calidad de interacción

**Área**: interaccion · **Prioridad**: P3 · **Estado inicial**: queued

## Objetivo
Eliminar interacciones confusas o inconsistentes: feedback de acciones, estados de carga/vacío/error, confirmaciones, animaciones, transiciones, persistencia de estado y comportamiento de formularios.

## Criterios de entrada
- STATE.json sin lock; skills leídas (product-quality §7 estados y feedback; frontend-engineering arquitectura).
- Unidad = módulo o patrón concreto con hallazgo verificado en navegador.

## Unidades (candidatas del baseline)
- **U1 — Cobertura de estados con StateRenderer**: solo 22/57 vistas lo usan. Elegir módulo (p. ej. inventario o cuentas por cobrar/pagar): auditar sus vistas en navegador (loading real con throttling, vacío, error forzado) y migrar las deficientes a `StateRenderer`/`Skeleton`/`ViewLoadingSplash` según el caso canónico.
- **U2 — Confirmaciones destructivas**: grep de `confirm(` nativo o `window.confirm` → migrar a `DestructiveConfirmModal` (escribir el nombre). Cero nativo al terminar la unidad.
- **U3 — Feedback de acciones**: botones sin estado de submitting (spinner/disabled durante), toasts sonner ausentes tras operaciones exitosas, dobles submits posibles.
- **U4 — Animaciones/transiciones coherentes**: respetar `--duration-*` y `--ease-spring`, Framer Motion solo transform/opacity, `prefers-reduced-motion` verificado en `.mode-performance` (E2 real, no teoría).

## Límites de alcance
No rediseñar flujos de negocio: mejorar la calidad de la interacción existente. Persistencia de estado de UI via Zustand `useUIStore` (no localStorage directo). No tocar cálculos ni handlers financieros (reportarlos si se detectan sospechosos).

## Procedimiento
Fases A–H. Auditoría E2 del módulo (estados reales provocados: throttling de red, respuestas vacías, error de red simulado) → inventario → corrección → `bun run lint` + `bun run test` + specs de zona (p. ej. `inventory.spec.ts`, `pos-offline.spec.ts` si aplica) → re-verificación E2 de los estados (antes/después con capturas etiquetadas).

## Pruebas y criterios de aceptación
1. Las vistas de la unidad muestran los 4 estados canónicos (cargando/vacío/error/datos) verificados EN navegador (E2).
2. Cero `confirm()` nativo en la unidad; destructivas via `DestructiveConfirmModal`.
3. Ninguna acción lenta sin feedback (spinner/disabled) verificada con red throttled.
4. Sin regresión de specs de zona; informe con evidencias.

## Certificación esperada
APROBADA / APROBADA CON OBSERVACIONES / BLOQUEADA según evidencias de ejecución.
