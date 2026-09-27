# FASE F1 — 03 DEPENDENCY MATRIX (inventario exacto)

**Fecha**: 2026-09-27 · Versiones "actual" = lockfile efectivo en 1272a32f (bun.lock == package-lock.json).

## Tabla principal

| Paquete | Versión actual | Dependencia | Vulnerabilidad | Severidad | Versión mínima corregida | Versión candidata | Runtime | Uso real |
|---|---|---|---|---|---|---|---|---|
| next | 16.3.0 | directa (`^16.1.1`) | GHSA-p293-qw3h-jr36 + GHSA-2xp9-vwfh-vxw4 | CRITICAL ×2 | ≥16.3.3 | **16.3.3** | SÍ (app entera) | framework: App Router, API routes, proxy.ts, optimizer |
| sharp | 0.35.3 | directa (`^0.35.3`; también opt-dep de next y de `@whiskeysockets/baileys`) | GHSA-rgj7-g3m4-5g8c (libheif) | HIGH | ≥0.35.4 | **0.35.4** | SÍ (optimizer next/image, export-pdf) | procesado de imágenes del storage público |
| js-yaml | 4.3.1 | directa (`^4.3.1`) + vía `@mdxeditor/editor@4.2.0` y `eslint` | GHSA-2883-xcg3-v3hh | HIGH | ≥4.3.2 | **4.3.2** | SÍ (marginal) | ruta knowledge = empty-state; editor MDX |
| csv-parse | 7.0.1 | directa (`^7.0.0`) | GHSA-8cw4-87c7-c6xx | MODERATE | ≥7.0.2 | **7.0.2** | SÍ | import CSV invitaciones WhatsApp (usuario autenticado) |
| vitest | 4.1.10 | directa dev (`^4.1.5`) | GHSA-82fw-gwwq-j7x9 | MODERATE | ≥4.1.11 | **4.1.11** | NO (dev-only) | test runner |
| @vitest/mocker | 4.1.10 | transitiva de vitest (exact 4.1.10) | GHSA-82fw-gwwq-j7x9 | MODERATE | ≥4.1.11 | **4.1.11** (via vitest) | NO (dev-only) | mocking de vitest |
| @vitest/coverage-v8 | 4.1.10 | directa dev (`^4.1.5`) | (sin advisory propia; peer EXACTO de vitest) | — | — | **4.1.11** | NO (dev-only) | coverage |
| @mdxeditor/editor | 4.2.0 | directa (`^4.2.0`) | HIGH solo por propagación `via:["js-yaml"]` | HIGH | (ninguna propia; se cierra con js-yaml ≥4.3.2 vía override `js-yaml: $js-yaml`) | **sin cambio** | SÍ (editor MDX admin) | editor de documentos |
| nanoid (postcss/nanoid 3.3.16, next/postcss/nanoid 3.3.17) | ver 07 | transitiva (docx, @tailwindcss/postcss, next›postcss, vitest›vite›postcss) | GHSA-2v37-7h3g-55p8 **solo visible en `bun audit`** (npm audit = 0) | HIGH (bun DB) | ≥3.3.18 | **FUERA DE SCOPE F1** | NO (build-time) | generación de nombres/IDs internos build |

## Clasificación (categorías del mandato §2)

- **Directamente remediables en F1**: next → 16.3.3, sharp → 0.35.4, js-yaml → 4.3.2, csv-parse → 7.0.2, vitest → 4.1.11 (+ `@vitest/coverage-v8` → 4.1.11 por peer EXACTO declarado por vitest: `"@vitest/coverage-v8": "4.1.11"` — coherencia de ecosistema de la misma advisory, no higiene).
- **Transitivas que se resuelven automáticamente**: `@vitest/mocker` 4.1.10 → 4.1.11 (viene con vitest), `@mdxeditor/editor` flag (se apaga con js-yaml 4.3.2 vía override `js-yaml: $js-yaml` ya existente en package.json), y los 26 binarios de plataforma `@img/sharp-*` / `@next/swc-*` / `@next/env` (version-locked a sus padres).
- **Transitivas que requieren actualización del paquete padre**: ninguna dentro de R-DEPS-1.
- **Fuera de alcance**: nanoid (hallazgo POST-F1 del mecanismo Bun; no fue confirmado por F0/R-DEPS-1; análisis completo en 07-AUDIT-AFTER.md).
- **Falso positivo / no aplicable con evidencia**: GHSA-p293-qw3h-jr36 (rama Windows — ningún host Windows en las 4 topologías; se remedia igualmente con 16.3.3). Propagación `@mdxeditor/editor` (no es vulnerabilidad propia; su rango `<=4.2.4` solo refleja versiones que dependen de js-yaml vulnerable).

## Regla de versiones candidatas

Pin **exacto** de la versión mínima corregida (no caret): (1) determinismo bun.lock/package-lock.json idénticos con `--frozen-lockfile` de CI; (2) cambio mínimo auditable — el registro ya usa pins exactos donde el determinismo importa (`@swc/helpers 0.5.21`, `magicast 0.3.5`); (3) evita drift silencioso a 16.3.4+/5.x existentes en registry.
