# DARK PERFORMANCE MONOCHROME — 03 Métrica objetiva (GATE 14)

Método: evaluación JS en navegador real (Chromium vía agent-browser) sobre la
app corriendo en local. Se cuentan **fuentes de verde renderizado** (computed
styles: color/background/border, alfa ≥ 0.06, verde = g>r+20 ∧ g>b+20 ∧ g>40),
excluyendo valores heredados (elemento cuyo valor es idéntico al del padre no
es fuente). `scripts/green-metric.js`. Superficies @1280×800, modo forzado a
Dark+Performance para la medición (harness; la clase raíz es la misma).

## Fuentes de verde renderizado — Dark + Performance

| Superficie | BEFORE total | BEFORE decorativo | AFTER total | AFTER decorativo | Semánticos AFTER (permitidos) |
|---|---|---|---|---|---|
| Dashboard | 33 | 32 | **0** | **0** | 0 |
| Vender (POS) | 129 | 75 | **53** | **0** | 53 (success: stock/turno) |
| Ventas | 15 | 13 | **1** | **0** | 1 (success) |
| Inventario | 99 | 59 | **39** | **0** | 39 (success: acciones stock OK) |
| Reportes | 18 | 16 | **1** | **0** | 1 (success) |
| Ajustes | 33 | 28 | **4** | **0** | 4 (success) |
| **TOTAL** | **327** | **223** | **98** | **0** | 98 |

Nota: en la métrica cruda (sin filtro de herencia) el BEFORE arrojaba
184/189/66/347/85/130 = 901 y el AFTER 0/56/1/147/5/5; ambos conjuntos se
incluyen para trazabilidad en shots/metrics-raw.md.

## Resultado GATE 14

> **Cero verde decorativo en Dark + Performance** en las 6 superficies
> certificadas. Los 98 verdes residuales son 100 % semánticos (`--success`
> vía utilidades `text-success`/`bg-success/*` — estados de stock, turnos y
> confirmaciones, con icono+texto que garantiza comprensión sin color).
> Uso fuente: `grep` de clases — las utilidades `text-success` NO son
> green-*/emerald-*/lime-* (barrido no las toca por diseño, GATE 3).

## Métrica fuente (estática)

- Clases verdes crudas neutralizadas por el barrido: ~130 familias
  (green/emerald/lime × text/bg/border/from/to/via/shadow/ring/fill/stroke/
  decoration/divide/accent + arbitrarias `[#22c55e]` etc.).
- Tokens verdes redefinidos: 17 (ver 02-arquitectura-y-paleta).
- Presentation attributes SVG barridas: fill/stroke/stop-color para
  #22c55e/#16a34a/#4ade80/#34d399 (+ #39ff14 fill/stroke del isotipo).
- Exclusiones intencionales: `#15803d` (funcional), semánticos, no-verdes.
