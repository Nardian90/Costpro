# Análisis del bug de estado introducido alrededor del PR #1214 (módulo Cost Sheet)

## Resumen ejecutivo
Se detectaron **dos regresiones** que explican por qué desde versiones posteriores a `#1213` se rompe la carga/edición de fórmulas y valores fijos en la columna **Total**.

1. **Corrupción cruzada entre secciones en modo experto consolidado**: al renderizar cada acordeón con `sections={[section]}`, los componentes hijos reindexan esa sección como `sectionIndex=0`, pero escriben en rutas globales del store (`['sections', sectionIndex, ...]`). Resultado: ediciones en secciones distintas a la primera pueden terminar en `data.sections[0]`.
2. **Persistencia en campo transitorio en edición de Total**: al guardar Total no-fórmula se escribía en `row.total` y se limpiaban fórmulas, pero el motor/cálculo consume campos modelados (`value` / `valorHistorico`) para recomputar. Resultado: el número ingresado no impacta correctamente cálculos posteriores.

Además, se detectó clasificación débil de fórmulas: entradas válidas sin `=` (p. ej. `ref('1')`, `AnexoI(...)`) podían caer en rama numérica.

## Causa raíz técnica

### 1) Índices de sección desalineados
- `CostSheetView` renderiza por sección individual en acordeones y pasa `sections={[section]}`.
- `CostSheetCardView` y `CostSheetInteractiveTable` recorren `sections.map((section, sectionIndex) => ...)` y escriben rutas basadas en `sectionIndex`.
- Al ser un arreglo singleton, `sectionIndex` vale siempre `0`, aunque visualmente estés editando sección 2, 3, etc.

**Impacto**: mutaciones en label, rows, add row, etc. pueden sobreescribir la sección equivocada (normalmente la primera).

### 2) Guardado de Total en campo no-canónico para cálculo
- En `handleTotalSave` (ruta no fórmula), se hacía:
  - limpiar `formula/totalFormula`
  - `updateValue(..., 'total', parseFloat(...))`
- Esto persiste un valor “resultado” en vez de alimentar los insumos del motor.

**Impacto**: el cálculo reactivo puede ignorar ese valor en siguientes recomputos o inconsistirse con escenario/modelado.

## Cambios aplicados

1. **Indexación correcta por sección real**
   - Se añadió `baseSectionIndex` en `CostSheetCardView` y `CostSheetInteractiveTable`.
   - `CostSheetView` ahora pasa `baseSectionIndex={sectionIndex}` al renderizar acordeones singleton.
   - Los paths de escritura ahora usan `actualSectionIndex = baseSectionIndex + sectionIndex`.

2. **Guardado de Total no-fórmula en campos modelados**
   - En ambas vistas (tabla y tarjeta), `handleTotalSave` no-fórmula ahora:
     - limpia `formula` y `totalFormula`
     - limpia `vhFormula`
     - escribe el valor parseado en `value` y `valorHistorico`
     - mantiene `total` sincronizado para continuidad de UX.

3. **Detección más robusta de fórmula**
   - Se considera fórmula si:
     - empieza con `=` o
     - parece llamada de función (`/[A-Za-z_]+\s*\(/`), cubriendo casos como `ref(...)`, `vh(...)`, etc.

## Prompt detallado para otra IA (copiar/pegar)

```txt
Contexto:
- Repo: Costpro
- Problema observado: después del PR #1214 se rompe el flujo al editar/cargar fórmulas o valores fijos en columna Total dentro de Cost Sheet.
- En la versión #1213 esto funcionaba correctamente.

Objetivo:
1) Corregir corrupción cruzada de estado entre secciones en modo experto consolidado.
2) Corregir persistencia de edición manual de Total para que impacte el motor de cálculo.
3) Evitar que fórmulas válidas sin prefijo '=' se traten como números.

Archivos clave:
- src/components/views/terminal/views/cost_sheet/CostSheetView.tsx
- src/components/views/terminal/views/cost_sheet/CostSheetInteractiveTable.tsx
- src/components/views/terminal/views/cost_sheet/CostSheetCardView.tsx

Diagnóstico esperado:
A) Bug de índice de sección
- CostSheetView renderiza cada acordeón con sections={[section]}.
- Hijos reindexan a sectionIndex=0 y escriben rutas de store con ['sections', sectionIndex, ...].
- Esto termina mutando data.sections[0] al editar otras secciones.

B) Bug de guardado de total fijo
- En handleTotalSave, rama no fórmula, se guardaba en row.total y se limpiaban fórmulas.
- El motor usa value/valorHistorico (campos modelados), no total transitorio, para recálculo consistente.
- Por eso los cambios manuales de Total no se reflejan bien al recalcular.

C) Clasificación de fórmula insuficiente
- Inputs tipo ref('1') o funciones sin '=' caen en rama numérica, borran fórmula y terminan en 0 en muchos casos.

Implementación requerida:
1) Añadir prop opcional baseSectionIndex a CostSheetCardView y CostSheetInteractiveTable.
2) En CostSheetView, al mapear secciones en acordeones, pasar baseSectionIndex={sectionIndex}.
3) En hijos, usar actualSectionIndex = baseSectionIndex + sectionIndex para TODOS los paths updateValue/addMainRow/remove/etc.
4) En handleTotalSave (tabla y tarjeta):
   - detectar fórmula con:
     - trimmed.startsWith('=') OR regex de función (ej: /[A-Za-z_]+\s*\()/
   - si es fórmula: set formula + totalFormula
   - si NO es fórmula:
     - limpiar formula + totalFormula (+ vhFormula si aplica)
     - parsear número
     - guardar en value y valorHistorico
     - opcionalmente mantener total sincronizado para display inmediato
5) No romper UX existente del editor de fórmulas ni sugerencias.

Validación mínima:
- En modo experto consolidado, editar sección 2/3 no debe alterar sección 1.
- Editar Total con número fijo debe reflejarse en cálculos posteriores.
- Ingresar ref('1') sin '=' debe persistirse como fórmula, no como 0 numérico.

Salida esperada:
- Patch en los 3 archivos indicados.
- Resumen técnico corto de causa raíz y cómo se mitigó.
```
