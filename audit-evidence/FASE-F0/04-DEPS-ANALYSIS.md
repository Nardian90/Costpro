# FASE F0 — 04 DEPS ANALYSIS (R-DEPS-1)

**Fecha**: 2026-09-27 · **Método**: `npm audit --json` (GET-only, advisory DB live) + `npm ls` + grep de uso en código. **No se ejecutó `npm audit fix`, ni `bun update`, ni se tocó ningún lockfile.**

## Estado actual (HEAD 892bcd6b)

```text
7 vulnerabilidades: 1 critical (paquete con 2 advisories RCE), 3 high, 3 moderate
(E-SEC CI reportó 8: 2 critical / 3 high / 3 moderate — drift externo del advisory DB continúa)
```

## Tabla por vulnerabilidad

| Package | Instalada | Severity | Advisory | Direct/Transit. | Runtime | Exploitabilidad en CostPro | Fixed | Breaking risk | Acción |
|---|---|---|---|---|---|---|---|---|---|
| **next** | 16.3.0 | **CRITICAL ×2** | GHSA-p293-qw3h-jr36 (RCE no autenticado en servidores **Windows-hosted**) | directa (`^16.1.1`) | **SÍ** (app entera; deploy Vercel/Render/pm2-Linux) | **NO APLICABLE** — ningún host Windows (Linux/Vercel) | ≥16.3.3 | **NO** (patch minor dentro de ^16) | **FIX NOW** |
| **next** | 16.3.0 | **CRITICAL** | GHSA-2xp9-vwfh-vxw4 (RCE no autenticado en **Image Optimization**) | directa | **SÍ** | **APLICABLE CONDICIONADA** — app usa `next/image` con `remotePatterns: *.supabase.co/storage/.../public/**`; contenido de storage público pasa por el optimizer. Superficie real si hay uploads de usuario al bucket público | ≥16.3.3 | **NO** | **FIX NOW** |
| **sharp** | 0.35.3 | HIGH | GHSA-rgj7-g3m4-5g8c (+g89c-p67h-r497, 2jg2-4ch7-h545) — libheif | directa (también vía `@whiskeysockets/baileys` y `next`) | **SÍ** (optimizer de next/image, `ofertas/export-pdf`) | Procesado de imágenes HEIF craftadas que lleguen al optimizer/export; superficie mitigada por storage propio, pero real con uploads | ≥0.35.4 | NO (patch) | FIX LATER (misma ventana que next) |
| **js-yaml** | 4.3.1 | HIGH | GHSA-2883-xcg3-v3hh — CPU DoS (`maxTotalMergeKeys`) | directa + vía `@mdxeditor/editor@4.2.0` | SÍ (editor MDX, parseo YAML) | DoS de CPU con YAML malicioso en contexto autenticado del editor | ≥4.3.2 | NO (patch) | FIX LATER |
| **csv-parse** | 7.0.1 | MODERATE | GHSA-8cw4-87c7-c6xx — prototype replacement vía `columns` | directa (`^7.0.0`) | **SÍ** (`api/whatsapp/invitations/import` — CSV de usuario) | Prototype pollution con CSV atacante controlado en import de invitaciones (autenticado) | ≥7.0.2 | NO (patch) | FIX LATER |
| **vitest** | 4.1.10 | MODERATE | GHSA-82fw-gwwq-j7x9 — path traversal/arbitrary file read vía `@vitest/mocker` | directa (devDependency) | **NO** (sólo test runner local/CI) | No explotable en producción; riesgo limitado al entorno de test | ≥4.1.11 | NO (patch) | FIX LATER (higiene) |
| (@vitest/mocker) | (transitivo de vitest) | MODERATE | misma advisory | transitiva | NO | ídem | con vitest 4.1.11 | NO | ídem |

## Clasificación de decisión

- **FIX NOW**: `next → 16.3.3` (elimina las 2 advisories critical de un golpe, patch bump).
- **FIX LATER (misma ventana, recomendado)**: `sharp → 0.35.4`, `js-yaml → 4.3.2`, `csv-parse → 7.0.2` — todos patch, cerrarían el gate Security Audit completo.
- **ACCEPT TEMPORARILY**: `vitest 4.1.10` (dev-only; bump trivial pero sin impacto en producción).
- **FALSE POSITIVE / NOT APPLICABLE**: GHSA-p293-qw3h-jr36 (rama Windows) — no aplicable a la topología de deploy actual; se remedia igualmente al subir a 16.3.3.

## Notas de verificación

- `npm ls` confirma: `next@16.3.0` (raíz + `@sentry/nextjs` + `next-intl` deduped), `sharp@0.35.3` (raíz + `baileys`), `js-yaml@4.3.1` (raíz + `@mdxeditor/editor` + `eslint/eslintrc`), `csv-parse@7.0.1`, `vitest@4.1.10`.
- `git diff 6022ae85..HEAD -- package.json package-lock.json bun.lock` = vacío → las vulnerabilidades son **preexistentes y por drift del advisory DB**, no introducidas por fases del proyecto.
- Todas las fixes disponibles son **no-breaking** (`fixAvailable.isSemVerMajor = false` en las 7).
- Decisión formal de aceptación de riesgo: NO se toma en F0 (requiere owner de negocio).
