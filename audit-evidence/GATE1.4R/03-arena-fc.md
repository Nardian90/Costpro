# GATE 1.4R — 03 ARENA FC (remediación P0 UX-001)

Fecha: 2026-09-22 · Objetivo del mandato §6: crear UN único camino visible y semántico `Fichas de Costo → Arena FC`, reutilizando ArenaFC existente (prohibido: ArenaFC2, nuevo motor, nuevo route, nuevo cálculo).

## Implementación

1. **Tarjeta en el módulo** (`GenEasyView.tsx`): botón full-width "Arena FC · Beta — ¿Ya tienes fichas? Compara dos fichas de costo lado a lado" con icono Swords, aria-label descriptivo, min-height táctil 56px. `onClick → setActiveCostSection('arena-fc')` — el mismo mecanismo de estado que ya renderizaba `<ArenaFC />` en CostSheetView. **0 componentes nuevos del dominio; 0 duplicación.**
2. **Palette**: entrada `arena-fc` en ACTION_EXTENSIONS (via registro COST_SHEETS_TABS) con ruta module-route `{view: cost-sheets, tab: arena-fc}` y keywords arena/comparar/comparación/versus/vs/duelo/fichas.
3. **Breadcrumb**: leaf "Arena FC" colgando del path del módulo (fuente: COST_SHEETS_TABS).
4. **Roles**: heredados del dominio Costo `['admin','manager','encargado','costo']` — sin cambios de permisos.

## Validación en browser real (checklist §6 completa)

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Entrar a Fichas de Costo | ✅ menú → gen-easy | screenshot browser-gen-easy-1440-with-arena-card.png |
| 2 | Localizar Arena FC | ✅ tarjeta visible arriba del contenido, con badge Beta | ídem |
| 3 | Abrirla | ✅ click → tab arena-fc | URL `?view=cost-sheets&tab=arena-fc` |
| 4 | Render | ✅ H1 "ARENA FC", buscador "Buscar ficha de costo...", fichas listadas (TODOS 18) | screenshot browser-arena-fc-1440.png |
| 5 | Breadcrumb | ✅ `Inicio > OPERACIÓN > Costo > Fichas de Costo > Arena FC` — SIN "Módulo No Disponible" | snapshot accesorio |
| 6 | Volver | ✅ breadcrumb "Costo" → SectionHub de Costo (contexto preservado); "Fichas de Costo" mantiene el tab actual (semántica pre-existente de vistas-módulo) | — |
| 7 | Contexto Costo | ✅ header "Fichas de Costo", sidebar en OPERACIÓN; sin pérdida de contexto | — |
| 8 | Permisos | ✅ roles del dominio Costo; clerk no ve la entrada de palette (test) | gate1-navigation.test.ts |
| 9 | Deep-link | ✅ `/?view=cost-sheets&tab=arena-fc` directo renderiza | — |
| 10 | Refresh | ✅ reload mantiene Arena FC con breadcrumb correcto | screenshot browser-arena-fc-refresh.png |

## Palette (resultado real medido)

- Query "arena" → **1er hit: "Arena FC — Compara fichas de costo lado a lado… (beta)"** (antes aterrizaba en gen-easy = falsa pista).
- Selección con Enter desde palette → navega y renderiza Arena FC (verificado).

## Nota móvil (honesta)

En 390px la tarjeta es visible y funcional, PERO el drawer lateral auto-abierto (UX-007c, defecto pre-existente documentado en GATE 1.4 — alcance Fase E) la ocluye hasta cerrar el drawer. No es regresión de esta remediación; quedó documentada como deuda móvil.

## Resultado

**Arena FC deja de ser ORPHAN (P0 cerrado).** Camino único: módulo → tarjeta (+ palette + breadcrumb). Sin segunda implementación.
