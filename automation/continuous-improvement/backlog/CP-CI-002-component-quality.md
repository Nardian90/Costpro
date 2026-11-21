# CP-CI-002 — Calidad de componentes reutilizables

**Área**: componentes · **Prioridad**: P5 · **Estado inicial**: queued

## Objetivo
Evaluar la calidad real de los componentes reutilizables de `src/components/ui/` (103 archivos) y resolver duplicidades y defectos con justificación medible, respetando el design system y las responsabilidades funcionales.

## Criterios de entrada
- STATE.json sin lock; design system leído (`skills/costpro-product-quality/references/costpro-design-system.md`).
- Unidad elegida de la lista de vigilancia (abajo) y no completada antes.

## Unidades (candidatas concretas del baseline — no genéricas)
- **U1 — Doble ViewSwitcher**: `ui/ViewSwitcher.tsx` (radiogroup) vs variante icon-only `atomic/` (`aria-pressed`). Determinar consumidores reales (grep), unificar hacia el canónico si las responsabilidades coinciden; si difieren, DOCUMENTAR la coexistencia en el design system (resultado válido de la misión).
- **U2 — Botones paralelos en `atomic/`**: `PrimaryButton`/`SecondaryButton` raw sin cva; `IconButton` variante 'primary' usa `text-foreground` (contraste débil sobre bg-primary; FIX-A11Y-CONTRAST previo solo cubrió `PrimaryButton`). Migrar consumidores a `ui/button.tsx` o completar la corrección de contraste con tokens validados AA.
- **U3 — Componentes de un solo uso en `ui/`**: grep de consumidores; los con 1 uso real y sin rol transversal → proponer traslado a su vista (no mover sin verificar imports/alias y lazy chunks).
- **U4 — Auditoría de estados**: componentes de datos sin estados loading/empty/error coherentes con `StateRenderer` (mapear cobertura, priorizar los usados por ≥3 vistas).

## Límites de alcance
No refactorizar componentes estables sin justificación medible (usos, bugs, deuda de accesibilidad). No fusionar `ResponsiveTable` con `ElderlyTable` (responsabilidades funcionales distintas — decisión documentada del design system). No cambiar props públicas sin migrar TODOS los consumidores. No tocar `ui/button.tsx` más allá de lo necesario (es la base de todo).

## Procedimiento
Fases A–H. Por unidad: mapa de consumidores (grep) → decisión de consolidación (con design system de referencia) → migración → `bun run lint` saldo → `bun run test` → specs E2E de las vistas consumidoras si existen → verificación E2 visual light+dark.

## Pruebas y criterios de aceptación
1. Cero consumidores rotos (grep post-cambio = 0 referencias al componente migrado-out).
2. Lint/tests/E2 equivalentes o mejores; contraste AA verificado en cambios visuales (tokens, no hex).
3. Los componentes de `ui/` siguen sin lógica de negocio (revisión con costpro-code-reviewer).
4. Informe con mapa antes/después de consumidores y decisión de consolidación justificada.

## Certificación esperada
APROBADA / APROBADA CON OBSERVACIONES / BLOQUEADA según evidencias. RECHAZADA si la unidad se demuestra innecesaria (p. ej. coexistencia justificada) — se registra en STATE.json con esa nota.
