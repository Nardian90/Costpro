# CP-CI-001 — Deuda técnica ESLint (migración incremental + disables muertos)

**Área**: deuda-tecnica · **Prioridad**: P5 · **Estado inicial**: queued · **Archivo de estado**: STATE.json

## Objetivo
Reducir progresivamente la deuda ESLint medida en `ESLINT_BASELINE.json` (baseline 2026-11-21: 0 errores / 1.595 advertencias / 324 archivos) corrigiendo causas comunes de forma estructural, en unidades pequeñas y revisables. NUNCA en un solo ciclo.

## Criterios de entrada
- STATE.json sin lock activo y sin PR del programa pendiente de revisión en zonas que tocarás.
- `bun run lint` ejecutable y `ESLINT_BASELINE.json` presente (saldo antes conocido).
- Unidad definida (abajo) y NO completada en ciclos anteriores.

## Unidades de trabajo (una unidad ≈ un ciclo; cada unidad es independiente)
- **U1 — Disables muertos (24)**: localizar los 24 avisos `Unused eslint-disable directive` (muestras conocidas: `src/__tests__/components/sales-dashboard-tab.test.tsx:315`, `src/__tests__/integration/null-trap-sql-scenarios.test.ts:348`, `src/__tests__/migrations/cp-operational-classification-migration.test.ts:32`, `src/__tests__/navigation/fin-navigation.test.ts:57`, `src/components/payments/PaymentRowsEditor.tsx:152`). Para cada uno: si la regla ya no aplica → eliminar la directiva; si aplica pero fue suprimida a propósito → justificar y reconvertirla en disable con explicación en línea (nunca masivo). Verificar que el archivo compila y sus tests pasan.
- **U2 — Migración en vistas de producción (top-3 del baseline)**: `ProductionOrdersView.tsx` (58), `WorkersView.tsx` (50), `CashReportView.tsx` (46) — sustituir `<button>` crudo por `<Button>` de `@/components/ui/button` donde la semántica coincida (variantes: default/destructive/outline/secondary/ghost/link; tamaños touch-first del sistema). OJO: cada archivo tiene ~50 avisos; trabajar archivo por archivo (3 ciclos si hace falta: U2a/U2b/U2c).
- **U3 — UI compartida**: `src/components/ui/ChatBot.tsx` (29) y siguientes de `topFiles`.
- **U4 — Storefront**: `src/app/tienda/[slug]/StorefrontPage.tsx` (28) y vistas `tienda/`.
- **U5 — Tests**: `<button>` crudo en `src/__tests__/` (muchas instancias de bajo riesgo; evaluar si conviene regla de config que ignore tests o migrar; decisión documentada, sin ocultar con cambios de config global).
- **U6 — Cierre de cola**: re-medir con el comando del baseline y decidir si crear unidades nuevas según lo que quede.

## Límites de alcance (prohibido)
- No modificar `eslint.config.mjs` para ocultar la regla V2.12.25 ni relajar `no-restricted-syntax` (la política anti-fragmentación es del propietario). No `eslint-disable` masivo. No cambiar la configuración global. No tocar lógica financiera: CashReportView contiene reportes de caja — SOLO sustitución de elementos button, sin tocar cálculos ni handlers de negocio; cualquier handler que parezca incorrecto se REPORTA (misión nueva/propuesta), no se "arregla" aquí. No refactorizar comportamiento: el diff debe ser visualmente y funcionalmente neutro (mismos onClick/className migrados a variantes equivalentes).

## Procedimiento
Fases A–H de PROGRAM.md. Por archivo: migrar → `bun run lint --file <archivo>` (saldo del archivo antes/después) → `bun run test` (Vitest) si existe spec del módulo → spec E2E de zona si existe (p. ej. cash-report para CashReportView). Verificación visual E2 (agent-browser) de las vistas migradas en light+dark.

## Pruebas y criterios de aceptación
1. Saldo global NO aumenta; saldo de la unidad disminuye (registrar cifras literales).
2. `bun run test` verde (o igual que antes del ciclo).
3. Verificación E2 de las vistas: aspecto/tamaño/foco equivalentes; teclado y aria intactos (los `<button>` crudos que migran pueden perder clases — conservar accesibilidad).
4. Sin cambios de comportamiento en handlers; sin diffs fuera de los archivos de la unidad.
5. Informe de ciclo con tabla antes/después por archivo y actualización de STATE.json.

## Certificación esperada
APROBADA si saldo baja + tests verdes + E2 sin regresión visual. APROBADA CON OBSERVACIONES si quedan casos ambiguos documentados para la siguiente unidad. BLOQUEADA si el entorno no permite ejecutar lint/tests (no inventar saldos).
