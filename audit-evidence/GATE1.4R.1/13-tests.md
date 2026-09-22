# GATE 1.4R.1 — 13 TESTS (mandato §28)

## Resultados exactos (al cierre, después de TODOS los cambios)

| Suite | Resultado |
|---|---|
| `bunx vitest run` (COMPLETA) | **2175 passed · 0 failed · 24 skipped** (103 files: 102 passed, 1 skipped) |
| `src/__tests__/navigation/gate1-navigation.test.ts` | **75 passed** (incluye 5 describe nuevos de GATE 1.4R.1) |
| `src/__tests__/navigation/` (3 files) | 105 passed |
| `src/__tests__/components/c-cost-module.test.tsx` | 7 passed (actualizado al nuevo contrato móvil §25) |
| `src/__tests__/components/g2-cost-functional.test.tsx` | 10 passed (actualizado al nuevo contrato móvil §25) |
| `bunx tsc --noEmit` | **CLEAN** (0 errores) |
| `bunx eslint <archivos modificados>` | **0 errores**, 17 warnings advisory (clase V2.12.25 design-system, pre-existente) |
| `bun run build` (next build) | **NO EJECUTABLE EN ESTE HOST** — ver nota |

## Tests nuevos GATE 1.4R.1 (no se eliminó ni debilitó ninguno)

1. **Experto**: tab `main` con label "Experto", `palette:true`, keywords; route `main` → module-route; alias `cost-sheet-editor → main`.
2. **Generación Masiva**: cero labels "Generación Experta" en menú/palette/registro; `massive-gen` etiquetado y resoluble.
3. **Palette §17**: consultas del mandato → candidato correcto (9 asserts de mapping).
4. **Breadcrumbs §23**: Experto / Generación Masiva / Análisis de Fichas / Arena FC.
5. **Mapeo compartido**: `moduleTabForCostSection` agrupa el scope de ficha bajo Experto y
   mapea las 5 tabs (desktop y móvil usan la MISMA función).

## Tests ACTUALIZADOS por cambio de contrato (especificación nueva, no debilitamiento)

- `gate1-navigation.test.ts` — route del menú `cost-sheets` ahora `tab:'main'` (mandato §4).
- `c-cost-module.test.tsx` / `g2-cost-functional.test.tsx` — tabs móviles = tabs del módulo
  (Generar/Experto/Masiva/Análisis/Arena) según mandato §25.

## Nota sobre `next build` (misma limitación que GATE 1.4R)

`next build` recibe SIGKILL (OOM) en este host de 4GB sin swap — ocurrió con el dev server
parado y con ambos motores (Turbopack y webpack), memoria host al 87% durante el intento.
Es una **limitación de entorno, no del código**: el equivalente de compilación queda cubierto por
(a) `tsc --noEmit` limpio sobre TODO el proyecto, (b) la suite vitest completa (2175 tests que
compilan/importan los módulos), (c) la compilación runtime del dev server sirviendo TODAS las
vistas modificadas, verificada por navegador real en 5 viewports (11-browser.md). En GATE 1.4R
se documentó la misma condición (11-tests.md, fila "build").
