# FASE F1 — 04 UPDATE PLAN (verificar antes de actualizar)

**Fecha**: 2026-09-27 · Principio rector: la propuesta de F0 era hipótesis; cada punto quedó demostrado contra el registry y los lockfiles antes de tocar nada.

## Verificación por paquete (registry en vivo, 2026-09-27)

| Paquete@candidata | Existe | engines | Peers críticos vs árbol instalado | Breaking | Conclusión |
|---|---|---|---|---|---|
| next@16.3.3 | ✓ | node >=20.9.0 ✓ (CI 22, local 24) | react ^19.0.0 ✓ (instalado 19.2.8), react-dom ✓, @playwright/test ^1.51.1 ✓ (1.62.1), @opentelemetry/api ^1.1.0 ✓ (1.9.1); sass/babel-plugin-react-compiler opcionales no usados | NO (patch dentro de 16.3.x) | APLICAR |
| sharp@0.35.4 | ✓ | node >=20.9.0 ✓ | (binarios de plataforma version-locked `@img/*`) | NO (patch) | APLICAR |
| js-yaml@4.3.2 | ✓ | (sin engines = sin restricción) | sin peers; override `js-yaml: $js-yaml` lo propaga a @mdxeditor/editor y eslint | NO (patch) | APLICAR |
| csv-parse@7.0.2 | ✓ | (sin engines) | sin peers; API `csv-parse/sync` intacta (export `./dist/cjs/sync.cjs` verificado) | NO (patch) | APLICAR |
| vitest@4.1.11 | ✓ | ^20 \|\| ^22 \|\| >=24 ✓ | vite ^6\|\|^7\|\|^8 ✓ (8.2.0); `@vitest/coverage-v8` peer EXACTO 4.1.11 → requiere bump pareado (instalado 4.1.10); jsdom * ✓ (29.1.1) | NO (patch) | APLICAR (+coverage-v8 4.1.11) |

## Hipótesis de F0 demostrada

- "Todas las fixes son patch non-breaking" → **CONFIRMADO**: `fixAvailable: true` (boolean = no-major) en las 7 entradas del audit PRE; ninguna candidata cruza major (16.3.0→16.3.3, 0.35.3→0.35.4, 4.3.1→4.3.2, 7.0.1→7.0.2, 4.1.10→4.1.11).
- `npm view next dist-tags` → latest = **16.3.6** (existen 16.3.4/5/6): 16.3.3 es la **mínima corregida**; se fija la mínima (menor cambio), no la última.
- Versiones superiores disponibles y deliberadamente NO tomadas: next 16.3.6, csv-parse 7.0.3, js-yaml 5.4.2 (major), vitest/coverage-v8 5.0.2 (major) — `bun install` las reportó como "available" y no se aplicaron.
- Compatibilidad Node 22 (CI) y Node 24 (local): engines de las 5 candidatas lo permiten. Bun: instalador 1.3.14 resolvió sin conflictos de peers.
- Vercel/build: no hay cambio de config requerido (same next major; `images` intacto).
- Otras vulnerabilidades nuevas al actualizar: `npm audit` POST = 0 (npm DB). `bun audit` POST = 1 high (nanoid) — hallazgo del mecanismo Bun, PREEXISTENTE y clasificado en 07-AUDIT-AFTER.md (fuera de R-DEPS-1).

## Plan aplicado

1. Branch `audit/f1-dependency-security` desde 1272a32f.
2. `package.json`: 6 pins exactos (5 declaradas por F0 + `@vitest/coverage-v8` por peer exacto). Overrides intactos.
3. `bun install` → regenera `bun.lock` (autoridad CI, `--frozen-lockfile`).
4. `npm install --package-lock-only` → sincroniza `package-lock.json` (consecuencia reproducible declarada; NO edición manual).
5. Revisión manual de ambos diffs (05/06) → instalación limpia `rm -rf node_modules && bun install --frozen-lockfile` → `npm ci --dry-run` → audits POST → Gates A–D → smoke focalizado → E-SEC integrity → push → CI.
