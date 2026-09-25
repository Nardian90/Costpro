# FASE C2R — 02 LIVE CENSUS (censo forense de `cost_sheets`, solo lectura)

Fecha: 2026-09-25 · Método: PostgREST GET (service role para censo de lectura; probes con anon). Script: `~/scripts/fasec2r-db-readonly.py`; resultado crudo: `~/scripts/fasec2r-db-results.json`.

## 1. Esquema LIVE verificado (no asumido)

| Verificación | Resultado |
|---|---|
| Columnas via OpenAPI (`GET /rest/v1/`, definición `cost_sheets`) | `category, created_at, created_by, data, description, id, name, updated_at` — **8 columnas, SIN `store_id`** |
| Probe `select=store_id` | **HTTP 400, código `42703`** (columna inexistente) — replica C1R/C2 |
| Probe anon (RLS) | HTTP 200 → **0 filas** (RLS activo, anon sin acceso) |

## 2. Censo completo (8 filas, clasificación POR CONTRATO, no por posición)

Clasificación: `FC` si `data.model=="FC_RES148_2023_V1"` OR `data.ficha` presente OR `category=="FC Res148"` OR `meta2.app=="FC"`; `SEED_EMPTY` si `data == {}`; `COSTSHEET` si 4 pilares (header/sections/annexes/signature) sin señales FC; resto `UNKNOWN`.

| # | kind | id | name | category | created_by | created_at | updated_at | data.model | ficha.id | canon len | sha256(canonical data) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | FC | `318b3b8c-f18a-431e-8035-81fdefe9b0b8` | Pan de casabe 500g | FC Res148 | `bfcbc06d…` | 2026-09-15T00:30:45 | 2026-09-15T00:30:45 | FC_RES148_2023_V1 | `fmu1xqzf…` | 3902 | `07fad6c72db2a07c…` |
| 2 | FC | `16056c59-ff73-49e4-8f42-07aab257a147` | Dulce de coco artesanal | FC Res148 | `bfcbc06d…` | 2026-09-15T00:30:45 | 2026-09-15T00:30:45 | FC_RES148_2023_V1 | `fmu1xr0x…` | 3916 | `846b494f59e2c52f…` |
| 3 | FC | `03341c89-da64-4e3f-a899-7909eef4f316` | Servicio de costura X | FC Res148 | `bfcbc06d…` | 2026-09-15T00:31:03 | 2026-09-15T00:31:03 | FC_RES148_2023_V1 | `fmu1xr2e…` | 3908 | `f183cc2f83112c5b…` |
| 4 | FC | `f55f2f08-d00c-411b-82a1-d39850a53992` | Ficha 4 (edit local viejo) (copia en conflicto) | FC Res148 | `bfcbc06d…` | 2026-09-15T00:33:07 | 2026-09-15T00:33:07 | FC_RES148_2023_V1 | `fmu1xtnc…` | 3941 | `87cb5b00e7fd8ed5…` |
| 5 | FC | `bd09001b-d991-4003-af72-51c7e06836de` | Ejemplo — Servicio de pintura y mantenimiento | FC Res148 | `a1111111…` | (burst 09-18) | 2026-09-18T23:57:05 | FC_RES148_2023_V1 | `fmu3ikj5…` | 6637 | `b434a98361d71395…` |
| 6 | FC | `6dd35833-1dc2-4b60-bce0-d1d7465ab4c9` | Ejemplo — Servicio de pintura y mantenimiento | FC Res148 | `a1111111-1111-1111-1111-111111111111` | 2026-09-21T11:27:52.136171+00:00 | 2026-09-21T11:27:52.136171+00:00 | FC_RES148_2023_V1 | `fmub5vc7qa6ch51` | 6617 | `65739ac88ff0718b…` |
| 7 | FC | `0024c883-e1c5-4ecf-bcde-1ace98a27c20` | Ejemplo — Servicio de pintura y mantenimiento | FC Res148 | `a1111111-1111-1111-1111-111111111111` | 2026-09-21T11:27:52.136171+00:00 | 2026-09-21T11:27:52.136171+00:00 | FC_RES148_2023_V1 | `fmub5vc7qa6ch51` | 6617 | `65739ac88ff0718b…` |
| 8 | SEED_EMPTY | `c0570000-0000-0000-0000-00000000000c` | Secret Sheet Tenant B | null | `c0000000…` | 2026-05-27T15:34:47.033477+00:00 | 2026-05-27T15:34:47.033477+00:00 | — | — | 2 | `44136fa355b3678a…` |

`sha256(canonical)` = SHA-256 de `JSON.stringify` canónico (claves ordenadas, sin espacios, UTF-8) de la columna `data`. La fila 8 tiene sha `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a` = SHA-256 de `{}` literal → **data == {} exacto**.

Estructuras top-level de los 7 FC: `[ficha, header, meta2, model]` (homogéneo en los 7).

## 3. Recuento

```text
TOTAL = 8          (esperado 8 ✓)
FC = 7             (esperado 7 ✓)
SEED_EMPTY = 1     (esperado 1 ✓)
CostSheet terminal = 0   (esperado 0 ✓)
UNKNOWN/malformed = 0    (esperado 0 ✓)
```

## 4. Ownership (distribución)

| created_by | filas | Interpretación |
|---|---|---|
| `bfcbc06d…` | 4 | 4 FC históricos (4× ráfaga sync 2026-09-15) — coincide con C2 07-security (FC ajeno usado en test 404) |
| `a1111111…` | 3 | 3 FC del usuario de prueba — **coincide exactamente con C2 07-security §2 («owner de 3 de los 7 FC»)** |
| `c0000000…` | 1 | seed de prueba (data={}) |

0 filas con owner inesperado; 0 cambios de propietario detectables.

## 5. Conclusión

El censo LIVE **reproduce exactamente** el estado documentado por C1R (8 = 7 FC + 1 vacía + 0 CostSheet) y el estado post-E2E de C2 (8/7/0/1). Clasificación exclusivamente por señales de contrato (cada fila FC porta las 3 señales simultáneamente: model + ficha + category).
