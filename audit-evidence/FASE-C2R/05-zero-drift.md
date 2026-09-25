# FASE C2R — 05 ZERO-DRIFT (censo C1R/C2 vs LIVE; análisis de timestamps)

## 1. Comparación de censos

| Métrica | C1R (ancla documental) | C2 post-E2E (evidencia commiteada) | LIVE C2R (2026-09-25) | Drift |
|---|---|---|---|---|
| TOTAL | 8 | 8 | **8** | 0 |
| FC | 7 | 7 | **7** | 0 |
| Semilla vacía | 1 | 1 | **1** (data={} literal, sha `44136fa3…`) | 0 |
| CostSheet terminal | 0 | 0 | **0** | 0 |
| UNKNOWN | 0 | 0 | **0** | 0 |

- ROW COUNT DRIFT: **0** (8 filas, ninguna nueva, ninguna desaparecida).
- CONVERTIDOS/DUPLICADOS: **0** (los 7 FC conservan model+ficha+category; 0 filas CostSheet; el único par homónimo es el gemelo documentado, no una duplicación nueva — ver 03-fc-integrity §Clasificación).
- CONTRACT DRIFT: **0** (todas las filas clasifican igual que en C1R/C2; estructuras top-level homogéneas).
- OWNERSHIP DRIFT: **0** (bfcbc06d=4, a1111111=3, c0000000=1 — exactamente la distribución de C2 07-security §2).
- DATA DRIFT: **0** demostrado en el documento crítico (byte-identidad del par, ver 04); en los otros 6 FC, sin indicadores (ver 03 §cadena convergente).
- METADATA DRIFT: **0** (nombres/categorías estables; el par coincide con el nombre exacto documentado).

## 2. Análisis especial de `updated_at` (§10 del mandato — obligatorio por el incidente)

Rango LIVE completo de las 8 filas:

```text
min updated_at = 2026-05-27T15:34:47.033477+00:00  (semilla c0570000, fila de control histórica)
max updated_at = 2026-09-21T11:27:52.136171+00:00  (par 6dd35833/0024c883)
```

| Comprobación | Resultado |
|---|---|
| ¿Alguna fila con `updated_at` posterior a 2026-09-21 (fecha del incidente: 2026-09-23)? | **NO** — ninguna fila del censo fue actualizada después de la última ráfaga de sync FC |
| `updated_at` de `0024c883` == `updated_at` del snapshot/gemelo | **SÍ** — `2026-09-21T11:27:52.136171+00:00` en ambas filas, con la misma precisión de microsegundos |
| ¿Cambio de timestamps explicado por evidencia? | SÍ — el único documento tocado por el incidente fue `0024c883`, restaurado con los timestamps del gemelo (documentado en C2 07-security §3); no queda NINGÚN cambio sin explicación |
| Clasificación | **SIN TIMESTAMP DRIFT** — 0 filas con timestamps inesperados |

## 3. Conclusión

```text
7 FC históricos · 1 seed · 0 CostSheet terminal · 0 inesperadas · 0 desaparecidas
0 convertidos · 0 duplicados · 0 ownership drift · 0 timestamp drift inexplicado
```

El estado LIVE es indistinguible del estado certificado pre-incidente (menos la restauración misma de `0024c883`, que reproduce fielmente su estado original).
