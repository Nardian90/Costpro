# FASE C2R — 03 FC INTEGRITY (los 7 documentos FC, verificación individual)

Base de comparación declarada: los snapshots per-row de C1R se perdieron (MISSING EVIDENCE — ver 01-baseline §3). La integridad se demuestra con una **cadena convergente**:

1. **Par gemelo**: C1R doc 04 certificó `0024c883` ≡ `6dd35833` byte-idénticos (pre-incidente). `6dd35833` NUNCA fue tocado por el incidente (C2 07-security §3) → sirve como referencia certificada viva de `0024c883` (ver 04-0024c883-comparison.md: byte-identidad re-verificada hoy).
2. **Hashes dentro de C2**: C2 (commiteado) verifica «hash SHA-256 de `data` + `updated_at` de los 7 FC idénticos antes/después de toda la batería E2E» (03-contract-filter §4, 06-fc-regression §2, 07-security §3: «los otros 6 FC + semilla conservaron hashes y timestamps»).
3. **Invariantes LIVE C2R** (hoy): cada FC conserva las 3 señales de contrato; `updated_at` máximo = 2026-09-21T11:27:52.136171 (NINGUNA fila fue actualizada después — el incidente ocurrió 2026-09-23); censo 8/7/1/0 sin filas nuevas ni desaparecidas; ownership = distribución documentada (a1111111: 3 FC).

Todo UPDATE real (FC sync PATCH o writer C2) escribiría `updated_at`/contenido nuevo; la ausencia de timestamps post-2026-09-21 + censo invariante + ownership invariante descartan modificación desde el cierre C2.

## Verificación individual (identidad · metadatos · contenido)

| id (8-char) | Señales FC (model/ficha/category) | top-level keys | name / category | created_by | created_at == updated_at | Estado |
|---|---|---|---|---|---|---|
| `318b3b8c` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Pan de casabe 500g / FC Res148 | `bfcbc06d…` | 2026-09-15T00:30:45 | ÍNTEGRO |
| `16056c59` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Dulce de coco artesanal / FC Res148 | `bfcbc06d…` | 2026-09-15T00:30:45 | ÍNTEGRO |
| `03341c89` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Servicio de costura X / FC Res148 | `bfcbc06d…` | 2026-09-15T00:31:03 | ÍNTEGRO |
| `f55f2f08` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Ficha 4 (edit local viejo) (copia en conflicto) / FC Res148 | `bfcbc06d…` | 2026-09-15T00:33:07 | ÍNTEGRO (mecanismo «copia en conflicto» de FC — fila de control documentada desde C1) |
| `bd09001b` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Ejemplo — Servicio de pintura y mantenimiento / FC Res148 | `a1111111…` | upd 2026-09-18T23:57:05 | ÍNTEGRO (homónimo legítimo del flujo sync FC — F-6 de C1; ficha.id distinta `fmu3ikj5`, contenido distinto: NO es parte del par) |
| `6dd35833` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Ejemplo — Servicio de pintura y mantenimiento / FC Res148 | `a1111111…` | 2026-09-21T11:27:52.136171 | ÍNTEGRO — donante/gemelo, intacto durante todo el incidente |
| `0024c883` | ✓ / ✓ / ✓ | ficha, header, meta2, model | Ejemplo — Servicio de pintura y mantenimiento / FC Res148 | `a1111111…` | 2026-09-21T11:27:52.136171 | ÍNTEGRO — restaurado post-incidente; **byte-idéntico al gemelo (re-verificado hoy, ver 04)** |

## Chequeos de §7 (detectar desaparecidos/nuevos/ownership/nombre/categoría/contenido/timestamps)

| Chequeo | Resultado |
|---|---|
| Documentos desaparecidos | **0** (7 FC presentes, mismos 8-char IDs esperables; par completo) |
| Documentos nuevos | **0** (TOTAL=8; 0 CostSheet, 0 UNKNOWN) |
| Cambio de propietario | **0** (a1111111=3 FC, bfcbc06d=4 — distribución exacta de C2 07-security) |
| Cambio de nombre / categoría | **0** detectable (todos «FC Res148»; nombres estables; el par coincide nombre exacto con evidencia C1R/C2) |
| Cambio de contenido | **0** demostrable en el par (byte-identidad); en los otros 5: sin indicadores de cambio (timestamps congelados pre-incidente + verificación hash dentro de C2) |
| Timestamp drift inexplicado | **0** (max updated_at = 2026-09-21T11:27:52.136171 < fecha del incidente 2026-09-23) |
| Modificación parcial del payload | **0** indicadores (estructuras top-level homogéneas; clasificación contractual sin anomalías) |

## Clasificación de los documentos homónimos (transparencia)

Existen 3 documentos con nombre «Ejemplo — Servicio de pintura y mantenimiento» (`bd09001b`, `6dd35833`, `0024c883`). NO se asumió identidad por nombre: `bd09001b` tiene `ficha.id=fmu3ikj5`, payload 6637 bytes, updated_at 2026-09-18 — es un documento distinto (tercera copia del flujo sync FC, patrón documentado F-6 en C1). El par certificado es exclusivamente `0024c883`/`6dd35833` (`ficha.id=fmub5vc7qa6ch51` compartida, payload/hash/timestamps idénticos).
