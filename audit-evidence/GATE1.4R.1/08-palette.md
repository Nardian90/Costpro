# GATE 1.4R.1 — 08 COMMAND PALETTE (mandato §17)

## Arquitectura

La palette (SYSTEM_ACTIONS = vistas de menú + ACTION_EXTENSIONS) soporta VIEW + ACTION +
CONTEXTUAL ACTION desde GATE 1.4R. En GATE 1.4R.1 se amplió el registro:

- `main` (label **"Experto"**) publicado en palette con `palette:true` y keywords
  `experto / tablero principal / trabajo completo / …` — el espacio de trabajo completo
  es descubrible por comando.
- Keywords de `view-assisted` ampliadas con `gráfico / modo gráfico` (§14).
- "Generación Experta" eliminada de TODO label (era la fuente del falso matches con "experto").

## Consultas medidas en browser real (screenshots)

| Query | 1er resultado | Veredicto |
|---|---|---|
| `experto` | **Experto** — "Espacio completo de trabajo de la ficha…" + Fichas de Costo | PASS |
| `json` | **Importar ficha (JSON)** · 2º **Guardar ficha (JSON)** (Usuarios queda 3º por fuzzy de cola, muy por debajo — sin riesgo de falso positivo operativo) | PASS |
| `arena` | **Arena FC** + Fichas de Costo | PASS |
| `asistido` | **Abrir Modo Asistido** — "Modo gráfico: completa la ficha guiado paso a paso" | PASS |
| `informe` | **Informe de la Ficha** (modo del editor) | PASS |
| `generación masiva` | **Generación Masiva** — "Genera fichas en lote desde Excel o el inventario" | PASS |
| `guardar` | **Guardar ficha (JSON)** | PASS |

Screenshots: `browser-palette-{experto,json,arena,asistido,informe,generacion-masiva,guardar}.png`.

## Tests contractuales

`gate1-navigation.test.ts` (GATE 1.4R.1): consultas del §17 mapean al candidato correcto
(`guardar ficha→tool-save`, `importar json→tool-import`, `experto→main`, `arena→arena-fc`,
`asistido→view-assisted`, `informe→view-reading`, `generación masiva→massive-gen`, …)
y cero labels "Generación Experta".
