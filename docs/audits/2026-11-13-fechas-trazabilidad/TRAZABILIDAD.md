# TRAZABILIDAD Y FECHAS — Normalización UTC (referencia principal) · America/Havana (UTC−5)

**Generado:** 2026-11-13 22:55 UTC (17:55 Cuba) · Consultas read-only a la API de GitHub el mismo día.

## 1. Corrección aplicada

El expediente anterior fechó la actividad en **14/11/2026** — incorrecto: era la hora local del entorno de análisis (Asia/Shanghai, UTC+8). **Toda la actividad ocurrió el 2026-11-13 en UTC y también en Cuba (America/Havana, UTC−5)**. La petición del propietario que abrió esta fase llegó tras la generación del informe del 13/11 — también del 13/11 (no del 14/11). La afirmación «petición del propietario del 14/11» queda retirada.

**Regla adoptada en todos los documentos de esta fase:** UTC como referencia principal; conversión a Cuba restando 5 horas; cada marca temporal indica su zona.

## 2. Fechas reales de los PR (API de GitHub, exactas)

| PR | Creado (UTC) | Creado (Cuba) | Actualizado (UTC) | Rama origen → destino | SHA head |
|---|---|---|---|---|---|
| #1612 | 2026-11-13 16:27:01 | 2026-11-13 11:27:01 | 2026-11-13 18:46:35 | fix/servicios-usd-17-1-20261113 → main | 8340d278ee98ba6ad536ebdf9aa241ebd5f75ad8 |
| #1614 | **2026-11-13 19:46:29** | **2026-11-13 14:46:29** | 2026-11-13 21:11:03 | fix/fin-dryrun-espejo-pagos-20261114 → feat/fin-backfill-dryrun-20261113 | 6275cab2838c369d3bf6fa9db47827f49a5a1f96 |
| #1615 | 2026-11-13 20:56:19 | 2026-11-13 15:56:19 | 2026-11-13 21:09:58 | fix/semantica-ventas-usd-20261114 → main | 9ad139d4e6f2876fd9b696ba0f5292f1fd0612b7 |
| #1616 | 2026-11-13 22:19 | 2026-11-13 17:19 | 2026-11-13 22:5x (fase 2) | fix/ciclo-divisa-devoluciones-20261113 → main | 3ddeb9da7 (fase 2; fase 1: 9013d0f46e) |
| #1617 | 2026-11-13 22:31 | 2026-11-13 17:31 | — | docs/migracion-legacy-pagos-20261113 → main | dc295d376 |

Confirmación puntual pedida por el propietario: **PR #1614 creado 2026-11-13 19:46:29 UTC = 2026-11-13 14:46:29 en Cuba** ✓ (coincide exactamente con su instrucción).

## 3. Estado de cada PR al cierre de esta fase (sin merge en ninguno)

| PR | Commits | Reviews | Checks al SHA actual | Nota |
|---|---|---|---|---|
| #1612 | 5 (último 8340d278ee, 18:45:14 UTC) | sin reviews | 9/9 success | estable desde la fase previa |
| #1614 | 4 (último 6275cab28, 21:09:19 UTC) | sin reviews | 1/1 (solo Vercel) | los workflows del repo solo se disparan hacia main (documentado; el E2E aislado manual corre con workflow_dispatch) |
| #1615 | 3 (último 9ad139d4e, 21:08:58 UTC) | sin reviews | 9/9 success | estable |
| #1616 | 2 (9013d0f46e; 3ddeb9da7 UTC 22:5x) | sin reviews | fase 2 en curso al redactar: reparación del registro de escritores + excepción source-of-truth revisada (BODY_DRIFT deliberado: migración PROPUESTA sin aplicar) | depende de #1615 |
| #1617 | 1 (dc295d376) | sin reviews | en curso (solo docs) | — |

## 4. Nota ambiental (nueva, afecta a futuros PR)

A partir de ~22:00 UTC del 13/11, `bun audit` reporta avisos nuevos de `undici`/`engine.io` (GHSA-xjj6-f33q-929c, GHSA-rfgv-xxqx-mfg5, etc.). El paso de auditoría del CI tiene `continue-on-error` (no bloquea); la decisión de actualizar dependencias pertenece al propietario.
