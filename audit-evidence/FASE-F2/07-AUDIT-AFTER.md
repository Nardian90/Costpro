# FASE F2 — 07 AUDIT AFTER (comparación F1 vs F2, advisory por advisory)

**Fecha**: 2026-09-27 · POST: `bun audit` + `npm audit` tras remediación e instalación limpia. Crudos: `scripts/f2-bun-audit-post.txt`, `scripts/f2-npm-audit-post.txt` (fuera del repo). Referencia F1: 07-AUDIT-AFTER.md.

## Instalación limpia (mandato §9)

```text
$ pm2 stop all && rm -rf node_modules && bun install --frozen-lockfile
exit 0 · 1318 packages installed [3.33s]
Node v24.21.0 · Bun 1.3.14 · bun.lock @ b10919d6+remediación
```

- La resta de 1 paquete vs F1 (1319 → 1318) es exactamente la **deduplicación física** de las dos copias nanoid v3 que ahora son la misma versión 3.3.18 (verificado: `node_modules/postcss/node_modules/nanoid` y `node_modules/next/postcss/node_modules/nanoid` comparten inode 152547).
- Árbol efectivo post-instalación: `nanoid` raíz = **5.1.16** (docx, intacta); `postcss/nanoid` = **3.3.18**; `next/postcss/nanoid` = **3.3.18**. La versión vulnerable **desapareció realmente del árbol de Bun**.

## Auditoría POST

```text
$ bun audit  →  No vulnerabilities found   (exit 0)
$ npm audit  →  found 0 vulnerabilities    (exit 0)
```

## Tabla comparativa por advisory — F1 → F2

| Advisory | Paquete (instancia) | Severidad | F1 (b10919d6) | F2 (post-remediación) | Estado |
|---|---|---|---|---|---|
| GHSA-2v37-7h3g-55p8 | nanoid (postcss/nanoid 3.3.16) | HIGH | vulnerable | **3.3.18** | **CLOSED** |
| GHSA-2v37-7h3g-55p8 | nanoid (next/postcss/nanoid 3.3.17) | HIGH | vulnerable | **3.3.18** | **CLOSED** |
| (ruta display) | nanoid raíz 5.1.16 (docx) | — | NO vulnerable (v5 ≥ 5.1.6) | sin cambio (5.1.16) | N/A (era ruido de display) |
| GHSA-p293-qw3h-jr36 (CRITICAL) | next | CRITICAL | fixed 16.3.3 | 16.3.3 (intacto) | sigue CLOSED |
| GHSA-2xp9-vwfh-vxw4 (CRITICAL) | next | CRITICAL | fixed 16.3.3 | 16.3.3 (intacto) | sigue CLOSED |
| GHSA-rgj7-g3m4-5g8c (HIGH) | sharp | HIGH | fixed 0.35.4 | 0.35.4 (intacto) | sigue CLOSED |
| GHSA-2883-xcg3-v3hh (HIGH) | js-yaml | HIGH | fixed 4.3.2 | 4.3.2 (intacto) | sigue CLOSED |
| flag @mdxeditor/editor (HIGH) | js-yaml prop. | HIGH | flag ausente | intacto | sigue CLOSED |
| GHSA-8cw4-87c7-c6xx (MODERATE) | csv-parse | MODERATE | fixed 7.0.2 | 7.0.2 (intacto) | sigue CLOSED |
| GHSA-82fw-gwwq-j7x9 (MODERATE) | vitest + @vitest/mocker | MODERATE | fixed 4.1.11 | 4.1.11 (intacto) | sigue CLOSED |

## Totales

| Métrica | PRE-F1 | POST-F1 | **PRE-F2 (= POST-F1)** | **POST-F2** |
|---|---|---|---|---|
| `npm audit` | 7 vulns | 0 | 0 | **0** |
| `bun audit` | n/e (método F0 = npm) | 1 high (nanoid) | 1 high (nanoid) | **0** |
| `bun install --frozen-lockfile` desde cero | — | exit 0, 1319 pkgs | — | **exit 0, 1318 pkgs** |
| `npm ci --dry-run` | — | exit 0 | — | **exit 0** |

## R-DEPS-1 permanece cerrado (no reabierto)

`npm audit` 0 vulnerabilidades; ninguna advisory de R-DEPS-1 reapareció en ningún mecanismo; los pins exactos de F1 no fueron tocados (ver 06). **No aparecen nuevas vulnerabilidades atribuibles a F2** en ninguno de los dos gestores.
