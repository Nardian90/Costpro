# FASE F1 — 07 AUDIT AFTER (comparación PRE/POST)

**Fecha**: 2026-09-27 · PRE: `npm audit --json` en 1272a32f. POST: `npm audit --json` + `bun audit` tras remediación e instalación limpia. Crudos: `scripts/audit-pre-f1.json` / `scripts/audit-post-f1.json` / `scripts/bun-audit-post.txt` (fuera del repo).

## Tabla comparativa por advisory

| Advisory | Paquete | Severidad | Antes | Después | Estado |
|---|---|---|---|---|---|
| GHSA-p293-qw3h-jr36 | next | CRITICAL | vulnerable (16.3.0) | fixed (16.3.3) | **CLOSED** |
| GHSA-2xp9-vwfh-vxw4 | next | CRITICAL | vulnerable (16.3.0) | fixed (16.3.3) | **CLOSED** |
| GHSA-rgj7-g3m4-5g8c | sharp | HIGH | vulnerable (0.35.3) | fixed (0.35.4) | **CLOSED** |
| GHSA-2883-xcg3-v3hh | js-yaml | HIGH | vulnerable (4.3.1) | fixed (4.3.2) | **CLOSED** |
| (propagación js-yaml) | @mdxeditor/editor | HIGH | vulnerable (4.2.0) | flag desaparecido | **CLOSED** |
| GHSA-8cw4-87c7-c6xx | csv-parse | MODERATE | vulnerable (7.0.1) | fixed (7.0.2) | **CLOSED** |
| GHSA-82fw-gwwq-j7x9 | vitest | MODERATE | vulnerable (4.1.10) | fixed (4.1.11) | **CLOSED** |
| GHSA-82fw-gwwq-j7x9 | @vitest/mocker | MODERATE | vulnerable (4.1.10) | fixed (4.1.11) | **CLOSED** |

## Totales

| Métrica | PRE-F1 | POST-F1 |
|---|---|---|
| `npm audit` | 7 vulns (1 critical, 3 high, 3 moderate) | **0 vulnerabilities** (exit 0) |
| `bun audit` (mecanismo CI paralelo) | no ejecutado en F0 (método F0 = npm) | **1 high** — nanoid (ver abajo) |
| `npm ci --dry-run` | — | exit 0 (lockfile consistente y suficiente) |
| `bun install --frozen-lockfile` desde cero | — | exit 0, 1319 paquetes en 3.37s |

**NO se acepta "npm audit está limpio" sin demostración**: la tabla anterior muestra advisory por advisory qué desapareció y con qué versión.

## Hallazgo del mecanismo Bun: nanoid (GHSA-2v37-7h3g-55p8) — clasificación completa

`bun audit` (1 high): `nanoid <3.3.18` — "custom generators can loop indefinitely when size is zero". Rutas reportadas: `docx›nanoid`, `@tailwindcss/postcss›postcss›nanoid`, `next›postcss›nanoid`, `vitest›@vitest/mocker›vite›postcss›nanoid`.

1. **PREEXISTENTE — no introducido ni tocado por F1**: bun.lock old (1272a32f) == new en TODAS las entradas nanoid: `nanoid 5.1.16` (raíz), `postcss/nanoid 3.3.16`, `next/postcss/nanoid 3.3.17`. package-lock idéntico old/new: raíz 5.1.16 + `postcss/node_modules/nanoid 3.3.18`. La divergencia de resolución bun-vs-npm es histórica.
2. **NO forma parte de R-DEPS-1**: F0 (método npm audit) no lo identificó ni lo clasificó; el objetivo F1 es "remediar exclusivamente R-DEPS-1" y el mandato §9 define el mecanismo Bun como comprobación equivalente "**sin modificar dependencias**". Remediarlo exigiría override adicional o `bun update` (prohibido) → queda documentado para la fase siguiente, NO aceptado silenciosamente.
3. **Explotabilidad en CostPro: NO APLICABLE** (evidencia):
   - Precondición de la advisory = invocar generador custom de nanoid con size 0 (uso incorrecto por parte del desarrollador), no alcanzable por input externo.
   - `rg nanoid src/` = **0 coincidencias** — CostPro no importa nanoid directa ni indirectamente en su propio código.
   - Instancias vulnerables (3.3.16/3.3.17) viven SOLO bajo postcss/vite → **build-time** (Turbopack/Next build, Tailwind), ausentes del runtime de producción; la línea 5.1.16 que usa docx (runtime) está fuera del rango vulnerable `<3.3.18`.
   - Impacto potencial teórico: bucle infinito CPU en build — DoS de tooling, no de producto; no hay camino de datos de usuario hacia esas llamadas.
4. **Clasificación formal**: NOT APPLICABLE (como se usa en CostPro) / transitive build-only / REQUIRES NEXT-PHASE DECISION (remediación trivial documentada: override `nanoid@^3 → 3.3.18` o re-resolución de bun, más decisión de endurecimiento del gate `bun audit` de CI que hoy es `continue-on-error`).

## Conclusión

R-DEPS-1 queda **eliminado por completo según npm audit** (0 vulnerabilidades) y advisory por advisory. El único advisory restante en cualquier mecanismo (nanoid, solo bun DB) es preexistente, build-only, no aplicable como se usa, y queda formalmente registrado como decisión de la fase siguiente.
