# Métricas crudas (sin filtro de herencia) — trazabilidad

Contexto: primera pasada de métrica (green-metric v1) contaba TODOS los
elementos con verde computado, incluidos los que heredan color de un padre
(p.ej. iconos SVG dentro de un botón `text-success`). Se añadió el filtro de
herencia para la métrica oficial (03-metrica-gate14.md). Ambas pasadas se
registran por trazabilidad.

## Dark + Performance — BEFORE (stash del cambio)

| Vista | v1 total | v1 decorativo | v2 fuentes | v2 decorativo |
|---|---|---|---|---|
| dashboard | 184 | 183 | 33 | 32 |
| pos | 189 | 135 | 129 | 75 |
| sales | 66 | 64 | 15 | 13 |
| inventory | 347 | 307 | 99 | 59 |
| reports | 87 | 83 | 18 | 16 |
| settings | 130 | 125 | 33 | 28 |

(v1 reports inicial 87 medido en segunda pasada; primera lectura 85 con artefacto de timing de clase.)

## Dark + Performance — AFTER

| Vista | v1 total | v1 decorativo | v2 fuentes | v2 decorativo |
|---|---|---|---|---|
| dashboard | 0 | 0 | 0 | 0 |
| pos | 56 | 3 | 53 | 0 |
| sales | 1 | 0 | 1 | 0 |
| inventory | 147 | 108 | 39 | 0 |
| reports | 5 | 4 | 1 | 0 |
| settings | 5 | 1 | 4 | 0 |

La diferencia v1→v2 en AFTER inventory (147→39) es doble conteo por herencia:
los 108 "decorativos" eran hijos SVG/texto dentro de botones
`bg-success/10 border-success/20 text-success` (semánticos). Verificado con
trace-green.js: clases completas `text-success bg-success/10 border-success/20`.

## Dark + Enhanced AFTER (identidad intacta)

fuentes v2: dashboard 35 (34 decorativo), pos 131 (77), sales 17 (15),
inventory 101 (61), reports 20 (18), settings 35 (30) — ≈ baseline BEFORE.

## Light + Performance / Light + Enhanced AFTER (intactos)

fuentes v2 dashboard: light+perf 32, light+enh 35 · inventory: 100 / 102
(primario verde #15803d presente en ambos).
